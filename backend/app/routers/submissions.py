"""Portal publico de postulacion y cola de moderacion (RF02)."""
from __future__ import annotations

import csv
import io
import time
from collections import defaultdict

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import get_current_user, require_permission
from ..models import Submission, User
from ..rbac import P_STAGING_ASSIGN
from ..schemas import (
    SubmissionOut,
    SubmissionPublicAck,
    SubmissionPublicIn,
    SubmissionReviewIn,
    SubmissionStatusIn,
    SubmissionStatusOut,
)
from .. import submission_service
from ..submission_service import (
    SubmissionRuleError,
    accept_submission,
    create_submission,
    reject_submission,
    reopen_submission,
)

router = APIRouter(tags=["submissions"])

# Tope por IP (por defecto 5 postulaciones en 10 minutos, configurable). Vive en
# memoria porque el abuso que nos preocupa es el de un formulario publico, no un
# atacante distribuido.
_hits: dict[str, list[float]] = defaultdict(list)
RECAPTCHA_ACTION = "postulacion"
PRIVATE_PREFIXES = ("127.", "10.", "192.168.", "172.16.", "172.17.", "172.18.", "172.19.", "172.2", "172.30.", "172.31.", "::1")


def _client_ip(request: Request) -> str:
    """IP del postulante.

    `X-Forwarded-For` solo se cree cuando la peticion llega desde la red interna
    (el proxy inverso institucional). Si llega directo desde internet, esa
    cabecera la escribe el propio cliente y bastaria cambiarla para saltarse el
    tope por IP.
    """
    peer = request.client.host if request.client else ""
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded and (peer.startswith(PRIVATE_PREFIXES) or peer in {"localhost", "testclient"}):
        return forwarded.split(",")[0].strip()[:64]
    return (peer or "desconocida")[:64]


def _rate_limit(ip: str) -> None:
    window = float(max(1, settings.public_submissions_window_seconds))
    limit = max(1, int(settings.public_submissions_per_window))
    now = time.monotonic()
    recent = [t for t in _hits[ip] if now - t < window]
    if len(recent) >= limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Demasiadas postulaciones desde esta dirección. Intente más tarde.",
        )
    recent.append(now)
    _hits[ip] = recent


def recaptcha_config() -> dict:
    """Modo del anti-robot. Solo opera con ambas llaves; si falta una, lo dice."""
    secret = (settings.recaptcha_secret or "").strip()
    site_key = (settings.recaptcha_site_key or "").strip()
    if secret and site_key:
        return {
            "recaptcha_enabled": True,
            "site_key": site_key,
            "action": RECAPTCHA_ACTION,
            "mode": "activo",
            "message": "Formulario protegido con reCAPTCHA v3.",
        }
    if secret or site_key:
        message = (
            "Configuración de reCAPTCHA incompleta (falta "
            + ("RECAPTCHA_SITE_KEY" if secret else "RECAPTCHA_SECRET")
            + "): la verificación anti-robot está desactivada. Rigen el tope por IP y el campo trampa."
        )
        mode = "incompleto"
    else:
        message = (
            "Verificación anti-robot en modo degradado: sin llaves de reCAPTCHA configuradas. "
            "Rigen el tope por IP y el campo trampa."
        )
        mode = "degradado"
    return {"recaptcha_enabled": False, "site_key": "", "action": RECAPTCHA_ACTION, "mode": mode, "message": message}


def _verify_recaptcha(token: str, ip: str) -> str:
    """Valida el token con Google. Devuelve `verificado` u `omitido` (modo degradado)."""
    cfg = recaptcha_config()
    if not cfg["recaptcha_enabled"]:
        return "omitido"
    if not (token or "").strip():
        raise HTTPException(
            status_code=400,
            detail="Falta la verificación anti-robot. Recargue la página e intente de nuevo.",
        )
    try:
        resp = httpx.post(
            "https://www.google.com/recaptcha/api/siteverify",
            data={"secret": settings.recaptcha_secret.strip(), "response": token, "remoteip": ip},
            timeout=8.0,
        )
        data = resp.json()
    except Exception:  # noqa: BLE001
        raise HTTPException(
            status_code=503,
            detail="No se pudo contactar el servicio anti-robot. Intente de nuevo en unos minutos.",
        )
    if not data.get("success"):
        raise HTTPException(status_code=400, detail="La verificación anti-robot no fue superada.")
    action = data.get("action")
    if action and action != RECAPTCHA_ACTION:
        raise HTTPException(status_code=400, detail="La verificación anti-robot no corresponde a este formulario.")
    score = data.get("score")
    if score is not None and float(score) < float(settings.recaptcha_min_score):
        raise HTTPException(status_code=400, detail="La verificación anti-robot no fue superada.")
    return "verificado"


@router.get("/api/public/submissions/config")
def public_submit_config():
    """Lo que el formulario publico necesita saber antes de enviar (sin secretos)."""
    return {
        **recaptcha_config(),
        "max_per_window": int(settings.public_submissions_per_window),
        "window_minutes": max(1, int(settings.public_submissions_window_seconds) // 60),
    }


@router.post("/api/public/submissions", response_model=SubmissionPublicAck, status_code=201)
def public_submit(payload: SubmissionPublicIn, request: Request, db: Session = Depends(get_db)):
    """Formulario publico. No exige cuenta institucional."""
    if (payload.website or "").strip():
        # Honeypot: un bot llena campos ocultos. Respondemos como si hubiera
        # funcionado para no ensenarle el filtro.
        return SubmissionPublicAck(id=0, status="recibida", message="Postulación recibida.")

    ip = _client_ip(request)
    _rate_limit(ip)
    captcha = _verify_recaptcha(payload.recaptcha_token, ip)

    try:
        row = create_submission(db, payload.model_dump(), ip=ip, captcha=captcha)
    except SubmissionRuleError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    # RF-02-F: el cruce con la web se completa en segundo plano.
    from .. import submission_crosscheck
    from ..database import SessionLocal

    submission_crosscheck.schedule_web(SessionLocal, row.id)
    return SubmissionPublicAck(
        id=row.id,
        status=row.status,
        message="La postulación quedó en moderación. El equipo del IETS la revisará.",
        tracking_code=submission_service.tracking_code(row),
    )


_STATUS_MESSAGES = {
    "recibida": "Su postulación está en moderación. El equipo del IETS aún no ha tomado una decisión.",
    "aceptada": "Su postulación fue aceptada y pasó a la vigilancia del IETS. Esto no implica una evaluación ni una recomendación.",
    "rechazada": "Su postulación no fue aceptada en esta revisión.",
}


@router.post("/api/public/submissions/status", response_model=SubmissionStatusOut)
def public_submission_status(payload: SubmissionStatusIn, request: Request, db: Session = Depends(get_db)):
    """Estado de una postulacion para quien la envio: pide el radicado y el correo.

    No distingue entre "no existe" y "el correo no coincide": asi nadie puede
    recorrer radicados para saber quien postulo que.
    """
    _rate_limit(f"estado:{_client_ip(request)}")
    row = submission_service.find_by_tracking(db, payload.code, payload.email)
    if row is None:
        raise HTTPException(
            status_code=404,
            detail="No encontramos una postulación con ese radicado y ese correo. Revise ambos datos.",
        )
    message = _STATUS_MESSAGES.get(row.status, "")
    if row.status == "rechazada" and row.reject_reason and row.reject_reason not in ("otro", "no_valida"):
        message = f"{message} Motivo: {submission_service.REJECT_REASONS.get(row.reject_reason, '')}."
    return SubmissionStatusOut(
        tracking_code=submission_service.tracking_code(row),
        status=row.status,
        status_label=submission_service.STATUS_LABELS.get(row.status, row.status),
        received_at=row.created_at,
        resolved_at=row.reviewed_at if row.status != "recibida" else None,
        message=message,
    )


def _out(db: Session, row: Submission, pool: list[Submission] | None = None) -> SubmissionOut:
    """Postulacion con los datos derivados que usa la cola de moderacion."""
    out = SubmissionOut.model_validate(row)
    out.tracking_code = submission_service.tracking_code(row)
    out.reject_reason = row.reject_reason or ""
    out.reject_reason_label = submission_service.REJECT_REASONS.get(row.reject_reason or "", "")
    out.waiting_days = submission_service.waiting_days(row)
    out.duplicates = submission_service.duplicates_of(db, row, pool)
    return out


def _filtered(db: Session, status_filter: str | None, q: str, conflict: bool | None, stale: bool, order: str, limit: int) -> list[Submission]:
    query = db.query(Submission)
    if status_filter:
        query = query.filter(Submission.status == status_filter)
    if conflict is not None:
        query = query.filter(Submission.has_conflict.is_(conflict))
    text = (q or "").strip()
    if text:
        like = f"%{text}%"
        clauses = [
            Submission.commercial_name.ilike(like),
            Submission.inn_name.ilike(like),
            Submission.indication.ilike(like),
            Submission.manufacturer.ilike(like),
            Submission.submitter_name.ilike(like),
            Submission.submitter_email.ilike(like),
            Submission.submitter_org.ilike(like),
        ]
        match = submission_service.TRACKING_RE.match(text)
        if match:
            clauses.append(Submission.id == int(match.group(2)))
        elif text.isdigit():
            clauses.append(Submission.id == int(text))
        query = query.filter(or_(*clauses))
    query = query.order_by(Submission.created_at.asc() if order == "antiguas" else Submission.created_at.desc())
    rows = query.limit(limit).all()
    if stale:
        rows = [r for r in rows if r.status == "recibida" and submission_service.waiting_days(r) >= 7]
    return rows


@router.get("/api/submissions", response_model=list[SubmissionOut])
def list_submissions(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    status_filter: str | None = Query(None, alias="status"),
    q: str = Query("", max_length=200, description="Busca en tecnología, indicación, fabricante, postulante o radicado"),
    conflict: bool | None = Query(None, description="Solo con (true) o sin (false) conflicto de interés declarado"),
    stale: bool = Query(False, description="Solo las que llevan 7 días o más sin decisión"),
    order: str = Query("recientes", pattern="^(recientes|antiguas)$"),
    limit: int = Query(80, le=300),
):
    rows = _filtered(db, status_filter, q, conflict, stale, order, limit)
    pool = db.query(Submission).all() if rows else []
    return [_out(db, r, pool) for r in rows]


@router.get("/api/submissions/summary")
def submissions_summary(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Indicadores de la cola y lista de motivos de rechazo."""
    return {
        **submission_service.summary(db),
        "reasons": [{"code": code, "label": label} for code, label in submission_service.REJECT_REASONS.items()],
    }


@router.get("/api/submissions/export.csv")
def export_submissions(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_STAGING_ASSIGN)),
    status_filter: str | None = Query(None, alias="status"),
    q: str = Query("", max_length=200),
    conflict: bool | None = Query(None),
):
    """La cola filtrada en CSV (punto y coma, UTF-8 con BOM para Excel). Queda en bitácora."""
    from ..audit import record_action

    rows = _filtered(db, status_filter, q, conflict, False, "recientes", 2000)
    buf = io.StringIO()
    writer = csv.writer(buf, delimiter=";", lineterminator="\n")
    writer.writerow([
        "Radicado", "Estado", "Recibida", "Días en moderación", "Nombre comercial", "DCI", "Indicación", "Fabricante",
        "Fase de desarrollo", "Fuentes", "Conflicto de interés", "Descripción del conflicto", "Postulante", "Correo",
        "Organización", "Motivo de rechazo", "Nota de revisión", "Revisada por", "Fecha de decisión", "Tecnología creada",
    ])

    def safe(value) -> str:
        text = "" if value is None else str(value)
        # Una celda que empieza por =, +, - o @ se ejecutaria como formula al abrir el archivo.
        return "'" + text if text[:1] in ("=", "+", "-", "@") else text

    for r in rows:
        writer.writerow([
            safe(v) for v in (
                submission_service.tracking_code(r),
                submission_service.STATUS_LABELS.get(r.status, r.status),
                r.created_at.isoformat() if r.created_at else "",
                submission_service.waiting_days(r),
                r.commercial_name, r.inn_name, r.indication, r.manufacturer, r.development_phase,
                " | ".join(r.evidence_links or []),
                "Sí" if r.has_conflict else "No", r.conflict_statement,
                r.submitter_name, r.submitter_email, r.submitter_org,
                submission_service.REJECT_REASONS.get(r.reject_reason or "", ""), r.review_note, r.reviewed_by,
                r.reviewed_at.isoformat() if r.reviewed_at else "", r.technology_id or "",
            )
        ])
    record_action(
        db, entity_type="submissions", entity_id="cola", action="submission_export",
        new_value={"rows": len(rows), "status": status_filter or "todas", "q": q[:80]},
    )
    db.commit()
    return Response(
        content="\ufeff" + buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="postulaciones.csv"'},
    )


@router.get("/api/submissions/{submission_id}", response_model=SubmissionOut)
def get_submission(submission_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    row = db.get(Submission, submission_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Postulación no encontrada")
    return _out(db, row)


@router.get("/api/submissions/{submission_id}/history")
def submission_history(submission_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Recorrido de la postulacion (recibida, cruces, decision, reapertura) desde la bitacora."""
    row = db.get(Submission, submission_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Postulación no encontrada")
    return submission_service.history(db, row)


@router.post("/api/submissions/{submission_id}/cross-check", response_model=SubmissionOut)
def cross_check(
    submission_id: int,
    web: bool = Query(True, description="Incluir la búsqueda en la web (tarda unos segundos)"),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_STAGING_ASSIGN)),
):
    """Cruza la postulacion con la vigilancia proactiva y con la web (RF-02-F)."""
    from .. import submission_crosscheck

    row = db.get(Submission, submission_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Postulación no encontrada")
    submission_crosscheck.run(db, row, web=web, actor=user.email)
    return _out(db, row)


@router.post("/api/submissions/{submission_id}/accept", response_model=SubmissionOut)
def accept(
    submission_id: int,
    payload: SubmissionReviewIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_STAGING_ASSIGN)),
):
    row = db.get(Submission, submission_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Postulación no encontrada")
    try:
        accept_submission(db, row, reviewer=user.email, note=payload.note)
    except SubmissionRuleError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    db.refresh(row)
    return _out(db, row)


@router.post("/api/submissions/{submission_id}/reject", response_model=SubmissionOut)
def reject(
    submission_id: int,
    payload: SubmissionReviewIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_STAGING_ASSIGN)),
):
    row = db.get(Submission, submission_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Postulación no encontrada")
    try:
        reject_submission(db, row, reviewer=user.email, note=payload.note, reason=payload.reason)
    except SubmissionRuleError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return _out(db, row)


@router.post("/api/submissions/{submission_id}/reopen", response_model=SubmissionOut)
def reopen(
    submission_id: int,
    payload: SubmissionReviewIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_STAGING_ASSIGN)),
):
    """Devuelve a moderación una postulación rechazada. Exige explicar por qué."""
    row = db.get(Submission, submission_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Postulación no encontrada")
    try:
        reopen_submission(db, row, reviewer=user.email, note=payload.note)
    except SubmissionRuleError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return _out(db, row)
