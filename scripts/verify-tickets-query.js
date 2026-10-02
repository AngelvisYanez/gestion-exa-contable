/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

// Quick API smoke against listTickets logic
process.chdir(path.join(__dirname, ".."));

async function main() {
  // dynamic import of compiled isn't available; use prisma raw again
  const { PrismaClient } = require("@prisma/client");
  function loadEnv() {
    const p = path.join(__dirname, "..", ".env");
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      if (!line || line.trim().startsWith("#")) continue;
      const i = line.indexOf("=");
      if (i < 0) continue;
      const k = line.slice(0, i).trim();
      let v = line.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
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
  const prisma = new PrismaClient({
    datasources: { db: { url: `mysql://${auth}@${host}:${port}/${db}` } },
  });

  const kpis = await prisma.$queryRawUnsafe(
    `SELECT CONVERT(Tic_Est USING utf8mb4) AS Tic_Est, COUNT(*) AS c FROM tickets GROUP BY Tic_Est`
  );
  console.log("KPIS", JSON.stringify(kpis, (_k, v) => (typeof v === "bigint" ? Number(v) : v)));

  const rows = await prisma.$queryRawUnsafe(`
    SELECT t.Tic_Cod,
           CONVERT(t.Tic_Tem USING utf8mb4) AS Tic_Tem,
           CONVERT(t.Tic_Est USING utf8mb4) AS Tic_Est,
           CONVERT(e.Emp_Nom USING utf8mb4) AS Emp_Nom,
           CONVERT(CONCAT(IFNULL(pa.Prs_Ape,''), ' ', IFNULL(pa.Prs_Nom,'')) USING utf8mb4) AS Asignado
    FROM tickets t
    LEFT JOIN empresas e ON e.Emp_Cod = t.Emp_Cod
    LEFT JOIN usuarios ua ON ua.Usu_Cod = t.Ase_Cod
    LEFT JOIN persona pa ON pa.Prs_Cod = ua.Prs_Cod
    ORDER BY t.Tic_Fec_Cre DESC
    LIMIT 5
  `);
  console.log("SAMPLE", JSON.stringify(rows, (_k, v) => (typeof v === "bigint" ? Number(v) : v), 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
