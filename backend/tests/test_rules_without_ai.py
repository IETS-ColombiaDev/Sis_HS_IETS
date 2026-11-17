"""Extraccion por reglas cuando la IA y el OCR no estan disponibles.

Los titulos son reales: salen de la primera vigilancia del inventario por enlace
(17-11-2026) corrida con la IA apagada.
"""
from __future__ import annotations

import pytest

from app import scraper
from app.scraper import _classify_type, _is_pipeline_row, is_navigation_title, rules_gate

KEEP = [
    "U.S. FDA Approves Subcutaneous Induction Regimen for AbbVie's SKYRIZI® (risankizumab-rzaa) for Crohn's",
    "AbbVie Announces Topline Results from the Phase 3 INTREPID Trial Showing Lutikizumab Significantly Improved",
    "FOUNDAYO orforglipron (as calcium) 9 mg film coated tablet blister pack (522875)",
    "Wegovy (semaglutide)",
    "Scientists Wipe Out Deadly Brain Tumors in Every Mouse Tested with New Cancer Therapy",
    "New Wearable Ultrasound Patch Boosts REM Sleep Without Drugs or Surgery",
    "AI Finds Hidden Risk of Sudden Cardiac Death",
    "AbbVie Presents Data for ABBV-466, a Novel Dual-Targeting Therapy Demonstrating Higher Endoscopic Response",
    "GlaxoSmithKline Receives FDA Approval for New RSV Vaccine",
]
DROP = [
    # Menus y secciones
    "Device Approvals and Clearances",
    "2024 Device Approvals",
    "2021 Device Approvals (Archived)",
    "Humanitarian Device Exemptions (HDE)",
    "Humanitarian Device Exemptions (HDE): Listing of devices that have been approved to treat or diagnose a disease "
    "or condition that affects fewer than 4,000 individuals in the United States per year.",
    "Products and Medical Procedures",
    "Medical Aesthetics & Treatment",
    "Health & Medicine",
    # Ciencia o tecnologia general, sin salud
    "Einstein's Equations Reveal How Gravity Could Break, Reconnect, and Release Energy",
    "NASA Launches $1 Million Moon Base Challenge",
    "Caltech Robot Makes History by Building a Structure in Space",
    "Magnetic Breakthrough Could Transform AI Chips",
    # Corporativo y administrativo
    "AbbVie Named Official Pharmaceutical Partner of the McLaren Mastercard Formula 1 Team",
    "AbbVie Completes Acquisition of Apogee Therapeutics - Sep 3, 2026",
    "Australian Regulatory Guidelines for OTC Medicines (ARGOM)",
    "Reporting adverse events for health professionals",
    "Vapes: information for pharmacists",
    "Charting the Course for Future Innovation",
    # Tarjetas de navegacion y descripciones de listados
    "Clinical trialsInnovationClinical trials are essential to determine whether new drugs or diagnostics work",
    "Genentech PipelineOur R&D activities are focused on applying excellent science to discover new medicines",
    "PMA Approvals: Listings of all new or high-risk medical devices that were approved via the premarket approval",
    "510(k) Clearances: Listings of new devices that have been shown to be substantially equivalent",
]


@pytest.mark.parametrize("title", KEEP)
def test_real_technology_signals_pass(title):
    assert rules_gate([{"title": title, "summary": ""}]) != []


@pytest.mark.parametrize("title", DROP)
def test_menus_general_science_and_corporate_news_are_dropped(title):
    assert rules_gate([{"title": title, "summary": ""}]) == []


def test_page_level_summary_does_not_make_items_look_relevant():
    page = "Latest health and medicine news: new drugs, devices and therapies."
    items = [{"title": t, "summary": page} for t in ("Robot Builds in Space for the First Time", "AI Makes Laser Simulations 250x Faster", "Moon Bases")]
    assert rules_gate(items) == []


def test_pipeline_rows_are_always_kept():
    row = {"title": "AMO959 · Prostate cancer (Phase 1)", "summary": ""}
    assert rules_gate([row], _is_pipeline_row) == [row]


def test_navigation_title_detection():
    assert is_navigation_title("2023 Device Approvals")
    assert not is_navigation_title("AbbVie Presents Data for ABBV-466 in Ulcerative Colitis")
    assert not is_navigation_title("SKYRIZI® approval")


@pytest.mark.parametrize(
    "text,expected",
    [
        ("New Cancer Therapy wipes out tumors", "medicamento"),  # antes "therap" no reconocia "Therapy"
        ("Common Osteoporosis Drugs Linked to Lower Dementia Risk", "medicamento"),
        ("Two new cardiac devices cleared", "dispositivo"),  # antes "device" no reconocia "devices"
        ("Implants for hearing loss", "dispositivo"),
    ],
)
def test_type_classification_recognizes_word_stems(text, expected):
    assert _classify_type(text) == expected


def test_enrichment_without_ai_applies_the_rules_gate(monkeypatch):
    from app import ai_service

    monkeypatch.setattr(ai_service, "web_assist_enabled", lambda: False)
    monkeypatch.setattr(ai_service, "ocr_enabled", lambda: False)
    data = [
        {"title": "2024 Device Approvals", "summary": ""},
        {"title": "FDA Approves New Gene Therapy for Hemophilia B", "summary": ""},
    ]
    out = scraper._enrich_with_ai(data, source_title="X", source_url="https://x.org", ai_decides=True)
    assert [d["title"] for d in out] == ["FDA Approves New Gene Therapy for Hemophilia B"]


def test_enrichment_failure_falls_back_to_rules(monkeypatch):
    from app import ai_service, ai_web

    monkeypatch.setattr(ai_service, "web_assist_enabled", lambda: True)
    monkeypatch.setattr(ai_service, "ocr_enabled", lambda: False)

    def boom(**kw):
        raise TimeoutError("IA sin respuesta")

    monkeypatch.setattr(ai_web, "extract_from_page", boom)
    data = [{"title": "Contact us", "summary": ""}, {"title": "Wegovy (semaglutide)", "summary": ""}]
    out = scraper._enrich_with_ai(data, source_title="X", source_url="https://x.org", ai_decides=True)
    assert [d["title"] for d in out] == ["Wegovy (semaglutide)"]
