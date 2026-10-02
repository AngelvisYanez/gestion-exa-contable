/**
 * Reintento brief E2E + imprime URL con instrucciones.
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
const BASE = "http://localhost:3000";

async function main() {
  // 1) Dev login HTTP (set-cookie)
  const login = await fetch(`${BASE}/api/auth/dev-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cedula: "22600781",
      name: "Yanez Angelvis",
      role: "manager",
    }),
  });
  const setCookie = login.headers.getSetCookie?.() || [];
  const raw =
    setCookie.find((c) => c.startsWith("exa_tar_sess=")) ||
    login.headers.get("set-cookie") ||
    "";
  console.log("dev-login", login.status, await login.json());

  let cookieHeader = "";
  const m = /exa_tar_sess=([^;]+)/.exec(Array.isArray(setCookie) ? setCookie.join(",") : raw);
  if (m) cookieHeader = `exa_tar_sess=${m[1]}`;
  if (!cookieHeader) {
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
    cookieHeader = `exa_tar_sess=${await createSessionToken(user)}`;
  }

  const me = await fetch(`${BASE}/api/auth/me`, { headers: { Cookie: cookieHeader } });
  console.log("me", me.status, (await me.json())?.user?.name);

  // 2) generate brief (tesoreria — contexto que ya funcionó)
  const gen = await fetch(`${BASE}/api/tareas`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader },
    body: JSON.stringify({
      action: "generate_brief",
      Ses_Dat_Dis: "exa",
      Tar_Cod: 163,
      titulo: "GESTION - prueba brief UI local",
      descripcion:
        "Prueba E2E: brief de mejora para cancelacion por lotes / anticipos. Validar Gemini y docs/.",
      proceso: "Tesoreria",
      modulo: "Cancelacion por lotes",
      directorio: "tesoreria",
      tipo: "mejora",
    }),
  });
  const j = await gen.json();
  console.log(
    JSON.stringify(
      {
        http: gen.status,
        success: j.success,
        message: j.message,
        llm: j.brief?.llm,
        mdRel: j.brief?.mdRel,
        pdfRel: j.brief?.pdfRel,
        files: j.brief?.ofsercont?.files?.length,
      },
      null,
      2
    )
  );

  const token = cookieHeader.replace(/^exa_tar_sess=/, "");
  fs.writeFileSync(path.resolve("scripts/_tmp_e2e_cookie.txt"), token);
  if (!j.success) process.exit(1);
  if (!j.brief?.llm?.ok) process.exitCode = 2;
  else console.log("PASS");
}

main().catch((e) => {
  console.error("FAIL", e instanceof Error ? e.message : e);
  process.exit(1);
});
