"""Filtrado del ciclo: fusion, novedad y Listado Unico (RF09 a RF12, fase 3).

Reune las tres funciones del modulo 2 sobre el acervo ya asignado al ciclo:
depurar duplicados, verificar que la tecnologia sea realmente nueva para el
pais y consolidar la salida por cluster.

La regla que ordena todo el modulo es una sola: **nada avanza a priorizacion sin
que alguien haya respondido, y dejado por escrito, por que esta tecnologia es
novedosa.** El sistema puede sugerir la respuesta cruzando el indice del INVIMA,
pero no puede darla por sentada.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from . import audit, dedup, invima
from .methodology import (
    EXCLUSION_REASONS,
    NOVELTY_OPTIONS,
    NOVELTY_REQUIRES_JUSTIFICATION,
)
from .models import (
    Cluster,
    Cycle,
    CycleTechnology,
    MergeProposal,
    NoveltyAssessment,
    TechType,
    Technology,
)


class ScreeningRuleError(ValueError):
    """Violacion de una regla del modulo de filtrado."""


def _now() -> datetime:
    return datetime.now(timezone.utc)


# --------------------------------------------------------------------------- #
#  RF09 - Desduplicacion difusa
# --------------------------------------------------------------------------- #
def scan_duplicates(db: Session, *, cycle_id: int | None = None, actor: str = "") -> dict:
    """Barre el acervo y deja las propuestas de fusion pendientes de revision.

    Es idempotente: volver a barrer no duplica propuestas ni resucita las que un
    evaluador ya descarto. Una propuesta descartada es una decision humana y el
    motor no la reabre por su cuenta.
    """
    found = dedup.find_duplicates(db, cycle_id=cycle_id)
    created = refreshed = 0

    for pair in found:
        existing = (
            db.query(MergeProposal)
            .filter(
                MergeProposal.technology_a_id == pair["technology_a_id"],
                MergeProposal.technology_b_id == pair["technology_b_id"],
            )
            .first()
        )
        if existing is None:
            db.add(
                MergeProposal(
                    technology_a_id=pair["technology_a_id"],
                    technology_b_id=pair["technology_b_id"],
                    cycle_id=cycle_id,
                    score=pair["score"],
                    decisive=pair["decisive"],
                    matched_on=pair["matched_on"],
                    detail=pair["detail"],
                    status="propuesta",
                )
            )
            created += 1
        elif existing.status == "propuesta":
            existing.score = pair["score"]
            existing.decisive = pair["decisive"]
            existing.matched_on = pair["matched_on"]
            existing.detail = pair["detail"]
            refreshed += 1

    pending = (
        db.query(func.count(MergeProposal.id))
        .filter(MergeProposal.status == "propuesta")
        .scalar()
        or 0
    )

    audit.record_action(
        db,
        entity_type="merge_proposals",
        entity_id=str(cycle_id or "global"),
        action="screening:dedup_scan",
        new_value={
            "cycle_id": cycle_id,
            "pares_detectados": len(found),
            "propuestas_nuevas": created,
            "propuestas_actualizadas": refreshed,
            "umbral": dedup.threshold(db),
            "actor": actor,
        },
    )
    db.commit()
    return {
        "detected": len(found),
        "created": created,
        "refreshed": refreshed,
        "pending": pending + created,
        "threshold": dedup.threshold(db),
    }


def confirm_merge(
    db: Session, proposal_id: int, *, keep_id: int, note: str = "", actor: str = ""
) -> MergeProposal:
    """Fusiona el par conservando un registro y marcando el otro como fusionado.

    No se borra nada. El registro absorbido conserva su fila y apunta al que
    queda vigente, porque la trazabilidad de la captura original es parte del
    expediente.
    """
    proposal = db.get(MergeProposal, proposal_id)
    if proposal is None:
        raise ScreeningRuleError("La propuesta de fusion no existe.")
    if proposal.status != "propuesta":
        raise ScreeningRuleError(
            f"La propuesta ya fue resuelta como '{proposal.status}' y no se reabre."
        )
    if keep_id not in (proposal.technology_a_id, proposal.technology_b_id):
        raise ScreeningRuleError(
            "El registro que se conserva debe ser uno de los dos de la propuesta."
        )

    drop_id = (
        proposal.technology_b_id if keep_id == proposal.technology_a_id else proposal.technology_a_id
    )
    keep = db.get(Technology, keep_id)
    drop = db.get(Technology, drop_id)
    if keep is None or drop is None:
        raise ScreeningRuleError("Alguna de las tecnologias ya no existe.")

    before = {
        "conservada": {"id": keep.id, "nct_ids": list(keep.nct_ids or [])},
        "absorbida": {"id": drop.id, "status": drop.status},
    }

    _absorb(db, keep, drop)

    drop.merged_into_id = keep.id
    drop.status = "excluida"
    _mark_entries_excluded(db, drop.id, note=f"Fusionada con la tecnologia #{keep.id}.", actor=actor)

    proposal.status = "confirmada"
    proposal.kept_technology_id = keep.id
    proposal.resolution_note = note
    proposal.resolved_by = actor
    proposal.resolved_at = _now()

    audit.record_action(
        db,
        entity_type="technologies",
        entity_id=str(keep.id),
        action="screening:merge_confirmed",
        old_value=before,
        new_value={
            "conservada": keep.id,
            "absorbida": drop.id,
            "score": float(proposal.score or 0),
            "matched_on": list(proposal.matched_on or []),
            "nota": note,
            "actor": actor,
        },
    )
    db.commit()
    db.refresh(proposal)
    return proposal


def _absorb(db: Session, keep: Technology, drop: Technology) -> None:
    """Traslada al registro que se conserva los datos que solo tenia el otro.

    La fusion no puede perder informacion: si el duplicado traia el NCT, el ATC
    o la fecha de aprobacion que faltaban, esos datos pasan al superviviente.
    """
    merged_nct = list(dict.fromkeys([*(keep.nct_ids or []), *(drop.nct_ids or [])]))
    keep.nct_ids = merged_nct
    keep.icd10_codes = list(
        dict.fromkeys([*(keep.icd10_codes or []), *(drop.icd10_codes or [])])
    )
    keep.mesh_terms = list(dict.fromkeys([*(keep.mesh_terms or []), *(drop.mesh_terms or [])]))

    for field in (
        "commercial_name", "inn_name", "manufacturer", "indication", "mechanism",
        "summary", "url", "atc_code", "device_nomenclature", "invima_registry",
        "regulatory_status", "development_phase", "condition", "horizon",
    ):
        if not getattr(keep, field, "") and getattr(drop, field, ""):
            setattr(keep, field, getattr(drop, field))

    for field in ("phase3_completion_date", "fda_approval_date", "ema_approval_date"):
        if getattr(keep, field) is None and getattr(drop, field) is not None:
            setattr(keep, field, getattr(drop, field))

    for field in ("cluster_id", "tech_type_id", "source_id"):
        if getattr(keep, field) is None and getattr(drop, field) is not None:
            setattr(keep, field, getattr(drop, field))

    keep.screening_score = max(keep.screening_score or 0, drop.screening_score or 0)


def _mark_entries_excluded(db: Session, technology_id: int, *, note: str, actor: str) -> None:
    entries = (
        db.query(CycleTechnology)
        .filter(
            CycleTechnology.technology_id == technology_id,
            CycleTechnology.frozen == False,  # noqa: E712
        )
        .all()
    )
    for entry in entries:
        if entry.status == "excluida":
            continue
        entry.status = "excluida"
        if not entry.exclusion_reason_code:
            entry.exclusion_reason_code = "duplicada"
            entry.exclusion_note = note
            entry.excluded_at = _now()
            entry.excluded_by = actor


def discard_merge(db: Session, proposal_id: int, *, note: str = "", actor: str = "") -> MergeProposal:
    """Marca el par como distinto. El motor no vuelve a proponerlo."""
    proposal = db.get(MergeProposal, proposal_id)
    if proposal is None:
        raise ScreeningRuleError("La propuesta de fusion no existe.")
    if proposal.status != "propuesta":
        raise ScreeningRuleError(f"La propuesta ya fue resuelta como '{proposal.status}'.")

    proposal.status = "descartada"
    proposal.resolution_note = note
    proposal.resolved_by = actor
    proposal.resolved_at = _now()

    audit.record_action(
        db,
        entity_type="merge_proposals",
        entity_id=str(proposal.id),
        action="screening:merge_discarded",
        new_value={
            "par": [proposal.technology_a_id, proposal.technology_b_id],
            "score": float(proposal.score or 0),
            "nota": note,
            "actor": actor,
        },
    )
    db.commit()
    db.refresh(proposal)
    return proposal


# --------------------------------------------------------------------------- #
#  RF10 y RF11 - Criterio de novedad con verificacion regulatoria
# --------------------------------------------------------------------------- #
def get_assessment(db: Session, cycle_id: int, technology_id: int) -> NoveltyAssessment | None:
    return (
        db.query(NoveltyAssessment)
        .filter(
            NoveltyAssessment.cycle_id == cycle_id,
            NoveltyAssessment.technology_id == technology_id,
        )
        .first()
    )


def run_invima_check(
    db: Session, cycle_id: int, technology_id: int, *, actor: str = ""
) -> NoveltyAssessment:
    """Cruza la tecnologia con el indice local y guarda el resultado.

    El resultado se persiste con su fecha porque es la evidencia de que la
    verificacion se hizo, y con que estado del indice se hizo.
    """
    tech = db.get(Technology, technology_id)
    if tech is None:
        raise ScreeningRuleError("La tecnologia no existe.")

    result = invima.check_technology(db, tech)
    assessment = get_assessment(db, cycle_id, technology_id)
    if assessment is None:
        assessment = NoveltyAssessment(cycle_id=cycle_id, technology_id=technology_id)
        db.add(assessment)

    best = result.get("best")
    assessment.invima_checked_at = _now()
    assessment.invima_match_count = result["match_count"]
    assessment.invima_best_score = result["best_score"]
    assessment.has_valid_registry = result["has_valid_registry"]
    if best:
        record = best["record"]
        assessment.invima_registry = record.registro or record.expediente
        assessment.invima_holder = record.titular
        assessment.invima_status = record.estado_registro
    else:
        assessment.invima_registry = ""
        assessment.invima_holder = ""
        assessment.invima_status = ""

    audit.record_action(
        db,
        entity_type="novelty_assessments",
        entity_id=f"{cycle_id}:{technology_id}",
        action="screening:invima_check",
        new_value={
            "coincidencias": result["match_count"],
            "mejor_puntaje": result["best_score"],
            "registro_vigente": result["has_valid_registry"],
            "indice_desactualizado": result["index"]["stale"],
            "actor": actor,
        },
    )
    db.commit()
    db.refresh(assessment)
    return assessment


def save_novelty(
    db: Session,
    cycle_id: int,
    technology_id: int,
    *,
    option_code: str,
    justification: str = "",
    sala_concept: str = "",
    sala_ref: str = "",
    actor: str = "",
) -> NoveltyAssessment:
    """Registra la via de novedad elegida por el evaluador."""
    if option_code not in NOVELTY_OPTIONS:
        raise ScreeningRuleError(
            f"Opcion de novedad invalida. Opciones: {', '.join(NOVELTY_OPTIONS)}."
        )

    entry = (
        db.query(CycleTechnology)
        .filter(
            CycleTechnology.cycle_id == cycle_id,
            CycleTechnology.technology_id == technology_id,
        )
        .first()
    )
    if entry is None:
        raise ScreeningRuleError("La tecnologia no esta asignada a este ciclo.")
    if entry.frozen:
        raise ScreeningRuleError("El ciclo esta congelado: la verificacion no se modifica.")

    assessment = get_assessment(db, cycle_id, technology_id)
    if assessment is None:
        assessment = NoveltyAssessment(cycle_id=cycle_id, technology_id=technology_id)
        db.add(assessment)

    text = (justification or "").strip()
    if option_code in NOVELTY_REQUIRES_JUSTIFICATION and len(text) < 20:
        raise ScreeningRuleError(
            "Esta via de novedad exige justificacion explicita de al menos 20 caracteres."
        )
    if assessment.has_valid_registry and option_code == "no_disponible_en_pais":
        raise ScreeningRuleError(
            "El indice del INVIMA reporta registro sanitario vigente: no puede "
            "declararse no disponible en el pais. Elija la via de novedad que "
            "corresponda y justifiquela."
        )

    before = {"option_code": assessment.option_code, "justification": assessment.justification}
    assessment.option_code = option_code
    assessment.justification = text
    assessment.sala_especializada_concept = (sala_concept or "").strip()
    assessment.sala_especializada_ref = (sala_ref or "").strip()
    assessment.assessed_by = actor
    assessment.assessed_at = _now()

    audit.record_action(
        db,
        entity_type="novelty_assessments",
        entity_id=f"{cycle_id}:{technology_id}",
        action="screening:novelty_saved",
        old_value=before,
        new_value={
            "option_code": option_code,
            "justification": text,
            "registro_vigente": assessment.has_valid_registry,
            "actor": actor,
        },
    )
    db.commit()
    db.refresh(assessment)
    return assessment


def novelty_gate(db: Session, cycle_id: int, technology_id: int) -> tuple[bool, str]:
    """Decide si la tecnologia puede pasar a `filtrada_apta_priorizacion`.

    Implementa el criterio de aceptacion de la fase 3: una tecnologia con
    registro sanitario vigente en Colombia no avanza sin justificacion explicita
    de nueva indicacion, nueva forma farmaceutica o combinacion.
    """
    assessment = get_assessment(db, cycle_id, technology_id)
    if assessment is None or not assessment.option_code:
        return False, (
            "Falta la verificacion del criterio de novedad (RF10). Registre la "
            "via de novedad antes de calificar la tecnologia como apta."
        )
    if assessment.invima_checked_at is None:
        return False, (
            "Falta cruzar la tecnologia con el indice de registros sanitarios "
            "del INVIMA (RF11)."
        )
    if assessment.has_valid_registry and assessment.option_code == "no_disponible_en_pais":
        return False, (
            "La tecnologia tiene registro sanitario vigente y la via de novedad "
            "declarada la contradice."
        )
    if (
        assessment.option_code in NOVELTY_REQUIRES_JUSTIFICATION
        and len((assessment.justification or "").strip()) < 20
    ):
        return False, "La via de novedad declarada exige justificacion explicita."
    return True, ""


# --------------------------------------------------------------------------- #
#  RF12 - Listado Unico por Cluster
# --------------------------------------------------------------------------- #
# Estados que representan acervo depurado y vigente del ciclo. Lo excluido no
# entra al Listado Unico, que es justamente su proposito.
UNIQUE_LIST_STATUSES = (
    "filtrada_apta_priorizacion",
    "priorizada",
    "bajo_vigilancia",
    "no_priorizada",
    "en_evaluacion",
    "publicada",
)


def unique_list(db: Session, cycle_id: int) -> dict:
    """Consolida el acervo depurado del ciclo, agrupado por cluster (RF12)."""
    cycle = db.get(Cycle, cycle_id)
    if cycle is None:
        raise ScreeningRuleError("El ciclo no existe.")

    rows = (
        db.query(CycleTechnology, Technology)
        .join(Technology, Technology.id == CycleTechnology.technology_id)
        .filter(
            CycleTechnology.cycle_id == cycle_id,
            CycleTechnology.status.in_(UNIQUE_LIST_STATUSES),
            Technology.merged_into_id.is_(None),
        )
        .all()
    )

    clusters = {c.id: c for c in db.query(Cluster).all()}
    tech_types = {t.id: t for t in db.query(TechType).all()}

    grouped: dict[str, dict] = {}
    for entry, tech in rows:
        cluster = clusters.get(tech.cluster_id)
        code = cluster.code if cluster else "sin_cluster"
        name = cluster.name if cluster else "Sin cluster asignado"
        bucket = grouped.setdefault(
            code,
            {"cluster_code": code, "cluster_name": name, "items": [], "count": 0},
        )
        tech_type = tech_types.get(tech.tech_type_id)
        bucket["items"].append(
            {
                "technology_id": tech.id,
                "commercial_name": tech.commercial_name,
                "inn_name": tech.inn_name,
                "manufacturer": tech.manufacturer,
                "tech_type_name": tech_type.name if tech_type else "",
                "condition": tech.condition,
                "atc_code": tech.atc_code,
                "icd10_codes": list(tech.icd10_codes or []),
                "nct_ids": list(tech.nct_ids or []),
                "status": entry.status,
                "priority_pct": float(entry.priority_pct) if entry.priority_pct is not None else None,
                "invima_registry": tech.invima_registry,
            }
        )
        bucket["count"] += 1

    for bucket in grouped.values():
        bucket["items"].sort(key=lambda i: (i["inn_name"] or i["commercial_name"] or "").lower())

    excluded = (
        db.query(func.count(CycleTechnology.id))
        .filter(CycleTechnology.cycle_id == cycle_id, CycleTechnology.status == "excluida")
        .scalar()
        or 0
    )
    merged = (
        db.query(func.count(Technology.id)).filter(Technology.merged_into_id.isnot(None)).scalar()
        or 0
    )

    ordered = sorted(grouped.values(), key=lambda g: (-g["count"], g["cluster_name"]))
    return {
        "cycle_id": cycle.id,
        "cycle_code": cycle.code,
        "cycle_status": cycle.status,
        "frozen": cycle.status == "cerrado_consolidado",
        "generated_at": _now(),
        "total": sum(g["count"] for g in ordered),
        "excluded_count": excluded,
        "merged_count": merged,
        "clusters": ordered,
    }


def screening_stats(db: Session, cycle_id: int | None) -> dict:
    """Indicadores del embudo de depuracion del ciclo."""
    pending = (
        db.query(func.count(MergeProposal.id))
        .filter(MergeProposal.status == "propuesta")
        .scalar()
        or 0
    )
    confirmed = (
        db.query(func.count(MergeProposal.id))
        .filter(MergeProposal.status == "confirmada")
        .scalar()
        or 0
    )

    assigned = qualified = excluded = 0
    novelty_done = invima_done = 0
    if cycle_id is not None:
        counts = dict(
            db.query(CycleTechnology.status, func.count(CycleTechnology.id))
            .filter(CycleTechnology.cycle_id == cycle_id)
            .group_by(CycleTechnology.status)
            .all()
        )
        assigned = counts.get("asignada_a_ciclo", 0)
        qualified = counts.get("filtrada_apta_priorizacion", 0)
        excluded = counts.get("excluida", 0)
        novelty_done = (
            db.query(func.count(NoveltyAssessment.id))
            .filter(
                NoveltyAssessment.cycle_id == cycle_id,
                NoveltyAssessment.option_code != "",
            )
            .scalar()
            or 0
        )
        invima_done = (
            db.query(func.count(NoveltyAssessment.id))
            .filter(
                NoveltyAssessment.cycle_id == cycle_id,
                NoveltyAssessment.invima_checked_at.isnot(None),
            )
            .scalar()
            or 0
        )

    return {
        "pending_merges": pending,
        "confirmed_merges": confirmed,
        "assigned": assigned,
        "qualified": qualified,
        "excluded": excluded,
        "novelty_assessed": novelty_done,
        "invima_checked": invima_done,
        "dedup_threshold": dedup.threshold(db),
        "invima_index": invima.index_status(db),
        "exclusion_reasons": EXCLUSION_REASONS,
    }
