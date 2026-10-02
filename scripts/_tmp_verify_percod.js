const fs = require("fs");
const { PrismaClient } = require("@prisma/client");
const env = Object.fromEntries(
  fs
    .readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .map((l) => {
      const m = l.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!m) return null;
      let v = m[2].trim().replace(/^["']|["']$/g, "");
      return [m[1], v];
    })
    .filter(Boolean)
);
const url =
  env.DATABASE_URL && !/127\.0\.0\.1/.test(env.DATABASE_URL)
    ? env.DATABASE_URL
    : `mysql://${encodeURIComponent(env.DATABASE_USER || "root")}:${encodeURIComponent(
        env.DATABASE_PASSWORD || ""
      )}@${env.DATABASE_HOST}:${env.DATABASE_PORT}/exa`;
const p = new PrismaClient({ datasources: { db: { url } } });
(async () => {
  const rows = await p.$queryRawUnsafe(
    `SELECT p.Per_Cod, p.Emp_Cod, p.Per_Est, p.Prs_Cod,
            pan.Pan_Cod, pan.Per_Cod AS Pan_Per, pan.Pan_Cedula
     FROM personal p
     LEFT JOIN aud_panel_usuarios pan ON pan.Prs_Cod = p.Prs_Cod
     WHERE p.Prs_Cod = 53102 AND p.Emp_Cod = 96`
  );
  console.log(JSON.stringify(rows, (_k, v) => (typeof v === "bigint" ? Number(v) : v)));
  await p.$disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
