#!/bin/sh
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
echo "--- avances con nota de standby ---"
mysql --defaults-extra-file=/tmp/my.cnf "$DBNAME" -e "SELECT av.Ava_Cod, av.Tar_Cod, av.Ava_Fecha, LEFT(CONVERT(av.Ava_Descripcion USING utf8mb4),220) AS descr, t.Tar_Fecha_Fin, t.Tar_Estado, LEFT(CONVERT(t.Tar_Titulo USING utf8mb4),40) AS titulo FROM aud_tareas_avances av JOIN aud_tareas t ON t.Tar_Cod = av.Tar_Cod WHERE av.Ava_Est='A' AND CONVERT(av.Ava_Descripcion USING utf8mb4) LIKE '%Standby:%' ORDER BY av.Ava_Fecha DESC LIMIT 20;"
echo "--- ultimo avance por tarea, para contexto ---"
mysql --defaults-extra-file=/tmp/my.cnf "$DBNAME" -e "SELECT av.Tar_Cod, av.Ava_Cod, av.Ava_Fecha, LEFT(CONVERT(av.Ava_Descripcion USING utf8mb4),160) AS descr, t.Tar_Fecha_Fin FROM aud_tareas_avances av JOIN aud_tareas t ON t.Tar_Cod=av.Tar_Cod WHERE av.Ava_Est='A' ORDER BY av.Ava_Fecha DESC LIMIT 10;"
rm -f /tmp/my.cnf
