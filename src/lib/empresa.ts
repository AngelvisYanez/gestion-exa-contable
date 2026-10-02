import { sanitizeDbDis } from "./db";

/**
 * Empresa operativa del panel de tareas:
 * TORRES CARRION FRANCISCO SAMUEL [MATRIZ]
 * Emp_Cod=96, Dat_Dis=exa (exa_master.data), Suc_Des=MATRIZ (Suc_Cod=99)
 */
export const EMPRESA_TAREAS = {
  empCod: 96,
  empNom: "TORRES CARRION FRANCISCO SAMUEL",
  sucDes: "MATRIZ",
  sucCod: 99,
  datDis: "exa",
} as const;

/** BD distribuida donde viven aud_tareas de la empresa MATRIZ. */
export function tasksDbDis(override?: string | null): string {
  return sanitizeDbDis(override || process.env.TASKS_DB_DIS || EMPRESA_TAREAS.datDis);
}

/**
 * Emp_Cod operativo del panel/agente.
 * Siempre TORRES CARRION FRANCISCO SAMUEL [MATRIZ] (96); ignore overrides.
 */
export function tasksEmpCod(_override?: string | number | null): number {
  const fromEnv = parseInt(process.env.TASKS_EMP_COD || String(EMPRESA_TAREAS.empCod), 10);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : EMPRESA_TAREAS.empCod;
}
