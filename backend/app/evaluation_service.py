"""Reglas de evaluacion temprana, Mini-HTA y revision por pares (fase 5)."""
from __future__ import annotations

import hashlib
import re
from datetime import datetime, timedelta, timezone
from html import escape

from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from . import audit, evaluation as catalog
from .methodology import get_param
from .models import (
    CycleTechnology,
    EvaluationDoc,
    EvaluationVersion,
    ReviewAssignment,
    ReviewComment,
    Technology,
)
from .rbac import (
    P_CYCLE_WRITE,
    P_REPORT_WRITE,
    P_REVIEW_SUBMIT,
    has_permission,
)
from .security import create_access_token, decode_access_token


class EvaluationRuleError(ValueError):
    """Violacion de una regla editorial o de conflicto de interes."""


# Permiso minimo para cada transicion. El superadmin las tiene todas.
TRANSITION_PERMISSION: dict[tuple[str, str], str] = {
    ("borrador", "revision_interna"): P_REPORT_WRITE,
    ("revision_interna", "revision_externa"): P_CYCLE_WRITE,
    ("revision_interna", "borrador"): P_REPORT_WRITE,
    ("revision_externa", "con_observaciones"): P_REVIEW_SUBMIT,
    ("revision_externa", "aprobado_comite"): P_CYCLE_WRITE,
    ("con_observaciones", "borrador"): P_REPORT_WRITE,
    ("aprobado_comite", "publicado"): P_CYCLE_WRITE,
}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _actor_email(actor) -> str:
    if actor is None:
        return ""
    if isinstance(actor, str):
        return actor
    return getattr(actor, "email", "") or ""


def suggest_product_level(db: Session, points: int | None) -> str:
    """D-07/D-09: umbrales parametrizados, sobreescribibles por tecnologia."""
    mini = int(get_param(db, "evaluation.mini_hta_min_points", 6) or 6)
    informe = int(get_param(db, "evaluation.informe_min_points", 5) or 5)
    pts = int(points or 0)
    if pts >= mini:
        return "mini_hta"
    if pts >= informe:
        return "informe"
    return "ficha"


def reviewer_token_days(db: Session) -> int:
    return int(get_param(db, "evaluation.reviewer_token_days", 10) or 10)


def _tech_title(tech: Technology | None) -> str:
    if tech is None:
        return "Tecnología"
    return (tech.commercial_name or tech.inn_name or f"Tecnología {tech.id}").strip()


def ensure_document(
    db: Session,
    cycle_id: int,
    technology_id: int,
    *,
    actor: str = "",
    product_level: str | None = None,
) -> EvaluationDoc:
    existing = (
        db.query(EvaluationDoc)
        .filter(
            EvaluationDoc.cycle_id == cycle_id,
            EvaluationDoc.technology_id == technology_id,
        )
        .first()
    )
    if existing:
        return existing

    entry = (
        db.query(CycleTechnology)
        .filter(
            CycleTechnology.cycle_id == cycle_id,
            CycleTechnology.technology_id == technology_id,
        )
        .first()
    )
    tech = db.get(Technology, technology_id)
    level = product_level or suggest_product_level(db, entry.priority_points if entry else None)
    if level not in catalog.PRODUCT_LEVELS:
        raise EvaluationRuleError(f"Nivel de producto desconocido: {level}")

    body = catalog.empty_body()
    if tech:
        body["mechanism"] = (tech.mechanism or "").strip()
        body["health_condition"] = (tech.indication or "").strip()
        body["evidence_state"] = (tech.summary or "").strip()

    doc = EvaluationDoc(
        cycle_id=cycle_id,
        technology_id=technology_id,
        product_level=level,
        status="borrador",
        title=_tech_title(tech),
        body=body,
        created_by=actor,
        updated_by=actor,
        version_major=0,
        version_minor=1,
    )
    db.add(doc)
    db.flush()
    _snapshot(db, doc, note="Apertura del expediente", actor=actor)
    return doc


def start_evaluation(
    db: Session,
    entry: CycleTechnology,
    *,
    actor: str = "",
    product_level: str | None = None,
) -> EvaluationDoc:
    """Pasa una instancia priorizada a evaluacion y abre (o recupera) su expediente.

    Es el unico camino para abrir un expediente de una tecnologia priorizada:
    abrirlo sin mover la instancia dejaba la tecnologia "priorizada" con un
    borrador en curso, fuera del bloqueo de cierre del ciclo y del embudo.
    """
    if entry.status == "priorizada" and not entry.frozen:
        entry.status = "en_evaluacion"
        tech = db.get(Technology, entry.technology_id)
        if tech is not None:
            previous_status = tech.status
            tech.status = "en_evaluacion"
            from . import strategy_service

            db.flush()
            strategy_service.watch_technology(
                db,
                tech,
                previous_phase=tech.development_phase or "",
                previous_status=previous_status,
            )
    return ensure_document(
        db, entry.cycle_id, entry.technology_id, actor=actor, product_level=product_level
    )


def transition_hints(db: Session, doc: EvaluationDoc, actor) -> dict[str, str]:
    """Motivo por el que cada transicion permitida aun no procede (vacio = procede).

    Permite a la interfaz deshabilitar el boton con una explicacion en vez de
    dejar que el usuario descubra la regla por un rechazo.
    """
    hints: dict[str, str] = {}
    for target in catalog.EDITORIAL_TRANSITIONS.get(doc.status, ()):
        needed = TRANSITION_PERMISSION.get((doc.status, target))
        if needed and not has_permission(actor, needed):
            hints[target] = f"Su perfil no tiene el permiso requerido ({needed})."
            continue
        if target == "revision_interna":
            state = completeness(doc)
            if not state["complete"]:
                labels = catalog.FIELD_LABELS
                missing = ", ".join(labels.get(k, k) for k in state["missing"])
                hints[target] = f"Complete los campos obligatorios: {missing}."
                continue
        if target == "publicado":
            ok, reason = can_publish(db, doc)
            if not ok:
                hints[target] = reason
                continue
        hints[target] = ""
    return hints


def completeness(doc: EvaluationDoc) -> dict:
    missing = catalog.missing_fields(doc.body, doc.product_level)
    required = catalog.required_fields(doc.product_level)
    done = len(required) - len(missing)
    pct = round(100 * done / len(required)) if required else 100
    return {
        "required": list(required),
        "missing": missing,
        "complete": not missing,
        "pct": pct,
    }


def _snapshot(db: Session, doc: EvaluationDoc, *, note: str, actor: str) -> EvaluationVersion:
    row = EvaluationVersion(
        doc_id=doc.id,
        major=doc.version_major,
        minor=doc.version_minor,
        status=doc.status,
        body=dict(doc.body or {}),
        note=note,
        created_by=actor,
    )
    db.add(row)
    db.flush()
    return row


def save_document(
    db: Session,
    doc: EvaluationDoc,
    *,
    actor: str,
    title: str | None = None,
    product_level: str | None = None,
    body: dict | None = None,
    confidential: bool | None = None,
    confidential_fields: list | None = None,
) -> EvaluationDoc:
    if doc.status not in {"borrador", "con_observaciones"}:
        raise EvaluationRuleError(
            "El documento solo se edita en borrador o con observaciones."
        )
    previous = {
        "title": doc.title,
        "product_level": doc.product_level,
        "version": f"{doc.version_major}.{doc.version_minor}",
    }
    if title is not None:
        doc.title = title.strip()
    if product_level is not None:
        if product_level not in catalog.PRODUCT_LEVELS:
            raise EvaluationRuleError(f"Nivel de producto desconocido: {product_level}")
        doc.product_level = product_level
    if body is not None:
        merged = catalog.empty_body()
        merged.update({k: ("" if v is None else str(v)) for k, v in body.items() if k in merged})
        doc.body = merged
        flag_modified(doc, "body")
    if confidential is not None:
        doc.confidential = bool(confidential)
    if confidential_fields is not None:
        allowed = set(catalog.empty_body())
        doc.confidential_fields = [k for k in confidential_fields if k in allowed]
        flag_modified(doc, "confidential_fields")
    doc.version_minor = int(doc.version_minor or 0) + 1
    doc.updated_by = actor
    _snapshot(db, doc, note="Guardado de borrador", actor=actor)
    audit.record_action(
        db,
        entity_type="evaluation_docs",
        entity_id=doc.id,
        action="report:save",
        old_value=previous,
        new_value={"version": f"{doc.version_major}.{doc.version_minor}", "title": doc.title},
    )
    return doc


def _counts_as_reviewer(db: Session, row: ReviewAssignment) -> bool:
    """Un interno cuenta como revisor solo si su perfil redacta o revisa.

    Cualquier usuario que abre el expediente queda con una asignacion interna
    (para exigirle el COI antes de leer); un tomador de decisiones que solo
    consulta no puede satisfacer el requisito de revision por pares.
    """
    if row.kind != "interno" or not row.reviewer_user_id:
        return True
    from .models import User

    user = db.get(User, row.reviewer_user_id)
    if user is None:
        return False
    return has_permission(user, P_REPORT_WRITE) or has_permission(user, P_REVIEW_SUBMIT)


def _signed_kinds(db: Session, doc_id: int) -> set[str]:
    rows = db.query(ReviewAssignment).filter(ReviewAssignment.doc_id == doc_id).all()
    return {
        row.kind
        for row in rows
        if row.coi_signed and row.status != "revocado" and _counts_as_reviewer(db, row)
    }


def can_publish(db: Session, doc: EvaluationDoc) -> tuple[bool, str]:
    kinds = _signed_kinds(db, doc.id)
    if "interno" not in kinds:
        return False, "Falta un revisor interno con conflicto de interés declarado."
    if "externo" not in kinds:
        return False, "Falta un revisor externo con conflicto de interés declarado."
    return True, ""


def transition(
    db: Session,
    doc: EvaluationDoc,
    target: str,
    *,
    actor,
    note: str = "",
) -> EvaluationDoc:
    allowed = catalog.EDITORIAL_TRANSITIONS.get(doc.status, ())
    if target not in allowed:
        raise EvaluationRuleError(
            f"No se puede pasar de '{doc.status}' a '{target}'."
        )
    needed = TRANSITION_PERMISSION.get((doc.status, target))
    if needed and not has_permission(actor, needed):
        raise EvaluationRuleError(
            f"El perfil no tiene permiso para esta transición ({needed})."
        )
    if target == "revision_interna":
        state = completeness(doc)
        if not state["complete"]:
            raise EvaluationRuleError(
                "No se envía a revisión interna con campos obligatorios vacíos: "
                + ", ".join(state["missing"])
            )
    if target == "publicado":
        ok, reason = can_publish(db, doc)
        if not ok:
            raise EvaluationRuleError(reason)

    previous = doc.status
    doc.status = target
    doc.version_major = int(doc.version_major or 0) + 1
    doc.version_minor = 0
    doc.updated_by = _actor_email(actor)
    if target == "publicado":
        doc.published_at = _utcnow()
        # La instancia del ciclo tambien queda publicada: sin esto el embudo del
        # ciclo (`summary.published`) nunca contaba lo que se publicaba.
        entry = (
            db.query(CycleTechnology)
            .filter(
                CycleTechnology.cycle_id == doc.cycle_id,
                CycleTechnology.technology_id == doc.technology_id,
            )
            .first()
        )
        if entry is not None and not entry.frozen and entry.status in ("priorizada", "en_evaluacion"):
            entry.status = "publicada"
        tech = db.get(Technology, doc.technology_id)
        if tech:
            previous_status = tech.status
            tech.status = "publicada"
            from . import strategy_service

            strategy_service.watch_technology(
                db, tech, previous_phase=tech.development_phase or "", previous_status=previous_status
            )
    _snapshot(db, doc, note=note or f"Transición {previous} -> {target}", actor=_actor_email(actor))
    audit.record_action(
        db,
        entity_type="evaluation_docs",
        entity_id=doc.id,
        action="report:transition",
        old_value={"status": previous},
        new_value={"status": target, "note": note},
    )
    return doc


def ensure_internal_assignment(db: Session, doc: EvaluationDoc, user) -> ReviewAssignment:
    email = (getattr(user, "email", "") or "").strip().lower()
    row = (
        db.query(ReviewAssignment)
        .filter(
            ReviewAssignment.doc_id == doc.id,
            ReviewAssignment.kind == "interno",
            ReviewAssignment.reviewer_email == email,
        )
        .first()
    )
    if row:
        return row
    row = ReviewAssignment(
        doc_id=doc.id,
        kind="interno",
        reviewer_name=getattr(user, "name", "") or email,
        reviewer_email=email,
        reviewer_user_id=getattr(user, "id", None),
        created_by=email,
    )
    db.add(row)
    db.flush()
    return row


def sign_coi(
    db: Session,
    assignment: ReviewAssignment,
    *,
    accepted: bool,
    statement: str = "",
    has_conflict: bool = False,
    actor: str = "",
) -> ReviewAssignment:
    if not accepted:
        raise EvaluationRuleError("Debe aceptar la declaración de conflicto de interés.")
    assignment.coi_signed = True
    assignment.coi_statement = (statement or "").strip()
    assignment.coi_has_conflict = bool(has_conflict)
    assignment.coi_signed_at = _utcnow()
    if assignment.status in ("invitado", "invitacion_enviada"):
        assignment.status = "en_lectura"
    audit.record_action(
        db,
        entity_type="review_assignments",
        entity_id=assignment.id,
        action="review:coi",
        new_value={"has_conflict": has_conflict, "kind": assignment.kind},
    )
    return assignment


def invite_reviewer(
    db: Session,
    doc: EvaluationDoc,
    *,
    kind: str,
    name: str,
    email: str,
    actor: str = "",
) -> tuple[ReviewAssignment, str | None]:
    kind = (kind or "").strip().lower()
    if kind not in catalog.REVIEW_KINDS:
        raise EvaluationRuleError("El revisor debe ser interno o externo.")
    email = (email or "").strip().lower()
    name = (name or "").strip()
    if not email or not name:
        raise EvaluationRuleError("Nombre y correo del revisor son obligatorios.")
    if not _EMAIL_RE.match(email):
        raise EvaluationRuleError("El correo del revisor no tiene un formato válido.")
    if doc.status == "publicado":
        raise EvaluationRuleError("El documento ya está publicado: no admite nuevos revisores.")

    token = None
    row = ReviewAssignment(
        doc_id=doc.id,
        kind=kind,
        reviewer_name=name,
        reviewer_email=email,
        created_by=actor,
    )
    db.add(row)
    db.flush()

    if kind == "externo":
        days = reviewer_token_days(db)
        token = create_access_token(
            subject=email,
            extra={"typ": "review", "aid": row.id, "doc": doc.id},
            expires_delta=timedelta(days=days),
        )
        row.token_hash = _hash_token(token)
        row.expires_at = _utcnow() + timedelta(days=days)

    audit.record_action(
        db,
        entity_type="review_assignments",
        entity_id=row.id,
        action="review:invite",
        new_value={"kind": kind, "email": email, "doc_id": doc.id},
    )
    return row, token


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def revoke_assignment(db: Session, assignment: ReviewAssignment, *, actor: str = "") -> ReviewAssignment:
    """Revoca una invitacion (correo equivocado, revisor que declina).

    La fila no se borra: la bitacora y el historial de revisores deben mostrar
    que la invitacion existio. El token deja de abrir el portal.
    """
    if assignment.status in ("aprobado", "observado"):
        raise EvaluationRuleError("La revisión ya fue enviada y no se revoca.")
    if assignment.status == "revocado":
        return assignment
    assignment.status = "revocado"
    assignment.token_hash = ""
    audit.record_action(
        db,
        entity_type="review_assignments",
        entity_id=assignment.id,
        action="review:revoke",
        new_value={"kind": assignment.kind, "email": assignment.reviewer_email, "actor": actor},
    )
    return assignment


def resolve_reviewer_token(db: Session, token: str) -> tuple[ReviewAssignment, EvaluationDoc]:
    """Resuelve el JWT del portal. Un token caducado se registra y se niega."""
    payload = decode_access_token(token, verify_exp=True)
    if payload and payload.get("typ") == "review":
        assignment = db.get(ReviewAssignment, int(payload.get("aid") or 0))
        if assignment is None:
            raise EvaluationRuleError("Invitación inexistente.")
        if assignment.status == "revocado":
            raise EvaluationRuleError("TOKEN_REVOKED")
        doc = db.get(EvaluationDoc, assignment.doc_id)
        if doc is None:
            raise EvaluationRuleError("El documento ya no existe.")
        return assignment, doc

    stale = decode_access_token(token, verify_exp=False)
    if stale and stale.get("typ") == "review":
        assignment = db.get(ReviewAssignment, int(stale.get("aid") or 0))
        audit.record_action(
            db,
            entity_type="review_assignments",
            entity_id=getattr(assignment, "id", 0) or 0,
            action="review:token_expired",
            new_value={"doc_id": stale.get("doc"), "email": stale.get("sub")},
        )
        db.commit()
        raise EvaluationRuleError("TOKEN_EXPIRED")
    raise EvaluationRuleError("TOKEN_INVALID")


def add_comment(
    db: Session,
    doc: EvaluationDoc,
    *,
    body: str,
    author: str,
    field_key: str = "",
    assignment_id: int | None = None,
) -> ReviewComment:
    text = (body or "").strip()
    if not text:
        raise EvaluationRuleError("El comentario no puede ir vacío.")
    latest = (
        db.query(EvaluationVersion)
        .filter(EvaluationVersion.doc_id == doc.id)
        .order_by(EvaluationVersion.id.desc())
        .first()
    )
    row = ReviewComment(
        doc_id=doc.id,
        assignment_id=assignment_id,
        version_id=latest.id if latest else None,
        field_key=(field_key or "").strip(),
        body=text,
        author=author,
    )
    db.add(row)
    db.flush()
    return row


def submit_review(
    db: Session,
    assignment: ReviewAssignment,
    *,
    verdict: str,
    note: str = "",
) -> ReviewAssignment:
    if not assignment.coi_signed:
        raise EvaluationRuleError("Sin declaración de conflicto de interés no hay revisión.")
    verdict = (verdict or "").strip().lower()
    if verdict not in catalog.REVIEW_VERDICTS:
        raise EvaluationRuleError("El veredicto debe ser aprobado u observado.")
    doc = db.get(EvaluationDoc, assignment.doc_id)
    if doc is not None and doc.status in ("borrador", "revision_interna"):
        raise EvaluationRuleError(
            "El documento aún no está en revisión externa. Podrá enviar su veredicto "
            "cuando la coordinación lo pase a esa etapa; mientras tanto puede dejar observaciones."
        )
    if doc is not None and doc.status == "publicado":
        raise EvaluationRuleError("El documento ya fue publicado; la revisión está cerrada.")
    assignment.status = verdict
    assignment.submitted_at = _utcnow()
    if doc and doc.status == "revision_externa" and verdict == "observado":
        previous = doc.status
        doc.status = "con_observaciones"
        doc.version_major = int(doc.version_major or 0) + 1
        doc.version_minor = 0
        _snapshot(
            db,
            doc,
            note=note or "Observaciones del revisor",
            actor=assignment.reviewer_email,
        )
        audit.record_action(
            db,
            entity_type="evaluation_docs",
            entity_id=doc.id,
            action="report:transition",
            old_value={"status": previous},
            new_value={"status": "con_observaciones", "note": note},
        )
    audit.record_action(
        db,
        entity_type="review_assignments",
        entity_id=assignment.id,
        action="review:submit",
        new_value={"verdict": verdict, "note": note},
    )
    return assignment


def assignments_of(db: Session, doc_id: int) -> list[ReviewAssignment]:
    return (
        db.query(ReviewAssignment)
        .filter(ReviewAssignment.doc_id == doc_id)
        .order_by(ReviewAssignment.created_at.asc())
        .all()
    )


def comments_of(db: Session, doc_id: int) -> list[ReviewComment]:
    return (
        db.query(ReviewComment)
        .filter(ReviewComment.doc_id == doc_id)
        .order_by(ReviewComment.created_at.asc())
        .all()
    )


def versions_of(db: Session, doc_id: int) -> list[EvaluationVersion]:
    return (
        db.query(EvaluationVersion)
        .filter(EvaluationVersion.doc_id == doc_id)
        .order_by(EvaluationVersion.id.asc())
        .all()
    )


def has_published_report(db: Session, cycle_id: int, technology_id: int) -> bool:
    row = (
        db.query(EvaluationDoc)
        .filter(
            EvaluationDoc.cycle_id == cycle_id,
            EvaluationDoc.technology_id == technology_id,
            EvaluationDoc.status == "publicado",
        )
        .first()
    )
    return row is not None


def render_institutional_html(doc: EvaluationDoc, tech: Technology | None = None, cycle_code: str = "") -> str:
    """Plantilla HTML/CSS institucional. El PDF se obtiene por impresion o Playwright."""
    from .report_html import render_evaluation_html

    return render_evaluation_html(doc, tech=tech, cycle_code=cycle_code)
