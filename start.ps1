# =============================================================================
#  Sistema de Escaneo de Horizonte del IETS - arranque rapido (Windows)
# =============================================================================
# Uso:   .\start.ps1
# Levanta el backend (que sirve el frontend compilado en http://127.0.0.1:8000).
# Para modo desarrollo con recarga en caliente, use dos terminales:
#   backend :  cd backend ; .\.venv\Scripts\Activate.ps1 ; uvicorn app.main:app --reload
#   frontend:  cd frontend ; npm run dev
# =============================================================================

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "==> Preparando backend..." -ForegroundColor Cyan
Set-Location "$root\backend"

if (-not (Test-Path ".\.venv")) {
    Write-Host "    Creando entorno virtual..." -ForegroundColor DarkGray
    python -m venv .venv
    .\.venv\Scripts\python.exe -m pip install --upgrade pip
    .\.venv\Scripts\python.exe -m pip install -r requirements.txt
}

if (-not (Test-Path ".\.env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "    Se creo backend\.env (edite GOOGLE_CLIENT_ID y GEMINI_API_KEY)." -ForegroundColor Yellow
}

Write-Host "==> Verificando frontend compilado..." -ForegroundColor Cyan
if (-not (Test-Path "$root\frontend\dist")) {
    Write-Host "    Compilando frontend (npm install + build)..." -ForegroundColor DarkGray
    Set-Location "$root\frontend"
    if (-not (Test-Path ".\node_modules")) { npm install }
    npm run build
    Set-Location "$root\backend"
}

Write-Host "==> Iniciando servidor en http://127.0.0.1:8000 ..." -ForegroundColor Green
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
