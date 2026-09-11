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
        "principio activo, titular y fecha de presentación o decisión."
    )
    min_interval = 0.25
    adapter_version = "3"

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

        regulatory = drug_regulatory(submissions)
        approval = regulatory["approval_date"]
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
            development_phase="Aprobado" if approval else "En revision regulatoria",
            horizon="inminente",
            # Solo la aprobacion de la solicitud original (ORIG con estado AP) es
            # "aprobacion FDA". Un suplemento de etiquetado no lo es, y una fecha
            # de sometimiento va al estado del tramite (P6), nunca aqui (P5 y TTM).
            fda_approval_date=parse_compact_date(approval),
            regulatory_status=regulatory["status"],
            published_date=approval or regulatory["last_date"] or "",
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
        kind = "510(k)" if "510k" in dataset else "PMA" if "pma" in dataset else "dispositivo"
        regulatory = device_regulatory(row, kind)
        decision = regulatory["approval_date"]
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
            development_phase="Aprobado" if decision else "En revision regulatoria",
            horizon="inminente",
            fda_approval_date=parse_compact_date(decision),
            regulatory_status=regulatory["status"],
            published_date=decision or regulatory["last_date"],
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


def _iso(raw: str) -> str:
    value = parse_compact_date(raw)
    return value.isoformat() if value else ""


# Estados de drugs@FDA: AP aprobada, TA aprobacion tentativa (patentes/exclusividad
# pendientes, no comercializable). Cualquier otro estado es tramite en curso.
APPROVED_STATUSES = {"AP"}
TENTATIVE_STATUSES = {"TA"}


def drug_regulatory(submissions: list) -> dict:
    """Aprobacion y estado del tramite a partir de las solicitudes de drugs@FDA.

    - Aprobacion = fecha de la solicitud ORIGINAL (ORIG) aprobada (AP). Los
      suplementos (SUPPL) cambian etiquetado o fabricacion: no son aprobacion.
    - Aprobacion tentativa (TA) no es aprobacion: queda en el estado.
    - Si no hay aprobacion, la ultima fecha de sometimiento va al estado del
      tramite ("Sometido a revision FDA (...)"), que es lo que lee P6.
    """
    items = [s for s in submissions or [] if isinstance(s, dict)]
    orig = [s for s in items if str(s.get("submission_type") or "").upper() == "ORIG"]
    approved = sorted(
        str(s.get("submission_status_date") or "")
        for s in orig
        if str(s.get("submission_status") or "").upper() in APPROVED_STATUSES and s.get("submission_status_date")
    )
    dates = sorted(str(s.get("submission_status_date") or "") for s in items if s.get("submission_status_date"))
    last = _iso(dates[-1]) if dates else ""
    if approved:
        return {"approval_date": approved[0], "status": "Aprobado por FDA", "last_date": last}
    tentative = sorted(
        str(s.get("submission_status_date") or "")
        for s in orig
        if str(s.get("submission_status") or "").upper() in TENTATIVE_STATUSES
    )
    if tentative:
        return {"approval_date": "", "status": f"Aprobacion tentativa FDA ({_iso(tentative[-1])})", "last_date": last}
    if items:
        return {"approval_date": "", "status": f"Sometido a revision FDA ({last or 'fecha n/d'})", "last_date": last}
    return {"approval_date": "", "status": "Registro FDA sin solicitudes", "last_date": ""}


def device_regulatory(row: dict, kind: str) -> dict:
    """Decision de dispositivos: solo una decision favorable es aprobacion.

    510(k): decision_code SE* (sustancialmente equivalente) = autorizado.
    PMA: decision_code APPR = aprobado. `date_received` es la fecha en que se
    sometio la solicitud: sin decision favorable va al estado del tramite.
    """
    code = clean_text(row.get("decision_code")).upper()
    decision_date = clean_text(row.get("decision_date"))
    received = clean_text(row.get("date_received"))
    description = clean_text(row.get("decision_description")).lower()
    # Sin codigo, una fecha de decision se toma como favorable salvo que la
    # descripcion diga lo contrario (openFDA publica sobre todo lo autorizado).
    negative = any(word in description for word in ("not substantially", "denied", "withdrawn", "deny"))
    if kind == "510(k)":
        favorable = code.startswith("SE") if code else (bool(decision_date) and not negative)
    elif kind == "PMA":
        favorable = code in {"APPR", "APRL"} if code else (bool(decision_date) and not negative)
    else:
        favorable = bool(decision_date) and not negative
    if favorable and decision_date:
        return {"approval_date": decision_date, "status": f"Autorizado por FDA ({kind})", "last_date": decision_date}
    if decision_date and code:
        return {"approval_date": "", "status": f"Decision FDA {kind} desfavorable ({code})", "last_date": decision_date}
    if received:
        return {"approval_date": "", "status": f"Sometido a revision FDA ({kind}, {_iso(received) or received})", "last_date": received}
    return {"approval_date": "", "status": f"FDA {kind}", "last_date": ""}


register(FdaConnector())
