"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, Menu, Settings } from "lucide-react";
import Link from "next/link";
import { roleLabel } from "@/lib/auth/users";
import { useAuth } from "@/contexts/AuthContext";
import { useSidebar } from "@/contexts/SidebarContext";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Select } from "@/components/ui/select";

type Props = {
  title: string;
  subtitle?: string;
  showDbSelector?: boolean;
};

export default function Topbar({ title, subtitle, showDbSelector = true }: Props) {
  const { user, projects, db, setDb, logout, loading } = useAuth();
  const { setMobileOpen } = useSidebar();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const initials = (user?.name || user?.cedula || "EX")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("") || "EX";

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 select-none items-center justify-between gap-2 border-b border-brand-gray-200 bg-white/95 px-3 shadow-2xs backdrop-blur-md sm:px-4 md:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-brand-gray-600 transition-colors hover:bg-brand-gray-100 hover:text-brand-gray-900 md:hidden"
          aria-label="Abrir menu"
        >
          <Menu className="w-[18px] h-[18px]" strokeWidth={2} />
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-bold text-brand-gray-900 tracking-tight truncate">{title}</span>
            {subtitle && (
              <span className="hidden sm:inline-flex bg-brand-gray-100 border border-brand-gray-200/80 text-brand-gray-600 text-[11px] font-bold rounded-md px-2.5 py-0.5">
                {subtitle}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        {showDbSelector && projects.length > 0 && (
          <Select
            value={db}
            onChange={(e) => setDb(e.target.value)}
            wrapperClassName="hidden sm:inline-flex max-w-[min(100vw-8rem,220px)]"
            className="h-9 min-h-0 w-full min-w-[120px] py-1 text-xs font-semibold sm:h-8"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name || p.id}
              </option>
            ))}
          </Select>
        )}

        <ThemeToggle />
        <NotificationBell />

        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-transparent py-1 pl-1 pr-1.5 transition-all duration-150 hover:border-brand-gray-200 hover:bg-brand-gray-100/80 sm:gap-2 sm:pl-2 sm:pr-2.5"
          >
            <div className="w-7 h-7 bg-brand-red rounded-lg flex items-center justify-center font-bold text-[11px] text-white shrink-0">
              {initials}
            </div>
            <div className="text-right leading-tight hidden md:block">
              <div className="text-[12px] font-bold text-brand-gray-900 truncate max-w-[140px]">
                {loading ? "..." : user?.name || "Usuario"}
              </div>
              <div className="text-[9.5px] font-medium text-brand-gray-500 truncate max-w-[140px]">
                {roleLabel(user?.role)}
              </div>
            </div>
            <ChevronDown
              className={`w-3.5 h-3.5 text-brand-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
              strokeWidth={2}
            />
          </button>

          {open && (
            <div className="absolute right-0 z-50 mt-1.5 w-[min(16rem,calc(100vw-1.25rem))] overflow-hidden rounded-xl border border-brand-gray-200 bg-white shadow-lg">
              <div className="border-b border-brand-gray-100 bg-brand-gray-50/50 px-4 py-3">
                <p className="truncate text-[13px] font-bold text-brand-gray-900">{user?.name}</p>
                <p className="truncate text-[10.5px] text-brand-gray-500">{user?.cedula}</p>
                <p className="mt-0.5 text-[10.5px] font-semibold text-brand-gray-600 md:hidden">
                  {roleLabel(user?.role)}
                </p>
              </div>
              {showDbSelector && projects.length > 0 && (
                <div className="border-b border-brand-gray-100 px-3 py-2.5 sm:hidden">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-brand-gray-500">
                    Proyecto
                  </p>
                  <Select
                    value={db}
                    onChange={(e) => setDb(e.target.value)}
                    wrapperClassName="w-full"
                    className="h-10 min-h-10 w-full py-1 text-sm font-semibold"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name || p.id}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              {user?.role === "manager" && (
                <>
                  <Link
                    href="/configuracion/usuarios"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-xs font-medium text-brand-gray-700 hover:bg-brand-gray-100"
                  >
                    <Settings className="w-3.5 h-3.5" strokeWidth={1.8} />
                    Usuarios de la empresa
                  </Link>
                  <Link
                    href="/configuracion"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-xs font-medium text-brand-gray-700 hover:bg-brand-gray-100"
                  >
                    <Settings className="w-3.5 h-3.5" strokeWidth={1.8} />
                    Administracion
                  </Link>
                  <Link
                    href="/configuracion/general"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-xs font-medium text-brand-gray-700 hover:bg-brand-gray-100"
                  >
                    <Settings className="w-3.5 h-3.5" strokeWidth={1.8} />
                    Config. general
                  </Link>
                  <Link
                    href="/configuracion/incidencias"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-xs font-medium text-brand-gray-700 hover:bg-brand-gray-100"
                  >
                    <Settings className="w-3.5 h-3.5" strokeWidth={1.8} />
                    Monitor de incidencias
                  </Link>
                  <Link
                    href="/configuracion/examonitor"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-xs font-medium text-brand-gray-700 hover:bg-brand-gray-100"
                  >
                    <Settings className="w-3.5 h-3.5" strokeWidth={1.8} />
                    Config. ExaMonitor
                  </Link>
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  void logout();
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-medium text-brand-gray-700 hover:bg-brand-red-subtle hover:text-brand-red cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" strokeWidth={1.8} />
                Cerrar sesion
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
