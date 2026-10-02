require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");

function redact(s) {
  const pass = process.env.DATABASE_PASSWORD || "";
  return String(s).split(pass).join("***");
}

function buildUrl(host, port, user, pass, db) {
  const auth = pass
    ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}`
    : encodeURIComponent(user);
  return `mysql://${auth}@${host}:${port}/${db}`;
}

async function tryConnect() {
  const pass = process.env.DATABASE_PASSWORD || "";
  const candidates = [
    { label: "remote-3306", host: "199.89.54.243", port: 3306, user: "root", password: pass },
    { label: "tunnel-3307", host: "127.0.0.1", port: 3307, user: "root", password: pass },
    { label: "local-3306", host: "127.0.0.1", port: 3306, user: "root", password: pass },
    { label: "remote-root-nopass", host: "199.89.54.243", port: 3306, user: "root", password: "" },
  ];
  for (const c of candidates) {
    const url = buildUrl(c.host, c.port, c.user, c.password, "exa");
    const prisma = new PrismaClient({ datasources: { db: { url } } });
    try {
      const v = await prisma.$queryRawUnsafe(
        "SELECT VERSION() AS v, DATABASE() AS db, USER() AS u"
      );
      console.log(JSON.stringify({ ok: true, label: c.label, host: c.host, port: c.port, v: v[0] }));
      return { prisma, meta: c, url };
    } catch (e) {
      console.log(
        JSON.stringify({
          ok: false,
          label: c.label,
          host: c.host,
          port: c.port,
          err: redact(e.message || e).slice(0, 200),
        })
      );
      await prisma.$disconnect().catch(() => {});
    }
  }
  return null;
}

async function colInfo(prisma, table, col) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COLUMN_NAME AS name, COLUMN_TYPE AS type, IS_NULLABLE AS nullable,
            COLUMN_DEFAULT AS def, EXTRA AS extra
     FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    table,
    col
  );
  return rows[0] || null;
}

async function main() {
  const conn = await tryConnect();
  if (!conn) {
    console.log(JSON.stringify({ fatal: "no_mysql_connection" }));
    process.exit(2);
  }
  const { prisma } = conn;

  const tables = await prisma.$queryRawUnsafe("SHOW TABLES");
  const names = tables.map((r) => Object.values(r)[0]);
  const aud = names.filter((n) => String(n).startsWith("aud_"));
  console.log(JSON.stringify({ aud_tables: aud }, null, 2));

  for (const t of [
    "aud_panel_usuarios",
    "aud_dev_telemetria",
    "aud_incidencias",
    "aud_dev_monitoreo_global",
    "aud_dev_monitoreo_config",
  ]) {
    console.log(JSON.stringify({ exists: names.includes(t), table: t }));
  }

  for (const [t, cols] of [
    ["aud_panel_usuarios", ["Pan_Creado", "Pan_Actualizado", "Per_Cod"]],
    ["aud_incidencias", ["Inc_Primera_Vez", "Inc_Ultima_Vez"]],
    ["aud_dev_monitoreo_global", ["Cfg_Actualizado"]],
  ]) {
    if (!names.includes(t)) continue;
    for (const c of cols) {
      console.log(JSON.stringify({ before: true, table: t, col: await colInfo(prisma, t, c) }));
    }
  }

  // Angelvis lookup (read-only for now)
  try {
    const panel = await prisma.$queryRawUnsafe(
      `SELECT Pan_Cod, Usu_Cod, Per_Cod, Prs_Cod, Pan_Nombre, Pan_Cedula, Pan_Rol, Pan_Est
       FROM aud_panel_usuarios
       WHERE Pan_Cedula LIKE '%22600781%' OR Pan_Nombre LIKE '%Angelvis%' OR Pan_Nombre LIKE '%Yanez%'
       LIMIT 20`
    );
    console.log(JSON.stringify({ panel_angelvis: panel }, null, 2));
  } catch (e) {
    console.log(JSON.stringify({ panel_err: redact(e.message).slice(0, 200) }));
  }

  try {
    const per = await prisma.$queryRawUnsafe(
      `SELECT p.Per_Cod, p.Emp_Cod, p.Per_Est, pr.Prs_Cod, pr.Prs_Nom, pr.Prs_Ape, pr.Prs_Ced
       FROM personal p
       LEFT JOIN personas pr ON pr.Prs_Cod = p.Prs_Cod
       WHERE p.Emp_Cod = 96
         AND (
           pr.Prs_Ced LIKE '%22600781%'
           OR CONCAT(IFNULL(pr.Prs_Nom,''),' ',IFNULL(pr.Prs_Ape,'')) LIKE '%Angelvis%'
           OR CONCAT(IFNULL(pr.Prs_Nom,''),' ',IFNULL(pr.Prs_Ape,'')) LIKE '%Yanez%'
           OR CONCAT(IFNULL(pr.Prs_Ape,''),' ',IFNULL(pr.Prs_Nom,'')) LIKE '%Yanez%'
         )
       LIMIT 20`
    );
    console.log(JSON.stringify({ personal_emp96: per }, null, 2));
  } catch (e) {
    console.log(JSON.stringify({ personal_err: redact(e.message).slice(0, 300) }));
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(redact(e.stack || e.message));
  process.exit(1);
});
