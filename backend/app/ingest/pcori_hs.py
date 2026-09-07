"""Conector de PCORI Health Care Horizon Scanning System."""
from __future__ import annotations

from .base import (
    CanonicalRecord,
    Connector,
    ConnectorError,
    ConnectorResult,
    clean_text,
    parse_compact_date,
    register,
    request_json,
    request_text,
    schema_signature,
)

DEFAULT_URL = "https://horizonscandb.pcori.org/"


class PcoriHsConnector(Connector):
    code = "pcori_hs"
    label = "PCORI Horizon Scanning"
    description = (
        "Base publica de horizon scanning operada con ECRI. Fichas fechadas "
        "por tecnologia y seis areas de interes."
    )
    min_interval = 1.0
    adapter_version = "1"

    def fetch(self, *, config: dict, url: str = "") -> ConnectorResult:
        config = config or {}
        if config.get("records"):
            rows = [r for r in config["records"] if isinstance(r, dict)]
            records = [self._to_record(row) for row in rows]
            records = [r for r in records if r]
            return ConnectorResult(
                records=records,
                message=f"{len(records)} fichas PCORI desde lote local.",
                adapter_version=self.adapter_version,
            )

        endpoint = clean_text(config.get("api_url") or "")
        if endpoint:
            data = request_json(
                endpoint,
                params=config.get("params") or {},
                connector_code=self.code,
                min_interval=self.min_interval,
            )
            rows = data if isinstance(data, list) else (
                data.get("results") or data.get("data") or data.get("technologies") or []
            )
            records = [self._to_record(row) for row in rows if isinstance(row, dict)]
            records = [r for r in records if r]
            return ConnectorResult(
                records=records,
                message=f"{len(records)} fichas de PCORI.",
                schema_signature=schema_signature(data),
                adapter_version=self.adapter_version,
                endpoint=endpoint,
                partial=False,
            )

        page = clean_text(config.get("base_url") or url) or DEFAULT_URL
        html = request_text(
            page,
            connector_code=self.code,
            min_interval=self.min_interval,
            accept="text/html,application/xhtml+xml",
        )
        records = _from_html(html)
        if not records:
            raise ConnectorError(
                "PCORI no expuso JSON ni fichas parseables en la portada. "
                "Configure api_url o entregue un lote en connector_config.records."
            )
        return ConnectorResult(
            records=records,
            message=f"{len(records)} fichas extraidas de la portada de PCORI.",
            partial=True,
            adapter_version=self.adapter_version,
            endpoint=page,
        )

    def _to_record(self, row: dict) -> CanonicalRecord | None:
        title = clean_text(
            row.get("title") or row.get("technology") or row.get("name") or row.get("intervention"),
            590,
        )
        ident = clean_text(row.get("id") or row.get("hs_id") or row.get("slug") or title[:80])
        if not title and not ident:
            return None
        updated = clean_text(row.get("updated_at") or row.get("last_updated") or row.get("date"))
        area = clean_text(row.get("area") or row.get("condition") or row.get("indication"), 2000)
        return CanonicalRecord(
            external_id=ident or title[:80],
            title=title or ident,
            url=clean_text(row.get("url") or DEFAULT_URL, 1000),
            summary=clean_text(row.get("summary") or area or title, 1500),
            commercial_name=title[:400],
            indication=area,
            therapeutic_area=area[:300],
            technology_type="medicamento",
            development_phase="Priorizacion externa",
            horizon="emergente",
            published_date=updated,
            phase3_completion_date=parse_compact_date(updated),
            regulatory_status="Ficha PCORI",
            raw=row,
        )


def _from_html(html: str) -> list[CanonicalRecord]:
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        return []
    soup = BeautifulSoup(html, "lxml")
    records: list[CanonicalRecord] = []
    for card in soup.select("article, .card, .technology, li")[:40]:
        link = card.find("a")
        title = clean_text(card.find(["h1", "h2", "h3", "h4"]).get_text() if card.find(["h1", "h2", "h3", "h4"]) else "")
        if not title and link:
            title = clean_text(link.get_text(), 590)
        href = clean_text(link.get("href") if link else "")
        if not title:
            continue
        records.append(
            CanonicalRecord(
                external_id=href or title[:80],
                title=title,
                url=href,
                summary=clean_text(card.get_text(" "), 1500),
                commercial_name=title[:400],
                technology_type="otro",
                development_phase="Priorizacion externa",
                horizon="emergente",
                regulatory_status="Ficha PCORI",
                raw={"title": title, "url": href, "html": True},
            )
        )
    return records


register(PcoriHsConnector())
