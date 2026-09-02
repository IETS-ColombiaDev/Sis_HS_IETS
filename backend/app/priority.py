"""Puntaje de cribado de senales capturadas (`screening_score`).

ATENCION metodologica: este puntaje **no es** el indice de priorizacion %P.
Tras la fase 2 del plan de actualizacion, el motor oficial de priorizacion es la
matriz binaria P1 a P6 implementada en `priority_engine.py`.

Esta heuristica continua (0 a 100) se conserva con un unico proposito: ordenar
la cola de trabajo de senales que todavia no han sido calificadas, para que el
tecnico atienda primero las que probablemente merezcan entrar al ciclo. No
gobierna transiciones de estado ni se presenta como puntaje de priorizacion.
"""
from __future__ import annotations

# Umbral de destaque en la cola de trabajo. No es el umbral de priorizacion.
SCREENING_QUEUE_THRESHOLD = 70


def compute_screening_score(
    *,
    horizon: str = "",
    technology_type: str = "",
    phase: str = "",
    therapeutic_area: str = "",
    summary: str = "",
    technology: str = "",
    title: str = "",
) -> int:
    """Heuristica transparente de cribado alineada con senales de horizon scanning."""
    score = 0
    h = (horizon or "").lower().strip()
    if h == "inminente":
        score += 35
    elif h == "transicional":
        score += 25
    elif h == "emergente":
        score += 15

    t = (technology_type or "").lower().strip()
    if t in ("medicamento", "dispositivo", "digital"):
        score += 12

    blob = f"{phase} {title} {technology} {summary}".lower()
    if any(
        x in blob
        for x in (
            "phase iii", "phase 3", "fase iii", "aprob", "approv",
            "regulator", "nice", "fda", "ema",
        )
    ):
        score += 18
    elif any(x in blob for x in ("phase ii", "phase 2", "fase ii", "ensayo", "trial")):
        score += 10

    if (therapeutic_area or "").strip():
        score += 8
    if len((summary or "").strip()) >= 120:
        score += 10
    if (technology or "").strip() and technology.lower() not in (title or "").lower():
        score += 7

    return min(100, max(0, score))


def is_queue_highlight(score: int) -> bool:
    """Indica si la senal debe destacarse en la cola de cribado."""
    return score >= SCREENING_QUEUE_THRESHOLD


# Alias de compatibilidad con el codigo previo a la fase 2.
compute_priority_score = compute_screening_score
