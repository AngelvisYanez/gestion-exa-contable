-- Ejecutar en la base de gestion (exa) antes de habilitar el modulo.
CREATE TABLE IF NOT EXISTS aud_capacitaciones (
  Cap_Cod INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  Cap_Titulo VARCHAR(255) NOT NULL,
  Cap_Empresa VARCHAR(180) NOT NULL,
  Cap_Cliente VARCHAR(180) NOT NULL,
  Cap_Proyecto VARCHAR(32) NOT NULL,
  Cap_Responsable_Per_Cod INT NOT NULL,
  Cap_Responsable_Nombre VARCHAR(180) NOT NULL,
  Cap_Inicio DATETIME NOT NULL,
  Cap_Duracion_Min INT NOT NULL,
  Cap_Estado VARCHAR(20) NOT NULL DEFAULT 'Programada',
  Cap_Finalizada DATETIME NULL,
  Cap_Creador INT NOT NULL,
  Cap_Creada DATETIME NOT NULL,
  Cap_Actualizada DATETIME NOT NULL,
  INDEX idx_cap_inicio (Cap_Inicio),
  INDEX idx_cap_proyecto (Cap_Proyecto),
  INDEX idx_cap_estado (Cap_Estado)
);
