"use client";

import Link from "next/link";
import { ArrowRight, ClipboardList, Ticket, Users } from "lucide-react";
import {
  BarChart,
  ChartLegend,
  DonutChart,
  MetricCard,
} from "@/components/charts/simple-charts";
import { OverallWidget, CumplimientoWidget, ActividadWidget } from "@/components/dashboard/widgets";
import type { Kpis } from "@/components/dashboard/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { EstadoBadge, PrioridadBadge, fmtDate } from "@/components/status-badges";
import type { Tarea } from "@/components/dashboard/types";
import { cn } from "@/lib/utils";

export type Slice = { label: string; value: number; color: string };

export type AssigneeMetric = {
  Per_Cod: number;
  Nombre: string;
  total: number;
  completadas: number;
  proceso: number;
  pendientes: number;
  avance_promedio: number;
  cumplimiento?: number;
};

export function ManagerKpisWidget({ kpis }: { kpis: Kpis | null }) {
  return (
    <div className="grid h-full grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      <MetricCard compact label="Total" value={kpis?.total ?? "—"} tone="info" />
      <MetricCard compact label="Finalizadas" value={kpis?.completadas ?? "—"} tone="success" />
      <MetricCard compact label="En proceso" value={kpis?.proceso ?? "—"} tone="default" />
      <MetricCard compact label="Pendientes" value={kpis?.pendientes ?? "—"} tone="muted" />
      <MetricCard compact label="Atrasadas" value={kpis?.atrasadas ?? "—"} tone="danger" />
      <MetricCard
        compact
        label="Cumplimiento"
        value={kpis ? `${kpis.tasa_cumplimiento}%` : "—"}
        hint={kpis ? `Avance ${kpis.avance_promedio}%` : undefined}
        tone="info"
      />
    </div>
  );
}

export function ChartEstadoWidget({
  slices,
  total,
  centerLabel = "tareas",
}: {
  slices: Slice[];
  total: number;
  centerLabel?: string;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-2 overflow-hidden sm:flex-row sm:items-center sm:justify-start sm:gap-3">
      <div className="shrink-0">
        <DonutChart slices={slices} size={118} thickness={18} centerValue={total} centerLabel={centerLabel} />
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <ChartLegend slices={slices} />
      </div>
    </div>
  );
}

export function EquipoColaWidget({
  online,
  ausente,
  offline,
  sinAsignar,
  ticketsNuevos,
}: {
  online: number;
  ausente: number;
  offline: number;
  sinAsignar: number;
  ticketsNuevos: number;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 overflow-hidden">
      <div className="flex shrink-0 flex-wrap gap-1.5">
        <Badge variant="success">{online} online</Badge>
        <Badge variant="warning">{ausente} ausente</Badge>
        <Badge variant="muted">{offline} off</Badge>
      </div>
      <div className="min-h-0 flex-1 rounded-lg border border-border/60 bg-muted/30 px-2.5 py-2">
        <div className="text-[10px] font-bold uppercase text-muted-foreground">Sin asignar</div>
        <div className="mt-0.5 text-xl font-bold tabular-nums leading-none">{sinAsignar}</div>
      </div>
      <div className="min-h-0 flex-1 rounded-lg border border-amber-200 bg-amber-50/60 px-2.5 py-2">
        <div className="text-[10px] font-bold uppercase text-amber-800">Tickets nuevos</div>
        <div className="mt-0.5 text-xl font-bold tabular-nums leading-none text-amber-900">{ticketsNuevos}</div>
        <Link href="/tickets" className="mt-1 inline-flex text-[10px] font-bold text-amber-800 hover:underline">
          Ver bandeja →
        </Link>
      </div>
    </div>
  );
}

export function CargaAsignadoWidget({ rows }: { rows: AssigneeMetric[] }) {
  return (
    <div className="h-full min-h-0 overflow-hidden">
      <BarChart
        items={rows.slice(0, 6).map((a) => ({
          label: a.Nombre.split(" ").slice(0, 2).join(" "),
          value: a.total,
        }))}
      />
    </div>
  );
}

export function AvancePersonaWidget({ rows }: { rows: AssigneeMetric[] }) {
  const visible = rows.slice(0, 4);
  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 overflow-hidden">
      {visible.map((a) => (
        <div key={a.Per_Cod} className="min-h-0 shrink rounded-lg border border-border/60 px-2.5 py-1.5">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="truncate text-xs font-semibold">{a.Nombre}</span>
            <span className="shrink-0 text-[11px] font-bold tabular-nums text-sky-700">{a.avance_promedio}%</span>
          </div>
          <Progress value={a.avance_promedio} className="h-1.5" />
          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
            <span>{a.total} tot</span>
            <span className="text-emerald-600">{a.completadas} ok</span>
            <span className="text-sky-600">{a.proceso} proc</span>
            <span>{a.pendientes} pend</span>
          </div>
        </div>
      ))}
      {rows.length === 0 && (
        <p className="py-6 text-center text-xs text-muted-foreground">Sin asignaciones</p>
      )}
      {rows.length > visible.length && (
        <p className="shrink-0 text-[10px] text-muted-foreground">+{rows.length - visible.length} mas</p>
      )}
    </div>
  );
}

export function ManagerAccesosWidget({ ticketsNuevos }: { ticketsNuevos: number }) {
  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-1.5 overflow-hidden">
      <Button type="button" variant="outline" size="sm" className="h-9 w-full min-w-0 justify-start gap-2 px-2.5" asChild>
        <Link href="/tareas" className="min-w-0">
          <ClipboardList className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-left">Ir a tareas</span>
          <ArrowRight className="size-3.5 shrink-0 opacity-60" />
        </Link>
      </Button>
      <Button type="button" variant="outline" size="sm" className="h-9 w-full min-w-0 justify-start gap-2 px-2.5" asChild>
        <Link href="/tickets" className="min-w-0">
          <Ticket className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-left">Tickets</span>
          {ticketsNuevos > 0 && (
            <Badge variant="danger" className="h-5 shrink-0 px-1.5 text-[10px]">
              {ticketsNuevos}
            </Badge>
          )}
          <ArrowRight className="size-3.5 shrink-0 opacity-60" />
        </Link>
      </Button>
      <Button type="button" variant="outline" size="sm" className="h-9 w-full min-w-0 justify-start gap-2 px-2.5" asChild>
        <Link href="/monitoreo" className="min-w-0">
          <Users className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-left">Monitoreo</span>
          <ArrowRight className="size-3.5 shrink-0 opacity-60" />
        </Link>
      </Button>
    </div>
  );
}

export function DevKpisWidget({
  total,
  tareas,
  tickets,
  ticketsAbiertos,
  completadas,
  proceso,
  atrasadas,
  abiertas,
}: {
  total: number;
  tareas: number;
  tickets: number;
  ticketsAbiertos: number;
  completadas: number;
  proceso: number;
  atrasadas: number;
  abiertas: number;
}) {
  return (
    <div className="grid h-full grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      <MetricCard compact label="Total asignado" value={total} tone="info" />
      <MetricCard compact label="Tareas" value={tareas} tone="default" />
      <MetricCard
        compact
        label="Tickets"
        value={tickets}
        hint={ticketsAbiertos ? `${ticketsAbiertos} abiertos` : undefined}
        tone="warning"
      />
      <MetricCard compact label="Finalizadas" value={completadas} tone="success" />
      <MetricCard compact label="En proceso" value={proceso} tone="default" />
      <MetricCard
        compact
        label="Atrasadas"
        value={atrasadas}
        hint={`${abiertas} abiertas`}
        tone={atrasadas > 0 ? "danger" : "muted"}
      />
    </div>
  );
}

export function DevKpisExtraWidget({
  avance,
  cumplimiento,
  avancesPeriodo,
  tareasTocadas,
  horasActivas,
  horasReportadas,
  periodo,
}: {
  avance: string;
  cumplimiento: string;
  avancesPeriodo: number;
  tareasTocadas: number;
  horasActivas: string | number;
  horasReportadas: string | number;
  periodo: number;
}) {
  return (
    <div className="grid h-full grid-cols-2 gap-2 md:grid-cols-4">
      <MetricCard compact label="Avance medio" value={avance} tone="info" />
      <MetricCard compact label="Cumplimiento" value={cumplimiento} tone="success" />
      <MetricCard
        compact
        label={`Avances (${periodo}d)`}
        value={avancesPeriodo}
        hint={`${tareasTocadas} tarea(s)`}
        tone="info"
      />
      <MetricCard
        compact
        label="Horas activas"
        value={`${horasActivas} h`}
        hint={`${horasReportadas} h reportadas`}
        tone="default"
      />
    </div>
  );
}

export function ColaPersonalWidget({
  abiertas,
  ticketsAbiertos,
  atrasadas,
}: {
  abiertas: number;
  ticketsAbiertos: number;
  atrasadas: number;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 overflow-hidden">
      <div className="min-h-0 flex-1 rounded-lg border border-border/60 bg-muted/30 px-2.5 py-2">
        <div className="text-[10px] font-bold uppercase text-muted-foreground">Abiertas</div>
        <div className="mt-0.5 text-xl font-bold tabular-nums leading-none">{abiertas}</div>
      </div>
      <div className="min-h-0 flex-1 rounded-lg border border-amber-200 bg-amber-50/60 px-2.5 py-2">
        <div className="text-[10px] font-bold uppercase text-amber-800">Tickets abiertos</div>
        <div className="mt-0.5 text-xl font-bold tabular-nums leading-none text-amber-900">{ticketsAbiertos}</div>
        <Link href="/mis-tareas" className="mt-1 inline-flex text-[10px] font-bold text-amber-800 hover:underline">
          Gestionar →
        </Link>
      </div>
      <div className="min-h-0 flex-1 rounded-lg border border-red-200 bg-red-50/50 px-2.5 py-2">
        <div className="text-[10px] font-bold uppercase text-red-800">Atrasadas</div>
        <div className="mt-0.5 text-xl font-bold tabular-nums leading-none text-red-900">{atrasadas}</div>
      </div>
    </div>
  );
}

export function DevAccesosWidget({ onReporte }: { onReporte?: () => void }) {
  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-1.5 overflow-hidden">
      <Button type="button" variant="outline" size="sm" className="h-9 w-full min-w-0 justify-start gap-2 px-2.5" asChild>
        <Link href="/mis-tareas" className="min-w-0">
          <ClipboardList className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-left">Mis tareas</span>
          <ArrowRight className="size-3.5 shrink-0 opacity-60" />
        </Link>
      </Button>
      {onReporte && (
        <Button type="button" variant="secondary" size="sm" className="h-9 w-full justify-start px-2.5" onClick={onReporte}>
          Generar reporte
        </Button>
      )}
    </div>
  );
}

export function MisAtrasadasWidget({
  tareas,
  onOpen,
}: {
  tareas: Tarea[];
  onOpen?: (t: Tarea) => void;
}) {
  const visible = tareas.slice(0, 5);
  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 overflow-hidden">
      {visible.map((t) => (
        <button
          key={t.Tar_Cod}
          type="button"
          onClick={() => onOpen?.(t)}
          className={cn(
            "w-full min-w-0 shrink-0 overflow-hidden rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-left hover:bg-muted/40",
            onOpen && "cursor-pointer"
          )}
        >
          <div className="truncate text-xs font-semibold">{t.Tar_Titulo}</div>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1">
            <PrioridadBadge prioridad={t.Tar_Prioridad} />
            <EstadoBadge estado={t.Tar_Estado} />
            <span className="truncate text-[10px] text-red-600">{fmtDate(t.Tar_Fecha_Fin)}</span>
          </div>
        </button>
      ))}
      {tareas.length === 0 && (
        <p className="py-6 text-center text-xs text-muted-foreground">Sin atrasadas</p>
      )}
      {tareas.length > visible.length && (
        <p className="shrink-0 text-[10px] text-muted-foreground">+{tareas.length - visible.length} mas</p>
      )}
    </div>
  );
}

export { OverallWidget, CumplimientoWidget, ActividadWidget };
