/** Extensiones permitidas para evidencias / adjuntos de descripción. */
export const EVIDENCIA_EXTS = [
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "pdf",
  "md",
  "txt",
  "csv",
  "doc",
  "docx",
  "xls",
  "xlsx",
] as const;

export type EvidenciaExt = (typeof EVIDENCIA_EXTS)[number];

export const EVIDENCIA_MAX_BYTES = 12 * 1024 * 1024; // 12 MB

/** accept= del input file */
export const EVIDENCIA_ACCEPT =
  ".png,.jpg,.jpeg,.webp,.gif,.pdf,.md,.txt,.csv,.doc,.docx,.xls,.xlsx," +
  "image/png,image/jpeg,image/webp,image/gif,application/pdf," +
  "text/markdown,text/plain,text/csv," +
  "application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document," +
  "application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function isAllowedEvidenciaExt(ext: string) {
  return (EVIDENCIA_EXTS as readonly string[]).includes(ext.toLowerCase().replace(/^\./, ""));
}

export function isAllowedEvidenciaFile(file: { name: string; type?: string }) {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  if (isAllowedEvidenciaExt(ext)) return true;
  // fallback por MIME si no hay extensión clara
  const t = (file.type || "").toLowerCase();
  if (t.startsWith("image/")) return true;
  if (t === "application/pdf") return true;
  if (t.includes("word") || t.includes("excel") || t.includes("spreadsheet") || t.includes("csv")) return true;
  return false;
}

export function isImagePath(p: string) {
  return /\.(png|jpe?g|webp|gif)$/i.test(p);
}

export function evidenciaLabel(nameOrPath: string) {
  const ext = nameOrPath.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    pdf: "PDF",
    md: "Markdown",
    txt: "Texto",
    csv: "CSV",
    doc: "Word",
    docx: "Word",
    xls: "Excel",
    xlsx: "Excel",
    png: "Imagen",
    jpg: "Imagen",
    jpeg: "Imagen",
    webp: "Imagen",
    gif: "Imagen",
  };
  return map[ext] || ext.toUpperCase() || "Archivo";
}

export function mimeForExt(ext: string): string {
  const e = ext.toLowerCase().replace(/^\./, "");
  const map: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    pdf: "application/pdf",
    md: "text/markdown; charset=utf-8",
    txt: "text/plain; charset=utf-8",
    csv: "text/csv; charset=utf-8",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  return map[e] || "application/octet-stream";
}

export const EVIDENCIA_HELP =
  "Imagen, PDF, Word, Excel, CSV, MD o TXT · max. 12 MB c/u";
