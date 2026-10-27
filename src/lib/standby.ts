/**
 * Reglas del estado "Standby" (tarea en pausa esperando feedback/validacion).
 * Modulo puro: sin dependencias de base de datos para poder testearlo solo.
 *
 * En la BD `aud_tareas.Tar_Estado` guarda "Pausada" para una tarea en pausa.
 * La app lo muestra como "Standby" y reconoce registros antiguos con esa etiqueta.
 */

/** Valor del enum Tar_Estado para una tarea en pausa (standby). */
export const ESTADO_STANDBY = "Pausada";

/** Etiqueta que muestra la app para ese estado. */
export const ETIQUETA_STANDBY = "Standby";

/** ¿La tarea esta en standby (en pausa)? */
export function esStandby(estado?: string | null): boolean {
  const valor = (estado || "").trim();
  return valor === ESTADO_STANDBY || valor === ETIQUETA_STANDBY;
}

/** Etiqueta visible del estado: "Pausada" (BD) se muestra como "Standby". */
export function etiquetaEstado(estado?: string | null): string {
  const e = (estado || "").trim();
  if (!e) return "";
  return esStandby(e) ? ETIQUETA_STANDBY : e;
}

/** Valor que se guarda en Tar_Estado; acepta la etiqueta usada por la UI. */
export function estadoParaPersistir(estado: string): string {
  return esStandby(estado) ? ESTADO_STANDBY : estado;
}

/**
 * Estado de la tarea tras registrar un avance.
 * - 100% → Finalizada (no aplica standby).
 * - Con nota de standby → Pausada: la tarea queda en pausa y sin fecha de fin.
 * - Sin nota → En Proceso: si estaba en pausa, la tarea se reanuda.
 */
export function estadoTrasAvance(opts: { porcentaje: number; enStandby: boolean }): string {
  if (opts.porcentaje >= 100) return "Finalizada";
  if (opts.enStandby) return ESTADO_STANDBY;
  return "En Proceso";
}
