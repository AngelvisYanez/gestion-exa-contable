import { PrismaClient } from "@prisma/client";
import { altDatabase, getPrisma } from "./db";
import { EMPRESA_TAREAS, tasksEmpCod } from "./empresa";
import { findPanelActivo, ensurePanelUsuarios } from "./panel-usuarios";
import { canAssignWork, normalizePanelRole, type UserRole } from "./auth/users";
import { armarBandejaMesa, bandejaAsignadaDev } from "./monitoreo-bandeja";
import { listTicketsAsignados, ticketEstadoToKanban } from "./tickets";
import { fechaEnZona } from "./timezone";
import { estaEnAlmuerzo, estaEnHorarioLaboral, syncMonActivoPorHorario } from "./monitoreo-horario";
import { ensureMonitoreoSchema } from "./monitoreo-global";

export type TrabajoMonitorItem = {
  Tar_Cod: number;
  /** Texto para el combo de ExaMonitor (incluye estado / avance). */
  Tar_Titulo: string;
  /** Titulo limpio sin metadatos. */
  Tar_Titulo_Plain: string;
  Tar_Prioridad: string;
  Tar_Estado: string;
  Tar_Fecha_Fin: string | null;
  Ava_Porcentaje: number;
  Ava_Ultima_Fecha: string | null;
  tipo: "tarea" | "ticket";
  Tic_Cod?: number;
  Db_Origen?: string;
  /** Etiqueta corta para listados (Mis tareas). */
  label: string;
  Empresa?: string | null;
  Llegada?: string | null;
  Fecha_Asignacion?: string | null;
  Asignado?: string | null;
  por_asignar?: boolean;
};

/** Rol del panel. Primero el usuario EXA; la ficha sola a veces no está en el panel. */
export async function resolvePanelRol(
  prisma: PrismaClient,
  perCod: number,
  usuCod?: number
): Promise<UserRole | null> {
  await ensurePanelUsuarios(prisma);
  if (usuCod && usuCod > 0) {
    const directo = await findPanelActivo(prisma, usuCod);
    if (directo) return directo.rol;
  }
  if (!perCod || perCod <= 0) return null;
  const rows = await prisma.$queryRawUnsafe<Array<{ Pan_Rol: string | null }>>(
    `SELECT Pan_Rol FROM aud_panel_usuarios
     WHERE Pan_Est = 'A' AND Per_Cod = ?
     ORDER BY Usu_Cod DESC
     LIMIT 1`,
    perCod
  );
  if (rows[0]?.Pan_Rol) return normalizePanelRole(rows[0].Pan_Rol);
  const codes = await resolveUsuCodesFromPer(prisma, perCod);
  for (const usu of codes) {
    const panel = await findPanelActivo(prisma, usu);
    if (panel) return panel.rol;
  }
  return null;
}

export async function upsertPresencia(
  prisma: PrismaClient,
  opts: {
    perCod: number;
    ventana: string;
    proceso: string;
    esIde: number;
    mac: string;
    version: string;
  }
) {
  await ensureMonitoreoSchema(prisma);
  const existing = await prisma.aud_dev_monitoreo_config.findUnique({
    where: { Per_Cod: opts.perCod },
  });

  const macValue = opts.mac || null;
  const now = new Date();

  if (!existing) {
    await prisma.aud_dev_monitoreo_config.create({
      data: {
        Per_Cod: opts.perCod,
        Mon_Activo: 0,
        Mon_Intervalo_Minutos: 5,
        Mon_Captura_Pantalla: 1,
        Mon_Ultima_Conexion: now,
        Mon_Ventana_Activa: opts.ventana.slice(0, 250) || null,
        Mon_Proceso_Activo: opts.proceso.slice(0, 95) || null,
        Mon_Es_IDE: opts.esIde,
        Mon_Version_Agente: opts.version.slice(0, 20) || "1.1",
        Mon_Mac_Address: macValue,
      },
    });
    return;
  }

  await prisma.aud_dev_monitoreo_config.update({
    where: { Per_Cod: opts.perCod },
    data: {
      Mon_Ultima_Conexion: now,
      Mon_Ventana_Activa: opts.ventana.slice(0, 250) || null,
      Mon_Proceso_Activo: opts.proceso.slice(0, 95) || null,
      Mon_Es_IDE: opts.esIde,
      Mon_Version_Agente: opts.version.slice(0, 20) || "1.1",
      ...(macValue ? { Mon_Mac_Address: macValue } : {}),
    },
  });
}

export async function syncPresenciaAlt(
  dbDis: string,
  opts: {
    perCod: number;
    ventana: string;
    proceso: string;
    esIde: number;
    mac: string;
    version: string;
  }
) {
  try {
    const { telemetriaMirrorEnabled } = await import("./db");
    if (!telemetriaMirrorEnabled()) return;
    const alt = getPrisma(altDatabase(dbDis));
    await upsertPresencia(alt, opts);
  } catch {
    // BD secundaria puede no existir o no tener tablas
  }
}

export async function findDesarrollador(
  prisma: PrismaClient,
  identificador: string
) {
  const isNumeric = /^\d+$/.test(identificador);
  const perCod = isNumeric ? parseInt(identificador, 10) : 0;
  const empCod = tasksEmpCod();

  const row = await prisma.personal.findFirst({
    where: {
      Per_Est: "A",
      Emp_Cod: empCod,
      OR: [
        ...(perCod > 0 ? [{ Per_Cod: perCod }] : []),
        { persona: { Prs_Ced: identificador } },
      ],
    },
    include: {
      persona: true,
      config: true,
    },
  });

  return row;
}

/** Todos los Usu_Cod EXA del colaborador (multi-sucursal); MATRIZ primero. */
export async function resolveUsuCodesFromPer(
  prisma: PrismaClient,
  perCod: number
): Promise<number[]> {
  if (perCod <= 0) return [];
  const empCod = tasksEmpCod();
  const rows = await prisma.$queryRawUnsafe<Array<{ Usu_Cod: number | bigint }>>(
    `SELECT DISTINCT u.Usu_Cod
     FROM personal per
     INNER JOIN usuarios u ON u.Prs_Cod = per.Prs_Cod AND u.Usu_Est = 'A'
     WHERE per.Per_Cod = ?
       AND per.Per_Est = 'A'
       AND (per.Emp_Cod = ? OR per.Emp_Cod IS NULL)
     ORDER BY CASE WHEN u.Suc_Cod = ? THEN 0 ELSE 1 END, u.Usu_Cod DESC`,
    perCod,
    empCod,
    EMPRESA_TAREAS.sucCod
  );
  const codes = rows.map((r) => Number(r.Usu_Cod)).filter((n) => n > 0);
  // La misma cédula a veces está duplicada (10 dígitos y con sufijo 001).
  const extra = await prisma.$queryRawUnsafe<Array<{ Usu_Cod: number | bigint }>>(
    `SELECT DISTINCT u.Usu_Cod
     FROM personal per
     INNER JOIN persona p0 ON p0.Prs_Cod = per.Prs_Cod
     INNER JOIN persona p ON (
       p.Prs_Ced = p0.Prs_Ced
       OR p.Prs_Ced = CONCAT(p0.Prs_Ced, '001')
       OR CONCAT(p.Prs_Ced, '001') = p0.Prs_Ced
     )
     INNER JOIN usuarios u ON u.Prs_Cod = p.Prs_Cod AND u.Usu_Est = 'A'
     WHERE per.Per_Cod = ?
       AND per.Per_Est = 'A'
       AND p0.Prs_Ced IS NOT NULL
       AND p0.Prs_Ced <> ''`,
    perCod
  );
  const seen = new Set(codes);
  for (const r of extra) {
    const n = Number(r.Usu_Cod);
    if (n > 0 && !seen.has(n)) {
      seen.add(n);
      codes.push(n);
    }
  }
  return codes;
}

/** @deprecated Prefer resolveUsuCodesFromPer; conserva 1 código (MATRIZ / más reciente). */
export async function resolveUsuCodFromPer(
  prisma: PrismaClient,
  perCod: number
): Promise<number> {
  const codes = await resolveUsuCodesFromPer(prisma, perCod);
  return codes[0] || 0;
}

export async function tareasActivasDev(
  prisma: PrismaClient,
  perCod: number,
  usuCod?: number,
  rol?: string | null
): Promise<TrabajoMonitorItem[]> {
  const formatFin = (v: Date | string | null | undefined) => {
    if (!v) return null;
    return v instanceof Date ? fechaEnZona(v) : String(v).slice(0, 10);
  };

  const formatAvaFecha = (v: Date | string | null | undefined) => {
    if (!v) return null;
    if (v instanceof Date) return v.toISOString();
    return String(v);
  };

  const buildLabel = (opts: {
    cod: number;
    titulo: string;
    estado: string;
    pct: number;
    fin: string | null;
    tipo: "tarea" | "ticket";
    empresa?: string | null;
  }) => {
    const prefix = opts.tipo === "ticket" ? `Ticket #${opts.cod}` : `#${opts.cod}`;
    const parts = [prefix, opts.titulo, opts.estado, `${opts.pct}%`];
    if (opts.fin) parts.push(`vence ${opts.fin}`);
    if (opts.empresa) parts.push(opts.empresa);
    return parts.filter(Boolean).join(" | ");
  };

  const mapTicket = (
    t: Awaited<ReturnType<typeof listTicketsAsignados>>[number],
    porAsignar: boolean
  ): TrabajoMonitorItem => {
    const estado = porAsignar ? "Por asignar" : ticketEstadoToKanban(t.Tic_Estado);
    const pct = porAsignar
      ? 0
      : t.Ava_Porcentaje != null
        ? Number(t.Ava_Porcentaje)
        : t.Tic_Estado === "Cerrado"
          ? 100
          : 0;
    const plain = t.Tic_Titulo || `Ticket #${t.Tic_Cod}`;
    const empresa = (t.Emp_Nom || "").trim() || null;
    const llegada = (t.Tic_Fecha_Llegada || "").slice(0, 16).replace("T", " ") || null;
    const origen =
      t.Db_Origen === "servicios"
        ? "Servicios"
        : t.Db_Origen === "relavera" || String(t.Db_Origen || "").startsWith("relavera")
          ? "Relavera"
          : "EXA";
    const label = buildLabel({
      cod: t.Tic_Cod,
      titulo: `${origen} · ${plain}`,
      estado,
      pct,
      fin: null,
      tipo: "ticket",
      empresa,
    });
    return {
      Tar_Cod: t.Tic_Cod,
      Tar_Titulo: label,
      Tar_Titulo_Plain: plain,
      Tar_Prioridad: t.Tic_Prioridad || "Media",
      Tar_Estado: estado,
      Tar_Fecha_Fin: null,
      Ava_Porcentaje: pct,
      Ava_Ultima_Fecha: t.Tic_Fecha_Asignacion || t.Tic_Fecha_Llegada || null,
      tipo: "ticket",
      Tic_Cod: t.Tic_Cod,
      Db_Origen: t.Db_Origen,
      label,
      Empresa: empresa,
      Llegada: llegada,
      Fecha_Asignacion: porAsignar ? null : t.Fecha_Asignacion || null,
      Asignado: porAsignar ? null : t.Asignado_Nombre,
      por_asignar: porAsignar,
    };
  };

  const empCod = tasksEmpCod();
  type Row = {
    Tar_Cod: number;
    Tar_Titulo: string | null;
    Tar_Prioridad: string | null;
    Tar_Estado: string | null;
    Tar_Fecha_Fin: Date | string | null;
    Ava_Porcentaje: number | null;
    Ava_Ultima_Fecha: Date | string | null;
  };

  const tareaSelect = `
       t.Tar_Cod,
       CONVERT(t.Tar_Titulo USING utf8mb4) AS Tar_Titulo,
       CONVERT(t.Tar_Prioridad USING utf8mb4) AS Tar_Prioridad,
       CONVERT(t.Tar_Estado USING utf8mb4) AS Tar_Estado,
       t.Tar_Fecha_Fin,
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
       ) AS Ava_Ultima_Fecha`;

  const mapTarea = (r: Row): TrabajoMonitorItem => {
    const plain = (r.Tar_Titulo || "").trim() || `Tarea #${r.Tar_Cod}`;
    const estado = r.Tar_Estado || "";
    const pct = r.Ava_Porcentaje != null ? Number(r.Ava_Porcentaje) : 0;
    const fin = formatFin(r.Tar_Fecha_Fin);
    const label = buildLabel({
      cod: Number(r.Tar_Cod),
      titulo: plain,
      estado,
      pct,
      fin,
      tipo: "tarea",
    });
    return {
      Tar_Cod: Number(r.Tar_Cod),
      Tar_Titulo: label,
      Tar_Titulo_Plain: plain,
      Tar_Prioridad: r.Tar_Prioridad || "Media",
      Tar_Estado: estado,
      Tar_Fecha_Fin: fin,
      Ava_Porcentaje: pct,
      Ava_Ultima_Fecha: formatAvaFecha(r.Ava_Ultima_Fecha),
      tipo: "tarea" as const,
      label,
    };
  };

  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT ${tareaSelect}
     FROM aud_tareas_asignadas a
     INNER JOIN aud_tareas t ON t.Tar_Cod = a.Tar_Cod
     WHERE a.Per_Cod = ?
       AND a.Tas_Est = 'A'
       AND t.Emp_Cod = ?
       AND t.Tar_Est = 'A'
       AND t.Tar_Estado <> 'Finalizada'
     ORDER BY t.Tar_Fecha_Fin IS NULL, t.Tar_Fecha_Fin ASC, a.Tas_Cod ASC`,
    perCod,
    empCod
  );
  const tareas = rows.map(mapTarea);

  const aseCodes = await resolveUsuCodesFromPer(prisma, perCod);
  if (usuCod && usuCod > 0 && !aseCodes.includes(usuCod)) {
    aseCodes.unshift(usuCod);
  }

  let tickets: TrabajoMonitorItem[] = [];
  if (aseCodes.length) {
    try {
      const raw = await listTicketsAsignados({
        aseCodes,
        perCodes: perCod > 0 ? [perCod] : [],
        limit: 500,
      });
      tickets = raw
        .filter((t) => t.Tic_Estado !== "Cerrado")
        .map((t) => mapTicket(t, false));
    } catch (err) {
      console.error("[monitoreo] tickets asignados:", err instanceof Error ? err.message : err);
    }
  }

  if (!canAssignWork(rol)) {
    return bandejaAsignadaDev([...tareas, ...tickets]);
  }

  let tareasSinAsignar: TrabajoMonitorItem[] = [];
  const libres = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT ${tareaSelect}
     FROM aud_tareas t
     WHERE t.Emp_Cod = ?
       AND t.Tar_Est = 'A'
       AND t.Tar_Estado <> 'Finalizada'
       AND NOT EXISTS (
         SELECT 1 FROM aud_tareas_asignadas a
         WHERE a.Tar_Cod = t.Tar_Cod AND a.Tas_Est = 'A'
       )
     ORDER BY t.Tar_Fecha_Fin IS NULL, t.Tar_Fecha_Fin ASC, t.Tar_Cod ASC`,
    empCod
  );
  tareasSinAsignar = libres.map(mapTarea);

  let tareasEquipo: TrabajoMonitorItem[] = [];
  const delEquipo = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT ${tareaSelect}
     FROM aud_tareas t
     WHERE t.Emp_Cod = ?
       AND t.Tar_Est = 'A'
       AND t.Tar_Estado <> 'Finalizada'
       AND EXISTS (
         SELECT 1 FROM aud_tareas_asignadas a
         WHERE a.Tar_Cod = t.Tar_Cod AND a.Tas_Est = 'A'
       )
     ORDER BY t.Tar_Fecha_Fin IS NULL, t.Tar_Fecha_Fin ASC, t.Tar_Cod ASC
     LIMIT 400`,
    empCod
  );
  const nombresPorTarea = new Map<number, string>();
  const idsEquipo = delEquipo.map((r) => Number(r.Tar_Cod)).filter((n) => n > 0);
  if (idsEquipo.length) {
    const marks = idsEquipo.map(() => "?").join(",");
    const nombres = await prisma.$queryRawUnsafe<
      Array<{ Tar_Cod: number | bigint; Nombre: string | null }>
    >(
      `SELECT a.Tar_Cod,
              CONVERT(TRIM(CONCAT(IFNULL(p.Prs_Ape,''), ' ', IFNULL(p.Prs_Nom,''))) USING utf8mb4) AS Nombre
       FROM aud_tareas_asignadas a
       LEFT JOIN personal per ON per.Per_Cod = a.Per_Cod
       LEFT JOIN persona p ON p.Prs_Cod = per.Prs_Cod
       WHERE a.Tas_Est = 'A' AND a.Tar_Cod IN (${marks})`,
      ...idsEquipo
    );
    for (const n of nombres) {
      const id = Number(n.Tar_Cod);
      const nombre = (n.Nombre || "").trim();
      if (!nombre) continue;
      const prev = nombresPorTarea.get(id);
      nombresPorTarea.set(id, prev ? `${prev}, ${nombre}` : nombre);
    }
  }
  tareasEquipo = delEquipo.map((r) => ({
    ...mapTarea(r),
    Asignado: nombresPorTarea.get(Number(r.Tar_Cod)) || null,
  }));

  let ticketsSinAsignar: TrabajoMonitorItem[] = [];
  try {
    const raw = await listTicketsAsignados({ bandeja: "sin_asignar", limit: 1000 });
    ticketsSinAsignar = raw.map((t) => mapTicket(t, true));
  } catch (err) {
    console.error("[monitoreo] tickets por asignar:", err instanceof Error ? err.message : err);
  }

  let ticketsEquipo: TrabajoMonitorItem[] = [];
  try {
    const raw = await listTicketsAsignados({ bandeja: "asignados", limit: 500 });
    ticketsEquipo = raw.map((t) => mapTicket(t, false));
  } catch (err) {
    console.error("[monitoreo] tickets del equipo:", err instanceof Error ? err.message : err);
  }

  return armarBandejaMesa({
    tareasSinAsignar,
    ticketsSinAsignar,
    tareasMias: tareasEquipo,
    ticketsMios: ticketsEquipo,
  });
}

export async function loadBandejaFlags(prisma: PrismaClient, perCod: number) {
  try {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ Mon_Forzar_Bandeja: number | null; Mon_Permitir_Salir: number | null }>
    >(
      `SELECT Mon_Forzar_Bandeja, Mon_Permitir_Salir
       FROM aud_dev_monitoreo_config WHERE Per_Cod = ? LIMIT 1`,
      perCod
    );
    return {
      Mon_Forzar_Bandeja: Number(rows[0]?.Mon_Forzar_Bandeja ?? 1) ? 1 : 0,
      Mon_Permitir_Salir: Number(rows[0]?.Mon_Permitir_Salir ?? 0) ? 1 : 0,
    };
  } catch {
    return { Mon_Forzar_Bandeja: 1, Mon_Permitir_Salir: 0 };
  }
}

export async function mapDevResponse(
  prisma: PrismaClient,
  row: NonNullable<Awaited<ReturnType<typeof findDesarrollador>>>
) {
  const cfg = row.config;
  const bandeja = await loadBandejaFlags(prisma, row.Per_Cod);
  const sync = await syncMonActivoPorHorario(prisma, row.Per_Cod, cfg?.Mon_Activo);
  return {
    Per_Cod: row.Per_Cod,
    Nombre: `${row.persona?.Prs_Ape || ""} ${row.persona?.Prs_Nom || ""}`.trim(),
    Cedula: row.persona?.Prs_Ced || "",
    Cargo: row.Per_Car || "",
    Emp_Cod: row.Emp_Cod || 0,
    Mon_Activo: sync.Mon_Activo,
    Mon_Intervalo_Minutos: cfg?.Mon_Intervalo_Minutos ?? 5,
    Mon_Captura_Pantalla: cfg?.Mon_Captura_Pantalla ?? 1,
    ...bandeja,
    ...sync.horario,
    Mon_En_Horario: sync.horario.Mon_Horario_Activo
      ? estaEnHorarioLaboral(sync.horario)
        ? 1
        : 0
      : null,
    Mon_En_Almuerzo: sync.horario.Mon_Horario_Activo
      ? estaEnAlmuerzo(sync.horario)
        ? 1
        : 0
      : null,
  };
}
