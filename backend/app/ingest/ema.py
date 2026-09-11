"""Conector de EMA: descarga oficial de tablas, RSS como contingencia.

La EMA no expone REST. El sitio publica tablas descargables que actualiza
cada noche (nivel B). El RSS se conserva solo si la descarga no esta
disponible o no se puede interpretar.
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
    request_bytes,
    request_text,
    schema_signature,
)

DEFAULT_FEED = "https://www.ema.europa.eu/en/rss.xml"
DOWNLOAD_PAGE = "https://www.ema.europa.eu/en/medicines/download-medicine-data"


class EmaConnector(Connector):
    code = "ema"
    label = "EMA medicamentos (descarga + RSS)"
    description = (
        "Tablas oficiales descargables de la EMA, con el canal RSS como "
        "contingencia cuando el archivo no está disponible."
    )
    min_interval = 0.5
    adapter_version = "2"

    def fetch(self, *, config: dict, url: str = "") -> ConnectorResult:
        config = config or {}
        if config.get("records"):
            rows = [r for r in config["records"] if isinstance(r, dict)]
            records = [self._from_table_row(row) for row in rows]
            records = [r for r in records if r]
            return ConnectorResult(
                records=records,
                message=f"{len(records)} medicamentos EMA desde lote local.",
                adapter_version=self.adapter_version,
            )

        mode = (config.get("mode") or "download").lower()
        page_size = int(config.get("page_size", 40))
        if mode != "rss":
            downloaded = self._try_download(config, page_size)
            if downloaded is not None:
                return downloaded
        return self._from_rss(config, url, page_size)

    def _try_download(self, config: dict, page_size: int) -> ConnectorResult | None:
        file_url = clean_text(config.get("download_url") or "")
        if not file_url:
            return None
        try:
            from .file_feed import _parse_tabular

            payload, content_type = request_bytes(
                file_url,
                connector_code=self.code,
                min_interval=self.min_interval,
            )
            rows = _parse_tabular(payload, content_type, {"download_url": file_url})
        except Exception:
            return None
        records = [self._from_table_row(row) for row in rows[: max(1, min(page_size, 200))]]
        records = [r for r in records if r]
        if not records:
            return None
        return ConnectorResult(
            records=records,
            message=f"{len(records)} medicamentos de la tabla descargable de la EMA.",
            schema_signature=schema_signature(rows[:3]),
            adapter_version=self.adapter_version,
            endpoint=file_url,
        )

    def _from_rss(self, config: dict, url: str, page_size: int) -> ConnectorResult:
        feed = clean_text(config.get("feed_url") or url or DEFAULT_FEED) or DEFAULT_FEED
        if "download-medicine-data" in feed:
            feed = DEFAULT_FEED
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
            message=f"{len(records)} items del canal RSS de la EMA (contingencia).",
            partial=True,
            adapter_version=self.adapter_version,
            endpoint=feed,
        )

    def _from_table_row(self, row: dict) -> CanonicalRecord | None:
        name = clean_text(
            row.get("Medicine name")
            or row.get("Name of medicine")
            or row.get("medicine_name")
            or row.get("name")
            or row.get("title"),
            590,
        )
        inn = clean_text(
            row.get("International non-proprietary name")
            or row.get("INN")
            or row.get("inn_name")
            or row.get("Active substance"),
            400,
        )
        if not name and not inn:
            return None
        maker = clean_text(
            row.get("Marketing authorisation holder")
            or row.get("Company")
            or row.get("manufacturer"),
            300,
        )
        approval = clean_text(
            row.get("Marketing authorisation date")
            or row.get("Date of authorisation")
            or row.get("authorisation_date")
        )
        ident = clean_text(row.get("EMA product number") or row.get("Product number") or name or inn)
        return CanonicalRecord(
            external_id=ident[:180],
            title=name or inn,
            url=DOWNLOAD_PAGE,
            summary=clean_text(f"{name or inn}. {inn}. Titular: {maker or 'n/d'}.", 1500),
            commercial_name=(name or inn)[:400],
            inn_name=inn,
            manufacturer=maker,
            technology_type="medicamento",
            development_phase="Autorizado EMA" if approval else "Registro EMA",
            horizon="inminente" if approval else "transicional",
            ema_approval_date=parse_compact_date(approval),
            regulatory_status="Autorizado EMA" if approval else "Publicacion EMA",
            published_date=approval or "",
            raw=row,
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
