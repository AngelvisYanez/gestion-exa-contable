require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const fs = require("fs");

const CREATE_CONFIG = fs.readFileSync("prisma/sql/add_aud_dev_telemetria.sql", "utf8");

function buildUrl(host, port, user, pass, db) {
  const auth = pass
    ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}`
    : encodeURIComponent(user);
  return `mysql://${auth}@${host}:${port}/${db}`;
}

async function tryConnect(label, url) {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const ver = await prisma.$queryRawUnsafe(
      "SELECT VERSION() AS v, DATABASE() AS db"
    );
    console.log(JSON.stringify({ label, ok: true, ver: ver[0] }));
    await prisma.$disconnect();
    return true;
  } catch (e) {
    console.log(
      JSON.stringify({
        label,
        ok: false,
        err: String(e.message || e).slice(0, 180),
      })
    );
    await prisma.$disconnect().catch(() => {});
    return false;
  }
}

async function ensureAndVerify(label, url) {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    // Ejecutar statements uno a uno (sin PREPARE complejos si fallan)
    const statements = [
      `CREATE TABLE IF NOT EXISTS aud_dev_monitoreo_config (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS aud_dev_telemetria (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS aud_dev_monitoreo_global (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    ];
    for (const sql of statements) {
      await prisma.$executeRawUnsafe(sql);
    }
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO aud_dev_monitoreo_global (
          Cfg_Cod, Cap_Retencion_Activa, Cap_Retencion_Preset, Cap_Retencion_Dias,
          Cap_Auto_Purga, Cap_Preservar_Asignaciones, Cap_Post_Cierre_Dias
        )
        SELECT 1, 1, '1m', 30, 1, 1, 90
        FROM DUAL
        WHERE NOT EXISTS (SELECT 1 FROM aud_dev_monitoreo_global WHERE Cfg_Cod = 1)`
      );
    } catch (e) {
      /* ignore seed */
    }
    const tables = await prisma.$queryRawUnsafe(
      `SHOW TABLES LIKE 'aud_dev_%'`
    );
    const names = tables.map((r) => Object.values(r)[0]);
    const sel = await prisma.$queryRawUnsafe(
      "SELECT 1 AS ok FROM aud_dev_telemetria LIMIT 1"
    );
    console.log(
      JSON.stringify(
        {
          label,
          ensured: true,
          tables: names,
          selectOk: true,
          selectRows: sel.length,
        },
        null,
        2
      )
    );
  } catch (e) {
    console.log(
      JSON.stringify({
        label,
        ensured: false,
        err: String(e.message || e).slice(0, 300),
      })
    );
  } finally {
    await prisma.$disconnect();
  }
}

(async () => {
  const user = process.env.DATABASE_USER || "root";
  const pass = process.env.DATABASE_PASSWORD || "";
  const host = "199.89.54.243";
  const port = 3306;

  // Probar autenticación (sin loguear password)
  const candidates = [
    { label: "prod-env-creds-exa", user, pass, db: "exa" },
    { label: "prod-root-envpass-exa", user: "root", pass, db: "exa" },
    { label: "prod-root-nopass-exa", user: "root", pass: "", db: "exa" },
  ];

  let working = null;
  for (const c of candidates) {
    const url = buildUrl(host, port, c.user, c.pass, c.db);
    const ok = await tryConnect(c.label, url);
    if (ok) {
      working = c;
      break;
    }
  }

  if (!working) {
    console.log(JSON.stringify({ fatal: "no_auth_to_prod_mysql_3306" }));
    process.exit(2);
  }

  await ensureAndVerify(
    "prod-ensure-exa",
    buildUrl(host, port, working.user, working.pass, "exa")
  );
  await ensureAndVerify(
    "prod-ensure-servicios",
    buildUrl(host, port, working.user, working.pass, "servicios")
  );
})();
