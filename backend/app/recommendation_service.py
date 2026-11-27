"""Informes de diseminacion: validacion humana, origen, recorrido y exporte.

Un informe nace como borrador (lo redacte una persona o la IA) y solo viaja en
el paquete del ciclo cuando alguien lo valida. Editar un informe validado lo
devuelve a borrador: lo que se valido ya no es lo que dice el texto.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from . import audit
from .models import AuditLog, CycleTechnology, Finding, Recommendation, Technology

STATUSES = ("borrador", "validado")
STATUS_LABELS = {"borrador": "Borrador", "validado": "Validado"}
IMPACT_LABELS = {"alto": "Alto", "medio": "Medio", "bajo": "Bajo", "": "Sin definir"}
MAX_TITLE = 590
MAX_CONTENT = 60000
MIN_VALIDATE_CHARS = 80


class RecommendationRuleError(ValueError):
    """Violacion de una regla del flujo de informes."""


def origin_of(rec: Recommendation) -> str:
    """manual, ia o preliminar (generado sin IA configurada)."""
    model = (rec.model_used or "manual").lower()
    if model.startswith("manual"):
        return "manual"
    if "sin ia" in model or "fallback" in model:
        return "preliminar"
    return "ia"


def was_edited(rec: Recommendation) -> bool:
    return "editado" in (rec.model_used or "")


def cycle_finding_ids(db: Session, cycle_id: int) -> list[int]:
    rows = (
        db.query(Technology.finding_id)
        .join(CycleTechnology, CycleTechnology.technology_id == Technology.id)
        .filter(CycleTechnology.cycle_id == cycle_id, Technology.finding_id.isnot(None))
        .all()
    )
    return [fid for (fid,) in rows]


def context_for(db: Session, recs: list[Recommendation]) -> dict[int, dict]:
    """Señal y tecnología de origen de cada informe, en dos consultas."""
    finding_ids = {r.finding_id for r in recs if r.finding_id}
    if not finding_ids:
        return {}
    findings = {f.id: f for f in db.query(Finding).filter(Finding.id.in_(finding_ids)).all()}
    techs: dict[int, Technology] = {}
    for tech in db.query(Technology).filter(Technology.finding_id.in_(finding_ids)).order_by(Technology.id.desc()):
        techs[tech.finding_id] = tech
    out: dict[int, dict] = {}
    for fid in finding_ids:
        finding = findings.get(fid)
        tech = techs.get(fid)
        out[fid] = {
            "finding_title": (finding.title if finding else "") or "",
            "technology_id": tech.id if tech else None,
            "technology_name": (tech.commercial_name or tech.inn_name or "") if tech else "",
        }
    return out


def validate(db: Session, rec: Recommendation, *, actor: str) -> Recommendation:
    if rec.status == "validado":
        raise RecommendationRuleError("El informe ya estaba validado.")
    if not (rec.impact or "").strip():
        raise RecommendationRuleError("Defina el impacto (alto, medio o bajo) antes de validar el informe.")
    if len((rec.content or "").strip()) < MIN_VALIDATE_CHARS:
        raise RecommendationRuleError(
            f"El contenido es demasiado corto para validarlo (mínimo {MIN_VALIDATE_CHARS} caracteres)."
        )
    rec.status = "validado"
    rec.validated_by = actor
    rec.validated_at = datetime.now(timezone.utc)
    audit.record_action(
        db,
        entity_type="recommendations",
        entity_id=rec.id,
        action="recommendation:validated",
        new_value={"actor": actor, "impact": rec.impact, "origin": origin_of(rec)},
    )
    return rec


def reopen(db: Session, rec: Recommendation, *, actor: str, reason: str = "") -> Recommendation:
    if rec.status != "validado":
        raise RecommendationRuleError("El informe ya está en borrador.")
    previous = {"validated_by": rec.validated_by}
    rec.status = "borrador"
    rec.validated_by = ""
    rec.validated_at = None
    audit.record_action(
        db,
        entity_type="recommendations",
        entity_id=rec.id,
        action="recommendation:reopened",
        old_value=previous,
        new_value={"actor": actor, "reason": (reason or "").strip()[:300]},
    )
    return rec


FIELD_NAMES = {"title": "título", "content": "contenido", "impact": "impacto"}


def history(db: Session, rec: Recommendation) -> list[dict]:
    """Recorrido del informe segun la bitacora, del mas antiguo al mas reciente."""
    rows = (
        db.query(AuditLog)
        .filter(AuditLog.entity_type == "recommendations", AuditLog.entity_id == str(rec.id))
        .order_by(AuditLog.occurred_at.asc(), AuditLog.id.asc())
        .all()
    )
    out: list[dict] = []
    for ev in rows:
        new = ev.new_value if isinstance(ev.new_value, dict) else {}
        kind = label = detail = ""
        if ev.action == "create":
            kind, label = "created", "Informe creado"
            detail = f"Origen: {new.get('model_used') or 'manual'}"
        elif ev.action == "recommendation:validated":
            kind, label = "validated", "Validado"
        elif ev.action == "recommendation:reopened":
            kind, label = "reopened", "Devuelto a borrador"
            detail = new.get("reason") or ""
        elif ev.action == "update":
            changed = [FIELD_NAMES[k] for k in ("title", "content", "impact") if k in new]
            if not changed:
                continue  # el cambio de estado ya tiene su propio evento
            kind, label = "edited", "Editado"
            detail = "Cambió: " + ", ".join(changed)
        else:
            continue
        out.append(
            {
                "kind": kind,
                "label": label,
                "detail": detail[:300],
                "at": ev.occurred_at.isoformat() if ev.occurred_at else "",
                "by": ev.user_email or "",
            }
        )
    return out


def export_rows(db: Session, recs: list[Recommendation]) -> tuple[list[str], list[list]]:
    ctx = context_for(db, recs)
    header = [
        "ID", "Título", "Estado", "Impacto", "Origen", "Editado a mano", "Señal de origen", "Tecnología",
        "Creado por", "Creado", "Validado por", "Validado", "Última edición por", "Última edición", "Palabras",
    ]
    rows = []
    for r in recs:
        c = ctx.get(r.finding_id or 0, {})
        rows.append([
            r.id, r.title, STATUS_LABELS.get(r.status, r.status), IMPACT_LABELS.get(r.impact or "", r.impact),
            r.model_used or "manual", "Sí" if was_edited(r) else "No",
            c.get("finding_title", ""), c.get("technology_name", ""),
            r.created_by, r.created_at.isoformat() if r.created_at else "",
            r.validated_by, r.validated_at.isoformat() if r.validated_at else "",
            r.updated_by, r.updated_at.isoformat() if r.updated_at else "",
            len((r.content or "").split()),
        ])
    return header, rows
