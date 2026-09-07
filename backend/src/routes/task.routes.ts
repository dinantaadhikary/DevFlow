import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import { listTasks, createTask, updateTaskStatus } from "../controllers/task.controller";

const router = Router();

router.use(requireAuth);

router.get("/project/:projectId", listTasks); // viewers can read
router.post("/", requireRole("developer"), createTask); // developer+ can create
router.patch("/:taskId/status", requireRole("developer"), updateTaskStatus);

export default router;
