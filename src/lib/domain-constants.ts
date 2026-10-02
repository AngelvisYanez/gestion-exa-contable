/**
 * Valores de dominio usados en la app (BD legacy = VARCHAR / CHAR, no ENUM MySQL).
 * Centralizar aquí para UI, filtros y validación Zod.
 */

export const TAR_ESTADOS = [
  "Pendiente",
  "Asignado",
  "En Proceso",
  "Finalizada",
] as const;

export type TarEstado = (typeof TAR_ESTADOS)[number];

export const TAR_PRIORIDADES = ["Alta", "Media", "Baja"] as const;
export type TarPrioridad = (typeof TAR_PRIORIDADES)[number];

/** Códigos legacy en tickets.Tic_Est */
export const TIC_ESTADO_MAP: Record<string, string> = {
  "0": "Nuevo",
  "1": "En Proceso",
  "2": "Asignado",
  "3": "Cerrado",
};

export const TIC_ESTADO_CODE: Record<string, string> = {
  Nuevo: "0",
  "En Proceso": "1",
  Asignado: "2",
  Cerrado: "3",
};

export type TicketEstado = "Nuevo" | "Asignado" | "En Proceso" | "Cerrado";

export const TIC_PRIORIDADES = ["Alta", "Media", "Baja"] as const;

/** Soft-delete EXA */
export const EST_ACTIVO = "A" as const;
export const EST_INACTIVO = "I" as const;

/** Retención sugerida de telemetría (días) — ver prisma/sql/improve_schema.sql */
export const TELEMETRIA_RETENCION_DIAS = 90;

/** Presets de borrado de screenshots (disco + rutas en telemetría). */
export const CAPTURA_RETENCION_PRESETS = [
  { id: "1d", label: "1 día", dias: 1 },
  { id: "1w", label: "1 semana", dias: 7 },
  { id: "1m", label: "1 mes", dias: 30 },
  { id: "3m", label: "3 meses", dias: 90 },
  { id: "custom", label: "Personalizado", dias: null },
] as const;

export type CapturaRetencionPreset = (typeof CAPTURA_RETENCION_PRESETS)[number]["id"];

export const CAPTURA_RETENCION_DIAS_MIN = 1;
export const CAPTURA_RETENCION_DIAS_MAX = 365;
export const CAPTURA_RETENCION_DEFAULT_PRESET: CapturaRetencionPreset = "1m";
export const CAPTURA_RETENCION_DEFAULT_DIAS = 30;
