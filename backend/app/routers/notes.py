"""Notas de trabajo del equipo sobre hallazgos, fuentes y recomendaciones."""
from __future__ import annotations

import csv
import io
import json

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import gemini_service
from ..database import get_db
from ..deps import get_current_user, require_role
from ..events import bump_state_version
from ..models import Finding, Note, Recommendation, Source, User
from ..schemas import AiEnhanceOut, NoteCreate, NoteOut, NoteUpdate

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
        return row.title[:120] if row else f"Recomendacion #{entity_id}"
    return ""


def _to_out(db: Session, note: Note) -> NoteOut:
    out = NoteOut.model_validate(note)
    out.entity_label = _entity_label(db, note.entity_type, note.entity_id)
    return out


@router.get("", response_model=list[NoteOut])
def list_notes(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    entity_type: str | None = Query(None),
    entity_id: int | None = Query(None),
    q: str | None = Query(None),
    limit: int = Query(200, le=500),
):
    query = db.query(Note)
    if entity_type:
        query = query.filter(Note.entity_type == entity_type)
    if entity_id is not None:
        query = query.filter(Note.entity_id == entity_id)
    if q:
        like = f"%{q.lower()}%"
        query = query.filter(
            func.lower(Note.title).like(like) | func.lower(Note.content).like(like)
        )
    notes = (
        query.order_by(Note.pinned.desc(), Note.updated_at.desc())
        .limit(limit)
        .all()
    )
    return [_to_out(db, n) for n in notes]


@router.get("/export")
def export_notes(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    fmt: str = Query("csv", alias="format"),
):
    """Descarga todas las notas en CSV o JSON."""
    notes = db.query(Note).order_by(Note.updated_at.desc()).all()
    if fmt == "json":
        payload = [_to_out(db, n).model_dump(mode="json") for n in notes]
        content = json.dumps(payload, ensure_ascii=False, indent=2)
        return StreamingResponse(
            iter([content]),
            media_type="application/json; charset=utf-8",
            headers={"Content-Disposition": 'attachment; filename="notas_iets.json"'},
        )
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["id", "titulo", "contenido", "tipo", "entidad_id", "autor", "fijada", "actualizada"])
    for n in notes:
        writer.writerow([
            n.id,
            n.title,
            n.content,
            n.entity_type,
            n.entity_id or "",
            n.author_name or n.author_email,
            "si" if n.pinned else "no",
            n.updated_at.isoformat() if n.updated_at else "",
        ])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="notas_iets.csv"'},
    )


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
    user: User = Depends(require_role("editor")),
):
    if payload.entity_type not in ENTITY_TYPES:
        raise HTTPException(status_code=400, detail="Tipo de entidad invalido")
    if not payload.content.strip():
        raise HTTPException(status_code=400, detail="El contenido es obligatorio")
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
    db.commit()
    db.refresh(note)
    bump_state_version(db)
    return _to_out(db, note)


@router.post("/{note_id}/enhance-ai", response_model=NoteOut)
def enhance_note_ai(
    note_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("editor")),
):
    """Mejora el contenido de una nota con Gemini y la guarda."""
    if not gemini_service.is_enabled():
        raise HTTPException(status_code=400, detail="IA no configurada. Configure el token de Gemini en Configuracion.")
    note = db.get(Note, note_id)
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nota no encontrada")
    ctx = _entity_label(db, note.entity_type, note.entity_id)
    improved, model = gemini_service.enhance_note_content(note.title, note.content, ctx)
    note.content = improved
    db.commit()
    db.refresh(note)
    bump_state_version(db)
    return _to_out(db, note)


@router.put("/{note_id}", response_model=NoteOut)
def update_note(
    note_id: int,
    payload: NoteUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("editor")),
):
    note = db.get(Note, note_id)
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nota no encontrada")
    data = payload.model_dump(exclude_unset=True)
    if "title" in data and data["title"] is not None:
        note.title = data["title"][:390]
    if "content" in data and data["content"] is not None:
        if not data["content"].strip():
            raise HTTPException(status_code=400, detail="El contenido no puede estar vacio")
        note.content = data["content"].strip()
    if data.get("pinned") is not None:
        note.pinned = data["pinned"]
    db.commit()
    db.refresh(note)
    bump_state_version(db)
    return _to_out(db, note)


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note(
    note_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("editor")),
):
    note = db.get(Note, note_id)
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nota no encontrada")
    db.delete(note)
    db.commit()
    bump_state_version(db)
    return None
