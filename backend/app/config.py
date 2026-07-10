"""Configuracion central de la aplicacion (carga variables de entorno)."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Seguridad
    secret_key: str = "dev-secret-key-change-me"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 720

    # Autenticacion
    google_client_id: str = ""
    allowed_email_domain: str = "iets.org.co"
    admin_emails: str = ""
    allow_dev_login: bool = True

    # Gemini
    gemini_api_key: str = ""
    gemini_model: str = ""

    # General
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    database_url: str = "sqlite:///./iets_horizonte.db"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def admin_emails_list(self) -> list[str]:
        return [e.strip().lower() for e in self.admin_emails.split(",") if e.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
