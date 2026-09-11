"""Punto de entrada de la API del Sistema de Escaneo de Horizonte del IETS."""
from __future__ import annotations

import logging
import mimetypes
import os
from contextlib import asynccontextmanager
from pathlib import Path

# En Windows el registro suele mapear .js -> text/plain, lo que impide que el
# navegador ejecute los modulos ES (pantalla en blanco). Forzamos los MIME correctos.
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("application/javascript", ".mjs")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("image/svg+xml", ".svg")

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import __version__, ai_service, audit, methodology, settings_store
from .config import settings
from .database import (
    Base,
    SessionLocal,
    engine,
    ensure_pg_extensions,
    harden_audit_log,
    run_schema_migrations,
)
from .routers import (
    audit as audit_router,
    auth,
    catalogs,
    chat,
    config as config_router,
    cycles,
    dashboard,
    findings,
    evaluation,
    ingest,
    invima,
    notes,
    priority,
    public_catalog,
    recommendations,
    review_portal,
    scan,
    screening,
    sources,
    strategy,
    submissions,
    system,
    technologies,
    users,
)
from .catalog_service import sync_catalog
from .technology_service import backfill_technologies

# FRONTEND_DIST permite servir otra compilacion (contenedor, QA aislado).
FRONTEND_DIST = Path(
    os.environ.get("FRONTEND_DIST")
    or Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
)

log = logging.getLogger(__name__)


def seed_sources_if_empty() -> None:
    """Carga o actualiza el catalogo verificado D-06. Es idempotente."""
    db = SessionLocal()
    try:
        sync_catalog(db, triggered_by="arranque")
    finally:
        db.close()


def load_runtime_config() -> None:
    """Carga MiniMax / Gemini / OCR persistidos (BD pisa al .env)."""
    db = SessionLocal()
    try:
        cfg = settings_store.load_ai_config(db)
        ai_service.configure_runtime(
            provider=str(cfg["provider"]),
            ocr_enabled=bool(cfg["ocr_enabled"]),
            web_enabled=bool(cfg["web_enabled"]),
            minimax_api_key=str(cfg["minimax_api_key"]) or None,
            minimax_model=str(cfg["minimax_model"]) or None,
            gemini_api_key=str(cfg["gemini_api_key"]) or None,
            gemini_model=str(cfg["gemini_model"]) or None,
        )
    finally:
        db.close()


def backfill_screening_scores() -> None:
    """Recalcula el puntaje de cribado en senales existentes (idempotente)."""
    from .models import Finding
    from .priority import compute_screening_score

    db = SessionLocal()
    try:
        rows = db.query(Finding).all()
        changed = False
        for f in rows:
            score = compute_screening_score(
                horizon=f.horizon,
                technology_type=f.technology_type,
                phase=f.phase,
                therapeutic_area=f.therapeutic_area,
                summary=f.summary,
                technology=f.technology,
                title=f.title,
            )
            if f.screening_score != score:
                f.screening_score = score
                changed = True
        if changed:
            db.commit()
    finally:
        db.close()


def seed_methodology() -> None:
    """Carga catalogos y parametros metodologicos parametrizables (fases 1 y 2)."""
    db = SessionLocal()
    try:
        methodology.seed_catalogs(db)
    finally:
        db.close()


def migrate_to_technologies() -> None:
    """Proyecta las senales al modelo `Technology` y arma el ciclo historico."""
    db = SessionLocal()
    try:
        backfill_technologies(db)
    finally:
        db.close()


def seed_official_cycles() -> None:
    """Sincroniza los ciclos oficiales 2026 sin impedir nunca el arranque.

    Sobre una base nueva (primer despliegue) todavia no hay tecnologias
    suficientes para sembrarlos: el sistema debe arrancar igual y dejar que la
    coordinacion cree sus ciclos. SEED_OFFICIAL_CYCLES=false apaga la siembra.
    """
    # En produccion los ciclos los gobierna la coordinacion: la siembra solo corre
    # si se pide expresamente (SEED_OFFICIAL_CYCLES=true). En desarrollo, por defecto.
    default = "false" if settings.is_production else "true"
    if os.environ.get("SEED_OFFICIAL_CYCLES", default).strip().lower() in {"0", "false", "no"}:
        log.info("Siembra de ciclos oficiales desactivada (SEED_OFFICIAL_CYCLES=false).")
        return
    from .cycle_seed import sync_official_cycles

    db = SessionLocal()
    try:
        sync_official_cycles(db)
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        log.warning("Se omite la siembra de ciclos oficiales: %s", exc)
    finally:
        db.close()


def seed_api_sources() -> None:
    """Compatibilidad: el catalogo D-06 ya incluye las fuentes con contrato."""
    return

def assert_safe_configuration() -> None:
    """En produccion no se arranca con secretos por defecto (P0-3)."""
    problems = settings.production_problems()
    if problems:
        raise RuntimeError(
            "Configuración insegura para ENVIRONMENT=production:\n- " + "\n- ".join(problems)
        )
    if settings.allow_dev_login and settings.is_production:
        log.warning("ALLOW_DEV_LOGIN=true se ignora en produccion: el acceso de desarrollo queda apagado.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    assert_safe_configuration()
    ensure_pg_extensions()
    # Esquema versionado (P0-1): crea una base vacia con Alembic o marca en el
    # baseline una base anterior. create_all y las migraciones ligeras siguen
    # despues como red de seguridad idempotente.
    from .migrations import upgrade_database

    upgrade_database()
    Base.metadata.create_all(bind=engine)
    run_schema_migrations()
    harden_audit_log()
    # La bitacora se instala antes de cualquier siembra o migracion, de modo que
    # ninguna escritura quede fuera de la trazabilidad (principio 3 del plan).
    audit.install_listeners()
    seed_sources_if_empty()
    seed_methodology()
    load_runtime_config()
    from .settings_store import load_ingest_keys

    db = SessionLocal()
    try:
        keys = load_ingest_keys(db)
        if keys["openfda_api_key"]:
            settings.openfda_api_key = keys["openfda_api_key"]
        if keys["ncbi_api_key"]:
            settings.ncbi_api_key = keys["ncbi_api_key"]
        if keys["ncbi_email"]:
            settings.ncbi_email = keys["ncbi_email"]
    finally:
        db.close()
    backfill_screening_scores()
    migrate_to_technologies()
    seed_official_cycles()
    seed_api_sources()
    from .worker import start_worker, stop_worker

    start_worker()
    yield
    stop_worker()


app = FastAPI(
    title="Sistema de Escaneo de Horizonte del IETS",
    description=(
        "API del sistema de escaneo de horizonte (horizon scanning) del Instituto de "
        "Evaluación Tecnológica en Salud (IETS) de Colombia."
    ),
    version=__version__,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def audit_context_middleware(request: Request, call_next):
    """Abre el contexto de la bitacora: IP, ruta e identificador de peticion.

    Reserva tambien el contenedor del usuario, que `get_current_user` completa
    una vez validado el token (ver la nota de propagacion en `audit`).
    """
    client_ip = request.headers.get("x-forwarded-for", "") or (
        request.client.host if request.client else ""
    )
    request_id = audit.begin_request(
        ip=client_ip.split(",")[0].strip(),
        path=f"{request.method} {request.url.path}",
    )
    try:
        response = await call_next(request)
    finally:
        audit.clear_context()
    response.headers["X-Request-ID"] = request_id
    _apply_security_headers(request, response)
    return response


# Politica de contenido de la SPA: solo recursos propios mas los servicios de
# Google que la interfaz usa (Identity Services, reCAPTCHA y tipografia Inter).
# Los estilos en linea son necesarios porque React los emite como atributos.
_CSP = "; ".join(
    [
        "default-src 'self'",
        "script-src 'self' https://accounts.google.com https://www.google.com https://www.gstatic.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
        "font-src 'self' data: https://fonts.gstatic.com",
        "img-src 'self' data: blob: https:",
        "connect-src 'self' https://accounts.google.com",
        "frame-src https://accounts.google.com https://www.google.com",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
    ]
)
# La documentacion interactiva de FastAPI carga Swagger UI desde un CDN.
_CSP_EXEMPT = ("/docs", "/redoc", "/openapi.json")


def _apply_security_headers(request: Request, response) -> None:
    headers = response.headers
    headers.setdefault("X-Content-Type-Options", "nosniff")
    headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()")
    path = request.url.path
    if not path.startswith(_CSP_EXEMPT):
        headers.setdefault("X-Frame-Options", "DENY")
        if headers.get("content-type", "").startswith("text/html"):
            headers.setdefault("Content-Security-Policy", _CSP)
    if settings.is_production:
        headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    if path.startswith("/api/"):
        # Respuestas con datos del expediente: que ningun intermediario las guarde.
        headers.setdefault("Cache-Control", "no-store")


ROUTERS = (
    auth,
    system,
    config_router,
    sources,
    findings,
    scan,
    recommendations,
    chat,
    dashboard,
    users,
    notes,
    # Fases 0, 1 y 2 del plan de actualizacion
    audit_router,
    catalogs,
    cycles,
    technologies,
    priority,
    # Fase 3
    screening,
    invima,
    # Fase 4
    ingest,
    submissions,
    evaluation,
    review_portal,
    strategy,
    public_catalog,
)

for r in ROUTERS:
    app.include_router(r.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "iets-horizon-scanning", "version": __version__}


# --------------------------------------------------------------------------- #
#  Servir el frontend compilado (SPA) si existe.
# --------------------------------------------------------------------------- #
if FRONTEND_DIST.exists():
    app.mount(
        "/assets",
        StaticFiles(directory=str(FRONTEND_DIST / "assets")),
        name="assets",
    )

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa_fallback(full_path: str):
        if full_path.startswith("api/"):
            return JSONResponse({"detail": "Not Found"}, status_code=404)
        candidate = FRONTEND_DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(str(candidate))
        return FileResponse(str(FRONTEND_DIST / "index.html"))
