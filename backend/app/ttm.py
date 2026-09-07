"""Motor de time-to-market (RF17). Decision D-10 parametrizada, no cerrada.

Parte de la fecha de cierre de fase III y de un plazo de revision regulatoria
configurable. Las franjas por defecto reutilizan las etiquetas del horizonte
(emergente / transicion / inminente) porque la especificacion las deja abiertas
a la revision de NIHRIO.
"""
from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy.orm import Session

from .methodology import get_param
from .models import Technology

TTM_BANDS = ("inminente", "transicion", "emergente", "lejano", "desconocido")

TTM_BAND_LABELS = {
    "inminente": "Inminente",
    "transicion": "Transicion",
    "emergente": "Emergente",
    "lejano": "Lejano",
    "desconocido": "Sin dato suficiente",
}


def _as_date(value) -> date | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value
    return None


def estimate_months(tech: Technology, *, as_of: date | None = None, review_days: int = 180) -> tuple[float | None, str]:
    """Devuelve (meses hasta llegada esperada, base del calculo)."""
    today = as_of or date.today()
    phase3 = _as_date(tech.phase3_completion_date)
    approvals = [
        d
        for d in (
            _as_date(tech.fda_approval_date),
            _as_date(tech.ema_approval_date),
        )
        if d is not None
    ]
    if approvals:
        first = min(approvals)
        months = round((first - today).days / 30.44, 2)
        return max(months, 0.0), "aprobacion_agencia"

    if (tech.invima_registry or "").strip():
        return 0.0, "registro_invima"

    if phase3 is None:
        return None, "sin_fase_iii"

    expected = phase3 + timedelta(days=int(review_days or 0))
    months = round((expected - today).days / 30.44, 2)
    return max(months, 0.0), "fase_iii_mas_revision"


def classify_months(db: Session, months: float | None) -> str:
    """D-10: umbrales en methodology_params."""
    if months is None:
        return "desconocido"
    inminente = float(get_param(db, "ttm.inminente_months_max", 12) or 12)
    transicion = float(get_param(db, "ttm.transicion_months_max", 24) or 24)
    emergente = float(get_param(db, "ttm.emergente_months_max", 36) or 36)
    if months <= inminente:
        return "inminente"
    if months <= transicion:
        return "transicion"
    if months <= emergente:
        return "emergente"
    return "lejano"


def compute_for(db: Session, tech: Technology, *, as_of: date | None = None) -> dict:
    review = int(get_param(db, "ttm.regulatory_review_days", 180) or 180)
    months, basis = estimate_months(tech, as_of=as_of, review_days=review)
    band = classify_months(db, months)
    return {
        "months": months,
        "band": band,
        "band_label": TTM_BAND_LABELS.get(band, band),
        "basis": basis,
    }
