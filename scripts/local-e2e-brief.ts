/**
 * E2E local: firma cookie de sesion + POST generate_brief contra localhost:3000
 * Uso: npx tsx scripts/local-e2e-brief.ts
 */
import fs from "fs";
import path from "path";
import { createSessionToken } from "../src/lib/auth/session";
import type { ExaAuthUser } from "../src/lib/auth/exaLogin";

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

const BASE = process.env.E2E_BASE || "http://localhost:3000";

async function main() {
  const user: ExaAuthUser = {
    username: "22600781",
    cedula: "22600781",
    name: "Yanez Angelvis",
    role: "manager",
    projects: ["exa", "servicios"],
    perCod: 0,
    usuCod: 0,
    prsCod: 0,
    empCod: 96,
    dbDis: "exa",
    teamName: "Yanez Angelvis",
  };

  const token = await createSessionToken(user);
  const cookie = `exa_tar_sess=${token}`;

  // health
  const loginPage = await fetch(`${BASE}/login`);
  console.log("GET /login", loginPage.status);

  const me = await fetch(`${BASE}/api/auth/me`, {
    headers: { Cookie: cookie },
  });
  const meJson = await me.json();
  console.log("GET /api/auth/me", me.status, meJson?.user?.name || meJson?.message || meJson);

  // pick a real task if possible
  const list = await fetch(`${BASE}/api/tareas?Ses_Dat_Dis=exa`, {
    headers: { Cookie: cookie },
  });
  const listJson = await list.json();
  const tareas = (listJson.tareas || []) as Array<{ Tar_Cod: number; Tar_Titulo: string }>;
  const tar = tareas[0];
  console.log("tareas", list.status, tareas.length, tar ? `#${tar.Tar_Cod}` : "none");

  const tarCod = tar?.Tar_Cod || 163;
  const titulo = tar?.Tar_Titulo || "Prueba E2E brief Gemini";

  const gen = await fetch(`${BASE}/api/tareas`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify({
      action: "generate_brief",
      Ses_Dat_Dis: "exa",
      Tar_Cod: tarCod,
      titulo: String(titulo).slice(0, 120),
      descripcion:
        "Prueba E2E local del boton Generar brief con Gemini 3. Validar MD/PDF y metadatos.",
      proceso: "Gestion",
      modulo: "Panel tareas",
      directorio: "gestion",
      tipo: "mejora",
    }),
  });
  const genJson = await gen.json();
  const brief = genJson.brief || {};
  console.log(
    JSON.stringify(
      {
        http: gen.status,
        success: genJson.success,
        message: genJson.message,
        mdRel: brief.mdRel,
        pdfRel: brief.pdfRel,
        llm: brief.llm,
        ofsercontDir: brief.ofsercont?.resolvedDir,
        files: brief.ofsercont?.files?.length,
      },
      null,
      2
    )
  );

  // write cookie for browser inject
  const out = path.resolve("scripts/_tmp_e2e_cookie.txt");
  fs.writeFileSync(out, token, "utf8");
  console.log("COOKIE_FILE", out);

  if (!genJson.success || !brief.llm?.ok) {
    process.exitCode = genJson.success && brief.mdRel ? 2 : 1;
    return;
  }
  console.log("PASS e2e generate_brief");
}

main().catch((e) => {
  console.error("FAIL", e instanceof Error ? e.message : e);
  process.exit(1);
});
