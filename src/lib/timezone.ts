/** Zona horaria operativa del sistema (Guayaquil, Ecuador; UTC−5, sin DST). */
export const APP_TIMEZONE = "America/Guayaquil";
export const APP_LOCALE = "es-EC";
/** Offset fijo de Ecuador (sin horario de verano). */
export const APP_UTC_OFFSET = "-05:00";

/** Fecha calendario YYYY-MM-DD en America/Guayaquil. */
export function fechaEnZona(d: Date | string | number = new Date()): string {
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Hoy en Guayaquil (YYYY-MM-DD). */
export function hoyFecha(): string {
  return fechaEnZona(new Date());
}

/**
 * Fecha calendario YYYY-MM-DD.
 * DATE de MySQL via Prisma llega como Date en UTC medianoche; String(date) no es ISO.
 */
export function toCalendarYmd(v: unknown): string {
  if (v == null || v === "") return "";
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return "";
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, "0");
    const d = String(v.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : "";
}

/** Inicio del día calendario en Guayaquil → instante UTC. */
export function startOfDayZona(fecha: string): Date {
  return new Date(`${fecha.slice(0, 10)}T00:00:00${APP_UTC_OFFSET}`);
}

/** Fin del día calendario en Guayaquil → instante UTC. */
export function endOfDayZona(fecha: string): Date {
  return new Date(`${fecha.slice(0, 10)}T23:59:59.999${APP_UTC_OFFSET}`);
}

/** Hora HHMMSS en Guayaquil (p. ej. nombres de archivo). */
export function horaHisZona(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("hour")}${get("minute")}${get("second")}`;
}

/** Fecha/hora legible en es-EC + Guayaquil. */
export function fmtFechaHoraZona(
  iso?: string | Date | null,
  opts: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" }
): string {
  if (iso == null || iso === "") return "—";
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(APP_LOCALE, { timeZone: APP_TIMEZONE, ...opts });
}

/** Interpreta un timestamp naive (sin zona) como hora de Guayaquil. */
export function parseNaiveAsGuayaquil(raw: string): Date | null {
  const m = raw.trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/);
  if (!m) return null;
  const d = new Date(`${m[1]}T${m[2]}${APP_UTC_OFFSET}`);
  return Number.isNaN(d.getTime()) ? null : d;
}
