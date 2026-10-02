/**
 * Formato de ticket que llega por WhatsApp / alta manual.
 *
 * Enviado por: ...
 * Empresa: ...
 * Telefono: ...
 * Proceso: ...
 * Titulo: ...
 * Descripcion: ...
 * Adjunto: ruta (opcional, evidencias)
 */

export type TicketWhatsApp = {
  enviadoPor: string;
  empresa: string;
  telefono: string;
  proceso: string;
  titulo: string;
  /** Texto o HTML de la descripcion del problema. */
  descripcion: string;
  adjuntos: string[];
};

const PREFIJOS = {
  enviadoPor: "Enviado por:",
  empresa: "Empresa:",
  telefono: "Telefono:",
  proceso: "Proceso:",
  titulo: "Titulo:",
  descripcion: "Descripcion:",
  adjunto: "Adjunto:",
} as const;

function oneLine(v: string) {
  return v.replace(/\s*\n+\s*/g, " ").trim();
}

/** Arma el cuerpo Tic_Des en el formato WhatsApp + Adjunto. */
export function buildTicketWhatsAppBody(t: Partial<TicketWhatsApp>): string {
  const lines: string[] = [];
  if (t.enviadoPor?.trim()) lines.push(`${PREFIJOS.enviadoPor} ${oneLine(t.enviadoPor)}`);
  if (t.empresa?.trim()) lines.push(`${PREFIJOS.empresa} ${oneLine(t.empresa)}`);
  if (t.telefono?.trim()) lines.push(`${PREFIJOS.telefono} ${oneLine(t.telefono)}`);
  if (t.proceso?.trim()) lines.push(`${PREFIJOS.proceso} ${oneLine(t.proceso)}`);
  if (t.titulo?.trim()) lines.push(`${PREFIJOS.titulo} ${oneLine(t.titulo)}`);

  const desc = (t.descripcion || "").trim();
  if (desc) {
    const isHtml = /<\/?[a-z][\s\S]*>/i.test(desc);
    if (isHtml || desc.includes("\n")) {
      lines.push(PREFIJOS.descripcion);
      lines.push(desc);
    } else {
      lines.push(`${PREFIJOS.descripcion} ${desc}`);
    }
  }

  for (const f of t.adjuntos || []) {
    if (f.trim()) lines.push(`${PREFIJOS.adjunto} ${f.trim()}`);
  }
  return lines.join("\n");
}

/** Extrae campos del cuerpo Tic_Des (WhatsApp o texto libre legacy). */
export function parseTicketWhatsApp(raw: string | null | undefined): TicketWhatsApp {
  const out: TicketWhatsApp = {
    enviadoPor: "",
    empresa: "",
    telefono: "",
    proceso: "",
    titulo: "",
    descripcion: "",
    adjuntos: [],
  };
  if (!raw) return out;

  const text = String(raw);
  const lines = text.split(/\r?\n/);
  const libres: string[] = [];
  let inDescripcion = false;
  const descLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith(PREFIJOS.adjunto)) {
      inDescripcion = false;
      out.adjuntos.push(trimmed.slice(PREFIJOS.adjunto.length).trim());
      continue;
    }

    if (trimmed.startsWith(PREFIJOS.enviadoPor)) {
      inDescripcion = false;
      out.enviadoPor = trimmed.slice(PREFIJOS.enviadoPor.length).trim();
      continue;
    }
    if (trimmed.startsWith(PREFIJOS.empresa)) {
      inDescripcion = false;
      out.empresa = trimmed.slice(PREFIJOS.empresa.length).trim();
      continue;
    }
    if (trimmed.startsWith(PREFIJOS.telefono)) {
      inDescripcion = false;
      out.telefono = trimmed.slice(PREFIJOS.telefono.length).trim();
      continue;
    }
    if (trimmed.startsWith(PREFIJOS.proceso)) {
      inDescripcion = false;
      out.proceso = trimmed.slice(PREFIJOS.proceso.length).trim();
      continue;
    }
    if (trimmed.startsWith(PREFIJOS.titulo)) {
      inDescripcion = false;
      out.titulo = trimmed.slice(PREFIJOS.titulo.length).trim();
      continue;
    }
    if (trimmed.startsWith(PREFIJOS.descripcion)) {
      inDescripcion = true;
      const rest = trimmed.slice(PREFIJOS.descripcion.length).trim();
      if (rest) descLines.push(rest);
      continue;
    }

    if (inDescripcion) {
      descLines.push(line);
    } else {
      libres.push(line);
    }
  }

  out.descripcion = descLines.join("\n").trim();
  if (!out.descripcion && libres.length) {
    out.descripcion = libres.join("\n").trim();
  }
  return out;
}

/** Texto plano de preview (sin cabeceras ni adjuntos). */
export function ticketDescripcionPreview(raw: string | null | undefined): string {
  const p = parseTicketWhatsApp(raw);
  const d = p.descripcion || "";
  return d
    .replace(/<\s*br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6])>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}
