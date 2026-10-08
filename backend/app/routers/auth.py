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
from ..database import get_db, run_with_db_retry
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


def user_out(user: User, *, use_directory: bool = True) -> UserOut:
    """Serializa el usuario con su matriz de permisos resuelta.

    `use_directory=False` en el login: evita una ida a Firestore que puede
    tardar varios segundos y hacer que la UI muestre error/timeout.
    """
    if use_directory:
        full, first, last = resolve_name(email=user.email, leftover=user.name, incoming="")
    else:
        full = user.name or ""
        first = getattr(user, "first_name", "") or ""
        last = getattr(user, "last_name", "") or ""
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


def _login_display_name(email: str, leftover: str, incoming: str) -> tuple[str, str, str]:
    """Nombre para el alta/login sin consultar Firestore (evita 5–15 s de espera)."""
    from ..firestore_directory import is_placeholder_name

    for candidate in (incoming, leftover):
        if candidate and not is_placeholder_name(candidate, email):
            return candidate.strip(), "", ""
    local = email.split("@")[0].replace(".", " ").strip()
    return local, "", ""


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
    now = datetime.now(timezone.utc)
    if user is None:
        full, first, last = _login_display_name(email, "", name)
        user = User(
            email=email,
            name=full,
            first_name=first,
            last_name=last,
            picture=picture or "",
            role=_resolve_role(db, email, dev=dev),
            is_active=True,
            last_login=now,
        )
        db.add(user)
    else:
        if not user.is_active:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuario desactivado")
        # Camino rapido: no reescribir perfil ni tocar Firestore en cada ingreso.
        user.last_login = now
        canonical = rbac.canonical_role(user.role)
        if user.role != canonical:
            user.role = canonical
        if email in settings.admin_emails_list and user.role != rbac.SUPERADMIN:
            user.role = rbac.SUPERADMIN
        if picture and picture != (user.picture or ""):
            user.picture = picture
        if name and not (user.name or "").strip():
            full, first, last = _login_display_name(email, user.name or "", name)
            user.name = full
            user.first_name = first
            user.last_name = last
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuario desactivado")
    audit.set_user_context(user)
    try:
        db.commit()
        db.refresh(user)
    except Exception as exc:
        from ..database import is_lock_error

        # Usuario ya existente: no bloquear el ingreso si SQLite esta ocupado.
        db.rollback()
        if user.id is None or not is_lock_error(exc):
            raise
        db.expire_all()
        user = db.query(User).filter(User.email == email).first()
        if user is None or not user.is_active:
            raise
        audit.set_user_context(user)
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

        def _fail_unknown() -> None:
            audit.set_user_context(user or _AnonymousAttempt(email))
            audit.record_action(
                db,
                entity_type="auth",
                entity_id=email or "desconocido",
                action="auth:login_failed",
                new_value={"email": email, "reason": "sin_cuenta_o_sin_contrasena"},
            )
            db.commit()

        try:
            run_with_db_retry(db, _fail_unknown)
        except Exception:  # noqa: BLE001
            # No convertir un bloqueo de bitácora en 500: el acceso sigue denegado.
            try:
                db.rollback()
            except Exception:  # noqa: BLE001
                pass
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
        detail = GENERIC_LOGIN_ERROR
        user_id = user.id
        user_email = user.email

        def _fail_password() -> str:
            u = db.query(User).filter(User.email == email).first()
            if u is None:
                return GENERIC_LOGIN_ERROR
            u.failed_logins = int(u.failed_logins or 0) + 1
            msg = GENERIC_LOGIN_ERROR
            if u.failed_logins >= settings.login_max_attempts:
                u.locked_until = now + timedelta(minutes=settings.login_lockout_minutes)
                u.failed_logins = 0
                audit.record_action(
                    db,
                    entity_type="users",
                    entity_id=str(user_id),
                    action="auth:locked",
                    new_value={"email": user_email, "minutes": settings.login_lockout_minutes},
                )
                msg = (
                    f"Cuenta bloqueada por {settings.login_lockout_minutes} minutos tras "
                    f"{settings.login_max_attempts} intentos fallidos."
                )
            else:
                remaining = settings.login_max_attempts - u.failed_logins
                if remaining <= 2:
                    msg = f"{GENERIC_LOGIN_ERROR} Le quedan {remaining} intento(s) antes del bloqueo."
            audit.record_action(
                db,
                entity_type="users",
                entity_id=str(user_id),
                action="auth:login_failed",
                new_value={"email": user_email, "reason": "contrasena"},
            )
            db.commit()
            return msg

        try:
            detail = run_with_db_retry(db, _fail_password)
        except Exception:  # noqa: BLE001
            try:
                db.rollback()
            except Exception:  # noqa: BLE001
                pass
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuario desactivado. Contacte al administrador.")

    def _complete() -> User:
        u = db.query(User).filter(User.email == email).first()
        if u is None or not u.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Usuario desactivado. Contacte al administrador.",
            )
        u.failed_logins = 0
        u.locked_until = None
        u.last_login = now
        canonical = rbac.canonical_role(u.role)
        if u.role != canonical:
            u.role = canonical
        audit.set_user_context(u)
        audit.record_action(
            db,
            entity_type="users",
            entity_id=str(u.id),
            action="auth:login",
            new_value={"email": u.email, "method": "password"},
        )
        db.commit()
        db.refresh(u)
        return u

    user = run_with_db_retry(db, _complete)
    return TokenOut(access_token=create_session_token(user), user=user_out(user, use_directory=False))


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
    user = run_with_db_retry(
        db,
        lambda: _get_or_create_user(db, email, incoming, info.get("picture", "")),
    )
    return TokenOut(access_token=create_session_token(user), user=user_out(user, use_directory=False))


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

    def _do() -> User:
        return _get_or_create_user(db, payload.email, payload.name, "", dev=True)

    user = run_with_db_retry(db, _do)
    return TokenOut(access_token=create_session_token(user), user=user_out(user, use_directory=False))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    # Sin Firestore: /me se llama al cargar la app y no debe retrasar la entrada.
    return user_out(user, use_directory=False)
