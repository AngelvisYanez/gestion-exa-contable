"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { MetricCard, BarChart } from "@/components/charts/simple-charts";
import { PrioridadBadge, fmtDate } from "@/components/status-badges";
import { cn } from "@/lib/utils";
import { plazoVariant, type CategoriaPlazo } from "@/lib/plazo-tarea";
import type {
  TareaAtrasada,
  CicloMetric,
  PuntualidadMetric,
  StandbyMetric,
  BacklogMetric,
  CreadorEjecutorRow,
  CargaJustaMetric,
  ReaperturaMetric,
  ComplejidadMetric,
  EsfuerzoDev,
  HorasTareaRow,
  ProcesoActivoRow,
  HorarioAdherenciaRow,
  AvanceSinActividadMetric,
  BaseComparativaRow,
} from "@/lib/dashboard";

function tone(v: number, bueno: number, regular: number, invertido = false): string {
  const score = invertido ? -v : v;
  const b = invertido ? -bueno : bueno;
  const r = invertido ? -regular : regular;
  if (score >= b) return "text-emerald-700";
  if (score >= r) return "text-amber-700";
  return "text-red-700";
}

function nombreCorto(nombre: string) {
  return nombre.split(" ").slice(0, 2).join(" ");
}

function PlazoLabel({ plazo }: { plazo: CategoriaPlazo }) {
  return (
    <Badge variant={plazoVariant(plazo)} title="Plazo estimado por la duracion de la tarea">
      {plazo === "Sin fechas" ? "Sin fecha" : plazo}
    </Badge>
  );
}
/** Tareas vencidas con dias de retraso y responsables. */
export function AtrasadasDetalleWidget({ tareas }: { tareas: TareaAtrasada[] }) {
  if (!tareas.length) {
    return (
      <p className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Sin tareas atrasadas en el rango
      </p>
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 overflow-hidden">
      <p className="shrink-0 text-[10px] text-muted-foreground">
        {tareas.length} vencida(s) · ordenadas por retraso
      </p>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5">
        {tareas.map((t) => (
          <div key={t.Tar_Cod} className="shrink-0 rounded-lg border border-red-200/70 bg-red-50/40 px-2.5 py-1.5">
            <div className="flex items-start justify-between gap-2">
              <span className="line-clamp-2 text-xs font-semibold">{t.Tar_Titulo}</span>
              <span className="shrink-0 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white tabular-nums">
                +{t.dias_retraso}d
              </span>
            </div>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1">
              <PrioridadBadge prioridad={t.Tar_Prioridad} />
              <PlazoLabel plazo={t.plazo} />
              <span className="truncate text-[10px] text-muted-foreground">{fmtDate(t.Fecha_Fin)}</span>
              <span className="truncate text-[10px] text-sky-700">{t.porcentaje}%</span>
            </div>
            <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{t.asignados}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Tiempo de ciclo: dias inicio -> culminacion. */
export function CicloWidget({ ciclo }: { ciclo: CicloMetric }) {
  const plazos = (["Diaria", "Semanal", "Mensual"] as const).filter(
    (p) => ciclo.por_plazo[p].muestra > 0
  );
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden">
      <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricCard compact label="Ciclo prom." value={`${ciclo.promedio_dias} d`} tone="info" />
        <MetricCard compact label="Mediana" value={`${ciclo.mediana_dias} d`} tone="default" />
        <MetricCard compact label="Min / Max" value={`${ciclo.minimo_dias} / ${ciclo.maximo_dias}`} tone="muted" />
        <MetricCard compact label="Muestra" value={ciclo.muestra} tone="default" />
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5">
        {plazos.length === 0 && (
          <p className="py-6 text-center text-xs text-muted-foreground">
            Sin tareas finalizadas con fechas completas
          </p>
        )}
        {plazos.map((p) => (
          <div key={p} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-2.5 py-1.5">
            <PlazoLabel plazo={p} />
            <span className="text-[11px] text-muted-foreground">
              {ciclo.por_plazo[p].muestra} tarea(s)
            </span>
            <strong className="text-xs tabular-nums text-sky-700">
              {ciclo.por_plazo[p].promedio_dias} d
            </strong>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Puntualidad: culminadas antes o el dia comprometido. */
export function PuntualidadWidget({ puntualidad }: { puntualidad: PuntualidadMetric }) {
  const plazos = (["Diaria", "Semanal", "Mensual"] as const).filter(
    (p) => puntualidad.por_plazo[p].muestra > 0
  );
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden">
      <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricCard
          compact
          label="A tiempo"
          value={`${puntualidad.pct}%`}
          tone={puntualidad.pct >= 80 ? "success" : puntualidad.pct >= 50 ? "warning" : "danger"}
        />
        <MetricCard compact label="A tiempo" value={puntualidad.a_tiempo} tone="success" />
        <MetricCard compact label="Tarde" value={puntualidad.tarde} tone="danger" />
        <MetricCard
          compact
          label="Desvio prom."
          value={`${puntualidad.desvio_promedio > 0 ? "+" : ""}${puntualidad.desvio_promedio} d`}
          tone={puntualidad.desvio_promedio <= 0 ? "success" : "warning"}
        />
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5">
        {plazos.length === 0 && (
          <p className="py-6 text-center text-xs text-muted-foreground">
            Sin entregas comparables en el rango
          </p>
        )}
        {plazos.map((p) => {
          const v = puntualidad.por_plazo[p];
          return (
            <div key={p} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-2.5 py-1.5">
              <PlazoLabel plazo={p} />
              <span className="text-[11px] text-muted-foreground">
                {v.a_tiempo}/{v.muestra} a tiempo
              </span>
              <strong className={cn("text-xs tabular-nums", tone(v.pct, 80, 50))}>{v.pct}%</strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Tareas en standby (sin fecha fin) y su antiguedad. */
export function StandbyWidget({ standby }: { standby: StandbyMetric }) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden">
      <div className="grid shrink-0 grid-cols-2 gap-2">
        <MetricCard compact label="En standby" value={standby.total} tone={standby.total ? "warning" : "muted"} />
        <MetricCard compact label="Antiguedad prom." value={`${standby.antiguedad_promedio} d`} tone="default" />
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5">
        {standby.tareas.length === 0 && (
          <p className="py-6 text-center text-xs text-muted-foreground">
            Ninguna tarea abierta sin fecha fin
          </p>
        )}
        {standby.tareas.map((t) => (
          <div key={t.Tar_Cod} className="shrink-0 rounded-lg border border-amber-200/70 bg-amber-50/40 px-2.5 py-1.5">
            <div className="flex items-start justify-between gap-2">
              <span className="line-clamp-1 text-xs font-semibold">{t.Tar_Titulo}</span>
              <span className="shrink-0 text-[10px] font-bold tabular-nums text-amber-800">{t.dias} d</span>
            </div>
            <div className="mt-1 flex items-center gap-1">
              <PrioridadBadge prioridad={t.Tar_Prioridad} />
              <span className="text-[10px] text-sky-700">{t.porcentaje}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Backlog vs ritmo de cierre con ETA de vaciado. */
export function BacklogWidget({ backlog }: { backlog: BacklogMetric }) {
  return (
    <div className="grid h-full min-h-0 grid-cols-2 gap-2 sm:grid-cols-4">
      <MetricCard compact label="Abiertas" value={backlog.abiertas} tone="info" />
      <MetricCard
        compact
        label={`Cerradas (${backlog.dias_rango}d)`}
        value={backlog.cerradas_rango}
        hint={`${backlog.ritmo_dia}/dia`}
        tone="success"
      />
      <MetricCard
        compact
        label="ETA vaciado"
        value={backlog.eta_dias != null ? `${backlog.eta_dias} d` : "—"}
        hint={backlog.eta_fecha ? fmtDate(backlog.eta_fecha) : "sin ritmo"}
        tone={backlog.eta_dias != null && backlog.eta_dias > 30 ? "warning" : "default"}
      />
      <MetricCard
        compact
        label="Ritmo"
        value={`${backlog.ritmo_dia}`}
        hint="cierres por dia"
        tone="muted"
      />
    </div>
  );
}

/** Quien crea vs quien ejecuta tareas. */
export function CreadorEjecutorWidget({ rows }: { rows: CreadorEjecutorRow[] }) {
  if (!rows.length) {
    return (
      <p className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Sin datos de creador/ejecutor
      </p>
    );
  }
  const visible = rows.slice(0, 8);
  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 overflow-hidden">
      <p className="shrink-0 text-[10px] text-muted-foreground">
        Creadas vs ejecutadas · balance positivo = crea mas de lo que ejecuta
      </p>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5">
        {visible.map((r) => (
          <div key={r.Per_Cod} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-2.5 py-1.5">
            <span className="truncate text-xs font-semibold">{nombreCorto(r.Nombre)}</span>
            <div className="flex shrink-0 items-center gap-2 text-[11px] tabular-nums">
              <span title="Creadas" className="text-sky-700">{r.creadas} cr</span>
              <span title="Ejecutadas" className="text-emerald-700">{r.ejecutadas} ej</span>
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-bold",
                  r.balance > 0 ? "bg-sky-100 text-sky-800" : r.balance < 0 ? "bg-amber-100 text-amber-800" : "bg-muted text-muted-foreground"
                )}
              >
                {r.balance > 0 ? "+" : ""}
                {r.balance}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Equilibrio de carga (desviacion estandar de tareas por persona). */
export function CargaJustaWidget({ carga }: { carga: CargaJustaMetric }) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden">
      <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricCard
          compact
          label="Indice reparto"
          value={`${carga.indice}`}
          hint="100 = perfecto"
          tone={carga.indice >= 70 ? "success" : carga.indice >= 45 ? "warning" : "danger"}
        />
        <MetricCard compact label="Desviacion" value={`±${carga.desviacion}`} tone="default" />
        <MetricCard compact label="Coef. variacion" value={`${carga.coeficiente}%`} tone="muted" />
        <MetricCard compact label="Prom / Max" value={`${carga.promedio} / ${carga.maximo}`} tone="info" />
      </div>
      <div className="min-h-0 flex-1">
        <BarChart
          items={carga.personas.slice(0, 8).map((p) => ({
            label: nombreCorto(p.Nombre),
            value: p.total,
          }))}
        />
      </div>
    </div>
  );
}

/** Tasa de reapertura: avances que retroceden. */
export function ReaperturaWidget({ reapertura }: { reapertura: ReaperturaMetric }) {
  return (
    <div className="grid h-full min-h-0 grid-cols-2 gap-2 sm:grid-cols-4">
      <MetricCard
        compact
        label="Reapertura"
        value={`${reapertura.pct}%`}
        hint="avances con retroceso"
        tone={reapertura.pct <= 5 ? "success" : reapertura.pct <= 15 ? "warning" : "danger"}
      />
      <MetricCard compact label="Retrocesos" value={reapertura.retrocesos} tone="danger" />
      <MetricCard compact label="Tareas" value={reapertura.tareas} tone="warning" />
      <MetricCard compact label="Avances" value={reapertura.avances_total} tone="muted" />
    </div>
  );
}

/** Complejidad de la tarea vs tiempo real de ciclo. */
export function ComplejidadWidget({ complejidad }: { complejidad: ComplejidadMetric }) {
  if (!complejidad.filas.length) {
    return (
      <p className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Sin tareas para comparar complejidad
      </p>
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 overflow-hidden">
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5">
        {complejidad.filas.map((f) => (
          <div key={f.complejidad} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-2.5 py-1.5">
            <span className="truncate text-xs font-semibold">{f.complejidad}</span>
            <div className="flex shrink-0 items-center gap-2 text-[11px] tabular-nums">
              <span title="Tareas finalizadas" className="text-muted-foreground">{f.muestra} fin</span>
              <span title="Ciclo promedio" className="text-sky-700">{f.promedio_dias} d</span>
              <span title="Avance promedio" className="text-emerald-700">{f.avance_promedio}%</span>
              {f.atrasadas > 0 && (
                <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                  {f.atrasadas} atr
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Tiempo activo e indice de actividad por persona (telemetria). */
export function EsfuerzoWidget({ rows }: { rows: EsfuerzoDev[] }) {
  if (!rows.length) {
    return (
      <p className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Sin telemetria en el rango (ExaMonitor)
      </p>
    );
  }
  const visible = rows.slice(0, 8);
  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 overflow-hidden">
      <p className="shrink-0 text-[10px] text-muted-foreground">
        Horas activas e indice de actividad medidos por ExaMonitor
      </p>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5">
        {visible.map((r) => (
          <div key={r.Per_Cod} className="shrink-0 rounded-lg border border-border/60 px-2.5 py-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs font-semibold">{r.Nombre}</span>
              <span className="shrink-0 text-[11px] font-bold tabular-nums text-sky-700">
                {r.horas_activas} h
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
              <span className={cn("font-bold", tone(r.actividad, 60, 30))}>{r.actividad}% act</span>
              <span>{r.tareas} tarea(s)</span>
              <span>{r.clicks.toLocaleString("es-EC")} clicks</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Horas medidas por tarea (telemetria). */
export function HorasTareaWidget({ rows }: { rows: HorasTareaRow[] }) {
  if (!rows.length) {
    return (
      <p className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Sin tiempo medido por tarea en el rango
      </p>
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 overflow-hidden">
      <p className="shrink-0 text-[10px] text-muted-foreground">
        Tiempo activo medido por tarea (top {rows.length})
      </p>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5">
        {rows.map((r) => (
          <div key={r.Tar_Cod} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-2.5 py-1.5">
            <span className="line-clamp-1 text-xs font-semibold">{r.Tar_Titulo}</span>
            <span className="shrink-0 text-[11px] font-bold tabular-nums text-sky-700">
              {r.horas} h
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Proceso/ventana activo mas frecuente en el equipo. */
export function ProcesosWidget({ rows }: { rows: ProcesoActivoRow[] }) {
  if (!rows.length) {
    return (
      <p className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Sin datos de proceso/ventana activa
      </p>
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 overflow-hidden">
      <p className="shrink-0 text-[10px] text-muted-foreground">
        En que trabaja el equipo · proceso/ventana activa
      </p>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5">
        {rows.map((p) => (
          <div key={p.nombre} className="shrink-0">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs font-semibold">
                {p.es_ide && <span className="mr-1 text-[9px] font-bold text-violet-700">IDE</span>}
                {p.nombre}
              </span>
              <span className="shrink-0 text-[11px] font-bold tabular-nums text-muted-foreground">
                {p.porcentaje}%
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full", p.es_ide ? "bg-violet-500" : "bg-sky-500")}
                style={{ width: `${Math.max(2, p.porcentaje)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Adherencia al horario configurado por persona. */
export function HorarioWidget({ rows }: { rows: HorarioAdherenciaRow[] }) {
  if (!rows.length) {
    return (
      <p className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Sin horario laboral configurado o sin actividad
      </p>
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 overflow-hidden">
      <p className="shrink-0 text-[10px] text-muted-foreground">
        Adherencia al horario configurado (Guayaquil)
      </p>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5">
        {rows.map((r) => (
          <div key={r.Per_Cod} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-2.5 py-1.5">
            <div className="min-w-0">
              <span className="truncate text-xs font-semibold">{r.Nombre}</span>
              <span className="ml-1 text-[10px] text-muted-foreground">
                {r.hora_inicio}-{r.hora_fin}
              </span>
            </div>
            <strong className={cn("shrink-0 text-xs tabular-nums", tone(r.pct, 80, 50))}>
              {r.pct}%
            </strong>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Selector de base (EXA vs Servicios) con comparativa de KPIs en el mismo rango. */
export function BasesWidget({ rows }: { rows: BaseComparativaRow[] }) {
  const [sel, setSel] = useState(0);
  if (rows.length <= 1) {
    return (
      <p className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Solo hay una base de tareas configurada
      </p>
    );
  }
  const idx = Math.min(sel, rows.length - 1);
  const actual = rows[idx];
  const maxTotal = Math.max(1, ...rows.map((r) => r.total));
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden">
      <div className="flex shrink-0 flex-wrap gap-1">
        {rows.map((r, i) => (
          <button
            key={r.base}
            type="button"
            onClick={() => setSel(i)}
            className={cn(
              "rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors",
              i === idx
                ? "border-sky-500 bg-sky-50 text-sky-800"
                : "border-border/60 text-muted-foreground hover:bg-muted"
            )}
          >
            {r.label}
            {r.es_actual && <span className="ml-1 text-[9px] font-bold text-sky-600">•</span>}
          </button>
        ))}
      </div>
      <div className="shrink-0 rounded-lg border border-sky-200 bg-sky-50/40 px-2.5 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold">
            {actual.label}
            {actual.es_actual && (
              <span className="ml-1.5 rounded bg-sky-100 px-1 py-0.5 text-[9px] font-bold text-sky-800">
                actual
              </span>
            )}
          </span>
          <span className={cn("shrink-0 text-xs font-bold tabular-nums", tone(actual.tasa_cumplimiento, 70, 40))}>
            {actual.tasa_cumplimiento}% cumpl.
          </span>
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
          <span>Total: <strong className="text-foreground">{actual.total}</strong></span>
          <span className="text-emerald-600">Completadas: <strong>{actual.completadas}</strong></span>
          <span className="text-sky-600">En proceso: <strong>{actual.proceso}</strong></span>
          <span>Pendientes: <strong>{actual.pendientes}</strong></span>
          <span className={actual.atrasadas > 0 ? "text-red-600" : ""}>Atrasadas: <strong>{actual.atrasadas}</strong></span>
          <span>Avance prom.: <strong>{actual.avance_promedio}%</strong></span>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
        {rows.map((r, i) => (
          <button
            key={r.base}
            type="button"
            onClick={() => setSel(i)}
            className={cn(
              "block w-full shrink-0 rounded-lg border px-2.5 py-2 text-left transition-colors",
              i === idx ? "border-sky-400 bg-sky-50/30" : "border-border/60 hover:bg-muted/50"
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold">
                {r.label}
                {r.es_actual && (
                  <span className="rounded bg-sky-100 px-1 py-0.5 text-[9px] font-bold text-sky-800">
                    actual
                  </span>
                )}
              </span>
              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                {r.total} tarea(s)
              </span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-sky-500"
                style={{ width: `${Math.round((r.total / maxTotal) * 100)}%` }}
              />
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
              <span className="text-emerald-600">{r.completadas} ok</span>
              <span className="text-sky-600">{r.proceso} proc</span>
              <span>{r.pendientes} pend</span>
              <span className={r.atrasadas > 0 ? "text-red-600" : ""}>{r.atrasadas} atr</span>
              <span className={cn("font-bold", tone(r.tasa_cumplimiento, 70, 40))}>
                {r.tasa_cumplimiento}% cumpl.
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
export function AvanceSinActividadWidget({ data }: { data: AvanceSinActividadMetric }) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden">
      <div className="grid shrink-0 grid-cols-2 gap-2">
        <MetricCard
          compact
          label="Sin actividad medida"
          value={`${data.pct}%`}
          hint={`${data.sin_actividad} de ${data.con_avance} con avance`}
          tone={data.pct <= 20 ? "success" : data.pct <= 50 ? "warning" : "danger"}
        />
        <MetricCard compact label="Con avance" value={data.con_avance} tone="info" />
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5">
        {data.tareas.length === 0 && (
          <p className="py-6 text-center text-xs text-muted-foreground">
            Toda tarea con avance tiene telemetria
          </p>
        )}
        {data.tareas.map((t) => (
          <div key={t.Tar_Cod} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-2.5 py-1.5">
            <span className="line-clamp-1 text-xs font-semibold">{t.Tar_Titulo}</span>
            <span className="shrink-0 text-[11px] text-sky-700">{t.porcentaje}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
