import fs from "fs";
import { createHash, randomUUID } from "node:crypto";
import path from "path";
import { resolveCaptureFile } from "./captures";
import { isAllowedEvidenciaExt, isImagePath } from "./evidencia-files";
import type { TicketAdjuntoExa } from "./ticket-view";

/**
 * Adjuntos legacy del panel EXA (exa-ofsercont). Cuando un cliente crea un
 * ticket guarda el archivo en la columna Tic_Evi_Pro con una ruta relativa
 * (`../tickets/<Emp_Cod>/ticket<Cod>.<ext>`), y la solucion en Tic_Evi_Sol
 * (`../ticketsSolucionados/<Emp_Cod>/tareaRealizada<Cod>.<ext>`).
 * Los archivos viven en el directorio administrador de la instalación de origen.
 */

function ticketAdjuntosRoots(db: string): string[] {
  const relavera = db === "relavera" || db.startsWith("relavera_");
  const storage = (relavera ? process.env.EXA_RELAVERA_TICKETS_DIR : process.env.EXA_OFSERCONT_TICKETS_DIR)?.trim();
  if (storage) return [path.resolve(storage)];

  const codeRoot = relavera ? process.env.EXA_RELAVERA_ROOT : process.env.EXA_OFSERCONT_ROOT;
  const root = path.resolve(codeRoot?.trim() || (relavera ? "../exa-relavera-produccion" : "../exa-ofsercont"));
  return [path.join(root, "administrador"), root];
}

export function rutaEvidenciaTicket(ruta: string, ticCod: number): boolean {
  const parts = ruta.split("/");
  return parts.length === 6 &&
    parts.slice(0, 4).join("/") === "gestion/adjuntos/monitoreo/evidencias" &&
    /^\d{4}-\d{2}-\d{2}$/.test(parts[4]) &&
    parts[5].startsWith(`tic_${ticCod}_`) &&
    /^[a-zA-Z0-9_.-]+$/.test(parts[5]) &&
    !parts[5].includes("..") &&
    isAllowedEvidenciaExt(path.extname(parts[5]));
}

/** El panel EXA tiene un campo de archivo por tipo de evidencia. */
export async function copiarEvidenciaTicketExa(
  db: string,
  ticCod: number,
  empCod: number,
  rutas: string[],
  tipo: TicketAdjuntoExa["tipo"]
): Promise<string | null> {
  if (!rutas.length) return null;
  const root = ticketAdjuntosRoots(db)[0];
  const folder = tipo === "problema" ? "tickets" : "ticketsSolucionados";
  const dir = path.join(root, folder, String(empCod));
  await fs.promises.access(root, fs.constants.W_OK).catch((err) => {
    throw new Error("El almacenamiento del sistema EXA de origen no está disponible para escritura.", { cause: err });
  });
  const copias: string[] = [];
  try {
    await fs.promises.mkdir(dir, { recursive: true });
    for (const ruta of rutas) {
      const source = rutaEvidenciaTicket(ruta, ticCod) &&
        resolveCaptureFile(ruta.split("/").slice(2));
      if (!source) throw new Error("No se encontró el archivo de evidencia en Gestión.");
      const bytes = await fs.promises.readFile(source);
      const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 24);
      const nombre = `gestion_${ticCod}_${hash}${path.extname(source)}`;
      const tmp = path.join(dir, `.${randomUUID()}.tmp`);
      try {
        await fs.promises.writeFile(tmp, bytes, { flag: "wx" });
        await fs.promises.rename(tmp, path.join(dir, nombre));
      } finally {
        await fs.promises.rm(tmp, { force: true }).catch(() => {});
      }
      copias.push(`../${folder}/${empCod}/${nombre}`);
    }
  } catch (err) {
    if (err instanceof Error && "code" in err) {
      throw new Error("No se pudo copiar la evidencia al almacenamiento del sistema EXA de origen.", { cause: err });
    }
    throw err;
  }
  return (tipo === "problema" && copias.find(isImagePath)) || copias[0];
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
export function resolveTicketAdjuntoFile(stored: string, db: string): string | null {
  const rel = legacyTicketAdjuntoRel(stored);
  if (!rel) return null;
  const roots = ticketAdjuntosRoots(db);
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
    if (!resolveTicketAdjuntoFile(raw, db)) continue;
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
