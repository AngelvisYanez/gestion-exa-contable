/**
 * Aplica fixes de producción en BD exa vía plink SSH + mysql.
 * Lee password del bloque comentado de producción en .env (no lo imprime).
 * Uso: node scripts/_tmp_prod_apply_fixes.js
 */
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.join(ROOT, ".env");
const PLINK = "C:\\Program Files\\PuTTY\\plink.exe";
const HOST = "199.89.54.243";
const KNOWN = path.join(process.env.USERPROFILE || "", ".ssh", "known_hosts");

function redact(s, pw) {
  return String(s).split(pw).join("***");
}

function loadProdPassword() {
  const raw = fs.readFileSync(ENV_PATH, "utf8");
  // Prefer commented production block
  let m = raw.match(/^\s*#\s*DATABASE_PASSWORD=(.+)\s*$/m);
  if (m && m[1].trim()) return m[1].trim().replace(/^["']|["']$/g, "");
  m = raw.match(/^\s*DATABASE_PASSWORD=(.+)\s*$/m);
  if (m && m[1].trim()) return m[1].trim().replace(/^["']|["']$/g, "");
  throw new Error("No DATABASE_PASSWORD found in .env (active or commented prod block)");
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
    if (hostkey) {
      args.push("-hostkey", hostkey);
    }
    // Remote: OS root → mysql local (socket / sin -p), como scripts/_tmp_apply_monitoreo_prod.ps1
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

const PHASE1_SHOW = `
SELECT 'PHASE1' AS phase, DATABASE() AS db, VERSION() AS v, USER() AS u;
SHOW TABLES;
`;

const PHASE2_BEFORE = `
SELECT 'BEFORE' AS tag, TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA
FROM information_schema.columns
WHERE table_schema = 'exa'
  AND (
    (table_name = 'aud_panel_usuarios' AND column_name IN ('Pan_Creado','Pan_Actualizado','Per_Cod'))
    OR (table_name = 'aud_incidencias' AND column_name IN ('Inc_Primera_Vez','Inc_Ultima_Vez'))
    OR (table_name = 'aud_dev_monitoreo_global' AND column_name IN ('Cfg_Actualizado'))
  )
ORDER BY table_name, column_name;

SELECT 'EXISTS' AS tag, table_name
FROM information_schema.tables
WHERE table_schema = 'exa'
  AND table_name IN (
    'aud_panel_usuarios','aud_dev_telemetria','aud_incidencias',
    'aud_dev_monitoreo_global','aud_dev_monitoreo_config'
  );
`;

const PHASE3_ALTERS = `
-- 1) panel usuarios datetime
CREATE TABLE IF NOT EXISTS aud_panel_usuarios (
  Pan_Cod INT NOT NULL AUTO_INCREMENT,
  Usu_Cod INT NOT NULL,
  Per_Cod INT NULL,
  Prs_Cod INT NULL,
  Pan_Nombre VARCHAR(180) NOT NULL,
  Pan_Cedula VARCHAR(20) NULL,
  Pan_Rol VARCHAR(20) NOT NULL DEFAULT 'developer',
  Pan_Est CHAR(1) NOT NULL DEFAULT 'A',
  Pan_Creado DATETIME NULL DEFAULT NULL,
  Pan_Actualizado DATETIME NULL DEFAULT NULL,
  PRIMARY KEY (Pan_Cod),
  UNIQUE KEY uq_panel_usu (Usu_Cod),
  KEY idx_panel_est_rol (Pan_Est, Pan_Rol),
  KEY idx_panel_per (Per_Cod),
  KEY idx_panel_prs (Prs_Cod)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE aud_panel_usuarios
  MODIFY Pan_Creado DATETIME NULL DEFAULT NULL,
  MODIFY Pan_Actualizado DATETIME NULL DEFAULT NULL;

-- 3) telemetria + config + global (IF NOT EXISTS; no romper si ya existe)
CREATE TABLE IF NOT EXISTS aud_dev_monitoreo_config (
  Per_Cod INT NOT NULL,
  Mon_Activo TINYINT NOT NULL DEFAULT 0,
  Mon_Intervalo_Minutos INT NOT NULL DEFAULT 5,
  Mon_Captura_Pantalla TINYINT NOT NULL DEFAULT 1,
  Mon_Forzar_Bandeja TINYINT NOT NULL DEFAULT 1,
  Mon_Permitir_Salir TINYINT NOT NULL DEFAULT 0,
  Mon_Horario_Activo TINYINT NOT NULL DEFAULT 0,
  Mon_Hora_Inicio VARCHAR(5) NOT NULL DEFAULT '08:00',
  Mon_Hora_Fin VARCHAR(5) NOT NULL DEFAULT '17:00',
  Mon_Dias_Laborales VARCHAR(20) NOT NULL DEFAULT '1,2,3,4,5',
  Mon_Almuerzo_Activo TINYINT NOT NULL DEFAULT 0,
  Mon_Almuerzo_Inicio VARCHAR(5) NOT NULL DEFAULT '13:00',
  Mon_Almuerzo_Fin VARCHAR(5) NOT NULL DEFAULT '14:00',
  Mon_Ultima_Actualizacion DATETIME NULL,
  Mon_Ultima_Conexion DATETIME NULL,
  Mon_Ventana_Activa VARCHAR(255) NULL,
  Mon_Proceso_Activo VARCHAR(100) NULL,
  Mon_Es_IDE TINYINT NULL DEFAULT 0,
  Mon_Version_Agente VARCHAR(20) NULL,
  Mon_Mac_Address VARCHAR(32) NULL,
  PRIMARY KEY (Per_Cod)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS aud_dev_telemetria (
  Tel_Cod INT NOT NULL AUTO_INCREMENT,
  Per_Cod INT NOT NULL,
  Tar_Cod INT NULL,
  Tic_Cod INT NULL,
  Tel_Fecha_Hora DATETIME NOT NULL,
  Tel_Clicks INT NOT NULL DEFAULT 0,
  Tel_Teclas INT NOT NULL DEFAULT 0,
  Tel_Segundos_Activos INT NOT NULL DEFAULT 0,
  Tel_Porc_Actividad DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  Tel_Ventana_Activa VARCHAR(255) NULL,
  Tel_Proceso_Activo VARCHAR(100) NULL,
  Tel_Es_IDE TINYINT NOT NULL DEFAULT 0,
  Tel_Lineas_Estimadas INT NOT NULL DEFAULT 0,
  Tel_Captura_Ruta VARCHAR(255) NULL,
  Tel_Estado VARCHAR(20) NOT NULL DEFAULT 'OK',
  Tel_Mac_Address VARCHAR(32) NULL,
  PRIMARY KEY (Tel_Cod),
  KEY idx_per_fecha (Per_Cod, Tel_Fecha_Hora),
  KEY idx_tar (Tar_Cod),
  KEY idx_tel_tic (Tic_Cod),
  KEY idx_tel_fecha (Tel_Fecha_Hora)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS aud_dev_monitoreo_global (
  Cfg_Cod INT NOT NULL PRIMARY KEY DEFAULT 1,
  Cap_Retencion_Activa TINYINT NOT NULL DEFAULT 1,
  Cap_Retencion_Preset VARCHAR(20) NOT NULL DEFAULT '1m',
  Cap_Retencion_Dias INT NOT NULL DEFAULT 30,
  Cap_Auto_Purga TINYINT NOT NULL DEFAULT 1,
  Cap_Preservar_Asignaciones TINYINT NOT NULL DEFAULT 1,
  Cap_Post_Cierre_Dias INT NOT NULL DEFAULT 90,
  Cap_Ultima_Purga DATETIME NULL,
  Cap_Ultimo_Resultado VARCHAR(255) NULL,
  Cfg_Actualizado DATETIME NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE aud_dev_monitoreo_global
  MODIFY Cfg_Actualizado DATETIME NULL DEFAULT NULL;

INSERT INTO aud_dev_monitoreo_global (
  Cfg_Cod, Cap_Retencion_Activa, Cap_Retencion_Preset, Cap_Retencion_Dias,
  Cap_Auto_Purga, Cap_Preservar_Asignaciones, Cap_Post_Cierre_Dias
)
SELECT 1, 1, '1m', 30, 1, 1, 90
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM aud_dev_monitoreo_global WHERE Cfg_Cod = 1);

-- Tic_Cod if missing on existing telemetria (other agent may have created table)
SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'exa' AND table_name = 'aud_dev_telemetria' AND column_name = 'Tic_Cod');
SET @s := IF(@c = 0, 'ALTER TABLE aud_dev_telemetria ADD COLUMN Tic_Cod INT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = 'exa' AND table_name = 'aud_dev_telemetria' AND index_name = 'idx_tel_tic');
SET @s := IF(@c = 0, 'CREATE INDEX idx_tel_tic ON aud_dev_telemetria (Tic_Cod)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4) incidencias
CREATE TABLE IF NOT EXISTS aud_incidencias (
  Inc_Cod INT NOT NULL AUTO_INCREMENT,
  Inc_Fingerprint VARCHAR(64) NOT NULL,
  Inc_Nivel VARCHAR(20) NOT NULL DEFAULT 'Error',
  Inc_Titulo VARCHAR(255) NOT NULL,
  Inc_Mensaje TEXT NULL,
  Inc_Archivo VARCHAR(500) NULL,
  Inc_Linea INT NULL,
  Inc_Primera_Vez DATETIME NULL DEFAULT NULL,
  Inc_Ultima_Vez DATETIME NULL DEFAULT NULL,
  Inc_Ocurrencias INT NOT NULL DEFAULT 1,
  Inc_Estado VARCHAR(40) NOT NULL DEFAULT 'Nueva',
  Tar_Cod INT NULL,
  Usu_Creador INT NULL,
  Inc_Fuente VARCHAR(255) NULL,
  Inc_Est CHAR(1) NOT NULL DEFAULT 'A',
  PRIMARY KEY (Inc_Cod),
  UNIQUE KEY uq_aud_inc_fp (Inc_Fingerprint),
  KEY idx_aud_inc_estado_est (Inc_Estado, Inc_Est),
  KEY idx_aud_inc_ultima (Inc_Ultima_Vez),
  KEY idx_aud_inc_tar (Tar_Cod),
  KEY idx_aud_inc_nivel (Inc_Nivel)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE aud_incidencias
  MODIFY Inc_Primera_Vez DATETIME NULL DEFAULT NULL,
  MODIFY Inc_Ultima_Vez DATETIME NULL DEFAULT NULL;

SELECT 'ALTERS_DONE' AS phase;
`;

const PHASE4_ANGELVIS = `
SELECT 'PANEL' AS src, Pan_Cod, Usu_Cod, Per_Cod, Prs_Cod, Pan_Nombre, Pan_Cedula, Pan_Rol, Pan_Est
FROM aud_panel_usuarios
WHERE Pan_Cedula LIKE '%22600781%'
   OR Pan_Nombre LIKE '%Angelvis%'
   OR Pan_Nombre LIKE '%Yanez%'
   OR Pan_Nombre LIKE '%Yánez%'
LIMIT 20;

SELECT 'USU' AS src, Usu_Cod, Usu_Ced, Usu_Est
FROM usuarios
WHERE Usu_Ced LIKE '%22600781%'
LIMIT 10;

SELECT 'PER' AS src, p.Per_Cod, p.Emp_Cod, p.Per_Est, pr.Prs_Cod, pr.Prs_Nom, pr.Prs_Ape, pr.Prs_Ced
FROM personal p
LEFT JOIN personas pr ON pr.Prs_Cod = p.Prs_Cod
WHERE p.Emp_Cod = 96
  AND (
    pr.Prs_Ced LIKE '%22600781%'
    OR CONCAT(IFNULL(pr.Prs_Nom,''),' ',IFNULL(pr.Prs_Ape,'')) LIKE '%Angelvis%'
    OR CONCAT(IFNULL(pr.Prs_Nom,''),' ',IFNULL(pr.Prs_Ape,'')) LIKE '%Yanez%'
    OR CONCAT(IFNULL(pr.Prs_Ape,''),' ',IFNULL(pr.Prs_Nom,'')) LIKE '%Yanez%'
    OR CONCAT(IFNULL(pr.Prs_Nom,''),' ',IFNULL(pr.Prs_Ape,'')) LIKE '%Yánez%'
  )
LIMIT 20;
`;

const PHASE5_AFTER = `
SELECT 'AFTER' AS tag, TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA
FROM information_schema.columns
WHERE table_schema = 'exa'
  AND (
    (table_name = 'aud_panel_usuarios' AND column_name IN ('Pan_Creado','Pan_Actualizado','Per_Cod'))
    OR (table_name = 'aud_incidencias' AND column_name IN ('Inc_Primera_Vez','Inc_Ultima_Vez'))
    OR (table_name = 'aud_dev_monitoreo_global' AND column_name IN ('Cfg_Actualizado'))
    OR (table_name = 'aud_dev_telemetria' AND column_name IN ('Tel_Cod','Tic_Cod','Per_Cod'))
  )
ORDER BY table_name, column_name;

SELECT 'TEL_COUNT' AS tag, COUNT(*) AS n FROM aud_dev_telemetria;
SELECT 'CFG_COUNT' AS tag, COUNT(*) AS n FROM aud_dev_monitoreo_config;
SELECT 'GLO_COUNT' AS tag, COUNT(*) AS n FROM aud_dev_monitoreo_global;
`;

async function main() {
  if (!fs.existsSync(PLINK)) throw new Error("plink.exe not found");
  const pw = loadProdPassword();
  console.log(JSON.stringify({ pw_len: pw.length, host: HOST }));
  const hostkey = loadHostKey();
  console.log(JSON.stringify({ hostkey_loaded: !!hostkey }));

  // Ping SSH first
  const ping = await runPlinkMysql(pw, hostkey, "SELECT 'SSH_MYSQL_OK' AS ok, DATABASE() AS db;\n");
  console.log(JSON.stringify({ ping_code: ping.code, ping_out: ping.out.slice(0, 500), ping_err: ping.err.slice(0, 500) }));
  if (ping.code !== 0) process.exit(2);

  const show = await runPlinkMysql(
    pw,
    hostkey,
    "USE `exa`;\n" + PHASE1_SHOW + PHASE2_BEFORE
  );
  console.log("--- SHOW/BEFORE ---");
  console.log(show.out);
  if (show.err) console.log("ERR:", show.err);
  if (show.code !== 0) process.exit(3);

  const alters = await runPlinkMysql(pw, hostkey, "USE `exa`;\n" + PHASE3_ALTERS);
  console.log("--- ALTERS ---");
  console.log(alters.out);
  if (alters.err) console.log("ERR:", alters.err);
  if (alters.code !== 0) process.exit(4);

  const angel = await runPlinkMysql(pw, hostkey, "USE `exa`;\n" + PHASE4_ANGELVIS);
  console.log("--- ANGELVIS ---");
  console.log(angel.out);
  if (angel.err) console.log("ERR:", angel.err);

  const after = await runPlinkMysql(pw, hostkey, "USE `exa`;\n" + PHASE5_AFTER);
  console.log("--- AFTER ---");
  console.log(after.out);
  if (after.err) console.log("ERR:", after.err);

  console.log("DONE_PHASE_DB");
}

main().catch((e) => {
  console.error(String(e && e.stack ? e.stack : e));
  process.exit(1);
});
