import fs from "fs";
import path from "path";

const CODE_EXT = new Set([".php", ".js", ".ts", ".tsx", ".sql", ".css", ".html", ".md"]);

export type OfsercontScan = {
  root: string;
  resolvedDir: string | null;
  exists: boolean;
  files: Array<{ rel: string; size: number }>;
  note: string;
};

function ofsercontRoot(): string {
  const raw = (process.env.EXA_OFSERCONT_ROOT || "").trim();
  if (raw) return path.resolve(raw);
  return path.resolve(process.cwd(), "..", "exa-ofsercont");
}

function safeJoinUnderRoot(root: string, relDir: string): string | null {
  const cleaned = relDir.replace(/\\/g, "/").replace(/^\/+/, "").trim();
  if (!cleaned || cleaned.includes("..")) return null;
  const full = path.resolve(root, cleaned);
  const rootNorm = path.resolve(root);
  if (!full.startsWith(rootNorm + path.sep) && full !== rootNorm) return null;
  return full;
}

function walk(dir: string, root: string, out: Array<{ rel: string; size: number }>, limit: number) {
  if (out.length >= limit) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (out.length >= limit) return;
    if (ent.name.startsWith(".") || ent.name === "node_modules" || ent.name === "vendor") continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walk(full, root, out, limit);
      continue;
    }
    const ext = path.extname(ent.name).toLowerCase();
    if (!CODE_EXT.has(ext)) continue;
    try {
      const st = fs.statSync(full);
      out.push({
        rel: path.relative(root, full).replace(/\\/g, "/"),
        size: st.size,
      });
    } catch {
      /* skip */
    }
  }
}

/**
 * Inventario de archivos del módulo/directorio en exa-ofsercont
 * para anclar el brief al código real (sin inventar pantallas).
 */
export function scanOfsercontModule(opts: {
  directorio?: string | null;
  modulo?: string | null;
  limit?: number;
}): OfsercontScan {
  const root = ofsercontRoot();
  const limit = Math.max(10, Math.min(80, opts.limit ?? 40));
  const dirHint = (opts.directorio || opts.modulo || "").trim();

  if (!fs.existsSync(root)) {
    return {
      root,
      resolvedDir: null,
      exists: false,
      files: [],
      note: `No se encontro EXA_OFSERCONT_ROOT (${root}). Configure la ruta al codigo en el servidor.`,
    };
  }

  let resolvedDir: string | null = null;
  if (dirHint) {
    resolvedDir = safeJoinUnderRoot(root, dirHint);
    if (!resolvedDir || !fs.existsSync(resolvedDir)) {
      // Intento por nombre de modulo como carpeta de primer nivel
      const alt = safeJoinUnderRoot(root, dirHint.split(/[/\\]/)[0] || dirHint);
      resolvedDir = alt && fs.existsSync(alt) ? alt : null;
    }
  }

  const scanRoot = resolvedDir && fs.existsSync(resolvedDir) ? resolvedDir : root;
  const files: Array<{ rel: string; size: number }> = [];
  walk(scanRoot, root, files, limit);
  files.sort((a, b) => a.rel.localeCompare(b.rel));

  return {
    root,
    resolvedDir: resolvedDir
      ? path.relative(root, resolvedDir).replace(/\\/g, "/")
      : null,
    exists: true,
    files,
    note: resolvedDir
      ? `Inventario bajo ${path.relative(root, scanRoot).replace(/\\/g, "/") || "."} (max ${limit}).`
      : `Sin directorio resuelto; muestra limitado desde la raiz de ofsercont (max ${limit}). Indique Tar_Directorio (ej. tesoreria, facturacion/FRONT).`,
  };
}
