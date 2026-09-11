"""Portal publico de postulacion y cola de moderacion (RF02)."""
from __future__ import annotations

import time
from collections import defaultdict

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
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
)
from ..submission_service import (
    SubmissionRuleError,
    accept_submission,
    create_submission,
    reject_submission,
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
    return SubmissionPublicAck(
        id=row.id,
        status=row.status,
        message="La postulación quedó en moderación. El equipo del IETS la revisará.",
    )


@router.get("/api/submissions", response_model=list[SubmissionOut])
def list_submissions(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    status_filter: str | None = Query(None, alias="status"),
    limit: int = Query(80, le=300),
):
    query = db.query(Submission)
    if status_filter:
        query = query.filter(Submission.status == status_filter)
    rows = query.order_by(Submission.created_at.desc()).limit(limit).all()
    return [SubmissionOut.model_validate(r) for r in rows]


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
    return SubmissionOut.model_validate(row)


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
        reject_submission(db, row, reviewer=user.email, note=payload.note)
    except SubmissionRuleError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return SubmissionOut.model_validate(row)
