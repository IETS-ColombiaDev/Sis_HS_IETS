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
    adapter_version = "2"

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

        endpoint = clean_text(config.get("base_url") or "")
        if not endpoint and "ctis-public-api" in (url or ""):
            endpoint = clean_text(url)
        endpoint = endpoint or DEFAULT_URL
        page_size = int(config.get("page_size", 40))
        # El portal solo acepta POST con paginacion y orden en el cuerpo; un GET
        # recibe 403 "Missing Authentication Token" del API Gateway.
        body = {
            "pagination": {"page": 1, "size": max(1, min(page_size, 80))},
            "sort": {"property": "decisionDate", "direction": "DESC"},
            "searchCriteria": dict(config.get("search_criteria") or {}),
        }

        try:
            data = request_json(
                endpoint,
                json_body=body,
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
            row.get("ctTitle")
            or row.get("title")
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
            row.get("conditions") or row.get("medicalCondition") or row.get("condition") or row.get("indication"),
            2000,
        )
        phase = clean_text(row.get("trialPhase") or row.get("phase") or "Ensayo UE")
        product = clean_text(row.get("product") or row.get("productName"), 400)
        decided = clean_text(row.get("decisionDateOverall"))
        nct = find_nct_ids(trial_id, title, clean_text(row.get("nctId") or row.get("secondaryIds")))
        return CanonicalRecord(
            external_id=trial_id or title[:80],
            title=title or trial_id,
            url=clean_text(row.get("url") or f"https://euclinicaltrials.eu/search-for-clinical-trials/?lang=en&EUCT={trial_id}", 1000),
            summary=clean_text(
                ". ".join(
                    p
                    for p in (
                        title,
                        f"Fase: {phase}" if phase else "",
                        f"Condicion: {condition}" if condition else "",
                        f"Producto: {product}" if product else "",
                        f"Promotor: {sponsor}" if sponsor else "",
                        f"Autorizado en la UE: {decided}" if decided else "",
                    )
                    if p
                ),
                1500,
            ),
            commercial_name=product or clean_text(row.get("shortTitle") or title, 400),
            manufacturer=sponsor,
            indication=condition,
            technology_type="medicamento",
            development_phase=phase,
            horizon=_horizon_for_phase(phase),
            nct_ids=nct,
            regulatory_status=clean_text(row.get("status") or "Ensayo CTIS"),
            published_date=decided,
            raw=row,
        )


def _horizon_for_phase(phase: str) -> str:
    text = (phase or "").lower()
    if "phase iii" in text or "phase iv" in text or "(phase 3" in text:
        return "inminente"
    if "phase ii" in text or "phase 2" in text:
        return "transicional"
    return "emergente"


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
