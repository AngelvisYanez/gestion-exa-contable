import fs from "fs";
import path from "path";
import { getPrisma, sanitizeDbDis } from "@/lib/db";
import { publishEvent } from "@/lib/events";
import { buildBriefMarkdown, type BriefTipo } from "./build-brief";
import { buildCodeContext, buildGeminiBriefPrompt } from "./context";
import { generateWithGemini, getGeminiConfig, validateBriefMarkdown } from "./gemini";
import { scanOfsercontModule } from "./ofsercont-scan";
import { writeBriefPdf } from "./pdf";
import { saveEvidenciaBytes } from "@/lib/captures";
import { attachEvidenciasTarea } from "@/lib/tareas";
import { resolvePhonesForTarea } from "@/lib/whatsapp/phones";
import {
  getUltramsgConfig,
  ultramsgSendDocument,
  ultramsgSendText,
  type UltramsgSendResult,
} from "@/lib/whatsapp/ultramsg";

/** Por base. El mismo booleano global provocaba 1054 al cambiar de exa a servicios. */
const briefReadyByDb = new Map<string, boolean>();
const briefEnsureInflight = new Map<string, Promise<boolean>>();

const BRIEF_COLS = [
  "Tar_Proceso",
  "Tar_Modulo",
  "Tar_Directorio",
  "Tar_Brief_Tipo",
  "Tar_Brief_Md",
  "Tar_Brief_Pdf",
  "Tar_Brief_Fecha",
] as const;

async function detectBriefColumns(dbKey: string): Promise<boolean> {
  const prisma = getPrisma(dbKey);
  try {
    for (const col of BRIEF_COLS) {
      const cols = await prisma.$queryRawUnsafe<Array<{ Field: string }>>(
        `SHOW COLUMNS FROM aud_tareas LIKE '${col}'`
      );
      if (cols.length) continue;
      if (col === "Tar_Proceso") {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE aud_tareas ADD COLUMN Tar_Proceso VARCHAR(120) NULL`
        );
      } else if (col === "Tar_Modulo") {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE aud_tareas ADD COLUMN Tar_Modulo VARCHAR(120) NULL`
        );
      } else if (col === "Tar_Directorio") {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE aud_tareas ADD COLUMN Tar_Directorio VARCHAR(255) NULL`
        );
      } else if (col === "Tar_Brief_Tipo") {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE aud_tareas ADD COLUMN Tar_Brief_Tipo VARCHAR(40) NULL`
        );
      } else if (col === "Tar_Brief_Md") {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE aud_tareas ADD COLUMN Tar_Brief_Md VARCHAR(500) NULL`
        );
      } else if (col === "Tar_Brief_Pdf") {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE aud_tareas ADD COLUMN Tar_Brief_Pdf VARCHAR(500) NULL`
        );
      } else if (col === "Tar_Brief_Fecha") {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE aud_tareas ADD COLUMN Tar_Brief_Fecha DATETIME NULL`
        );
      }
    }
    briefReadyByDb.set(dbKey, true);
    return true;
  } catch {
    return false;
  }
}

export async function ensureTareaBriefColumns(dbDis: string) {
  const key = sanitizeDbDis(dbDis);
  if (briefReadyByDb.get(key) === true) return true;

  const pending = briefEnsureInflight.get(key);
  if (pending) return pending;

  const job = detectBriefColumns(key).finally(() => {
    briefEnsureInflight.delete(key);
  });
  briefEnsureInflight.set(key, job);
  return job;
}

function docsRoot(): string {
  const raw = (process.env.DOCS_DIR || "").trim();
  if (raw) return path.resolve(raw);
  return path.resolve(process.cwd(), "docs");
}

function slugify(s: string): string {
  return String(s || "brief")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 60) || "brief";
}

function ymd(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "00";
  return `${get("year")}${get("month")}${get("day")}`;
}

export type GenerateBriefInput = {
  dbDis: string;
  tarCod: number;
  titulo: string;
  descripcion: string;
  proceso: string;
  modulo: string;
  directorio: string;
  tipo: BriefTipo;
  actor?: string;
  /** URL pública base de gestion (para Ultramsg document). Ej. https://gestion.exacontable.com */
  publicBaseUrl?: string;
};

export type GenerateBriefResult = {
  tarCod: number;
  tipo: BriefTipo;
  mdPath: string;
  pdfPath: string;
  mdRel: string;
  pdfRel: string;
  /** Rutas de evidencia adjuntas a la descripción de la tarea. */
  adjuntos: string[];
  ofsercont: ReturnType<typeof scanOfsercontModule>;
  llm: {
    used: boolean;
    model: string | null;
    ok: boolean;
    error?: string;
    filesUsed: number;
    note: string;
  };
  pdfEngine?: "reportlab" | "simple";
  whatsapp: {
    enabled: boolean;
    recipients: Array<{ nombre: string; role: string; telefono: string | null }>;
    sends: UltramsgSendResult[];
    note: string;
  };
};

export async function generateTareaBrief(input: GenerateBriefInput): Promise<GenerateBriefResult> {
  const okCols = await ensureTareaBriefColumns(input.dbDis);
  if (!okCols) {
    throw new Error("No se pudieron asegurar columnas de brief en aud_tareas");
  }

  const prisma = getPrisma(input.dbDis);
  const tipo: BriefTipo = input.tipo === "creacion" ? "creacion" : "mejora";
  const titulo = String(input.titulo || "").trim().slice(0, 255);
  if (!titulo) throw new Error("Titulo requerido");
  const proceso = String(input.proceso || "").trim().slice(0, 120);
  const modulo = String(input.modulo || "").trim().slice(0, 120);
  const directorio = String(input.directorio || "").trim().slice(0, 255);
  const descripcion = String(input.descripcion || "").trim();

  const asignados = await prisma.$queryRawUnsafe<
    Array<{ Per_Cod: number; Nombre: string | null }>
  >(
    `SELECT a.Per_Cod,
            CONVERT(TRIM(CONCAT(IFNULL(p.Prs_Ape,''), ' ', IFNULL(p.Prs_Nom,''))) USING utf8mb4) AS Nombre
     FROM aud_tareas_asignadas a
     LEFT JOIN personal per ON per.Per_Cod = a.Per_Cod
     LEFT JOIN persona p ON p.Prs_Cod = per.Prs_Cod
     WHERE a.Tas_Est = 'A' AND a.Tar_Cod = ?`,
    input.tarCod
  );

  const geminiCfg = getGeminiConfig();
  const scan = scanOfsercontModule({
    directorio,
    modulo,
    limit: geminiCfg.enabled ? 80 : 40,
  });
  const now = new Date();
  const asignadosNombres = asignados.map((a) => (a.Nombre || "").trim()).filter(Boolean);

  let md = "";
  const llmMeta: GenerateBriefResult["llm"] = {
    used: false,
    model: null,
    ok: false,
    filesUsed: 0,
    note: "Plantilla local (Gemini no usado).",
  };

  if (geminiCfg.enabled) {
    const { chunks, note: ctxNote } = buildCodeContext({
      scan,
      titulo,
      descripcion,
      proceso,
      modulo,
      directorio,
    });
    const { system, user } = buildGeminiBriefPrompt({
      tarCod: input.tarCod,
      titulo,
      descripcion,
      proceso,
      modulo,
      directorio,
      tipo,
      asignados: asignadosNombres,
      scan,
      chunks,
    });
    const gen = await generateWithGemini({ system, user, retries: 1 });
    llmMeta.used = true;
    llmMeta.model = gen.model;
    llmMeta.filesUsed = chunks.length;

    if (gen.ok) {
      let text = gen.text.replace(/^```(?:markdown|md)?\s*/i, "").replace(/\s*```$/i, "").trim();
      let check = validateBriefMarkdown(text);
      if (!check.ok) {
        const repair = await generateWithGemini({
          system:
            "Corrige el brief Markdown. Conserva el contenido util y completa las secciones faltantes. Responde solo Markdown.",
          user: `Secciones faltantes o debiles: ${check.missing.join("; ")}\n\nBrief actual:\n${text}`,
          retries: 0,
        });
        if (repair.ok) {
          text = repair.text.replace(/^```(?:markdown|md)?\s*/i, "").replace(/\s*```$/i, "").trim();
          check = validateBriefMarkdown(text);
        }
      }
      if (check.ok || text.length > 600) {
        md = text;
        llmMeta.ok = true;
        llmMeta.note = `Gemini ${gen.model}: ${ctxNote}`;
      } else {
        llmMeta.error = `Respuesta incompleta (${check.missing.join(", ")})`;
        llmMeta.note = `Gemini respondio pero fallo validacion; se uso plantilla. ${ctxNote}`;
      }
    } else {
      llmMeta.error = gen.error;
      llmMeta.note = `Gemini fallo (${gen.error || "error"}); se uso plantilla. ${ctxNote}`;
    }
  }

  if (!md) {
    md = buildBriefMarkdown(
      {
        tarCod: input.tarCod,
        titulo,
        descripcion,
        proceso,
        modulo,
        directorio,
        tipo,
        asignados: asignadosNombres,
        fecha: now,
      },
      scan
    );
    if (llmMeta.used && llmMeta.error) {
      md =
        `> **Nota:** No se pudo completar con Gemini (${llmMeta.error}). Brief plantilla + inventario.\n\n` +
        md;
    }
  }

  const root = docsRoot();
  fs.mkdirSync(root, { recursive: true });
  const base = `Brief_${slugify(titulo)}_${input.tarCod}_${ymd(now)}`;
  const mdName = `${base}.md`;
  const pdfName = `${base}.pdf`;
  const mdAbs = path.join(root, mdName);
  const pdfAbs = path.join(root, pdfName);
  fs.writeFileSync(mdAbs, md, "utf8");

  const fechaLabel = now.toLocaleDateString("es-EC", {
    timeZone: "America/Guayaquil",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const tipoLabel =
    tipo === "creacion" ? "BRIEF DE CREACIÓN DE MÓDULO" : "BRIEF DE MEJORA DE MÓDULOS";
  const chips = [
    proceso,
    modulo,
    directorio,
    tipo === "creacion" ? "Creacion" : "Mejora",
    `Tarea #${input.tarCod}`,
  ].filter(Boolean) as string[];

  const pdfWrite = writeBriefPdf(pdfAbs, {
    titulo,
    tipoLabel,
    subtitulo: modulo ? `${proceso || "Proceso"} · ${modulo}` : proceso || undefined,
    resumen:
      "Diagnóstico, causa raíz, impacto en operación y plan de corrección anclado al código OFSERCONT.",
    audiencia: asignadosNombres.length
      ? `Para ${asignadosNombres.join(", ")}.`
      : "Para el equipo de desarrollo y encargado.",
    fecha: fechaLabel,
    proceso,
    modulo,
    directorio,
    tarCod: input.tarCod,
    chips,
    markdown: md,
  });

  const mdRel = path.posix.join("docs", mdName);
  const pdfRel = path.posix.join("docs", pdfName);

  const mdRuta = saveEvidenciaBytes(input.tarCod, mdName, fs.readFileSync(mdAbs));
  const pdfRuta = saveEvidenciaBytes(input.tarCod, pdfName, fs.readFileSync(pdfAbs));
  const attached = await attachEvidenciasTarea(input.dbDis, input.tarCod, [mdRuta, pdfRuta]);

  await prisma.$executeRawUnsafe(
    `UPDATE aud_tareas
     SET Tar_Proceso = ?,
         Tar_Modulo = ?,
         Tar_Directorio = ?,
         Tar_Brief_Tipo = ?,
         Tar_Brief_Md = ?,
         Tar_Brief_Pdf = ?,
         Tar_Brief_Fecha = ?
     WHERE Tar_Cod = ? AND Tar_Est = 'A'`,
    proceso || null,
    modulo || null,
    directorio || null,
    tipo,
    mdRel,
    pdfRel,
    now,
    input.tarCod
  );

  const perCods = asignados.map((a) => Number(a.Per_Cod)).filter((n) => n > 0);
  const recipients = await resolvePhonesForTarea(input.dbDis, {
    perCods,
    includeManagers: true,
  });

  // Notificación interna del panel (fase actual)
  for (const r of recipients) {
    if (r.perCod) {
      publishEvent({
        type: "brief_generado",
        title: "Brief de desarrollo listo",
        message: `#${input.tarCod} · ${titulo} (${tipo}) → ${mdRel}`,
        db: input.dbDis,
        tarCod: input.tarCod,
        perCod: r.perCod,
        actor: input.actor,
        kind: "tarea",
      });
    }
  }
  if (!recipients.some((r) => r.role === "manager" || r.role === "atencion")) {
    publishEvent({
      type: "brief_generado",
      title: "Brief de desarrollo listo",
      message: `#${input.tarCod} · ${titulo} (${tipo}) → ${mdRel}`,
      db: input.dbDis,
      tarCod: input.tarCod,
      actor: input.actor,
      kind: "tarea",
    });
  }

  const cfg = getUltramsgConfig();
  const sends: UltramsgSendResult[] = [];
  const caption = `EXA Gestión · Brief ${tipo} tarea #${input.tarCod}: ${titulo}`;
  const publicBase = (input.publicBaseUrl || process.env.PUBLIC_APP_URL || "").replace(/\/$/, "");

  if (cfg.enabled) {
    for (const r of recipients) {
      if (!r.telefono) {
        sends.push({ ok: false, skipped: true, reason: `Sin telefono: ${r.nombre}` });
        continue;
      }
      if (publicBase) {
        const docUrl = `${publicBase}/${pdfRel}`;
        sends.push(
          await ultramsgSendDocument({
            to: r.telefono,
            filename: pdfName,
            documentUrl: docUrl,
            caption,
          })
        );
      } else {
        sends.push(await ultramsgSendText(r.telefono, `${caption}\nArchivo: ${pdfRel}`));
      }
    }
  }

  return {
    tarCod: input.tarCod,
    tipo,
    mdPath: mdAbs,
    pdfPath: pdfAbs,
    mdRel,
    pdfRel,
    adjuntos: [mdRuta, pdfRuta].filter((r) => attached.adjuntos.includes(r)),
    ofsercont: scan,
    llm: llmMeta,
    pdfEngine: pdfWrite.engine,
    whatsapp: {
      enabled: cfg.enabled,
      recipients: recipients.map((r) => ({
        nombre: r.nombre,
        role: r.role,
        telefono: r.telefono,
      })),
      sends,
      note: cfg.enabled
        ? "UltraMsg activo: se intento notificar a desarrolladores y encargados."
        : "WhatsApp en espera: notificacion interna del panel. Active WHATSAPP_ENABLED=1 + ULTRAMSG_* (misma instancia que exa-ofsercont/relavera) para enviar.",
    },
  };
}
