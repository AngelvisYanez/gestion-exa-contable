import type { UserRole } from "./users";

export const ROLE_PERMISSION_KEYS = [
  "tareas.ver",
  "tareas.crear",
  "tareas.editar",
  "tareas.asignar",
  "tareas.eliminar",
  "tareas.avance",
  "tickets.ver",
  "tickets.crear",
  "tickets.asignar",
  "tickets.avance",
] as const;

export type RolePermissionKey = (typeof ROLE_PERMISSION_KEYS)[number];
export type RolePermissions = Record<RolePermissionKey, boolean>;

/**
 * Version de los permisos por defecto. Se guarda en la cookie de sesion para
 * no arrastrar valores viejos cuando cambian los limites de un rol.
 */
export const PERMISSIONS_VERSION = 2;

export const ROLE_PERMISSION_LABELS: Record<RolePermissionKey, { modulo: string; accion: string }> = {
  "tareas.ver": { modulo: "Tareas", accion: "Ver" },
  "tareas.crear": { modulo: "Tareas", accion: "Crear" },
  "tareas.editar": { modulo: "Tareas", accion: "Editar contenido" },
  "tareas.asignar": { modulo: "Tareas", accion: "Asignar" },
  "tareas.eliminar": { modulo: "Tareas", accion: "Eliminar" },
  "tareas.avance": { modulo: "Tareas", accion: "Estado y avance" },
  "tickets.ver": { modulo: "Tickets", accion: "Ver" },
  "tickets.crear": { modulo: "Tickets", accion: "Crear" },
  "tickets.asignar": { modulo: "Tickets", accion: "Asignar" },
  "tickets.avance": { modulo: "Tickets", accion: "Estado y avance" },
};

const DEFAULTS: Record<UserRole, RolePermissions> = {
  manager: Object.fromEntries(ROLE_PERMISSION_KEYS.map((key) => [key, true])) as RolePermissions,
  atencion: {
    "tareas.ver": true,
    "tareas.crear": true,
    "tareas.editar": true,
    "tareas.asignar": true,
    "tareas.eliminar": false,
    "tareas.avance": true,
    "tickets.ver": true,
    "tickets.crear": true,
    "tickets.asignar": true,
    "tickets.avance": true,
  },
  developer: {
    "tareas.ver": true,
    "tareas.crear": true,
    "tareas.editar": true,
    "tareas.asignar": false,
    "tareas.eliminar": false,
    "tareas.avance": true,
    "tickets.ver": true,
    "tickets.crear": false,
    // Puede asignarse tickets, pero solo a si mismo (se valida en la API).
    "tickets.asignar": true,
    "tickets.avance": true,
  },
};

export function defaultRolePermissions(role: UserRole): RolePermissions {
  return { ...DEFAULTS[role] };
}

export function isRolePermissionKey(value: string): value is RolePermissionKey {
  return ROLE_PERMISSION_KEYS.includes(value as RolePermissionKey);
}

/** Los ajustes solo pueden restringir las acciones que el rol ya tenia. */
export function effectiveRolePermissions(
  role: UserRole,
  overrides?: Partial<Record<RolePermissionKey, boolean>>
): RolePermissions {
  const defaults = DEFAULTS[role];
  return Object.fromEntries(
    ROLE_PERMISSION_KEYS.map((key) => [key, defaults[key] && overrides?.[key] !== false])
  ) as RolePermissions;
}

export function encodeRolePermissions(role: UserRole, permissions?: Partial<RolePermissions>): string {
  const effective = effectiveRolePermissions(role, permissions);
  return ROLE_PERMISSION_KEYS.map((key) => effective[key] ? "1" : "0").join("");
}

export function decodeRolePermissions(
  role: UserRole,
  encoded?: string | null,
  version = PERMISSIONS_VERSION
): RolePermissions {
  const overrides = encoded && encoded.length === ROLE_PERMISSION_KEYS.length && !/[^01]/.test(encoded)
    ? (Object.fromEntries(
        ROLE_PERMISSION_KEYS.map((key, index) => [key, encoded[index] === "1"])
      ) as RolePermissions)
    : undefined;
  const permissions = effectiveRolePermissions(role, overrides);
  // Las cookies anteriores a la version 2 se firmaron cuando el desarrollador
  // no podia asignar tickets, por eso guardan un 0 que ya no aplica.
  if (version < PERMISSIONS_VERSION && role === "developer") {
    permissions["tickets.asignar"] = DEFAULTS.developer["tickets.asignar"];
  }
  return permissions;
}

export function hasRolePermission(
  actor: { role: UserRole; permissions?: Partial<RolePermissions> } | null | undefined,
  key: RolePermissionKey
): boolean {
  if (!actor) return false;
  const permissions = effectiveRolePermissions(actor.role, actor.permissions);
  if (key.startsWith("tareas.") && key !== "tareas.ver") {
    return permissions["tareas.ver"] && permissions[key];
  }
  if (key.startsWith("tickets.") && key !== "tickets.ver") {
    return permissions["tickets.ver"] && permissions[key];
  }
  return permissions[key];
}
