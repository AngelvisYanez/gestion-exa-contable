-- Complejidad de tarea (Baja | Media | Alta | Muy alta)
-- Ejecutar en cada schema de tareas (exa / servicios) si aplica.

SET @db := DATABASE();

SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = @db AND table_name = 'aud_tareas' AND column_name = 'Tar_Complejidad'
);

SET @sql := IF(
  @exists = 0,
  'ALTER TABLE aud_tareas ADD COLUMN Tar_Complejidad VARCHAR(20) NULL DEFAULT ''Media'' AFTER Tar_Prioridad',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
