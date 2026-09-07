import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";

interface Project {
  id: string;
  name: string;
  description: string | null;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [newName, setNewName] = useState("");

  function loadProjects() {
    api
      .get("/projects")
      .then((res) => setProjects(res.data))
      .catch(() => setProjects([]));
  }

  useEffect(() => {
    loadProjects();
  }, []);

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    await api.post("/projects", { name: newName.trim() });
    setNewName("");
    loadProjects();
  }

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold text-slate-800">
        Welcome back, {user?.fullName?.split(" ")[0]}
      </h2>
      <p className="text-slate-500 mt-1">
        Here's what's happening across your team.
      </p>

      <form onSubmit={createProject} className="flex gap-2 mt-6 mb-6">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New project name..."
          className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
        />
        <button
          type="submit"
          className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm"
        >
          Create project
        </button>
      </form>

      <h3 className="text-lg font-semibold text-slate-800 mb-3">Projects</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {projects.map((p) => (
          <Link
            key={p.id}
            to={`/tasks/${p.id}`}
            className="block bg-white border border-slate-200 rounded-xl p-4 hover:border-brand-500"
          >
            <h4 className="font-medium text-slate-800">{p.name}</h4>
            <p className="text-sm text-slate-500 mt-1">
              {p.description || "No description yet."}
            </p>
          </Link>
        ))}
        {projects.length === 0 && (
          <p className="text-sm text-slate-400">
            No projects yet — create one above to get started.
          </p>
        )}
      </div>
    </div>
  );
}