-- Solo para instalaciones que ya ejecutaron add_capacitaciones.sql antes de estos campos.
ALTER TABLE aud_capacitaciones
  ADD COLUMN Cap_Proyecto VARCHAR(32) NOT NULL DEFAULT 'exa' AFTER Cap_Cliente,
  ADD COLUMN Cap_Responsable_Per_Cod INT NOT NULL DEFAULT 0 AFTER Cap_Proyecto,
  ADD COLUMN Cap_Responsable_Nombre VARCHAR(180) NOT NULL DEFAULT '' AFTER Cap_Responsable_Per_Cod,
  ADD INDEX idx_cap_proyecto (Cap_Proyecto);
