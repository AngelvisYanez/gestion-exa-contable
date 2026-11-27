"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import {
  ArrowRight,
  ArrowRightLeft,
  Bell,
  CalendarClock,
  CheckCheck,
  CheckCircle2,
  FileText,
  Pencil,
  PlusCircle,
  TrendingUp,
  Trash2,
  User,
  UserPlus,
  X,
} from "lucide-react";
import { useNotifications, type AppNotification } from "@/contexts/NotificationsContext";
import { useAuth } from "@/contexts/AuthContext";
import { EstadoBadge, PrioridadBadge, fmtDate } from "@/components/status-badges";
import { eventKind, notificationTarget } from "@/lib/notif-links";
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

type Visual = { icon: ComponentType<{ className?: string }>; tone: string };

function visualFor(n: AppNotification): Visual {
  if (n.type === "avance_registrado" && (n.porcentaje ?? 0) >= 100) {
    return { icon: CheckCircle2, tone: "bg-emerald-100 text-emerald-700" };
  }
  switch (n.type) {
    case "tarea_asignada":
    case "ticket_asignado":
      return { icon: UserPlus, tone: "bg-sky-100 text-sky-700" };
    case "tarea_creada":
      return { icon: PlusCircle, tone: "bg-emerald-100 text-emerald-700" };
    case "avance_registrado":
      return { icon: TrendingUp, tone: "bg-indigo-100 text-indigo-700" };
    case "estado_cambiado":
      return { icon: ArrowRightLeft, tone: "bg-amber-100 text-amber-700" };
    case "brief_generado":
      return { icon: FileText, tone: "bg-violet-100 text-violet-700" };
    case "tarea_actualizada":
    default:
      return { icon: Pencil, tone: "bg-slate-100 text-slate-600" };
  }
}

/** Contenido completo de una notificación (lista y aviso emergente). */
function NotificationBody({
  n,
  linkLabel,
  compact = false,
}: {
  n: AppNotification;
  linkLabel?: string;
  compact?: boolean;
}) {
  const { icon: Icon, tone } = visualFor(n);
  const kind = eventKind(n);
  const ref = kind === "ticket" ? `Ticket #${n.ticCod}` : kind === "tarea" ? `Tarea #${n.tarCod}` : null;
  const showProgress = n.porcentaje != null;
  const cambioEstado =
    n.estadoAnterior && n.estado && n.estadoAnterior !== n.estado ? n.estadoAnterior : null;

  return (
    <div className="flex min-w-0 flex-1 items-start gap-2.5">
      <div className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg", tone)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <span className="text-[12px] font-bold leading-tight text-brand-gray-900">{n.title}</span>
          {!compact && (
            <span className="shrink-0 text-[10px] text-brand-gray-400">{timeAgo(n.at)}</span>
          )}
        </div>

        {(ref || n.titulo) && (
          <p className="mt-1 text-[12px] leading-snug text-brand-gray-800">
            {ref && (
              <span className="mr-1.5 rounded bg-brand-gray-100 px-1.5 py-px text-[10px] font-bold text-brand-gray-600">
                {ref}
              </span>
            )}
            {n.titulo && <span className="font-semibold">{n.titulo}</span>}
          </p>
        )}

        <p className="mt-0.5 text-[11px] leading-snug text-brand-gray-600">{n.message}</p>

        {n.detalle && (
          <p className="mt-1 line-clamp-2 rounded-md border-l-2 border-brand-gray-200 bg-brand-gray-50 px-2 py-1 text-[11px] italic leading-snug text-brand-gray-600">
            {n.detalle}
          </p>
        )}

        {showProgress && (
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-brand-gray-100">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${Math.max(0, Math.min(100, n.porcentaje ?? 0))}%` }}
              />
            </div>
            <span className="text-[10px] font-bold text-brand-gray-600">{n.porcentaje}%</span>
          </div>
        )}

        {(n.estado || n.prioridad || n.asignadoA || n.fechaFin) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {cambioEstado && (
              <>
                <EstadoBadge estado={cambioEstado} />
                <ArrowRight className="h-3 w-3 text-brand-gray-400" />
              </>
            )}
            {n.estado && <EstadoBadge estado={n.estado} />}
            {n.prioridad && <PrioridadBadge prioridad={n.prioridad} />}
            {n.asignadoA && (
              <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-brand-gray-100 px-2 py-0.5 text-[10px] font-medium text-brand-gray-700">
                <User className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">{n.asignadoA}</span>
              </span>
            )}
            {n.fechaFin && (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-gray-100 px-2 py-0.5 text-[10px] font-medium text-brand-gray-700">
                <CalendarClock className="h-2.5 w-2.5" />
                {fmtDate(n.fechaFin)}
              </span>
            )}
          </div>
        )}

        <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px]">
          <span className="truncate text-brand-gray-400">
            {n.actor ? `Por ${n.actor}` : ""}
            {compact ? `${n.actor ? " · " : ""}${timeAgo(n.at)}` : ""}
          </span>
          {linkLabel && (
            <span className="inline-flex shrink-0 items-center gap-0.5 font-semibold text-sky-700">
              {linkLabel}
              <ArrowRight className="h-3 w-3" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function NotificationBell() {
  const { items, unread, markAllRead, clearAll, openNotification } = useNotifications();
  const { user } = useAuth();
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
        className="relative flex size-11 items-center justify-center rounded-lg border border-transparent text-brand-gray-600 transition-colors hover:border-brand-gray-200 hover:bg-brand-gray-100 hover:text-brand-gray-900 sm:size-8"
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
        <div className="fixed inset-x-2 top-14 z-50 overflow-hidden rounded-xl border border-brand-gray-200 bg-white shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-1.5 sm:w-[min(400px,calc(100vw-1.25rem))]">
          <div className="flex items-center justify-between border-b border-brand-gray-100 px-3 py-2.5">
            <div>
              <p className="text-[13px] font-bold text-brand-gray-900">Notificaciones</p>
              <p className="text-[10px] text-brand-gray-500">
                Tiempo real · pulsa una para abrir su detalle
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                title="Marcar leidas"
                onClick={markAllRead}
                className="flex size-11 items-center justify-center rounded-md text-brand-gray-500 hover:bg-brand-gray-100 hover:text-brand-gray-800 sm:size-8"
              >
                <CheckCheck className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title="Limpiar"
                onClick={clearAll}
                className="flex size-11 items-center justify-center rounded-md text-brand-gray-500 hover:bg-brand-gray-100 hover:text-brand-gray-800 sm:size-8"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="max-h-[calc(100dvh-8rem)] overflow-y-auto sm:max-h-[480px]">
            {items.length === 0 && (
              <p className="px-4 py-10 text-center text-xs text-brand-gray-500">
                Sin notificaciones por ahora.
              </p>
            )}
            {items.map((n) => (
              <NotificationRow
                key={n.id}
                n={n}
                hasTarget={notificationTarget(n, user) != null}
                linkLabel={notificationTarget(n, user)?.label}
                onOpen={() => {
                  if (openNotification(n)) setOpen(false);
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationRow({
  n,
  hasTarget,
  linkLabel,
  onOpen,
}: {
  n: AppNotification;
  hasTarget: boolean;
  linkLabel?: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex w-full border-b border-brand-gray-50 px-3 py-2.5 text-left transition-colors",
        hasTarget ? "cursor-pointer hover:bg-brand-gray-50" : "cursor-default hover:bg-brand-gray-50/60",
        !n.read && "bg-sky-50/60"
      )}
    >
      <NotificationBody n={n} linkLabel={linkLabel} />
    </button>
  );
}

export function NotificationToast() {
  const { toast, dismissToast, openNotification } = useNotifications();
  const { user } = useAuth();
  const target = useMemo(() => (toast ? notificationTarget(toast, user) : null), [toast, user]);

  if (!toast) return null;

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] animate-fade-in max-sm:inset-x-3 max-sm:right-3">
      <div className="pointer-events-auto relative flex w-[360px] max-w-full items-start rounded-xl border border-brand-gray-200 bg-white shadow-xl max-sm:w-full">
        <button
          type="button"
          onClick={() => {
            openNotification(toast);
            dismissToast();
          }}
          className={cn(
            "min-w-0 flex-1 rounded-xl p-3.5 pr-9 text-left",
            target ? "cursor-pointer hover:bg-brand-gray-50" : "cursor-default"
          )}
        >
          <NotificationBody n={toast} linkLabel={target?.label} compact />
        </button>
        <button
          type="button"
          onClick={dismissToast}
          aria-label="Cerrar aviso"
          className="absolute right-2 top-2 rounded-md p-1 text-brand-gray-400 hover:bg-brand-gray-100 hover:text-brand-gray-700"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
