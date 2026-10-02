import { Badge } from "@/components/ui/badge";
import { hoyFecha } from "@/lib/timezone";

export function estadoVariant(estado: string) {
  const map: Record<string, "success" | "info" | "secondary" | "muted" | "warning" | "danger"> = {
    Finalizada: "success",
    "En Proceso": "info",
    Asignado: "secondary",
    Pendiente: "muted",
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
  return <Badge variant={estadoVariant(estado)}>{estado}</Badge>;
}

export function PrioridadBadge({ prioridad }: { prioridad: string }) {
  return <Badge variant={prioridadVariant(prioridad)}>{prioridad}</Badge>;
}

export function ComplejidadBadge({ complejidad }: { complejidad?: string | null }) {
  const c = (complejidad || "Media").trim() || "Media";
  return <Badge variant={complejidadVariant(c)}>Complejidad: {c}</Badge>;
}

export function fmtDate(v?: string | null) {
  if (!v) return "—";
  return String(v).slice(0, 10);
}

/** Hoy en America/Guayaquil (YYYY-MM-DD). */
export function fechaLocal() {
  return hoyFecha();
}
