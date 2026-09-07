# DevFlow — Project Implementation Plan

**Status:** Planning complete. Local development environment validated end-to-end (auth, RBAC, real-time task board, chat, AI tools) through iterative debugging.

---

## 1. Executive Summary

**Vision:** DevFlow is a full-stack developer collaboration platform that unifies project/task management, real-time team communication, and AI-assisted developer workflows in a single tool — reducing context-switching between Jira/Linear, Slack, and standalone AI coding assistants.

**Core goals:**
- Give engineering teams a single place to track work (Kanban board), talk (real-time chat with presence), and offload repetitive dev tasks to AI (code explanation, README/doc/test generation, PR summarization).
- Enforce organization-level access control (RBAC) so owners/admins can safely delegate without over-granting permissions.
- Keep the system cheap to operate at small-team scale by caching AI responses and hot reads in Redis rather than re-computing or re-billing on every request.

**Primary user workflow:**
1. A user registers, which creates a new **organization** and makes them its **owner**.
2. The owner creates **projects** and invites teammates (roles: owner/admin/developer/viewer).
3. Team members collaborate on a **Kanban task board** that updates live for everyone via WebSockets.
4. Team members chat in real-time **channels**, with typing indicators and online presence.
5. Any authenticated user can run **AI tools** (explain code, generate README/docs/tests, summarize a PR) — results are cached so identical requests don't re-hit the AI provider.
6. Opening a pull request on a linked GitHub repo automatically triggers an AI-generated PR summary posted into the project's chat channel.

---

## 2. Complete Tech Stack & Tools

| Layer | Choice | Notes |
|---|---|---|
| **Frontend framework** | React 18 + TypeScript + Vite | Fast HMR dev loop; Vite proxies `/api` and `/socket.io` to the backend in dev |
| **Styling** | Tailwind CSS | Utility-first, no separate CSS-in-JS runtime |
| **Frontend routing** | React Router v6 | `ProtectedRoute` wrapper gates authenticated pages |
| **Realtime client** | `socket.io-client` | Singleton connection shared across the app via a custom hook |
| **HTTP client** | Axios | Interceptor handles silent access-token refresh on 401 |
| **Icons** | `lucide-react` | |
| **Backend runtime** | Node.js 20 + Express + TypeScript | `ts-node` + `nodemon` for dev, compiled `tsc` build for production |
| **Realtime server** | Socket.IO | Presence (Redis-backed), chat, live task-board fan-out, notifications |
| **Database** | PostgreSQL 16 | Source of truth: orgs, users, projects, tasks, messages, notifications, AI audit log |
| **Cache** | Redis 7 | AI response cache (SHA-256 keyed), presence set, hot-read cache (task lists, analytics) |
| **Auth** | JWT (access + refresh) + bcrypt | Access token 15m, refresh token 7d; RBAC middleware enforces role hierarchy per-route |
| **AI provider** | **Groq** (OpenAI-compatible `chat/completions` API, `openai/gpt-oss-120b`) | Swapped in from an original Anthropic integration to use Groq's free tier; the service layer is provider-agnostic and can be swapped again by editing one function |
| **Validation** | Zod | Request body schemas in every controller |
| **Containerization** | Docker (multi-stage builds) + Docker Compose | Separate `Dockerfile` per service; Compose wires Postgres, Redis, backend, frontend (nginx) together |
| **CI/CD** | GitHub Actions | Lint → test (against real Postgres/Redis service containers) → build → Docker image push → deploy stage (AWS ECS-oriented) |
| **Testing** | Jest + Supertest | Integration tests hit the real Express app + a test Postgres instance |

**Key backend packages:** `express`, `pg`, `@types/pg`, `ioredis`, `socket.io`, `jsonwebtoken`, `bcryptjs`, `zod`, `express-rate-limit`, `helmet`, `cors`, `morgan`, `uuid`.

**Key frontend packages:** `react-router-dom`, `socket.io-client`, `axios`, `zustand` (available, not yet wired for global state beyond context), `lucide-react`, `date-fns`.

---

## 3. Directory & File Structure

```
devflow/
├── README.md
├── docker-compose.yml
├── .github/
│   └── workflows/
│       └── ci-cd.yml
│
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── jest.config.js
│   ├── Dockerfile
│   ├── .env.example
│   └── src/
│       ├── server.ts                 # HTTP + Socket.IO bootstrap
│       ├── app.ts                    # Express app assembly (middleware, routes)
│       │
│       ├── config/
│       │   ├── db.ts                 # pg Pool + query() helper
│       │   └── redis.ts              # ioredis client + cache-aside helper
│       │
│       ├── middleware/
│       │   ├── auth.ts               # requireAuth (JWT verification)
│       │   ├── rbac.ts               # requireRole / requireAnyRole
│       │   └── errorHandler.ts       # ApiError + centralized error handler
│       │
│       ├── utils/
│       │   └── jwt.ts                # sign/verify access + refresh tokens
│       │
│       ├── models/
│       │   ├── User.ts
│       │   └── Task.ts
│       │
│       ├── controllers/
│       │   ├── auth.controller.ts
│       │   ├── task.controller.ts
│       │   └── ai.controller.ts
│       │
│       ├── routes/
│       │   ├── auth.routes.ts
│       │   ├── task.routes.ts
│       │   ├── ai.routes.ts
│       │   ├── org.routes.ts
│       │   ├── project.routes.ts
│       │   ├── webhook.routes.ts     # GitHub PR webhook → auto AI summary
│       │   └── analytics.routes.ts
│       │
│       ├── services/
│       │   ├── ai.service.ts         # Groq integration + Redis caching + audit log
│       │   └── notification.service.ts
│       │
│       ├── sockets/
│       │   └── index.ts              # presence, chat, task board, notifications
│       │
│       ├── db/
│       │   └── schema.sql            # full Postgres schema
│       │
│       └── __tests__/
│           ├── auth.test.ts
│           └── rbac.test.ts
│
└── frontend/
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── index.html
    ├── Dockerfile
    ├── nginx.conf
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── index.css
        │
        ├── context/
        │   └── AuthContext.tsx
        │
        ├── hooks/
        │   └── useSocket.ts
        │
        ├── services/
        │   └── api.ts                # axios instance + refresh-token interceptor
        │
        ├── components/
        │   └── layout/
        │       └── AppLayout.tsx     # sidebar nav, presence counter, logout
        │
        └── pages/
            ├── LoginPage.tsx
            ├── RegisterPage.tsx
            ├── DashboardPage.tsx     # project list + create-project form
            ├── TaskBoardPage.tsx     # Kanban board + create-task form
            ├── ChatPage.tsx
            └── AiToolsPage.tsx
```

---

## 4. Full Code Specifications & Boilerplate

All files below reflect the **final, debugged state** — including fixes made after initial implementation (missing `@types/pg`, JWT `expiresIn` typing, the ESM `node-fetch` removal in favor of built-in `fetch`, the Anthropic→Groq swap, the `task_priority` enum cast, the `resolveChannel` fix for chat, the `NavLink` exact-match fix, and the Vite WebSocket proxy).

### 4.1 `backend/src/server.ts`

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

### 4.2 `backend/src/app.ts`

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

  // Webhooks need the raw body for HMAC signature verification, so they're
  // mounted BEFORE the global express.json() parser consumes the stream.
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

### 4.3 `backend/src/config/db.ts`

```typescript
import { Pool } from "pg";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
});

pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL error on idle client", err);
});

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows;
}
```

### 4.4 `backend/src/config/redis.ts`

```typescript
import Redis from "ioredis";

export const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: 3,
});

redis.on("error", (err) => console.error("Redis error:", err));
redis.on("connect", () => console.log("Redis connected"));

export async function cacheGetOrSet<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
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

### 4.5 `backend/src/utils/jwt.ts`

> Fixed: newer `@types/jsonwebtoken` narrows `expiresIn` to a branded string type. Env-var strings need an explicit cast.

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

### 4.6 `backend/src/middleware/rbac.ts`

```typescript
import { Response, NextFunction } from "express";
import { AuthedRequest } from "./auth";

export type Role = "owner" | "admin" | "developer" | "viewer";

const ROLE_RANK: Record<Role, number> = {
  owner: 4,
  admin: 3,
  developer: 2,
  viewer: 1,
};

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

### 4.7 `backend/src/models/Task.ts`

> Fixed: `COALESCE($4, 'medium')` needs an explicit `::task_priority` cast, or Postgres infers `$4` as `text` and rejects the assignment to the `priority` enum column.

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
    return query<Task>(
      "SELECT * FROM tasks WHERE project_id = $1 ORDER BY created_at DESC",
      [projectId]
    );
  },

  async create(data: {
    projectId: string;
    title: string;
    description?: string;
    priority?: string;
    assigneeId?: string;
    createdBy: string;
    dueDate?: string;
  }): Promise<Task> {
    const rows = await query<Task>(
      `INSERT INTO tasks (project_id, title, description, priority, assignee_id, created_by, due_date)
       VALUES ($1, $2, $3, COALESCE($4::task_priority, 'medium'), $5, $6, $7) RETURNING *`,
      [
        data.projectId,
        data.title,
        data.description ?? null,
        data.priority ?? null,
        data.assigneeId ?? null,
        data.createdBy,
        data.dueDate ?? null,
      ]
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

### 4.8 `backend/src/services/ai.service.ts`

> Swapped from Anthropic to Groq's OpenAI-compatible endpoint. The `node-fetch` import was removed in favor of Node 18+'s built-in global `fetch`, which also resolved an `ERR_REQUIRE_ESM` crash.

```typescript
import crypto from "crypto";
import { cacheGetOrSet } from "../config/redis";
import { query } from "../config/db";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

type AiFeature =
  | "code_explanation"
  | "readme_generation"
  | "documentation"
  | "test_generation"
  | "pr_summary";

const SYSTEM_PROMPTS: Record<AiFeature, string> = {
  code_explanation:
    "You are a senior engineer explaining code to a teammate. Be precise, note edge cases and complexity, and avoid restating the code line-by-line.",
  readme_generation:
    "You generate clear, professional README.md files for software projects: purpose, setup, usage, and structure.",
  documentation:
    "You write concise technical documentation (docstrings/API docs) matching the surrounding code's style and language conventions.",
  test_generation:
    "You write thorough, idiomatic unit tests for the given code, covering edge cases, using the project's apparent testing framework if inferable.",
  pr_summary:
    "You summarize a pull request diff for reviewers: what changed, why, risk areas, and anything that needs closer review. Be concise and skimmable.",
};

async function callGroq(system: string, userContent: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured");

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Groq API error (${res.status}): ${text}`);
  }

  const data: any = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

function hashInput(feature: AiFeature, input: string): string {
  return crypto.createHash("sha256").update(`${feature}:${input}`).digest("hex");
}

export async function runAiFeature(params: {
  feature: AiFeature;
  input: string;
  userId: string;
  projectId?: string;
  ttlSeconds?: number;
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
  generateReadme: (projectContext: string, userId: string, projectId?: string) =>
    runAiFeature({ feature: "readme_generation", input: projectContext, userId, projectId }),
  generateDocs: (code: string, userId: string, projectId?: string) =>
    runAiFeature({ feature: "documentation", input: code, userId, projectId }),
  generateTests: (code: string, userId: string, projectId?: string) =>
    runAiFeature({ feature: "test_generation", input: code, userId, projectId }),
  summarizePr: (diff: string, userId: string, projectId?: string) =>
    runAiFeature({ feature: "pr_summary", input: diff, userId, projectId, ttlSeconds: 900 }),
};
```

### 4.9 `backend/src/sockets/index.ts`

> Fixed: `message:send` originally inserted the raw URL slug (e.g. `"general"`) directly into the `channel_id` UUID column. Added `resolveChannel()` to find-or-create a real channel row by name. Also fixed a `RemoteSocket` type mismatch in the disconnect handler with a targeted `as any` cast.

```typescript
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

    socket.on(
      "task:status_changed",
      (payload: { projectId: string; taskId: string; status: string }) => {
        socket.to(`project:${payload.projectId}`).emit("task:updated", payload);
      }
    );

    socket.on("notification:ack", async (notificationId: string) => {
      await query("UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2", [
        notificationId,
        user.userId,
      ]);
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

/**
 * The frontend addresses channels by a human-readable slug (e.g. "general"),
 * but the messages table's channel_id column is a real UUID foreign key.
 * This finds an existing channel row by name, or creates one on first use.
 */
async function resolveChannel(name: string): Promise<{ id: string }> {
  const existing = await query<{ id: string }>("SELECT id FROM channels WHERE name = $1 LIMIT 1", [name]);
  if (existing[0]) return existing[0];

  const created = await query<{ id: string }>(
    "INSERT INTO channels (name) VALUES ($1) RETURNING id",
    [name]
  );
  return created[0];
}

export function emitToUser(io: Server, userId: string, event: string, payload: unknown) {
  io.sockets.sockets.forEach((s) => {
    if (s.user?.userId === userId) s.emit(event, payload);
  });
}
```

### 4.10 `backend/src/db/schema.sql` (core tables)

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

*(Full schema — including `task_activity`, `notifications`, and `team_analytics_daily` — lives in `backend/src/db/schema.sql`.)*

### 4.11 `frontend/vite.config.ts`

> Fixed: the original config only proxied `/api`. Socket.IO's handshake goes over `/socket.io`, so without this rule the chat/presence/task-board sockets silently connected to the frontend's own dev server instead of the backend and never worked.

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4000",
      "/socket.io": {
        target: "http://localhost:4000",
        ws: true,
      },
    },
  },
});
```

### 4.12 `frontend/src/components/layout/AppLayout.tsx`

> Fixed: `NavLink` matches by path-prefix by default, so the Dashboard link (`/`) lit up as "active" on every route. `end={to === "/"}` restricts exact-match behavior to that one link. Also added `lastProjectId` persistence so the "Tasks" nav item points at a real project instead of a dead placeholder.

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
    return () => {
      socket.off("presence:update", handler);
    };
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
          <button
            onClick={logout}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-lg"
          >
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

### 4.13 `frontend/src/pages/TaskBoardPage.tsx`

> Includes the create-task form (added after initial delivery) and a guard against submitting on the `/tasks/current` placeholder route.

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
    const onUpdated = (task: Task) =>
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, ...task } : t)));

    socket.on("task:created", onCreated);
    socket.on("task:updated", onUpdated);
    return () => {
      socket.off("task:created", onCreated);
      socket.off("task:updated", onUpdated);
    };
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
          <button
            type="submit"
            disabled={creating}
            className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50"
          >
            {creating ? "Adding..." : "Add task"}
          </button>
        </form>
      )}

      <div className="flex gap-4 overflow-x-auto">
        {COLUMNS.map((col) => (
          <div key={col.key} className="flex-1 min-w-[240px] bg-slate-100 rounded-xl p-3">
            <h3 className="text-sm font-semibold text-slate-600 mb-3">{col.label}</h3>
            <div className="space-y-2">
              {tasks
                .filter((t) => t.status === col.key)
                .map((t) => (
                  <div key={t.id} className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
                    <p className="text-sm font-medium text-slate-800">{t.title}</p>
                    <div className="flex items-center justify-between mt-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${PRIORITY_COLOR[t.priority]}`}>
                        {t.priority}
                      </span>
                      <select
                        value={t.status}
                        onChange={(e) => moveTask(t.id, e.target.value as Task["status"])}
                        className="text-xs border border-slate-200 rounded px-1 py-0.5"
                      >
                        {COLUMNS.map((c) => (
                          <option key={c.key} value={c.key}>
                            {c.label}
                          </option>
                        ))}
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

---

## 5. Environment Variables Template

### `backend/.env.example`

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

# AI Provider (Groq — free tier, OpenAI-compatible)
GROQ_API_KEY=gsk_xxxxxxxx
GROQ_MODEL=openai/gpt-oss-120b

# GitHub integration (PR summarization webhook)
GITHUB_WEBHOOK_SECRET=replace_with_webhook_secret
GITHUB_APP_TOKEN=ghp_xxxxxxxx

# Rate limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100
```

### `frontend/.env.example`

The frontend has no required secrets in local development — Vite proxies `/api` and `/socket.io` to `http://localhost:4000`. If deploying the frontend separately from the backend (not via the same nginx/Compose setup), add:

```bash
VITE_API_BASE_URL=https://api.yourdomain.com
VITE_SOCKET_URL=https://api.yourdomain.com
```

*(Wiring these in requires updating `frontend/src/services/api.ts` and `frontend/src/hooks/useSocket.ts` to read `import.meta.env.VITE_API_BASE_URL` instead of the relative `/api` path — not yet done, since local dev uses the Vite proxy.)*

---

## 6. Step-by-Step Setup Guide

```bash
# 1. Extract/clone the project and enter it
cd devflow

# 2. Start Postgres + Redis via Docker (make sure Docker Desktop is running)
docker compose up postgres redis -d

# 3. Backend: install, configure, migrate, run
cd backend
cp .env.example .env
# → edit .env: fill in JWT secrets and GROQ_API_KEY
npm install
npm install --save-dev @types/pg   # required — not in package.json by default
# Schema is auto-applied by the Postgres container's init script the first
# time the volume is created. To apply/re-apply manually:
psql "postgresql://devflow:devflow@localhost:5432/devflow" -f src/db/schema.sql
npm run dev
# → wait for "DevFlow API listening on port 4000"

# 4. Frontend: install and run (in a second terminal)
cd ../frontend
npm install
npm run dev
# → open http://localhost:5173

# 5. Register your first account (creates an organization + owner user)
# via the Register page in the browser.

# 6. (Optional) Run the full stack in Docker instead of steps 3-4
cd ..
$env:GROQ_API_KEY="gsk_..."          # PowerShell; use export on macOS/Linux
$env:JWT_ACCESS_SECRET="..."
$env:JWT_REFRESH_SECRET="..."
docker compose up --build
# → open http://localhost:8080
```

**Run the test suite:**

```bash
cd backend
npm test
```

---

## 7. Next Milestones

### Phase 1 — Stabilize the core (near-term hardening)
- [ ] Add a global Socket.IO error boundary so a single bad event (e.g. a malformed payload) can't crash the whole backend process, as happened during dev when an unresolved channel slug threw inside a socket handler.
- [ ] Add project-membership checks to task/project routes (currently RBAC checks role rank org-wide, not membership in the *specific* project).
- [ ] Add a "create project" empty-state flow directly in onboarding (currently the Dashboard's create-project form is the only path — fine, but should be foregrounded for brand-new orgs).
- [ ] Wire `VITE_API_BASE_URL` / `VITE_SOCKET_URL` env vars so frontend and backend can be deployed to different hosts.
- [ ] Replace the ad-hoc `resolveChannel`-on-send pattern with an explicit "create channel" project-setup step, so channels aren't implicitly created by whichever message happens to arrive first.

### Phase 2 — Feature completeness
- [ ] Notification bell UI component in the frontend (backend `notification.service.ts` and sockets already emit `notification:new`; nothing renders it yet).
- [ ] Nightly job (or Postgres trigger) to populate `team_analytics_daily` — the `analytics.routes.ts` endpoints already read from it, but nothing writes to it yet.
- [ ] Drag-and-drop on the Kanban board (currently status changes via a `<select>`; drag handlers exist in the CSS/markup from the original scaffold but aren't wired to persist).
- [ ] Multi-channel chat (channel list/switcher) instead of the single hardcoded `general` channel.
- [ ] Org invite flow (currently the only way to add a teammate is for them to register their own separate organization — there's no "invite by email into my org" path yet).

### Phase 3 — Production readiness
- [ ] Real GitHub App installation flow for `GITHUB_APP_TOKEN` (currently a static PAT env var) so the PR-summary webhook works per-installation rather than per-deployment.
- [ ] Move AI provider selection behind a config flag so Groq/Anthropic/OpenAI can be swapped without code edits (currently requires editing `ai.service.ts` directly, as done during this build).
- [ ] AWS deployment: RDS for Postgres, ElastiCache for Redis, ECS services for backend/frontend, ALB + ACM for TLS — the CI/CD pipeline's `deploy` job is currently a stub.
- [ ] Structured logging (replace `morgan` + `console.log` with something shippable to CloudWatch/Datadog) and basic uptime/error alerting.
- [ ] Load-test the Socket.IO presence/chat path before scaling past a single backend instance — the current in-memory `io.sockets.sockets` iteration in `emitToUser` won't work across multiple backend processes without a Redis adapter for Socket.IO.
