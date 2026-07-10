"""Punto de entrada de la API del Sistema de Escaneo de Horizonte del IETS."""
from __future__ import annotations

import mimetypes
from contextlib import asynccontextmanager
from pathlib import Path

# En Windows el registro suele mapear .js -> text/plain, lo que impide que el
# navegador ejecute los modulos ES (pantalla en blanco). Forzamos los MIME correctos.
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("application/javascript", ".mjs")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("image/svg+xml", ".svg")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import __version__, gemini_service, settings_store
from .config import settings
from .database import Base, SessionLocal, engine
from .models import Source
from .routers import (
    auth,
    chat,
    config as config_router,
    dashboard,
    findings,
    notes,
    recommendations,
    scan,
    sources,
    system,
    users,
)
from .seed_data import all_seed_sources

FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"


def seed_sources_if_empty() -> None:
    db = SessionLocal()
    try:
        if db.query(Source).count() > 0:
            return
        for data in all_seed_sources():
            db.add(Source(**data))
        db.commit()
    finally:
        db.close()


def load_runtime_config() -> None:
    """Carga la config de Gemini persistida en la BD (tiene prioridad sobre el .env)."""
    db = SessionLocal()
    try:
        api_key, model = settings_store.load_gemini_config(db)
        if api_key or model:
            gemini_service.configure_runtime(
                api_key=api_key or None,
                model=model or None,
            )
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    seed_sources_if_empty()
    load_runtime_config()
    yield


app = FastAPI(
    title="Sistema de Escaneo de Horizonte del IETS",
    description=(
        "API del sistema de escaneo de horizonte (horizon scanning) del Instituto de "
        "Evaluacion Tecnologica en Salud (IETS) de Colombia."
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

for r in (auth, system, config_router, sources, findings, scan, recommendations, chat, dashboard, users, notes):
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
