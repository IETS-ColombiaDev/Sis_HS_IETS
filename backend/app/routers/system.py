"""Estado del sistema y version de estado para tiempo real."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import __version__, ai_service
from ..config import settings
from ..database import get_db
from ..deps import get_current_user
from ..events import get_state_version
from ..models import User
from ..schemas import StateVersionOut, SystemStatus

router = APIRouter(prefix="/api", tags=["system"])


@router.get("/status", response_model=SystemStatus)
def system_status():
    enabled = ai_service.is_enabled()
    model = ai_service.current_model() if enabled else ""
    provider = ai_service.active_provider()
    return SystemStatus(
        gemini_enabled=enabled,
        gemini_model=model,
        google_login_enabled=bool(settings.google_client_id),
        google_client_id=settings.google_client_id,
        dev_login_enabled=settings.dev_login_enabled,
        password_login_enabled=True,
        password_min_length=settings.password_min_length,
        environment="production" if settings.is_production else settings.environment.strip().lower(),
        allowed_domain=settings.allowed_email_domain,
        version=__version__,
        recaptcha_site_key=settings.recaptcha_site_key,
        ai_enabled=enabled,
        ai_provider=provider,
        ai_model=model,
        ai_ocr_enabled=ai_service.ocr_enabled(),
        ai_web_enabled=ai_service.web_assist_enabled(),
    )


@router.get("/realtime/version", response_model=StateVersionOut)
def realtime_version(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return StateVersionOut(**get_state_version(db))
