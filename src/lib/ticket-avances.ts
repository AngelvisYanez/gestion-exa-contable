import type { PrismaClient } from "@prisma/client";
import {
  buildAvanceDescripcion,
  isImagePath,
  isSafeUrl,
  parseAvanceDescripcion,
} from "./avance-format";
import { toPublicCaptureUrl } from "./captures";
import { getPrisma, sanitizeDbDis } from "./db";

const ready = new Set<string>();

/** MySQL 5.5: la fecha va en el INSERT, sin DEFAULT CURRENT_TIMESTAMP. */
export async function ensureTicketAvances(prisma: PrismaClient) {
  const key = (prisma as PrismaClient & { _exaDbKey?: string })._exaDbKey || "default";
  if (ready.has(key)) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS aud_ticket_avances (
      Ava_Cod INT NOT NULL AUTO_INCREMENT,
      Tic_Cod BIGINT NOT NULL,
      Usu_Cod INT NULL,
      Per_Cod INT NULL,
      Ava_Descripcion TEXT NULL,
      Ava_Porcentaje INT NOT NULL,
      Ava_Fecha DATETIME NULL,
      Ava_Est CHAR(1) NOT NULL DEFAULT 'A',
      PRIMARY KEY (Ava_Cod),
      KEY idx_tav_tic (Tic_Cod, Ava_Est)
    )
  `);
  ready.add(key);
}

/** 100% cierra. Un porcentaje menor deja el ticket en proceso. 0% no cambia el estado. */
export function estadoTrasAvance(porcentaje: number): "Cerrado" | "En Proceso" | null {
  const pct = Number(porcentaje);
  if (!Number.isFinite(pct)) return null;
  if (pct >= 100) return "Cerrado";
  if (pct > 0) return "En Proceso";
  return null;
}

export type TicketAvanceItem = {
  Ava_Cod: number;
  Tic_Cod: number;
  Ava_Porcentaje: number;
  Ava_Fecha: string | null;
  Usu_Cod: number | null;
  Autor: string | null;
  realizado: string;
  adjuntos: Array<{ ruta: string; url: string; nombre: string; esImagen: boolean }>;
};

function toIso(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
}

export function descripcionTicketAvance(
  body: Record<string, unknown>,
  ticCod: number
): string {
  const str = (v: unknown, max: number) => String(v ?? "").slice(0, max);
  const list = (v: unknown) =>
    Array.isArray(v) ? v.map((x) => String(x ?? "").trim()).filter(Boolean) : [];
  const realizado = str(body.realizado ?? body.descripcion, 8000);
  const adjPrefix = "gestion/adjuntos/monitoreo/evidencias/";
  const adjuntos = list(body.adjuntos)
    .filter(
      (r) =>
        r.startsWith(adjPrefix) &&
        !r.includes("..") &&
        r.split("/").pop()?.startsWith(`tic_${ticCod}_`)
    )
    .slice(0, 10);
  const enlaces = list(body.enlaces)
    .filter(isSafeUrl)
    .map((u) => u.slice(0, 500))
    .slice(0, 10);
  return buildAvanceDescripcion({ realizado, enlaces, adjuntos });
}

function mapAvance(r: {
  Ava_Cod: number | bigint;
  Tic_Cod: number | bigint;
  Ava_Porcentaje: number | null;
  Ava_Fecha: Date | string | null;
  Usu_Cod: number | bigint | null;
  Ava_Descripcion: string | null;
  Autor: string | null;
}): TicketAvanceItem {
  const parsed = parseAvanceDescripcion(r.Ava_Descripcion);
  return {
    Ava_Cod: Number(r.Ava_Cod),
    Tic_Cod: Number(r.Tic_Cod),
    Ava_Porcentaje: Number(r.Ava_Porcentaje || 0),
    Ava_Fecha: toIso(r.Ava_Fecha),
    Usu_Cod: r.Usu_Cod != null ? Number(r.Usu_Cod) : null,
    Autor: (r.Autor || "").trim() || null,
    realizado: parsed.realizado,
    adjuntos: parsed.adjuntos.map((ruta) => {
      const nombre = ruta.split("/").pop() || ruta;
      return { ruta, url: toPublicCaptureUrl(ruta), nombre, esImagen: isImagePath(ruta) };
    }),
  };
}

export async function listAvancesTicket(dbDis: string, ticCod: number): Promise<TicketAvanceItem[]> {
  const prisma = getPrisma(sanitizeDbDis(dbDis));
  await ensureTicketAvances(prisma);
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      Ava_Cod: number | bigint;
      Tic_Cod: number | bigint;
      Ava_Porcentaje: number | null;
      Ava_Fecha: Date | string | null;
      Usu_Cod: number | bigint | null;
      Ava_Descripcion: string | null;
      Autor: string | null;
    }>
  >(
    `SELECT av.Ava_Cod, av.Tic_Cod, av.Ava_Porcentaje, av.Ava_Fecha, av.Usu_Cod,
            CONVERT(av.Ava_Descripcion USING utf8mb4) AS Ava_Descripcion,
            CONVERT(TRIM(CONCAT(IFNULL(p.Prs_Ape,''), ' ', IFNULL(p.Prs_Nom,''))) USING utf8mb4) AS Autor
     FROM aud_ticket_avances av
     LEFT JOIN usuarios u ON u.Usu_Cod = av.Usu_Cod
     LEFT JOIN persona p ON p.Prs_Cod = u.Prs_Cod
     WHERE av.Ava_Est = 'A' AND av.Tic_Cod = ?
     ORDER BY av.Ava_Fecha DESC, av.Ava_Cod DESC
     LIMIT 40`,
    ticCod
  );
  return rows.map(mapAvance);
}

export async function attachAvancePorcentaje<T extends { Tic_Cod: number; Ava_Porcentaje?: number | null }>(
  prisma: PrismaClient,
  tickets: T[]
) {
  if (!tickets.length) return;
  try {
    await ensureTicketAvances(prisma);
  } catch {
    return;
  }
  const ids = tickets.map((t) => t.Tic_Cod).filter((n) => n > 0);
  if (!ids.length) return;
  const marks = ids.map(() => "?").join(",");
  const rows = await prisma.$queryRawUnsafe<
    Array<{ Tic_Cod: number | bigint; Ava_Porcentaje: number | null }>
  >(
    `SELECT a.Tic_Cod, a.Ava_Porcentaje
     FROM aud_ticket_avances a
     INNER JOIN (
       SELECT Tic_Cod, MAX(Ava_Cod) AS mx
       FROM aud_ticket_avances
       WHERE Ava_Est = 'A' AND Tic_Cod IN (${marks})
       GROUP BY Tic_Cod
     ) z ON z.mx = a.Ava_Cod`,
    ...ids
  );
  const byId = new Map(rows.map((r) => [Number(r.Tic_Cod), Number(r.Ava_Porcentaje || 0)]));
  for (const t of tickets) {
    if (byId.has(t.Tic_Cod)) t.Ava_Porcentaje = byId.get(t.Tic_Cod) ?? 0;
  }
}

export async function registrarAvanceTicket(
  dbDis: string,
  opts: { ticCod: number; usuCod?: number; perCod?: number; porcentaje: number; descripcion: string }
) {
  const prisma = getPrisma(sanitizeDbDis(dbDis));
  await ensureTicketAvances(prisma);
  const pct = Math.max(0, Math.min(100, Math.round(opts.porcentaje)));
  const estado = estadoTrasAvance(pct);
  await prisma.$executeRawUnsafe(
    `INSERT INTO aud_ticket_avances
      (Tic_Cod, Usu_Cod, Per_Cod, Ava_Descripcion, Ava_Porcentaje, Ava_Fecha, Ava_Est)
     VALUES (?, ?, ?, ?, ?, NOW(), 'A')`,
    opts.ticCod,
    opts.usuCod && opts.usuCod > 0 ? opts.usuCod : null,
    opts.perCod && opts.perCod > 0 ? opts.perCod : null,
    opts.descripcion || null,
    pct
  );
  if (estado === "Cerrado") {
    await prisma.$executeRawUnsafe(
      `UPDATE tickets SET Tic_Est = '3', Tic_Fec_Ter = NOW() WHERE Tic_Cod = ?`,
      opts.ticCod
    );
  } else if (estado === "En Proceso") {
    await prisma.$executeRawUnsafe(
      `UPDATE tickets SET Tic_Est = '1' WHERE Tic_Cod = ? AND Tic_Est <> '3'`,
      opts.ticCod
    );
  }
  return { ok: true as const, porcentaje: pct, estado };
}
