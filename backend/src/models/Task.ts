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
