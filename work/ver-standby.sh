#!/bin/sh
# Verifica el estado de la tarea con nota de standby.
cd /var/www/vhosts/gestion.exacontable.com/httpdocs || exit 1
URL=$(grep -E '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '"')
CRED=${URL#mysql://}
USERPASS=${CRED%@*}
HOSTPART=${CRED#*@}
DBUSER=${USERPASS%%:*}
DBPASS=${USERPASS#*:}
DBHOST=${HOSTPART%%:*}
DBNAME=${HOSTPART#*/}
printf '[client]\nuser=%s\npassword=%s\nhost=%s\nport=3306\n' "$DBUSER" "$DBPASS" "$DBHOST" > /tmp/my.cnf
chmod 600 /tmp/my.cnf
echo "--- tarea 138 ---"
mysql --defaults-extra-file=/tmp/my.cnf "$DBNAME" -e "SELECT t.Tar_Cod, t.Tar_Estado, t.Tar_Fecha_Fin, t.Tar_Fecha_Culminacion, LEFT(CONVERT(t.Tar_Titulo USING utf8mb4),40) AS titulo FROM aud_tareas t WHERE t.Tar_Cod = 138;"
echo "--- tareas en estado Standby ---"
mysql --defaults-extra-file=/tmp/my.cnf "$DBNAME" -e "SELECT t.Tar_Cod, t.Tar_Estado, t.Tar_Fecha_Fin, LEFT(CONVERT(t.Tar_Titulo USING utf8mb4),40) AS titulo FROM aud_tareas t WHERE t.Tar_Estado = 'Standby' AND t.Tar_Est = 'A';"
echo "--- conteo por estado (abiertas) ---"
mysql --defaults-extra-file=/tmp/my.cnf "$DBNAME" -e "SELECT t.Tar_Estado, COUNT(*) AS n FROM aud_tareas t WHERE t.Tar_Est = 'A' GROUP BY t.Tar_Estado;"
rm -f /tmp/my.cnf
