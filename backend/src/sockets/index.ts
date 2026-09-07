import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { verifyAccessToken } from "../utils/jwt";
import { redis } from "../config/redis";
import { query } from "../config/db";

interface SocketUser {
  userId: string;
  organizationId: string;
  role: string;
}

declare module "socket.io" {
  interface Socket {
    user?: SocketUser;
  }
}

const PRESENCE_KEY = (orgId: string) => `presence:org:${orgId}`;

export function initSockets(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: { origin: process.env.CLIENT_URL || "*", credentials: true },
  });

  // Auth handshake: client connects with { auth: { token } }
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) return next(new Error("Missing auth token"));
      const payload = verifyAccessToken(token);
      socket.user = {
        userId: payload.userId,
        organizationId: payload.organizationId,
        role: payload.role,
      };
      next();
    } catch {
      next(new Error("Invalid auth token"));
    }
  });

  io.on("connection", async (socket: Socket) => {
    const user = socket.user!;
    const orgRoom = `org:${user.organizationId}`;
    socket.join(orgRoom);

    // ---- Presence ----
    await redis.hset(PRESENCE_KEY(user.organizationId), user.userId, Date.now().toString());
    io.to(orgRoom).emit("presence:update", await getOnlineUsers(user.organizationId));

    // ---- Chat channels ----
    socket.on("channel:join", (channelId: string) => socket.join(`channel:${channelId}`));
    socket.on("channel:leave", (channelId: string) => socket.leave(`channel:${channelId}`));

    socket.on(
  "message:send",
  async (payload: { channelId: string; content: string }) => {
    const channel = await resolveChannel(payload.channelId);

    const rows = await query(
      `INSERT INTO messages (channel_id, sender_id, content)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [channel.id, user.userId, payload.content]
    );

    io.to(`channel:${payload.channelId}`).emit("message:new", rows[0]);
  }
);

    socket.on("chat:typing", (payload: { channelId: string }) => {
      socket.to(`channel:${payload.channelId}`).emit("chat:typing", { userId: user.userId });
    });

    // ---- Task board live updates ----
    socket.on("task:subscribe", (projectId: string) => socket.join(`project:${projectId}`));

    socket.on(
      "task:status_changed",
      (payload: { projectId: string; taskId: string; status: string }) => {
        // Controller already persisted the change over REST; this just fans out
        // the update to everyone else viewing the board in real time.
        socket.to(`project:${payload.projectId}`).emit("task:updated", payload);
      }
    );

    // ---- Notifications ----
    socket.on("notification:ack", async (notificationId: string) => {
      await query("UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2", [
        notificationId,
        user.userId,
      ]);
    });

    // ---- Disconnect / presence cleanup ----
    socket.on("disconnect", async () => {
      const remainingSockets = await io.in(orgRoom).fetchSockets();
      const stillConnected = remainingSockets.some((s) => (s as any).user?.userId === user.userId);
      if (!stillConnected) {
        await redis.hdel(PRESENCE_KEY(user.organizationId), user.userId);
        await query("UPDATE users SET last_seen_at = now() WHERE id = $1", [user.userId]);
      }
      io.to(orgRoom).emit("presence:update", await getOnlineUsers(user.organizationId));
    });
  });

  return io;
}

async function getOnlineUsers(organizationId: string): Promise<string[]> {
  const map = await redis.hgetall(PRESENCE_KEY(organizationId));
  return Object.keys(map);
}

async function resolveChannel(
  name: string
): Promise<{ id: string }> {
  const existing = await query<{ id: string }>(
    "SELECT id FROM channels WHERE name = $1 LIMIT 1",
    [name]
  );

  if (existing[0]) return existing[0];

  const created = await query<{ id: string }>(
    "INSERT INTO channels (name) VALUES ($1) RETURNING id",
    [name]
  );

  return created[0];
}

/** Helper other parts of the app (REST controllers) can use to push a
 * notification to a specific user in real time, e.g. after an AI job
 * finishes or a task is assigned. */
export function emitToUser(io: Server, userId: string, event: string, payload: unknown) {
  io.sockets.sockets.forEach((s) => {
    if (s.user?.userId === userId) s.emit(event, payload);
  });
}
