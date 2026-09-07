"""Conector de curaduria humana (nivel E).

No sale a la red. Deja constancia de que la fuente exige revision periodica
y, si hay un lote cargado a mano, lo traduce al esquema canonico.
"""
from __future__ import annotations

from .base import CanonicalRecord, Connector, ConnectorResult, clean_text, parse_compact_date, register


class ManualConnector(Connector):
    code = "manual"
    label = "Curaduria humana"
    description = (
        "No hay ruta automatizable razonable. El sistema recuerda la revision "
        "y acepta un lote cargado por el evaluador."
    )
    requires_url = False
    adapter_version = "1"

    def fetch(self, *, config: dict, url: str = "") -> ConnectorResult:
        config = config or {}
        rows = config.get("records") or []
        records = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            title = clean_text(row.get("title") or row.get("commercial_name"), 590)
            ident = clean_text(row.get("external_id") or title[:80])
            if not ident:
                continue
            records.append(
                CanonicalRecord(
                    external_id=ident,
                    title=title or ident,
                    url=clean_text(row.get("url") or url, 1000),
                    summary=clean_text(row.get("summary") or "", 1500),
                    commercial_name=clean_text(row.get("commercial_name") or title, 400),
                    inn_name=clean_text(row.get("inn_name"), 400),
                    manufacturer=clean_text(row.get("manufacturer"), 300),
                    indication=clean_text(row.get("indication"), 2000),
                    technology_type=clean_text(row.get("technology_type") or "otro"),
                    development_phase=clean_text(row.get("development_phase") or "Curaduria"),
                    horizon=clean_text(row.get("horizon") or "emergente"),
                    published_date=clean_text(row.get("published_date")),
                    phase3_completion_date=parse_compact_date(row.get("phase3_completion_date")),
                    raw=row,
                )
            )
        if records:
            return ConnectorResult(
                records=records,
                message=f"{len(records)} registros de curaduria cargados a mano.",
                adapter_version=self.adapter_version,
            )
        return ConnectorResult(
            records=[],
            message=(
                "Fuente de curaduria: no hay lote cargado. "
                "Registre la revision en la ficha y, si aplica, adjunte records."
            ),
            adapter_version=self.adapter_version,
        )


register(ManualConnector())
