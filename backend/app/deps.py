"""Dependencias comunes: sesion de BD, usuario actual y control de roles."""
from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .database import get_db
from .models import User
from .security import decode_access_token

bearer_scheme = HTTPBearer(auto_error=False)

ROLE_ORDER = {"viewer": 0, "editor": 1, "admin": 2}


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No autenticado",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_access_token(credentials.credentials)
    if payload is None or "sub" not in payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalido o expirado")
    user = db.query(User).filter(User.email == payload["sub"]).first()
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario inactivo o inexistente")
    return user


def require_role(minimum: str):
    """Devuelve una dependencia que exige un rol minimo (viewer<editor<admin)."""
    min_level = ROLE_ORDER.get(minimum, 0)

    def checker(user: User = Depends(get_current_user)) -> User:
        if ROLE_ORDER.get(user.role, 0) < min_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requiere rol '{minimum}' o superior",
            )
        return user

    return checker
