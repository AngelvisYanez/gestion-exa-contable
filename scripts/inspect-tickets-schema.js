/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

function loadEnv() {
  const p = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}

loadEnv();

const host = process.env.DATABASE_HOST || "127.0.0.1";
const port = process.env.DATABASE_PORT || "3306";
const user = process.env.DATABASE_USER || "root";
const pass = process.env.DATABASE_PASSWORD || "";
const db = process.env.TASKS_DB_DIS || "exa";
const auth = pass
  ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}`
  : encodeURIComponent(user);
const url = `mysql://${auth}@${host}:${port}/${db}`;
const prisma = new PrismaClient({ datasources: { db: { url } } });

function json(v) {
  return JSON.stringify(v, (_k, val) => (typeof val === "bigint" ? Number(val) : val), 2);
}

(async () => {
  try {
    const cols = await prisma.$queryRawUnsafe("SHOW COLUMNS FROM tickets");
    console.log("COLUMNS", json(cols));

    const sample = await prisma.$queryRawUnsafe("SELECT * FROM tickets ORDER BY 1 DESC LIMIT 3");
    console.log("SAMPLE_KEYS", sample[0] ? Object.keys(sample[0]) : []);
    console.log("SAMPLE", json(sample));

    // Try common status/emp filters
    const statuses = await prisma.$queryRawUnsafe(`
      SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tickets'
    `);
    console.log("COL_NAMES", statuses.map((r) => r.COLUMN_NAME).join(", "));
  } catch (e) {
    console.error("ERR", e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
