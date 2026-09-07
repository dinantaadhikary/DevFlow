# DevFlow
### AI-Powered Developer Collaboration Platform — Implementation Plan

| | |
|---|---|
| **Status** | ✅ Core stack running end-to-end (auth · RBAC · real-time board · chat · AI tools) |
| **Stage** | Local development validated → hardening for Phase 1 |
| **Owner doc** | Principal architecture reference — supersedes chat history |

---

## 1 · Executive Summary

DevFlow unifies **project management**, **real-time team communication**, and **AI-assisted developer workflows** in one platform — replacing the Jira + Slack + standalone-AI-assistant sprawl most teams juggle.

**Core goals**
- 🎯 One workspace for tracking work, talking, and offloading repetitive dev tasks to AI
- 🔒 Organization-level RBAC so access can be delegated safely
- 💸 Cheap to run at small-team scale — Redis caches AI output and hot reads instead of re-billing every request

**Primary workflow**

```
Register → creates Organization + Owner
   ↓
Owner creates Projects, invites teammates (owner/admin/developer/viewer)
   ↓
Team works the Kanban board (live for everyone via WebSockets)
   ↓
Team chats in real time (presence + typing indicators)
   ↓
Anyone runs AI tools — explain code · generate README/docs/tests · summarize a PR
   ↓
GitHub PR opened → webhook auto-posts an AI summary into the project's chat
```

---

## 2 · Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React 18 · TypeScript · Vite | Fast HMR; dev server proxies `/api` + `/socket.io` |
| Styling | Tailwind CSS | No CSS-in-JS runtime overhead |
| Routing | React Router v6 | `ProtectedRoute` gates authenticated pages |
| Realtime client | `socket.io-client` | Singleton connection, shared via hook |
| HTTP client | Axios | Interceptor silently refreshes expired access tokens |
| Backend | Node 20 · Express · TypeScript | `nodemon` + `ts-node` dev, `tsc` build for prod |
| Realtime server | Socket.IO | Presence, chat, live task board, notifications |
| Database | PostgreSQL 16 | Orgs, users, projects, tasks, messages, AI audit log |
| Cache | Redis 7 | AI response cache (SHA-256 keyed), presence, hot reads |
| Auth | JWT (access 15m / refresh 7d) + bcrypt | Role-hierarchy RBAC enforced per route |
| AI provider | **Groq** — `openai/gpt-oss-120b` | Free tier, OpenAI-compatible; swappable in one file |
| Validation | Zod | Every controller validates its request body |
| Containers | Docker (multi-stage) + Compose | Postgres + Redis + backend + frontend (nginx) |
| CI/CD | GitHub Actions | Lint → test → build → push image → deploy (AWS ECS-ready) |
| Testing | Jest + Supertest | Integration tests against a real Postgres/Redis instance |

---

## 3 · Directory Structure

```
devflow/
├── README.md · docker-compose.yml
├── .github/workflows/ci-cd.yml
│
├── backend/
│   ├── package.json · tsconfig.json · jest.config.js · Dockerfile · .env.example
│   └── src/
│       ├── server.ts              HTTP + Socket.IO bootstrap
│       ├── app.ts                 Express app assembly
│       ├── config/                db.ts · redis.ts
│       ├── middleware/            auth.ts · rbac.ts · errorHandler.ts
│       ├── utils/jwt.ts
│       ├── models/                User.ts · Task.ts
│       ├── controllers/           auth · task · ai
│       ├── routes/                auth · task · ai · org · project · webhook · analytics
│       ├── services/              ai.service.ts · notification.service.ts
│       ├── sockets/index.ts
│       ├── db/schema.sql
│       └── __tests__/             auth.test.ts · rbac.test.ts
│
└── frontend/
    ├── package.json · vite.config.ts · tailwind.config.js · Dockerfile · nginx.conf
    └── src/
        ├── main.tsx · App.tsx
        ├── context/AuthContext.tsx
        ├── hooks/useSocket.ts
        ├── services/api.ts
        ├── components/layout/AppLayout.tsx
        └── pages/                Login · Register · Dashboard · TaskBoard · Chat · AiTools
```

---

## 4 · Fixed-Issues Log

Every entry below was found and resolved live during setup — this table is the fast-scan version; full corrected code is in §5.

| # | Symptom | Root cause | Fix |
|---|---|---|---|
| 1 | `Could not find a declaration file for module 'pg'` | Missing dev dependency | `npm i -D @types/pg` |
| 2 | `jwt.sign` overload errors | `@types/jsonwebtoken` narrowed `expiresIn` to a branded type | Cast env string `as SignOptions["expiresIn"]` |
| 3 | `Property 'user' does not exist on RemoteSocket` | `fetchSockets()` returns a different type than `Socket` | Targeted `as any` cast |
| 4 | `ERR_REQUIRE_ESM` on `node-fetch` | Package is now ESM-only | Removed import — use Node 18+ built-in `fetch` |
| 5 | `SASL: client password must be a string` | `.env` never created / not loaded | `Copy-Item .env.example .env`, verify `DATABASE_URL`, full restart |
| 6 | `invalid input syntax for type uuid: "current"` | Sidebar linked to placeholder `/tasks/current` | Store `devflow_last_project_id` in `localStorage`; link to real project |
| 7 | Anthropic `401 authentication_error` | Placeholder API key | Swapped provider to **Groq** (free tier) |
| 8 | Groq `404 model_not_found` | `llama-3.3-70b-versatile` deprecated | Switched to `openai/gpt-oss-120b` |
| 9 | Chat crashes: `invalid input syntax for type uuid: "general"` | Channel slug used directly as UUID FK | Added `resolveChannel()` — find-or-create by name |
| 10 | Chat never connects | Vite proxy missing `/socket.io` rule | Added WebSocket proxy entry with `ws: true` |
| 11 | Both "Dashboard" and "Tasks" tabs highlight together | `NavLink` prefix-matches `/` against every route | `end={to === "/"}` |
| 12 | `column "priority" is of type task_priority but expression is of type text` | `COALESCE($4, 'medium')` — Postgres infers `$4` as `text` | Cast: `COALESCE($4::task_priority, 'medium')` |
| 13 | `Add task` fails with `Invalid uuid` | Submitted from placeholder `/tasks/current` route | Guarded submit handler + friendly inline warning |

---

## 5 · Core Code (final, debugged state)

> Each block reflects the **corrected** version — see §4 for what changed and why.

<details>
<summary><strong>backend/src/server.ts</strong> — HTTP + Socket.IO bootstrap</summary>

```typescript
import "dotenv/config";
import http from "http";
import { Server } from "socket.io";
import { createApp } from "./app";
import { initSockets } from "./sockets";

const app = createApp();
const httpServer = http.createServer(app);

let io: Server;

httpServer.on("listening", () => {
  console.log(`DevFlow API listening on port ${process.env.PORT || 4000}`);
});

io = initSockets(httpServer);

export function getIo(): Server {
  return io;
}

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT);

process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  httpServer.close(() => process.exit(0));
});
```
</details>

<details>
<summary><strong>backend/src/app.ts</strong> — Express app assembly</summary>

```typescript
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

import authRoutes from "./routes/auth.routes";
import taskRoutes from "./routes/task.routes";
import aiRoutes from "./routes/ai.routes";
import orgRoutes from "./routes/org.routes";
import projectRoutes from "./routes/project.routes";
import webhookRoutes from "./routes/webhook.routes";
import analyticsRoutes from "./routes/analytics.routes";
import { errorHandler } from "./middleware/errorHandler";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: process.env.CLIENT_URL || "*", credentials: true }));
  app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

  // Webhooks need the raw body for HMAC verification — mounted before
  // express.json() so the parser doesn't consume the stream first.
  app.use("/api/webhooks", express.raw({ type: "application/json" }), webhookRoutes);

  app.use(express.json({ limit: "2mb" }));

  const globalLimiter = rateLimit({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
    max: Number(process.env.RATE_LIMIT_MAX) || 100,
  });
  app.use(globalLimiter);

  app.get("/health", (_req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

  app.use("/api/auth", authRoutes);
  app.use("/api/tasks", taskRoutes);
  app.use("/api/ai", aiRoutes);
  app.use("/api/org", orgRoutes);
  app.use("/api/projects", projectRoutes);
  app.use("/api/analytics", analyticsRoutes);

  app.use(errorHandler);

  return app;
}
```
</details>

<details>
<summary><strong>backend/src/config/db.ts</strong> + <strong>redis.ts</strong></summary>

```typescript
// db.ts
import { Pool } from "pg";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
});

pool.on("error", (err) => console.error("Unexpected PostgreSQL error on idle client", err));

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows;
}
```

```typescript
// redis.ts
import Redis from "ioredis";

export const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: 3,
});

redis.on("error", (err) => console.error("Redis error:", err));
redis.on("connect", () => console.log("Redis connected"));

export async function cacheGetOrSet<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached) as T;
  const fresh = await fetcher();
  await redis.set(key, JSON.stringify(fresh), "EX", ttlSeconds);
  return fresh;
}

export async function invalidate(pattern: string) {
  const keys = await redis.keys(pattern);
  if (keys.length) await redis.del(...keys);
}
```
</details>

<details>
<summary><strong>backend/src/utils/jwt.ts</strong> — fix #2</summary>

```typescript
import jwt, { SignOptions } from "jsonwebtoken";

export interface AccessTokenPayload {
  userId: string;
  organizationId: string;
  role: "owner" | "admin" | "developer" | "viewer";
}

export function signAccessToken(payload: AccessTokenPayload): string {
  const options: SignOptions = {
    expiresIn: (process.env.JWT_ACCESS_EXPIRES_IN || "15m") as SignOptions["expiresIn"],
  };
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET as string, options);
}

export function signRefreshToken(payload: { userId: string }): string {
  const options: SignOptions = {
    expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || "7d") as SignOptions["expiresIn"],
  };
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET as string, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET as string) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): { userId: string } {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET as string) as { userId: string };
}
```
</details>

<details>
<summary><strong>backend/src/middleware/rbac.ts</strong> — role-hierarchy access control</summary>

```typescript
import { Response, NextFunction } from "express";
import { AuthedRequest } from "./auth";

export type Role = "owner" | "admin" | "developer" | "viewer";

const ROLE_RANK: Record<Role, number> = { owner: 4, admin: 3, developer: 2, viewer: 1 };

export function requireRole(minRole: Role) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    if (ROLE_RANK[req.user.role] < ROLE_RANK[minRole]) {
      return res.status(403).json({
        error: `Requires role '${minRole}' or higher. Current role: '${req.user.role}'.`,
      });
    }
    next();
  };
}

export function requireAnyRole(...roles: Role[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Requires one of roles: ${roles.join(", ")}` });
    }
    next();
  };
}
```
</details>

<details>
<summary><strong>backend/src/models/Task.ts</strong> — fix #12 (enum cast)</summary>

```typescript
import { query } from "../config/db";

export interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: "backlog" | "todo" | "in_progress" | "in_review" | "done";
  priority: "low" | "medium" | "high" | "urgent";
  assignee_id: string | null;
  created_by: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

export const TaskModel = {
  async listByProject(projectId: string): Promise<Task[]> {
    return query<Task>("SELECT * FROM tasks WHERE project_id = $1 ORDER BY created_at DESC", [projectId]);
  },

  async create(data: {
    projectId: string; title: string; description?: string; priority?: string;
    assigneeId?: string; createdBy: string; dueDate?: string;
  }): Promise<Task> {
    const rows = await query<Task>(
      `INSERT INTO tasks (project_id, title, description, priority, assignee_id, created_by, due_date)
       VALUES ($1, $2, $3, COALESCE($4::task_priority, 'medium'), $5, $6, $7) RETURNING *`,
      [data.projectId, data.title, data.description ?? null, data.priority ?? null,
       data.assigneeId ?? null, data.createdBy, data.dueDate ?? null]
    );
    return rows[0];
  },

  async updateStatus(taskId: string, status: string): Promise<Task> {
    const rows = await query<Task>(
      "UPDATE tasks SET status = $2, updated_at = now() WHERE id = $1 RETURNING *",
      [taskId, status]
    );
    return rows[0];
  },

  async logActivity(taskId: string, userId: string, action: string, metadata: object = {}) {
    await query(
      `INSERT INTO task_activity (task_id, user_id, action, metadata) VALUES ($1, $2, $3, $4)`,
      [taskId, userId, action, JSON.stringify(metadata)]
    );
  },
};
```
</details>

<details>
<summary><strong>backend/src/services/ai.service.ts</strong> — fixes #4, #7, #8 (Groq)</summary>

```typescript
import crypto from "crypto";
import { cacheGetOrSet } from "../config/redis";
import { query } from "../config/db";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

type AiFeature = "code_explanation" | "readme_generation" | "documentation" | "test_generation" | "pr_summary";

const SYSTEM_PROMPTS: Record<AiFeature, string> = {
  code_explanation: "You are a senior engineer explaining code to a teammate. Be precise, note edge cases and complexity, and avoid restating the code line-by-line.",
  readme_generation: "You generate clear, professional README.md files for software projects: purpose, setup, usage, and structure.",
  documentation: "You write concise technical documentation (docstrings/API docs) matching the surrounding code's style and language conventions.",
  test_generation: "You write thorough, idiomatic unit tests for the given code, covering edge cases, using the project's apparent testing framework if inferable.",
  pr_summary: "You summarize a pull request diff for reviewers: what changed, why, risk areas, and anything that needs closer review. Be concise and skimmable.",
};

async function callGroq(system: string, userContent: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured");

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      messages: [{ role: "system", content: system }, { role: "user", content: userContent }],
    }),
  });

  if (!res.ok) throw new Error(`Groq API error (${res.status}): ${await res.text()}`);
  const data: any = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

function hashInput(feature: AiFeature, input: string): string {
  return crypto.createHash("sha256").update(`${feature}:${input}`).digest("hex");
}

export async function runAiFeature(params: {
  feature: AiFeature; input: string; userId: string; projectId?: string; ttlSeconds?: number;
}): Promise<{ result: string; cached: boolean }> {
  const { feature, input, userId, projectId, ttlSeconds = 3600 } = params;
  const inputHash = hashInput(feature, input);
  const cacheKey = `ai:${feature}:${inputHash}`;

  let wasCached = true;
  const result = await cacheGetOrSet(cacheKey, ttlSeconds, async () => {
    wasCached = false;
    return callGroq(SYSTEM_PROMPTS[feature], input);
  });

  await query(
    `INSERT INTO ai_requests (user_id, project_id, feature, input_hash) VALUES ($1, $2, $3, $4)`,
    [userId, projectId ?? null, feature, inputHash]
  );

  return { result, cached: wasCached };
}

export const AiService = {
  explainCode: (code: string, userId: string, projectId?: string) =>
    runAiFeature({ feature: "code_explanation", input: code, userId, projectId }),
  generateReadme: (ctx: string, userId: string, projectId?: string) =>
    runAiFeature({ feature: "readme_generation", input: ctx, userId, projectId }),
  generateDocs: (code: string, userId: string, projectId?: string) =>
    runAiFeature({ feature: "documentation", input: code, userId, projectId }),
  generateTests: (code: string, userId: string, projectId?: string) =>
    runAiFeature({ feature: "test_generation", input: code, userId, projectId }),
  summarizePr: (diff: string, userId: string, projectId?: string) =>
    runAiFeature({ feature: "pr_summary", input: diff, userId, projectId, ttlSeconds: 900 }),
};
```
</details>

<details>
<summary><strong>backend/src/sockets/index.ts</strong> — fixes #3, #9 (channel resolution)</summary>

```typescript
import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { verifyAccessToken } from "../utils/jwt";
import { redis } from "../config/redis";
import { query } from "../config/db";

interface SocketUser { userId: string; organizationId: string; role: string; }
declare module "socket.io" { interface Socket { user?: SocketUser; } }

const PRESENCE_KEY = (orgId: string) => `presence:org:${orgId}`;

export function initSockets(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: { origin: process.env.CLIENT_URL || "*", credentials: true },
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) return next(new Error("Missing auth token"));
      const payload = verifyAccessToken(token);
      socket.user = { userId: payload.userId, organizationId: payload.organizationId, role: payload.role };
      next();
    } catch {
      next(new Error("Invalid auth token"));
    }
  });

  io.on("connection", async (socket: Socket) => {
    const user = socket.user!;
    const orgRoom = `org:${user.organizationId}`;
    socket.join(orgRoom);

    await redis.hset(PRESENCE_KEY(user.organizationId), user.userId, Date.now().toString());
    io.to(orgRoom).emit("presence:update", await getOnlineUsers(user.organizationId));

    socket.on("channel:join", (channelId: string) => socket.join(`channel:${channelId}`));
    socket.on("channel:leave", (channelId: string) => socket.leave(`channel:${channelId}`));

    socket.on("message:send", async (payload: { channelId: string; content: string }) => {
      const channel = await resolveChannel(payload.channelId);
      const rows = await query(
        `INSERT INTO messages (channel_id, sender_id, content) VALUES ($1, $2, $3) RETURNING *`,
        [channel.id, user.userId, payload.content]
      );
      io.to(`channel:${payload.channelId}`).emit("message:new", rows[0]);
    });

    socket.on("chat:typing", (payload: { channelId: string }) => {
      socket.to(`channel:${payload.channelId}`).emit("chat:typing", { userId: user.userId });
    });

    socket.on("task:subscribe", (projectId: string) => socket.join(`project:${projectId}`));
    socket.on("task:status_changed", (payload: { projectId: string; taskId: string; status: string }) => {
      socket.to(`project:${payload.projectId}`).emit("task:updated", payload);
    });

    socket.on("notification:ack", async (notificationId: string) => {
      await query("UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2", [notificationId, user.userId]);
    });

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

/** Resolves a human-readable channel slug (e.g. "general") to a real UUID
 *  row, creating it on first use — the frontend never deals with UUIDs. */
async function resolveChannel(name: string): Promise<{ id: string }> {
  const existing = await query<{ id: string }>("SELECT id FROM channels WHERE name = $1 LIMIT 1", [name]);
  if (existing[0]) return existing[0];
  const created = await query<{ id: string }>("INSERT INTO channels (name) VALUES ($1) RETURNING id", [name]);
  return created[0];
}

export function emitToUser(io: Server, userId: string, event: string, payload: unknown) {
  io.sockets.sockets.forEach((s) => { if (s.user?.userId === userId) s.emit(event, payload); });
}
```
</details>

<details>
<summary><strong>backend/src/db/schema.sql</strong> — core tables</summary>

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TYPE user_role AS ENUM ('owner', 'admin', 'developer', 'viewer');

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    role user_role NOT NULL DEFAULT 'developer',
    is_active BOOLEAN DEFAULT true,
    last_seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    repo_url TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TYPE task_status AS ENUM ('backlog', 'todo', 'in_progress', 'in_review', 'done');
CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high', 'urgent');

CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    status task_status NOT NULL DEFAULT 'backlog',
    priority task_priority NOT NULL DEFAULT 'medium',
    assignee_id UUID REFERENCES users(id),
    created_by UUID REFERENCES users(id),
    due_date DATE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE channels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    is_direct BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES users(id),
    content TEXT NOT NULL,
    is_ai_generated BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TYPE ai_feature AS ENUM (
    'code_explanation', 'readme_generation', 'documentation', 'test_generation', 'pr_summary'
);

CREATE TABLE ai_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    project_id UUID REFERENCES projects(id),
    feature ai_feature NOT NULL,
    input_hash VARCHAR(64) NOT NULL,
    tokens_used INT,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

*Full schema (`task_activity`, `notifications`, `team_analytics_daily`) lives in `backend/src/db/schema.sql`.*
</details>

<details>
<summary><strong>frontend/vite.config.ts</strong> — fix #10 (WebSocket proxy)</summary>

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4000",
      "/socket.io": { target: "http://localhost:4000", ws: true },
    },
  },
});
```
</details>

<details>
<summary><strong>frontend/src/components/layout/AppLayout.tsx</strong> — fixes #6, #11</summary>

```typescriptreact
import { Outlet, NavLink } from "react-router-dom";
import { LayoutDashboard, KanbanSquare, MessageSquare, Sparkles, LogOut } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useEffect, useState } from "react";
import { useSocket } from "../../hooks/useSocket";

export default function AppLayout() {
  const { user, logout } = useAuth();
  const socket = useSocket();
  const [onlineCount, setOnlineCount] = useState(0);

  const lastProjectId = localStorage.getItem("devflow_last_project_id");
  const navItems = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard },
    { to: lastProjectId ? `/tasks/${lastProjectId}` : "/", label: "Tasks", icon: KanbanSquare },
    { to: "/chat/general", label: "Chat", icon: MessageSquare },
    { to: "/ai", label: "AI Tools", icon: Sparkles },
  ];

  useEffect(() => {
    if (!socket) return;
    const handler = (ids: string[]) => setOnlineCount(ids.length);
    socket.on("presence:update", handler);
    return () => { socket.off("presence:update", handler); };
  }, [socket]);

  return (
    <div className="flex h-screen bg-slate-50">
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col">
        <div className="px-6 py-5 border-b border-slate-200">
          <h1 className="text-xl font-bold text-brand-700">DevFlow</h1>
          <p className="text-xs text-slate-400 mt-1">{onlineCount} online</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition ${
                  isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-slate-200">
          <div className="px-3 py-2 text-sm">
            <p className="font-medium text-slate-800">{user?.fullName}</p>
            <p className="text-xs text-slate-400 capitalize">{user?.role}</p>
          </div>
          <button onClick={logout} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-lg">
            <LogOut size={16} /> Log out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
```
</details>

<details>
<summary><strong>frontend/src/pages/TaskBoardPage.tsx</strong> — fix #13 (create-task guard)</summary>

```typescriptreact
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../services/api";
import { useSocket } from "../hooks/useSocket";

interface Task {
  id: string;
  title: string;
  status: "backlog" | "todo" | "in_progress" | "in_review" | "done";
  priority: "low" | "medium" | "high" | "urgent";
}

const COLUMNS: { key: Task["status"]; label: string }[] = [
  { key: "backlog", label: "Backlog" },
  { key: "todo", label: "To Do" },
  { key: "in_progress", label: "In Progress" },
  { key: "in_review", label: "In Review" },
  { key: "done", label: "Done" },
];

const PRIORITY_COLOR: Record<Task["priority"], string> = {
  low: "bg-slate-100 text-slate-600",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-amber-100 text-amber-700",
  urgent: "bg-red-100 text-red-700",
};

export default function TaskBoardPage() {
  const { projectId = "current" } = useParams();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const socket = useSocket();

  useEffect(() => {
    if (projectId === "current") return;
    localStorage.setItem("devflow_last_project_id", projectId);
    api.get(`/tasks/project/${projectId}`).then((res) => setTasks(res.data)).catch(() => setTasks([]));
  }, [projectId]);

  useEffect(() => {
    if (!socket) return;
    socket.emit("task:subscribe", projectId);
    const onCreated = (task: Task) => setTasks((prev) => [task, ...prev]);
    const onUpdated = (task: Task) => setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, ...task } : t)));
    socket.on("task:created", onCreated);
    socket.on("task:updated", onUpdated);
    return () => { socket.off("task:created", onCreated); socket.off("task:updated", onUpdated); };
  }, [socket, projectId]);

  async function moveTask(taskId: string, status: Task["status"]) {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)));
    await api.patch(`/tasks/${taskId}/status`, { status });
    socket?.emit("task:status_changed", { projectId, taskId, status });
  }

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim() || creating || projectId === "current") return;
    setCreating(true);
    try {
      await api.post("/tasks", { projectId, title: newTitle.trim() });
      setNewTitle("");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold text-slate-800 mb-4">Task Board</h2>

      {projectId === "current" ? (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-6">
          No project selected. Go to the Dashboard and click into a project first.
        </p>
      ) : (
        <form onSubmit={createTask} className="flex gap-2 mb-6">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Add a task..."
            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
          <button type="submit" disabled={creating} className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50">
            {creating ? "Adding..." : "Add task"}
          </button>
        </form>
      )}

      <div className="flex gap-4 overflow-x-auto">
        {COLUMNS.map((col) => (
          <div key={col.key} className="flex-1 min-w-[240px] bg-slate-100 rounded-xl p-3">
            <h3 className="text-sm font-semibold text-slate-600 mb-3">{col.label}</h3>
            <div className="space-y-2">
              {tasks.filter((t) => t.status === col.key).map((t) => (
                <div key={t.id} className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
                  <p className="text-sm font-medium text-slate-800">{t.title}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${PRIORITY_COLOR[t.priority]}`}>{t.priority}</span>
                    <select value={t.status} onChange={(e) => moveTask(t.id, e.target.value as Task["status"])} className="text-xs border border-slate-200 rounded px-1 py-0.5">
                      {COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```
</details>

---

## 6 · Environment Variables

**`backend/.env.example`**
```bash
# Server
PORT=4000
NODE_ENV=development
CLIENT_URL=http://localhost:5173

# PostgreSQL
DATABASE_URL=postgresql://devflow:devflow@localhost:5432/devflow

# Redis
REDIS_URL=redis://localhost:6379

# Auth
JWT_ACCESS_SECRET=replace_with_strong_random_secret
JWT_REFRESH_SECRET=replace_with_another_strong_random_secret
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# AI Provider — Groq (free tier, OpenAI-compatible)
GROQ_API_KEY=gsk_xxxxxxxx
GROQ_MODEL=openai/gpt-oss-120b

# GitHub integration (PR summarization webhook)
GITHUB_WEBHOOK_SECRET=replace_with_webhook_secret
GITHUB_APP_TOKEN=ghp_xxxxxxxx

# Rate limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100
```

**`frontend/.env.example`** — *not required locally* (Vite proxies to `localhost:4000`). Needed only for split-host deployment:
```bash
VITE_API_BASE_URL=https://api.yourdomain.com
VITE_SOCKET_URL=https://api.yourdomain.com
```
*(Requires updating `services/api.ts` and `hooks/useSocket.ts` to read these — not yet wired.)*

---

## 7 · Setup Guide

```bash
# 1 — Enter the project
cd devflow

# 2 — Start Postgres + Redis (Docker Desktop must be running)
docker compose up postgres redis -d

# 3 — Backend
cd backend
cp .env.example .env                        # fill in JWT secrets + GROQ_API_KEY
npm install
npm install --save-dev @types/pg            # required — see Fixed-Issues #1
psql "postgresql://devflow:devflow@localhost:5432/devflow" -f src/db/schema.sql
npm run dev                                  # → "DevFlow API listening on port 4000"

# 4 — Frontend (new terminal)
cd ../frontend
npm install
npm run dev                                  # → http://localhost:5173

# 5 — Register your first account in the browser
#     (creates an Organization + you as its Owner)

# 6 — Optional: full stack via Docker instead of steps 3–4
cd ..
$env:GROQ_API_KEY="gsk_..."                  # PowerShell (use export on macOS/Linux)
$env:JWT_ACCESS_SECRET="..."
$env:JWT_REFRESH_SECRET="..."
docker compose up --build                    # → http://localhost:8080
```

```bash
# Run tests
cd backend && npm test
```

---

## 8 · Roadmap

### 🔴 Phase 1 — Stabilize
- [ ] Global Socket.IO error boundary — an unhandled event currently crashes the whole process
- [ ] Per-project membership checks (RBAC is org-wide rank only, not project-scoped)
- [ ] `VITE_API_BASE_URL` / `VITE_SOCKET_URL` wiring for split-host deployment
- [ ] Replace implicit channel-creation-on-send with an explicit "create channel" step

### 🟡 Phase 2 — Feature completeness
- [ ] Notification bell UI (backend already emits `notification:new` — nothing renders it)
- [ ] Nightly job to populate `team_analytics_daily` (analytics endpoints read from it; nothing writes to it)
- [ ] Persist drag-and-drop board reordering (currently status changes via dropdown)
- [ ] Multi-channel chat with a channel switcher
- [ ] Org invite-by-email flow (currently no way to add a teammate into your org)

### 🟢 Phase 3 — Production readiness
- [ ] Real GitHub App install flow (currently a static PAT)
- [ ] AI provider behind a config flag, not a hardcoded file edit
- [ ] AWS deploy: RDS + ElastiCache + ECS + ALB/ACM — CI/CD `deploy` job is still a stub
- [ ] Structured logging + basic alerting
- [ ] Redis adapter for Socket.IO before scaling past one backend instance