-- Directivas de bandeja ExaMonitor (solo dashboard encargados)
-- Seguro re-ejecutar: ignora si la columna ya existe (MySQL 8+ no tiene IF NOT EXISTS en ADD COLUMN antiguo)

ALTER TABLE aud_dev_monitoreo_config
  ADD COLUMN Mon_Forzar_Bandeja TINYINT NOT NULL DEFAULT 1;

ALTER TABLE aud_dev_monitoreo_config
  ADD COLUMN Mon_Permitir_Salir TINYINT NOT NULL DEFAULT 0;
