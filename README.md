# DevFlow — AI-Powered Developer Collaboration Platform

A full-stack platform combining project/task management, real-time team communication,
and AI-assisted developer workflows (code explanation, README generation, docs, test
generation, PR summarization).

## Stack

| Layer      | Tech |
|------------|------|
| Frontend   | React + TypeScript, Tailwind CSS, Vite, Socket.IO client |
| Backend    | Node.js + Express + TypeScript |
| Realtime   | Socket.IO (presence, chat, live task boards, notifications) |
| Database   | PostgreSQL (source of truth) |
| Cache      | Redis (AI response cache, presence, hot reads) |
| Auth       | JWT (access + refresh), bcrypt, RBAC middleware |
| AI         | Anthropic API (Claude) |
| Infra      | Docker, Docker Compose, GitHub Actions, AWS (ECS-oriented deploy step) |

## Local development

```bash
# 1. Start Postgres + Redis
docker compose up postgres redis -d

# 2. Backend
cd backend
cp .env.example .env   # fill in secrets
npm install
npm run dev             # http://localhost:4000

# 3. Frontend (new terminal)
cd frontend
npm install
npm run dev             # http://localhost:5173
```

## Full stack via Docker Compose

```bash
export JWT_ACCESS_SECRET=... JWT_REFRESH_SECRET=... ANTHROPIC_API_KEY=...
docker compose up --build
# frontend: http://localhost:8080
# backend:  http://localhost:4000
```

## Project layout

```
devflow/
├── backend/
│   ├── src/
│   │   ├── config/        # Postgres pool, Redis client + cache helper
│   │   ├── middleware/     # auth (JWT), rbac (role checks), error handler
│   │   ├── models/         # DB access layer (User, Task)
│   │   ├── controllers/    # request handlers
│   │   ├── routes/         # Express routers
│   │   ├── services/       # ai.service.ts (Anthropic + caching), notification.service.ts
│   │   ├── sockets/        # Socket.IO server: presence, chat, task events
│   │   ├── db/schema.sql   # full Postgres schema
│   │   ├── routes/webhook.routes.ts    # GitHub PR webhook -> auto PR summary
│   │   ├── routes/analytics.routes.ts  # team analytics, AI usage breakdown
│   │   └── server.ts       # HTTP + Socket.IO bootstrap
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── pages/           # Login, Register, Dashboard, TaskBoard, Chat, AiTools
│   │   ├── components/layout/
│   │   ├── context/AuthContext.tsx
│   │   ├── hooks/useSocket.ts
│   │   └── services/api.ts  # axios client with refresh-token interceptor
│   └── Dockerfile
├── docker-compose.yml
└── .github/workflows/ci-cd.yml
```

## GitHub PR summarization webhook

1. In your GitHub repo settings, add a webhook pointing to
   `https://your-domain.com/api/webhooks/github`, content type `application/json`,
   with a secret matching `GITHUB_WEBHOOK_SECRET`.
2. Subscribe to the `pull_request` event.
3. Set a project's `repo_url` (via `POST /api/projects`) to match the repo — DevFlow
   matches incoming webhook payloads to a project by repo name.
4. On `opened` / `synchronize` / `ready_for_review`, DevFlow verifies the HMAC
   signature, fetches the diff, runs it through `AiService.summarizePr`, posts the
   summary into the project's default channel, and notifies the project owner
   in real time over the socket.

## Analytics

- `GET /api/analytics/project/:projectId?days=14` — daily rollup + totals (tasks
  completed/created, messages sent, AI requests made), cached 5 minutes.
- `GET /api/analytics/ai-usage` — which AI features (explain/readme/docs/tests/PR
  summary) the org is using most.

## See it explained

Ask for a walkthrough of any layer (auth/RBAC, real-time architecture, AI caching
strategy, deployment pipeline) — the code above is fully wired, not just stubs.
