"""Esquemas Pydantic (validacion y serializacion de la API)."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


# --------------------------------------------------------------------------- #
#  Auth / Users
# --------------------------------------------------------------------------- #
class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    name: str
    picture: str
    role: str
    is_active: bool
    created_at: datetime
    last_login: datetime | None = None


class UserRoleUpdate(BaseModel):
    role: str = Field(pattern="^(admin|editor|viewer)$")


class UserActiveUpdate(BaseModel):
    is_active: bool


class GoogleLoginIn(BaseModel):
    credential: str  # id_token JWT de Google Identity Services


class DevLoginIn(BaseModel):
    email: str
    name: str = ""


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# --------------------------------------------------------------------------- #
#  Sources
# --------------------------------------------------------------------------- #
class SourceBase(BaseModel):
    title: str
    url: str = ""
    category: str = ""
    authors: str = ""
    year: str = ""
    description: str = ""
    relation_iets: str = ""
    language: str = ""
    resource_type: str = ""
    link_status: str = ""
    scrape_enabled: bool = True
    tags: str = ""


class SourceCreate(SourceBase):
    pass


class SourceUpdate(BaseModel):
    title: str | None = None
    url: str | None = None
    category: str | None = None
    authors: str | None = None
    year: str | None = None
    description: str | None = None
    relation_iets: str | None = None
    language: str | None = None
    resource_type: str | None = None
    link_status: str | None = None
    scrape_enabled: bool | None = None
    tags: str | None = None


class SourceOut(SourceBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    last_scraped_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    findings_count: int = 0


# --------------------------------------------------------------------------- #
#  Findings
# --------------------------------------------------------------------------- #
class FindingBase(BaseModel):
    title: str
    url: str = ""
    summary: str = ""
    technology: str = ""
    technology_type: str = ""
    horizon: str = ""
    phase: str = ""
    therapeutic_area: str = ""
    published_date: str = ""
    status: str = "nuevo"


class FindingCreate(FindingBase):
    source_id: int


class FindingUpdate(BaseModel):
    title: str | None = None
    url: str | None = None
    summary: str | None = None
    technology: str | None = None
    technology_type: str | None = None
    horizon: str | None = None
    phase: str | None = None
    therapeutic_area: str | None = None
    published_date: str | None = None
    status: str | None = None


class FindingOut(FindingBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    source_id: int
    source_title: str = ""
    source_category: str = ""
    source_url: str = ""
    raw_content: str = ""
    created_at: datetime
    updated_at: datetime
    recommendations_count: int = 0
    notes_count: int = 0


# --------------------------------------------------------------------------- #
#  Recommendations
# --------------------------------------------------------------------------- #
class RecommendationCreate(BaseModel):
    finding_id: int | None = None
    title: str = ""
    content: str = ""
    impact: str = ""


class RecommendationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    finding_id: int | None
    title: str
    content: str
    impact: str
    model_used: str
    created_by: str
    created_at: datetime


class RecommendationUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    impact: str | None = None


class GenerateRecommendationIn(BaseModel):
    finding_id: int


# --------------------------------------------------------------------------- #
#  Notes (notas de trabajo del equipo)
# --------------------------------------------------------------------------- #
class NoteCreate(BaseModel):
    entity_type: str = "general"  # finding | source | recommendation | general
    entity_id: int | None = None
    title: str = ""
    content: str
    pinned: bool = False


class NoteUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    pinned: bool | None = None


class NoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    entity_type: str
    entity_id: int | None = None
    title: str
    content: str
    author_email: str
    author_name: str
    pinned: bool
    created_at: datetime
    updated_at: datetime
    entity_label: str = ""


# --------------------------------------------------------------------------- #
#  Scan / Scrape
# --------------------------------------------------------------------------- #
class ScrapeLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    source_id: int | None
    source_title: str = ""
    status: str
    items_found: int
    items_new: int
    message: str
    triggered_by: str
    started_at: datetime
    finished_at: datetime | None = None


class ScanRequest(BaseModel):
    source_ids: list[int] | None = None  # None => todas las habilitadas


class LinkPreviewIn(BaseModel):
    url: str


class PreviewCandidate(BaseModel):
    title: str
    technology_type: str = ""
    horizon: str = ""


class LinkPreviewOut(BaseModel):
    ok: bool
    url: str
    content_type: str = ""
    title: str = ""
    description: str = ""
    main_text: str = ""
    candidates: list[PreviewCandidate] = []
    candidates_count: int = 0
    message: str = ""


class ScanResult(BaseModel):
    logs: list[ScrapeLogOut]
    total_new: int
    total_found: int


# --------------------------------------------------------------------------- #
#  Chat
# --------------------------------------------------------------------------- #
class ChatMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    role: str
    content: str
    sources_used: str = ""
    created_at: datetime


class ChatSessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    user_email: str
    created_at: datetime
    updated_at: datetime


class ChatSessionDetail(ChatSessionOut):
    messages: list[ChatMessageOut] = []


class ChatSendIn(BaseModel):
    session_id: int | None = None
    message: str


class ChatSendOut(BaseModel):
    session: ChatSessionOut
    answer: ChatMessageOut
    model_used: str


# --------------------------------------------------------------------------- #
#  Dashboard / realtime / system
# --------------------------------------------------------------------------- #
class CountItem(BaseModel):
    label: str
    value: int


class DashboardStats(BaseModel):
    total_sources: int
    total_findings: int
    total_recommendations: int
    total_scrapes: int
    findings_last_7d: int
    by_category: list[CountItem]
    by_horizon: list[CountItem]
    by_technology_type: list[CountItem]
    by_status: list[CountItem]
    by_language: list[CountItem]
    top_sources: list[CountItem]
    recent_findings: list[FindingOut]
    last_scan: ScrapeLogOut | None = None


class StateVersionOut(BaseModel):
    version: int
    updated_at: datetime | None = None


class SystemStatus(BaseModel):
    gemini_enabled: bool
    gemini_model: str
    google_login_enabled: bool
    google_client_id: str
    dev_login_enabled: bool
    allowed_domain: str
    version: str


# --------------------------------------------------------------------------- #
#  Configuracion (panel de administracion)
# --------------------------------------------------------------------------- #
class ConfigOut(BaseModel):
    gemini_enabled: bool
    gemini_has_key: bool
    gemini_key_masked: str = ""
    gemini_model: str = ""          # modelo preferido fijado (vacio = auto)
    gemini_active_model: str = ""   # modelo efectivamente en uso
    available_models: list[str] = []
    google_login_enabled: bool
    dev_login_enabled: bool
    allowed_domain: str
    total_sources: int = 0
    total_findings: int = 0
    version: str


class ConfigUpdate(BaseModel):
    gemini_api_key: str | None = None  # None = no cambiar; "" = borrar
    gemini_model: str | None = None


class GeminiTestIn(BaseModel):
    gemini_api_key: str | None = None  # opcional: probar una key sin guardarla


class GeminiTestOut(BaseModel):
    ok: bool
    message: str
    model: str = ""
    available_models: list[str] = []
