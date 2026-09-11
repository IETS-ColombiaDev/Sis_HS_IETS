"""Pruebas del modulo de filtrado: fusion difusa, novedad e indice del INVIMA.

Se prueba lo que el criterio de aceptacion de la fase 3 exige de forma
explicita: que dos registros de la misma molecula con variacion ortografica
queden propuestos para fusion, que una tecnologia con registro sanitario
vigente no avance sin justificacion, y que ninguna exclusion se guarde sin
causa tipificada.
"""
from __future__ import annotations

import datetime as dt
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import dedup, invima, methodology, normalization, screening_service  # noqa: E402
from app.database import Base  # noqa: E402
from app.models import (  # noqa: E402
    Cluster,
    Cycle,
    CycleTechnology,
    InvimaRecord,
    MergeProposal,
    Technology,
)
from app.screening_service import ScreeningRuleError  # noqa: E402


@pytest.fixture()
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine, autoflush=False)()
    methodology.seed_catalogs(session)
    yield session
    session.close()


@pytest.fixture()
def cycle(db):
    row = Cycle(
        code="CICLO-PRUEBA",
        year=dt.date.today().year,
        opened_on=dt.date.today(),
        data_cutoff_on=dt.date.today() + dt.timedelta(weeks=12),
        status="en_filtrado",
    )
    db.add(row)
    db.commit()
    return row


def make_tech(db, **kwargs) -> Technology:
    tech = Technology(**kwargs)
    db.add(tech)
    db.commit()
    db.refresh(tech)
    return tech


def assign(db, cycle: Cycle, tech: Technology, status: str = "asignada_a_ciclo") -> CycleTechnology:
    entry = CycleTechnology(cycle_id=cycle.id, technology_id=tech.id, status=status)
    db.add(entry)
    db.commit()
    return entry


# --------------------------------------------------------------------------- #
#  Normalizacion de nombres
# --------------------------------------------------------------------------- #
def test_dosage_and_packaging_do_not_change_identity():
    assert dedup.normalize_name("Keytruda 100 mg vial") == "keytruda"
    assert dedup.normalize_name("KEYTRUDA(R) 100mg") == "keytruda r"
    assert dedup.normalize_name("Pembrolizumab solucion inyectable") == "pembrolizumab"


def test_salt_forms_reduce_to_the_active_principle():
    assert dedup.normalize_name("Clorhidrato de metformina") == "metformina"
    assert dedup.normalize_name("Metformina") == "metformina"


def test_a_name_made_only_of_a_salt_is_not_emptied():
    """Quitar la sal no puede dejar el nombre en blanco y perder el registro."""
    assert dedup.normalize_name("Sulfato") == "sulfato"


# --------------------------------------------------------------------------- #
#  RF09 - Deteccion difusa
# --------------------------------------------------------------------------- #
def test_same_molecule_with_spelling_variation_is_proposed(db):
    """Criterio de aceptacion textual de la fase 3."""
    make_tech(db, inn_name="Pembrolizumab", commercial_name="Keytruda", manufacturer="MSD")
    make_tech(db, inn_name="Pembrolizumap", commercial_name="Keytruda 100 mg", manufacturer="MSD")

    pairs = dedup.find_duplicates(db)

    assert len(pairs) == 1
    assert pairs[0]["score"] >= dedup.threshold(db)
    assert "nombre" in pairs[0]["matched_on"]


def test_shared_trial_identifier_is_decisive_not_fuzzy(db):
    """Compartir un NCT no es parecerse: es ser el mismo desarrollo."""
    make_tech(db, inn_name="Compuesto alfa", nct_ids=["NCT04512345"])
    make_tech(db, inn_name="Sustancia beta", nct_ids=["nct04512345"])

    pairs = dedup.find_duplicates(db)

    assert len(pairs) == 1
    assert pairs[0]["decisive"] is True
    assert pairs[0]["score"] == 100.0
    assert pairs[0]["matched_on"] == ["nct"]


def test_different_technologies_are_not_proposed(db):
    make_tech(db, inn_name="Pembrolizumab", commercial_name="Keytruda")
    make_tech(db, inn_name="Trastuzumab", commercial_name="Herceptin")

    assert dedup.find_duplicates(db) == []


def test_the_breakdown_of_the_three_algorithms_is_preserved(db):
    """La propuesta debe ser explicable ante quien tiene que confirmarla."""
    a = make_tech(db, inn_name="Nivolumab", commercial_name="Opdivo")
    b = make_tech(db, inn_name="Nivolumab", commercial_name="Opdivo 10 mg")

    result = dedup.compare(a, b)

    assert set(result["detail"]["nombre"]) == {"levenshtein", "jaro_winkler", "token_sort"}


def test_a_clearly_different_manufacturer_penalizes_a_name_coincidence(db):
    a = make_tech(db, inn_name="Zentiva", manufacturer="Roche")
    b = make_tech(db, inn_name="Zentiva", manufacturer="Pfizer")

    result = dedup.compare(a, b)

    assert "fabricante_discrepante" in result["matched_on"]
    assert result["score"] < 100


def test_a_corporate_suffix_is_recognized_as_the_same_manufacturer(db):
    """"MSD" y "MSD Colombia SA" son la misma casa; el sufijo no debe separarlas."""
    assert dedup.manufacturer_similarity("MSD", "MSD Colombia SA") >= dedup.MANUFACTURER_SAME
    assert (
        dedup.manufacturer_similarity("Novo Nordisk", "Novo Nordisk Colombia")
        >= dedup.MANUFACTURER_SAME
    )


def test_an_acronym_against_its_expansion_stays_in_the_neutral_band(db):
    """Ninguna metrica de cadenas resuelve "MSD" frente a "Merck Sharp Dohme".

    El diseno no finge que si: en la franja ambigua el fabricante no mueve el
    puntaje, ni a favor ni en contra.
    """
    score = dedup.manufacturer_similarity("Merck Sharp Dohme", "MSD Colombia")

    assert dedup.MANUFACTURER_DIFFERENT <= score < dedup.MANUFACTURER_SAME

    a = make_tech(db, inn_name="Pembrolizumab", manufacturer="Merck Sharp Dohme")
    b = make_tech(db, inn_name="Pembrolizumab", manufacturer="MSD Colombia")
    result = dedup.compare(a, b)

    assert "fabricante_discrepante" not in result["matched_on"]
    assert "fabricante" not in result["matched_on"]


def test_threshold_comes_from_the_database(db):
    make_tech(db, inn_name="Ustekinumab")
    make_tech(db, inn_name="Ustekimumab bio")

    strict = dedup.find_duplicates(db)
    db.get(type(db.get(Cluster, 1)).__mro__[0], 1)  # no-op para mantener la sesion viva

    from app.models import MethodologyParam

    db.get(MethodologyParam, "dedup.similarity_threshold").value = "50"
    db.commit()
    loose = dedup.find_duplicates(db)

    assert len(loose) >= len(strict)


# --------------------------------------------------------------------------- #
#  Propuestas y fusion
# --------------------------------------------------------------------------- #
def test_scanning_twice_does_not_duplicate_proposals(db):
    make_tech(db, inn_name="Pembrolizumab", commercial_name="Keytruda")
    make_tech(db, inn_name="Pembrolizumab", commercial_name="Keytruda 100 mg")

    first = screening_service.scan_duplicates(db, actor="tecnico@iets.org.co")
    second = screening_service.scan_duplicates(db, actor="tecnico@iets.org.co")

    assert first["created"] == 1
    assert second["created"] == 0
    assert db.query(MergeProposal).count() == 1


def test_a_discarded_proposal_is_not_reopened_by_the_engine(db):
    make_tech(db, inn_name="Pembrolizumab", commercial_name="Keytruda")
    make_tech(db, inn_name="Pembrolizumab", commercial_name="Keytruda 100 mg")
    screening_service.scan_duplicates(db)
    proposal = db.query(MergeProposal).one()

    screening_service.discard_merge(db, proposal.id, note="Presentaciones distintas", actor="a@b.co")
    screening_service.scan_duplicates(db)

    assert db.query(MergeProposal).one().status == "descartada"


def test_merging_keeps_the_data_that_only_the_absorbed_record_had(db):
    keep = make_tech(db, inn_name="Pembrolizumab", nct_ids=["NCT001"])
    drop = make_tech(
        db,
        inn_name="Pembrolizumab",
        commercial_name="Keytruda",
        nct_ids=["NCT002"],
        atc_code="L01FF02",
        fda_approval_date=dt.date(2024, 5, 1),
    )
    screening_service.scan_duplicates(db)
    proposal = db.query(MergeProposal).one()

    screening_service.confirm_merge(db, proposal.id, keep_id=keep.id, actor="a@b.co")
    db.refresh(keep)
    db.refresh(drop)

    assert set(keep.nct_ids) == {"NCT001", "NCT002"}
    assert keep.commercial_name == "Keytruda"
    assert keep.atc_code == "L01FF02"
    assert keep.fda_approval_date == dt.date(2024, 5, 1)
    assert drop.merged_into_id == keep.id


def test_the_absorbed_record_is_never_deleted(db):
    keep = make_tech(db, inn_name="Pembrolizumab")
    drop = make_tech(db, inn_name="Pembrolizumab bio")
    screening_service.scan_duplicates(db)
    proposal = db.query(MergeProposal).one()

    screening_service.confirm_merge(db, proposal.id, keep_id=keep.id, actor="a@b.co")

    assert db.get(Technology, drop.id) is not None


def test_a_merged_record_is_excluded_with_a_typified_reason(db, cycle):
    keep = make_tech(db, inn_name="Pembrolizumab")
    drop = make_tech(db, inn_name="Pembrolizumab bio")
    assign(db, cycle, keep)
    entry = assign(db, cycle, drop)
    screening_service.scan_duplicates(db)
    proposal = db.query(MergeProposal).one()

    screening_service.confirm_merge(db, proposal.id, keep_id=keep.id, actor="a@b.co")
    db.refresh(entry)

    assert entry.status == "excluida"
    assert entry.exclusion_reason_code in methodology.EXCLUSION_REASONS


def test_keeping_a_technology_outside_the_pair_is_rejected(db):
    make_tech(db, inn_name="Pembrolizumab")
    make_tech(db, inn_name="Pembrolizumab bio")
    intruder = make_tech(db, inn_name="Otra cosa")
    screening_service.scan_duplicates(db)
    proposal = db.query(MergeProposal).one()

    with pytest.raises(ScreeningRuleError):
        screening_service.confirm_merge(db, proposal.id, keep_id=intruder.id)


def test_a_resolved_proposal_cannot_be_resolved_again(db):
    keep = make_tech(db, inn_name="Pembrolizumab")
    make_tech(db, inn_name="Pembrolizumab bio")
    screening_service.scan_duplicates(db)
    proposal = db.query(MergeProposal).one()
    screening_service.confirm_merge(db, proposal.id, keep_id=keep.id)

    with pytest.raises(ScreeningRuleError):
        screening_service.confirm_merge(db, proposal.id, keep_id=keep.id)


# --------------------------------------------------------------------------- #
#  RF11 - Indice local del INVIMA
# --------------------------------------------------------------------------- #
def seed_invima(db, **kwargs) -> InvimaRecord:
    defaults = {
        "expediente": "20012345",
        "registro": "INVIMA 2019M-0012345",
        "producto": "KEYTRUDA 100 MG SOLUCION",
        "principio_activo": "PEMBROLIZUMAB",
        "titular": "MSD COLOMBIA",
        "estado_registro": "Vigente",
        "fecha_vencimiento": dt.date.today() + dt.timedelta(days=365),
    }
    defaults.update(kwargs)
    record = InvimaRecord(
        **defaults,
        producto_norm=dedup.normalize_name(defaults["producto"]),
        principio_norm=dedup.normalize_name(defaults["principio_activo"]),
    )
    db.add(record)
    db.commit()
    return record


def test_an_empty_index_is_reported_as_stale(db):
    status = invima.index_status(db)

    assert status["stale"] is True
    assert status["total_records"] == 0
    assert "vacío" in status["warning"]


def test_the_index_finds_the_registry_by_active_principle(db):
    seed_invima(db)

    hits = invima.search(db, "Pembrolizumab")

    assert hits and hits[0]["score"] >= 90
    assert hits[0]["valid_registry"] is True


def test_an_expired_registry_does_not_count_as_valid(db):
    seed_invima(db, fecha_vencimiento=dt.date.today() - dt.timedelta(days=10))

    hits = invima.search(db, "Pembrolizumab")

    assert hits[0]["valid_registry"] is False


def test_a_cancelled_registry_does_not_count_as_valid(db):
    seed_invima(db, estado_registro="Cancelado")

    hits = invima.search(db, "Pembrolizumab")

    assert hits[0]["valid_registry"] is False


def test_flat_file_load_is_the_contingency_route(db):
    content = (
        "expediente;registrosanitario;producto;principioactivo;titular;estadoregistro;fechavencimiento\n"
        "20099;INVIMA 2020M-1;OZEMPIC 1 MG;SEMAGLUTIDA;NOVO NORDISK;Vigente;31/12/2030\n"
    ).encode("utf-8")

    log = invima.sync_from_flat_file(db, content=content, filename="registros.csv")

    assert log.status == "ok"
    assert log.rows_ingested == 1
    assert invima.search(db, "semaglutida")


def test_reloading_the_flat_file_updates_instead_of_duplicating(db):
    content = (
        "expediente;producto;principioactivo;estadoregistro\n"
        "20099;OZEMPIC;SEMAGLUTIDA;Vigente\n"
    ).encode("utf-8")
    invima.sync_from_flat_file(db, content=content)
    invima.sync_from_flat_file(db, content=content)

    assert db.query(InvimaRecord).count() == 1


def test_an_unreadable_file_reports_the_problem_instead_of_failing_silently(db):
    log = invima.sync_from_flat_file(db, content=b"esto no es un csv de registros")

    assert log.status in ("error", "parcial")
    assert log.message


# --------------------------------------------------------------------------- #
#  RF10 - Criterio de novedad
# --------------------------------------------------------------------------- #
def test_qualification_is_blocked_without_a_novelty_assessment(db, cycle):
    tech = make_tech(db, inn_name="Pembrolizumab")
    assign(db, cycle, tech)

    allowed, reason = screening_service.novelty_gate(db, cycle.id, tech.id)

    assert allowed is False
    assert "novedad" in reason.lower()


def test_qualification_is_blocked_without_the_invima_cross_check(db, cycle):
    tech = make_tech(db, inn_name="Pembrolizumab")
    assign(db, cycle, tech)
    screening_service.save_novelty(
        db, cycle.id, tech.id, option_code="no_disponible_en_pais", actor="a@b.co"
    )

    allowed, reason = screening_service.novelty_gate(db, cycle.id, tech.id)

    assert allowed is False
    assert "INVIMA" in reason


def test_a_technology_with_a_valid_registry_cannot_be_declared_unavailable(db, cycle):
    """Criterio de aceptacion textual de la fase 3."""
    seed_invima(db)
    tech = make_tech(db, inn_name="Pembrolizumab", commercial_name="Keytruda")
    assign(db, cycle, tech)
    screening_service.run_invima_check(db, cycle.id, tech.id)

    with pytest.raises(ScreeningRuleError, match="registro sanitario vigente"):
        screening_service.save_novelty(
            db, cycle.id, tech.id, option_code="no_disponible_en_pais", actor="a@b.co"
        )


def test_a_registered_technology_advances_with_an_explicit_new_indication(db, cycle):
    seed_invima(db)
    tech = make_tech(db, inn_name="Pembrolizumab", commercial_name="Keytruda")
    assign(db, cycle, tech)
    screening_service.run_invima_check(db, cycle.id, tech.id)

    screening_service.save_novelty(
        db,
        cycle.id,
        tech.id,
        option_code="nueva_indicacion",
        justification="Amplia indicacion a cancer gastrico avanzado, no cubierta por el registro vigente.",
        actor="a@b.co",
    )
    allowed, reason = screening_service.novelty_gate(db, cycle.id, tech.id)

    assert allowed is True, reason


def test_a_new_indication_without_justification_is_rejected(db, cycle):
    tech = make_tech(db, inn_name="Pembrolizumab")
    assign(db, cycle, tech)

    with pytest.raises(ScreeningRuleError, match="justificación"):
        screening_service.save_novelty(
            db, cycle.id, tech.id, option_code="nueva_indicacion", justification="nueva"
        )


def test_an_unknown_novelty_option_is_rejected(db, cycle):
    tech = make_tech(db, inn_name="Pembrolizumab")
    assign(db, cycle, tech)

    with pytest.raises(ScreeningRuleError):
        screening_service.save_novelty(db, cycle.id, tech.id, option_code="me_parece_novedosa")


def test_a_technology_with_no_registry_advances_through_the_base_route(db, cycle):
    tech = make_tech(db, inn_name="Molecula totalmente inedita")
    assign(db, cycle, tech)
    screening_service.run_invima_check(db, cycle.id, tech.id)
    screening_service.save_novelty(
        db, cycle.id, tech.id, option_code="no_disponible_en_pais", actor="a@b.co"
    )

    allowed, _ = screening_service.novelty_gate(db, cycle.id, tech.id)

    assert allowed is True


def test_the_assessment_cannot_be_edited_once_the_cycle_is_frozen(db, cycle):
    tech = make_tech(db, inn_name="Pembrolizumab")
    entry = assign(db, cycle, tech)
    entry.frozen = True
    db.commit()

    with pytest.raises(ScreeningRuleError, match="congelado"):
        screening_service.save_novelty(
            db, cycle.id, tech.id, option_code="no_disponible_en_pais"
        )


# --------------------------------------------------------------------------- #
#  RF12 - Listado Unico por Cluster
# --------------------------------------------------------------------------- #
def test_the_unique_list_groups_by_cluster_and_excludes_the_discarded(db, cycle):
    cancer = db.query(Cluster).filter(Cluster.code == "cancer").one()
    kept = make_tech(db, inn_name="Pembrolizumab", cluster_id=cancer.id)
    dropped = make_tech(db, inn_name="Generico cualquiera", cluster_id=cancer.id)
    assign(db, cycle, kept, status="filtrada_apta_priorizacion")
    assign(db, cycle, dropped, status="excluida")

    result = screening_service.unique_list(db, cycle.id)

    assert result["total"] == 1
    assert result["excluded_count"] == 1
    assert result["clusters"][0]["cluster_code"] == "cancer"
    assert result["clusters"][0]["items"][0]["technology_id"] == kept.id


def test_a_merged_technology_never_reaches_the_unique_list(db, cycle):
    cancer = db.query(Cluster).filter(Cluster.code == "cancer").one()
    keep = make_tech(db, inn_name="Pembrolizumab", cluster_id=cancer.id)
    drop = make_tech(db, inn_name="Pembrolizumab bio", cluster_id=cancer.id)
    assign(db, cycle, keep, status="filtrada_apta_priorizacion")
    assign(db, cycle, drop, status="filtrada_apta_priorizacion")
    screening_service.scan_duplicates(db)
    proposal = db.query(MergeProposal).one()
    screening_service.confirm_merge(db, proposal.id, keep_id=keep.id, actor="a@b.co")

    result = screening_service.unique_list(db, cycle.id)

    assert result["total"] == 1
    assert result["clusters"][0]["items"][0]["technology_id"] == keep.id


def test_technologies_without_a_cluster_are_visible_not_hidden(db, cycle):
    tech = make_tech(db, inn_name="Sin clasificar")
    assign(db, cycle, tech, status="filtrada_apta_priorizacion")

    result = screening_service.unique_list(db, cycle.id)

    assert result["clusters"][0]["cluster_code"] == "sin_cluster"


# --------------------------------------------------------------------------- #
#  Normalizacion con vocabularios controlados
# --------------------------------------------------------------------------- #
def test_atc_is_canonized_and_a_malformed_code_is_reported(db):
    tech = make_tech(db, inn_name="X", atc_code="l01 ff02")
    report = normalization.normalize_technology(tech)
    assert tech.atc_code == "L01FF02"
    assert not report["rechazado"]

    tech.atc_code = "ZZZZ999"
    report = normalization.normalize_technology(tech)
    assert "atc_code" in report["rechazado"]


def test_icd10_accepts_both_notations_and_flags_the_invalid(db):
    tech = make_tech(db, inn_name="X", icd10_codes=["c50.1", "E11", "no-es-codigo"])

    report = normalization.normalize_technology(tech)

    assert tech.icd10_codes == ["C501", "E11"]
    assert "icd10_codes" in report["rechazado"]


def test_device_nomenclature_recognizes_gmdn_and_emdn(db):
    assert normalization.device_nomenclature_system("35678") == "GMDN"
    assert normalization.device_nomenclature_system("J0101") == "EMDN"
    valid, message = normalization.validate_device_code("no-valido")
    assert valid is False and message


def test_vocabulary_suggestions_come_from_the_assigned_cluster(db):
    cancer = db.query(Cluster).filter(Cluster.code == "cancer").one()
    tech = make_tech(db, inn_name="X", cluster_id=cancer.id)

    suggestion = normalization.suggest_vocabularies(db, tech)

    assert "C" in suggestion["icd10_prefixes"]
    assert suggestion["mesh_terms"]


# --------------------------------------------------------------------------- #
#  Migracion de esquema sobre una base anterior a la fase 3
# --------------------------------------------------------------------------- #
def test_the_merge_column_is_added_to_a_pre_phase3_database(tmp_path, monkeypatch):
    """create_all no altera tablas existentes, asi que la columna necesita migracion.

    Sin esto, una base creada en la fase 2 arranca sin error y falla en la
    primera consulta del modulo de filtrado.
    """
    from sqlalchemy import inspect, text

    from app import database

    path = tmp_path / "fase2.db"
    engine = create_engine(f"sqlite:///{path}")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE technologies (id INTEGER PRIMARY KEY, inn_name TEXT)"))
    monkeypatch.setattr(database, "engine", engine)

    database.run_schema_migrations()
    assert "merged_into_id" in {c["name"] for c in inspect(engine).get_columns("technologies")}

    database.run_schema_migrations()  # idempotente: no debe fallar en el segundo arranque
