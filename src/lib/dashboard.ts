import { getPrisma, sanitizeDbDis } from "./db";
import { tasksEmpCod } from "./empresa";
import { getTareasDateBounds, listAsignables, listTareas, kpisTareas } from "./tareas";
import { hoyFecha, toCalendarYmd } from "./timezone";

export type ChartSlice = { label: string; value: number; color: string };

export type AssigneeMetric = {
  Per_Cod: number;
  Nombre: string;
  total: number;
  completadas: number;
  proceso: number;
  pendientes: number;
  avance_promedio: number;
  cumplimiento: number;
};

export type TeamDayPoint = {
  dia: string;
  label: string;
  avances: number;
  avance_promedio: number;
  tareas: number;
  autores: number;
  completadas: number;
};

export type DeveloperOption = {
  Per_Cod: number;
  Nombre: string;
};

export type DashboardMetrics = {
  kpis: Awaited<ReturnType<typeof kpisTareas>>;
  porEstado: ChartSlice[];
  porPrioridad: ChartSlice[];
  porAsignado: AssigneeMetric[];
  serieEquipo: TeamDayPoint[];
  desarrolladores: DeveloperOption[];
  filtro: { perCod: number | null };
  sinAsignar: number;
  online: number;
  ausente: number;
  offline: number;
  ticketsNuevos?: number;
  rango: { desde: string; hasta: string; min: string; max: string };
};

const ESTADO_COLORS: Record<string, string> = {
  Pendiente: "#94a3b8",
  Asignado: "#8b5cf6",
  "En Proceso": "#0ea5e9",
  Finalizada: "#10b981",
  Otro: "#64748b",
};

const PRIO_COLORS: Record<string, string> = {
  Alta: "#dc2626",
  Media: "#f59e0b",
  Baja: "#64748b",
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function asYmd(v: unknown, fallback: string): string {
  const s = toCalendarYmd(v);
  return YMD.test(s) ? s : fallback;
}

function addDays(fecha: string, days: number): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  return utc.toISOString().slice(0, 10);
}

function enumerateDays(desde: string, hasta: string): string[] {
  const out: string[] = [];
  let cur = desde;
  let guard = 0;
  while (cur <= hasta && guard < 400) {
    out.push(cur);
    cur = addDays(cur, 1);
    guard++;
  }
  return out;
}

function shortLabel(dia: string) {
  const [, m, d] = dia.split("-");
  return `${Number(d)}/${Number(m)}`;
}

/** Serie diaria de rendimiento del equipo (avances + culminaciones). */
async function buildSerieEquipo(
  dbDis: string,
  emp: number,
  desde: string,
  hasta: string,
  perCod?: number | null
): Promise<TeamDayPoint[]> {
  const prisma = getPrisma(dbDis);
  const hoy = hoyFecha();
  let serieDesde = asYmd(desde, hoy);
  let serieHasta = asYmd(hasta, hoy);
  if (serieDesde > serieHasta) {
    const tmp = serieDesde;
    serieDesde = serieHasta;
    serieHasta = tmp;
  }

  const span = enumerateDays(serieDesde, serieHasta).length;
  if (span > 45) {
    const clipped = addDays(serieHasta, -44);
    if (clipped > serieDesde) serieDesde = clipped;
  }

  const perFilter =
    perCod && perCod > 0
      ? `AND EXISTS (
           SELECT 1 FROM aud_tareas_asignadas a
           WHERE a.Tar_Cod = t.Tar_Cod AND a.Tas_Est = 'A' AND a.Per_Cod = ?
         )`
      : "";

  type AvaAgg = {
    dia: Date | string;
    avances: bigint | number;
    avg_pct: number | null;
    tareas: bigint | number;
    autores: bigint | number;
  };
  type FinAgg = { dia: Date | string; completadas: bigint | number };

  // Comparar por DATE(...) con strings YYYY-MM-DD (Prisma falla con Date invalid/null).
  const avaParams: Array<string | number> = [emp, serieDesde, serieHasta];
  const finParams: Array<string | number> = [emp, serieDesde, serieHasta];
  if (perCod && perCod > 0) {
    avaParams.push(perCod);
    finParams.push(perCod);
  }

  const [avaRows, finRows] = await Promise.all([
    prisma.$queryRawUnsafe<AvaAgg[]>(
      `SELECT DATE_FORMAT(av.Ava_Fecha, '%Y-%m-%d') AS dia,
              COUNT(*) AS avances,
              AVG(av.Ava_Porcentaje) AS avg_pct,
              COUNT(DISTINCT av.Tar_Cod) AS tareas,
              COUNT(DISTINCT av.Usu_Cod) AS autores
       FROM aud_tareas_avances av
       INNER JOIN aud_tareas t ON t.Tar_Cod = av.Tar_Cod AND t.Tar_Est = 'A' AND t.Emp_Cod = ?
       WHERE av.Ava_Est = 'A'
         AND DATE(av.Ava_Fecha) >= ?
         AND DATE(av.Ava_Fecha) <= ?
         ${perFilter}
       GROUP BY DATE_FORMAT(av.Ava_Fecha, '%Y-%m-%d')
       ORDER BY dia ASC`,
      ...avaParams
    ),
    prisma.$queryRawUnsafe<FinAgg[]>(
      `SELECT DATE_FORMAT(t.Tar_Fecha_Culminacion, '%Y-%m-%d') AS dia,
              COUNT(*) AS completadas
       FROM aud_tareas t
       WHERE t.Tar_Est = 'A' AND t.Emp_Cod = ?
         AND t.Tar_Estado = 'Finalizada'
         AND t.Tar_Fecha_Culminacion IS NOT NULL
         AND DATE(t.Tar_Fecha_Culminacion) >= ?
         AND DATE(t.Tar_Fecha_Culminacion) <= ?
         ${perFilter}
       GROUP BY DATE_FORMAT(t.Tar_Fecha_Culminacion, '%Y-%m-%d')
       ORDER BY dia ASC`,
      ...finParams
    ),
  ]);

  const byDia = new Map<string, Omit<TeamDayPoint, "dia" | "label">>();
  for (const r of avaRows) {
    const dia = toCalendarYmd(r.dia);
    if (!YMD.test(dia)) continue;
    byDia.set(dia, {
      avances: Number(r.avances || 0),
      avance_promedio: Math.round(Number(r.avg_pct || 0)),
      tareas: Number(r.tareas || 0),
      autores: Number(r.autores || 0),
      completadas: 0,
    });
  }
  for (const r of finRows) {
    const dia = toCalendarYmd(r.dia);
    if (!YMD.test(dia)) continue;
    const prev = byDia.get(dia) || {
      avances: 0,
      avance_promedio: 0,
      tareas: 0,
      autores: 0,
      completadas: 0,
    };
    prev.completadas = Number(r.completadas || 0);
    byDia.set(dia, prev);
  }

  return enumerateDays(serieDesde, serieHasta).map((dia) => {
    const row = byDia.get(dia);
    return {
      dia,
      label: shortLabel(dia),
      avances: row?.avances ?? 0,
      avance_promedio: row?.avance_promedio ?? 0,
      tareas: row?.tareas ?? 0,
      autores: row?.autores ?? 0,
      completadas: row?.completadas ?? 0,
    };
  });
}

export async function getDashboardMetrics(
  dbDis: string,
  empCod?: number,
  rangoOpts?: { desde?: string | null; hasta?: string | null; perCod?: number | null }
): Promise<DashboardMetrics> {
  const db = sanitizeDbDis(dbDis);
  const emp = empCod && empCod > 0 ? empCod : tasksEmpCod();
  const bounds = await getTareasDateBounds(db, emp);
  const hoy = hoyFecha();
  const min = asYmd(bounds.min, hoy);
  const max = asYmd(bounds.max, hoy);
  let desde = asYmd(rangoOpts?.desde, hoy);
  const hasta = asYmd(rangoOpts?.hasta, hoy);
  if (desde > hasta) desde = hasta;
  const rango = { desde, hasta, min, max };

  const asignables = await listAsignables(db);
  const rawPer = rangoOpts?.perCod != null ? Number(rangoOpts.perCod) : 0;
  const perCod =
    rawPer > 0 && asignables.some((a) => a.Per_Cod === rawPer) ? rawPer : null;

  const [tareas, kpis, serieEquipo] = await Promise.all([
    listTareas(db, { empCod: emp, desde, hasta, perCod: perCod || undefined }),
    kpisTareas(db, emp, { desde, hasta, perCod: perCod || undefined }),
    buildSerieEquipo(db, emp, desde, hasta, perCod),
  ]);

  const estadoMap = new Map<string, number>();
  const prioMap = new Map<string, number>();
  const byPer = new Map<number, AssigneeMetric>();
  let sinAsignar = 0;

  const pool = perCod
    ? asignables.filter((a) => a.Per_Cod === perCod)
    : asignables;

  for (const a of pool) {
    byPer.set(a.Per_Cod, {
      Per_Cod: a.Per_Cod,
      Nombre: a.Nombre,
      total: 0,
      completadas: 0,
      proceso: 0,
      pendientes: 0,
      avance_promedio: 0,
      cumplimiento: 0,
    });
  }

  for (const t of tareas) {
    const estado =
      t.Tar_Estado === "Finalizada" || (t.Ava_Porcentaje || 0) >= 100
        ? "Finalizada"
        : t.Tar_Estado === "En Proceso"
          ? "En Proceso"
          : t.Tar_Estado === "Asignado"
            ? "Asignado"
            : t.Tar_Estado === "Pendiente"
              ? "Pendiente"
              : "Otro";
    estadoMap.set(estado, (estadoMap.get(estado) || 0) + 1);

    const prio = t.Tar_Prioridad || "Media";
    prioMap.set(prio, (prioMap.get(prio) || 0) + 1);

    if (!t.Asignados.length) {
      if (!perCod) sinAsignar++;
      continue;
    }
    for (const as of t.Asignados) {
      if (perCod && as.Per_Cod !== perCod) continue;
      let row = byPer.get(as.Per_Cod);
      if (!row) {
        row = {
          Per_Cod: as.Per_Cod,
          Nombre: as.Nombre,
          total: 0,
          completadas: 0,
          proceso: 0,
          pendientes: 0,
          avance_promedio: 0,
          cumplimiento: 0,
        };
        byPer.set(as.Per_Cod, row);
      }
      row.total++;
      const pct = t.Ava_Porcentaje || 0;
      row.avance_promedio += pct;
      if (estado === "Finalizada") row.completadas++;
      else if (pct > 0 || estado === "En Proceso") row.proceso++;
      else row.pendientes++;
    }
  }

  const porAsignado = Array.from(byPer.values())
    .map((r) => ({
      ...r,
      avance_promedio: r.total ? Math.round(r.avance_promedio / r.total) : 0,
      cumplimiento: r.total ? Math.round((r.completadas / r.total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total);

  let online = 0;
  let ausente = 0;
  let offline = 0;
  try {
    const prisma = getPrisma(db);
    const configs = await prisma.aud_dev_monitoreo_config.findMany(
      perCod ? { where: { Per_Cod: perCod } } : undefined
    );
    const now = Date.now();
    for (const c of configs) {
      const last = c.Mon_Ultima_Conexion ? new Date(c.Mon_Ultima_Conexion).getTime() : 0;
      const mins = last ? (now - last) / 60000 : 999;
      if (mins <= 5) online++;
      else if (mins <= 30) ausente++;
      else offline++;
    }
  } catch {
    /* monitoreo opcional */
  }

  return {
    kpis,
    porEstado: Array.from(estadoMap.entries()).map(([label, value]) => ({
      label,
      value,
      color: ESTADO_COLORS[label] || ESTADO_COLORS.Otro,
    })),
    porPrioridad: Array.from(prioMap.entries()).map(([label, value]) => ({
      label,
      value,
      color: PRIO_COLORS[label] || PRIO_COLORS.Media,
    })),
    porAsignado,
    serieEquipo,
    desarrolladores: asignables.map((a) => ({ Per_Cod: a.Per_Cod, Nombre: a.Nombre })),
    filtro: { perCod },
    sinAsignar,
    online,
    ausente,
    offline,
    rango,
  };
}
