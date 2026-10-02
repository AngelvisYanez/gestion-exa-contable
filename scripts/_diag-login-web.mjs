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
const url = `mysql://${auth}@${host}:${port}/${db}?connection_limit=1&connect_timeout=8`;
const prisma = new PrismaClient({ datasources: { db: { url } } });

const json = (v) =>
  JSON.stringify(v, (_k, val) => (typeof val === "bigint" ? Number(val) : val));

try {
  const ver = await prisma.$queryRawUnsafe(
    "SELECT VERSION() AS version, @@sql_mode AS sql_mode"
  );
  console.log("MYSQL", json(ver));
  const tables = await prisma.$queryRawUnsafe(
    "SHOW TABLES LIKE 'aud_panel_usuarios'"
  );
  console.log("TABLE", json(tables));

  const users = await prisma.$queryRawUnsafe(`
    SELECT u.Usu_Cod, u.Usu_Est, u.Suc_Cod, u.Prs_Cod,
           CHAR_LENGTH(IFNULL(u.Usu_Ced,'')) AS usu_ced_len,
           CHAR_LENGTH(IFNULL(p.Prs_Ced,'')) AS prs_ced_len,
           (REPLACE(IFNULL(u.Usu_Ced,''),' ','') = '22600781') AS usu_exact,
           (REPLACE(IFNULL(p.Prs_Ced,''),' ','') = '22600781') AS prs_exact,
           TRIM(CONCAT(IFNULL(p.Prs_Ape,''), ' ', IFNULL(p.Prs_Nom,''))) AS Nombre,
           s.Suc_Est, s.Emp_Cod, s.Suc_Des,
           (u.Usu_Pal IS NOT NULL AND u.Usu_Pal <> '') AS has_pass,
           CHAR_LENGTH(IFNULL(u.Usu_Pal,'')) AS pass_len
    FROM usuarios u
    INNER JOIN persona p ON p.Prs_Cod = u.Prs_Cod
    LEFT JOIN sucursal s ON s.Suc_Cod = u.Suc_Cod
    WHERE REPLACE(REPLACE(REPLACE(IFNULL(u.Usu_Ced,''),'-',''),' ',''),'.','') LIKE '%22600781%'
       OR REPLACE(REPLACE(REPLACE(IFNULL(p.Prs_Ced,''),'-',''),' ',''),'.','') LIKE '%22600781%'
  `);
  console.log("USERS", json(users));

  const personal = await prisma.$queryRawUnsafe(`
    SELECT per.Per_Cod, per.Per_Est, per.Emp_Cod, per.Prs_Cod,
           TRIM(CONCAT(IFNULL(p.Prs_Ape,''), ' ', IFNULL(p.Prs_Nom,''))) AS Nombre
    FROM personal per
    INNER JOIN persona p ON p.Prs_Cod = per.Prs_Cod
    WHERE per.Emp_Cod = 96
      AND REPLACE(REPLACE(IFNULL(p.Prs_Ced,''),'-',''),' ','') LIKE '%22600781%'
  `);
  console.log("PERSONAL", json(personal));

  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS aud_panel_usuarios (
        Pan_Cod INT NOT NULL AUTO_INCREMENT,
        Usu_Cod INT NOT NULL,
        Per_Cod INT NULL,
        Prs_Cod INT NULL,
        Pan_Nombre VARCHAR(180) NOT NULL,
        Pan_Cedula VARCHAR(20) NULL,
        Pan_Rol VARCHAR(20) NOT NULL DEFAULT 'developer',
        Pan_Est CHAR(1) NOT NULL DEFAULT 'A',
        Pan_Creado DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        Pan_Actualizado DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (Pan_Cod),
        UNIQUE KEY uq_panel_usu (Usu_Cod)
      )
    `);
    console.log("CREATE_IF_EXISTS", "ok");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log("CREATE_IF_EXISTS_ERR", msg.split("\n")[0]);
  }

  try {
    const cols = await prisma.$queryRawUnsafe(`
      SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'aud_panel_usuarios'
      ORDER BY ORDINAL_POSITION
    `);
    console.log("PANEL_COLS", json(cols));
    const panel = await prisma.$queryRawUnsafe(`
      SELECT Pan_Cod, Usu_Cod, Per_Cod, Pan_Rol, Pan_Est, Pan_Nombre,
             (Pan_Cedula = '22600781') AS ced_match
      FROM aud_panel_usuarios
      WHERE Pan_Cedula LIKE '%22600781%'
    `);
    console.log("PANEL_MATCH", json(panel));
    const panelAll = await prisma.$queryRawUnsafe(`
      SELECT Usu_Cod, Pan_Rol, Pan_Est, Pan_Nombre,
             CHAR_LENGTH(IFNULL(Pan_Cedula,'')) AS ced_len
      FROM aud_panel_usuarios
      ORDER BY Pan_Rol, Pan_Nombre
    `);
    console.log("PANEL_ALL", json(panelAll));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log("PANEL_ERR", msg.split("\n")[0]);
  }
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  console.log("ERR", msg.split("\n").slice(0, 6).join(" | "));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
