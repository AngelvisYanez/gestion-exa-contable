import { getPrisma, sanitizeDbDis } from "./db";
import {
  TIC_ESTADO_CODE,
  TIC_ESTADO_MAP,
  type TicketEstado,
} from "./domain-constants";
import { EMPRESA_TAREAS } from "./empresa";
import { toPublicCaptureUrl } from "./captures";
import { listAsignables } from "./tareas";
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
  } = {}
): Promise<Ticket[]> {
  const db = sanitizeDbDis(dbDis);
  const prisma = getPrisma(db);
  const params: Array<string | number> = [];
  const where: string[] = ["1=1"];

  const bandeja = String(opts.bandeja || "").trim();
  if (bandeja === "sin_asignar") {
    where.push("(t.Ase_Cod IS NULL OR t.Ase_Cod = 0) AND t.Tic_Est <> '3'");
  } else if (bandeja === "asignados") {
    where.push("t.Ase_Cod IS NOT NULL AND t.Ase_Cod > 0 AND t.Tic_Est <> '3'");
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
    where.push(`t.Ase_Cod IN (${aseList.map(() => "?").join(",")})`);
    params.push(...aseList);
  } else if (opts.aseCod && opts.aseCod > 0) {
    where.push("t.Ase_Cod = ?");
    params.push(opts.aseCod);
  }
  if (opts.q) {
    where.push(
      `(CONVERT(t.Tic_Tem USING utf8mb4) LIKE ? OR CONVERT(t.Tic_Des USING utf8mb4) LIKE ? OR CONVERT(IFNULL(e.Emp_Nom,'') USING utf8mb4) LIKE ? OR CAST(t.Tic_Cod AS CHAR) LIKE ?)`
    );
    const like = `%${opts.q}%`;
    params.push(like, like, like, like);
  }

  const limit = Math.min(Math.max(opts.limit || 200, 1), 500);

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
     LEFT JOIN usuarios ua ON ua.Usu_Cod = t.Ase_Cod
     LEFT JOIN persona pa ON pa.Prs_Cod = ua.Prs_Cod
     WHERE ${where.join(" AND ")}
     ORDER BY t.Tic_Fec_Cre DESC, t.Tic_Cod DESC
     LIMIT ${limit}`,
    ...params
  );

  return rows.map((r) => {
    const estCod = String(r.Tic_Est ?? "0");
    const ase = r.Ase_Cod != null ? Number(r.Ase_Cod) : null;
    const parsed = parseTicketWhatsApp(r.Tic_Des);
    const empNom = (r.Emp_Nom || "").trim() || parsed.empresa || null;
    const tel = (r.Tic_Tel || "").trim() || parsed.telefono || null;
    const descOnly = parsed.descripcion || ticketDescripcionPreview(r.Tic_Des) || r.Tic_Des;
    return {
      Tic_Cod: Number(r.Tic_Cod),
      Tic_Titulo: titleFrom(r.Tic_Tem || parsed.titulo, r.Tic_Des),
      Tic_Descripcion: descOnly,
      Tic_Prioridad: Number(r.Tic_Tip) === 1 ? "Alta" : "Media",
      Tic_Estado: mapEstado(estCod),
      Tic_Estado_Cod: estCod,
      Tic_Origen: "EXA",
      Per_Cod_Asignado: ase,
      Asignado_Nombre: (r.Asignado_Nombre || "").trim() || null,
      Asignado_Usu_Cod: ase,
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

export async function ticketsKpis(dbDis: string) {
  const db = sanitizeDbDis(dbDis);
  const prisma = getPrisma(db);
  const [byEst, bandeja] = await Promise.all([
    prisma.$queryRawUnsafe<Array<{ Tic_Est: string; c: number | bigint }>>(
      `SELECT CONVERT(Tic_Est USING utf8mb4) AS Tic_Est, COUNT(*) AS c FROM tickets GROUP BY Tic_Est`
    ),
    prisma.$queryRawUnsafe<
      Array<{ sin_asignar: number | bigint; asignados: number | bigint; resueltos: number | bigint }>
    >(
      `SELECT
         SUM(CASE WHEN (Ase_Cod IS NULL OR Ase_Cod = 0) AND Tic_Est <> '3' THEN 1 ELSE 0 END) AS sin_asignar,
         SUM(CASE WHEN Ase_Cod IS NOT NULL AND Ase_Cod > 0 AND Tic_Est <> '3' THEN 1 ELSE 0 END) AS asignados,
         SUM(CASE WHEN Tic_Est = '3' THEN 1 ELSE 0 END) AS resueltos
       FROM tickets`
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

/** Miembros del equipo con Usu_Cod (para Ase_Cod en tickets EXA). Prefiere sucursal MATRIZ. */
export async function listTicketAssignees(dbDis: string): Promise<TicketAssignee[]> {
  const db = sanitizeDbDis(dbDis);
  const prisma = getPrisma(db);
  const asignables = await listAsignables(db);
  const out: TicketAssignee[] = [];

  for (const a of asignables) {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ Usu_Cod: number | bigint; Usu_Ced: string | null }>
    >(
      `SELECT u.Usu_Cod, CONVERT(u.Usu_Ced USING utf8mb4) AS Usu_Ced
       FROM personal per
       INNER JOIN usuarios u ON u.Prs_Cod = per.Prs_Cod AND u.Usu_Est = 'A'
       WHERE per.Per_Cod = ?
       ORDER BY CASE WHEN u.Suc_Cod = ? THEN 0 ELSE 1 END, u.Usu_Cod ASC
       LIMIT 1`,
      a.Per_Cod,
      EMPRESA_TAREAS.sucCod
    );
    out.push({
      Per_Cod: a.Per_Cod,
      Usu_Cod: rows[0] ? Number(rows[0].Usu_Cod) : null,
      Nombre: a.Nombre,
      Cedula: (rows[0]?.Usu_Ced || a.Cedula || "").trim(),
    });
  }
  return out;
}

export async function assignTicket(
  dbDis: string,
  opts: { ticCod: number; usuCod: number; perCod?: number }
) {
  const db = sanitizeDbDis(dbDis);
  const prisma = getPrisma(db);
  if (!opts.usuCod || opts.usuCod <= 0) {
    throw new Error("Usu_Cod de asesor requerido");
  }

  const exists = await prisma.$queryRawUnsafe<Array<{ Tic_Cod: number | bigint }>>(
    `SELECT Tic_Cod FROM tickets WHERE Tic_Cod = ? LIMIT 1`,
    opts.ticCod
  );
  if (!exists.length) throw new Error("Ticket no encontrado");

  // Asignar: permanece en la bandeja con estado Asignado (Tic_Est='2').
  // No cerrar; si ya estaba cerrado, reabre a Asignado.
  await prisma.$executeRawUnsafe(
    `UPDATE tickets
     SET Ase_Cod = ?,
         Tic_Est = '2'
     WHERE Tic_Cod = ?`,
    opts.usuCod,
    opts.ticCod
  );

  const updated = (await listTickets(db, { q: String(opts.ticCod), limit: 50 })).find(
    (t) => t.Tic_Cod === opts.ticCod
  );
  return { ticket: updated };
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
  const empCod = data.empCod && data.empCod > 0 ? data.empCod : 1;
  const usuCod = data.usuCreador && data.usuCreador > 0 ? data.usuCreador : 1;
  const tip = data.prioridad === "Alta" ? 1 : 0;
  const tel = (data.telefono || "").replace(/\D/g, "").slice(0, 13) || null;
  const obs = (data.proceso || "").trim().slice(0, 255) || "N/A";

  await prisma.$executeRawUnsafe(
    `INSERT INTO tickets
      (Tic_Des, Tic_Fec_Cre, Tic_Fec_Ter, Tic_Tem, Tic_Evi_Pro, Emp_Cod, Usu_Cod, Tic_Est, Org_Cod, Tic_Cal, Tic_Obs, Tic_Tel, Pcs_Cod, Tic_Tip)
     VALUES (?, NOW(), NOW(), ?, '', ?, ?, '0', 0, 0, ?, ?, 1000, ?)`,
    des,
    titulo,
    empCod,
    usuCod,
    obs,
    tel,
    tip
  );

  const inserted = await prisma.$queryRawUnsafe<Array<{ id: bigint | number }>>(
    `SELECT LAST_INSERT_ID() AS id`
  );
  const id = Number(inserted?.[0]?.id || 0);
  const all = await listTickets(db, { q: String(id), limit: 20 });
  return all.find((t) => t.Tic_Cod === id) || { Tic_Cod: id, Tic_Titulo: titulo };
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
