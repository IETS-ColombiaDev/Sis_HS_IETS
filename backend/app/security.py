"""Emision y verificacion de tokens JWT y manejo de contrasenas."""
from __future__ import annotations

import base64
import hashlib
import hmac
import re
import secrets
import string
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt

from .config import settings

# Tipo de token de sesion. El portal del revisor externo firma con la misma
# llave tokens `typ=review`; sin esta marca, un token de revision de 10 dias
# serviria como sesion interna si el correo coincidiera con una cuenta.
SESSION_TOKEN_TYPE = "session"


def create_access_token(
    subject: str,
    extra: dict | None = None,
    expires_delta: timedelta | None = None,
) -> str:
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.access_token_expire_minutes)
    )
    payload: dict = {"sub": subject, "exp": expire}
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def create_session_token(user) -> str:
    """Token de sesion atado a la version de credenciales del usuario."""
    return create_access_token(
        user.email,
        {
            "typ": SESSION_TOKEN_TYPE,
            "role": user.role,
            "ver": int(getattr(user, "token_version", 0) or 0),
        },
    )


def decode_access_token(token: str, *, verify_exp: bool = True) -> dict | None:
    try:
        return jwt.decode(
            token,
            settings.secret_key,
            algorithms=[settings.algorithm],
            options={"verify_exp": verify_exp},
        )
    except JWTError:
        return None


# --------------------------------------------------------------------------- #
#  Contrasenas
# --------------------------------------------------------------------------- #
# scrypt de la biblioteca estandar: resistente a fuerza bruta por GPU sin
# agregar dependencias. Formato: scrypt$n$r$p$sal$hash (base64 url-safe).
_SCRYPT_N = 2**14
_SCRYPT_R = 8
_SCRYPT_P = 1
_SCRYPT_LEN = 32


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(
        password.encode("utf-8"), salt=salt, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P, dklen=_SCRYPT_LEN
    )
    return f"scrypt${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, stored: str) -> bool:
    """Compara en tiempo constante. Un hash vacio o malformado nunca valida."""
    try:
        scheme, n, r, p, salt, digest = (stored or "").split("$")
        if scheme != "scrypt":
            return False
        expected = _unb64(digest)
        actual = hashlib.scrypt(
            password.encode("utf-8"),
            salt=_unb64(salt),
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=len(expected),
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual, expected)


# Hash de referencia para igualar el tiempo de respuesta cuando el correo no
# existe: sin esto, la latencia revelaria que cuentas estan registradas.
_DUMMY_HASH = hash_password(secrets.token_urlsafe(16))


def burn_verify_time(password: str) -> None:
    verify_password(password, _DUMMY_HASH)


def password_problems(password: str, *, email: str = "") -> list[str]:
    """Politica institucional minima. Devuelve la lista de incumplimientos."""
    problems: list[str] = []
    min_len = settings.password_min_length
    if len(password) < min_len:
        problems.append(f"Debe tener al menos {min_len} caracteres.")
    if not re.search(r"[A-Za-z]", password):
        problems.append("Debe incluir al menos una letra.")
    if not re.search(r"\d", password):
        problems.append("Debe incluir al menos un número.")
    if password.strip() != password:
        problems.append("No puede empezar ni terminar con espacios.")
    local = (email or "").split("@")[0].lower()
    if local and len(local) >= 4 and local in password.lower():
        problems.append("No puede contener el usuario del correo.")
    return problems


def generate_temporary_password(length: int = 14) -> str:
    """Contrasena temporal legible (sin 0/O ni 1/l) que cumple la politica."""
    alphabet = "".join(ch for ch in string.ascii_letters + string.digits if ch not in "0O1lI")
    while True:
        candidate = "".join(secrets.choice(alphabet) for _ in range(max(length, settings.password_min_length)))
        if not password_problems(candidate):
            return candidate
