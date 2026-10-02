"use client";

import { useMemo, useState, type ButtonHTMLAttributes } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CalendarClock, GripVertical, History, Maximize2, Ticket } from "lucide-react";
import { EstadoBadge, PrioridadBadge, ComplejidadBadge, fmtDate } from "@/components/status-badges";
import { Progress } from "@/components/ui/progress";
import { hoyFecha, startOfDayZona } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import { plainTextFromHtml } from "@/components/ui/rich-text";
import type { Tarea } from "./types";

export const KANBAN_COLUMNS = [
  { id: "Pendiente", label: "Pendiente", accent: "border-t-slate-400" },
  { id: "Asignado", label: "Asignado", accent: "border-t-violet-500" },
  { id: "En Proceso", label: "En Proceso", accent: "border-t-sky-500" },
  { id: "Finalizada", label: "Finalizada", accent: "border-t-emerald-500" },
] as const;

export type KanbanEstado = (typeof KANBAN_COLUMNS)[number]["id"];

const COLUMN_IDS = new Set<string>(KANBAN_COLUMNS.map((c) => c.id));

export function workItemKey(t: Tarea) {
  return `${t.tipo || "tarea"}:${t.Tar_Cod}`;
}

function columnFor(t: Tarea): KanbanEstado {
  const e = t.Tar_Estado || "Pendiente";
  if (e === "Finalizada" || (t.Ava_Porcentaje || 0) >= 100) return "Finalizada";
  if (e === "En Proceso") return "En Proceso";
  if (e === "Asignado") return "Asignado";
  if (COLUMN_IDS.has(e)) return e as KanbanEstado;
  return "Pendiente";
}

function finInfo(t: Tarea) {
  const fin = t.Tar_Fecha_Fin ? String(t.Tar_Fecha_Fin).slice(0, 10) : "";
  if (!fin || columnFor(t) === "Finalizada") return { fin, atrasada: false, pronto: false };
  const hoy = startOfDayZona(hoyFecha());
  const diff = Math.round((startOfDayZona(fin).getTime() - hoy.getTime()) / 86400000);
  return { fin, atrasada: diff < 0, pronto: diff >= 0 && diff <= 2 };
}

function ultimaActualizacion(iso?: string | null) {
  if (!iso) return null;
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (Number.isNaN(dias)) return null;
  return { dias, text: dias <= 0 ? "hoy" : dias === 1 ? "ayer" : `hace ${dias} d` };
}

function tsOf(iso?: string | null) {
  if (!iso) return 0;
  const ts = new Date(iso).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

/** Más nuevas primero dentro de cada columna. */
function columnRecency(t: Tarea, col: KanbanEstado) {
  if (col === "Finalizada") {
    return Math.max(tsOf(t.Tar_Fecha_Culminacion), tsOf(t.Ava_Ultima_Fecha), tsOf(t.Tar_Fecha_Inicio));
  }
  if (col === "En Proceso") {
    return Math.max(tsOf(t.Ava_Ultima_Fecha), tsOf(t.Tar_Fecha_Inicio), tsOf(t.Tar_Fecha_Fin));
  }
  // Pendiente / Asignado
  return Math.max(tsOf(t.Tar_Fecha_Inicio), tsOf(t.Ava_Ultima_Fecha), tsOf(t.Tar_Fecha_Fin));
}

function sortColumnDesc(a: Tarea, b: Tarea, col: KanbanEstado) {
  const diff = columnRecency(b, col) - columnRecency(a, col);
  return diff !== 0 ? diff : b.Tar_Cod - a.Tar_Cod;
}

function resolveColumnId(
  overId: string | null | undefined,
  tareas: Tarea[]
): KanbanEstado | null {
  if (!overId) return null;
  if (COLUMN_IDS.has(overId)) return overId as KanbanEstado;
  const hit = tareas.find((t) => workItemKey(t) === overId);
  return hit ? columnFor(hit) : null;
}

type Props = {
  tareas: Tarea[];
  loading?: boolean;
  onAvance: (t: Tarea) => void;
  onMoveEstado: (t: Tarea, estado: KanbanEstado) => Promise<void> | void;
  onOpen?: (t: Tarea) => void;
  className?: string;
};

type CardBodyProps = {
  tarea: Tarea;
  busy?: boolean;
  ghost?: boolean;
  overlay?: boolean;
  dragHandleProps?: ButtonHTMLAttributes<HTMLButtonElement>;
  onAvance: (t: Tarea) => void;
  onMoveEstado: (t: Tarea, estado: KanbanEstado) => Promise<void> | void;
  onOpen?: (t: Tarea) => void;
  onSelectEstado?: (t: Tarea, estado: KanbanEstado) => void;
};

function KanbanCardBody({
  tarea: t,
  busy,
  ghost,
  overlay,
  dragHandleProps,
  onAvance,
  onMoveEstado,
  onOpen,
  onSelectEstado,
}: CardBodyProps) {
  const esTicket = t.tipo === "ticket";
  const estadoActual = columnFor(t);
  const { atrasada, pronto } = finInfo(t);
  const upd = ultimaActualizacion(t.Ava_Ultima_Fecha);

  return (
    <article
      role={onOpen && !overlay ? "button" : undefined}
      tabIndex={onOpen && !overlay ? 0 : undefined}
      onClick={(e) => {
        if (overlay || ghost) return;
        // Evitar abrir si el clic viene de controles internos (botones / select).
        const el = e.target as HTMLElement;
        if (el.closest("button, a, select, label, input, textarea")) return;
        onOpen?.(t);
      }}
      onKeyDown={(e) => {
        if (overlay) return;
        if (onOpen && (e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
          e.preventDefault();
          onOpen(t);
        }
      }}
      title={onOpen && !overlay ? "Clic para ver el detalle" : undefined}
      className={cn(
        "group touch-manipulation rounded-lg border border-border/70 bg-card p-2.5 shadow-sm transition",
        "hover:border-primary/35 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        onOpen && !overlay && "cursor-pointer",
        atrasada && "border-l-4 border-l-red-500",
        busy && "opacity-50",
        ghost && "opacity-35 ring-2 ring-sky-300",
        overlay && "cursor-grabbing shadow-lg ring-2 ring-sky-400"
      )}
    >
      <div className="mb-1.5 flex items-start gap-1">
        {dragHandleProps ? (
          <button
            type="button"
            className={cn(
              "mt-0.5 shrink-0 cursor-grab touch-none rounded p-0.5 text-muted-foreground/60",
              "hover:bg-muted hover:text-muted-foreground active:cursor-grabbing",
              "sm:opacity-70 sm:group-hover:opacity-100"
            )}
            aria-label="Arrastrar tarjeta"
            disabled={busy}
            onClick={(e) => e.stopPropagation()}
            {...dragHandleProps}
          >
            <GripVertical className="size-4 sm:size-3.5" />
          </button>
        ) : (
          <GripVertical className="mt-0.5 size-4 shrink-0 text-muted-foreground/50 sm:size-3.5" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
              {esTicket && <Ticket className="size-3 text-amber-600" />}
              {esTicket ? `Tic #${t.Tic_Cod ?? t.Tar_Cod}` : `#${t.Tar_Cod}`}
            </span>
            {onOpen && (
              <Maximize2 className="size-3.5 text-muted-foreground/40 transition group-hover:text-muted-foreground sm:size-3 sm:text-muted-foreground/0" />
            )}
          </div>
          <div className="break-words text-sm font-semibold leading-snug">{t.Tar_Titulo}</div>
          {t.Tar_Descripcion && (
            <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
              {plainTextFromHtml(t.Tar_Descripcion)}
            </p>
          )}
        </div>
      </div>

      <div className="mb-2 flex flex-wrap gap-1">
        {esTicket && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
            Ticket
          </span>
        )}
        <PrioridadBadge prioridad={t.Tar_Prioridad} />
        {!esTicket && t.Tar_Complejidad && <ComplejidadBadge complejidad={t.Tar_Complejidad} />}
        <EstadoBadge estado={t.Tar_Estado} />
        {!esTicket && (t.Evidencias_Count || 0) > 0 && (
          <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-bold text-sky-800">
            {t.Evidencias_Count} foto{(t.Evidencias_Count || 0) === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {!esTicket && (
        <div className="mb-2 flex items-center gap-2">
          <Progress value={Math.min(100, t.Ava_Porcentaje || 0)} className="h-1.5 flex-1" />
          <span className="text-[10px] font-bold tabular-nums">{t.Ava_Porcentaje || 0}%</span>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span className="truncate">
          {t.Asignados.length
            ? t.Asignados.map((a) => a.Nombre.split(" ")[0]).join(", ")
            : "Sin asignar"}
        </span>
        {!esTicket && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5",
              atrasada && "font-bold text-red-600",
              pronto && "font-bold text-amber-600"
            )}
          >
            <CalendarClock className="size-3" />
            {fmtDate(t.Tar_Fecha_Fin)}
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        {!esTicket ? (
          <button
            type="button"
            className="min-h-8 text-[11px] font-bold text-sky-700 hover:underline sm:min-h-0"
            onClick={(e) => {
              e.stopPropagation();
              onAvance(t);
            }}
          >
            Registrar avance
          </button>
        ) : estadoActual !== "Finalizada" ? (
          <button
            type="button"
            className="min-h-8 text-[11px] font-bold text-emerald-700 hover:underline sm:min-h-0"
            onClick={(e) => {
              e.stopPropagation();
              void onMoveEstado(t, "Finalizada");
            }}
          >
            Marcar resuelto
          </button>
        ) : (
          <span className="text-[11px] font-semibold text-emerald-700">Resuelto</span>
        )}
        {!esTicket && (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[10px] text-muted-foreground",
              upd && upd.dias >= 3 && columnFor(t) !== "Finalizada" && "text-amber-600"
            )}
            title="Avances registrados · ultima actualizacion"
          >
            <History className="size-3" />
            {t.Ava_Total || 0}
            {upd ? ` · ${upd.text}` : ""}
          </span>
        )}
      </div>

      {onSelectEstado && !overlay && (
        <label
          className="mt-2 flex items-center gap-2 sm:hidden"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <span className="sr-only">Mover a columna</span>
          <select
            className="h-8 w-full rounded-md border border-border bg-background px-2 text-[11px] font-semibold text-foreground"
            value={estadoActual}
            disabled={busy}
            aria-label="Cambiar estado"
            onChange={(e) => onSelectEstado(t, e.target.value as KanbanEstado)}
          >
            {KANBAN_COLUMNS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      )}
    </article>
  );
}

function KanbanCard({
  tarea,
  busy,
  ghost,
  onAvance,
  onMoveEstado,
  onOpen,
  onSelectEstado,
}: {
  tarea: Tarea;
  busy: boolean;
  ghost?: boolean;
  onAvance: (t: Tarea) => void;
  onMoveEstado: (t: Tarea, estado: KanbanEstado) => Promise<void> | void;
  onOpen?: (t: Tarea) => void;
  onSelectEstado: (t: Tarea, estado: KanbanEstado) => void;
}) {
  const key = workItemKey(tarea);
  const estadoActual = columnFor(tarea);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: key,
    data: { type: "card", tarea, column: estadoActual },
    disabled: busy,
  });

  return (
    <div ref={setNodeRef}>
      <KanbanCardBody
        tarea={tarea}
        busy={busy}
        ghost={ghost || isDragging}
        dragHandleProps={{ ...listeners, ...attributes }}
        onAvance={onAvance}
        onMoveEstado={onMoveEstado}
        onOpen={onOpen}
        onSelectEstado={onSelectEstado}
      />
    </div>
  );
}

function KanbanColumn({
  col,
  cards,
  loading,
  isOver,
  moving,
  activeKey,
  onAvance,
  onMoveEstado,
  onOpen,
  onSelectEstado,
}: {
  col: (typeof KANBAN_COLUMNS)[number];
  cards: Tarea[];
  loading?: boolean;
  isOver: boolean;
  moving: string | null;
  activeKey: string | null;
  onAvance: (t: Tarea) => void;
  onMoveEstado: (t: Tarea, estado: KanbanEstado) => Promise<void> | void;
  onOpen?: (t: Tarea) => void;
  onSelectEstado: (t: Tarea, estado: KanbanEstado) => void;
}) {
  const { setNodeRef, isOver: isDropOver } = useDroppable({
    id: col.id,
    data: { type: "column", column: col.id },
  });

  const highlight = isOver || isDropOver;

  return (
    <section
      role="listitem"
      aria-label={`${col.label}: ${cards.length} elementos`}
      className={cn(
        "kanban-col rounded-xl border border-border/80 bg-muted/30 border-t-[3px]",
        col.accent,
        highlight && "bg-primary/5 ring-2 ring-primary/25"
      )}
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border/50 px-3 py-2.5">
        <div className="text-xs font-bold uppercase tracking-wide text-foreground">{col.label}</div>
        <span className="rounded-md bg-background px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">
          {cards.length}
        </span>
      </header>

      <div
        ref={setNodeRef}
        className={cn(
          "min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-y-contain px-2 py-2",
          "touch-pan-y [scrollbar-width:thin] scroll-smooth"
        )}
      >
        {cards.map((t) => {
          const key = workItemKey(t);
          return (
            <KanbanCard
              key={key}
              tarea={t}
              busy={moving === key}
              ghost={activeKey === key}
              onAvance={onAvance}
              onMoveEstado={onMoveEstado}
              onOpen={onOpen}
              onSelectEstado={onSelectEstado}
            />
          );
        })}

        {!loading && cards.length === 0 && (
          <div className="rounded-lg border border-dashed border-border/70 px-2 py-8 text-center text-[11px] text-muted-foreground">
            Arrastra aqui
          </div>
        )}
      </div>
    </section>
  );
}

export function KanbanBoard({ tareas, loading, onAvance, onMoveEstado, onOpen, className }: Props) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const byCol = useMemo(() => {
    const map: Record<string, Tarea[]> = {
      Pendiente: [],
      Asignado: [],
      "En Proceso": [],
      Finalizada: [],
    };
    for (const t of tareas) {
      map[columnFor(t)].push(t);
    }
    for (const col of KANBAN_COLUMNS) {
      map[col.id].sort((a, b) => sortColumnDesc(a, b, col.id));
    }
    return map;
  }, [tareas]);

  const activeTarea = useMemo(
    () => (activeKey ? tareas.find((t) => workItemKey(t) === activeKey) ?? null : null),
    [activeKey, tareas]
  );

  const applyMove = async (tarea: Tarea, estado: KanbanEstado) => {
    if (columnFor(tarea) === estado) return;
    const key = workItemKey(tarea);
    setMoving(key);
    try {
      await onMoveEstado(tarea, estado);
    } finally {
      setMoving(null);
    }
  };

  const onDragStart = (event: DragStartEvent) => {
    setActiveKey(String(event.active.id));
  };

  const onDragOver = (event: DragOverEvent) => {
    setOverCol(resolveColumnId(event.over ? String(event.over.id) : null, tareas));
  };

  const onDragCancel = () => {
    setActiveKey(null);
    setOverCol(null);
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveKey(null);
    setOverCol(null);
    if (!over) return;

    const tarea = tareas.find((t) => workItemKey(t) === String(active.id));
    if (!tarea) return;

    const destino = resolveColumnId(String(over.id), tareas);
    if (!destino) return;
    void applyMove(tarea, destino);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <div
        className={cn("kanban-board pb-1", className)}
        role="list"
        aria-label="Tablero kanban"
      >
        {KANBAN_COLUMNS.map((col) => (
          <KanbanColumn
            key={col.id}
            col={col}
            cards={byCol[col.id] || []}
            loading={loading}
            isOver={overCol === col.id}
            moving={moving}
            activeKey={activeKey}
            onAvance={onAvance}
            onMoveEstado={onMoveEstado}
            onOpen={onOpen}
            onSelectEstado={(t, estado) => void applyMove(t, estado)}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeTarea ? (
          <div className="w-[min(86vw,300px)] sm:w-[260px]">
            <KanbanCardBody
              tarea={activeTarea}
              overlay
              onAvance={onAvance}
              onMoveEstado={onMoveEstado}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
