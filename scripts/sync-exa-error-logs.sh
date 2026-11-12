#!/bin/sh
# Copia la cola (~2MB) de los error_log remotos a gestion para /configuracion/incidencias.
# Destino: httpdocs/logs/exa-remote/{ofsercont,relavera}/
# En produccion vive en /usr/local/bin/sync-exa-error-logs.sh (cron root cada 5 min).
set -eu
DEST=/var/www/vhosts/gestion.exacontable.com/httpdocs/logs/exa-remote
mkdir -p "$DEST/ofsercont" "$DEST/relavera"
ssh -i /root/.ssh/id_rsa_ofser -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=30 \
  -o HostKeyAlgorithms=+ssh-rsa -o PubkeyAcceptedAlgorithms=+ssh-rsa \
  lewis.chimarro@199.89.54.243 \
  "tail -c 2097152 /var/www/vhosts/ofsercont.com/logs/exa.ofsercont.com/error_log" \
  > "$DEST/ofsercont/exa-ofsercont-error.log"
ssh -o BatchMode=yes -o ConnectTimeout=20 \
  erpexa.com@auditoria.erpexa.com \
  "tail -c 2097152 /var/www/vhosts/erpexa.com/logs/relavera.erpexa.com/error_log" \
  > "$DEST/relavera/exa-relavera-error.log"
date -Is > "$DEST/last-sync.txt"
chown -R gestion:psacln "$DEST"
chmod -R u+rwX,g+rX,o+rX "$DEST"
