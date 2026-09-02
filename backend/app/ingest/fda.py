"""Conector de openFDA / Drugs@FDA (RF01).

Trae aprobaciones recientes de medicamentos y extrae la fecha de la
presentacion, que alimenta el pre-llenado de P5 y el time-to-market.
"""
from __future__ import annotations

from .base import (
    CanonicalRecord,
    Connector,
    ConnectorResult,
    clean_text,
    parse_compact_date,
    register,
    request_json,
)

API_URL = "https://api.fda.gov/drug/drugsfda.json"


class FdaConnector(Connector):
    code = "fda"
    label = "FDA Drugs@FDA (openFDA)"
    description = (
        "Aprobaciones de medicamentos de la FDA. Extrae nombre comercial, "
        "principio activo, titular y fecha de presentacion."
    )
    min_interval = 0.3

    def fetch(self, *, config: dict, url: str = "") -> ConnectorResult:
        config = config or {}
        limit = int(config.get("page_size", 40))
        search = clean_text(config.get("search") or 'products.marketing_status:"Prescription"')
        params = {
            "search": search,
            "sort": "submissions.submission_status_date:desc",
            "limit": max(1, min(limit, 100)),
        }
        data = request_json(
            API_URL,
            params=params,
            connector_code=self.code,
            min_interval=self.min_interval,
        )
        results = data.get("results") or []
        records = [self._to_record(row) for row in results]
        records = [r for r in records if r is not None]
        meta = (data.get("meta") or {}).get("results") or {}
        total = meta.get("total")
        return ConnectorResult(
            records=records,
            message=f"{len(records)} registros de {total if total is not None else 'n/d'} en Drugs@FDA.",
        )

    def _to_record(self, row: dict) -> CanonicalRecord | None:
        openfda = row.get("openfda") or {}
        products = row.get("products") or []
        submissions = row.get("submissions") or []

        brands = _as_list(openfda.get("brand_name"))
        generics = _as_list(openfda.get("generic_name"))
        makers = _as_list(openfda.get("manufacturer_name"))
        app_no = clean_text(row.get("application_number"))
        if not app_no and not brands and not generics:
            return None

        product = products[0] if products else {}
        ingredients = product.get("active_ingredients") or []
        inn = "; ".join(
            clean_text(i.get("name")) for i in ingredients if isinstance(i, dict) and i.get("name")
        ) or (generics[0] if generics else "")

        approval = _latest_submission_date(submissions)
        brand = brands[0] if brands else (product.get("brand_name") or inn or app_no)

        return CanonicalRecord(
            external_id=app_no or clean_text(brand).lower()[:80],
            title=clean_text(brand, 590),
            url=f"https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm"
            + (f"?event=overview.process&ApplNo={app_no[3:]}" if app_no else ""),
            summary=clean_text(
                f"{brand}. {inn}. Titular: {makers[0] if makers else 'n/d'}. "
                f"Forma: {clean_text(product.get('dosage_form'))}.",
                1500,
            ),
            commercial_name=clean_text(brand, 400),
            inn_name=clean_text(inn, 400),
            manufacturer=clean_text(makers[0] if makers else "", 300),
            indication=clean_text(product.get("route"), 2000),
            technology_type="medicamento",
            development_phase="Aprobado",
            horizon="inminente",
            fda_approval_date=parse_compact_date(approval),
            regulatory_status="Aprobado por FDA" if approval else "Registro FDA",
            published_date=approval or "",
            raw=row,
        )


def _as_list(value) -> list[str]:
    if not value:
        return []
    if isinstance(value, list):
        return [clean_text(v) for v in value if v]
    return [clean_text(value)]


def _latest_submission_date(submissions: list) -> str:
    dates = []
    for item in submissions:
        if not isinstance(item, dict):
            continue
        raw = item.get("submission_status_date") or item.get("submission_status_date")
        if raw:
            dates.append(str(raw))
    dates.sort(reverse=True)
    return dates[0] if dates else ""


register(FdaConnector())
