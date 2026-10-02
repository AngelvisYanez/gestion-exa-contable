import path from "path";
import fs from "fs";
import { fechaEnZona, horaHisZona, hoyFecha, startOfDayZona } from "./timezone";
import {
  EVIDENCIA_MAX_BYTES,
  isAllowedEvidenciaExt,
} from "./evidencia-files";

export { EVIDENCIA_MAX_BYTES } from "./evidencia-files";
export function capturesRoot(): string {
  const configured = process.env.CAPTURES_DIR;
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.resolve(process.cwd(), configured);
  }
  return path.resolve(process.cwd(), "public", "adjuntos", "monitoreo");
}

const DATE_DIR_RE = /^\d{4}-\d{2}-\d{2}$/;

function dirSizeBytes(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile()) {
        try {
          total += fs.statSync(full).size;
        } catch {
          /* ignore */
        }
      }
    }
  }
  return total;
}

function countFiles(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile()) n++;
    }
  }
  return n;
}

function listDateDirs(base: string): string[] {
  if (!fs.existsSync(base)) return [];
  try {
    return fs
      .readdirSync(base, { withFileTypes: true })
      .filter((e) => e.isDirectory() && DATE_DIR_RE.test(e.name))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

export type CapturesDiskStats = {
  root: string;
  bytes: number;
  files: number;
  dateFolders: number;
  oldestDate: string | null;
  newestDate: string | null;
};

/** Estadísticas del directorio de capturas (no incluye evidencias/). */
export function getCapturesDiskStats(): CapturesDiskStats {
  const root = capturesRoot();
  const dates = listDateDirs(root);
  let bytes = 0;
  let files = 0;
  for (const d of dates) {
    const full = path.join(root, d);
    bytes += dirSizeBytes(full);
    files += countFiles(full);
  }
  return {
    root,
    bytes,
    files,
    dateFolders: dates.length,
    oldestDate: dates[0] || null,
    newestDate: dates.length ? dates[dates.length - 1] : null,
  };
}

export type PurgeCapturesResult = {
  dias: number;
  cutoffDate: string;
  foldersDeleted: string[];
  filesDeleted: number;
  bytesFreed: number;
  errors: string[];
};

/**
 * Borra carpetas YYYY-MM-DD bajo capturesRoot() anteriores al corte.
 * No toca evidencias/ (evidencia de avances de tarea).
 * @deprecated Preferir purgeCaptureFilesRespectingProtected para preservar asignaciones.
 */
export function purgeOldCaptureFolders(dias: number): PurgeCapturesResult {
  return purgeCaptureFilesRespectingProtected({
    diasOrphans: dias,
    protectedKeys: new Set(),
  });
}

/** Normaliza Tel_Captura_Ruta → clave relativa `YYYY-MM-DD/archivo.ext` bajo capturesRoot. */
export function captureRelKey(ruta: string | null | undefined): string | null {
  if (!ruta) return null;
  const r = String(ruta).replace(/\\/g, "/");
  const m = r.match(/(\d{4}-\d{2}-\d{2})\/([^/]+)$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

/**
 * Purga archivos en carpetas antiguas, conservando los listados en protectedKeys
 * (historial de tareas/tickets para el admin).
 */
export function purgeCaptureFilesRespectingProtected(opts: {
  diasOrphans: number;
  protectedKeys: Set<string>;
}): PurgeCapturesResult {
  const days = Math.max(1, Math.min(365, Math.floor(opts.diasOrphans)));
  const cutoff = new Date();
  cutoff.setTime(cutoff.getTime() - days * 24 * 60 * 60 * 1000);
  const cutoffDate = fechaEnZona(cutoff);
  const cutoffStart = startOfDayZona(cutoffDate).getTime();

  const root = capturesRoot();
  const result: PurgeCapturesResult = {
    dias: days,
    cutoffDate,
    foldersDeleted: [],
    filesDeleted: 0,
    bytesFreed: 0,
    errors: [],
  };

  for (const name of listDateDirs(root)) {
    const folderStart = startOfDayZona(name).getTime();
    if (!(folderStart < cutoffStart)) continue;
    const folder = path.join(root, name);
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(folder, { withFileTypes: true });
    } catch (e) {
      result.errors.push(`${name}: ${e instanceof Error ? e.message : "error"}`);
      continue;
    }

    let remaining = 0;
    for (const e of entries) {
      if (!e.isFile()) {
        if (e.isDirectory()) remaining++;
        continue;
      }
      const key = `${name}/${e.name}`;
      const full = path.join(folder, e.name);
      if (opts.protectedKeys.has(key)) {
        remaining++;
        continue;
      }
      try {
        const sz = fs.statSync(full).size;
        fs.unlinkSync(full);
        result.filesDeleted++;
        result.bytesFreed += sz;
      } catch (err) {
        remaining++;
        result.errors.push(`${key}: ${err instanceof Error ? err.message : "error"}`);
      }
    }

    if (remaining === 0) {
      try {
        fs.rmSync(folder, { recursive: true, force: true });
        result.foldersDeleted.push(name);
      } catch {
        /* carpeta no vacía o bloqueada */
      }
    }
  }

  return result;
}

/** Guarda screenshot y devuelve ruta legacy compatible: gestion/adjuntos/monitoreo/... */
export async function saveScreenshot(
  perCod: number,
  file: File
): Promise<string | null> {
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!bytes.length) return null;

  const fechaDir = hoyFecha();
  const dir = path.join(capturesRoot(), fechaDir);
  fs.mkdirSync(dir, { recursive: true });

  let ext = path.extname(file.name || "").toLowerCase().replace(".", "");
  if (!["jpg", "jpeg", "png", "webp"].includes(ext)) ext = "jpg";

  const nombre = `dev_${perCod}_${horaHisZona()}_${Date.now().toString(16)}.${ext}`;
  const dest = path.join(dir, nombre);
  fs.writeFileSync(dest, bytes);

  return `gestion/adjuntos/monitoreo/${fechaDir}/${nombre}`;
}

export async function saveEvidencia(
  refCod: number,
  file: File,
  kind: "tar" | "tic" = "tar"
): Promise<string> {
  const ext = path.extname(file.name || "").toLowerCase().replace(".", "");
  if (!isAllowedEvidenciaExt(ext)) {
    throw new Error(
      "Formato no permitido. Usa imagen, PDF, Word, Excel, CSV, MD o TXT."
    );
  }
  if (file.size > EVIDENCIA_MAX_BYTES) {
    throw new Error(`El archivo supera ${Math.round(EVIDENCIA_MAX_BYTES / (1024 * 1024))} MB.`);
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!bytes.length) throw new Error("Archivo vacio.");

  const fechaDir = hoyFecha();
  const dir = path.join(capturesRoot(), "evidencias", fechaDir);
  fs.mkdirSync(dir, { recursive: true });

  const base =
    path
      .basename(file.name || "archivo", path.extname(file.name || ""))
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48) || "archivo";

  const nombre = `${kind}_${refCod}_${horaHisZona()}_${base}.${ext}`;
  fs.writeFileSync(path.join(dir, nombre), bytes);

  return `gestion/adjuntos/monitoreo/evidencias/${fechaDir}/${nombre}`;
}

export function toPublicCaptureUrl(ruta: string | null | undefined): string {
  if (!ruta) return "";
  const r = String(ruta).replace(/\\/g, "/");
  if (r.startsWith("gestion/adjuntos/")) {
    return "/api/capturas/" + r.slice("gestion/adjuntos/".length);
  }
  if (r.startsWith("adjuntos/")) {
    return "/api/capturas/" + r.slice("adjuntos/".length);
  }
  if (r.startsWith("monitoreo/")) {
    return "/api/capturas/" + r;
  }
  return "/api/capturas/" + r.replace(/^\/+/, "");
}
