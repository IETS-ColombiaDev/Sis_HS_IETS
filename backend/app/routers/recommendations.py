"""Recomendaciones de adopcion para Colombia (generadas por Gemini o manuales)."""
from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from .. import gemini_service
from ..database import get_db
from ..deps import get_current_user, require_role
from ..events import bump_state_version
from ..models import Finding, Recommendation, User
from ..schemas import (
    GenerateRecommendationIn,
    RecommendationCreate,
    RecommendationOut,
    RecommendationUpdate,
)

router = APIRouter(prefix="/api/recommendations", tags=["recommendations"])


def _extract_impact(text: str) -> str:
    m = re.search(r"IMPACTO:\s*(alto|medio|bajo)", text, re.I)
    if m:
        return m.group(1).lower()
    return ""


@router.get("", response_model=list[RecommendationOut])
def list_recommendations(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    finding_id: int | None = Query(None),
):
    query = db.query(Recommendation)
    if finding_id:
        query = query.filter(Recommendation.finding_id == finding_id)
    recs = query.order_by(Recommendation.created_at.desc()).all()
    return [RecommendationOut.model_validate(r) for r in recs]


@router.post("/generate", response_model=RecommendationOut, status_code=status.HTTP_201_CREATED)
def generate_recommendation(
    payload: GenerateRecommendationIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("editor")),
):
    finding = db.get(Finding, payload.finding_id)
    if not finding:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hallazgo no encontrado")

    text, model = gemini_service.generate_adoption_recommendation(finding, finding.source)
    rec = Recommendation(
        finding_id=finding.id,
        title=f"Recomendacion de adopcion: {finding.technology or finding.title}"[:590],
        content=text,
        impact=_extract_impact(text),
        model_used=model,
        created_by=user.email,
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    bump_state_version(db)
    return RecommendationOut.model_validate(rec)


@router.post("", response_model=RecommendationOut, status_code=status.HTTP_201_CREATED)
def create_recommendation(
    payload: RecommendationCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("editor")),
):
    if payload.finding_id is not None and not db.get(Finding, payload.finding_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hallazgo no encontrado")
    rec = Recommendation(
        finding_id=payload.finding_id,
        title=payload.title,
        content=payload.content,
        impact=payload.impact or _extract_impact(payload.content),
        model_used="manual",
        created_by=user.email,
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    bump_state_version(db)
    return RecommendationOut.model_validate(rec)


@router.put("/{rec_id}", response_model=RecommendationOut)
def update_recommendation(
    rec_id: int,
    payload: RecommendationUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("editor")),
):
    rec = db.get(Recommendation, rec_id)
    if not rec:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recomendacion no encontrada")
    data = payload.model_dump(exclude_unset=True)
    if "title" in data and data["title"] is not None:
        rec.title = data["title"][:590]
    if "content" in data and data["content"] is not None:
        rec.content = data["content"]
        # recalcular impacto desde el texto si no se envio explicitamente
        if data.get("impact") is None:
            rec.impact = _extract_impact(data["content"]) or rec.impact
    if data.get("impact") is not None:
        rec.impact = data["impact"]
    # marcar que fue editado manualmente
    if rec.model_used and "editado" not in rec.model_used:
        rec.model_used = f"{rec.model_used} · editado"
    db.commit()
    db.refresh(rec)
    bump_state_version(db)
    return RecommendationOut.model_validate(rec)


@router.delete("/{rec_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recommendation(
    rec_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("editor")),
):
    rec = db.get(Recommendation, rec_id)
    if not rec:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recomendacion no encontrada")
    db.delete(rec)
    db.commit()
    bump_state_version(db)
    return None
