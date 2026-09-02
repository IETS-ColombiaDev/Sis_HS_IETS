"""Conector de EMA Human Medicines Highlights (RF01).

La EMA no publica un REST equivalente al de ClinicalTrials.gov. El canal
oficial de highlights es un RSS; el adaptador lo traduce al esquema canonico
y conserva el XML parseado en `raw` para poder reprocesar el mapeo.
"""
from __future__ import annotations

import xml.etree.ElementTree as ET

from .base import (
    CanonicalRecord,
    Connector,
    ConnectorResult,
    clean_text,
    find_nct_ids,
    parse_compact_date,
    register,
    request_text,
)

DEFAULT_FEED = "https://www.ema.europa.eu/en/rss.xml"


class EmaConnector(Connector):
    code = "ema"
    label = "EMA Human Medicines (RSS)"
    description = (
        "Canal RSS de la Agencia Europea de Medicamentos: opiniones del CHMP, "
        "autorizaciones y highlights de medicamentos humanos."
    )
    min_interval = 0.5

    def fetch(self, *, config: dict, url: str = "") -> ConnectorResult:
        config = config or {}
        feed = clean_text(config.get("feed_url") or url or DEFAULT_FEED) or DEFAULT_FEED
        page_size = int(config.get("page_size", 30))
        xml_text = request_text(
            feed,
            connector_code=self.code,
            min_interval=self.min_interval,
        )
        items = _parse_rss(xml_text)[: max(1, min(page_size, 80))]
        records = [self._to_record(item) for item in items]
        records = [r for r in records if r is not None]
        return ConnectorResult(
            records=records,
            message=f"{len(records)} items del canal RSS de la EMA.",
        )

    def _to_record(self, item: dict) -> CanonicalRecord | None:
        title = clean_text(item.get("title"), 590)
        link = clean_text(item.get("link"), 1000)
        if not title:
            return None
        guid = clean_text(item.get("guid") or link or title)[:180]
        summary = clean_text(item.get("description"), 1500)
        published = clean_text(item.get("pubDate") or item.get("published"))
        return CanonicalRecord(
            external_id=guid,
            title=title,
            url=link,
            summary=summary,
            commercial_name=title[:400],
            indication=summary[:2000],
            technology_type="medicamento",
            development_phase="Evaluacion EMA",
            horizon="inminente" if _looks_like_approval(title + " " + summary) else "transicional",
            nct_ids=find_nct_ids(title, summary, link),
            ema_approval_date=parse_compact_date(_rfc822_date(published)),
            regulatory_status="Publicacion EMA",
            published_date=published,
            raw=item,
        )


def _parse_rss(xml_text: str) -> list[dict]:
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as exc:
        from .base import ConnectorError

        raise ConnectorError(f"RSS de la EMA no interpretable: {exc}") from exc

    items = []
    for node in root.iter():
        tag = node.tag.split("}")[-1].lower()
        if tag != "item":
            continue
        entry = {}
        for child in list(node):
            key = child.tag.split("}")[-1]
            entry[key] = (child.text or "").strip()
        if entry:
            items.append(entry)
    return items


def _looks_like_approval(text: str) -> bool:
    lower = (text or "").lower()
    return any(
        token in lower
        for token in (
            "marketing authorisation",
            "positive opinion",
            "chmp",
            "authorised",
            "approved",
        )
    )


def _rfc822_date(value: str) -> str:
    """Convierte 'Tue, 01 Apr 2026 12:00:00 GMT' a YYYY-MM-DD si se puede."""
    text = (value or "").strip()
    if not text:
        return ""
    from email.utils import parsedate_to_datetime

    try:
        return parsedate_to_datetime(text).date().isoformat()
    except (TypeError, ValueError, IndexError):
        return text[:10]


register(EmaConnector())
