"""Modelos ORM del Sistema de Escaneo de Horizonte del IETS."""
from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base

# JSON portable: JSONB en PostgreSQL (fase 0 del plan), JSON en SQLite.
JSONType = JSON().with_variant(JSONB, "postgresql")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), default="")
    first_name: Mapped[str] = mapped_column(String(255), default="")
    last_name: Mapped[str] = mapped_column(String(255), default="")
    picture: Mapped[str] = mapped_column(String(1024), default="")
    # Perfiles RBAC (Tabla 3 de la especificacion): superadmin | evaluador_tecnico |
    # evaluador_clinico | tomador_decisiones | revisor_pares. Los valores heredados
    # (admin/editor/viewer) se resuelven por alias en app.rbac.
    role: Mapped[str] = mapped_column(String(40), default="tomador_decisiones")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_login: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Acceso con correo y contrasena. El hash (scrypt) jamas se copia a la
    # bitacora ni sale por la API; ver `security.hash_password`.
    password_hash: Mapped[str] = mapped_column(String(255), default="")
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False)
    password_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    failed_logins: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Se incrementa al cambiar o restablecer la contrasena y al desactivar la
    # cuenta: invalida de inmediato las sesiones emitidas antes.
    token_version: Mapped[int] = mapped_column(Integer, default=0)


class Source(Base):
    """Fuente de informacion (documento / plataforma) del inventario de escaneo."""

    __tablename__ = "sources"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(600), index=True)
    url: Mapped[str] = mapped_column(String(1024), default="")
    category: Mapped[str] = mapped_column(String(120), default="", index=True)
    authors: Mapped[str] = mapped_column(String(600), default="")
    year: Mapped[str] = mapped_column(String(32), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    relation_iets: Mapped[str] = mapped_column(String(300), default="")
    language: Mapped[str] = mapped_column(String(60), default="")
    resource_type: Mapped[str] = mapped_column(String(120), default="")
    link_status: Mapped[str] = mapped_column(String(120), default="")
    scrape_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    tags: Mapped[str] = mapped_column(String(600), default="")
    last_scraped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Fase 4: que adaptador atiende esta fuente. `html` es el scraper generico,
    # que se conserva como conector de ultimo recurso para lo que no tiene API.
    connector: Mapped[str] = mapped_column(String(60), default="html", index=True)
    connector_config: Mapped[dict | None] = mapped_column(JSONType, default=dict)
    scan_interval_hours: Mapped[int] = mapped_column(Integer, default=24)

    # Cortacircuitos por fuente: un referente caido no puede arrastrar a los demas.
    failure_streak: Mapped[int] = mapped_column(Integer, default=0)
    circuit_open_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_error: Mapped[str] = mapped_column(Text, default="")

    # Catalogo verificado RF01 / D-06 (Catalogo_Fuentes_Proactivas_Verificadas).
    catalog_code: Mapped[str] = mapped_column(String(40), default="", index=True)
    entity_type: Mapped[str] = mapped_column(String(60), default="", index=True)
    access_level: Mapped[str] = mapped_column(String(8), default="", index=True)  # A|B|C|D|E
    country: Mapped[str] = mapped_column(String(80), default="")
    sync_frequency: Mapped[str] = mapped_column(String(40), default="")
    rate_limit_rpm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    requires_api_key: Mapped[bool] = mapped_column(Boolean, default=False)
    terms_url: Mapped[str] = mapped_column(String(1024), default="")
    terms_accepted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    robots_checked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    robots_allowed: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    health_status: Mapped[str] = mapped_column(String(20), default="", index=True)
    last_ok_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    schema_signature: Mapped[str] = mapped_column(String(120), default="")
    provides_fields: Mapped[list | None] = mapped_column(JSONType, default=list)
    aliases: Mapped[list | None] = mapped_column(JSONType, default=list)
    verification_status: Mapped[str] = mapped_column(String(40), default="")
    catalog_note: Mapped[str] = mapped_column(Text, default="")
    is_contrast: Mapped[bool] = mapped_column(Boolean, default=False)
    catalog_active: Mapped[bool] = mapped_column(Boolean, default=True)
    retired: Mapped[bool] = mapped_column(Boolean, default=False)
    last_probe_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_probe_detail: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    next_review_due: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    findings: Mapped[list["Finding"]] = relationship(
        back_populates="source", cascade="all, delete-orphan"
    )
    scrape_logs: Mapped[list["ScrapeLog"]] = relationship(
        back_populates="source", cascade="all, delete-orphan"
    )


class Finding(Base):
    """Hallazgo de escaneo: tecnologia / item emergente detectado en una fuente."""

    __tablename__ = "findings"
    __table_args__ = (UniqueConstraint("source_id", "content_hash", name="uq_finding_hash"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    source_id: Mapped[int] = mapped_column(ForeignKey("sources.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(600), index=True)
    url: Mapped[str] = mapped_column(String(1024), default="")
    summary: Mapped[str] = mapped_column(Text, default="")
    raw_content: Mapped[str] = mapped_column(Text, default="")
    technology: Mapped[str] = mapped_column(String(400), default="")
    technology_type: Mapped[str] = mapped_column(String(120), default="")  # medicamento/dispositivo/digital/otro
    horizon: Mapped[str] = mapped_column(String(60), default="", index=True)  # emergente/transicional/inminente
    phase: Mapped[str] = mapped_column(String(120), default="")
    therapeutic_area: Mapped[str] = mapped_column(String(300), default="")
    published_date: Mapped[str] = mapped_column(String(60), default="")
    content_hash: Mapped[str] = mapped_column(String(80), index=True)
    status: Mapped[str] = mapped_column(String(60), default="nuevo")  # nuevo/revisado/priorizado/descartado
    # Puntaje de cribado (fase 2 del plan): ordena la cola de trabajo de senales aun
    # no calificadas. NO es el indice de priorizacion %P, que vive en priority_scores.
    screening_score: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    source: Mapped["Source"] = relationship(back_populates="findings")
    recommendations: Mapped[list["Recommendation"]] = relationship(
        back_populates="finding", cascade="all, delete-orphan"
    )


class Recommendation(Base):
    """Recomendacion de adopcion para Colombia (generada por Gemini o manual)."""

    __tablename__ = "recommendations"

    id: Mapped[int] = mapped_column(primary_key=True)
    finding_id: Mapped[int | None] = mapped_column(
        ForeignKey("findings.id", ondelete="CASCADE"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(600), default="")
    content: Mapped[str] = mapped_column(Text, default="")
    impact: Mapped[str] = mapped_column(String(60), default="")  # alto/medio/bajo
    model_used: Mapped[str] = mapped_column(String(120), default="")
    created_by: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    finding: Mapped["Finding"] = relationship(back_populates="recommendations")


class ScrapeLog(Base):
    """Registro de cada ejecucion de escaneo/scraping sobre una fuente."""

    __tablename__ = "scrape_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    source_id: Mapped[int | None] = mapped_column(
        ForeignKey("sources.id", ondelete="CASCADE"), nullable=True, index=True
    )
    status: Mapped[str] = mapped_column(String(60), default="ok")  # ok/error/parcial
    items_found: Mapped[int] = mapped_column(Integer, default=0)
    items_new: Mapped[int] = mapped_column(Integer, default=0)
    message: Mapped[str] = mapped_column(Text, default="")
    triggered_by: Mapped[str] = mapped_column(String(255), default="")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    source: Mapped["Source"] = relationship(back_populates="scrape_logs")


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(400), default="Nueva conversación")
    user_email: Mapped[str] = mapped_column(String(255), default="", index=True)
    scope: Mapped[str] = mapped_column(String(40), default="", index=True)
    node_key: Mapped[str] = mapped_column(String(120), default="", index=True)
    cycle_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    graph_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    messages: Mapped[list["ChatMessage"]] = relationship(
        back_populates="session", cascade="all, delete-orphan", order_by="ChatMessage.id"
    )


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("chat_sessions.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String(32), default="user")  # user | assistant
    content: Mapped[str] = mapped_column(Text, default="")
    sources_used: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    session: Mapped["ChatSession"] = relationship(back_populates="messages")


class AppMeta(Base):
    """Clave/valor para metadatos (version de estado para tiempo real, etc.)."""

    __tablename__ = "app_meta"

    key: Mapped[str] = mapped_column(String(120), primary_key=True)
    value: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class Note(Base):
    """Nota de trabajo del equipo sobre hallazgos, fuentes, recomendaciones o temas generales."""

    __tablename__ = "notes"

    id: Mapped[int] = mapped_column(primary_key=True)
    entity_type: Mapped[str] = mapped_column(
        String(60), default="general", index=True
    )  # finding | source | recommendation | general
    entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(400), default="")
    content: Mapped[str] = mapped_column(Text, default="")
    author_email: Mapped[str] = mapped_column(String(255), default="", index=True)
    author_name: Mapped[str] = mapped_column(String(255), default="")
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


# =========================================================================== #
#  FASE 0 - Bitacora inmutable de auditoria
# =========================================================================== #
class AuditLog(Base):
    """Bitacora append-only. Ningun camino de codigo debe actualizarla o borrarla.

    En PostgreSQL el privilegio de UPDATE/DELETE se revoca a nivel de motor
    (ver `database.harden_audit_log`). En SQLite se protege con disparadores.
    """

    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    user_email: Mapped[str] = mapped_column(String(255), default="", index=True)
    user_role: Mapped[str] = mapped_column(String(40), default="")
    ip_address: Mapped[str] = mapped_column(String(64), default="")
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, index=True
    )
    entity_type: Mapped[str] = mapped_column(String(80), index=True)
    entity_id: Mapped[str] = mapped_column(String(80), index=True)
    action: Mapped[str] = mapped_column(String(40))  # create | update | delete | <accion de negocio>
    old_value: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    new_value: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    request_id: Mapped[str] = mapped_column(String(64), default="", index=True)
    request_path: Mapped[str] = mapped_column(String(300), default="")


# =========================================================================== #
#  FASE 1 - Catalogos parametrizables y ciclo operativo
# =========================================================================== #
class Cluster(Base):
    """Clusteres de salud del IETS (RF06). Parametrizable: la especificacion
    advierte que la lista puede variar tras la referenciacion."""

    __tablename__ = "clusters"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(60), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    keywords: Mapped[list | None] = mapped_column(JSONType, default=list)
    icd10_prefixes: Mapped[list | None] = mapped_column(JSONType, default=list)
    mesh_terms: Mapped[list | None] = mapped_column(JSONType, default=list)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class TechType(Base):
    """Tipologias tecnologicas (RF07). Siete categorias parametrizables."""

    __tablename__ = "tech_types"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(60), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    keywords: Mapped[list | None] = mapped_column(JSONType, default=list)
    legacy_types: Mapped[list | None] = mapped_column(JSONType, default=list)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class MethodologyParam(Base):
    """Parametros metodologicos versionables en BD, nunca en codigo (RF05, modulo 3)."""

    __tablename__ = "methodology_params"

    key: Mapped[str] = mapped_column(String(120), primary_key=True)
    value: Mapped[str] = mapped_column(String(300), default="")
    value_type: Mapped[str] = mapped_column(String(20), default="int")  # int | float | str | bool
    description: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class Cycle(Base):
    """Ciclo operativo de escaneo (RF05). Eje de toda la metodologia."""

    __tablename__ = "cycles"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    year: Mapped[int] = mapped_column(Integer, index=True)
    opened_on: Mapped[date] = mapped_column(Date)
    data_cutoff_on: Mapped[date] = mapped_column(Date)
    bulletin_due_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(40), default="en_configuracion", index=True)
    is_historic: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[str] = mapped_column(Text, default="")
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    entries: Mapped[list["CycleTechnology"]] = relationship(
        back_populates="cycle", cascade="all, delete-orphan"
    )


class Technology(Base):
    """Tecnologia sanitaria como entidad persistente, independiente del ciclo.

    Sustituye progresivamente a `Finding` como unidad de trabajo metodologica
    (guia tecnica del modulo 1). `Finding` se conserva como registro de captura.
    """

    __tablename__ = "technologies"

    id: Mapped[int] = mapped_column(primary_key=True)
    commercial_name: Mapped[str] = mapped_column(String(400), default="", index=True)
    inn_name: Mapped[str] = mapped_column(String(400), default="", index=True)  # DCI
    manufacturer: Mapped[str] = mapped_column(String(300), default="")
    nct_ids: Mapped[list | None] = mapped_column(JSONType, default=list)
    indication: Mapped[str] = mapped_column(Text, default="")
    mechanism: Mapped[str] = mapped_column(Text, default="")
    summary: Mapped[str] = mapped_column(Text, default="")
    url: Mapped[str] = mapped_column(String(1024), default="")

    cluster_id: Mapped[int | None] = mapped_column(
        ForeignKey("clusters.id", ondelete="SET NULL"), nullable=True, index=True
    )
    tech_type_id: Mapped[int | None] = mapped_column(
        ForeignKey("tech_types.id", ondelete="SET NULL"), nullable=True, index=True
    )
    suggested_cluster_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    suggested_cluster_reason: Mapped[str] = mapped_column(String(400), default="")

    # Glosario de la especificacion: dimension distinta del horizonte heredado.
    condition: Mapped[str] = mapped_column(String(20), default="", index=True)  # emergente | nueva
    horizon: Mapped[str] = mapped_column(String(60), default="")  # emergente/transicional/inminente

    # Vocabularios controlados (normalizacion tecnica, fase 3).
    atc_code: Mapped[str] = mapped_column(String(40), default="")
    icd10_codes: Mapped[list | None] = mapped_column(JSONType, default=list)
    mesh_terms: Mapped[list | None] = mapped_column(JSONType, default=list)
    device_nomenclature: Mapped[str] = mapped_column(String(120), default="")  # GMDN / EMDN

    # Insumos de time-to-market (fases 1 y 4, motor de calculo en fase 6).
    phase3_completion_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    fda_approval_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    ema_approval_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    invima_registry: Mapped[str] = mapped_column(String(200), default="")
    regulatory_status: Mapped[str] = mapped_column(String(120), default="")
    development_phase: Mapped[str] = mapped_column(String(120), default="")

    # Trazabilidad de captura (RF03).
    raw_payload: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    source_channel: Mapped[str] = mapped_column(String(20), default="proactiva")  # proactiva | reactiva
    source_id: Mapped[int | None] = mapped_column(
        ForeignKey("sources.id", ondelete="SET NULL"), nullable=True, index=True
    )
    finding_id: Mapped[int | None] = mapped_column(
        ForeignKey("findings.id", ondelete="SET NULL"), nullable=True, unique=True
    )
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    captured_by: Mapped[str] = mapped_column(String(255), default="")

    status: Mapped[str] = mapped_column(
        String(40), default="capturada_no_asignada", index=True
    )
    screening_score: Mapped[int] = mapped_column(Integer, default=0)
    merged_into_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    cluster: Mapped["Cluster | None"] = relationship()
    tech_type: Mapped["TechType | None"] = relationship()
    cycle_entries: Mapped[list["CycleTechnology"]] = relationship(
        back_populates="technology", cascade="all, delete-orphan"
    )


class CycleTechnology(Base):
    """Instancia de una tecnologia dentro de un ciclo: dueña del estado y del %P."""

    __tablename__ = "cycle_technologies"
    __table_args__ = (
        UniqueConstraint("cycle_id", "technology_id", name="uq_cycle_technology"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    cycle_id: Mapped[int] = mapped_column(
        ForeignKey("cycles.id", ondelete="CASCADE"), index=True
    )
    technology_id: Mapped[int] = mapped_column(
        ForeignKey("technologies.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[str] = mapped_column(String(40), default="asignada_a_ciclo", index=True)
    priority_pct: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    priority_points: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    frozen: Mapped[bool] = mapped_column(Boolean, default=False)

    exclusion_reason_code: Mapped[str] = mapped_column(String(60), default="")
    exclusion_note: Mapped[str] = mapped_column(Text, default="")
    excluded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    excluded_by: Mapped[str] = mapped_column(String(255), default="")

    carried_from_cycle_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    previous_priority_pct: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)

    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    assigned_by: Mapped[str] = mapped_column(String(255), default="")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    cycle: Mapped["Cycle"] = relationship(back_populates="entries")
    technology: Mapped["Technology"] = relationship(back_populates="cycle_entries")


# =========================================================================== #
#  FASE 2 - Motor oficial de priorizacion (%P)
# =========================================================================== #
class PriorityCriterion(Base):
    """Enunciados P1 a P6 versionados como dato, no como literal en codigo."""

    __tablename__ = "priority_criteria"
    __table_args__ = (UniqueConstraint("code", "version", name="uq_criterion_version"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(10), index=True)  # P1..P6
    version: Mapped[int] = mapped_column(Integer, default=1)
    prompt: Mapped[str] = mapped_column(Text)
    short_label: Mapped[str] = mapped_column(String(120), default="")
    role_scope: Mapped[str] = mapped_column(String(60), default="")  # perfil que califica
    auto_prefill: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    source_reference: Mapped[str] = mapped_column(String(200), default="Manual Metodologico IETS")


class PriorityScore(Base):
    """Calificacion binaria de un criterio para una tecnologia en un ciclo."""

    __tablename__ = "priority_scores"
    __table_args__ = (
        UniqueConstraint("cycle_id", "technology_id", "criterion", name="uq_priority_score"),
        CheckConstraint("value IN (0, 1)", name="ck_priority_binary"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    cycle_id: Mapped[int] = mapped_column(ForeignKey("cycles.id", ondelete="CASCADE"), index=True)
    technology_id: Mapped[int] = mapped_column(
        ForeignKey("technologies.id", ondelete="CASCADE"), index=True
    )
    criterion: Mapped[str] = mapped_column(String(10))  # P1..P6
    criterion_version: Mapped[int] = mapped_column(Integer, default=1)
    value: Mapped[int] = mapped_column(SmallInteger)
    auto_suggested: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    auto_reason: Mapped[str] = mapped_column(String(400), default="")
    justification: Mapped[str] = mapped_column(Text, default="")
    rated_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    rated_by_email: Mapped[str] = mapped_column(String(255), default="")
    rated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


# =========================================================================== #
#  FASE 3 - Filtrado, desduplicacion e INVIMA
# =========================================================================== #
class MergeProposal(Base):
    """Par de tecnologias que el motor difuso propone fusionar (RF09).

    El sistema nunca fusiona solo: deja la propuesta con su evidencia y espera
    la confirmacion de un evaluador, que queda en la bitacora.
    """

    __tablename__ = "merge_proposals"
    __table_args__ = (
        UniqueConstraint("technology_a_id", "technology_b_id", name="uq_merge_pair"),
        CheckConstraint("technology_a_id < technology_b_id", name="ck_merge_pair_order"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    technology_a_id: Mapped[int] = mapped_column(
        ForeignKey("technologies.id", ondelete="CASCADE"), index=True
    )
    technology_b_id: Mapped[int] = mapped_column(
        ForeignKey("technologies.id", ondelete="CASCADE"), index=True
    )
    cycle_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    score: Mapped[float] = mapped_column(Numeric(5, 2), default=0)
    decisive: Mapped[bool] = mapped_column(Boolean, default=False)
    matched_on: Mapped[list | None] = mapped_column(JSONType, default=list)
    detail: Mapped[dict | None] = mapped_column(JSONType, default=dict)

    # propuesta | confirmada | descartada
    status: Mapped[str] = mapped_column(String(20), default="propuesta", index=True)
    kept_technology_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    resolution_note: Mapped[str] = mapped_column(Text, default="")
    resolved_by: Mapped[str] = mapped_column(String(255), default="")
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class NoveltyAssessment(Base):
    """Verificacion del criterio de novedad de una tecnologia en un ciclo (RF10).

    Vive por instancia de ciclo y no por tecnologia, porque lo que era novedoso
    en un ciclo puede dejar de serlo en el siguiente.
    """

    __tablename__ = "novelty_assessments"
    __table_args__ = (
        UniqueConstraint("cycle_id", "technology_id", name="uq_novelty_per_cycle"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    cycle_id: Mapped[int] = mapped_column(ForeignKey("cycles.id", ondelete="CASCADE"), index=True)
    technology_id: Mapped[int] = mapped_column(
        ForeignKey("technologies.id", ondelete="CASCADE"), index=True
    )

    # Una de NOVELTY_OPTIONS: no_disponible_en_pais | nueva_indicacion |
    # nueva_forma_farmaceutica | nueva_combinacion
    option_code: Mapped[str] = mapped_column(String(60), default="", index=True)
    justification: Mapped[str] = mapped_column(Text, default="")

    # Resultado del cruce con el indice local de INVIMA (RF11).
    invima_checked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    invima_match_count: Mapped[int] = mapped_column(Integer, default=0)
    invima_best_score: Mapped[float] = mapped_column(Numeric(5, 2), default=0)
    invima_registry: Mapped[str] = mapped_column(String(200), default="")
    invima_holder: Mapped[str] = mapped_column(String(300), default="")
    invima_status: Mapped[str] = mapped_column(String(120), default="")
    has_valid_registry: Mapped[bool] = mapped_column(Boolean, default=False)

    # Concepto de la Sala Especializada, cuando exista (carga manual del acta).
    sala_especializada_concept: Mapped[str] = mapped_column(Text, default="")
    sala_especializada_ref: Mapped[str] = mapped_column(String(300), default="")

    assessed_by: Mapped[str] = mapped_column(String(255), default="")
    assessed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class InvimaRecord(Base):
    """Copia local del registro sanitario de INVIMA (RF11).

    Se mantiene en tablas propias y no se consulta la fuente en linea en cada
    verificacion: la especificacion exige respuesta por debajo de 100 ms y la
    disponibilidad del dato abierto no esta garantizada.
    """

    __tablename__ = "invima_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    expediente: Mapped[str] = mapped_column(String(120), default="", index=True)
    registro: Mapped[str] = mapped_column(String(120), default="", index=True)
    producto: Mapped[str] = mapped_column(String(500), default="")
    titular: Mapped[str] = mapped_column(String(400), default="")
    principio_activo: Mapped[str] = mapped_column(String(600), default="")
    atc_code: Mapped[str] = mapped_column(String(40), default="", index=True)
    forma_farmaceutica: Mapped[str] = mapped_column(String(300), default="")
    estado_registro: Mapped[str] = mapped_column(String(120), default="", index=True)
    fecha_expedicion: Mapped[date | None] = mapped_column(Date, nullable=True)
    fecha_vencimiento: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Claves normalizadas para la busqueda: evitan normalizar en cada consulta.
    producto_norm: Mapped[str] = mapped_column(String(500), default="", index=True)
    principio_norm: Mapped[str] = mapped_column(String(600), default="", index=True)

    raw_payload: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class InvimaSync(Base):
    """Bitacora de sincronizacion del indice local de INVIMA.

    Hace visible la antiguedad del dato: la especificacion pide alertar cuando
    el indice supera los 30 dias, porque un filtro regulatorio desactualizado da
    falsos negativos silenciosos.
    """

    __tablename__ = "invima_syncs"

    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str] = mapped_column(String(40), default="socrata")  # socrata | archivo_plano
    status: Mapped[str] = mapped_column(String(20), default="ok")  # ok | error | parcial
    rows_ingested: Mapped[int] = mapped_column(Integer, default=0)
    rows_updated: Mapped[int] = mapped_column(Integer, default=0)
    message: Mapped[str] = mapped_column(Text, default="")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    triggered_by: Mapped[str] = mapped_column(String(255), default="")


# --------------------------------------------------------------------------- #
#  Fase 4: ingesta ampliada
# --------------------------------------------------------------------------- #
class IngestJob(Base):
    """Unidad de trabajo de la cola de ingesta (RF01).

    La cola vive en la base y no en memoria: si el proceso muere a mitad de una
    corrida, al reiniciar se sabe que quedo a medias y por que. Es tambien la
    costura por donde entraria Celery sin tocar los conectores.
    """

    __tablename__ = "ingest_jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    connector: Mapped[str] = mapped_column(String(60), default="", index=True)
    source_id: Mapped[int | None] = mapped_column(
        ForeignKey("sources.id", ondelete="CASCADE"), nullable=True, index=True
    )

    # pendiente | ejecutando | ok | parcial | error | cancelado
    status: Mapped[str] = mapped_column(String(20), default="pendiente", index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, default=3)

    # Momento a partir del cual el job es elegible. El reintento exponencial se
    # implementa empujando esta fecha hacia adelante, no durmiendo el worker.
    scheduled_for: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, index=True
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    items_found: Mapped[int] = mapped_column(Integer, default=0)
    items_new: Mapped[int] = mapped_column(Integer, default=0)
    message: Mapped[str] = mapped_column(Text, default="")
    triggered_by: Mapped[str] = mapped_column(String(255), default="")
    origin: Mapped[str] = mapped_column(String(20), default="manual")  # manual | programado
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class RawRecord(Base):
    """Copia integra de lo que devolvio la fuente, antes de interpretarlo (RF03).

    El criterio de aceptacion exige reconstruir la senal sin volver a consultar
    la fuente. Por eso el payload se guarda tal cual llego, separado de la senal
    derivada: si manana cambia el mapeo, se reprocesa desde aqui.
    """

    __tablename__ = "raw_records"
    __table_args__ = (
        UniqueConstraint("connector", "external_id", name="uq_raw_connector_external"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    connector: Mapped[str] = mapped_column(String(60), default="", index=True)
    external_id: Mapped[str] = mapped_column(String(200), default="", index=True)
    source_id: Mapped[int | None] = mapped_column(
        ForeignKey("sources.id", ondelete="SET NULL"), nullable=True, index=True
    )
    job_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)

    payload: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    payload_hash: Mapped[str] = mapped_column(String(80), default="", index=True)

    finding_id: Mapped[int | None] = mapped_column(
        ForeignKey("findings.id", ondelete="SET NULL"), nullable=True, index=True
    )
    technology_id: Mapped[int | None] = mapped_column(
        ForeignKey("technologies.id", ondelete="SET NULL"), nullable=True, index=True
    )

    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, index=True
    )
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reprocessed_count: Mapped[int] = mapped_column(Integer, default=0)
    adapter_version: Mapped[str] = mapped_column(String(40), default="")
    endpoint: Mapped[str] = mapped_column(String(1024), default="")


class Submission(Base):
    """Postulacion recibida por el canal reactivo (RF02).

    No entra al staging por si sola: pasa por moderacion. Un formulario publico
    sin cola de revision es una puerta abierta al catalogo metodologico.
    """

    __tablename__ = "submissions"

    id: Mapped[int] = mapped_column(primary_key=True)

    # Campos obligatorios que enumera el RF02.
    commercial_name: Mapped[str] = mapped_column(String(400), default="", index=True)
    inn_name: Mapped[str] = mapped_column(String(400), default="")
    mechanism: Mapped[str] = mapped_column(Text, default="")
    manufacturer: Mapped[str] = mapped_column(String(300), default="")
    indication: Mapped[str] = mapped_column(Text, default="")
    development_phase: Mapped[str] = mapped_column(String(120), default="")
    evidence_links: Mapped[list | None] = mapped_column(JSONType, default=list)

    # Declaracion de conflicto de interes: obligatoria, y si se declara uno hay
    # que describirlo. Sin esto la postulacion no se guarda.
    has_conflict: Mapped[bool] = mapped_column(Boolean, default=False)
    conflict_statement: Mapped[str] = mapped_column(Text, default="")

    submitter_name: Mapped[str] = mapped_column(String(255), default="")
    submitter_email: Mapped[str] = mapped_column(String(255), default="", index=True)
    submitter_org: Mapped[str] = mapped_column(String(300), default="")

    # recibida | aceptada | rechazada
    status: Mapped[str] = mapped_column(String(20), default="recibida", index=True)
    review_note: Mapped[str] = mapped_column(Text, default="")
    reviewed_by: Mapped[str] = mapped_column(String(255), default="")
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    technology_id: Mapped[int | None] = mapped_column(
        ForeignKey("technologies.id", ondelete="SET NULL"), nullable=True, index=True
    )

    ip_address: Mapped[str] = mapped_column(String(64), default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, index=True
    )


# --------------------------------------------------------------------------- #
#  Fase 5: evaluacion temprana, Mini-HTA y revision por pares
# --------------------------------------------------------------------------- #
class EvaluationDoc(Base):
    """Producto documental de una tecnologia en un ciclo (RF13-RF15).

    Tres niveles (ficha, informe, Mini-HTA) comparten la misma maquina de
    estados. El nivel exige campos distintos; el flujo editorial es el mismo.
    """

    __tablename__ = "evaluation_docs"
    __table_args__ = (
        UniqueConstraint("cycle_id", "technology_id", name="uq_eval_doc_per_cycle"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    cycle_id: Mapped[int] = mapped_column(ForeignKey("cycles.id", ondelete="CASCADE"), index=True)
    technology_id: Mapped[int] = mapped_column(
        ForeignKey("technologies.id", ondelete="CASCADE"), index=True
    )

    # ficha | informe | mini_hta
    product_level: Mapped[str] = mapped_column(String(20), default="ficha", index=True)
    # borrador | revision_interna | revision_externa | con_observaciones |
    # aprobado_comite | publicado
    status: Mapped[str] = mapped_column(String(40), default="borrador", index=True)

    title: Mapped[str] = mapped_column(String(500), default="")
    body: Mapped[dict | None] = mapped_column(JSONType, default=dict)
    confidential: Mapped[bool] = mapped_column(Boolean, default=False)
    confidential_fields: Mapped[list | None] = mapped_column(JSONType, default=list)

    version_major: Mapped[int] = mapped_column(Integer, default=0)
    version_minor: Mapped[int] = mapped_column(Integer, default=1)

    created_by: Mapped[str] = mapped_column(String(255), default="")
    updated_by: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class EvaluationVersion(Base):
    """Instantanea del documento en cada transicion (y en guardados mayores)."""

    __tablename__ = "evaluation_versions"

    id: Mapped[int] = mapped_column(primary_key=True)
    doc_id: Mapped[int] = mapped_column(
        ForeignKey("evaluation_docs.id", ondelete="CASCADE"), index=True
    )
    major: Mapped[int] = mapped_column(Integer, default=0)
    minor: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(40), default="borrador")
    body: Mapped[dict | None] = mapped_column(JSONType, default=dict)
    note: Mapped[str] = mapped_column(Text, default="")
    created_by: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ReviewAssignment(Base):
    """Asignacion de un revisor interno o externo (RF15, RF16).

    El externo no tiene cuenta: entra con un token de 10 dias. Sin COI firmado
    no puede leer el cuerpo del informe.
    """

    __tablename__ = "review_assignments"

    id: Mapped[int] = mapped_column(primary_key=True)
    doc_id: Mapped[int] = mapped_column(
        ForeignKey("evaluation_docs.id", ondelete="CASCADE"), index=True
    )
    # interno | externo
    kind: Mapped[str] = mapped_column(String(20), default="externo", index=True)
    reviewer_name: Mapped[str] = mapped_column(String(255), default="")
    reviewer_email: Mapped[str] = mapped_column(String(255), default="", index=True)
    reviewer_user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    token_hash: Mapped[str] = mapped_column(String(80), default="", index=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    coi_signed: Mapped[bool] = mapped_column(Boolean, default=False)
    coi_statement: Mapped[str] = mapped_column(Text, default="")
    coi_has_conflict: Mapped[bool] = mapped_column(Boolean, default=False)
    coi_signed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # invitado | en_lectura | observado | aprobado
    status: Mapped[str] = mapped_column(String(20), default="invitado", index=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ReviewComment(Base):
    """Observacion en linea sobre el documento, anclada a la version vista."""

    __tablename__ = "review_comments"

    id: Mapped[int] = mapped_column(primary_key=True)
    doc_id: Mapped[int] = mapped_column(
        ForeignKey("evaluation_docs.id", ondelete="CASCADE"), index=True
    )
    assignment_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    version_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    field_key: Mapped[str] = mapped_column(String(80), default="")
    body: Mapped[str] = mapped_column(Text, default="")
    author: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


# --------------------------------------------------------------------------- #
#  Fase 6: datamart estrategico, boletines y alertas
# --------------------------------------------------------------------------- #
class CycleDatamart(Base):
    """Instantanea agregada del ciclo para no golpear tablas transaccionales."""

    __tablename__ = "cycle_datamarts"

    id: Mapped[int] = mapped_column(primary_key=True)
    cycle_id: Mapped[int] = mapped_column(ForeignKey("cycles.id", ondelete="CASCADE"), unique=True)
    payload: Mapped[dict | None] = mapped_column(JSONType, default=dict)
    refreshed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class TimeToMarketSnapshot(Base):
    """Calculo de time-to-market versionado por ciclo (RF17)."""

    __tablename__ = "ttm_snapshots"
    __table_args__ = (
        UniqueConstraint("cycle_id", "technology_id", name="uq_ttm_cycle_tech"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    cycle_id: Mapped[int] = mapped_column(ForeignKey("cycles.id", ondelete="CASCADE"), index=True)
    technology_id: Mapped[int] = mapped_column(
        ForeignKey("technologies.id", ondelete="CASCADE"), index=True
    )
    months: Mapped[float | None] = mapped_column(Numeric(6, 2), nullable=True)
    band: Mapped[str] = mapped_column(String(40), default="desconocido", index=True)
    basis: Mapped[str] = mapped_column(String(80), default="")
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Bulletin(Base):
    """Boletin Epidemiologico y Financiero de Tecnologias Emergentes (RF19)."""

    __tablename__ = "bulletins"

    id: Mapped[int] = mapped_column(primary_key=True)
    cycle_id: Mapped[int] = mapped_column(ForeignKey("cycles.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(400), default="")
    # borrador | pendiente_aprobacion | publicado
    status: Mapped[str] = mapped_column(String(40), default="borrador", index=True)
    body: Mapped[dict | None] = mapped_column(JSONType, default=dict)
    compiled_by: Mapped[str] = mapped_column(String(255), default="")
    approved_by: Mapped[str] = mapped_column(String(255), default="")
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class AlertSubscription(Base):
    """Suscripcion a alertas por usuario y, opcionalmente, por cluster (RF20)."""

    __tablename__ = "alert_subscriptions"
    __table_args__ = (
        UniqueConstraint("user_id", "cluster_id", name="uq_alert_sub_user_cluster"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    cluster_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AlertEvent(Base):
    """Notificacion en plataforma. El correo queda pendiente de SMTP institucional."""

    __tablename__ = "alert_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # phase_change_high_budget | new_phase3_colombia
    kind: Mapped[str] = mapped_column(String(60), index=True)
    title: Mapped[str] = mapped_column(String(400), default="")
    body: Mapped[str] = mapped_column(Text, default="")
    technology_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    cluster_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class StrategyGraph(Base):
    """Vista de grafo del ciclo: layout, nodos abiertos y notas. El chat vive en ChatSession."""

    __tablename__ = "strategy_graphs"

    id: Mapped[int] = mapped_column(primary_key=True)
    cycle_id: Mapped[int] = mapped_column(ForeignKey("cycles.id", ondelete="CASCADE"), index=True)
    user_email: Mapped[str] = mapped_column(String(255), default="", index=True)
    title: Mapped[str] = mapped_column(String(400), default="Grafo del ciclo")
    payload: Mapped[dict | None] = mapped_column(JSONType, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


# --------------------------------------------------------------------------- #
#  Frente B: tareas programadas del worker (P0-4 vigilancia, P1-4 duplicados)
# --------------------------------------------------------------------------- #
class ScheduledRun(Base):
    """Registro de cada ejecucion de una tarea programada del worker.

    `task` es `vigilancia` (encola las fuentes vencidas) o `duplicados` (barrido
    difuso del ciclo activo). La corrida de vigilancia queda `en_curso` hasta que
    terminan sus jobs; entonces se consolidan los totales y se avisa en la bandeja.
    """

    __tablename__ = "scheduled_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    task: Mapped[str] = mapped_column(String(40), index=True)
    # en_curso | ok | parcial | error | sin_trabajo
    status: Mapped[str] = mapped_column(String(20), default="en_curso", index=True)
    origin: Mapped[str] = mapped_column(String(20), default="programado")  # programado | manual
    triggered_by: Mapped[str] = mapped_column(String(255), default="programador")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    items_found: Mapped[int] = mapped_column(Integer, default=0)
    items_new: Mapped[int] = mapped_column(Integer, default=0)
    message: Mapped[str] = mapped_column(Text, default="")
    detail: Mapped[dict | None] = mapped_column(JSONType, default=dict)
