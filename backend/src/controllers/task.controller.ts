import { Response, NextFunction } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth";
import { TaskModel } from "../models/Task";
import { cacheGetOrSet, invalidate } from "../config/redis";
import { getIo } from "../server";
import { NotificationService } from "../services/notification.service";

const createTaskSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  assigneeId: z.string().uuid().optional(),
  dueDate: z.string().optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(["backlog", "todo", "in_progress", "in_review", "done"]),
});

export async function listTasks(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const { projectId } = req.params;
    // Cached for 30s: task boards are read far more than written.
    const tasks = await cacheGetOrSet(`tasks:project:${projectId}`, 30, () =>
      TaskModel.listByProject(projectId)
    );
    res.json(tasks);
  } catch (err) {
    next(err);
  }
}

export async function createTask(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const body = createTaskSchema.parse(req.body);
    const task = await TaskModel.create({ ...body, createdBy: req.user!.userId });
    await invalidate(`tasks:project:${body.projectId}`);

    const io = getIo();
    io.to(`project:${body.projectId}`).emit("task:created", task);

    if (task.assignee_id && task.assignee_id !== req.user!.userId) {
      await NotificationService.taskAssigned(io, task.assignee_id, task.title, task.id);
    }

    res.status(201).json(task);
  } catch (err) {
    next(err);
  }
}

export async function updateTaskStatus(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const { taskId } = req.params;
    const { status } = updateStatusSchema.parse(req.body);

    const task = await TaskModel.updateStatus(taskId, status);
    await TaskModel.logActivity(taskId, req.user!.userId, "status_changed", { status });
    await invalidate(`tasks:project:${task.project_id}`);

    getIo().to(`project:${task.project_id}`).emit("task:updated", task);
    res.json(task);
  } catch (err) {
    next(err);
  }
}
