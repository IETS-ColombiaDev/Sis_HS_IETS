"""Motor de time-to-market (RF17). Decision D-10 parametrizada, no cerrada.

Parte de la fecha de cierre de fase III y de un plazo de revision regulatoria
configurable. Las franjas por defecto reutilizan las etiquetas del horizonte
(emergente / transicion / inminente) porque la especificacion las deja abiertas
a la revision de NIHRIO.

Regla (parametros `ttm.*`):

1. Si la tecnologia tiene aprobacion de FDA o EMA, la fecha de referencia es la
   primera de ellas (`aprobacion_agencia`).
2. Si no, pero tiene registro INVIMA, ya esta en el mercado colombiano
   (`registro_invima`, 0 meses).
3. Si no, fecha de cierre de fase III + `ttm.regulatory_review_days`
   (`fase_iii_mas_revision`).
4. Sin ninguna de las anteriores no hay estimacion (`sin_fase_iii`): el meses es
   `None` y la franja `desconocido`. "Sin dato" nunca se confunde con 0 meses.

`months` es el plazo hasta la llegada esperada, acotado en 0: una fecha de
referencia ya cumplida significa "ya deberia estar en el mercado". Para no
esconder esa diferencia, `estimate` devuelve tambien `months_raw` (con signo),
la fecha de referencia y la marca `overdue` (la fecha esperada ya paso sin
aprobacion) o `approved` (la aprobacion ya ocurrio).

Franjas: `months <= inminente_max` -> inminente; `<= transicion_max` ->
transicion; `<= emergente_max` -> emergente; mayor -> lejano. Los topes son
inclusivos y se fuerzan a ser crecientes para que las franjas sean contiguas.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from sqlalchemy.orm import Session

from .methodology import get_param
from .models import Technology

TTM_BANDS = ("inminente", "transicion", "emergente", "lejano", "desconocido")

TTM_BAND_LABELS = {
    "inminente": "Inminente",
    "transicion": "Transición",
    "emergente": "Emergente",
    "lejano": "Lejano",
    "desconocido": "Sin dato suficiente",
}

TTM_BASIS_LABELS = {
    "aprobacion_agencia": "Aprobación FDA/EMA",
    "registro_invima": "Registro INVIMA vigente",
    "fase_iii_mas_revision": "Fin de fase III + revisión regulatoria",
    "sin_fase_iii": "Sin fecha de fase III ni aprobación",
}

# Dias promedio por mes usados en toda la plataforma (365.25 / 12).
DAYS_PER_MONTH = 30.44

DEFAULTS = {
    "ttm.inminente_months_max": 12,
    "ttm.transicion_months_max": 24,
    "ttm.emergente_months_max": 36,
    "ttm.regulatory_review_days": 180,
}


# Colombia no aplica horario de verano: UTC-5 fijo.
COLOMBIA_TZ = timezone(timedelta(hours=-5))


def today_co() -> date:
    """Fecha de hoy en Colombia: el "hoy" de todos los calculos de TTM."""
    return datetime.now(COLOMBIA_TZ).date()


def _as_date(value) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _param_number(db: Session, key: str) -> float:
    """Lee un parametro numerico sin confundir 0 con 'no configurado'."""
    raw = get_param(db, key, DEFAULTS[key])
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return float(DEFAULTS[key])
    return value if value >= 0 else float(DEFAULTS[key])


def load_params(db: Session) -> dict:
    """Umbrales y plazo vigentes. Se leen una vez por calculo agregado."""
    inminente = _param_number(db, "ttm.inminente_months_max")
    transicion = max(_param_number(db, "ttm.transicion_months_max"), inminente)
    emergente = max(_param_number(db, "ttm.emergente_months_max"), transicion)
    return {
        "inminente": inminente,
        "transicion": transicion,
        "emergente": emergente,
        "review_days": int(_param_number(db, "ttm.regulatory_review_days")),
    }


def _months_between(start: date, end: date) -> float:
    return round((end - start).days / DAYS_PER_MONTH, 2)


def estimate(tech: Technology, *, as_of: date | None = None, review_days: int = 180) -> dict:
    """Estimacion completa: meses (>= 0), meses con signo, base y fecha de referencia."""
    today = as_of or today_co()
    approvals = [
        d
        for d in (_as_date(tech.fda_approval_date), _as_date(tech.ema_approval_date))
        if d is not None
    ]
    if approvals:
        reference = min(approvals)
        raw = _months_between(today, reference)
        return {
            "months": max(raw, 0.0),
            "months_raw": raw,
            "basis": "aprobacion_agencia",
            "reference_date": reference,
            "approved": reference <= today,
            "overdue": False,
        }

    if (tech.invima_registry or "").strip():
        return {
            "months": 0.0,
            "months_raw": 0.0,
            "basis": "registro_invima",
            "reference_date": None,
            "approved": True,
            "overdue": False,
        }

    phase3 = _as_date(tech.phase3_completion_date)
    if phase3 is None:
        return {
            "months": None,
            "months_raw": None,
            "basis": "sin_fase_iii",
            "reference_date": None,
            "approved": False,
            "overdue": False,
        }

    reference = phase3 + timedelta(days=int(review_days if review_days is not None else 180))
    raw = _months_between(today, reference)
    return {
        "months": max(raw, 0.0),
        "months_raw": raw,
        "basis": "fase_iii_mas_revision",
        "reference_date": reference,
        "approved": False,
        "overdue": raw < 0,
    }


def estimate_months(tech: Technology, *, as_of: date | None = None, review_days: int = 180) -> tuple[float | None, str]:
    """Devuelve (meses hasta llegada esperada, base del calculo)."""
    result = estimate(tech, as_of=as_of, review_days=review_days)
    return result["months"], result["basis"]


def classify_with(params: dict, months: float | None) -> str:
    if months is None:
        return "desconocido"
    if months <= params["inminente"]:
        return "inminente"
    if months <= params["transicion"]:
        return "transicion"
    if months <= params["emergente"]:
        return "emergente"
    return "lejano"


def classify_months(db: Session, months: float | None) -> str:
    """D-10: umbrales en methodology_params."""
    return classify_with(load_params(db), months)


def compute_with(params: dict, tech: Technology, *, as_of: date | None = None) -> dict:
    result = estimate(tech, as_of=as_of, review_days=params["review_days"])
    band = classify_with(params, result["months"])
    reference = result["reference_date"]
    return {
        "months": result["months"],
        "months_raw": result["months_raw"],
        "band": band,
        "band_label": TTM_BAND_LABELS.get(band, band),
        "basis": result["basis"],
        "basis_label": TTM_BASIS_LABELS.get(result["basis"], result["basis"]),
        "reference_date": reference.isoformat() if reference else None,
        "approved": result["approved"],
        "overdue": result["overdue"],
    }


def compute_for(db: Session, tech: Technology, *, as_of: date | None = None) -> dict:
    return compute_with(load_params(db), tech, as_of=as_of)
