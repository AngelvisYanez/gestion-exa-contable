/**
 * Reglas del estado "Standby" (tarea en pausa esperando feedback/validacion).
 * Modulo puro: sin dependencias de base de datos para poder testearlo solo.
 */

/** Estado de pausa de una tarea. */
export const ESTADO_STANDBY = "Standby";

/** ¿La tarea esta en standby (en pausa)? */
export function esStandby(estado?: string | null): boolean {
  return (estado || "").trim() === ESTADO_STANDBY;
}

/**
 * Estado de la tarea tras registrar un avance.
 * - 100% → Finalizada (no aplica standby).
 * - Con nota de standby → Standby: la tarea queda en pausa y sin fecha de fin.
 * - Sin nota → En Proceso: si estaba en pausa, la tarea se reanuda.
 */
export function estadoTrasAvance(opts: { porcentaje: number; enStandby: boolean }): string {
  if (opts.porcentaje >= 100) return "Finalizada";
  if (opts.enStandby) return ESTADO_STANDBY;
  return "En Proceso";
}
