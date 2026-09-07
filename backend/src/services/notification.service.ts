import { Server } from "socket.io";
import { query } from "../config/db";
import { emitToUser } from "../sockets";

export interface CreateNotificationInput {
  userId: string;
  type: "task_assigned" | "mentioned" | "pr_summary_ready" | "role_changed";
  title: string;
  body?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Single entry point for creating a notification: persists it (so it shows
 * up in the notification bell / history even if the user is offline) and,
 * if they're currently connected, pushes it over the socket immediately.
 */
export async function notify(io: Server, input: CreateNotificationInput) {
  const rows = await query(
    `INSERT INTO notifications (user_id, type, title, body, metadata)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [input.userId, input.type, input.title, input.body ?? null, JSON.stringify(input.metadata ?? {})]
  );
  const notification = rows[0];
  emitToUser(io, input.userId, "notification:new", notification);
  return notification;
}

export const NotificationService = {
  notify,

  taskAssigned: (io: Server, assigneeId: string, taskTitle: string, taskId: string) =>
    notify(io, {
      userId: assigneeId,
      type: "task_assigned",
      title: "You were assigned a task",
      body: taskTitle,
      metadata: { taskId },
    }),

  prSummaryReady: (io: Server, userId: string, prTitle: string, projectId: string) =>
    notify(io, {
      userId,
      type: "pr_summary_ready",
      title: "PR summary ready",
      body: prTitle,
      metadata: { projectId },
    }),

  roleChanged: (io: Server, userId: string, newRole: string) =>
    notify(io, {
      userId,
      type: "role_changed",
      title: "Your role was updated",
      body: `You are now a ${newRole}`,
    }),
};
