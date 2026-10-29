import type { DashboardMetrics } from "./dashboard";
import { fmtFechaHoraZona } from "./timezone";

export type FuenteRendimiento = Pick<
  DashboardMetrics,
  "kpis" | "porAsignado" | "serieEquipo" | "desarrolladores" | "filtro" | "rango" | "monitoreo"
>;

export type ReporteRendimiento = {
  proyecto: string;
  db: string;
  desde: string;
  hasta: string;
  generado: string;
  persona: { codigo: number; nombre: string } | null;
  kpis: FuenteRendimiento["kpis"];
  personas: FuenteRendimiento["porAsignado"];
  dias: FuenteRendimiento["serieEquipo"];
  monitoreo: FuenteRendimiento["monitoreo"];
};

export function buildReporteRendimiento(
  fuente: FuenteRendimiento,
  proyecto: { db: string; nombre: string },
  generado = new Date()
): ReporteRendimiento {
  const codigo = fuente.filtro.perCod;
  const nombre = fuente.desarrolladores.find((p) => p.Per_Cod === codigo)?.Nombre
    || fuente.porAsignado.find((p) => p.Per_Cod === codigo)?.Nombre
    || `Persona ${codigo}`;
  return {
    proyecto: proyecto.nombre,
    db: proyecto.db,
    desde: fuente.rango.desde,
    hasta: fuente.rango.hasta,
    generado: generado.toISOString(),
    persona: codigo ? { codigo, nombre } : null,
    kpis: { ...fuente.kpis },
    personas: fuente.porAsignado
      .filter((p) => !codigo || p.Per_Cod === codigo)
      .map((p) => ({ ...p })),
    dias: fuente.serieEquipo.map((d) => ({ ...d })),
    monitoreo: fuente.monitoreo ? {
      ...fuente.monitoreo,
      rango_disponible: fuente.monitoreo.rango_disponible ? { ...fuente.monitoreo.rango_disponible } : null,
      avisos: [...fuente.monitoreo.avisos],
      desarrolladores: fuente.monitoreo.desarrolladores.filter((p) => !codigo || p.Per_Cod === codigo)
        .map((p) => ({ ...p, dias: p.dias.map((d) => ({ ...d })), procesos: p.procesos.map((x) => ({ ...x })) })),
    } : { estado: "no_disponible", telemetria_consultada: false, rango_disponible: null,
      avisos: ["Actualiza el dashboard para cargar el monitoreo."], desarrolladores: [] },
  };
}

// Text fields are quoted and neutralized before opening the file in a spreadsheet.
function csvCell(value: string | number): string {
  if (typeof value === "number") return String(value);
  const safe = /^[\s\u0000-\u001f]*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value)
    ? `'${value}`
    : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function buildRendimientoCsv(reporte: ReporteRendimiento): string {
  const rows: Array<Array<string | number>> = [[
    "Proyecto", "Base", "Desde", "Hasta", "Generado (UTC)", "Código persona", "Nombre",
    "Tareas totales", "Finalizadas", "En proceso", "Pendientes", "Avance promedio (%)", "Cumplimiento (%)",
    "Primera conexión del período (Guayaquil)", "Cierre confirmado", "Última señal del período (Guayaquil)",
    "Tiempo activo reportado (segundos)", "Actividad promedio (%)", "Clics", "Teclas", "Líneas estimadas", "Capturas", "Registros de telemetría", "Estado de datos de monitoreo",
  ]];
  for (const p of reporte.personas) {
    const monitor = reporte.monitoreo.desarrolladores.find((m) => m.Per_Cod === p.Per_Cod);
    const first = monitor?.dias.map((d) => d.primera_conexion).filter((v): v is string => !!v).sort()[0];
    const last = monitor?.dias.map((d) => d.ultima_senal).filter((v): v is string => !!v).sort().at(-1);
    const close = monitor?.dias.map((d) => d.cierre_sesion).filter((v): v is string => !!v).sort().at(-1);
    const dateTime = (v: string | undefined) => v ? fmtFechaHoraZona(v, { dateStyle: "short", timeStyle: "medium" }) : "Sin registro";
    rows.push([
      reporte.proyecto, reporte.db, reporte.desde, reporte.hasta, reporte.generado,
      p.Per_Cod, p.Nombre, p.total, p.completadas, p.proceso, p.pendientes,
      p.avance_promedio, p.cumplimiento,
      dateTime(first), close ? dateTime(close) : "No registrado", dateTime(last), monitor?.segundos_activos ?? "Sin datos",
      monitor?.actividad ?? "Sin datos", monitor?.clicks ?? "Sin datos", monitor?.teclas ?? "Sin datos",
      monitor?.lineas ?? "Sin datos", monitor?.capturas ?? "Sin datos", monitor?.registros ?? "Sin datos", reporte.monitoreo.estado,
    ]);
  }
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}\r\n`;
}

export function nombreReporteRendimiento(reporte: ReporteRendimiento, formato: "pdf" | "csv"): string {
  const base = reporte.db.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
  const alcance = reporte.persona ? `persona-${reporte.persona.codigo}` : "equipo";
  return `rendimiento-${base}-${alcance}-${reporte.desde}-${reporte.hasta}.${formato}`;
}

export function descargarReporte(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nombre;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
