/**
 * Asegura tablas ExaMonitor en schemas de DATABASE_NAMES (exa, servicios).
 * Uso:
 *   node scripts/ensure-monitoreo-tables.js            # según .env (host/port)
 *   node scripts/ensure-monitoreo-tables.js --local     # fuerza 127.0.0.1:3306 root sin pass
 */
require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

const forceLocal = process.argv.includes("--local");

function buildUrl(dbName) {
  if (forceLocal) {
    return `mysql://root@127.0.0.1:3306/${dbName}`;
  }
  const user = process.env.DATABASE_USER || "root";
  const pass = process.env.DATABASE_PASSWORD || "";
  const host = process.env.DATABASE_HOST || "127.0.0.1";
  const port = process.env.DATABASE_PORT || "3306";
  const auth = pass
    ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}`
    : encodeURIComponent(user);
  return `mysql://${auth}@${host}:${port}/${dbName}`;
}

function databases() {
  return (process.env.DATABASE_NAMES || "exa,servicios")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const ALTERS = [
  {
    table: "aud_dev_telemetria",
    column: "Tic_Cod",
    sql: "ALTER TABLE aud_dev_telemetria ADD COLUMN Tic_Cod INT NULL",
  },
  {
    table: "aud_dev_monitoreo_config",
    column: "Mon_Forzar_Bandeja",
    sql: "ALTER TABLE aud_dev_monitoreo_config ADD COLUMN Mon_Forzar_Bandeja TINYINT NOT NULL DEFAULT 1",
  },
  {
    table: "aud_dev_monitoreo_config",
    column: "Mon_Permitir_Salir",
    sql: "ALTER TABLE aud_dev_monitoreo_config ADD COLUMN Mon_Permitir_Salir TINYINT NOT NULL DEFAULT 0",
  },
  {
    table: "aud_dev_monitoreo_config",
    column: "Mon_Horario_Activo",
    sql: "ALTER TABLE aud_dev_monitoreo_config ADD COLUMN Mon_Horario_Activo TINYINT NOT NULL DEFAULT 0",
  },
  {
    table: "aud_dev_monitoreo_config",
    column: "Mon_Hora_Inicio",
    sql: "ALTER TABLE aud_dev_monitoreo_config ADD COLUMN Mon_Hora_Inicio VARCHAR(5) NOT NULL DEFAULT '08:00'",
  },
  {
    table: "aud_dev_monitoreo_config",
    column: "Mon_Hora_Fin",
    sql: "ALTER TABLE aud_dev_monitoreo_config ADD COLUMN Mon_Hora_Fin VARCHAR(5) NOT NULL DEFAULT '17:00'",
  },
  {
    table: "aud_dev_monitoreo_config",
    column: "Mon_Dias_Laborales",
    sql: "ALTER TABLE aud_dev_monitoreo_config ADD COLUMN Mon_Dias_Laborales VARCHAR(20) NOT NULL DEFAULT '1,2,3,4,5'",
  },
  {
    table: "aud_dev_monitoreo_config",
    column: "Mon_Almuerzo_Activo",
    sql: "ALTER TABLE aud_dev_monitoreo_config ADD COLUMN Mon_Almuerzo_Activo TINYINT NOT NULL DEFAULT 0",
  },
  {
    table: "aud_dev_monitoreo_config",
    column: "Mon_Almuerzo_Inicio",
    sql: "ALTER TABLE aud_dev_monitoreo_config ADD COLUMN Mon_Almuerzo_Inicio VARCHAR(5) NOT NULL DEFAULT '13:00'",
  },
  {
    table: "aud_dev_monitoreo_config",
    column: "Mon_Almuerzo_Fin",
    sql: "ALTER TABLE aud_dev_monitoreo_config ADD COLUMN Mon_Almuerzo_Fin VARCHAR(5) NOT NULL DEFAULT '14:00'",
  },
];

async function ensureColumn(prisma, table, column, alterSql) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS n FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    table,
    column
  );
  if (Number(rows[0]?.n || 0) === 0) {
    await prisma.$executeRawUnsafe(alterSql);
    return true;
  }
  return false;
}

async function ensureIndex(prisma, table, indexName, createSql) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS n FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
    table,
    indexName
  );
  if (Number(rows[0]?.n || 0) === 0) {
    try {
      await prisma.$executeRawUnsafe(createSql);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

async function runOnDb(dbName) {
  const url = buildUrl(dbName);
  const hostPort = forceLocal
    ? "127.0.0.1:3306"
    : `${process.env.DATABASE_HOST || "127.0.0.1"}:${process.env.DATABASE_PORT || "3306"}`;
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const result = { db: dbName, hostPort, created: [], altered: [], ok: false };
  try {
    const sqlPath = path.join(
      __dirname,
      "..",
      "prisma",
      "sql",
      "create_monitoreo_tables.sql"
    );
    const raw = fs.readFileSync(sqlPath, "utf8");
    // Split on blank-line-separated statements carefully: remove comments first
    const statements = raw
      .split(/;\s*\n/)
      .map((s) =>
        s
          .split("\n")
          .filter((line) => !/^\s*--/.test(line))
          .join("\n")
          .trim()
      )
      .filter(Boolean);

    for (const stmt of statements) {
      await prisma.$executeRawUnsafe(stmt);
      const m = stmt.match(/CREATE TABLE IF NOT EXISTS\s+(\w+)/i);
      if (m) result.created.push(m[1]);
    }

    for (const a of ALTERS) {
      const added = await ensureColumn(prisma, a.table, a.column, a.sql);
      if (added) result.altered.push(`${a.table}.${a.column}`);
    }

    const idx = await ensureIndex(
      prisma,
      "aud_dev_telemetria",
      "idx_tel_tic",
      "CREATE INDEX idx_tel_tic ON aud_dev_telemetria (Tic_Cod)"
    );
    if (idx) result.altered.push("index idx_tel_tic");

    const idxFecha = await ensureIndex(
      prisma,
      "aud_dev_telemetria",
      "idx_tel_fecha",
      "CREATE INDEX idx_tel_fecha ON aud_dev_telemetria (Tel_Fecha_Hora)"
    );
    if (idxFecha) result.altered.push("index idx_tel_fecha");

    const sample = await prisma.aud_dev_telemetria.findMany({ take: 1 });
    const countRows = await prisma.$queryRawUnsafe(
      "SELECT COUNT(*) AS c FROM aud_dev_telemetria"
    );
    result.ok = true;
    result.findManyOk = true;
    result.sampleLen = sample.length;
    result.count = Number(countRows[0].c);
  } catch (e) {
    result.err = String(e.message).slice(0, 400);
  } finally {
    await prisma.$disconnect();
  }
  return result;
}

(async () => {
  const out = [];
  for (const db of databases()) {
    out.push(await runOnDb(db));
  }
  console.log(JSON.stringify(out, null, 2));
  if (out.some((r) => !r.ok)) process.exit(1);
})();
