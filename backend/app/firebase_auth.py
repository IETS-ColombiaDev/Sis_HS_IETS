"""Cuenta de servicio de Firebase/Firestore compartida (directorio RRHH y base)."""
from __future__ import annotations

import json
import logging
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2 import service_account

from .config import settings

log = logging.getLogger(__name__)

_SCOPES = (
    "https://www.googleapis.com/auth/datastore",
    "https://www.googleapis.com/auth/cloud-platform",
)
_creds = None


def sibling_rrhh_env() -> Path:
    explicit = (getattr(settings, "firebase_rrhh_env_file", "") or "").strip()
    if explicit:
        return Path(explicit)
    return Path(__file__).resolve().parents[3] / "RRHH" / "frontend" / ".env.local"


def load_service_account() -> dict | None:
    raw = (settings.firebase_service_account_key or "").strip()
    if raw:
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            log.warning("FIREBASE_SERVICE_ACCOUNT_KEY no es un JSON valido")
    path = (settings.firebase_service_account_file or "").strip()
    if path and Path(path).is_file():
        return json.loads(Path(path).read_text(encoding="utf-8"))
    env_path = sibling_rrhh_env()
    if env_path.is_file():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            if line.startswith("FIREBASE_SERVICE_ACCOUNT_KEY="):
                payload = line.split("=", 1)[1].strip()
                if payload:
                    return json.loads(payload)
    return None


def project_id(info: dict | None = None) -> str:
    info = info if info is not None else load_service_account()
    return (settings.firebase_project_id or "").strip() or (info or {}).get("project_id") or ""


def configured() -> bool:
    return bool(load_service_account() and project_id())


def access_token(info: dict | None = None) -> str:
    global _creds
    info = info or load_service_account()
    if not info:
        raise RuntimeError("No hay cuenta de servicio de Firebase")
    if _creds is None:
        _creds = service_account.Credentials.from_service_account_info(info, scopes=_SCOPES)
    if not _creds.valid:
        _creds.refresh(Request())
    return _creds.token
