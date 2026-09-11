# =============================================================================
#  Respaldo de la base SQLite (despliegue en Windows sin contenedores)
# =============================================================================
# Uso, desde la raiz del repositorio:
#   .\deploy\backup.ps1
#   .\deploy\backup.ps1 -BackupDir D:\Respaldos\IETS -RetentionDays 30
#   .\deploy\backup.ps1 -DatabasePath C:\ruta\a\otra.db
#
# Sin -DatabasePath toma la base de DATABASE_URL en backend\.env (debe ser
# sqlite:///...). Para PostgreSQL use deploy/backup.sh.
#
# Usa la API de respaldo en linea de SQLite (sqlite3.Connection.backup): la
# copia es consistente aunque el servidor este en marcha, a diferencia de un
# Copy-Item del archivo. Luego verifica la copia con PRAGMA integrity_check y
# deja un .meta con la revision de Alembic y conteos de control.
#
# Programelo con el Programador de tareas, p. ej. a diario a las 02:30:
#   schtasks /Create /SC DAILY /ST 02:30 /TN "IETS Respaldo" /TR ^
#     "powershell -NoProfile -ExecutionPolicy Bypass -File C:\ruta\Sis_HS_IETS\deploy\backup.ps1"
# Restauracion: ver DEPLOY.md, "Respaldo y restauracion".
# =============================================================================
[CmdletBinding()]
param(
    [string]$DatabasePath = "",
    [string]$BackupDir = "",
    [int]$RetentionDays = 30
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root "backend"

if (-not $BackupDir) { $BackupDir = Join-Path $PSScriptRoot "backups" }

# --- Python: el del entorno virtual del backend o el del sistema -------------
$python = Join-Path $backend ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) { $python = "python" }

# --- Ruta de la base ----------------------------------------------------------
if (-not $DatabasePath) {
    $envFile = Join-Path $backend ".env"
    $url = "sqlite:///./iets_horizonte.db"
    if (Test-Path $envFile) {
        $line = Get-Content $envFile | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -Last 1
        if ($line) { $url = ($line -split '=', 2)[1].Trim().Trim('"').Trim("'") }
    }
    if ($env:DATABASE_URL) { $url = $env:DATABASE_URL }
    if (-not $url.StartsWith("sqlite:///")) {
        throw "DATABASE_URL no es SQLite ($($url.Split(':')[0])). Para PostgreSQL use deploy/backup.sh."
    }
    $rel = $url.Substring("sqlite:///".Length)
    if ([System.IO.Path]::IsPathRooted($rel)) {
        $DatabasePath = $rel
    } else {
        # Igual que la aplicacion: relativa a backend\ (carpeta desde la que arranca).
        $DatabasePath = Join-Path $backend ($rel -replace '^\./', '')
    }
}
$DatabasePath = [System.IO.Path]::GetFullPath($DatabasePath)
if (-not (Test-Path $DatabasePath)) { throw "No existe la base $DatabasePath" }

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$name = [System.IO.Path]::GetFileNameWithoutExtension($DatabasePath)
$target = Join-Path $BackupDir ("{0}_{1}.db" -f $name, $stamp)
$meta = [System.IO.Path]::ChangeExtension($target, ".meta")

Write-Host "==> Respaldo de $DatabasePath" -ForegroundColor Cyan
Write-Host "    en $target"

# Codigo Python sin comillas dobles: PowerShell 5.1 las altera al pasar
# argumentos a ejecutables nativos.
$code = @'
import pathlib, sqlite3, sys
src_path, dst_path, meta_path = sys.argv[1], sys.argv[2], sys.argv[3]
src = sqlite3.connect(pathlib.Path(src_path).resolve().as_uri() + '?mode=ro', uri=True)
dst = sqlite3.connect(dst_path)
with dst:
    src.backup(dst)
src.close()
ok = dst.execute('PRAGMA integrity_check').fetchone()[0]
tables = {r[0] for r in dst.execute('SELECT name FROM sqlite_master WHERE type=?', ('table',))}
lines = []
if 'alembic_version' in tables:
    rev = dst.execute('SELECT version_num FROM alembic_version').fetchone()
    lines.append('alembic_revision=' + (rev[0] if rev else ''))
else:
    lines.append('alembic_revision=sin_alembic')
for t in ('users', 'sources', 'findings', 'technologies', 'cycles', 'cycle_technologies',
          'priority_scores', 'evaluation_docs', 'audit_log', 'invima_records'):
    if t in tables:
        lines.append(t + '=' + str(dst.execute('SELECT count(*) FROM ' + t).fetchone()[0]))
dst.close()
lines.insert(0, 'integrity_check=' + ok)
open(meta_path, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
print('\n'.join(lines))
sys.exit(0 if ok == 'ok' else 2)
'@

# Con "Stop", PowerShell 5.1 convertiria cualquier linea de stderr de Python en
# error terminante; el resultado se juzga por el codigo de salida.
$ErrorActionPreference = "Continue"
& $python -c $code $DatabasePath $target $meta
$ErrorActionPreference = "Stop"
if ($LASTEXITCODE -ne 0) {
    Remove-Item -Force -ErrorAction SilentlyContinue $target
    throw "El respaldo fallo o no supero PRAGMA integrity_check (codigo $LASTEXITCODE)."
}

$sizeMb = [math]::Round((Get-Item $target).Length / 1MB, 1)
Write-Host "==> Listo: $target ($sizeMb MB)" -ForegroundColor Green

if ($RetentionDays -gt 0) {
    $limit = (Get-Date).AddDays(-$RetentionDays)
    Get-ChildItem -Path $BackupDir -File |
        Where-Object { ($_.Extension -eq ".db" -or $_.Extension -eq ".meta") -and $_.LastWriteTime -lt $limit } |
        ForEach-Object { Write-Host "    Retirando $($_.Name)"; Remove-Item -Force $_.FullName }
}
