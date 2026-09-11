"""Conector de CTIS (portal publico de ensayos de la UE).

No hay API oficial para terceros. Se consume el JSON que sirve el portal,
con huella de esquema: si cambia, el adaptador se apaga solo.
"""
from __future__ import annotations

from .base import (
    CanonicalRecord,
    Connector,
    ConnectorError,
    ConnectorResult,
    SchemaChanged,
    clean_text,
    find_nct_ids,
    register,
    request_json,
    schema_signature,
)

DEFAULT_URL = "https://euclinicaltrials.eu/ctis-public-api/search"
EXPECTED_ID_KEYS = ("ctNumber", "euCtNumber", "eu_ct_number", "applicationNumber")


class CtisConnector(Connector):
    code = "ctis"
    label = "CTIS (EMA, portal público)"
    description = (
        "Ensayos clínicos de la UE. JSON no contractual del portal; "
        "verifica el esquema en cada corrida y se apaga si cambia."
    )
    min_interval = 1.0
    adapter_version = "1"

    def fetch(self, *, config: dict, url: str = "") -> ConnectorResult:
        config = config or {}
        if "records" in config:
            result = self._from_batch(config.get("records") or [], source="lote local")
            expected = clean_text(config.get("schema_signature"))
            if expected and result.schema_signature and result.schema_signature != expected:
                raise SchemaChanged(
                    f"El esquema de CTIS cambió (esperado {expected}, observado {result.schema_signature}). "
                    "Ingesta suspendida para no persistir basura."
                )
            return result

        endpoint = clean_text(config.get("base_url") or url) or DEFAULT_URL
        page_size = int(config.get("page_size", 40))
        params = {
            "page": 1,
            "size": max(1, min(page_size, 80)),
        }
        params.update(config.get("params") or {})

        try:
            data = request_json(
                endpoint,
                params=params,
                connector_code=self.code,
                min_interval=self.min_interval,
            )
        except ConnectorError as exc:
            raise ConnectorError(
                f"CTIS no respondió con un JSON utilizable ({exc}). "
                "Entregue un lote en connector_config.records o revise el portal."
            ) from exc

        signature = schema_signature(data)
        expected = clean_text(config.get("schema_signature"))
        if expected and signature != expected:
            raise SchemaChanged(
                f"El esquema de CTIS cambió (esperado {expected}, observado {signature}). "
                "Ingesta suspendida para no persistir basura."
            )

        rows = _as_rows(data)
        if rows and not _has_trial_id(rows[0]):
            raise SchemaChanged(
                "CTIS respondió JSON pero sin número EU CT. El contrato del portal cambió."
            )

        records = [self._to_record(row) for row in rows[:page_size]]
        records = [r for r in records if r]
        return ConnectorResult(
            records=records,
            message=f"{len(records)} ensayos del portal CTIS.",
            schema_signature=signature,
            adapter_version=self.adapter_version,
            endpoint=endpoint,
        )

    def _from_batch(self, rows: list, *, source: str) -> ConnectorResult:
        records = [self._to_record(row) for row in rows if isinstance(row, dict)]
        records = [r for r in records if r]
        return ConnectorResult(
            records=records,
            message=f"{len(records)} ensayos CTIS desde {source}.",
            schema_signature=schema_signature(rows),
            adapter_version=self.adapter_version,
        )

    def _to_record(self, row: dict) -> CanonicalRecord | None:
        trial_id = _trial_id(row)
        title = clean_text(
            row.get("title")
            or row.get("fullTitle")
            or row.get("publicTitle")
            or row.get("medicalCondition")
            or trial_id,
            590,
        )
        if not trial_id and not title:
            return None
        sponsor_name = row.get("sponsor") or row.get("sponsorName")
        sponsors = row.get("sponsors")
        if not sponsor_name and isinstance(sponsors, list) and sponsors and isinstance(sponsors[0], dict):
            sponsor_name = sponsors[0].get("name")
        sponsor = clean_text(sponsor_name, 300)
        condition = clean_text(
            row.get("medicalCondition") or row.get("condition") or row.get("indication"),
            2000,
        )
        nct = find_nct_ids(trial_id, title, clean_text(row.get("nctId") or row.get("secondaryIds")))
        return CanonicalRecord(
            external_id=trial_id or title[:80],
            title=title or trial_id,
            url=clean_text(row.get("url") or f"https://euclinicaltrials.eu/search-for-clinical-trials/?lang=en&EUCT={trial_id}", 1000),
            summary=clean_text(condition or title, 1500),
            commercial_name=clean_text(row.get("productName") or title, 400),
            manufacturer=sponsor,
            indication=condition,
            technology_type="medicamento",
            development_phase=clean_text(row.get("phase") or row.get("trialPhase") or "Ensayo UE"),
            horizon="emergente",
            nct_ids=nct,
            regulatory_status=clean_text(row.get("status") or "Ensayo CTIS"),
            raw=row,
        )


def _as_rows(data) -> list[dict]:
    if isinstance(data, list):
        return [r for r in data if isinstance(r, dict)]
    if not isinstance(data, dict):
        return []
    for key in ("data", "results", "studies", "content", "items", "trials"):
        value = data.get(key)
        if isinstance(value, list):
            return [r for r in value if isinstance(r, dict)]
    return []


def _trial_id(row: dict) -> str:
    for key in EXPECTED_ID_KEYS:
        value = clean_text(row.get(key))
        if value:
            return value
    return ""


def _has_trial_id(row: dict) -> bool:
    return bool(_trial_id(row))


register(CtisConnector())
