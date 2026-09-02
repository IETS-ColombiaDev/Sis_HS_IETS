"""Conector de WHO ICTRP (RF01).

El registro de la OMS no ofrece un REST estable comparable al de
ClinicalTrials.gov. El adaptador acepta dos modos:

- una URL JSON configurada (exportacion o espejo institucional);
- un lote de registros ya descargados, para pruebas de contrato y para la
  ruta de contingencia cuando el portal no responde.

Asi un corte de la fuente no rompe el mapeo ni obliga a reconsultar.
"""
from __future__ import annotations

from .base import (
    CanonicalRecord,
    Connector,
    ConnectorError,
    ConnectorResult,
    clean_text,
    find_nct_ids,
    parse_compact_date,
    register,
    request_json,
)


class WhoIctprConnector(Connector):
    code = "who_ictrp"
    label = "WHO ICTRP"
    description = (
        "Registro Internacional de Ensayos Clinicos de la OMS. Se alimenta de "
        "un espejo JSON o de un lote descargado; el portal oficial no garantiza API."
    )
    min_interval = 0.6

    def fetch(self, *, config: dict, url: str = "") -> ConnectorResult:
        config = config or {}
        if config.get("records"):
            records = [self._to_record(row) for row in config["records"]]
            records = [r for r in records if r is not None]
            return ConnectorResult(
                records=records,
                message=f"{len(records)} registros ICTRP cargados desde lote local.",
            )

        endpoint = clean_text(config.get("api_url") or url)
        if not endpoint:
            raise ConnectorError(
                "WHO ICTRP no tiene un REST publico estable. Configure api_url "
                "o entregue un lote en connector_config.records."
            )

        data = request_json(
            endpoint,
            connector_code=self.code,
            min_interval=self.min_interval,
        )
        rows = data if isinstance(data, list) else (data.get("studies") or data.get("results") or [])
        records = [self._to_record(row) for row in rows]
        records = [r for r in records if r is not None]
        return ConnectorResult(
            records=records,
            message=f"{len(records)} estudios del espejo ICTRP.",
        )

    def _to_record(self, row: dict) -> CanonicalRecord | None:
        if not isinstance(row, dict):
            return None
        trial_id = clean_text(
            row.get("TrialID") or row.get("trial_id") or row.get("id") or row.get("nct_id")
        )
        title = clean_text(
            row.get("Public_title") or row.get("Scientific_title") or row.get("title"),
            590,
        )
        if not trial_id and not title:
            return None
        nct = find_nct_ids(trial_id, title, clean_text(row.get("Secondary_IDs") or row.get("url")))
        if trial_id.upper().startswith("NCT"):
            nct = list(dict.fromkeys([trial_id.upper(), *nct]))
        return CanonicalRecord(
            external_id=trial_id or title[:80],
            title=title or trial_id,
            url=clean_text(row.get("url") or row.get("web_address"), 1000),
            summary=clean_text(row.get("Scientific_title") or row.get("condition") or "", 1500),
            commercial_name=clean_text(row.get("Intervention") or title, 400),
            inn_name=clean_text(row.get("Intervention"), 400),
            manufacturer=clean_text(row.get("Primary_sponsor") or row.get("sponsor"), 300),
            indication=clean_text(row.get("Condition") or row.get("condition"), 2000),
            technology_type="medicamento",
            development_phase=clean_text(row.get("Phase") or row.get("phase"), 120),
            horizon="emergente",
            nct_ids=nct,
            phase3_completion_date=parse_compact_date(
                row.get("Date_of_registration") or row.get("last_update")
            ),
            regulatory_status=clean_text(row.get("Recruitment_status") or "Ensayo ICTRP"),
            published_date=clean_text(row.get("last_update") or row.get("Date_of_registration")),
            raw=row,
        )


register(WhoIctprConnector())
