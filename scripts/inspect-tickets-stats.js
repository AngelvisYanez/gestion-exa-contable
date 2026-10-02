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
    const byEst = await prisma.$queryRawUnsafe(`
      SELECT Tic_Est, COUNT(*) AS c FROM tickets GROUP BY Tic_Est ORDER BY c DESC
    `);
    console.log("BY_EST", json(byEst));

    const byEmp = await prisma.$queryRawUnsafe(`
      SELECT Emp_Cod, COUNT(*) AS c FROM tickets GROUP BY Emp_Cod ORDER BY c DESC LIMIT 15
    `);
    console.log("BY_EMP", json(byEmp));

    const byAse = await prisma.$queryRawUnsafe(`
      SELECT Ase_Cod, COUNT(*) AS c FROM tickets GROUP BY Ase_Cod ORDER BY c DESC LIMIT 20
    `);
    console.log("BY_ASE", json(byAse));

    // Look for asesor / ticket related tables
    const tables = await prisma.$queryRawUnsafe("SHOW TABLES");
    const names = tables.map((r) => Object.values(r)[0]);
    const related = names.filter((n) =>
      /ase|ticket|org_|pcs_|proceso/i.test(String(n))
    );
    console.log("RELATED", json(related));

    for (const t of ["asesores", "asesor", "ticket_asesor", "organizacion", "procesos", "proceso"].filter((x) =>
      names.includes(x)
    )) {
      const cols = await prisma.$queryRawUnsafe(`SHOW COLUMNS FROM \`${t}\``);
      console.log(
        "COLS_" + t,
        cols.map((c) => c.Field).join(", ")
      );
      const sample = await prisma.$queryRawUnsafe(`SELECT * FROM \`${t}\` LIMIT 3`);
      console.log("SAMPLE_" + t, json(sample));
    }

    // Emp 96 tickets?
    const emp96 = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) AS c FROM tickets WHERE Emp_Cod = 96
    `);
    console.log("EMP96", Number(emp96[0].c));

    // Recent open-ish
    const recent = await prisma.$queryRawUnsafe(`
      SELECT Tic_Cod, LEFT(CONVERT(Tic_Des USING utf8mb4), 80) AS Des,
             Tic_Tem, Tic_Est, Emp_Cod, Ase_Cod, Tic_Fec_Cre, Tic_Tel
      FROM tickets
      ORDER BY Tic_Fec_Cre DESC
      LIMIT 10
    `);
    console.log("RECENT", json(recent));
  } catch (e) {
    console.error("ERR", e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
