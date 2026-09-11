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
from .security import SESSION_TOKEN_TYPE, decode_access_token

bearer_scheme = HTTPBearer(auto_error=False)

PASSWORD_CHANGE_ALLOWED_PATHS = frozenset(
    {"/api/auth/me", "/api/auth/change-password", "/api/realtime/version"}
)

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
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido o expirado")
    # Solo los tokens de sesion abren la aplicacion. Los emitidos antes de marcar
    # el tipo (sin `typ`) se aceptan hasta que expiren; un token de revisor
    # externo (`typ=review`) jamas.
    if payload.get("typ", SESSION_TOKEN_TYPE) != SESSION_TOKEN_TYPE:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token no válido para iniciar sesión")
    user = db.query(User).filter(User.email == payload["sub"]).first()
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario inactivo o inexistente")
    if int(payload.get("ver", 0) or 0) != int(user.token_version or 0):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="La sesión caduco porque cambiaron las credenciales. Ingrese de nuevo.",
        )
    # Con contrasena temporal (asignada por el administrador) solo se permite
    # consultar el perfil y cambiarla: quien la conoce no debe poder operar.
    if user.must_change_password and request.url.path not in PASSWORD_CHANGE_ALLOWED_PATHS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Debe cambiar su contraseña temporal antes de continuar.",
        )
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
