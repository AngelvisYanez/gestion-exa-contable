import { Prisma } from "@prisma/client";
import { getPrisma, sanitizeDbDis } from "./db";
import { toPublicCaptureUrl } from "./captures";
import { tasksEmpCod } from "./empresa";
import {
  buildAvanceDescripcion,
  isImagePath,
  isSafeUrl,
  parseAvanceDescripcion,
} from "./avance-format";
import { endOfDayZona, fechaEnZona, fmtFechaHoraZona, hoyFecha, startOfDayZona, toCalendarYmd } from "./timezone";
import { ensureMonitoreoSchema } from "./monitoreo-global";
import {
  ensureHorarioSchema,
  estaEnAlmuerzo,
  estaEnHorarioLaboral,
  HORARIO_DEFAULT,
  mapHorarioRow,
  monActivoSegunHorario,
  normalizeDias,
  normalizeHora,
  syncAllHorarios,
} from "./monitoreo-horario";

const COMPLEJIDADES = new Set(["Baja", "Media", "Alta", "Muy alta"]);

export function normalizeComplejidad(v?: string | null) {
  const c = String(v || "Media").trim();
  return COMPLEJIDADES.has(c) ? c : "Media";
}

let complejidadColumnReady = false;

/** Asegura columna Tar_Complejidad en aud_tareas (EXA legacy). */
export async function ensureTareaComplejidadColumn(dbDis: string) {
  if (complejidadColumnReady) return;
  const prisma = getPrisma(dbDis);
  try {
    const cols = await prisma.$queryRawUnsafe<Array<{ Field: string }>>(
      `SHOW COLUMNS FROM aud_tareas LIKE 'Tar_Complejidad'`
    );
    if (!cols.length) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE aud_tareas
         ADD COLUMN Tar_Complejidad VARCHAR(20) NULL DEFAULT 'Media' AFTER Tar_Prioridad`
      );
    }
    complejidadColumnReady = true;
  } catch {
    // Si no hay permisos ALTER, seguimos sin columna (create usará fallback en descripcion).
    complejidadColumnReady = false;
  }
}

function mapAdjunto(ruta: string) {
  return {
    ruta,
    url: toPublicCaptureUrl(ruta),
    nombre: ruta.split("/").pop() || ruta,
    esImagen: isImagePath(ruta),
  };
}

/** Une texto libre + rutas de evidencia (mismo formato que avances). */
export function buildTareaDescripcion(texto: string, adjuntos: string[] = []) {
  return buildAvanceDescripcion({ realizado: texto, adjuntos });
}

export function parseTareaDescripcion(raw: string | null | undefined) {
  const p = parseAvanceDescripcion(raw);
  return {
    texto: p.realizado,
    adjuntos: p.adjuntos.map(mapAdjunto),
  };
}

function ymdCalendario(v: Date | string): string {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, "0");
    const d = String(v.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(v || "");
  const m = s.match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : s.slice(0, 10);
}

function startOfDay(fecha: string) {
  return startOfDayZona(fecha);
}
function endOfDay(fecha: string) {
  return endOfDayZona(fecha);
}

export async function getTareasDateBounds(dbDis: string, empCod?: number) {
  const prisma = getPrisma(dbDis);
  const emp = empCod && empCod > 0 ? empCod : tasksEmpCod();
  const rows = await prisma.$queryRawUnsafe<
    Array<{ min_fecha: Date | string | null; max_fecha: Date | string | null }>
  >(
    `SELECT
       DATE_FORMAT(MIN(t.Tar_Fecha_Inicio), '%Y-%m-%d') AS min_fecha,
       DATE_FORMAT(MAX(COALESCE(t.Tar_Fecha_Culminacion, t.Tar_Fecha_Fin, t.Tar_Fecha_Inicio)), '%Y-%m-%d') AS max_fecha
     FROM aud_tareas t
     WHERE t.Tar_Est = 'A' AND t.Emp_Cod = ?`,
    emp
  );
  const hoy = hoyFecha();
  const minParsed = toCalendarYmd(rows[0]?.min_fecha) || hoy;
  const maxParsed = toCalendarYmd(rows[0]?.max_fecha) || hoy;
  const max = maxParsed > hoy ? maxParsed : hoy;
  const min = minParsed > max ? max : minParsed;
  return { min, max };
}

export async function listTareas(dbDis: string, opts: {
  empCod?: number;
  perCod?: number;
  estado?: string;
  q?: string;
  desde?: string;
  hasta?: string;
}) {
  await ensureTareaComplejidadColumn(dbDis);
  const prisma = getPrisma(dbDis);

  // Raw SQL: Prisma falla con Bytes/charset raros en TEXT de EXA
  const params: Array<string | number> = [];
  const where: string[] = ["t.Tar_Est = 'A'"];

  if (opts.empCod && opts.empCod > 0) {
    where.push("t.Emp_Cod = ?");
    params.push(opts.empCod);
  }
  if (opts.estado && opts.estado !== "todos") {
    where.push("t.Tar_Estado = ?");
    params.push(opts.estado);
  }
  if (opts.q) {
    where.push("(t.Tar_Titulo LIKE ? OR CONVERT(t.Tar_Descripcion USING utf8mb4) LIKE ?)");
    const like = `%${opts.q}%`;
    params.push(like, like);
  }
  if (opts.perCod && opts.perCod > 0) {
    where.push(
      "EXISTS (SELECT 1 FROM aud_tareas_asignadas a WHERE a.Tar_Cod = t.Tar_Cod AND a.Tas_Est = 'A' AND a.Per_Cod = ?)"
    );
    params.push(opts.perCod);
  }
  // Operativa en rango: solapa [desde, hasta] con el periodo de la tarea
  if (opts.desde && /^\d{4}-\d{2}-\d{2}$/.test(opts.desde)) {
    where.push(
      "(t.Tar_Fecha_Fin IS NULL OR DATE(t.Tar_Fecha_Fin) >= ? OR (t.Tar_Fecha_Culminacion IS NOT NULL AND DATE(t.Tar_Fecha_Culminacion) >= ?))"
    );
    params.push(opts.desde, opts.desde);
  }
  if (opts.hasta && /^\d{4}-\d{2}-\d{2}$/.test(opts.hasta)) {
    where.push("(t.Tar_Fecha_Inicio IS NULL OR DATE(t.Tar_Fecha_Inicio) <= ?)");
    params.push(opts.hasta);
  }

  type Row = {
    Tar_Cod: number;
    Tar_Titulo: string | null;
    Tar_Prioridad: string | null;
    Tar_Complejidad: string | null;
    Tar_Estado: string | null;
    Tar_Fecha_Inicio: Date | string | null;
    Tar_Fecha_Fin: Date | string | null;
    Tar_Fecha_Culminacion: Date | string | null;
    Emp_Cod: number | null;
    Ava_Porcentaje: number | null;
    Tar_Descripcion: string | null;
    Ava_Ultima_Fecha: Date | string | null;
    Ava_Total: bigint | number | null;
  };

  const complejidadSelect = complejidadColumnReady
    ? `CONVERT(t.Tar_Complejidad USING utf8mb4) AS Tar_Complejidad,`
    : `'Media' AS Tar_Complejidad,`;

  const sql = `
    SELECT
      t.Tar_Cod,
      CONVERT(t.Tar_Titulo USING utf8mb4) AS Tar_Titulo,
      CONVERT(t.Tar_Descripcion USING utf8mb4) AS Tar_Descripcion,
      CONVERT(t.Tar_Prioridad USING utf8mb4) AS Tar_Prioridad,
      ${complejidadSelect}
      CONVERT(t.Tar_Estado USING utf8mb4) AS Tar_Estado,
      t.Tar_Fecha_Inicio,
      t.Tar_Fecha_Fin,
      t.Tar_Fecha_Culminacion,
      t.Emp_Cod,
      (
        SELECT av.Ava_Porcentaje
        FROM aud_tareas_avances av
        WHERE av.Tar_Cod = t.Tar_Cod AND av.Ava_Est = 'A'
        ORDER BY av.Ava_Fecha DESC, av.Ava_Cod DESC
        LIMIT 1
      ) AS Ava_Porcentaje,
      (
        SELECT MAX(av.Ava_Fecha)
        FROM aud_tareas_avances av
        WHERE av.Tar_Cod = t.Tar_Cod AND av.Ava_Est = 'A'
      ) AS Ava_Ultima_Fecha,
      (
        SELECT COUNT(*)
        FROM aud_tareas_avances av
        WHERE av.Tar_Cod = t.Tar_Cod AND av.Ava_Est = 'A'
      ) AS Ava_Total
    FROM aud_tareas t
    WHERE ${where.join(" AND ")}
    ORDER BY COALESCE(t.Tar_Fecha_Culminacion, t.Tar_Fecha_Inicio) DESC, t.Tar_Cod DESC
    LIMIT 300
  `;

  const rows = await prisma.$queryRawUnsafe<Row[]>(sql, ...params);

  const tarCodes = rows.map((r) => r.Tar_Cod);
  type AsigRow = { Tar_Cod: number; Per_Cod: number; Tas_Cod: number; Nombre: string | null };
  let asignaciones: AsigRow[] = [];
  if (tarCodes.length) {
    const perFilter = opts.perCod && opts.perCod > 0 ? "AND a.Per_Cod = ?" : "";
    const asigParams: Array<string | number> = [...tarCodes];
    if (opts.perCod && opts.perCod > 0) asigParams.push(opts.perCod);
    asignaciones = await prisma.$queryRawUnsafe<AsigRow[]>(
      `SELECT a.Tar_Cod, a.Per_Cod, a.Tas_Cod,
              CONVERT(CONCAT(IFNULL(p.Prs_Ape,''), ' ', IFNULL(p.Prs_Nom,'')) USING utf8mb4) AS Nombre
       FROM aud_tareas_asignadas a
       LEFT JOIN personal per ON per.Per_Cod = a.Per_Cod
       LEFT JOIN persona p ON p.Prs_Cod = per.Prs_Cod
       WHERE a.Tas_Est = 'A' AND a.Tar_Cod IN (${tarCodes.map(() => "?").join(",")}) ${perFilter}`,
      ...asigParams
    );
  }

  const byTar = new Map<number, AsigRow[]>();
  for (const a of asignaciones) {
    const list = byTar.get(a.Tar_Cod) || [];
    list.push(a);
    byTar.set(a.Tar_Cod, list);
  }

  return rows.map((t) => {
    const asigs = byTar.get(t.Tar_Cod) || [];
    const parsed = parseTareaDescripcion(t.Tar_Descripcion);
    return {
      Tar_Cod: Number(t.Tar_Cod),
      Tar_Titulo: t.Tar_Titulo || "",
      Tar_Descripcion: parsed.texto || (t.Tar_Descripcion ? String(t.Tar_Descripcion) : null),
      Tar_Prioridad: t.Tar_Prioridad || "Media",
      Tar_Complejidad: normalizeComplejidad(t.Tar_Complejidad),
      Tar_Estado: t.Tar_Estado || "",
      Tar_Fecha_Inicio: t.Tar_Fecha_Inicio,
      Tar_Fecha_Fin: t.Tar_Fecha_Fin,
      Tar_Fecha_Culminacion: t.Tar_Fecha_Culminacion,
      Emp_Cod: t.Emp_Cod ? Number(t.Emp_Cod) : 0,
      Ava_Porcentaje: t.Ava_Porcentaje != null ? Number(t.Ava_Porcentaje) : 0,
      Ava_Ultima_Fecha: t.Ava_Ultima_Fecha,
      Ava_Total: Number(t.Ava_Total || 0),
      Evidencias_Count: parsed.adjuntos.length,
      Asignados: asigs.map((a) => ({
        Per_Cod: Number(a.Per_Cod),
        Nombre: (a.Nombre || "").trim() || "Sin nombre en ficha",
        Tas_Cod: Number(a.Tas_Cod),
      })),
    };
  });
}
export async function kpisTareas(
  dbDis: string,
  empCod?: number,
  rango?: { desde?: string; hasta?: string; perCod?: number }
) {
  const rows = await listTareas(dbDis, {
    empCod,
    desde: rango?.desde,
    hasta: rango?.hasta,
    perCod: rango?.perCod,
  });
  const hoy = hoyFecha();
  let completadas = 0;
  let proceso = 0;
  let pendientes = 0;
  let atrasadas = 0;
  let sumaPct = 0;

  for (const t of rows) {
    const pct = t.Ava_Porcentaje || 0;
    sumaPct += pct;
    if (t.Tar_Estado === "Finalizada" || pct >= 100) completadas++;
    else if (pct > 0 || t.Tar_Estado === "En Proceso") proceso++;
    else pendientes++;

    const fin = t.Tar_Fecha_Fin ? String(t.Tar_Fecha_Fin).slice(0, 10) : "";
    if (t.Tar_Estado !== "Finalizada" && pct < 100 && fin && fin < hoy) atrasadas++;
  }

  const total = rows.length;
  return {
    total,
    completadas,
    proceso,
    pendientes,
    atrasadas,
    avance_promedio: total ? Math.round(sumaPct / total) : 0,
    tasa_cumplimiento: total ? Math.round((completadas / total) * 1000) / 10 : 0,
  };
}

export class AsignacionInvalidaError extends Error {
  constructor(message = "Solo se puede asignar a miembros del equipo autorizado") {
    super(message);
    this.name = "AsignacionInvalidaError";
  }
}

export async function createTarea(
  dbDis: string,
  data: {
    titulo: string;
    descripcion?: string;
    prioridad?: string;
    complejidad?: string;
    fechaInicio?: string;
    fechaFin?: string | null;
    estado?: string;
    empCod?: number;
    usuCreador?: number;
    perCodAsignar?: number;
    adjuntos?: string[];
  }
) {
  await ensureTareaComplejidadColumn(dbDis);
  const prisma = getPrisma(dbDis);
  const empCod = data.empCod && data.empCod > 0 ? data.empCod : tasksEmpCod();
  const titulo = data.titulo.slice(0, 255);
  const complejidad = normalizeComplejidad(data.complejidad);
  const adjuntos = (data.adjuntos || [])
    .map((r) => String(r || "").trim())
    .filter((r) => r.startsWith("gestion/adjuntos/monitoreo/evidencias/"));
  const descripcionRaw = data.descripcion?.trim() ? data.descripcion.trim() : "";
  const descripcion = buildTareaDescripcion(descripcionRaw, adjuntos) || null;
  const prioridad = data.prioridad || "Media";
  const fechaInicio = data.fechaInicio ? new Date(data.fechaInicio) : new Date();
  const fechaFin = data.fechaFin ? new Date(data.fechaFin) : null;
  const estado = data.estado || "Pendiente";
  // BD EXA: Usu_Creador NOT NULL en la practica (schema Prisma lo marca opcional)
  const usuCreador = data.usuCreador && data.usuCreador > 0 ? data.usuCreador : 0;

  if (data.perCodAsignar && data.perCodAsignar > 0) {
    const ok = await isAsignableTeamMember(dbDis, data.perCodAsignar);
    if (!ok) throw new AsignacionInvalidaError();
  }

  // Raw SQL: Prisma create falla con charset latin1 en columnas VarChar de EXA
  if (complejidadColumnReady) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO aud_tareas
        (Tar_Titulo, Tar_Descripcion, Tar_Prioridad, Tar_Complejidad, Tar_Fecha_Inicio, Tar_Fecha_Fin, Tar_Estado, Emp_Cod, Usu_Creador, Tar_Est)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'A')`,
      titulo,
      descripcion,
      prioridad,
      complejidad,
      fechaInicio,
      fechaFin,
      estado,
      empCod,
      usuCreador
    );
  } else {
    await prisma.$executeRawUnsafe(
      `INSERT INTO aud_tareas
        (Tar_Titulo, Tar_Descripcion, Tar_Prioridad, Tar_Fecha_Inicio, Tar_Fecha_Fin, Tar_Estado, Emp_Cod, Usu_Creador, Tar_Est)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'A')`,
      titulo,
      descripcion,
      prioridad,
      fechaInicio,
      fechaFin,
      estado,
      empCod,
      usuCreador
    );
  }

  const inserted = await prisma.$queryRawUnsafe<Array<{ id: bigint | number }>>(
    `SELECT LAST_INSERT_ID() AS id`
  );
  const tarCod = Number(inserted?.[0]?.id || 0);
  if (!tarCod) throw new Error("No se pudo obtener Tar_Cod de la tarea creada");

  let estadoFinal = estado;
  if (data.perCodAsignar && data.perCodAsignar > 0) {
    // Raw SQL: evita fallos silenciosos de Prisma create con charset/FK legacy
    await prisma.$executeRawUnsafe(
      `INSERT INTO aud_tareas_asignadas (Tar_Cod, Per_Cod, Tas_Fecha_Asignacion, Tas_Est)
       VALUES (?, ?, NOW(), 'A')`,
      tarCod,
      data.perCodAsignar
    );
    await prisma.$executeRawUnsafe(
      `UPDATE aud_tareas SET Tar_Estado = 'Asignado' WHERE Tar_Cod = ? AND Tar_Est = 'A'`,
      tarCod
    );
    estadoFinal = "Asignado";
  } else if (estado === "Asignado") {
    // No dejar "Asignado" sin fila en aud_tareas_asignadas
    await prisma.$executeRawUnsafe(
      `UPDATE aud_tareas SET Tar_Estado = 'Pendiente' WHERE Tar_Cod = ? AND Tar_Est = 'A'`,
      tarCod
    );
    estadoFinal = "Pendiente";
  }

  return {
    Tar_Cod: tarCod,
    Tar_Titulo: titulo,
    Tar_Descripcion: parseTareaDescripcion(descripcion).texto || descripcion,
    Tar_Prioridad: prioridad,
    Tar_Complejidad: complejidad,
    Tar_Fecha_Inicio: fechaInicio,
    Tar_Fecha_Fin: fechaFin,
    Tar_Estado: estadoFinal,
    Emp_Cod: empCod,
    Usu_Creador: usuCreador,
    Tar_Est: "A",
  };
}

/**
 * Reemplaza los asignados activos de una tarea.
 * - perCods vacío: desasigna y, si estaba Asignado, pasa a Pendiente.
 * - con personas: marca Asignado si estaba Pendiente.
 */
export async function setTareaAsignados(dbDis: string, tarCod: number, perCods: number[]) {
  const prisma = getPrisma(dbDis);
  const unique = Array.from(
    new Set(perCods.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0))
  );

  for (const perCod of unique) {
    const ok = await isAsignableTeamMember(dbDis, perCod);
    if (!ok) throw new AsignacionInvalidaError();
  }

  const [exists] = await prisma.$queryRawUnsafe<Array<{ Tar_Cod: number; Tar_Estado: string | null }>>(
    `SELECT Tar_Cod, CONVERT(Tar_Estado USING utf8mb4) AS Tar_Estado
     FROM aud_tareas WHERE Tar_Cod = ? AND Tar_Est = 'A' LIMIT 1`,
    tarCod
  );
  if (!exists) throw new Error("Tarea no encontrada");

  await prisma.$executeRawUnsafe(
    `UPDATE aud_tareas_asignadas SET Tas_Est = 'I' WHERE Tar_Cod = ? AND Tas_Est = 'A'`,
    tarCod
  );

  for (const perCod of unique) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO aud_tareas_asignadas (Tar_Cod, Per_Cod, Tas_Fecha_Asignacion, Tas_Est)
       VALUES (?, ?, NOW(), 'A')`,
      tarCod,
      perCod
    );
  }

  const estadoActual = String(exists.Tar_Estado || "Pendiente");
  let estadoFinal = estadoActual;
  if (unique.length > 0 && (estadoActual === "Pendiente" || estadoActual === "Asignado")) {
    await prisma.$executeRawUnsafe(
      `UPDATE aud_tareas SET Tar_Estado = 'Asignado' WHERE Tar_Cod = ? AND Tar_Est = 'A'`,
      tarCod
    );
    estadoFinal = "Asignado";
  } else if (unique.length === 0 && estadoActual === "Asignado") {
    await prisma.$executeRawUnsafe(
      `UPDATE aud_tareas SET Tar_Estado = 'Pendiente' WHERE Tar_Cod = ? AND Tar_Est = 'A'`,
      tarCod
    );
    estadoFinal = "Pendiente";
  }

  return { Tar_Cod: tarCod, Tar_Estado: estadoFinal, Per_Cods: unique };
}

/** Adjunta evidencias a la descripción de una tarea ya creada. */
export async function attachEvidenciasTarea(dbDis: string, tarCod: number, rutas: string[]) {
  const prisma = getPrisma(dbDis);
  const adjPrefix = `gestion/adjuntos/monitoreo/evidencias/`;
  const nuevos = rutas
    .map((r) => String(r || "").trim())
    .filter((r) => r.startsWith(adjPrefix) && r.includes(`tar_${tarCod}_`));
  if (!nuevos.length) return { ok: true, adjuntos: [] as string[] };

  const [row] = await prisma.$queryRawUnsafe<Array<{ Tar_Descripcion: string | null }>>(
    `SELECT CONVERT(Tar_Descripcion USING utf8mb4) AS Tar_Descripcion
     FROM aud_tareas WHERE Tar_Cod = ? AND Tar_Est = 'A' LIMIT 1`,
    tarCod
  );
  if (!row) throw new Error("Tarea no encontrada");

  const parsed = parseAvanceDescripcion(row.Tar_Descripcion);
  const merged = Array.from(new Set([...parsed.adjuntos, ...nuevos]));
  const next = buildTareaDescripcion(parsed.realizado, merged);
  await prisma.$executeRawUnsafe(
    `UPDATE aud_tareas SET Tar_Descripcion = ? WHERE Tar_Cod = ? AND Tar_Est = 'A'`,
    next,
    tarCod
  );
  return { ok: true, adjuntos: merged };
}

export async function updateTarea(
  dbDis: string,
  tarCod: number,
  data: Partial<{
    titulo: string;
    descripcion: string;
    prioridad: string;
    complejidad: string;
    fechaInicio: string;
    fechaFin: string | null;
    estado: string;
    /** Si se envía, reemplaza las evidencias de la descripción (lista completa de rutas). */
    adjuntos: string[];
  }>
) {
  await ensureTareaComplejidadColumn(dbDis);
  const prisma = getPrisma(dbDis);

  const patch = Object.fromEntries(
    Object.entries(data).filter(([, v]) => v !== undefined)
  ) as typeof data;

  // Solo estado → SQL corto
  if (patch.estado != null && Object.keys(patch).length === 1) {
    if (patch.estado === "Finalizada") {
      await prisma.$executeRawUnsafe(
        `UPDATE aud_tareas
         SET Tar_Estado = ?, Tar_Fecha_Culminacion = NOW()
         WHERE Tar_Cod = ? AND Tar_Est = 'A'`,
        patch.estado,
        tarCod
      );
    } else {
      await prisma.$executeRawUnsafe(
        `UPDATE aud_tareas
         SET Tar_Estado = ?, Tar_Fecha_Culminacion = NULL
         WHERE Tar_Cod = ? AND Tar_Est = 'A'`,
        patch.estado,
        tarCod
      );
    }
    return { Tar_Cod: tarCod, Tar_Estado: patch.estado };
  }

  const [current] = await prisma.$queryRawUnsafe<Array<{ Tar_Descripcion: string | null }>>(
    `SELECT CONVERT(Tar_Descripcion USING utf8mb4) AS Tar_Descripcion
     FROM aud_tareas WHERE Tar_Cod = ? AND Tar_Est = 'A' LIMIT 1`,
    tarCod
  );
  if (!current) throw new Error("Tarea no encontrada");

  const existing = parseAvanceDescripcion(current.Tar_Descripcion);
  let nextDescripcion: string | null | undefined;

  if (patch.descripcion != null || patch.adjuntos != null) {
    const texto =
      patch.descripcion != null ? String(patch.descripcion).trim() : existing.realizado;
    const adjPrefix = `gestion/adjuntos/monitoreo/evidencias/`;
    const adjuntos =
      patch.adjuntos != null
        ? patch.adjuntos
            .map((r) => String(r || "").trim())
            .filter((r) => r.startsWith(adjPrefix))
        : existing.adjuntos;
    nextDescripcion = buildTareaDescripcion(texto, adjuntos) || null;
  }

  const sets: string[] = [];
  const params: Array<string | number | Date | null> = [];

  if (patch.titulo != null) {
    sets.push("Tar_Titulo = ?");
    params.push(String(patch.titulo).slice(0, 255));
  }
  if (nextDescripcion !== undefined) {
    sets.push("Tar_Descripcion = ?");
    params.push(nextDescripcion);
  }
  if (patch.prioridad != null) {
    sets.push("Tar_Prioridad = ?");
    params.push(String(patch.prioridad));
  }
  if (patch.complejidad != null && complejidadColumnReady) {
    sets.push("Tar_Complejidad = ?");
    params.push(normalizeComplejidad(patch.complejidad));
  }
  if (patch.fechaInicio != null) {
    sets.push("Tar_Fecha_Inicio = ?");
    params.push(new Date(patch.fechaInicio));
  }
  if (patch.fechaFin !== undefined) {
    sets.push("Tar_Fecha_Fin = ?");
    params.push(patch.fechaFin ? new Date(patch.fechaFin) : null);
  }
  if (patch.estado != null) {
    sets.push("Tar_Estado = ?");
    params.push(patch.estado);
    if (patch.estado === "Finalizada") {
      sets.push("Tar_Fecha_Culminacion = NOW()");
    } else {
      sets.push("Tar_Fecha_Culminacion = NULL");
    }
  }

  if (!sets.length) {
    return { Tar_Cod: tarCod };
  }

  params.push(tarCod);
  await prisma.$executeRawUnsafe(
    `UPDATE aud_tareas SET ${sets.join(", ")} WHERE Tar_Cod = ? AND Tar_Est = 'A'`,
    ...params
  );

  return {
    Tar_Cod: tarCod,
    ...(patch.titulo != null ? { Tar_Titulo: patch.titulo } : {}),
    ...(patch.estado != null ? { Tar_Estado: patch.estado } : {}),
    ...(patch.complejidad != null ? { Tar_Complejidad: normalizeComplejidad(patch.complejidad) } : {}),
  };
}

/** Baja lógica: la tarea deja de listarse (Tar_Est = I) y se desasignan los responsables activos. */
export async function deleteTarea(dbDis: string, tarCod: number) {
  const prisma = getPrisma(dbDis);
  const [exists] = await prisma.$queryRawUnsafe<Array<{ Tar_Cod: number; Tar_Titulo: string | null }>>(
    `SELECT Tar_Cod, CONVERT(Tar_Titulo USING utf8mb4) AS Tar_Titulo
     FROM aud_tareas WHERE Tar_Cod = ? AND Tar_Est = 'A' LIMIT 1`,
    tarCod
  );
  if (!exists) throw new Error("Tarea no encontrada");

  await prisma.$executeRawUnsafe(
    `UPDATE aud_tareas_asignadas SET Tas_Est = 'I' WHERE Tar_Cod = ? AND Tas_Est = 'A'`,
    tarCod
  );
  const updated = await prisma.$executeRawUnsafe(
    `UPDATE aud_tareas SET Tar_Est = 'I' WHERE Tar_Cod = ? AND Tar_Est = 'A'`,
    tarCod
  );
  if (!updated) throw new Error("No se pudo borrar la tarea");

  return { Tar_Cod: tarCod, Tar_Titulo: exists.Tar_Titulo || "" };
}

export async function registrarAvance(
  dbDis: string,
  opts: { tarCod: number; usuCod?: number; descripcion?: string; porcentaje: number }
) {
  const prisma = getPrisma(dbDis);
  const pct = Math.max(0, Math.min(100, opts.porcentaje));
  // Raw SQL: en EXA Ava_Descripcion vuelve como bytes y Prisma falla al mapear el registro creado
  await prisma.$executeRawUnsafe(
    `INSERT INTO aud_tareas_avances (Tar_Cod, Usu_Cod, Ava_Descripcion, Ava_Porcentaje, Ava_Fecha, Ava_Est)
     VALUES (?, ?, ?, ?, ?, 'A')`,
    opts.tarCod,
    opts.usuCod || null,
    opts.descripcion || null,
    pct,
    new Date()
  );

  if (pct >= 100) {
    await prisma.$executeRawUnsafe(
      `UPDATE aud_tareas SET Tar_Estado = 'Finalizada', Tar_Fecha_Culminacion = ? WHERE Tar_Cod = ?`,
      new Date(),
      opts.tarCod
    );
  } else if (pct > 0) {
    await prisma.$executeRawUnsafe(
      `UPDATE aud_tareas SET Tar_Estado = 'En Proceso', Tar_Fecha_Culminacion = NULL WHERE Tar_Cod = ?`,
      opts.tarCod
    );
  }

  return { ok: true, porcentaje: pct };
}

/** Arma Ava_Descripcion desde el body (campos estructurados o texto libre legacy). */
export function descripcionAvanceDesdeBody(body: Record<string, unknown>, tarCod: number): string {
  const str = (v: unknown, max: number) => String(v ?? "").slice(0, max);
  const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x ?? "").trim()).filter(Boolean) : []);
  const realizado = str(body.realizado ?? body.descripcion, 4000);
  const adjPrefix = `gestion/adjuntos/monitoreo/evidencias/`;
  const adjuntos = list(body.adjuntos)
    .filter((r) => r.startsWith(adjPrefix) && !r.includes("..") && r.split("/").pop()?.startsWith(`tar_${tarCod}_`))
    .slice(0, 10);
  const enlaces = list(body.enlaces).filter(isSafeUrl).map((u) => u.slice(0, 500)).slice(0, 10);
  const horasNum = Number(body.horas);
  return buildAvanceDescripcion({
    realizado,
    siguiente: str(body.siguiente, 1000),
    bloqueos: str(body.bloqueos, 1000),
    horas: Number.isFinite(horasNum) && horasNum > 0 ? Math.min(horasNum, 24) : null,
    enlaces,
    adjuntos,
  });
}

function toIso(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
}

type AvanceRow = {
  Ava_Cod: number;
  Tar_Cod: number;
  Ava_Porcentaje: number | null;
  Ava_Fecha: Date | string | null;
  Usu_Cod: number | null;
  Ava_Descripcion: string | null;
  Autor: string | null;
};

/** Avances de varias tareas con delta respecto al avance anterior de la misma tarea. */
async function loadAvances(
  prisma: ReturnType<typeof getPrisma>,
  tarCodes: number[],
  desde?: Date,
  hasta?: Date
) {
  if (!tarCodes.length) return [];
  const rows = await prisma.$queryRawUnsafe<AvanceRow[]>(
    `SELECT av.Ava_Cod, av.Tar_Cod, av.Ava_Porcentaje, av.Ava_Fecha, av.Usu_Cod,
            CONVERT(av.Ava_Descripcion USING utf8mb4) AS Ava_Descripcion,
            CONVERT(TRIM(CONCAT(IFNULL(p.Prs_Ape,''), ' ', IFNULL(p.Prs_Nom,''))) USING utf8mb4) AS Autor
     FROM aud_tareas_avances av
     LEFT JOIN usuarios u ON u.Usu_Cod = av.Usu_Cod
     LEFT JOIN persona p ON p.Prs_Cod = u.Prs_Cod
     WHERE av.Ava_Est = 'A' AND av.Tar_Cod IN (${tarCodes.map(() => "?").join(",")})
     ORDER BY av.Tar_Cod ASC, av.Ava_Fecha ASC, av.Ava_Cod ASC
     LIMIT 5000`,
    ...tarCodes
  );

  const prevByTar = new Map<number, number>();
  const out = [];
  for (const r of rows) {
    const tarCod = Number(r.Tar_Cod);
    const pct = Number(r.Ava_Porcentaje || 0);
    const prev = prevByTar.get(tarCod) ?? 0;
    prevByTar.set(tarCod, pct);
    const fecha = r.Ava_Fecha ? new Date(r.Ava_Fecha) : null;
    if (desde && (!fecha || fecha < desde)) continue;
    if (hasta && fecha && fecha > hasta) continue;
    const parsed = parseAvanceDescripcion(r.Ava_Descripcion);
    out.push({
      Ava_Cod: Number(r.Ava_Cod),
      Tar_Cod: tarCod,
      Ava_Porcentaje: pct,
      Ava_Delta: pct - prev,
      Ava_Fecha: toIso(r.Ava_Fecha),
      Usu_Cod: r.Usu_Cod ? Number(r.Usu_Cod) : null,
      Autor: (r.Autor || "").trim() || null,
      ...parsed,
      adjuntos: parsed.adjuntos.map(mapAdjunto),
    });
  }
  return out;
}

export type AvanceDetalle = Awaited<ReturnType<typeof loadAvances>>[number];

export async function getTareaDetalle(
  dbDis: string,
  tarCod: number,
  opts?: {
    capturasDias?: number;
    capturasDesde?: string | null;
    capturasHasta?: string | null;
    includeCapturas?: boolean;
    capturasLimit?: number;
  }
) {
  await ensureTareaComplejidadColumn(dbDis);
  const prisma = getPrisma(dbDis);
  await ensureMonitoreoSchema(prisma);
  const includeCapturas = opts?.includeCapturas !== false;
  const capturasDias = Math.max(1, Math.min(365, opts?.capturasDias ?? 7));
  const capturasLimit = Math.max(1, Math.min(200, opts?.capturasLimit ?? 80));
  const desdeCustom = opts?.capturasDesde?.slice(0, 10) || null;
  const hastaCustom = opts?.capturasHasta?.slice(0, 10) || null;

  type TarRow = {
    Tar_Cod: number;
    Tar_Titulo: string | null;
    Tar_Descripcion: string | null;
    Tar_Prioridad: string | null;
    Tar_Complejidad: string | null;
    Tar_Estado: string | null;
    Tar_Fecha_Inicio: Date | string | null;
    Tar_Fecha_Fin: Date | string | null;
    Tar_Fecha_Culminacion: Date | string | null;
    Usu_Creador: number | null;
    Creador: string | null;
    Tar_Proceso: string | null;
    Tar_Modulo: string | null;
    Tar_Directorio: string | null;
    Tar_Brief_Tipo: string | null;
    Tar_Brief_Md: string | null;
    Tar_Brief_Pdf: string | null;
    Tar_Brief_Fecha: Date | string | null;
  };
  const complejidadSelect = complejidadColumnReady
    ? `CONVERT(t.Tar_Complejidad USING utf8mb4) AS Tar_Complejidad,`
    : `'Media' AS Tar_Complejidad,`;
  // Columnas de brief: tolerar esquemas sin migrar (SELECT con IFNULL via subquery no; usamos try)
  let briefSelect = `NULL AS Tar_Proceso, NULL AS Tar_Modulo, NULL AS Tar_Directorio,
            NULL AS Tar_Brief_Tipo, NULL AS Tar_Brief_Md, NULL AS Tar_Brief_Pdf, NULL AS Tar_Brief_Fecha,`;
  try {
    const { ensureTareaBriefColumns } = await import("@/lib/brief/generate");
    if (await ensureTareaBriefColumns(dbDis)) {
      briefSelect = `CONVERT(t.Tar_Proceso USING utf8mb4) AS Tar_Proceso,
            CONVERT(t.Tar_Modulo USING utf8mb4) AS Tar_Modulo,
            CONVERT(t.Tar_Directorio USING utf8mb4) AS Tar_Directorio,
            CONVERT(t.Tar_Brief_Tipo USING utf8mb4) AS Tar_Brief_Tipo,
            CONVERT(t.Tar_Brief_Md USING utf8mb4) AS Tar_Brief_Md,
            CONVERT(t.Tar_Brief_Pdf USING utf8mb4) AS Tar_Brief_Pdf,
            t.Tar_Brief_Fecha,`;
    }
  } catch {
    /* keep nulls */
  }
  const [t] = await prisma.$queryRawUnsafe<TarRow[]>(
    `SELECT t.Tar_Cod,
            CONVERT(t.Tar_Titulo USING utf8mb4) AS Tar_Titulo,
            CONVERT(t.Tar_Descripcion USING utf8mb4) AS Tar_Descripcion,
            CONVERT(t.Tar_Prioridad USING utf8mb4) AS Tar_Prioridad,
            ${complejidadSelect}
            ${briefSelect}
            CONVERT(t.Tar_Estado USING utf8mb4) AS Tar_Estado,
            t.Tar_Fecha_Inicio, t.Tar_Fecha_Fin, t.Tar_Fecha_Culminacion, t.Usu_Creador,
            CONVERT(TRIM(CONCAT(IFNULL(p.Prs_Ape,''), ' ', IFNULL(p.Prs_Nom,''))) USING utf8mb4) AS Creador
     FROM aud_tareas t
     LEFT JOIN usuarios u ON u.Usu_Cod = t.Usu_Creador
     LEFT JOIN persona p ON p.Prs_Cod = u.Prs_Cod
     WHERE t.Tar_Cod = ? AND t.Tar_Est = 'A'
     LIMIT 1`,
    tarCod
  );
  if (!t) return null;

  const asignados = await prisma.$queryRawUnsafe<
    Array<{ Per_Cod: number; Tas_Cod: number; Tas_Fecha_Asignacion: Date | null; Nombre: string | null }>
  >(
    `SELECT a.Per_Cod, a.Tas_Cod, a.Tas_Fecha_Asignacion,
            CONVERT(CONCAT(IFNULL(p.Prs_Ape,''), ' ', IFNULL(p.Prs_Nom,'')) USING utf8mb4) AS Nombre
     FROM aud_tareas_asignadas a
     LEFT JOIN personal per ON per.Per_Cod = a.Per_Cod
     LEFT JOIN persona p ON p.Prs_Cod = per.Prs_Cod
     WHERE a.Tas_Est = 'A' AND a.Tar_Cod = ?`,
    tarCod
  );

  const avances = (await loadAvances(prisma, [tarCod])).reverse();

  type TelRow = {
    registros: bigint | number;
    segundos: bigint | number | null;
    clicks: bigint | number | null;
    teclas: bigint | number | null;
    lineas: bigint | number | null;
    capturas: bigint | number | null;
    primera: Date | null;
    ultima: Date | null;
  };
  const [tel] = await prisma.$queryRawUnsafe<TelRow[]>(
    `SELECT COUNT(*) AS registros,
            SUM(Tel_Segundos_Activos) AS segundos,
            SUM(Tel_Clicks) AS clicks,
            SUM(Tel_Teclas) AS teclas,
            SUM(Tel_Lineas_Estimadas) AS lineas,
            SUM(CASE WHEN Tel_Captura_Ruta IS NOT NULL AND Tel_Captura_Ruta <> '' THEN 1 ELSE 0 END) AS capturas,
            MIN(Tel_Fecha_Hora) AS primera,
            MAX(Tel_Fecha_Hora) AS ultima
     FROM aud_dev_telemetria
     WHERE Tar_Cod = ?`,
    tarCod
  );

  const desdeCapturas = desdeCustom
    ? startOfDayZona(desdeCustom)
    : new Date(Date.now() - capturasDias * 24 * 3600 * 1000);
  const hastaCapturas = hastaCustom ? endOfDayZona(hastaCustom) : null;

  const capturas = includeCapturas
    ? await prisma.$queryRawUnsafe<
        Array<{ Tel_Cod: number; Per_Cod: number; Tel_Fecha_Hora: Date; Tel_Captura_Ruta: string }>
      >(
        hastaCapturas
          ? `SELECT Tel_Cod, Per_Cod, Tel_Fecha_Hora, Tel_Captura_Ruta
             FROM aud_dev_telemetria
             WHERE Tar_Cod = ?
               AND Tel_Captura_Ruta IS NOT NULL AND Tel_Captura_Ruta <> ''
               AND Tel_Fecha_Hora >= ? AND Tel_Fecha_Hora <= ?
             ORDER BY Tel_Cod DESC
             LIMIT ${capturasLimit}`
          : `SELECT Tel_Cod, Per_Cod, Tel_Fecha_Hora, Tel_Captura_Ruta
             FROM aud_dev_telemetria
             WHERE Tar_Cod = ?
               AND Tel_Captura_Ruta IS NOT NULL AND Tel_Captura_Ruta <> ''
               AND Tel_Fecha_Hora >= ?
             ORDER BY Tel_Cod DESC
             LIMIT ${capturasLimit}`,
        ...(hastaCapturas
          ? [tarCod, desdeCapturas, hastaCapturas]
          : [tarCod, desdeCapturas])
      )
    : [];

  const horasReportadas = avances.reduce((s, a) => s + (a.horas || 0), 0);
  const evidencias = avances.reduce((s, a) => s + a.enlaces.length + a.adjuntos.length, 0);
  const descParsed = parseTareaDescripcion(t.Tar_Descripcion);

  return {
    tarea: {
      Tar_Cod: Number(t.Tar_Cod),
      Tar_Titulo: t.Tar_Titulo || "",
      Tar_Descripcion: descParsed.texto || null,
      Tar_Prioridad: t.Tar_Prioridad || "Media",
      Tar_Complejidad: normalizeComplejidad(t.Tar_Complejidad),
      Tar_Estado: t.Tar_Estado || "",
      Tar_Fecha_Inicio: toIso(t.Tar_Fecha_Inicio),
      Tar_Fecha_Fin: toIso(t.Tar_Fecha_Fin),
      Tar_Fecha_Culminacion: toIso(t.Tar_Fecha_Culminacion),
      Creador: (t.Creador || "").trim() || null,
      Ava_Porcentaje: avances[0]?.Ava_Porcentaje ?? 0,
      Tar_Proceso: t.Tar_Proceso || null,
      Tar_Modulo: t.Tar_Modulo || null,
      Tar_Directorio: t.Tar_Directorio || null,
      Tar_Brief_Tipo: t.Tar_Brief_Tipo || null,
      Tar_Brief_Md: t.Tar_Brief_Md || null,
      Tar_Brief_Pdf: t.Tar_Brief_Pdf || null,
      Tar_Brief_Fecha: toIso(t.Tar_Brief_Fecha),
    },
    evidencias_iniciales: descParsed.adjuntos,
    asignados: asignados.map((a) => ({
      Per_Cod: Number(a.Per_Cod),
      Tas_Cod: Number(a.Tas_Cod),
      Nombre: (a.Nombre || "").trim() || "Sin nombre en ficha",
      Fecha_Asignacion: toIso(a.Tas_Fecha_Asignacion),
    })),
    avances,
    resumen: {
      total_avances: avances.length,
      horas_reportadas: Math.round(horasReportadas * 100) / 100,
      evidencias: evidencias + descParsed.adjuntos.length,
      minutos_activos: Math.round(Number(tel?.segundos || 0) / 60),
      clicks: Number(tel?.clicks || 0),
      teclas: Number(tel?.teclas || 0),
      lineas: Number(tel?.lineas || 0),
      capturas: Number(tel?.capturas || 0),
      registros_telemetria: Number(tel?.registros || 0),
      primera_actividad: toIso(tel?.primera),
      ultima_actividad: toIso(tel?.ultima),
    },
    capturas: capturas.map((c) => ({
      Tel_Cod: Number(c.Tel_Cod),
      Per_Cod: Number(c.Per_Cod),
      Fecha: toIso(c.Tel_Fecha_Hora),
      Url: toPublicCaptureUrl(c.Tel_Captura_Ruta),
    })),
    capturas_meta: {
      dias: capturasDias,
      desde: desdeCustom || fechaEnZona(desdeCapturas),
      hasta: hastaCustom || null,
      limit: capturasLimit,
      incluidas: includeCapturas,
      total_periodo: capturas.length,
    },
  };
}

export type TareaDetalle = NonNullable<Awaited<ReturnType<typeof getTareaDetalle>>>;

/** Actividad reciente (avances + tiempo activo por tarea) para métricas y reportes de evidencia. */
export async function actividadPersonal(
  dbDis: string,
  opts: { perCod: number; tarCodes: number[]; dias?: number; desde?: string; hasta?: string }
) {
  const prisma = getPrisma(dbDis);
  await ensureMonitoreoSchema(prisma);
  const ymd = /^\d{4}-\d{2}-\d{2}$/;
  const hoy = hoyFecha();
  let desdeDia: string;
  let hastaDia: string;
  if (opts.desde && opts.hasta && ymd.test(opts.desde) && ymd.test(opts.hasta)) {
    desdeDia = opts.desde <= opts.hasta ? opts.desde : opts.hasta;
    hastaDia = opts.desde <= opts.hasta ? opts.hasta : opts.desde;
    if (hastaDia > hoy) hastaDia = hoy;
    if (desdeDia > hastaDia) desdeDia = hastaDia;
  } else {
    const dias = Math.max(1, Math.min(366, opts.dias ?? 30));
    hastaDia = hoy;
    desdeDia = fechaEnZona(new Date(startOfDayZona(hoy).getTime() - (dias - 1) * 24 * 3600 * 1000));
  }
  const inicio = startOfDayZona(desdeDia);
  const tope = new Date(inicio.getTime() + 365 * 24 * 3600 * 1000);
  const fin = endOfDayZona(hastaDia);
  if (fin > tope) hastaDia = fechaEnZona(tope);
  const desde = startOfDayZona(desdeDia);
  const hasta = endOfDayZona(hastaDia);
  const dias = Math.max(1, Math.round((startOfDayZona(hastaDia).getTime() - desde.getTime()) / (24 * 3600 * 1000)) + 1);

  const avances = await loadAvances(prisma, opts.tarCodes, desde, hasta);

  const tiempo = opts.perCod > 0
    ? await prisma.$queryRawUnsafe<Array<{ Tar_Cod: number | null; Dia: Date | string; segundos: bigint | number | null }>>(
        `SELECT Tar_Cod, DATE(Tel_Fecha_Hora) AS Dia, SUM(Tel_Segundos_Activos) AS segundos
         FROM aud_dev_telemetria
         WHERE Per_Cod = ? AND Tel_Fecha_Hora >= ? AND Tel_Fecha_Hora <= ?
         GROUP BY Tar_Cod, DATE(Tel_Fecha_Hora)`,
        opts.perCod,
        desde,
        hasta
      )
    : [];

  return {
    desde: desde.toISOString(),
    desdeDia,
    hastaDia,
    dias,
    avances,
    tiempo: tiempo.map((r) => ({
      Tar_Cod: r.Tar_Cod ? Number(r.Tar_Cod) : null,
      Dia: String(r.Dia instanceof Date ? fechaEnZona(r.Dia) : r.Dia).slice(0, 10),
      Minutos: Math.round(Number(r.segundos || 0) / 60),
    })),
  };
}

export async function listDevsMonitoreo(
  dbDis: string,
  soloActivos = false,
  opts: { desde?: string; hasta?: string } = {}
) {
  const prisma = getPrisma(dbDis);
  await ensureMonitoreoSchema(prisma);
  await ensureHorarioSchema(prisma);
  await syncAllHorarios(prisma);

  const configs = await prisma.aud_dev_monitoreo_config.findMany();
  const perCodes = configs.map((c) => c.Per_Cod);

  // Also include personal with recent telemetry even without config
  const recentTel = await prisma.aud_dev_telemetria.findMany({
    where: {
      Tel_Fecha_Hora: { gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) },
    },
    select: { Per_Cod: true },
    distinct: ["Per_Cod"],
  });
  for (const t of recentTel) {
    if (!perCodes.includes(t.Per_Cod)) perCodes.push(t.Per_Cod);
  }

  type DevRow = {
    Per_Cod: number;
    Per_Car: string | null;
    persona: { Prs_Nom: string | null; Prs_Ape: string | null; Prs_Ced: string | null } | null;
    config: {
      Mon_Activo: number;
      Mon_Intervalo_Minutos: number;
      Mon_Captura_Pantalla: number;
      Mon_Mac_Address: string | null;
      Mon_Ultima_Conexion: Date | null;
      Mon_Ventana_Activa: string | null;
      Mon_Proceso_Activo: string | null;
      Mon_Es_IDE: number | null;
    } | null;
  };

  let personal: DevRow[];

  if (perCodes.length === 0) {
    personal = await prisma.personal.findMany({
      where: { Per_Est: "A" },
      include: { persona: true, config: true },
      take: 50,
      orderBy: { Per_Cod: "asc" },
    });
  } else {
    personal = await prisma.personal.findMany({
      where: {
        Per_Est: "A",
        Per_Cod: { in: perCodes },
        ...(soloActivos
          ? {
              OR: [
                { config: { Mon_Activo: 1 } },
                { Per_Cod: { in: recentTel.map((r) => r.Per_Cod) } },
              ],
            }
          : {}),
      },
      include: { persona: true, config: true },
    });
  }

  const hoy = hoyFecha();
  let desde = (opts.desde || hoy).slice(0, 10);
  let hasta = (opts.hasta || hoy).slice(0, 10);
  if (desde > hasta) {
    const tmp = desde;
    desde = hasta;
    hasta = tmp;
  }

  return {
    desarrolladores: await mapDevs(personal, prisma, { desde, hasta }),
    rango: { desde, hasta },
  };
}

async function mapDevs(
  personal: Array<{
    Per_Cod: number;
    Per_Car: string | null;
    persona: { Prs_Nom: string | null; Prs_Ape: string | null; Prs_Ced: string | null } | null;
    config: {
      Mon_Activo: number;
      Mon_Intervalo_Minutos: number;
      Mon_Captura_Pantalla: number;
      Mon_Mac_Address: string | null;
      Mon_Ultima_Conexion: Date | null;
      Mon_Ventana_Activa: string | null;
      Mon_Proceso_Activo: string | null;
      Mon_Es_IDE: number | null;
    } | null;
  }>,
  prisma: ReturnType<typeof getPrisma>,
  rango: { desde: string; hasta: string }
) {
  const now = Date.now();
  const result = [];
  const desdeDt = startOfDay(rango.desde);
  const hastaDt = endOfDay(rango.hasta);

  for (const p of personal) {
    const lastTel = await prisma.aud_dev_telemetria.findFirst({
      where: { Per_Cod: p.Per_Cod },
      orderBy: { Tel_Cod: "desc" },
    });
    const lastCap = await prisma.aud_dev_telemetria.findFirst({
      where: { Per_Cod: p.Per_Cod, Tel_Captura_Ruta: { not: null } },
      orderBy: { Tel_Cod: "desc" },
    });

    const ultima =
      p.config?.Mon_Ultima_Conexion || lastTel?.Tel_Fecha_Hora || null;
    const age = ultima ? now - new Date(ultima).getTime() : Infinity;
    const estado =
      age <= 90_000 ? "Online" : age <= 600_000 ? "Ausente" : "Desconectado";

    const periodoAgg = await prisma.aud_dev_telemetria.aggregate({
      where: {
        Per_Cod: p.Per_Cod,
        Tel_Fecha_Hora: { gte: desdeDt, lte: hastaDt },
      },
      _sum: {
        Tel_Clicks: true,
        Tel_Teclas: true,
        Tel_Lineas_Estimadas: true,
        Tel_Segundos_Activos: true,
      },
      _avg: { Tel_Porc_Actividad: true },
    });

    let monForzarBandeja = 1;
    let monPermitirSalir = 0;
    let horario = mapHorarioRow(null);
    let monActivo = p.config?.Mon_Activo ?? 0;
    try {
      const extra = await prisma.$queryRawUnsafe<
        Array<{
          Mon_Activo: number | null;
          Mon_Forzar_Bandeja: number | null;
          Mon_Permitir_Salir: number | null;
          Mon_Horario_Activo: number | null;
          Mon_Hora_Inicio: string | null;
          Mon_Hora_Fin: string | null;
          Mon_Dias_Laborales: string | null;
          Mon_Almuerzo_Activo: number | null;
          Mon_Almuerzo_Inicio: string | null;
          Mon_Almuerzo_Fin: string | null;
        }>
      >(
        `SELECT Mon_Activo, Mon_Forzar_Bandeja, Mon_Permitir_Salir,
                Mon_Horario_Activo, Mon_Hora_Inicio, Mon_Hora_Fin, Mon_Dias_Laborales,
                Mon_Almuerzo_Activo, Mon_Almuerzo_Inicio, Mon_Almuerzo_Fin
         FROM aud_dev_monitoreo_config WHERE Per_Cod = ? LIMIT 1`,
        p.Per_Cod
      );
      monForzarBandeja = Number(extra[0]?.Mon_Forzar_Bandeja ?? 1) ? 1 : 0;
      monPermitirSalir = Number(extra[0]?.Mon_Permitir_Salir ?? 0) ? 1 : 0;
      monActivo = Number(extra[0]?.Mon_Activo ?? monActivo) ? 1 : 0;
      horario = mapHorarioRow({
        Mon_Horario_Activo: extra[0]?.Mon_Horario_Activo ?? 0,
        Mon_Hora_Inicio: extra[0]?.Mon_Hora_Inicio ?? undefined,
        Mon_Hora_Fin: extra[0]?.Mon_Hora_Fin ?? undefined,
        Mon_Dias_Laborales: extra[0]?.Mon_Dias_Laborales ?? undefined,
        Mon_Almuerzo_Activo: extra[0]?.Mon_Almuerzo_Activo ?? 0,
        Mon_Almuerzo_Inicio: extra[0]?.Mon_Almuerzo_Inicio ?? undefined,
        Mon_Almuerzo_Fin: extra[0]?.Mon_Almuerzo_Fin ?? undefined,
      });
    } catch {
      /* columnas ausentes o client desactualizado */
    }

    result.push({
      Per_Cod: p.Per_Cod,
      Nombre: `${p.persona?.Prs_Ape || ""} ${p.persona?.Prs_Nom || ""}`.trim(),
      Cedula: p.persona?.Prs_Ced || "",
      Cargo: p.Per_Car || "",
      Mon_Activo: monActivo,
      Mon_Intervalo_Minutos: p.config?.Mon_Intervalo_Minutos ?? 5,
      Mon_Captura_Pantalla: p.config?.Mon_Captura_Pantalla ?? 1,
      Mon_Forzar_Bandeja: monForzarBandeja,
      Mon_Permitir_Salir: monPermitirSalir,
      ...horario,
      Mon_En_Horario: horario.Mon_Horario_Activo
        ? estaEnHorarioLaboral(horario)
          ? 1
          : 0
        : null,
      Mon_En_Almuerzo: horario.Mon_Horario_Activo
        ? estaEnAlmuerzo(horario)
          ? 1
          : 0
        : null,
      Mon_Mac_Address: p.config?.Mon_Mac_Address || "",
      Ultima_Conexion: ultima,
      Ultima_Ventana: p.config?.Mon_Ventana_Activa || lastTel?.Tel_Ventana_Activa || "",
      Ultimo_Proceso: p.config?.Mon_Proceso_Activo || lastTel?.Tel_Proceso_Activo || "",
      Ultimo_Porcentaje: Number(lastTel?.Tel_Porc_Actividad || 0),
      Ultima_Captura: lastCap?.Tel_Captura_Ruta || "",
      Ultima_Captura_Url: toPublicCaptureUrl(lastCap?.Tel_Captura_Ruta),
      Estado_Conexion: estado,
      Total_Clicks_Hoy: periodoAgg._sum.Tel_Clicks || 0,
      Total_Teclas_Hoy: periodoAgg._sum.Tel_Teclas || 0,
      Total_Lineas_Hoy: periodoAgg._sum.Tel_Lineas_Estimadas || 0,
      Promedio_Actividad_Hoy: Math.round(Number(periodoAgg._avg.Tel_Porc_Actividad || 0) * 10) / 10,
      Minutos_Activos_Hoy: Math.round((periodoAgg._sum.Tel_Segundos_Activos || 0) / 60),
    });
  }

  result.sort((a, b) => {
    if (a.Mon_Activo !== b.Mon_Activo) return b.Mon_Activo - a.Mon_Activo;
    const rank = (e: string) => (e === "Online" ? 0 : e === "Ausente" ? 1 : 2);
    return rank(a.Estado_Conexion) - rank(b.Estado_Conexion) || a.Nombre.localeCompare(b.Nombre);
  });

  return result;
}

export async function setMonitoreoConfig(
  dbDis: string,
  perCod: number,
  data: {
    activo?: number;
    intervalo?: number;
    captura?: number;
    forzarBandeja?: number;
    permitirSalir?: number;
    horarioActivo?: number;
    horaInicio?: string;
    horaFin?: string;
    diasLaborales?: string;
    almuerzoActivo?: number;
    almuerzoInicio?: string;
    almuerzoFin?: string;
  }
) {
  const prisma = getPrisma(dbDis);
  await ensureMonitoreoSchema(prisma);
  await ensureHorarioSchema(prisma);

  const intervalo = Math.max(1, Math.min(120, data.intervalo ?? 5));
  const cfg = await prisma.aud_dev_monitoreo_config.upsert({
    where: { Per_Cod: perCod },
    create: {
      Per_Cod: perCod,
      Mon_Activo: data.activo ?? 0,
      Mon_Intervalo_Minutos: intervalo,
      Mon_Captura_Pantalla: data.captura ?? 1,
    },
    update: {
      ...(data.activo != null ? { Mon_Activo: data.activo } : {}),
      ...(data.intervalo != null ? { Mon_Intervalo_Minutos: intervalo } : {}),
      ...(data.captura != null ? { Mon_Captura_Pantalla: data.captura } : {}),
    },
  });

  // Columnas de bandeja (pueden no estar aún en el client Prisma generado)
  if (data.forzarBandeja != null || data.permitirSalir != null) {
    const fb = data.forzarBandeja != null ? (data.forzarBandeja ? 1 : 0) : null;
    const ps = data.permitirSalir != null ? (data.permitirSalir ? 1 : 0) : null;
    await prisma.$executeRawUnsafe(
      `UPDATE aud_dev_monitoreo_config
       SET Mon_Forzar_Bandeja = COALESCE(?, Mon_Forzar_Bandeja),
           Mon_Permitir_Salir = COALESCE(?, Mon_Permitir_Salir)
       WHERE Per_Cod = ?`,
      fb,
      ps,
      perCod
    );
  }

  if (
    data.horarioActivo != null ||
    data.horaInicio != null ||
    data.horaFin != null ||
    data.diasLaborales != null ||
    data.almuerzoActivo != null ||
    data.almuerzoInicio != null ||
    data.almuerzoFin != null
  ) {
    const ha =
      data.horarioActivo != null ? (data.horarioActivo ? 1 : 0) : null;
    const hi =
      data.horaInicio != null
        ? normalizeHora(data.horaInicio, HORARIO_DEFAULT.Mon_Hora_Inicio)
        : null;
    const hf =
      data.horaFin != null
        ? normalizeHora(data.horaFin, HORARIO_DEFAULT.Mon_Hora_Fin)
        : null;
    const dias =
      data.diasLaborales != null ? normalizeDias(data.diasLaborales) : null;
    const aa =
      data.almuerzoActivo != null ? (data.almuerzoActivo ? 1 : 0) : null;
    const ai =
      data.almuerzoInicio != null
        ? normalizeHora(data.almuerzoInicio, HORARIO_DEFAULT.Mon_Almuerzo_Inicio)
        : null;
    const af =
      data.almuerzoFin != null
        ? normalizeHora(data.almuerzoFin, HORARIO_DEFAULT.Mon_Almuerzo_Fin)
        : null;
    await prisma.$executeRawUnsafe(
      `UPDATE aud_dev_monitoreo_config
       SET Mon_Horario_Activo = COALESCE(?, Mon_Horario_Activo),
           Mon_Hora_Inicio = COALESCE(?, Mon_Hora_Inicio),
           Mon_Hora_Fin = COALESCE(?, Mon_Hora_Fin),
           Mon_Dias_Laborales = COALESCE(?, Mon_Dias_Laborales),
           Mon_Almuerzo_Activo = COALESCE(?, Mon_Almuerzo_Activo),
           Mon_Almuerzo_Inicio = COALESCE(?, Mon_Almuerzo_Inicio),
           Mon_Almuerzo_Fin = COALESCE(?, Mon_Almuerzo_Fin)
       WHERE Per_Cod = ?`,
      ha,
      hi,
      hf,
      dias,
      aa,
      ai,
      af,
      perCod
    );
  }

  const extra = await prisma.$queryRawUnsafe<
    Array<{
      Mon_Forzar_Bandeja: number;
      Mon_Permitir_Salir: number;
      Mon_Activo: number;
      Mon_Horario_Activo: number;
      Mon_Hora_Inicio: string;
      Mon_Hora_Fin: string;
      Mon_Dias_Laborales: string;
      Mon_Almuerzo_Activo: number;
      Mon_Almuerzo_Inicio: string;
      Mon_Almuerzo_Fin: string;
    }>
  >(
    `SELECT Mon_Activo, Mon_Forzar_Bandeja, Mon_Permitir_Salir,
            Mon_Horario_Activo, Mon_Hora_Inicio, Mon_Hora_Fin, Mon_Dias_Laborales,
            Mon_Almuerzo_Activo, Mon_Almuerzo_Inicio, Mon_Almuerzo_Fin
     FROM aud_dev_monitoreo_config WHERE Per_Cod = ? LIMIT 1`,
    perCod
  );
  const row = extra[0];
  const horario = mapHorarioRow(row);
  const desired = monActivoSegunHorario(horario);
  let monActivo = Number(row?.Mon_Activo ?? cfg.Mon_Activo ?? 0) ? 1 : 0;
  if (desired != null && monActivo !== desired) {
    await prisma.$executeRawUnsafe(
      `UPDATE aud_dev_monitoreo_config SET Mon_Activo = ? WHERE Per_Cod = ?`,
      desired,
      perCod
    );
    monActivo = desired;
  }

  return {
    ...cfg,
    Mon_Activo: monActivo,
    Mon_Forzar_Bandeja: row?.Mon_Forzar_Bandeja ?? 1,
    Mon_Permitir_Salir: row?.Mon_Permitir_Salir ?? 0,
    ...horario,
  };
}

export async function historialCapturas(
  dbDis: string,
  perCod: number,
  fecha: string,
  autoFecha = false,
  rango?: { desde?: string; hasta?: string; maximo?: boolean }
) {
  const prisma = getPrisma(dbDis);
  await ensureMonitoreoSchema(prisma);
  const fechasRaw = await prisma.$queryRawUnsafe<
    Array<{ Fecha: Date | string; Total_Registros: bigint | number; Total_Capturas: bigint | number }>
  >(
    `SELECT DATE(Tel_Fecha_Hora) AS Fecha,
            COUNT(*) AS Total_Registros,
            SUM(CASE WHEN Tel_Captura_Ruta IS NOT NULL AND Tel_Captura_Ruta <> '' THEN 1 ELSE 0 END) AS Total_Capturas
     FROM aud_dev_telemetria
     WHERE Per_Cod = ?
     GROUP BY DATE(Tel_Fecha_Hora)
     ORDER BY Fecha DESC
     LIMIT 365`,
    perCod
  );

  const fechas_disponibles = fechasRaw.map((f) => ({
    Fecha: ymdCalendario(f.Fecha),
    Total_Registros: Number(f.Total_Registros),
    Total_Capturas: Number(f.Total_Capturas),
  }));

  const minDisponible =
    fechas_disponibles.length > 0
      ? fechas_disponibles[fechas_disponibles.length - 1].Fecha
      : fecha;
  const maxDisponible = fechas_disponibles.length > 0 ? fechas_disponibles[0].Fecha : fecha;

  const usaRango =
    !!rango?.maximo ||
    !!(rango?.desde && /^\d{4}-\d{2}-\d{2}$/.test(rango.desde)) ||
    !!(rango?.hasta && /^\d{4}-\d{2}-\d{2}$/.test(rango.hasta));

  let desdeUsado = rango?.desde && /^\d{4}-\d{2}-\d{2}$/.test(rango.desde) ? rango.desde : "";
  let hastaUsado = rango?.hasta && /^\d{4}-\d{2}-\d{2}$/.test(rango.hasta) ? rango.hasta : "";

  if (usaRango) {
    if (rango?.maximo || !desdeUsado) desdeUsado = minDisponible;
    if (rango?.maximo || !hastaUsado) hastaUsado = maxDisponible;
    if (desdeUsado > hastaUsado) {
      const tmp = desdeUsado;
      desdeUsado = hastaUsado;
      hastaUsado = tmp;
    }
    const items = await loadHistorialRango(prisma, perCod, desdeUsado, hastaUsado);
    return {
      fecha: hastaUsado,
      desde: desdeUsado,
      hasta: hastaUsado,
      fecha_solicitada: fecha,
      fecha_ajustada: false,
      fechas_disponibles,
      rango_disponible: { min: minDisponible, max: maxDisponible },
      historial: items,
      total_registros: items.length,
    };
  }

  let fechaUsada = fecha;
  let items = await loadHistorialDia(prisma, perCod, fechaUsada);

  if (items.length === 0 && autoFecha && fechas_disponibles.length > 0) {
    fechaUsada = fechas_disponibles[0].Fecha;
    items = await loadHistorialDia(prisma, perCod, fechaUsada);
  }

  return {
    fecha: fechaUsada,
    desde: fechaUsada,
    hasta: fechaUsada,
    fecha_solicitada: fecha,
    fecha_ajustada: fechaUsada !== fecha,
    fechas_disponibles,
    rango_disponible: { min: minDisponible, max: maxDisponible },
    historial: items,
    total_registros: items.length,
  };
}

async function loadHistorialRango(
  prisma: ReturnType<typeof getPrisma>,
  perCod: number,
  desde: string,
  hasta: string
) {
  const rows = await prisma.aud_dev_telemetria.findMany({
    where: {
      Per_Cod: perCod,
      Tel_Fecha_Hora: { gte: startOfDay(desde), lte: endOfDay(hasta) },
    },
    include: { tarea: { select: { Tar_Titulo: true } } },
    orderBy: { Tel_Fecha_Hora: "desc" },
    take: 500,
  });

  return rows.map((t) => ({
    Tel_Cod: t.Tel_Cod,
    Per_Cod: t.Per_Cod,
    Tar_Cod: t.Tar_Cod,
    Tar_Titulo: t.tarea?.Tar_Titulo || null,
    Tel_Fecha_Hora: t.Tel_Fecha_Hora,
    /** Hora de Guayaquil, lista para el dashboard (no UTC crudo). */
    Tel_Hora_Local: fmtFechaHoraZona(t.Tel_Fecha_Hora, {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
    Tel_Clicks: t.Tel_Clicks,
    Tel_Teclas: t.Tel_Teclas,
    Tel_Segundos_Activos: t.Tel_Segundos_Activos,
    Tel_Porc_Actividad: Number(t.Tel_Porc_Actividad),
    Tel_Ventana_Activa: t.Tel_Ventana_Activa,
    Tel_Proceso_Activo: t.Tel_Proceso_Activo,
    Tel_Es_IDE: t.Tel_Es_IDE,
    Tel_Lineas_Estimadas: t.Tel_Lineas_Estimadas,
    Tel_Captura_Ruta: t.Tel_Captura_Ruta,
    Tel_Captura_Url: toPublicCaptureUrl(t.Tel_Captura_Ruta),
    Tel_Estado: t.Tel_Estado,
    Tel_Mac_Address: t.Tel_Mac_Address || "",
  }));
}

async function loadHistorialDia(
  prisma: ReturnType<typeof getPrisma>,
  perCod: number,
  fecha: string
) {
  return loadHistorialRango(prisma, perCod, fecha, fecha);
}

function mapColaborador(p: {
  Per_Cod: number;
  Per_Car: string | null;
  persona: { Prs_Ape: string | null; Prs_Nom: string | null; Prs_Ced: string | null } | null;
  config: {
    Mon_Activo: number | null;
    Mon_Intervalo_Minutos: number | null;
    Mon_Captura_Pantalla: number | null;
  } | null;
}) {
  return {
    Per_Cod: p.Per_Cod,
    Nombre: `${p.persona?.Prs_Ape || ""} ${p.persona?.Prs_Nom || ""}`.trim(),
    Cedula: p.persona?.Prs_Ced || "",
    Cargo: p.Per_Car || "",
    Mon_Activo: p.config?.Mon_Activo ?? 0,
    Mon_Intervalo_Minutos: p.config?.Mon_Intervalo_Minutos ?? 5,
    Mon_Captura_Pantalla: p.config?.Mon_Captura_Pantalla ?? 1,
  };
}

/** Personal activo Emp_Cod MATRIZ (96). Usado por ExaMonitor / búsqueda amplia. */
export async function listColaboradores(dbDis: string, filtro = "") {
  const prisma = getPrisma(sanitizeDbDis(dbDis));
  await ensureHorarioSchema(prisma);
  await syncAllHorarios(prisma);

  const empCod = tasksEmpCod();
  const rows = await prisma.personal.findMany({
    where: {
      Per_Est: "A",
      Emp_Cod: empCod,
      ...(filtro
        ? {
            OR: [
              { persona: { Prs_Nom: { contains: filtro } } },
              { persona: { Prs_Ape: { contains: filtro } } },
              { persona: { Prs_Ced: { contains: filtro } } },
            ],
          }
        : {}),
    },
    include: { persona: true, config: true },
    take: 80,
    orderBy: { Per_Cod: "asc" },
  });

  const out = [];
  for (const p of rows) {
    let horario = mapHorarioRow(null);
    let monActivo = p.config?.Mon_Activo ?? 0;
    try {
      const extra = await prisma.$queryRawUnsafe<
        Array<{
          Mon_Activo: number | null;
          Mon_Horario_Activo: number | null;
          Mon_Hora_Inicio: string | null;
          Mon_Hora_Fin: string | null;
          Mon_Dias_Laborales: string | null;
          Mon_Almuerzo_Activo: number | null;
          Mon_Almuerzo_Inicio: string | null;
          Mon_Almuerzo_Fin: string | null;
        }>
      >(
        `SELECT Mon_Activo, Mon_Horario_Activo, Mon_Hora_Inicio, Mon_Hora_Fin, Mon_Dias_Laborales,
                Mon_Almuerzo_Activo, Mon_Almuerzo_Inicio, Mon_Almuerzo_Fin
         FROM aud_dev_monitoreo_config WHERE Per_Cod = ? LIMIT 1`,
        p.Per_Cod
      );
      if (extra[0]) {
        horario = mapHorarioRow({
          Mon_Horario_Activo: extra[0].Mon_Horario_Activo ?? 0,
          Mon_Hora_Inicio: extra[0].Mon_Hora_Inicio ?? undefined,
          Mon_Hora_Fin: extra[0].Mon_Hora_Fin ?? undefined,
          Mon_Dias_Laborales: extra[0].Mon_Dias_Laborales ?? undefined,
          Mon_Almuerzo_Activo: extra[0].Mon_Almuerzo_Activo ?? 0,
          Mon_Almuerzo_Inicio: extra[0].Mon_Almuerzo_Inicio ?? undefined,
          Mon_Almuerzo_Fin: extra[0].Mon_Almuerzo_Fin ?? undefined,
        });
        monActivo = Number(extra[0].Mon_Activo ?? monActivo) ? 1 : 0;
      }
    } catch {
      /* ok */
    }
    out.push({
      ...mapColaborador({ ...p, config: p.config ? { ...p.config, Mon_Activo: monActivo } : null }),
      ...horario,
      Mon_En_Horario: horario.Mon_Horario_Activo
        ? estaEnHorarioLaboral(horario)
          ? 1
          : 0
        : null,
      Mon_En_Almuerzo: horario.Mon_Horario_Activo
        ? estaEnAlmuerzo(horario)
          ? 1
          : 0
        : null,
    });
  }
  return out;
}

/**
 * Quienes pueden recibir tareas: encargados y desarrolladores habilitados en el panel.
 */
export async function listAsignables(dbDis: string) {
  const { listPerCodAsignables } = await import("./panel-usuarios");
  const prisma = getPrisma(sanitizeDbDis(dbDis));
  const perCodes = await listPerCodAsignables(dbDis);
  if (!perCodes.length) return [];
  const rows = await prisma.personal.findMany({
    where: { Per_Cod: { in: perCodes }, Per_Est: "A" },
    include: { persona: true, config: true },
  });
  const order = new Map(perCodes.map((id, i) => [id, i]));
  return rows
    .map((p) => mapColaborador(p))
    .sort((a, b) => (order.get(a.Per_Cod) ?? 99) - (order.get(b.Per_Cod) ?? 99));
}

export async function isAsignableTeamMember(dbDis: string, perCod: number): Promise<boolean> {
  if (!perCod || perCod <= 0) return false;
  const asignables = await listAsignables(dbDis);
  return asignables.some((a) => a.Per_Cod === perCod);
}
