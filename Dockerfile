# syntax=docker/dockerfile:1
# ============================================================================
#  Sistema de Escaneo de Horizonte del IETS - imagen de produccion (P0-2)
# ============================================================================
# Tres etapas:
#   1. frontend : Node compila la SPA (frontend/dist).
#   2. pydeps   : instala backend/requirements.txt en un entorno virtual.
#   3. runtime  : python-slim con el venv, el backend y dist; usuario sin root.
#
# La misma imagen sirve para el servicio `api` (N procesos de uvicorn) y para
# el `worker` de ingesta (1 proceso con INGEST_WORKER_ENABLED=true). Ver
# docker-compose.yml, deploy/docker-entrypoint.sh y DEPLOY.md.
#
#   docker build -t iets-horizonte:7.0.0 .
# ============================================================================

# --------------------------------------------------------------------------- #
#  1. Frontend
# --------------------------------------------------------------------------- #
FROM node:24-bookworm-slim AS frontend
WORKDIR /build/frontend
# Primero solo los manifiestos: la capa de npm ci se reutiliza si no cambian.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# --------------------------------------------------------------------------- #
#  2. Dependencias de Python
# --------------------------------------------------------------------------- #
FROM python:3.12-slim-bookworm AS pydeps
ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:${PATH}"
COPY backend/requirements.txt /tmp/requirements.txt
# Todas las dependencias publican wheels manylinux para cp312 (lxml, Pillow,
# pypdfium2, psycopg-binary, rapidfuzz, grpcio...): no hace falta compilador.
RUN pip install --upgrade pip \
 && pip install -r /tmp/requirements.txt

# --------------------------------------------------------------------------- #
#  3. Runtime
# --------------------------------------------------------------------------- #
FROM python:3.12-slim-bookworm AS runtime

LABEL org.opencontainers.image.title="iets-horizonte" \
      org.opencontainers.image.description="Sistema de Escaneo de Horizonte del IETS (API + SPA)" \
      org.opencontainers.image.vendor="IETS"

# Valores por defecto seguros; docker-compose.yml y deploy/.env.production los
# sobrescriben. En produccion el arranque exige una SECRET_KEY propia (no hay
# valor por defecto aqui a proposito). DATABASE_URL en SQLite solo sirve para
# probar la imagen aislada; con compose se usa PostgreSQL.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:${PATH}" \
    ENVIRONMENT=production \
    ALLOW_DEV_LOGIN=false \
    PORT=8000 \
    WEB_CONCURRENCY=2 \
    INGEST_WORKER_ENABLED=false \
    RUN_MIGRATIONS=true \
    FORWARDED_ALLOW_IPS=127.0.0.1 \
    FRONTEND_DIST=/app/frontend/dist \
    DATABASE_URL=sqlite:////app/data/iets_horizonte.db

# Usuario sin privilegios con UID/GID fijos (permisos predecibles en volumenes).
RUN groupadd --system --gid 10001 iets \
 && useradd --system --uid 10001 --gid iets --home-dir /app --shell /usr/sbin/nologin iets \
 && mkdir -p /app/backend /app/frontend /app/data \
 && chown -R iets:iets /app

COPY --from=pydeps /opt/venv /opt/venv

WORKDIR /app/backend
# main.py sirve la SPA desde FRONTEND_DIST (por defecto <raiz>/frontend/dist,
# que aqui coincide: /app/frontend/dist).
COPY --chown=iets:iets backend/ /app/backend/
COPY --chown=iets:iets --from=frontend /build/frontend/dist /app/frontend/dist
COPY --chown=iets:iets deploy/docker-entrypoint.sh /app/docker-entrypoint.sh
# Si el repositorio se clono en Windows con CRLF, el script no correria en sh.
RUN sed -i 's/\r$//' /app/docker-entrypoint.sh \
 && chmod 0755 /app/docker-entrypoint.sh

USER iets:iets
EXPOSE 8000

# Se usa Python (ya presente) en lugar de curl para no agregar paquetes.
HEALTHCHECK --interval=30s --timeout=5s --start-period=180s --retries=3 \
  CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:%s/api/health' % os.environ.get('PORT', '8000'), timeout=4)" || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
# Sin argumentos arranca uvicorn. Con argumentos los ejecuta tal cual, p. ej.:
#   docker compose run --rm api python -m app.cli check-config
CMD []
