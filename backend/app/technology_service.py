"""Servicio de tecnologias: puente entre la captura (`Finding`) y la entidad
metodologica persistente (`Technology`), y migracion del acervo historico.

Principio del plan: la operacion actual no se detiene. El scraper sigue
produciendo `Finding` como registro de captura, y cada senal se proyecta a una
`Technology` en estado `capturada_no_asignada`, lista para el staging.
"""
from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy.orm import Session

from .classification import suggest_cluster, suggest_condition, suggest_tech_type
from .models import Cycle, CycleTechnology, Finding, Technology

HISTORIC_CYCLE_CODE = "Ciclo 0 - Historico"

# Estados de senal ya trabajados que se arrastran al ciclo historico.
WORKED_FINDING_STATUSES = ("revisado", "priorizado", "descartado")

# Correspondencia entre el estado heredado de la senal y el estado metodologico.
LEGACY_STATUS_MAP = {
    "nuevo": "capturada_no_asignada",
    "revisado": "filtrada_apta_priorizacion",
    "priorizado": "priorizada",
    "descartado": "excluida",
}


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    text = str(value).strip()[:10]
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def _raw_payload_from_finding(finding: Finding) -> dict:
    """Conserva la senal original para poder reconstruirla sin volver a la fuente."""
    return {
        "origin": "finding",
        "finding_id": finding.id,
        "title": finding.title,
        "url": finding.url,
        "summary": finding.summary,
        "technology": finding.technology,
        "technology_type": finding.technology_type,
        "horizon": finding.horizon,
        "phase": finding.phase,
        "therapeutic_area": finding.therapeutic_area,
        "published_date": finding.published_date,
        "content_hash": finding.content_hash,
        "source_id": finding.source_id,
        "captured_at": finding.created_at.isoformat() if finding.created_at else None,
    }


def sync_technology_from_finding(
    db: Session, finding: Finding, *, captured_by: str = "", commit: bool = False
) -> Technology:
    """Crea o actualiza la `Technology` asociada a una senal capturada.

    No sobrescribe la clasificacion confirmada por un evaluador: las sugerencias
    solo se aplican mientras el campo siga vacio.
    """
    tech = db.query(Technology).filter(Technology.finding_id == finding.id).first()
    is_new = tech is None
    if tech is None:
        tech = Technology(finding_id=finding.id, source_channel="proactiva")
        db.add(tech)

    tech.commercial_name = (finding.technology or finding.title or "")[:400]
    tech.indication = finding.therapeutic_area or ""
    tech.summary = finding.summary or ""
    tech.url = finding.url or ""
    tech.horizon = finding.horizon or ""
    tech.development_phase = finding.phase or ""
    tech.source_id = finding.source_id
    tech.screening_score = finding.screening_score or 0
    tech.raw_payload = _raw_payload_from_finding(finding)
    if is_new:
        tech.captured_at = finding.created_at or datetime.now(timezone.utc)
        tech.captured_by = captured_by or "scraper"
        tech.status = LEGACY_STATUS_MAP.get(finding.status, "capturada_no_asignada")

    if not tech.condition:
        tech.condition = suggest_condition(
            phase=finding.phase,
            summary=finding.summary,
            title=finding.title,
            horizon=finding.horizon,
        )

    if tech.tech_type_id is None:
        type_id, _reason = suggest_tech_type(
            db,
            legacy_type=finding.technology_type,
            title=finding.title,
            summary=finding.summary,
            technology=finding.technology,
        )
        tech.tech_type_id = type_id

    if tech.cluster_id is None:
        cluster_id, reason = suggest_cluster(
            db,
            indication=finding.therapeutic_area,
            summary=finding.summary,
            title=finding.title,
        )
        tech.suggested_cluster_id = cluster_id
        tech.suggested_cluster_reason = reason[:400]

    published = _parse_date(finding.published_date)
    if published and tech.phase3_completion_date is None and "iii" in (finding.phase or "").lower():
        tech.phase3_completion_date = published

    if commit:
        db.commit()
        db.refresh(tech)
    return tech


def get_or_create_historic_cycle(db: Session) -> Cycle:
    """Ciclo retroactivo cerrado que preserva la trazabilidad del acervo previo
    sin contaminar los indicadores de los ciclos formales."""
    cycle = db.query(Cycle).filter(Cycle.code == HISTORIC_CYCLE_CODE).first()
    if cycle:
        return cycle
    today = datetime.now(timezone.utc)
    first_finding = db.query(Finding).order_by(Finding.created_at.asc()).first()
    opened = (first_finding.created_at.date() if first_finding and first_finding.created_at else today.date())
    cycle = Cycle(
        code=HISTORIC_CYCLE_CODE,
        year=opened.year,
        opened_on=opened,
        data_cutoff_on=today.date(),
        status="cerrado_consolidado",
        is_historic=True,
        closed_at=today,
        notes=(
            "Ciclo retroactivo creado por la migracion de la fase 1. Agrupa las senales "
            "trabajadas bajo el modelo anterior de puntuacion continua (0-100), que no es "
            "comparable con el indice oficial %P."
        ),
    )
    db.add(cycle)
    db.commit()
    db.refresh(cycle)
    return cycle


def backfill_technologies(db: Session) -> dict:
    """Proyecta las senales existentes a tecnologias y arma el ciclo historico.

    Idempotente: puede ejecutarse en cada arranque sin duplicar registros.
    """
    created = 0
    linked = 0

    findings = db.query(Finding).order_by(Finding.id.asc()).all()
    if not findings:
        return {"technologies_created": 0, "historic_entries": 0}

    existing_ids = {
        row[0]
        for row in db.query(Technology.finding_id).filter(Technology.finding_id.isnot(None)).all()
    }

    pending = [f for f in findings if f.id not in existing_ids]
    for finding in pending:
        sync_technology_from_finding(db, finding, captured_by="migracion-fase-1")
        created += 1
    if created:
        db.commit()

    worked = [f for f in findings if f.status in WORKED_FINDING_STATUSES]
    if worked:
        cycle = get_or_create_historic_cycle(db)
        existing_entries = {
            row[0]
            for row in db.query(CycleTechnology.technology_id)
            .filter(CycleTechnology.cycle_id == cycle.id)
            .all()
        }
        for finding in worked:
            tech = db.query(Technology).filter(Technology.finding_id == finding.id).first()
            if tech is None or tech.id in existing_entries:
                continue
            db.add(
                CycleTechnology(
                    cycle_id=cycle.id,
                    technology_id=tech.id,
                    status=LEGACY_STATUS_MAP.get(finding.status, "asignada_a_ciclo"),
                    frozen=True,
                    assigned_by="migracion-fase-1",
                )
            )
            linked += 1
        if linked:
            db.commit()

    return {"technologies_created": created, "historic_entries": linked}
