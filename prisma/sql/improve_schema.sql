-- =============================================================================
-- Mejora de esquema EXA Tareas (aditivo, seguro re-ejecutar en MySQL 8+)
-- Ejecutar por base: exa, servicios (o DATABASE_NAMES).
--
-- Qué hace:
--   1) Asegura tabla aud_tickets
--   2) Índices de consulta (tareas, asignaciones, tickets, telemetría)
--   3) Diagnóstico de huérfanos antes de FKs opcionales
--   4) FKs opcionales (comentadas) — descomentar solo tras limpiar huérfanos
--   5) Retención telemetría (DELETE opcional, comentado)
--
-- Qué NO hace (a propósito, BD compartida ERP):
--   - No convierte estados a ENUM MySQL
--   - No cambia BigInt de tickets.Emp_Cod/Usu_Cod
--   - No altera Usu_Pal / hashes
--   - No fuerza utf8mb4 en tablas legacy (ver bloque charset opcional)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1a) aud_incidencias (monitor de logs de error EXA)
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 1) aud_tickets (idempotente)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS aud_tickets (
  Tic_Cod INT NOT NULL AUTO_INCREMENT,
  Tic_Titulo VARCHAR(255) NOT NULL,
  Tic_Descripcion TEXT NULL,
  Tic_Prioridad VARCHAR(20) NOT NULL DEFAULT 'Media',
  Tic_Estado VARCHAR(40) NOT NULL DEFAULT 'Nuevo',
  Tic_Origen VARCHAR(40) NOT NULL DEFAULT 'Manual',
  Per_Cod_Asignado INT NULL,
  Tar_Cod INT NULL,
  Emp_Cod INT NULL,
  Usu_Creador INT NULL,
  Tic_Fecha_Llegada DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  Tic_Fecha_Asignacion DATETIME NULL,
  Tic_Est CHAR(1) NOT NULL DEFAULT 'A',
  PRIMARY KEY (Tic_Cod),
  KEY idx_aud_tic_estado_est (Tic_Estado, Tic_Est),
  KEY idx_aud_tic_asig (Per_Cod_Asignado),
  KEY idx_aud_tic_emp (Emp_Cod),
  KEY idx_aud_tic_tar (Tar_Cod),
  KEY idx_aud_tic_creador (Usu_Creador),
  KEY idx_aud_tic_llegada (Tic_Fecha_Llegada)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- 2) Índices (ignora si ya existen)
-- -----------------------------------------------------------------------------

-- aud_tareas: listados por empresa + estado + soft-delete
SET @sql := (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.statistics
           WHERE table_schema = DATABASE() AND table_name = 'aud_tareas'
             AND index_name = 'idx_tar_emp_estado_est'),
    'SELECT 1',
    'CREATE INDEX idx_tar_emp_estado_est ON aud_tareas (Emp_Cod, Tar_Estado, Tar_Est)'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.statistics
           WHERE table_schema = DATABASE() AND table_name = 'aud_tareas'
             AND index_name = 'idx_tar_creador'),
    'SELECT 1',
    'CREATE INDEX idx_tar_creador ON aud_tareas (Usu_Creador)'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.statistics
           WHERE table_schema = DATABASE() AND table_name = 'aud_tareas'
             AND index_name = 'idx_tar_estado_est'),
    'SELECT 1',
    'CREATE INDEX idx_tar_estado_est ON aud_tareas (Tar_Estado, Tar_Est)'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.statistics
           WHERE table_schema = DATABASE() AND table_name = 'aud_tareas'
             AND index_name = 'idx_tar_fecha_fin'),
    'SELECT 1',
    'CREATE INDEX idx_tar_fecha_fin ON aud_tareas (Tar_Fecha_Fin)'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- asignaciones: lookup por persona y por tarea+persona (soft-delete)
SET @sql := (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.statistics
           WHERE table_schema = DATABASE() AND table_name = 'aud_tareas_asignadas'
             AND index_name = 'idx_tas_tar_per_est'),
    'SELECT 1',
    'CREATE INDEX idx_tas_tar_per_est ON aud_tareas_asignadas (Tar_Cod, Per_Cod, Tas_Est)'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.statistics
           WHERE table_schema = DATABASE() AND table_name = 'aud_tareas_asignadas'
             AND index_name = 'idx_tas_per_est'),
    'SELECT 1',
    'CREATE INDEX idx_tas_per_est ON aud_tareas_asignadas (Per_Cod, Tas_Est)'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- avances
SET @sql := (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.statistics
           WHERE table_schema = DATABASE() AND table_name = 'aud_tareas_avances'
             AND index_name = 'idx_ava_tar_est'),
    'SELECT 1',
    'CREATE INDEX idx_ava_tar_est ON aud_tareas_avances (Tar_Cod, Ava_Est)'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.statistics
           WHERE table_schema = DATABASE() AND table_name = 'aud_tareas_avances'
             AND index_name = 'idx_ava_usu'),
    'SELECT 1',
    'CREATE INDEX idx_ava_usu ON aud_tareas_avances (Usu_Cod)'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- telemetría: retención / purga por fecha
SET @sql := (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.statistics
           WHERE table_schema = DATABASE() AND table_name = 'aud_dev_telemetria'
             AND index_name = 'idx_tel_fecha'),
    'SELECT 1',
    'CREATE INDEX idx_tel_fecha ON aud_dev_telemetria (Tel_Fecha_Hora)'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- tickets legacy
SET @sql := (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.statistics
           WHERE table_schema = DATABASE() AND table_name = 'tickets'
             AND index_name = 'idx_tic_emp_est'),
    'SELECT 1',
    'CREATE INDEX idx_tic_emp_est ON tickets (Emp_Cod, Tic_Est)'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.statistics
           WHERE table_schema = DATABASE() AND table_name = 'tickets'
             AND index_name = 'idx_tic_ase'),
    'SELECT 1',
    'CREATE INDEX idx_tic_ase ON tickets (Ase_Cod)'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.statistics
           WHERE table_schema = DATABASE() AND table_name = 'tickets'
             AND index_name = 'idx_tic_fec_cre'),
    'SELECT 1',
    'CREATE INDEX idx_tic_fec_cre ON tickets (Tic_Fec_Cre)'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- personal / persona
SET @sql := (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.statistics
           WHERE table_schema = DATABASE() AND table_name = 'persona'
             AND index_name = 'idx_prs_ced'),
    'SELECT 1',
    'CREATE INDEX idx_prs_ced ON persona (Prs_Ced)'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.statistics
           WHERE table_schema = DATABASE() AND table_name = 'personal'
             AND index_name = 'idx_per_emp'),
    'SELECT 1',
    'CREATE INDEX idx_per_emp ON personal (Emp_Cod)'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- -----------------------------------------------------------------------------
-- 3) Diagnóstico de huérfanos (solo SELECT — revisar antes de FKs)
-- -----------------------------------------------------------------------------
SELECT 'aud_tareas.Usu_Creador huérfanos' AS check_name, COUNT(*) AS n
FROM aud_tareas t
LEFT JOIN usuarios u ON u.Usu_Cod = t.Usu_Creador
WHERE t.Usu_Creador IS NOT NULL AND u.Usu_Cod IS NULL;

SELECT 'aud_tareas.Emp_Cod huérfanos' AS check_name, COUNT(*) AS n
FROM aud_tareas t
LEFT JOIN empresas e ON e.Emp_Cod = t.Emp_Cod
WHERE t.Emp_Cod IS NOT NULL AND e.Emp_Cod IS NULL;

SELECT 'asignadas.Per_Cod huérfanos' AS check_name, COUNT(*) AS n
FROM aud_tareas_asignadas a
LEFT JOIN personal p ON p.Per_Cod = a.Per_Cod
WHERE p.Per_Cod IS NULL;

SELECT 'avances.Usu_Cod huérfanos' AS check_name, COUNT(*) AS n
FROM aud_tareas_avances a
LEFT JOIN usuarios u ON u.Usu_Cod = a.Usu_Cod
WHERE a.Usu_Cod IS NOT NULL AND u.Usu_Cod IS NULL;

SELECT 'telemetria.Per_Cod huérfanos' AS check_name, COUNT(*) AS n
FROM aud_dev_telemetria t
LEFT JOIN personal p ON p.Per_Cod = t.Per_Cod
WHERE p.Per_Cod IS NULL;

SELECT 'telemetria filas > 90 días' AS check_name, COUNT(*) AS n
FROM aud_dev_telemetria
WHERE Tel_Fecha_Hora < (NOW() - INTERVAL 90 DAY);

-- -----------------------------------------------------------------------------
-- 4) FKs opcionales — descomentar cuando los SELECT anteriores den n=0
--    (BD compartida ERP: coordinar con otros módulos antes de aplicar)
-- -----------------------------------------------------------------------------
/*
ALTER TABLE aud_tareas
  ADD CONSTRAINT fk_tar_creador FOREIGN KEY (Usu_Creador) REFERENCES usuarios(Usu_Cod)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT fk_tar_emp FOREIGN KEY (Emp_Cod) REFERENCES empresas(Emp_Cod)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE aud_tareas_asignadas
  ADD CONSTRAINT fk_tas_per FOREIGN KEY (Per_Cod) REFERENCES personal(Per_Cod)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE aud_tareas_avances
  ADD CONSTRAINT fk_ava_usu FOREIGN KEY (Usu_Cod) REFERENCES usuarios(Usu_Cod)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE aud_dev_telemetria
  ADD CONSTRAINT fk_tel_per FOREIGN KEY (Per_Cod) REFERENCES personal(Per_Cod)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE personal
  ADD CONSTRAINT fk_per_emp FOREIGN KEY (Emp_Cod) REFERENCES empresas(Emp_Cod)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE aud_tickets
  ADD CONSTRAINT fk_aud_tic_asig FOREIGN KEY (Per_Cod_Asignado) REFERENCES personal(Per_Cod)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT fk_aud_tic_tar FOREIGN KEY (Tar_Cod) REFERENCES aud_tareas(Tar_Cod)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT fk_aud_tic_emp FOREIGN KEY (Emp_Cod) REFERENCES empresas(Emp_Cod)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT fk_aud_tic_creador FOREIGN KEY (Usu_Creador) REFERENCES usuarios(Usu_Cod)
    ON DELETE SET NULL ON UPDATE CASCADE;
*/

-- -----------------------------------------------------------------------------
-- 5) Retención telemetría (opcional) — purga > 90 días
--    Ejecutar en ventana de bajo tráfico; borrar capturas de disco aparte.
-- -----------------------------------------------------------------------------
/*
DELETE FROM aud_dev_telemetria
WHERE Tel_Fecha_Hora < (NOW() - INTERVAL 90 DAY)
LIMIT 50000;
-- Repetir hasta affected_rows = 0
*/

-- -----------------------------------------------------------------------------
-- 6) Charset opcional (tablas app nuevas / propias). NO aplicar a todo el ERP
--    sin backup. Ejemplo solo aud_* propias:
-- -----------------------------------------------------------------------------
/*
ALTER TABLE aud_tareas CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE aud_tareas_asignadas CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE aud_tareas_avances CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE aud_dev_telemetria CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE aud_dev_monitoreo_config CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
*/
