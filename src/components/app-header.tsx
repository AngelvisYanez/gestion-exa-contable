"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutDashboard, ListTodo, LogOut, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { roleLabel } from "@/lib/auth/users";

type Props = {
  title: string;
  subtitle?: string;
  brand?: string;
  databases?: string[];
  db?: string;
  onDbChange?: (v: string) => void;
  onRefresh?: () => void;
  loading?: boolean;
  userName?: string;
  role?: string;
  showMisTareas?: boolean;
  showPanel?: boolean;
};

export function AppHeader({
  title,
  subtitle,
  brand = "EXA Tareas",
  databases,
  db,
  onDbChange,
  onRefresh,
  loading,
  userName,
  role,
  showMisTareas,
  showPanel,
}: Props) {
  const router = useRouter();

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  };

  return (
    <header className="mb-8 flex flex-col gap-5 border-b border-border/80 pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-9 items-center rounded-md bg-black px-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/exa-wordmark-light.png"
              alt="EXA"
              className="h-6 w-auto object-contain"
            />
          </span>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary">{brand}</p>
        </div>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>}
        {(userName || role) && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {userName && <Badge variant="secondary">{userName}</Badge>}
            {role && (
              <Badge variant="outline">{roleLabel(role)}</Badge>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {databases && onDbChange && (
          <Select value={db} onChange={(e) => onDbChange(e.target.value)} className="w-auto min-w-[140px] font-semibold">
            {databases.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
        )}
        {onRefresh && (
          <Button type="button" variant="secondary" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} />
            Actualizar
          </Button>
        )}
        {showMisTareas && (
          <Button asChild variant="outline">
            <Link href="/mis-tareas">
              <ListTodo />
              Mis tareas
            </Link>
          </Button>
        )}
        {showPanel && (
          <Button asChild variant="secondary">
            <Link href="/">
              <LayoutDashboard />
              Panel
            </Link>
          </Button>
        )}
        {(userName || role) && (
          <Button type="button" variant="ghost" onClick={logout}>
            <LogOut />
            Salir
          </Button>
        )}
      </div>
    </header>
  );
}
