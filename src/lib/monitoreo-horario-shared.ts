import { APP_TIMEZONE } from "./timezone";

/** 1=lun … 7=dom (ISO). */
export const DIAS_LABORALES = [
  { id: 1, label: "L", title: "Lunes" },
  { id: 2, label: "M", title: "Martes" },
  { id: 3, label: "X", title: "Miércoles" },
  { id: 4, label: "J", title: "Jueves" },
  { id: 5, label: "V", title: "Viernes" },
  { id: 6, label: "S", title: "Sábado" },
  { id: 7, label: "D", title: "Domingo" },
] as const;

export const HORARIO_DEFAULT = {
  Mon_Horario_Activo: 0,
  Mon_Hora_Inicio: "08:00",
  Mon_Hora_Fin: "17:00",
  Mon_Dias_Laborales: "1,2,3,4,5",
  /** Pausa de almuerzo: apaga monitoreo 1 h dentro de la jornada. */
  Mon_Almuerzo_Activo: 0,
  Mon_Almuerzo_Inicio: "13:00",
  Mon_Almuerzo_Fin: "14:00",
} as const;

export type HorarioLaboral = {
  Mon_Horario_Activo: number;
  Mon_Hora_Inicio: string;
  Mon_Hora_Fin: string;
  Mon_Dias_Laborales: string;
  Mon_Almuerzo_Activo: number;
  Mon_Almuerzo_Inicio: string;
  Mon_Almuerzo_Fin: string;
};

const WD_MAP: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

function parseHhMm(raw: string): number | null {
  const m = String(raw || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

export function normalizeHora(raw: unknown, fallback: string): string {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const h = raw.getUTCHours();
    const m = raw.getUTCMinutes();
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  const text = String(raw ?? "").trim();
  const iso = text.match(/T(\d{2}):(\d{2})/);
  if (iso) return `${iso[1]}:${iso[2]}`;
  const mins = parseHhMm(text.slice(0, 5));
  if (mins == null) return fallback;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function normalizeDias(raw: string | null | undefined): string {
  const set = new Set(
    String(raw || "")
      .split(/[,;|\s]+/)
      .map((x) => Number(x))
      .filter((n) => n >= 1 && n <= 7)
  );
  if (!set.size) return HORARIO_DEFAULT.Mon_Dias_Laborales;
  return [...set].sort((a, b) => a - b).join(",");
}

export function parseDiasSet(raw: string | null | undefined): Set<number> {
  return new Set(
    normalizeDias(raw)
      .split(",")
      .map((x) => Number(x))
      .filter((n) => n >= 1 && n <= 7)
  );
}

export function ahoraGuayaquil(now: Date = new Date()): {
  weekday: number;
  minutes: number;
  hhmm: string;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0;
  const minute = Number(get("minute"));
  const weekday = WD_MAP[get("weekday")] ?? 1;
  const minutes = hour * 60 + minute;
  return {
    weekday,
    minutes,
    hhmm: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

/** ¿minuteOfDay cae en [inicio, fin) el día weekday (ISO)? Soporta cruce de medianoche. */
function enVentanaDia(
  weekday: number,
  minutes: number,
  inicio: number,
  fin: number,
  dias: Set<number>
): boolean {
  if (inicio === fin) {
    return dias.has(weekday);
  }
  if (inicio < fin) {
    return dias.has(weekday) && minutes >= inicio && minutes < fin;
  }
  if (minutes >= inicio && dias.has(weekday)) return true;
  const prev = weekday === 1 ? 7 : weekday - 1;
  if (minutes < fin && dias.has(prev)) return true;
  return false;
}

/** Jornada bruta (sin restar almuerzo). */
export function estaEnJornadaLaboral(
  h: Pick<HorarioLaboral, "Mon_Hora_Inicio" | "Mon_Hora_Fin" | "Mon_Dias_Laborales">,
  now: Date = new Date()
): boolean {
  const dias = parseDiasSet(h.Mon_Dias_Laborales);
  const inicio = parseHhMm(normalizeHora(h.Mon_Hora_Inicio, HORARIO_DEFAULT.Mon_Hora_Inicio));
  const fin = parseHhMm(normalizeHora(h.Mon_Hora_Fin, HORARIO_DEFAULT.Mon_Hora_Fin));
  if (inicio == null || fin == null) return false;
  const { weekday, minutes } = ahoraGuayaquil(now);
  return enVentanaDia(weekday, minutes, inicio, fin, dias);
}

/** Pausa de almuerzo dentro de los días laborales configurados. */
export function estaEnAlmuerzo(
  h: Pick<
    HorarioLaboral,
    | "Mon_Almuerzo_Activo"
    | "Mon_Almuerzo_Inicio"
    | "Mon_Almuerzo_Fin"
    | "Mon_Dias_Laborales"
  >,
  now: Date = new Date()
): boolean {
  if (!Number(h.Mon_Almuerzo_Activo)) return false;
  const dias = parseDiasSet(h.Mon_Dias_Laborales);
  const inicio = parseHhMm(
    normalizeHora(h.Mon_Almuerzo_Inicio, HORARIO_DEFAULT.Mon_Almuerzo_Inicio)
  );
  const fin = parseHhMm(normalizeHora(h.Mon_Almuerzo_Fin, HORARIO_DEFAULT.Mon_Almuerzo_Fin));
  if (inicio == null || fin == null) return false;
  const { weekday, minutes } = ahoraGuayaquil(now);
  return enVentanaDia(weekday, minutes, inicio, fin, dias);
}

/**
 * ¿Debe estar activo el monitoreo ahora? (Guayaquil)
 * = dentro de jornada laboral y fuera de la pausa de almuerzo.
 */
export function estaEnHorarioLaboral(
  h: Pick<
    HorarioLaboral,
    | "Mon_Hora_Inicio"
    | "Mon_Hora_Fin"
    | "Mon_Dias_Laborales"
    | "Mon_Almuerzo_Activo"
    | "Mon_Almuerzo_Inicio"
    | "Mon_Almuerzo_Fin"
  >,
  now: Date = new Date()
): boolean {
  if (!estaEnJornadaLaboral(h, now)) return false;
  if (estaEnAlmuerzo(h, now)) return false;
  return true;
}

/** Mon_Activo que debería tener el desarrollo según horario (1/0), o null si no controla. */
export function monActivoSegunHorario(
  horario: HorarioLaboral,
  now: Date = new Date()
): number | null {
  if (!horario.Mon_Horario_Activo) return null;
  return estaEnHorarioLaboral(horario, now) ? 1 : 0;
}

export function mapHorarioRow(row?: Partial<HorarioLaboral> | null): HorarioLaboral {
  return {
    Mon_Horario_Activo: Number(row?.Mon_Horario_Activo ?? 0) ? 1 : 0,
    Mon_Hora_Inicio: normalizeHora(row?.Mon_Hora_Inicio, HORARIO_DEFAULT.Mon_Hora_Inicio),
    Mon_Hora_Fin: normalizeHora(row?.Mon_Hora_Fin, HORARIO_DEFAULT.Mon_Hora_Fin),
    Mon_Dias_Laborales: normalizeDias(row?.Mon_Dias_Laborales),
    Mon_Almuerzo_Activo: Number(row?.Mon_Almuerzo_Activo ?? 0) ? 1 : 0,
    Mon_Almuerzo_Inicio: normalizeHora(
      row?.Mon_Almuerzo_Inicio,
      HORARIO_DEFAULT.Mon_Almuerzo_Inicio
    ),
    Mon_Almuerzo_Fin: normalizeHora(row?.Mon_Almuerzo_Fin, HORARIO_DEFAULT.Mon_Almuerzo_Fin),
  };
}
