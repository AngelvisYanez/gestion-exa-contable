import { PrismaClient } from "@prisma/client";
import { altDatabase, getPrisma } from "./db";
import { EMPRESA_TAREAS, tasksDbDis, tasksEmpCod } from "./empresa";
import { listTickets, ticketEstadoToKanban } from "./tickets";
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
  /** Etiqueta corta para listados (Mis tareas). */
  label: string;
};

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
  return rows.map((r) => Number(r.Usu_Cod)).filter((n) => n > 0);
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
  usuCod?: number
): Promise<TrabajoMonitorItem[]> {
  const empCod = tasksEmpCod();
  // Raw SQL: Prisma no puede leer aud_tareas (Tar_Descripcion BLOB / enums legacy).
  type Row = {
    Tar_Cod: number;
    Tar_Titulo: string | null;
    Tar_Prioridad: string | null;
    Tar_Estado: string | null;
    Tar_Fecha_Fin: Date | string | null;
    Ava_Porcentaje: number | null;
    Ava_Ultima_Fecha: Date | string | null;
  };

  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT
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
       ) AS Ava_Ultima_Fecha
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
  }) => {
    const prefix = opts.tipo === "ticket" ? `Ticket #${opts.cod}` : `#${opts.cod}`;
    const parts = [prefix, opts.titulo, opts.estado, `${opts.pct}%`];
    if (opts.fin) parts.push(`vence ${opts.fin}`);
    return parts.filter(Boolean).join(" | ");
  };

  const tareas: TrabajoMonitorItem[] = rows.map((r) => {
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
  });

  const aseCodes = await resolveUsuCodesFromPer(prisma, perCod);
  if (usuCod && usuCod > 0 && !aseCodes.includes(usuCod)) {
    aseCodes.unshift(usuCod);
  }

  let tickets: TrabajoMonitorItem[] = [];
  if (aseCodes.length) {
    try {
      const raw = await listTickets(tasksDbDis(), { aseCodes, limit: 200 });
      tickets = raw
        .filter((t) => t.Tic_Estado !== "Cerrado")
        .map((t) => {
          const estado = ticketEstadoToKanban(t.Tic_Estado);
          const pct = estado === "En Proceso" ? 40 : estado === "Asignado" ? 10 : 0;
          const plain = t.Tic_Titulo || `Ticket #${t.Tic_Cod}`;
          const label = buildLabel({
            cod: t.Tic_Cod,
            titulo: plain,
            estado,
            pct,
            fin: null,
            tipo: "ticket",
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
            tipo: "ticket" as const,
            Tic_Cod: t.Tic_Cod,
            label,
          };
        });
    } catch (err) {
      console.error("[monitoreo] tickets asignados:", err instanceof Error ? err.message : err);
    }
  }

  return [...tareas, ...tickets];
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
