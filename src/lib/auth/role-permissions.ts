import type { UserRole } from "./users";

/**
 * Orden fijo: la cookie de sesion guarda un bit por permiso. Los primeros 10
 * coinciden con la version anterior para poder leer cookies viejas.
 */
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
  "tickets.convertir",
  "tickets.reabrir",
  "mis_tareas.ver",
  "capacitaciones.ver",
  "capacitaciones.gestionar",
  "plan_accion.ver",
  "monitoreo.ver",
  "configuracion.administrar",
] as const;

export type RolePermissionKey = (typeof ROLE_PERMISSION_KEYS)[number];
export type RolePermissions = Record<RolePermissionKey, boolean>;

/** Cantidad de permisos que guardaban las cookies anteriores a la version 3. */
const LEGACY_KEY_COUNT = 10;

/**
 * Version de la cookie de permisos. La 3 guarda todos los permisos y ya no
 * limita a los valores iniciales del rol.
 */
export const PERMISSIONS_VERSION = 3;

export type RolePermissionInfo = {
  key: RolePermissionKey;
  modulo: string;
  accion: string;
  descripcion: string;
};

/** Catalogo que muestra la pantalla de permisos, agrupado por modulo. */
export const ROLE_PERMISSION_CATALOG: RolePermissionInfo[] = [
  { key: "tareas.ver", modulo: "Tareas", accion: "Ver", descripcion: "Entrar al modulo de tareas." },
  { key: "tareas.crear", modulo: "Tareas", accion: "Crear", descripcion: "Registrar tareas nuevas." },
  { key: "tareas.editar", modulo: "Tareas", accion: "Editar contenido", descripcion: "Cambiar titulo, descripcion, fechas y apoyo." },
  { key: "tareas.asignar", modulo: "Tareas", accion: "Asignar", descripcion: "Asignar tareas a otras personas." },
  { key: "tareas.eliminar", modulo: "Tareas", accion: "Eliminar", descripcion: "Borrar tareas." },
  { key: "tareas.avance", modulo: "Tareas", accion: "Estado y avance", descripcion: "Registrar avances y cambiar el estado." },
  { key: "tickets.ver", modulo: "Tickets", accion: "Ver", descripcion: "Entrar a la bandeja de tickets y a Mis tickets." },
  { key: "tickets.crear", modulo: "Tickets", accion: "Crear", descripcion: "Registrar tickets nuevos." },
  { key: "tickets.asignar", modulo: "Tickets", accion: "Asignar", descripcion: "Asignar tickets (el desarrollador solo a si mismo)." },
  { key: "tickets.avance", modulo: "Tickets", accion: "Estado y avance", descripcion: "Registrar avances y cambiar el estado." },
  { key: "tickets.convertir", modulo: "Tickets", accion: "Convertir en tarea", descripcion: "Crear una tarea a partir de un ticket." },
  { key: "tickets.reabrir", modulo: "Tickets", accion: "Reabrir", descripcion: "Reabrir tickets cerrados." },
  { key: "mis_tareas.ver", modulo: "Mis tareas", accion: "Ver asignadas", descripcion: "Ver el trabajo asignado a la persona." },
  { key: "capacitaciones.ver", modulo: "Capacitaciones", accion: "Ver y programar", descripcion: "Ver el calendario y programar capacitaciones propias." },
  { key: "capacitaciones.gestionar", modulo: "Capacitaciones", accion: "Gestionar", descripcion: "Elegir responsable, finalizar y eliminar capacitaciones." },
  { key: "plan_accion.ver", modulo: "Plan de accion", accion: "Ver", descripcion: "Plan de accion e incidencias." },
  { key: "monitoreo.ver", modulo: "Monitoreo", accion: "Ver", descripcion: "Monitoreo, dashboard del equipo y capturas." },
  { key: "configuracion.administrar", modulo: "Configuracion", accion: "Administrar", descripcion: "Usuarios, permisos y ajustes de la gestion." },
];

export const ROLE_PERMISSION_LABELS = Object.fromEntries(
  ROLE_PERMISSION_CATALOG.map((p) => [p.key, { modulo: p.modulo, accion: p.accion }])
) as Record<RolePermissionKey, { modulo: string; accion: string }>;

/** Acciones que solo tienen sentido si el modulo esta abierto. */
const REQUIERE: Partial<Record<RolePermissionKey, RolePermissionKey>> = {
  "tareas.crear": "tareas.ver",
  "tareas.editar": "tareas.ver",
  "tareas.asignar": "tareas.ver",
  "tareas.eliminar": "tareas.ver",
  "tareas.avance": "tareas.ver",
  "tickets.crear": "tickets.ver",
  "tickets.asignar": "tickets.ver",
  "tickets.avance": "tickets.ver",
  "tickets.convertir": "tickets.ver",
  "tickets.reabrir": "tickets.ver",
  "capacitaciones.gestionar": "capacitaciones.ver",
};

export function permissionRequires(key: RolePermissionKey): RolePermissionKey | null {
  return REQUIERE[key] ?? null;
}

/**
 * Permisos que no se pueden apagar: sin ellos el encargado perderia el acceso
 * a esta misma pantalla y nadie podria volver a activarlos.
 */
export function isLockedPermission(role: UserRole, key: RolePermissionKey): boolean {
  return role === "manager" && key === "configuracion.administrar";
}

/** Valores iniciales de cada rol. Solo son el punto de partida: todos se pueden cambiar. */
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
    "tickets.convertir": true,
    "tickets.reabrir": false,
    "mis_tareas.ver": true,
    "capacitaciones.ver": false,
    "capacitaciones.gestionar": false,
    "plan_accion.ver": false,
    "monitoreo.ver": false,
    "configuracion.administrar": false,
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
    "tickets.convertir": false,
    "tickets.reabrir": false,
    "mis_tareas.ver": true,
    "capacitaciones.ver": true,
    "capacitaciones.gestionar": false,
    "plan_accion.ver": false,
    "monitoreo.ver": false,
    "configuracion.administrar": false,
  },
};

export function defaultRolePermissions(role: UserRole): RolePermissions {
  return { ...DEFAULTS[role] };
}

export function isRolePermissionKey(value: string): value is RolePermissionKey {
  return ROLE_PERMISSION_KEYS.includes(value as RolePermissionKey);
}

/**
 * Permisos efectivos: el ajuste guardado manda sobre el valor inicial, tanto para
 * quitar como para dar un permiso. Solo el bloqueado del encargado se fuerza.
 */
export function effectiveRolePermissions(
  role: UserRole,
  overrides?: Partial<Record<RolePermissionKey, boolean>>
): RolePermissions {
  const defaults = DEFAULTS[role];
  return Object.fromEntries(
    ROLE_PERMISSION_KEYS.map((key) => {
      if (isLockedPermission(role, key)) return [key, true];
      const override = overrides?.[key];
      return [key, typeof override === "boolean" ? override : defaults[key]];
    })
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
  let overrides: Partial<RolePermissions> | undefined;
  if (encoded && !/[^01]/.test(encoded)) {
    // Una cookie vieja trae solo los primeros permisos; los nuevos usan el valor inicial.
    const count =
      encoded.length === ROLE_PERMISSION_KEYS.length
        ? ROLE_PERMISSION_KEYS.length
        : encoded.length === LEGACY_KEY_COUNT
          ? LEGACY_KEY_COUNT
          : 0;
    if (count) {
      overrides = Object.fromEntries(
        ROLE_PERMISSION_KEYS.slice(0, count).map((key, index) => [key, encoded[index] === "1"])
      ) as Partial<RolePermissions>;
    }
  }
  const permissions = effectiveRolePermissions(role, overrides);
  // Las cookies anteriores a la version 2 se firmaron cuando el desarrollador
  // no podia asignar tickets, por eso guardan un 0 que ya no aplica.
  if (version < 2 && role === "developer") {
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
  const parent = permissionRequires(key);
  if (parent) return permissions[parent] && permissions[key];
  return permissions[key];
}

/** Verdadero si el actor tiene al menos uno de los permisos. */
export function hasAnyRolePermission(
  actor: { role: UserRole; permissions?: Partial<RolePermissions> } | null | undefined,
  keys: RolePermissionKey[]
): boolean {
  return keys.some((key) => hasRolePermission(actor, key));
}
