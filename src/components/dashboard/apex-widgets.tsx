"use client";

import {
  ApexDonutChart,
  TeamBarsChart,
  TeamRadarChart,
  TeamWaveChart,
} from "@/components/charts/apex-team-charts";
import type { AssigneeMetric, TeamDayPoint } from "@/lib/dashboard";
import type { Slice } from "@/components/dashboard/metric-widgets";

export function RendimientoOndaWidget({ serie }: { serie: TeamDayPoint[] }) {
  const totalAvances = serie.reduce((s, d) => s + d.avances, 0);
  const totalHechas = serie.reduce((s, d) => s + d.completadas, 0);
  const diasConDatos = serie.filter((d) => d.avances > 0 || d.completadas > 0).length;
  return (
    <div className="flex h-full min-h-0 flex-col gap-1 overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-full bg-sky-600" />
          <strong className="text-sky-700">{totalAvances}</strong> avances
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-full bg-emerald-600" />
          <strong className="text-emerald-700">{totalHechas}</strong> completadas
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-full bg-red-700" />
          avance %
        </span>
        <span className="text-muted-foreground/80">
          {diasConDatos ? `${diasConDatos} dia(s) con actividad` : "sin actividad en el rango"}
        </span>
      </div>
      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0">
          <TeamWaveChart serie={serie} height="100%" />
        </div>
      </div>
    </div>
  );
}

export function RendimientoBarrasWidget({ rows }: { rows: AssigneeMetric[] }) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <p className="mb-1 shrink-0 text-[10px] text-muted-foreground">
        Carga por persona · total / hechas / proceso
      </p>
      <div className="min-h-0 flex-1">
        <TeamBarsChart rows={rows} height={250} />
      </div>
    </div>
  );
}

export function RendimientoRadarWidget({ rows }: { rows: AssigneeMetric[] }) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <p className="mb-1 shrink-0 text-[10px] text-muted-foreground">
        Comparativa relativa (top 5) · % normalizado
      </p>
      <div className="min-h-0 flex-1">
        <TeamRadarChart rows={rows} height={260} />
      </div>
    </div>
  );
}

export function ApexEstadoWidget({
  slices,
  centerLabel = "tareas",
}: {
  slices: Slice[];
  centerLabel?: string;
}) {
  return (
    <div className="h-full min-h-0 overflow-hidden">
      <ApexDonutChart slices={slices} height={230} centerLabel={centerLabel} />
    </div>
  );
}
