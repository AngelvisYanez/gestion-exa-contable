-- Monitor de incidencias desde logs de error EXA (panel EXA Tareas)
-- Ejecutar en cada BD de DATABASE_NAMES (exa, servicios) si no usas ensureTable en runtime.
-- MySQL 5.5: DATETIME no admite DEFAULT CURRENT_TIMESTAMP (error 1067).
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

-- Si la tabla ya existía con DEFAULT CURRENT_TIMESTAMP:
ALTER TABLE aud_incidencias
  MODIFY Inc_Primera_Vez DATETIME NULL DEFAULT NULL,
  MODIFY Inc_Ultima_Vez DATETIME NULL DEFAULT NULL;
