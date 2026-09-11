"""Configuracion central de la aplicacion (carga variables de entorno)."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent

DEFAULT_SECRET_KEY = "dev-secret-key-change-me"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Entorno (P0-3): development | testing | production. En produccion el acceso
    # de desarrollo queda apagado sin importar ALLOW_DEV_LOGIN y el arranque exige
    # una SECRET_KEY propia.
    environment: str = "development"

    # Seguridad
    secret_key: str = DEFAULT_SECRET_KEY
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 720

    # Autenticacion
    google_client_id: str = ""
    allowed_email_domain: str = "iets.org.co"
    admin_emails: str = ""
    allow_dev_login: bool = True
    # Acceso con correo y contrasena (cuentas creadas por el superadministrador).
    password_min_length: int = 10
    login_max_attempts: int = 5
    login_lockout_minutes: int = 15

    # Gemini (respaldo opcional)
    gemini_api_key: str = ""
    gemini_model: str = ""

    # MiniMax (proveedor principal de IA)
    minimax_api_key: str = ""
    minimax_model: str = ""
    ai_provider: str = "auto"  # auto | minimax | gemini
    ai_ocr_enabled: bool = False
    ai_web_enabled: bool = True

    # General
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://127.0.0.1:8000,http://localhost:8000"
    database_url: str = "sqlite:///./iets_horizonte.db"

    # Fase 4: cola de ingesta y portal publico
    ingest_worker_enabled: bool = True
    ingest_worker_interval_seconds: int = 20
    recaptcha_secret: str = ""
    recaptcha_site_key: str = ""

    # Llaves gratuitas de fuentes de nivel A (D-06 / seccion 10.2).
    openfda_api_key: str = ""
    ncbi_api_key: str = ""
    ncbi_email: str = "escaneo.horizonte@iets.org.co"

    # Directorio institucional (Firestore RRHH). El nombre visible se toma de ahi
    # cuando el correo coincide; no se usa el nombre residual de la base local.
    firebase_project_id: str = "sistema-permisos-iets"
    firebase_service_account_key: str = ""
    firebase_service_account_file: str = ""
    firebase_rrhh_env_file: str = ""

    @property
    def is_production(self) -> bool:
        return self.environment.strip().lower() in {"production", "produccion", "prod"}

    @property
    def dev_login_enabled(self) -> bool:
        """El acceso sin contrasena nunca opera en produccion."""
        return bool(self.allow_dev_login) and not self.is_production

    def production_problems(self) -> list[str]:
        """Condiciones que impiden arrancar en produccion con seguridad."""
        problems: list[str] = []
        if not self.is_production:
            return problems
        if self.secret_key == DEFAULT_SECRET_KEY or len(self.secret_key) < 32:
            problems.append(
                "SECRET_KEY debe definirse con al menos 32 caracteres aleatorios "
                "(ej. python -c \"import secrets; print(secrets.token_urlsafe(48))\")."
            )
        return problems

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def admin_emails_list(self) -> list[str]:
        return [e.strip().lower() for e in self.admin_emails.split(",") if e.strip()]

    # Canal de correo (P3-2 invitacion al revisor externo, P4-2 alertas). Sin
    # SMTP_HOST el envio es un no-op y la interfaz ofrece copiar el enlace.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_tls: bool = True
    # URL publica de la aplicacion para armar enlaces absolutos en los correos
    # (ej. https://horizonte.iets.org.co). Vacio = el enlace va relativo.
    public_base_url: str = ""

    # Frente B: portal publico /postular (RF02, P2-3). reCAPTCHA v3 opera solo si
    # hay RECAPTCHA_SECRET y RECAPTCHA_SITE_KEY; el puntaje minimo es el umbral de
    # Google (0 = robot, 1 = humano). El tope por IP protege el formulario.
    recaptcha_min_score: float = 0.5
    public_submissions_per_window: int = 5
    public_submissions_window_seconds: int = 600


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
