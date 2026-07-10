"""Chat LLM (RAG) sobre la informacion del sistema de escaneo de horizonte."""
from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from .. import gemini_service
from ..database import get_db
from ..deps import get_current_user
from ..models import ChatMessage, ChatSession, Finding, Source, User
from ..schemas import (
    ChatMessageOut,
    ChatSendIn,
    ChatSendOut,
    ChatSessionDetail,
    ChatSessionOut,
)

router = APIRouter(prefix="/api/chat", tags=["chat"])

_STOPWORDS = {
    "que", "cual", "cuales", "como", "para", "por", "con", "los", "las", "del", "una", "uno",
    "sobre", "the", "and", "for", "with", "hay", "son", "esta", "este", "estas", "estos",
    "colombia", "iets", "salud", "tecnologia", "tecnologias", "de", "la", "el", "en", "un",
}


def _keywords(text: str) -> list[str]:
    words = re.findall(r"[a-zA-Zaeiouñ]{4,}", text.lower())
    return [w for w in words if w not in _STOPWORDS][:8]


def _retrieve_context(db: Session, question: str, max_findings: int = 8, max_sources: int = 5) -> tuple[str, list[str]]:
    keywords = _keywords(question)
    used: list[str] = []
    parts: list[str] = []

    f_query = db.query(Finding)
    if keywords:
        conds = []
        for kw in keywords:
            like = f"%{kw}%"
            conds.append(func.lower(Finding.title).like(like))
            conds.append(func.lower(Finding.summary).like(like))
            conds.append(func.lower(Finding.technology).like(like))
        f_query = f_query.filter(or_(*conds))
    findings = f_query.order_by(Finding.created_at.desc()).limit(max_findings).all()
    if not findings:
        findings = db.query(Finding).order_by(Finding.created_at.desc()).limit(max_findings).all()

    if findings:
        parts.append("HALLAZGOS RELEVANTES:")
        for f in findings:
            src = f.source.title if f.source else ""
            parts.append(
                f"- [{f.horizon or 's/h'} | {f.technology_type}] {f.title} "
                f"({src}). {f.summary[:200]}"
            )
            used.append(f.title)

    s_query = db.query(Source)
    if keywords:
        conds = []
        for kw in keywords:
            like = f"%{kw}%"
            conds.append(func.lower(Source.title).like(like))
            conds.append(func.lower(Source.description).like(like))
            conds.append(func.lower(Source.tags).like(like))
        s_query = s_query.filter(or_(*conds))
    sources = s_query.limit(max_sources).all()
    if sources:
        parts.append("\nFUENTES RELEVANTES:")
        for s in sources:
            parts.append(f"- {s.title} [{s.category}] ({s.url}). {s.description[:200]}")
            used.append(s.title)

    return "\n".join(parts), used


@router.get("/sessions", response_model=list[ChatSessionOut])
def list_sessions(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    sessions = (
        db.query(ChatSession)
        .filter(ChatSession.user_email == user.email)
        .order_by(ChatSession.updated_at.desc())
        .all()
    )
    return [ChatSessionOut.model_validate(s) for s in sessions]


@router.get("/sessions/{session_id}", response_model=ChatSessionDetail)
def get_session(session_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    session = db.get(ChatSession, session_id)
    if not session or session.user_email != user.email:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversacion no encontrada")
    return ChatSessionDetail.model_validate(session)


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(session_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    session = db.get(ChatSession, session_id)
    if not session or session.user_email != user.email:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversacion no encontrada")
    db.delete(session)
    db.commit()
    return None


@router.post("/send", response_model=ChatSendOut)
def send_message(payload: ChatSendIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not payload.message.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El mensaje no puede estar vacio")

    if payload.session_id:
        session = db.get(ChatSession, payload.session_id)
        if not session or session.user_email != user.email:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversacion no encontrada")
    else:
        session = ChatSession(
            user_email=user.email,
            title=payload.message.strip()[:80],
        )
        db.add(session)
        db.flush()

    user_msg = ChatMessage(session_id=session.id, role="user", content=payload.message.strip())
    db.add(user_msg)
    db.flush()

    history = [{"role": m.role, "content": m.content} for m in session.messages]
    context, used = _retrieve_context(db, payload.message)
    answer_text, model = gemini_service.chat_answer(payload.message, context, history)

    assistant_msg = ChatMessage(
        session_id=session.id,
        role="assistant",
        content=answer_text,
        sources_used=", ".join(used[:8]),
    )
    db.add(assistant_msg)
    session.title = session.title or payload.message.strip()[:80]
    db.commit()
    db.refresh(session)
    db.refresh(assistant_msg)

    return ChatSendOut(
        session=ChatSessionOut.model_validate(session),
        answer=ChatMessageOut.model_validate(assistant_msg),
        model_used=model,
    )
