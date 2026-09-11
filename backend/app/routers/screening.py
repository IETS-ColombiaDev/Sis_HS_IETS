"""Filtrado del ciclo: fusion, novedad y Listado Unico (RF09, RF10, RF12).

Prefijo `/api/screening`, previsto en la seccion 8 del plan de fases.
"""
from __future__ import annotations

import csv
import io
import re

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import invima as invima_module
from .. import normalization, screening_service
from ..database import get_db
from ..deps import require_permission
from ..events import bump_state_version
from ..methodology import (
    NOVELTY_OPTIONS,
    NOVELTY_REQUIRES_JUSTIFICATION,
    TECHNOLOGY_STATUS_LABELS,
)
from ..models import Cluster, MergeProposal, Source, TechType, Technology, User
from ..rbac import P_READ, P_SCREENING_WRITE, P_TECHNOLOGY_WRITE
from ..schemas import (
    InvimaMatchOut,
    MergeDiscardIn,
    MergeProposalOut,
    MergeResolveIn,
    MergeScanOut,
    NormalizationOut,
    NoveltyIn,
    NoveltyOptionOut,
    NoveltyOut,
    ScreeningStats,
    TechnologyBrief,
    UniqueListOut,
)
from ..screening_service import ScreeningRuleError

router = APIRouter(prefix="/api/screening", tags=["screening"])


def _rule(exc: ScreeningRuleError) -> HTTPException:
    return HTTPException(status_code=409, detail=str(exc))


def _brief(db: Session, tech: Technology | None) -> TechnologyBrief | None:
    if tech is None:
        return None
    cluster = db.get(Cluster, tech.cluster_id) if tech.cluster_id else None
    tech_type = db.get(TechType, tech.tech_type_id) if tech.tech_type_id else None
    source = db.get(Source, tech.source_id) if tech.source_id else None
    return TechnologyBrief(
        id=tech.id,
        commercial_name=tech.commercial_name,
        inn_name=tech.inn_name,
        manufacturer=tech.manufacturer,
        indication=tech.indication,
        atc_code=tech.atc_code,
        nct_ids=[str(n) for n in (tech.nct_ids or [])],
        condition=tech.condition,
        cluster_name=cluster.name if cluster else "",
        tech_type_name=tech_type.name if tech_type else "",
        source_name=source.title if source else "",
        captured_at=tech.captured_at,
        status=TECHNOLOGY_STATUS_LABELS.get(tech.status, tech.status),
        screening_score=tech.screening_score or 0,
    )


def _proposal_out(db: Session, proposal: MergeProposal) -> MergeProposalOut:
    out = MergeProposalOut.model_validate(proposal)
    out.score = float(proposal.score or 0)
    out.matched_on = list(proposal.matched_on or [])
    out.detail = dict(proposal.detail or {})
    out.technology_a = _brief(db, db.get(Technology, proposal.technology_a_id))
    out.technology_b = _brief(db, db.get(Technology, proposal.technology_b_id))
    return out


# --------------------------------------------------------------------------- #
#  RF09 - Propuestas de fusion
# --------------------------------------------------------------------------- #
@router.get("/stats", response_model=ScreeningStats)
def stats(
    cycle_id: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_READ)),
):
    return ScreeningStats(**screening_service.screening_stats(db, cycle_id))


@router.get("/merges", response_model=list[MergeProposalOut])
def list_merges(
    status_filter: str = Query("propuesta", alias="status"),
    cycle_id: int | None = None,
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_READ)),
):
    query = db.query(MergeProposal)
    if status_filter:
        query = query.filter(MergeProposal.status == status_filter)
    if status_filter == "propuesta":
        # Un par cuyo registro ya fue absorbido por otra fusion no tiene objeto.
        merged_ids = select(Technology.id).where(Technology.merged_into_id.isnot(None))
        query = query.filter(
            ~MergeProposal.technology_a_id.in_(merged_ids),
            ~MergeProposal.technology_b_id.in_(merged_ids),
        )
    if cycle_id is not None:
        query = query.filter(MergeProposal.cycle_id == cycle_id)
    rows = (
        query.order_by(MergeProposal.decisive.desc(), MergeProposal.score.desc())
        .limit(limit)
        .all()
    )
    return [_proposal_out(db, row) for row in rows]


@router.post("/merges/scan", response_model=MergeScanOut)
def scan(
    cycle_id: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_SCREENING_WRITE)),
):
    """Ejecuta el barrido difuso y deja las propuestas pendientes de revision."""
    result = screening_service.scan_duplicates(db, cycle_id=cycle_id, actor=user.email)
    bump_state_version(db)
    return MergeScanOut(**result)


@router.post("/merges/{proposal_id}/confirm", response_model=MergeProposalOut)
def confirm(
    proposal_id: int,
    payload: MergeResolveIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_SCREENING_WRITE)),
):
    try:
        proposal = screening_service.confirm_merge(
            db,
            proposal_id,
            keep_id=payload.keep_technology_id,
            note=payload.note,
            actor=user.email,
        )
    except ScreeningRuleError as exc:
        raise _rule(exc) from exc
    bump_state_version(db)
    return _proposal_out(db, proposal)


@router.post("/merges/{proposal_id}/discard", response_model=MergeProposalOut)
def discard(
    proposal_id: int,
    payload: MergeDiscardIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_SCREENING_WRITE)),
):
    try:
        proposal = screening_service.discard_merge(
            db, proposal_id, note=payload.note, actor=user.email
        )
    except ScreeningRuleError as exc:
        raise _rule(exc) from exc
    bump_state_version(db)
    return _proposal_out(db, proposal)


# --------------------------------------------------------------------------- #
#  RF10 y RF11 - Criterio de novedad
# --------------------------------------------------------------------------- #
@router.get("/novelty/options", response_model=list[NoveltyOptionOut])
def novelty_options(user: User = Depends(require_permission(P_READ))):
    return [
        NoveltyOptionOut(
            code=code,
            label=label,
            requires_justification=code in NOVELTY_REQUIRES_JUSTIFICATION,
        )
        for code, label in NOVELTY_OPTIONS.items()
    ]


def _novelty_out(db: Session, cycle_id: int, technology_id: int, *, with_matches: bool) -> NoveltyOut:
    tech = db.get(Technology, technology_id)
    if tech is None:
        raise HTTPException(status_code=404, detail="La tecnología no existe.")
    assessment = screening_service.get_assessment(db, cycle_id, technology_id)
    can, reason = screening_service.novelty_gate(db, cycle_id, technology_id)

    out = NoveltyOut(
        cycle_id=cycle_id,
        technology_id=technology_id,
        technology_name=tech.inn_name or tech.commercial_name,
        can_qualify=can,
        blocking_reason=reason,
        index=invima_module.index_status(db),
    )
    if assessment is not None:
        out.option_code = assessment.option_code
        out.option_label = NOVELTY_OPTIONS.get(assessment.option_code, "")
        out.justification = assessment.justification
        out.requires_justification = assessment.option_code in NOVELTY_REQUIRES_JUSTIFICATION
        out.invima_checked_at = assessment.invima_checked_at
        out.invima_match_count = assessment.invima_match_count
        out.invima_best_score = float(assessment.invima_best_score or 0)
        out.invima_registry = assessment.invima_registry
        out.invima_holder = assessment.invima_holder
        out.invima_status = assessment.invima_status
        out.has_valid_registry = assessment.has_valid_registry
        out.sala_especializada_concept = assessment.sala_especializada_concept
        out.sala_especializada_ref = assessment.sala_especializada_ref
        out.assessed_by = assessment.assessed_by
        out.assessed_at = assessment.assessed_at

    if with_matches:
        result = invima_module.check_technology(db, tech)
        out.matches = [
            InvimaMatchOut(
                registro=m["record"].registro,
                expediente=m["record"].expediente,
                producto=m["record"].producto,
                titular=m["record"].titular,
                principio_activo=m["record"].principio_activo,
                estado_registro=m["record"].estado_registro,
                fecha_vencimiento=m["record"].fecha_vencimiento,
                score=m["score"],
                matched_field=m["matched_field"],
                valid_registry=m["valid_registry"],
            )
            for m in result["matches"]
        ]
    return out


@router.get("/novelty/{cycle_id}/{technology_id}", response_model=NoveltyOut)
def get_novelty(
    cycle_id: int,
    technology_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_READ)),
):
    return _novelty_out(db, cycle_id, technology_id, with_matches=True)


@router.post("/novelty/{cycle_id}/{technology_id}/invima-check", response_model=NoveltyOut)
def invima_check(
    cycle_id: int,
    technology_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_SCREENING_WRITE)),
):
    """Cruza la tecnologia con el indice local y persiste la evidencia (RF11)."""
    try:
        screening_service.run_invima_check(db, cycle_id, technology_id, actor=user.email)
    except ScreeningRuleError as exc:
        raise _rule(exc) from exc
    return _novelty_out(db, cycle_id, technology_id, with_matches=True)


@router.put("/novelty/{cycle_id}/{technology_id}", response_model=NoveltyOut)
def save_novelty(
    cycle_id: int,
    technology_id: int,
    payload: NoveltyIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_SCREENING_WRITE)),
):
    try:
        screening_service.save_novelty(
            db,
            cycle_id,
            technology_id,
            option_code=payload.option_code,
            justification=payload.justification,
            sala_concept=payload.sala_especializada_concept,
            sala_ref=payload.sala_especializada_ref,
            actor=user.email,
        )
    except ScreeningRuleError as exc:
        raise _rule(exc) from exc
    bump_state_version(db)
    return _novelty_out(db, cycle_id, technology_id, with_matches=True)


# --------------------------------------------------------------------------- #
#  Normalizacion tecnica
# --------------------------------------------------------------------------- #
@router.post("/normalize/{technology_id}", response_model=NormalizationOut)
def normalize(
    technology_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_TECHNOLOGY_WRITE)),
):
    """Canoniza ATC, CIE-10, MeSH y nomenclatura de dispositivos."""
    tech = db.get(Technology, technology_id)
    if tech is None:
        raise HTTPException(status_code=404, detail="La tecnología no existe.")
    report = normalization.normalize_technology(tech)
    db.commit()
    return NormalizationOut(
        technology_id=technology_id,
        corregido=report["corregido"],
        rechazado=report["rechazado"],
        sugerencias=normalization.suggest_vocabularies(db, tech),
    )


# --------------------------------------------------------------------------- #
#  RF12 - Listado Unico por Cluster
# --------------------------------------------------------------------------- #
@router.get("/unique-list/{cycle_id}", response_model=UniqueListOut)
def get_unique_list(
    cycle_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_READ)),
):
    try:
        return UniqueListOut(**screening_service.unique_list(db, cycle_id))
    except ScreeningRuleError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/unique-list/{cycle_id}/export")
def export_unique_list(
    cycle_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_READ)),
):
    """Exporta el Listado Unico en CSV, agrupado por cluster."""
    try:
        data = screening_service.unique_list(db, cycle_id)
    except ScreeningRuleError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=";")
    writer.writerow(
        [
            "cluster", "nombre_comercial", "dci", "fabricante", "tipologia",
            "condicion", "atc", "cie10", "nct", "estado", "porcentaje_p",
            "registro_invima",
        ]
    )
    for group in data["clusters"]:
        for item in group["items"]:
            writer.writerow(
                [
                    group["cluster_name"],
                    item["commercial_name"],
                    item["inn_name"],
                    item["manufacturer"],
                    item["tech_type_name"],
                    item["condition"],
                    item["atc_code"],
                    " ".join(item["icd10_codes"]),
                    " ".join(str(n) for n in item["nct_ids"]),
                    TECHNOLOGY_STATUS_LABELS.get(item["status"], item["status"]),
                    item["priority_pct"] if item["priority_pct"] is not None else "",
                    item["invima_registry"],
                ]
            )

    # La cabecera HTTP solo admite latin-1: un codigo de ciclo con guion largo o
    # tilde tumbaba la descarga con un 500. Se deja el nombre en ASCII seguro.
    safe_code = re.sub(r"[^A-Za-z0-9_.-]+", "_", str(data["cycle_code"] or cycle_id)).strip("_")
    filename = f"listado_unico_{safe_code or cycle_id}.csv"
    # BOM para que Excel en español reconozca el UTF-8 sin pasos manuales.
    payload = "\ufeff" + buffer.getvalue()
    return StreamingResponse(
        iter([payload]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
