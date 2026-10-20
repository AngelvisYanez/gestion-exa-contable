export type DashboardRole = "manager" | "developer";

export type ManagerWidgetId =
  | "kpis"
  | "overall"
  | "cumplimiento"
  | "chart-estado"
  | "chart-prioridad"
  | "equipo-cola"
  | "carga-asignado"
  | "avance-persona"
  | "rendimiento-onda"
  | "rendimiento-barras"
  | "rendimiento-radar"
  | "comparativa-rendimiento"
  | "apoyo-tareas"
  | "chart-plazo"
  | "atrasadas-detalle"
  | "ciclo"
  | "puntualidad"
  | "standby"
  | "backlog"
  | "creador-ejecutor"
  | "carga-justa"
  | "reapertura"
  | "complejidad"
  | "esfuerzo"
  | "horas-tarea"
  | "procesos"
  | "horario"
  | "avance-sin-actividad"
  | "bases"
  | "accesos";

export type DevWidgetId =
  | "kpis"
  | "kpis-extra"
  | "chart-estado"
  | "chart-tipo"
  | "cola-personal"
  | "metricas"
  | "atrasadas"
  | "tel-kpis"
  | "tel-tareas"
  | "tel-procesos"
  | "tel-horario"
  | "actividad"
  | "accesos";

export type WidgetId = ManagerWidgetId | DevWidgetId;

export type LayoutItem = {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  static?: boolean;
};

export type WidgetMeta = {
  id: string;
  title: string;
  description: string;
  defaultLayout: LayoutItem;
};

export const MANAGER_CATALOG: WidgetMeta[] = [
  {
    id: "kpis",
    title: "KPIs del proyecto",
    description: "Totales, proceso, atrasadas y cumplimiento",
    defaultLayout: { i: "kpis", x: 0, y: 0, w: 12, h: 4, minW: 6, minH: 3 },
  },
  {
    id: "overall",
    title: "Resumen de tareas",
    description: "Barra de distribucion general",
    defaultLayout: { i: "overall", x: 0, y: 4, w: 3, h: 6, minW: 3, minH: 5 },
  },
  {
    id: "cumplimiento",
    title: "Cumplimiento",
    description: "Tasa de finalizacion",
    defaultLayout: { i: "cumplimiento", x: 3, y: 4, w: 3, h: 6, minW: 3, minH: 5 },
  },
  {
    id: "equipo-cola",
    title: "Equipo y cola",
    description: "Online, sin asignar y tickets nuevos",
    defaultLayout: { i: "equipo-cola", x: 6, y: 4, w: 3, h: 6, minW: 3, minH: 5 },
  },
  {
    id: "accesos",
    title: "Accesos rapidos",
    description: "Atajos a tareas y tickets",
    defaultLayout: { i: "accesos", x: 9, y: 4, w: 3, h: 6, minW: 3, minH: 4 },
  },
  {
    id: "rendimiento-onda",
    title: "Rendimiento del equipo",
    description: "Onda ApexCharts: avances, completadas y avance %",
    defaultLayout: { i: "rendimiento-onda", x: 0, y: 10, w: 8, h: 9, minW: 5, minH: 7 },
  },
  {
    id: "rendimiento-radar",
    title: "Radar de equipo",
    description: "Comparativa relativa ApexCharts del top 5",
    defaultLayout: { i: "rendimiento-radar", x: 8, y: 10, w: 4, h: 9, minW: 3, minH: 7 },
  },
  {
    id: "comparativa-rendimiento",
    title: "Comparativa de rendimiento",
    description: "Rendimiento por plazo de tarea: diaria, semanal y mensual",
    defaultLayout: { i: "comparativa-rendimiento", x: 0, y: 36, w: 12, h: 9, minW: 5, minH: 7 },
  },
  {
    id: "apoyo-tareas",
    title: "Quien apoyo mas",
    description: "Ranking de apoyos en tareas por desarrollador y plazo",
    defaultLayout: { i: "apoyo-tareas", x: 0, y: 45, w: 8, h: 9, minW: 4, minH: 7 },
  },
  {
    id: "chart-estado",
    title: "Por estado",
    description: "Donut ApexCharts de estados",
    defaultLayout: { i: "chart-estado", x: 0, y: 19, w: 4, h: 8, minW: 3, minH: 6 },
  },
  {
    id: "chart-prioridad",
    title: "Por prioridad",
    description: "Donut ApexCharts de prioridades",
    defaultLayout: { i: "chart-prioridad", x: 4, y: 19, w: 4, h: 8, minW: 3, minH: 6 },
  },
  {
    id: "chart-plazo",
    title: "Por plazo",
    description: "Donut ApexCharts de plazos: diaria, semanal, mensual",
    defaultLayout: { i: "chart-plazo", x: 8, y: 19, w: 4, h: 8, minW: 3, minH: 6 },
  },
  {
    id: "atrasadas-detalle",
    title: "Tareas atrasadas",
    description: "Vencidas con dias de retraso y responsables",
    defaultLayout: { i: "atrasadas-detalle", x: 0, y: 54, w: 6, h: 9, minW: 4, minH: 6 },
  },
  {
    id: "ciclo",
    title: "Tiempo de ciclo",
    description: "Dias de inicio a culminacion por plazo",
    defaultLayout: { i: "ciclo", x: 6, y: 54, w: 6, h: 9, minW: 4, minH: 6 },
  },
  {
    id: "puntualidad",
    title: "Puntualidad de entrega",
    description: "Cerradas antes o el dia de la fecha fin",
    defaultLayout: { i: "puntualidad", x: 0, y: 63, w: 6, h: 8, minW: 4, minH: 6 },
  },
  {
    id: "standby",
    title: "Tareas en standby",
    description: "Abiertas sin fecha fin y su antiguedad",
    defaultLayout: { i: "standby", x: 6, y: 63, w: 6, h: 8, minW: 4, minH: 6 },
  },
  {
    id: "backlog",
    title: "Backlog y ritmo",
    description: "Abiertas, ritmo de cierre y ETA de vaciado",
    defaultLayout: { i: "backlog", x: 0, y: 71, w: 12, h: 5, minW: 6, minH: 4 },
  },
  {
    id: "creador-ejecutor",
    title: "Creador vs ejecutor",
    description: "Quien crea tareas frente a quien las ejecuta",
    defaultLayout: { i: "creador-ejecutor", x: 0, y: 76, w: 6, h: 9, minW: 4, minH: 6 },
  },
  {
    id: "carga-justa",
    title: "Equilibrio de carga",
    description: "Desviacion estandar de tareas por persona",
    defaultLayout: { i: "carga-justa", x: 6, y: 76, w: 6, h: 9, minW: 4, minH: 6 },
  },
  {
    id: "reapertura",
    title: "Tasa de reapertura",
    description: "Avances con retroceso de porcentaje",
    defaultLayout: { i: "reapertura", x: 0, y: 85, w: 6, h: 5, minW: 4, minH: 4 },
  },
  {
    id: "complejidad",
    title: "Complejidad vs avance",
    description: "Tiempo real de ciclo por nivel de complejidad",
    defaultLayout: { i: "complejidad", x: 6, y: 85, w: 6, h: 5, minW: 4, minH: 4 },
  },
  {
    id: "esfuerzo",
    title: "Tiempo activo por persona",
    description: "Telemetria ExaMonitor: horas activas e indice de actividad",
    defaultLayout: { i: "esfuerzo", x: 0, y: 90, w: 6, h: 9, minW: 4, minH: 6 },
  },
  {
    id: "horas-tarea",
    title: "Horas por tarea",
    description: "Tiempo activo medido por tarea",
    defaultLayout: { i: "horas-tarea", x: 6, y: 90, w: 6, h: 9, minW: 4, minH: 6 },
  },
  {
    id: "procesos",
    title: "En que trabaja el equipo",
    description: "Proceso/ventana activa mas frecuente",
    defaultLayout: { i: "procesos", x: 0, y: 99, w: 6, h: 8, minW: 4, minH: 6 },
  },
  {
    id: "horario",
    title: "Adherencia al horario",
    description: "Actividad dentro del horario laboral configurado",
    defaultLayout: { i: "horario", x: 6, y: 99, w: 6, h: 8, minW: 4, minH: 6 },
  },
  {
    id: "avance-sin-actividad",
    title: "Avance sin actividad",
    description: "Tareas con avance declarado sin telemetria medida",
    defaultLayout: { i: "avance-sin-actividad", x: 0, y: 107, w: 12, h: 8, minW: 6, minH: 6 },
  },
  {
    id: "bases",
    title: "Selector de base",
    description: "Comparativa y selector de KPIs por base (EXA vs Servicios)",
    defaultLayout: { i: "bases", x: 0, y: 115, w: 6, h: 9, minW: 4, minH: 6 },
  },
  {
    id: "rendimiento-barras",
    title: "Carga del equipo",
    description: "Barras ApexCharts por persona",
    defaultLayout: { i: "rendimiento-barras", x: 0, y: 27, w: 6, h: 9, minW: 4, minH: 7 },
  },
  {
    id: "carga-asignado",
    title: "Carga compacta",
    description: "Barras simples de carga",
    defaultLayout: { i: "carga-asignado", x: 6, y: 27, w: 3, h: 9, minW: 3, minH: 5 },
  },
  {
    id: "avance-persona",
    title: "Avance por persona",
    description: "Progreso individual del equipo",
    defaultLayout: { i: "avance-persona", x: 9, y: 27, w: 3, h: 9, minW: 3, minH: 5 },
  },
];

export const DEV_CATALOG: WidgetMeta[] = [
  {
    id: "kpis",
    title: "Mis KPIs",
    description: "Totales de tus tareas y tickets",
    defaultLayout: { i: "kpis", x: 0, y: 0, w: 12, h: 4, minW: 6, minH: 3 },
  },
  {
    id: "kpis-extra",
    title: "Avance y horas",
    description: "Cumplimiento, avances y horas activas",
    defaultLayout: { i: "kpis-extra", x: 0, y: 4, w: 12, h: 4, minW: 6, minH: 3 },
  },
  {
    id: "chart-estado",
    title: "Por estado",
    description: "Distribucion de tu carga",
    defaultLayout: { i: "chart-estado", x: 0, y: 8, w: 4, h: 7, minW: 3, minH: 6 },
  },
  {
    id: "chart-tipo",
    title: "Tareas vs tickets",
    description: "Proporcion por tipo",
    defaultLayout: { i: "chart-tipo", x: 4, y: 8, w: 4, h: 7, minW: 3, minH: 6 },
  },
  {
    id: "cola-personal",
    title: "Cola personal",
    description: "Abiertas, tickets y atrasadas",
    defaultLayout: { i: "cola-personal", x: 8, y: 8, w: 4, h: 7, minW: 3, minH: 5 },
  },
  {
    id: "metricas",
    title: "Actividad reciente",
    description: "Avances y capturas del periodo",
    defaultLayout: { i: "metricas", x: 0, y: 15, w: 8, h: 8, minW: 4, minH: 6 },
  },
  {
    id: "atrasadas",
    title: "Mis atrasadas",
    description: "Tareas vencidas asignadas a ti",
    defaultLayout: { i: "atrasadas", x: 8, y: 15, w: 4, h: 8, minW: 3, minH: 5 },
  },
  {
    id: "tel-kpis",
    title: "Mi tiempo activo",
    description: "Telemetria ExaMonitor: horas activas e indice de actividad",
    defaultLayout: { i: "tel-kpis", x: 0, y: 23, w: 12, h: 4, minW: 6, minH: 3 },
  },
  {
    id: "tel-tareas",
    title: "Mis horas por tarea",
    description: "Tiempo activo medido por tarea",
    defaultLayout: { i: "tel-tareas", x: 0, y: 27, w: 6, h: 8, minW: 3, minH: 5 },
  },
  {
    id: "tel-procesos",
    title: "En que trabaje",
    description: "Procesos y ventanas mas frecuentes",
    defaultLayout: { i: "tel-procesos", x: 6, y: 27, w: 6, h: 8, minW: 3, minH: 5 },
  },
  {
    id: "tel-horario",
    title: "Mi adherencia al horario",
    description: "Actividad dentro de tu horario laboral",
    defaultLayout: { i: "tel-horario", x: 0, y: 35, w: 6, h: 6, minW: 3, minH: 4 },
  },
  {
    id: "actividad",
    title: "Notificaciones",
    description: "Eventos en tiempo real",
    defaultLayout: { i: "actividad", x: 6, y: 35, w: 6, h: 6, minW: 3, minH: 4 },
  },
  {
    id: "accesos",
    title: "Accesos rapidos",
    description: "Ir a Mis tareas y reporte",
    defaultLayout: { i: "accesos", x: 0, y: 41, w: 6, h: 6, minW: 3, minH: 3 },
  },
];

export const MANAGER_DEFAULT: ManagerWidgetId[] = [
  "kpis",
  "overall",
  "cumplimiento",
  "equipo-cola",
  "accesos",
  "rendimiento-onda",
  "rendimiento-radar",
  "comparativa-rendimiento",
  "apoyo-tareas",
  "chart-estado",
  "chart-prioridad",
  "chart-plazo",
  "rendimiento-barras",
  "carga-asignado",
  "avance-persona",
  "atrasadas-detalle",
  "ciclo",
  "puntualidad",
  "standby",
  "backlog",
  "creador-ejecutor",
  "carga-justa",
  "reapertura",
  "complejidad",
  "esfuerzo",
  "horas-tarea",
  "procesos",
  "horario",
  "avance-sin-actividad",
  "bases",
];

export const DEV_DEFAULT: DevWidgetId[] = [
  "kpis",
  "kpis-extra",
  "chart-estado",
  "chart-tipo",
  "cola-personal",
  "metricas",
  "atrasadas",
  "tel-kpis",
  "tel-tareas",
  "tel-procesos",
  "tel-horario",
  "actividad",
  "accesos",
];

export type DashboardPrefs = {
  enabled: string[];
  layouts: LayoutItem[];
};

export function catalogFor(role: DashboardRole): WidgetMeta[] {
  return role === "manager" ? MANAGER_CATALOG : DEV_CATALOG;
}

export function defaultEnabledFor(role: DashboardRole): string[] {
  return role === "manager" ? [...MANAGER_DEFAULT] : [...DEV_DEFAULT];
}

export function storageKeyFor(role: DashboardRole) {
  return role === "manager" ? "exa-dashboard-manager-v9" : "exa-dashboard-dev-v5";
}

export function getDefaultPrefs(role: DashboardRole): DashboardPrefs {
  const catalog = catalogFor(role);
  return {
    enabled: defaultEnabledFor(role),
    layouts: catalog.map((w) => ({ ...w.defaultLayout })),
  };
}

export function loadPrefs(role: DashboardRole): DashboardPrefs {
  if (typeof window === "undefined") return getDefaultPrefs(role);
  try {
    const raw = localStorage.getItem(storageKeyFor(role));
    if (!raw) return getDefaultPrefs(role);
    const parsed = JSON.parse(raw) as DashboardPrefs;
    if (!Array.isArray(parsed.enabled) || !Array.isArray(parsed.layouts)) {
      return getDefaultPrefs(role);
    }
    const catalog = catalogFor(role);
    const known = new Set(catalog.map((w) => w.id));
    const enabled = parsed.enabled.filter((id) => known.has(id));
    const layouts = parsed.layouts.filter((l) => known.has(l.i));
    for (const w of catalog) {
      if (!layouts.some((l) => l.i === w.id)) layouts.push({ ...w.defaultLayout });
    }
    return {
      enabled: enabled.length ? enabled : getDefaultPrefs(role).enabled,
      layouts: layouts.length ? layouts : getDefaultPrefs(role).layouts,
    };
  } catch {
    return getDefaultPrefs(role);
  }
}

export function savePrefs(role: DashboardRole, prefs: DashboardPrefs) {
  if (typeof window === "undefined") return;
  localStorage.setItem(storageKeyFor(role), JSON.stringify(prefs));
}

export function metaFor(role: DashboardRole, id: string) {
  return catalogFor(role).find((w) => w.id === id)!;
}
