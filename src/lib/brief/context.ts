import fs from "fs";
import path from "path";
import type { OfsercontScan } from "./ofsercont-scan";
import type { BriefTipo } from "./build-brief";

export type CodeChunk = {
  rel: string;
  score: number;
  content: string;
};

function tokensFrom(...parts: string[]): string[] {
  const raw = parts.join(" ").toLowerCase();
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9_]+/)
    .filter((t) => t.length >= 3);
}

function folderBonus(rel: string): number {
  const r = rel.replace(/\\/g, "/").toLowerCase();
  if (r.includes("/validaciones/")) return 40;
  if (r.includes("/logica/")) return 30;
  if (r.includes("/front/")) return 20;
  if (r.endsWith(".sql")) return 25;
  if (r.endsWith(".js")) return 15;
  if (r.endsWith(".php")) return 10;
  return 0;
}

function scoreFile(rel: string, keywords: string[]): number {
  const hay = rel.toLowerCase();
  let score = folderBonus(rel);
  for (const k of keywords) {
    if (hay.includes(k)) score += 12;
  }
  // Prefer smaller focused files slightly
  return score;
}

function readSnippet(abs: string, maxChars: number): string {
  try {
    const raw = fs.readFileSync(abs, "utf8");
    if (raw.length <= maxChars) return raw;
    const head = Math.floor(maxChars * 0.7);
    const tail = maxChars - head - 80;
    return `${raw.slice(0, head)}\n\n/* … truncated … */\n\n${raw.slice(-Math.max(0, tail))}`;
  } catch {
    return "";
  }
}

/**
 * Rankea y lee trozos de código bajo el directorio ya escaneado.
 * No barre el ERP completo: solo la lista del scan.
 */
export function buildCodeContext(opts: {
  scan: OfsercontScan;
  titulo: string;
  descripcion: string;
  proceso: string;
  modulo: string;
  directorio: string;
  maxFiles?: number;
  maxCharsTotal?: number;
  maxCharsPerFile?: number;
}): { chunks: CodeChunk[]; note: string } {
  const maxFiles = Math.max(4, Math.min(20, opts.maxFiles ?? 12));
  const maxCharsTotal = opts.maxCharsTotal ?? 110_000;
  const maxCharsPerFile = opts.maxCharsPerFile ?? 14_000;
  const keywords = tokensFrom(
    opts.titulo,
    opts.descripcion,
    opts.proceso,
    opts.modulo,
    opts.directorio
  );

  const ranked = [...opts.scan.files]
    .map((f) => ({ ...f, score: scoreFile(f.rel, keywords) }))
    .sort((a, b) => b.score - a.score || a.size - b.size)
    .slice(0, maxFiles);

  const chunks: CodeChunk[] = [];
  let used = 0;
  for (const f of ranked) {
    if (used >= maxCharsTotal) break;
    const abs = path.join(opts.scan.root, f.rel);
    const budget = Math.min(maxCharsPerFile, maxCharsTotal - used);
    const content = readSnippet(abs, budget);
    if (!content.trim()) continue;
    chunks.push({ rel: f.rel, score: f.score, content });
    used += content.length;
  }

  return {
    chunks,
    note: chunks.length
      ? `Contexto: ${chunks.length} archivos (~${Math.round(used / 1000)}k chars) bajo ${opts.scan.resolvedDir || opts.directorio || "raiz"}.`
      : "Sin archivos legibles en el directorio; el brief usara solo metadatos de la tarea.",
  };
}

export function buildGeminiBriefPrompt(opts: {
  tarCod: number;
  titulo: string;
  descripcion: string;
  proceso: string;
  modulo: string;
  directorio: string;
  tipo: BriefTipo;
  asignados: string[];
  scan: OfsercontScan;
  chunks: CodeChunk[];
}): { system: string; user: string } {
  const tipoLabel =
    opts.tipo === "creacion" ? "BRIEF DE CREACIÓN DE MÓDULO" : "BRIEF DE MEJORA DE MÓDULOS";

  const system = `Eres analista senior del ERP EXA OFSERCONT (PHP legacy: FRONT / LOGICA / VALIDACIONES).
Redactas briefs internos en español, tono directo y operativo, estilo EXA.

REGLAS:
- No inventes pantallas, tablas ni archivos que no aparezcan en el contexto.
- Cita rutas reales del inventario/código.
- Si falta evidencia, escribe "a confirmar en codigo" (no inventes).
- Las correcciones deben caber en lo existente salvo que el tipo sea creacion.
- Responde SOLO Markdown (sin fences \`\`\`markdown).
- Incluye obligatoriamente estas secciones:
  1. Qué tiene que quedar resuelto
  2. Esquema y módulo actual (o flujo)
  3. Causa raíz / alcance funcional
  4. Impacto
  5. Alcance de la corrección / entrega (orden de trabajo numerado)
  6. Fuera de este cambio
  7. Criterio de hecho (checklist)

Portada: EXA OFSERCONT, "${tipoLabel}", titulo, proceso, modulo, directorio, audiencia, fecha de hoy America/Guayaquil.`;

  const fileList = opts.scan.files.map((f) => `- ${f.rel}`).join("\n") || "- (vacio)";
  const codeBlocks = opts.chunks
    .map((c) => `### ${c.rel}\n\`\`\`\n${c.content}\n\`\`\``)
    .join("\n\n");

  const user = `Genera el ${tipoLabel} para la tarea #${opts.tarCod}.

## Metadatos de la tarea
- Titulo: ${opts.titulo}
- Tipo: ${opts.tipo}
- Proceso: ${opts.proceso || "—"}
- Modulo: ${opts.modulo || "—"}
- Directorio: ${opts.directorio || "—"}
- Asignados: ${opts.asignados.join(", ") || "Equipo de desarrollo"}
- Descripcion:
${opts.descripcion || "(sin descripcion)"}

## Inventario OFSERCONT (${opts.scan.resolvedDir || "sin subruta"})
Raiz: ${opts.scan.root}
Nota: ${opts.scan.note}

Archivos detectados:
${fileList}

## Extractos de codigo (prioridad VALIDACIONES/LOGICA/FRONT)
${codeBlocks || "(sin extractos)"}
`;

  return { system, user };
}
