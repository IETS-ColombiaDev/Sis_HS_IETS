"""Frente A: filtrado (calificar, excluir, fusionar, cruce INVIMA, Listado Unico)."""
from __future__ import annotations

import pytest

from frente_a_helpers import Harness

from app import screening_service
from app.models import MergeProposal, NoveltyAssessment
from app.routers import screening, technologies
from app.screening_service import ScreeningRuleError


@pytest.fixture()
def h():
    harness = Harness(technologies, screening)
    yield harness
    harness.close()


def _pass_gate(h, cycle, tech):
    h.db.add(
        NoveltyAssessment(
            cycle_id=cycle.id,
            technology_id=tech.id,
            option_code="no_disponible_en_pais",
            invima_checked_at=screening_service._now(),
        )
    )
    h.db.commit()


# --------------------------------------------------------------------------- #
#  Bug: una exclusion "inmutable" se revertia marcando la tecnologia apta
# --------------------------------------------------------------------------- #
def test_an_excluded_technology_cannot_be_qualified_again(h):
    cycle = h.cycle(status="en_filtrado")
    tech = h.tech()
    h.entry(cycle, tech, "asignada_a_ciclo")
    _pass_gate(h, cycle, tech)
    res = h.client.post(
        f"/api/technologies/{tech.id}/cycles/{cycle.id}/exclude",
        json={"reason_code": "fuera_alcance", "note": "No es tecnologia sanitaria"},
    )
    assert res.status_code == 200

    again = h.client.post(f"/api/technologies/{tech.id}/cycles/{cycle.id}/qualify")

    assert again.status_code == 409
    assert "exclusión" in again.json()["detail"]
    assert again.json()["detail"]


def test_qualify_is_idempotent_and_does_not_demote_later_states(h):
    cycle = h.cycle()
    fresh = h.tech("Apta")
    rated = h.tech("Priorizada")
    h.entry(cycle, fresh, "asignada_a_ciclo")
    h.entry(cycle, rated, "priorizada")
    _pass_gate(h, cycle, fresh)
    _pass_gate(h, cycle, rated)

    first = h.client.post(f"/api/technologies/{fresh.id}/cycles/{cycle.id}/qualify")
    second = h.client.post(f"/api/technologies/{fresh.id}/cycles/{cycle.id}/qualify")
    demote = h.client.post(f"/api/technologies/{rated.id}/cycles/{cycle.id}/qualify")

    assert first.status_code == 200 and first.json()["cycle_status"] == "filtrada_apta_priorizacion"
    assert second.status_code == 200
    assert demote.status_code == 409


def test_exclusion_requires_a_typified_reason_and_blocks_evaluation_stages(h):
    cycle = h.cycle()
    tech = h.tech()
    h.entry(cycle, tech, "en_evaluacion")

    bad_reason = h.client.post(
        f"/api/technologies/{tech.id}/cycles/{cycle.id}/exclude", json={"reason_code": "me_parece"}
    )
    in_eval = h.client.post(
        f"/api/technologies/{tech.id}/cycles/{cycle.id}/exclude", json={"reason_code": "duplicada"}
    )

    assert bad_reason.status_code == 422
    assert in_eval.status_code == 409
    assert "evaluación" in in_eval.json()["detail"]


def test_assigned_technology_cannot_lose_its_cluster(h):
    """Regla de la fase 1: toda tecnologia asignada conserva cluster y tipologia."""
    cycle = h.cycle()
    tech = h.tech()
    h.entry(cycle, tech, "asignada_a_ciclo")
    staged = h.tech("En bandeja")

    blocked = h.client.put(f"/api/technologies/{tech.id}", json={"cluster_id": None})
    allowed = h.client.put(f"/api/technologies/{staged.id}", json={"cluster_id": None})

    assert blocked.status_code == 422
    assert allowed.status_code == 200 and allowed.json()["cluster_id"] is None


def test_staging_list_reports_the_total_for_paging(h):
    for i in range(7):
        h.tech(f"Senal {i}")

    res = h.client.get("/api/technologies/staging", params={"limit": 3, "offset": 3})

    assert res.headers["X-Total-Count"] == "7"
    assert len(res.json()) == 3


# --------------------------------------------------------------------------- #
#  Bug: una fusion podia conservar un registro ya absorbido
# --------------------------------------------------------------------------- #
def _proposal(h, a, b):
    low, high = sorted((a.id, b.id))
    row = MergeProposal(technology_a_id=low, technology_b_id=high, score=90, status="propuesta", matched_on=[], detail={})
    h.db.add(row)
    h.db.commit()
    return row


def test_confirming_a_merge_retires_the_other_pending_pairs_of_the_absorbed(h):
    cycle = h.cycle(status="en_filtrado")
    a, b, c = h.tech("Pembrolizumab"), h.tech("Pembrolizumabb"), h.tech("Pembrolizumab SC")
    for t in (a, b, c):
        h.entry(cycle, t)
    ab, bc = _proposal(h, a, b), _proposal(h, b, c)

    screening_service.confirm_merge(h.db, ab.id, keep_id=a.id, actor="qa@iets.org.co")

    bc = h.refresh(bc)
    assert bc.status == "obsoleta"
    assert f"#{b.id}" in bc.resolution_note
    listed = h.client.get("/api/screening/merges", params={"status": "propuesta"}).json()
    assert listed == []


def test_a_merge_cannot_keep_an_already_absorbed_record(h):
    cycle = h.cycle(status="en_filtrado")
    a, b, c = h.tech("Trastuzumab"), h.tech("Trastuzumap"), h.tech("Trastuzumab biosimilar")
    for t in (a, b, c):
        h.entry(cycle, t)
    ab, bc = _proposal(h, a, b), _proposal(h, b, c)
    screening_service.confirm_merge(h.db, ab.id, keep_id=a.id)
    bc = h.refresh(bc)
    bc.status = "propuesta"  # dato heredado de antes de la correccion
    h.db.commit()

    with pytest.raises(ScreeningRuleError, match="ya fue fusionada"):
        screening_service.confirm_merge(h.db, bc.id, keep_id=b.id)


# --------------------------------------------------------------------------- #
#  Bug: el cruce INVIMA escribia sobre ciclos cerrados o sin asignacion
# --------------------------------------------------------------------------- #
def test_invima_check_requires_an_assigned_unfrozen_technology(h):
    cycle = h.cycle(status="en_filtrado")
    loose = h.tech("Sin asignar")
    frozen = h.tech("Congelada")
    h.entry(cycle, frozen, "asignada_a_ciclo", frozen=True)

    with pytest.raises(ScreeningRuleError, match="asignada"):
        screening_service.run_invima_check(h.db, cycle.id, loose.id)
    res = h.client.post(f"/api/screening/novelty/{cycle.id}/{frozen.id}/invima-check")
    assert res.status_code == 409
    assert "congelado" in res.json()["detail"]
    assert h.db.query(NoveltyAssessment).count() == 0


def test_unique_list_csv_downloads_with_a_non_ascii_cycle_code(h):
    """Un codigo con guion largo tumbaba la cabecera Content-Disposition (500)."""
    cycle = h.cycle(code="Ciclo I – 2031 · Revisión")
    tech = h.tech("Nivolumab")
    h.entry(cycle, tech, "filtrada_apta_priorizacion")

    res = h.client.get(f"/api/screening/unique-list/{cycle.id}/export")

    assert res.status_code == 200
    disposition = res.headers["content-disposition"]
    disposition.encode("latin-1")
    assert "listado_unico_Ciclo_I_2031_Revisi" in disposition
    assert "Nivolumab" in res.text


def test_locate_reports_where_a_technology_lives_for_deep_links(h):
    cycle = h.cycle("Ciclo enlace", status="en_filtrado")
    keep, drop = h.tech("Superviviente"), h.tech("Absorbida")
    h.entry(cycle, keep, "filtrada_apta_priorizacion")
    h.entry(cycle, drop, "asignada_a_ciclo")
    screening_service.confirm_merge(h.db, _proposal(h, keep, drop).id, keep_id=keep.id)
    staged = h.tech("En bandeja")

    located = h.client.get(f"/api/technologies/{drop.id}/locate").json()
    loose = h.client.get(f"/api/technologies/{staged.id}/locate").json()
    missing = h.client.get("/api/technologies/999999/locate")

    assert located["merged_into_id"] == keep.id and located["merged_into_name"] == "Superviviente"
    [entry] = located["entries"]
    assert entry["cycle_id"] == cycle.id and entry["status"] == "excluida"
    assert entry["exclusion_reason"].startswith("Duplicada")
    assert loose["entries"] == [] and loose["status"] == "capturada_no_asignada"
    assert missing.status_code == 404
