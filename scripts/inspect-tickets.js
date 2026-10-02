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
    console.log(`Connecting ${db}@${host}:${port} as ${user}`);
    const tables = await prisma.$queryRawUnsafe("SHOW TABLES");
    const names = tables.map((r) => Object.values(r)[0]);
    const tickish = names.filter((n) =>
      /tick|tic_|soporte|helpdesk|incidencia|reclamo|caso|bandeja/i.test(String(n))
    );
    console.log("TICKISH_TABLES", json(tickish));

    const has = names.includes("aud_tickets");
    console.log("HAS_aud_tickets", has);

    if (!has) {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS aud_tickets (
          Tic_Cod INT NOT NULL AUTO_INCREMENT,
          Tic_Titulo VARCHAR(255) NOT NULL,
          Tic_Descripcion TEXT NULL,
          Tic_Prioridad VARCHAR(20) NOT NULL DEFAULT 'Media',
          Tic_Estado VARCHAR(40) NOT NULL DEFAULT 'Nuevo',
          Tic_Origen VARCHAR(40) NOT NULL DEFAULT 'Manual',
          Per_Cod_Asignado INT NULL,
          Tar_Cod INT NULL,
          Emp_Cod INT NULL,
          Usu_Creador INT NULL,
          Tic_Fecha_Llegada DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          Tic_Fecha_Asignacion DATETIME NULL,
          Tic_Est CHAR(1) NOT NULL DEFAULT 'A',
          PRIMARY KEY (Tic_Cod),
          KEY idx_tic_estado (Tic_Estado),
          KEY idx_tic_asig (Per_Cod_Asignado),
          KEY idx_tic_emp (Emp_Cod)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      console.log("CREATED_aud_tickets");
    }

    const cntRows = await prisma.$queryRawUnsafe(
      "SELECT COUNT(*) AS c FROM aud_tickets WHERE Tic_Est = 'A'"
    );
    const active = Number(cntRows[0].c);
    console.log("ACTIVE_COUNT", active);

    const rows = await prisma.$queryRawUnsafe(`
      SELECT Tic_Cod, Tic_Titulo, Tic_Estado, Tic_Prioridad, Tic_Origen,
             Per_Cod_Asignado, Tar_Cod, Emp_Cod, Tic_Fecha_Llegada, Tic_Est
      FROM aud_tickets
      ORDER BY Tic_Cod DESC
      LIMIT 50
    `);
    console.log("ROWS", json(rows));

    // Also dump any other tickish table sample counts
    for (const t of tickish.filter((x) => x !== "aud_tickets").slice(0, 8)) {
      try {
        const c = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM \`${t}\``);
        console.log(`OTHER_${t}_COUNT`, Number(c[0].c));
      } catch (e) {
        console.log(`OTHER_${t}_ERR`, e.message);
      }
    }
  } catch (e) {
    console.error("ERR", e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
