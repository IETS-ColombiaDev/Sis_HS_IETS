"""Conector de Health Canada: MDALL y Drug Product Database (nivel A)."""
from __future__ import annotations

import re

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
LICENCE_URL = "https://health-products.canada.ca/api/medical-devices/licence/"
COMPANY_URL = "https://health-products.canada.ca/api/medical-devices/company/"
DPD_URL = "https://health-products.canada.ca/api/drug/drugproduct/"
INGREDIENT_URL = "https://health-products.canada.ca/api/drug/activeingredient/"
# Clases de riesgo III y IV: implantes, soporte vital, diagnostico critico. Las
# clases I-II (vendas, jeringas, brocas) no son objeto de escaneo de horizonte.
MIN_DEVICE_RISK_CLASS = 3
# Productos de consumo que el DPD registra como "Human" y no son tecnologia sanitaria nueva.
_CONSUMER_RE = re.compile(
    r"soap|sanitiz|hand rub|sunscreen|\bspf\b|toothpaste|mouthwash|disinfect|antiseptic|lotion|"
    r"shampoo|deodorant|lip balm|cleanser|wipes?\b|moisturiz|cosmetic|fluoride|first aid|dandruff|2in1|acne",
    re.I,
)


class HealthCanadaConnector(Connector):
    code = "health_canada"
    label = "Health Canada (MDALL / DPD)"
    description = (
        "API oficial de dispositivos médicos y de productos farmacéuticos. "
        "Aporta nombre, titular y estado regulatorio."
    )
    min_interval = 0.4
    adapter_version = "2"

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
        endpoint = clean_text(config.get("base_url") or "")
        if not endpoint or endpoint.rstrip("/") == MDALL_URL.rstrip("/"):
            return self._fetch_licences(config, limit)
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

    def _fetch_licences(self, config: dict, limit: int) -> ConnectorResult:
        """Licencias activas de alto riesgo, las mas recientes primero.

        El listado de dispositivos completo pesa ~45 MB (156 000 filas) y no
        trae fecha util para ordenar; el de licencias pesa ~10 MB y si.
        """
        data = request_json(
            LICENCE_URL,
            params={"type": "json", "state": "active", "lang": "en"},
            connector_code=self.code,
            min_interval=self.min_interval,
            timeout=90.0,
        )
        min_class = int(config.get("min_risk_class") or MIN_DEVICE_RISK_CLASS)
        rows = [r for r in _as_rows(data) if int(r.get("appl_risk_class") or 0) >= min_class]
        rows.sort(key=lambda r: str(r.get("first_licence_status_dt") or ""), reverse=True)
        rows = rows[: max(1, min(limit, 200))]
        ids = list(dict.fromkeys(r.get("company_id") for r in rows if r.get("company_id")))
        companies = dict(zip(ids, _parallel(_company_name, ids)))
        for row in rows:
            row["company_name"] = companies.get(row.get("company_id"), "")
        records = [self._licence_record(row) for row in rows]
        records = [r for r in records if r]
        return ConnectorResult(
            records=records,
            message=f"{len(records)} licencias recientes de dispositivos clase III-IV (Health Canada MDALL).",
            schema_signature=schema_signature(rows[:3]),
            adapter_version=self.adapter_version,
            endpoint=LICENCE_URL,
        )

    def _licence_record(self, row: dict) -> CanonicalRecord | None:
        number = clean_text(row.get("original_licence_no"))
        name = clean_text(row.get("licence_name"), 590)
        if not number or not name:
            return None
        maker = clean_text(row.get("company_name"), 300)
        issued = clean_text(row.get("first_licence_status_dt"))
        risk = clean_text(row.get("appl_risk_class"))
        kind = clean_text(row.get("licence_type_desc"))
        return CanonicalRecord(
            external_id=f"MDL-{number}",
            title=name.title() if name.isupper() else name,
            url="https://health-products.canada.ca/mdall-limh/",
            summary=clean_text(
                f"{name}. Licencia Health Canada {number} ({kind or 'dispositivo'}), clase de riesgo {risk}. "
                f"Titular: {maker or 'n/d'}. Primera licencia: {issued or 'n/d'}.",
                1500,
            ),
            commercial_name=name[:400],
            manufacturer=maker,
            technology_type="dispositivo",
            development_phase="Autorizado",
            horizon="inminente",
            regulatory_status=f"Licencia Health Canada clase {risk}" if risk else "Registro Health Canada (MDALL)",
            published_date=issued,
            raw=row,
        )

    def _fetch_drugs(self, config: dict, limit: int) -> ConnectorResult:
        endpoint = clean_text(config.get("base_url") or DPD_URL) or DPD_URL
        # status=1: productos con movimiento reciente (~3 700) en lugar del registro
        # historico completo (~15 MB). Se ordena por codigo: los nuevos tienen el mayor.
        params = dict(config.get("params") or {"type": "json", "status": "1", "lang": "en"})
        data = request_json(
            endpoint,
            params=params,
            connector_code=self.code,
            min_interval=self.min_interval,
            timeout=90.0,
        )
        rows = [
            r
            for r in _as_rows(data)
            if str(r.get("class_name") or "Human") in {"Human", "Radiopharmaceutical"}
            and not _CONSUMER_RE.search(str(r.get("brand_name") or ""))
        ]
        rows.sort(key=lambda r: int(r.get("drug_code") or 0) if str(r.get("drug_code") or "").isdigit() else 0, reverse=True)
        wanted = max(1, min(limit, 200))
        records: list[CanonicalRecord] = []
        seen: set[str] = set()
        candidates = []
        for row in rows:
            brand = clean_text(row.get("brand_name")).upper()
            if not brand or brand in seen:
                continue  # una fila por concentracion: basta la primera
            seen.add(brand)
            candidates.append(row)
            if len(candidates) >= wanted * 3:
                break
        found = _parallel(_ingredients, [r.get("drug_code") for r in candidates])
        for row, ingredients in zip(candidates, found):
            if len(records) >= wanted:
                break
            brand = clean_text(row.get("brand_name")).upper()
            # Generico: la marca es el nombre del principio activo ("BISOPROLOL TABLETS").
            if ingredients and any(_base_name(i) in brand for i in ingredients):
                continue
            row["ingredient_name"] = ", ".join(ingredients)
            record = self._drug_record(row)
            if record:
                records.append(record)
        return ConnectorResult(
            records=records,
            message=f"{len(records)} productos recientes de uso humano de Health Canada DPD.",
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
        inn = clean_text(row.get("ingredient_name") or "", 400)
        maker = clean_text(row.get("company_name") or row.get("manufacturer"), 300)
        presentation = clean_text(row.get("descriptor"), 200)
        return CanonicalRecord(
            external_id=ident or brand[:80],
            title=brand or ident,
            url="https://health-products.canada.ca/dpd-bdpp/",
            summary=clean_text(
                ". ".join(
                    p
                    for p in (
                        brand,
                        f"Principio activo: {inn}" if inn else "",
                        presentation,
                        f"Titular: {maker or 'n/d'}",
                        f"DIN {row.get('drug_identification_number')}" if row.get("drug_identification_number") else "",
                    )
                    if p
                ),
                1500,
            ),
            commercial_name=brand[:400],
            inn_name=inn,
            manufacturer=maker,
            technology_type="medicamento",
            development_phase="Autorizado",
            horizon="inminente",
            regulatory_status="Registro Health Canada (DPD)",
            raw=row,
        )


def _parallel(fn, items: list) -> list:
    """Consultas de detalle en paralelo: una a una tardaban minutos por corrida."""
    if not items:
        return []
    from concurrent.futures import ThreadPoolExecutor

    with ThreadPoolExecutor(max_workers=8) as pool:
        return list(pool.map(fn, items))


def _base_name(ingredient: str) -> str:
    """'BISOPROLOL FUMARATE' -> 'BISOPROLOL'; 'AMLODIPINE (AMLODIPINE BESYLATE)' -> 'AMLODIPINE'."""
    words = (ingredient or "").upper().replace("(", " ").split()
    # Palabras cortas ("ZINC", "IRON") darian falsos genericos.
    return words[0] if words and len(words[0]) >= 5 else "\0"


def _ingredients(drug_code) -> list[str]:
    if not drug_code:
        return []
    try:
        data = request_json(
            INGREDIENT_URL,
            params={"type": "json", "lang": "en", "id": drug_code},
            max_attempts=2,
            timeout=20.0,
        )
    except Exception:  # noqa: BLE001
        return []
    names = []
    for row in data if isinstance(data, list) else [data]:
        name = clean_text(row.get("ingredient_name") if isinstance(row, dict) else "", 200)
        if name and name not in names:
            names.append(name)
    return names


def _company_name(company_id) -> str:
    try:
        data = request_json(
            COMPANY_URL,
            params={"type": "json", "lang": "en", "id": company_id},
            max_attempts=2,
            timeout=20.0,
        )
    except Exception:  # noqa: BLE001
        return ""
    row = data[0] if isinstance(data, list) and data else data
    return clean_text(row.get("company_name") if isinstance(row, dict) else "", 300)


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
