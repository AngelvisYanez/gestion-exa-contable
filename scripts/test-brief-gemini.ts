/**
 * Prueba local: Gemini + brief (tsx).
 * node no; usar: npx tsx scripts/test-brief-gemini.ts
 */
import fs from "fs";
import path from "path";

function loadEnv(file: string) {
  const p = path.resolve(process.cwd(), file);
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

loadEnv(".env");

async function smokeGemini() {
  const key = (process.env.GEMINI_API_KEY || "").trim();
  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  console.log("GEMINI_API_KEY:", key ? `set (${key.length} chars)` : "MISSING");
  console.log("GEMINI_MODEL:", model);
  if (!key) throw new Error("GEMINI_API_KEY ausente");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: "Responde exactamente: OK" }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 16 },
    }),
  });
  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(json?.error?.message || `HTTP ${res.status}`);
  const text =
    json?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  console.log("Gemini smoke:", text.trim().slice(0, 80) || "(empty)");
}

async function runBrief() {
  const { generateTareaBrief } = await import("../src/lib/brief/generate");
  const r = await generateTareaBrief({
    dbDis: process.env.TASKS_DB_DIS || "exa",
    tarCod: Number(process.env.TEST_TAR_COD || 0) || 999001,
    titulo: "Prueba brief anticipos CxPP lotes",
    descripcion:
      "Validar Atp_Fec <= Cop_Fec en cancelacion por lotes a proveedores. Caso de prueba local con Gemini 3.",
    proceso: "Tesoreria",
    modulo: "Cancelacion por lotes",
    directorio: "tesoreria",
    tipo: "mejora",
    actor: "test-local",
  });

  const summary = {
    mdRel: r.mdRel,
    pdfRel: r.pdfRel,
    llm: r.llm,
    ofsercontFiles: r.ofsercont.files.length,
    ofsercontDir: r.ofsercont.resolvedDir,
    mdExists: fs.existsSync(r.mdPath),
    pdfExists: fs.existsSync(r.pdfPath),
    mdBytes: fs.existsSync(r.mdPath) ? fs.statSync(r.mdPath).size : 0,
  };
  console.log(JSON.stringify(summary, null, 2));

  if (!summary.mdExists || !summary.pdfExists) {
    throw new Error("Archivos MD/PDF no escritos");
  }
  if (summary.mdBytes < 400) throw new Error("MD demasiado corto");
  if (!r.llm.ok) {
    console.warn("WARN: Gemini no completo; hubo fallback a plantilla");
    process.exitCode = 2;
    return;
  }
  console.log("PASS brief + Gemini");
}

async function main() {
  await smokeGemini();
  await runBrief();
}

main().catch((e) => {
  console.error("FAIL", e instanceof Error ? e.message : e);
  process.exit(1);
});
