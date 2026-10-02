/**
 * Aplica ensureMonitoreoSchema y verifica aud_dev_telemetria.
 * Uso: node scripts/ensure-aud-dev-telemetria.js [3306|3307]
 */
require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const path = require("path");

// Cargar ensure desde TS compilado no está; duplicamos DDL mínimo vía raw SQL
const CREATE_CONFIG = `
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;

const CREATE_TEL = `
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;

const CREATE_GLOBAL = `
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;

function buildUrl(host, port, user, pass, db) {
  const auth = pass
    ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}`
    : encodeURIComponent(user);
  return `mysql://${auth}@${host}:${port}/${db}`;
}

async function ensureDb(label, url) {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    await prisma.$executeRawUnsafe(CREATE_CONFIG);
    await prisma.$executeRawUnsafe(CREATE_TEL);
    await prisma.$executeRawUnsafe(CREATE_GLOBAL);
    const tables = await prisma.$queryRawUnsafe(
      `SHOW TABLES LIKE 'aud_dev_%'`
    );
    const names = tables.map((r) => Object.values(r)[0]);
    let sel = null;
    if (names.includes("aud_dev_telemetria")) {
      sel = await prisma.$queryRawUnsafe(
        "SELECT 1 AS ok FROM aud_dev_telemetria LIMIT 1"
      );
    }
    console.log(
      JSON.stringify(
        {
          label,
          ok: true,
          tables: names,
          selectOk: Array.isArray(sel),
          selectRows: Array.isArray(sel) ? sel.length : 0,
        },
        null,
        2
      )
    );
  } catch (e) {
    console.log(
      JSON.stringify({
        label,
        ok: false,
        err: String(e.message || e).slice(0, 300),
      })
    );
  } finally {
    await prisma.$disconnect();
  }
}

(async () => {
  const user = process.env.DATABASE_USER || "root";
  const passEnv = process.env.DATABASE_PASSWORD || "";
  const host = "127.0.0.1";
  const portArg = process.argv[2];

  // Local 3306: probar sin password y con password del .env
  const localAttempts = [
    { label: "local-3306-nopass-exa", url: buildUrl(host, 3306, "root", "", "exa") },
    { label: "local-3306-envpass-exa", url: buildUrl(host, 3306, user, passEnv, "exa") },
    {
      label: "local-3306-nopass-servicios",
      url: buildUrl(host, 3306, "root", "", "servicios"),
    },
  ];

  for (const a of localAttempts) {
    await ensureDb(a.label, a.url);
  }

  // Túnel 3307 con credenciales .env
  if (!portArg || portArg === "3307") {
    await ensureDb(
      "tunnel-3307-exa",
      buildUrl(host, 3307, user, passEnv, "exa")
    );
    await ensureDb(
      "tunnel-3307-servicios",
      buildUrl(host, 3307, user, passEnv, "servicios")
    );
  }

  console.log("SQL_FALLBACK", path.join("prisma", "sql", "add_aud_dev_telemetria.sql"));
})();
