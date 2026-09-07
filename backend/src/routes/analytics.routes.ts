import { Router } from "express";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { query } from "../config/db";
import { cacheGetOrSet } from "../config/redis";

const router = Router();
router.use(requireAuth);

/**
 * Rolled-up analytics for a project over the last N days. Backed by the
 * team_analytics_daily summary table (populated by a nightly job / trigger
 * in a real deployment) rather than aggregating raw events on every request.
 * Cached for 5 minutes since dashboards don't need second-level freshness.
 */
router.get("/project/:projectId", async (req: AuthedRequest, res, next) => {
  try {
    const { projectId } = req.params;
    const days = Math.min(Number(req.query.days) || 14, 90);

    const data = await cacheGetOrSet(`analytics:project:${projectId}:${days}`, 300, async () => {
      const rows = await query(
        `SELECT day, tasks_completed, tasks_created, messages_sent, ai_requests_made
         FROM team_analytics_daily
         WHERE project_id = $1 AND day >= now() - ($2 || ' days')::interval
         ORDER BY day ASC`,
        [projectId, days]
      );

      const totals = rows.reduce(
        (acc, r: any) => ({
          tasksCompleted: acc.tasksCompleted + r.tasks_completed,
          tasksCreated: acc.tasksCreated + r.tasks_created,
          messagesSent: acc.messagesSent + r.messages_sent,
          aiRequestsMade: acc.aiRequestsMade + r.ai_requests_made,
        }),
        { tasksCompleted: 0, tasksCreated: 0, messagesSent: 0, aiRequestsMade: 0 }
      );

      return { daily: rows, totals };
    });

    res.json(data);
  } catch (err) {
    next(err);
  }
});

/** Breakdown of which AI features are getting used, for the org as a whole. */
router.get("/ai-usage", async (req: AuthedRequest, res, next) => {
  try {
    const usage = await cacheGetOrSet(`analytics:ai-usage:${req.user!.organizationId}`, 300, () =>
      query(
        `SELECT ar.feature, COUNT(*)::int AS request_count
         FROM ai_requests ar
         JOIN users u ON u.id = ar.user_id
         WHERE u.organization_id = $1
         GROUP BY ar.feature
         ORDER BY request_count DESC`,
        [req.user!.organizationId]
      )
    );
    res.json(usage);
  } catch (err) {
    next(err);
  }
});

export default router;
