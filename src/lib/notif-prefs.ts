/**
 * Preferencias de notificaciones del panel (localStorage por navegador).
 */

import type { AppEventType } from "@/lib/events";

export const NOTIF_PREFS_KEY = "exa-tareas-notif-prefs";

export const NOTIF_EVENT_OPTIONS: Array<{
  type: Exclude<AppEventType, "heartbeat">;
  label: string;
  description: string;
}> = [
  {
    type: "tarea_asignada",
    label: "Tarea asignada",
    description: "Cuando te asignan o asignas una tarea",
  },
  {
    type: "ticket_asignado",
    label: "Ticket asignado",
    description: "Asignacion de tickets al equipo",
  },
  {
    type: "tarea_creada",
    label: "Tarea creada",
    description: "Altas de tareas nuevas (encargados)",
  },
  {
    type: "avance_registrado",
    label: "Avance registrado",
    description: "Reportes de avance de desarrolladores",
  },
  {
    type: "estado_cambiado",
    label: "Cambio de estado",
    description: "Transiciones Pendiente → Finalizada, etc.",
  },
  {
    type: "tarea_actualizada",
    label: "Tarea actualizada",
    description: "Ediciones de titulo, fechas o prioridad",
  },
  {
    type: "brief_generado",
    label: "Brief de desarrollo",
    description: "Cuando se genera el brief MD/PDF de una tarea",
  },
];

export type NotifPrefs = {
  toast: boolean;
  desktop: boolean;
  sound: boolean;
  types: Record<Exclude<AppEventType, "heartbeat">, boolean>;
};

export const DEFAULT_NOTIF_PREFS: NotifPrefs = {
  toast: true,
  desktop: true,
  sound: false,
  types: {
    tarea_asignada: true,
    ticket_asignado: true,
    tarea_creada: true,
    avance_registrado: true,
    estado_cambiado: true,
    tarea_actualizada: true,
    brief_generado: true,
  },
};

export function loadNotifPrefs(): NotifPrefs {
  if (typeof window === "undefined") return { ...DEFAULT_NOTIF_PREFS, types: { ...DEFAULT_NOTIF_PREFS.types } };
  try {
    const raw = window.localStorage.getItem(NOTIF_PREFS_KEY);
    if (!raw) return { ...DEFAULT_NOTIF_PREFS, types: { ...DEFAULT_NOTIF_PREFS.types } };
    const parsed = JSON.parse(raw) as Partial<NotifPrefs>;
    return {
      toast: parsed.toast !== false,
      desktop: parsed.desktop !== false,
      sound: !!parsed.sound,
      types: {
        ...DEFAULT_NOTIF_PREFS.types,
        ...(parsed.types || {}),
      },
    };
  } catch {
    return { ...DEFAULT_NOTIF_PREFS, types: { ...DEFAULT_NOTIF_PREFS.types } };
  }
}

export function saveNotifPrefs(prefs: NotifPrefs) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(prefs));
  window.dispatchEvent(new CustomEvent("exa-notif-prefs", { detail: prefs }));
}

export function isEventTypeEnabled(
  prefs: NotifPrefs,
  type: AppEventType
): boolean {
  if (type === "heartbeat") return false;
  return prefs.types[type] !== false;
}
