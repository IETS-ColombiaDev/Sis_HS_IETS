"""Chat LLM (RAG) sobre la informacion del sistema de escaneo de horizonte."""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from .. import ai_service, assistant_service, rbac
from ..audit import record_action
from ..database import get_db
from ..deps import get_current_user, require_permission
from .. import graph_service
from ..models import AssistantKnowledge, ChatMessage, ChatSession, Cycle, Finding, Source, User
from ..rbac import P_NOTE_WRITE, P_RESTRICTED_ANALYTICS, has_permission
from ..schemas import (
    AssistantMemoryIn,
    AssistantMemoryUpdate,
    ChatContextIn,
    ChatFeedbackIn,
    ChatMessageOut,
    ChatRememberIn,
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


def _retrieve_context(
    db: Session, question: str, max_findings: int = 8, max_sources: int = 5, refs: list[dict] | None = None
) -> tuple[str, list[str]]:
    """Señales y fuentes parecidas a la pregunta. Si se pasa `refs`, agrega ahí cada registro usado."""
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
            if refs is not None:
                refs.append({"type": "finding", "id": f.id, "title": (f.title or "")[:200], "type_label": "Señal", "to": "/senales", "origin": "encontrado"})

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
            if refs is not None:
                refs.append({"type": "source", "id": s.id, "title": (s.title or "")[:200], "type_label": "Fuente", "to": "/fuentes", "origin": "encontrado"})

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


def _messages_out(db: Session, messages: list[ChatMessage]) -> list[ChatMessageOut]:
    ids = [m.id for m in messages if m.role == "assistant"]
    remembered = (
        {row[0] for row in db.query(AssistantKnowledge.message_id).filter(AssistantKnowledge.message_id.in_(ids)).all()}
        if ids
        else set()
    )
    out = []
    for m in messages:
        item = ChatMessageOut.model_validate(m)
        item.refs = m.refs or []
        item.feedback = m.feedback or ""
        item.remembered = m.id in remembered
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
    out.messages = _messages_out(db, list(session.messages))
    out.message_count = len(out.messages)
    out.context = assistant_service.resolve_refs(db, session.context_refs or [])
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
    chosen = assistant_service.resolve_refs(db, session.context_refs or [])
    memory = assistant_service.memory_retrieve(db, question, user)
    refs: list[dict] = [*chosen, *assistant_service.memory_refs(memory)]
    found_refs: list[dict] = []
    # Con elementos elegidos, lo encontrado por palabras clave es apoyo: menos registros.
    found, used = _retrieve_context(db, question, max_findings=3 if chosen else 8, max_sources=2 if chosen else 5, refs=found_refs)
    seen = {(r["type"], r["id"]) for r in refs}
    refs += [r for r in found_refs if (r["type"], r["id"]) not in seen]
    context = "\n\n".join(
        part
        for part in (
            assistant_service.context_for_refs(db, chosen, user),
            assistant_service.memory_context(memory),
            found,
        )
        if part
    )
    used = [*(r["title"] for r in chosen), *(m.title for m in memory), *used]
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
        refs=refs[:24],
    )
    db.add(assistant_msg)
    assistant_service.memory_mark_used(db, memory)
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

    try:
        chosen = assistant_service.resolve_refs(db, payload.context) if payload.context is not None else None
    except assistant_service.AssistantError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    if payload.session_id:
        session = _own_session(db, user, payload.session_id)
    else:
        title = message[:80]
        if chosen:
            # Con adjuntos, la conversación se reconoce mejor por lo que se analiza que por la pregunta.
            more = f" y {len(chosen) - 1} más" if len(chosen) > 1 else ""
            title = f"{chosen[0]['title'][: 76 - len(more)]}{more}"
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

    if chosen is not None:
        session.context_refs = [{"type": r["type"], "id": r["id"]} for r in chosen]
    user_msg = ChatMessage(session_id=session.id, role="user", content=message)
    db.add(user_msg)
    # Confirmado antes de esperar a la IA (~25 s): con un flush la escritura quedaba
    # abierta todo ese tiempo y en SQLite bloqueaba al resto de usuarios.
    db.commit()

    assistant_msg, model = _answer(db, session, message, user, ui_language)
    return ChatSendOut(
        session=_sessions_out(db, [session])[0],
        answer=_messages_out(db, [assistant_msg])[0],
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
        answer=_messages_out(db, [assistant_msg])[0],
        model_used=model,
    )


# --------------------------------------------------------------------------- #
#  Contexto elegido, valoración de respuestas y memoria del asistente
# --------------------------------------------------------------------------- #
def _own_message(db: Session, user: User, message_id: int) -> tuple[ChatMessage, ChatSession]:
    message = db.get(ChatMessage, message_id)
    session = db.get(ChatSession, message.session_id) if message else None
    if not message or not session or session.user_email != user.email or message.role != "assistant":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Respuesta no encontrada")
    return message, session


def _question_of(session: ChatSession, message: ChatMessage) -> str:
    """La pregunta que respondió `message`: el mensaje del usuario inmediatamente anterior."""
    previous = [m for m in session.messages if m.id < message.id and m.role == "user"]
    return previous[-1].content if previous else ""


@router.get("/context/search")
def search_context(
    q: str = "",
    types: str = "",
    limit: int = 8,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Señales, tecnologías, fuentes, informes, expedientes, notas y boletines que se pueden adjuntar."""
    wanted = [t for t in types.split(",") if t] or None
    return assistant_service.search_refs(db, q, wanted, limit)


@router.put("/sessions/{session_id}/context")
def set_session_context(
    session_id: int,
    payload: ChatContextIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Fija los elementos que el asistente debe leer en esta conversación."""
    session = _own_session(db, user, session_id)
    try:
        refs = assistant_service.resolve_refs(db, payload.context)
    except assistant_service.AssistantError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    session.context_refs = [{"type": r["type"], "id": r["id"]} for r in refs]
    db.commit()
    return refs


@router.post("/messages/{message_id}/feedback", response_model=ChatMessageOut)
def rate_answer(
    message_id: int,
    payload: ChatFeedbackIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Marca una respuesta como útil o no útil (o quita la marca)."""
    message, _session = _own_message(db, user, message_id)
    if payload.feedback not in ("", "util", "no_util"):
        raise HTTPException(status_code=422, detail="La valoración debe ser útil o no útil.")
    message.feedback = payload.feedback
    db.commit()
    db.refresh(message)
    return _messages_out(db, [message])[0]


@router.post("/messages/{message_id}/remember")
def remember_answer(
    message_id: int,
    payload: ChatRememberIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_NOTE_WRITE)),
):
    """Guarda una respuesta en la memoria del asistente, para que la use en preguntas futuras de todo el equipo."""
    message, session = _own_message(db, user, message_id)
    refs = message.refs or []
    try:
        entry = assistant_service.memory_create(
            db,
            user,
            title=payload.title,
            content=payload.content if payload.content is not None else message.content,
            kind="respuesta",
            question=_question_of(session, message),
            refs=refs,
            # Lo que salió de un expediente o del grafo con montos solo lo recibe quien puede verlos.
            restricted=has_permission(user, P_RESTRICTED_ANALYTICS)
            and (assistant_service.uses_restricted(refs) or bool(session.scope)),
            session_id=session.id,
            message_id=message.id,
        )
    except assistant_service.AssistantError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    message.feedback = "util"
    record_action(db, entity_type="assistant_knowledge", entity_id=entry.id, action="assistant:remember", new_value={"title": entry.title, "restricted": entry.restricted})
    db.commit()
    db.refresh(entry)
    return assistant_service.memory_out(entry, user)


@router.get("/memory")
def list_memory(
    q: str = "",
    status_filter: str = Query("activa", alias="status"),
    mine: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Lo que el asistente sabe porque el equipo se lo marcó o se lo enseñó."""
    rows = assistant_service.memory_list(db, user, q=q, status=status_filter, mine=mine)
    return {"items": [assistant_service.memory_out(r, user) for r in rows], "stats": assistant_service.memory_stats(db, user)}


@router.post("/memory", status_code=201)
def teach_memory(
    payload: AssistantMemoryIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_NOTE_WRITE)),
):
    """Enseña un dato al asistente, escrito por una persona."""
    try:
        entry = assistant_service.memory_create(db, user, title=payload.title, content=payload.content)
    except assistant_service.AssistantError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    record_action(db, entity_type="assistant_knowledge", entity_id=entry.id, action="assistant:teach", new_value={"title": entry.title})
    db.commit()
    db.refresh(entry)
    return assistant_service.memory_out(entry, user)


def _own_memory(db: Session, user: User, entry_id: int) -> AssistantKnowledge:
    entry = db.get(AssistantKnowledge, entry_id)
    if entry is None or (entry.restricted and not has_permission(user, P_RESTRICTED_ANALYTICS)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entrada no encontrada")
    if not assistant_service.can_manage(user, entry):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo quien guardó la entrada o un superadministrador puede cambiarla.",
        )
    return entry


@router.put("/memory/{entry_id}")
def update_memory(
    entry_id: int,
    payload: AssistantMemoryUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_NOTE_WRITE)),
):
    entry = _own_memory(db, user, entry_id)
    try:
        changed = assistant_service.memory_update(db, entry, title=payload.title, content=payload.content, status=payload.status)
    except assistant_service.AssistantError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if changed:
        record_action(db, entity_type="assistant_knowledge", entity_id=entry.id, action="assistant:memory_edit", new_value={"fields": changed, "status": entry.status})
    db.commit()
    db.refresh(entry)
    return assistant_service.memory_out(entry, user)


@router.delete("/memory/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_memory(
    entry_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_NOTE_WRITE)),
):
    entry = _own_memory(db, user, entry_id)
    record_action(db, entity_type="assistant_knowledge", entity_id=entry.id, action="assistant:forget", old_value={"title": entry.title, "created_by": entry.created_by})
    db.delete(entry)
    db.commit()
    return None


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
