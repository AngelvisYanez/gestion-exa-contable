const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

function loadEnv(file) {
  const p = path.resolve(process.cwd(), file);
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

loadEnv(".env");

async function main() {
  const url = process.env.DATABASE_URL || "mysql://root@127.0.0.1:3306/exa";
  const p = new PrismaClient({ datasources: { db: { url } } });
  try {
    const pan = await p.$queryRawUnsafe(
      `SELECT Pan_Nombre, Pan_Cedula, Pan_Rol, Pan_Est FROM aud_panel_usuarios WHERE Pan_Est='A' LIMIT 15`
    );
    console.log("PANEL", JSON.stringify(pan, null, 2));

    const tareas = await p.$queryRawUnsafe(
      `SELECT t.Tar_Cod, CONVERT(t.Tar_Titulo USING utf8mb4) AS Tar_Titulo, CONVERT(t.Tar_Estado USING utf8mb4) AS Tar_Estado
       FROM aud_tareas t
       WHERE t.Tar_Est='A'
       ORDER BY t.Tar_Cod DESC
       LIMIT 5`
    );
    console.log("TAREAS", JSON.stringify(tareas, null, 2));
  } finally {
    await p.$disconnect();
  }
}

main().catch((e) => {
  console.error("FAIL", e.message);
  process.exit(1);
});
