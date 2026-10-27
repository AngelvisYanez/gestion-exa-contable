import { Badge } from "@/components/ui/badge";
import { hoyFecha } from "@/lib/timezone";
import { plazoVisible, plazoVariant } from "@/lib/plazo-tarea";
import { cn } from "@/lib/utils";
import { etiquetaEstado } from "@/lib/standby";

export function estadoVariant(estado: string) {
  const map: Record<string, "success" | "info" | "secondary" | "muted" | "warning" | "danger"> = {
    Finalizada: "success",
    "En Proceso": "info",
    Asignado: "secondary",
    Pendiente: "muted",
    Standby: "warning",
    Online: "success",
    Ausente: "warning",
    Desconectado: "muted",
  };
  return map[estado] || "muted";
}

export function prioridadVariant(prioridad: string) {
  if (prioridad === "Alta") return "danger" as const;
  if (prioridad === "Baja") return "muted" as const;
  return "warning" as const;
}

export function complejidadVariant(complejidad: string) {
  const c = (complejidad || "").trim();
  if (c === "Muy alta" || c === "Alta") return "danger" as const;
  if (c === "Baja") return "muted" as const;
  return "info" as const;
}

export function EstadoBadge({ estado }: { estado: string }) {
  const etiqueta = etiquetaEstado(estado);
  return <Badge variant={estadoVariant(etiqueta)}>{etiqueta}</Badge>;
}

export function PrioridadBadge({ prioridad }: { prioridad: string }) {
  return <Badge variant={prioridadVariant(prioridad)}>{prioridad}</Badge>;
}

export function ComplejidadBadge({ complejidad }: { complejidad?: string | null }) {
  const c = (complejidad || "Media").trim() || "Media";
  return <Badge variant={complejidadVariant(c)}>Complejidad: {c}</Badge>;
}

/**
 * Plazo de la tarea (Diaria / Semanal / Mensual) segun su duracion inicio -> fin.
 * Mismo criterio que el widget "Comparativa de rendimiento" del dashboard.
 * Una tarea en standby muestra su estado, no un plazo: no esta en Diaria/Semanal/Mensual.
 */
export function PlazoBadge({
  inicio,
  fin,
  estado,
  className,
}: {
  inicio?: string | null;
  fin?: string | null;
  estado?: string | null;
  className?: string;
}) {
  const plazo = plazoVisible(inicio, fin, estado);
  const enStandby = plazo === "Standby";
  return (
    <Badge
      variant={plazoVariant(plazo)}
      className={cn("gap-1", className)}
      title={
        enStandby
          ? "Tarea en standby: en pausa, sin fecha de fin"
          : "Plazo estimado por la duracion de la tarea (inicio a fin)"
      }
    >
      {plazo === "Sin fechas" ? "Sin fecha" : plazo}
    </Badge>
  );
}

export function fmtDate(v?: string | null) {
  if (!v) return "—";
  return String(v).slice(0, 10);
}

/** Hoy en America/Guayaquil (YYYY-MM-DD). */
export function fechaLocal() {
  return hoyFecha();
}
