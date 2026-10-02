-- Pausa de almuerzo (inactividad del monitoreo dentro de la jornada).
-- Por defecto 13:00–14:00 (1 hora). Mon_Almuerzo_Activo=1 la aplica en días laborales.

ALTER TABLE aud_dev_monitoreo_config
  ADD COLUMN Mon_Almuerzo_Activo TINYINT NOT NULL DEFAULT 0;

ALTER TABLE aud_dev_monitoreo_config
  ADD COLUMN Mon_Almuerzo_Inicio VARCHAR(5) NOT NULL DEFAULT '13:00';

ALTER TABLE aud_dev_monitoreo_config
  ADD COLUMN Mon_Almuerzo_Fin VARCHAR(5) NOT NULL DEFAULT '14:00';
