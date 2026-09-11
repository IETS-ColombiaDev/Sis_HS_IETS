"""Editor de fichas, informes y Mini-HTA (RF13-RF15)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy.orm import Session

from .. import audit, mailer
from .. import evaluation as catalog
from .. import evaluation_service
from ..config import settings
from ..database import get_db
from ..deps import get_current_user, require_permission
from ..evaluation_service import EvaluationRuleError
from ..events import bump_state_version
from ..models import Cycle, CycleTechnology, EvaluationDoc, ReviewAssignment, Technology, User
from ..rbac import P_CYCLE_WRITE, P_REPORT_WRITE, P_REVIEW_SUBMIT, has_permission
from ..schemas import (
    EvaluationCoiIn,
    EvaluationCompleteness,
    EvaluationDocOut,
    EvaluationDocUpdate,
    EvaluationOpenIn,
    EvaluationQueueItem,
    EvaluationTransitionIn,
    EvaluationVersionOut,
    ReviewAssignmentOut,
    ReviewCommentIn,
    ReviewCommentOut,
    ReviewInviteIn,
    ReviewInviteOut,
)

router = APIRouter(prefix="/api/reports", tags=["evaluation"])


def _http(exc: EvaluationRuleError) -> HTTPException:
    detail = str(exc)
    code = 409
    if "permiso" in detail.lower():
        code = 403
    return HTTPException(status_code=code, detail=detail)


def _to_out(
    db: Session,
    doc: EvaluationDoc,
    *,
    include_body: bool,
    user: User,
) -> EvaluationDocOut:
    assignment = evaluation_service.ensure_internal_assignment(db, doc, user)
    coi_ok = bool(assignment.coi_signed)
    complete = evaluation_service.completeness(doc)
    out = EvaluationDocOut.model_validate(doc)
    out.product_level_label = catalog.PRODUCT_LEVEL_LABELS.get(doc.product_level, doc.product_level)
    out.status_label = catalog.EDITORIAL_STATUS_LABELS.get(doc.status, doc.status)
    out.allowed_transitions = list(catalog.EDITORIAL_TRANSITIONS.get(doc.status, ()))
    out.completeness = EvaluationCompleteness(**complete)
    out.confidential_fields = list(doc.confidential_fields or [])
    out.coi_required = not coi_ok
    out.assignments = [
        ReviewAssignmentOut.model_validate(a) for a in evaluation_service.assignments_of(db, doc.id)
    ]
    out.comments = [
        ReviewCommentOut.model_validate(c) for c in evaluation_service.comments_of(db, doc.id)
    ]
    out.transition_hints = evaluation_service.transition_hints(db, doc, user)
    if not include_body or not coi_ok:
        out.body = None
    return out


def _get_doc(db: Session, doc_id: int) -> EvaluationDoc:
    doc = db.get(EvaluationDoc, doc_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    return doc


@router.get("", response_model=list[EvaluationQueueItem])
def list_queue(
    cycle_id: int = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Tecnologias del ciclo en evaluacion o priorizadas, con su expediente si existe."""
    entries = (
        db.query(CycleTechnology)
        .filter(
            CycleTechnology.cycle_id == cycle_id,
            CycleTechnology.status.in_(("priorizada", "en_evaluacion", "publicada")),
        )
        .all()
    )
    docs = {
        d.technology_id: d
        for d in db.query(EvaluationDoc).filter(EvaluationDoc.cycle_id == cycle_id).all()
    }
    tech_ids = [e.technology_id for e in entries]
    techs = {
        t.id: t
        for t in db.query(Technology).filter(Technology.id.in_(tech_ids)).all()
    } if tech_ids else {}
    items: list[EvaluationQueueItem] = []
    for entry in entries:
        tech = techs.get(entry.technology_id)
        doc = docs.get(entry.technology_id)
        suggested = evaluation_service.suggest_product_level(db, entry.priority_points)
        complete = evaluation_service.completeness(doc) if doc else {"pct": 0}
        items.append(
            EvaluationQueueItem(
                technology_id=entry.technology_id,
                commercial_name=(tech.commercial_name if tech else ""),
                inn_name=(tech.inn_name if tech else ""),
                entry_status=entry.status,
                priority_points=int(entry.priority_points) if entry.priority_points is not None else None,
                suggested_level=doc.product_level if doc else suggested,
                suggested_level_label=catalog.PRODUCT_LEVEL_LABELS.get(
                    doc.product_level if doc else suggested, suggested
                ),
                doc_id=doc.id if doc else None,
                doc_status=doc.status if doc else "",
                doc_status_label=catalog.EDITORIAL_STATUS_LABELS.get(doc.status, "") if doc else "",
                product_level=doc.product_level if doc else "",
                completeness_pct=complete.get("pct", 0),
            )
        )
    return items


@router.post("", response_model=EvaluationDocOut)
def open_document(
    payload: EvaluationOpenIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_REPORT_WRITE)),
):
    entry = (
        db.query(CycleTechnology)
        .filter(
            CycleTechnology.cycle_id == payload.cycle_id,
            CycleTechnology.technology_id == payload.technology_id,
        )
        .first()
    )
    if entry is None:
        raise HTTPException(status_code=404, detail="La tecnología no está asignada a este ciclo.")
    if entry.status not in ("priorizada", "en_evaluacion", "publicada"):
        raise HTTPException(
            status_code=409,
            detail="Solo las tecnologías priorizadas abren expediente de evaluación temprana.",
        )
    existing = (
        db.query(EvaluationDoc.id)
        .filter(
            EvaluationDoc.cycle_id == payload.cycle_id,
            EvaluationDoc.technology_id == payload.technology_id,
        )
        .first()
    )
    if existing is None and entry.frozen:
        raise HTTPException(
            status_code=409,
            detail="El ciclo está cerrado: no se abren expedientes nuevos en el.",
        )
    try:
        # Abrir el expediente de una priorizada la pasa a evaluacion: es el
        # mismo gesto que "Pasar a evaluacion" desde la matriz.
        doc = evaluation_service.start_evaluation(
            db, entry, actor=user.email, product_level=payload.product_level
        )
    except EvaluationRuleError as exc:
        raise _http(exc) from exc
    evaluation_service.ensure_internal_assignment(db, doc, user)
    db.commit()
    db.refresh(doc)
    bump_state_version(db)
    return _to_out(db, doc, include_body=True, user=user)


@router.get("/{doc_id}", response_model=EvaluationDocOut)
def get_document(
    doc_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    doc = _get_doc(db, doc_id)
    email = (user.email or "").strip().lower()
    existed = (
        db.query(ReviewAssignment.id)
        .filter(
            ReviewAssignment.doc_id == doc.id,
            ReviewAssignment.kind == "interno",
            ReviewAssignment.reviewer_email == email,
        )
        .first()
    )
    out = _to_out(db, doc, include_body=True, user=user)
    if existed is None:
        db.commit()
    return out


@router.put("/{doc_id}", response_model=EvaluationDocOut)
def update_document(
    doc_id: int,
    payload: EvaluationDocUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_REPORT_WRITE)),
):
    doc = _get_doc(db, doc_id)
    assignment = evaluation_service.ensure_internal_assignment(db, doc, user)
    if not assignment.coi_signed:
        raise HTTPException(
            status_code=403,
            detail="Sin declaración de conflicto de interés no se habilita la edición.",
        )
    try:
        evaluation_service.save_document(
            db,
            doc,
            actor=user.email,
            title=payload.title,
            product_level=payload.product_level,
            body=payload.body,
            confidential=payload.confidential,
            confidential_fields=payload.confidential_fields,
        )
    except EvaluationRuleError as exc:
        raise _http(exc) from exc
    db.commit()
    db.refresh(doc)
    bump_state_version(db)
    return _to_out(db, doc, include_body=True, user=user)


@router.post("/{doc_id}/coi", response_model=EvaluationDocOut)
def sign_internal_coi(
    doc_id: int,
    payload: EvaluationCoiIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    doc = _get_doc(db, doc_id)
    assignment = evaluation_service.ensure_internal_assignment(db, doc, user)
    try:
        evaluation_service.sign_coi(
            db,
            assignment,
            accepted=payload.accepted,
            statement=payload.statement,
            has_conflict=payload.has_conflict,
            actor=user.email,
        )
    except EvaluationRuleError as exc:
        raise _http(exc) from exc
    db.commit()
    db.refresh(doc)
    return _to_out(db, doc, include_body=True, user=user)


@router.post("/{doc_id}/transition", response_model=EvaluationDocOut)
def transition_document(
    doc_id: int,
    payload: EvaluationTransitionIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    doc = _get_doc(db, doc_id)
    try:
        evaluation_service.transition(
            db, doc, payload.status, actor=user, note=payload.note
        )
    except EvaluationRuleError as exc:
        raise _http(exc) from exc
    db.commit()
    db.refresh(doc)
    bump_state_version(db)
    return _to_out(db, doc, include_body=True, user=user)


@router.post("/{doc_id}/invite", response_model=ReviewInviteOut)
def invite_reviewer(
    doc_id: int,
    payload: ReviewInviteIn,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_CYCLE_WRITE)),
):
    doc = _get_doc(db, doc_id)
    try:
        assignment, token = evaluation_service.invite_reviewer(
            db,
            doc,
            kind=payload.kind,
            name=payload.reviewer_name,
            email=payload.reviewer_email,
            actor=user.email,
        )
    except EvaluationRuleError as exc:
        raise _http(exc) from exc
    db.commit()
    db.refresh(assignment)
    path = f"/revisar/{token}" if token else ""

    # P3-2: con SMTP configurado el enlace viaja por correo; sin el, la interfaz
    # lo muestra una sola vez para copiarlo (comportamiento previo).
    email_sent = False
    email_detail = ""
    if token:
        base = (settings.public_base_url or str(request.base_url)).rstrip("/")
        result = mailer.reviewer_invitation(
            to=assignment.reviewer_email,
            reviewer_name=assignment.reviewer_name,
            doc_title=doc.title or f"Documento {doc.id}",
            link=f"{base}{path}",
            days=evaluation_service.reviewer_token_days(db),
        )
        email_sent, email_detail = result.sent, result.detail
        if email_sent:
            assignment.status = "invitacion_enviada" if assignment.status == "invitado" else assignment.status
            audit.record_action(
                db,
                entity_type="review_assignments",
                entity_id=assignment.id,
                action="review:invite_email",
                new_value={"email": assignment.reviewer_email, "actor": user.email},
            )
            db.commit()
            db.refresh(assignment)
    return ReviewInviteOut(
        assignment=ReviewAssignmentOut.model_validate(assignment),
        token=token,
        invite_path=path,
        email_sent=email_sent,
        email_detail=email_detail,
    )


@router.post("/{doc_id}/assignments/{assignment_id}/revoke", response_model=EvaluationDocOut)
def revoke_reviewer(
    doc_id: int,
    assignment_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_CYCLE_WRITE)),
):
    """Revoca una invitacion pendiente: el enlace deja de abrir el portal."""
    doc = _get_doc(db, doc_id)
    assignment = db.get(ReviewAssignment, assignment_id)
    if assignment is None or assignment.doc_id != doc.id:
        raise HTTPException(status_code=404, detail="Invitación no encontrada")
    try:
        evaluation_service.revoke_assignment(db, assignment, actor=user.email)
    except EvaluationRuleError as exc:
        raise _http(exc) from exc
    db.commit()
    db.refresh(doc)
    bump_state_version(db)
    return _to_out(db, doc, include_body=True, user=user)


@router.get("/{doc_id}/versions", response_model=list[EvaluationVersionOut])
def list_versions(
    doc_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    doc = _get_doc(db, doc_id)
    assignment = evaluation_service.ensure_internal_assignment(db, doc, user)
    if not assignment.coi_signed:
        raise HTTPException(
            status_code=403,
            detail="Sin declaración de conflicto de interés no se habilita la lectura.",
        )
    return [
        EvaluationVersionOut.model_validate(v)
        for v in evaluation_service.versions_of(db, doc.id)
    ]


@router.post("/{doc_id}/comments", response_model=ReviewCommentOut)
def add_internal_comment(
    doc_id: int,
    payload: ReviewCommentIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not (
        has_permission(user, P_REVIEW_SUBMIT) or has_permission(user, P_REPORT_WRITE)
    ):
        raise HTTPException(
            status_code=403,
            detail="Se requiere permiso de informe o de revisión para comentar.",
        )
    doc = _get_doc(db, doc_id)
    assignment = evaluation_service.ensure_internal_assignment(db, doc, user)
    if not assignment.coi_signed:
        raise HTTPException(
            status_code=403,
            detail="Sin declaración de conflicto de interés no se habilitan comentarios.",
        )
    try:
        row = evaluation_service.add_comment(
            db,
            doc,
            body=payload.body,
            author=user.email,
            field_key=payload.field_key,
            assignment_id=assignment.id,
        )
    except EvaluationRuleError as exc:
        raise _http(exc) from exc
    db.commit()
    db.refresh(row)
    return ReviewCommentOut.model_validate(row)


@router.get("/{doc_id}/export")
def export_html(
    doc_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    doc = _get_doc(db, doc_id)
    assignment = evaluation_service.ensure_internal_assignment(db, doc, user)
    if not assignment.coi_signed:
        raise HTTPException(
            status_code=403,
            detail="Sin declaración de conflicto de interés no se habilita la exportación.",
        )
    tech = db.get(Technology, doc.technology_id)
    cycle = db.get(Cycle, doc.cycle_id)
    html = evaluation_service.render_institutional_html(doc, tech, cycle_code=cycle.code if cycle else "")
    filename = f"iets-evaluacion-{doc.id}-v{doc.version_major}.{doc.version_minor}.html"
    return Response(
        content=html,
        media_type="text/html; charset=utf-8",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )
