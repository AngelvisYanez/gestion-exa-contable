const { PrismaClient } = require("@prisma/client");
require("dotenv").config();

const names = (process.env.DATABASE_NAMES || "exa")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const host = process.env.DATABASE_HOST || "127.0.0.1";
const port = process.env.DATABASE_PORT || "3306";
const user = process.env.DATABASE_USER || "root";
const pass = process.env.DATABASE_PASSWORD || "";

const sqls = [
  "ALTER TABLE aud_dev_monitoreo_config ADD COLUMN Mon_Forzar_Bandeja TINYINT NOT NULL DEFAULT 1",
  "ALTER TABLE aud_dev_monitoreo_config ADD COLUMN Mon_Permitir_Salir TINYINT NOT NULL DEFAULT 0",
];

(async () => {
  for (const db of names) {
    const url =
      "mysql://" +
      encodeURIComponent(user) +
      ":" +
      encodeURIComponent(pass) +
      "@" +
      host +
      ":" +
      port +
      "/" +
      db;
    const prisma = new PrismaClient({ datasources: { db: { url } } });
    console.log("DB", db);
    for (const q of sqls) {
      try {
        await prisma.$executeRawUnsafe(q);
        console.log(" OK", q.slice(0, 70));
      } catch (e) {
        console.log(" SKIP/ERR", String(e.message || e).slice(0, 140));
      }
    }
    await prisma.$disconnect();
  }
})().catch((e) => {
  console.error(String(e.message || e));
  process.exit(1);
});
