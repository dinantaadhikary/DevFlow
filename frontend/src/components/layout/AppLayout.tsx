import { Outlet, NavLink } from "react-router-dom";
import { LayoutDashboard, KanbanSquare, MessageSquare, Sparkles, LogOut } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useEffect, useState } from "react";
import { useSocket } from "../../hooks/useSocket";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/tasks/current", label: "Tasks", icon: KanbanSquare },
  { to: "/chat/general", label: "Chat", icon: MessageSquare },
  { to: "/ai", label: "AI Tools", icon: Sparkles },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const socket = useSocket();
  const [onlineCount, setOnlineCount] = useState(0);

  useEffect(() => {
    if (!socket) return;
    const handler = (ids: string[]) => setOnlineCount(ids.length);
    socket.on("presence:update", handler);
    return () => {
      socket.off("presence:update", handler);
    };
  }, [socket]);

  return (
    <div className="flex h-screen bg-slate-50">
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col">
        <div className="px-6 py-5 border-b border-slate-200">
          <h1 className="text-xl font-bold text-brand-700">DevFlow</h1>
          <p className="text-xs text-slate-400 mt-1">{onlineCount} online</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition ${
                  isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-slate-200">
          <div className="px-3 py-2 text-sm">
            <p className="font-medium text-slate-800">{user?.fullName}</p>
            <p className="text-xs text-slate-400 capitalize">{user?.role}</p>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-lg"
          >
            <LogOut size={16} /> Log out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
