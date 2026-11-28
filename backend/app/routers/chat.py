"""Chat LLM (RAG) sobre la informacion del sistema de escaneo de horizonte."""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from .. import ai_service, rbac
from ..database import get_db
from ..deps import get_current_user
from .. import graph_service
from ..models import ChatMessage, ChatSession, Cycle, Finding, Source, User
from ..schemas import (
    ChatMessageOut,
    ChatSendIn,
    ChatSendOut,
    ChatSessionDetail,
    ChatSessionOut,
    ChatSessionUpdate,
)

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["chat"])

_STOPWORDS = {
    "que", "cual", "cuales", "como", "para", "por", "con", "los", "las", "del", "una", "uno",
    "sobre", "the", "and", "for", "with", "hay", "son", "esta", "este", "estas", "estos",
    "colombia", "iets", "salud", "tecnologia", "tecnologias", "de", "la", "el", "en", "un",
}


def _keywords(text: str) -> list[str]:
    words = re.findall(r"[a-záéíóúüñ]{4,}", text.lower())
    out: list[str] = []
    for w in words:
        if w in _STOPWORDS:
            continue
        # Raiz corta: "regulatorias" encuentra "regulatory" y "Agencias regulatorias".
        stem = w[:6]
        if stem not in out:
            out.append(stem)
    return out[:8]


def _rank(rows: list, keywords: list[str], fields, limit: int) -> list:
    """Ordena por cantidad de palabras clave presentes; empate = orden original."""

    def hits(row) -> int:
        blob = " ".join(str(getattr(row, f, "") or "") for f in fields).lower()
        return sum(1 for kw in keywords if kw in blob)

    scored = [(hits(r), i, r) for i, r in enumerate(rows)]
    scored.sort(key=lambda t: (-t[0], t[1]))
    return [r for _h, _i, r in scored[:limit]]


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
    findings = f_query.order_by(Finding.created_at.desc()).limit(200).all()
    findings = _rank(findings, keywords, ("title", "technology", "summary"), max_findings)
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
            conds.append(func.lower(Source.category).like(like))
        s_query = s_query.filter(or_(*conds))
    sources = _rank(s_query.limit(200).all(), keywords, ("title", "category", "tags", "description"), max_sources)
    if sources:
        parts.append("\nFUENTES RELEVANTES:")
        for s in sources:
            parts.append(f"- {s.title} [{s.category}] ({s.url}). {s.description[:200]}")
            used.append(s.title)

    return "\n".join(parts), used


MESSAGE_MAX = 4000
TITLE_MAX = 120
HISTORY_FOR_AI = 20


def _own_session(db: Session, user: User, session_id: int) -> ChatSession:
    session = db.get(ChatSession, session_id)
    if not session or session.user_email != user.email:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversación no encontrada")
    return session


def _sessions_out(db: Session, sessions: list[ChatSession]) -> list[ChatSessionOut]:
    """Cada conversación con su número de mensajes y el comienzo del último."""
    ids = [s.id for s in sessions]
    counts: dict[int, int] = {}
    previews: dict[int, str] = {}
    if ids:
        counts = dict(
            db.query(ChatMessage.session_id, func.count(ChatMessage.id))
            .filter(ChatMessage.session_id.in_(ids))
            .group_by(ChatMessage.session_id)
            .all()
        )
        last_ids = [
            row[0]
            for row in db.query(func.max(ChatMessage.id))
            .filter(ChatMessage.session_id.in_(ids))
            .group_by(ChatMessage.session_id)
            .all()
        ]
        if last_ids:
            for sid, content in db.query(ChatMessage.session_id, ChatMessage.content).filter(ChatMessage.id.in_(last_ids)).all():
                previews[sid] = " ".join((content or "").split())[:140]
    out = []
    for s in sessions:
        item = ChatSessionOut.model_validate(s)
        item.message_count = int(counts.get(s.id, 0))
        item.preview = previews.get(s.id, "")
        out.append(item)
    return out


@router.get("/sessions", response_model=list[ChatSessionOut])
def list_sessions(
    scope: str = "",
    node_key: str = "",
    cycle_id: int | None = None,
    q: str = "",
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = db.query(ChatSession).filter(ChatSession.user_email == user.email)
    if scope:
        query = query.filter(ChatSession.scope == scope)
    else:
        query = query.filter((ChatSession.scope == "") | (ChatSession.scope.is_(None)))
    if node_key:
        query = query.filter(ChatSession.node_key == node_key)
    if cycle_id:
        query = query.filter(ChatSession.cycle_id == cycle_id)
    text = (q or "").strip().lower()[:80]
    if text:
        like = f"%{text}%"
        in_messages = db.query(ChatMessage.session_id).filter(func.lower(ChatMessage.content).like(like))
        query = query.filter(or_(func.lower(ChatSession.title).like(like), ChatSession.id.in_(in_messages)))
    sessions = query.order_by(ChatSession.updated_at.desc(), ChatSession.id.desc()).all()
    return _sessions_out(db, sessions)


@router.delete("/sessions", status_code=status.HTTP_200_OK)
def delete_all_sessions(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Elimina todas las conversaciones generales de quien llama. Las del grafo del tablero se conservan."""
    sessions = (
        db.query(ChatSession)
        .filter(ChatSession.user_email == user.email)
        .filter((ChatSession.scope == "") | (ChatSession.scope.is_(None)))
        .all()
    )
    for session in sessions:
        db.delete(session)
    db.commit()
    return {"deleted": len(sessions)}


@router.get("/sessions/{session_id}", response_model=ChatSessionDetail)
def get_session(session_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    session = _own_session(db, user, session_id)
    out = ChatSessionDetail.model_validate(session)
    out.message_count = len(out.messages)
    return out


@router.put("/sessions/{session_id}", response_model=ChatSessionOut)
def rename_session(
    session_id: int,
    payload: ChatSessionUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Cambia el título de una conversación propia."""
    session = _own_session(db, user, session_id)
    title = " ".join((payload.title or "").split())
    if not title:
        raise HTTPException(status_code=422, detail="El título no puede quedar vacío.")
    if len(title) > TITLE_MAX:
        raise HTTPException(status_code=422, detail=f"El título admite hasta {TITLE_MAX} caracteres.")
    session.title = title
    db.commit()
    db.refresh(session)
    return _sessions_out(db, [session])[0]


@router.get("/sessions/{session_id}/export")
def export_session(session_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """La conversación en Markdown, para guardarla o pegarla en un informe."""
    session = _own_session(db, user, session_id)
    lines = [f"# {session.title or 'Conversación'}", ""]
    if session.created_at:
        lines += [f"Conversación del {session.created_at.date().isoformat()} con el asistente de escaneo de horizonte del IETS.", ""]
    for m in session.messages:
        who = "Pregunta" if m.role == "user" else "Respuesta"
        lines += [f"## {who}", "", (m.content or "").strip(), ""]
        if m.role != "user" and (m.sources_used or "").strip():
            lines += [f"_Registros usados como contexto: {m.sources_used.strip()}_", ""]
    lines += ["---", "Las respuestas del asistente son un apoyo: verifique cada dato en la fuente antes de usarlo.", ""]
    return Response(
        content="\n".join(lines),
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="conversacion-{session.id}.md"'},
    )


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(session_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    session = _own_session(db, user, session_id)
    db.delete(session)
    db.commit()
    return None


def _answer(db: Session, session: ChatSession, question: str, user: User, language: str) -> tuple[ChatMessage, str]:
    """Genera y guarda la respuesta a `question`. La pregunta ya está guardada."""
    history = [{"role": m.role, "content": m.content} for m in session.messages][-HISTORY_FOR_AI:]
    context, used = _retrieve_context(db, question)
    if session.cycle_id and session.node_key:
        cycle = db.get(Cycle, session.cycle_id)
        if cycle is not None:
            from ..rbac import P_RESTRICTED_ANALYTICS, has_permission

            node_ctx = graph_service.node_context(
                db,
                cycle,
                session.node_key,
                include_restricted=has_permission(user, P_RESTRICTED_ANALYTICS),
            )
            context = f"{node_ctx}\n\n{context}"
            used = [session.node_key, *used]
    try:
        answer_text, model = ai_service.chat_answer(question, context, history, language=language)
    except Exception as exc:  # noqa: BLE001
        log.exception("El asistente no pudo responder en la conversación %s", session.id)
        db.rollback()
        raise HTTPException(
            status_code=502,
            detail="El asistente no pudo responder. Su pregunta quedó guardada: pulse Reintentar.",
        ) from exc

    assistant_msg = ChatMessage(
        session_id=session.id,
        role="assistant",
        content=answer_text,
        sources_used=", ".join(used[:8]),
    )
    db.add(assistant_msg)
    session.title = session.title or question[:80]
    session.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(session)
    db.refresh(assistant_msg)
    return assistant_msg, model


@router.post("/send", response_model=ChatSendOut)
def send_message(
    payload: ChatSendIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    ui_language: str = Header(default="es", alias="X-UI-Language"),
):
    message = payload.message.strip()
    if not message:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El mensaje no puede estar vacío")
    if len(message) > MESSAGE_MAX:
        raise HTTPException(status_code=422, detail=f"El mensaje admite hasta {MESSAGE_MAX} caracteres.")

    if payload.session_id:
        session = _own_session(db, user, payload.session_id)
    else:
        title = message[:80]
        if payload.node_key:
            title = f"Grafo · {payload.node_key}"[:80]
        session = ChatSession(
            user_email=user.email,
            title=title,
            scope=payload.scope or "",
            node_key=payload.node_key or "",
            cycle_id=payload.cycle_id,
            graph_id=payload.graph_id,
        )
        db.add(session)
        db.flush()

    user_msg = ChatMessage(session_id=session.id, role="user", content=message)
    db.add(user_msg)
    # Confirmado antes de esperar a la IA (~25 s): con un flush la escritura quedaba
    # abierta todo ese tiempo y en SQLite bloqueaba al resto de usuarios.
    db.commit()

    assistant_msg, model = _answer(db, session, message, user, ui_language)
    return ChatSendOut(
        session=_sessions_out(db, [session])[0],
        answer=ChatMessageOut.model_validate(assistant_msg),
        model_used=model,
    )


@router.post("/sessions/{session_id}/retry", response_model=ChatSendOut)
def retry_answer(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    ui_language: str = Header(default="es", alias="X-UI-Language"),
):
    """Vuelve a responder la última pregunta: reemplaza la respuesta anterior, si la había."""
    session = _own_session(db, user, session_id)
    last_user = next((m for m in reversed(session.messages) if m.role == "user"), None)
    if last_user is None:
        raise HTTPException(status_code=409, detail="La conversación no tiene preguntas para responder.")
    for m in list(session.messages):
        if m.id > last_user.id:
            db.delete(m)
    db.commit()
    db.refresh(session)
    assistant_msg, model = _answer(db, session, last_user.content, user, ui_language)
    return ChatSendOut(
        session=_sessions_out(db, [session])[0],
        answer=ChatMessageOut.model_validate(assistant_msg),
        model_used=model,
    )


# --------------------------------------------------------------------------- #
#  Asistente de navegacion: "como hago X en el sistema"
# --------------------------------------------------------------------------- #
NAV_SYSTEM = (
    "Eres el asistente de navegacion del Sistema de Escaneo de Horizonte del IETS. "
    "Ayudas a encontrar pantallas y botones del sistema. Respondes en espanol, en "
    "2 a 5 frases cortas o pasos numerados (cada paso en su propia linea), nombrando los botones entre comillas « ». "
    "Usa SOLO el mapa del sistema que se te entrega; si algo no esta en el mapa, dilo "
    "y sugiere la Guia o a un administrador. Nunca inventes pantallas ni botones."
)


@router.post("/navigate")
def navigate_help(
    payload: dict,
    user: User = Depends(get_current_user),
    ui_language: str = Header(default="es", alias="X-UI-Language"),
):
    """Responde "como llego a / como hago" con el mapa que envia la interfaz.

    El mapa (pantallas, pasos y permisos del perfil) lo arma el frontend desde
    la misma fuente que el menu, asi que la IA no puede recomendar pantallas
    que no existen. Sin IA devuelve `ai_used=false` y la interfaz responde con
    su buscador local.
    """
    question = str(payload.get("question") or "").strip()[:500]
    site_map = str(payload.get("context") or "").strip()[:9000]
    path = str(payload.get("path") or "")[:80]
    history = payload.get("history") if isinstance(payload.get("history"), list) else []
    if not question:
        raise HTTPException(status_code=422, detail="Escriba una pregunta.")
    if not ai_service.is_enabled():
        return {"answer": "", "routes": [], "ai_used": False, "model": ""}

    hist = "\n".join(
        f"{'Usuario' if h.get('role') == 'user' else 'Asistente'}: {str(h.get('content') or '')[:400]}"
        for h in history[-4:]
        if isinstance(h, dict)
    )
    prompt = f"""MAPA DEL SISTEMA (rutas, botones, pasos y lo que el perfil puede hacer):
{site_map}

Perfil del usuario: {rbac.effective_role(user)}. Pantalla actual: {path or '/'}.
Conversacion previa:
{hist or '(sin historial)'}

Pregunta: {question}

Responde SOLO con JSON:
{{"answer": "respuesta breve con pasos", "routes": ["/ruta-mas-util", "/otra-si-aplica"]}}
Las rutas deben existir en el mapa. Si el perfil no tiene permiso, dilo y sugiere a quien pedirlo.
{ai_service.language_rule(ui_language)}"""
    text, model = ai_service.generate(
        prompt, system=ai_service._localized(NAV_SYSTEM, ui_language), temperature=0.2, max_tokens=700
    )
    if not text or text.startswith("[Error"):
        return {"answer": "", "routes": [], "ai_used": False, "model": model or ""}
    answer, routes = text.strip(), []
    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        try:
            data = json.loads(match.group(0))
            answer = str(data.get("answer") or "").strip() or answer
            routes = [str(r) for r in (data.get("routes") or []) if isinstance(r, str) and r.startswith("/")][:3]
        except (ValueError, TypeError, AttributeError):
            pass
    known = set(re.findall(r"(/[a-z\-]*)\b", site_map))
    routes = [r for r in routes if r in known]
    return {"answer": answer[:1500], "routes": routes, "ai_used": True, "model": model or ""}
