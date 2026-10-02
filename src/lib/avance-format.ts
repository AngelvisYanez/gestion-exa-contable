/**
 * Formato estructurado de avances guardado en aud_tareas_avances.Ava_Descripcion (TEXT).
 * Se mantiene legible para el módulo PHP legacy: una sección por línea con prefijo fijo.
 */

export type AvanceEstructurado = {
  realizado: string;
  siguiente: string;
  bloqueos: string;
  horas: number | null;
  enlaces: string[];
  adjuntos: string[];
};

const PREFIJOS = {
  siguiente: "Siguiente paso:",
  bloqueos: "Bloqueos:",
  horas: "Horas:",
  enlace: "Evidencia:",
  adjunto: "Adjunto:",
} as const;

function oneLine(v: string) {
  return v.replace(/\s*\n+\s*/g, " ").trim();
}

export function buildAvanceDescripcion(a: Partial<AvanceEstructurado>): string {
  const lines: string[] = [];
  const realizado = (a.realizado || "").trim();
  if (realizado) lines.push(realizado);
  if (a.siguiente?.trim()) lines.push(`${PREFIJOS.siguiente} ${oneLine(a.siguiente)}`);
  if (a.bloqueos?.trim()) lines.push(`${PREFIJOS.bloqueos} ${oneLine(a.bloqueos)}`);
  if (a.horas != null && a.horas > 0) lines.push(`${PREFIJOS.horas} ${Math.round(a.horas * 100) / 100}`);
  for (const e of a.enlaces || []) if (e.trim()) lines.push(`${PREFIJOS.enlace} ${e.trim()}`);
  for (const f of a.adjuntos || []) if (f.trim()) lines.push(`${PREFIJOS.adjunto} ${f.trim()}`);
  return lines.join("\n");
}

export function parseAvanceDescripcion(raw: string | null | undefined): AvanceEstructurado {
  const out: AvanceEstructurado = {
    realizado: "",
    siguiente: "",
    bloqueos: "",
    horas: null,
    enlaces: [],
    adjuntos: [],
  };
  if (!raw) return out;
  const libres: string[] = [];
  for (const line of String(raw).split(/\r?\n/)) {
    const l = line.trim();
    if (l.startsWith(PREFIJOS.siguiente)) out.siguiente = l.slice(PREFIJOS.siguiente.length).trim();
    else if (l.startsWith(PREFIJOS.bloqueos)) out.bloqueos = l.slice(PREFIJOS.bloqueos.length).trim();
    else if (l.startsWith(PREFIJOS.horas)) {
      const n = parseFloat(l.slice(PREFIJOS.horas.length).replace(",", "."));
      out.horas = Number.isFinite(n) ? n : null;
    } else if (l.startsWith(PREFIJOS.enlace)) out.enlaces.push(l.slice(PREFIJOS.enlace.length).trim());
    else if (l.startsWith(PREFIJOS.adjunto)) out.adjuntos.push(l.slice(PREFIJOS.adjunto.length).trim());
    else libres.push(line);
  }
  out.realizado = libres.join("\n").trim();
  return out;
}

export function isImagePath(p: string) {
  return /\.(png|jpe?g|webp|gif)$/i.test(p);
}

export function isSafeUrl(u: string) {
  return /^https?:\/\//i.test(u.trim());
}
