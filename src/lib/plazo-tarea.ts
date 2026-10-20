import { toCalendarYmd } from "./timezone";

export type CategoriaPlazo = "Diaria" | "Semanal" | "Mensual" | "Sin fechas";

export const CATEGORIAS_PLAZO: CategoriaPlazo[] = [
  "Diaria",
  "Semanal",
  "Mensual",
  "Sin fechas",
];

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Plazo de una tarea segun su duracion planificada (inicio -> fin).
 * Diaria: mismo dia · Semanal: hasta 6 dias de diferencia · Mensual: mas.
 * Unica fuente de la regla: la usan el dashboard y la UI (badge en fecha fin).
 */
export function plazoDesdeFechas(inicio: unknown, fin: unknown): CategoriaPlazo {
  const i = toCalendarYmd(inicio);
  const f = toCalendarYmd(fin);
  if (!YMD.test(i) || !YMD.test(f)) return "Sin fechas";
  const dias = Math.round(
    (Date.parse(`${f}T00:00:00Z`) - Date.parse(`${i}T00:00:00Z`)) / 86400000
  );
  if (dias <= 0) return "Diaria";
  if (dias <= 6) return "Semanal";
  return "Mensual";
}

/**
 * Fecha fin que corresponde a un plazo, contada desde la fecha de inicio.
 * Diaria: mismo dia · Semanal: inicio + 6 dias · Mensual: mismo dia del mes
 * siguiente (sin desbordar, p.ej. 31 de enero -> 28/29 de febrero).
 * Devuelve "" si no hay una fecha de inicio valida.
 */
export function fechaFinParaPlazo(inicio: unknown, plazo: CategoriaPlazo): string {
  const i = toCalendarYmd(inicio);
  if (!YMD.test(i)) return "";
  if (plazo === "Diaria") return i;
  const base = Date.parse(`${i}T00:00:00Z`);
  if (plazo === "Semanal") {
    return new Date(base + 6 * 86_400_000).toISOString().slice(0, 10);
  }
  if (plazo === "Mensual") {
    const d = new Date(base);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1; // Date.UTC normaliza el desborde de anio
    const dia = d.getUTCDate();
    const ultimoDiaDelMes = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return new Date(Date.UTC(y, m, Math.min(dia, ultimoDiaDelMes))).toISOString().slice(0, 10);
  }
  return "";
}

/** Colores de badge por plazo (mismos tonos que las series del grafico del dashboard). */
export function plazoVariant(
  plazo: CategoriaPlazo
): "info" | "violet" | "success" | "muted" {
  if (plazo === "Diaria") return "info";
  if (plazo === "Mensual") return "success";
  if (plazo === "Sin fechas") return "muted";
  return "violet";
}
