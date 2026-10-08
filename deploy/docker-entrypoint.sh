#!/bin/sh
# ============================================================================
#  Punto de entrada del contenedor (api y worker)
# ============================================================================
# Sin argumentos:
#   1. Verifica que el worker de ingesta no quede duplicado y que la
#      configuracion de produccion sea segura (python -m app.cli check-config).
#   2. Si RUN_MIGRATIONS=true: `python -m app.migrations --bootstrap`, que migra
#      con Alembic y ejecuta una vez el arranque completo (siembras) en un solo
#      proceso, antes de lanzar N workers de uvicorn que harian lo mismo a la vez.
#   3. Lanza uvicorn con WEB_CONCURRENCY procesos (exec: recibe SIGTERM).
# Con argumentos: los ejecuta tal cual (comandos de administracion), p. ej.
#   docker compose run --rm api python -m app.cli create-admin --email X --name Y
# ============================================================================
set -eu

if [ "$#" -gt 0 ]; then
  exec "$@"
fi

PORT="${PORT:-8000}"
WEB_CONCURRENCY="${WEB_CONCURRENCY:-1}"
RUN_MIGRATIONS="${RUN_MIGRATIONS:-true}"

# Solo PostgreSQL tolera varios escritores. Cualquier otra URL (SQLite, vacia,
# relativa) fuerza un unico proceso: en Render con SQLite, 2+ workers rompen el
# login con "database is locked".
DB_URL_LC="$(printf '%s' "${DATABASE_URL:-sqlite}" | tr '[:upper:]' '[:lower:]')"
case "$DB_URL_LC" in
  postgres://*|postgresql://*|postgresql+*)
    ;;
  *)
    if [ "$WEB_CONCURRENCY" != "1" ]; then
      echo "==> Motor no-Postgres (${DB_URL_LC%%:*}): WEB_CONCURRENCY=$WEB_CONCURRENCY → 1"
      WEB_CONCURRENCY=1
    fi
    mkdir -p /app/data 2>/dev/null || true
    ;;
esac

# El worker de ingesta es un hilo dentro de cada proceso de uvicorn y la cola
# (ingest_jobs) no reclama trabajos de forma atomica: con INGEST_WORKER_ENABLED
# en un servicio de varios procesos, cada job se ejecutaria varias veces.
case "$(printf '%s' "${INGEST_WORKER_ENABLED:-false}" | tr '[:upper:]' '[:lower:]')" in
  1|true|yes|on) worker_on=1 ;;
  *) worker_on=0 ;;
esac
if [ "$worker_on" = 1 ] && [ "$WEB_CONCURRENCY" != "1" ]; then
  echo "ERROR: INGEST_WORKER_ENABLED=true exige WEB_CONCURRENCY=1 (hay $WEB_CONCURRENCY)." >&2
  echo "       Use el servicio 'worker' de docker-compose.yml para la ingesta." >&2
  exit 1
fi

# Falla rapido y con mensaje claro si la configuracion de produccion es insegura
# (SECRET_KEY de ejemplo o corta, etc.): check-config sale con codigo 1.
echo "==> Verificacion de configuracion"
if ! python -m app.cli check-config; then
  echo "ERROR: configuracion insegura para ENVIRONMENT=${ENVIRONMENT:-}. Revise deploy/.env.production." >&2
  exit 1
fi

case "$(printf '%s' "$RUN_MIGRATIONS" | tr '[:upper:]' '[:lower:]')" in
  1|true|yes|on)
    echo "==> Migraciones y arranque inicial"
    python -m app.migrations --bootstrap
    # Los workers de uvicorn no vuelven a sembrar catalogos/ciclos: ya se hizo aqui.
    export APP_BOOTSTRAPPED=1
    ;;
esac

# Opcional: crea/actualiza el superadmin al arrancar (Render/production sin Google).
if [ -n "${BOOTSTRAP_ADMIN_EMAIL:-}" ] && [ -n "${BOOTSTRAP_ADMIN_PASSWORD:-}" ]; then
  echo "==> Bootstrap admin ${BOOTSTRAP_ADMIN_EMAIL}"
  python -m app.cli create-admin \
    --email "$BOOTSTRAP_ADMIN_EMAIL" \
    --name "${BOOTSTRAP_ADMIN_NAME:-Administrador IETS}" \
    --password "$BOOTSTRAP_ADMIN_PASSWORD" || true
fi

# Tras el proxy de Render/Caddy, confiar en X-Forwarded-* de cualquier hop.
FORWARDED_ALLOW_IPS="${FORWARDED_ALLOW_IPS:-*}"

echo "==> uvicorn en 0.0.0.0:${PORT} con ${WEB_CONCURRENCY} proceso(s); ingesta: ${INGEST_WORKER_ENABLED:-false}"
exec uvicorn app.main:app \
  --host 0.0.0.0 \
  --port "$PORT" \
  --workers "$WEB_CONCURRENCY" \
  --proxy-headers \
  --forwarded-allow-ips "$FORWARDED_ALLOW_IPS" \
  --timeout-graceful-shutdown 30
