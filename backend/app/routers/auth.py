"""Autenticacion: login con Google (dominio @iets.org.co) y login de desarrollo."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import audit, rbac
from ..config import settings
from ..database import get_db
from ..deps import get_current_user
from ..models import User
from ..schemas import DevLoginIn, GoogleLoginIn, TokenOut, UserOut
from ..security import create_access_token

router = APIRouter(prefix="/api/auth", tags=["auth"])


def user_out(user: User) -> UserOut:
    """Serializa el usuario con su matriz de permisos resuelta."""
    out = UserOut.model_validate(user)
    out.role = rbac.canonical_role(user.role)
    out.role_label = rbac.role_label(user.role)
    out.permissions = sorted(rbac.permissions_for(user.role))
    out.rateable_criteria = sorted(rbac.rateable_criteria(user))
    return out


def _resolve_role(db: Session, email: str, *, dev: bool = False) -> str:
    email = email.lower()
    if email in settings.admin_emails_list:
        return rbac.SUPERADMIN
    # El primer usuario del sistema se convierte en superadministrador.
    if db.query(User).count() == 0:
        return rbac.SUPERADMIN
    # En desarrollo local los usuarios nuevos operan el pipeline metodologico.
    if dev and settings.allow_dev_login:
        return rbac.EVALUADOR_TECNICO
    return rbac.TOMADOR_DECISIONES


def _get_or_create_user(
    db: Session, email: str, name: str, picture: str, *, dev: bool = False
) -> User:
    email = email.lower().strip()
    domain = email.split("@")[-1] if "@" in email else ""
    if domain != settings.allowed_email_domain.lower():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Solo se permiten cuentas institucionales @{settings.allowed_email_domain}",
        )
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        user = User(
            email=email,
            name=name or email.split("@")[0],
            picture=picture or "",
            role=_resolve_role(db, email, dev=dev),
            is_active=True,
        )
        db.add(user)
    else:
        if name:
            user.name = name
        if picture:
            user.picture = picture
        # Normaliza roles heredados y reafirma el superadministrador declarado.
        canonical = rbac.canonical_role(user.role)
        if user.role != canonical:
            user.role = canonical
        if email in settings.admin_emails_list and user.role != rbac.SUPERADMIN:
            user.role = rbac.SUPERADMIN
        elif dev and settings.allow_dev_login and user.role == rbac.TOMADOR_DECISIONES:
            user.role = rbac.EVALUADOR_TECNICO
    user.last_login = datetime.now(timezone.utc)
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuario desactivado")
    # El alta y la actualizacion del perfil ocurren antes de que exista un
    # principal autenticado. Sin esto, el inicio de sesion quedaria atribuido al
    # sistema y la bitacora no diria quien entro.
    audit.set_user_context(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/google", response_model=TokenOut)
def login_google(payload: GoogleLoginIn, db: Session = Depends(get_db)):
    if not settings.google_client_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Login con Google no configurado (falta GOOGLE_CLIENT_ID).",
        )
    try:
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token

        info = id_token.verify_oauth2_token(
            payload.credential,
            google_requests.Request(),
            settings.google_client_id,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Credencial de Google invalida: {exc}",
        )

    email = info.get("email", "")
    if not info.get("email_verified", False):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Correo no verificado por Google")

    user = _get_or_create_user(db, email, info.get("name", ""), info.get("picture", ""))
    token = create_access_token(user.email, {"role": user.role})
    return TokenOut(access_token=token, user=user_out(user))


@router.post("/dev-login", response_model=TokenOut)
def dev_login(payload: DevLoginIn, db: Session = Depends(get_db)):
    if not settings.allow_dev_login:
        # Un intento con el acceso de desarrollo deshabilitado queda registrado
        # (criterio de aceptacion de la fase 0).
        audit.record_action(
            db,
            entity_type="auth",
            entity_id=payload.email or "desconocido",
            action="auth:dev_login_denied",
            new_value={"email": payload.email},
        )
        db.commit()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Login de desarrollo deshabilitado")
    user = _get_or_create_user(db, payload.email, payload.name, "", dev=True)
    token = create_access_token(user.email, {"role": user.role})
    return TokenOut(access_token=token, user=user_out(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user_out(user)
