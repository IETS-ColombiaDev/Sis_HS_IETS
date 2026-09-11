"""Recomendaciones de adopcion para Colombia (generadas por Gemini o manuales)."""
from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from .. import ai_service
from ..database import get_db
from ..deps import get_current_user, require_permission
from ..events import bump_state_version
from ..models import Finding, Recommendation, User
from ..rbac import P_REPORT_WRITE, P_RESTRICTED_ANALYTICS, has_permission, role_label
from ..schemas import (
    GenerateRecommendationIn,
    RecommendationCreate,
    RecommendationOut,
    RecommendationUpdate,
)

router = APIRouter(prefix="/api/recommendations", tags=["recommendations"])


IMPACTS = {"", "alto", "medio", "bajo"}


def _check_impact(value: str | None) -> None:
    if value is not None and value not in IMPACTS:
        raise HTTPException(status_code=422, detail="El impacto debe ser alto, medio o bajo.")


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
    user: User = Depends(require_permission(P_REPORT_WRITE)),
):
    finding = db.get(Finding, payload.finding_id)
    if not finding:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hallazgo no encontrado")

    text, model = ai_service.generate_adoption_recommendation(finding, finding.source)
    rec = Recommendation(
        finding_id=finding.id,
        title=f"Recomendación de adopción: {finding.technology or finding.title}"[:590],
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
    user: User = Depends(require_permission(P_REPORT_WRITE)),
):
    if payload.finding_id is not None and not db.get(Finding, payload.finding_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hallazgo no encontrado")
    if not (payload.title or "").strip():
        raise HTTPException(status_code=422, detail="El título de la recomendación es obligatorio.")
    if not (payload.content or "").strip():
        raise HTTPException(status_code=422, detail="El contenido de la recomendación es obligatorio.")
    _check_impact(payload.impact)
    rec = Recommendation(
        finding_id=payload.finding_id,
        title=payload.title.strip()[:590],
        content=payload.content.strip(),
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
    user: User = Depends(require_permission(P_REPORT_WRITE)),
):
    rec = db.get(Recommendation, rec_id)
    if not rec:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recomendación no encontrada")
    data = payload.model_dump(exclude_unset=True)
    _check_impact(data.get("impact"))
    if data.get("title") is not None and not data["title"].strip():
        raise HTTPException(status_code=422, detail="El título no puede quedar vacío.")
    if data.get("content") is not None and not data["content"].strip():
        raise HTTPException(status_code=422, detail="El contenido no puede quedar vacío.")
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
    user: User = Depends(require_permission(P_REPORT_WRITE)),
):
    rec = db.get(Recommendation, rec_id)
    if not rec:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recomendación no encontrada")
    db.delete(rec)
    db.commit()
    bump_state_version(db)
    return None


@router.get("/package/{cycle_id}")
def dissemination_package(
    cycle_id: int,
    include_drafts: bool = Query(False),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Paquete de diseminacion del ciclo en ZIP (backlog P5-4).

    Lo descargan quienes producen informes (`report:write`) o quienes deciden
    con ellos (`analytics:restricted`). El revisor por pares no: el paquete trae
    notas internas del equipo.
    """
    from ..dissemination_service import DisseminationError, build_package, package_filename
    from ..models import Cycle

    if not (has_permission(user, P_REPORT_WRITE) or has_permission(user, P_RESTRICTED_ANALYTICS)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"El perfil '{role_label(user.role)}' no puede descargar el paquete de diseminación "
                "(requiere report:write o analytics:restricted)."
            ),
        )
    cycle = db.get(Cycle, cycle_id)
    if cycle is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ciclo no encontrado")
    try:
        content, manifest = build_package(db, cycle_id, actor=user.email, include_drafts=include_drafts)
    except DisseminationError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    from ..audit import record_action

    record_action(
        db,
        entity_type="cycles",
        entity_id=str(cycle_id),
        action="dissemination:package",
        new_value={k: v for k, v in manifest.items() if k not in {"generated_by"}},
    )
    db.commit()
    return Response(
        content=content,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{package_filename(cycle)}"',
            "X-Package-Recommendations": str(manifest["recommendations"]),
            "X-Package-Evaluation-Docs": str(manifest["evaluation_docs"]),
        },
    )
