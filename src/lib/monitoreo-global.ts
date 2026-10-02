import type { PrismaClient } from "@prisma/client";
import {
  captureRelKey,
  getCapturesDiskStats,
  purgeCaptureFilesRespectingProtected,
  type CapturesDiskStats,
  type PurgeCapturesResult,
} from "./captures";
import { getPrisma } from "./db";
import {
  CAPTURA_RETENCION_DEFAULT_DIAS,
  CAPTURA_RETENCION_DEFAULT_PRESET,
  CAPTURA_RETENCION_DIAS_MAX,
  CAPTURA_RETENCION_DIAS_MIN,
  CAPTURA_RETENCION_PRESETS,
  type CapturaRetencionPreset,
} from "./domain-constants";
import { startOfDayZona } from "./timezone";

export type MonitoreoGlobalConfig = {
  Cap_Retencion_Activa: number;
  Cap_Retencion_Preset: CapturaRetencionPreset;
  Cap_Retencion_Dias: number;
  Cap_Auto_Purga: number;
  /** Conservar screenshots de tareas/tickets para historial admin */
  Cap_Preservar_Asignaciones: number;
  /** 0 = indefinido tras cierre; >0 = días adicionales tras finalizar/cerrar */
  Cap_Post_Cierre_Dias: number;
  Cap_Ultima_Purga: string | null;
  Cap_Ultimo_Resultado: string | null;
  Cfg_Actualizado: string | null;
};

const PRESET_IDS = new Set(CAPTURA_RETENCION_PRESETS.map((p) => p.id));

function resolveDias(preset: CapturaRetencionPreset, customDias: number): number {
  const found = CAPTURA_RETENCION_PRESETS.find((p) => p.id === preset);
  if (found && found.dias != null) return found.dias;
  return Math.max(
    CAPTURA_RETENCION_DIAS_MIN,
    Math.min(CAPTURA_RETENCION_DIAS_MAX, Math.floor(customDias) || CAPTURA_RETENCION_DEFAULT_DIAS)
  );
}

function normalizePreset(raw: string | null | undefined): CapturaRetencionPreset {
  const v = String(raw || CAPTURA_RETENCION_DEFAULT_PRESET);
  return PRESET_IDS.has(v as CapturaRetencionPreset)
    ? (v as CapturaRetencionPreset)
    : CAPTURA_RETENCION_DEFAULT_PRESET;
}

function isoOrNull(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// MySQL 5.5: DATETIME sin CURRENT_TIMESTAMP / ON UPDATE (error 1294).
const CREATE_GLOBAL_SQL = `
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

/** Presencia / config del agente (hermana de telemetría). */
const CREATE_CONFIG_SQL = `
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

const CREATE_TELEMETRIA_SQL = `
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

const ALTER_DATETIME_SQL = `
ALTER TABLE aud_dev_monitoreo_global
  MODIFY Cfg_Actualizado DATETIME NULL DEFAULT NULL
`;

async function ensureColumn(
  prisma: PrismaClient,
  table: string,
  column: string,
  alterSql: string
) {
  const rows = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT COUNT(*) AS n FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    table,
    column
  );
  if (Number(rows[0]?.n || 0) === 0) {
    await prisma.$executeRawUnsafe(alterSql);
  }
}

const schemaReady = new Set<string>();

export async function ensureMonitoreoSchema(prisma: PrismaClient) {
  // Evita martillar information_schema en cada telemetría / request.
  // v3: CREATE telemetria + config (antes solo global; caché vieja saltaba el CREATE).
  const key = `${(prisma as { _exaDbKey?: string })._exaDbKey || "default"}:v4-tel`;
  if (schemaReady.has(key)) return;

  await prisma.$executeRawUnsafe(CREATE_CONFIG_SQL);
  await prisma.$executeRawUnsafe(CREATE_TELEMETRIA_SQL);
  await prisma.$executeRawUnsafe(CREATE_GLOBAL_SQL);
  try {
    await prisma.$executeRawUnsafe(ALTER_DATETIME_SQL);
  } catch {
    /* columna puede no existir aún / ya normalizada */
  }
  await ensureColumn(
    prisma,
    "aud_dev_monitoreo_global",
    "Cap_Preservar_Asignaciones",
    "ALTER TABLE aud_dev_monitoreo_global ADD COLUMN Cap_Preservar_Asignaciones TINYINT NOT NULL DEFAULT 1"
  );
  await ensureColumn(
    prisma,
    "aud_dev_monitoreo_global",
    "Cap_Post_Cierre_Dias",
    "ALTER TABLE aud_dev_monitoreo_global ADD COLUMN Cap_Post_Cierre_Dias INT NOT NULL DEFAULT 90"
  );
  await ensureColumn(
    prisma,
    "aud_dev_telemetria",
    "Tic_Cod",
    "ALTER TABLE aud_dev_telemetria ADD COLUMN Tic_Cod INT NULL"
  );
  const idx = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT COUNT(*) AS n FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = 'aud_dev_telemetria'
       AND index_name = 'idx_tel_tic'`
  );
  if (Number(idx[0]?.n || 0) === 0) {
    try {
      await prisma.$executeRawUnsafe(
        `CREATE INDEX idx_tel_tic ON aud_dev_telemetria (Tic_Cod)`
      );
    } catch {
      /* carrera / ya existe */
    }
  }
  await prisma.$executeRawUnsafe(
    `INSERT INTO aud_dev_monitoreo_global (
      Cfg_Cod, Cap_Retencion_Activa, Cap_Retencion_Preset, Cap_Retencion_Dias,
      Cap_Auto_Purga, Cap_Preservar_Asignaciones, Cap_Post_Cierre_Dias
    )
    SELECT 1, 1, ?, ?, 1, 1, 90
    FROM DUAL
    WHERE NOT EXISTS (SELECT 1 FROM aud_dev_monitoreo_global WHERE Cfg_Cod = 1)`,
    CAPTURA_RETENCION_DEFAULT_PRESET,
    CAPTURA_RETENCION_DEFAULT_DIAS
  );

  schemaReady.add(key);
}

type GlobalRow = {
  Cap_Retencion_Activa: number | null;
  Cap_Retencion_Preset: string | null;
  Cap_Retencion_Dias: number | null;
  Cap_Auto_Purga: number | null;
  Cap_Preservar_Asignaciones: number | null;
  Cap_Post_Cierre_Dias: number | null;
  Cap_Ultima_Purga: Date | string | null;
  Cap_Ultimo_Resultado: string | null;
  Cfg_Actualizado: Date | string | null;
};

function mapRow(row: GlobalRow | undefined): MonitoreoGlobalConfig {
  const preset = normalizePreset(row?.Cap_Retencion_Preset);
  const custom = Number(row?.Cap_Retencion_Dias ?? CAPTURA_RETENCION_DEFAULT_DIAS);
  return {
    Cap_Retencion_Activa: Number(row?.Cap_Retencion_Activa ?? 1) ? 1 : 0,
    Cap_Retencion_Preset: preset,
    Cap_Retencion_Dias: resolveDias(preset, custom),
    Cap_Auto_Purga: Number(row?.Cap_Auto_Purga ?? 1) ? 1 : 0,
    Cap_Preservar_Asignaciones: Number(row?.Cap_Preservar_Asignaciones ?? 1) ? 1 : 0,
    Cap_Post_Cierre_Dias: Math.max(0, Math.min(730, Number(row?.Cap_Post_Cierre_Dias ?? 90))),
    Cap_Ultima_Purga: isoOrNull(row?.Cap_Ultima_Purga),
    Cap_Ultimo_Resultado: row?.Cap_Ultimo_Resultado || null,
    Cfg_Actualizado: isoOrNull(row?.Cfg_Actualizado),
  };
}

export async function getMonitoreoGlobal(dbDis: string): Promise<MonitoreoGlobalConfig> {
  const prisma = getPrisma(dbDis);
  await ensureMonitoreoSchema(prisma);
  const rows = await prisma.$queryRawUnsafe<GlobalRow[]>(
    `SELECT Cap_Retencion_Activa, Cap_Retencion_Preset, Cap_Retencion_Dias,
            Cap_Auto_Purga, Cap_Preservar_Asignaciones, Cap_Post_Cierre_Dias,
            Cap_Ultima_Purga, Cap_Ultimo_Resultado, Cfg_Actualizado
     FROM aud_dev_monitoreo_global WHERE Cfg_Cod = 1 LIMIT 1`
  );
  return mapRow(rows[0]);
}

export async function setMonitoreoGlobal(
  dbDis: string,
  patch: {
    activa?: number;
    preset?: string;
    dias?: number;
    autoPurga?: number;
    preservarAsignaciones?: number;
    postCierreDias?: number;
  }
): Promise<MonitoreoGlobalConfig> {
  const prisma = getPrisma(dbDis);
  await ensureMonitoreoSchema(prisma);
  const current = await getMonitoreoGlobal(dbDis);

  const preset = normalizePreset(patch.preset ?? current.Cap_Retencion_Preset);
  const dias = resolveDias(preset, patch.dias ?? current.Cap_Retencion_Dias);
  const activa =
    patch.activa != null ? (patch.activa ? 1 : 0) : current.Cap_Retencion_Activa;
  const autoPurga =
    patch.autoPurga != null ? (patch.autoPurga ? 1 : 0) : current.Cap_Auto_Purga;
  const preservar =
    patch.preservarAsignaciones != null
      ? patch.preservarAsignaciones
        ? 1
        : 0
      : current.Cap_Preservar_Asignaciones;
  const postCierre =
    patch.postCierreDias != null
      ? Math.max(0, Math.min(730, Math.floor(patch.postCierreDias)))
      : current.Cap_Post_Cierre_Dias;

  await prisma.$executeRawUnsafe(
    `UPDATE aud_dev_monitoreo_global
     SET Cap_Retencion_Activa = ?,
         Cap_Retencion_Preset = ?,
         Cap_Retencion_Dias = ?,
         Cap_Auto_Purga = ?,
         Cap_Preservar_Asignaciones = ?,
         Cap_Post_Cierre_Dias = ?,
         Cfg_Actualizado = NOW()
     WHERE Cfg_Cod = 1`,
    activa,
    preset,
    dias,
    autoPurga,
    preservar,
    postCierre
  );

  return getMonitoreoGlobal(dbDis);
}

/** Rutas protegidas: capturas ligadas a tarea/ticket aún vigentes para auditoría. */
async function loadProtectedCaptureKeys(
  prisma: PrismaClient,
  cfg: MonitoreoGlobalConfig
): Promise<Set<string>> {
  const protectedKeys = new Set<string>();
  if (!cfg.Cap_Preservar_Asignaciones) return protectedKeys;

  const post = cfg.Cap_Post_Cierre_Dias;
  const rows =
    post === 0
      ? await prisma.$queryRawUnsafe<Array<{ Tel_Captura_Ruta: string }>>(
          `SELECT DISTINCT Tel_Captura_Ruta
           FROM aud_dev_telemetria
           WHERE Tel_Captura_Ruta IS NOT NULL AND Tel_Captura_Ruta <> ''
             AND (Tar_Cod IS NOT NULL OR Tic_Cod IS NOT NULL)`
        )
      : await prisma.$queryRawUnsafe<Array<{ Tel_Captura_Ruta: string }>>(
          `SELECT DISTINCT t.Tel_Captura_Ruta
           FROM aud_dev_telemetria t
           LEFT JOIN aud_tareas tar ON tar.Tar_Cod = t.Tar_Cod
           LEFT JOIN tickets tk ON tk.Tic_Cod = t.Tic_Cod
           WHERE t.Tel_Captura_Ruta IS NOT NULL AND t.Tel_Captura_Ruta <> ''
             AND (
               (
                 t.Tar_Cod IS NOT NULL AND (
                   tar.Tar_Cod IS NULL
                   OR IFNULL(tar.Tar_Estado,'') <> 'Finalizada'
                   OR tar.Tar_Fecha_Culminacion IS NULL
                   OR tar.Tar_Fecha_Culminacion >= DATE_SUB(NOW(), INTERVAL ? DAY)
                 )
               )
               OR (
                 t.Tic_Cod IS NOT NULL AND (
                   tk.Tic_Cod IS NULL
                   OR IFNULL(tk.Tic_Est,'0') <> '3'
                   OR tk.Tic_Fec_Ter IS NULL
                   OR tk.Tic_Fec_Ter >= DATE_SUB(NOW(), INTERVAL ? DAY)
                 )
               )
             )`,
          post,
          post
        );

  for (const r of rows) {
    const key = captureRelKey(r.Tel_Captura_Ruta);
    if (key) protectedKeys.add(key);
  }
  return protectedKeys;
}

async function clearOrphanTelemetryPaths(
  prisma: PrismaClient,
  cutoffDate: string,
  cfg: MonitoreoGlobalConfig
): Promise<number> {
  const cutoff = startOfDayZona(cutoffDate);
  if (!cfg.Cap_Preservar_Asignaciones) {
    const result = await prisma.$executeRawUnsafe(
      `UPDATE aud_dev_telemetria
       SET Tel_Captura_Ruta = NULL
       WHERE Tel_Captura_Ruta IS NOT NULL AND Tel_Captura_Ruta <> ''
         AND Tel_Fecha_Hora < ?`,
      cutoff
    );
    return typeof result === "number" ? result : 0;
  }

  const post = cfg.Cap_Post_Cierre_Dias;
  // Solo limpia rutas de huérfanas (sin asignación) o asignaciones ya vencidas post-cierre
  const result =
    post === 0
      ? await prisma.$executeRawUnsafe(
          `UPDATE aud_dev_telemetria
           SET Tel_Captura_Ruta = NULL
           WHERE Tel_Captura_Ruta IS NOT NULL AND Tel_Captura_Ruta <> ''
             AND Tel_Fecha_Hora < ?
             AND Tar_Cod IS NULL AND Tic_Cod IS NULL`,
          cutoff
        )
      : await prisma.$executeRawUnsafe(
          `UPDATE aud_dev_telemetria t
           LEFT JOIN aud_tareas tar ON tar.Tar_Cod = t.Tar_Cod
           LEFT JOIN tickets tk ON tk.Tic_Cod = t.Tic_Cod
           SET t.Tel_Captura_Ruta = NULL
           WHERE t.Tel_Captura_Ruta IS NOT NULL AND t.Tel_Captura_Ruta <> ''
             AND t.Tel_Fecha_Hora < ?
             AND (
               (t.Tar_Cod IS NULL AND t.Tic_Cod IS NULL)
               OR (
                 t.Tar_Cod IS NOT NULL
                 AND tar.Tar_Estado = 'Finalizada'
                 AND tar.Tar_Fecha_Culminacion IS NOT NULL
                 AND tar.Tar_Fecha_Culminacion < DATE_SUB(NOW(), INTERVAL ? DAY)
               )
               OR (
                 t.Tic_Cod IS NOT NULL
                 AND IFNULL(tk.Tic_Est,'0') = '3'
                 AND tk.Tic_Fec_Ter IS NOT NULL
                 AND tk.Tic_Fec_Ter < DATE_SUB(NOW(), INTERVAL ? DAY)
               )
             )`,
          cutoff,
          post,
          post
        );
  return typeof result === "number" ? result : 0;
}

export type PurgeScreenshotsResult = {
  config: MonitoreoGlobalConfig;
  disk: PurgeCapturesResult;
  dbPathsCleared: number;
  protectedKept: number;
  statsAfter: CapturesDiskStats;
};

export async function purgeScreenshotsByRetention(
  dbDis: string,
  opts: { force?: boolean } = {}
): Promise<PurgeScreenshotsResult> {
  const prisma = getPrisma(dbDis);
  await ensureMonitoreoSchema(prisma);
  const config = await getMonitoreoGlobal(dbDis);

  if (!opts.force && !config.Cap_Retencion_Activa) {
    return {
      config,
      disk: {
        dias: config.Cap_Retencion_Dias,
        cutoffDate: "",
        foldersDeleted: [],
        filesDeleted: 0,
        bytesFreed: 0,
        errors: ["Retención desactivada"],
      },
      dbPathsCleared: 0,
      protectedKept: 0,
      statsAfter: getCapturesDiskStats(),
    };
  }

  const protectedKeys = await loadProtectedCaptureKeys(prisma, config);
  const disk = purgeCaptureFilesRespectingProtected({
    diasOrphans: config.Cap_Retencion_Dias,
    protectedKeys,
  });

  let dbPathsCleared = 0;
  if (disk.cutoffDate) {
    try {
      dbPathsCleared = await clearOrphanTelemetryPaths(prisma, disk.cutoffDate, config);
    } catch (e) {
      disk.errors.push(
        `BD: ${e instanceof Error ? e.message : "no se pudieron limpiar rutas"}`
      );
    }
  }

  const resumen = `files=${disk.filesDeleted} freed=${disk.bytesFreed} protected=${protectedKeys.size} db=${dbPathsCleared}`;
  await prisma.$executeRawUnsafe(
    `UPDATE aud_dev_monitoreo_global
     SET Cap_Ultima_Purga = NOW(),
         Cap_Ultimo_Resultado = ?,
         Cfg_Actualizado = NOW()
     WHERE Cfg_Cod = 1`,
    resumen.slice(0, 250)
  );

  return {
    config: await getMonitoreoGlobal(dbDis),
    disk,
    dbPathsCleared,
    protectedKept: protectedKeys.size,
    statsAfter: getCapturesDiskStats(),
  };
}

/** Auto-purga throttled (máx. 1 vez / 6 h) si está activa. */
export async function maybeAutoPurgeScreenshots(dbDis: string): Promise<boolean> {
  try {
    const cfg = await getMonitoreoGlobal(dbDis);
    if (!cfg.Cap_Retencion_Activa || !cfg.Cap_Auto_Purga) return false;
    if (cfg.Cap_Ultima_Purga) {
      const last = new Date(cfg.Cap_Ultima_Purga).getTime();
      if (Date.now() - last < 6 * 60 * 60 * 1000) return false;
    }
    await purgeScreenshotsByRetention(dbDis);
    return true;
  } catch {
    return false;
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
