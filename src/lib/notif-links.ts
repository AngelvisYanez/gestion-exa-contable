/**
 * A qué pantalla lleva cada notificación al hacer clic.
 *
 * - Encargado / atención: listados generales (`/tareas`, `/tickets`).
 * - Desarrollador (o sin permiso al listado general): sus bandejas
 *   (`/mis-tareas`, `/mis-tickets`).
 * Todas abren directamente el detalle del elemento con `?detalle=` (y `&db=` en tickets).
 */

import { hasRolePermission } from "./auth/role-permissions";
import type { AppEvent } from "./events";

type Actor = Parameters<typeof hasRolePermission>[0];

export type NotificationTarget = {
  href: string;
  /** Texto del botón/enlace, p. ej. «Ver tarea #12». */
  label: string;
  kind: "tarea" | "ticket";
};

type LinkableEvent = Pick<AppEvent, "kind" | "tarCod" | "ticCod" | "db" | "sinEnlace">;

export function eventKind(e: Pick<AppEvent, "kind" | "tarCod" | "ticCod">): "tarea" | "ticket" | null {
  if (e.kind === "ticket" && e.ticCod) return "ticket";
  if (e.tarCod) return "tarea";
  if (e.ticCod) return "ticket";
  return null;
}

export function notificationTarget(e: LinkableEvent, user: Actor): NotificationTarget | null {
  if (!user || e.sinEnlace) return null;
  const kind = eventKind(e);
  const general = user.role !== "developer";

  if (kind === "ticket" && e.ticCod && e.db) {
    if (!hasRolePermission(user, "tickets.ver")) return null;
    const qs = new URLSearchParams({ detalle: String(e.ticCod), db: e.db });
    return {
      href: `${general ? "/tickets" : "/mis-tickets"}?${qs}`,
      label: `Ver ticket #${e.ticCod}`,
      kind: "ticket",
    };
  }

  if (kind === "tarea" && e.tarCod) {
    const qs = new URLSearchParams({ detalle: String(e.tarCod) });
    const path = general && hasRolePermission(user, "tareas.ver") ? "/tareas" : "/mis-tareas";
    return { href: `${path}?${qs}`, label: `Ver tarea #${e.tarCod}`, kind: "tarea" };
  }

  return null;
}
