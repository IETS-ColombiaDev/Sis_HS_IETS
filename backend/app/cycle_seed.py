"""Cuatro ciclos formales de 2026, sembrados una vez y verificados en cada arranque.

Elimina ciclos ambiguos (REG-*, TEST-*, Ciclo 0) y deja el ejercicio real:
I cerrado, II en evaluacion, III vigente en priorizacion, IV diseminacion publicada.
Los ciclos que crea la coordinacion y el avance de estado de los oficiales se
conservan entre arranques.
"""
from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy.orm import Session

from . import cycle_service, evaluation_service, methodology
from . import report_dossiers, strategy_service
from .models import (
    Bulletin,
    Cluster,
    Cycle,
    CycleTechnology,
    EvaluationDoc,
    EvaluationVersion,
    InvimaRecord,
    MergeProposal,
    MethodologyParam,
    Note,
    NoveltyAssessment,
    PriorityScore,
    Recommendation,
    ReviewAssignment,
    ReviewComment,
    TechType,
    Technology,
)

SEED_MARK = "[IETS-SEED-2026]"
ACTOR = "semilla-ciclos-2026"

OFFICIAL_CYCLES: tuple[dict, ...] = (
    {
        "code": "Ciclo I - 2026",
        "opened_on": date(2026, 1, 13),
        "data_cutoff_on": date(2026, 3, 24),
        "bulletin_due_on": date(2026, 4, 7),
        "status": "cerrado_consolidado",
        "notes": (
            f"{SEED_MARK} Primer ciclo formal 2026. Ventana de 12 semanas. "
            "Ejercicio cerrado: senales publicadas, bajo vigilancia y exclusiones documentadas."
        ),
    },
    {
        "code": "Ciclo II - 2026",
        "opened_on": date(2026, 4, 13),
        "data_cutoff_on": date(2026, 6, 22),
        "bulletin_due_on": date(2026, 7, 6),
        "status": "en_evaluacion",
        "notes": (
            f"{SEED_MARK} Segundo ciclo formal 2026. Recibe el monitoreo activo del Ciclo I "
            "y avanza tecnologias priorizadas a evaluacion temprana."
        ),
    },
    {
        "code": "Ciclo III - 2026",
        "opened_on": date(2026, 7, 13),
        "data_cutoff_on": date(2026, 9, 21),
        "bulletin_due_on": date(2026, 10, 5),
        "status": "en_priorizacion",
        "notes": (
            f"{SEED_MARK} Ciclo vigente. Corte de datos el 21 de septiembre y boletin "
            "proyectado el 5 de octubre. Priorizacion P1-P6 en curso."
        ),
    },
    {
        "code": "Ciclo IV - 2026",
        "opened_on": date(2026, 6, 1),
        "data_cutoff_on": date(2026, 8, 24),
        "bulletin_due_on": date(2026, 9, 7),
        "status": "cerrado_consolidado",
        "notes": (
            f"{SEED_MARK} Ciclo extraordinario de diseminacion. Embudo completo con Mini-HTA, "
            "informes y fichas sobre tecnologias reales (Lutathera NETTER-1, Scemblix ASCEMBL, "
            "pelabresib MANIFEST-2, CAR-T DLL3, farabursen, cannabidiol en X fragil). "
            "Boletin epidemiologico y financiero publicado."
        ),
    },
)

OFFICIAL_CODES = tuple(item["code"] for item in OFFICIAL_CYCLES)

SHOWCASE_TECHS: tuple[dict, ...] = (
    {
        "commercial_name": "Lutathera",
        "inn_name": "lutecio (177Lu) oxodotreotida",
        "manufacturer": "Novartis (Advanced Accelerator Applications)",
        "indication": "Tumores neuroendocrinos gastroenteropancreaticos (TNE-GEP) SSTR+",
        "mechanism": "Radioligando SSTR2 que entrega lutecio-177",
        "summary": (
            "Ensayo NETTER-1 (NEJM 2017): supervivencia libre de progresion 28,4 frente a "
            "8,4 meses. Aprobacion FDA 2018 y EMA. Extensiones NETTER-2 en curso."
        ),
        "nct_ids": ["NCT01578239", "NCT03972488"],
        "development_phase": "Autorizado / extensiones fase III",
        "horizon": "inminente",
        "url": "https://www.novartis.com/research-development",
        "cluster": "Cancer",
        "tech_type": "Medicamento quimico o biologico",
        "score": 98,
        "fda_approval_date": date(2018, 1, 26),
        "ema_approval_date": date(2017, 9, 26),
        "regulatory_status": "FDA 2018 / EMA 2017",
    },
    {
        "commercial_name": "Scemblix",
        "inn_name": "asciminib",
        "manufacturer": "Novartis",
        "indication": "Leucemia mieloide cronica Ph+ / BCR-ABL1 resistente o intolerante",
        "mechanism": "Inhibidor alosterico STAMP de ABL (bolsillo de miristoilo)",
        "summary": (
            "ASCEMBL (fase III): asciminib frente a bosutinib con superior respuesta "
            "molecular mayor a 24 semanas. FDA 2021. Extension pediatrica en pipeline."
        ),
        "nct_ids": ["NCT03106779"],
        "development_phase": "Autorizado / fase 2 pediatrica",
        "horizon": "inminente",
        "url": "https://www.novartis.com/research-development",
        "cluster": "Cancer",
        "tech_type": "Medicamento quimico o biologico",
        "score": 96,
        "fda_approval_date": date(2021, 10, 29),
        "ema_approval_date": date(2022, 8, 25),
        "regulatory_status": "FDA 2021 / EMA 2022",
    },
    {
        "commercial_name": "Pelabresib",
        "inn_name": "pelabresib",
        "manufacturer": "Novartis",
        "indication": "Mielofibrosis intermedia-2 o de alto riesgo",
        "mechanism": "Inhibidor de proteinas BET (bromodomain and extra-terminal)",
        "summary": (
            "MANIFEST-2 (fase III, combinacion con ruxolitinib): senales de reduccion "
            "de volumen esplenico y sintomas. Lectura regulatoria global pendiente."
        ),
        "nct_ids": ["NCT04603495"],
        "development_phase": "Fase III",
        "horizon": "transicional",
        "url": "https://www.novartis.com/research-development",
        "cluster": "Enfermedades de alto costo",
        "tech_type": "Medicamento quimico o biologico",
        "score": 94,
        "phase3_completion_date": date(2026, 12, 31),
        "regulatory_status": "Fase III, lectura 2026",
    },
    {
        "commercial_name": "DJI136",
        "inn_name": "CAR-T anti-DLL3",
        "manufacturer": "Novartis",
        "indication": "Cancer de pulmon de celulas pequenas en recaida",
        "mechanism": "Celulas T autologas con receptor quimerico dirigido a DLL3",
        "summary": (
            "First-in-human en pipeline Novartis 2026. Tarlatamab ya valido la via DLL3 "
            "en SCLC; DJI136 es la apuesta celular. Sin datos pivote."
        ),
        "nct_ids": [],
        "development_phase": "Fase I",
        "horizon": "emergente",
        "url": "https://www.novartis.com/research-development",
        "cluster": "Cancer",
        "tech_type": "Terapias avanzadas y genicas",
        "score": 91,
    },
    {
        "commercial_name": "Farabursen",
        "inn_name": "farabursen",
        "manufacturer": "Novartis",
        "indication": "Poliquistosis renal autosomica dominante (ADPKD)",
        "mechanism": "Inhibidor de microARN-17 (MIR17) en proliferacion quistica",
        "summary": (
            "Fase 1 en pipeline Novartis. Sin desenlace renal duro. Tolvaptan es el "
            "comparador farmacologico de referencia."
        ),
        "nct_ids": [],
        "development_phase": "Fase I",
        "horizon": "emergente",
        "url": "https://www.novartis.com/research-development",
        "cluster": "Enfermedades prevalentes",
        "tech_type": "Medicamento quimico o biologico",
        "score": 88,
    },
    {
        "commercial_name": "Cannabidiol (X fragil)",
        "inn_name": "cannabidiol",
        "manufacturer": "Ensayo clinico (ClinicalTrials.gov)",
        "indication": "Sindrome de X fragil en ninos, adolescentes y adultos jovenes",
        "mechanism": "Modulacion de la senalizacion endocannabinoide (sin THC terapeutico)",
        "summary": (
            "CONNECT-FX (NCT03614663) evaluo gel transdermico de cannabidiol (ZYN002) "
            "en X fragil. Epidiolex ya tiene via en epilepsias raras; la extrapolacion "
            "a X fragil no esta establecida."
        ),
        "nct_ids": ["NCT03614663"],
        "development_phase": "Fase II/III",
        "horizon": "transicional",
        "url": "https://clinicaltrials.gov/study/NCT03614663",
        "cluster": "Enfermedades huerfanas o raras",
        "tech_type": "Medicamento quimico o biologico",
        "score": 90,
        "phase3_completion_date": date(2022, 6, 30),
        "regulatory_status": "CONNECT-FX concluido; sin via FXS",
    },
)


def official_codes() -> tuple[str, ...]:
    return OFFICIAL_CODES


def _named(db: Session, model, name: str):
    row = db.query(model).filter(model.name == name).first()
    if row:
        return row
    return db.query(model).filter(model.is_active == True).order_by(model.sort_order).first()  # noqa: E712


def _ensure_showcase_technologies(db: Session) -> list[Technology]:
    """Garantiza las seis tecnologias reales del Ciclo IV, sin inventar NCT."""
    rows: list[Technology] = []
    for spec in SHOWCASE_TECHS:
        tech = (
            db.query(Technology)
            .filter(
                Technology.merged_into_id.is_(None),
                Technology.commercial_name == spec["commercial_name"],
            )
            .first()
        )
        if tech is None:
            tech = Technology(commercial_name=spec["commercial_name"])
            db.add(tech)
        tech.inn_name = spec["inn_name"]
        tech.manufacturer = spec["manufacturer"]
        tech.indication = spec["indication"]
        tech.mechanism = spec["mechanism"]
        tech.summary = spec["summary"]
        tech.nct_ids = list(spec.get("nct_ids") or [])
        tech.development_phase = spec["development_phase"]
        tech.horizon = spec["horizon"]
        tech.url = spec["url"]
        tech.condition = "emergente"
        tech.screening_score = spec["score"]
        tech.fda_approval_date = spec.get("fda_approval_date")
        tech.ema_approval_date = spec.get("ema_approval_date")
        tech.phase3_completion_date = spec.get("phase3_completion_date")
        tech.regulatory_status = spec.get("regulatory_status") or tech.regulatory_status
        cluster = _named(db, Cluster, spec["cluster"])
        ttype = _named(db, TechType, spec["tech_type"])
        if cluster:
            tech.cluster_id = cluster.id
        if ttype:
            tech.tech_type_id = ttype.id
        rows.append(tech)
    db.flush()
    return rows


def _restore_year_quota(db: Session) -> None:
    """Repara la cuota anual solo si quedo con un valor invalido.

    Antes la devolvia a 3 en cada arranque: un ajuste de la coordinacion
    metodologica desde Configuracion se perdia al reiniciar el servidor. Se
    conserva cualquier valor entre 1 y 5 (con ventanas de 10 semanas o mas no
    caben mas de cinco ciclos en un ano); fuera de ese rango es un residuo, por
    ejemplo el 999 que la suite de regresion pone mientras corre.
    """
    row = db.get(MethodologyParam, "cycle.max_per_year")
    if row is None:
        return
    try:
        valid = 1 <= int(str(row.value).strip()) <= 5
    except (TypeError, ValueError):
        valid = False
    if not valid:
        row.value = "3"
        db.commit()


AMBIGUOUS_PREFIXES = ("REG-", "TEST-")
HISTORIC_CODES = ("Ciclo 0 - Historico",)


def is_ambiguous(cycle: Cycle) -> bool:
    """Residuo de suites de regresion o el historico retirado; nunca un ciclo real.

    Antes se borraba TODO ciclo que no fuera uno de los cuatro oficiales de 2026:
    un "Ciclo I - 2027" creado por la coordinacion desaparecia en el siguiente
    arranque del servidor, con su trabajo.
    """
    code = (cycle.code or "").strip()
    return bool(cycle.is_historic) or code in HISTORIC_CODES or code.upper().startswith(AMBIGUOUS_PREFIXES)


def _delete_cycle_tree(db: Session, cycle_id: int) -> set[int]:
    return cycle_service.delete_cycle_tree(db, cycle_id)


def _release_technologies(db: Session, tech_ids: set[int]) -> None:
    """Las tecnologias que ya no pertenecen a ningun ciclo vuelven a la bandeja."""
    for tech_id in tech_ids:
        still = db.query(CycleTechnology.id).filter(CycleTechnology.technology_id == tech_id).first()
        tech = db.get(Technology, tech_id)
        if still is None and tech is not None and tech.merged_into_id is None:
            tech.status = "capturada_no_asignada"


def _purge_orphans(db: Session) -> int:
    """Elimina filas que apuntan a ciclos inexistentes (bases ya afectadas)."""
    from .models import CycleDatamart, TimeToMarketSnapshot

    live = {row[0] for row in db.query(Cycle.id).all()}
    removed = 0
    touched: set[int] = set()
    for model in (PriorityScore, NoveltyAssessment, CycleTechnology, TimeToMarketSnapshot, CycleDatamart):
        rows = db.query(model).filter(~model.cycle_id.in_(live)).all() if live else db.query(model).all()
        for row in rows:
            if model is CycleTechnology:
                touched.add(row.technology_id)
            db.delete(row)
            removed += 1
    if removed:
        db.flush()
        _release_technologies(db, touched)
    return removed


def _purge_ambiguous(db: Session) -> dict[str, int]:
    """Borra ciclos de regresion (REG-*, TEST-*) y el historico retirado.

    Los ciclos creados por la coordinacion (cualquier otro codigo) se conservan.
    """
    extras = [c for c in db.query(Cycle).filter(~Cycle.code.in_(OFFICIAL_CODES)).all() if is_ambiguous(c)]
    removed = 0
    touched: set[int] = set()
    for cycle in extras:
        touched |= _delete_cycle_tree(db, cycle.id)
        db.delete(cycle)
        removed += 1
    if removed:
        db.flush()
        _release_technologies(db, touched)
    orphans_removed = _purge_orphans(db)

    stale_merges = (
        db.query(MergeProposal)
        .filter(MergeProposal.cycle_id.isnot(None))
        .all()
    )
    cleared_merges = 0
    # Ids de los ciclos que siguen vivos (oficiales y los creados por la coordinacion).
    official_ids = {c.id for c in db.query(Cycle).all()}
    for row in stale_merges:
        if row.cycle_id not in official_ids:
            row.cycle_id = None
            cleared_merges += 1

    smoke_invima = (
        db.query(InvimaRecord)
        .filter(
            (InvimaRecord.expediente.ilike("%SMOKE%"))
            | (InvimaRecord.producto.ilike("%SMOKE%"))
            | (InvimaRecord.registro.ilike("%SMOKE%"))
        )
        .all()
    )
    invima_removed = 0
    for row in smoke_invima:
        db.delete(row)
        invima_removed += 1

    notes = db.query(Note).filter(Note.title.in_(("Regresion", "Regression"))).all()
    notes_removed = 0
    for row in notes:
        db.delete(row)
        notes_removed += 1

    stale_bulletins = db.query(Bulletin).all()
    bulletins_removed = 0
    for row in stale_bulletins:
        if row.cycle_id not in official_ids:
            db.delete(row)
            bulletins_removed += 1

    orphan_docs = [
        doc for doc in db.query(EvaluationDoc).all() if doc.cycle_id not in official_ids
    ]
    docs_removed = 0
    for doc in orphan_docs:
        db.query(ReviewComment).filter(ReviewComment.doc_id == doc.id).delete(synchronize_session=False)
        db.query(ReviewAssignment).filter(ReviewAssignment.doc_id == doc.id).delete(synchronize_session=False)
        db.query(EvaluationVersion).filter(EvaluationVersion.doc_id == doc.id).delete(synchronize_session=False)
        db.delete(doc)
        docs_removed += 1

    junk_recs = (
        db.query(Recommendation)
        .filter(
            (Recommendation.content.ilike("%Error al consultar Gemini%"))
            | (Recommendation.title.ilike("%Example Domain%"))
        )
        .all()
    )
    recs_removed = 0
    for row in junk_recs:
        db.delete(row)
        recs_removed += 1

    db.commit()
    return {
        "cycles_removed": removed,
        "orphans_removed": orphans_removed,
        "merges_cleared": cleared_merges,
        "invima_removed": invima_removed,
        "notes_removed": notes_removed,
        "bulletins_removed": bulletins_removed,
        "recs_removed": recs_removed,
        "docs_removed": docs_removed,
    }


def _ensure_classification(db: Session, tech: Technology) -> None:
    if tech.cluster_id is None:
        cluster = db.query(Cluster).filter(Cluster.is_active == True).order_by(Cluster.sort_order).first()  # noqa: E712
        if cluster:
            tech.cluster_id = cluster.id
    if tech.tech_type_id is None:
        ttype = db.query(TechType).filter(TechType.is_active == True).order_by(TechType.sort_order).first()  # noqa: E712
        if ttype:
            tech.tech_type_id = ttype.id
    if not tech.condition:
        tech.condition = "emergente"


def _pick_technologies(db: Session, needed: int) -> list[Technology]:
    rows = (
        db.query(Technology)
        .filter(Technology.merged_into_id.is_(None))
        .order_by(Technology.screening_score.desc(), Technology.id.asc())
        .limit(max(needed * 2, 24))
        .all()
    )
    picked: list[Technology] = []
    seen: set[str] = set()
    for tech in rows:
        key = (tech.commercial_name or tech.inn_name or str(tech.id)).strip().lower()
        if key in seen:
            continue
        seen.add(key)
        _ensure_classification(db, tech)
        if tech.cluster_id and tech.tech_type_id:
            picked.append(tech)
        if len(picked) >= needed:
            break
    db.flush()
    return picked


def _entry(db: Session, cycle: Cycle, tech: Technology, status: str, *, frozen: bool = False, carried_from: int | None = None) -> CycleTechnology:
    existing = (
        db.query(CycleTechnology)
        .filter(CycleTechnology.cycle_id == cycle.id, CycleTechnology.technology_id == tech.id)
        .first()
    )
    if existing:
        existing.status = status
        existing.frozen = frozen
        if carried_from:
            existing.carried_from_cycle_id = carried_from
        tech.status = status
        return existing
    row = CycleTechnology(
        cycle_id=cycle.id,
        technology_id=tech.id,
        status=status,
        frozen=frozen,
        carried_from_cycle_id=carried_from,
        assigned_by=ACTOR,
    )
    db.add(row)
    tech.status = status
    db.flush()
    return row


def _rate(db: Session, cycle: Cycle, tech: Technology, ones: int) -> CycleTechnology:
    ones = max(0, min(6, ones))
    for index, code in enumerate(("P1", "P2", "P3", "P4", "P5", "P6")):
        value = 1 if index < ones else 0
        score = (
            db.query(PriorityScore)
            .filter(
                PriorityScore.cycle_id == cycle.id,
                PriorityScore.technology_id == tech.id,
                PriorityScore.criterion == code,
            )
            .first()
        )
        if score is None:
            db.add(
                PriorityScore(
                    cycle_id=cycle.id,
                    technology_id=tech.id,
                    criterion=code,
                    value=value,
                    justification="Calificacion de la semilla metodologica 2026.",
                    rated_by_email=ACTOR,
                )
            )
        else:
            score.value = value
    db.flush()
    from . import priority_engine

    priority_engine.recalculate(db, cycle.id, tech.id, actor=ACTOR)
    return (
        db.query(CycleTechnology)
        .filter(CycleTechnology.cycle_id == cycle.id, CycleTechnology.technology_id == tech.id)
        .one()
    )


def _novelty(db: Session, cycle: Cycle, tech: Technology, option: str = "no_disponible_en_pais") -> None:
    row = (
        db.query(NoveltyAssessment)
        .filter(
            NoveltyAssessment.cycle_id == cycle.id,
            NoveltyAssessment.technology_id == tech.id,
        )
        .first()
    )
    if row is None:
        row = NoveltyAssessment(cycle_id=cycle.id, technology_id=tech.id)
        db.add(row)
    row.option_code = option
    row.justification = (
        "Cruce con el inventario y el criterio de novedad del Manual Metodologico. "
        "No hay registro sanitario vigente comparable en Colombia para esta senal."
    )
    row.invima_checked_at = datetime.now(timezone.utc)
    row.invima_match_count = 0
    row.has_valid_registry = False
    row.assessed_by = ACTOR


def _publish_eval(db: Session, cycle: Cycle, tech: Technology, level: str = "ficha") -> EvaluationDoc:
    dossier = report_dossiers.match_dossier(tech)
    if dossier:
        level = dossier.get("level") or level
        if dossier.get("inn") and not (tech.inn_name or "").strip():
            tech.inn_name = dossier["inn"][:400]
        if dossier.get("manufacturer") and not (tech.manufacturer or "").strip():
            tech.manufacturer = dossier["manufacturer"][:300]
    doc = evaluation_service.ensure_document(
        db, cycle.id, tech.id, actor=ACTOR, product_level=level
    )
    body = report_dossiers.body_for(tech, level)
    doc.body = body
    doc.product_level = level
    doc.title = report_dossiers.title_for(tech, level)
    doc.status = "publicado"
    doc.published_at = datetime.now(timezone.utc)
    doc.updated_by = ACTOR
    doc.version_major = 1
    doc.version_minor = 0
    entry = (
        db.query(CycleTechnology)
        .filter(CycleTechnology.cycle_id == cycle.id, CycleTechnology.technology_id == tech.id)
        .first()
    )
    if entry:
        entry.status = "publicada"
    tech.status = "publicada"
    return doc


def _upsert_cycle(db: Session, spec: dict) -> Cycle:
    cycle = db.query(Cycle).filter(Cycle.code == spec["code"]).first()
    if cycle is None:
        cycle = Cycle(code=spec["code"], year=spec["opened_on"].year, is_historic=False)
        db.add(cycle)
    cycle.year = spec["opened_on"].year
    cycle.opened_on = spec["opened_on"]
    cycle.data_cutoff_on = spec["data_cutoff_on"]
    cycle.bulletin_due_on = spec["bulletin_due_on"]
    cycle.notes = spec["notes"]
    cycle.is_historic = False
    db.flush()
    return cycle


def _already_populated(db: Session) -> bool:
    cycles = db.query(Cycle).filter(Cycle.code.in_(OFFICIAL_CODES)).all()
    if len(cycles) != len(OFFICIAL_CODES):
        return False
    by_code = {c.code: c for c in cycles}
    for spec in OFFICIAL_CYCLES:
        cycle = by_code.get(spec["code"])
        # El estado NO se compara con la semilla: la coordinacion avanza los
        # ciclos (Ciclo III de priorizacion a evaluacion) y reconstruirlos en el
        # siguiente arranque borraba ese trabajo y devolvia el estado.
        if cycle is None:
            return False
        count = (
            db.query(CycleTechnology)
            .filter(CycleTechnology.cycle_id == cycle.id)
            .count()
        )
        if count < (5 if spec["code"] == "Ciclo IV - 2026" else 3):
            return False
        if spec["code"] == "Ciclo IV - 2026":
            published = (
                db.query(EvaluationDoc)
                .filter(EvaluationDoc.cycle_id == cycle.id, EvaluationDoc.status == "publicado")
                .count()
            )
            if published < 5:
                return False
            if (
                db.query(Bulletin)
                .filter(Bulletin.cycle_id == cycle.id, Bulletin.status == "publicado")
                .count()
                < 1
            ):
                return False
    # Los ciclos creados por la coordinacion no invalidan la semilla oficial.
    return True


def _populate(db: Session, cycles: dict[str, Cycle], techs: list[Technology]) -> None:
    if len(techs) < 9:
        raise RuntimeError(
            f"Se necesitan al menos 9 tecnologias clasificadas para sembrar los ciclos; hay {len(techs)}."
        )
    c1, c2, c3 = cycles["Ciclo I - 2026"], cycles["Ciclo II - 2026"], cycles["Ciclo III - 2026"]

    # --- Ciclo I: ejercicio cerrado ---------------------------------------
    pub_a, pub_b, watch, excluded, not_prio = techs[0], techs[1], techs[2], techs[3], techs[4]
    for tech in (pub_a, pub_b, watch, excluded, not_prio):
        _entry(db, c1, tech, "asignada_a_ciclo")
        _novelty(db, c1, tech)

    _entry(db, c1, excluded, "excluida")
    excluded_entry = (
        db.query(CycleTechnology)
        .filter(CycleTechnology.cycle_id == c1.id, CycleTechnology.technology_id == excluded.id)
        .one()
    )
    excluded_entry.exclusion_reason_code = "evidencia_insuficiente"
    excluded_entry.exclusion_note = "Senal insuficiente para caracterizar la tecnologia en este ciclo."
    excluded_entry.excluded_by = ACTOR
    excluded_entry.excluded_at = datetime.now(timezone.utc)
    excluded.status = "excluida"

    for tech in (pub_a, pub_b, watch, not_prio):
        _entry(db, c1, tech, "filtrada_apta_priorizacion")

    _rate(db, c1, pub_a, 5)
    _rate(db, c1, pub_b, 4)
    _rate(db, c1, watch, 3)
    _rate(db, c1, not_prio, 1)

    _entry(db, c1, pub_a, "en_evaluacion")
    _entry(db, c1, pub_b, "en_evaluacion")
    _publish_eval(db, c1, pub_a, "informe")
    _publish_eval(db, c1, pub_b, "ficha")

    c1.status = "en_evaluacion"
    db.flush()
    cycle_service.close_cycle(db, c1, actor=ACTOR)
    db.refresh(c1)

    # --- Ciclo II: en evaluacion, con arrastre del monitoreo --------------
    eval_x, eval_y, prio = techs[5], techs[6], techs[7]
    carried = cycle_service.carry_over_watchlist(db, c1, c2, actor=ACTOR)
    if carried == 0:
        _entry(db, c2, watch, "filtrada_apta_priorizacion", carried_from=c1.id)
        watch_entry = (
            db.query(CycleTechnology)
            .filter(CycleTechnology.cycle_id == c2.id, CycleTechnology.technology_id == watch.id)
            .one()
        )
        src = (
            db.query(CycleTechnology)
            .filter(CycleTechnology.cycle_id == c1.id, CycleTechnology.technology_id == watch.id)
            .first()
        )
        if src:
            watch_entry.previous_priority_pct = src.priority_pct

    for tech in (eval_x, eval_y, prio):
        _entry(db, c2, tech, "asignada_a_ciclo")
        _novelty(db, c2, tech)
        _entry(db, c2, tech, "filtrada_apta_priorizacion")

    _novelty(db, c2, watch)
    _rate(db, c2, eval_x, 5)
    _rate(db, c2, eval_y, 4)
    _rate(db, c2, prio, 4)
    _rate(db, c2, watch, 3)

    _entry(db, c2, eval_x, "en_evaluacion")
    _entry(db, c2, eval_y, "en_evaluacion")
    evaluation_service.ensure_document(db, c2.id, eval_x.id, actor=ACTOR, product_level="informe")
    evaluation_service.ensure_document(db, c2.id, eval_y.id, actor=ACTOR, product_level="ficha")
    c2.status = "en_evaluacion"
    c2.closed_at = None
    db.commit()

    # --- Ciclo III: vigente en priorizacion --------------------------------
    assigned = techs[8:11]
    filtered = techs[11:14] if len(techs) >= 14 else techs[8:11]
    scoring = techs[14:16] if len(techs) >= 16 else (filtered[:2] if len(filtered) >= 2 else assigned[:2])

    used_ids = {t.id for t in (pub_a, pub_b, watch, excluded, not_prio, eval_x, eval_y, prio)}
    pool = [t for t in techs if t.id not in used_ids]
    if len(pool) < 6:
        pool = techs[8:]
    assigned = pool[0:3]
    filtered = pool[3:6] if len(pool) >= 6 else pool[0:3]
    scoring = pool[6:8] if len(pool) >= 8 else pool[0:2]

    for tech in assigned:
        _entry(db, c3, tech, "asignada_a_ciclo")
        _novelty(db, c3, tech)
    for tech in filtered:
        _entry(db, c3, tech, "asignada_a_ciclo")
        _novelty(db, c3, tech)
        _entry(db, c3, tech, "filtrada_apta_priorizacion")
    for tech, points in zip(scoring, (5, 3)):
        _entry(db, c3, tech, "asignada_a_ciclo")
        _novelty(db, c3, tech)
        _entry(db, c3, tech, "filtrada_apta_priorizacion")
        _rate(db, c3, tech, points)

    c3.status = "en_priorizacion"
    c3.closed_at = None
    db.commit()

    _populate_cycle_iv(db, cycles["Ciclo IV - 2026"], techs, used_ids | {t.id for t in assigned + filtered + list(scoring)})


def _select_iv_technologies(db: Session, fallback: list[Technology], used_ids: set[int]) -> list[Technology]:
    chosen = list(_ensure_showcase_technologies(db))
    seen = {tech.id for tech in chosen}
    if len(chosen) >= 6:
        return chosen[:6]
    catalog_rows = (
        db.query(Technology)
        .filter(Technology.merged_into_id.is_(None))
        .order_by(Technology.screening_score.desc(), Technology.id.asc())
        .all()
    )
    for tech in catalog_rows + list(fallback):
        if tech.id in seen:
            continue
        _ensure_classification(db, tech)
        if not (tech.cluster_id and tech.tech_type_id):
            continue
        chosen.append(tech)
        seen.add(tech.id)
        if len(chosen) >= 6:
            break
    return chosen


def _adoption_note(tech: Technology, level: str) -> str:
    dossier = report_dossiers.match_dossier(tech)
    name = tech.commercial_name or tech.inn_name or "la tecnologia"
    narrative = ""
    if dossier:
        narrative = (dossier.get("body") or {}).get("narrative") or ""
    labels = {"ficha": "ficha tecnica", "informe": "informe de evaluacion temprana", "mini_hta": "Mini-HTA"}
    impact = "alto" if level == "mini_hta" else "medio"
    ncts = ", ".join(tech.nct_ids or []) or "sin NCT publico"
    return (
        f"### Recomendacion de adopcion — {name}\n\n"
        f"**Ciclo:** IV - 2026 (diseminacion publicada).\n\n"
        f"**Producto IETS:** {labels.get(level, level)}.\n\n"
        f"**Sintesis.** {narrative or 'Senal caracterizada con evidencia de fuente primaria y criterio de novedad documentado.'}\n\n"
        f"**Identificadores.** {ncts}. Fabricante: {tech.manufacturer or 'no declarado'}.\n\n"
        f"**Colombia.** Verificar registro INVIMA, capacidad de centros de referencia y "
        f"encaje en el SGSSS antes de cualquier decision de cobertura.\n\n"
        f"**Accion.** Usar el expediente publicado como insumo del comite tecnico y mantener "
        f"vigilancia activa de la via regulatoria.\n\n"
        f"IMPACTO: {impact}"
    )


def _populate_cycle_iv(db: Session, cycle: Cycle, techs: list[Technology], used_ids: set[int]) -> None:
    selected = _select_iv_technologies(db, techs, used_ids)
    if len(selected) < 5:
        raise RuntimeError("No hay suficientes tecnologias para el Ciclo IV de diseminacion.")
    levels_fallback = ("mini_hta", "informe", "informe", "ficha", "ficha", "informe")
    for tech, fallback_level in zip(selected, levels_fallback):
        dossier = report_dossiers.match_dossier(tech)
        level = (dossier or {}).get("level") or fallback_level
        points = 6 if level == "mini_hta" else 5 if level == "informe" else 4
        _entry(db, cycle, tech, "asignada_a_ciclo")
        _novelty(db, cycle, tech)
        _entry(db, cycle, tech, "filtrada_apta_priorizacion")
        _rate(db, cycle, tech, points)
        _entry(db, cycle, tech, "en_evaluacion")
        _publish_eval(db, cycle, tech, level)
        title = f"Recomendacion de adopcion: {tech.commercial_name or tech.inn_name}"[:590]
        exists = (
            db.query(Recommendation)
            .filter(Recommendation.model_used == "semilla-ciclo-iv", Recommendation.title == title)
            .first()
        )
        if exists is None:
            db.add(
                Recommendation(
                    finding_id=tech.finding_id,
                    title=title,
                    content=_adoption_note(tech, level),
                    impact="alto" if level == "mini_hta" else "medio",
                    model_used="semilla-ciclo-iv",
                    created_by=ACTOR,
                )
            )
    cycle.status = "en_evaluacion"
    db.flush()
    cycle_service.close_cycle(db, cycle, actor=ACTOR)
    bulletin = (
        db.query(Bulletin)
        .filter(Bulletin.cycle_id == cycle.id)
        .order_by(Bulletin.id.desc())
        .first()
    )
    if bulletin:
        strategy_service.approve_bulletin(db, bulletin, actor=ACTOR, publish=True)
        db.commit()


def _refresh_official_datamarts(db: Session) -> None:
    _ensure_showcase_technologies(db)
    for doc in db.query(EvaluationDoc).filter(EvaluationDoc.status == "publicado").all():
        if doc.created_by != ACTOR and doc.updated_by != ACTOR:
            continue
        tech = db.get(Technology, doc.technology_id)
        if tech is None or not report_dossiers.match_dossier(tech):
            continue
        doc.body = report_dossiers.body_for(tech, doc.product_level)
        doc.title = report_dossiers.title_for(tech, doc.product_level)
    for cycle in db.query(Cycle).filter(Cycle.code.in_(OFFICIAL_CODES)).all():
        if cycle.status == "cerrado_consolidado":
            strategy_service.snapshot_ttm(db, cycle)
            strategy_service.refresh_datamart(db, cycle)
    db.commit()


def sync_official_cycles(db: Session, *, force: bool = False) -> dict:
    """Idempotente: deja exactamente los cuatro ciclos oficiales de 2026."""
    methodology.seed_catalogs(db)
    _restore_year_quota(db)
    purged = _purge_ambiguous(db)

    if not force and _already_populated(db):
        _refresh_official_datamarts(db)
        return {"ok": True, "rebuilt": False, **purged, "codes": list(OFFICIAL_CODES)}

    cycles = {spec["code"]: _upsert_cycle(db, spec) for spec in OFFICIAL_CYCLES}
    db.commit()

    if not force and _already_populated(db):
        _refresh_official_datamarts(db)
        return {"ok": True, "rebuilt": False, **purged, "codes": list(OFFICIAL_CODES)}

    for cycle in cycles.values():
        db.query(PriorityScore).filter(PriorityScore.cycle_id == cycle.id).delete()
        db.query(NoveltyAssessment).filter(NoveltyAssessment.cycle_id == cycle.id).delete()
        doc_ids = [
            row[0]
            for row in db.query(EvaluationDoc.id).filter(EvaluationDoc.cycle_id == cycle.id).all()
        ]
        if doc_ids:
            db.query(ReviewComment).filter(ReviewComment.doc_id.in_(doc_ids)).delete(synchronize_session=False)
            db.query(ReviewAssignment).filter(ReviewAssignment.doc_id.in_(doc_ids)).delete(synchronize_session=False)
            db.query(EvaluationVersion).filter(EvaluationVersion.doc_id.in_(doc_ids)).delete(synchronize_session=False)
        db.query(EvaluationDoc).filter(EvaluationDoc.cycle_id == cycle.id).delete()
        db.query(CycleTechnology).filter(CycleTechnology.cycle_id == cycle.id).delete()
        db.query(Bulletin).filter(Bulletin.cycle_id == cycle.id).delete()
    db.query(Recommendation).filter(Recommendation.model_used == "semilla-ciclo-iv").delete()
    db.commit()

    _ensure_showcase_technologies(db)
    techs = _pick_technologies(db, 24)
    _populate(db, cycles, techs)
    return {
        "ok": True,
        "rebuilt": True,
        **purged,
        "codes": list(OFFICIAL_CODES),
        "technologies_used": len(techs),
    }
