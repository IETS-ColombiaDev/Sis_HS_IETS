"""Gestion de usuarios y perfiles RBAC (solo superadministradores)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import rbac
from ..database import get_db
from ..deps import get_current_user, require_permission
from ..models import User
from ..rbac import P_USER_MANAGE
from ..schemas import RoleOption, UserActiveUpdate, UserOut, UserRoleUpdate
from .auth import user_out

router = APIRouter(prefix="/api/users", tags=["users"])


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
        )
        for code in rbac.ROLES
    ]


@router.put("/{user_id}/role", response_model=UserOut)
def update_role(
    user_id: int,
    payload: UserRoleUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_permission(P_USER_MANAGE)),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
    if user.id == admin.id and payload.role != rbac.SUPERADMIN:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No puede quitarse a si mismo el perfil de superadministrador.",
        )
    user.role = payload.role
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
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
    if user.id == admin.id and not payload.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No puede desactivarse a si mismo.",
        )
    user.is_active = payload.is_active
    db.commit()
    db.refresh(user)
    return user_out(user)
