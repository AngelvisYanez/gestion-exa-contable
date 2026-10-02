"use client";

import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

export type AppUser = {
  username: string;
  cedula: string;
  name: string;
  role: "manager" | "developer" | "atencion";
  projects: string[];
  perCod: number;
  usuCod?: number;
};

export type ProjectInfo = {
  id: string;
  name: string;
  dbDis: string;
  description?: string;
};

type AuthContextValue = {
  user: AppUser | null;
  projects: ProjectInfo[];
  db: string;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  setDb: (db: string) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AppUser | null>(null);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [db, setDbState] = useState("exa");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/me");
      if (!res.ok) {
        setUser(null);
        setProjects([]);
        return;
      }
      const j = await res.json();
      setUser(j.user || null);
      setProjects(j.projects || []);
      if (j.db) setDbState(j.db);
      else if (j.projects?.[0]?.id) setDbState(j.projects[0].id);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    router.replace("/login");
  }, [router]);

  const setDb = useCallback((next: string) => {
    setDbState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("exa-tareas-db", next);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Mis tareas / personal Emp 96 viven en exa; no persistir "servicios" como BD operativa
    const saved = window.localStorage.getItem("exa-tareas-db");
    if (saved === "exa" || saved === "servicios") setDbState("exa");
  }, []);

  const value = useMemo(
    () => ({ user, projects, db, loading, refresh, logout, setDb }),
    [user, projects, db, loading, refresh, logout, setDb]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = use(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
