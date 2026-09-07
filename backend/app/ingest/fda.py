"""Conector openFDA multiconjunto (RF01 / D-06).

Cubre drug/drugsfda, device/510k, device/pma y, si se declara, classification.
Una sola superficie de parametros (search, sort, limit, skip) y datos de
dominio publico. La llave de api.data.gov multiplica el cupo.
"""
from __future__ import annotations

from ..config import settings
from .base import (
    CanonicalRecord,
    Connector,
    ConnectorResult,
    clean_text,
    parse_compact_date,
    register,
    request_json,
    schema_signature,
)

BASE = "https://api.fda.gov"
DEFAULT_DATASETS = ("drug/drugsfda", "device/510k", "device/pma")


class FdaConnector(Connector):
    code = "fda"
    label = "FDA openFDA (multiconjunto)"
    description = (
        "Aprobaciones de medicamentos y dispositivos. Extrae nombre comercial, "
        "principio activo, titular y fecha de presentacion o decision."
    )
    min_interval = 0.25
    adapter_version = "2"

    def fetch(self, *, config: dict, url: str = "") -> ConnectorResult:
        config = config or {}
        datasets = config.get("datasets") or list(DEFAULT_DATASETS)
        if isinstance(datasets, str):
            datasets = [datasets]
        limit = int(config.get("page_size", 40))
        per_set = max(1, min(limit, 100))
        api_key = clean_text(config.get("api_key") or settings.openfda_api_key)

        records: list[CanonicalRecord] = []
        messages = []
        signatures = []
        last_endpoint = ""
        for dataset in datasets:
            slug = dataset.strip().strip("/")
            endpoint = f"{BASE}/{slug}.json"
            params = {
                "limit": per_set,
                "sort": _sort_for(slug),
            }
            search = clean_text(config.get("search") or "")
            if search:
                params["search"] = search
            elif slug == "drug/drugsfda":
                params["search"] = 'products.marketing_status:"Prescription"'
            if api_key:
                params["api_key"] = api_key
            data = request_json(
                endpoint,
                params=params,
                connector_code=self.code,
                min_interval=self.min_interval,
            )
            rows = data.get("results") or []
            mapped = [self._to_record(row, slug) for row in rows]
            mapped = [r for r in mapped if r is not None]
            records.extend(mapped)
            total = ((data.get("meta") or {}).get("results") or {}).get("total")
            messages.append(f"{slug}: {len(mapped)}/{total if total is not None else 'n/d'}")
            signatures.append(schema_signature(data))
            last_endpoint = endpoint

        return ConnectorResult(
            records=records,
            message="; ".join(messages) or "openFDA sin resultados.",
            schema_signature=signatures[0] if signatures else None,
            adapter_version=self.adapter_version,
            endpoint=last_endpoint,
        )

    def _to_record(self, row: dict, dataset: str) -> CanonicalRecord | None:
        if dataset.startswith("device/"):
            return self._device_record(row, dataset)
        return self._drug_record(row)

    def _drug_record(self, row: dict) -> CanonicalRecord | None:
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
            url=(
                "https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm"
                + (f"?event=overview.process&ApplNo={app_no[3:]}" if app_no else "")
            ),
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

    def _device_record(self, row: dict, dataset: str) -> CanonicalRecord | None:
        openfda = row.get("openfda") or {}
        name = clean_text(
            row.get("device_name")
            or row.get("generic_name")
            or (openfda.get("device_name") or [None])[0]
            or row.get("applicant"),
            590,
        )
        ident = clean_text(
            row.get("k_number")
            or row.get("pma_number")
            or row.get("registration_number")
            or row.get("product_code")
            or name[:80]
        )
        if not name and not ident:
            return None
        maker = clean_text(
            row.get("applicant")
            or row.get("sponsor_name")
            or (openfda.get("manufacturer_name") or [None])[0],
            300,
        )
        decision = clean_text(
            row.get("decision_date")
            or row.get("date_received")
            or row.get("fed_reg_notice_date")
        )
        kind = "510(k)" if "510k" in dataset else "PMA" if "pma" in dataset else "dispositivo"
        return CanonicalRecord(
            external_id=ident or name[:80],
            title=name or ident,
            url="https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfPMN/pmn.cfm"
            if "510k" in dataset
            else "https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpma/pma.cfm",
            summary=clean_text(f"{name}. {kind}. Titular: {maker or 'n/d'}.", 1500),
            commercial_name=clean_text(name, 400),
            manufacturer=maker,
            technology_type="dispositivo",
            development_phase="Aprobado",
            horizon="inminente",
            fda_approval_date=parse_compact_date(decision),
            regulatory_status=f"FDA {kind}",
            published_date=decision,
            raw=row,
        )


def _sort_for(dataset: str) -> str:
    if dataset == "drug/drugsfda":
        return "submissions.submission_status_date:desc"
    if "510k" in dataset:
        return "decision_date:desc"
    if "pma" in dataset:
        return "decision_date:desc"
    return "decision_date:desc"


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
        raw = item.get("submission_status_date")
        if raw:
            dates.append(str(raw))
    dates.sort(reverse=True)
    return dates[0] if dates else ""


register(FdaConnector())
