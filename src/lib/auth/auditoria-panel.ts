import { getPrisma } from "@/lib/db";
import { tasksDbDis } from "@/lib/empresa";
import { endOfDayZona, startOfDayZona } from "@/lib/timezone";

import { ACCIONES_AUDITORIA, type AccionAuditoria, type FilaAuditoria } from "./auditoria-acciones";

/**
 * Bitacora de todo lo que toca permisos y roles dentro de la gestion.
 * Las fechas se guardan en UTC y se muestran en la zona de Guayaquil.
 */
export type ActorAuditoria = {
  usuCod?: number | null;
  nombre?: string | null;
  rol?: string | null;
  ip?: string | null;
};

export type EntradaAuditoria = {
  accion: AccionAuditoria;
  actor?: ActorAuditoria | null;
  objetivoUsuCod?: number | null;
  objetivoNombre?: string | null;
  rol?: string | null;
  permiso?: string | null;
  anterior?: string | null;
  nuevo?: string | null;
  detalle?: string | null;
};

export const ACTOR_SISTEMA: ActorAuditoria = { nombre: "Sistema", rol: null };

const ready = new Set<string>();

async function ensureTable(db: string) {
  if (ready.has(db)) return;
  await getPrisma(db).$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS aud_panel_auditoria (
      Aud_Cod INT NOT NULL AUTO_INCREMENT,
      Aud_Fecha DATETIME NULL DEFAULT NULL,
      Aud_Accion VARCHAR(40) NOT NULL,
      Aud_Actor_Usu INT NULL,
      Aud_Actor_Nombre VARCHAR(180) NULL,
      Aud_Actor_Rol VARCHAR(20) NULL,
      Aud_Objetivo_Usu INT NULL,
      Aud_Objetivo_Nombre VARCHAR(180) NULL,
      Aud_Rol VARCHAR(20) NULL,
      Aud_Permiso VARCHAR(40) NULL,
      Aud_Anterior VARCHAR(60) NULL,
      Aud_Nuevo VARCHAR(60) NULL,
      Aud_Detalle VARCHAR(500) NULL,
      Aud_Ip VARCHAR(64) NULL,
      PRIMARY KEY (Aud_Cod),
      KEY idx_aud_panel_fecha (Aud_Fecha),
      KEY idx_aud_panel_accion (Aud_Accion)
    ) DEFAULT CHARSET=utf8mb4
  `);
  ready.add(db);
}

function corto(v: string | number | null | undefined, max: number): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

/** Ip del cliente tras el proxy (Nginx); vacia si no se puede determinar. */
export function ipDeRequest(req: { headers: { get(name: string): string | null } }): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  const ip = (fwd ? fwd.split(",")[0] : req.headers.get("x-real-ip")) || "";
  return corto(ip, 64);
}

/** Actor de la bitacora a partir de la sesion del panel. */
export function actorDeSesion(
  session: { usuCod?: number; name?: string; role?: string } | null | undefined,
  req?: { headers: { get(name: string): string | null } }
): ActorAuditoria {
  return {
    usuCod: session?.usuCod || null,
    nombre: session?.name || null,
    rol: session?.role || null,
    ip: req ? ipDeRequest(req) : null,
  };
}

/** Registra un evento. Nunca lanza error: la bitacora no debe frenar la operacion. */
export async function registrarAuditoria(entry: EntradaAuditoria): Promise<void> {
  try {
    const db = tasksDbDis();
    await ensureTable(db);
    const actor = entry.actor || ACTOR_SISTEMA;
    await getPrisma(db).$executeRawUnsafe(
      `INSERT INTO aud_panel_auditoria
        (Aud_Fecha, Aud_Accion, Aud_Actor_Usu, Aud_Actor_Nombre, Aud_Actor_Rol,
         Aud_Objetivo_Usu, Aud_Objetivo_Nombre, Aud_Rol, Aud_Permiso,
         Aud_Anterior, Aud_Nuevo, Aud_Detalle, Aud_Ip)
       VALUES (UTC_TIMESTAMP(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      entry.accion,
      actor.usuCod && actor.usuCod > 0 ? actor.usuCod : null,
      corto(actor.nombre, 180),
      corto(actor.rol, 20),
      entry.objetivoUsuCod && entry.objetivoUsuCod > 0 ? entry.objetivoUsuCod : null,
      corto(entry.objetivoNombre, 180),
      corto(entry.rol, 20),
      corto(entry.permiso, 40),
      corto(entry.anterior, 60),
      corto(entry.nuevo, 60),
      corto(entry.detalle, 500),
      corto(actor.ip, 64)
    );
  } catch (err) {
    console.error("[auditoria] no se pudo registrar:", err instanceof Error ? err.message : err);
  }
}

export type FiltroAuditoria = {
  q?: string;
  accion?: string;
  desde?: string;
  hasta?: string;
  page?: number;
  pageSize?: number;
};

export async function listAuditoria(filtro: FiltroAuditoria = {}) {
  const db = tasksDbDis();
  await ensureTable(db);
  const prisma = getPrisma(db);

  const where: string[] = [];
  const params: Array<string | number> = [];

  const q = String(filtro.q || "").trim().slice(0, 80);
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    where.push(
      `(Aud_Actor_Nombre LIKE ? OR Aud_Objetivo_Nombre LIKE ? OR Aud_Detalle LIKE ? OR Aud_Permiso LIKE ?)`
    );
    params.push(like, like, like, like);
  }
  if (filtro.accion && filtro.accion in ACCIONES_AUDITORIA) {
    where.push(`Aud_Accion = ?`);
    params.push(filtro.accion);
  }
  const ymd = /^\d{4}-\d{2}-\d{2}$/;
  if (filtro.desde && ymd.test(filtro.desde)) {
    where.push(`Aud_Fecha >= ?`);
    params.push(startOfDayZona(filtro.desde).toISOString().slice(0, 19).replace("T", " "));
  }
  if (filtro.hasta && ymd.test(filtro.hasta)) {
    where.push(`Aud_Fecha <= ?`);
    params.push(endOfDayZona(filtro.hasta).toISOString().slice(0, 19).replace("T", " "));
  }
  const cond = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const pageSize = Math.min(100, Math.max(5, Math.floor(filtro.pageSize || 20)));
  const page = Math.max(1, Math.floor(filtro.page || 1));

  const totalRows = await prisma.$queryRawUnsafe<Array<{ n: number | bigint }>>(
    `SELECT COUNT(*) AS n FROM aud_panel_auditoria ${cond}`,
    ...params
  );
  const total = Number(totalRows[0]?.n || 0);

  const rows = await prisma.$queryRawUnsafe<
    Array<{
      Aud_Cod: number | bigint;
      Aud_Fecha: string | null;
      Aud_Accion: string;
      Aud_Actor_Usu: number | bigint | null;
      Aud_Actor_Nombre: string | null;
      Aud_Actor_Rol: string | null;
      Aud_Objetivo_Usu: number | bigint | null;
      Aud_Objetivo_Nombre: string | null;
      Aud_Rol: string | null;
      Aud_Permiso: string | null;
      Aud_Anterior: string | null;
      Aud_Nuevo: string | null;
      Aud_Detalle: string | null;
      Aud_Ip: string | null;
    }>
  >(
    `SELECT Aud_Cod,
            DATE_FORMAT(Aud_Fecha, '%Y-%m-%dT%H:%i:%sZ') AS Aud_Fecha,
            Aud_Accion, Aud_Actor_Usu, Aud_Actor_Nombre, Aud_Actor_Rol,
            Aud_Objetivo_Usu, Aud_Objetivo_Nombre, Aud_Rol, Aud_Permiso,
            Aud_Anterior, Aud_Nuevo, Aud_Detalle, Aud_Ip
     FROM aud_panel_auditoria ${cond}
     ORDER BY Aud_Cod DESC
     LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    ...params
  );

  const filas: FilaAuditoria[] = rows.map((r) => ({
    Aud_Cod: Number(r.Aud_Cod),
    Aud_Fecha: r.Aud_Fecha || "",
    Aud_Accion: r.Aud_Accion,
    Aud_Actor_Usu: r.Aud_Actor_Usu == null ? null : Number(r.Aud_Actor_Usu),
    Aud_Actor_Nombre: r.Aud_Actor_Nombre || "",
    Aud_Actor_Rol: r.Aud_Actor_Rol || "",
    Aud_Objetivo_Usu: r.Aud_Objetivo_Usu == null ? null : Number(r.Aud_Objetivo_Usu),
    Aud_Objetivo_Nombre: r.Aud_Objetivo_Nombre || "",
    Aud_Rol: r.Aud_Rol || "",
    Aud_Permiso: r.Aud_Permiso || "",
    Aud_Anterior: r.Aud_Anterior || "",
    Aud_Nuevo: r.Aud_Nuevo || "",
    Aud_Detalle: r.Aud_Detalle || "",
    Aud_Ip: r.Aud_Ip || "",
  }));

  return {
    filas,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}