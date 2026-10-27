#!/bin/sh
# Ajuste de datos: las tareas en standby quedan sin fecha de fin.
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
Q="SELECT t.Tar_Cod, t.Tar_Fecha_Fin, t.Tar_Estado, LEFT(CONVERT(t.Tar_Titulo USING utf8mb4),40) AS titulo FROM aud_tareas t WHERE t.Tar_Cod = 138"
echo "--- antes ---"
mysql --defaults-extra-file=/tmp/my.cnf "$DBNAME" -e "$Q"
echo "--- aplicando (standby = sin fecha de fin) ---"
mysql --defaults-extra-file=/tmp/my.cnf "$DBNAME" -e "UPDATE aud_tareas SET Tar_Fecha_Fin = NULL WHERE Tar_Cod = 138 AND Tar_Est = 'A'; SELECT ROW_COUNT() AS filas_afectadas;"
echo "--- despues ---"
mysql --defaults-extra-file=/tmp/my.cnf "$DBNAME" -e "$Q"
rm -f /tmp/my.cnf
