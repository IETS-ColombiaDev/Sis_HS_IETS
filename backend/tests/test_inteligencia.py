"""Inteligencia del sistema (version 7.4.0).

- Base de conocimiento de senales: primera busqueda historica y senales posteriores.
- Clasificador que aprende de las clasificaciones del equipo, con IA opcional.
- Calibracion con los datos reales.
- Marco analitico (descriptivo, diagnostico, predictivo, prescriptivo) con lectura de IA.
- Vigencia de las senales por ano, general o por fuente.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from frente_b_support import api  # noqa: F401  (fixture)

from app import ai_service, analytics_insights, intelligence, signal_window
from app.models import AuditLog, Cluster, Finding, SignalKnowledge, Source, Technology, TechType

ONCO = "anticuerpo monoclonal para carcinoma de pulmon metastasico, tumor solido, quimioterapia y supervivencia global"
CARDIO = "dispositivo implantable para insuficiencia cardiaca, valvula aortica, marcapasos y fraccion de eyeccion"
NEURO = "terapia para epilepsia refractaria, convulsiones, neuroestimulacion y enfermedad de Parkinson"


@pytest.fixture(autouse=True)
def _fresh_index():
    intelligence._invalidate()
    yield
    intelligence._invalidate()


def _catalog(api):  # noqa: F811
    with api.db() as db:
        clusters = [c.id for c in db.query(Cluster).filter(Cluster.is_active == True).order_by(Cluster.sort_order).limit(3)]  # noqa: E712
        types = [t.id for t in db.query(TechType).filter(TechType.is_active == True).order_by(TechType.sort_order).limit(2)]  # noqa: E712
    return clusters, types


def _tech(api, name, summary, *, sid=None, cluster=None, tech_type=None, status="capturada_no_asignada",  # noqa: F811
          published="", captured=None, channel="proactiva", url=""):
    with api.db() as db:
        finding = None
        if sid:
            finding = Finding(source_id=sid, title=name, technology=name, summary=summary, url=url, published_date=published,
                              content_hash=f"h-{name}")
            db.add(finding)
            db.flush()
        tech = Technology(
            commercial_name=name, summary=summary, source_id=sid, finding_id=finding.id if finding else None,
            cluster_id=cluster, tech_type_id=tech_type, status=status, source_channel=channel, url=url,
            captured_at=captured or datetime.now(timezone.utc),
        )
        db.add(tech)
        db.commit()
        return tech.id


def _labeled(api, n_each=8):  # noqa: F811
    """Un acervo clasificado en tres clusteres con vocabulario propio."""
    (c1, c2, c3), (t1, t2) = _catalog(api)
    for i in range(n_each):
        _tech(api, f"Oncomab {i}", f"{ONCO} estudio {i}", cluster=c1, tech_type=t1)
        _tech(api, f"Cardiodev {i}", f"{CARDIO} modelo {i}", cluster=c2, tech_type=t2)
        _tech(api, f"Neurotera {i}", f"{NEURO} ensayo {i}", cluster=c3, tech_type=t1)
    return (c1, c2, c3), (t1, t2)


# --------------------------------------------------------------------------- #
#  Texto y configuracion
# --------------------------------------------------------------------------- #
def test_tokens_drop_accents_and_empty_words():
    assert intelligence.tokenize("La Terapia GÉNICA para la hemofilia B, fase 3") == ["terapia", "genica", "hemofilia"]


@pytest.mark.parametrize(
    ("value", "year"),
    [("2026-11-23", 2026), ("Nov 23, 2025", 2025), ("20241101", 2024), ("", None), ("sin fecha", None), ("3021", None)],
)
def test_year_of_a_published_date(value, year):
    assert intelligence.year_of(value) == year


def test_config_is_clamped_and_unknown_keys_are_ignored():
    cfg = intelligence.normalize_config({"neighbors": 999, "min_confidence": -3, "ai_mode": "inventado", "enabled": "false", "otra": 1})
    assert cfg["neighbors"] == 25 and cfg["min_confidence"] == 0.0
    assert cfg["ai_mode"] == "desacuerdo" and cfg["enabled"] is False and "otra" not in cfg


def test_prompts_fall_back_to_the_factory_text():
    assert intelligence.prompts({"classify_user": ""})["classify_user"] == intelligence.CLASSIFY_USER_PROMPT
    assert intelligence.prompts({"classify_user": "Propio {signal}"})["classify_user"] == "Propio {signal}"
    assert intelligence.fill('{"a": 1} {signal}', signal="X") == '{"a": 1} X'


# --------------------------------------------------------------------------- #
#  Base de conocimiento: historica y posteriores
# --------------------------------------------------------------------------- #
def test_knowledge_base_separates_the_first_search_from_later_signals(api):  # noqa: F811
    (c1, _c2, _c3), (t1, _t2) = _catalog(api)
    old = _tech(api, "Historica", ONCO, cluster=c1, tech_type=t1)
    with api.db() as db:
        out = intelligence.sync(db)
        assert out == {"indexed": 1, "removed": 0, "total": 1}
        assert intelligence.sync(db)["indexed"] == 0  # nada cambio: no reindexa
    new = _tech(api, "Posterior", CARDIO, captured=datetime.now(timezone.utc) + timedelta(days=2))
    post = _tech(api, "Postulada", NEURO, channel="reactiva")
    with api.db() as db:
        intelligence.sync(db)
        rows = {r.technology_id: r for r in db.query(SignalKnowledge).all()}
        assert rows[old].origin == "historica" and rows[old].decision == "clasificada"
        assert rows[new].origin == "vigilancia" and rows[new].decision == "pendiente"
        assert rows[post].origin == "postulacion"
        stats = intelligence.stats(db)
        assert (stats["documents"], stats["historical"], stats["later"], stats["submissions"]) == (3, 1, 1, 1)
        # Fijar la linea base hoy+3 dias vuelve historica la que era posterior.
        intelligence.set_baseline(db, datetime.now(timezone.utc) + timedelta(days=3))
        assert db.query(SignalKnowledge).filter_by(technology_id=new).one().origin == "historica"


def test_a_discard_and_its_reason_reach_the_knowledge_base_and_a_change_reindexes(api):  # noqa: F811
    sid = api.add_source()
    tid = _tech(api, "Aspirina generica", "acido acetilsalicilico tableta de uso amplio", sid=sid)
    with api.db() as db:
        intelligence.sync(db)
    r = api.post("/api/technologies/staging/discard", json={"technology_ids": [tid], "reason": "Tecnología de amplio uso"})
    assert r.status_code == 200
    with api.db() as db:
        assert intelligence.sync(db)["indexed"] == 1
        row = db.query(SignalKnowledge).filter_by(technology_id=tid).one()
        assert row.decision == "descartada" and "amplio uso" in row.reason
        db.delete(db.get(Technology, tid))
        db.commit()
        assert intelligence.sync(db)["removed"] == 1


def test_similar_signals_are_ranked_by_likeness(api):  # noqa: F811
    _labeled(api, 3)
    with api.db() as db:
        intelligence.sync(db)
        hits = intelligence.similar(db, "nuevo marcapasos para insuficiencia cardiaca", limit=3)
        assert hits and all(h["name"].startswith("Cardiodev") for h in hits)
        assert 0 < hits[0]["similarity"] <= 1 and hits[0]["cluster_name"]
        assert intelligence.similar(db, "zzzz qqqq") == []
        assert intelligence.similar(db, "marcapasos cardiaca", decision="descartada") == []


# --------------------------------------------------------------------------- #
#  Clasificador que aprende
# --------------------------------------------------------------------------- #
def test_the_suggestion_learns_from_what_the_team_classified(api):  # noqa: F811
    (_c1, c2, _c3), (_t1, t2) = _labeled(api)
    tid = _tech(api, "Cardionova", "marcapasos sin cables para insuficiencia cardiaca con fraccion de eyeccion reducida")
    with api.db() as db:
        intelligence.save_config(db, {"ai_mode": "nunca"})
    body = api.post(f"/api/technologies/{tid}/suggest-classification").json()
    assert body["cluster_id"] == c2 and body["tech_type_id"] == t2
    assert body["cluster_method"] in ("aprendizaje", "reglas_y_aprendizaje")
    assert body["cluster_confidence"] >= 55 and body["learning"] is True and body["ai_used"] is False
    assert len(body["similar"]) >= 3 and body["similar"][0]["name"].startswith("Cardiodev")
    assert body["similar"][0]["origin"] == "historica"
    with api.db() as db:
        log = db.query(AuditLog).filter(AuditLog.action == intelligence.SUGGEST_ACTION).one()
        assert log.entity_id == str(tid) and log.new_value["cluster_id"] == c2


def test_without_examples_the_suggestion_uses_only_the_catalog_rules(api):  # noqa: F811
    tid = _tech(api, "Solitaria", "texto sin relacion con nada del catalogo zzz")
    with api.db() as db:
        intelligence.save_config(db, {"ai_mode": "nunca"})
    body = api.post(f"/api/technologies/{tid}/suggest-classification").json()
    assert body["learning"] is False and body["similar"] == []
    assert body["cluster_method"] in ("sin_evidencia", "reglas")
    assert {"cluster_id", "cluster_name", "cluster_reason", "tech_type_id", "tech_type_name", "tech_type_reason"} <= set(body)


def test_learning_can_be_turned_off(api):  # noqa: F811
    _labeled(api)
    tid = _tech(api, "Cardionova", "marcapasos para insuficiencia cardiaca")
    with api.db() as db:
        intelligence.save_config(db, {"enabled": False, "ai_mode": "nunca"})
    body = api.post(f"/api/technologies/{tid}/suggest-classification").json()
    assert body["learning"] is False and body["similar"] == []


def test_a_signal_like_a_discarded_one_is_flagged(api):  # noqa: F811
    sid = api.add_source()
    gone = _tech(api, "Paracetamol tableta", "paracetamol tableta 500 mg analgesico de venta libre uso amplio", sid=sid)
    api.post("/api/technologies/staging/discard", json={"technology_ids": [gone], "reason": "Venta libre, ya conocida"})
    tid = _tech(api, "Paracetamol tableta nueva marca", "paracetamol tableta 500 mg analgesico de venta libre uso amplio")
    with api.db() as db:
        intelligence.save_config(db, {"ai_mode": "nunca"})
    hint = api.post(f"/api/technologies/{tid}/suggest-classification").json()["discard_hint"]
    assert hint and hint["count"] == 1 and "Venta libre" in hint["reason"] and "descartó" in hint["message"]


def test_the_ai_arbitrates_with_the_team_examples_in_view(api, monkeypatch):  # noqa: F811
    (c1, _c2, _c3), (t1, _t2) = _labeled(api, 3)
    tid = _tech(api, "Ambigua", "producto en investigacion sin palabras del catalogo")
    with api.db() as db:
        names = {c.id: c.name for c in db.query(Cluster).all()}
        types = {t.id: t.name for t in db.query(TechType).all()}
        intelligence.save_config(db, {"ai_mode": "siempre"})
    seen = {}

    def fake_generate(prompt, system=None, **kw):
        seen["prompt"], seen["system"] = prompt, system
        return ('Claro: {"cluster": "%s", "tipologia": "%s", "condicion": "emergente", "confianza": 82, "motivo": "Por el mecanismo"}'
                % (names[c1], types[t1]), "modelo-prueba")

    monkeypatch.setattr(intelligence, "ai_available", lambda: True)
    monkeypatch.setattr(ai_service, "generate", fake_generate)
    body = api.post(f"/api/technologies/{tid}/suggest-classification").json()
    assert body["ai_used"] is True and body["ai_model"] == "modelo-prueba"
    assert body["cluster_id"] == c1 and body["cluster_method"] in ("ia", "ia_confirma") and body["cluster_confidence"] >= 82
    assert body["condition"] == "emergente"
    assert names[c1] in seen["prompt"] and "Ambigua" in seen["prompt"] and "JSON" in seen["system"]


def test_an_ai_answer_outside_the_catalog_or_broken_is_ignored(api, monkeypatch):  # noqa: F811
    tid = _tech(api, "Ambigua", "producto en investigacion sin palabras del catalogo")
    with api.db() as db:
        intelligence.save_config(db, {"ai_mode": "siempre"})
    monkeypatch.setattr(intelligence, "ai_available", lambda: True)
    monkeypatch.setattr(ai_service, "generate", lambda *a, **k: ('{"cluster": "Cluster inventado", "tipologia": "", "confianza": 99}', "m"))
    body = api.post(f"/api/technologies/{tid}/suggest-classification").json()
    assert body["cluster_id"] is None or body["cluster_method"] != "ia"
    monkeypatch.setattr(ai_service, "generate", lambda *a, **k: ("no es json", "m"))
    assert api.post(f"/api/technologies/{tid}/suggest-classification").json()["ai_used"] is False
    # Un error del proveedor trae JSON propio: no es una respuesta de clasificacion.
    error = '[Error MiniMax HTTP 401: {"type":"error","error":{"message":"invalid api key"}}]'
    monkeypatch.setattr(ai_service, "generate", lambda *a, **k: (error, "m"))
    assert api.post(f"/api/technologies/{tid}/suggest-classification").json()["ai_used"] is False
    monkeypatch.setattr(ai_service, "generate", lambda *a, **k: ('{"type": "error"}', "m"))
    assert api.post(f"/api/technologies/{tid}/suggest-classification").json()["ai_used"] is False

    def boom(*a, **k):
        raise RuntimeError("sin red")

    monkeypatch.setattr(ai_service, "generate", boom)
    assert api.post(f"/api/technologies/{tid}/suggest-classification").status_code == 200


def test_acceptance_counts_the_suggestions_the_team_confirmed(api):  # noqa: F811
    (_c1, c2, c3), (_t1, t2) = _labeled(api)
    with api.db() as db:
        intelligence.save_config(db, {"ai_mode": "nunca"})
    kept = _tech(api, "Cardionova", "marcapasos para insuficiencia cardiaca con fraccion de eyeccion")
    changed = _tech(api, "Cardiodos", "valvula aortica implantable para insuficiencia cardiaca")
    for tid in (kept, changed):
        api.post(f"/api/technologies/{tid}/suggest-classification")
    with api.db() as db:
        db.get(Technology, kept).cluster_id, db.get(Technology, kept).tech_type_id = c2, t2
        db.get(Technology, changed).cluster_id, db.get(Technology, changed).tech_type_id = c3, t2
        db.commit()
        out = intelligence.acceptance(db)
    assert (out["suggested"], out["decided"], out["cluster_accepted"], out["type_accepted"]) == (2, 2, 1, 2)


# --------------------------------------------------------------------------- #
#  Calibracion
# --------------------------------------------------------------------------- #
def test_calibration_says_when_there_is_not_enough_data(api):  # noqa: F811
    _labeled(api, 2)
    with api.db() as db:
        out = intelligence.calibrate(db)
        assert out["status"] == "insuficiente" and out["labeled"] == 6
        assert intelligence.load_config(db)["min_confidence"] == intelligence.DEFAULTS["min_confidence"]


def test_calibration_needs_more_than_one_cluster(api):  # noqa: F811
    (c1, _c2, _c3), (t1, _t2) = _catalog(api)
    for i in range(22):
        _tech(api, f"Oncomab {i}", f"{ONCO} estudio {i}", cluster=c1, tech_type=t1)
    with api.db() as db:
        out = intelligence.calibrate(db)
    assert out["status"] == "insuficiente" and "un solo clúster" in out["message"]


def test_calibration_measures_each_method_and_sets_the_parameters(api):  # noqa: F811
    _labeled(api, 9)
    with api.db() as db:
        out = intelligence.calibrate(db, actor="prueba")
        cfg = intelligence.load_config(db)
        assert db.query(AuditLog).filter(AuditLog.action == "intelligence:calibrate").count() == 1
    assert out["status"] == "ok" and out["labeled"] == 27 and out["evaluated"] == 27
    assert out["learned_cluster_accuracy"] >= 0.9 and out["target_met"] is True and out["applied"] is True
    assert 0.3 <= out["min_confidence"] <= 0.9 and cfg["min_confidence"] == out["min_confidence"]
    assert cfg["neighbors"] == out["neighbors"] and out["neighbors"] in (3, 5, 7, 11)
    assert out["majority_baseline"] == pytest.approx(1 / 3, abs=0.01) and out["clusters_with_examples"] == 3
    assert out["combined_cluster_accuracy"] >= out["majority_baseline"]
    assert [b["from"] for b in out["bins"]] == [0.0, 0.2, 0.4, 0.6, 0.8]
    assert all(0.3 <= p["threshold"] <= 0.9 for p in out["curve"])


def test_calibration_can_run_without_changing_the_configuration(api):  # noqa: F811
    _labeled(api, 9)
    with api.db() as db:
        intelligence.save_config(db, {"min_confidence": 0.77, "neighbors": 4})
        out = intelligence.calibrate(db, apply=False)
        cfg = intelligence.load_config(db)
    assert out["applied"] is False and cfg["min_confidence"] == 0.77 and cfg["neighbors"] == 4


def test_background_maintenance_syncs_and_recalibrates_when_there_is_new_work(api):  # noqa: F811
    _labeled(api, 9)
    assert intelligence.auto_maintain(api.Session) == "calibrada"
    assert intelligence.auto_maintain(api.Session) == ""  # nada nuevo
    _tech(api, "Nueva", ONCO)
    assert intelligence.auto_maintain(api.Session) == "sincronizada"
    with api.db() as db:
        intelligence.save_config(db, {"enabled": False})
    _tech(api, "Otra", ONCO)
    assert intelligence.auto_maintain(api.Session) == ""


# --------------------------------------------------------------------------- #
#  Vigencia por anos
# --------------------------------------------------------------------------- #
def test_by_default_every_year_is_accepted(api):  # noqa: F811
    sid = api.add_source()
    with api.db() as db:
        cfg = signal_window.load(db)
        assert signal_window.is_open(cfg) and signal_window.allows(cfg, sid, 1999) and signal_window.allows(cfg, sid, None)
        source = db.get(Source, sid)
        assert signal_window.filter_items(db, source, [{"published_date": "1990-01-01"}]) == ([{"published_date": "1990-01-01"}], 0)
        assert signal_window.label(None, None) == "todos los años"


def test_general_window_and_a_source_with_its_own_range(api):  # noqa: F811
    a, b = api.add_source(title="A"), api.add_source(title="B")
    with api.db() as db:
        signal_window.set_global(db, year_from=2024, year_to=2026)
        signal_window.set_sources(db, [b], year_from=2010)
        cfg = signal_window.load(db)
        assert signal_window.effective(cfg, a) == (2024, 2026, "general")
        assert signal_window.effective(cfg, b) == (2010, None, "fuente")
        assert not signal_window.allows(cfg, a, 2023) and signal_window.allows(cfg, a, 2025) and not signal_window.allows(cfg, a, 2027)
        assert signal_window.allows(cfg, b, 2015) and not signal_window.allows(cfg, b, 2009)
        assert signal_window.allows(cfg, a, None)  # sin fecha: se conserva
        signal_window.set_global(db, year_from=2024, year_to=2026, keep_undated=False)
        assert not signal_window.allows(signal_window.load(db), a, None)
        items = [{"published_date": "2025-03-01"}, {"published_date": "2019"}, {"published_date": ""}]
        kept, dropped = signal_window.filter_items(db, db.get(Source, a), items)
        assert kept == [{"published_date": "2025-03-01"}] and dropped == 2
        assert signal_window.record_allowed(db, db.get(Source, b), "2012-01-01") is True
        assert signal_window.record_allowed(db, db.get(Source, a), "2012-01-01") is False
        # Sin anos, la fuente vuelve a la vigencia general.
        signal_window.set_sources(db, [b])
        assert signal_window.effective(signal_window.load(db), b)[2] == "general"


@pytest.mark.parametrize(("lo", "hi"), [(2030, 2020), (1500, None), (None, 9999), ("abc", None)])
def test_invalid_ranges_are_rejected(api, lo, hi):  # noqa: F811
    with api.db() as db, pytest.raises(ValueError):
        signal_window.set_global(db, year_from=lo, year_to=hi)


def test_a_record_outside_the_window_does_not_enter_the_inbox(api):  # noqa: F811
    from frente_b_support import fixture_record

    sid = api.add_source(connector_config={"records": [
        fixture_record("VIEJA", "Viejomab", published_date="2015-06-01"),
        fixture_record("NUEVA", "Nuevomab", published_date="2026-02-01"),
    ]})
    with api.db() as db:
        signal_window.set_global(db, year_from=2024)
        from app import ingest_service

        job = ingest_service.enqueue(db, [db.get(Source, sid)], triggered_by="prueba")[0]
        ingest_service.run_job(db, job.id)
        names = sorted(t.commercial_name for t in db.query(Technology).all())
    assert names == ["Nuevomab"]


def test_review_and_apply_over_what_is_already_captured_is_reversible(api):  # noqa: F811
    a, b = api.add_source(title="Agencia A"), api.add_source(title="Agencia B")
    old = _tech(api, "Vieja", "x", sid=a, published="2012-05-01")
    _tech(api, "Reciente", "x", sid=a, published="2026-01-10")
    _tech(api, "Sin fecha", "x", sid=a)
    other = _tech(api, "Vieja de B", "x", sid=b, published="2011")
    assert api.post("/api/intelligence/window/preview", json={}).json()["open"] is True
    out = api.put("/api/intelligence/window", json={"scope": "all", "year_from": 2020}).json()
    assert out["label"] == "desde 2020" and out["year_from"] == 2020
    assert {y["year"]: y["signals"] for y in out["years"]} == {2011: 1, 2012: 1, 2026: 1, None: 1}

    preview = api.post("/api/intelligence/window/preview", json={}).json()
    assert preview["inbox"] == 4 and preview["outside"] == 2
    assert {s["source_title"]: s["count"] for s in preview["sources"]} == {"Agencia A": 1, "Agencia B": 1}
    assert api.get("/api/technologies/staging").headers["x-total-count"] == "4"  # revisar no cambia nada

    applied = api.post("/api/intelligence/window/apply", json={"source_ids": [a]}).json()
    assert applied == {"affected": 1, "open": False}
    discarded = api.get("/api/technologies/staging", params={"view": "descartadas"}).json()
    assert [t["id"] for t in discarded] == [old]
    with api.db() as db:
        reason = db.query(AuditLog).filter(AuditLog.action == "staging:discard").one().new_value["reason"]
        assert reason == "Fuera de la vigencia configurada: año 2012 (vigencia desde 2020)"
        assert db.get(Technology, other).status == "capturada_no_asignada"  # la otra fuente no se toco
    # Reversible, como cualquier descarte.
    assert api.post("/api/technologies/staging/restore", json={"technology_ids": [old]}).json()["affected"] == 1

    own = api.put("/api/intelligence/window", json={"scope": "sources", "source_ids": [b], "year_from": 2000}).json()
    row = next(s for s in own["sources"] if s["source_id"] == b)
    assert row["own"] is True and row["label"] == "desde 2000" and own["own_sources"] == 1
    assert api.post("/api/intelligence/window/preview", json={"source_ids": [b]}).json()["outside"] == 0


def test_window_api_validates_and_is_restricted(api):  # noqa: F811
    assert api.put("/api/intelligence/window", json={"scope": "all", "year_from": 2030, "year_to": 2020}).status_code == 422
    assert api.put("/api/intelligence/window", json={"scope": "sources", "source_ids": [], "year_from": 2020}).status_code == 422
    assert api.get("/api/intelligence/window", role="evaluador_tecnico").status_code == 200
    assert api.post("/api/intelligence/window/preview", json={}, role="evaluador_tecnico").status_code == 200
    assert api.put("/api/intelligence/window", json={"scope": "all", "year_from": 2020}, role="evaluador_tecnico").status_code == 403
    assert api.post("/api/intelligence/window/apply", json={}, role="evaluador_tecnico").status_code == 403


# --------------------------------------------------------------------------- #
#  API de configuracion
# --------------------------------------------------------------------------- #
def test_any_profile_reads_the_status_and_only_configuration_managers_change_it(api):  # noqa: F811
    _labeled(api, 2)
    body = api.get("/api/intelligence/status", role="evaluador_tecnico").json()
    assert body["knowledge"]["documents"] == 6 and body["config"]["neighbors"] == 7
    assert body["prompts"]["classify_user"] == intelligence.CLASSIFY_USER_PROMPT and body["ai_modes"] == ["nunca", "desacuerdo", "siempre"]
    for method, path in (("put", "/config"), ("post", "/config/reset"), ("post", "/reindex"), ("post", "/calibrate"), ("post", "/baseline")):
        call = getattr(api, method)
        assert call(f"/api/intelligence{path}", json={}, role="evaluador_tecnico").status_code == 403
    assert api.get("/api/intelligence/knowledge/export", role="evaluador_tecnico").status_code == 403

    saved = api.put("/api/intelligence/config", json={"neighbors": 5, "ai_mode": "nunca", "classify_user": "Propio {signal}"}).json()
    assert saved["config"]["neighbors"] == 5 and saved["prompts"]["classify_user"] == "Propio {signal}"
    assert api.put("/api/intelligence/config", json={"inventado": 1}).status_code == 422
    with api.db() as db:
        log = db.query(AuditLog).filter(AuditLog.action == "intelligence:config").one()
        assert log.new_value == {"neighbors": 5, "ai_mode": "nunca", "classify_user": "Propio {signal}"}
    assert api.post("/api/intelligence/config/reset").json()["config"] == intelligence.DEFAULTS
    assert api.post("/api/intelligence/reindex").json()["result"]["indexed"] == 6
    pack = api.get("/api/intelligence/knowledge/export")
    assert pack.status_code == 200 and len(pack.json()["documents"]) == 6
    found = api.get("/api/intelligence/knowledge", params={"q": "marcapasos cardiaca"}, role="evaluador_tecnico").json()
    assert found["items"][0]["name"].startswith("Cardiodev")
    assert api.get("/api/intelligence/knowledge", params={"q": " "}).json()["items"] == []


# --------------------------------------------------------------------------- #
#  Marco analitico
# --------------------------------------------------------------------------- #
def test_the_analytic_framework_has_four_lenses_and_works_without_ai(api):  # noqa: F811
    (c1, _c2, _c3), (t1, _t2) = _catalog(api)
    noisy = api.add_source(title="Fuente ruidosa")
    api.add_source(title="Fuente callada")
    ids = [_tech(api, f"Ruido {i}", "x", sid=noisy) for i in range(6)]
    api.post("/api/technologies/staging/discard", json={"technology_ids": ids[:4], "reason": "Ruido de captura"})
    for i in range(4):
        _tech(api, f"Oncomab {i}", ONCO, cluster=c1, tech_type=t1, captured=datetime.now(timezone.utc) - timedelta(days=50))
    body = api.get("/api/intelligence/insights", role="evaluador_tecnico").json()
    assert [g["lens"] for g in body["framework"]] == ["descriptivo", "diagnostico", "predictivo", "prescriptivo"]
    f = body["facts"]
    assert f["total"] == 10 and f["discarded"] == 4 and f["pending"] == 2 and f["discard_rate"] == 40
    assert f["silent_sources"] == 1 and f["noisy_sources"][0]["title"] == "Fuente ruidosa" and f["noisy_sources"][0]["rate"] == 67
    assert f["backlog_old"] == 0 and f["concentration"] == 100 and len(body["series"]) == 6
    titles = {i["title"] for g in body["framework"] for i in g["items"]}
    assert {"Señales capturadas", "Fuente con mucho ruido", "Tendencia de captura", "Revisar fuentes con ruido"} <= titles
    assert body["narrative"]["status"] == "sin_ia" and body["narrative"]["text"] == ""


def test_the_ai_reading_uses_only_the_facts_and_is_kept_between_visits(api, monkeypatch):  # noqa: F811
    _tech(api, "Unica", ONCO)
    calls = []

    def fake_generate(prompt, system=None, **kw):
        calls.append(prompt)
        return "Descriptivo: hay 1 señal.", "modelo-prueba"

    monkeypatch.setattr(intelligence, "ai_available", lambda: True)
    monkeypatch.setattr(ai_service, "generate", fake_generate)
    first = api.get("/api/intelligence/insights").json()["narrative"]
    assert first["status"] == "pendiente" and calls == []  # no gasta IA sin que alguien la pida
    made = api.post("/api/intelligence/insights/narrative", role="evaluador_tecnico").json()["narrative"]
    assert made["status"] == "nueva" and made["text"] == "Descriptivo: hay 1 señal." and made["model"] == "modelo-prueba"
    assert '"total": 1' in calls[0] and "Indicadores del sistema" in calls[0]
    again = api.get("/api/intelligence/insights").json()["narrative"]
    assert again["status"] == "guardada" and again["text"] == made["text"] and len(calls) == 1

    with api.db() as db:
        intelligence.save_config(db, {"analytics_ai": False})
    off = api.post("/api/intelligence/insights/narrative").json()["narrative"]
    assert off["status"] == "apagada" and len(calls) == 1


def test_a_failed_ai_reading_keeps_the_previous_one(api, monkeypatch):  # noqa: F811
    _tech(api, "Unica", ONCO)
    monkeypatch.setattr(intelligence, "ai_available", lambda: True)
    monkeypatch.setattr(ai_service, "generate", lambda *a, **k: ("Lectura buena.", "m"))
    api.post("/api/intelligence/insights/narrative")
    monkeypatch.setattr(ai_service, "generate", lambda *a, **k: ("[Error] sin cupo", "m"))
    out = api.post("/api/intelligence/insights/narrative").json()["narrative"]
    assert out["status"] == "error" and out["text"] == "Lectura buena."


def test_slope_and_framework_messages():
    assert analytics_insights._slope([1, 2, 3, 4]) == pytest.approx(1.0)
    assert analytics_insights._slope([5]) == 0.0


# --------------------------------------------------------------------------- #
#  Clasificar: las tres direcciones de la senal
# --------------------------------------------------------------------------- #
def test_the_inbox_row_carries_the_exact_url_the_query_page_and_the_source(api):  # noqa: F811
    sid = api.add_source(title="Agencia", url="https://agencia.example.org/novedades")
    _tech(api, "Cardiovex", "x", sid=sid, url="https://agencia.example.org/ficha/cardiovex")
    row = api.get("/api/technologies/staging").json()[0]
    assert row["signal_url"].startswith("https://agencia.example.org/ficha/cardiovex")
    assert row["source_url"] == "https://agencia.example.org/novedades" and row["source_title"] == "Agencia"


def test_the_scan_prompt_asks_for_the_exact_url_and_the_date():
    from app import prompt_store

    assert "URL EXACTA" in prompt_store.DEFAULT_USER_PROMPT and "AAAA-MM-DD" in prompt_store.DEFAULT_USER_PROMPT
    assert "Trazabilidad" in prompt_store.SCAN_SYSTEM_PROMPT
