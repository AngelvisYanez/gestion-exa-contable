"use client";

import { useState } from "react";
import {
  ApexDonutChart,
  ApoyoRankingChart,
  PlazoComparativaChart,
  TeamBarsChart,
  TeamRadarChart,
  TeamWaveChart,
  type ComparativaMetricKey,
} from "@/components/charts/apex-team-charts";
import type { ApoyoDev, AssigneeMetric, ComparativaDev, TeamDayPoint } from "@/lib/dashboard";
import type { Slice } from "@/components/dashboard/metric-widgets";
import { cn } from "@/lib/utils";

const COMPARATIVA_METRICS: Array<{
  key: ComparativaMetricKey;
  label: string;
  hint: string;
}> = [
  { key: "cumplimiento", label: "Cumplimiento", hint: "% de tareas finalizadas" },
  { key: "avance_promedio", label: "Avance %", hint: "Promedio del % de avance" },
  { key: "avances_dia", label: "Avances/dia", hint: "Avances registrados por dia del rango" },
  { key: "completadas_dia", label: "Completadas/dia", hint: "Tareas culminadas por dia del rango" },
  { key: "apoyos", label: "Apoyos", hint: "Tareas en las que apoyo a un companero" },
  { key: "total", label: "Tareas", hint: "Total de tareas del plazo" },
];

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

function pctTone(v: number) {
  if (v >= 80) return "text-emerald-700";
  if (v >= 50) return "text-amber-700";
  return "text-red-700";
}

/** Comparativa de rendimiento por plazo de tarea (diaria / semanal / mensual). */
export function ComparativaRendimientoWidget({ rows }: { rows: ComparativaDev[] }) {
  const [metric, setMetric] = useState<ComparativaMetricKey>("cumplimiento");
  const activo = COMPARATIVA_METRICS.find((m) => m.key === metric) || COMPARATIVA_METRICS[0];

  const totales = (["Diaria", "Semanal", "Mensual", "Sin fechas"] as const)
    .map((plazo) => {
      let total = 0;
      let cumplimientoSum = 0;
      let devs = 0;
      for (const r of rows) {
        const c = r.categorias[plazo];
        if (!c || c.total <= 0) continue;
        total += c.total;
        cumplimientoSum += c.cumplimiento;
        devs++;
      }
      return {
        plazo,
        total,
        cumplimiento: devs ? Math.round(cumplimientoSum / devs) : 0,
      };
    })
    .filter((t) => t.total > 0 || t.plazo !== "Sin fechas");

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-1">
        {COMPARATIVA_METRICS.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMetric(m.key)}
            title={m.hint}
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] font-bold transition-colors",
              metric === m.key
                ? "border-sky-600 bg-sky-600 text-white"
                : "border-border bg-muted/40 text-muted-foreground hover:text-foreground"
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
        {totales.map((t) => (
          <span key={t.plazo} className="inline-flex items-center gap-1">
            <strong className={t.total ? "text-foreground" : ""}>{t.plazo}</strong>
            {t.total} tarea(s)
            {t.total > 0 && (
              <span className={cn("font-bold", pctTone(t.cumplimiento))}>{t.cumplimiento}%</span>
            )}
          </span>
        ))}
        <span className="text-muted-foreground/80">· {activo.hint}</span>
      </div>
      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0">
          <PlazoComparativaChart rows={rows} metric={metric} height="100%" />
        </div>
      </div>
    </div>
  );
}

/** Ranking de quien mas apoyo en las tareas del rango (apilado por plazo). */
export function ApoyoTareasWidget({ rows }: { rows: ApoyoDev[] }) {
  const total = rows.reduce((s, r) => s + r.total, 0);
  const lider = rows[0];
  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-full bg-amber-500" />
          <strong className="text-foreground">{total}</strong> apoyo(s) registrados
        </span>
        {lider && (
          <span className="inline-flex items-center gap-1">
            <strong className="text-foreground">Mas apoyo:</strong> {lider.Nombre}
            <span className="font-bold text-amber-700">({lider.total})</span>
          </span>
        )}
      </div>
      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0">
          <ApoyoRankingChart rows={rows} height="100%" />
        </div>
      </div>
    </div>
  );
}
