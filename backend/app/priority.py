"""Puntaje de cribado de senales capturadas (`screening_score`).

ATENCION metodologica: este puntaje **no es** el indice de priorizacion %P.
Tras la fase 2 del plan de actualizacion, el motor oficial de priorizacion es la
matriz binaria P1 a P6 implementada en `priority_engine.py`.

Esta heuristica continua (0 a 100) se conserva con un unico proposito: ordenar
la cola de trabajo de senales que todavia no han sido calificadas, para que el
tecnico atienda primero las que probablemente merezcan entrar al ciclo. No
gobierna transiciones de estado ni se presenta como puntaje de priorizacion.

Todos los puntos, palabras clave y el umbral de destaque son parametros
`screening.*` editables en Configuracion > Gobierno metodologico. `DEFAULTS`
guarda los valores de fabrica (los mismos que siembra `methodology.PARAM_SEED`).
"""
from __future__ import annotations

# Valores de fabrica. Cada uno tiene su parametro `screening.<clave>`.
DEFAULTS: dict[str, int | str] = {
    "points_inminente": 35,
    "points_transicional": 25,
    "points_emergente": 15,
    "points_tech_type": 12,
    "tech_types": "medicamento,dispositivo,digital",
    "points_regulatory": 18,
    "keywords_regulatory": "phase iii,phase 3,fase iii,aprob,approv,regulator,nice,fda,ema",
    "points_trial": 10,
    "keywords_trial": "phase ii,phase 2,fase ii,ensayo,trial",
    "points_area": 8,
    "points_summary": 10,
    "summary_min_chars": 120,
    "points_identified": 7,
    "queue_threshold": 70,
}

# Parametro de la base que gobierna cada peso (Configuracion > Gobierno metodologico).
PARAM_KEYS: dict[str, str] = {
    "points_inminente": "screening.points_inminente",
    "points_transicional": "screening.points_transicional",
    "points_emergente": "screening.points_emergente",
    "points_tech_type": "screening.points_tech_type",
    "tech_types": "screening.tech_types",
    "points_regulatory": "screening.points_regulatory",
    "keywords_regulatory": "screening.keywords_regulatory",
    "points_trial": "screening.points_trial",
    "keywords_trial": "screening.keywords_trial",
    "points_area": "screening.points_area",
    "points_summary": "screening.points_summary",
    "summary_min_chars": "screening.summary_min_chars",
    "points_identified": "screening.points_identified",
    "queue_threshold": "screening.queue_threshold",
}

# Umbral de destaque de fabrica. El vigente sale de `screening_threshold(db)`.
SCREENING_QUEUE_THRESHOLD = int(DEFAULTS["queue_threshold"])


def _words(value) -> tuple[str, ...]:
    return tuple(w.strip().lower() for w in str(value or "").split(",") if w.strip())


def screening_weights(db=None) -> dict:
    """Pesos vigentes del cribado: parametros de la base, o los de fabrica."""
    weights = dict(DEFAULTS)
    if db is None:
        return weights
    try:
        from .models import MethodologyParam

        by_param = {param: name for name, param in PARAM_KEYS.items()}
        for row in db.query(MethodologyParam).filter(MethodologyParam.key.in_(list(by_param))).all():
            key = by_param[row.key]
            if isinstance(DEFAULTS[key], int):
                try:
                    weights[key] = int(float(row.value))
                except (TypeError, ValueError):
                    pass
            else:
                weights[key] = row.value or ""
    except Exception:  # noqa: BLE001 - sin tabla (pruebas, arranque) valen los de fabrica
        pass
    return weights


def screening_threshold(db=None) -> int:
    return int(screening_weights(db)["queue_threshold"])


def compute_screening_score(
    *,
    horizon: str = "",
    technology_type: str = "",
    phase: str = "",
    therapeutic_area: str = "",
    summary: str = "",
    technology: str = "",
    title: str = "",
    weights: dict | None = None,
) -> int:
    """Heuristica transparente de cribado alineada con senales de horizon scanning."""
    w = weights or DEFAULTS
    score = 0
    h = (horizon or "").lower().strip()
    if h in ("inminente", "transicional", "emergente"):
        score += int(w[f"points_{h}"])

    t = (technology_type or "").lower().strip()
    if t and t in _words(w["tech_types"]):
        score += int(w["points_tech_type"])

    blob = f"{phase} {title} {technology} {summary}".lower()
    if any(x in blob for x in _words(w["keywords_regulatory"])):
        score += int(w["points_regulatory"])
    elif any(x in blob for x in _words(w["keywords_trial"])):
        score += int(w["points_trial"])

    if (therapeutic_area or "").strip():
        score += int(w["points_area"])
    if len((summary or "").strip()) >= int(w["summary_min_chars"]):
        score += int(w["points_summary"])
    if (technology or "").strip() and technology.lower() not in (title or "").lower():
        score += int(w["points_identified"])

    return min(100, max(0, score))


def is_queue_highlight(score: int, threshold: int | None = None) -> bool:
    """Indica si la senal debe destacarse en la cola de cribado."""
    return score >= (SCREENING_QUEUE_THRESHOLD if threshold is None else threshold)


def rescore_all(db) -> int:
    """Recalcula el cribado de todas las senales y sus tecnologias. Devuelve cuantas cambiaron."""
    from .models import Finding, Technology

    weights = screening_weights(db)
    changed = 0
    for f in db.query(Finding).all():
        score = compute_screening_score(
            horizon=f.horizon,
            technology_type=f.technology_type,
            phase=f.phase,
            therapeutic_area=f.therapeutic_area,
            summary=f.summary,
            technology=f.technology,
            title=f.title,
            weights=weights,
        )
        if f.screening_score != score:
            f.screening_score = score
            changed += 1
    if changed:
        db.flush()
        for tech in db.query(Technology).filter(Technology.finding_id.isnot(None)).all():
            finding = db.get(Finding, tech.finding_id)
            if finding is not None and tech.screening_score != finding.screening_score:
                tech.screening_score = finding.screening_score or 0
    return changed


# Alias de compatibilidad con el codigo previo a la fase 2.
compute_priority_score = compute_screening_score
