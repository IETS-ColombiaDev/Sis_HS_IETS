"""Panel de configuracion del sistema (solo administradores).

Gestiona MiniMax (IA principal), Gemini (respaldo), OCR de sitios y
llaves de fuentes de nivel A.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import __version__, ai_service, gemini_service, minimax_service, settings_store
from ..config import settings


def _apply_ingest_keys(db: Session) -> None:
    keys = settings_store.load_ingest_keys(db)
    if keys["openfda_api_key"]:
        settings.openfda_api_key = keys["openfda_api_key"]
    if keys["ncbi_api_key"]:
        settings.ncbi_api_key = keys["ncbi_api_key"]
    if keys["ncbi_email"]:
        settings.ncbi_email = keys["ncbi_email"]
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


def _apply_ai_runtime(db: Session) -> None:
    cfg = settings_store.load_ai_config(db)
    ai_service.configure_runtime(
        provider=str(cfg["provider"]),
        ocr_enabled=bool(cfg["ocr_enabled"]),
        web_enabled=bool(cfg["web_enabled"]),
        minimax_api_key=str(cfg["minimax_api_key"]),
        minimax_model=str(cfg["minimax_model"]),
        gemini_api_key=str(cfg["gemini_api_key"]),
        gemini_model=str(cfg["gemini_model"]),
    )


def _build_config_out(db: Session) -> ConfigOut:
    cfg = settings_store.load_ai_config(db)
    ingest = settings_store.load_ingest_keys(db)
    openfda = ingest["openfda_api_key"] or settings.openfda_api_key
    ncbi = ingest["ncbi_api_key"] or settings.ncbi_api_key
    email = ingest["ncbi_email"] or settings.ncbi_email
    enabled = ai_service.is_enabled()
    gemini_on = gemini_service.is_enabled()
    minimax_on = minimax_service.is_enabled()
    return ConfigOut(
        gemini_enabled=enabled,
        gemini_has_key=gemini_service.has_key(),
        gemini_key_masked=_mask(gemini_service.get_api_key()),
        gemini_model=str(cfg["gemini_model"]),
        gemini_active_model=gemini_service.current_model() if gemini_on else "",
        available_models=gemini_service.list_available_models() if gemini_on else [],
        google_login_enabled=bool(settings.google_client_id),
        dev_login_enabled=settings.allow_dev_login,
        allowed_domain=settings.allowed_email_domain,
        total_sources=db.query(Source).count(),
        total_findings=db.query(Finding).count(),
        version=__version__,
        openfda_has_key=bool(openfda),
        ncbi_has_key=bool(ncbi),
        ncbi_email=email,
        ai_enabled=enabled,
        ai_provider=str(cfg["provider"] or "auto"),
        ai_active_provider=ai_service.active_provider(),
        ai_model=ai_service.current_model() if enabled else "",
        ai_ocr_enabled=bool(cfg["ocr_enabled"]),
        ai_web_enabled=bool(cfg["web_enabled"]),
        minimax_has_key=minimax_service.has_key(),
        minimax_key_masked=_mask(minimax_service.get_api_key()),
        minimax_model=str(cfg["minimax_model"]),
        minimax_active_model=minimax_service.current_model() if minimax_on else "",
        minimax_available_models=minimax_service.list_available_models() if minimax_on else minimax_service.list_catalog_models(),
        minimax_vision_model=minimax_service.vision_model() if minimax_on else "MiniMax-M3",
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
    if payload.minimax_api_key is not None:
        settings_store.set_value(db, settings_store.MINIMAX_API_KEY, payload.minimax_api_key.strip())
    if payload.minimax_model is not None:
        settings_store.set_value(db, settings_store.MINIMAX_MODEL, payload.minimax_model.strip())
    if payload.ai_provider is not None:
        settings_store.set_value(db, settings_store.AI_PROVIDER, (payload.ai_provider or "auto").strip().lower())
    if payload.ai_ocr_enabled is not None:
        settings_store.set_value(db, settings_store.AI_OCR_ENABLED, "true" if payload.ai_ocr_enabled else "false")
    if payload.ai_web_enabled is not None:
        settings_store.set_value(db, settings_store.AI_WEB_ENABLED, "true" if payload.ai_web_enabled else "false")
    if payload.openfda_api_key is not None:
        settings_store.set_value(db, settings_store.OPENFDA_API_KEY, payload.openfda_api_key.strip())
    if payload.ncbi_api_key is not None:
        settings_store.set_value(db, settings_store.NCBI_API_KEY, payload.ncbi_api_key.strip())
    if payload.ncbi_email is not None:
        settings_store.set_value(db, settings_store.NCBI_EMAIL, payload.ncbi_email.strip())

    _apply_ai_runtime(db)
    _apply_ingest_keys(db)
    return _build_config_out(db)


@router.post("/test", response_model=GeminiTestOut)
def test_ai(
    payload: GeminiTestIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin")),
):
    who = (payload.provider or ai_service.active_provider() or "minimax").lower()
    key = payload.minimax_api_key if who == "minimax" else payload.gemini_api_key
    if who != "minimax" and payload.gemini_api_key:
        key = payload.gemini_api_key
    if who == "minimax" and not key and payload.minimax_api_key:
        key = payload.minimax_api_key
    result = ai_service.test_connection(provider_name=who, api_key=key)
    return GeminiTestOut(
        ok=result.get("ok", False),
        message=result.get("message", ""),
        model=result.get("model", ""),
        available_models=result.get("available_models", []),
        provider=result.get("provider", who),
    )


@router.post("/detect-models", response_model=GeminiTestOut)
def detect_models(
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin")),
):
    result = ai_service.detect_best_models()
    return GeminiTestOut(
        ok=result.get("ok", False),
        message=(
            f"Mejor modelo disponible: {result.get('model')}"
            if result.get("model")
            else "No se pudo detectar un modelo MiniMax."
        ),
        model=result.get("model", ""),
        available_models=result.get("available_models", []),
        provider="minimax",
    )
