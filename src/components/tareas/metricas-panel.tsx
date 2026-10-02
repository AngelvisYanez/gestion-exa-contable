"use client";

import { AlertTriangle, Flame } from "lucide-react";
import type { Tarea } from "@/components/dashboard/types";
import { KpiCarousel } from "@/components/kpi-carousel";
import { Card } from "@/components/ui/card";
import { DIAS_SIN_ACTUALIZAR, diasDesde, type Metricas } from "@/lib/metricas-avance";

export function MetricasPanel({
  m,
  onOpenTarea,
  compact,
}: {
  m: Metricas;
  onOpenTarea: (t: Tarea) => void;
  /** Sin scroll ni tarjetas anidadas (widgets del dashboard). */
  compact?: boolean;
}) {
  const maxPuntos = Math.max(1, ...m.serie.map((d) => d.puntos));
  const maxAvances = Math.max(1, ...m.serie.map((d) => d.avances));
  const sinAct = m.sinActualizar.slice(0, compact ? 4 : 8);

  if (compact) {
    return (
      <div className="flex h-full flex-col gap-2 overflow-hidden">
        <div className="grid shrink-0 grid-cols-3 gap-1.5">
          <div className="rounded-lg border border-border/60 bg-muted/20 px-2 py-1.5">
            <div className="text-[9px] font-bold uppercase text-muted-foreground">Avances</div>
            <div className="text-lg font-bold tabular-nums text-sky-700">{m.avances}</div>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/20 px-2 py-1.5">
            <div className="text-[9px] font-bold uppercase text-muted-foreground">Progreso</div>
            <div className="text-lg font-bold tabular-nums text-emerald-600">+{m.puntos}</div>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/20 px-2 py-1.5">
            <div className="text-[9px] font-bold uppercase text-muted-foreground">Horas</div>
            <div className="text-lg font-bold tabular-nums">{m.horasActivas}</div>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 items-end gap-0.5 overflow-hidden">
          {m.serie.map((d) => (
            <div
              key={d.dia}
              className="flex h-full flex-1 flex-col items-center justify-end gap-0.5"
              title={`${d.dia}: ${d.avances} avance(s), +${d.puntos} pts`}
            >
              <div className="flex h-full w-full items-end justify-center gap-px">
                <div
                  className="w-1/2 rounded-t-sm bg-emerald-500/90"
                  style={{ height: `${(d.puntos / maxPuntos) * 100}%`, minHeight: d.puntos ? 2 : 0 }}
                />
                <div
                  className="w-1/2 rounded-t-sm bg-sky-400/90"
                  style={{ height: `${(d.avances / maxAvances) * 100}%`, minHeight: d.avances ? 2 : 0 }}
                />
              </div>
            </div>
          ))}
        </div>
        {sinAct.length > 0 && (
          <div className="shrink-0 space-y-1 overflow-hidden border-t border-border/60 pt-2">
            <div className="text-[10px] font-bold uppercase text-amber-700">
              Sin actualizar ({DIAS_SIN_ACTUALIZAR}+ d)
            </div>
            {sinAct.map((t) => {
              const d = diasDesde(t.Ava_Ultima_Fecha);
              return (
                <button
                  key={t.Tar_Cod}
                  type="button"
                  onClick={() => onOpenTarea(t)}
                  className="flex w-full items-center justify-between gap-2 truncate text-left text-[11px] hover:underline"
                >
                  <span className="truncate font-semibold">
                    #{t.Tar_Cod} {t.Tar_Titulo}
                  </span>
                  <span className="shrink-0 text-amber-700">{d == null ? "nunca" : `${d}d`}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const kpiItems = [
    {
      label: `Avances (${m.dias}d)`,
      value: m.avances,
      hint: `${m.tareasTocadas} tarea(s) trabajadas`,
      tone: "info" as const,
    },
    {
      label: "Progreso ganado",
      value: `+${m.puntos}`,
      hint: "puntos porcentuales",
      tone: "success" as const,
    },
    {
      label: "Dias activos",
      value: `${m.diasActivos}/${m.dias}`,
      hint: m.racha ? `Racha: ${m.racha} dia(s) seguidos` : "Sin racha activa",
      tone: (m.diasActivos >= Math.ceil(m.dias * 0.6) ? "success" : "warning") as "success" | "warning",
    },
    {
      label: "Evidencias",
      value: m.evidencias,
      hint: `${m.coberturaEvidencia}% de avances con evidencia`,
      tone: (m.coberturaEvidencia >= 70
        ? "success"
        : m.coberturaEvidencia >= 30
          ? "warning"
          : "danger") as "success" | "warning" | "danger",
    },
    {
      label: "Horas",
      value: m.horasReportadas,
      hint: `Reportadas · ${m.horasActivas} h medidas por ExaMonitor`,
      tone: "default" as const,
    },
    {
      label: "A tiempo",
      value: m.aTiempoPct == null ? "—" : `${m.aTiempoPct}%`,
      hint: `${m.finalizadasPeriodo} finalizada(s) en el periodo`,
      tone: (m.aTiempoPct == null ? "muted" : m.aTiempoPct >= 80 ? "success" : "warning") as
        | "muted"
        | "success"
        | "warning",
    },
  ];

  return (
    <div className="space-y-3 overflow-hidden">
      <KpiCarousel items={kpiItems} />

      <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
        <Card className="overflow-hidden p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold">Actividad de los ultimos 14 dias</h3>
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <span className="size-2 rounded-sm bg-emerald-500" /> Progreso
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="size-2 rounded-sm bg-sky-400" /> Avances
              </span>
              {m.racha > 1 && (
                <span className="inline-flex items-center gap-1 font-bold text-orange-600">
                  <Flame className="size-3" /> {m.racha}
                </span>
              )}
            </div>
          </div>
          <div className="flex h-28 items-end gap-1">
            {m.serie.map((d) => (
              <div
                key={d.dia}
                className="flex h-full flex-1 flex-col items-center justify-end gap-0.5"
                title={`${d.dia}: ${d.avances} avance(s), +${d.puntos} pts, ${d.minutos} min activos`}
              >
                <div className="flex h-full w-full items-end justify-center gap-[2px]">
                  <div
                    className="w-1/2 rounded-t-sm bg-emerald-500/90"
                    style={{ height: `${(d.puntos / maxPuntos) * 100}%`, minHeight: d.puntos ? 3 : 0 }}
                  />
                  <div
                    className="w-1/2 rounded-t-sm bg-sky-400/90"
                    style={{ height: `${(d.avances / maxAvances) * 100}%`, minHeight: d.avances ? 3 : 0 }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-1">
            {m.serie.map((d, i) => (
              <div key={d.dia} className="flex-1 truncate text-center text-[9px] text-muted-foreground">
                {i % 2 === 0 || i === m.serie.length - 1 ? d.label : ""}
              </div>
            ))}
          </div>
        </Card>

        <Card className="overflow-hidden p-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold">
            <AlertTriangle className="size-4 text-amber-600" />
            Sin actualizar ({DIAS_SIN_ACTUALIZAR}+ dias)
          </h3>
          {m.sinActualizar.length === 0 ? (
            <p className="py-4 text-center text-xs text-emerald-700">Todas tus tareas abiertas estan al dia.</p>
          ) : (
            <ul className="space-y-1 overflow-hidden">
              {sinAct.map((t) => {
                const d = diasDesde(t.Ava_Ultima_Fecha);
                return (
                  <li key={t.Tar_Cod}>
                    <button
                      type="button"
                      onClick={() => onOpenTarea(t)}
                      className="flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-muted"
                    >
                      <span className="min-w-0 truncate font-semibold">
                        #{t.Tar_Cod} {t.Tar_Titulo}
                      </span>
                      <span className="shrink-0 text-[10px] font-bold text-amber-700">
                        {d == null ? "nunca" : `${d} d`}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
