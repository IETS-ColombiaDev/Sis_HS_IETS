"""Conector de Health Canada: MDALL y Drug Product Database (nivel A)."""
from __future__ import annotations

from .base import (
    CanonicalRecord,
    Connector,
    ConnectorResult,
    clean_text,
    register,
    request_json,
    schema_signature,
)

MDALL_URL = "https://health-products.canada.ca/api/medical-devices/device/"
DPD_URL = "https://health-products.canada.ca/api/drug/drugproduct/"


class HealthCanadaConnector(Connector):
    code = "health_canada"
    label = "Health Canada (MDALL / DPD)"
    description = (
        "API oficial de dispositivos médicos y de productos farmacéuticos. "
        "Aporta nombre, titular y estado regulatorio."
    )
    min_interval = 0.4
    adapter_version = "1"

    def fetch(self, *, config: dict, url: str = "") -> ConnectorResult:
        config = config or {}
        dataset = (config.get("dataset") or "").lower()
        if not dataset:
            dataset = "drug" if "drug" in (url or config.get("base_url") or "") else "medical-devices"
        limit = int(config.get("page_size", 50))
        if dataset in {"drug", "dpd", "drugproduct"}:
            return self._fetch_drugs(config, limit)
        return self._fetch_devices(config, limit)

    def _fetch_devices(self, config: dict, limit: int) -> ConnectorResult:
        endpoint = clean_text(config.get("base_url") or MDALL_URL) or MDALL_URL
        params = dict(config.get("params") or {"type": "json", "state": "active"})
        data = request_json(
            endpoint,
            params=params,
            connector_code=self.code,
            min_interval=self.min_interval,
        )
        rows = _as_rows(data)
        records = [self._device_record(row) for row in rows[: max(1, min(limit, 200))]]
        records = [r for r in records if r]
        return ConnectorResult(
            records=records,
            message=f"{len(records)} dispositivos activos de Health Canada MDALL.",
            schema_signature=schema_signature(data),
            adapter_version=self.adapter_version,
            endpoint=endpoint,
        )

    def _fetch_drugs(self, config: dict, limit: int) -> ConnectorResult:
        endpoint = clean_text(config.get("base_url") or DPD_URL) or DPD_URL
        params = dict(config.get("params") or {"type": "json"})
        data = request_json(
            endpoint,
            params=params,
            connector_code=self.code,
            min_interval=self.min_interval,
        )
        rows = _as_rows(data)
        records = [self._drug_record(row) for row in rows[: max(1, min(limit, 200))]]
        records = [r for r in records if r]
        return ConnectorResult(
            records=records,
            message=f"{len(records)} productos de Health Canada DPD.",
            schema_signature=schema_signature(data),
            adapter_version=self.adapter_version,
            endpoint=endpoint,
        )

    def _device_record(self, row: dict) -> CanonicalRecord | None:
        ident = clean_text(
            row.get("device_identifier")
            or row.get("id")
            or row.get("licence_name")
            or row.get("orig_licence_no")
        )
        name = clean_text(
            row.get("device_name")
            or row.get("trade_name")
            or row.get("licence_name")
            or ident,
            590,
        )
        if not name and not ident:
            return None
        maker = clean_text(
            row.get("company_name") or row.get("manufacturer") or row.get("licence_holder"),
            300,
        )
        return CanonicalRecord(
            external_id=ident or name[:80],
            title=name or ident,
            url="https://health-products.canada.ca/mdall-limh/",
            summary=clean_text(f"{name}. Titular: {maker or 'n/d'}.", 1500),
            commercial_name=name[:400],
            manufacturer=maker,
            technology_type="dispositivo",
            development_phase="Autorizado",
            horizon="inminente",
            regulatory_status="Registro Health Canada (MDALL)",
            raw=row,
        )

    def _drug_record(self, row: dict) -> CanonicalRecord | None:
        ident = clean_text(row.get("drug_code") or row.get("id") or row.get("din"))
        brand = clean_text(row.get("brand_name") or row.get("product_name") or ident, 590)
        if not brand and not ident:
            return None
        inn = clean_text(row.get("descriptor") or row.get("ingredient_name") or "", 400)
        maker = clean_text(row.get("company_name") or row.get("manufacturer"), 300)
        return CanonicalRecord(
            external_id=ident or brand[:80],
            title=brand or ident,
            url="https://health-products.canada.ca/dpd-bdpp/",
            summary=clean_text(f"{brand}. {inn}. Titular: {maker or 'n/d'}.", 1500),
            commercial_name=brand[:400],
            inn_name=inn,
            manufacturer=maker,
            technology_type="medicamento",
            development_phase="Autorizado",
            horizon="inminente",
            regulatory_status="Registro Health Canada (DPD)",
            raw=row,
        )


def _as_rows(data) -> list[dict]:
    if isinstance(data, list):
        return [r for r in data if isinstance(r, dict)]
    if not isinstance(data, dict):
        return []
    for key in ("results", "data", "devices", "products", "items"):
        value = data.get(key)
        if isinstance(value, list):
            return [r for r in value if isinstance(r, dict)]
    return [data]


register(HealthCanadaConnector())
