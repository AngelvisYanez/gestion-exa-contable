import { APP_LOCALE, hoyFecha } from "./timezone";

/**
 * Plazo al convertir un ticket en tarea. Fija la fecha de fin de la tarea:
 * Diaria = hoy, Semanal = +7 días, Mensual = +1 mes.
 */
export const PLAZOS_TAREA = ["Diaria", "Semanal", "Mensual"] as const;
export type PlazoTarea = (typeof PLAZOS_TAREA)[number];

export function normalizePlazo(v?: string | null): PlazoTarea | null {
  const c = String(v || "").trim().toLowerCase();
  if (c === "diaria") return "Diaria";
  if (c === "semanal") return "Semanal";
  if (c === "mensual") return "Mensual";
  return null;
}

function ymdValido(v?: string | null): v is string {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
}

function masDias(ymd: string, dias: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + dias));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate()
  ).padStart(2, "0")}`;
}

/** Un mes después, recortando el día si el mes destino es más corto. */
function masUnMes(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const destinoAnio = m === 12 ? y + 1 : y;
  const destinoMes = m === 12 ? 1 : m + 1;
  // Día del último día del mes destino (Date.UTC con día 0 = último del mes anterior).
  const ultimoDia = new Date(Date.UTC(destinoAnio, destinoMes, 0)).getUTCDate();
  const dia = Math.min(d, ultimoDia);
  return `${destinoAnio}-${String(destinoMes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/**
 * Fecha de fin que corresponde al plazo elegido. Sin plazo → null.
 * `desde` opcional (YYYY-MM-DD, por defecto hoy en Guayaquil).
 */
export function fechaFinPorPlazo(plazo?: string | null, desde?: string | null): string | null {
  const p = normalizePlazo(plazo);
  if (!p) return null;
  const base = ymdValido(desde) ? desde : hoyFecha();
  if (p === "Diaria") return base;
  if (p === "Semanal") return masDias(base, 7);
  return masUnMes(base);
}

/** Fecha YYYY-MM-DD legible en es-EC, sin corrimiento por zona horaria. */
export function fmtFechaYmd(ymd?: string | null): string {
  if (!ymdValido(ymd)) return "";
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(APP_LOCALE, {
    timeZone: "UTC",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/** Texto de ayuda para el plazo elegido en el diálogo de conversión. */
export function ayudaPlazo(plazo?: string | null): string {
  const fin = fechaFinPorPlazo(plazo);
  if (!fin) return "Sin plazo: la tarea queda sin fecha de fin.";
  const p = normalizePlazo(plazo);
  if (p === "Diaria") return `Se vence hoy, ${fmtFechaYmd(fin)}.`;
  return `Se vence el ${fmtFechaYmd(fin)}.`;
}
