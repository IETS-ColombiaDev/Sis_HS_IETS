# =============================================================================
#  Sistema de Escaneo de Horizonte del IETS - arranque de PRODUCCION (Windows)
# =============================================================================
# Uso, desde la raiz del repositorio:
#   .\start-prod.ps1                      # 127.0.0.1:8000, detras de un proxy HTTPS
#   .\start-prod.ps1 -BindHost 0.0.0.0 -Port 8080
#   .\start-prod.ps1 -SkipBuild           # no compila el frontend aunque falte
#
# Diferencias con start.ps1 (desarrollo):
#   - ENVIRONMENT=production y ALLOW_DEV_LOGIN=false para este proceso.
#   - Exige backend\.env propio (no copia el de ejemplo) y valida la
#     configuracion con `python -m app.cli check-config` antes de arrancar.
#   - Aplica las migraciones de Alembic (`python -m app.migrations`).
#   - Sin --reload y con un solo proceso de uvicorn: con SQLite y con el worker
#     de ingesta en hilo, mas de un proceso duplicaria trabajos.
# Para varios procesos use PostgreSQL y docker-compose.yml (ver DEPLOY.md).
# =============================================================================
[CmdletBinding()]
param(
    [string]$BindHost = "127.0.0.1",
    [int]$Port = 8000,
    [switch]$SkipBuild
)

# "Continue": en Windows PowerShell 5.1, con "Stop", cualquier linea que un
# ejecutable nativo escriba en stderr (alembic y uvicorn registran ahi) se vuelve
# un error terminante cuando la salida se captura (servicio, tarea programada).
# Los fallos se detectan con $LASTEXITCODE y throw explicitos.
$ErrorActionPreference = "Continue"
$root = $PSScriptRoot
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"
$python = Join-Path $backend ".venv\Scripts\python.exe"

Write-Host "==> Preparando backend (produccion)..." -ForegroundColor Cyan
Set-Location $backend -ErrorAction Stop

if (-not (Test-Path $python)) {
    Write-Host "    Creando entorno virtual..." -ForegroundColor DarkGray
    python -m venv .venv
    & $python -m pip install --upgrade pip
    & $python -m pip install -r requirements.txt
    if ($LASTEXITCODE -ne 0) { throw "No se pudieron instalar las dependencias." }
} else {
    # Un entorno anterior a Alembic no tiene las dependencias nuevas.
    & $python -c "import alembic, psycopg" 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "    Actualizando dependencias (alembic, psycopg)..." -ForegroundColor DarkGray
        & $python -m pip install -r requirements.txt
        if ($LASTEXITCODE -ne 0) { throw "No se pudieron instalar las dependencias." }
    }
}

if (-not (Test-Path ".\.env")) {
    throw ("Falta backend\.env. Copie backend\.env.example o deploy\.env.production.example, " +
           "defina SECRET_KEY (>= 32 caracteres), CORS_ORIGINS y GOOGLE_CLIENT_ID, y vuelva a ejecutar.")
}

# Solo para este proceso: pisan lo que diga backend\.env.
$env:ENVIRONMENT = "production"
$env:ALLOW_DEV_LOGIN = "false"

Write-Host "==> Verificando configuracion..." -ForegroundColor Cyan
& $python -m app.cli check-config
if ($LASTEXITCODE -ne 0) { throw "Configuracion insegura para produccion: corrija backend\.env." }

Write-Host "==> Verificando frontend compilado..." -ForegroundColor Cyan
$dist = $env:FRONTEND_DIST
if (-not $dist) { $dist = Join-Path $frontend "dist" }
if (-not (Test-Path (Join-Path $dist "index.html"))) {
    if ($SkipBuild) { throw "No existe $dist\index.html y se pidio -SkipBuild." }
    Write-Host "    Compilando frontend (npm ci + npm run build)..." -ForegroundColor DarkGray
    Set-Location $frontend
    if (-not (Test-Path ".\node_modules")) {
        npm ci --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw "npm ci fallo." }
    }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "La compilacion del frontend fallo." }
    Set-Location $backend
}

Write-Host "==> Aplicando migraciones (Alembic)..." -ForegroundColor Cyan
& $python -m app.migrations
if ($LASTEXITCODE -ne 0) { throw "La migracion de la base fallo; no se arranca el servidor." }

Write-Host "==> Iniciando servidor de produccion en http://${BindHost}:${Port} ..." -ForegroundColor Green
& $python -m uvicorn app.main:app --host $BindHost --port $Port --workers 1 `
    --proxy-headers --forwarded-allow-ips 127.0.0.1 --timeout-graceful-shutdown 30
