import { Router } from "express";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import { UserModel } from "../models/User";
import { query } from "../config/db";

const router = Router();
router.use(requireAuth);

// Any member can list teammates.
router.get("/members", async (req: AuthedRequest, res, next) => {
  try {
    const members = await UserModel.listByOrganization(req.user!.organizationId);
    res.json(members);
  } catch (err) {
    next(err);
  }
});

// Only admins/owners can change a teammate's role.
router.patch("/members/:userId/role", requireRole("admin"), async (req: AuthedRequest, res, next) => {
  try {
    const { role } = req.body;
    const allowed = ["owner", "admin", "developer", "viewer"];
    if (!allowed.includes(role)) return res.status(400).json({ error: "Invalid role" });

    await query("UPDATE users SET role = $1 WHERE id = $2 AND organization_id = $3", [
      role,
      req.params.userId,
      req.user!.organizationId,
    ]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
