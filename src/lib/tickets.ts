import type { PrismaClient } from "@prisma/client";
import { getPrisma, sanitizeDbDis } from "./db";
import {
  TIC_ESTADO_CODE,
  TIC_ESTADO_MAP,
  type TicketEstado,
} from "./domain-constants";
import { tasksDbDis } from "./empresa";
import { toPublicCaptureUrl } from "./captures";
import { ensurePanelUsuarios } from "./panel-usuarios";
import { endOfDayZona, fechaEnZona, startOfDayZona } from "./timezone";
import {
  buildTicketWhatsAppBody,
  parseTicketWhatsApp,
  ticketDescripcionPreview,
} from "./ticket-format";
import { isImagePath } from "./avance-format";
import { type Ticket } from "./ticket-view";
import { ensureMonitoreoSchema } from "./monitoreo-global";

export { TIC_ESTADO_CODE, TIC_ESTADO_MAP, type TicketEstado };
export { parseTicketWhatsApp, ticketDescripcionPreview } from "./ticket-format";
export { ticketAsTarea, ticketEstadoToKanban, type Ticket } from "./ticket-view";

export type TicketAssignee = {
  Per_Cod: number;
  Usu_Cod: number | null;
  Nombre: string;
  Cedula: string;
};

function mapEstado(code: string | null | undefined): string {
  const c = String(code ?? "0");
  return TIC_ESTADO_MAP[c] || `Estado ${c}`;
}

/** Date de Prisma → ISO. `String(date)` sale en inglés (`Wed Sep 10 2025`). */
function asIso(v: Date | string | null | undefined): string | null {
  if (v == null || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toISOString();
}

function titleFrom(tema: string | null, des: string | null) {
  const t = (tema || "").trim();
  if (t) return t.slice(0, 255);
  const d = (des || "").replace(/\s+/g, " ").trim();
  return d ? d.slice(0, 120) : "Sin asunto";
}

export type TicketAsignado = {
  Usu_Cod: number;
  Per_Cod: number | null;
  Nombre: string;
};

export type TicketEmpresa = {
  Emp_Cod: number;
  Emp_Nom: string;
};

const asignadosReady = new Set<string>();

/** Tabla del panel: varios desarrolladores por ticket. MySQL 5.5 no admite DEFAULT CURRENT_TIMESTAMP. */
export async function ensureTicketAsignados(prisma: PrismaClient) {
  const key = (prisma as PrismaClient & { _exaDbKey?: string })._exaDbKey || "default";
  if (asignadosReady.has(key)) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS aud_ticket_asignados (
      Tia_Cod INT NOT NULL AUTO_INCREMENT,
      Tic_Cod BIGINT NOT NULL,
      Usu_Cod INT NOT NULL,
      Per_Cod INT NULL,
      Tia_Est CHAR(1) NOT NULL DEFAULT 'A',
      Tia_Fecha DATETIME NULL,
      PRIMARY KEY (Tia_Cod),
      KEY idx_tia_tic (Tic_Cod, Tia_Est),
      KEY idx_tia_usu (Usu_Cod, Tia_Est)
    )
  `);
  asignadosReady.add(key);
}

function ymd(v: string | null | undefined) {
  const s = String(v || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

function fechaClauses(
  opts: { desde?: string | null; hasta?: string | null },
  params: Array<string | number>,
  column: string
) {
  const parts: string[] = [];
  const desde = ymd(opts.desde);
  const hasta = ymd(opts.hasta);
  if (desde) {
    parts.push(`DATE(${column}) >= ?`);
    params.push(desde);
  }
  if (hasta) {
    parts.push(`DATE(${column}) <= ?`);
    params.push(hasta);
  }
  return parts;
}

async function firstId(
  prisma: PrismaClient,
  sql: string,
  params: Array<string | number> = []
) {
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, number | bigint | null>>>(
    sql,
    ...params
  );
  const row = rows[0];
  if (!row) return 0;
  const n = Number(Object.values(row)[0] || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Emp_Cod, Usu_Cod y Org_Cod tienen FK en `tickets`.
 * Org_Cod = 0 no existe en `organizado` y el INSERT revienta (errno 1452).
 */
async function resolveTicketFks(
  prisma: PrismaClient,
  opts: { empCod?: number; usuCod?: number }
) {
  let emp = opts.empCod && opts.empCod > 0 ? opts.empCod : 0;
  if (emp && !(await firstId(prisma, `SELECT Emp_Cod FROM empresas WHERE Emp_Cod = ? LIMIT 1`, [emp]))) {
    emp = 0;
  }
  if (!emp) {
    emp =
      (await firstId(prisma, `SELECT Emp_Cod FROM empresas WHERE Emp_Cod = 1 LIMIT 1`)) ||
      (await firstId(prisma, `SELECT Emp_Cod FROM empresas ORDER BY Emp_Cod ASC LIMIT 1`));
  }
  if (!emp) throw new Error("No hay empresas en EXA para registrar el ticket.");

  let usu = opts.usuCod && opts.usuCod > 0 ? opts.usuCod : 0;
  if (usu && !(await firstId(prisma, `SELECT Usu_Cod FROM usuarios WHERE Usu_Cod = ? LIMIT 1`, [usu]))) {
    usu = 0;
  }
  if (!usu) {
    usu =
      (await firstId(prisma, `SELECT Usu_Cod FROM usuarios WHERE Usu_Cod = 1 LIMIT 1`)) ||
      (await firstId(
        prisma,
        `SELECT Usu_Cod FROM usuarios WHERE Usu_Est = 'A' ORDER BY Usu_Cod ASC LIMIT 1`
      ));
  }
  if (!usu) throw new Error("No hay un usuario EXA valido para registrar el ticket.");

  const org =
    (await firstId(
      prisma,
      `SELECT o.Org_Cod
       FROM organizado o
       INNER JOIN tickets t ON t.Org_Cod = o.Org_Cod
       GROUP BY o.Org_Cod
       ORDER BY COUNT(*) DESC
       LIMIT 1`
    )) || (await firstId(prisma, `SELECT Org_Cod FROM organizado ORDER BY Org_Cod ASC LIMIT 1`));
  if (!org) throw new Error("No hay un modulo en organizado para vincular el ticket.");

  const pcs =
    (await firstId(
      prisma,
      `SELECT Pcs_Cod FROM procesos WHERE Org_Cod = ? ORDER BY Pcs_Cod ASC LIMIT 1`,
      [org]
    )) || 1000;

  return { emp, usu, org, pcs };
}

/** Bandeja de la lista de tickets (encargado). */
export type TicketBandeja = "todos" | "sin_asignar" | "asignados" | "resueltos";

export async function listTickets(
  dbDis: string,
  opts: {
    estado?: string;
    /** Filtro de bandeja: sin asignar / asignados / resueltos. */
    bandeja?: TicketBandeja | string;
    q?: string;
    limit?: number;
    aseCod?: number;
    /** Varios Usu_Cod del mismo colaborador (multi-sucursal EXA). */
    aseCodes?: number[];
    /** Un ticket concreto (detalle / asignación). */
    ticCod?: number;
    /** Fecha de creación (calendario, inclusive). */
    desde?: string | null;
    hasta?: string | null;
  } = {}
): Promise<Ticket[]> {
  const db = sanitizeDbDis(dbDis);
  const prisma = getPrisma(db);
  const teamDb = tasksDbDis();
  await ensureTicketAsignados(prisma);
  const params: Array<string | number> = [];
  const where: string[] = ["1=1"];

  if (opts.ticCod && opts.ticCod > 0) {
    where.push("t.Tic_Cod = ?");
    params.push(opts.ticCod);
  }
  const bandeja = String(opts.bandeja || "").trim();
  if (bandeja === "sin_asignar") {
    where.push(
      `(t.Ase_Cod IS NULL OR t.Ase_Cod = 0)
       AND NOT EXISTS (
         SELECT 1 FROM aud_ticket_asignados ax
         WHERE ax.Tic_Cod = t.Tic_Cod AND ax.Tia_Est = 'A'
       )
       AND t.Tic_Est <> '3'`
    );
  } else if (bandeja === "asignados") {
    where.push(
      `(
         (t.Ase_Cod IS NOT NULL AND t.Ase_Cod > 0)
         OR EXISTS (
           SELECT 1 FROM aud_ticket_asignados ax
           WHERE ax.Tic_Cod = t.Tic_Cod AND ax.Tia_Est = 'A'
         )
       )
       AND t.Tic_Est <> '3'`
    );
  } else if (bandeja === "resueltos") {
    where.push("t.Tic_Est = '3'");
  } else if (opts.estado && opts.estado !== "todos") {
    const code = TIC_ESTADO_CODE[opts.estado] ?? opts.estado;
    where.push("t.Tic_Est = ?");
    params.push(code);
  }
  const aseList = (opts.aseCodes || [])
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (aseList.length) {
    const marks = aseList.map(() => "?").join(",");
    where.push(
      `(t.Ase_Cod IN (${marks}) OR EXISTS (
         SELECT 1 FROM aud_ticket_asignados ax
         WHERE ax.Tic_Cod = t.Tic_Cod AND ax.Tia_Est = 'A' AND ax.Usu_Cod IN (${marks})
       ))`
    );
    params.push(...aseList, ...aseList);
  } else if (opts.aseCod && opts.aseCod > 0) {
    where.push(
      `(t.Ase_Cod = ? OR EXISTS (
         SELECT 1 FROM aud_ticket_asignados ax
         WHERE ax.Tic_Cod = t.Tic_Cod AND ax.Tia_Est = 'A' AND ax.Usu_Cod = ?
       ))`
    );
    params.push(opts.aseCod, opts.aseCod);
  }
  where.push(...fechaClauses(opts, params, "t.Tic_Fec_Cre"));
  if (opts.q) {
    where.push(
      `(CONVERT(t.Tic_Tem USING utf8mb4) LIKE ? OR CONVERT(t.Tic_Des USING utf8mb4) LIKE ? OR CONVERT(IFNULL(e.Emp_Nom,'') USING utf8mb4) LIKE ? OR CAST(t.Tic_Cod AS CHAR) LIKE ?)`
    );
    const like = `%${opts.q}%`;
    params.push(like, like, like, like);
  }

  const limit = Math.min(Math.max(opts.limit || 200, 1), 2000);

  type Row = {
    Tic_Cod: number | bigint;
    Tic_Tem: string | null;
    Tic_Des: string | null;
    Tic_Est: string | null;
    Tic_Fec_Cre: Date | string | null;
    Tic_Fec_Ter: Date | string | null;
    Emp_Cod: number | bigint | null;
    Emp_Nom: string | null;
    Usu_Cod: number | bigint | null;
    Creador_Nombre: string | null;
    Ase_Cod: number | bigint | null;
    Asignado_Nombre: string | null;
    Tic_Tel: string | null;
    Tic_Obs: string | null;
    Tic_Tip: number | null;
  };

  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT
       t.Tic_Cod,
       CONVERT(t.Tic_Tem USING utf8mb4) AS Tic_Tem,
       CONVERT(t.Tic_Des USING utf8mb4) AS Tic_Des,
       CONVERT(t.Tic_Est USING utf8mb4) AS Tic_Est,
       t.Tic_Fec_Cre,
       t.Tic_Fec_Ter,
       t.Emp_Cod,
       CONVERT(e.Emp_Nom USING utf8mb4) AS Emp_Nom,
       t.Usu_Cod,
       CONVERT(CONCAT(IFNULL(pc.Prs_Ape,''), ' ', IFNULL(pc.Prs_Nom,'')) USING utf8mb4) AS Creador_Nombre,
       t.Ase_Cod,
       CONVERT(CONCAT(IFNULL(pa.Prs_Ape,''), ' ', IFNULL(pa.Prs_Nom,'')) USING utf8mb4) AS Asignado_Nombre,
       CONVERT(t.Tic_Tel USING utf8mb4) AS Tic_Tel,
       CONVERT(t.Tic_Obs USING utf8mb4) AS Tic_Obs,
       t.Tic_Tip
     FROM tickets t
     LEFT JOIN empresas e ON e.Emp_Cod = t.Emp_Cod
     LEFT JOIN usuarios uc ON uc.Usu_Cod = t.Usu_Cod
     LEFT JOIN persona pc ON pc.Prs_Cod = uc.Prs_Cod
     LEFT JOIN \`${teamDb}\`.usuarios ua ON ua.Usu_Cod = t.Ase_Cod
     LEFT JOIN \`${teamDb}\`.persona pa ON pa.Prs_Cod = ua.Prs_Cod
     WHERE ${where.join(" AND ")}
     ORDER BY t.Tic_Fec_Cre DESC, t.Tic_Cod DESC
     LIMIT ${limit}`,
    ...params
  );

  const extra = new Map<number, TicketAsignado[]>();
  const ids = rows.map((r) => Number(r.Tic_Cod)).filter((n) => n > 0);
  if (ids.length) {
    const marks = ids.map(() => "?").join(",");
    const asigs = await prisma.$queryRawUnsafe<
      Array<{
        Tic_Cod: number | bigint;
        Usu_Cod: number | bigint;
        Per_Cod: number | bigint | null;
        Nombre: string | null;
      }>
    >(
      `SELECT a.Tic_Cod, a.Usu_Cod, a.Per_Cod,
              CONVERT(CONCAT(IFNULL(p.Prs_Ape,''), ' ', IFNULL(p.Prs_Nom,'')) USING utf8mb4) AS Nombre
       FROM aud_ticket_asignados a
       LEFT JOIN \`${teamDb}\`.usuarios u ON u.Usu_Cod = a.Usu_Cod
       LEFT JOIN \`${teamDb}\`.persona p ON p.Prs_Cod = u.Prs_Cod
       WHERE a.Tia_Est = 'A' AND a.Tic_Cod IN (${marks})
       ORDER BY a.Tia_Cod ASC`,
      ...ids
    );
    for (const a of asigs) {
      const id = Number(a.Tic_Cod);
      const list = extra.get(id) || [];
      const nombre = (a.Nombre || "").trim();
      list.push({
        Usu_Cod: Number(a.Usu_Cod),
        Per_Cod: a.Per_Cod != null ? Number(a.Per_Cod) : null,
        Nombre: nombre || `Usuario ${Number(a.Usu_Cod)}`,
      });
      extra.set(id, list);
    }
  }

  return rows.map((r) => {
    const estCod = String(r.Tic_Est ?? "0");
    const ase = r.Ase_Cod != null && Number(r.Ase_Cod) > 0 ? Number(r.Ase_Cod) : null;
    const parsed = parseTicketWhatsApp(r.Tic_Des);
    const joinNom = (r.Emp_Nom || "").trim();
    const empNom =
      parsed.empresa.toUpperCase() === "TODAS EMPRESAS"
        ? parsed.empresa
        : joinNom || parsed.empresa || null;
    const tel = (r.Tic_Tel || "").trim() || parsed.telefono || null;
    const descOnly = parsed.descripcion || ticketDescripcionPreview(r.Tic_Des) || r.Tic_Des;
    let asignados = extra.get(Number(r.Tic_Cod)) || [];
    if (ase && !asignados.some((a) => a.Usu_Cod === ase)) {
      asignados = [
        {
          Usu_Cod: ase,
          Per_Cod: null,
          Nombre: (r.Asignado_Nombre || "").trim() || `Usuario ${ase}`,
        },
        ...asignados,
      ];
    }
    const nombres = asignados.map((a) => a.Nombre).filter(Boolean);
    return {
      Tic_Cod: Number(r.Tic_Cod),
      Tic_Titulo: titleFrom(r.Tic_Tem || parsed.titulo, r.Tic_Des),
      Tic_Descripcion: descOnly,
      Tic_Prioridad: Number(r.Tic_Tip) === 1 ? "Alta" : "Media",
      Tic_Estado: mapEstado(estCod),
      Tic_Estado_Cod: estCod,
      Tic_Origen: "EXA",
      Per_Cod_Asignado: asignados[0]?.Per_Cod ?? null,
      Asignado_Nombre: nombres.length ? nombres.join(", ") : null,
      Asignado_Usu_Cod: asignados[0]?.Usu_Cod ?? null,
      Asignados: asignados,
      Tar_Cod: null,
      Emp_Cod: r.Emp_Cod != null ? Number(r.Emp_Cod) : 0,
      Emp_Nom: empNom,
      Usu_Creador: r.Usu_Cod != null ? Number(r.Usu_Cod) : null,
      Creador_Nombre:
        (r.Creador_Nombre || "").trim() || parsed.enviadoPor || null,
      Tic_Fecha_Llegada: asIso(r.Tic_Fec_Cre) || "",
      Tic_Fecha_Asignacion: asIso(r.Tic_Fec_Ter),
      Tic_Tel: tel,
      Tic_Obs: r.Tic_Obs,
      Enviado_Por: parsed.enviadoPor || null,
      Proceso: parsed.proceso || (r.Tic_Obs && r.Tic_Obs !== "N/A" ? r.Tic_Obs : null),
      Evidencias: parsed.adjuntos.map((ruta) => {
        const nombre = ruta.split("/").pop() || ruta;
        return {
          ruta,
          url: toPublicCaptureUrl(ruta),
          nombre,
          esImagen: isImagePath(ruta),
        };
      }),
    };
  });
}

export async function countTicketsNuevos(dbDis: string) {
  const db = sanitizeDbDis(dbDis);
  const prisma = getPrisma(db);
  const rows = await prisma.$queryRawUnsafe<Array<{ c: number | bigint }>>(
    `SELECT COUNT(*) AS c FROM tickets WHERE Tic_Est = '0'`
  );
  return Number(rows[0]?.c || 0);
}

export async function ticketsKpis(
  dbDis: string,
  opts: { desde?: string | null; hasta?: string | null } = {}
) {
  const db = sanitizeDbDis(dbDis);
  const prisma = getPrisma(db);
  await ensureTicketAsignados(prisma);
  const estParams: Array<string | number> = [];
  const estFecha = fechaClauses(opts, estParams, "Tic_Fec_Cre");
  const estWhere = estFecha.length ? `WHERE ${estFecha.join(" AND ")}` : "";
  const banParams: Array<string | number> = [];
  const banFecha = fechaClauses(opts, banParams, "t.Tic_Fec_Cre");
  const banWhere = banFecha.length ? `WHERE ${banFecha.join(" AND ")}` : "";
  const [byEst, bandeja] = await Promise.all([
    prisma.$queryRawUnsafe<Array<{ Tic_Est: string; c: number | bigint }>>(
      `SELECT CONVERT(Tic_Est USING utf8mb4) AS Tic_Est, COUNT(*) AS c
       FROM tickets ${estWhere} GROUP BY Tic_Est`,
      ...estParams
    ),
    prisma.$queryRawUnsafe<
      Array<{ sin_asignar: number | bigint; asignados: number | bigint; resueltos: number | bigint }>
    >(
      `SELECT
         SUM(CASE WHEN (t.Ase_Cod IS NULL OR t.Ase_Cod = 0)
           AND NOT EXISTS (
             SELECT 1 FROM aud_ticket_asignados ax
             WHERE ax.Tic_Cod = t.Tic_Cod AND ax.Tia_Est = 'A'
           )
           AND t.Tic_Est <> '3' THEN 1 ELSE 0 END) AS sin_asignar,
         SUM(CASE WHEN (
             (t.Ase_Cod IS NOT NULL AND t.Ase_Cod > 0)
             OR EXISTS (
               SELECT 1 FROM aud_ticket_asignados ax
               WHERE ax.Tic_Cod = t.Tic_Cod AND ax.Tia_Est = 'A'
             )
           ) AND t.Tic_Est <> '3' THEN 1 ELSE 0 END) AS asignados,
         SUM(CASE WHEN t.Tic_Est = '3' THEN 1 ELSE 0 END) AS resueltos
       FROM tickets t
       ${banWhere}`,
      ...banParams
    ),
  ]);
  const by: Record<string, number> = {};
  let total = 0;
  for (const r of byEst) {
    const n = Number(r.c);
    by[String(r.Tic_Est)] = n;
    total += n;
  }
  const b = bandeja[0];
  return {
    total,
    nuevos: by["0"] || 0,
    proceso: by["1"] || 0,
    /** Por código Tic_Est='2' (legacy). */
    asignados_estado: by["2"] || 0,
    /** Por Ase_Cod (tiene asesor y no cerrado). */
    asignados: Number(b?.asignados || 0),
    sin_asignar: Number(b?.sin_asignar || 0),
    resueltos: Number(b?.resueltos || 0),
    cerrados: by["3"] || Number(b?.resueltos || 0),
  };
}

/**
 * Desarrolladores y encargados para Ase_Cod.
 * El equipo (aud_panel_usuarios + personal Emp 96) vive en exa.
 * servicios no tiene esa ficha: si se consulta ahí, el diálogo de asignar sale vacío.
 * Ase_Cod de tickets (también en servicios) es el Usu_Cod de exa.usuarios.
 */
export async function listTicketAssignees(): Promise<TicketAssignee[]> {
  const db = tasksDbDis();
  const prisma = getPrisma(db);
  await ensurePanelUsuarios(prisma);
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      Per_Cod: number | bigint | null;
      Usu_Cod: number | bigint;
      Pan_Nombre: string | null;
      Pan_Cedula: string | null;
    }>
  >(
    `SELECT Per_Cod, Usu_Cod,
            CONVERT(Pan_Nombre USING utf8mb4) AS Pan_Nombre,
            CONVERT(IFNULL(Pan_Cedula, '') USING utf8mb4) AS Pan_Cedula
     FROM aud_panel_usuarios
     WHERE Pan_Est = 'A'
       AND Pan_Rol IN ('developer', 'manager')
       AND Usu_Cod > 0
     ORDER BY Pan_Nombre ASC`
  );
  return rows
    .map((r) => ({
      Per_Cod: Number(r.Per_Cod || 0),
      Usu_Cod: Number(r.Usu_Cod),
      Nombre: (r.Pan_Nombre || "").trim(),
      Cedula: (r.Pan_Cedula || "").trim(),
    }))
    .filter((r) => r.Usu_Cod > 0 && r.Nombre);
}

/** Empresas activas de la base EXA (FK de tickets.Emp_Cod). */
export async function listTicketEmpresas(dbDis: string): Promise<TicketEmpresa[]> {
  const prisma = getPrisma(sanitizeDbDis(dbDis));
  const rows = await prisma.$queryRawUnsafe<
    Array<{ Emp_Cod: number | bigint; Emp_Nom: string | null }>
  >(
    `SELECT Emp_Cod, CONVERT(Emp_Nom USING utf8mb4) AS Emp_Nom
     FROM empresas
     WHERE Emp_Est = 'A'
     ORDER BY Emp_Nom ASC`
  );
  return rows
    .map((r) => ({
      Emp_Cod: Number(r.Emp_Cod),
      Emp_Nom: (r.Emp_Nom || "").trim(),
    }))
    .filter((r) => r.Emp_Cod > 0 && r.Emp_Nom);
}

export async function assignTicket(
  dbDis: string,
  opts: {
    ticCod: number;
    usuCod?: number;
    perCod?: number;
    /** Lista completa de desarrolladores. Si viene, reemplaza la asignación. */
    asignados?: Array<{ usuCod: number; perCod?: number }>;
  }
) {
  const db = sanitizeDbDis(dbDis);
  const prisma = getPrisma(db);
  await ensureTicketAsignados(prisma);

  const lista = (
    opts.asignados && opts.asignados.length
      ? opts.asignados
      : opts.usuCod
        ? [{ usuCod: opts.usuCod, perCod: opts.perCod }]
        : []
  )
    .map((a) => ({
      usuCod: Number(a.usuCod),
      perCod: a.perCod && Number(a.perCod) > 0 ? Number(a.perCod) : null,
    }))
    .filter((a) => Number.isFinite(a.usuCod) && a.usuCod > 0);

  const unique: Array<{ usuCod: number; perCod: number | null }> = [];
  const seen = new Set<number>();
  for (const a of lista) {
    if (seen.has(a.usuCod)) continue;
    seen.add(a.usuCod);
    unique.push(a);
  }
  if (!unique.length) throw new Error("Selecciona al menos un desarrollador.");

  const exists = await prisma.$queryRawUnsafe<Array<{ Tic_Cod: number | bigint }>>(
    `SELECT Tic_Cod FROM tickets WHERE Tic_Cod = ? LIMIT 1`,
    opts.ticCod
  );
  if (!exists.length) throw new Error("Ticket no encontrado");

  const primary = unique[0].usuCod;
  await prisma.$executeRawUnsafe(
    `UPDATE tickets
     SET Ase_Cod = ?,
         Tic_Est = '2'
     WHERE Tic_Cod = ?`,
    primary,
    opts.ticCod
  );
  await prisma.$executeRawUnsafe(
    `UPDATE aud_ticket_asignados SET Tia_Est = 'I' WHERE Tic_Cod = ? AND Tia_Est = 'A'`,
    opts.ticCod
  );
  for (const a of unique) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO aud_ticket_asignados (Tic_Cod, Usu_Cod, Per_Cod, Tia_Est, Tia_Fecha)
       VALUES (?, ?, ?, 'A', NOW())`,
      opts.ticCod,
      a.usuCod,
      a.perCod
    );
  }

  const updated = (await listTickets(db, { ticCod: opts.ticCod, limit: 1 }))[0];
  return { ticket: updated, asignados: unique };
}

export async function updateTicketEstado(dbDis: string, ticCod: number, estado: TicketEstado) {
  const db = sanitizeDbDis(dbDis);
  const prisma = getPrisma(db);
  const code = TIC_ESTADO_CODE[estado];
  if (!code) throw new Error("Estado invalido");

  await prisma.$executeRawUnsafe(
    `UPDATE tickets
     SET Tic_Est = ?,
         Tic_Fec_Ter = CASE WHEN ? = '3' THEN NOW() ELSE Tic_Fec_Ter END
     WHERE Tic_Cod = ?`,
    code,
    code,
    ticCod
  );
  return { ok: true, estado, code };
}

/** Alta manual en tabla EXA tickets (formato WhatsApp + evidencias). */
export async function createTicket(
  dbDis: string,
  data: {
    titulo: string;
    descripcion?: string;
    prioridad?: string;
    origen?: string;
    empCod?: number;
    usuCreador?: number;
    enviadoPor?: string;
    empresa?: string;
    telefono?: string;
    proceso?: string;
    adjuntos?: string[];
  }
) {
  const db = sanitizeDbDis(dbDis);
  const prisma = getPrisma(db);
  const titulo = data.titulo.trim().slice(0, 255);
  if (!titulo) throw new Error("Titulo requerido");

  const adjPrefix = `gestion/adjuntos/monitoreo/evidencias/`;
  const adjuntos = (data.adjuntos || [])
    .map((r) => String(r).trim())
    .filter((r) => r.startsWith(adjPrefix));

  const body = buildTicketWhatsAppBody({
    enviadoPor: data.enviadoPor,
    empresa: data.empresa,
    telefono: data.telefono,
    proceso: data.proceso,
    titulo,
    descripcion: data.descripcion?.trim() || "",
    adjuntos,
  });
  const des = (body || titulo).slice(0, 65000);
  const tip = data.prioridad === "Alta" ? 1 : 0;
  const tel = (data.telefono || "").replace(/\D/g, "").slice(0, 13) || null;
  const obs = (data.proceso || "").trim().slice(0, 255) || "N/A";
  const fk = await resolveTicketFks(prisma, {
    empCod: data.empCod,
    usuCod: data.usuCreador,
  });

  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO tickets
        (Tic_Des, Tic_Fec_Cre, Tic_Fec_Ter, Tic_Tem, Tic_Evi_Pro, Emp_Cod, Usu_Cod, Tic_Est, Org_Cod, Tic_Cal, Tic_Obs, Tic_Tel, Pcs_Cod, Tic_Tip)
       VALUES (?, NOW(), NOW(), ?, '', ?, ?, '0', ?, 0, ?, ?, ?, ?)`,
      des,
      titulo,
      fk.emp,
      fk.usu,
      fk.org,
      obs,
      tel,
      fk.pcs,
      tip
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Org_Cod")) {
      throw new Error(
        "No se pudo crear el ticket: el modulo vinculado no existe en organizado. Vuelve a intentar."
      );
    }
    if (msg.includes("Emp_Cod")) {
      throw new Error("La empresa seleccionada no existe en la base EXA.");
    }
    if (msg.includes("Usu_Cod")) {
      throw new Error("El usuario que crea el ticket no esta registrado en EXA.");
    }
    throw err;
  }

  const inserted = await prisma.$queryRawUnsafe<Array<{ id: bigint | number }>>(
    `SELECT LAST_INSERT_ID() AS id`
  );
  const id = Number(inserted?.[0]?.id || 0);
  const created = (await listTickets(db, { ticCod: id, limit: 1 }))[0];
  return created || { Tic_Cod: id, Tic_Titulo: titulo };
}

/** Adjunta evidencias al cuerpo Tic_Des de un ticket ya creado. */
export async function attachTicketEvidencias(dbDis: string, ticCod: number, rutas: string[]) {
  const db = sanitizeDbDis(dbDis);
  const prisma = getPrisma(db);
  const adjPrefix = `gestion/adjuntos/monitoreo/evidencias/`;
  const nuevos = rutas.map((r) => String(r).trim()).filter((r) => r.startsWith(adjPrefix));
  if (!nuevos.length) return { ok: true, adjuntos: [] as string[] };

  const [row] = await prisma.$queryRawUnsafe<Array<{ Tic_Des: string | null }>>(
    `SELECT CONVERT(Tic_Des USING utf8mb4) AS Tic_Des FROM tickets WHERE Tic_Cod = ? LIMIT 1`,
    ticCod
  );
  if (!row) throw new Error("Ticket no encontrado");

  const parsed = parseTicketWhatsApp(row.Tic_Des);
  const merged = Array.from(new Set([...parsed.adjuntos, ...nuevos]));
  const next = buildTicketWhatsAppBody({ ...parsed, adjuntos: merged });

  await prisma.$executeRawUnsafe(`UPDATE tickets SET Tic_Des = ? WHERE Tic_Cod = ?`, next, ticCod);
  return { ok: true, adjuntos: merged };
}

/** Mapea columna Kanban / acción UI → estado de ticket EXA. */
export function kanbanToTicketEstado(estado: string): TicketEstado {
  const e = estado.trim();
  if (e === "Finalizada" || e === "Cerrado" || e === "Resuelto") return "Cerrado";
  if (e === "Pendiente" || e === "Nuevo") return "Nuevo";
  if (e === "Asignado") return "Asignado";
  if (e === "En Proceso") return "En Proceso";
  return "Asignado";
}

/** Capturas de ExaMonitor ligadas a un ticket (Tic_Cod en telemetría) para auditoría admin. */
export async function listCapturasTicket(
  dbDis: string,
  ticCod: number,
  opts: {
    dias?: number;
    desde?: string | null;
    hasta?: string | null;
    limit?: number;
  } = {}
) {
  const prisma = getPrisma(sanitizeDbDis(dbDis));
  await ensureMonitoreoSchema(prisma);
  const dias = Math.max(1, Math.min(365, opts.dias ?? 30));
  const limit = Math.max(1, Math.min(200, opts.limit ?? 80));
  const desdeCustom = opts.desde?.slice(0, 10) || null;
  const hastaCustom = opts.hasta?.slice(0, 10) || null;
  const desde = desdeCustom
    ? startOfDayZona(desdeCustom)
    : new Date(Date.now() - dias * 24 * 3600 * 1000);
  const hasta = hastaCustom ? endOfDayZona(hastaCustom) : null;

  type Row = {
    Tel_Cod: number;
    Per_Cod: number;
    Tel_Fecha_Hora: Date;
    Tel_Captura_Ruta: string;
    Tel_Segundos_Activos: number;
    Tel_Porc_Actividad: unknown;
  };

  let rows: Row[] = [];
  try {
    rows = hasta
      ? await prisma.$queryRawUnsafe<Row[]>(
          `SELECT Tel_Cod, Per_Cod, Tel_Fecha_Hora, Tel_Captura_Ruta,
                  Tel_Segundos_Activos, Tel_Porc_Actividad
           FROM aud_dev_telemetria
           WHERE Tic_Cod = ?
             AND Tel_Captura_Ruta IS NOT NULL AND Tel_Captura_Ruta <> ''
             AND Tel_Fecha_Hora >= ? AND Tel_Fecha_Hora <= ?
           ORDER BY Tel_Cod DESC
           LIMIT ${limit}`,
          ticCod,
          desde,
          hasta
        )
      : await prisma.$queryRawUnsafe<Row[]>(
          `SELECT Tel_Cod, Per_Cod, Tel_Fecha_Hora, Tel_Captura_Ruta,
                  Tel_Segundos_Activos, Tel_Porc_Actividad
           FROM aud_dev_telemetria
           WHERE Tic_Cod = ?
             AND Tel_Captura_Ruta IS NOT NULL AND Tel_Captura_Ruta <> ''
             AND Tel_Fecha_Hora >= ?
           ORDER BY Tel_Cod DESC
           LIMIT ${limit}`,
          ticCod,
          desde
        );
  } catch {
    rows = [];
  }

  let agg:
    | {
        registros: bigint | number;
        segundos: bigint | number | null;
        capturas: bigint | number | null;
        primera: Date | null;
        ultima: Date | null;
      }
    | undefined;
  try {
    const aggRows = await prisma.$queryRawUnsafe<
      Array<{
        registros: bigint | number;
        segundos: bigint | number | null;
        capturas: bigint | number | null;
        primera: Date | null;
        ultima: Date | null;
      }>
    >(
      `SELECT COUNT(*) AS registros,
              SUM(Tel_Segundos_Activos) AS segundos,
              SUM(CASE WHEN Tel_Captura_Ruta IS NOT NULL AND Tel_Captura_Ruta <> '' THEN 1 ELSE 0 END) AS capturas,
              MIN(Tel_Fecha_Hora) AS primera,
              MAX(Tel_Fecha_Hora) AS ultima
       FROM aud_dev_telemetria
       WHERE Tic_Cod = ?`,
      ticCod
    );
    agg = aggRows[0];
  } catch {
    agg = undefined;
  }

  return {
    capturas: rows.map((c) => ({
      Tel_Cod: Number(c.Tel_Cod),
      Per_Cod: Number(c.Per_Cod),
      Fecha: c.Tel_Fecha_Hora instanceof Date ? c.Tel_Fecha_Hora.toISOString() : String(c.Tel_Fecha_Hora),
      Url: toPublicCaptureUrl(c.Tel_Captura_Ruta),
      Segundos: Number(c.Tel_Segundos_Activos || 0),
    })),
    resumen: {
      registros_telemetria: Number(agg?.registros || 0),
      minutos_activos: Math.round(Number(agg?.segundos || 0) / 60),
      capturas: Number(agg?.capturas || 0),
      primera_actividad: agg?.primera
        ? agg.primera instanceof Date
          ? agg.primera.toISOString()
          : String(agg.primera)
        : null,
      ultima_actividad: agg?.ultima
        ? agg.ultima instanceof Date
          ? agg.ultima.toISOString()
          : String(agg.ultima)
        : null,
    },
    capturas_meta: {
      dias,
      desde: desdeCustom || fechaEnZona(desde),
      hasta: hastaCustom || null,
      limit,
      total_periodo: rows.length,
    },
  };
}
