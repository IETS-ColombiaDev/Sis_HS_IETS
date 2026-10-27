"""Validacion del modulo 0 (consolidado de observaciones SI EAA, 09-10-2026).

RF-002: la misma tecnologia en varias fuentes se consolida y sube en la bandeja.
RF-003: la senal trae datos de producto (forma farmaceutica, marca, modelo).
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from frente_b_support import api  # noqa: E402,F401  (fixture)

from app import corroboration, product_details  # noqa: E402
from app.ingest.fda import FdaConnector  # noqa: E402
from app.models import Finding, Source, Technology  # noqa: E402
from app.technology_service import sync_technology_from_finding  # noqa: E402


# --------------------------------------------------------------------------- #
#  RF-003 Datos de producto
# --------------------------------------------------------------------------- #
def test_rules_extract_medicine_details():
    got = product_details.extract(
        title="Pembrolizumab 100 mg/4 ml intravenous solution for infusion",
        summary="Administered every 3 weeks.",
        technology_type="medicamento",
    )
    assert got["dosage_form"] == "Solución inyectable"
    assert got["route"] == "Intravenosa"
    assert got["strength"].startswith("100 mg")


def test_rules_extract_device_brand_and_model():
    got = product_details.extract(
        title="FreeStyle Libre® 3 continuous glucose monitor",
        summary="The model FSL3-Plus received clearance.",
        technology_type="dispositivo",
    )
    assert got["brand"].startswith("FreeStyle Libre")
    assert got["model"] == "FSL3-Plus"
    assert "dosage_form" not in got


def test_rules_do_not_assign_form_or_route_in_combination_titles():
    got = product_details.extract(
        title="Subcutaneous Daratumumab, Carfilzomib, and Dexamethasone in Smoldering Myeloma",
        summary="Dexamethasone tablets once weekly.",
        technology_type="medicamento",
    )
    assert "route" not in got and "dosage_form" not in got


def test_connector_values_are_normalized_to_spanish_labels():
    got = product_details.clean({"dosage_form": "INJECTION, SOLUTION", "route": "SUBCUTANEOUS"})
    assert got == {"dosage_form": "Inyectable", "route": "Subcutánea"}
    assert product_details.clean({"dosage_form": "Solution"}) == {"dosage_form": "Solución"}


def test_rules_leave_fields_empty_when_text_says_nothing():
    assert product_details.extract(title="New horizon scanning report", summary="", technology_type="otro") == {}


def test_clean_drops_placeholders_and_merge_prefers_primary():
    assert product_details.clean({"brand": "N/A", "model": " ", "route": "Oral."}) == {"route": "Oral"}
    merged = product_details.merge({"dosage_form": "Tableta"}, {"dosage_form": "Cápsula", "strength": "5 mg"})
    assert merged == {"dosage_form": "Tableta", "strength": "5 mg"}


def test_openfda_drug_record_carries_form_route_strength_and_brand():
    row = {
        "application_number": "BLA761234",
        "openfda": {"brand_name": ["ZYNTRA"], "generic_name": ["alfamab"], "manufacturer_name": ["Acme"]},
        "products": [
            {
                "dosage_form": "INJECTION, SOLUTION",
                "route": "INTRAVENOUS",
                "active_ingredients": [{"name": "ALFAMAB", "strength": "100MG/4ML"}],
            }
        ],
        "submissions": [],
    }
    record = FdaConnector()._drug_record(row)
    assert product_details.clean(record.details)["dosage_form"] == "Inyectable"
    assert product_details.clean(record.details)["route"] == "Intravenosa"
    assert record.details["strength"] == "100MG/4ML"
    assert record.details["brand"] == "ZYNTRA"
    # Un generico repite la DCI como marca: no se toma.
    row["openfda"]["brand_name"] = ["ALFAMAB"]
    assert FdaConnector()._drug_record(row).details["brand"] == ""


def test_projection_fills_technology_without_overwriting_the_evaluator(api):
    sid = api.add_source()
    with api.db() as db:
        finding = Finding(
            source_id=sid,
            title="Oral semaglutide 7 mg tablets approved",
            summary="Once-daily tablet.",
            technology="Semaglutide",
            technology_type="medicamento",
            content_hash="h-sema",
            details={"brand": "Rybelsus"},
        )
        db.add(finding)
        db.flush()
        tech = sync_technology_from_finding(db, finding)
        assert (tech.dosage_form, tech.strength, tech.route, tech.brand) == ("Tableta", "7 mg", "Oral", "Rybelsus")
        tech.brand = "Marca confirmada"
        db.flush()
        sync_technology_from_finding(db, finding)
        assert tech.brand == "Marca confirmada"
        db.commit()


def test_inbox_edits_and_returns_product_fields(api):
    sid = api.add_source()
    with api.db() as db:
        tech = Technology(commercial_name="Dispositivo X", source_id=sid)
        db.add(tech)
        db.commit()
        tid = tech.id
    res = api.put(f"/api/technologies/{tid}", json={"brand": "Marca Y", "device_model": "MX-2", "dosage_form": None})
    assert res.status_code == 200, res.text
    body = res.json()
    assert (body["brand"], body["device_model"], body["dosage_form"]) == ("Marca Y", "MX-2", "")


# --------------------------------------------------------------------------- #
#  RF-002 Corroboracion entre fuentes
# --------------------------------------------------------------------------- #
def _tech(db, name: str, source_id: int | None, **kw) -> Technology:
    tech = Technology(commercial_name=name, source_id=source_id, **kw)
    db.add(tech)
    db.flush()
    return tech


def test_same_technology_in_three_sources_is_corroborated_and_ranked_first(api):
    fda = api.add_source(title="FDA", url="https://fda.example.org")
    ema = api.add_source(title="EMA", url="https://ema.example.org")
    hc = api.add_source(title="Health Canada", url="https://hc.example.org")
    with api.db() as db:
        lone = _tech(db, "Zolbetuximab", fda, screening_score=60)
        a = _tech(db, "Lecanemab", fda, screening_score=50)
        _tech(db, "lecanemab", ema, screening_score=40)
        # Ya en un ciclo desde otra fuente: tambien corrobora.
        _tech(db, "Lecanemab", hc, status="asignada_ciclo")
        # Misma fuente: duplicado, no corroboracion.
        _tech(db, "Lecanemab", fda)
        db.commit()
        lone_id, a_id = lone.id, a.id

    res = api.get("/api/technologies/staging")
    assert res.status_code == 200, res.text
    rows = {r["id"]: r for r in res.json()}
    assert rows[a_id]["corroboration_count"] == 3
    assert rows[a_id]["corroboration_bonus"] == 10
    assert {c["source_title"] for c in rows[a_id]["corroborating"]} == {"EMA", "Health Canada"}
    assert rows[lone_id]["corroboration_count"] == 1
    # 50 + 10 supera a 60 + 0: la repeticion ordena, pero el cribado no cambia.
    order = [r["id"] for r in res.json()]
    assert order.index(a_id) < order.index(lone_id)
    assert rows[a_id]["screening_score"] == 50

    only = api.get("/api/technologies/staging", params={"corroborated": True}).json()
    assert lone_id not in {r["id"] for r in only} and a_id in {r["id"] for r in only}
    stats = api.get("/api/technologies/staging/stats").json()
    assert stats["corroborated"] >= 2


def test_shared_nct_is_decisive_even_with_different_names(api):
    s1 = api.add_source(title="ClinicalTrials", url="https://ct.example.org")
    s2 = api.add_source(title="Pipeline", url="https://pipe.example.org")
    with api.db() as db:
        a = _tech(db, "MK-3475", s1, nct_ids=["NCT01234567"])
        _tech(db, "Keytruda", s2, nct_ids=["NCT01234567"])
        db.commit()
        corroboration.refresh(db, force=True)
        db.refresh(a)
        assert a.corroboration_count == 2
        assert a.corroborating[0]["matched_on"] == ["nct"]


def test_bonus_is_capped():
    assert [corroboration.bonus_for(n) for n in (1, 2, 3, 4, 9)] == [0, 5, 10, 15, 15]


def test_refresh_is_skipped_when_nothing_changed(api):
    sid = api.add_source()
    with api.db() as db:
        _tech(db, "Algo", sid)
        db.commit()
        assert corroboration.refresh(db)["refreshed"] is True
        assert corroboration.refresh(db)["refreshed"] is False
        db.add(Source(title="Otra", url="https://otra.example.org"))
        _tech(db, "Algo", None, source_channel="reactiva")
        db.commit()
        assert corroboration.refresh(db)["refreshed"] is True
