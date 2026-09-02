"""Estado del sistema y version de estado para tiempo real."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import __version__, gemini_service
from ..config import settings
from ..database import get_db
from ..deps import get_current_user
from ..events import get_state_version
from ..models import User
from ..schemas import StateVersionOut, SystemStatus

router = APIRouter(prefix="/api", tags=["system"])


@router.get("/status", response_model=SystemStatus)
def system_status():
    return SystemStatus(
        gemini_enabled=gemini_service.is_enabled(),
        gemini_model=gemini_service.current_model(),
        google_login_enabled=bool(settings.google_client_id),
        google_client_id=settings.google_client_id,
        dev_login_enabled=settings.allow_dev_login,
        allowed_domain=settings.allowed_email_domain,
        version=__version__,
        recaptcha_site_key=settings.recaptcha_site_key,
    )


@router.get("/realtime/version", response_model=StateVersionOut)
def realtime_version(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return StateVersionOut(**get_state_version(db))
