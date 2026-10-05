/**
 * Tipos y adaptadores de ticket usables en el cliente.
 * No importar Prisma, fs ni otros módulos de servidor desde aquí.
 */

export type Ticket = {
  Tic_Cod: number;
  Tic_Titulo: string;
  Tic_Descripcion: string | null;
  Tic_Prioridad: string;
  Tic_Estado: string;
  Tic_Estado_Cod: string;
  Tic_Origen: string;
  Per_Cod_Asignado: number | null;
  Asignado_Nombre: string | null;
  Asignado_Usu_Cod: number | null;
  /** Desarrolladores asignados (Ase_Cod + asignación múltiple del panel). */
  Asignados?: Array<{ Usu_Cod: number; Per_Cod: number | null; Nombre: string }>;
  Tar_Cod: number | null;
  Emp_Cod: number;
  Emp_Nom: string | null;
  Usu_Creador: number | null;
  Creador_Nombre: string | null;
  Tic_Fecha_Llegada: string;
  Tic_Fecha_Asignacion: string | null;
  Tic_Tel: string | null;
  Tic_Obs: string | null;
  /** Campos del formato WhatsApp (parseados de Tic_Des). */
  Enviado_Por: string | null;
  Proceso: string | null;
  Evidencias: Array<{ ruta: string; url: string; nombre: string; esImagen: boolean }>;
};

/** Mapea estado de ticket EXA → columnas Kanban de tareas. */
export function ticketEstadoToKanban(estado: string): string {
  if (estado === "Cerrado") return "Finalizada";
  if (estado === "Nuevo") return "Pendiente";
  if (estado === "Asignado" || estado === "En Proceso") return estado;
  return "Pendiente";
}

/** Adapta un ticket a la forma de Tarea para Mis tareas / Kanban. */
export function ticketAsTarea(t: Ticket) {
  return {
    Tar_Cod: t.Tic_Cod,
    Tar_Titulo: t.Tic_Titulo,
    Tar_Descripcion: t.Tic_Descripcion,
    Tar_Prioridad: t.Tic_Prioridad,
    Tar_Estado: ticketEstadoToKanban(t.Tic_Estado),
    Tar_Fecha_Inicio: t.Tic_Fecha_Llegada || null,
    Tar_Fecha_Fin: null,
    Tar_Fecha_Culminacion: t.Tic_Estado === "Cerrado" ? t.Tic_Fecha_Asignacion : null,
    Ava_Porcentaje: t.Tic_Estado === "Cerrado" ? 100 : t.Tic_Estado === "En Proceso" ? 40 : 0,
    Ava_Ultima_Fecha: t.Tic_Fecha_Asignacion || t.Tic_Fecha_Llegada || null,
    Ava_Total: 0,
    Asignados:
      t.Asignados && t.Asignados.length
        ? t.Asignados.map((a) => ({
            Per_Cod: a.Per_Cod || 0,
            Nombre: a.Nombre,
            Tas_Cod: 0,
          }))
        : t.Asignado_Nombre
          ? [{ Per_Cod: t.Per_Cod_Asignado || 0, Nombre: t.Asignado_Nombre, Tas_Cod: 0 }]
          : [],
    tipo: "ticket" as const,
    Tic_Cod: t.Tic_Cod,
    Emp_Nom: t.Emp_Nom,
    Tic_Tel: t.Tic_Tel,
    Tic_Obs: t.Tic_Obs,
    Creador_Nombre: t.Creador_Nombre,
    Enviado_Por: t.Enviado_Por,
    Proceso: t.Proceso,
    Evidencias: t.Evidencias,
  };
}
