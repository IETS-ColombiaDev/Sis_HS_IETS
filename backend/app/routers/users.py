"""Gestion de usuarios (solo administradores)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_role
from ..models import User
from ..schemas import UserActiveUpdate, UserOut, UserRoleUpdate

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), admin: User = Depends(require_role("admin"))):
    users = db.query(User).order_by(User.created_at.desc()).all()
    return [UserOut.model_validate(u) for u in users]


@router.put("/{user_id}/role", response_model=UserOut)
def update_role(
    user_id: int,
    payload: UserRoleUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_role("admin")),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
    if user.id == admin.id and payload.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No puede quitarse a si mismo el rol de administrador.",
        )
    user.role = payload.role
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)


@router.put("/{user_id}/active", response_model=UserOut)
def update_active(
    user_id: int,
    payload: UserActiveUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_role("admin")),
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
    return UserOut.model_validate(user)
