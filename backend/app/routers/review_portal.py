"""Portal publico de revisores externos (RF16). Sin cuenta permanente."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import evaluation as catalog
from .. import evaluation_service
from ..database import get_db
from ..evaluation_service import EvaluationRuleError
from ..schemas import (
    EvaluationCoiIn,
    ReviewCommentIn,
    ReviewCommentOut,
    ReviewSubmitIn,
    ReviewerAccessOut,
)

router = APIRouter(prefix="/api/public/reviews", tags=["review-portal"])


def _resolve(db: Session, token: str):
    try:
        return evaluation_service.resolve_reviewer_token(db, token)
    except EvaluationRuleError as exc:
        detail = str(exc)
        if detail == "TOKEN_EXPIRED":
            raise HTTPException(
                status_code=401,
                detail="El enlace de revision expiro. Solicite una nueva invitacion.",
            ) from exc
        if detail == "TOKEN_INVALID":
            raise HTTPException(status_code=401, detail="Enlace de revision invalido.") from exc
        raise HTTPException(status_code=409, detail=detail) from exc


def _access(db, assignment, doc) -> ReviewerAccessOut:
    granted = bool(assignment.coi_signed)
    comments = []
    body = None
    if granted:
        body = dict(doc.body or {})
        comments = [
            ReviewCommentOut.model_validate(c)
            for c in evaluation_service.comments_of(db, doc.id)
        ]
    return ReviewerAccessOut(
        access="granted" if granted else "coi_required",
        assignment_id=assignment.id,
        doc_id=doc.id,
        title=doc.title,
        product_level=doc.product_level,
        product_level_label=catalog.PRODUCT_LEVEL_LABELS.get(doc.product_level, doc.product_level),
        status=doc.status,
        reviewer_name=assignment.reviewer_name,
        expires_at=assignment.expires_at,
        body=body,
        confidential=bool(doc.confidential),
        comments=comments,
        field_labels=catalog.FIELD_LABELS,
    )


@router.get("/{token}", response_model=ReviewerAccessOut)
def open_invite(token: str, db: Session = Depends(get_db)):
    assignment, doc = _resolve(db, token)
    return _access(db, assignment, doc)


@router.post("/{token}/coi", response_model=ReviewerAccessOut)
def sign_coi(token: str, payload: EvaluationCoiIn, db: Session = Depends(get_db)):
    assignment, doc = _resolve(db, token)
    try:
        evaluation_service.sign_coi(
            db,
            assignment,
            accepted=payload.accepted,
            statement=payload.statement,
            has_conflict=payload.has_conflict,
            actor=assignment.reviewer_email,
        )
    except EvaluationRuleError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    db.commit()
    db.refresh(assignment)
    return _access(db, assignment, doc)


@router.post("/{token}/comments", response_model=ReviewCommentOut)
def add_comment(token: str, payload: ReviewCommentIn, db: Session = Depends(get_db)):
    assignment, doc = _resolve(db, token)
    if not assignment.coi_signed:
        raise HTTPException(
            status_code=403,
            detail="Sin declaracion de conflicto de interes no se habilita la lectura.",
        )
    try:
        row = evaluation_service.add_comment(
            db,
            doc,
            body=payload.body,
            author=assignment.reviewer_name or assignment.reviewer_email,
            field_key=payload.field_key,
            assignment_id=assignment.id,
        )
    except EvaluationRuleError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    db.commit()
    db.refresh(row)
    return ReviewCommentOut.model_validate(row)


@router.post("/{token}/submit", response_model=ReviewerAccessOut)
def submit_review(token: str, payload: ReviewSubmitIn, db: Session = Depends(get_db)):
    assignment, doc = _resolve(db, token)
    try:
        evaluation_service.submit_review(
            db, assignment, verdict=payload.verdict, note=payload.note
        )
        if payload.note.strip():
            evaluation_service.add_comment(
                db,
                doc,
                body=payload.note.strip(),
                author=assignment.reviewer_name or assignment.reviewer_email,
                assignment_id=assignment.id,
            )
    except EvaluationRuleError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    db.commit()
    db.refresh(assignment)
    return _access(db, assignment, doc)
