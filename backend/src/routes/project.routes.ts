import { Router } from "express";
import { z } from "zod";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import { query } from "../config/db";

const router = Router();
router.use(requireAuth);

router.get("/", async (req: AuthedRequest, res, next) => {
  try {
    const projects = await query(
      `SELECT p.* FROM projects p WHERE p.organization_id = $1 ORDER BY p.created_at DESC`,
      [req.user!.organizationId]
    );
    res.json(projects);
  } catch (err) {
    next(err);
  }
});

const createSchema = z.object({ name: z.string().min(1), description: z.string().optional(), repoUrl: z.string().url().optional() });

router.post("/", requireRole("developer"), async (req: AuthedRequest, res, next) => {
  try {
    const body = createSchema.parse(req.body);
    const rows = await query(
      `INSERT INTO projects (organization_id, name, description, repo_url, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user!.organizationId, body.name, body.description ?? null, body.repoUrl ?? null, req.user!.userId]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router;
