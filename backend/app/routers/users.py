"""Administracion de usuarios y perfiles RBAC (solo superadministradores).

CRUD completo con salvaguardas de gobierno:
- nunca queda el sistema sin un superadministrador activo;
- nadie se quita a si mismo el perfil ni se desactiva;
- una cuenta con actividad registrada no se elimina (se desactiva), para no
  romper la trazabilidad de la bitacora;
- las contrasenas temporales se entregan una sola vez y obligan a cambiarlas.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from .. import audit, rbac
from ..database import get_db
from ..deps import get_current_user, require_permission
from ..models import AlertEvent, AlertSubscription, AuditLog, User
from ..rbac import P_USER_MANAGE
from ..schemas import (
    PermissionOption,
    RoleOption,
    UserActiveUpdate,
    UserCreate,
    UserCredentialOut,
    UserOut,
    UserRoleUpdate,
    UserUpdate,
)
from ..security import generate_temporary_password, hash_password, password_problems
from .auth import user_out

router = APIRouter(prefix="/api/users", tags=["users"])

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _get(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
    return user


def _other_active_superadmins(db: Session, exclude_id: int) -> int:
    return (
        db.query(User)
        .filter(User.id != exclude_id, User.role == rbac.SUPERADMIN, User.is_active == True)  # noqa: E712
        .count()
    )


def _guard_last_superadmin(db: Session, user: User, *, new_role: str | None, new_active: bool | None) -> None:
    """Impide dejar el sistema sin ningun superadministrador activo."""
    if rbac.canonical_role(user.role) != rbac.SUPERADMIN or not user.is_active:
        return
    loses_role = new_role is not None and new_role != rbac.SUPERADMIN
    loses_active = new_active is False
    if (loses_role or loses_active) and _other_active_superadmins(db, user.id) == 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Es el único superadministrador activo. Asigne ese perfil a otra persona antes de cambiarlo.",
        )


def _apply_changes(db: Session, admin: User, user: User, *, role: str | None, is_active: bool | None) -> None:
    if user.id == admin.id and role is not None and role != rbac.SUPERADMIN:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No puede quitarse a sí mismo el perfil de superadministrador.",
        )
    if user.id == admin.id and is_active is False:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No puede desactivarse a sí mismo.")
    _guard_last_superadmin(db, user, new_role=role, new_active=is_active)
    if role is not None:
        user.role = role
    if is_active is not None and is_active != user.is_active:
        user.is_active = is_active
        if not is_active:
            # La sesion abierta muere en la siguiente peticion.
            user.token_version = int(user.token_version or 0) + 1


@router.get("", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), admin: User = Depends(require_permission(P_USER_MANAGE))):
    users = db.query(User).order_by(User.created_at.desc()).all()
    return [user_out(u) for u in users]


@router.get("/roles", response_model=list[RoleOption])
def list_roles(user: User = Depends(get_current_user)):
    """Catalogo de perfiles con su matriz de permisos, para la interfaz de admin."""
    return [
        RoleOption(
            code=code,
            label=rbac.ROLE_LABELS[code],
            permissions=sorted(rbac.ROLE_PERMISSIONS[code]),
            description=rbac.ROLE_DESCRIPTIONS.get(code, ""),
        )
        for code in rbac.ROLES
    ]


@router.get("/permissions", response_model=list[PermissionOption])
def list_permissions(user: User = Depends(get_current_user)):
    """Nombre legible y alcance de cada permiso, en el orden de la matriz."""
    return [
        PermissionOption(code=code, label=label, description=desc)
        for code, (label, desc) in rbac.PERMISSION_LABELS.items()
    ]


@router.post("", response_model=UserCredentialOut, status_code=201)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_permission(P_USER_MANAGE)),
):
    """Alta de cuenta con contrasena temporal que se cambia en el primer ingreso."""
    email = payload.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=422, detail="El correo no tiene un formato válido.")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=409, detail=f"Ya existe una cuenta con el correo {email}.")

    password = payload.password.strip() if payload.password else ""
    generated = not password
    if generated:
        password = generate_temporary_password()
    else:
        problems = password_problems(password, email=email)
        if problems:
            raise HTTPException(status_code=422, detail=" ".join(problems))

    user = User(
        email=email,
        name=payload.name.strip() or email.split("@")[0].replace(".", " "),
        role=payload.role,
        is_active=True,
        password_hash=hash_password(password),
        must_change_password=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserCredentialOut(
        user=user_out(user),
        temporary_password=password if generated else "",
        message=(
            "Cuenta creada. Entregue la contraseña temporal por un canal seguro: "
            "se mostrará una sola vez y deberá cambiarse en el primer ingreso."
            if generated
            else "Cuenta creada con la contraseña indicada; deberá cambiarse en el primer ingreso."
        ),
    )


@router.get("/{user_id}", response_model=UserOut)
def get_user(user_id: int, db: Session = Depends(get_db), admin: User = Depends(require_permission(P_USER_MANAGE))):
    return user_out(_get(db, user_id))


@router.put("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_permission(P_USER_MANAGE)),
):
    user = _get(db, user_id)
    _apply_changes(db, admin, user, role=payload.role, is_active=payload.is_active)
    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=422, detail="El nombre no puede quedar vacío.")
        user.name = name
    db.commit()
    db.refresh(user)
    return user_out(user)


@router.put("/{user_id}/role", response_model=UserOut)
def update_role(
    user_id: int,
    payload: UserRoleUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_permission(P_USER_MANAGE)),
):
    user = _get(db, user_id)
    _apply_changes(db, admin, user, role=payload.role, is_active=None)
    db.commit()
    db.refresh(user)
    return user_out(user)


@router.put("/{user_id}/active", response_model=UserOut)
def update_active(
    user_id: int,
    payload: UserActiveUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_permission(P_USER_MANAGE)),
):
    user = _get(db, user_id)
    _apply_changes(db, admin, user, role=None, is_active=payload.is_active)
    db.commit()
    db.refresh(user)
    return user_out(user)


@router.post("/{user_id}/reset-password", response_model=UserCredentialOut)
def reset_password(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_permission(P_USER_MANAGE)),
):
    """Genera una contrasena temporal, desbloquea y cierra las sesiones abiertas."""
    user = _get(db, user_id)
    password = generate_temporary_password()
    user.password_hash = hash_password(password)
    user.must_change_password = True
    user.failed_logins = 0
    user.locked_until = None
    user.token_version = int(user.token_version or 0) + 1
    audit.record_action(
        db,
        entity_type="users",
        entity_id=str(user.id),
        action="auth:password_reset",
        new_value={"email": user.email, "by": admin.email},
    )
    db.commit()
    db.refresh(user)
    return UserCredentialOut(
        user=user_out(user),
        temporary_password=password,
        message="Contraseña restablecida. Se mostrará una sola vez; las sesiones abiertas se cerraron.",
    )


@router.post("/{user_id}/unlock", response_model=UserOut)
def unlock_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_permission(P_USER_MANAGE)),
):
    user = _get(db, user_id)
    user.failed_logins = 0
    user.locked_until = None
    audit.record_action(
        db,
        entity_type="users",
        entity_id=str(user.id),
        action="auth:unlocked",
        new_value={"email": user.email, "by": admin.email},
    )
    db.commit()
    db.refresh(user)
    return user_out(user)


@router.delete("/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_permission(P_USER_MANAGE)),
):
    """Elimina una cuenta sin actividad. Con actividad, se exige desactivarla."""
    user = _get(db, user_id)
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="No puede eliminar su propia cuenta.")
    _guard_last_superadmin(db, user, new_role=None, new_active=False)
    activity = db.query(AuditLog).filter(AuditLog.user_id == user.id).count()
    if activity or user.last_login is not None:
        raise HTTPException(
            status_code=409,
            detail=(
                "La cuenta tiene actividad registrada en la bitácora y no puede eliminarse sin "
                "perder trazabilidad. Desactívela: dejará de tener acceso y su historia se conserva."
            ),
        )
    db.query(AlertSubscription).filter(AlertSubscription.user_id == user.id).delete()
    db.query(AlertEvent).filter(AlertEvent.user_id == user.id).delete()
    audit.record_action(
        db,
        entity_type="users",
        entity_id=str(user.id),
        action="users:delete",
        old_value={"email": user.email, "role": user.role, "at": datetime.now(timezone.utc)},
    )
    db.delete(user)
    db.commit()
    return Response(status_code=204)
