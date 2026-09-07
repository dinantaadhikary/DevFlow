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
