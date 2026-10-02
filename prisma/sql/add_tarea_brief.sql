-- Metadatos de brief de desarrollo (mejora / creacion de modulo)
-- Ejecutar en cada schema de tareas (exa / servicios) si aplica.

SET @db := DATABASE();

SET @exists_proceso := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = @db AND table_name = 'aud_tareas' AND column_name = 'Tar_Proceso'
);
SET @sql := IF(
  @exists_proceso = 0,
  'ALTER TABLE aud_tareas ADD COLUMN Tar_Proceso VARCHAR(120) NULL AFTER Tar_Complejidad',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists_modulo := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = @db AND table_name = 'aud_tareas' AND column_name = 'Tar_Modulo'
);
SET @sql := IF(
  @exists_modulo = 0,
  'ALTER TABLE aud_tareas ADD COLUMN Tar_Modulo VARCHAR(120) NULL AFTER Tar_Proceso',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists_dir := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = @db AND table_name = 'aud_tareas' AND column_name = 'Tar_Directorio'
);
SET @sql := IF(
  @exists_dir = 0,
  'ALTER TABLE aud_tareas ADD COLUMN Tar_Directorio VARCHAR(255) NULL AFTER Tar_Modulo',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists_tipo := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = @db AND table_name = 'aud_tareas' AND column_name = 'Tar_Brief_Tipo'
);
SET @sql := IF(
  @exists_tipo = 0,
  'ALTER TABLE aud_tareas ADD COLUMN Tar_Brief_Tipo VARCHAR(40) NULL AFTER Tar_Directorio',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists_md := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = @db AND table_name = 'aud_tareas' AND column_name = 'Tar_Brief_Md'
);
SET @sql := IF(
  @exists_md = 0,
  'ALTER TABLE aud_tareas ADD COLUMN Tar_Brief_Md VARCHAR(500) NULL AFTER Tar_Brief_Tipo',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists_pdf := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = @db AND table_name = 'aud_tareas' AND column_name = 'Tar_Brief_Pdf'
);
SET @sql := IF(
  @exists_pdf = 0,
  'ALTER TABLE aud_tareas ADD COLUMN Tar_Brief_Pdf VARCHAR(500) NULL AFTER Tar_Brief_Md',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists_fec := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = @db AND table_name = 'aud_tareas' AND column_name = 'Tar_Brief_Fecha'
);
SET @sql := IF(
  @exists_fec = 0,
  'ALTER TABLE aud_tareas ADD COLUMN Tar_Brief_Fecha DATETIME NULL AFTER Tar_Brief_Pdf',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
