#!/bin/sh
cd /var/www/vhosts/gestion.exacontable.com/httpdocs || exit 1
echo "--- node ---"
command -v node && node -v
echo "--- mysql client ---"
command -v mysql || echo NO_MYSQL_CLIENT
command -v mariadb || echo NO_MARIADB_CLIENT
echo "--- env (sin password) ---"
grep -E '^(DATABASE_HOST|DATABASE_PORT|DATABASE_USER|DATABASE_NAMES|DATABASE_URL)=' .env | sed -E 's#(DATABASE_URL=mysql://[^:]+):[^@]+@#\1:***@#'
echo "--- prisma schema datasource ---"
head -n 20 prisma/schema.prisma 2>/dev/null
echo "--- node_modules prisma ---"
ls -d node_modules/@prisma/client 2>/dev/null || echo NO_PRISMA_CLIENT
