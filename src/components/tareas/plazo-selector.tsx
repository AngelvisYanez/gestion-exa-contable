"use client";

import { fechaFinParaPlazo, plazoVisible, type CategoriaPlazo } from "@/lib/plazo-tarea";
import { cn } from "@/lib/utils";

export type PlazoSeleccion = Exclude<CategoriaPlazo, "Sin fechas"> | "Standby";

const OPCIONES: Array<{
  plazo: PlazoSeleccion;
  hint: string;
  activo: string;
  inactivo: string;
}> = [
  {
    plazo: "Diaria",
    hint: "Mismo dia (fin = inicio)",
    activo: "border-sky-500 bg-sky-500 text-white",
    inactivo: "border-sky-200 bg-sky-50 text-sky-700 hover:border-sky-400",
  },
  {
    plazo: "Semanal",
    hint: "Hasta 7 dias (fin = inicio + 6 dias)",
    activo: "border-violet-500 bg-violet-500 text-white",
    inactivo: "border-violet-200 bg-violet-50 text-violet-700 hover:border-violet-400",
  },
  {
    plazo: "Mensual",
    hint: "Mas de una semana (fin = mismo dia del mes siguiente)",
    activo: "border-emerald-500 bg-emerald-500 text-white",
    inactivo: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-400",
  },
  {
    plazo: "Standby",
    hint: "En pausa: quita la fecha fin",
    activo: "border-amber-500 bg-amber-500 text-white",
    inactivo: "border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-400",
  },
];

/**
 * Selector Diaria / Semanal / Mensual / Standby. Al elegir un plazo fija la
 * fecha fin calculada desde la fecha de inicio; Standby quita la fecha fin.
 * El plazo resaltado se deriva de las fechas; Standby depende del estado.
 */
export function PlazoSelector({
  inicio,
  fechaFin,
  enStandby = false,
  onSelect,
  disabled,
  className,
}: {
  inicio?: string | null;
  fechaFin?: string | null;
  enStandby?: boolean;
  onSelect: (plazo: PlazoSeleccion, fechaFin: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const actual = plazoVisible(inicio, fechaFin, enStandby ? "Standby" : null);
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {OPCIONES.map(({ plazo, hint, activo, inactivo }) => {
        const seleccionado = actual === plazo;
        return (
          <button
            key={plazo}
            type="button"
            title={hint}
            aria-label={`Plazo ${plazo}: ${hint}`}
            aria-pressed={seleccionado}
            disabled={disabled}
            onClick={() => {
              if (plazo === "Standby") {
                onSelect("Standby", "");
                return;
              }
              const fin = fechaFinParaPlazo(inicio, plazo);
              if (fin) onSelect(plazo, fin);
            }}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs font-bold transition-colors",
              "disabled:cursor-not-allowed disabled:opacity-50",
              seleccionado ? activo : inactivo
            )}
          >
            {plazo}
          </button>
        );
      })}
    </div>
  );
}
