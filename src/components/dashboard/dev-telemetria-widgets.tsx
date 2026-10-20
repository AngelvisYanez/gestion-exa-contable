"use client";

import { MetricCard } from "@/components/charts/simple-charts";
import { cn } from "@/lib/utils";
import type { TelemetriaPersonal } from "@/lib/tareas";

function tone(v: number, bueno: number, regular: number): string {
  if (v >= bueno) return "text-emerald-700";
  if (v >= regular) return "text-amber-700";
  return "text-red-700";
}

function minutosLabel(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.round((min / 60) * 10) / 10;
  return `${h} h`;
}

/** Tu tiempo activo medido por ExaMonitor + indice de actividad. */
export function DevTelemetriaKpisWidget({ tel }: { tel: TelemetriaPersonal }) {
  const sinDatos = tel.registros === 0;
  if (sinDatos) {
    return (
      <p className="flex h-full items-center justify-center text-center text-xs text-muted-foreground">
        Aun no hay telemetria de ExaMonitor en este periodo.
        <br />
        El agente debe estar activo con tu usuario vinculado.
      </p>
    );
  }
  return (
    <div className="grid h-auto grid-cols-1 gap-2 min-[380px]:grid-cols-2 md:grid-cols-4 lg:h-full">
      <MetricCard compact label="Tiempo activo" value={`${tel.horasActivas} h`} hint={`${tel.registros} registros`} tone="info" />
      <MetricCard
        compact
        label="Indice de actividad"
        value={`${tel.actividad}%`}
        hint="Tel_Porc_Actividad"
        tone={tel.actividad >= 60 ? "success" : tel.actividad >= 30 ? "warning" : "danger"}
      />
      <MetricCard compact label="Clicks" value={tel.clicks.toLocaleString("es-EC")} tone="default" />
      <MetricCard compact label="Teclas / lineas" value={`${tel.teclas.toLocaleString("es-EC")} / ${tel.lineas.toLocaleString("es-EC")}`} tone="default" />
    </div>
  );
}

/** Horas activas por tarea (top). */
export function DevHorasTareaWidget({
  tel,
  tituloPorTar,
}: {
  tel: TelemetriaPersonal;
  tituloPorTar?: Record<number, string>;
}) {
  if (!tel.porTarea.length) {
    return (
      <p className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Sin tiempo medido por tarea en el periodo
      </p>
    );
  }
  const max = Math.max(1, ...tel.porTarea.map((t) => t.minutos));
  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 overflow-y-auto pr-0.5">
      {tel.porTarea.map((t) => (
        <div key={t.Tar_Cod} className="shrink-0">
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-[11px] font-semibold">
              #{t.Tar_Cod} {tituloPorTar?.[t.Tar_Cod] ? `· ${tituloPorTar[t.Tar_Cod]}` : ""}
            </span>
            <span className="shrink-0 text-xs font-bold tabular-nums text-muted-foreground">
              {minutosLabel(t.minutos)}
            </span>
          </div>
          <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-sky-500"
              style={{ width: `${Math.round((t.minutos / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** En que trabajaste: proceso/ventana mas frecuente. */
export function DevProcesosWidget({ tel }: { tel: TelemetriaPersonal }) {
  if (!tel.procesos.length) {
    return (
      <p className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Sin procesos registrados en el periodo
      </p>
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 overflow-y-auto pr-0.5">
      {tel.procesos.map((p, i) => (
        <div key={`${p.nombre}-${i}`} className="shrink-0 rounded-lg border border-border/60 px-2.5 py-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-[11px] font-semibold">
              {p.es_ide && (
                <span className="mr-1 rounded bg-violet-100 px-1 py-0.5 text-[9px] font-bold text-violet-800">
                  IDE
                </span>
              )}
              {p.nombre}
            </span>
            <span className="shrink-0 text-xs font-bold tabular-nums text-muted-foreground">
              {p.porcentaje}%
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-violet-500" style={{ width: `${p.porcentaje}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Adherencia a tu horario laboral configurado. */
export function DevHorarioWidget({ tel }: { tel: TelemetriaPersonal }) {
  const h = tel.horario;
  if (!h.activo || !h.hora_inicio) {
    return (
      <p className="flex h-full items-center justify-center text-center text-xs text-muted-foreground">
        No tienes horario laboral configurado.
        <br />
        Tu encargado puede activarlo en Monitoreo.
      </p>
    );
  }
  if (!h.registros) {
    return (
      <p className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Sin actividad medida en el periodo
      </p>
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-3">
      <div className="text-center">
        <div className={cn("text-3xl font-bold tabular-nums leading-none", tone(h.pct, 80, 50))}>
          {h.pct}%
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">
          dentro de tu horario {h.hora_inicio}-{h.hora_fin}
        </div>
      </div>
      <div className="flex items-center justify-center gap-4 text-[11px] text-muted-foreground">
        <span className="text-emerald-600">
          Dentro: <strong className="text-foreground">{h.dentro}</strong>
        </span>
        <span className="text-amber-600">
          Fuera: <strong className="text-foreground">{h.registros - h.dentro}</strong>
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${h.pct}%` }} />
      </div>
    </div>
  );
}
