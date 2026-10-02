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
  | "actividad"
  | "accesos";

export type DevWidgetId =
  | "kpis"
  | "kpis-extra"
  | "chart-estado"
  | "chart-tipo"
  | "cola-personal"
  | "metricas"
  | "atrasadas"
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
    id: "actividad",
    title: "Actividad en vivo",
    description: "Notificaciones recientes",
    defaultLayout: { i: "actividad", x: 8, y: 19, w: 4, h: 8, minW: 3, minH: 5 },
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
    id: "actividad",
    title: "Notificaciones",
    description: "Eventos en tiempo real",
    defaultLayout: { i: "actividad", x: 0, y: 23, w: 6, h: 6, minW: 3, minH: 4 },
  },
  {
    id: "accesos",
    title: "Accesos rapidos",
    description: "Ir a Mis tareas y reporte",
    defaultLayout: { i: "accesos", x: 6, y: 23, w: 6, h: 6, minW: 3, minH: 3 },
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
  "chart-estado",
  "chart-prioridad",
  "actividad",
  "rendimiento-barras",
  "carga-asignado",
  "avance-persona",
];

export const DEV_DEFAULT: DevWidgetId[] = [
  "kpis",
  "kpis-extra",
  "chart-estado",
  "chart-tipo",
  "cola-personal",
  "metricas",
  "atrasadas",
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
  return role === "manager" ? "exa-dashboard-manager-v5" : "exa-dashboard-dev-v4";
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
