-- Liberar conexiones idle de Prisma/MySQL tras HY000 1040
-- Ejecutar como root en MySQL (Workbench / CLI)

SHOW VARIABLES LIKE 'max_connections';
SHOW STATUS LIKE 'Threads_connected';

-- Subir techo temporalmente si hace falta (reinicio no requerido en MySQL 8)
-- SET GLOBAL max_connections = 200;

-- Listar conexiones del usuario de la app
SELECT id, user, host, db, command, time, state, LEFT(info, 80) AS info
FROM information_schema.processlist
WHERE user NOT IN ('system user', 'event_scheduler')
ORDER BY time DESC;

-- Matar Sleep antiguos (> 60 s). Ajusta el user si no es root:
-- SELECT CONCAT('KILL ', id, ';') FROM information_schema.processlist
-- WHERE command = 'Sleep' AND time > 60 AND user = 'root';
