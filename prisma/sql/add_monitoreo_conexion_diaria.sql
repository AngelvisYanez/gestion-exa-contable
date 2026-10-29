-- Primera comunicacion diaria del agente. Compatible con MySQL 5.5+.
CREATE TABLE IF NOT EXISTS aud_dev_conexion_diaria (
  Per_Cod INT NOT NULL,
  Fecha DATE NOT NULL,
  Primera_Conexion DATETIME NOT NULL,
  PRIMARY KEY (Per_Cod, Fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
