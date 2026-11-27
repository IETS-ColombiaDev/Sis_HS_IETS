"""Canal reactivo de postulacion (RF02).

Una postulacion publica no entra al catalogo metodologico sola: queda en
moderacion. Aceptarla crea una `Technology` marcada como reactiva, con el
payload original y la declaracion de conflicto de interes adjuntos.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from urllib.parse import urlparse

from sqlalchemy.orm import Session

from .audit import record_action
from .classification import suggest_cluster, suggest_condition, suggest_tech_type
from .events import bump_state_version
from .models import Submission, Technology
from .priority import compute_screening_score, screening_weights


class SubmissionRuleError(ValueError):
    """Regla de negocio incumplida: el formulario no se guarda."""


EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
TRACKING_RE = re.compile(r"^POS-(\d{4})-(\d{1,9})$", re.I)

# Topes del formulario publico: lo que no cabe en una postulacion razonable se rechaza
# con un mensaje claro en lugar de guardarse cortado.
MAX_LINKS = 10
MAX_LINK_CHARS = 1000
MAX_TEXT_CHARS = 4000

STATUS_LABELS = {"recibida": "En moderación", "aceptada": "Aceptada", "rechazada": "No aceptada"}

# Motivos tipificados de rechazo. "otro" exige nota; los demas se explican solos.
REJECT_REASONS: dict[str, str] = {
    "fuera_alcance": "Fuera del alcance del escaneo de horizonte",
    "ya_vigilada": "La tecnología ya está en vigilancia o en el sistema",
    "duplicada": "Postulación duplicada",
    "evidencia_insuficiente": "Fuente de información insuficiente o no verificable",
    "sin_novedad": "Tecnología ya disponible en el país (sin novedad)",
    "datos_incompletos": "Datos incompletos o no identificables",
    "no_valida": "No es una postulación válida (prueba o envío automático)",
    "otro": "Otro motivo (se explica en la nota)",
}


def tracking_code(row: Submission) -> str:
    """Radicado legible: POS-<año>-<consecutivo>. Se deriva del registro, no se guarda."""
    year = (row.created_at or datetime.now(timezone.utc)).year
    return f"POS-{year}-{int(row.id or 0):05d}"


def find_by_tracking(db: Session, code: str, email: str) -> Submission | None:
    """Postulacion por radicado y correo. Sin coincidencia exacta de ambos, nada."""
    match = TRACKING_RE.match((code or "").strip())
    mail = (email or "").strip().lower()
    if not match or not mail:
        return None
    row = db.get(Submission, int(match.group(2)))
    if row is None or (row.submitter_email or "").lower() != mail:
        return None
    if tracking_code(row).upper() != (code or "").strip().upper():
        return None
    return row


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (text or "").lower()).strip()


def _same_technology(a: Submission, b: Submission) -> bool:
    for left, right in ((a.inn_name, b.inn_name), (a.commercial_name, b.commercial_name)):
        if _norm(left) and _norm(left) == _norm(right):
            return True
    return False


def _same_filing(a: Submission, b: Submission) -> bool:
    """La misma radicacion repetida: mismo nombre comercial o, si alguna no lo trae, misma DCI.

    Es mas estricta que `_same_technology`: dos productos distintos del mismo
    principio activo no se bloquean en el formulario; solo se avisan a quien modera.
    """
    left, right = _norm(a.commercial_name), _norm(b.commercial_name)
    if left and right:
        return left == right
    return bool(_norm(a.inn_name)) and _norm(a.inn_name) == _norm(b.inn_name)


def duplicates_of(db: Session, row: Submission, pool: list[Submission] | None = None) -> list[dict]:
    """Otras postulaciones de la misma tecnologia (mismo nombre comercial o misma DCI)."""
    if not (_norm(row.inn_name) or _norm(row.commercial_name)):
        return []
    others = pool if pool is not None else db.query(Submission).filter(Submission.id != row.id).all()
    out = []
    for other in others:
        if other.id == row.id or not _same_technology(row, other):
            continue
        out.append(
            {
                "id": other.id,
                "tracking_code": tracking_code(other),
                "status": other.status,
                "created_at": other.created_at.isoformat() if other.created_at else "",
                "same_submitter": (other.submitter_email or "").lower() == (row.submitter_email or "").lower(),
            }
        )
    return sorted(out, key=lambda d: d["id"], reverse=True)[:8]


def waiting_days(row: Submission, now: datetime | None = None) -> int:
    """Dias en moderacion: hasta hoy si sigue pendiente, hasta la decision si ya se resolvio."""
    start = row.created_at
    if start is None:
        return 0
    end = row.reviewed_at if row.status != "recibida" and row.reviewed_at else (now or datetime.now(timezone.utc))
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    return max(0, (end - start).days)


def summary(db: Session, *, stale_days: int = 7) -> dict:
    """Indicadores de la cola: pendientes, antiguas, conflictos y tiempo de respuesta."""
    rows = db.query(Submission).all()
    now = datetime.now(timezone.utc)
    pending = [r for r in rows if r.status == "recibida"]
    decided = [r for r in rows if r.status in ("aceptada", "rechazada") and r.reviewed_at]
    waits = sorted(waiting_days(r, now) for r in decided)
    median = waits[len(waits) // 2] if waits else None
    reasons: dict[str, int] = {}
    for r in rows:
        if r.status == "rechazada":
            key = r.reject_reason or "otro"
            reasons[key] = reasons.get(key, 0) + 1
    return {
        "total": len(rows),
        "pending": len(pending),
        "accepted": sum(1 for r in rows if r.status == "aceptada"),
        "rejected": sum(1 for r in rows if r.status == "rechazada"),
        "pending_with_conflict": sum(1 for r in pending if r.has_conflict),
        "pending_stale": sum(1 for r in pending if waiting_days(r, now) >= stale_days),
        "stale_days": stale_days,
        "oldest_pending_days": max((waiting_days(r, now) for r in pending), default=0),
        "median_response_days": median,
        "reject_reasons": [
            {"code": code, "label": REJECT_REASONS.get(code, code), "count": count}
            for code, count in sorted(reasons.items(), key=lambda kv: -kv[1])
        ],
    }


HISTORY_LABELS = {
    "submission_received": "Postulación recibida por el formulario público",
    "submission_accepted": "Aceptada y enviada a la bandeja de entrada",
    "submission_rejected": "Rechazada",
    "submission_reopened": "Reabierta para una nueva revisión",
    "submission_cross_check": "Cruce con la vigilancia y la web",
}


def history(db: Session, row: Submission) -> list[dict]:
    """Recorrido de la postulacion segun la bitacora de auditoria."""
    from .models import AuditLog

    events = (
        db.query(AuditLog)
        .filter(AuditLog.entity_type == "submissions", AuditLog.entity_id == str(row.id))
        .filter(AuditLog.action.startswith("submission_", autoescape=True))
        .order_by(AuditLog.occurred_at.asc(), AuditLog.id.asc())
        .all()
    )
    out = []
    for ev in events:
        data = ev.new_value if isinstance(ev.new_value, dict) else {}
        detail = ""
        if ev.action == "submission_rejected":
            reason = REJECT_REASONS.get(data.get("reason") or "", "")
            detail = " · ".join(p for p in (reason, (data.get("note") or "").strip()) if p)
        elif ev.action in ("submission_accepted", "submission_reopened"):
            detail = (data.get("note") or "").strip()
        out.append(
            {
                "action": ev.action,
                "label": HISTORY_LABELS.get(ev.action, ev.action),
                "at": ev.occurred_at.isoformat() if ev.occurred_at else "",
                "by": ev.user_email or "",
                "detail": detail[:600],
            }
        )
    return out


def create_submission(db: Session, data: dict, *, ip: str = "", captcha: str = "") -> Submission:
    commercial = (data.get("commercial_name") or "").strip()
    inn = (data.get("inn_name") or "").strip()
    if not commercial and not inn:
        raise SubmissionRuleError(
            "La tecnología reportada es obligatoria (nombre comercial o DCI)."
        )
    if not (data.get("indication") or "").strip():
        raise SubmissionRuleError("La indicación propuesta es obligatoria.")
    for field, label in (("indication", "La indicación propuesta"), ("mechanism", "El mecanismo de acción"), ("conflict_statement", "La descripción del conflicto")):
        if len((data.get(field) or "").strip()) > MAX_TEXT_CHARS:
            raise SubmissionRuleError(f"{label} supera el máximo de {MAX_TEXT_CHARS} caracteres. Resuma el texto.")
    links = data.get("evidence_links") or []
    if not isinstance(links, list) or not [lk for lk in links if str(lk).strip()]:
        raise SubmissionRuleError(
            "La fuente de información es obligatoria: adjunte al menos un enlace."
        )
    bad = [str(lk).strip() for lk in links if str(lk).strip() and not str(lk).strip().lower().startswith(("http://", "https://"))]
    if bad:
        raise SubmissionRuleError(
            f"Los enlaces a evidencia deben iniciar con http:// o https:// (revise: {bad[0][:80]})."
        )
    clean_links = list(dict.fromkeys(str(lk).strip() for lk in links if str(lk).strip()))
    if len(clean_links) > MAX_LINKS:
        raise SubmissionRuleError(f"Adjunte como máximo {MAX_LINKS} enlaces: deje los que mejor respaldan la postulación.")
    for link in clean_links:
        host = urlparse(link).hostname or ""
        if len(link) > MAX_LINK_CHARS or "." not in host or " " in link:
            raise SubmissionRuleError(f"Este enlace no parece una dirección web válida: {link[:80]}")
    if not (data.get("submitter_email") or "").strip():
        raise SubmissionRuleError("El correo de quien postula es obligatorio.")
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

    # La misma persona no radica dos veces la misma tecnologia mientras la primera sigue en moderacion.
    mail = (data.get("submitter_email") or "").strip().lower()
    probe = Submission(commercial_name=commercial, inn_name=inn)
    for other in db.query(Submission).filter(Submission.status == "recibida", Submission.submitter_email == mail).all():
        if _same_filing(probe, other):
            raise SubmissionRuleError(
                f"Ya hay una postulación suya de esta tecnología en moderación (radicado {tracking_code(other)}). "
                "No es necesario enviarla de nuevo."
            )

    row = Submission(
        commercial_name=commercial[:400],
        inn_name=inn[:400],
        mechanism=(data.get("mechanism") or "").strip(),
        manufacturer=(data.get("manufacturer") or "").strip()[:300],
        indication=(data.get("indication") or "").strip(),
        development_phase=(data.get("development_phase") or "").strip()[:120],
        evidence_links=clean_links,
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
    # RF-02-F: cruce inmediato con la vigilancia proactiva (local y rapido). El de
    # la web lo completa el router en segundo plano para no demorar el formulario.
    try:
        from . import submission_crosscheck

        submission_crosscheck.run(db, row, web=False, actor="sistema")
    except Exception:  # noqa: BLE001 - el cruce nunca impide recibir la postulacion
        db.rollback()
        import logging

        logging.getLogger(__name__).warning("No se pudo cruzar la postulación %s", row.id, exc_info=True)
    bump_state_version(db)
    return row


def accept_submission(db: Session, submission: Submission, *, reviewer: str, note: str = "") -> Technology:
    if submission.status != "recibida":
        raise SubmissionRuleError("Solo se aceptan postulaciones en estado recibida.")

    name = submission.commercial_name or submission.inn_name

    score = compute_screening_score(
        horizon="",
        technology_type="",
        phase=submission.development_phase,
        therapeutic_area=submission.indication,
        summary=submission.mechanism,
        technology=name,
        title=name,
        weights=screening_weights(db),
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
            # RF-02-F: lo que el evaluador vio al moderar (coincidencias y web).
            "cross_check": (submission.cross_check or {}).get("summary") if isinstance(submission.cross_check, dict) else None,
        },
    )
    tech.condition = suggest_condition(
        phase=submission.development_phase,
        summary=submission.mechanism,
        title=name,
        horizon="",
    )
    type_id, _ = suggest_tech_type(
        db,
        legacy_type="",
        title=name,
        summary=submission.mechanism,
        technology=name,
    )
    tech.tech_type_id = type_id
    cluster_id, reason = suggest_cluster(
        db,
        indication=submission.indication,
        summary=submission.mechanism,
        title=name,
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


def reject_submission(db: Session, submission: Submission, *, reviewer: str, note: str, reason: str = "") -> Submission:
    if submission.status != "recibida":
        raise SubmissionRuleError("Solo se rechazan postulaciones en estado recibida.")
    code = (reason or "").strip() or "otro"
    if code not in REJECT_REASONS:
        raise SubmissionRuleError("El motivo de rechazo no existe. Elija uno de la lista.")
    if code == "otro" and not (note or "").strip():
        raise SubmissionRuleError("El rechazo exige un motivo visible para la bitácora.")
    submission.status = "rechazada"
    submission.reject_reason = code
    submission.review_note = (note or "").strip()
    submission.reviewed_by = reviewer
    submission.reviewed_at = datetime.now(timezone.utc)
    record_action(
        db,
        entity_type="submissions",
        entity_id=str(submission.id),
        action="submission_rejected",
        new_value={"reason": code, "note": (note or "").strip()},
    )
    db.commit()
    db.refresh(submission)
    bump_state_version(db)
    return submission


def reopen_submission(db: Session, submission: Submission, *, reviewer: str, note: str) -> Submission:
    """Devuelve a moderacion una postulacion rechazada (por error o con informacion nueva)."""
    if submission.status != "rechazada":
        raise SubmissionRuleError(
            "Solo se reabren postulaciones rechazadas. Una aceptada ya creó una señal en la bandeja de entrada."
        )
    if not (note or "").strip():
        raise SubmissionRuleError("Explique por qué se reabre la postulación: queda en la bitácora.")
    previous = {
        "reason": submission.reject_reason,
        "note": submission.review_note,
        "reviewed_by": submission.reviewed_by,
    }
    submission.status = "recibida"
    submission.reject_reason = ""
    submission.review_note = ""
    submission.reviewed_by = ""
    submission.reviewed_at = None
    record_action(
        db,
        entity_type="submissions",
        entity_id=str(submission.id),
        action="submission_reopened",
        old_value=previous,
        new_value={"note": note.strip(), "by": reviewer},
    )
    db.commit()
    db.refresh(submission)
    bump_state_version(db)
    return submission
