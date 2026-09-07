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

    api
      .get(`/tasks/project/${projectId}`)
      .then((res) => setTasks(res.data))
      .catch(() => setTasks([]));
  }, [projectId]);

  useEffect(() => {
    if (!socket) return;

    socket.emit("task:subscribe", projectId);

    const onCreated = (task: Task) => {
      setTasks((prev) => [task, ...prev]);
    };

    const onUpdated = (task: Task) => {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id ? { ...t, ...task } : t
        )
      );
    };

    socket.on("task:created", onCreated);
    socket.on("task:updated", onUpdated);

    return () => {
      socket.off("task:created", onCreated);
      socket.off("task:updated", onUpdated);
    };
  }, [socket, projectId]);

  async function moveTask(
    taskId: string,
    status: Task["status"]
  ) {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId ? { ...t, status } : t
      )
    );

    await api.patch(`/tasks/${taskId}/status`, { status });

    socket?.emit("task:status_changed", {
      projectId,
      taskId,
      status,
    });
  }

  async function createTask(e: React.FormEvent) {
    e.preventDefault();

    if (
      !newTitle.trim() ||
      creating ||
      projectId === "current"
    ) {
      return;
    }

    setCreating(true);

    try {
      await api.post("/tasks", {
        projectId,
        title: newTitle.trim(),
      });

      setNewTitle("");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold text-slate-800 mb-4">
        Task Board
      </h2>

      {projectId === "current" ? (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-6">
          No project selected. Go to the Dashboard and click into a
          project first.
        </p>
      ) : (
        <form
          onSubmit={createTask}
          className="flex gap-2 mb-6"
        >
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
          <div
            key={col.key}
            className="flex-1 min-w-[240px] bg-slate-100 rounded-xl p-3"
          >
            <h3 className="text-sm font-semibold text-slate-600 mb-3">
              {col.label}
            </h3>

            <div className="space-y-2">
              {tasks
                .filter((t) => t.status === col.key)
                .map((t) => (
                  <div
                    key={t.id}
                    draggable
                    onDragEnd={() => {}}
                    className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm"
                  >
                    <p className="text-sm font-medium text-slate-800">
                      {t.title}
                    </p>

                    <div className="flex items-center justify-between mt-2">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${PRIORITY_COLOR[t.priority]}`}
                      >
                        {t.priority}
                      </span>

                      <select
                        value={t.status}
                        onChange={(e) =>
                          moveTask(
                            t.id,
                            e.target.value as Task["status"]
                          )
                        }
                        className="text-xs border border-slate-200 rounded px-1 py-0.5"
                      >
                        {COLUMNS.map((c) => (
                          <option
                            key={c.key}
                            value={c.key}
                          >
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