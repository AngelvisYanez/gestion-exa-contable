-- Horario laboral por desarrollador (America/Guayaquil).
-- Mon_Horario_Activo=1 enciende/apaga Mon_Activo automáticamente según hora y días.

ALTER TABLE aud_dev_monitoreo_config
  ADD COLUMN Mon_Horario_Activo TINYINT NOT NULL DEFAULT 0;

ALTER TABLE aud_dev_monitoreo_config
  ADD COLUMN Mon_Hora_Inicio VARCHAR(5) NOT NULL DEFAULT '08:00';

ALTER TABLE aud_dev_monitoreo_config
  ADD COLUMN Mon_Hora_Fin VARCHAR(5) NOT NULL DEFAULT '17:00';

ALTER TABLE aud_dev_monitoreo_config
  ADD COLUMN Mon_Dias_Laborales VARCHAR(20) NOT NULL DEFAULT '1,2,3,4,5';
