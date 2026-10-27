#!/bin/sh
# Pasa a estado Standby las tareas que tienen un avance con nota de standby.
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
SUB="(SELECT DISTINCT av.Tar_Cod FROM aud_tareas_avances av WHERE av.Ava_Est='A' AND CONVERT(av.Ava_Descripcion USING utf8mb4) LIKE '%Standby:%')"
echo "--- antes ---"
mysql --defaults-extra-file=/tmp/my.cnf "$DBNAME" -e "SELECT t.Tar_Cod, t.Tar_Estado, t.Tar_Fecha_Fin, LEFT(CONVERT(t.Tar_Titulo USING utf8mb4),40) AS titulo FROM aud_tareas t WHERE t.Tar_Cod IN $SUB;"
echo "--- aplicando estado Standby ---"
mysql --defaults-extra-file=/tmp/my.cnf "$DBNAME" -e "UPDATE aud_tareas SET Tar_Estado='Standby', Tar_Fecha_Fin=NULL, Tar_Fecha_Culminacion=NULL WHERE Tar_Est='A' AND Tar_Cod IN (SELECT * FROM $SUB x); SELECT ROW_COUNT() AS filas_afectadas;"
echo "--- despues ---"
mysql --defaults-extra-file=/tmp/my.cnf "$DBNAME" -e "SELECT t.Tar_Cod, t.Tar_Estado, t.Tar_Fecha_Fin, LEFT(CONVERT(t.Tar_Titulo USING utf8mb4),40) AS titulo FROM aud_tareas t WHERE t.Tar_Estado='Standby';"
rm -f /tmp/my.cnf
