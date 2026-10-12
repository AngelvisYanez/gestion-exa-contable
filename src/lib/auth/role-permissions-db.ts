import { getPrisma } from "@/lib/db";
import type { UserRole } from "./users";
import {
  defaultRolePermissions,
  effectiveRolePermissions,
  isRolePermissionKey,
  type RolePermissionKey,
  type RolePermissions,
} from "./role-permissions";

const ready = new Set<string>();

async function ensureTable(db: string) {
  if (ready.has(db)) return;
  await getPrisma(db).$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS aud_panel_permisos_rol (
      Pan_Rol VARCHAR(20) NOT NULL,
      Perm_Codigo VARCHAR(40) NOT NULL,
      Perm_Habilitado TINYINT(1) NOT NULL DEFAULT 1,
      PRIMARY KEY (Pan_Rol, Perm_Codigo)
    )
  `);
  ready.add(db);
}

export async function loadRolePermissions(db: string, role: UserRole): Promise<RolePermissions> {
  await ensureTable(db);
  const rows = await getPrisma(db).$queryRawUnsafe<Array<{ Perm_Codigo: string; Perm_Habilitado: number }>>(
    `SELECT Perm_Codigo, Perm_Habilitado FROM aud_panel_permisos_rol WHERE Pan_Rol = ?`,
    role
  );
  const overrides: Partial<RolePermissions> = {};
  for (const row of rows) {
    if (isRolePermissionKey(row.Perm_Codigo)) {
      overrides[row.Perm_Codigo] = Number(row.Perm_Habilitado) === 1;
    }
  }
  return effectiveRolePermissions(role, overrides);
}

export async function listRolePermissions(db: string): Promise<Record<UserRole, RolePermissions>> {
  await ensureTable(db);
  const [manager, atencion, developer] = await Promise.all([
    loadRolePermissions(db, "manager"),
    loadRolePermissions(db, "atencion"),
    loadRolePermissions(db, "developer"),
  ]);
  return { manager, atencion, developer };
}

export async function setRolePermission(
  db: string,
  role: UserRole,
  key: RolePermissionKey,
  enabled: boolean
): Promise<void> {
  if (enabled && !defaultRolePermissions(role)[key]) {
    throw new Error("Este rol no puede recibir ese permiso.");
  }
  await ensureTable(db);
  await getPrisma(db).$executeRawUnsafe(
    `INSERT INTO aud_panel_permisos_rol (Pan_Rol, Perm_Codigo, Perm_Habilitado)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE Perm_Habilitado = VALUES(Perm_Habilitado)`,
    role,
    key,
    enabled ? 1 : 0
  );
}
