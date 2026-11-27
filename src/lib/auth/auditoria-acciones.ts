/** Catalogo de la bitacora de permisos y roles. Sin dependencias de servidor: lo usa tambien la pantalla. */
export const ACCIONES_AUDITORIA = {
  permiso_activado: "Permiso activado",
  permiso_desactivado: "Permiso desactivado",
  permisos_restablecidos: "Permisos restablecidos",
  rol_cambiado: "Rol cambiado",
  usuario_agregado: "Usuario agregado",
  usuario_retirado: "Usuario retirado",
  encargado_forzado: "Encargado por cedula",
  acceso_denegado: "Acceso denegado",
  login_rechazado: "Ingreso rechazado",
} as const;

export type AccionAuditoria = keyof typeof ACCIONES_AUDITORIA;

export type FilaAuditoria = {
  Aud_Cod: number;
  /** Fecha ISO en UTC (termina en Z). */
  Aud_Fecha: string;
  Aud_Accion: string;
  Aud_Actor_Usu: number | null;
  Aud_Actor_Nombre: string;
  Aud_Actor_Rol: string;
  Aud_Objetivo_Usu: number | null;
  Aud_Objetivo_Nombre: string;
  Aud_Rol: string;
  Aud_Permiso: string;
  Aud_Anterior: string;
  Aud_Nuevo: string;
  Aud_Detalle: string;
  Aud_Ip: string;
};
