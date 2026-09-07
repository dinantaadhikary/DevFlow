import { createContext, useContext, useState, ReactNode } from "react";
import { api } from "../services/api";

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: "owner" | "admin" | "developer" | "viewer";
}

interface AuthContextValue {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  register: (organizationName: string, fullName: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem("devflow_user");
    return raw ? JSON.parse(raw) : null;
  });

  function persistSession(data: { accessToken: string; refreshToken: string; user: AuthUser }) {
    localStorage.setItem("devflow_access_token", data.accessToken);
    localStorage.setItem("devflow_refresh_token", data.refreshToken);
    localStorage.setItem("devflow_user", JSON.stringify(data.user));
    setUser(data.user);
  }

  async function login(email: string, password: string) {
    const { data } = await api.post("/auth/login", { email, password });
    persistSession(data);
  }

  async function register(organizationName: string, fullName: string, email: string, password: string) {
    const { data } = await api.post("/auth/register", { organizationName, fullName, email, password });
    persistSession(data);
  }

  function logout() {
    localStorage.clear();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, login, register, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
