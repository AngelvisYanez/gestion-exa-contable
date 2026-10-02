import crypto from "crypto";
import fs from "fs";
import path from "path";
import { getPrisma, sanitizeDbDis } from "./db";
import { tasksEmpCod } from "./empresa";
import { createTarea } from "./tareas";
import { parseNaiveAsGuayaquil } from "./timezone";

export const INC_ESTADOS = [
  "Nueva",
  "En revision",
  "Tarea creada",
  "Ignorada",
  "Resuelta",
] as const;
export type IncEstado = (typeof INC_ESTADOS)[number];

export type ParsedLogEntry = {
  fingerprint: string;
  nivel: string;
  titulo: string;
  mensaje: string;
  archivo: string | null;
  linea: number | null;
  cuando: Date;
  fuente: string;
};

export type IncidenciaView = {
  Inc_Cod: number | null;
  Inc_Fingerprint: string;
  Inc_Nivel: string;
  Inc_Titulo: string;
  Inc_Mensaje: string;
  Inc_Archivo: string | null;
  Inc_Linea: number | null;
  Inc_Primera_Vez: string;
  Inc_Ultima_Vez: string;
  Inc_Ocurrencias: number;
  Inc_Estado: string;
  Tar_Cod: number | null;
  Inc_Fuente: string | null;
  enLog: boolean;
};

const MAX_BYTES = 2 * 1024 * 1024;
// MySQL 5.5 rechaza DATETIME DEFAULT CURRENT_TIMESTAMP (error 1067).
const CREATE_SQL = `
CREATE TABLE IF NOT EXISTS aud_incidencias (
  Inc_Cod INT NOT NULL AUTO_INCREMENT,
  Inc_Fingerprint VARCHAR(64) NOT NULL,
  Inc_Nivel VARCHAR(20) NOT NULL DEFAULT 'Error',
  Inc_Titulo VARCHAR(255) NOT NULL,
  Inc_Mensaje TEXT NULL,
  Inc_Archivo VARCHAR(500) NULL,
  Inc_Linea INT NULL,
  Inc_Primera_Vez DATETIME NULL DEFAULT NULL,
  Inc_Ultima_Vez DATETIME NULL DEFAULT NULL,
  Inc_Ocurrencias INT NOT NULL DEFAULT 1,
  Inc_Estado VARCHAR(40) NOT NULL DEFAULT 'Nueva',
  Tar_Cod INT NULL,
  Usu_Creador INT NULL,
  Inc_Fuente VARCHAR(255) NULL,
  Inc_Est CHAR(1) NOT NULL DEFAULT 'A',
  PRIMARY KEY (Inc_Cod),
  UNIQUE KEY uq_aud_inc_fp (Inc_Fingerprint),
  KEY idx_aud_inc_estado_est (Inc_Estado, Inc_Est),
  KEY idx_aud_inc_ultima (Inc_Ultima_Vez),
  KEY idx_aud_inc_tar (Tar_Cod),
  KEY idx_aud_inc_nivel (Inc_Nivel)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

const ALTER_DATETIME_SQL = `
ALTER TABLE aud_incidencias
  MODIFY Inc_Primera_Vez DATETIME NULL DEFAULT NULL,
  MODIFY Inc_Ultima_Vez DATETIME NULL DEFAULT NULL
`;

function iso(d: Date | string | null | undefined) {
  if (!d) return "";
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return String(d);
  return x.toISOString();
}

/** Rutas candidatas al log de errores PHP/EXA (exa-ofsercont). */
export function resolveErrorLogPaths(): string[] {
  const configured = (process.env.EXA_ERROR_LOG || "")
    .split(/[;|]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const candidates: string[] = [];
  for (const c of configured) {
    candidates.push(path.isAbsolute(c) ? c : path.resolve(process.cwd(), c));
  }

  if (!candidates.length) {
    candidates.push(path.resolve(process.cwd(), "..", "exa-ofsercont", "logs"));
    candidates.push(path.resolve(process.cwd(), "logs", "exa-error.log"));
  }

  return [...new Set(candidates)];
}

const ERROR_LOG_NAME_RE = /^(exa|php_errors|php_fatal|apache_error|error)/i;

export function discoverLogFiles(): { path: string; exists: boolean; size: number }[] {
  const out: { path: string; exists: boolean; size: number }[] = [];
  for (const p of resolveErrorLogPaths()) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
        for (const name of fs.readdirSync(p)) {
          if (!/\.(log|txt)$/i.test(name)) continue;
          if (!ERROR_LOG_NAME_RE.test(name)) continue;
          const full = path.join(p, name);
          const st = fs.statSync(full);
          if (st.isFile() && st.size > 0) out.push({ path: full, exists: true, size: st.size });
        }
        continue;
      }
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        out.push({ path: p, exists: true, size: fs.statSync(p).size });
      } else {
        out.push({ path: p, exists: false, size: 0 });
      }
    } catch {
      out.push({ path: p, exists: false, size: 0 });
    }
  }
  return out;
}

function readTail(filePath: string, maxBytes = MAX_BYTES): string {
  const fd = fs.openSync(filePath, "r");
  try {
    const st = fs.fstatSync(fd);
    const size = st.size;
    const start = Math.max(0, size - maxBytes);
    const len = size - start;
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, start);
    let text = buf.toString("utf8");
    if (start > 0) {
      const nl = text.indexOf("\n");
      if (nl >= 0) text = text.slice(nl + 1);
    }
    return text;
  } finally {
    fs.closeSync(fd);
  }
}

function detectNivel(msg: string): string {
  const m = msg.toLowerCase();
  if (
    m.includes("fatal") ||
    m.includes("parse error") ||
    m.includes(".critical") ||
    m.includes(".alert") ||
    m.includes("e_error") ||
    /\btype['\"]?\s*=>\s*1\b/.test(m)
  ) {
    return "Fatal";
  }
  if (m.includes("warning") || m.includes(".warning") || m.includes("e_warning")) return "Warning";
  if (
    m.includes("notice") ||
    m.includes("deprecated") ||
    m.includes(".notice") ||
    m.includes("e_deprecated") ||
    m.includes("e_notice")
  ) {
    return "Notice";
  }
  if (m.includes("exception") || m.includes("error") || m.includes(".error") || m.includes(".emergency")) {
    return "Error";
  }
  return "Error";
}

function extractArchivoLinea(msg: string): { archivo: string | null; linea: number | null } {
  const jsonFile = msg.match(/"file"\s*:\s*"([^"]+)"/);
  const jsonLine = msg.match(/"line"\s*:\s*(\d+)/);
  if (jsonFile) {
    return {
      archivo: jsonFile[1].replace(/\\\\/g, "\\"),
      linea: jsonLine ? parseInt(jsonLine[1], 10) : null,
    };
  }
  const arrFile = msg.match(/\[file\]\s*=>\s*(.+)/i);
  const arrLine = msg.match(/\[line\]\s*=>\s*(\d+)/i);
  if (arrFile) {
    return {
      archivo: arrFile[1].trim(),
      linea: arrLine ? parseInt(arrLine[1], 10) : null,
    };
  }
  const m1 = msg.match(/\bin\s+([^\s:]+\.(?:php|js|ts|tsx|jsx))(?::(\d+))?/i);
  if (m1) {
    return { archivo: m1[1], linea: m1[2] ? parseInt(m1[2], 10) : null };
  }
  const m2 = msg.match(/\bin\s+([^\s]+)\s+on\s+line\s+(\d+)/i);
  if (m2) {
    return { archivo: m2[1], linea: parseInt(m2[2], 10) };
  }
  const m3 = msg.match(/([A-Za-z]:\\[^\s:]+\.(?:php|js)|\/[^\s:]+\.(?:php|js))(?::(\d+))?/i);
  if (m3) {
    return { archivo: m3[1], linea: m3[2] ? parseInt(m3[2], 10) : null };
  }
  return { archivo: null, linea: null };
}

function normalizeForFingerprint(msg: string, archivo: string | null, linea: number | null) {
  const n = msg
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/\b0x[0-9a-f]+\b/gi, "0xN")
    .replace(/\b\d{2,}\b/g, "N")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 400);
  const base = archivo ? path.basename(archivo).toLowerCase() : "";
  return `${base}|${linea ?? "x"}|${n}`;
}

function fingerprintOf(msg: string, archivo: string | null, linea: number | null) {
  return crypto.createHash("sha1").update(normalizeForFingerprint(msg, archivo, linea)).digest("hex");
}

function parseTs(raw: string): Date | null {
  const s = raw.trim();
  // 29-Sep-2026 14:30:15 America/Guayaquil | 29-Sep-2026 14:30:15
  const php = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})\s+(\d{2}:\d{2}:\d{2})/);
  if (php) {
    const d = new Date(`${php[2]} ${php[1]}, ${php[3]} ${php[4]} GMT-0500`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  // 2026-09-29 14:30:15 | 2026-09-08T16:55:06-05:00
  const isoish = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/);
  if (isoish) {
    if (s.includes("T") && /[Zz]|[+-]\d{2}:?\d{2}$/.test(s)) {
      const d = new Date(s);
      if (!Number.isNaN(d.getTime())) return d;
    }
    const g = parseNaiveAsGuayaquil(`${isoish[1]} ${isoish[2]}`);
    if (g) return g;
  }
  // Fri Aug 21 07:41:45 2026 | Tue Sep 29 14:30:15.123456 2026
  const apache = s.match(
    /^(?:[A-Za-z]{3}\s+)?([A-Za-z]{3})\s+(\d{1,2})\s+(\d{2}:\d{2}:\d{2})(?:\.\d+)?\s+(\d{4})/
  );
  if (apache) {
    const d = new Date(`${apache[1]} ${apache[2]}, ${apache[4]} ${apache[3]}`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const fallback = new Date(s);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function isErrorish(line: string) {
  return /fatal|error|exception|warning|notice|deprecated|stack trace|uncaught|\.alert|\.critical|\.emergency|\[message\]\s*=>/i.test(
    line
  );
}

function titleFromBody(body: string): string {
  const quoted = body.match(/^\s*(?:local\.)?[A-Z]+\s*:\s*"([^"]+)"/i);
  if (quoted) return quoted[1].slice(0, 180);
  const arrMsg = body.match(/\[message\]\s*=>\s*(.+)/i);
  if (arrMsg) return arrMsg[1].trim().slice(0, 180);
  const monolog = body.match(/^\s*(?:local\.)?(ALERT|ERROR|CRITICAL|WARNING|NOTICE|EMERGENCY)\s*:\s*(.+)$/im);
  if (monolog) return monolog[2].replace(/^"|"$/g, "").slice(0, 180);
  return body.replace(/\s+/g, " ").trim().slice(0, 180);
}

/** Parsea texto de log PHP/Apache/EXA (exa.log, php_fatal, php_errors) en entradas agrupables. */
export function parseErrorLogText(text: string, fuente: string): ParsedLogEntry[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: { when: Date; body: string }[] = [];
  let cur: { when: Date; body: string } | null = null;

  const headerRe = /^\[([^\]]+)\]\s*(.*)$/;
  // php_fatal.log: 2026-09-08T16:55:06-05:00 Array
  const isoHeaderRe = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:[+-]\d{2}:\d{2})?)\s+(.*)$/;

  for (const line of lines) {
    const hm = line.match(headerRe);
    if (hm) {
      const when = parseTs(hm[1]) || new Date();
      const rest = hm[2] || "";
      if (cur) blocks.push(cur);
      cur = { when, body: rest };
      continue;
    }
    const im = line.match(isoHeaderRe);
    if (im) {
      const when = parseTs(im[1]) || new Date();
      if (cur) blocks.push(cur);
      cur = { when, body: im[2] || "" };
      continue;
    }
    if (!cur) {
      if (!line.trim() || !isErrorish(line)) continue;
      cur = { when: new Date(), body: line };
      continue;
    }
    cur.body += (cur.body ? "\n" : "") + line;
  }
  if (cur) blocks.push(cur);

  const map = new Map<string, ParsedLogEntry>();
  for (const b of blocks) {
    const body = b.body.trim();
    if (!body || !isErrorish(body)) continue;
    // Ignorar ruido del built-in server sin error real
    if (/Development Server|Accepted|Closing|\[\d{3}\]:\s+(GET|POST)/i.test(body) && !/PHP (Fatal|Warning|Notice|Parse)/i.test(body)) {
      continue;
    }
    const nivel = detectNivel(body);
    const { archivo, linea } = extractArchivoLinea(body);
    const titulo = titleFromBody(body);
    const oneLine = body.replace(/\s+/g, " ").trim();
    const fp = fingerprintOf(titulo || oneLine, archivo, linea);
    const prev = map.get(fp);
    if (prev) {
      prev.mensaje = body.length > prev.mensaje.length ? body : prev.mensaje;
      if (b.when > prev.cuando) prev.cuando = b.when;
      continue;
    }
    map.set(fp, {
      fingerprint: fp,
      nivel,
      titulo,
      mensaje: body.slice(0, 8000),
      archivo,
      linea,
      cuando: b.when,
      fuente: path.basename(fuente),
    });
  }
  return [...map.values()];
}

export type ScannedEntry = ParsedLogEntry & { ocurrencias: number };

export function scanErrorLogs(): {
  entries: ScannedEntry[];
  files: { path: string; exists: boolean; size: number }[];
  scanned: string[];
} {
  const files = discoverLogFiles();
  const scanned: string[] = [];
  const byFp = new Map<string, ScannedEntry>();

  for (const f of files) {
    if (!f.exists) continue;
    let text = "";
    try {
      text = readTail(f.path);
      scanned.push(f.path);
    } catch {
      continue;
    }

    const parsed = parseErrorLogText(text, f.path);
    for (const e of parsed) {
      const needle = e.titulo.slice(0, 60);
      let occ = 1;
      if (needle.length >= 12) {
        let count = 0;
        let idx = 0;
        while ((idx = text.indexOf(needle, idx)) !== -1) {
          count++;
          idx += needle.length;
          if (count > 500) break;
        }
        occ = Math.max(1, count);
      }

      const prev = byFp.get(e.fingerprint);
      if (!prev) {
        byFp.set(e.fingerprint, { ...e, ocurrencias: occ });
      } else {
        prev.ocurrencias += occ;
        if (e.cuando > prev.cuando) {
          prev.cuando = e.cuando;
          prev.mensaje = e.mensaje;
          prev.titulo = e.titulo;
          prev.fuente = e.fuente;
          prev.nivel = e.nivel;
          prev.archivo = e.archivo;
          prev.linea = e.linea;
        }
      }
    }
  }

  return { entries: [...byFp.values()], files, scanned };
}

async function ensureTable(dbDis: string) {
  const prisma = getPrisma(dbDis);
  await prisma.$executeRawUnsafe(CREATE_SQL);
  // Si la tabla ya existía con DEFAULT CURRENT_TIMESTAMP, corregir columnas.
  await prisma.$executeRawUnsafe(ALTER_DATETIME_SQL);
}

type DbRow = {
  Inc_Cod: number;
  Inc_Fingerprint: string;
  Inc_Nivel: string;
  Inc_Titulo: string;
  Inc_Mensaje: string | null;
  Inc_Archivo: string | null;
  Inc_Linea: number | null;
  Inc_Primera_Vez: Date | string;
  Inc_Ultima_Vez: Date | string;
  Inc_Ocurrencias: number;
  Inc_Estado: string;
  Tar_Cod: number | null;
  Inc_Fuente: string | null;
};

export async function listIncidencias(
  dbDis: string,
  opts: { estado?: string; nivel?: string; q?: string; sync?: boolean } = {}
): Promise<{
  incidencias: IncidenciaView[];
  kpis: { total: number; nuevas: number; fatales: number; conTarea: number; ignoradas: number };
  logFiles: { path: string; exists: boolean; size: number }[];
  scanned: string[];
  logConfigured: boolean;
}> {
  const db = sanitizeDbDis(dbDis);
  await ensureTable(db);
  const prisma = getPrisma(db);

  const scan = scanErrorLogs();
  const logConfigured = scan.files.some((f) => f.exists);

  if (opts.sync !== false && scan.entries.length) {
    for (const e of scan.entries) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO aud_incidencias
          (Inc_Fingerprint, Inc_Nivel, Inc_Titulo, Inc_Mensaje, Inc_Archivo, Inc_Linea,
           Inc_Primera_Vez, Inc_Ultima_Vez, Inc_Ocurrencias, Inc_Estado, Inc_Fuente, Inc_Est)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Nueva', ?, 'A')
         ON DUPLICATE KEY UPDATE
           Inc_Nivel = VALUES(Inc_Nivel),
           Inc_Titulo = VALUES(Inc_Titulo),
           Inc_Mensaje = VALUES(Inc_Mensaje),
           Inc_Archivo = VALUES(Inc_Archivo),
           Inc_Linea = VALUES(Inc_Linea),
           Inc_Ultima_Vez = GREATEST(Inc_Ultima_Vez, VALUES(Inc_Ultima_Vez)),
           Inc_Ocurrencias = GREATEST(Inc_Ocurrencias, VALUES(Inc_Ocurrencias)),
           Inc_Fuente = VALUES(Inc_Fuente),
           Inc_Est = 'A'`,
        e.fingerprint,
        e.nivel,
        e.titulo.slice(0, 255),
        e.mensaje,
        e.archivo,
        e.linea,
        e.cuando,
        e.cuando,
        e.ocurrencias,
        e.fuente
      );
    }
  }

  const params: Array<string | number> = [];
  const where: string[] = ["Inc_Est = 'A'"];

  if (opts.estado && opts.estado !== "todos") {
    where.push("Inc_Estado = ?");
    params.push(opts.estado);
  }
  if (opts.nivel && opts.nivel !== "todos") {
    where.push("Inc_Nivel = ?");
    params.push(opts.nivel);
  }
  if (opts.q) {
    where.push(
      `(Inc_Titulo LIKE ? OR Inc_Mensaje LIKE ? OR IFNULL(Inc_Archivo,'') LIKE ? OR Inc_Fingerprint LIKE ?)`
    );
    const like = `%${opts.q}%`;
    params.push(like, like, like, like);
  }

  const rows = await prisma.$queryRawUnsafe<DbRow[]>(
    `SELECT Inc_Cod, Inc_Fingerprint, Inc_Nivel, Inc_Titulo, Inc_Mensaje, Inc_Archivo, Inc_Linea,
            Inc_Primera_Vez, Inc_Ultima_Vez, Inc_Ocurrencias, Inc_Estado, Tar_Cod, Inc_Fuente
     FROM aud_incidencias
     WHERE ${where.join(" AND ")}
     ORDER BY
       FIELD(Inc_Nivel, 'Fatal', 'Error', 'Warning', 'Notice') ASC,
       Inc_Ultima_Vez DESC
     LIMIT 400`,
    ...params
  );

  const logFps = new Set(scan.entries.map((e) => e.fingerprint));
  const incidencias: IncidenciaView[] = rows.map((r) => ({
    Inc_Cod: r.Inc_Cod,
    Inc_Fingerprint: r.Inc_Fingerprint,
    Inc_Nivel: r.Inc_Nivel,
    Inc_Titulo: r.Inc_Titulo,
    Inc_Mensaje: r.Inc_Mensaje || "",
    Inc_Archivo: r.Inc_Archivo,
    Inc_Linea: r.Inc_Linea,
    Inc_Primera_Vez: iso(r.Inc_Primera_Vez),
    Inc_Ultima_Vez: iso(r.Inc_Ultima_Vez),
    Inc_Ocurrencias: Number(r.Inc_Ocurrencias) || 1,
    Inc_Estado: r.Inc_Estado,
    Tar_Cod: r.Tar_Cod,
    Inc_Fuente: r.Inc_Fuente,
    enLog: logFps.has(r.Inc_Fingerprint),
  }));

  const allForKpis = await prisma.$queryRawUnsafe<
    Array<{ Inc_Estado: string; Inc_Nivel: string; Tar_Cod: number | null }>
  >(`SELECT Inc_Estado, Inc_Nivel, Tar_Cod FROM aud_incidencias WHERE Inc_Est = 'A'`);

  const kpis = {
    total: allForKpis.length,
    nuevas: allForKpis.filter((x) => x.Inc_Estado === "Nueva").length,
    fatales: allForKpis.filter((x) => x.Inc_Nivel === "Fatal").length,
    conTarea: allForKpis.filter((x) => x.Tar_Cod != null || x.Inc_Estado === "Tarea creada").length,
    ignoradas: allForKpis.filter((x) => x.Inc_Estado === "Ignorada" || x.Inc_Estado === "Resuelta")
      .length,
  };

  return { incidencias, kpis, logFiles: scan.files, scanned: scan.scanned, logConfigured };
}

export async function updateIncidenciaEstado(
  dbDis: string,
  incCod: number,
  estado: IncEstado
) {
  const db = sanitizeDbDis(dbDis);
  await ensureTable(db);
  const prisma = getPrisma(db);
  await prisma.$executeRawUnsafe(
    `UPDATE aud_incidencias SET Inc_Estado = ? WHERE Inc_Cod = ? AND Inc_Est = 'A'`,
    estado,
    incCod
  );
}

export async function crearTareaDesdeIncidencia(
  dbDis: string,
  data: {
    incCod?: number;
    fingerprint?: string;
    perCodAsignar?: number;
    usuCreador?: number;
    prioridad?: string;
    titulo?: string;
  }
) {
  const db = sanitizeDbDis(dbDis);
  await ensureTable(db);
  const prisma = getPrisma(db);

  let row: DbRow | null = null;
  if (data.incCod && data.incCod > 0) {
    const rows = await prisma.$queryRawUnsafe<DbRow[]>(
      `SELECT * FROM aud_incidencias WHERE Inc_Cod = ? AND Inc_Est = 'A' LIMIT 1`,
      data.incCod
    );
    row = rows[0] || null;
  } else if (data.fingerprint) {
    const rows = await prisma.$queryRawUnsafe<DbRow[]>(
      `SELECT * FROM aud_incidencias WHERE Inc_Fingerprint = ? AND Inc_Est = 'A' LIMIT 1`,
      data.fingerprint
    );
    row = rows[0] || null;
  }
  if (!row) throw new Error("Incidencia no encontrada. Actualiza el monitor e intenta de nuevo.");

  if (row.Tar_Cod) {
    return { already: true as const, Tar_Cod: row.Tar_Cod, incidencia: row };
  }

  const nivel = row.Inc_Nivel || "Error";
  const prioridad =
    data.prioridad ||
    (nivel === "Fatal" || nivel === "Error" ? "Alta" : nivel === "Warning" ? "Media" : "Baja");

  const shortTitle =
    data.titulo?.trim() ||
    `[EXA ${nivel}] ${(row.Inc_Archivo ? path.basename(row.Inc_Archivo) + ": " : "")}${row.Inc_Titulo}`
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 255);

  const descripcion = [
    `Incidencia detectada desde log de errores EXA.`,
    ``,
    `Nivel: ${nivel}`,
    `Ocurrencias: ${row.Inc_Ocurrencias}`,
    `Primera vez: ${iso(row.Inc_Primera_Vez)}`,
    `Ultima vez: ${iso(row.Inc_Ultima_Vez)}`,
    row.Inc_Archivo
      ? `Archivo: ${row.Inc_Archivo}${row.Inc_Linea != null ? `:${row.Inc_Linea}` : ""}`
      : null,
    row.Inc_Fuente ? `Fuente: ${row.Inc_Fuente}` : null,
    `Fingerprint: ${row.Inc_Fingerprint}`,
    ``,
    `--- Mensaje ---`,
    row.Inc_Mensaje || row.Inc_Titulo,
  ]
    .filter((x) => x != null)
    .join("\n");

  const tarea = await createTarea(db, {
    titulo: shortTitle,
    descripcion,
    prioridad,
    // createTarea pone Asignado solo si hay perCodAsignar (y crea la fila)
    estado: "Pendiente",
    empCod: tasksEmpCod(),
    usuCreador: data.usuCreador,
    perCodAsignar: data.perCodAsignar,
  });

  await prisma.$executeRawUnsafe(
    `UPDATE aud_incidencias
     SET Inc_Estado = 'Tarea creada', Tar_Cod = ?, Usu_Creador = ?
     WHERE Inc_Cod = ?`,
    tarea.Tar_Cod,
    data.usuCreador && data.usuCreador > 0 ? data.usuCreador : null,
    row.Inc_Cod
  );

  return { already: false as const, Tar_Cod: tarea.Tar_Cod, tarea, incidencia: row };
}
