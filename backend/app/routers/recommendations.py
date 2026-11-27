"""Recomendaciones de adopcion para Colombia (generadas por Gemini o manuales)."""
from __future__ import annotations

import csv
import io
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from .. import ai_service, recommendation_service
from ..audit import record_action
from ..recommendation_service import RecommendationRuleError
from ..database import get_db
from ..deps import get_current_user, require_permission
from ..events import bump_state_version
from ..models import Finding, Recommendation, User
from ..rbac import P_REPORT_WRITE, P_RESTRICTED_ANALYTICS, effective_role, has_permission, role_label
from ..schemas import (
    GenerateRecommendationIn,
    RecommendationCreate,
    RecommendationHistoryEvent,
    RecommendationOut,
    RecommendationReopenIn,
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


def _out_many(db: Session, recs: list[Recommendation]) -> list[RecommendationOut]:
    ctx = recommendation_service.context_for(db, recs)
    out = []
    for rec in recs:
        item = RecommendationOut.model_validate(rec)
        item.status = rec.status or "borrador"
        item.origin = recommendation_service.origin_of(rec)
        item.edited = recommendation_service.was_edited(rec)
        item.words = len((rec.content or "").split())
        for key, value in ctx.get(rec.finding_id or 0, {}).items():
            setattr(item, key, value)
        out.append(item)
    return out


def _out(db: Session, rec: Recommendation) -> RecommendationOut:
    return _out_many(db, [rec])[0]


def _get(db: Session, rec_id: int) -> Recommendation:
    rec = db.get(Recommendation, rec_id)
    if not rec:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recomendación no encontrada")
    return rec


def _query(db: Session, finding_id: int | None, cycle_id: int | None, status_filter: str | None):
    query = db.query(Recommendation)
    if finding_id:
        query = query.filter(Recommendation.finding_id == finding_id)
    if cycle_id:
        ids = recommendation_service.cycle_finding_ids(db, cycle_id)
        if not ids:
            return None
        query = query.filter(Recommendation.finding_id.in_(ids))
    if status_filter:
        if status_filter not in recommendation_service.STATUSES:
            raise HTTPException(status_code=422, detail="El estado debe ser borrador o validado.")
        query = query.filter(Recommendation.status == status_filter)
    return query.order_by(Recommendation.created_at.desc(), Recommendation.id.desc())


@router.get("", response_model=list[RecommendationOut])
def list_recommendations(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    finding_id: int | None = Query(None),
    cycle_id: int | None = Query(None, description="Solo informes de señales de este ciclo"),
    status_filter: str | None = Query(None, alias="status"),
):
    query = _query(db, finding_id, cycle_id, status_filter)
    return _out_many(db, query.all()) if query is not None else []


@router.get("/export.csv")
def export_recommendations(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    cycle_id: int | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
):
    """Listado de informes en CSV (punto y coma, UTF-8 con BOM para Excel). Queda en bitácora."""
    query = _query(db, None, cycle_id, status_filter)
    recs = query.all() if query is not None else []
    header, rows = recommendation_service.export_rows(db, recs)

    def safe(value) -> str:
        text = "" if value is None else str(value)
        # Una celda que empieza por =, +, - o @ se ejecutaria como formula al abrir el archivo.
        return "'" + text if text[:1] in ("=", "+", "-", "@") else text

    buf = io.StringIO()
    writer = csv.writer(buf, delimiter=";", lineterminator="\n")
    writer.writerow(header)
    for row in rows:
        writer.writerow([safe(v) for v in row])
    record_action(
        db,
        entity_type="recommendations",
        entity_id="listado",
        action="recommendation:export",
        new_value={"rows": len(rows), "cycle_id": cycle_id, "status": status_filter or "todos"},
    )
    db.commit()
    return Response(
        content="\ufeff" + buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="informes_diseminacion.csv"'},
    )


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
    return _out(db, rec)


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
    if len(payload.content) > recommendation_service.MAX_CONTENT:
        raise HTTPException(
            status_code=422,
            detail=f"El contenido supera el máximo de {recommendation_service.MAX_CONTENT} caracteres.",
        )
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
    return _out(db, rec)


@router.put("/{rec_id}", response_model=RecommendationOut)
def update_recommendation(
    rec_id: int,
    payload: RecommendationUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_REPORT_WRITE)),
):
    rec = _get(db, rec_id)
    data = payload.model_dump(exclude_unset=True)
    _check_impact(data.get("impact"))
    if len(data.get("content") or "") > recommendation_service.MAX_CONTENT:
        raise HTTPException(
            status_code=422,
            detail=f"El contenido supera el máximo de {recommendation_service.MAX_CONTENT} caracteres.",
        )
    before = (rec.title, rec.content, rec.impact)
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
    if (rec.title, rec.content, rec.impact) != before:
        if rec.model_used and "editado" not in rec.model_used:
            rec.model_used = f"{rec.model_used} · editado"
        rec.updated_by = user.email
        rec.updated_at = datetime.now(timezone.utc)
        if rec.status == "validado":
            # Lo que se valido ya no es lo que dice el texto.
            recommendation_service.reopen(db, rec, actor=user.email, reason="Editado después de validar")
    db.commit()
    db.refresh(rec)
    bump_state_version(db)
    return _out(db, rec)


@router.delete("/{rec_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recommendation(
    rec_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_REPORT_WRITE)),
):
    rec = _get(db, rec_id)
    if rec.status == "validado":
        raise HTTPException(
            status_code=409,
            detail="Un informe validado no se elimina. Devuélvalo a borrador primero.",
        )
    db.delete(rec)
    db.commit()
    bump_state_version(db)
    return None


@router.post("/{rec_id}/validate", response_model=RecommendationOut)
def validate_recommendation(
    rec_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_REPORT_WRITE)),
):
    """Una persona revisa el informe y responde por él: desde aquí viaja en el paquete."""
    rec = _get(db, rec_id)
    try:
        recommendation_service.validate(db, rec, actor=user.email)
    except RecommendationRuleError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    db.commit()
    db.refresh(rec)
    bump_state_version(db)
    return _out(db, rec)


@router.post("/{rec_id}/reopen", response_model=RecommendationOut)
def reopen_recommendation(
    rec_id: int,
    payload: RecommendationReopenIn | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_REPORT_WRITE)),
):
    rec = _get(db, rec_id)
    try:
        recommendation_service.reopen(db, rec, actor=user.email, reason=payload.reason if payload else "")
    except RecommendationRuleError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    db.commit()
    db.refresh(rec)
    bump_state_version(db)
    return _out(db, rec)


@router.get("/{rec_id}/history", response_model=list[RecommendationHistoryEvent])
def recommendation_history(
    rec_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return recommendation_service.history(db, _get(db, rec_id))


def _can_package(user: User) -> None:
    if not (has_permission(user, P_REPORT_WRITE) or has_permission(user, P_RESTRICTED_ANALYTICS)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"El perfil '{role_label(effective_role(user))}' no puede descargar el paquete de diseminación "
                "(requiere report:write o analytics:restricted)."
            ),
        )


@router.get("/package/{cycle_id}/preview")
def dissemination_package_preview(
    cycle_id: int,
    include_drafts: bool = Query(False),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Qué traería el paquete del ciclo, sin descargarlo ni dejar registro."""
    from ..dissemination_service import DisseminationError, build_package

    _can_package(user)
    try:
        _, manifest = build_package(db, cycle_id, actor=user.email, include_drafts=include_drafts)
    except DisseminationError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    manifest.pop("generated_by", None)
    return manifest


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

    _can_package(user)
    cycle = db.get(Cycle, cycle_id)
    if cycle is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ciclo no encontrado")
    try:
        content, manifest = build_package(db, cycle_id, actor=user.email, include_drafts=include_drafts)
    except DisseminationError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
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
