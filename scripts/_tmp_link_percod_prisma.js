/**
 * Vincula Per_Cod Emp_Cod=96 para 22600781 / Prs_Cod=53102 (MySQL 5.5 prod).
 */
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.join(ROOT, ".env");
const CED = "22600781";
const EMP = 96;
const PRS = 53102;

function j(v) {
  return JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? Number(x) : x));
}

function loadEnvFile() {
  const raw = fs.readFileSync(ENV_PATH, "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[m[1]] = v;
  }
  return env;
}

function buildUrl(env) {
  if (env.DATABASE_URL && !/127\.0\.0\.1|localhost/.test(env.DATABASE_URL)) return env.DATABASE_URL;
  const host = env.DATABASE_HOST || "127.0.0.1";
  const port = env.DATABASE_PORT || "3306";
  const user = env.DATABASE_USER || "root";
  const pw = env.DATABASE_PASSWORD || "";
  return `mysql://${encodeURIComponent(user)}:${encodeURIComponent(pw)}@${host}:${port}/exa`;
}

async function main() {
  const env = loadEnvFile();
  const url = buildUrl(env);
  const prisma = new PrismaClient({ datasources: { db: { url } } });

  try {
    console.log("PING", j(await prisma.$queryRawUnsafe(`SELECT DATABASE() AS db, VERSION() AS v`)));

    const tables = await prisma.$queryRawUnsafe(
      `SELECT table_name AS t FROM information_schema.tables
       WHERE table_schema = 'exa' AND table_name IN ('persona','personas','personal','aud_panel_usuarios')
       ORDER BY table_name`
    );
    console.log("TABLES", j(tables));

    // Discover persona table
    let personaTable = null;
    for (const cand of ["persona", "personas"]) {
      try {
        await prisma.$queryRawUnsafe(`SELECT 1 FROM \`${cand}\` LIMIT 1`);
        personaTable = cand;
        break;
      } catch (_) {}
    }
    console.log("PERSONA_TABLE", personaTable);

    if (personaTable) {
      const prs = await prisma.$queryRawUnsafe(
        `SELECT * FROM \`${personaTable}\` WHERE Prs_Cod = ? LIMIT 3`,
        PRS
      );
      const safe = prs.map((r) => {
        const o = { ...r };
        for (const k of Object.keys(o)) if (/pass|pal|clave|pwd|hash/i.test(k)) o[k] = "***";
        return o;
      });
      console.log("PRS_ROW", j(safe));
    }

    const perAll = await prisma.$queryRawUnsafe(
      `SELECT Per_Cod, Emp_Cod, Per_Est, Prs_Cod FROM personal WHERE Prs_Cod = ? LIMIT 30`,
      PRS
    );
    console.log("PER_ALL", j(perAll));

    const per96 = await prisma.$queryRawUnsafe(
      `SELECT Per_Cod, Emp_Cod, Per_Est, Prs_Cod FROM personal WHERE Emp_Cod = ? AND Prs_Cod = ? LIMIT 10`,
      EMP,
      PRS
    );
    console.log("PER96", j(per96));

    let perCod = Number(per96.find((r) => r.Per_Est === "A")?.Per_Cod || per96[0]?.Per_Cod || 0);

    if (!perCod) {
      const cols = await prisma.$queryRawUnsafe(`SHOW COLUMNS FROM personal`);
      console.log("PERSONAL_COLS", cols.map((c) => `${c.Field}:${c.Type}:${c.Null}:${c.Default}`).join(" | "));

      // Try minimal insert
      try {
        await prisma.$executeRawUnsafe(
          `INSERT INTO personal (Emp_Cod, Prs_Cod, Per_Est)
           SELECT ?, ?, 'A' FROM DUAL
           WHERE NOT EXISTS (
             SELECT 1 FROM personal WHERE Emp_Cod = ? AND Prs_Cod = ? AND Per_Est = 'A'
           )`,
          EMP,
          PRS,
          EMP,
          PRS
        );
      } catch (e) {
        console.log("INSERT_ERR", e.message);
        // Inspect a sample personal row for Emp 96 to copy nullable defaults
        const sample = await prisma.$queryRawUnsafe(
          `SELECT * FROM personal WHERE Emp_Cod = ? LIMIT 1`,
          EMP
        );
        console.log("SAMPLE96", j(sample));
        throw e;
      }

      const created = await prisma.$queryRawUnsafe(
        `SELECT Per_Cod, Emp_Cod, Per_Est, Prs_Cod FROM personal
         WHERE Emp_Cod = ? AND Prs_Cod = ? ORDER BY Per_Cod DESC LIMIT 1`,
        EMP,
        PRS
      );
      perCod = Number(created[0]?.Per_Cod || 0);
      console.log("CREATED", j(created));
    }

    if (!perCod) {
      console.log("FAIL_NO_PER");
      process.exit(3);
    }

    // Panel link
    try {
      const panelBefore = await prisma.$queryRawUnsafe(
        `SELECT Pan_Cod, Usu_Cod, Per_Cod, Prs_Cod, Pan_Nombre, Pan_Cedula, Pan_Rol
         FROM aud_panel_usuarios WHERE Pan_Cedula LIKE ? OR Prs_Cod = ? LIMIT 10`,
        `%${CED}%`,
        PRS
      );
      console.log("PANEL_BEFORE", j(panelBefore));

      const upd = await prisma.$executeRawUnsafe(
        `UPDATE aud_panel_usuarios
         SET Per_Cod = ?, Prs_Cod = ?, Pan_Actualizado = NOW()
         WHERE Pan_Cedula LIKE ? OR Prs_Cod = ?`,
        perCod,
        PRS,
        `%${CED}%`,
        PRS
      );
      console.log("PANEL_UPDATE", upd);

      if (Number(upd) === 0) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO aud_panel_usuarios
            (Usu_Cod, Per_Cod, Prs_Cod, Pan_Nombre, Pan_Cedula, Pan_Rol, Pan_Est, Pan_Creado)
           VALUES (6170, ?, ?, 'Yanez Angelvis', ?, 'manager', 'A', NOW())`,
          perCod,
          PRS,
          CED
        );
        console.log("PANEL_INSERT_OK");
      }

      const panelAfter = await prisma.$queryRawUnsafe(
        `SELECT Pan_Cod, Usu_Cod, Per_Cod, Prs_Cod, Pan_Nombre, Pan_Cedula, Pan_Rol
         FROM aud_panel_usuarios WHERE Per_Cod = ? OR Pan_Cedula LIKE ? LIMIT 10`,
        perCod,
        `%${CED}%`
      );
      console.log("PANEL_AFTER", j(panelAfter));
    } catch (e) {
      console.log("PANEL_SKIP", e.message);
    }

    console.log("DONE", j({ perCod, prsCod: PRS, empCod: EMP, cedula: CED }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("ERROR", e && e.message ? e.message : String(e));
  process.exit(1);
});
