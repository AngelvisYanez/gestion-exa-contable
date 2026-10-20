import type { PrismaClient } from "@prisma/client";
import { getPrisma, sanitizeDbDis } from "./db";
import { tasksDbDis } from "./empresa";

/**
 * Vínculo ticket ↔ tarea ("Convertir a tarea").
 *
 * El panel usa la tabla legacy `tickets` para los tickets y `aud_tareas` para
 * las tareas; no hay FK entre ambas. Guardamos el vínculo en una tabla puente
 * dentro de la BD de tareas (EXA) con el código y la base del ticket, para poder
 * resolver el ticket aunque viva en Servicios o Relavera.
 *
 * Cuando la tarea alcanza el 100% de avance, `resolverTicketsDeTarea` cierra el
 * ticket vinculado.
 */

const ready = new Set<string>();
const missing = new Set<string>();

function dbKey(prisma: PrismaClient): string {
  return (prisma as PrismaClient & { _exaDbKey?: string })._exaDbKey || "default";
}

/** MySQL 5.5: sin DEFAULT CURRENT_TIMESTAMP; la fecha va en cada INSERT. */
export async function ensureTicketTareaLink(prisma: PrismaClient) {
  const key = dbKey(prisma);
  if (ready.has(key) || missing.has(key)) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS aud_ticket_tarea (
        Vin_Cod INT NOT NULL AUTO_INCREMENT,
        Tic_Cod BIGINT NOT NULL,
        Tic_Db VARCHAR(40) NULL,
        Tar_Cod INT NOT NULL,
        Vin_Fecha DATETIME NULL,
        Vin_Est CHAR(1) NOT NULL DEFAULT 'A',
        PRIMARY KEY (Vin_Cod),
        KEY idx_vtt_tar (Tar_Cod, Vin_Est),
        KEY idx_vtt_tic (Tic_Cod, Tic_Db, Vin_Est)
      )
    `);
    ready.add(key);
  } catch {
    // La tabla pudo existir ya (carrera de CREATE concurrente): confirma lectura.
    try {
      await prisma.$queryRawUnsafe(`SELECT 1 FROM aud_ticket_tarea LIMIT 1`);
      ready.add(key);
    } catch {
      missing.add(key);
    }
  }
}

function ticketTareaLinkEnabled(prisma: PrismaClient): boolean {
  return ready.has(dbKey(prisma));
}

/** Clave normalizada del vínculo (Tic_Cod + base). */
export function ticketTareaKey(ticCod: number, ticDb?: string | null): string {
  const db = String(ticDb || "").trim();
  return `${ticCod}::${db}`;
}

async function linkPrisma(): Promise<PrismaClient | null> {
  try {
    const prisma = getPrisma(tasksDbDis());
    await ensureTicketTareaLink(prisma);
    return ticketTareaLinkEnabled(prisma) ? prisma : null;
  } catch (err) {
    console.error(
      "[ticket-tarea] no se pudo preparar el vínculo:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

/** Tarea vinculada a un ticket, si existe. */
export async function tareaVinculadaDeTicket(
  ticCod: number,
  ticDb?: string | null
): Promise<number | null> {
  if (!Number.isFinite(ticCod) || ticCod <= 0) return null;
  const prisma = await linkPrisma();
  if (!prisma) return null;
  const db = ticDb ? sanitizeDbDis(ticDb) : null;
  const rows = db
    ? await prisma.$queryRawUnsafe<Array<{ Tar_Cod: number | bigint }>>(
        `SELECT Tar_Cod FROM aud_ticket_tarea
         WHERE Vin_Est = 'A' AND Tic_Cod = ? AND (Tic_Db = ? OR Tic_Db IS NULL)
         ORDER BY Vin_Cod DESC LIMIT 1`,
        ticCod,
        db
      )
    : await prisma.$queryRawUnsafe<Array<{ Tar_Cod: number | bigint }>>(
        `SELECT Tar_Cod FROM aud_ticket_tarea
         WHERE Vin_Est = 'A' AND Tic_Cod = ?
         ORDER BY Vin_Cod DESC LIMIT 1`,
        ticCod
      );
  const found = rows.length ? Number(rows[0].Tar_Cod) : NaN;
  return Number.isFinite(found) && found > 0 ? found : null;
}

/** Crea el vínculo activo ticket → tarea (reemplaza cualquier vínculo previo). */
export async function linkTicketTarea(opts: {
  tarCod: number;
  ticCod: number;
  ticDb?: string | null;
}): Promise<void> {
  if (!opts.tarCod || opts.tarCod <= 0 || !opts.ticCod || opts.ticCod <= 0) {
    throw new Error("Datos de vínculo ticket-tarea incompletos.");
  }
  const prisma = await linkPrisma();
  if (!prisma) throw new Error("No se pudo preparar el vínculo ticket-tarea.");
  const db = opts.ticDb ? sanitizeDbDis(opts.ticDb) : null;
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `UPDATE aud_ticket_tarea SET Vin_Est = 'I'
       WHERE Vin_Est = 'A' AND Tic_Cod = ? AND (Tic_Db <=> ?)`,
      opts.ticCod,
      db
    );
    await tx.$executeRawUnsafe(
      `INSERT INTO aud_ticket_tarea (Tic_Cod, Tic_Db, Tar_Cod, Vin_Fecha, Vin_Est)
       VALUES (?, ?, ?, NOW(), 'A')`,
      opts.ticCod,
      db,
      opts.tarCod
    );
  });
}

/** Adjunta el Tar_Cod vinculado a una lista de tickets (mutación in-place). */
export async function attachTareaVinculada<
  T extends { Tic_Cod: number; Db_Origen?: string | null; Tar_Cod?: number | null },
>(tickets: T[]): Promise<void> {
  if (!tickets.length) return;
  const prisma = await linkPrisma();
  if (!prisma) return;
  const ids = [...new Set(tickets.map((t) => t.Tic_Cod).filter((n) => n > 0))];
  if (!ids.length) return;
  const marks = ids.map(() => "?").join(",");
  try {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ Tic_Cod: number | bigint; Tic_Db: string | null; Tar_Cod: number | bigint }>
    >(
      `SELECT Tic_Cod, Tic_Db, Tar_Cod FROM aud_ticket_tarea
       WHERE Vin_Est = 'A' AND Tic_Cod IN (${marks})`,
      ...ids
    );
    const byKey = new Map<string, number>();
    const byCode = new Map<number, number>();
    for (const r of rows) {
      const cod = Number(r.Tic_Cod);
      const tar = Number(r.Tar_Cod);
      if (!Number.isFinite(cod) || !Number.isFinite(tar) || tar <= 0) continue;
      byKey.set(ticketTareaKey(cod, r.Tic_Db), tar);
      // El mismo Tic_Cod puede existir en varias bases: conserva el primero.
      if (!byCode.has(cod)) byCode.set(cod, tar);
    }
    for (const t of tickets) {
      const coded = byKey.get(ticketTareaKey(t.Tic_Cod, t.Db_Origen));
      const fallback = t.Db_Origen ? undefined : byCode.get(t.Tic_Cod);
      const found = coded ?? fallback;
      if (found) t.Tar_Cod = found;
    }
  } catch (err) {
    console.error(
      "[ticket-tarea] no se pudo leer el vínculo:",
      err instanceof Error ? err.message : err
    );
  }
}

/** Tickets vinculados a una tarea. */
export async function ticketsDeTarea(
  tarCod: number
): Promise<Array<{ Tic_Cod: number; Tic_Db: string | null }>> {
  if (!Number.isFinite(tarCod) || tarCod <= 0) return [];
  const prisma = await linkPrisma();
  if (!prisma) return [];
  try {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ Tic_Cod: number | bigint; Tic_Db: string | null }>
    >(
      `SELECT Tic_Cod, Tic_Db FROM aud_ticket_tarea
       WHERE Vin_Est = 'A' AND Tar_Cod = ?
       ORDER BY Vin_Cod ASC`,
      tarCod
    );
    return rows.map((r) => ({
      Tic_Cod: Number(r.Tic_Cod),
      Tic_Db: r.Tic_Db != null ? String(r.Tic_Db) : null,
    }));
  } catch (err) {
    console.error(
      "[ticket-tarea] no se pudieron leer los tickets vinculados:",
      err instanceof Error ? err.message : err
    );
    return [];
  }
}

/** Tickets vinculados a varias tareas (una sola consulta sobre la tabla puente). */
export async function ticketsDeTareas(
  tarCodes: number[]
): Promise<Array<{ Tar_Cod: number; Tic_Cod: number; Tic_Db: string | null }>> {
  const ids = [...new Set(tarCodes.filter((n) => Number.isFinite(n) && n > 0))];
  if (!ids.length) return [];
  const prisma = await linkPrisma();
  if (!prisma) return [];
  try {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ Tar_Cod: number | bigint; Tic_Cod: number | bigint; Tic_Db: string | null }>
    >(
      `SELECT Tar_Cod, Tic_Cod, Tic_Db FROM aud_ticket_tarea
       WHERE Vin_Est = 'A' AND Tar_Cod IN (${ids.map(() => "?").join(",")})
       ORDER BY Vin_Cod ASC`,
      ...ids
    );
    return rows.map((r) => ({
      Tar_Cod: Number(r.Tar_Cod),
      Tic_Cod: Number(r.Tic_Cod),
      Tic_Db: r.Tic_Db != null ? String(r.Tic_Db) : null,
    }));
  } catch (err) {
    console.error(
      "[ticket-tarea] no se pudieron leer los vínculos en bloque:",
      err instanceof Error ? err.message : err
    );
    return [];
  }
}

/**
 * Alcanzado el 100% de una tarea, cierra (resuelve) los tickets vinculados.
 * Devuelve los tickets efectivamente resueltos.
 */
export async function resolverTicketsDeTarea(
  tarCod: number
): Promise<Array<{ Tic_Cod: number; Db: string }>> {
  const links = await ticketsDeTarea(tarCod);
  if (!links.length) return [];
  const resueltos: Array<{ Tic_Cod: number; Db: string }> = [];
  for (const { Tic_Cod, Tic_Db } of links) {
    if (!Number.isFinite(Tic_Cod) || Tic_Cod <= 0) continue;
    const db = sanitizeDbDis(Tic_Db || tasksDbDis());
    try {
      const prisma = getPrisma(db);
      const updated = await prisma.$executeRawUnsafe(
        `UPDATE tickets SET Tic_Est = '3', Tic_Fec_Ter = NOW()
         WHERE Tic_Cod = ? AND IFNULL(Tic_Est, '0') <> '3'`,
        Tic_Cod
      );
      if (Number(updated) >= 1) resueltos.push({ Tic_Cod, Db: db });
    } catch (err) {
      console.error(
        `[ticket-tarea] no se pudo resolver ${db}#${Tic_Cod}:`,
        err instanceof Error ? err.message : err
      );
    }
  }
  return resueltos;
}
