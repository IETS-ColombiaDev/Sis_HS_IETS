"""Metricas agregadas para los dashboards del sistema."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from .. import cycle_service, invima, priority_engine, rbac, screening_service
from ..evaluation import EDITORIAL_STATUS_LABELS
from ..database import get_db
from ..deps import get_current_user
from ..methodology import CYCLE_STATUS_LABELS
from ..models import (
    AlertEvent,
    Bulletin,
    Cycle,
    CycleTechnology,
    EvaluationDoc,
    Finding,
    MergeProposal,
    PriorityScore,
    Recommendation,
    ReviewAssignment,
    ScrapeLog,
    Source,
    Submission,
    Technology,
    User,
)
from ..priority import SCREENING_QUEUE_THRESHOLD
from ..rbac import rateable_criteria
from ..schemas import CountItem, DashboardStats, FindingOut, ScrapeLogOut, WorkbenchStats

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _finding_out(db: Session, f: Finding) -> FindingOut:
    out = FindingOut.model_validate(f)
    out.source_title = f.source.title if f.source else ""
    out.source_category = f.source.category if f.source else ""
    out.source_url = f.source.url if f.source else ""
    out.recommendations_count = (
        db.query(func.count(Recommendation.id)).filter(Recommendation.finding_id == f.id).scalar() or 0
    )
    return out


def _is_incomplete_characterization(f: Finding) -> bool:
    return not all([
        (f.technology or "").strip(),
        (f.horizon or "").strip(),
        (f.summary or "").strip(),
        (f.therapeutic_area or "").strip(),
    ])


def _counts(rows) -> list[CountItem]:
    return [CountItem(label=str(label or "Sin clasificar"), value=int(value)) for label, value in rows]


@router.get("/stats", response_model=DashboardStats)
def get_stats(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    total_sources = db.query(func.count(Source.id)).scalar() or 0
    total_findings = db.query(func.count(Finding.id)).scalar() or 0
    total_recommendations = db.query(func.count(Recommendation.id)).scalar() or 0
    total_scrapes = db.query(func.count(ScrapeLog.id)).scalar() or 0

    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    findings_last_7d = (
        db.query(func.count(Finding.id)).filter(Finding.created_at >= week_ago).scalar() or 0
    )

    by_category = _counts(
        db.query(Source.category, func.count(Source.id)).group_by(Source.category).all()
    )
    by_horizon = _counts(
        db.query(Finding.horizon, func.count(Finding.id)).group_by(Finding.horizon).all()
    )
    by_technology_type = _counts(
        db.query(Finding.technology_type, func.count(Finding.id))
        .group_by(Finding.technology_type)
        .all()
    )
    by_status = _counts(
        db.query(Finding.status, func.count(Finding.id)).group_by(Finding.status).all()
    )
    by_language = _counts(
        db.query(Source.language, func.count(Source.id)).group_by(Source.language).all()
    )

    top_rows = (
        db.query(Source.title, func.count(Finding.id).label("c"))
        .join(Finding, Finding.source_id == Source.id)
        .group_by(Source.id)
        .order_by(func.count(Finding.id).desc())
        .limit(8)
        .all()
    )
    top_sources = _counts(top_rows)

    recent = db.query(Finding).order_by(Finding.created_at.desc()).limit(8).all()
    recent_out = []
    for f in recent:
        out = FindingOut.model_validate(f)
        out.source_title = f.source.title if f.source else ""
        out.source_category = f.source.category if f.source else ""
        out.source_url = f.source.url if f.source else ""
        recent_out.append(out)

    last_log = db.query(ScrapeLog).order_by(ScrapeLog.started_at.desc()).first()
    last_scan = None
    if last_log:
        last_scan = ScrapeLogOut.model_validate(last_log)
        last_scan.source_title = last_log.source.title if last_log.source else ""

    return DashboardStats(
        total_sources=total_sources,
        total_findings=total_findings,
        total_recommendations=total_recommendations,
        total_scrapes=total_scrapes,
        findings_last_7d=findings_last_7d,
        by_category=by_category,
        by_horizon=by_horizon,
        by_technology_type=by_technology_type,
        by_status=by_status,
        by_language=by_language,
        top_sources=top_sources,
        recent_findings=recent_out,
        last_scan=last_scan,
    )


@router.get("/workbench", response_model=WorkbenchStats)
def get_workbench(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Bandeja operativa para el tecnico: cola de trabajo y contadores por fase."""
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    findings_last_7d = (
        db.query(func.count(Finding.id)).filter(Finding.created_at >= week_ago).scalar() or 0
    )
    sources_enabled = (
        db.query(func.count(Source.id)).filter(Source.scrape_enabled == True).scalar() or 0  # noqa: E712
    )

    pending_review = db.query(func.count(Finding.id)).filter(Finding.status == "nuevo").scalar() or 0
    in_triage = db.query(func.count(Finding.id)).filter(Finding.status == "revisado").scalar() or 0
    prioritized = db.query(func.count(Finding.id)).filter(Finding.status == "priorizado").scalar() or 0
    high_priority = (
        db.query(func.count(Finding.id))
        .filter(Finding.screening_score >= SCREENING_QUEUE_THRESHOLD)
        .scalar()
        or 0
    )

    char_candidates = (
        db.query(Finding)
        .filter(Finding.status.in_(["revisado", "priorizado"]))
        .all()
    )
    needs_characterization = sum(1 for f in char_candidates if _is_incomplete_characterization(f))

    prior_rows = db.query(Finding.id).filter(Finding.status == "priorizado").all()
    prior_ids = [r[0] for r in prior_rows]
    pending_recommendations = 0
    if prior_ids:
        with_rec = (
            db.query(func.count(func.distinct(Recommendation.finding_id)))
            .filter(Recommendation.finding_id.in_(prior_ids))
            .scalar()
            or 0
        )
        pending_recommendations = max(0, len(prior_ids) - with_rec)

    queue_rows = (
        db.query(Finding)
        .filter(Finding.status.in_(["nuevo", "revisado"]))
        .order_by(Finding.screening_score.desc(), Finding.created_at.desc())
        .limit(12)
        .all()
    )
    queue = [_finding_out(db, f) for f in queue_rows]

    last_log = db.query(ScrapeLog).order_by(ScrapeLog.started_at.desc()).first()
    last_scan = None
    if last_log:
        last_scan = ScrapeLogOut.model_validate(last_log)
        last_scan.source_title = last_log.source.title if last_log.source else ""

    # --- Contexto metodologico: staging y ciclo activo (fases 1 y 2) --------- #
    staging_unassigned = (
        db.query(func.count(Technology.id))
        .filter(Technology.status == "capturada_no_asignada")
        .scalar()
        or 0
    )

    cycle = cycle_service.get_active_cycle(db)
    my_criteria = rateable_criteria(user)
    cycle_pending_rating = 0
    cycle_pending_for_me = 0
    cycle_prioritized = 0
    cycle_watchlist = 0

    if cycle is not None:
        summary = cycle_service.cycle_summary(db, cycle)
        cycle_prioritized = summary["prioritized"]
        cycle_watchlist = summary["watchlist"]

        backlog = rating_backlog(db, cycle, user)
        cycle_pending_rating = backlog["incomplete"]
        cycle_pending_for_me = len(backlog["pending_for_me"])

    return WorkbenchStats(
        pending_review=pending_review,
        in_triage=in_triage,
        prioritized=prioritized,
        high_priority=high_priority,
        needs_characterization=needs_characterization,
        pending_recommendations=pending_recommendations,
        findings_last_7d=findings_last_7d,
        sources_enabled=sources_enabled,
        last_scan=last_scan,
        queue=queue,
        active_cycle_id=cycle.id if cycle else None,
        active_cycle_code=cycle.code if cycle else "",
        active_cycle_status=cycle.status if cycle else "",
        active_cycle_status_label=(
            CYCLE_STATUS_LABELS.get(cycle.status, cycle.status) if cycle else ""
        ),
        staging_unassigned=staging_unassigned,
        cycle_pending_rating=cycle_pending_rating,
        cycle_pending_for_me=cycle_pending_for_me,
        cycle_prioritized=cycle_prioritized,
        cycle_watchlist=cycle_watchlist,
        my_criteria=my_criteria,
    )


# =========================================================================== #
#  Bandeja por perfil (frente C): "que me toca hoy"
# =========================================================================== #
# Estados en los que la tecnologia admite calificacion P1-P6 (fase 2).
RATEABLE_STATUSES = ("filtrada_apta_priorizacion", "priorizada", "bajo_vigilancia", "no_priorizada")
# Expedientes que alguien del equipo esta redactando o corrigiendo.
DRAFT_DOC_STATUSES = ("borrador", "con_observaciones")
# Revisiones por pares que aun esperan al revisor.
PENDING_REVIEW_STATUSES = ("invitado", "invitacion_enviada", "en_lectura")
# Estados sin accion pendiente: la cola de trabajo no los muestra.
TERMINAL_TECH_STATUSES = ("publicada", "excluida", "no_priorizada")
# Aviso de vencimiento del ciclo (fechas de corte de datos o boletin).
CYCLE_DEADLINE_WARNING_DAYS = 14
# Boletines publicados que el tomador de decisiones ve como novedad.
RECENT_BULLETIN_DAYS = 90
QUEUE_LIMIT = 12
SAMPLE_LIMIT = 5

# Bloques de la bandeja por perfil. Cada bloque exige ademas su permiso: el
# perfil decide que se muestra y la matriz RBAC garantiza que se puede actuar.
ROLE_WORK_ITEMS: dict[str, tuple[str, ...]] = {
    rbac.SUPERADMIN: (
        "rate", "classify", "novelty", "filter_ready", "invima", "drafts", "submissions", "merges",
        "cycle_deadline", "close_blockers", "bulletins_pending",
    ),
    rbac.EVALUADOR_TECNICO: ("rate", "classify", "novelty", "filter_ready", "invima"),
    rbac.EVALUADOR_CLINICO: ("rate", "drafts"),
    rbac.TOMADOR_DECISIONES: ("bulletins_published", "alerts", "dashboard"),
    rbac.REVISOR_PARES: ("reviews",),
}
ITEM_PERMISSION: dict[str, str | None] = {
    "rate": None,  # depende de los criterios que el perfil califica
    "classify": rbac.P_STAGING_ASSIGN,
    "novelty": rbac.P_SCREENING_WRITE,
    "filter_ready": rbac.P_SCREENING_WRITE,
    "invima": rbac.P_INVIMA_SYNC,
    "drafts": rbac.P_REPORT_WRITE,
    "submissions": rbac.P_STAGING_ASSIGN,
    "merges": rbac.P_SCREENING_WRITE,
    "cycle_deadline": rbac.P_CYCLE_WRITE,
    "close_blockers": rbac.P_CYCLE_CLOSE,
    "bulletins_pending": rbac.P_CYCLE_WRITE,
    "bulletins_published": rbac.P_READ,
    "alerts": rbac.P_READ,
    "dashboard": rbac.P_READ,
    "reviews": rbac.P_REVIEW_SUBMIT,
}


class WorkSample(BaseModel):
    id: int
    name: str
    to: str
    detail: str = ""


class WorkItem(BaseModel):
    key: str
    label: str
    count: int
    # accion: hay trabajo; aviso: riesgo o vencimiento; info: novedad; ok: al dia
    severity: str = "accion"
    to: str
    action_label: str
    help: str
    samples: list[WorkSample] = []


class QueueItem(BaseModel):
    finding_id: int
    title: str
    source_title: str = ""
    screening_score: int = 0
    status: str = ""
    horizon: str = ""
    technology_id: int | None = None
    technology_status: str = ""
    to: str
    action_label: str


class MyWorkOut(BaseModel):
    role: str
    role_label: str
    today: date
    active_cycle_id: int | None = None
    active_cycle_code: str = ""
    active_cycle_status: str = ""
    active_cycle_status_label: str = ""
    my_criteria: list[str] = []
    items: list[WorkItem] = []
    total_pending: int = 0
    queue: list[QueueItem] = []
    queue_total: int = 0


def _today() -> date:
    """Hoy en Colombia (UTC-5, sin horario de verano)."""
    return datetime.now(timezone(timedelta(hours=-5))).date()


def _name(tech: Technology | None, fallback_id: int | None = None) -> str:
    if tech is None:
        return f"Tecnología {fallback_id}" if fallback_id else "Tecnología"
    return (tech.commercial_name or tech.inn_name or f"Tecnología {tech.id}").strip()


def rating_backlog(db: Session, cycle: Cycle | None, user: User) -> dict:
    """Calificacion P1-P6 del ciclo: incompletas y pendientes para este perfil.

    Una tecnologia esta pendiente para el perfil si le falta al menos uno de
    los criterios activos que ese perfil puede calificar y no esta congelada.
    """
    if cycle is None:
        return {"incomplete": 0, "pending_for_me": [], "criteria": []}
    active_codes = {c.code for c in priority_engine.active_criteria(db)}
    mine = [code for code in rateable_criteria(user) if code in active_codes]
    entries = (
        db.query(CycleTechnology)
        .filter(
            CycleTechnology.cycle_id == cycle.id,
            CycleTechnology.status.in_(RATEABLE_STATUSES),
            CycleTechnology.frozen == False,  # noqa: E712
        )
        .order_by(CycleTechnology.id)
        .all()
    )
    rated: dict[int, set[str]] = {}
    for tech_id, criterion in (
        db.query(PriorityScore.technology_id, PriorityScore.criterion)
        .filter(PriorityScore.cycle_id == cycle.id)
        .all()
    ):
        rated.setdefault(tech_id, set()).add(criterion)
    pending = []
    if mine:
        for entry in entries:
            missing = [code for code in mine if code not in rated.get(entry.technology_id, set())]
            if missing:
                pending.append((entry, missing))
    return {
        "incomplete": sum(1 for e in entries if e.priority_pct is None),
        "pending_for_me": pending,
        "criteria": mine,
    }


def _tech_map(db: Session, ids) -> dict[int, Technology]:
    ids = [i for i in set(ids) if i is not None]
    if not ids:
        return {}
    return {t.id: t for t in db.query(Technology).filter(Technology.id.in_(ids)).all()}


def novelty_split(db: Session, cycle: Cycle) -> tuple[list[tuple[CycleTechnology, str]], list[CycleTechnology]]:
    """Asignadas al ciclo sin filtrar: (por verificar con su motivo, listas para declarar aptas).

    Usa la misma compuerta que aplica la API al declarar apta una tecnologia
    (`screening_service.novelty_gate`), de modo que la bandeja nunca promete un
    paso que la API rechazaria.
    """
    entries = (
        db.query(CycleTechnology)
        .filter(
            CycleTechnology.cycle_id == cycle.id,
            CycleTechnology.status == "asignada_a_ciclo",
            CycleTechnology.frozen == False,  # noqa: E712
        )
        .order_by(CycleTechnology.id)
        .all()
    )
    pending: list[tuple[CycleTechnology, str]] = []
    ready: list[CycleTechnology] = []
    for entry in entries:
        ok, reason = screening_service.novelty_gate(db, cycle.id, entry.technology_id)
        if ok:
            ready.append(entry)
        else:
            low = reason.lower()
            if "invima" in low and "falta cruzar" in low:
                detail = "Falta cruce con INVIMA"
            elif "falta la verificación" in low:
                detail = "Falta vía de novedad"
            else:
                detail = "Revisar vía de novedad"
            pending.append((entry, detail))
    return pending, ready


def _deadline(cycle: Cycle, today: date) -> tuple[str, int, date] | None:
    events = [("corte de datos", cycle.data_cutoff_on), ("boletín", cycle.bulletin_due_on)]
    events = [(label, when) for label, when in events if when is not None]
    if not events:
        return None
    upcoming = [(label, when) for label, when in events if when >= today]
    if upcoming:
        label, when = min(upcoming, key=lambda e: e[1])
        return label, (when - today).days, when
    label, when = max(events, key=lambda e: e[1])
    return label, (when - today).days, when


def _item_rate(db, cycle, backlog):
    criteria = backlog["criteria"]
    if not criteria:
        return None
    pending = backlog["pending_for_me"]
    techs = _tech_map(db, [e.technology_id for e, _ in pending[:SAMPLE_LIMIT]])
    return WorkItem(
        key="rate",
        label=f"{', '.join(criteria)} por calificar",
        count=len(pending),
        to="/priorizacion",
        action_label="Calificar en la matriz P1-P6",
        help=(
            f"Tecnologías del ciclo activo ({cycle.code if cycle else 'sin ciclo'}) aptas para "
            "priorización y no congeladas a las que les falta al menos uno de sus criterios "
            f"({', '.join(criteria)})."
        ),
        samples=[
            WorkSample(
                id=e.technology_id,
                name=_name(techs.get(e.technology_id), e.technology_id),
                to=f"/priorizacion?tecnologia={e.technology_id}",
                detail="Falta " + ", ".join(missing),
            )
            for e, missing in pending[:SAMPLE_LIMIT]
        ],
    )


def _item_classify(db):
    base = db.query(Technology).filter(
        Technology.status == "capturada_no_asignada",
        Technology.merged_into_id.is_(None),
        or_(Technology.cluster_id.is_(None), Technology.tech_type_id.is_(None)),
    )
    count = base.with_entities(func.count(Technology.id)).scalar() or 0
    sample = base.order_by(Technology.screening_score.desc(), Technology.id).limit(SAMPLE_LIMIT).all()

    def _detail(t: Technology) -> str:
        if not t.cluster_id and not t.tech_type_id:
            return "Sin clúster ni tipología"
        return "Sin clúster" if not t.cluster_id else "Sin tipología"

    return WorkItem(
        key="classify",
        label="Clasificaciones pendientes en la bandeja de entrada",
        count=count,
        to="/bandeja-entrada",
        action_label="Clasificar clúster y tipología",
        help=(
            "Señales capturadas, sin asignar a ciclo y no fusionadas, a las que les falta el "
            "clúster o la tipología. Sin ambos datos no se pueden asignar a un ciclo."
        ),
        samples=[
            WorkSample(id=t.id, name=_name(t), to=f"/bandeja-entrada?tecnologia={t.id}", detail=_detail(t))
            for t in sample
        ],
    )


def _item_novelty(db, cycle, split):
    if cycle is None:
        return None
    pending, _ = split
    techs = _tech_map(db, [e.technology_id for e, _ in pending[:SAMPLE_LIMIT]])
    return WorkItem(
        key="novelty",
        label="Novedad por verificar",
        count=len(pending),
        to="/filtrado",
        action_label="Verificar novedad e INVIMA",
        help=(
            f"Tecnologías asignadas al ciclo {cycle.code} que no pasan la compuerta de novedad: falta "
            "la vía de novedad, el cruce con el índice INVIMA o su justificación (RF10, RF11)."
        ),
        samples=[
            WorkSample(
                id=e.technology_id,
                name=_name(techs.get(e.technology_id), e.technology_id),
                to=f"/filtrado?tecnologia={e.technology_id}",
                detail=detail,
            )
            for e, detail in pending[:SAMPLE_LIMIT]
        ],
    )


def _item_filter_ready(db, cycle, split):
    if cycle is None:
        return None
    _, ready = split
    techs = _tech_map(db, [e.technology_id for e in ready[:SAMPLE_LIMIT]])
    return WorkItem(
        key="filter_ready",
        label="Listas para declarar aptas",
        count=len(ready),
        to="/filtrado",
        action_label="Declarar aptas o excluir",
        help=(
            f"Tecnologías asignadas al ciclo {cycle.code} con la novedad y el cruce INVIMA completos: "
            "falta decidir si pasan a priorización o se excluyen."
        ),
        samples=[
            WorkSample(
                id=e.technology_id,
                name=_name(techs.get(e.technology_id), e.technology_id),
                to=f"/filtrado?tecnologia={e.technology_id}",
            )
            for e in ready[:SAMPLE_LIMIT]
        ],
    )


def _item_invima(db):
    status = invima.index_status(db)
    if not status["stale"]:
        return None
    age = status["age_days"]
    warning = status.get("warning") or "El índice INVIMA nunca se ha sincronizado."
    if age is not None:
        warning += f" El número es la antigüedad en días (máximo {status['stale_after_days']})."
    return WorkItem(
        key="invima",
        label="Índice INVIMA desactualizado" if status["total_records"] else "Índice INVIMA vacío",
        count=int(age) if age is not None else 0,
        severity="aviso",
        to="/filtrado",
        action_label="Sincronizar el índice",
        help=warning,
    )


def _item_drafts(db):
    q = (
        db.query(EvaluationDoc)
        .join(Cycle, Cycle.id == EvaluationDoc.cycle_id)
        .filter(EvaluationDoc.status.in_(DRAFT_DOC_STATUSES), Cycle.status != "cerrado_consolidado")
    )
    count = q.with_entities(func.count(EvaluationDoc.id)).scalar() or 0
    docs = q.order_by(EvaluationDoc.updated_at.desc(), EvaluationDoc.id.desc()).limit(SAMPLE_LIMIT).all()
    techs = _tech_map(db, [d.technology_id for d in docs])
    return WorkItem(
        key="drafts",
        label="Fichas e informes en redacción",
        count=count,
        to="/evaluacion",
        action_label="Continuar la redacción",
        help=(
            "Expedientes de ciclos abiertos en borrador o devueltos con observaciones: los "
            "documentos que el equipo tiene que completar."
        ),
        samples=[
            WorkSample(
                id=d.technology_id,
                name=d.title or _name(techs.get(d.technology_id), d.technology_id),
                to=f"/evaluacion?tecnologia={d.technology_id}",
                detail=EDITORIAL_STATUS_LABELS.get(d.status, d.status),
            )
            for d in docs
        ],
    )


def _item_submissions(db):
    q = db.query(Submission).filter(Submission.status == "recibida")
    count = q.with_entities(func.count(Submission.id)).scalar() or 0
    rows = q.order_by(Submission.created_at, Submission.id).limit(SAMPLE_LIMIT).all()
    return WorkItem(
        key="submissions",
        label="Postulaciones por moderar",
        count=count,
        to="/postulaciones",
        action_label="Moderar postulaciones",
        help="Postulaciones del canal público (RF02) en estado recibida, sin aceptar ni rechazar.",
        samples=[
            WorkSample(id=r.id, name=r.commercial_name or f"Postulación {r.id}", to="/postulaciones")
            for r in rows
        ],
    )


def _item_merges(db):
    q = db.query(MergeProposal).filter(MergeProposal.status == "propuesta")
    count = q.with_entities(func.count(MergeProposal.id)).scalar() or 0
    rows = q.order_by(MergeProposal.decisive.desc(), MergeProposal.score.desc()).limit(SAMPLE_LIMIT).all()
    techs = _tech_map(db, [r.technology_a_id for r in rows] + [r.technology_b_id for r in rows])
    return WorkItem(
        key="merges",
        label="Propuestas de fusión por resolver",
        count=count,
        to="/filtrado",
        action_label="Confirmar o descartar fusiones",
        help=(
            "Pares de registros que el motor difuso propone fusionar (RF09). Ninguno se fusiona "
            "sin confirmación humana."
        ),
        samples=[
            WorkSample(
                id=r.id,
                name=(
                    f"{_name(techs.get(r.technology_a_id), r.technology_a_id)} / "
                    f"{_name(techs.get(r.technology_b_id), r.technology_b_id)}"
                ),
                to="/filtrado",
                detail=f"Similitud {float(r.score or 0):.0f}%",
            )
            for r in rows
        ],
    )


def _item_deadline(cycle, today):
    if cycle is None:
        return None
    info = _deadline(cycle, today)
    if info is None:
        return None
    label, days, when = info
    if days > CYCLE_DEADLINE_WARNING_DAYS:
        return None
    name = cycle.code if cycle.code.lower().startswith("ciclo") else f"Ciclo {cycle.code}"
    text = (
        f"{name}: {label} vencido hace {abs(days)} día(s)"
        if days < 0
        else (f"{name}: {label} hoy" if days == 0 else f"{name}: {label} en {days} día(s)")
    )
    return WorkItem(
        key="cycle_deadline",
        label=text,
        count=abs(days),
        severity="aviso",
        to="/ciclos",
        action_label="Revisar el ciclo",
        help=(
            f"Fecha de {label}: {when.isoformat()}. Se avisa desde {CYCLE_DEADLINE_WARNING_DAYS} días "
            "antes. El número son los días que faltan (o que ya pasaron)."
        ),
    )


def _item_close_blockers(db, cycle):
    if cycle is None:
        return None
    blocking = cycle_service.blocking_entries(db, cycle)
    techs = _tech_map(db, [e.technology_id for e in blocking[:SAMPLE_LIMIT]])
    return WorkItem(
        key="close_blockers",
        label="Bloqueos para cerrar el ciclo",
        count=len(blocking),
        severity="aviso" if blocking else "ok",
        to="/ciclos",
        action_label="Ver bloqueos de cierre",
        help=(
            f"Tecnologías del ciclo {cycle.code} en evaluación sin informe publicado ni justificación "
            "de cierre. Mientras existan, el ciclo no se puede cerrar."
        ),
        samples=[
            WorkSample(
                id=e.technology_id,
                name=_name(techs.get(e.technology_id), e.technology_id),
                to=f"/evaluacion?tecnologia={e.technology_id}",
            )
            for e in blocking[:SAMPLE_LIMIT]
        ],
    )


def _item_bulletins_pending(db):
    q = db.query(Bulletin).filter(Bulletin.status == "pendiente_aprobacion")
    count = q.with_entities(func.count(Bulletin.id)).scalar() or 0
    rows = q.order_by(Bulletin.created_at.desc(), Bulletin.id.desc()).limit(SAMPLE_LIMIT).all()
    return WorkItem(
        key="bulletins_pending",
        label="Boletines por aprobar",
        count=count,
        to="/boletines",
        action_label="Aprobar y publicar",
        help="Boletines compilados al cierre que esperan el visto del líder antes de publicarse (RF19).",
        samples=[WorkSample(id=r.id, name=r.title or f"Boletín {r.id}", to="/boletines") for r in rows],
    )


def _item_bulletins_published(db):
    since = datetime.now(timezone.utc) - timedelta(days=RECENT_BULLETIN_DAYS)
    q = db.query(Bulletin).filter(Bulletin.status == "publicado", Bulletin.published_at >= since)
    count = q.with_entities(func.count(Bulletin.id)).scalar() or 0
    rows = q.order_by(Bulletin.published_at.desc(), Bulletin.id.desc()).limit(SAMPLE_LIMIT).all()
    return WorkItem(
        key="bulletins_published",
        label="Boletines publicados recientemente",
        count=count,
        severity="info",
        to="/boletines",
        action_label="Leer boletines",
        help=f"Boletines epidemiológicos y financieros publicados en los últimos {RECENT_BULLETIN_DAYS} días.",
        samples=[WorkSample(id=r.id, name=r.title or f"Boletín {r.id}", to="/boletines") for r in rows],
    )


def _item_alerts(db, user):
    q = db.query(AlertEvent).filter(AlertEvent.user_id == user.id, AlertEvent.read_at.is_(None))
    count = q.with_entities(func.count(AlertEvent.id)).scalar() or 0
    rows = q.order_by(AlertEvent.created_at.desc(), AlertEvent.id.desc()).limit(SAMPLE_LIMIT).all()
    return WorkItem(
        key="alerts",
        label="Alertas sin leer",
        count=count,
        severity="aviso" if count else "ok",
        to="/alertas",
        action_label="Revisar alertas",
        help=(
            "Alertas tempranas de sus suscripciones (cambio de fase en tecnologías de alto riesgo "
            "presupuestal, nuevo ensayo fase III en el país) que aún no marca como leídas."
        ),
        samples=[WorkSample(id=r.id, name=r.title or "Alerta", to="/alertas") for r in rows],
    )


def _item_dashboard(db):
    latest = (
        db.query(Cycle)
        .filter(Cycle.is_historic == False, Cycle.status == "cerrado_consolidado")  # noqa: E712
        .order_by(Cycle.closed_at.desc(), Cycle.opened_on.desc(), Cycle.id.desc())
        .first()
    )
    prioritized = 0
    if latest is not None:
        prioritized = (
            db.query(func.count(CycleTechnology.id))
            .filter(
                CycleTechnology.cycle_id == latest.id,
                CycleTechnology.status.in_(("priorizada", "en_evaluacion", "publicada")),
            )
            .scalar()
            or 0
        )
    return WorkItem(
        key="dashboard",
        label=f"Priorizadas del último ciclo cerrado ({latest.code})" if latest else "Tablero estratégico",
        count=int(prioritized),
        severity="info",
        to="/dashboards",
        action_label="Abrir el tablero estratégico",
        help=(
            "Tecnologías priorizadas (incluidas las que pasaron a evaluación o se publicaron) en el "
            "último ciclo cerrado. El tablero muestra embudo, time-to-market e impacto presupuestal."
        ),
    )


def _item_reviews(db, user):
    email = (user.email or "").strip().lower()
    q = (
        db.query(ReviewAssignment)
        .join(EvaluationDoc, EvaluationDoc.id == ReviewAssignment.doc_id)
        .filter(
            or_(
                ReviewAssignment.reviewer_user_id == user.id,
                func.lower(ReviewAssignment.reviewer_email) == email,
            ),
            ReviewAssignment.status.in_(PENDING_REVIEW_STATUSES),
            EvaluationDoc.status != "publicado",
        )
    )
    count = q.with_entities(func.count(ReviewAssignment.id)).scalar() or 0
    rows = q.order_by(ReviewAssignment.created_at, ReviewAssignment.id).limit(SAMPLE_LIMIT).all()
    docs = (
        {d.id: d for d in db.query(EvaluationDoc).filter(EvaluationDoc.id.in_([r.doc_id for r in rows])).all()}
        if rows
        else {}
    )
    return WorkItem(
        key="reviews",
        label="Revisiones asignadas",
        count=count,
        to="/evaluacion",
        action_label="Revisar documentos",
        help=(
            "Revisiones por pares a su nombre que aún no envía (invitado o en lectura), de documentos "
            "no publicados."
        ),
        samples=[
            WorkSample(
                id=r.doc_id,
                name=(docs[r.doc_id].title if r.doc_id in docs else "") or f"Documento {r.doc_id}",
                to="/evaluacion",
                detail="COI firmado" if r.coi_signed else "Falta firmar COI",
            )
            for r in rows
        ],
    )


def build_my_work(db: Session, user: User, *, today: date | None = None) -> dict:
    today = today or _today()
    role = rbac.canonical_role(user.role)
    cycle = cycle_service.get_active_cycle(db)
    backlog = rating_backlog(db, cycle, user)
    split_cache: dict = {}

    def split():
        if "v" not in split_cache:
            split_cache["v"] = novelty_split(db, cycle) if cycle is not None else ([], [])
        return split_cache["v"]

    builders = {
        "rate": lambda: _item_rate(db, cycle, backlog),
        "classify": lambda: _item_classify(db),
        "novelty": lambda: _item_novelty(db, cycle, split()),
        "filter_ready": lambda: _item_filter_ready(db, cycle, split()),
        "invima": lambda: _item_invima(db),
        "drafts": lambda: _item_drafts(db),
        "submissions": lambda: _item_submissions(db),
        "merges": lambda: _item_merges(db),
        "cycle_deadline": lambda: _item_deadline(cycle, today),
        "close_blockers": lambda: _item_close_blockers(db, cycle),
        "bulletins_pending": lambda: _item_bulletins_pending(db),
        "bulletins_published": lambda: _item_bulletins_published(db),
        "alerts": lambda: _item_alerts(db, user),
        "dashboard": lambda: _item_dashboard(db),
        "reviews": lambda: _item_reviews(db, user),
    }
    items: list[WorkItem] = []
    for key in ROLE_WORK_ITEMS.get(role, ()):
        perm = ITEM_PERMISSION.get(key)
        if perm is not None and not rbac.has_permission(user, perm):
            continue
        item = builders[key]()
        if item is not None:
            items.append(item)

    queue, queue_total = ([], 0)
    if rbac.has_permission(user, rbac.P_TECHNOLOGY_WRITE):
        queue, queue_total = work_queue(db)

    return {
        "role": role,
        "role_label": rbac.role_label(role),
        "today": today,
        "active_cycle_id": cycle.id if cycle else None,
        "active_cycle_code": cycle.code if cycle else "",
        "active_cycle_status": cycle.status if cycle else "",
        "active_cycle_status_label": CYCLE_STATUS_LABELS.get(cycle.status, cycle.status) if cycle else "",
        "my_criteria": backlog["criteria"],
        "items": items,
        "total_pending": sum(i.count for i in items if i.severity == "accion"),
        "queue": queue,
        "queue_total": queue_total,
    }


_QUEUE_ACTIONS = {
    None: ("/senales", "Revisar señal"),
    "capturada_no_asignada": ("/bandeja-entrada", "Clasificar y asignar"),
    "asignada_a_ciclo": ("/filtrado", "Verificar novedad"),
    "filtrada_apta_priorizacion": ("/priorizacion", "Calificar P1-P6"),
    "bajo_vigilancia": ("/priorizacion", "Recalificar"),
    "priorizada": ("/evaluacion", "Abrir expediente"),
    "en_evaluacion": ("/evaluacion", "Continuar expediente"),
}


def work_queue(db: Session, limit: int = QUEUE_LIMIT) -> tuple[list[QueueItem], int]:
    """Senales sin procesar ordenadas por cribado, con la accion que corresponde.

    Se omiten las que ya tienen desenlace (publicada, excluida, no priorizada) o
    se fusionaron en otra: ahi no queda nada que hacer.
    """
    base = (
        db.query(Finding, Technology)
        .outerjoin(Technology, Technology.finding_id == Finding.id)
        .filter(Finding.status.in_(["nuevo", "revisado"]))
        .filter(
            or_(
                Technology.id.is_(None),
                and_(
                    Technology.status.notin_(TERMINAL_TECH_STATUSES),
                    Technology.merged_into_id.is_(None),
                ),
            )
        )
    )
    total = base.with_entities(func.count(Finding.id)).scalar() or 0
    rows = (
        base.order_by(Finding.screening_score.desc(), Finding.created_at.desc(), Finding.id.desc())
        .limit(limit)
        .all()
    )
    items = []
    for finding, tech in rows:
        to, label = _QUEUE_ACTIONS.get(tech.status if tech else None, ("/senales", "Revisar señal"))
        if tech is not None and to != "/senales":
            to = f"{to}?tecnologia={tech.id}"
        items.append(
            QueueItem(
                finding_id=finding.id,
                title=finding.title or finding.technology or f"Señal {finding.id}",
                source_title=finding.source.title if finding.source else "",
                screening_score=int(finding.screening_score or 0),
                status=finding.status or "",
                horizon=finding.horizon or "",
                technology_id=tech.id if tech else None,
                technology_status=tech.status if tech else "",
                to=to,
                action_label=label,
            )
        )
    return items, int(total)


@router.get("/my-work", response_model=MyWorkOut)
def my_work(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Pendientes accionables del perfil que inicia sesion, con enlace a la accion."""
    return MyWorkOut(**build_my_work(db, user))
