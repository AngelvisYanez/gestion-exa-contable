/**
 * Genera PDF de brief con diseño EXA (ReportLab, igual que los ejemplos en ofsercont/docs).
 * Fallback: PDF texto simple si Python/ReportLab no está disponible.
 */
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

export type BriefPdfMeta = {
  titulo: string;
  tipoLabel: string;
  subtitulo?: string;
  resumen?: string;
  audiencia?: string;
  fecha?: string;
  proceso?: string;
  modulo?: string;
  directorio?: string;
  tarCod?: number;
  chips?: string[];
  notaPortada?: string;
  markdown: string;
};

function pdfEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapLine(text: string, max = 92): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > max) {
      if (cur) lines.push(cur);
      cur = w.length > max ? w.slice(0, max) : w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

/** Fallback texto plano. */
export function markdownToSimplePdf(markdown: string, title: string): Buffer {
  const rawLines = markdown.replace(/\r\n/g, "\n").split("\n");
  const lines: string[] = [];
  lines.push(title);
  lines.push("=".repeat(Math.min(72, title.length)));
  lines.push("");
  for (const line of rawLines) {
    const trimmed = line.replace(/^#+\s*/, "").replace(/^\*\s+/, "• ").replace(/^-\s+/, "• ");
    if (!trimmed.trim()) {
      lines.push("");
      continue;
    }
    for (const w of wrapLine(trimmed, 92)) lines.push(w);
  }

  const pageHeight = 842;
  const pageWidth = 595;
  const marginTop = 56;
  const marginBottom = 48;
  const lineHeight = 12;
  const maxLines = Math.floor((pageHeight - marginTop - marginBottom) / lineHeight);
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += maxLines) pages.push(lines.slice(i, i + maxLines));
  if (!pages.length) pages.push([title]);

  const objects: string[] = [];
  const offsets: number[] = [0];
  const addObj = (body: string) => {
    objects.push(body);
    return objects.length;
  };
  const kids: number[] = [];
  const contentIds: number[] = [];

  for (const pageLines of pages) {
    const contentParts = ["BT", "/F1 10 Tf", "14 TL", `50 ${pageHeight - marginTop} Td`];
    pageLines.forEach((ln, idx) => {
      if (idx === 0) contentParts.push(`(${pdfEscape(ln)}) Tj`);
      else contentParts.push(`T* (${pdfEscape(ln)}) Tj`);
    });
    contentParts.push("ET");
    const stream = contentParts.join("\n");
    contentIds.push(
      addObj(`<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`)
    );
  }
  const fontId = addObj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  for (let i = 0; i < pages.length; i++) {
    kids.push(
      addObj(
        `<< /Type /Page /Parent 0 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${contentIds[i]} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`
      )
    );
  }
  const kidsStr = kids.map((id) => `${id} 0 R`).join(" ");
  const pagesId = addObj(`<< /Type /Pages /Kids [ ${kidsStr} ] /Count ${kids.length} >>`);
  for (let i = 0; i < kids.length; i++) {
    objects[kids[i] - 1] =
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${contentIds[i]} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`;
  }
  const catalogId = addObj(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  let pdf = "%PDF-1.4\n";
  for (let i = 0; i < objects.length; i++) {
    offsets[i + 1] = Buffer.byteLength(pdf, "utf8");
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefPos = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\n`;
  pdf += `startxref\n${xrefPos}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

function pythonCandidates(): string[] {
  const fromEnv = (process.env.BRIEF_PDF_PYTHON || "").trim();
  if (fromEnv) return [fromEnv];
  if (process.platform === "win32") {
    return ["py", "python", "python3"];
  }
  return ["python3", "python"];
}

/**
 * PDF con portada EXA / chips / secciones (ReportLab).
 * Devuelve buffer o null si falla.
 */
export function renderExaBriefPdf(meta: BriefPdfMeta): Buffer | null {
  const script = path.resolve(process.cwd(), "scripts", "brief_pdf_reportlab.py");
  if (!fs.existsSync(script)) return null;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "exa-brief-"));
  const metaPath = path.join(tmpDir, "meta.json");
  const outPath = path.join(tmpDir, "brief.pdf");
  try {
    fs.writeFileSync(metaPath, JSON.stringify(meta), "utf8");
    let lastErr = "";
    for (const bin of pythonCandidates()) {
      const args =
        bin === "py"
          ? ["-3", script, "--out", outPath, "--meta", metaPath]
          : [script, "--out", outPath, "--meta", metaPath];
      const run = spawnSync(bin, args, {
        encoding: "utf8",
        timeout: 60000,
        windowsHide: true,
      });
      if (run.status === 0 && fs.existsSync(outPath)) {
        return fs.readFileSync(outPath);
      }
      lastErr = (run.stderr || run.stdout || run.error?.message || "").slice(0, 400);
    }
    console.warn("[brief-pdf] ReportLab fallo, se usara PDF simple:", lastErr);
    return null;
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

export function writeBriefPdf(outAbs: string, meta: BriefPdfMeta): { engine: "reportlab" | "simple" } {
  const designed = renderExaBriefPdf(meta);
  if (designed && designed.length > 500) {
    fs.writeFileSync(outAbs, designed);
    return { engine: "reportlab" };
  }
  fs.writeFileSync(outAbs, markdownToSimplePdf(meta.markdown, meta.titulo));
  return { engine: "simple" };
}
