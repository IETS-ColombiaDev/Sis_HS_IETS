"""Reglas de horizonte editables (paginas web) y orden de la bandeja."""
from __future__ import annotations

import json
import random
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from frente_b_support import api  # noqa: F401  (fixture)

from app import scraper, settings_store
from app.models import AuditLog, Technology

# Regex historicos de scraper.py, copiados literalmente para comparar.
LEGACY_INMINENTE = re.compile(
    r"\b(launch|approv|marketing author[iz]ation|registro sanitario|aprobad|autorizad|pivotal|phase\s*iii|phase\s*3|fase\s*iii|regulatory|nice ta\b|chmp|positive opinion|fda approv|ema approv|recommend)\b",
    re.I,
)
LEGACY_EMERGENTE = re.compile(
    r"\b(preclinic|pre-clinic|early[- ]stage|phase\s*i\b|phase\s*1\b|fase\s*i\b|phase\s*i/ii|discovery|first-in-human|pipeline|proof of concept)\b",
    re.I,
)
LEGACY_TRANSICIONAL = re.compile(
    r"\b(phase\s*ii\b|phase\s*2\b|fase\s*ii\b|clinical trial|ensayo cl[ií]nico|in development|under (review|evaluation))\b",
    re.I,
)


# Unica diferencia intencional con el regex historico: `author[iz]ation` admitia
# UNA letra ("authoriation", "authorzation") y nunca coincidio con las grafias
# reales. Las reglas por defecto usan "authorization" y "authorisation"; el
# resultado esperado es el regex historico con solo esa alternativa corregida.
_LEGACY_TYPO = "marketing author[iz]ation"
assert LEGACY_INMINENTE.pattern.count(_LEGACY_TYPO) == 1
EXPECTED_INMINENTE = re.compile(
    LEGACY_INMINENTE.pattern.replace(_LEGACY_TYPO, "marketing author(?:iz|is)ation"), re.I
)
# Textos donde el resultado puede cambiar respecto al regex historico.
_INTENTIONAL_DIFF = re.compile(r"marketing\s*author(?:i|z|iz|is)ation", re.I)


def legacy_classify(text: str, inminente: re.Pattern = LEGACY_INMINENTE) -> str:
    if inminente.search(text):
        return "inminente"
    if LEGACY_TRANSICIONAL.search(text):
        return "transicional"
    if LEGACY_EMERGENTE.search(text):
        return "emergente"
    return ""


def expected_classify(text: str) -> str:
    return legacy_classify(text, EXPECTED_INMINENTE)


def expected_any(text: str) -> bool:
    return bool(EXPECTED_INMINENTE.search(text) or LEGACY_TRANSICIONAL.search(text) or LEGACY_EMERGENTE.search(text))


@pytest.fixture(autouse=True)
def _default_rules_cache():
    """La cache es de modulo: cada prueba arranca y termina con las reglas por defecto."""
    scraper._HORIZON_CACHE.update(scraper.compile_horizon_rules(settings_store.default_horizon_rules()), version=None)
    yield
    scraper._HORIZON_CACHE.update(scraper.compile_horizon_rules(settings_store.default_horizon_rules()), version=None)


# --------------------------------------------------------------------------- #
#  Equivalencia con los regex historicos
# --------------------------------------------------------------------------- #
HANDPICKED = [
    "Drug X launch in Europe",
    "FDA approval expected",  # "approval" no es "approv" completo: el regex viejo tampoco coincidia
    "FDA approv",
    "Marketing Authorisation granted",  # diferencia intencional: antes "", ahora inminente
    "marketing authorization application",  # diferencia intencional: antes "", ahora inminente
    "marketing authoriation",  # diferencia intencional: antes inminente (errata), ahora ""
    "marketing authorzation",  # diferencia intencional: antes inminente (errata), ahora ""
    "Registro sanitario INVIMA",
    "Producto aprobado",  # "aprobado" != "aprobad": tampoco coincidia
    "Phase III pivotal study",
    "PHASEIII results",
    "phase 3 trial",
    "phase3",
    "Fase III en Colombia",
    "faseiii",
    "NICE TA guidance",
    "nice tab",
    "CHMP positive opinion",
    "Phase II study of something",
    "phase  ii double space",
    "Phase 2b",  # "2b": sin \b tras el 2, no coincide
    "fase ii",
    "Randomized clinical trial",
    "Ensayo clínico fase temprana",
    "ENSAYO CLÍNICO",
    "ensayo clinico",
    "Currently in development",
    "Under review by EMA",
    "under evaluation",
    "Preclinical data",  # "preclinical" != "preclinic"
    "preclinic",
    "pre-clinic stage",
    "early-stage",
    "Early stage company",
    "Phase I first-in-human",
    "phase 1 dose escalation",
    "Phase I/II",
    "phasei/ii",
    "fase i",
    "Drug discovery platform",
    "Pipeline update",
    "proof of concept",
    "Proof-of-concept",  # con guiones no coincidia
    "Phase IV post-marketing",
    "",
    "Nothing relevant here at all",
    "Recommend for adoption",
    "recommended",
]


def _fixture_texts() -> list[str]:
    texts: list[str] = []
    base = Path(__file__).parent / "fixtures"

    def walk(node):
        if isinstance(node, str):
            texts.append(node)
        elif isinstance(node, dict):
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    for name in ("pipeline_rows.json", "openfda_raw.json"):
        walk(json.loads((base / name).read_text(encoding="utf-8")))
    return texts


def _term_variants() -> list[str]:
    out: list[str] = []
    rules = settings_store.default_horizon_rules()
    for level in settings_store.HORIZON_LEVELS:
        for term in rules[level]:
            for t in (term, term.upper(), term.title()):
                out += [t, f"New {t} for patients", f"{t}s", f"re{t}", f"({t})", f"{t}."]
    return out


def _random_texts(n: int = 4000) -> list[str]:
    rng = random.Random(20261117)
    rules = settings_store.default_horizon_rules()
    pieces = [w for level in settings_store.HORIZON_LEVELS for t in rules[level] for w in t.split()]
    pieces += ["clínico", "Clínico", "aprobado", "approved", "the", "for", "cancer", "drug", "-", "/", ",", "2b", "IV", "trial"]
    texts = []
    for _ in range(n):
        words = rng.choices(pieces, k=rng.randint(1, 8))
        texts.append(" ".join(words))
    return texts


def _corpus() -> list[str]:
    return HANDPICKED + _fixture_texts() + _term_variants() + _random_texts()


def test_default_rules_classify_like_legacy_regex_except_the_documented_fix():
    corpus = _corpus()
    assert len(corpus) > 5000
    mismatches = [(t, expected_classify(t), scraper._classify_horizon(t)) for t in corpus if expected_classify(t) != scraper._classify_horizon(t)]
    assert mismatches == []
    # El bono de horizonte de _relevance_score usa el mismo criterio.
    assert [t for t in corpus if expected_any(t) != bool(scraper._HORIZON_CACHE["any"].search(scraper._fold_accents(t)))] == []


def test_only_difference_with_legacy_regex_is_marketing_authorization():
    """Documenta la unica diferencia intencional frente al regex historico."""
    changed = [t for t in _corpus() if legacy_classify(t) != scraper._classify_horizon(t)]
    assert changed, "la correccion debe notarse en el corpus"
    assert [t for t in changed if not _INTENTIONAL_DIFF.search(t)] == []

    for text in ("Marketing Authorisation granted", "marketing authorization application", "MARKETING AUTHORIZATION"):
        assert legacy_classify(text) == ""
        assert scraper._classify_horizon(text) == "inminente"
    for text in ("marketing authoriation", "marketing authorzation"):
        assert legacy_classify(text) == "inminente"
        assert scraper._classify_horizon(text) == ""


def test_terms_are_escaped_and_case_and_accent_insensitive():
    rules = settings_store.default_horizon_rules()
    rules["emergente"] = ["terapia génica", "c++ tool"]
    scraper._HORIZON_CACHE.update(scraper.compile_horizon_rules(rules))
    assert scraper._classify_horizon("Nueva TERAPIA GENICA") == "emergente"
    assert scraper._classify_horizon("nueva terapia génica") == "emergente"
    # Sin regex: "+" es literal, no un cuantificador.
    assert scraper._classify_horizon("ccc tool") == ""


# --------------------------------------------------------------------------- #
#  Cambio de palabras clave y cache entre procesos
# --------------------------------------------------------------------------- #
def test_changing_a_keyword_changes_classification(api):
    text = "Compassionate use program for drug X"
    assert scraper._classify_horizon(text) == ""

    rules = settings_store.default_horizon_rules()
    rules["emergente"].append("compassionate use")
    res = api.put("/api/config/horizon-rules", json=rules)
    assert res.status_code == 200, res.text
    assert "compassionate use" in res.json()["emergente"]
    # El proceso que recibio el cambio recompila al instante.
    assert scraper._classify_horizon(text) == "emergente"

    rules["inminente"].remove("launch")
    rules["default"] = "transicional"
    api.put("/api/config/horizon-rules", json=rules)
    assert scraper._classify_horizon("Product launch") == "transicional"


def test_other_process_reloads_when_db_version_changes(api):
    with api.db() as db:
        assert scraper.refresh_horizon_rules(db) is True  # primera lectura
        assert scraper.refresh_horizon_rules(db) is False  # misma version: sin recompilar
        # Otro proceso (p. ej. la api) guarda reglas nuevas en la BD...
        rules = settings_store.default_horizon_rules()
        rules["transicional"].append("compassionate use")
        settings_store.save_horizon_rules(db, rules)
        assert scraper._classify_horizon("compassionate use") == ""  # ...este aun no lo sabe
        # ...y este proceso lo detecta por el token de version al iniciar el siguiente escaneo.
        assert scraper.refresh_horizon_rules(db) is True
        assert scraper._classify_horizon("compassionate use") == "transicional"


# --------------------------------------------------------------------------- #
#  API: permisos, validacion y bitacora
# --------------------------------------------------------------------------- #
def test_get_returns_defaults_and_notice(api):
    res = api.get("/api/config/horizon-rules")
    assert res.status_code == 200
    body = res.json()
    assert body["inminente"] == settings_store.DEFAULT_HORIZON_RULES["inminente"]
    assert body["default"] == ""
    assert body["defaults"] == settings_store.DEFAULT_HORIZON_RULES
    assert "las ya capturadas no se reclasifican" in body["notice"]


@pytest.mark.parametrize("role", ["evaluador_tecnico", "evaluador_clinico", "tomador_decisiones", "revisor_pares"])
def test_only_superadmin_can_read_or_edit(api, role):
    assert api.get("/api/config/horizon-rules", role=role).status_code == 403
    assert api.put("/api/config/horizon-rules", role=role, json=settings_store.default_horizon_rules()).status_code == 403


@pytest.mark.parametrize(
    "change",
    [
        {"inminente": []},
        {"emergente": ["  ", ""]},
        {"transicional": ["(regex"]},
        {"transicional": ["phase\\s*"]},
        {"default": "otro"},
    ],
)
def test_invalid_rules_are_rejected(api, change):
    rules = {**settings_store.default_horizon_rules(), **change}
    res = api.put("/api/config/horizon-rules", json=rules)
    assert res.status_code == 422
    with api.db() as db:
        assert settings_store.horizon_rules_version(db) == ""


def test_each_change_is_logged_in_audit(api):
    rules = settings_store.default_horizon_rules()
    rules["emergente"].append("first in class")
    assert api.put("/api/config/horizon-rules", json=rules).status_code == 200
    # Guardar sin cambios no deja ruido en la bitacora.
    assert api.put("/api/config/horizon-rules", json=rules).status_code == 200
    with api.db() as db:
        logs = db.query(AuditLog).filter(AuditLog.action == "config:horizon_rules").all()
    assert len(logs) == 1
    assert set(logs[0].new_value) == {"emergente"}
    assert "first in class" in logs[0].new_value["emergente"]
    assert "first in class" not in logs[0].old_value["emergente"]


# --------------------------------------------------------------------------- #
#  Bandeja: sort=puntaje|recientes
# --------------------------------------------------------------------------- #
def test_staging_sort_by_score_default_and_by_recent(api):
    now = datetime.now(timezone.utc)
    with api.db() as db:
        rows = [
            Technology(commercial_name="Vieja alta", status="capturada_no_asignada", screening_score=90, captured_at=now - timedelta(days=3)),
            Technology(commercial_name="Nueva baja", status="capturada_no_asignada", screening_score=10, captured_at=now),
            Technology(commercial_name="Media", status="capturada_no_asignada", screening_score=50, captured_at=now - timedelta(days=1)),
        ]
        db.add_all(rows)
        db.commit()
        ids = {t.commercial_name: t.id for t in rows}

    def names(**params):
        res = api.get("/api/technologies/staging", params=params)
        assert res.status_code == 200
        return [t["commercial_name"] for t in res.json() if t["id"] in ids.values()]

    assert names() == ["Vieja alta", "Media", "Nueva baja"]
    assert names(sort="puntaje") == ["Vieja alta", "Media", "Nueva baja"]
    assert names(sort="recientes") == ["Nueva baja", "Media", "Vieja alta"]
    assert api.get("/api/technologies/staging", params={"sort": "otro"}).status_code == 422
