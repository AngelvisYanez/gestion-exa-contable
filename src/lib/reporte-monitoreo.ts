import type { PrismaClient } from "@prisma/client";
import { endOfDayZona, fechaEnZona, startOfDayZona, toCalendarYmd } from "./timezone";

export type MonitoreoDiaReporte = {
  fecha: string;
  primera_conexion: string | null;
  ultima_senal: string | null;
  /** Only an explicit logout event can populate this field. */
  cierre_sesion: string | null;
  registros: number;
  segundos_activos: number | null;
  actividad: number | null;
  clicks: number | null;
  teclas: number | null;
  lineas: number | null;
  capturas: number | null;
};
export type MonitoreoDesarrolladorReporte = {
  Per_Cod: number;
  Nombre: string;
  registros: number;
  segundos_activos: number | null;
  actividad: number | null;
  clicks: number | null;
  teclas: number | null;
  lineas: number | null;
  capturas: number | null;
  dias: MonitoreoDiaReporte[];
  procesos: Array<{ nombre: string; registros: number; porcentaje: number; es_ide: boolean }>;
};
export type MonitoreoReporte = {
  estado: "disponible" | "parcial" | "no_disponible";
  telemetria_consultada: boolean;
  rango_disponible: { desde: string; hasta: string } | null;
  avisos: string[];
  desarrolladores: MonitoreoDesarrolladorReporte[];
};

type Numeric = number | bigint | string | null;
export type TelemetriaDiaRow = {
  Per_Cod: number; fecha: string; ultima_senal: Date | string | null;
  registros: Numeric; segundos: Numeric; actividad: Numeric;
  clicks: Numeric; teclas: Numeric; lineas: Numeric; capturas: Numeric;
};
export type ConexionReporteRow = { Per_Cod: number; Fecha: Date | string; Primera_Conexion: Date | string };
export type PresenciaReporteRow = { Per_Cod: number; Mon_Ultima_Conexion: Date | string };
export type ProcesoReporteRow = { Per_Cod: number; nombre: string; registros: Numeric; es_ide: Numeric };

const iso = (value: Date | string | null): string | null => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const latest = (a: string | null, b: string | null) => !a ? b : !b ? a : a > b ? a : b;
const n = (value: Numeric) => Math.max(0, Number(value || 0));

/** Pure aggregation; do not infer elapsed working time from the connection span. */
export function buildMonitoreoReporte(opts: {
  personas: Array<{ Per_Cod: number; Nombre: string }>;
  desde: string; hasta: string;
  telemetria: TelemetriaDiaRow[] | null;
  conexiones: ConexionReporteRow[] | null;
  presencias: PresenciaReporteRow[] | null;
  procesos: ProcesoReporteRow[] | null;
  rangoDisponible?: { desde: string; hasta: string } | null;
}): MonitoreoReporte {
  const avisos: string[] = [];
  if (!opts.telemetria) avisos.push("No se pudo consultar la telemetría del período.");
  if (!opts.conexiones) avisos.push("No se pudieron consultar las primeras conexiones diarias.");
  if (!opts.presencias) avisos.push("No se pudo consultar la última señal de presencia.");
  if (!opts.procesos) avisos.push("No se pudo consultar el desglose de procesos.");
  const desarrolladores = opts.personas.map((persona) => {
    const days = new Map<string, MonitoreoDiaReporte>();
    const get = (fecha: string) => {
      if (fecha < opts.desde || fecha > opts.hasta) return null;
      let day = days.get(fecha);
      if (!day) {
        day = { fecha, primera_conexion: null, ultima_senal: null, cierre_sesion: null,
          registros: 0, segundos_activos: null, actividad: null, clicks: null, teclas: null, lineas: null, capturas: null };
        days.set(fecha, day);
      }
      return day;
    };
    for (const row of opts.telemetria || []) {
      if (Number(row.Per_Cod) !== persona.Per_Cod) continue;
      const day = get(row.fecha);
      if (!day) continue;
      day.registros = n(row.registros);
      day.segundos_activos = n(row.segundos);
      day.actividad = row.actividad == null ? null : Number(row.actividad);
      day.clicks = n(row.clicks); day.teclas = n(row.teclas);
      day.lineas = n(row.lineas); day.capturas = n(row.capturas);
      day.ultima_senal = iso(row.ultima_senal);
    }
    for (const row of opts.conexiones || []) {
      if (Number(row.Per_Cod) !== persona.Per_Cod) continue;
      const day = get(toCalendarYmd(row.Fecha));
      if (!day) continue;
      const first = iso(row.Primera_Conexion);
      day.primera_conexion = !day.primera_conexion || (first && first < day.primera_conexion) ? first : day.primera_conexion;
      day.ultima_senal = latest(day.ultima_senal, first);
    }
    for (const row of opts.presencias || []) {
      if (Number(row.Per_Cod) !== persona.Per_Cod) continue;
      const last = iso(row.Mon_Ultima_Conexion);
      if (!last) continue;
      const day = get(fechaEnZona(last));
      if (day) day.ultima_senal = latest(day.ultima_senal, last);
    }
    const dias = [...days.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
    const registros = dias.reduce((sum, day) => sum + day.registros, 0);
    const sum = (key: "segundos_activos" | "clicks" | "teclas" | "lineas" | "capturas") => registros
      ? dias.reduce((s, day) => s + (day[key] || 0), 0) : null;
    const activityRows = dias.filter((day) => day.actividad != null && day.registros > 0);
    const activityCount = activityRows.reduce((s, day) => s + day.registros, 0);
    return { ...persona, registros, segundos_activos: sum("segundos_activos"),
      actividad: activityCount ? Math.round(activityRows.reduce((s, day) => s + day.actividad! * day.registros, 0) / activityCount * 10) / 10 : null,
      clicks: sum("clicks"), teclas: sum("teclas"), lineas: sum("lineas"), capturas: sum("capturas"),
      dias: dias.map((day) => ({ ...day, actividad: day.actividad == null ? null : Math.round(day.actividad * 10) / 10 })),
      procesos: (opts.procesos || []).filter((row) => Number(row.Per_Cod) === persona.Per_Cod)
        .sort((a, b) => n(b.registros) - n(a.registros)).slice(0, 5)
        .map((row) => ({ nombre: row.nombre, registros: n(row.registros),
          porcentaje: registros ? Math.round(n(row.registros) / registros * 1000) / 10 : 0, es_ide: n(row.es_ide) > 0 })),
    };
  });
  return { estado: avisos.length === 4 ? "no_disponible" : avisos.length ? "parcial" : "disponible",
    telemetria_consultada: opts.telemetria !== null, rango_disponible: opts.rangoDisponible || null,
    avisos, desarrolladores };
}

/** Grouped period queries plus telemetry availability for the same team. */
export async function loadMonitoreoReporte(
  prisma: PrismaClient, personas: Array<{ Per_Cod: number; Nombre: string }>, desde: string, hasta: string
): Promise<MonitoreoReporte> {
  if (!personas.length) return { estado: "disponible", telemetria_consultada: true, rango_disponible: null, avisos: [], desarrolladores: [] };
  const ids = [...new Set(personas.map((p) => p.Per_Cod))];
  const marks = ids.map(() => "?").join(",");
  const start = startOfDayZona(desde), end = endOfDayZona(hasta);
  const results = await Promise.allSettled([
    prisma.$queryRawUnsafe<TelemetriaDiaRow[]>(
      `SELECT Per_Cod, DATE_FORMAT(DATE_SUB(Tel_Fecha_Hora, INTERVAL 5 HOUR), '%Y-%m-%d') AS fecha,
              MAX(Tel_Fecha_Hora) AS ultima_senal, COUNT(*) AS registros,
              SUM(Tel_Segundos_Activos) AS segundos, AVG(Tel_Porc_Actividad) AS actividad,
              SUM(Tel_Clicks) AS clicks, SUM(Tel_Teclas) AS teclas, SUM(Tel_Lineas_Estimadas) AS lineas,
              SUM(CASE WHEN Tel_Captura_Ruta IS NOT NULL AND Tel_Captura_Ruta <> '' THEN 1 ELSE 0 END) AS capturas
       FROM aud_dev_telemetria WHERE Per_Cod IN (${marks}) AND Tel_Fecha_Hora BETWEEN ? AND ?
       GROUP BY Per_Cod, fecha ORDER BY Per_Cod, fecha`, ...ids, start, end),
    prisma.$queryRawUnsafe<ConexionReporteRow[]>(
      `SELECT Per_Cod, Fecha, Primera_Conexion FROM aud_dev_conexion_diaria
       WHERE Per_Cod IN (${marks}) AND Fecha BETWEEN ? AND ?`, ...ids, desde, hasta),
    prisma.$queryRawUnsafe<PresenciaReporteRow[]>(
      `SELECT Per_Cod, Mon_Ultima_Conexion FROM aud_dev_monitoreo_config
       WHERE Per_Cod IN (${marks}) AND Mon_Ultima_Conexion BETWEEN ? AND ?`, ...ids, start, end),
    prisma.$queryRawUnsafe<ProcesoReporteRow[]>(
      `SELECT Per_Cod, COALESCE(NULLIF(Tel_Proceso_Activo, ''), 'Sin datos') AS nombre,
              COUNT(*) AS registros, MAX(Tel_Es_IDE) AS es_ide
       FROM aud_dev_telemetria WHERE Per_Cod IN (${marks}) AND Tel_Fecha_Hora BETWEEN ? AND ?
       GROUP BY Per_Cod, nombre ORDER BY registros DESC`, ...ids, start, end),
    prisma.$queryRawUnsafe<Array<{ primera: Date | null; ultima: Date | null }>>(
      `SELECT MIN(Tel_Fecha_Hora) AS primera, MAX(Tel_Fecha_Hora) AS ultima
       FROM aud_dev_telemetria WHERE Per_Cod IN (${marks})`, ...ids),
  ]);
  const bounds = results[4].status === "fulfilled" ? results[4].value[0] : null;
  const first = bounds?.primera ? fechaEnZona(bounds.primera) : "";
  const last = bounds?.ultima ? fechaEnZona(bounds.ultima) : "";
  const report = buildMonitoreoReporte({ personas, desde, hasta,
    telemetria: results[0].status === "fulfilled" ? results[0].value : null,
    conexiones: results[1].status === "fulfilled" ? results[1].value : null,
    presencias: results[2].status === "fulfilled" ? results[2].value : null,
    procesos: results[3].status === "fulfilled" ? results[3].value : null,
    rangoDisponible: first && last ? { desde: first, hasta: last } : null });
  if (results[4].status === "rejected") {
    report.avisos.push("No se pudo consultar el período de telemetría disponible.");
    if (report.estado === "disponible") report.estado = "parcial";
  }
  return report;
}

export function duracionMonitoreo(segundos: number | null): string {
  if (segundos == null) return "Sin datos";
  const total = Math.max(0, Math.floor(segundos));
  const horas = Math.floor(total / 3600), minutos = Math.floor(total % 3600 / 60);
  return total < 60 ? `${total} s` : `${horas} h ${String(minutos).padStart(2, "0")} min`;
}
