"""Dependencias comunes: sesion de BD, usuario actual y control de acceso.

El control pasa de una escala lineal de roles a permisos declarativos
(ver `app.rbac`). `require_role` se conserva como envoltura de compatibilidad
para los routers que aun no migraron a permisos.
"""
from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from . import audit, rbac
from .database import get_db
from .models import User
from .security import decode_access_token

bearer_scheme = HTTPBearer(auto_error=False)

# Equivalencia de los roles heredados con un permiso representativo.
LEGACY_ROLE_PERMISSION = {
    "viewer": rbac.P_READ,
    "editor": rbac.P_TECHNOLOGY_WRITE,
    "admin": rbac.P_USER_MANAGE,
}


def get_current_user(
    request: Request,
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
    # El usuario autenticado alimenta la bitacora inmutable de esta peticion.
    audit.set_user_context(user)
    request.state.user = user
    return user


def require_permission(permission: str):
    """Dependencia que exige un permiso concreto de la matriz RBAC."""

    def checker(user: User = Depends(get_current_user)) -> User:
        if not rbac.has_permission(user, permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"El perfil '{rbac.role_label(user.role)}' no tiene el permiso "
                    f"requerido ({permission})."
                ),
            )
        return user

    return checker


def require_role(minimum: str):
    """Compatibilidad: traduce el rol minimo heredado a su permiso equivalente."""
    return require_permission(LEGACY_ROLE_PERMISSION.get(minimum, rbac.P_READ))
