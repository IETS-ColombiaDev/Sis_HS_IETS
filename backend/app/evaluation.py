"""Catalogos de la evaluacion temprana (fase 5: RF13-RF16).

D-07 y D-09 siguen abiertas: el nivel de producto se sugiere desde los
puntos de la matriz y se puede sobreescribir por tecnologia. Los umbrales
viven en `methodology_params`, no en este archivo.
"""
from __future__ import annotations

PRODUCT_LEVELS = ("ficha", "informe", "mini_hta")

PRODUCT_LEVEL_LABELS = {
    "ficha": "Ficha técnica",
    "informe": "Informe de evaluación temprana",
    "mini_hta": "Mini-HTA",
}

EDITORIAL_STATUSES = (
    "borrador",
    "revision_interna",
    "revision_externa",
    "con_observaciones",
    "aprobado_comite",
    "publicado",
)

EDITORIAL_STATUS_LABELS = {
    "borrador": "Borrador en redacción",
    "revision_interna": "Revisión interna de calidad",
    "revision_externa": "Revisión externa por pares",
    "con_observaciones": "Con observaciones",
    "aprobado_comite": "Aprobado por comité técnico",
    "publicado": "Publicado",
}

# Maquina de estados del documento. Toda transicion queda versionada y auditada.
EDITORIAL_TRANSITIONS: dict[str, tuple[str, ...]] = {
    "borrador": ("revision_interna",),
    "revision_interna": ("revision_externa", "borrador"),
    "revision_externa": ("con_observaciones", "aprobado_comite"),
    "con_observaciones": ("borrador",),
    "aprobado_comite": ("publicado",),
    "publicado": (),
}

# Campos del RF13 (ficha) y los que anaden informe y Mini-HTA (RF14).
FICHA_FIELDS: tuple[str, ...] = (
    "health_condition",
    "mechanism",
    "target_population_co",
    "evidence_state",
    "comparators_sgsss",
    "adoption_risks",
)

INFORME_EXTRA_FIELDS: tuple[str, ...] = (
    "narrative",
    "evidence_phases",
    "efficacy_outcomes",
    "safety_outcomes",
)

MINI_HTA_EXTRA_FIELDS: tuple[str, ...] = (
    "pico_population",
    "pico_intervention",
    "pico_comparator",
    "pico_outcome",
    "budget_year_1",
    "budget_year_2",
    "budget_year_3",
    "clinical_uncertainty",
)

# D-12 sigue abierta: el campo se captura pero no dispara el Mini-HTA.
OPTIONAL_FIELDS: tuple[str, ...] = (
    "early_dialogue_notes",
    "confidential_note",
)

FIELD_LABELS: dict[str, str] = {
    "health_condition": "Condición de salud",
    "mechanism": "Mecanismo biológico o tecnológico",
    "target_population_co": "Población objetivo en Colombia",
    "evidence_state": "Estado del arte de la evidencia clínica",
    "comparators_sgsss": "Comparadores posibles en el SGSSS",
    "adoption_risks": "Riesgos potenciales de adopción",
    "narrative": "Narrativa del informe",
    "evidence_phases": "Fases de ensayos y desenlaces",
    "efficacy_outcomes": "Desenlaces de eficacia",
    "safety_outcomes": "Desenlaces de seguridad",
    "pico_population": "PICO: población",
    "pico_intervention": "PICO: intervención",
    "pico_comparator": "PICO: comparador",
    "pico_outcome": "PICO: desenlace",
    "budget_year_1": "Impacto presupuestal año 1",
    "budget_year_2": "Impacto presupuestal año 2",
    "budget_year_3": "Impacto presupuestal año 3",
    "clinical_uncertainty": "Incertidumbre clínica",
    "early_dialogue_notes": "Notas de diálogo temprano",
    "confidential_note": "Nota de confidencialidad",
}

REQUIRED_FIELDS: dict[str, tuple[str, ...]] = {
    "ficha": FICHA_FIELDS,
    "informe": FICHA_FIELDS + INFORME_EXTRA_FIELDS,
    "mini_hta": FICHA_FIELDS + INFORME_EXTRA_FIELDS + MINI_HTA_EXTRA_FIELDS,
}

REVIEW_KINDS = ("interno", "externo")
REVIEW_VERDICTS = ("aprobado", "observado")


def empty_body() -> dict:
    keys = FICHA_FIELDS + INFORME_EXTRA_FIELDS + MINI_HTA_EXTRA_FIELDS + OPTIONAL_FIELDS
    return {key: "" for key in keys}


def required_fields(level: str) -> tuple[str, ...]:
    return REQUIRED_FIELDS.get(level, FICHA_FIELDS)


def missing_fields(body: dict | None, level: str) -> list[str]:
    data = body or {}
    missing: list[str] = []
    for key in required_fields(level):
        if not str(data.get(key) or "").strip():
            missing.append(key)
    return missing
