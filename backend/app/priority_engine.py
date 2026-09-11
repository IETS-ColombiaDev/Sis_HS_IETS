"""Motor oficial de priorizacion %P (fase 2 del plan, modulo 3 de la especificacion).

Sustituye la heuristica continua por la matriz de seis criterios binarios del
Manual Metodologico:

    %P = (suma de P1..P6 / 6) * 100

Decisiones implementadas y su justificacion:

- **Clasificacion por conteo de puntos.** La especificacion define a la vez
  `%P >= 70%` y `4 a 6 puntos`; cuatro puntos equivalen a 66,67% y las dos reglas
  no pueden convivir. Se implementa por puntos (>=4 priorizada, =3 bajo
  vigilancia, <=2 no priorizada), unica lectura que produce tres franjas
  continuas, y el porcentaje se conserva como etiqueta de despliegue. Los
  umbrales viven en `methodology_params`, no en codigo, para poder corregirlos
  sin desplegar cuando la coordinacion cierre la decision D-02.
- **El %P no se calcula si falta un criterio.** Un puntaje parcial no es
  interpretable metodologicamente.
- **Congelacion.** Una entrada de ciclo congelada rechaza cualquier escritura.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from sqlalchemy.orm import Session

from . import audit, rbac
from .methodology import get_param
from .models import Cycle, CycleTechnology, PriorityCriterion, PriorityScore, Technology

CRITERIA_CODES = ("P1", "P2", "P3", "P4", "P5", "P6")

# Estados en los que una tecnologia esta sujeta a calificacion. Antes del filtro
# de novedad (asignada_a_ciclo) no entra a la matriz (criterio de exito 7), y
# desde evaluacion en adelante la calificacion ya produjo su efecto: reabrirla
# devolveria el estado a "priorizada" y sacaria la tecnologia de evaluacion.
RATEABLE_STATUSES = ("filtrada_apta_priorizacion", "priorizada", "bajo_vigilancia", "no_priorizada")


class PriorityRuleError(ValueError):
    """Violacion de una regla del motor de priorizacion."""


# --------------------------------------------------------------------------- #
#  Catalogo de criterios
# --------------------------------------------------------------------------- #
def active_criteria(db: Session) -> list[PriorityCriterion]:
    return (
        db.query(PriorityCriterion)
        .filter(PriorityCriterion.is_active == True)  # noqa: E712
        .order_by(PriorityCriterion.sort_order)
        .all()
    )


def criteria_total(db: Session) -> int:
    return int(get_param(db, "priority.criteria_total", 6) or 6)


# --------------------------------------------------------------------------- #
#  Clasificacion
# --------------------------------------------------------------------------- #
def classify(db: Session, points: int) -> str:
    prioritized_at = int(get_param(db, "priority.points_prioritized", 4) or 4)
    watch_at = int(get_param(db, "priority.points_watch", 3) or 3)
    if points >= prioritized_at:
        return "priorizada"
    if points >= watch_at:
        return "bajo_vigilancia"
    return "no_priorizada"


def compute_percentage(points: int, total: int) -> float:
    if total <= 0:
        return 0.0
    return round((points / total) * 100, 2)


# --------------------------------------------------------------------------- #
#  Lectura del estado de calificacion
# --------------------------------------------------------------------------- #
def get_scores(db: Session, cycle_id: int, technology_id: int) -> dict[str, PriorityScore]:
    rows = (
        db.query(PriorityScore)
        .filter(
            PriorityScore.cycle_id == cycle_id,
            PriorityScore.technology_id == technology_id,
        )
        .all()
    )
    return {row.criterion: row for row in rows}


def evaluation_state(db: Session, cycle_id: int, technology_id: int) -> dict:
    total = criteria_total(db)
    scores = get_scores(db, cycle_id, technology_id)
    codes = [c.code for c in active_criteria(db)] or list(CRITERIA_CODES)
    missing = [code for code in codes if code not in scores]
    points = sum(int(s.value) for s in scores.values())
    complete = not missing
    return {
        "complete": complete,
        "missing": missing,
        "rated": len(scores),
        "total_criteria": total,
        "points": points if complete else None,
        "priority_pct": compute_percentage(points, total) if complete else None,
        "classification": classify(db, points) if complete else None,
    }


# --------------------------------------------------------------------------- #
#  Pre-llenado automatico de P1, P5 y P6
# --------------------------------------------------------------------------- #
def _months_ago(value: date | None, months: int) -> bool:
    if not value:
        return False
    cutoff = datetime.now(timezone.utc).date() - timedelta(days=months * 30)
    return value >= cutoff


def suggest_values(db: Session, tech: Technology) -> dict[str, dict]:
    """Sugerencias para los criterios marcados como `auto_prefill`.

    Se presentan siempre como propuesta: el evaluador confirma o corrige, y la
    confirmacion humana es la que queda registrada como calificacion.
    """
    suggestions: dict[str, dict] = {}

    # P1: novedad en el pais. Sin registro INVIMA conocido se propone "si".
    # La verificacion automatica contra INVIMA llega en la fase 3.
    has_registry = bool((tech.invima_registry or "").strip())
    suggestions["P1"] = {
        "value": 0 if has_registry else 1,
        "reason": (
            f"Registro sanitario registrado en el sistema: {tech.invima_registry}"
            if has_registry
            else "Sin registro sanitario colombiano en el sistema. Pendiente de verificación "
            "automática contra INVIMA (fase 3)."
        ),
    }

    # P5: aprobacion FDA o EMA en los ultimos 12 meses.
    fda_recent = _months_ago(tech.fda_approval_date, 12)
    ema_recent = _months_ago(tech.ema_approval_date, 12)
    if tech.fda_approval_date or tech.ema_approval_date:
        agencies = []
        if fda_recent:
            agencies.append(f"FDA {tech.fda_approval_date}")
        if ema_recent:
            agencies.append(f"EMA {tech.ema_approval_date}")
        suggestions["P5"] = {
            "value": 1 if (fda_recent or ema_recent) else 0,
            "reason": (
                "Aprobación reciente: " + ", ".join(agencies)
                if agencies
                else "Aprobación registrada con más de 12 meses de antigüedad."
            ),
        }
    else:
        suggestions["P5"] = {
            "value": 0,
            "reason": "Sin fechas de aprobación FDA o EMA capturadas.",
        }

    # P6: tramite regulatorio formal en curso (6 meses o menos).
    regulatory = (tech.regulatory_status or "").lower()
    in_process = any(
        token in regulatory
        for token in ("sometid", "submitted", "under review", "en revision", "tramite", "filing", "bla", "nda", "maa")
    )
    suggestions["P6"] = {
        "value": 1 if in_process else 0,
        "reason": (
            f"Estado regulatorio declarado: {tech.regulatory_status}"
            if regulatory
            else "Sin estado de trámite regulatorio capturado."
        ),
    }

    return suggestions


# --------------------------------------------------------------------------- #
#  Escritura de calificaciones
# --------------------------------------------------------------------------- #
def _entry(db: Session, cycle_id: int, technology_id: int) -> CycleTechnology:
    entry = (
        db.query(CycleTechnology)
        .filter(
            CycleTechnology.cycle_id == cycle_id,
            CycleTechnology.technology_id == technology_id,
        )
        .first()
    )
    if entry is None:
        raise PriorityRuleError("La tecnología no está asignada a este ciclo.")
    return entry


def rate_criterion(
    db: Session,
    *,
    cycle_id: int,
    technology_id: int,
    criterion: str,
    value: int,
    user,
    justification: str = "",
) -> dict:
    """Registra la calificacion de un criterio con control de acceso por campo."""
    code = (criterion or "").upper().strip()
    if code not in CRITERIA_CODES:
        raise PriorityRuleError(f"Criterio desconocido: {criterion}")
    if value not in (0, 1):
        raise PriorityRuleError("La calificación debe ser binaria (0 o 1).")

    entry = _entry(db, cycle_id, technology_id)
    if entry.frozen:
        raise PriorityRuleError(
            "Los puntajes de este ciclo están congelados. Una reevaluación debe hacerse "
            "en un ciclo posterior, generando un registro nuevo."
        )
    if entry.status == "excluida":
        raise PriorityRuleError("La tecnología fue excluida en el filtrado y no se califica.")
    if entry.status == "asignada_a_ciclo":
        raise PriorityRuleError(
            "La tecnología aún no pasa el filtrado: registre la verificación de novedad "
            "y márquela como apta en Filtrado y depuración antes de calificarla (RF10)."
        )
    if entry.status not in RATEABLE_STATUSES:
        raise PriorityRuleError(
            "La tecnología ya pasó a evaluación temprana; su calificación quedó fija "
            "para este ciclo."
        )

    if not rbac.can_rate(user, code):
        raise PermissionError(
            f"El perfil '{rbac.role_label(user.role)}' no califica el criterio {code}."
        )

    catalog = {c.code: c for c in active_criteria(db)}
    version = catalog[code].version if code in catalog else 1

    existing = (
        db.query(PriorityScore)
        .filter(
            PriorityScore.cycle_id == cycle_id,
            PriorityScore.technology_id == technology_id,
            PriorityScore.criterion == code,
        )
        .first()
    )
    if existing:
        existing.value = value
        existing.justification = justification
        existing.rated_by = getattr(user, "id", None)
        existing.rated_by_email = getattr(user, "email", "")
        existing.rated_at = datetime.now(timezone.utc)
        existing.criterion_version = version
    else:
        db.add(
            PriorityScore(
                cycle_id=cycle_id,
                technology_id=technology_id,
                criterion=code,
                criterion_version=version,
                value=value,
                justification=justification,
                rated_by=getattr(user, "id", None),
                rated_by_email=getattr(user, "email", ""),
            )
        )

    db.flush()
    return recalculate(db, cycle_id, technology_id, actor=getattr(user, "email", ""))


def recalculate(db: Session, cycle_id: int, technology_id: int, *, actor: str = "") -> dict:
    """Recalcula %P y aplica la transicion de estado cuando estan los 6 criterios."""
    entry = _entry(db, cycle_id, technology_id)
    state = evaluation_state(db, cycle_id, technology_id)

    if not state["complete"]:
        entry.priority_pct = None
        entry.priority_points = None
        db.commit()
        return state

    previous = {
        "status": entry.status,
        "priority_pct": float(entry.priority_pct) if entry.priority_pct is not None else None,
    }
    entry.priority_points = state["points"]
    entry.priority_pct = state["priority_pct"]
    entry.status = state["classification"]

    tech = db.get(Technology, technology_id)
    if tech is not None:
        tech.status = state["classification"]
        if previous["status"] != entry.status:
            # RF20: el cambio de franja de una tecnologia de alto riesgo
            # presupuestal avisa a los suscriptores de su cluster.
            from . import strategy_service

            db.flush()
            strategy_service.watch_technology(
                db,
                tech,
                previous_phase=tech.development_phase or "",
                previous_status=previous["status"],
            )

    audit.record_action(
        db,
        entity_type="cycle_technologies",
        entity_id=entry.id,
        action="priority:classify",
        old_value=previous,
        new_value={
            "status": entry.status,
            "priority_pct": state["priority_pct"],
            "points": state["points"],
            "actor": actor,
        },
    )
    db.commit()
    return state
