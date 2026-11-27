import { getPrisma } from "@/lib/db";
import { listTicketsAsignados } from "@/lib/tickets";
import type { AppEvent } from "@/lib/events";

/** Datos del elemento afectado que enriquecen una notificación (título, prioridad, responsables). */
export type EventoContexto = Partial<
  Pick<AppEvent, "titulo" | "prioridad" | "asignadoA" | "estado" | "fechaFin">
>;

function fmtFecha(v: unknown): string | undefined {
  if (!v) return undefined;
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString().slice(0, 10);
}

/** Resumen corto de lo "realizado" en un avance (body de la petición), para la notificación. */
export function resumenAvance(body: Record<string, unknown>, max = 200): string | undefined {
  const texto = String(body.realizado ?? body.descripcion ?? "").replace(/\s+/g, " ").trim();
  if (!texto) return undefined;
  return texto.length > max ? `${texto.slice(0, max - 1)}…` : texto;
}

/**
 * Título, prioridad, estado, plazo y responsables de una tarea.
 * Es "best effort": una notificación nunca debe fallar por no poder leer este contexto.
 */
export async function tareaContexto(db: string, tarCod: number): Promise<EventoContexto> {
  if (!tarCod) return {};
  try {
    const prisma = getPrisma(db);
    const [row] = await prisma.$queryRawUnsafe<
      Array<{
        Titulo: string | null;
        Prioridad: string | null;
        Estado: string | null;
        Fin: Date | string | null;
      }>
    >(
      `SELECT CONVERT(Tar_Titulo USING utf8mb4) AS Titulo,
              CONVERT(Tar_Prioridad USING utf8mb4) AS Prioridad,
              CONVERT(Tar_Estado USING utf8mb4) AS Estado,
              Tar_Fecha_Fin AS Fin
       FROM aud_tareas WHERE Tar_Cod = ? LIMIT 1`,
      tarCod
    );
    if (!row) return {};

    const asig = await prisma.$queryRawUnsafe<Array<{ Nombre: string | null }>>(
      `SELECT CONVERT(TRIM(CONCAT(IFNULL(p.Prs_Ape,''), ' ', IFNULL(p.Prs_Nom,''))) USING utf8mb4) AS Nombre
       FROM aud_tareas_asignadas a
       LEFT JOIN personal per ON per.Per_Cod = a.Per_Cod
       LEFT JOIN persona p ON p.Prs_Cod = per.Prs_Cod
       WHERE a.Tas_Est = 'A' AND a.Tar_Cod = ?`,
      tarCod
    );
    const nombres = asig.map((a) => (a.Nombre || "").trim()).filter(Boolean);

    return {
      titulo: (row.Titulo || "").trim() || undefined,
      prioridad: (row.Prioridad || "").trim() || undefined,
      estado: (row.Estado || "").trim() || undefined,
      fechaFin: fmtFecha(row.Fin),
      asignadoA: nombres.length ? nombres.join(", ") : undefined,
    };
  } catch (err) {
    console.error("[events] contexto de tarea:", err instanceof Error ? err.message : err);
    return {};
  }
}

/** Título, prioridad, estado y responsables de un ticket (base de origen incluida). */
export async function ticketContexto(db: string, ticCod: number): Promise<EventoContexto> {
  if (!ticCod || !db) return {};
  try {
    const [t] = await listTicketsAsignados({ ticCod, bases: [db], limit: 1 });
    if (!t || t.Tic_Cod !== ticCod) return {};
    return {
      titulo: t.Tic_Titulo || undefined,
      prioridad: t.Tic_Prioridad || undefined,
      estado: t.Tic_Estado || undefined,
      asignadoA: t.Asignado_Nombre || undefined,
    };
  } catch (err) {
    console.error("[events] contexto de ticket:", err instanceof Error ? err.message : err);
    return {};
  }
}
