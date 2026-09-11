"""Canal reactivo de postulacion (RF02).

Una postulacion publica no entra al catalogo metodologico sola: queda en
moderacion. Aceptarla crea una `Technology` marcada como reactiva, con el
payload original y la declaracion de conflicto de interes adjuntos.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from .audit import record_action
from .classification import suggest_cluster, suggest_condition, suggest_tech_type
from .events import bump_state_version
from .models import Submission, Technology
from .priority import compute_screening_score


class SubmissionRuleError(ValueError):
    """Regla de negocio incumplida: el formulario no se guarda."""


EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def create_submission(db: Session, data: dict, *, ip: str = "", captcha: str = "") -> Submission:
    commercial = (data.get("commercial_name") or "").strip()
    inn = (data.get("inn_name") or "").strip()
    if not commercial or not inn:
        raise SubmissionRuleError("El nombre comercial y la DCI son obligatorios.")
    if not (data.get("mechanism") or "").strip():
        raise SubmissionRuleError("El mecanismo de acción es obligatorio.")
    if not (data.get("manufacturer") or "").strip():
        raise SubmissionRuleError("El fabricante o desarrollador es obligatorio.")
    if not (data.get("indication") or "").strip():
        raise SubmissionRuleError("La indicación es obligatoria.")
    if not (data.get("development_phase") or "").strip():
        raise SubmissionRuleError("La fase de desarrollo es obligatoria.")
    links = data.get("evidence_links") or []
    if not isinstance(links, list) or not [lk for lk in links if str(lk).strip()]:
        raise SubmissionRuleError("Debe adjuntar al menos un enlace a evidencia.")
    bad = [str(lk).strip() for lk in links if str(lk).strip() and not str(lk).strip().lower().startswith(("http://", "https://"))]
    if bad:
        raise SubmissionRuleError(
            f"Los enlaces a evidencia deben iniciar con http:// o https:// (revise: {bad[0][:80]})."
        )
    if not (data.get("submitter_name") or "").strip() or not (data.get("submitter_email") or "").strip():
        raise SubmissionRuleError("Nombre y correo de quien postula son obligatorios.")
    if not EMAIL_RE.match((data.get("submitter_email") or "").strip()):
        raise SubmissionRuleError("El correo de quien postula no es válido.")

    has_conflict = bool(data.get("has_conflict"))
    statement = (data.get("conflict_statement") or "").strip()
    if has_conflict and len(statement) < 20:
        raise SubmissionRuleError(
            "Si declara un conflicto de interés, debe describirlo (al menos 20 caracteres)."
        )
    if not data.get("coi_accepted"):
        raise SubmissionRuleError("Debe firmar la declaración de conflicto de interés.")

    row = Submission(
        commercial_name=commercial[:400],
        inn_name=inn[:400],
        mechanism=(data.get("mechanism") or "").strip(),
        manufacturer=(data.get("manufacturer") or "").strip()[:300],
        indication=(data.get("indication") or "").strip(),
        development_phase=(data.get("development_phase") or "").strip()[:120],
        evidence_links=[str(lk).strip() for lk in links if str(lk).strip()][:20],
        has_conflict=has_conflict,
        conflict_statement=statement,
        submitter_name=(data.get("submitter_name") or "").strip()[:255],
        submitter_email=(data.get("submitter_email") or "").strip().lower()[:255],
        submitter_org=(data.get("submitter_org") or "").strip()[:300],
        ip_address=(ip or "")[:64],
        status="recibida",
    )
    db.add(row)
    db.flush()
    record_action(
        db,
        entity_type="submissions",
        entity_id=str(row.id),
        action="submission_received",
        new_value={
            "commercial_name": row.commercial_name,
            "email": row.submitter_email,
            "has_conflict": row.has_conflict,
            # verificado | omitido (modo degradado sin llaves de reCAPTCHA)
            "captcha": captcha or "omitido",
        },
    )
    db.commit()
    db.refresh(row)
    bump_state_version(db)
    return row


def accept_submission(db: Session, submission: Submission, *, reviewer: str, note: str = "") -> Technology:
    if submission.status != "recibida":
        raise SubmissionRuleError("Solo se aceptan postulaciones en estado recibida.")

    score = compute_screening_score(
        horizon="",
        technology_type="",
        phase=submission.development_phase,
        therapeutic_area=submission.indication,
        summary=submission.mechanism,
        technology=submission.commercial_name,
        title=submission.commercial_name,
    )
    tech = Technology(
        commercial_name=submission.commercial_name,
        inn_name=submission.inn_name,
        manufacturer=submission.manufacturer,
        mechanism=submission.mechanism,
        indication=submission.indication,
        summary=submission.mechanism,
        url=(submission.evidence_links or [""])[0][:1024],
        development_phase=submission.development_phase,
        source_channel="reactiva",
        captured_by=submission.submitter_email,
        captured_at=datetime.now(timezone.utc),
        status="capturada_no_asignada",
        screening_score=score,
        raw_payload={
            "origin": "submission",
            "submission_id": submission.id,
            "evidence_links": submission.evidence_links,
            "has_conflict": submission.has_conflict,
            "conflict_statement": submission.conflict_statement,
            "submitter": {
                "name": submission.submitter_name,
                "email": submission.submitter_email,
                "org": submission.submitter_org,
            },
        },
    )
    tech.condition = suggest_condition(
        phase=submission.development_phase,
        summary=submission.mechanism,
        title=submission.commercial_name,
        horizon="",
    )
    type_id, _ = suggest_tech_type(
        db,
        legacy_type="",
        title=submission.commercial_name,
        summary=submission.mechanism,
        technology=submission.commercial_name,
    )
    tech.tech_type_id = type_id
    cluster_id, reason = suggest_cluster(
        db,
        indication=submission.indication,
        summary=submission.mechanism,
        title=submission.commercial_name,
    )
    tech.suggested_cluster_id = cluster_id
    tech.suggested_cluster_reason = (reason or "")[:400]

    db.add(tech)
    db.flush()

    submission.status = "aceptada"
    submission.review_note = (note or "").strip()
    submission.reviewed_by = reviewer
    submission.reviewed_at = datetime.now(timezone.utc)
    submission.technology_id = tech.id
    record_action(
        db,
        entity_type="submissions",
        entity_id=str(submission.id),
        action="submission_accepted",
        new_value={"technology_id": tech.id, "note": note},
    )
    db.commit()
    db.refresh(tech)
    bump_state_version(db)
    return tech


def reject_submission(db: Session, submission: Submission, *, reviewer: str, note: str) -> Submission:
    if submission.status != "recibida":
        raise SubmissionRuleError("Solo se rechazan postulaciones en estado recibida.")
    if not (note or "").strip():
        raise SubmissionRuleError("El rechazo exige un motivo visible para la bitácora.")
    submission.status = "rechazada"
    submission.review_note = note.strip()
    submission.reviewed_by = reviewer
    submission.reviewed_at = datetime.now(timezone.utc)
    record_action(
        db,
        entity_type="submissions",
        entity_id=str(submission.id),
        action="submission_rejected",
        new_value={"note": note},
    )
    db.commit()
    db.refresh(submission)
    bump_state_version(db)
    return submission
