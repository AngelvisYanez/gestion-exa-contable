import type { Tarea } from "@/components/dashboard/types";
import {
  fechaEnZona,
  fmtFechaHoraZona,
  hoyFecha,
  startOfDayZona,
} from "@/lib/timezone";

export type AvanceActividad = {
  Ava_Cod: number;
  Tar_Cod: number;
  Ava_Porcentaje: number;
  Ava_Delta: number;
  Ava_Fecha: string | null;
  Autor: string | null;
  realizado: string;
  siguiente: string;
  bloqueos: string;
  horas: number | null;
  enlaces: string[];
  adjuntos: Array<{ ruta: string; url: string; nombre: string; esImagen: boolean }>;
};

export type Actividad = {
  desde: string;
  /** Inicio del periodo cargado (YYYY-MM-DD, Guayaquil). */
  desdeDia?: string;
  /** Fin del periodo cargado (YYYY-MM-DD, Guayaquil). */
  hastaDia?: string;
  dias: number;
  avances: AvanceActividad[];
  tiempo: Array<{ Tar_Cod: number | null; Dia: string; Minutos: number }>;
};

export const DIAS_SIN_ACTUALIZAR = 3;
const DAY = 24 * 3600 * 1000;

export function diaLocal(d: Date) {
  return fechaEnZona(d);
}

function haceDias(n: number) {
  const hoy = startOfDayZona(hoyFecha());
  return new Date(hoy.getTime() - (n - 1) * DAY);
}

export function diasDesde(iso?: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / DAY));
}

export function tareaAbierta(t: Tarea) {
  return t.Tar_Estado !== "Finalizada" && (t.Ava_Porcentaje || 0) < 100;
}

export type RangoFechas = { desde: string; hasta: string };

export function limitesPeriodo(dias: number, rango?: RangoFechas | null) {
  const hoy = hoyFecha();
  const ymd = /^\d{4}-\d{2}-\d{2}$/;
  if (rango?.desde && rango?.hasta && ymd.test(rango.desde.slice(0, 10)) && ymd.test(rango.hasta.slice(0, 10))) {
    let desdeDia = rango.desde.slice(0, 10);
    let hastaDia = rango.hasta.slice(0, 10);
    if (desdeDia > hastaDia) [desdeDia, hastaDia] = [hastaDia, desdeDia];
    if (hastaDia > hoy) hastaDia = hoy;
    if (desdeDia > hastaDia) desdeDia = hastaDia;
    let start = startOfDayZona(desdeDia);
    const end = startOfDayZona(hastaDia);
    const n = Math.round((end.getTime() - start.getTime()) / DAY) + 1;
    if (n > 366) {
      start = new Date(end.getTime() - 365 * DAY);
      desdeDia = diaLocal(start);
    }
    const span = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY) + 1);
    return { start, desdeDia, hastaDia, dias: span };
  }
  const safe = Math.max(1, Math.min(366, dias));
  const start = haceDias(safe);
  return { start, desdeDia: diaLocal(start), hastaDia: hoy, dias: safe };
}

export function avancesEnPeriodo(actividad: Actividad | null, dias: number, rango?: RangoFechas | null) {
  if (!actividad) return [];
  const { desdeDia, hastaDia } = limitesPeriodo(dias, rango);
  return actividad.avances.filter((a) => {
    if (!a.Ava_Fecha) return false;
    const key = diaLocal(new Date(a.Ava_Fecha));
    return key >= desdeDia && key <= hastaDia;
  });
}

export function calcularMetricas(
  tareas: Tarea[],
  actividad: Actividad | null,
  dias = 7,
  rango?: RangoFechas | null
) {
  const { start, desdeDia, hastaDia, dias: span } = limitesPeriodo(dias, rango);
  const periodo = avancesEnPeriodo(actividad, dias, rango);

  const diasActivos = new Set(periodo.map((a) => diaLocal(new Date(a.Ava_Fecha as string))));
  const puntos = periodo.reduce((s, a) => s + Math.max(0, a.Ava_Delta), 0);
  const evidencias = periodo.reduce((s, a) => s + a.enlaces.length + a.adjuntos.length, 0);
  const conEvidencia = periodo.filter((a) => a.enlaces.length + a.adjuntos.length > 0).length;
  const horasReportadas = periodo.reduce((s, a) => s + (a.horas || 0), 0);
  const bloqueos = periodo.filter((a) => a.bloqueos.trim()).length;
  const tareasTocadas = new Set(periodo.map((a) => a.Tar_Cod)).size;

  const minutosActivos = (actividad?.tiempo || [])
    .filter((r) => r.Dia >= desdeDia && r.Dia <= hastaDia)
    .reduce((s, r) => s + r.Minutos, 0);
  const minutosEnTareas = (actividad?.tiempo || [])
    .filter((r) => r.Dia >= desdeDia && r.Dia <= hastaDia && r.Tar_Cod)
    .reduce((s, r) => s + r.Minutos, 0);

  const abiertas = tareas.filter(tareaAbierta);
  const sinActualizar = abiertas.filter((t) => {
    const d = diasDesde(t.Ava_Ultima_Fecha);
    return d == null || d >= DIAS_SIN_ACTUALIZAR;
  });

  const finalizadas = tareas.filter((t) => !tareaAbierta(t));
  const conFecha = finalizadas.filter((t) => t.Tar_Fecha_Fin && t.Tar_Fecha_Culminacion);
  const aTiempo = conFecha.filter(
    (t) => String(t.Tar_Fecha_Culminacion).slice(0, 10) <= String(t.Tar_Fecha_Fin).slice(0, 10)
  ).length;
  const finalizadasPeriodo = finalizadas.filter((t) => {
    const cul = t.Tar_Fecha_Culminacion ? String(t.Tar_Fecha_Culminacion).slice(0, 10) : "";
    return cul >= desdeDia && cul <= hastaDia;
  }).length;

  const todosLosDias = new Set(
    (actividad?.avances || []).filter((a) => a.Ava_Fecha).map((a) => diaLocal(new Date(a.Ava_Fecha as string)))
  );
  let racha = 0;
  const cursor = startOfDayZona(hoyFecha());
  if (!todosLosDias.has(diaLocal(cursor))) cursor.setTime(cursor.getTime() - DAY);
  while (todosLosDias.has(diaLocal(cursor))) {
    racha++;
    cursor.setTime(cursor.getTime() - DAY);
  }

  const serie: Array<{ dia: string; label: string; avances: number; puntos: number; minutos: number }> = [];
  const labelLargo = span <= 16;
  for (let i = 0; i < span; i++) {
    const d = new Date(start.getTime() + i * DAY);
    const key = diaLocal(d);
    if (key > hastaDia) break;
    const delDia = (actividad?.avances || []).filter(
      (a) => a.Ava_Fecha && diaLocal(new Date(a.Ava_Fecha)) === key
    );
    serie.push({
      dia: key,
      label: d.toLocaleDateString("es-EC", {
        timeZone: "America/Guayaquil",
        weekday: labelLargo ? "short" : undefined,
        day: "2-digit",
        month: labelLargo ? undefined : "2-digit",
      }),
      avances: delDia.length,
      puntos: delDia.reduce((s, a) => s + Math.max(0, a.Ava_Delta), 0),
      minutos: (actividad?.tiempo || []).filter((r) => r.Dia === key).reduce((s, r) => s + r.Minutos, 0),
    });
  }

  return {
    dias: span,
    desde: desdeDia,
    hasta: hastaDia,
    avances: periodo.length,
    puntos,
    diasActivos: diasActivos.size,
    evidencias,
    coberturaEvidencia: periodo.length ? Math.round((conEvidencia / periodo.length) * 100) : 0,
    horasReportadas: Math.round(horasReportadas * 10) / 10,
    horasActivas: Math.round((minutosActivos / 60) * 10) / 10,
    horasEnTareas: Math.round((minutosEnTareas / 60) * 10) / 10,
    bloqueos,
    tareasTocadas,
    sinActualizar,
    finalizadasPeriodo,
    aTiempoPct: conFecha.length ? Math.round((aTiempo / conFecha.length) * 100) : null,
    racha,
    serie,
  };
}

export type Metricas = ReturnType<typeof calcularMetricas>;

function fmtFechaHora(iso: string | null) {
  return fmtFechaHoraZona(iso, { dateStyle: "short", timeStyle: "short" });
}

export type ReporteDetalleTarea = {
  Tar_Cod: number;
  titulo: string;
  estado: string;
  porcentaje: number;
  ganado: number;
  fechaFin: string | null;
  avances: AvanceActividad[];
};

export type ReporteData = {
  usuario: string;
  dias: number;
  desdeLabel: string;
  hastaLabel: string;
  periodoLabel: string;
  generado: string;
  metricas: Metricas;
  detalle: ReporteDetalleTarea[];
  sinActualizar: Array<{ Tar_Cod: number; titulo: string; porcentaje: number; hace: string }>;
};

/** Datos estructurados del reporte (UI + markdown). */
export function buildReporteData(opts: {
  usuario: string;
  dias: number;
  tareas: Tarea[];
  actividad: Actividad | null;
  origin: string;
  rango?: RangoFechas | null;
}): ReporteData {
  const m = calcularMetricas(opts.tareas, opts.actividad, opts.dias, opts.rango);
  const periodo = avancesEnPeriodo(opts.actividad, opts.dias, opts.rango);
  const hoy = new Date();
  const abs = (u: string) => (u.startsWith("http") ? u : `${opts.origin}${u}`);

  const porTarea = new Map<number, AvanceActividad[]>();
  for (const a of periodo) {
    const list = porTarea.get(a.Tar_Cod) || [];
    list.push(a);
    porTarea.set(a.Tar_Cod, list);
  }

  const detalle: ReporteDetalleTarea[] = [];
  for (const [tarCod, list] of porTarea) {
    const t = opts.tareas.find((x) => x.Tar_Cod === tarCod);
    const avances = [...list]
      .sort((x, y) => String(x.Ava_Fecha).localeCompare(String(y.Ava_Fecha)))
      .map((a) => ({
        ...a,
        enlaces: a.enlaces.map(abs),
        adjuntos: a.adjuntos.map((f) => ({ ...f, url: abs(f.url) })),
      }));
    detalle.push({
      Tar_Cod: tarCod,
      titulo: t?.Tar_Titulo || `Tarea #${tarCod}`,
      estado: t?.Tar_Estado || "—",
      porcentaje: t?.Ava_Porcentaje ?? 0,
      ganado: list.reduce((s, a) => s + Math.max(0, a.Ava_Delta), 0),
      fechaFin: t?.Tar_Fecha_Fin ? String(t.Tar_Fecha_Fin).slice(0, 10) : null,
      avances,
    });
  }

  // Orden: más progreso ganado primero
  detalle.sort((a, b) => b.ganado - a.ganado || b.avances.length - a.avances.length);

  return {
    usuario: opts.usuario,
    dias: m.dias,
    desdeLabel: new Date(`${m.desde}T12:00:00-05:00`).toLocaleDateString("es-EC", { timeZone: "America/Guayaquil" }),
    hastaLabel: new Date(`${m.hasta}T12:00:00-05:00`).toLocaleDateString("es-EC", { timeZone: "America/Guayaquil" }),
    periodoLabel:
      m.desde === hoyFecha() && m.hasta === hoyFecha()
        ? "Hoy"
        : m.hasta === hoyFecha()
          ? `Ultimos ${m.dias} dias`
          : "Rango seleccionado",
    generado: fmtFechaHora(hoy.toISOString()),
    metricas: m,
    detalle,
    sinActualizar: m.sinActualizar.map((t) => {
      const d = diasDesde(t.Ava_Ultima_Fecha);
      return {
        Tar_Cod: t.Tar_Cod,
        titulo: t.Tar_Titulo,
        porcentaje: t.Ava_Porcentaje || 0,
        hace: d == null ? "sin avances" : `hace ${d} dia(s)`,
      };
    }),
  };
}

/** Reporte en Markdown para enviar como evidencia (correo, WhatsApp, Teams). */
export function buildReporte(opts: {
  usuario: string;
  dias: number;
  tareas: Tarea[];
  actividad: Actividad | null;
  origin: string;
  rango?: RangoFechas | null;
}) {
  const data = buildReporteData(opts);
  const m = data.metricas;
  const L: string[] = [];
  L.push(`# Reporte de avance — ${data.usuario}`);
  L.push(
    `Periodo: ${data.desdeLabel} al ${data.hastaLabel} (${data.dias} ${data.dias === 1 ? "dia" : "dias"})`
  );
  L.push("");
  L.push("## Resumen");
  L.push(`- Avances registrados: ${m.avances} en ${m.tareasTocadas} tarea(s), ${m.diasActivos} dia(s) con actividad`);
  L.push(`- Progreso acumulado: +${m.puntos} puntos porcentuales`);
  L.push(`- Tareas finalizadas en el periodo: ${m.finalizadasPeriodo}`);
  L.push(`- Horas reportadas: ${m.horasReportadas} h · Tiempo activo medido (ExaMonitor): ${m.horasActivas} h`);
  L.push(`- Evidencias adjuntas: ${m.evidencias} (${m.coberturaEvidencia}% de los avances con evidencia)`);
  if (m.aTiempoPct != null) L.push(`- Cumplimiento a tiempo (historico): ${m.aTiempoPct}%`);
  if (m.bloqueos) L.push(`- Avances con bloqueos reportados: ${m.bloqueos}`);
  L.push("");

  L.push("## Detalle por tarea");
  if (!data.detalle.length) L.push("_Sin avances registrados en el periodo._");
  for (const t of data.detalle) {
    L.push("");
    L.push(`### #${t.Tar_Cod} ${t.titulo}`);
    L.push(
      `Estado: ${t.estado} · Avance actual: ${t.porcentaje}% (+${t.ganado} en el periodo)` +
        (t.fechaFin ? ` · Fecha fin: ${t.fechaFin}` : "")
    );
    for (const a of t.avances) {
      L.push(`- **${fmtFechaHora(a.Ava_Fecha)} — ${a.Ava_Porcentaje}%** (${a.Ava_Delta >= 0 ? "+" : ""}${a.Ava_Delta})`);
      if (a.realizado) L.push(`  - Realizado: ${a.realizado.replace(/\n+/g, " ")}`);
      if (a.horas) L.push(`  - Tiempo invertido: ${a.horas} h`);
      if (a.siguiente) L.push(`  - Siguiente paso: ${a.siguiente}`);
      if (a.bloqueos) L.push(`  - Bloqueos: ${a.bloqueos}`);
      for (const e of a.enlaces) L.push(`  - Evidencia: ${e}`);
      for (const f of a.adjuntos) L.push(`  - Adjunto: ${f.nombre} — ${f.url}`);
    }
  }

  if (data.sinActualizar.length) {
    L.push("");
    L.push(`## Tareas abiertas sin actualizar (${DIAS_SIN_ACTUALIZAR}+ dias)`);
    for (const t of data.sinActualizar) {
      L.push(`- #${t.Tar_Cod} ${t.titulo} — ${t.porcentaje}% · ${t.hace}`);
    }
  }

  L.push("");
  L.push(`_Generado desde EXA Tareas el ${data.generado}._`);
  return L.join("\n");
}
