"""Autenticacion: correo y contrasena, Google (dominio institucional) y acceso de desarrollo.

- `POST /api/auth/login`: cuentas creadas por el superadministrador, con bloqueo
  por intentos fallidos y limite por IP. Es el acceso de produccion mientras el
  inicio de sesion con Google no este habilitado.
- `POST /api/auth/google`: se activa solo con GOOGLE_CLIENT_ID.
- `POST /api/auth/dev-login`: sin contrasena, solo fuera de produccion.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from .. import audit, rbac
from ..config import settings
from ..database import get_db
from ..deps import get_current_user
from ..firestore_directory import resolve_name
from ..models import User
from ..ratelimit import login_limiter
from ..schemas import (
    DevLoginIn,
    GoogleLoginIn,
    PasswordChangeIn,
    PasswordLoginIn,
    TokenOut,
    UserOut,
)
from ..security import (
    burn_verify_time,
    create_session_token,
    hash_password,
    password_problems,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

GENERIC_LOGIN_ERROR = "Correo o contraseña incorrectos."


def _as_utc(value: datetime | None) -> datetime | None:
    """SQLite devuelve fechas sin zona; se interpretan como UTC."""
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def user_out(user: User) -> UserOut:
    """Serializa el usuario con su matriz de permisos resuelta."""
    full, first, last = resolve_name(email=user.email, leftover=user.name, incoming="")
    out = UserOut.model_validate(user)
    out.name = full or user.name
    out.first_name = first or getattr(user, "first_name", "") or ""
    out.last_name = last or getattr(user, "last_name", "") or ""
    out.role = rbac.canonical_role(user.role)
    out.role_label = rbac.role_label(user.role)
    out.permissions = sorted(rbac.permissions_for(user.role))
    out.rateable_criteria = sorted(rbac.rateable_criteria(user))
    out.has_password = bool(user.password_hash)
    out.must_change_password = bool(user.must_change_password)
    locked = _as_utc(user.locked_until)
    out.locked_until = locked if locked and locked > datetime.now(timezone.utc) else None
    out.failed_logins = int(user.failed_logins or 0)
    return out


def _resolve_role(db: Session, email: str, *, dev: bool = False) -> str:
    email = email.lower()
    if email in settings.admin_emails_list:
        return rbac.SUPERADMIN
    # El primer usuario del sistema se convierte en superadministrador.
    if db.query(User).count() == 0:
        return rbac.SUPERADMIN
    # En desarrollo local los usuarios nuevos operan el pipeline metodologico.
    if dev and settings.dev_login_enabled:
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
    leftover = ""
    user = db.query(User).filter(User.email == email).first()
    if user is not None:
        leftover = user.name or ""
    full, first, last = resolve_name(email=email, leftover=leftover, incoming=name)
    if user is None:
        user = User(
            email=email,
            name=full,
            first_name=first,
            last_name=last,
            picture=picture or "",
            role=_resolve_role(db, email, dev=dev),
            is_active=True,
        )
        db.add(user)
    else:
        user.name = full
        user.first_name = first
        user.last_name = last
        if picture:
            user.picture = picture
        # Normaliza roles heredados y reafirma el superadministrador declarado.
        # El perfil asignado por el administrador jamas se modifica al ingresar:
        # promoverlo aqui seria una escalada de privilegios silenciosa.
        canonical = rbac.canonical_role(user.role)
        if user.role != canonical:
            user.role = canonical
        if email in settings.admin_emails_list and user.role != rbac.SUPERADMIN:
            user.role = rbac.SUPERADMIN
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuario desactivado")
    user.last_login = datetime.now(timezone.utc)
    # El alta y la actualizacion del perfil ocurren antes de que exista un
    # principal autenticado. Sin esto, el inicio de sesion quedaria atribuido al
    # sistema y la bitacora no diria quien entro.
    audit.set_user_context(user)
    db.commit()
    db.refresh(user)
    return user


class _AnonymousAttempt:
    """Actor de un intento sin cuenta valida: la bitacora dice quien dijo ser."""

    id = None
    role = ""

    def __init__(self, email: str) -> None:
        self.email = f"anonimo:{email or 'sin-correo'}"


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "desconocida"


@router.post("/login", response_model=TokenOut)
def login_password(payload: PasswordLoginIn, request: Request, db: Session = Depends(get_db)):
    """Acceso con correo y contrasena, con bloqueo progresivo y bitacora."""
    ip = _client_ip(request)
    if not login_limiter.allow(ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Demasiados intentos desde esta conexión. Espere unos minutos e intente de nuevo.",
            headers={"Retry-After": str(login_limiter.retry_after(ip))},
        )

    email = payload.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    now = datetime.now(timezone.utc)

    if user is None or not user.password_hash:
        burn_verify_time(payload.password)
        audit.set_user_context(user or _AnonymousAttempt(email))
        audit.record_action(
            db,
            entity_type="auth",
            entity_id=email or "desconocido",
            action="auth:login_failed",
            new_value={"email": email, "reason": "sin_cuenta_o_sin_contrasena"},
        )
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=GENERIC_LOGIN_ERROR)

    audit.set_user_context(user)
    locked = _as_utc(user.locked_until)
    if locked and locked > now:
        minutes = max(1, int((locked - now).total_seconds() // 60) + 1)
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail=(
                f"Cuenta bloqueada temporalmente por intentos fallidos. Intente en {minutes} "
                "minuto(s) o pida al administrador que la desbloquee."
            ),
        )

    if not verify_password(payload.password, user.password_hash):
        user.failed_logins = int(user.failed_logins or 0) + 1
        detail = GENERIC_LOGIN_ERROR
        if user.failed_logins >= settings.login_max_attempts:
            user.locked_until = now + timedelta(minutes=settings.login_lockout_minutes)
            user.failed_logins = 0
            audit.record_action(
                db,
                entity_type="users",
                entity_id=str(user.id),
                action="auth:locked",
                new_value={"email": user.email, "minutes": settings.login_lockout_minutes},
            )
            detail = (
                f"Cuenta bloqueada por {settings.login_lockout_minutes} minutos tras "
                f"{settings.login_max_attempts} intentos fallidos."
            )
        else:
            remaining = settings.login_max_attempts - user.failed_logins
            if remaining <= 2:
                detail = f"{GENERIC_LOGIN_ERROR} Le quedan {remaining} intento(s) antes del bloqueo."
        audit.record_action(
            db,
            entity_type="users",
            entity_id=str(user.id),
            action="auth:login_failed",
            new_value={"email": user.email, "reason": "contrasena"},
        )
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuario desactivado. Contacte al administrador.")

    user.failed_logins = 0
    user.locked_until = None
    user.last_login = now
    canonical = rbac.canonical_role(user.role)
    if user.role != canonical:
        user.role = canonical
    audit.record_action(
        db,
        entity_type="users",
        entity_id=str(user.id),
        action="auth:login",
        new_value={"email": user.email, "method": "password"},
    )
    db.commit()
    db.refresh(user)
    return TokenOut(access_token=create_session_token(user), user=user_out(user))


@router.post("/change-password", response_model=TokenOut)
def change_password(
    payload: PasswordChangeIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Cambia la contrasena propia. Invalida las demas sesiones abiertas."""
    if user.password_hash and not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La contraseña actual no es correcta.")
    if payload.new_password == payload.current_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La nueva contraseña debe ser distinta de la actual.",
        )
    problems = password_problems(payload.new_password, email=user.email)
    if problems:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=" ".join(problems))
    user.password_hash = hash_password(payload.new_password)
    user.must_change_password = False
    user.password_changed_at = datetime.now(timezone.utc)
    user.token_version = int(user.token_version or 0) + 1
    audit.record_action(
        db,
        entity_type="users",
        entity_id=str(user.id),
        action="auth:password_changed",
        new_value={"email": user.email},
    )
    db.commit()
    db.refresh(user)
    return TokenOut(access_token=create_session_token(user), user=user_out(user))


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
            detail=f"Credencial de Google inválida: {exc}",
        )

    email = info.get("email", "")
    if not info.get("email_verified", False):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Correo no verificado por Google")

    incoming = " ".join(
        part for part in (info.get("given_name") or "", info.get("family_name") or "") if part
    ) or info.get("name", "")
    user = _get_or_create_user(db, email, incoming, info.get("picture", ""))
    return TokenOut(access_token=create_session_token(user), user=user_out(user))


@router.post("/dev-login", response_model=TokenOut)
def dev_login(payload: DevLoginIn, db: Session = Depends(get_db)):
    if not settings.dev_login_enabled:
        # Un intento con el acceso de desarrollo deshabilitado queda registrado
        # (criterio de aceptacion de la fase 0).
        audit.set_user_context(_AnonymousAttempt(payload.email))
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
    return TokenOut(access_token=create_session_token(user), user=user_out(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user_out(user)
