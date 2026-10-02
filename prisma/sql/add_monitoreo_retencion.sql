-- Politicas globales ExaMonitor + vínculo ticket en telemetría
-- Idempotente

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
  -- MySQL 5.5: sin ON UPDATE CURRENT_TIMESTAMP en DATETIME (error 1294)
  Cfg_Actualizado DATETIME NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Si la tabla ya existía con ON UPDATE, normalizar columna
ALTER TABLE aud_dev_monitoreo_global
  MODIFY Cfg_Actualizado DATETIME NULL DEFAULT NULL;

INSERT INTO aud_dev_monitoreo_global (
  Cfg_Cod, Cap_Retencion_Activa, Cap_Retencion_Preset, Cap_Retencion_Dias,
  Cap_Auto_Purga, Cap_Preservar_Asignaciones, Cap_Post_Cierre_Dias
)
SELECT 1, 1, '1m', 30, 1, 1, 90
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM aud_dev_monitoreo_global WHERE Cfg_Cod = 1
);

-- Columnas nuevas si la tabla ya existía sin ellas
SET @sql := (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_schema = DATABASE() AND table_name = 'aud_dev_monitoreo_global'
             AND column_name = 'Cap_Preservar_Asignaciones'),
    'SELECT 1',
    'ALTER TABLE aud_dev_monitoreo_global ADD COLUMN Cap_Preservar_Asignaciones TINYINT NOT NULL DEFAULT 1'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_schema = DATABASE() AND table_name = 'aud_dev_monitoreo_global'
             AND column_name = 'Cap_Post_Cierre_Dias'),
    'SELECT 1',
    'ALTER TABLE aud_dev_monitoreo_global ADD COLUMN Cap_Post_Cierre_Dias INT NOT NULL DEFAULT 90'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_schema = DATABASE() AND table_name = 'aud_dev_telemetria'
             AND column_name = 'Tic_Cod'),
    'SELECT 1',
    'ALTER TABLE aud_dev_telemetria ADD COLUMN Tic_Cod INT NULL, ADD INDEX idx_tel_tic (Tic_Cod)'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
