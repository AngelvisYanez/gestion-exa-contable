import type { PrismaClient } from "@prisma/client";
import { resolvePerCod } from "@/lib/auth/resolvePer";
import {
  TEAM_MEMBERS,
  matchTeamMember,
  normalizePanelRole,
  type UserRole,
} from "@/lib/auth/users";
import { getPrisma, sanitizeDbDis } from "@/lib/db";
import { EMPRESA_TAREAS, tasksEmpCod } from "@/lib/empresa";

export type EmpresaUsuario = {
  Usu_Cod: number;
  Prs_Cod: number;
  Per_Cod: number | null;
  Nombre: string;
  Cedula: string;
  Sucursal: string;
  enPanel: boolean;
  Pan_Rol: UserRole | null;
  Pan_Est: string | null;
};

const ready = new Set<string>();

export async function ensurePanelUsuarios(prisma: PrismaClient) {
  const key = (prisma as { _exaDbKey?: string })._exaDbKey || "default";
  if (ready.has(key)) return;
  // MySQL 5.5 rechaza DATETIME DEFAULT CURRENT_TIMESTAMP (error 1067).
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS aud_panel_usuarios (
      Pan_Cod INT NOT NULL AUTO_INCREMENT,
      Usu_Cod INT NOT NULL,
      Per_Cod INT NULL,
      Prs_Cod INT NULL,
      Pan_Nombre VARCHAR(180) NOT NULL,
      Pan_Cedula VARCHAR(20) NULL,
      Pan_Rol VARCHAR(20) NOT NULL DEFAULT 'developer',
      Pan_Est CHAR(1) NOT NULL DEFAULT 'A',
      Pan_Creado DATETIME NULL DEFAULT NULL,
      Pan_Actualizado DATETIME NULL DEFAULT NULL,
      PRIMARY KEY (Pan_Cod),
      UNIQUE KEY uq_panel_usu (Usu_Cod),
      KEY idx_panel_est_rol (Pan_Est, Pan_Rol),
      KEY idx_panel_per (Per_Cod),
      KEY idx_panel_prs (Prs_Cod)
    )
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE aud_panel_usuarios
      MODIFY Pan_Creado DATETIME NULL DEFAULT NULL,
      MODIFY Pan_Actualizado DATETIME NULL DEFAULT NULL
  `);
  await seedPanelIfEmpty(prisma);
  const left = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT COUNT(*) AS n FROM aud_panel_usuarios`
  );
  if (Number(left[0]?.n || 0) > 0) ready.add(key);
}

async function seedPanelIfEmpty(prisma: PrismaClient) {
  const n = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT COUNT(*) AS n FROM aud_panel_usuarios`
  );
  if (Number(n[0]?.n || 0) > 0) return;

  const emp = tasksEmpCod();
  const people = await prisma.$queryRawUnsafe<
    Array<{
      Usu_Cod: number;
      Prs_Cod: number;
      Usu_Ced: string | null;
      Prs_Ced: string | null;
      Nombre: string | null;
      Per_Cod: number | null;
    }>
  >(
    `SELECT u.Usu_Cod, u.Prs_Cod,
            CONVERT(u.Usu_Ced USING utf8mb4) AS Usu_Ced,
            CONVERT(p.Prs_Ced USING utf8mb4) AS Prs_Ced,
            TRIM(CONCAT(IFNULL(p.Prs_Ape,''), ' ', IFNULL(p.Prs_Nom,''))) AS Nombre,
            (
              SELECT per.Per_Cod FROM personal per
              WHERE per.Prs_Cod = u.Prs_Cod AND per.Emp_Cod = ? AND per.Per_Est = 'A'
              ORDER BY per.Per_Cod DESC LIMIT 1
            ) AS Per_Cod
     FROM usuarios u
     INNER JOIN persona p ON p.Prs_Cod = u.Prs_Cod
     INNER JOIN sucursal s ON s.Suc_Cod = u.Suc_Cod
     WHERE u.Usu_Est = 'A' AND s.Suc_Est = 'A' AND s.Emp_Cod = ?
     ORDER BY CASE WHEN u.Suc_Cod = ? THEN 0 ELSE 1 END, u.Usu_Cod ASC`,
    emp,
    emp,
    EMPRESA_TAREAS.sucCod
  );

  const seen = new Set<string>();
  for (const row of people) {
    const nombre = String(row.Nombre || "").trim();
    const team = matchTeamMember(nombre);
    if (!team || seen.has(team.name)) continue;
    seen.add(team.name);
    await prisma.$executeRawUnsafe(
      `INSERT INTO aud_panel_usuarios
        (Usu_Cod, Per_Cod, Prs_Cod, Pan_Nombre, Pan_Cedula, Pan_Rol, Pan_Est, Pan_Creado)
       VALUES (?, ?, ?, ?, ?, ?, 'A', NOW())`,
      Number(row.Usu_Cod),
      row.Per_Cod ? Number(row.Per_Cod) : null,
      Number(row.Prs_Cod),
      nombre || team.name,
      String(row.Usu_Ced || row.Prs_Ced || "").replace(/\D/g, "").slice(0, 20) || null,
      team.role
    );
  }
}

export async function listEmpresaUsuarios(dbDis: string): Promise<EmpresaUsuario[]> {
  const prisma = getPrisma(sanitizeDbDis(dbDis));
  await ensurePanelUsuarios(prisma);
  const emp = tasksEmpCod();
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      Usu_Cod: number;
      Prs_Cod: number;
      Suc_Cod: number | null;
      Nombre: string | null;
      Cedula: string | null;
      Sucursal: string | null;
      Per_Cod: number | null;
      Pan_Rol: string | null;
      Pan_Est: string | null;
    }>
  >(
    `SELECT u.Usu_Cod, u.Prs_Cod, u.Suc_Cod,
            TRIM(CONCAT(IFNULL(p.Prs_Ape,''), ' ', IFNULL(p.Prs_Nom,''))) AS Nombre,
            CONVERT(IFNULL(NULLIF(u.Usu_Ced,''), p.Prs_Ced) USING utf8mb4) AS Cedula,
            s.Suc_Des AS Sucursal,
            (
              SELECT per.Per_Cod FROM personal per
              WHERE per.Prs_Cod = u.Prs_Cod AND per.Emp_Cod = ? AND per.Per_Est = 'A'
              ORDER BY per.Per_Cod DESC LIMIT 1
            ) AS Per_Cod,
            pan.Pan_Rol, pan.Pan_Est
     FROM usuarios u
     INNER JOIN persona p ON p.Prs_Cod = u.Prs_Cod
     INNER JOIN sucursal s ON s.Suc_Cod = u.Suc_Cod
     LEFT JOIN aud_panel_usuarios pan ON pan.Usu_Cod = u.Usu_Cod
     WHERE u.Usu_Est = 'A' AND s.Suc_Est = 'A' AND s.Emp_Cod = ?
     ORDER BY Nombre ASC, CASE WHEN u.Suc_Cod = ? THEN 0 ELSE 1 END, u.Usu_Cod ASC`,
    emp,
    emp,
    EMPRESA_TAREAS.sucCod
  );

  const byUsu = new Map<number, EmpresaUsuario>();
  for (const r of rows) {
    const usu = Number(r.Usu_Cod);
    if (byUsu.has(usu)) continue;
    const activo = r.Pan_Est === "A";
    byUsu.set(usu, {
      Usu_Cod: usu,
      Prs_Cod: Number(r.Prs_Cod),
      Per_Cod: r.Per_Cod ? Number(r.Per_Cod) : null,
      Nombre: String(r.Nombre || "").trim() || `Usuario ${usu}`,
      Cedula: String(r.Cedula || "").trim(),
      Sucursal: String(r.Sucursal || "").trim(),
      enPanel: activo,
      Pan_Rol: activo ? normalizePanelRole(r.Pan_Rol) : null,
      Pan_Est: r.Pan_Est,
    });
  }
  return [...byUsu.values()].sort((a, b) => a.Nombre.localeCompare(b.Nombre, "es"));
}

async function countManagers(prisma: PrismaClient, exceptUsu = 0) {
  const rows = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT COUNT(*) AS n FROM aud_panel_usuarios
     WHERE Pan_Est = 'A' AND Pan_Rol = 'manager' AND Usu_Cod <> ?`,
    exceptUsu
  );
  return Number(rows[0]?.n || 0);
}

export async function setPanelUsuario(
  dbDis: string,
  usuCod: number,
  action: "add" | "remove" | "role",
  rol?: string
) {
  if (!usuCod || usuCod <= 0) throw new Error("Usu_Cod invalido");
  const prisma = getPrisma(sanitizeDbDis(dbDis));
  await ensurePanelUsuarios(prisma);
  const empresa = await listEmpresaUsuarios(dbDis);
  const person = empresa.find((u) => u.Usu_Cod === usuCod);
  if (!person) throw new Error("Ese usuario no pertenece a la empresa activa.");

  if (action === "remove") {
    const others = await countManagers(prisma, usuCod);
    const current = person.Pan_Rol;
    if (current === "manager" && others < 1) {
      throw new Error("Debe quedar al menos un encargado en la gestion.");
    }
    await prisma.$executeRawUnsafe(
      `UPDATE aud_panel_usuarios SET Pan_Est = 'I', Pan_Actualizado = NOW() WHERE Usu_Cod = ?`,
      usuCod
    );
    return;
  }

  const nextRol = normalizePanelRole(rol || person.Pan_Rol || "developer");
  if (person.Pan_Rol === "manager" && nextRol !== "manager") {
    const others = await countManagers(prisma, usuCod);
    if (others < 1) throw new Error("Debe quedar al menos un encargado en la gestion.");
  }

  const perCod =
    person.Per_Cod ||
    (await resolvePerCod(sanitizeDbDis(dbDis), {
      prsCod: person.Prs_Cod,
      cedula: person.Cedula,
      empCod: tasksEmpCod(),
    })) ||
    null;

  await prisma.$executeRawUnsafe(
    `INSERT INTO aud_panel_usuarios
      (Usu_Cod, Per_Cod, Prs_Cod, Pan_Nombre, Pan_Cedula, Pan_Rol, Pan_Est, Pan_Creado)
     VALUES (?, ?, ?, ?, ?, ?, 'A', NOW())
     ON DUPLICATE KEY UPDATE
       Per_Cod = VALUES(Per_Cod),
       Prs_Cod = VALUES(Prs_Cod),
       Pan_Nombre = VALUES(Pan_Nombre),
       Pan_Cedula = VALUES(Pan_Cedula),
       Pan_Rol = VALUES(Pan_Rol),
       Pan_Est = 'A',
       Pan_Actualizado = NOW()`,
    usuCod,
    perCod && perCod > 0 ? perCod : null,
    person.Prs_Cod,
    person.Nombre.slice(0, 180),
    person.Cedula.replace(/\D/g, "").slice(0, 20) || null,
    nextRol
  );
}

export async function findPanelActivo(
  prisma: PrismaClient,
  usuCod: number
): Promise<{ rol: UserRole; nombre: string; perCod: number; prsCod: number } | null> {
  await ensurePanelUsuarios(prisma);
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      Pan_Rol: string;
      Pan_Nombre: string;
      Per_Cod: number | null;
      Prs_Cod: number | null;
    }>
  >(
    `SELECT Pan_Rol, Pan_Nombre, Per_Cod, Prs_Cod
     FROM aud_panel_usuarios
     WHERE Usu_Cod = ? AND Pan_Est = 'A'
     LIMIT 1`,
    usuCod
  );
  const row = rows[0];
  if (!row) return null;
  return {
    rol: normalizePanelRole(row.Pan_Rol),
    nombre: row.Pan_Nombre,
    perCod: Number(row.Per_Cod || 0),
    prsCod: Number(row.Prs_Cod || 0),
  };
}

/** Per_Cod de quienes reciben tareas/tickets (encargado y desarrollador). */
export async function listPerCodAsignables(dbDis: string): Promise<number[]> {
  const prisma = getPrisma(sanitizeDbDis(dbDis));
  await ensurePanelUsuarios(prisma);
  const rows = await prisma.$queryRawUnsafe<Array<{ Per_Cod: number | null; Prs_Cod: number | null }>>(
    `SELECT Per_Cod, Prs_Cod FROM aud_panel_usuarios
     WHERE Pan_Est = 'A' AND Pan_Rol IN ('developer', 'manager')`
  );
  const out: number[] = [];
  for (const r of rows) {
    let per = Number(r.Per_Cod || 0);
    if (per <= 0 && r.Prs_Cod) {
      per = await resolvePerCod(sanitizeDbDis(dbDis), {
        prsCod: Number(r.Prs_Cod),
        empCod: tasksEmpCod(),
      });
    }
    if (per > 0 && !out.includes(per)) out.push(per);
  }
  return out;
}
