-- Fix login ExaMonitor: Angelvis Yanez (cedula 22600781) en Emp_Cod=96
-- Panel Usu_Cod=6273 (MATRIZ Suc 99), Prs_Cod=53102, Per_Cod estaba NULL
-- No habia fila en personal Emp_Cod=96 para este Prs_Cod.

INSERT INTO exa.personal (Per_Cod, Prs_Cod, Emp_Cod, Per_Car, Per_Est)
SELECT COALESCE(MAX(p.Per_Cod), 0) + 1, 53102, 96, 'ENCARGADO', 'A'
FROM exa.personal p
WHERE NOT EXISTS (
  SELECT 1 FROM exa.personal x
  WHERE x.Prs_Cod = 53102 AND x.Emp_Cod = 96 AND x.Per_Est = 'A'
);

UPDATE exa.aud_panel_usuarios pan
INNER JOIN (
  SELECT Per_Cod FROM exa.personal
  WHERE Prs_Cod = 53102 AND Emp_Cod = 96 AND Per_Est = 'A'
  ORDER BY Per_Cod DESC
  LIMIT 1
) per ON 1 = 1
SET pan.Per_Cod = per.Per_Cod,
    pan.Prs_Cod = 53102,
    pan.Pan_Actualizado = NOW()
WHERE pan.Usu_Cod = 6273 AND pan.Pan_Est = 'A';

INSERT INTO exa.aud_dev_monitoreo_config
  (Per_Cod, Mon_Activo, Mon_Intervalo_Minutos, Mon_Captura_Pantalla, Mon_Forzar_Bandeja, Mon_Permitir_Salir)
SELECT per.Per_Cod, 1, 1, 1, 1, 0
FROM (
  SELECT Per_Cod FROM exa.personal
  WHERE Prs_Cod = 53102 AND Emp_Cod = 96 AND Per_Est = 'A'
  ORDER BY Per_Cod DESC LIMIT 1
) per
WHERE NOT EXISTS (
  SELECT 1 FROM exa.aud_dev_monitoreo_config c WHERE c.Per_Cod = per.Per_Cod
);

SELECT pan.Usu_Cod, pan.Per_Cod, pan.Prs_Cod, pan.Pan_Nombre, pan.Pan_Rol, pan.Pan_Est
FROM exa.aud_panel_usuarios pan
WHERE pan.Usu_Cod = 6273;
