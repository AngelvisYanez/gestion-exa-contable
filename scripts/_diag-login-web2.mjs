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

const json = (v) =>
  JSON.stringify(v, (_k, val) => (typeof val === "bigint" ? Number(val) : val));

try {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS aud_panel_usuarios (
        Pan_Cod INT NOT NULL AUTO_INCREMENT,
        Usu_Cod INT NOT NULL,
        Pan_Nombre VARCHAR(180) NOT NULL,
        Pan_Rol VARCHAR(20) NOT NULL DEFAULT 'developer',
        Pan_Est CHAR(1) NOT NULL DEFAULT 'A',
        Pan_Creado DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        Pan_Actualizado DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (Pan_Cod)
      )
    `);
    console.log("CREATE_IF_EXISTS ok");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log("CREATE_IF_EXISTS_ERR", msg.split("\n")[0]);
  }

  const emp96 = await prisma.$queryRawUnsafe(`
    SELECT u.Usu_Cod, u.Suc_Cod, s.Suc_Des, s.Emp_Cod,
           TRIM(CONCAT(IFNULL(p.Prs_Ape,''), ' ', IFNULL(p.Prs_Nom,''))) AS Nombre
    FROM usuarios u
    INNER JOIN persona p ON p.Prs_Cod = u.Prs_Cod
    INNER JOIN sucursal s ON s.Suc_Cod = u.Suc_Cod
    WHERE u.Usu_Est = 'A' AND s.Suc_Est = 'A' AND s.Emp_Cod = 96
      AND (u.Usu_Ced = '22600781' OR p.Prs_Ced = '22600781')
  `);
  console.log("EMP96", json(emp96));

  const per = await prisma.$queryRawUnsafe(`
    SELECT Per_Cod, Per_Est, Emp_Cod, Prs_Cod
    FROM personal
    WHERE Prs_Cod = 53102 AND Emp_Cod = 96
  `);
  console.log("PERSONAL96", json(per));

  const n = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS n FROM aud_panel_usuarios`
  );
  console.log("PANEL_N", json(n));
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  console.log("ERR", msg.split("\n")[0]);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
