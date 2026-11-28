"""Notas de trabajo del equipo sobre hallazgos, fuentes y recomendaciones."""
from __future__ import annotations

import csv
import io
import json

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import ai_service
from ..audit import record_action
from ..database import get_db
from ..deps import get_current_user, require_permission
from ..events import bump_state_version
from ..models import Finding, Note, Recommendation, Source, User
from ..rbac import P_NOTE_WRITE, P_USER_MANAGE, has_permission
from ..schemas import AiEnhanceOut, NoteCreate, NoteHistoryEvent, NoteOut, NoteUpdate

router = APIRouter(prefix="/api/notes", tags=["notes"])

ENTITY_TYPES = {"finding", "source", "recommendation", "general"}


def _entity_label(db: Session, entity_type: str, entity_id: int | None) -> str:
    if not entity_id or entity_type == "general":
        return "Nota general"
    if entity_type == "finding":
        row = db.get(Finding, entity_id)
        return row.title[:120] if row else f"Hallazgo #{entity_id}"
    if entity_type == "source":
        row = db.get(Source, entity_id)
        return row.title[:120] if row else f"Fuente #{entity_id}"
    if entity_type == "recommendation":
        row = db.get(Recommendation, entity_id)
        return row.title[:120] if row else f"Recomendación #{entity_id}"
    return ""


ENTITY_MODELS = {"finding": Finding, "source": Source, "recommendation": Recommendation}


def _check_owner(user: User, note: Note, action: str) -> None:
    """Editar o borrar la nota ajena solo lo hace el superadministrador.

    Fijarla si lo puede cualquier perfil con `note:write`: fijar ordena la vista
    del equipo, no altera lo que otra persona escribio.
    """
    if (note.author_email or "").lower() == (user.email or "").lower():
        return
    if has_permission(user, P_USER_MANAGE):
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=f"Solo el autor de la nota o un superadministrador puede {action}.",
    )


CONTENT_MAX = 20000
SORTS = {
    "recientes": (Note.updated_at.desc(), Note.id.desc()),
    "antiguas": (Note.updated_at.asc(), Note.id.asc()),
    "titulo": (func.lower(Note.title).asc(), Note.id.asc()),
}


def _labels(db: Session, notes: list[Note]) -> dict[tuple[str, int], str | None]:
    """Título de cada elemento vinculado, en una consulta por tipo. `None` si ya no existe."""
    out: dict[tuple[str, int], str | None] = {}
    for kind, model in ENTITY_MODELS.items():
        ids = {n.entity_id for n in notes if n.entity_type == kind and n.entity_id}
        if not ids:
            continue
        found = dict(db.query(model.id, model.title).filter(model.id.in_(ids)).all())
        for entity_id in ids:
            out[(kind, entity_id)] = found.get(entity_id)
    return out


def _many_out(db: Session, notes: list[Note]) -> list[NoteOut]:
    from ..models import AuditLog

    labels = _labels(db, notes)
    ids = [str(n.id) for n in notes]
    # Editada: hay una edición registrada. Las notas anteriores al registro se juzgan por las fechas.
    edited_ids = (
        {
            row[0]
            for row in db.query(AuditLog.entity_id)
            .filter(AuditLog.entity_type == "notes", AuditLog.action == "note:edit", AuditLog.entity_id.in_(ids))
            .all()
        }
        if ids
        else set()
    )
    out = []
    for note in notes:
        item = NoteOut.model_validate(note)
        if note.entity_type == "general" or not note.entity_id:
            item.entity_label = "Nota general"
        else:
            title = labels.get((note.entity_type, note.entity_id))
            item.entity_missing = title is None
            item.entity_label = (title or "")[:120] if title is not None else _entity_label(db, note.entity_type, note.entity_id)
        if str(note.id) in edited_ids:
            item.edited = True
        elif note.created_at and note.updated_at and not note.pinned:
            item.edited = (note.updated_at - note.created_at).total_seconds() > 2
        out.append(item)
    return out


def _filtered(
    db: Session,
    user: User,
    *,
    entity_type: str | None = None,
    entity_id: int | None = None,
    q: str | None = None,
    mine: bool = False,
    pinned: bool | None = None,
    author: str | None = None,
):
    query = db.query(Note)
    if entity_type:
        query = query.filter(Note.entity_type == entity_type)
    if entity_id is not None:
        query = query.filter(Note.entity_id == entity_id)
    if q and q.strip():
        like = f"%{q.strip().lower()[:120]}%"
        query = query.filter(func.lower(Note.title).like(like) | func.lower(Note.content).like(like))
    if mine:
        query = query.filter(func.lower(Note.author_email) == (user.email or "").lower())
    if author:
        query = query.filter(func.lower(Note.author_email) == author.strip().lower())
    if pinned is not None:
        query = query.filter(Note.pinned == pinned)
    return query


def _to_out(db: Session, note: Note) -> NoteOut:
    return _many_out(db, [note])[0]


@router.get("", response_model=list[NoteOut])
def list_notes(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    entity_type: str | None = Query(None),
    entity_id: int | None = Query(None),
    q: str | None = Query(None),
    mine: bool = Query(False),
    pinned: bool | None = Query(None),
    author: str | None = Query(None),
    sort: str = Query("recientes"),
    limit: int = Query(200, le=500),
):
    query = _filtered(db, user, entity_type=entity_type, entity_id=entity_id, q=q, mine=mine, pinned=pinned, author=author)
    order = SORTS.get(sort, SORTS["recientes"])
    # Las fijadas van primero en cualquier orden.
    notes = query.order_by(Note.pinned.desc(), *order).limit(limit).all()
    return _many_out(db, notes)


@router.get("/summary")
def notes_summary(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Totales de las notas del equipo: por vínculo, fijadas, propias y por autor."""
    rows = db.query(Note.entity_type, Note.pinned, Note.author_email, Note.author_name).all()
    me = (user.email or "").lower()
    by_type: dict[str, int] = {}
    authors: dict[str, dict] = {}
    for entity_type, _pinned, email, name in rows:
        by_type[entity_type] = by_type.get(entity_type, 0) + 1
        key = (email or "").lower()
        item = authors.setdefault(key, {"email": email or "", "name": name or email or "", "count": 0})
        item["count"] += 1
    return {
        "total": len(rows),
        "pinned": sum(1 for r in rows if r[1]),
        "mine": sum(1 for r in rows if (r[2] or "").lower() == me),
        "by_type": by_type,
        "authors": sorted(authors.values(), key=lambda a: (-a["count"], a["name"].lower())),
    }


@router.get("/export")
def export_notes(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    fmt: str = Query("csv", alias="format"),
    entity_type: str | None = Query(None),
    q: str | None = Query(None),
    mine: bool = Query(False),
    pinned: bool | None = Query(None),
    author: str | None = Query(None),
):
    """Descarga las notas (todas, o las del filtro de la pantalla) en CSV o JSON. Queda en la bitácora."""
    notes = (
        _filtered(db, user, entity_type=entity_type, q=q, mine=mine, pinned=pinned, author=author)
        .order_by(Note.updated_at.desc(), Note.id.desc())
        .all()
    )
    items = _many_out(db, notes)
    record_action(
        db,
        entity_type="notes",
        entity_id="listado",
        action="note:export",
        new_value={"format": "json" if fmt == "json" else "csv", "rows": len(items)},
    )
    db.commit()
    if fmt == "json":
        payload = [i.model_dump(mode="json") for i in items]
        content = json.dumps(payload, ensure_ascii=False, indent=2)
        return StreamingResponse(
            iter([content]),
            media_type="application/json; charset=utf-8",
            headers={"Content-Disposition": 'attachment; filename="notas_iets.json"'},
        )

    def safe(value) -> str:
        text = "" if value is None else str(value)
        # Una celda que empieza por =, +, - o @ se ejecutaria como formula al abrir el archivo.
        return "'" + text if text[:1] in ("=", "+", "-", "@") else text

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["id", "titulo", "contenido", "tipo", "entidad_id", "vinculada_a", "autor", "fijada", "creada", "actualizada"])
    for n in items:
        writer.writerow([
            n.id,
            safe(n.title),
            safe(n.content),
            n.entity_type,
            n.entity_id or "",
            safe("" if n.entity_type == "general" else n.entity_label),
            safe(n.author_name or n.author_email),
            "si" if n.pinned else "no",
            n.created_at.isoformat() if n.created_at else "",
            n.updated_at.isoformat() if n.updated_at else "",
        ])
    buf.seek(0)
    return StreamingResponse(
        iter([chr(0xFEFF) + buf.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="notas_iets.csv"'},
    )


@router.get("/{note_id}/history", response_model=list[NoteHistoryEvent])
def note_history(
    note_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Recorrido de la nota: creación, ediciones y cuándo se fijó o soltó."""
    from ..models import AuditLog

    if db.get(Note, note_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nota no encontrada")
    rows = (
        db.query(AuditLog)
        .filter(AuditLog.entity_type == "notes", AuditLog.entity_id == str(note_id))
        .order_by(AuditLog.occurred_at.asc(), AuditLog.id.asc())
        .all()
    )
    names = {"title": "título", "content": "contenido"}
    out = []
    for ev in rows:
        new = ev.new_value if isinstance(ev.new_value, dict) else {}
        detail = ""
        if ev.action == "note:create":
            kind, label = "created", "Nota creada"
        elif ev.action == "note:edit":
            kind, label = "edited", "Editada"
            detail = "Cambió: " + ", ".join(names.get(f, f) for f in new.get("fields") or [])
            if new.get("ai"):
                detail += " · con ayuda de la IA"
        elif ev.action == "note:pin":
            kind, label = "pinned", "Fijada"
        elif ev.action == "note:unpin":
            kind, label = "unpinned", "Soltada"
        else:
            continue
        out.append(
            {
                "kind": kind,
                "label": label,
                "detail": detail,
                "at": ev.occurred_at.isoformat() if ev.occurred_at else "",
                "by": ev.user_email or "",
            }
        )
    return out


@router.get("/{note_id}", response_model=NoteOut)
def get_note(
    note_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    note = db.get(Note, note_id)
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nota no encontrada")
    return _to_out(db, note)


@router.post("", response_model=NoteOut, status_code=status.HTTP_201_CREATED)
def create_note(
    payload: NoteCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_NOTE_WRITE)),
):
    if payload.entity_type not in ENTITY_TYPES:
        raise HTTPException(status_code=400, detail="Tipo de entidad inválido")
    if not payload.content.strip():
        raise HTTPException(status_code=400, detail="El contenido es obligatorio")
    if len(payload.content) > CONTENT_MAX:
        raise HTTPException(status_code=422, detail=f"El contenido admite hasta {CONTENT_MAX} caracteres.")
    if payload.entity_type != "general":
        model = ENTITY_MODELS.get(payload.entity_type)
        if not payload.entity_id or model is None or db.get(model, payload.entity_id) is None:
            raise HTTPException(
                status_code=404,
                detail="El elemento al que se quiere vincular la nota no existe.",
            )
    note = Note(
        entity_type=payload.entity_type,
        entity_id=payload.entity_id,
        title=(payload.title or "").strip()[:390],
        content=payload.content.strip(),
        author_email=user.email,
        author_name=user.name or user.email,
        pinned=payload.pinned,
    )
    db.add(note)
    db.flush()
    record_action(
        db,
        entity_type="notes",
        entity_id=note.id,
        action="note:create",
        new_value={"entity_type": note.entity_type, "entity_id": note.entity_id, "pinned": note.pinned},
    )
    db.commit()
    db.refresh(note)
    bump_state_version(db)
    return _to_out(db, note)


@router.post("/{note_id}/enhance-ai", response_model=NoteOut)
def enhance_note_ai(
    note_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_NOTE_WRITE)),
):
    """Mejora el contenido de una nota con MiniMax / Gemini y la guarda."""
    if not ai_service.is_enabled():
        raise HTTPException(status_code=400, detail="IA no configurada. Configure MiniMax en Configuración.")
    note = db.get(Note, note_id)
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nota no encontrada")
    _check_owner(user, note, "mejorarla")
    ctx = _entity_label(db, note.entity_type, note.entity_id)
    improved, model = ai_service.enhance_note_content(note.title, note.content, ctx)
    note.content = improved
    record_action(db, entity_type="notes", entity_id=note.id, action="note:edit", new_value={"fields": ["content"], "ai": True})
    db.commit()
    db.refresh(note)
    bump_state_version(db)
    return _to_out(db, note)


@router.put("/{note_id}", response_model=NoteOut)
def update_note(
    note_id: int,
    payload: NoteUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_NOTE_WRITE)),
):
    note = db.get(Note, note_id)
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nota no encontrada")
    data = payload.model_dump(exclude_unset=True)
    if any(data.get(k) is not None for k in ("title", "content")):
        _check_owner(user, note, "editarla")
    changed: list[str] = []
    if "title" in data and data["title"] is not None:
        clean = data["title"].strip()[:390]
        if clean != (note.title or ""):
            changed.append("title")
        note.title = clean
    if "content" in data and data["content"] is not None:
        if not data["content"].strip():
            raise HTTPException(status_code=400, detail="El contenido no puede estar vacío")
        if len(data["content"]) > CONTENT_MAX:
            raise HTTPException(status_code=422, detail=f"El contenido admite hasta {CONTENT_MAX} caracteres.")
        if data["content"].strip() != (note.content or ""):
            changed.append("content")
        note.content = data["content"].strip()
    if changed:
        record_action(db, entity_type="notes", entity_id=note.id, action="note:edit", new_value={"fields": changed})
    if data.get("pinned") is not None and bool(data["pinned"]) != bool(note.pinned):
        note.pinned = data["pinned"]
        record_action(
            db, entity_type="notes", entity_id=note.id, action="note:pin" if note.pinned else "note:unpin", new_value={}
        )
    db.commit()
    db.refresh(note)
    bump_state_version(db)
    return _to_out(db, note)


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note(
    note_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_NOTE_WRITE)),
):
    note = db.get(Note, note_id)
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nota no encontrada")
    _check_owner(user, note, "eliminarla")
    record_action(
        db,
        entity_type="notes",
        entity_id=note.id,
        action="note:delete",
        old_value={"title": note.title, "author_email": note.author_email, "entity_type": note.entity_type, "entity_id": note.entity_id},
    )
    db.delete(note)
    db.commit()
    bump_state_version(db)
    return None
