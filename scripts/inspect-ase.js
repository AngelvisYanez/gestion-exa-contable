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

(async () => {
  try {
    const codes = [1, 4017, 1602, 4467];
    for (const c of codes) {
      const per = await prisma.$queryRawUnsafe(
        `SELECT per.Per_Cod,
                CONVERT(CONCAT(IFNULL(p.Prs_Ape,''), ' ', IFNULL(p.Prs_Nom,'')) USING utf8mb4) AS Nombre
         FROM personal per
         LEFT JOIN persona p ON p.Prs_Cod = per.Prs_Cod
         WHERE per.Per_Cod = ?
         LIMIT 1`,
        c
      );
      const usu = await prisma.$queryRawUnsafe(
        `SELECT u.Usu_Cod, u.Usu_Ced,
                CONVERT(CONCAT(IFNULL(p.Prs_Ape,''), ' ', IFNULL(p.Prs_Nom,'')) USING utf8mb4) AS Nombre
         FROM usuarios u
         LEFT JOIN persona p ON p.Prs_Cod = u.Prs_Cod
         WHERE u.Usu_Cod = ?
         LIMIT 1`,
        c
      );
      console.log(
        c,
        JSON.stringify(
          { per, usu },
          (_k, v) => (typeof v === "bigint" ? Number(v) : v)
        )
      );
    }
  } catch (e) {
    console.error("ERR", e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
