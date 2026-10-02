/**
 * Prueba local de generateTareaBrief + Gemini (sin levantar HTTP).
 * Uso: node scripts/test-brief-gemini.js
 * No imprime la API key.
 */
const fs = require("fs");
const path = require("path");

function loadEnv(file) {
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

async function main() {
  loadEnv(".env");

  const key = (process.env.GEMINI_API_KEY || "").trim();
  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  console.log("GEMINI_API_KEY:", key ? `set (${key.length} chars)` : "MISSING");
  console.log("GEMINI_MODEL:", model);
  console.log("EXA_OFSERCONT_ROOT:", process.env.EXA_OFSERCONT_ROOT || "(default)");
  console.log("DOCS_DIR:", process.env.DOCS_DIR || "docs");

  // Smoke test Gemini API (sin filtrar key)
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const smoke = await fetch(url, {
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
  const smokeJson = await smoke.json();
  if (!smoke.ok) {
    console.error("FAIL gemini smoke:", smoke.status, smokeJson?.error?.message || smokeJson);
    process.exit(1);
  }
  const smokeText =
    smokeJson?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  console.log("Gemini smoke:", smokeText.trim().slice(0, 80) || "(empty)");

  // Import TS via compiled path — use dynamic import of dist? Project is TS Next.
  // Call generate via tsx if available, else require next-compiled.
  let generateTareaBrief;
  try {
    // Prefer tsx register
    require("tsx/cjs");
    ({ generateTareaBrief } = require("../src/lib/brief/generate.ts"));
  } catch (e1) {
    try {
      const { register } = require("node:module");
      const { pathToFileURL } = require("node:url");
      // fallback: spawn npx tsx
      console.log("Usando npx tsx para importar generate...");
      const { spawnSync } = require("child_process");
      const helper = path.join(__dirname, "_tmp_run_brief.ts");
      fs.writeFileSync(
        helper,
        `
import { generateTareaBrief } from "../src/lib/brief/generate";
const r = await generateTareaBrief({
  dbDis: process.env.TASKS_DB_DIS || "exa",
  tarCod: Number(process.env.TEST_TAR_COD || 0) || 999001,
  titulo: "Prueba brief anticipos CxPP lotes",
  descripcion: "Validar Atp_Fec <= Cop_Fec en cancelacion por lotes. Caso de prueba local Gemini.",
  proceso: "Tesoreria",
  modulo: "Cancelacion por lotes",
  directorio: "tesoreria",
  tipo: "mejora",
  actor: "test-local",
});
console.log(JSON.stringify({
  ok: true,
  mdRel: r.mdRel,
  pdfRel: r.pdfRel,
  llm: r.llm,
  ofsercontFiles: r.ofsercont.files.length,
  ofsercontDir: r.ofsercont.resolvedDir,
  mdExists: require("fs").existsSync(r.mdPath),
  pdfExists: require("fs").existsSync(r.pdfPath),
}, null, 2));
`
      );
      const run = spawnSync(
        "npx",
        ["tsx", helper],
        {
          cwd: path.resolve(__dirname, ".."),
          env: process.env,
          encoding: "utf8",
          timeout: 180000,
          shell: true,
        }
      );
      console.log(run.stdout || "");
      if (run.stderr) console.error(run.stderr.slice(0, 2000));
      try {
        fs.unlinkSync(helper);
      } catch {
        /* ignore */
      }
      if (run.status !== 0) {
        console.error("FAIL generate exit", run.status);
        process.exit(run.status || 1);
      }
      console.log("PASS brief generation");
      process.exit(0);
    } catch (e2) {
      console.error("FAIL import:", e1, e2);
      process.exit(1);
    }
  }

  const r = await generateTareaBrief({
    dbDis: process.env.TASKS_DB_DIS || "exa",
    tarCod: Number(process.env.TEST_TAR_COD || 0) || 999001,
    titulo: "Prueba brief anticipos CxPP lotes",
    descripcion:
      "Validar Atp_Fec <= Cop_Fec en cancelacion por lotes. Caso de prueba local Gemini.",
    proceso: "Tesoreria",
    modulo: "Cancelacion por lotes",
    directorio: "tesoreria",
    tipo: "mejora",
    actor: "test-local",
  });

  const summary = {
    ok: true,
    mdRel: r.mdRel,
    pdfRel: r.pdfRel,
    llm: r.llm,
    ofsercontFiles: r.ofsercont.files.length,
    ofsercontDir: r.ofsercont.resolvedDir,
    mdExists: fs.existsSync(r.mdPath),
    pdfExists: fs.existsSync(r.pdfPath),
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!r.llm.ok && r.llm.used) {
    console.error("WARN: Gemini no completo; se uso fallback");
  }
  if (!summary.mdExists || !summary.pdfExists) {
    console.error("FAIL: archivos no escritos");
    process.exit(1);
  }
  console.log("PASS brief generation");
}

main().catch((e) => {
  console.error("FAIL", e instanceof Error ? e.message : e);
  process.exit(1);
});
