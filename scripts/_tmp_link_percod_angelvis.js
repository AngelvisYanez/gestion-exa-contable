/**
 * Diagnostica y vincula Per_Cod Emp_Cod=96 para cedula 22600781 (Angelvis).
 * Via plink SSH root@199.89.54.243 + mysql local. No imprime passwords.
 * Uso: node scripts/_tmp_link_percod_angelvis.js
 */
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.join(ROOT, ".env");
const PLINK = "C:\\Program Files\\PuTTY\\plink.exe";
const HOST = "199.89.54.243";
const KNOWN = path.join(process.env.USERPROFILE || "", ".ssh", "known_hosts");
const CED = "22600781";
const EMP = 96;

function redact(s, pw) {
  return String(s).split(pw).join("***");
}

function loadProdPassword() {
  const raw = fs.readFileSync(ENV_PATH, "utf8");
  let m = raw.match(/^\s*#\s*DATABASE_PASSWORD=(.+)\s*$/m);
  if (m && m[1].trim()) return m[1].trim().replace(/^["']|["']$/g, "");
  m = raw.match(/^\s*DATABASE_PASSWORD=(.+)\s*$/m);
  if (m && m[1].trim()) return m[1].trim().replace(/^["']|["']$/g, "");
  throw new Error("No DATABASE_PASSWORD in .env");
}

function loadHostKey() {
  if (!fs.existsSync(KNOWN)) return null;
  const line = fs
    .readFileSync(KNOWN, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith(HOST + " ssh-rsa "));
  if (!line) return null;
  const parts = line.split(" ");
  return parts[1] + " " + parts[2];
}

function runPlinkMysql(pw, hostkey, sql) {
  return new Promise((resolve, reject) => {
    const args = ["-ssh", "-batch", "-pw", pw];
    if (hostkey) args.push("-hostkey", hostkey);
    args.push(`root@${HOST}`, "mysql --batch --raw --default-character-set=utf8");
    const child = spawn(PLINK, args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => {
      out += d.toString("utf8");
    });
    child.stderr.on("data", (d) => {
      err += d.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        code,
        out: redact(out, pw),
        err: redact(err, pw)
          .split(/\r?\n/)
          .filter((l) => l && !/Store key in cache|Using a password on the command line/i.test(l))
          .join("\n"),
      });
    });
    child.stdin.write(sql);
    child.stdin.end();
    setTimeout(() => {
      try {
        child.kill();
      } catch (_) {}
      reject(new Error("plink timeout"));
    }, 120000);
  });
}

const DIAG = `
USE \`exa\`;
SELECT 'OK' AS ping, DATABASE() AS db, VERSION() AS v;

SELECT 'USU' AS src, Usu_Cod, Usu_Ced, Usu_Est, Usu_Nom, Usu_Ape
FROM usuarios
WHERE Usu_Ced LIKE '%${CED}%' OR Usu_Ced LIKE '%${CED}001%'
LIMIT 10;

SELECT 'PRS' AS src, Prs_Cod, Prs_Ced, Prs_Nom, Prs_Ape, Prs_Est
FROM personas
WHERE Prs_Ced LIKE '%${CED}%' OR Prs_Ced LIKE '%${CED}001%'
   OR CONCAT(IFNULL(Prs_Nom,''),' ',IFNULL(Prs_Ape,'')) LIKE '%Angelvis%'
   OR CONCAT(IFNULL(Prs_Ape,''),' ',IFNULL(Prs_Nom,'')) LIKE '%Yanez%'
   OR CONCAT(IFNULL(Prs_Ape,''),' ',IFNULL(Prs_Nom,'')) LIKE '%Yánez%'
LIMIT 20;

SELECT 'PER_ALL' AS src, p.Per_Cod, p.Emp_Cod, p.Per_Est, p.Prs_Cod, pr.Prs_Ced, pr.Prs_Nom, pr.Prs_Ape
FROM personal p
LEFT JOIN personas pr ON pr.Prs_Cod = p.Prs_Cod
WHERE pr.Prs_Ced LIKE '%${CED}%'
   OR CONCAT(IFNULL(pr.Prs_Nom,''),' ',IFNULL(pr.Prs_Ape,'')) LIKE '%Angelvis%'
LIMIT 30;

SELECT 'PER96' AS src, p.Per_Cod, p.Emp_Cod, p.Per_Est, p.Prs_Cod, pr.Prs_Ced, pr.Prs_Nom, pr.Prs_Ape
FROM personal p
LEFT JOIN personas pr ON pr.Prs_Cod = p.Prs_Cod
WHERE p.Emp_Cod = ${EMP}
  AND (
    pr.Prs_Ced LIKE '%${CED}%'
    OR CONCAT(IFNULL(pr.Prs_Nom,''),' ',IFNULL(pr.Prs_Ape,'')) LIKE '%Angelvis%'
    OR CONCAT(IFNULL(pr.Prs_Ape,''),' ',IFNULL(pr.Prs_Nom,'')) LIKE '%Yanez%'
  )
LIMIT 20;

SELECT 'PANEL' AS src, Pan_Cod, Usu_Cod, Per_Cod, Prs_Cod, Pan_Nombre, Pan_Cedula, Pan_Rol, Pan_Est
FROM aud_panel_usuarios
WHERE Pan_Cedula LIKE '%${CED}%' OR Pan_Nombre LIKE '%Angelvis%' OR Pan_Nombre LIKE '%Yanez%'
LIMIT 20;

SHOW COLUMNS FROM personal;
`;

async function main() {
  if (!fs.existsSync(PLINK)) throw new Error("plink.exe not found");
  const pw = loadProdPassword();
  const hostkey = loadHostKey();
  console.log(JSON.stringify({ host: HOST, hostkey: !!hostkey, pw_len: pw.length }));

  const diag = await runPlinkMysql(pw, hostkey, DIAG);
  console.log("--- DIAG ---");
  console.log(diag.out);
  if (diag.err) console.log("ERR:", diag.err);
  if (diag.code !== 0) process.exit(2);

  // Parse Prs_Cod from PRS rows (tab-separated mysql --batch)
  const lines = diag.out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let prsCod = 0;
  let per96 = 0;
  let usuCod = 0;
  for (let i = 0; i < lines.length; i++) {
    const cols = lines[i].split("\t");
    if (cols[0] === "USU" && cols.length >= 2) {
      const n = Number(cols[1]);
      if (n > 0) usuCod = n;
    }
    if (cols[0] === "PRS" && cols.length >= 2) {
      const n = Number(cols[1]);
      if (n > 0 && !prsCod) prsCod = n;
    }
    if (cols[0] === "PER96" && cols.length >= 2) {
      const n = Number(cols[1]);
      if (n > 0) per96 = n;
    }
  }

  console.log(JSON.stringify({ parsed: { usuCod, prsCod, per96 } }));

  if (per96 > 0) {
    const link = await runPlinkMysql(
      pw,
      hostkey,
      `USE \`exa\`;
UPDATE aud_panel_usuarios
SET Per_Cod = ${per96}, Pan_Actualizado = NOW()
WHERE Pan_Cedula LIKE '%${CED}%' OR Pan_Nombre LIKE '%Angelvis%';
SELECT 'LINKED_EXISTING' AS tag, Pan_Cod, Usu_Cod, Per_Cod, Prs_Cod, Pan_Nombre, Pan_Cedula
FROM aud_panel_usuarios
WHERE Per_Cod = ${per96} OR Pan_Cedula LIKE '%${CED}%';
`
    );
    console.log("--- LINK EXISTING ---");
    console.log(link.out);
    if (link.err) console.log("ERR:", link.err);
    console.log("DONE");
    return;
  }

  if (!prsCod) {
    console.log("NO_PRS_COD: no se puede crear personal sin personas.Prs_Cod");
    process.exit(3);
  }

  // Crear personal Emp 96 si no existe. Campos minimos tipicos EXA.
  const create = await runPlinkMysql(
    pw,
    hostkey,
    `USE \`exa\`;
INSERT INTO personal (Emp_Cod, Prs_Cod, Per_Est)
SELECT ${EMP}, ${prsCod}, 'A'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM personal WHERE Emp_Cod = ${EMP} AND Prs_Cod = ${prsCod} AND Per_Est = 'A'
);
SELECT 'CREATED' AS tag, p.Per_Cod, p.Emp_Cod, p.Per_Est, p.Prs_Cod, pr.Prs_Ced, pr.Prs_Nom, pr.Prs_Ape
FROM personal p
LEFT JOIN personas pr ON pr.Prs_Cod = p.Prs_Cod
WHERE p.Emp_Cod = ${EMP} AND p.Prs_Cod = ${prsCod}
ORDER BY p.Per_Cod DESC
LIMIT 5;
`
  );
  console.log("--- CREATE PERSONAL ---");
  console.log(create.out);
  if (create.err) console.log("ERR:", create.err);
  if (create.code !== 0) process.exit(4);

  let newPer = 0;
  for (const line of create.out.split(/\r?\n/)) {
    const cols = line.split("\t");
    if (cols[0] === "CREATED" && Number(cols[1]) > 0) {
      newPer = Number(cols[1]);
      break;
    }
  }
  if (!newPer) {
    console.log("CREATE_FAILED_NO_PER_COD");
    process.exit(5);
  }

  const link2 = await runPlinkMysql(
    pw,
    hostkey,
    `USE \`exa\`;
UPDATE aud_panel_usuarios
SET Per_Cod = ${newPer}, Prs_Cod = COALESCE(NULLIF(Prs_Cod,0), ${prsCod}), Pan_Actualizado = NOW()
WHERE Pan_Cedula LIKE '%${CED}%' OR Pan_Nombre LIKE '%Angelvis%';

INSERT INTO aud_panel_usuarios (Usu_Cod, Per_Cod, Prs_Cod, Pan_Nombre, Pan_Cedula, Pan_Rol, Pan_Est, Pan_Creado)
SELECT ${usuCod || 0}, ${newPer}, ${prsCod},
       CONCAT(IFNULL(pr.Prs_Nom,''),' ',IFNULL(pr.Prs_Ape,'')),
       pr.Prs_Ced, 'manager', 'A', NOW()
FROM personas pr
WHERE pr.Prs_Cod = ${prsCod}
  AND NOT EXISTS (
    SELECT 1 FROM aud_panel_usuarios WHERE Pan_Cedula LIKE '%${CED}%'
  )
LIMIT 1;

SELECT 'FINAL' AS tag, Pan_Cod, Usu_Cod, Per_Cod, Prs_Cod, Pan_Nombre, Pan_Cedula, Pan_Rol
FROM aud_panel_usuarios
WHERE Per_Cod = ${newPer} OR Pan_Cedula LIKE '%${CED}%';

SELECT 'PER_FINAL' AS tag, p.Per_Cod, p.Emp_Cod, p.Per_Est, p.Prs_Cod, pr.Prs_Ced, pr.Prs_Nom, pr.Prs_Ape
FROM personal p
LEFT JOIN personas pr ON pr.Prs_Cod = p.Prs_Cod
WHERE p.Per_Cod = ${newPer};
`
  );
  console.log("--- LINK NEW ---");
  console.log(link2.out);
  if (link2.err) console.log("ERR:", link2.err);
  console.log("DONE");
}

main().catch((e) => {
  console.error(String(e && e.stack ? e.stack : e));
  process.exit(1);
});
