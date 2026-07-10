"""Modelos ORM del Sistema de Escaneo de Horizonte del IETS."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), default="")
    picture: Mapped[str] = mapped_column(String(1024), default="")
    role: Mapped[str] = mapped_column(String(32), default="viewer")  # admin | editor | viewer
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_login: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


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
    title: Mapped[str] = mapped_column(String(400), default="Nueva conversacion")
    user_email: Mapped[str] = mapped_column(String(255), default="", index=True)
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
