#!/bin/sh
# ============================================================================
#  Respaldo de PostgreSQL (servicio db de docker-compose.yml)
# ============================================================================
# Uso, desde cualquier carpeta del servidor:
#   deploy/backup.sh                    # respalda en deploy/backups/
#   deploy/backup.sh /srv/respaldos     # respalda en otra carpeta
#
# Variables opcionales:
#   ENV_FILE        archivo de variables (defecto deploy/.env.production)
#   RETENTION_DAYS  dias que se conservan los respaldos (defecto 14; 0 = no borrar)
#
# Genera un volcado en formato custom de pg_dump (comprimido, restaurable con
# pg_restore, tabla por tabla si hace falta), verifica que se pueda leer y deja
# al lado un .meta con la revision de Alembic y los conteos de control.
# Programelo con cron, p. ej. todos los dias a las 02:30:
#   30 2 * * *  /opt/iets-horizonte/deploy/backup.sh >> /var/log/iets-backup.log 2>&1
# Restauracion: ver DEPLOY.md, "Respaldo y restauracion".
# ============================================================================
set -eu

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="${ENV_FILE:-deploy/.env.production}"
BACKUP_DIR="${1:-deploy/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: no existe $ENV_FILE" >&2
  exit 1
fi

# Lee una variable del archivo sin ejecutarlo (no se hace `source` de secretos).
read_var() {
  sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1 | tr -d '\r'
}
PGUSER="$(read_var POSTGRES_USER)"; PGUSER="${PGUSER:-iets}"
PGDB="$(read_var POSTGRES_DB)"; PGDB="${PGDB:-iets_horizonte}"

compose() {
  docker compose --env-file "$ENV_FILE" "$@"
}

umask 077
mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BASE="$BACKUP_DIR/iets_${PGDB}_${STAMP}"
TMP="$BASE.dump.partial"

echo "==> Respaldo de $PGDB en $BASE.dump"
compose exec -T db pg_dump -U "$PGUSER" -d "$PGDB" --format=custom --compress=6 > "$TMP"

# Un volcado que pg_restore no puede listar no es un respaldo.
if ! compose exec -T db pg_restore --list < "$TMP" > /dev/null; then
  echo "ERROR: el volcado no es legible por pg_restore; se descarta." >&2
  rm -f "$TMP"
  exit 1
fi
mv "$TMP" "$BASE.dump"

# Metadatos: revision del esquema (para saber con que version restaurar) y
# conteos de control de las tablas principales.
{
  echo "fecha_utc=$STAMP"
  echo "base=$PGDB"
  printf 'alembic_revision='
  compose exec -T db psql -U "$PGUSER" -d "$PGDB" -tA -c "SELECT version_num FROM alembic_version" 2>/dev/null || echo "sin_alembic"
  for t in users sources findings technologies cycles cycle_technologies priority_scores evaluation_docs audit_log invima_records; do
    printf '%s=' "$t"
    compose exec -T db psql -U "$PGUSER" -d "$PGDB" -tA -c "SELECT count(*) FROM $t" 2>/dev/null || echo "?"
  done
} > "$BASE.meta"

SIZE="$(du -h "$BASE.dump" | cut -f1)"
echo "==> Listo: $BASE.dump ($SIZE)"
cat "$BASE.meta"

if [ "$RETENTION_DAYS" -gt 0 ] 2>/dev/null; then
  find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'iets_*.dump' -o -name 'iets_*.meta' \) \
    -mtime +"$RETENTION_DAYS" -print -delete
fi
