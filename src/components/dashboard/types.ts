export type Kpis = {
  total: number;
  completadas: number;
  proceso: number;
  pendientes: number;
  atrasadas: number;
  avance_promedio: number;
  tasa_cumplimiento: number;
};

export type ItemTipo = "tarea" | "ticket";

export type Tarea = {
  Tar_Cod: number;
  Tar_Titulo: string;
  Tar_Descripcion?: string | null;
  Tar_Prioridad: string;
  /** Baja | Media | Alta | Muy alta */
  Tar_Complejidad?: string | null;
  Tar_Estado: string;
  Tar_Fecha_Inicio?: string | null;
  Tar_Fecha_Fin?: string | null;
  Tar_Fecha_Culminacion?: string | null;
  Ava_Porcentaje: number;
  Ava_Ultima_Fecha?: string | null;
  Ava_Total?: number;
  Evidencias_Count?: number;
  Asignados: Array<{ Per_Cod: number; Nombre: string; Tas_Cod: number }>;
  /** Origen del ítem en bandejas mixtas (Mis tareas). Por defecto: tarea. */
  tipo?: ItemTipo;
  Tic_Cod?: number;
  /** Campos extra cuando tipo === "ticket". */
  Emp_Nom?: string | null;
  Tic_Tel?: string | null;
  Tic_Obs?: string | null;
  Creador_Nombre?: string | null;
  Enviado_Por?: string | null;
  Proceso?: string | null;
  Evidencias?: Array<{ ruta: string; url: string; nombre: string; esImagen: boolean }>;
  /** Base del ticket cuando viene de EXA o Servicios. */
  Db_Origen?: string | null;
};

export type Dev = {
  Per_Cod: number;
  Nombre: string;
  Cedula: string;
  Cargo: string;
  Mon_Activo: number;
  Mon_Intervalo_Minutos: number;
  Mon_Captura_Pantalla: number;
  Mon_Forzar_Bandeja: number;
  Mon_Permitir_Salir: number;
  Mon_Mac_Address: string;
  Ultima_Conexion: string | null;
  Ultima_Ventana: string;
  Ultimo_Proceso: string;
  Ultimo_Porcentaje: number;
  Ultima_Captura_Url: string;
  Estado_Conexion: string;
  Mon_Horario_Activo?: number;
  Mon_Hora_Inicio?: string;
  Mon_Hora_Fin?: string;
  Mon_En_Horario?: number | null;
  Mon_En_Almuerzo?: number | null;
  Total_Clicks_Hoy: number;
  Total_Teclas_Hoy: number;
  Total_Lineas_Hoy: number;
  Promedio_Actividad_Hoy: number;
  Minutos_Activos_Hoy: number;
};
