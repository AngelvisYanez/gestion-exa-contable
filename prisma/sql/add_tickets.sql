-- Tickets de llegada / asignacion (panel EXA Tareas)
-- Preferir prisma/sql/improve_schema.sql (incluye índices ampliados + diagnóstico).
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
