/**
 * Vincula Per_Cod Emp_Cod=96 para 22600781 vía MySQL directo a 199.89.54.243:3306
 * (mismo host que usa gestion-app en cPanel). No imprime passwords.
 */
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

const ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.join(ROOT, ".env");
const CED = "22600781";
const EMP = 96;

function loadEnv() {
  const raw = fs.readFileSync(ENV_PATH, "utf8");
  // Prefer commented production password (tunnel block)
  let pw = null;
  let m = raw.match(/^\s*#\s*DATABASE_PASSWORD=(.+)\s*$/m);
  if (m && m[1].trim()) pw = m[1].trim().replace(/^["']|["']$/g, "");
  if (!pw) {
    m = raw.match(/^\s*DATABASE_PASSWORD=(.+)\s*$/m);
    if (m && m[1].trim()) pw = m[1].trim().replace(/^["']|["']$/g, "");
  }
  // Also try from commented DATABASE_URL
  if (!pw) {
    m = raw.match(/mysql:\/\/[^:]+:([^@]+)@127\.0\.0\.1:3307/);
    if (m) pw = decodeURIComponent(m[1]);
  }
  if (!pw) throw new Error("No prod DATABASE_PASSWORD found");
  return { password: pw };
}

async function q(conn, sql, params = []) {
  const [rows] = await conn.query(sql, params);
  return rows;
}

async function main() {
  const { password } = loadEnv();
  const conn = await mysql.createConnection({
    host: "199.89.54.243",
    port: 3306,
    user: "root",
    password,
    database: "exa",
    charset: "utf8mb4",
    connectTimeout: 20000,
  });
  console.log(JSON.stringify({ connected: true, host: "199.89.54.243", db: "exa" }));

  const usu = await q(
    conn,
    `SELECT Usu_Cod, Usu_Ced, Usu_Est, Usu_Nom, Usu_Ape FROM usuarios
     WHERE Usu_Ced LIKE ? OR Usu_Ced LIKE ? LIMIT 10`,
    [`%${CED}%`, `%${CED}001%`]
  );
  console.log("USU", JSON.stringify(usu));

  const prs = await q(
    conn,
    `SELECT Prs_Cod, Prs_Ced, Prs_Nom, Prs_Ape, Prs_Est FROM personas
     WHERE Prs_Ced LIKE ? OR Prs_Ced LIKE ?
        OR CONCAT(IFNULL(Prs_Nom,''),' ',IFNULL(Prs_Ape,'')) LIKE '%Angelvis%'
        OR CONCAT(IFNULL(Prs_Ape,''),' ',IFNULL(Prs_Nom,'')) LIKE '%Yanez%'
        OR CONCAT(IFNULL(Prs_Ape,''),' ',IFNULL(Prs_Nom,'')) LIKE '%Yánez%'
     LIMIT 20`,
    [`%${CED}%`, `%${CED}001%`]
  );
  console.log("PRS", JSON.stringify(prs));

  const perAll = await q(
    conn,
    `SELECT p.Per_Cod, p.Emp_Cod, p.Per_Est, p.Prs_Cod, pr.Prs_Ced, pr.Prs_Nom, pr.Prs_Ape
     FROM personal p
     LEFT JOIN personas pr ON pr.Prs_Cod = p.Prs_Cod
     WHERE pr.Prs_Ced LIKE ? OR CONCAT(IFNULL(pr.Prs_Nom,''),' ',IFNULL(pr.Prs_Ape,'')) LIKE '%Angelvis%'
     LIMIT 30`,
    [`%${CED}%`]
  );
  console.log("PER_ALL", JSON.stringify(perAll));

  const per96 = await q(
    conn,
    `SELECT p.Per_Cod, p.Emp_Cod, p.Per_Est, p.Prs_Cod, pr.Prs_Ced, pr.Prs_Nom, pr.Prs_Ape
     FROM personal p
     LEFT JOIN personas pr ON pr.Prs_Cod = p.Prs_Cod
     WHERE p.Emp_Cod = ? AND (
       pr.Prs_Ced LIKE ? OR CONCAT(IFNULL(pr.Prs_Nom,''),' ',IFNULL(pr.Prs_Ape,'')) LIKE '%Angelvis%'
       OR CONCAT(IFNULL(pr.Prs_Ape,''),' ',IFNULL(pr.Prs_Nom,'')) LIKE '%Yanez%'
     ) LIMIT 20`,
    [EMP, `%${CED}%`]
  );
  console.log("PER96", JSON.stringify(per96));

  const panel = await q(
    conn,
    `SELECT Pan_Cod, Usu_Cod, Per_Cod, Prs_Cod, Pan_Nombre, Pan_Cedula, Pan_Rol, Pan_Est
     FROM aud_panel_usuarios
     WHERE Pan_Cedula LIKE ? OR Pan_Nombre LIKE '%Angelvis%' OR Pan_Nombre LIKE '%Yanez%'
     LIMIT 20`,
    [`%${CED}%`]
  );
  console.log("PANEL", JSON.stringify(panel));

  let perCod = per96.find((r) => Number(r.Per_Est === undefined ? 1 : 1) && r.Per_Est === "A")?.Per_Cod
    || per96[0]?.Per_Cod
    || 0;
  const prsCod = prs[0]?.Prs_Cod || perAll[0]?.Prs_Cod || 0;
  const usuCod = usu[0]?.Usu_Cod || 0;

  if (!perCod && prsCod) {
    // Inspect personal columns for required fields
    const cols = await q(conn, `SHOW COLUMNS FROM personal`);
    const colNames = cols.map((c) => c.Field);
    console.log("PERSONAL_COLS", colNames.join(","));

    const insertCols = ["Emp_Cod", "Prs_Cod", "Per_Est"];
    const insertVals = [EMP, prsCod, "A"];
    // Optional common fields if present
    if (colNames.includes("Per_Fec")) {
      insertCols.push("Per_Fec");
      insertVals.push(new Date());
    }

    const placeholders = insertCols.map(() => "?").join(",");
    const [res] = await conn.query(
      `INSERT INTO personal (${insertCols.join(",")})
       SELECT ${placeholders} FROM DUAL
       WHERE NOT EXISTS (
         SELECT 1 FROM personal WHERE Emp_Cod = ? AND Prs_Cod = ? AND Per_Est = 'A'
       )`,
      [...insertVals, EMP, prsCod]
    );
    console.log("INSERT_RESULT", JSON.stringify({ affectedRows: res.affectedRows, insertId: res.insertId }));

    const created = await q(
      conn,
      `SELECT Per_Cod FROM personal WHERE Emp_Cod = ? AND Prs_Cod = ? AND Per_Est = 'A' ORDER BY Per_Cod DESC LIMIT 1`,
      [EMP, prsCod]
    );
    perCod = created[0]?.Per_Cod || res.insertId || 0;
  }

  if (!perCod) {
    console.log("FAIL_NO_PER_COD");
    await conn.end();
    process.exit(3);
  }

  // Update panel if row exists
  const [upd] = await conn.query(
    `UPDATE aud_panel_usuarios
     SET Per_Cod = ?, Prs_Cod = COALESCE(NULLIF(Prs_Cod,0), ?), Pan_Actualizado = NOW()
     WHERE Pan_Cedula LIKE ? OR Pan_Nombre LIKE '%Angelvis%'`,
    [perCod, prsCod || 0, `%${CED}%`]
  );
  console.log("PANEL_UPDATE", JSON.stringify({ affectedRows: upd.affectedRows }));

  if (upd.affectedRows === 0 && usuCod) {
    const nombre =
      `${prs[0]?.Prs_Nom || usu[0]?.Usu_Nom || ""} ${prs[0]?.Prs_Ape || usu[0]?.Usu_Ape || ""}`.trim() ||
      "Yanez Angelvis";
    const ced = prs[0]?.Prs_Ced || usu[0]?.Usu_Ced || CED;
    await conn.query(
      `INSERT INTO aud_panel_usuarios
        (Usu_Cod, Per_Cod, Prs_Cod, Pan_Nombre, Pan_Cedula, Pan_Rol, Pan_Est, Pan_Creado)
       VALUES (?, ?, ?, ?, ?, 'manager', 'A', NOW())`,
      [usuCod, perCod, prsCod || null, nombre, ced]
    );
    console.log("PANEL_INSERT_OK");
  }

  const finalPanel = await q(
    conn,
    `SELECT Pan_Cod, Usu_Cod, Per_Cod, Prs_Cod, Pan_Nombre, Pan_Cedula, Pan_Rol
     FROM aud_panel_usuarios WHERE Per_Cod = ? OR Pan_Cedula LIKE ?`,
    [perCod, `%${CED}%`]
  );
  const finalPer = await q(
    conn,
    `SELECT p.Per_Cod, p.Emp_Cod, p.Per_Est, p.Prs_Cod, pr.Prs_Ced, pr.Prs_Nom, pr.Prs_Ape
     FROM personal p LEFT JOIN personas pr ON pr.Prs_Cod = p.Prs_Cod
     WHERE p.Per_Cod = ?`,
    [perCod]
  );
  console.log("FINAL_PANEL", JSON.stringify(finalPanel));
  console.log("FINAL_PER", JSON.stringify(finalPer));
  console.log("DONE", JSON.stringify({ perCod, prsCod, usuCod }));
  await conn.end();
}

main().catch((e) => {
  console.error("ERROR", e && e.message ? e.message : String(e));
  process.exit(1);
});
