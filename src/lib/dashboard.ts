import { getPrisma, sanitizeDbDis } from "./db";
import { tasksEmpCod } from "./empresa";
import { getTareasDateBounds, listAsignables, listTareas, kpisTareas } from "./tareas";
import { hoyFecha, toCalendarYmd } from "./timezone";
import { CATEGORIAS_PLAZO, plazoDesdeFechas, type CategoriaPlazo } from "./plazo-tarea";

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
  /** Avances del dia por plazo de la tarea. */
  avances_plazo?: Record<CategoriaPlazo, number>;
  /** Completadas del dia por plazo de la tarea. */
  completadas_plazo?: Record<CategoriaPlazo, number>;
};

export type DeveloperOption = {
  Per_Cod: number;
  Nombre: string;
};

/** Plazo de una tarea: reexportado desde el helper compartido (ver lib/plazo-tarea). */
export type { CategoriaPlazo } from "./plazo-tarea";
export { CATEGORIAS_PLAZO } from "./plazo-tarea";

export type ComparativaCategoria = {
  total: number;
  avances: number;
  completadas: number;
  /** Culminadas dentro del rango del filtro (para la tasa por dia). */
  culminadas: number;
  avance_promedio: number;
  cumplimiento: number;
  avances_dia: number;
  completadas_dia: number;
  /** Tareas del plazo donde esta persona figura como apoyo. */
  apoyos: number;
};

export type ComparativaDev = {
  Per_Cod: number;
  Nombre: string;
  total: number;
  /** Total de tareas (de cualquier plazo) donde figura como apoyo. */
  apoyos: number;
  categorias: Record<CategoriaPlazo, ComparativaCategoria>;
};

/** Apoyos por desarrollador y plazo, para el ranking "quien apoyo mas". */
export type ApoyoDev = {
  Per_Cod: number;
  Nombre: string;
  total: number;
  categorias: Record<CategoriaPlazo, number>;
};

/** Tarea vencida (fecha fin < hoy) con dias de retraso. */
export type TareaAtrasada = {
  Tar_Cod: number;
  Tar_Titulo: string;
  Tar_Estado: string;
  Tar_Prioridad: string;
  plazo: CategoriaPlazo;
  Fecha_Fin: string;
  /** Dias de calendario desde la fecha fin hasta hoy. */
  dias_retraso: number;
  /** Avance actual (%). */
  porcentaje: number;
  /** Nombres de los asignados (o "Sin asignar"). */
  asignados: string;
};

/** Tiempo de ciclo inicio -> culminacion (dias de calendario). */
export type CicloMetric = {
  /** Tareas finalizadas con fechas completas. */
  muestra: number;
  promedio_dias: number;
  mediana_dias: number;
  minimo_dias: number;
  maximo_dias: number;
  /** Promedio por plazo de la tarea. */
  por_plazo: Record<CategoriaPlazo, { muestra: number; promedio_dias: number }>;
};

/** Puntualidad de entrega: culminadas antes o el dia de la fecha fin. */
export type PuntualidadMetric = {
  /** Tareas cerradas con fecha fin y fecha de culminacion. */
  muestra: number;
  a_tiempo: number;
  tarde: number;
  /** % de entregas a tiempo (0 si no hay muestra). */
  pct: number;
  /** Promedio de dias de desvio (negativo = adelantada). */
  desvio_promedio: number;
  por_plazo: Record<CategoriaPlazo, { muestra: number; a_tiempo: number; pct: number }>;
};

/** Tareas sin fecha fin (standby) y su antiguedad. */
export type StandbyMetric = {
  total: number;
  /** Antiguedad media (dias desde inicio) de las abiertas sin fecha fin. */
  antiguedad_promedio: number;
  tareas: Array<{
    Tar_Cod: number;
    Tar_Titulo: string;
    Tar_Prioridad: string;
    porcentaje: number;
    dias: number;
  }>;
};

/** Backlog abierto y ritmo de cierre: ETA de vaciado. */
export type BacklogMetric = {
  /** Tareas abiertas al cierre del rango. */
  abiertas: number;
  /** Tareas cerradas dentro del rango. */
  cerradas_rango: number;
  dias_rango: number;
  /** Cierres por dia del rango. */
  ritmo_dia: number;
  /** Dias estimados para vaciar el backlog (null si ritmo = 0). */
  eta_dias: number | null;
  /** Fecha estimada de vaciado (YYYY-MM-DD) o null. */
  eta_fecha: string | null;
};

/** Quien crea vs quien ejecuta tareas. */
export type CreadorEjecutorRow = {
  Per_Cod: number;
  Nombre: string;
  /** Tareas donde figura como creador (Usu_Creador). */
  creadas: number;
  /** Tareas donde figura como asignado. */
  ejecutadas: number;
  /** creadas - ejecutadas: positivo = aporta mas de lo que ejecuta. */
  balance: number;
};

/** Equilibrio de carga entre el equipo (desviacion estandar). */
export type CargaJustaMetric = {
  /** Desviacion estandar absoluta de tareas por persona. */
  desviacion: number;
  /** Coeficiente de variacion (desviacion / media) en %. */
  coeficiente: number;
  promedio: number;
  maximo: number;
  minimo: number;
  /** 0-100, 100 = reparto perfecto. */
  indice: number;
  personas: Array<{ Per_Cod: number; Nombre: string; total: number }>;
};

/** Tasa de reapertura: avances con retroceso de porcentaje. */
export type ReaperturaMetric = {
  /** Avances con Ava_Delta < 0. */
  retrocesos: number;
  /** Tareas distintas afectadas. */
  tareas: number;
  /** Total de avances del rango (denominador). */
  avances_total: number;
  /** % de avances que retroceden. */
  pct: number;
};

/** Complejidad de la tarea vs tiempo real de ciclo. */
export type ComplejidadMetric = {
  filas: Array<{
    complejidad: string;
    /** Tareas finalizadas con fechas completas. */
    muestra: number;
    promedio_dias: number;
    avance_promedio: number;
    atrasadas: number;
  }>;
};

/** Esfuerzo medido por telemetria por persona. */
export type EsfuerzoDev = {
  Per_Cod: number;
  Nombre: string;
  /** Horas activas medidas en el rango. */
  horas_activas: number;
  /** Promedio de Tel_Porc_Actividad (0-100). */
  actividad: number;
  /** Tareas distintas con telemetria en el rango. */
  tareas: number;
  clicks: number;
  teclas: number;
  /** Lineas estimadas de codigo. */
  lineas: number;
};

/** Horas medidas por tarea (telemetria). */
export type HorasTareaRow = {
  Tar_Cod: number;
  Tar_Titulo: string;
  minutos: number;
  horas: number;
};

/** Proceso/ventana activo mas frecuente en el equipo. */
export type ProcesoActivoRow = {
  nombre: string;
  registros: number;
  porcentaje: number;
  /** 1 si el proceso corresponde a un IDE. */
  es_ide: boolean;
};

/** Adherencia al horario laboral configurado por persona. */
export type HorarioAdherenciaRow = {
  Per_Cod: number;
  Nombre: string;
  /** HH:MM configurado, o null si no hay horario. */
  hora_inicio: string | null;
  hora_fin: string | null;
  /** Registros de telemetria del rango. */
  registros: number;
  /** Registros dentro del horario configurado. */
  dentro: number;
  /** % dentro de horario (0 si sin horario/registros). */
  pct: number;
};

/** Tareas con avance declarado pero sin telemetria medida. */
export type AvanceSinActividadMetric = {
  /** Tareas abiertas con avance > 0 en el rango. */
  con_avance: number;
  /** De esas, cuantas no tienen telemetria en el rango. */
  sin_actividad: number;
  /** % sin evidencia de actividad medida. */
  pct: number;
  tareas: Array<{ Tar_Cod: number; Tar_Titulo: string; porcentaje: number }>;
};

/** Comparativa de KPIs entre las bases disponibles (EXA vs Servicios). */
export type BaseComparativaRow = {
  /** Identificador de la base (exa, servicios…). */
  base: string;
  /** Etiqueta legible (EXA, Servicios…). */
  label: string;
  es_actual: boolean;
  total: number;
  completadas: number;
  proceso: number;
  pendientes: number;
  atrasadas: number;
  avance_promedio: number;
  tasa_cumplimiento: number;
};

export type DashboardMetrics = {
  kpis: Awaited<ReturnType<typeof kpisTareas>>;
  porEstado: ChartSlice[];
  porPrioridad: ChartSlice[];
  porPlazo: ChartSlice[];
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
  comparativa: ComparativaDev[];
  /** Ranking de quien mas apoyo en tareas (por plazo). */
  apoyos: ApoyoDev[];
  atrasadasList: TareaAtrasada[];
  ciclo: CicloMetric;
  puntualidad: PuntualidadMetric;
  standby: StandbyMetric;
  backlog: BacklogMetric;
  creadorEjecutor: CreadorEjecutorRow[];
  cargaJusta: CargaJustaMetric;
  reapertura: ReaperturaMetric;
  complejidad: ComplejidadMetric;
  esfuerzo: EsfuerzoDev[];
  horasTarea: HorasTareaRow[];
  procesos: ProcesoActivoRow[];
  horario: HorarioAdherenciaRow[];
  avanceSinActividad: AvanceSinActividadMetric;
  /** KPIs por base disponible (EXA vs Servicios). */
  bases: BaseComparativaRow[];
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

/** Mismos tonos que las series del grafico comparativo. */
const PLAZO_COLORS: Record<string, string> = {
  Diaria: "#0284c7",
  Semanal: "#7c3aed",
  Mensual: "#059669",
  "Sin fechas": "#d97706",
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

/** Dias de calendario entre dos fechas YYYY-MM-DD (minimo 1). */
function diasEntre(desde: string, hasta: string): number {
  const a = Date.parse(`${desde}T00:00:00Z`);
  const b = Date.parse(`${hasta}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 1;
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

function normalizePlazo(v: unknown): CategoriaPlazo {
  const s = String(v || "").trim();
  return (CATEGORIAS_PLAZO as string[]).includes(s) ? (s as CategoriaPlazo) : "Sin fechas";
}

function vaciaCategoria(): ComparativaCategoria {
  return {
    total: 0,
    avances: 0,
    completadas: 0,
    culminadas: 0,
    avance_promedio: 0,
    cumplimiento: 0,
    avances_dia: 0,
    completadas_dia: 0,
    apoyos: 0,
  };
}

/**
 * Rendimiento por desarrollador y plazo de tarea (diaria/semanal/mensual).
 * El plazo se deduce de las fechas de cada tarea, no del filtro seleccionado.
 * `avances` y `culminadas` se cuentan dentro del rango del filtro; `total`,
 * `completadas` y `avance_promedio` reflejan el estado actual de las tareas.
 */
async function buildComparativa(
  dbDis: string,
  emp: number,
  tareas: Awaited<ReturnType<typeof listTareas>>,
  desde: string,
  hasta: string,
  perCod: number | null,
  asignables: Array<{ Per_Cod: number; Nombre: string }>
): Promise<ComparativaDev[]> {
  const prisma = getPrisma(dbDis);
  const dias = Math.max(1, Math.min(400, diasEntre(desde, hasta)));
  const perFilter = perCod && perCod > 0 ? "AND a.Per_Cod = ?" : "";

  const plazoSql = `CASE
      WHEN t.Tar_Fecha_Inicio IS NULL OR t.Tar_Fecha_Fin IS NULL THEN 'Sin fechas'
      WHEN DATEDIFF(DATE(t.Tar_Fecha_Fin), DATE(t.Tar_Fecha_Inicio)) <= 0 THEN 'Diaria'
      WHEN DATEDIFF(DATE(t.Tar_Fecha_Fin), DATE(t.Tar_Fecha_Inicio)) <= 6 THEN 'Semanal'
      ELSE 'Mensual'
    END`;

  type PlazoAgg = { Per_Cod: number | bigint; plazo: string; avances?: bigint | number; culminadas?: bigint | number };

  const avaParams: Array<string | number> = [emp, desde, hasta];
  const finParams: Array<string | number> = [emp, desde, hasta];
  if (perCod && perCod > 0) {
    avaParams.push(perCod);
    finParams.push(perCod);
  }

  const [avaRows, finRows] = await Promise.all([
    prisma.$queryRawUnsafe<PlazoAgg[]>(
      `SELECT a.Per_Cod, ${plazoSql} AS plazo, COUNT(*) AS avances
       FROM aud_tareas_avances av
       INNER JOIN aud_tareas t ON t.Tar_Cod = av.Tar_Cod AND t.Tar_Est = 'A' AND t.Emp_Cod = ?
       INNER JOIN aud_tareas_asignadas a ON a.Tar_Cod = t.Tar_Cod AND a.Tas_Est = 'A'
       WHERE av.Ava_Est = 'A'
         AND DATE(av.Ava_Fecha) >= ?
         AND DATE(av.Ava_Fecha) <= ?
         ${perFilter}
       GROUP BY a.Per_Cod, plazo`,
      ...avaParams
    ),
    prisma.$queryRawUnsafe<PlazoAgg[]>(
      `SELECT a.Per_Cod, ${plazoSql} AS plazo, COUNT(*) AS culminadas
       FROM aud_tareas t
       INNER JOIN aud_tareas_asignadas a ON a.Tar_Cod = t.Tar_Cod AND a.Tas_Est = 'A'
       WHERE t.Tar_Est = 'A' AND t.Emp_Cod = ?
         AND t.Tar_Estado = 'Finalizada'
         AND t.Tar_Fecha_Culminacion IS NOT NULL
         AND DATE(t.Tar_Fecha_Culminacion) >= ?
         AND DATE(t.Tar_Fecha_Culminacion) <= ?
         ${perFilter}
       GROUP BY a.Per_Cod, plazo`,
      ...finParams
    ),
  ]);

  const byPer = new Map<number, ComparativaDev>();
  const nombres = new Map<number, string>(asignables.map((a) => [a.Per_Cod, a.Nombre]));

  const ensure = (per: number): ComparativaDev => {
    let row = byPer.get(per);
    if (!row) {
      row = {
        Per_Cod: per,
        Nombre: nombres.get(per) || `Persona ${per}`,
        total: 0,
        apoyos: 0,
        categorias: {
          Diaria: vaciaCategoria(),
          Semanal: vaciaCategoria(),
          Mensual: vaciaCategoria(),
          "Sin fechas": vaciaCategoria(),
        },
      };
      byPer.set(per, row);
    }
    return row;
  };

  for (const r of avaRows) {
    ensure(Number(r.Per_Cod)).categorias[normalizePlazo(r.plazo)].avances = Number(r.avances || 0);
  }
  for (const r of finRows) {
    ensure(Number(r.Per_Cod)).categorias[normalizePlazo(r.plazo)].culminadas = Number(r.culminadas || 0);
  }

  for (const t of tareas) {
    const pct = t.Ava_Porcentaje || 0;
    const finalizada = t.Tar_Estado === "Finalizada" || pct >= 100;
    const plazo = plazoDesdeFechas(t.Tar_Fecha_Inicio, t.Tar_Fecha_Fin);
    for (const as of t.Asignados) {
      if (perCod && as.Per_Cod !== perCod) continue;
      const cat = ensure(as.Per_Cod).categorias[plazo];
      cat.total++;
      cat.avance_promedio += pct;
      if (finalizada) cat.completadas++;
    }
    // Apoyo: se registra aparte de la asignacion, no cuenta como tarea asignada.
    const apoyoPer = t.Tar_Apoyo_Per_Cod ? Number(t.Tar_Apoyo_Per_Cod) : null;
    if (apoyoPer && apoyoPer > 0 && (!perCod || apoyoPer === perCod)) {
      const row = ensure(apoyoPer);
      row.categorias[plazo].apoyos++;
      row.apoyos++;
    }
  }

  const out: ComparativaDev[] = [];
  for (const row of byPer.values()) {
    for (const cat of CATEGORIAS_PLAZO) {
      const c = row.categorias[cat];
      c.avance_promedio = c.total ? Math.round(c.avance_promedio / c.total) : 0;
      c.cumplimiento = c.total ? Math.round((c.completadas / c.total) * 100) : 0;
      c.avances_dia = Math.round((c.avances / dias) * 100) / 100;
      c.completadas_dia = Math.round((c.culminadas / dias) * 100) / 100;
    }
    const conDatos = CATEGORIAS_PLAZO.some((cat) => {
      const c = row.categorias[cat];
      return c.total > 0 || c.avances > 0 || c.culminadas > 0 || c.apoyos > 0;
    });
    if (conDatos) out.push(row);
  }
  return out.sort((a, b) => b.total - a.total);
}

/** Ranking "quien apoyo mas": tareas donde cada persona figura como apoyo. */
function buildApoyos(
  comparativa: ComparativaDev[],
  asignables: Array<{ Per_Cod: number; Nombre: string }>
): ApoyoDev[] {
  const out: ApoyoDev[] = [];
  for (const row of comparativa) {
    if (row.apoyos <= 0) continue;
    const categorias = {
      Diaria: row.categorias.Diaria.apoyos,
      Semanal: row.categorias.Semanal.apoyos,
      Mensual: row.categorias.Mensual.apoyos,
      "Sin fechas": row.categorias["Sin fechas"].apoyos,
    } as Record<CategoriaPlazo, number>;
    out.push({
      Per_Cod: row.Per_Cod,
      Nombre: row.Nombre || asignables.find((a) => a.Per_Cod === row.Per_Cod)?.Nombre || `Persona ${row.Per_Cod}`,
      total: row.apoyos,
      categorias,
    });
  }
  return out.sort((a, b) => b.total - a.total);
}

/** Dias de calendario entre dos YMD (b - a). */
function diffDias(a: string, b: string): number {
  const ta = Date.parse(`${a}T00:00:00Z`);
  const tb = Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return 0;
  return Math.round((tb - ta) / 86400000);
}

function ymdOf(v: unknown): string {
  return toCalendarYmd(v);
}

function mediana(valores: number[]): number {
  if (!valores.length) return 0;
  const orden = [...valores].sort((a, b) => a - b);
  const mid = Math.floor(orden.length / 2);
  return orden.length % 2 ? orden[mid] : Math.round(((orden[mid - 1] + orden[mid]) / 2) * 10) / 10;
}

function plazoVacio<T>(vacio: () => T): Record<CategoriaPlazo, T> {
  return {
    Diaria: vacio(),
    Semanal: vacio(),
    Mensual: vacio(),
    "Sin fechas": vacio(),
  };
}

type TareaFila = Awaited<ReturnType<typeof listTareas>>[number];

/** Metricas derivadas del estado actual de las tareas (sin consultas extra). */
function buildTareasDerivadas(tareas: TareaFila[], desde: string, hasta: string, hoy: string) {
  const atrasadasList: TareaAtrasada[] = [];
  const cicloValores: number[] = [];
  const cicloPorPlazo = plazoVacio(() => [] as number[]);
  const standTareas: StandbyMetric["tareas"] = [];
  const puntualPorPlazo = plazoVacio(() => ({ muestra: 0, a_tiempo: 0 }));
  let puntualMuestra = 0;
  let puntualATiempo = 0;
  let desvioSuma = 0;
  let abiertas = 0;
  let cerradasRango = 0;
  const creadorCreadas = new Map<number, number>();
  const complejidadMap = new Map<
    string,
    { muestra: number; sumaDias: number; sumaAvance: number; atrasadas: number }
  >();

  for (const t of tareas) {
    const pct = t.Ava_Porcentaje || 0;
    const finalizada = t.Tar_Estado === "Finalizada" || pct >= 100;
    const inicio = ymdOf(t.Tar_Fecha_Inicio);
    const finReal = ymdOf(t.Tar_Fecha_Culminacion);
    const finPlan = ymdOf(t.Tar_Fecha_Fin);
    const plazo = plazoDesdeFechas(t.Tar_Fecha_Inicio, t.Tar_Fecha_Fin);
    const complejidad = t.Tar_Complejidad || "Media";

    if (t.Usu_Creador && t.Usu_Creador > 0) {
      creadorCreadas.set(t.Usu_Creador, (creadorCreadas.get(t.Usu_Creador) || 0) + 1);
    }

    const asignados =
      t.Asignados.map((a) => a.Nombre).filter(Boolean).join(", ") || "Sin asignar";

    // Atrasadas: abiertas con fecha fin pasada.
    if (!finalizada && finPlan && finPlan < hoy) {
      atrasadasList.push({
        Tar_Cod: t.Tar_Cod,
        Tar_Titulo: t.Tar_Titulo,
        Tar_Estado: t.Tar_Estado,
        Tar_Prioridad: t.Tar_Prioridad,
        plazo,
        Fecha_Fin: finPlan,
        dias_retraso: diffDias(finPlan, hoy),
        porcentaje: pct,
        asignados,
      });
    }

    // Ciclo: finalizadas con inicio y culminacion.
    if (finalizada && inicio && finReal && finReal >= inicio) {
      const dias = diffDias(inicio, finReal);
      cicloValores.push(dias);
      cicloPorPlazo[plazo].push(dias);
      const c = complejidadMap.get(complejidad) || {
        muestra: 0,
        sumaDias: 0,
        sumaAvance: 0,
        atrasadas: 0,
      };
      c.muestra++;
      c.sumaDias += dias;
      c.sumaAvance += pct;
      complejidadMap.set(complejidad, c);
    }

    // Puntualidad: finalizadas con plan y fecha real.
    if (finalizada && finPlan && finReal) {
      const desvio = diffDias(finPlan, finReal);
      desvioSuma += desvio;
      puntualMuestra++;
      puntualPorPlazo[plazo].muestra++;
      if (desvio <= 0) {
        puntualATiempo++;
        puntualPorPlazo[plazo].a_tiempo++;
      }
    }

    // Standby: abiertas sin fecha fin.
    if (!finalizada && !finPlan) {
      const dias = inicio ? Math.max(0, diffDias(inicio, hoy)) : 0;
      standTareas.push({
        Tar_Cod: t.Tar_Cod,
        Tar_Titulo: t.Tar_Titulo,
        Tar_Prioridad: t.Tar_Prioridad,
        porcentaje: pct,
        dias,
      });
    }

    // Backlog / ritmo.
    if (finalizada) {
      if (finReal && finReal >= desde && finReal <= hasta) cerradasRango++;
    } else {
      abiertas++;
    }

    if (!finalizada && finPlan && finPlan < hoy) {
      const c = complejidadMap.get(complejidad) || {
        muestra: 0,
        sumaDias: 0,
        sumaAvance: 0,
        atrasadas: 0,
      };
      c.atrasadas++;
      complejidadMap.set(complejidad, c);
    }
  }

  const diasRango = Math.max(1, diffDias(desde, hasta) + 1);
  const ritmoDia = Math.round((cerradasRango / diasRango) * 100) / 100;
  const etaDias = ritmoDia > 0 ? Math.ceil(abiertas / ritmoDia) : null;

  const ciclo: CicloMetric = {
    muestra: cicloValores.length,
    promedio_dias: cicloValores.length
      ? Math.round((cicloValores.reduce((s, v) => s + v, 0) / cicloValores.length) * 10) / 10
      : 0,
    mediana_dias: mediana(cicloValores),
    minimo_dias: cicloValores.length ? Math.min(...cicloValores) : 0,
    maximo_dias: cicloValores.length ? Math.max(...cicloValores) : 0,
    por_plazo: plazoVacio(() => ({ muestra: 0, promedio_dias: 0 })),
  };
  for (const p of CATEGORIAS_PLAZO) {
    const vals = cicloPorPlazo[p];
    ciclo.por_plazo[p] = {
      muestra: vals.length,
      promedio_dias: vals.length
        ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10
        : 0,
    };
  }

  const puntualidad: PuntualidadMetric = {
    muestra: puntualMuestra,
    a_tiempo: puntualATiempo,
    tarde: puntualMuestra - puntualATiempo,
    pct: puntualMuestra ? Math.round((puntualATiempo / puntualMuestra) * 100) : 0,
    desvio_promedio: puntualMuestra
      ? Math.round((desvioSuma / puntualMuestra) * 10) / 10
      : 0,
    por_plazo: plazoVacio(() => ({ muestra: 0, a_tiempo: 0, pct: 0 })),
  };
  for (const p of CATEGORIAS_PLAZO) {
    const v = puntualPorPlazo[p];
    puntualidad.por_plazo[p] = {
      muestra: v.muestra,
      a_tiempo: v.a_tiempo,
      pct: v.muestra ? Math.round((v.a_tiempo / v.muestra) * 100) : 0,
    };
  }

  const standby: StandbyMetric = {
    total: standTareas.length,
    antiguedad_promedio: standTareas.length
      ? Math.round((standTareas.reduce((s, t) => s + t.dias, 0) / standTareas.length) * 10) / 10
      : 0,
    tareas: standTareas.sort((a, b) => b.dias - a.dias).slice(0, 8),
  };

  const backlog: BacklogMetric = {
    abiertas,
    cerradas_rango: cerradasRango,
    dias_rango: diasRango,
    ritmo_dia: ritmoDia,
    eta_dias: etaDias,
    eta_fecha: etaDias != null ? addDays(hoy, etaDias) : null,
  };

  const complejidad: ComplejidadMetric = {
    filas: ["Muy alta", "Alta", "Media", "Baja"]
      .map((nivel) => {
        const c = complejidadMap.get(nivel);
        return {
          complejidad: nivel,
          muestra: c?.muestra || 0,
          promedio_dias: c && c.muestra ? Math.round((c.sumaDias / c.muestra) * 10) / 10 : 0,
          avance_promedio: c && c.muestra ? Math.round(c.sumaAvance / c.muestra) : 0,
          atrasadas: c?.atrasadas || 0,
        };
      })
      .filter((f) => f.muestra > 0 || f.atrasadas > 0),
  };

  return {
    atrasadasList: atrasadasList.sort((a, b) => b.dias_retraso - a.dias_retraso).slice(0, 8),
    ciclo,
    puntualidad,
    standby,
    backlog,
    creadorCreadas,
    complejidad,
  };
}

/** Equilibrio de carga entre el equipo: desviacion estandar de tareas por persona. */
function buildCargaJusta(porAsignado: AssigneeMetric[]): CargaJustaMetric {
  const conTareas = porAsignado.filter((r) => r.total > 0);
  const totals = conTareas.map((r) => r.total);
  const n = totals.length;
  const promedio = n ? totals.reduce((s, v) => s + v, 0) / n : 0;
  const varianza = n ? totals.reduce((s, v) => s + (v - promedio) ** 2, 0) / n : 0;
  const desviacion = Math.sqrt(varianza);
  const maximo = n ? Math.max(...totals) : 0;
  const minimo = n ? Math.min(...totals) : 0;
  const coeficiente = promedio > 0 ? Math.round((desviacion / promedio) * 100) : 0;
  // 100 = reparto perfecto; penaliza el coeficiente de variacion.
  const indice = n <= 1 ? 100 : Math.max(0, Math.min(100, Math.round(100 - coeficiente)));
  return {
    desviacion: Math.round(desviacion * 10) / 10,
    coeficiente,
    promedio: Math.round(promedio * 10) / 10,
    maximo,
    minimo,
    indice,
    personas: conTareas.map((r) => ({ Per_Cod: r.Per_Cod, Nombre: r.Nombre, total: r.total })),
  };
}

/** Tasa de reapertura: avances con retroceso de porcentaje en el rango. */
async function buildReapertura(
  dbDis: string,
  emp: number,
  desde: string,
  hasta: string,
  perCod: number | null
): Promise<ReaperturaMetric> {
  const prisma = getPrisma(dbDis);
  const perFilter = perCod && perCod > 0 ? "AND a.Per_Cod = ?" : "";
  const params: Array<string | number> = [emp, desde, hasta];
  if (perCod && perCod > 0) params.push(perCod);
  type Row = { retrocesos: bigint | number; tareas: bigint | number; avances_total: bigint | number };
  try {
    const [row] = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT
         SUM(CASE WHEN av.Ava_Porcentaje < COALESCE(prev.Ava_Porcentaje, 0) THEN 1 ELSE 0 END) AS retrocesos,
         COUNT(DISTINCT CASE WHEN av.Ava_Porcentaje < COALESCE(prev.Ava_Porcentaje, 0) THEN av.Tar_Cod END) AS tareas,
         COUNT(*) AS avances_total
       FROM aud_tareas_avances av
       INNER JOIN aud_tareas t ON t.Tar_Cod = av.Tar_Cod AND t.Tar_Est = 'A' AND t.Emp_Cod = ?
       LEFT JOIN aud_tareas_asignadas a ON a.Tar_Cod = t.Tar_Cod AND a.Tas_Est = 'A'
       LEFT JOIN aud_tareas_avances prev ON prev.Tar_Cod = av.Tar_Cod
         AND prev.Ava_Est = 'A'
         AND (prev.Ava_Fecha < av.Ava_Fecha OR (prev.Ava_Fecha = av.Ava_Fecha AND prev.Ava_Cod < av.Ava_Cod))
       WHERE av.Ava_Est = 'A'
         AND DATE(av.Ava_Fecha) >= ? AND DATE(av.Ava_Fecha) <= ?
         ${perFilter}`,
      ...params
    );
    const retrocesos = Number(row?.retrocesos || 0);
    const avancesTotal = Number(row?.avances_total || 0);
    return {
      retrocesos,
      tareas: Number(row?.tareas || 0),
      avances_total: avancesTotal,
      pct: avancesTotal ? Math.round((retrocesos / avancesTotal) * 100) : 0,
    };
  } catch {
    return { retrocesos: 0, tareas: 0, avances_total: 0, pct: 0 };
  }
}

/** Tareas con avance declarado en el rango pero sin telemetria medida. */
function buildAvanceSinActividad(
  tareas: TareaFila[],
  tarConTelemetria: Set<number>
): AvanceSinActividadMetric {
  const conAvance = tareas.filter(
    (t) => (t.Ava_Porcentaje || 0) > 0 && t.Tar_Estado !== "Finalizada"
  );
  const sinActividad = conAvance.filter((t) => !tarConTelemetria.has(t.Tar_Cod));
  return {
    con_avance: conAvance.length,
    sin_actividad: sinActividad.length,
    pct: conAvance.length ? Math.round((sinActividad.length / conAvance.length) * 100) : 0,
    tareas: sinActividad.slice(0, 8).map((t) => ({
      Tar_Cod: t.Tar_Cod,
      Tar_Titulo: t.Tar_Titulo,
      porcentaje: t.Ava_Porcentaje || 0,
    })),
  };
}

/** Metricas de esfuerzo medidas por ExaMonitor (aud_dev_telemetria). */
async function buildEsfuerzo(
  dbDis: string,
  emp: number,
  desde: string,
  hasta: string,
  perCod: number | null,
  asignables: Array<{ Per_Cod: number; Nombre: string }>,
  tareas: TareaFila[]
): Promise<{
  esfuerzo: EsfuerzoDev[];
  horasTarea: HorasTareaRow[];
  procesos: ProcesoActivoRow[];
  horario: HorarioAdherenciaRow[];
  tarConTelemetria: Set<number>;
}> {
  const prisma = getPrisma(dbDis);
  const perFilter = perCod && perCod > 0 ? "AND Per_Cod = ?" : "";
  const nombreByPer = new Map(asignables.map((a) => [a.Per_Cod, a.Nombre]));
  const perParam = perCod && perCod > 0 ? [perCod] : [];

  const empty = {
    esfuerzo: [] as EsfuerzoDev[],
    horasTarea: [] as HorasTareaRow[],
    procesos: [] as ProcesoActivoRow[],
    horario: [] as HorarioAdherenciaRow[],
    tarConTelemetria: new Set<number>(),
  };

  try {
    type PerAgg = {
      Per_Cod: number;
      segundos: bigint | number | null;
      actividad: number | string | null;
      tareas: bigint | number | null;
      clicks: bigint | number | null;
      teclas: bigint | number | null;
      lineas: bigint | number | null;
    };
    const perRows = await prisma.$queryRawUnsafe<PerAgg[]>(
      `SELECT Per_Cod AS Per_Cod,
              SUM(Tel_Segundos_Activos) AS segundos,
              AVG(Tel_Porc_Actividad) AS actividad,
              COUNT(DISTINCT Tar_Cod) AS tareas,
              SUM(Tel_Clicks) AS clicks,
              SUM(Tel_Teclas) AS teclas,
              SUM(Tel_Lineas_Estimadas) AS lineas
       FROM aud_dev_telemetria
       WHERE DATE(Tel_Fecha_Hora) >= ? AND DATE(Tel_Fecha_Hora) <= ?
         ${perFilter}
       GROUP BY Per_Cod`,
      desde,
      hasta,
      ...perParam
    );

    const esfuerzo: EsfuerzoDev[] = perRows.map((r) => ({
      Per_Cod: Number(r.Per_Cod),
      Nombre: nombreByPer.get(Number(r.Per_Cod)) || `Persona ${r.Per_Cod}`,
      horas_activas: Math.round((Number(r.segundos || 0) / 3600) * 10) / 10,
      actividad: Math.round(Number(r.actividad || 0)),
      tareas: Number(r.tareas || 0),
      clicks: Number(r.clicks || 0),
      teclas: Number(r.teclas || 0),
      lineas: Number(r.lineas || 0),
    }));
    esfuerzo.sort((a, b) => b.horas_activas - a.horas_activas);

    // Horas por tarea: solo tareas del proyecto dentro de las filas cargadas.
    const taskByCod = new Map(tareas.map((t) => [t.Tar_Cod, t]));
    type TarAgg = { Tar_Cod: number; segundos: bigint | number | null };
    const tarRows = await prisma.$queryRawUnsafe<TarAgg[]>(
      `SELECT Tar_Cod AS Tar_Cod, SUM(Tel_Segundos_Activos) AS segundos
       FROM aud_dev_telemetria
       WHERE Tar_Cod IS NOT NULL
         AND DATE(Tel_Fecha_Hora) >= ? AND DATE(Tel_Fecha_Hora) <= ?
         ${perFilter}
       GROUP BY Tar_Cod
       ORDER BY segundos DESC
       LIMIT 60`,
      desde,
      hasta,
      ...perParam
    );
    const horasTarea: HorasTareaRow[] = tarRows
      .map((r) => {
        const cod = Number(r.Tar_Cod);
        const minutos = Math.round(Number(r.segundos || 0) / 60);
        return {
          Tar_Cod: cod,
          Tar_Titulo: taskByCod.get(cod)?.Tar_Titulo || `Tarea #${cod}`,
          minutos,
          horas: Math.round((minutos / 60) * 10) / 10,
        };
      })
      .filter((r) => r.minutos > 0)
      .slice(0, 10);

    const tarConTelemetria = new Set<number>(
      tarRows.map((r) => Number(r.Tar_Cod)).filter((c) => c > 0)
    );

    // Proceso/ventana activo mas frecuente.
    type ProcAgg = { proceso: string | null; registros: bigint | number; ides: bigint | number | null };
    const procRows = await prisma.$queryRawUnsafe<ProcAgg[]>(
      `SELECT COALESCE(NULLIF(Tel_Proceso_Activo,''), NULLIF(Tel_Ventana_Activa,''), 'Sin datos') AS proceso,
              COUNT(*) AS registros,
              SUM(CASE WHEN Tel_Es_IDE = 1 THEN 1 ELSE 0 END) AS ides
       FROM aud_dev_telemetria
       WHERE DATE(Tel_Fecha_Hora) >= ? AND DATE(Tel_Fecha_Hora) <= ?
         ${perFilter}
       GROUP BY proceso
       ORDER BY registros DESC
       LIMIT 8`,
      desde,
      hasta,
      ...perParam
    );
    const totalProc = procRows.reduce((s, r) => s + Number(r.registros || 0), 0);
    const procesos: ProcesoActivoRow[] = procRows.map((r) => ({
      nombre: String(r.proceso || "Sin datos"),
      registros: Number(r.registros || 0),
      porcentaje: totalProc ? Math.round((Number(r.registros || 0) / totalProc) * 100) : 0,
      es_ide: Number(r.ides || 0) > 0,
    }));

    // Adherencia al horario configurado (usa la hora local del servidor MySQL).
    type HorarioCfg = {
      Per_Cod: number;
      Mon_Horario_Activo: number;
      Mon_Hora_Inicio: string;
      Mon_Hora_Fin: string;
    };
    const configs = await prisma.aud_dev_monitoreo_config.findMany(
      perCod ? { where: { Per_Cod: perCod } } : undefined
    );
    const cfgByPer = new Map<number, HorarioCfg>(
      configs.map((c) => [
        c.Per_Cod,
        {
          Per_Cod: c.Per_Cod,
          Mon_Horario_Activo: c.Mon_Horario_Activo,
          Mon_Hora_Inicio: c.Mon_Hora_Inicio,
          Mon_Hora_Fin: c.Mon_Hora_Fin,
        },
      ])
    );

    type TelHora = { Per_Cod: number; hora: string };
    const horasRows = await prisma.$queryRawUnsafe<TelHora[]>(
      `SELECT Per_Cod AS Per_Cod, DATE_FORMAT(Tel_Fecha_Hora, '%H:%i') AS hora
       FROM aud_dev_telemetria
       WHERE DATE(Tel_Fecha_Hora) >= ? AND DATE(Tel_Fecha_Hora) <= ?
         ${perFilter}`,
      desde,
      hasta,
      ...perParam
    );
    const horarioAgg = new Map<number, { registros: number; dentro: number }>();
    for (const r of horasRows) {
      const per = Number(r.Per_Cod);
      const agg = horarioAgg.get(per) || { registros: 0, dentro: 0 };
      agg.registros++;
      const cfg = cfgByPer.get(per);
      if (cfg && cfg.Mon_Horario_Activo) {
        const h = String(r.hora);
        const ini = cfg.Mon_Hora_Inicio;
        const fin = cfg.Mon_Hora_Fin;
        const dentro = ini <= fin ? h >= ini && h <= fin : h >= ini || h <= fin;
        if (dentro) agg.dentro++;
      }
      horarioAgg.set(per, agg);
    }
    const horario: HorarioAdherenciaRow[] = Array.from(horarioAgg.entries())
      .map(([per, agg]) => {
        const cfg = cfgByPer.get(per);
        const activo = !!cfg?.Mon_Horario_Activo;
        return {
          Per_Cod: per,
          Nombre: nombreByPer.get(per) || `Persona ${per}`,
          hora_inicio: activo ? cfg!.Mon_Hora_Inicio : null,
          hora_fin: activo ? cfg!.Mon_Hora_Fin : null,
          registros: agg.registros,
          dentro: agg.dentro,
          pct: activo && agg.registros ? Math.round((agg.dentro / agg.registros) * 100) : 0,
        };
      })
      .filter((r) => r.hora_inicio)
      .sort((a, b) => a.pct - b.pct);

    return { esfuerzo, horasTarea, procesos, horario, tarConTelemetria };
  } catch {
    /* telemetria opcional (tabla puede no existir) */
    return empty;
  }
}

const BASE_LABELS: Record<string, string> = {
  exa: "EXA",
  servicios: "Servicios",
  relavera: "Relavera",
};

/** KPIs por base disponible (EXA vs Servicios) en el mismo rango. */
async function buildBases(
  dbActual: string,
  emp: number,
  desde: string,
  hasta: string,
  perCod: number | null
): Promise<BaseComparativaRow[]> {
  const { allowedDatabases } = await import("./db");
  const bases = allowedDatabases().filter(
    (b) => b !== "relavera" && !b.startsWith("relavera_")
  );
  const lista = bases.length ? bases : [dbActual];
  const rows = await Promise.all(
    lista.map(async (base): Promise<BaseComparativaRow> => {
      const kpi = await kpisTareas(base, emp, {
        desde,
        hasta,
        perCod: perCod || undefined,
      }).catch(() => null);
      return {
        base,
        label: BASE_LABELS[base] || base,
        es_actual: base === dbActual,
        total: kpi?.total ?? 0,
        completadas: kpi?.completadas ?? 0,
        proceso: kpi?.proceso ?? 0,
        pendientes: kpi?.pendientes ?? 0,
        atrasadas: kpi?.atrasadas ?? 0,
        avance_promedio: kpi?.avance_promedio ?? 0,
        tasa_cumplimiento: kpi?.tasa_cumplimiento ?? 0,
      };
    })
  );
  return rows;
}

function ceroPlazos(): Record<CategoriaPlazo, number> {
  return { Diaria: 0, Semanal: 0, Mensual: 0, "Sin fechas": 0 };
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

  const plazoSql = `CASE
      WHEN t.Tar_Fecha_Inicio IS NULL OR t.Tar_Fecha_Fin IS NULL THEN 'Sin fechas'
      WHEN DATEDIFF(DATE(t.Tar_Fecha_Fin), DATE(t.Tar_Fecha_Inicio)) <= 0 THEN 'Diaria'
      WHEN DATEDIFF(DATE(t.Tar_Fecha_Fin), DATE(t.Tar_Fecha_Inicio)) <= 6 THEN 'Semanal'
      ELSE 'Mensual'
    END`;

  type PlazoDiaAgg = { dia: Date | string; plazo: string; avances?: bigint | number; completadas?: bigint | number };

  const avaPlazoParams: Array<string | number> = [emp, serieDesde, serieHasta];
  const finPlazoParams: Array<string | number> = [emp, serieDesde, serieHasta];
  if (perCod && perCod > 0) {
    avaPlazoParams.push(perCod);
    finPlazoParams.push(perCod);
  }

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

  const [avaRows, finRows, avaPlazoRows, finPlazoRows] = await Promise.all([
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
    prisma.$queryRawUnsafe<PlazoDiaAgg[]>(
      `SELECT DATE_FORMAT(av.Ava_Fecha, '%Y-%m-%d') AS dia, ${plazoSql} AS plazo, COUNT(*) AS avances
       FROM aud_tareas_avances av
       INNER JOIN aud_tareas t ON t.Tar_Cod = av.Tar_Cod AND t.Tar_Est = 'A' AND t.Emp_Cod = ?
       WHERE av.Ava_Est = 'A'
         AND DATE(av.Ava_Fecha) >= ?
         AND DATE(av.Ava_Fecha) <= ?
         ${perFilter}
       GROUP BY dia, plazo`,
      ...avaPlazoParams
    ),
    prisma.$queryRawUnsafe<PlazoDiaAgg[]>(
      `SELECT DATE_FORMAT(t.Tar_Fecha_Culminacion, '%Y-%m-%d') AS dia, ${plazoSql} AS plazo, COUNT(*) AS completadas
       FROM aud_tareas t
       WHERE t.Tar_Est = 'A' AND t.Emp_Cod = ?
         AND t.Tar_Estado = 'Finalizada'
         AND t.Tar_Fecha_Culminacion IS NOT NULL
         AND DATE(t.Tar_Fecha_Culminacion) >= ?
         AND DATE(t.Tar_Fecha_Culminacion) <= ?
         ${perFilter}
       GROUP BY dia, plazo`,
      ...finPlazoParams
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

  const avancesPlazo = new Map<string, Record<CategoriaPlazo, number>>();
  for (const r of avaPlazoRows) {
    const dia = toCalendarYmd(r.dia);
    if (!YMD.test(dia)) continue;
    const acc = avancesPlazo.get(dia) || ceroPlazos();
    acc[normalizePlazo(r.plazo)] += Number(r.avances || 0);
    avancesPlazo.set(dia, acc);
  }
  const completadasPlazo = new Map<string, Record<CategoriaPlazo, number>>();
  for (const r of finPlazoRows) {
    const dia = toCalendarYmd(r.dia);
    if (!YMD.test(dia)) continue;
    const acc = completadasPlazo.get(dia) || ceroPlazos();
    acc[normalizePlazo(r.plazo)] += Number(r.completadas || 0);
    completadasPlazo.set(dia, acc);
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
      avances_plazo: avancesPlazo.get(dia) ?? ceroPlazos(),
      completadas_plazo: completadasPlazo.get(dia) ?? ceroPlazos(),
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

  const comparativa = await buildComparativa(db, emp, tareas, desde, hasta, perCod, asignables);

  const derivadas = buildTareasDerivadas(tareas, desde, hasta, hoy);
  const reapertura = await buildReapertura(db, emp, desde, hasta, perCod);

  const estadoMap = new Map<string, number>();
  const prioMap = new Map<string, number>();
  const plazoMap = new Map<CategoriaPlazo, number>();
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

    const plazo = plazoDesdeFechas(t.Tar_Fecha_Inicio, t.Tar_Fecha_Fin);
    plazoMap.set(plazo, (plazoMap.get(plazo) || 0) + 1);

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

  const cargaJusta = buildCargaJusta(porAsignado);

  const esfuerzoData = await buildEsfuerzo(db, emp, desde, hasta, perCod, asignables, tareas);
  const avanceSinActividad = buildAvanceSinActividad(tareas, esfuerzoData.tarConTelemetria);

  // Creador vs ejecutor: quien crea tareas frente a quien las ejecuta.
  const ejecutadasPorPer = new Map<number, number>();
  for (const r of porAsignado) ejecutadasPorPer.set(r.Per_Cod, r.total);
  const creadorEjecutor: CreadorEjecutorRow[] = [];
  const perCodesCreadores = new Set<number>([
    ...derivadas.creadorCreadas.keys(),
    ...ejecutadasPorPer.keys(),
  ]);
  for (const per of perCodesCreadores) {
    const creadas = derivadas.creadorCreadas.get(per) || 0;
    const ejecutadas = ejecutadasPorPer.get(per) || 0;
    if (creadas === 0 && ejecutadas === 0) continue;
    creadorEjecutor.push({
      Per_Cod: per,
      Nombre: asignables.find((a) => a.Per_Cod === per)?.Nombre || `Persona ${per}`,
      creadas,
      ejecutadas,
      balance: creadas - ejecutadas,
    });
  }
  creadorEjecutor.sort((a, b) => b.creadas - a.creadas || b.ejecutadas - a.ejecutadas);

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
    porPlazo: CATEGORIAS_PLAZO.filter((p) => (plazoMap.get(p) || 0) > 0).map((p) => ({
      label: p,
      value: plazoMap.get(p) || 0,
      color: PLAZO_COLORS[p],
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
    comparativa,
    apoyos: buildApoyos(comparativa, asignables),
    atrasadasList: derivadas.atrasadasList,
    ciclo: derivadas.ciclo,
    puntualidad: derivadas.puntualidad,
    standby: derivadas.standby,
    backlog: derivadas.backlog,
    creadorEjecutor,
    cargaJusta,
    reapertura,
    complejidad: derivadas.complejidad,
    esfuerzo: esfuerzoData.esfuerzo,
    horasTarea: esfuerzoData.horasTarea,
    procesos: esfuerzoData.procesos,
    horario: esfuerzoData.horario,
    avanceSinActividad,
    bases: await buildBases(db, emp, desde, hasta, perCod),
  };
}
