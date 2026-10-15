import fs from "fs";
import path from "path";
import { isImagePath } from "./evidencia-files";
import type { TicketAdjuntoExa } from "./ticket-view";

/**
 * Adjuntos legacy del panel EXA (exa-ofsercont). Cuando un cliente crea un
 * ticket guarda el archivo en la columna Tic_Evi_Pro con una ruta relativa
 * (`../tickets/<Emp_Cod>/ticket<Cod>.<ext>`), y la solucion en Tic_Evi_Sol
 * (`../ticketsSolucionados/<Emp_Cod>/tareaRealizada<Cod>.<ext>`).
 * Los archivos viven bajo <EXA_OFSERCONT_ROOT>/administrador/.
 */

function ofsercontRoot(): string {
  const raw = (process.env.EXA_OFSERCONT_ROOT || "").trim();
  if (raw) return path.resolve(raw);
  return path.resolve(process.cwd(), "..", "exa-ofsercont");
}

/** Normaliza la ruta legacy y la restringe a tickets/ o ticketsSolucionados/. */
export function legacyTicketAdjuntoRel(stored: string): string | null {
  const raw = String(stored || "").trim().replace(/\\/g, "/");
  if (!raw) return null;
  const rel = raw.replace(/^(\.\.\/)+|^\.\/|^\/+/, "");
  if (!rel || rel.includes("..") || rel.includes("\0")) return null;
  if (!/^tickets(Solucionados)?\//.test(rel)) return null;
  return rel;
}

/** Ruta absoluta al archivo del adjunto legacy, si existe. */
export function resolveTicketAdjuntoFile(stored: string): string | null {
  const rel = legacyTicketAdjuntoRel(stored);
  if (!rel) return null;
  const roots = [path.join(ofsercontRoot(), "administrador"), ofsercontRoot()];
  for (const root of roots) {
    const rootNorm = path.resolve(root);
    const full = path.resolve(rootNorm, rel);
    if (full !== rootNorm && !full.startsWith(rootNorm + path.sep)) continue;
    try {
      if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function ticketAdjuntoUrl(stored: string, db: string, ticCod: number): string {
  const params = new URLSearchParams({
    r: String(stored || "").trim(),
    db,
    tic: String(ticCod),
  });
  return `/api/tickets/adjunto?${params.toString()}`;
}

/** Mapea columnas Tic_Evi_Pro / Tic_Evi_Sol a adjuntos servibles (solo existentes). */
export function mapTicketAdjuntos(
  rows: Array<{ ruta: string | null | undefined; tipo: TicketAdjuntoExa["tipo"] }>,
  db: string,
  ticCod: number
): TicketAdjuntoExa[] {
  const out: TicketAdjuntoExa[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const raw = String(row.ruta || "").trim();
    if (!raw || seen.has(raw)) continue;
    if (!resolveTicketAdjuntoFile(raw)) continue;
    seen.add(raw);
    const nombre = raw.replace(/\\/g, "/").split("/").pop() || raw;
    out.push({
      ruta: raw,
      url: ticketAdjuntoUrl(raw, db, ticCod),
      nombre,
      esImagen: isImagePath(nombre),
      tipo: row.tipo,
    });
  }
  return out;
}
