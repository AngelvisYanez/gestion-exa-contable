/**
 * Smoke: listAsignables = TEAM_MEMBERS (managers + developers).
 * Uso: node --env-file=.env scripts/smoke-asignables.mjs
 */
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");

const TEAM_MEMBERS = [
  { name: "Angelvis Yanez", role: "manager", nameMatch: ["angelvis", "yanez"] },
  { name: "Francisco Torres", role: "manager", nameMatch: ["francisco", "torres", "carrion", "samuel"] },
  { name: "Carreon Leonel Belmuna", role: "developer", nameMatch: ["belduma", "belmuna", "carreon", "leonel", "wilson", "loja"] },
  { name: "Jose Ortiz Cumbicos", role: "developer", nameMatch: ["jose", "ortiz", "cumbicos"] },
  { name: "Moreno Garino Patricio Stefano", role: "developer", nameMatch: ["moreno", "garino", "patricio", "stefano", "patrick"] },
  { name: "Requelme Reyes Nathaly Scarleth", role: "developer", nameMatch: ["requelme", "reyes", "nathaly", "scarleth"] },
];

function norm(s) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function matchTeamMember(fullName) {
  const hay = norm(fullName);
  if (!hay) return null;
  let best = null;
  for (const member of TEAM_MEMBERS) {
    const parts = member.nameMatch.map(norm).filter(Boolean);
    const hits = parts.filter((p) => hay.includes(p)).length;
    const ok = hits >= 2 || (hits === 1 && parts.some((p) => p.length >= 7 && hay.includes(p)));
    if (!ok) continue;
    if (!best || hits > best.score) best = { member, score: hits };
  }
  return best?.member || null;
}

const host = process.env.DATABASE_HOST || "127.0.0.1";
const port = process.env.DATABASE_PORT || "3306";
const user = process.env.DATABASE_USER || "root";
const pass = process.env.DATABASE_PASSWORD || "";
const empCod = Number(process.env.TASKS_EMP_COD || 96);
const auth = pass
  ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}`
  : encodeURIComponent(user);
const url = `mysql://${auth}@${host}:${port}/exa`;

const prisma = new PrismaClient({ datasources: { db: { url } } });

async function listAsignables() {
  const rows = await prisma.personal.findMany({
    where: { Per_Est: "A", Emp_Cod: empCod },
    include: { persona: true },
    take: 500,
    orderBy: { Per_Cod: "desc" },
  });
  const candidates = rows.map((p) => {
    const nombre = `${p.persona?.Prs_Ape || ""} ${p.persona?.Prs_Nom || ""}`.trim();
    return { p, nombre, team: matchTeamMember(nombre) };
  });
  const out = [];
  for (const member of TEAM_MEMBERS) {
    const matches = candidates.filter((c) => c.team?.name === member.name);
    if (!matches.length) continue;
    out.push({
      Per_Cod: matches[0].p.Per_Cod,
      Nombre: matches[0].nombre,
      Team: member.name,
      Role: member.role,
    });
  }
  return out;
}

async function main() {
  console.log("Emp_Cod=", empCod);
  const asignables = await listAsignables();
  console.log("Asignables count:", asignables.length);
  for (const a of asignables) {
    console.log(` - #${a.Per_Cod} ${a.Nombre} [${a.Team}] (${a.Role})`);
  }
  const managers = asignables.filter((a) => a.Role === "manager");
  const developers = asignables.filter((a) => a.Role === "developer");
  console.log("Managers en lista:", managers.length, managers.map((m) => m.Team).join(", ") || "(ninguno)");
  console.log("Developers en lista:", developers.length);
  if (developers.length !== 4) {
    console.error("FAIL: se esperaban 4 developers");
    process.exitCode = 1;
  } else if (managers.length < 1) {
    console.error("WARN/FAIL: ningun manager con ficha personal Emp 96");
    process.exitCode = 1;
  } else {
    console.log("OK: equipo en Asignar A");
  }
  console.log("Smoke done");
}

main()
  .catch((e) => {
    console.error("Smoke error:", e.message || e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
