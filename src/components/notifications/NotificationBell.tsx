"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, Trash2, X } from "lucide-react";
import { useNotifications } from "@/contexts/NotificationsContext";
import { cn } from "@/lib/utils";

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.max(0, Math.floor(diff / 1000));
  if (sec < 60) return "ahora";
  const min = Math.floor(sec / 60);
  if (min < 60) return `hace ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `hace ${hr} h`;
  return `hace ${Math.floor(hr / 24)} d`;
}

export function NotificationBell() {
  const { items, unread, markAllRead, markRead, clearAll } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) markAllRead();
        }}
        className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-brand-gray-600 transition-colors hover:border-brand-gray-200 hover:bg-brand-gray-100 hover:text-brand-gray-900"
        aria-label="Notificaciones"
      >
        <Bell className="h-4 w-4" strokeWidth={2} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-red px-1 text-[9px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1.5 w-[340px] overflow-hidden rounded-xl border border-brand-gray-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-brand-gray-100 px-3 py-2.5">
            <div>
              <p className="text-[13px] font-bold text-brand-gray-900">Notificaciones</p>
              <p className="text-[10px] text-brand-gray-500">Tiempo real · asignaciones y avances</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                title="Marcar leidas"
                onClick={markAllRead}
                className="rounded-md p-1.5 text-brand-gray-500 hover:bg-brand-gray-100 hover:text-brand-gray-800"
              >
                <CheckCheck className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title="Limpiar"
                onClick={clearAll}
                className="rounded-md p-1.5 text-brand-gray-500 hover:bg-brand-gray-100 hover:text-brand-gray-800"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="max-h-[360px] overflow-y-auto">
            {items.length === 0 && (
              <p className="px-4 py-10 text-center text-xs text-brand-gray-500">
                Sin notificaciones por ahora.
              </p>
            )}
            {items.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => markRead(n.id)}
                className={cn(
                  "flex w-full flex-col gap-0.5 border-b border-brand-gray-50 px-3 py-2.5 text-left transition-colors hover:bg-brand-gray-50",
                  !n.read && "bg-sky-50/60"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[12px] font-bold text-brand-gray-900">{n.title}</span>
                  <span className="shrink-0 text-[10px] text-brand-gray-400">{timeAgo(n.at)}</span>
                </div>
                <span className="text-[11px] leading-snug text-brand-gray-600">{n.message}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function NotificationToast() {
  const { toast, dismissToast } = useNotifications();
  if (!toast) return null;

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] animate-fade-in">
      <div className="pointer-events-auto flex w-[320px] items-start gap-3 rounded-xl border border-brand-gray-200 bg-white p-3.5 shadow-xl">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
          <Bell className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-brand-gray-900">{toast.title}</p>
          <p className="mt-0.5 text-[11px] leading-snug text-brand-gray-600">{toast.message}</p>
        </div>
        <button
          type="button"
          onClick={dismissToast}
          className="rounded-md p-1 text-brand-gray-400 hover:bg-brand-gray-100 hover:text-brand-gray-700"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
