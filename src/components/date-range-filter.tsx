"use client";

import { CalendarDays, CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { fechaEnZona, hoyFecha, startOfDayZona } from "@/lib/timezone";
import { cn } from "@/lib/utils";

export type DateRangeValue = {
  desde: string;
  hasta: string;
};

export type DateRangePresetId = "ayer" | "hoy" | "semana" | "mes";
export type DayPresetId = "hoy" | "ayer" | "anteayer" | "hace3" | "hace7";

const DAY_MS = 24 * 3600 * 1000;

function shiftFecha(fecha: string, deltaDays: number): string {
  const base = startOfDayZona(fecha.slice(0, 10));
  return fechaEnZona(new Date(base.getTime() + deltaDays * DAY_MS));
}

function clampFecha(fecha: string, min?: string, max?: string) {
  let f = fecha.slice(0, 10);
  if (min && f < min) f = min;
  if (max && f > max) f = max;
  return f;
}

export function rangoDesdePreset(
  id: DateRangePresetId,
  opts?: { min?: string; max?: string; hoy?: string }
): DateRangeValue {
  const hoy = (opts?.hoy || hoyFecha()).slice(0, 10);
  let desde = hoy;
  let hasta = hoy;
  if (id === "ayer") {
    desde = shiftFecha(hoy, -1);
    hasta = desde;
  } else if (id === "semana") {
    desde = shiftFecha(hoy, -6);
    hasta = hoy;
  } else if (id === "mes") {
    desde = shiftFecha(hoy, -29);
    hasta = hoy;
  }
  desde = clampFecha(desde, opts?.min, opts?.max);
  hasta = clampFecha(hasta, opts?.min, opts?.max);
  if (desde > hasta) desde = hasta;
  return { desde, hasta };
}

/** Un solo dia (desde = hasta). */
export function diaDesdePreset(
  id: DayPresetId,
  opts?: { min?: string; max?: string; hoy?: string }
): DateRangeValue {
  const hoy = (opts?.hoy || hoyFecha()).slice(0, 10);
  const delta: Record<DayPresetId, number> = {
    hoy: 0,
    ayer: -1,
    anteayer: -2,
    hace3: -3,
    hace7: -7,
  };
  const d = clampFecha(shiftFecha(hoy, delta[id]), opts?.min, opts?.max);
  return { desde: d, hasta: d };
}

function detectPreset(value: DateRangeValue, hoy = hoyFecha()): DateRangePresetId | null {
  const ids: DateRangePresetId[] = ["hoy", "ayer", "semana", "mes"];
  for (const id of ids) {
    const p = rangoDesdePreset(id, { hoy });
    if (p.desde === value.desde && p.hasta === value.hasta) return id;
  }
  return null;
}

export type TicketFechaPresetId = "hoy" | "ayer" | "d7" | "d15" | "mes";

export const TICKET_FECHA_PRESETS: Array<{ id: TicketFechaPresetId; label: string }> = [
  { id: "hoy", label: "Hoy" },
  { id: "ayer", label: "Ayer" },
  { id: "d7", label: "Hace 7 días" },
  { id: "d15", label: "Hace 15 días" },
  { id: "mes", label: "Hace 1 mes" },
];

/** Resta meses de calendario (el día se ajusta si el mes destino es más corto). */
function shiftMes(fecha: string, deltaMonths: number): string {
  const [y, m, d] = fecha.slice(0, 10).split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1 + deltaMonths, 1));
  const last = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  const day = Math.min(d, last);
  const out = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), day));
  const yy = out.getUTCFullYear();
  const mm = String(out.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(out.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Presets del módulo de tickets. Hoy/Ayer son un día; el resto es un rango hasta hoy. */
export function rangoTicketsPreset(id: TicketFechaPresetId, hoy = hoyFecha()): DateRangeValue {
  const h = (hoy || hoyFecha()).slice(0, 10);
  if (id === "ayer") {
    const d = shiftFecha(h, -1);
    return { desde: d, hasta: d };
  }
  if (id === "d7") return { desde: shiftFecha(h, -7), hasta: h };
  if (id === "d15") return { desde: shiftFecha(h, -15), hasta: h };
  if (id === "mes") return { desde: shiftMes(h, -1), hasta: h };
  return { desde: h, hasta: h };
}

export function detectTicketFechaPreset(
  value: DateRangeValue,
  hoy = hoyFecha()
): TicketFechaPresetId | null {
  for (const p of TICKET_FECHA_PRESETS) {
    const r = rangoTicketsPreset(p.id, hoy);
    if (r.desde === value.desde && r.hasta === value.hasta) return p.id;
  }
  return null;
}

function detectDayPreset(value: DateRangeValue, hoy = hoyFecha()): DayPresetId | null {
  if (value.desde !== value.hasta) return null;
  const ids: DayPresetId[] = ["hoy", "ayer", "anteayer", "hace3", "hace7"];
  for (const id of ids) {
    const p = diaDesdePreset(id, { hoy });
    if (p.desde === value.desde) return id;
  }
  return null;
}

const RANGE_PRESETS: Array<{ id: DateRangePresetId; label: string }> = [
  { id: "ayer", label: "Ayer" },
  { id: "hoy", label: "Hoy" },
  { id: "semana", label: "1 Semana" },
  { id: "mes", label: "1 Mes" },
];

const DAY_PRESETS: Array<{ id: DayPresetId; label: string }> = [
  { id: "hoy", label: "Hoy" },
  { id: "ayer", label: "Ayer" },
  { id: "anteayer", label: "Anteayer" },
  { id: "hace3", label: "Hace 3d" },
  { id: "hace7", label: "Hace 7d" },
];

type Props = {
  value: DateRangeValue;
  onChange: (next: DateRangeValue) => void;
  min?: string;
  max?: string;
  onResetMax?: () => void;
  disabled?: boolean;
  className?: string;
  compact?: boolean;
  /** Botones Ayer / Hoy / 1 Semana / 1 Mes (modo rango). */
  showPresets?: boolean;
  /**
   * `day`: solo filtros por un dia.
   * `range`: Desde/Hasta (default).
   * `day-and-range`: filtros rapidos por dia + calendarios de rango.
   */
  variant?: "range" | "day" | "day-and-range";
};

export function DateRangeFilter({
  value,
  onChange,
  min,
  max,
  onResetMax,
  disabled,
  className,
  compact,
  showPresets,
  variant = "range",
}: Props) {
  const hoy = hoyFecha();
  const isDayOnly = variant === "day";
  const isDayAndRange = variant === "day-and-range";
  const showDayBar = isDayOnly || isDayAndRange;
  const activeRangePreset = !showDayBar && showPresets ? detectPreset(value, hoy) : null;
  const activeDayPreset = showDayBar ? detectDayPreset(value, hoy) : null;
  const isMax =
    !!min &&
    !!max &&
    value.desde === min &&
    value.hasta === max;
  const diaActivo = value.desde === value.hasta ? value.desde : value.hasta || value.desde;

  const chip =
    "inline-flex h-8 items-center rounded-md px-2.5 text-xs font-bold transition-colors whitespace-nowrap";

  const dayPresetsBar = showDayBar ? (
    <div className="flex h-auto max-w-full flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-card px-2 py-1.5 shadow-sm sm:h-10 sm:flex-nowrap sm:py-0">
      <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
      {!compact && (
        <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Dia</span>
      )}
      <div className="flex max-w-full flex-wrap items-center gap-0.5 rounded-md bg-muted/50 p-0.5">
        {DAY_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(diaDesdePreset(p.id, { min, max, hoy }))}
            className={cn(
              chip,
              activeDayPreset === p.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
              disabled && "opacity-50"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  ) : null;

  const maxButton = onResetMax ? (
    <Button
      type="button"
      variant={isMax ? "secondary" : "outline"}
      size="sm"
      className="h-8 px-3"
      disabled={disabled || isMax}
      onClick={onResetMax}
      title={isDayOnly || isDayAndRange ? "Ver todo el historial disponible" : "Usar el rango máximo disponible"}
    >
      {isDayOnly || isDayAndRange ? "Todo" : "Máximo"}
    </Button>
  ) : null;

  if (isDayOnly) {
    return (
      <div className={cn("flex max-w-full flex-wrap items-center gap-2 sm:gap-3", className)}>
        {dayPresetsBar}
        <div className="flex h-auto max-w-full flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-card px-2 py-1.5 shadow-sm sm:h-10 sm:flex-nowrap sm:py-0">
          <Label htmlFor="filtro-dia" className="mb-0 normal-case tracking-normal">
            Fecha
          </Label>
          <DatePicker
            id="filtro-dia"
            size="sm"
            className="h-8 w-[min(9.5rem,42vw)]"
            value={diaActivo}
            min={min}
            max={max}
            disabled={disabled}
            onChange={(dia) => {
              const d = clampFecha(dia, min, max);
              onChange({ desde: d, hasta: d });
            }}
          />
          {maxButton}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex max-w-full flex-wrap items-center gap-2 sm:gap-3", className)}>
      {dayPresetsBar}

      {showPresets && !showDayBar && (
        <div className="flex h-auto max-w-full flex-wrap items-center gap-0.5 rounded-lg border border-border/70 bg-muted/40 px-1 py-1 shadow-sm sm:h-10 sm:py-0">
          {RANGE_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(rangoDesdePreset(p.id, { min, max, hoy }))}
              className={cn(
                chip,
                activeRangePreset === p.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
                disabled && "opacity-50"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex h-auto max-w-full flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-card px-2 py-1.5 shadow-sm sm:h-10 sm:flex-nowrap sm:py-0">
        <CalendarRange className="size-4 shrink-0 text-muted-foreground" />
        {!compact && (
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Rango</span>
        )}
        <Label htmlFor="rango-desde" className="mb-0 normal-case tracking-normal">
          Desde
        </Label>
        <DatePicker
          id="rango-desde"
          size="sm"
          className="h-8 w-[min(9.5rem,42vw)]"
          value={value.desde}
          min={min}
          max={value.hasta || max}
          disabled={disabled}
          onChange={(desde) => onChange({ ...value, desde })}
        />
        <Label htmlFor="rango-hasta" className="mb-0 normal-case tracking-normal">
          Hasta
        </Label>
        <DatePicker
          id="rango-hasta"
          size="sm"
          className="h-8 w-[min(9.5rem,42vw)]"
          value={value.hasta}
          min={value.desde || min}
          max={max}
          disabled={disabled}
          onChange={(hasta) => onChange({ ...value, hasta })}
        />
        {maxButton}
      </div>
    </div>
  );
}
