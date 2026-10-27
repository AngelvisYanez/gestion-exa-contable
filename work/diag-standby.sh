#!/bin/sh
# Diagnostico: valor crudo del estado de la tarea 138 y contenido del script.
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
echo "--- valor crudo ---"
mysql --defaults-extra-file=/tmp/my.cnf "$DBNAME" -e "SELECT t.Tar_Cod, t.Tar_Estado, LENGTH(t.Tar_Estado) AS len, HEX(t.Tar_Estado) AS hex, t.Tar_Fecha_Fin FROM aud_tareas t WHERE t.Tar_Cod = 138;"
echo "--- definicion de columna ---"
mysql --defaults-extra-file=/tmp/my.cnf "$DBNAME" -e "SHOW COLUMNS FROM aud_tareas LIKE 'Tar_Estado';"
echo "--- linea UPDATE del script subido ---"
grep -n "UPDATE aud_tareas" /tmp/fix-sb.sh
rm -f /tmp/my.cnf
