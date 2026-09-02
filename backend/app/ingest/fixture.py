"""Conector de contrato para pruebas (RF01).

Lee registros ya canonicos desde `connector_config.records`. No sale a la red.
Permite verificar que la cola, el crudo y el staging funcionan cuando las
fuentes externas no estan disponibles, que es el caso de la suite de regresion.
"""
from __future__ import annotations

from .base import CanonicalRecord, Connector, ConnectorResult, parse_compact_date, register


class FixtureConnector(Connector):
    code = "fixture"
    label = "Fixture de contrato (pruebas)"
    description = "No consulta redes. Solo existe para pruebas de contrato y la suite de regresion."
    requires_url = False

    def fetch(self, *, config: dict, url: str = "") -> ConnectorResult:
        rows = (config or {}).get("records") or []
        records = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            records.append(
                CanonicalRecord(
                    external_id=str(row.get("external_id") or ""),
                    title=str(row.get("title") or row.get("external_id") or ""),
                    url=str(row.get("url") or ""),
                    summary=str(row.get("summary") or ""),
                    commercial_name=str(row.get("commercial_name") or row.get("title") or ""),
                    inn_name=str(row.get("inn_name") or ""),
                    manufacturer=str(row.get("manufacturer") or ""),
                    mechanism=str(row.get("mechanism") or ""),
                    indication=str(row.get("indication") or ""),
                    therapeutic_area=str(row.get("therapeutic_area") or ""),
                    technology_type=str(row.get("technology_type") or "medicamento"),
                    development_phase=str(row.get("development_phase") or ""),
                    horizon=str(row.get("horizon") or "emergente"),
                    nct_ids=list(row.get("nct_ids") or []),
                    phase3_completion_date=parse_compact_date(row.get("phase3_completion_date")),
                    fda_approval_date=parse_compact_date(row.get("fda_approval_date")),
                    ema_approval_date=parse_compact_date(row.get("ema_approval_date")),
                    regulatory_status=str(row.get("regulatory_status") or ""),
                    published_date=str(row.get("published_date") or ""),
                    raw=row.get("raw") if isinstance(row.get("raw"), dict) else dict(row),
                )
            )
        records = [r for r in records if r.external_id]
        return ConnectorResult(records=records, message=f"{len(records)} registros de fixture.")


register(FixtureConnector())
