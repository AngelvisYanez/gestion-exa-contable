-- Usuarios de la empresa habilitados para el panel de gestion.
-- Pan_Rol: manager | developer | atencion
-- Pan_Est: A en gestion | I retirado

CREATE TABLE IF NOT EXISTS aud_panel_usuarios (
  Pan_Cod INT NOT NULL AUTO_INCREMENT,
  Usu_Cod INT NOT NULL,
  Per_Cod INT NULL,
  Prs_Cod INT NULL,
  Pan_Nombre VARCHAR(180) NOT NULL,
  Pan_Cedula VARCHAR(20) NULL,
  Pan_Rol VARCHAR(20) NOT NULL DEFAULT 'developer',
  Pan_Est CHAR(1) NOT NULL DEFAULT 'A',
  Pan_Creado DATETIME NULL DEFAULT NULL,
  Pan_Actualizado DATETIME NULL DEFAULT NULL,
  PRIMARY KEY (Pan_Cod),
  UNIQUE KEY uq_panel_usu (Usu_Cod),
  KEY idx_panel_est_rol (Pan_Est, Pan_Rol),
  KEY idx_panel_per (Per_Cod),
  KEY idx_panel_prs (Prs_Cod)
);
