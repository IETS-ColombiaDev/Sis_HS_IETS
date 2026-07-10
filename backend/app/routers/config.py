"""Panel de configuracion del sistema (solo administradores).

Permite gestionar la API key de Gemini y el modelo preferido desde la interfaz,
probar la conexion y consultar el estado general del sistema.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import __version__, gemini_service, settings_store
from ..config import settings
from ..database import get_db
from ..deps import require_role
from ..models import Finding, Source, User
from ..schemas import ConfigOut, ConfigUpdate, GeminiTestIn, GeminiTestOut

router = APIRouter(prefix="/api/config", tags=["config"])


def _mask(key: str) -> str:
    if not key:
        return ""
    if len(key) <= 8:
        return "****"
    return f"{key[:4]}{'*' * 8}{key[-4:]}"


def _build_config_out(db: Session) -> ConfigOut:
    key = gemini_service.get_api_key()
    enabled = gemini_service.is_enabled()
    return ConfigOut(
        gemini_enabled=enabled,
        gemini_has_key=gemini_service.has_key(),
        gemini_key_masked=_mask(key),
        gemini_model=settings_store.get_value(db, settings_store.GEMINI_MODEL, ""),
        gemini_active_model=gemini_service.current_model() if enabled else "",
        available_models=gemini_service.list_available_models() if enabled else [],
        google_login_enabled=bool(settings.google_client_id),
        dev_login_enabled=settings.allow_dev_login,
        allowed_domain=settings.allowed_email_domain,
        total_sources=db.query(Source).count(),
        total_findings=db.query(Finding).count(),
        version=__version__,
    )


@router.get("", response_model=ConfigOut)
def get_config(db: Session = Depends(get_db), user: User = Depends(require_role("admin"))):
    return _build_config_out(db)


@router.put("", response_model=ConfigOut)
def update_config(
    payload: ConfigUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin")),
):
    if payload.gemini_api_key is not None:
        settings_store.set_value(db, settings_store.GEMINI_API_KEY, payload.gemini_api_key.strip())
    if payload.gemini_model is not None:
        settings_store.set_value(db, settings_store.GEMINI_MODEL, payload.gemini_model.strip())

    api_key, model = settings_store.load_gemini_config(db)
    gemini_service.configure_runtime(api_key=api_key, model=model)
    return _build_config_out(db)


@router.post("/test", response_model=GeminiTestOut)
def test_gemini(
    payload: GeminiTestIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin")),
):
    result = gemini_service.test_connection(api_key=payload.gemini_api_key)
    return GeminiTestOut(
        ok=result.get("ok", False),
        message=result.get("message", ""),
        model=result.get("model", ""),
        available_models=result.get("available_models", []),
    )
