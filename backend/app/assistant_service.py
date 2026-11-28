"""Asistente: contexto elegido por la persona, memoria del equipo y referencias de cada respuesta.

Tres piezas que usa `routers/chat.py`:

1. **Referencias** (`search_refs`, `resolve_refs`, `context_for_refs`). La persona
   elige señales, tecnologías, fuentes, informes, expedientes, notas o boletines,
   y el asistente responde leyendo su contenido completo, no solo lo que
   encuentre por palabras clave.
2. **Memoria** (`memory_*`). Lo que el equipo marcó como útil o le enseñó a mano.
   Se recupera en cada pregunta y se entrega como contexto. No entrena un
   modelo: es texto que el asistente consulta, y cada entrada dice de dónde salió.
3. **Reserva**. Los expedientes pueden llevar montos y campos reservados: a quien
   no tiene `analytics:restricted` se le entregan sin ellos, y la memoria que
   salió de contenido reservado solo se entrega a quien sí lo tiene.
"""
from __future__ import annotations

import re
import unicodedata
from datetime import datetime, timezone

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from .models import (
    AssistantKnowledge,
    Bulletin,
    Cluster,
    EvaluationDoc,
    Finding,
    Note,
    Recommendation,
    Source,
    Technology,
    User,
)
from .rbac import P_RESTRICTED_ANALYTICS, P_USER_MANAGE, has_permission

MAX_REFS = 12
ITEM_CHARS = 1800
CONTEXT_CHARS = 9000
MEMORY_IN_PROMPT = 4
TITLE_MAX = 300
CONTENT_MAX = 6000

TYPE_LABELS = {
    "finding": "Señal",
    "technology": "Tecnología",
    "source": "Fuente",
    "recommendation": "Informe de diseminación",
    "evaluation_doc": "Expediente de evaluación",
    "note": "Nota del equipo",
    "bulletin": "Boletín",
}
TYPE_LINKS = {
    "finding": "/senales",
    "source": "/fuentes",
    "recommendation": "/diseminacion",
    "evaluation_doc": "/evaluacion",
    "note": "/notas",
    "bulletin": "/boletines",
}
TECH_PAGES = {
    "capturada_no_asignada": "/bandeja-entrada",
    "asignada_a_ciclo": "/filtrado",
    "excluida": "/filtrado",
    "filtrada_apta_priorizacion": "/priorizacion",
    "bajo_vigilancia": "/priorizacion",
    "no_priorizada": "/priorizacion",
    "priorizada": "/evaluacion",
    "en_evaluacion": "/evaluacion",
    "publicada": "/evaluacion",
}
_STOP = {
    "que", "cual", "cuales", "como", "para", "por", "con", "los", "las", "del", "una", "uno", "sobre", "the", "and",
    "for", "with", "hay", "son", "esta", "este", "estas", "estos", "iets", "salud", "tecnologia", "tecnologias",
}


class AssistantError(ValueError):
    """Dato inválido para el asistente (referencia, memoria o valoración)."""


def fold(text: str) -> str:
    plain = unicodedata.normalize("NFKD", text or "")
    return "".join(c for c in plain if not unicodedata.combining(c)).lower()


def keywords(text: str) -> list[str]:
    out: list[str] = []
    for word in re.findall(r"[a-z0-9]{4,}", fold(text)):
        if word in _STOP:
            continue
        stem = word[:6]
        if stem not in out:
            out.append(stem)
    return out[:10]


def _tech_name(tech: Technology) -> str:
    return (tech.commercial_name or tech.inn_name or f"Tecnología {tech.id}").strip()


# --------------------------------------------------------------------------- #
#  Referencias: buscar, validar y convertir en contexto
# --------------------------------------------------------------------------- #
def _like(column, needle: str):
    return func.lower(column).like(f"%{needle}%")


def search_refs(db: Session, q: str, types: list[str] | None = None, limit: int = 8) -> list[dict]:
    """Elementos que se pueden adjuntar al contexto, por tipo. Sin texto devuelve los más recientes."""
    needle = (q or "").strip().lower()[:80]
    wanted = [t for t in (types or list(TYPE_LABELS)) if t in TYPE_LABELS]
    limit = max(1, min(20, limit))
    out: list[dict] = []

    def add(kind: str, row_id: int, title: str, subtitle: str = "") -> None:
        out.append({"type": kind, "id": row_id, "title": (title or "").strip()[:200] or f"#{row_id}", "subtitle": subtitle[:160], "type_label": TYPE_LABELS[kind]})

    if "finding" in wanted:
        query = db.query(Finding)
        if needle:
            query = query.filter(or_(_like(Finding.title, needle), _like(Finding.technology, needle), _like(Finding.summary, needle)))
        for f in query.order_by(Finding.created_at.desc(), Finding.id.desc()).limit(limit).all():
            add("finding", f.id, f.title or f.technology, f.source.title if f.source else "")
    if "technology" in wanted:
        query = db.query(Technology).filter(Technology.merged_into_id.is_(None))
        if needle:
            query = query.filter(or_(_like(Technology.commercial_name, needle), _like(Technology.inn_name, needle), _like(Technology.manufacturer, needle), _like(Technology.indication, needle)))
        for t in query.order_by(Technology.id.desc()).limit(limit).all():
            add("technology", t.id, _tech_name(t), (t.manufacturer or t.indication or "")[:160])
    if "source" in wanted:
        query = db.query(Source)
        if needle:
            query = query.filter(or_(_like(Source.title, needle), _like(Source.description, needle), _like(Source.tags, needle)))
        for s in query.order_by(Source.title.asc()).limit(limit).all():
            add("source", s.id, s.title, s.category or "")
    if "recommendation" in wanted:
        query = db.query(Recommendation)
        if needle:
            query = query.filter(or_(_like(Recommendation.title, needle), _like(Recommendation.content, needle)))
        for r in query.order_by(Recommendation.created_at.desc(), Recommendation.id.desc()).limit(limit).all():
            add("recommendation", r.id, r.title, "Validado" if r.status == "validado" else "Borrador")
    if "evaluation_doc" in wanted:
        query = db.query(EvaluationDoc)
        if needle:
            query = query.filter(_like(EvaluationDoc.title, needle))
        for d in query.order_by(EvaluationDoc.id.desc()).limit(limit).all():
            add("evaluation_doc", d.id, d.title, d.status or "")
    if "note" in wanted:
        query = db.query(Note)
        if needle:
            query = query.filter(or_(_like(Note.title, needle), _like(Note.content, needle)))
        for n in query.order_by(Note.updated_at.desc(), Note.id.desc()).limit(limit).all():
            add("note", n.id, n.title or (n.content or "")[:80], n.author_name or n.author_email or "")
    if "bulletin" in wanted:
        query = db.query(Bulletin)
        if needle:
            query = query.filter(_like(Bulletin.title, needle))
        for b in query.order_by(Bulletin.created_at.desc(), Bulletin.id.desc()).limit(limit).all():
            add("bulletin", b.id, b.title, b.status or "")
    return out


_MODELS = {
    "finding": Finding,
    "technology": Technology,
    "source": Source,
    "recommendation": Recommendation,
    "evaluation_doc": EvaluationDoc,
    "note": Note,
    "bulletin": Bulletin,
}


def _clean_refs(refs) -> list[tuple[str, int]]:
    """(tipo, id) válidos y sin repetir, en el orden recibido."""
    out: list[tuple[str, int]] = []
    for ref in refs or []:
        if not isinstance(ref, dict):
            continue
        kind = str(ref.get("type") or "")
        try:
            row_id = int(ref.get("id"))
        except (TypeError, ValueError):
            continue
        if kind in _MODELS and row_id > 0 and (kind, row_id) not in out:
            out.append((kind, row_id))
    if len(out) > MAX_REFS:
        raise AssistantError(f"Se pueden adjuntar hasta {MAX_REFS} elementos por conversación.")
    return out


def _load(db: Session, pairs: list[tuple[str, int]]) -> dict[tuple[str, int], object]:
    found: dict[tuple[str, int], object] = {}
    for kind, model in _MODELS.items():
        ids = [row_id for k, row_id in pairs if k == kind]
        if ids:
            for row in db.query(model).filter(model.id.in_(ids)).all():
                found[(kind, row.id)] = row
    return found


def _title(kind: str, row) -> str:
    if kind == "technology":
        return _tech_name(row)
    if kind == "note":
        return (row.title or (row.content or "")[:80] or f"Nota {row.id}").strip()
    if kind == "finding":
        return (row.title or row.technology or f"Señal {row.id}").strip()
    return (getattr(row, "title", "") or f"#{row.id}").strip()


def _link(kind: str, row) -> str:
    if kind == "technology":
        page = TECH_PAGES.get(row.status or "")
        return f"{page}?tecnologia={row.id}" if page else ""
    return TYPE_LINKS.get(kind, "")


def resolve_refs(db: Session, refs, *, origin: str = "elegido") -> list[dict]:
    """Referencias que existen, con su título y a dónde llevan. Las que ya no existen se omiten."""
    pairs = _clean_refs(refs)
    found = _load(db, pairs)
    out = []
    for kind, row_id in pairs:
        row = found.get((kind, row_id))
        if row is None:
            continue
        out.append(
            {
                "type": kind,
                "id": row_id,
                "title": _title(kind, row)[:200],
                "type_label": TYPE_LABELS[kind],
                "to": _link(kind, row),
                "origin": origin,
            }
        )
    return out


def _clip(text: str, limit: int = ITEM_CHARS) -> str:
    text = " ".join((text or "").split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def _describe(db: Session, kind: str, row, *, include_restricted: bool) -> str:
    """El contenido de un elemento, listo para el contexto del asistente."""
    if kind == "finding":
        src = row.source.title if row.source else ""
        parts = [
            f"Fuente: {src}" if src else "",
            f"Tecnología: {row.technology}" if row.technology else "",
            f"Tipo: {row.technology_type}" if row.technology_type else "",
            f"Horizonte: {row.horizon}" if row.horizon else "",
            f"Fase: {row.phase}" if row.phase else "",
            f"Área terapéutica: {row.therapeutic_area}" if row.therapeutic_area else "",
            f"Fecha: {row.published_date}" if row.published_date else "",
            f"Enlace: {row.url}" if row.url else "",
            f"Resumen: {row.summary}" if row.summary else "",
        ]
        return _clip(". ".join(p for p in parts if p))
    if kind == "technology":
        cluster = db.get(Cluster, row.cluster_id).name if row.cluster_id and db.get(Cluster, row.cluster_id) else ""
        parts = [
            f"Denominación común: {row.inn_name}" if row.inn_name else "",
            f"Fabricante: {row.manufacturer}" if row.manufacturer else "",
            f"Clúster: {cluster}" if cluster else "",
            f"Estado en el sistema: {row.status}" if row.status else "",
            f"Fase de desarrollo: {row.development_phase}" if getattr(row, "development_phase", "") else "",
            f"Indicación: {row.indication}" if row.indication else "",
            f"Mecanismo: {row.mechanism}" if row.mechanism else "",
            f"Ensayos: {', '.join(row.nct_ids)}" if row.nct_ids else "",
            f"Resumen: {row.summary}" if row.summary else "",
        ]
        return _clip(". ".join(p for p in parts if p))
    if kind == "source":
        parts = [
            f"Categoría: {row.category}" if row.category else "",
            f"Enlace: {row.url}" if row.url else "",
            f"Relación con el IETS: {row.relation_iets}" if row.relation_iets else "",
            f"Etiquetas: {row.tags}" if row.tags else "",
            f"Descripción: {row.description}" if row.description else "",
        ]
        return _clip(". ".join(p for p in parts if p))
    if kind == "recommendation":
        head = f"Estado: {'validado' if row.status == 'validado' else 'borrador'}. Impacto: {row.impact or 'sin definir'}."
        return _clip(f"{head} {row.content or ''}")
    if kind == "evaluation_doc":
        from .evaluation import FIELD_LABELS
        from .strategy_service import PUBLIC_HIDDEN_FIELDS

        hidden = set() if include_restricted else set(PUBLIC_HIDDEN_FIELDS) | set(row.confidential_fields or [])
        body = {k: v for k, v in (row.body or {}).items() if k not in hidden and str(v or "").strip()}
        fields = ". ".join(f"{FIELD_LABELS.get(k, k)}: {v}" for k, v in body.items())
        note = "" if include_restricted else " (Se omiten los campos reservados.)"
        return _clip(f"Estado: {row.status}. Nivel: {row.product_level}.{note} {fields}")
    if kind == "note":
        return _clip(f"Autor: {row.author_name or row.author_email}. {row.content or ''}")
    if kind == "bulletin":
        body = row.body or {}
        funnel = body.get("funnel") or {}
        top = ", ".join(f"{t.get('name')} ({t.get('points')} puntos)" for t in (body.get("top_prioritized") or [])[:10])
        parts = [
            f"Estado: {row.status}",
            f"Ciclo: {body.get('cycle_code') or ''}",
            "Embudo: " + ", ".join(f"{k} {v}" for k, v in funnel.items()) if funnel else "",
            f"Priorizadas: {top}" if top else "",
            f"Mensaje del líder: {body.get('note')}" if body.get("note") else "",
        ]
        return _clip(". ".join(p for p in parts if p))
    return ""


def context_for_refs(db: Session, refs: list[dict], user: User) -> str:
    """Texto con el contenido de los elementos elegidos, dentro del presupuesto del contexto."""
    if not refs:
        return ""
    include_restricted = has_permission(user, P_RESTRICTED_ANALYTICS)
    found = _load(db, [(r["type"], r["id"]) for r in refs])
    lines = ["ELEMENTOS ADJUNTOS (la persona los eligió; son la base de la respuesta):"]
    used = 0
    for i, ref in enumerate(refs, start=1):
        row = found.get((ref["type"], ref["id"]))
        if row is None:
            continue
        block = f"[{i}] {ref['type_label']}: {ref['title']}. {_describe(db, ref['type'], row, include_restricted=include_restricted)}"
        if used + len(block) > CONTEXT_CHARS:
            lines.append(f"(Se omiten {len(refs) - i + 1} elemento(s) por espacio: pida a la persona que pregunte por ellos aparte.)")
            break
        lines.append(block)
        used += len(block)
    return "\n".join(lines)


def uses_restricted(refs: list[dict]) -> bool:
    return any(r.get("type") == "evaluation_doc" for r in refs or [])


# --------------------------------------------------------------------------- #
#  Memoria del asistente
# --------------------------------------------------------------------------- #
def memory_retrieve(db: Session, question: str, user: User, *, limit: int = MEMORY_IN_PROMPT) -> list[AssistantKnowledge]:
    """Entradas activas de la memoria que comparten palabras con la pregunta, las mejores primero."""
    words = keywords(question)
    if not words:
        return []
    query = db.query(AssistantKnowledge).filter(AssistantKnowledge.status == "activa")
    if not has_permission(user, P_RESTRICTED_ANALYTICS):
        query = query.filter(AssistantKnowledge.restricted == False)  # noqa: E712
    scored = []
    for entry in query.order_by(AssistantKnowledge.id.desc()).limit(500).all():
        blob = fold(f"{entry.title} {entry.question} {entry.content}")
        hits = sum(1 for w in words if w in blob)
        if hits >= max(1, min(2, len(words))):
            scored.append((hits, entry.uses or 0, entry.id, entry))
    scored.sort(key=lambda t: (-t[0], -t[1], -t[2]))
    return [t[3] for t in scored[:limit]]


def memory_context(entries: list[AssistantKnowledge]) -> str:
    if not entries:
        return ""
    lines = ["MEMORIA DEL EQUIPO (lo que el equipo marcó como útil o le enseñó al asistente):"]
    for entry in entries:
        lines.append(f"- {entry.title}: {_clip(entry.content, 900)}")
    return "\n".join(lines)


def memory_mark_used(db: Session, entries: list[AssistantKnowledge]) -> None:
    now = datetime.now(timezone.utc)
    for entry in entries:
        entry.uses = int(entry.uses or 0) + 1
        entry.last_used_at = now


def memory_refs(entries: list[AssistantKnowledge]) -> list[dict]:
    return [
        {"type": "memory", "id": e.id, "title": (e.title or "")[:200], "type_label": "Memoria del equipo", "to": "", "origin": "memoria"}
        for e in entries
    ]


def _clean_entry(title: str, content: str) -> tuple[str, str]:
    title = " ".join((title or "").split())
    content = (content or "").strip()
    if not title:
        raise AssistantError("Escriba un título para reconocer esta entrada.")
    if len(title) > TITLE_MAX:
        raise AssistantError(f"El título admite hasta {TITLE_MAX} caracteres.")
    if len(content) < 20:
        raise AssistantError("El contenido es demasiado corto para servirle al asistente (mínimo 20 caracteres).")
    if len(content) > CONTENT_MAX:
        raise AssistantError(f"El contenido admite hasta {CONTENT_MAX} caracteres.")
    return title, content


def memory_create(
    db: Session,
    user: User,
    *,
    title: str,
    content: str,
    kind: str = "dato",
    question: str = "",
    refs: list[dict] | None = None,
    restricted: bool = False,
    session_id: int | None = None,
    message_id: int | None = None,
) -> AssistantKnowledge:
    title, content = _clean_entry(title, content)
    if message_id is not None:
        existing = db.query(AssistantKnowledge).filter(AssistantKnowledge.message_id == message_id).first()
        if existing is not None:
            raise AssistantError("Esta respuesta ya está en la memoria del asistente.")
    entry = AssistantKnowledge(
        title=title,
        content=content,
        kind="respuesta" if kind == "respuesta" else "dato",
        question=(question or "").strip()[:2000],
        refs=[{k: r.get(k) for k in ("type", "id", "title")} for r in (refs or []) if r.get("type") != "memory"][:MAX_REFS],
        restricted=bool(restricted),
        status="activa",
        session_id=session_id,
        message_id=message_id,
        created_by=user.email or "",
        created_by_name=user.name or user.email or "",
    )
    db.add(entry)
    db.flush()
    return entry


def can_manage(user: User, entry: AssistantKnowledge) -> bool:
    return (entry.created_by or "").lower() == (user.email or "").lower() or has_permission(user, P_USER_MANAGE)


def memory_update(db: Session, entry: AssistantKnowledge, *, title: str | None, content: str | None, status: str | None) -> list[str]:
    changed: list[str] = []
    if title is not None or content is not None:
        new_title, new_content = _clean_entry(title if title is not None else entry.title, content if content is not None else entry.content)
        if new_title != entry.title:
            entry.title = new_title
            changed.append("title")
        if new_content != entry.content:
            entry.content = new_content
            changed.append("content")
    if status is not None:
        if status not in ("activa", "archivada"):
            raise AssistantError("El estado debe ser activa o archivada.")
        if status != entry.status:
            entry.status = status
            changed.append("status")
    return changed


def memory_out(entry: AssistantKnowledge, user: User) -> dict:
    return {
        "id": entry.id,
        "title": entry.title,
        "content": entry.content,
        "kind": entry.kind,
        "question": entry.question or "",
        "refs": entry.refs or [],
        "restricted": bool(entry.restricted),
        "status": entry.status,
        "created_by": entry.created_by,
        "created_by_name": entry.created_by_name or entry.created_by,
        "uses": int(entry.uses or 0),
        "last_used_at": entry.last_used_at,
        "created_at": entry.created_at,
        "updated_at": entry.updated_at,
        "can_manage": can_manage(user, entry),
    }


def memory_list(db: Session, user: User, *, q: str = "", status: str = "activa", mine: bool = False) -> list[AssistantKnowledge]:
    query = db.query(AssistantKnowledge)
    if not has_permission(user, P_RESTRICTED_ANALYTICS):
        query = query.filter(AssistantKnowledge.restricted == False)  # noqa: E712
    if status in ("activa", "archivada"):
        query = query.filter(AssistantKnowledge.status == status)
    if mine:
        query = query.filter(func.lower(AssistantKnowledge.created_by) == (user.email or "").lower())
    needle = (q or "").strip().lower()[:80]
    if needle:
        query = query.filter(
            or_(_like(AssistantKnowledge.title, needle), _like(AssistantKnowledge.content, needle), _like(AssistantKnowledge.question, needle))
        )
    return query.order_by(AssistantKnowledge.updated_at.desc(), AssistantKnowledge.id.desc()).limit(300).all()


def memory_stats(db: Session, user: User) -> dict:
    query = db.query(AssistantKnowledge)
    if not has_permission(user, P_RESTRICTED_ANALYTICS):
        query = query.filter(AssistantKnowledge.restricted == False)  # noqa: E712
    rows = query.with_entities(AssistantKnowledge.status, AssistantKnowledge.kind, AssistantKnowledge.uses).all()
    active = [r for r in rows if r[0] == "activa"]
    return {
        "active": len(active),
        "archived": len(rows) - len(active),
        "from_answers": sum(1 for r in active if r[1] == "respuesta"),
        "taught": sum(1 for r in active if r[1] != "respuesta"),
        "uses": sum(int(r[2] or 0) for r in rows),
    }
