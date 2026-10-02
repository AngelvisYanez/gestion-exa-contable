import fs from "fs";
import { PrismaClient } from "@prisma/client";

for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (!m) continue;
  const k = m[1].trim();
  if (process.env[k]) continue;
  let v = m[2].trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  process.env[k] = v;
}

const host = process.env.DATABASE_HOST || "127.0.0.1";
const port = process.env.DATABASE_PORT || "3306";
const user = process.env.DATABASE_USER || "root";
const pass = process.env.DATABASE_PASSWORD || "";
const db = (process.env.TASKS_DB_DIS || "exa").replace(/[^a-zA-Z0-9_]/g, "");
const auth = pass
  ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}`
  : encodeURIComponent(user);
const prisma = new PrismaClient({
  datasources: {
    db: { url: `mysql://${auth}@${host}:${port}/${db}?connection_limit=1&connect_timeout=8` },
  },
});

function norm(s) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
const TEAM = [
  { name: "Angelvis Yanez", role: "manager", nameMatch: ["angelvis", "yanez"] },
  { name: "Francisco Torres", role: "manager", nameMatch: ["francisco", "torres", "carrion", "samuel"] },
  { name: "Carreon Leonel Belmuna", role: "developer", nameMatch: ["belduma", "belmuna", "carreon", "leonel", "wilson", "loja"] },
  { name: "Jose Ortiz Cumbicos", role: "developer", nameMatch: ["jose", "ortiz", "cumbicos"] },
  { name: "Moreno Garino Patricio Stefano", role: "developer", nameMatch: ["moreno", "garino", "patricio", "stefano", "patrick"] },
  { name: "Requelme Reyes Nathaly Scarleth", role: "developer", nameMatch: ["requelme", "reyes", "nathaly", "scarleth"] },
];
function matchTeam(fullName) {
  const hay = norm(fullName);
  let best = null;
  for (const member of TEAM) {
    const parts = member.nameMatch.map(norm).filter(Boolean);
    const hits = parts.filter((p) => hay.includes(p)).length;
    const ok = hits >= 2 || (hits === 1 && parts.some((p) => p.length >= 7 && hay.includes(p)));
    if (!ok) continue;
    if (!best || hits > best.score) best = { member, score: hits };
  }
  return best?.member || null;
}

const json = (v) => JSON.stringify(v, (_k, val) => (typeof val === "bigint" ? Number(val) : val));

try {
  const same = await prisma.$queryRawUnsafe(`
    SELECT (a.Usu_Pal = b.Usu_Pal) AS same_pass,
           CHAR_LENGTH(IFNULL(a.Usu_Pal,'')) AS len_a,
           CHAR_LENGTH(IFNULL(b.Usu_Pal,'')) AS len_b
    FROM usuarios a
    INNER JOIN usuarios b ON b.Usu_Cod = 6273
    WHERE a.Usu_Cod = 6170
  `);
  console.log("SAME_PASS", json(same));

  const people = await prisma.$queryRawUnsafe(`
    SELECT u.Usu_Cod, u.Prs_Cod, u.Suc_Cod,
           TRIM(CONCAT(IFNULL(p.Prs_Ape,''), ' ', IFNULL(p.Prs_Nom,''))) AS Nombre
    FROM usuarios u
    INNER JOIN persona p ON p.Prs_Cod = u.Prs_Cod
    INNER JOIN sucursal s ON s.Suc_Cod = u.Suc_Cod
    WHERE u.Usu_Est = 'A' AND s.Suc_Est = 'A' AND s.Emp_Cod = 96
    ORDER BY CASE WHEN u.Suc_Cod = 99 THEN 0 ELSE 1 END, u.Usu_Cod ASC
  `);
  const seen = new Set();
  const picked = [];
  for (const row of people) {
    const nombre = String(row.Nombre || "").trim();
    const team = matchTeam(nombre);
    if (!team || seen.has(team.name)) continue;
    seen.add(team.name);
    picked.push({
      Usu_Cod: Number(row.Usu_Cod),
      Suc_Cod: Number(row.Suc_Cod),
      Nombre: nombre,
      role: team.role,
      team: team.name,
    });
  }
  console.log("SEED_PICKS", json(picked));
  console.log("PEOPLE_N", people.length);
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  console.log("ERR", msg.split("\n").slice(0, 8).join(" | "));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
