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

# Tope por IP: 5 postulaciones en 10 minutos. Vive en memoria porque el abuso
# que nos preocupa es el de un formulario publico, no un atacante distribuido.
_hits: dict[str, list[float]] = defaultdict(list)
WINDOW = 600.0
MAX_HITS = 5


def _rate_limit(ip: str) -> None:
    now = time.monotonic()
    recent = [t for t in _hits[ip] if now - t < WINDOW]
    if len(recent) >= MAX_HITS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Demasiadas postulaciones desde esta direccion. Intente mas tarde.",
        )
    recent.append(now)
    _hits[ip] = recent


def _verify_recaptcha(token: str, ip: str) -> None:
    secret = (settings.recaptcha_secret or "").strip()
    if not secret:
        return
    if not token:
        raise HTTPException(status_code=400, detail="Falta la verificacion anti-robot.")
    try:
        resp = httpx.post(
            "https://www.google.com/recaptcha/api/siteverify",
            data={"secret": secret, "response": token, "remoteip": ip},
            timeout=8.0,
        )
        data = resp.json()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=f"No se pudo validar reCAPTCHA: {exc}")
    if not data.get("success") or float(data.get("score") or 0) < 0.4:
        raise HTTPException(status_code=400, detail="La verificacion anti-robot no fue superada.")


@router.post("/api/public/submissions", response_model=SubmissionPublicAck, status_code=201)
def public_submit(payload: SubmissionPublicIn, request: Request, db: Session = Depends(get_db)):
    """Formulario publico. No exige cuenta institucional."""
    if (payload.website or "").strip():
        # Honeypot: un bot llena campos ocultos. Respondemos como si hubiera
        # funcionado para no enseñarle el filtro.
        return SubmissionPublicAck(id=0, status="recibida", message="Postulacion recibida.")

    ip = request.headers.get("x-forwarded-for", "") or (
        request.client.host if request.client else ""
    )
    ip = ip.split(",")[0].strip()
    _rate_limit(ip)
    _verify_recaptcha(payload.recaptcha_token, ip)

    try:
        row = create_submission(db, payload.model_dump(), ip=ip)
    except SubmissionRuleError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return SubmissionPublicAck(
        id=row.id,
        status=row.status,
        message="La postulacion quedo en moderacion. El equipo del IETS la revisara.",
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
        raise HTTPException(status_code=404, detail="Postulacion no encontrada")
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
        raise HTTPException(status_code=404, detail="Postulacion no encontrada")
    try:
        reject_submission(db, row, reviewer=user.email, note=payload.note)
    except SubmissionRuleError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return SubmissionOut.model_validate(row)
