"""Buscador de tecnologias de la pantalla principal (RF-005).

Busca por nombre de la tecnologia o de la senal con coincidencia parcial, sin
distinguir mayusculas ni tildes, en espanol o ingles (el texto se compara tal
como se capturo, que suele venir en ingles, y tal como lo clasifico el equipo).
Incluye DCI (sinonimo), marca, fabricante y fuente. Cada resultado dice en que
modulo y etapa esta, su estado (descartada, excluida, fusionada por duplicado),
el responsable del ultimo cambio y su fecha, y un enlace directo al registro.

El recorrido por etapas sale de la bitacora (solo lectura).
"""
from __future__ import annotations

import unicodedata
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from .methodology import TECHNOLOGY_STATUS_LABELS
from .models import AuditLog, Cycle, CycleTechnology, Finding, Source, Technology, TechType

MAX_RESULTS = 30
MIN_QUERY = 2

# Modulo y pantalla de cada estado (mismo criterio que la bandeja de trabajo).
MODULE_BY_STATUS = {
    "capturada_no_asignada": ("Módulo 1. Identificación", "Bandeja de entrada", "/bandeja-entrada"),
    "asignada_a_ciclo": ("Módulo 1. Identificación", "Filtrado y depuración", "/filtrado"),
    "excluida": ("Módulo 1. Identificación", "Filtrado y depuración", "/filtrado"),
    "filtrada_apta_priorizacion": ("Módulo 2. Priorización", "Priorización", "/priorizacion"),
    "bajo_vigilancia": ("Módulo 2. Priorización", "Priorización", "/priorizacion"),
    "no_priorizada": ("Módulo 2. Priorización", "Priorización", "/priorizacion"),
    "priorizada": ("Módulo 3. Evaluación", "Evaluación", "/evaluacion"),
    "en_evaluacion": ("Módulo 3. Evaluación", "Evaluación", "/evaluacion"),
    "publicada": ("Módulo 4. Diseminación", "Evaluación", "/evaluacion"),
}


def fold(text: str) -> str:
    """Minusculas, sin tildes ni signos: 'Señal Ácida' -> 'senal acida'."""
    base = unicodedata.normalize("NFKD", text or "")
    base = "".join(c for c in base if not unicodedata.combining(c)).lower()
    return " ".join("".join(c if c.isalnum() else " " for c in base).split())


def _utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def _name(tech: Technology) -> str:
    return tech.commercial_name or tech.inn_name or f"Tecnología {tech.id}"


def _matches(q: str, fields: dict[str, str]) -> list[str]:
    tokens = q.split()
    hay = {k: fold(v) for k, v in fields.items() if v}
    joined = " ".join(hay.values())
    if not all(t in joined for t in tokens):
        return []
    return [k for k, v in hay.items() if any(t in v for t in tokens)]


def _last_audit(db: Session, tech: Technology, entry_ids: list[int]) -> AuditLog | None:
    query = db.query(AuditLog).filter(
        ((AuditLog.entity_type == "technologies") & (AuditLog.entity_id == str(tech.id)))
        | ((AuditLog.entity_type == "cycle_technologies") & (AuditLog.entity_id.in_([str(i) for i in entry_ids] or ["-"])))
    )
    return query.order_by(AuditLog.occurred_at.desc(), AuditLog.id.desc()).first()


def _state(db: Session, tech: Technology) -> dict:
    """Estado y ubicacion actuales: global, o la instancia del ciclo mas reciente."""
    entry_row = (
        db.query(CycleTechnology, Cycle)
        .join(Cycle, Cycle.id == CycleTechnology.cycle_id)
        .filter(CycleTechnology.technology_id == tech.id)
        .order_by(Cycle.opened_on.desc(), CycleTechnology.id.desc())
        .first()
    )
    entry, cycle = entry_row if entry_row else (None, None)
    status = entry.status if entry is not None else tech.status
    module, stage, path = MODULE_BY_STATUS.get(status, MODULE_BY_STATUS["capturada_no_asignada"])
    label = TECHNOLOGY_STATUS_LABELS.get(status, status)
    flags: list[str] = []
    if tech.merged_into_id:
        merged = db.get(Technology, tech.merged_into_id)
        label = "Fusionada por duplicado"
        flags.append(f"Fusionada en «{_name(merged)}»" if merged else "Fusionada por duplicado")
        module, stage, path = ("Módulo 1. Identificación", "Filtrado y depuración", "/filtrado")
    elif status == "capturada_no_asignada" and getattr(tech, "legacy", False):
        label = "Legacy (fuente del inventario anterior)"
        module, stage, path = ("Módulo 1. Identificación", "Bandeja de entrada (Legacy)", "/bandeja-entrada")
    elif status == "excluida" and entry is None:
        label = "Descartada en la bandeja"
        module, stage, path = ("Módulo 1. Identificación", "Bandeja de entrada (descartadas)", "/bandeja-entrada")
    elif status == "excluida":
        label = "Excluida en el filtrado"
    if entry is not None and entry.frozen:
        flags.append("Ciclo cerrado (archivada)")
    if cycle is not None and cycle.is_historic:
        flags.append("Ciclo histórico")
    return {
        "status": status,
        "status_label": label,
        "module": module,
        "stage": stage,
        "path": path,
        "cycle_code": cycle.code if cycle is not None else "",
        "cycle_id": cycle.id if cycle is not None else None,
        "entry": entry,
        "flags": flags,
    }


def search(db: Session, q: str, *, limit: int = MAX_RESULTS) -> dict:
    query = fold(q)
    if len(query) < MIN_QUERY:
        return {"query": q, "total": 0, "results": [], "message": "Escriba al menos dos letras."}
    sources = {s.id: s.title for s in db.query(Source.id, Source.title).all()}
    types = {t.id: t.name for t in db.query(TechType.id, TechType.name).all()}
    findings = {
        f.id: (f.title, f.technology)
        for f in db.query(Finding.id, Finding.title, Finding.technology)
        .filter(Finding.id.in_(db.query(Technology.finding_id).filter(Technology.finding_id.isnot(None))))
        .all()
    }
    hits: list[tuple[int, Technology, list[str]]] = []
    for tech in db.query(Technology).yield_per(500):
        ftitle, ftech = findings.get(tech.finding_id or 0, ("", ""))
        fields = {
            "nombre": tech.commercial_name,
            "dci": tech.inn_name,
            "marca": tech.brand,
            "fabricante": tech.manufacturer,
            "senal": ftitle,
            "tecnologia_senal": ftech,
            "fuente": sources.get(tech.source_id or 0, ""),
        }
        matched = _matches(query, fields)
        if not matched:
            continue
        name_hit = fold(tech.commercial_name or "").startswith(query) or fold(tech.inn_name or "").startswith(query)
        score = (0 if name_hit else 1 if {"nombre", "dci"} & set(matched) else 2)
        hits.append((score, tech, matched))
    hits.sort(key=lambda h: (h[0], -(_utc(h[1].updated_at) or datetime.min.replace(tzinfo=timezone.utc)).timestamp()))
    results = []
    for _score, tech, matched in hits[:limit]:
        state = _state(db, tech)
        entry = state.pop("entry")
        last = _last_audit(db, tech, [entry.id] if entry is not None else [])
        changed_at = max(
            [d for d in (_utc(tech.updated_at), _utc(entry.updated_at) if entry is not None else None, _utc(last.occurred_at) if last else None) if d],
            default=None,
        )
        responsible = (last.user_email if last else "") or (entry.assigned_by if entry is not None else "") or tech.captured_by or ""
        results.append(
            {
                "id": tech.id,
                "name": _name(tech),
                "inn_name": tech.inn_name or "",
                "manufacturer": tech.manufacturer or "",
                "tech_type": types.get(tech.tech_type_id or 0, "") or "",
                "source_title": sources.get(tech.source_id or 0, ""),
                "signal_title": findings.get(tech.finding_id or 0, ("", ""))[0] or "",
                "matched_on": matched,
                **state,
                "responsible": "Sistema (captura automática)" if responsible in ("", "sistema", "scraper") else responsible,
                "last_change_at": changed_at.isoformat() if changed_at else None,
                "link": f"{state['path']}?tecnologia={tech.id}",
            }
        )
    message = "" if results else f"No se encontraron tecnologías ni señales con «{q.strip()}». Pruebe con otra parte del nombre, la DCI, el fabricante o la fuente."
    return {"query": q, "total": len(hits), "results": results, "message": message}


ACTION_LABELS = {
    "create": "Registro creado",
    "update": "Cambio de datos",
    "delete": "Registro eliminado",
    "staging:discard": "Descartada en la bandeja",
    "staging:restore": "Restaurada a la bandeja",
    "priority:classify": "Clasificada en la priorización",
}


def history(db: Session, technology_id: int) -> dict:
    """Recorrido de la tecnologia por etapas, tomado de la bitacora (solo lectura)."""
    tech = db.get(Technology, technology_id)
    if tech is None:
        raise LookupError("Tecnología no encontrada")
    entries = db.query(CycleTechnology).filter(CycleTechnology.technology_id == tech.id).all()
    cycles = {c.id: c.code for c in db.query(Cycle.id, Cycle.code).all()}
    entry_cycle = {str(e.id): cycles.get(e.cycle_id, "") for e in entries}
    logs = (
        db.query(AuditLog)
        .filter(
            ((AuditLog.entity_type == "technologies") & (AuditLog.entity_id == str(tech.id)))
            | ((AuditLog.entity_type == "cycle_technologies") & (AuditLog.entity_id.in_(list(entry_cycle) or ["-"])))
        )
        .order_by(AuditLog.occurred_at.asc(), AuditLog.id.asc())
        .all()
    )
    steps = []
    for log in logs:
        old = log.old_value if isinstance(log.old_value, dict) else {}
        new = log.new_value if isinstance(log.new_value, dict) else {}
        status_from = old.get("status")
        status_to = new.get("status")
        if log.action == "create" and log.entity_type == "cycle_technologies":
            label = f"Asignada al ciclo {entry_cycle.get(log.entity_id, '')}".strip()
        elif status_to and status_from:
            label = f"{TECHNOLOGY_STATUS_LABELS.get(status_from, status_from)} → {TECHNOLOGY_STATUS_LABELS.get(status_to, status_to)}"
        elif status_to:
            label = f"Estado: {TECHNOLOGY_STATUS_LABELS.get(status_to, status_to)}"
        else:
            label = ACTION_LABELS.get(log.action, log.action)
        stage_change = bool(status_to) or log.action in ("create", "staging:discard", "staging:restore", "priority:classify")
        steps.append(
            {
                "at": _utc(log.occurred_at).isoformat() if log.occurred_at else None,
                "user": log.user_email or "",
                "action": log.action,
                "label": label,
                "stage_change": stage_change,
                "cycle_code": entry_cycle.get(log.entity_id, "") if log.entity_type == "cycle_technologies" else "",
                "fields": sorted(k for k in new if k not in ("updated_at",))[:8],
            }
        )
    return {"id": tech.id, "name": _name(tech), "steps": steps}
