"""Conector de EMA: reporte oficial de medicamentos, RSS como contingencia.

La EMA no expone REST. Publica cada noche el reporte "Medicines output" en
JSON (y XLSX) con todos los medicamentos de uso humano y veterinario (nivel B).
Se toman los de uso humano con movimiento mas reciente (opinion CHMP,
autorizacion, inicio de evaluacion). El RSS de noticias queda de contingencia.
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
    request_json,
    request_text,
    schema_signature,
)

DEFAULT_FEED = "https://www.ema.europa.eu/en/news.xml"
DOWNLOAD_PAGE = "https://www.ema.europa.eu/en/medicines/download-medicine-data"
DEFAULT_JSON_REPORT = "https://www.ema.europa.eu/en/documents/report/medicines-output-medicines_json-report_en.json"
# Solo hitos de novedad: la fecha de decision de la Comision cambia con cada
# variacion administrativa y haria subir productos de hace 20 anos.
# Estados que no aportan a un escaneo de horizonte (producto fuera del mercado).
_STALE_STATUS = ("withdrawn", "lapsed", "expired", "revoked")
_DATE_FIELDS = (
    "opinion_adopted_date",
    "marketing_authorisation_date",
    "start_of_evaluation_date",
    "start_of_rolling_review_date",
)


class EmaConnector(Connector):
    code = "ema"
    label = "EMA medicamentos (descarga + RSS)"
    description = (
        "Tablas oficiales descargables de la EMA, con el canal RSS como "
        "contingencia cuando el archivo no está disponible."
    )
    min_interval = 0.5
    adapter_version = "3"

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
            report = self._try_json_report(config, page_size)
            if report is not None:
                return report
        return self._from_rss(config, url, page_size)

    def _try_json_report(self, config: dict, page_size: int) -> ConnectorResult | None:
        report_url = clean_text(config.get("json_url") or DEFAULT_JSON_REPORT)
        try:
            payload = request_json(
                report_url,
                connector_code=self.code,
                min_interval=self.min_interval,
                timeout=90.0,
            )
        except Exception:
            return None
        rows = payload.get("data") if isinstance(payload, dict) else payload
        if not isinstance(rows, list):
            return None
        include_generics = bool(config.get("include_generics"))
        rows = [
            r
            for r in rows
            if isinstance(r, dict)
            and _is_current_human(r)
            and (include_generics or str(r.get("generic") or "").strip().lower() != "yes")
        ]
        rows.sort(key=_latest_movement, reverse=True)
        records = [self._from_table_row(row) for row in rows[: max(1, min(page_size, 200))]]
        records = [r for r in records if r]
        if not records:
            return None
        return ConnectorResult(
            records=records,
            message=f"{len(records)} medicamentos de uso humano del reporte oficial de la EMA (de {len(rows)} vigentes).",
            schema_signature=schema_signature(rows[:3]),
            adapter_version=self.adapter_version,
            endpoint=report_url,
        )

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
            row.get("name_of_medicine")
            or row.get("Medicine name")
            or row.get("Name of medicine")
            or row.get("medicine_name")
            or row.get("name")
            or row.get("title"),
            590,
        )
        inn = clean_text(
            row.get("international_non_proprietary_name_common_name")
            or row.get("International non-proprietary name")
            or row.get("INN")
            or row.get("inn_name")
            or row.get("Active substance"),
            400,
        )
        if not name and not inn:
            return None
        maker = clean_text(
            row.get("marketing_authorisation_developer_applicant_holder")
            or row.get("Marketing authorisation holder")
            or row.get("Company")
            or row.get("manufacturer"),
            300,
        )
        approval = clean_text(
            row.get("marketing_authorisation_date")
            or row.get("Marketing authorisation date")
            or row.get("Date of authorisation")
            or row.get("authorisation_date")
        )
        ident = clean_text(
            row.get("ema_product_number") or row.get("EMA product number") or row.get("Product number") or name or inn
        )
        status = clean_text(row.get("medicine_status"))
        indication = clean_text(row.get("therapeutic_indication"), 2000)
        area = clean_text(row.get("therapeutic_area_mesh"), 300)
        opinion = clean_text(row.get("opinion_adopted_date"))
        flags = [
            label
            for key, label in (
                ("orphan_medicine", "huerfano"),
                ("advanced_therapy", "terapia avanzada"),
                ("prime_priority_medicine", "PRIME"),
                ("conditional_approval", "aprobacion condicional"),
                ("biosimilar", "biosimilar"),
                ("generic", "generico"),
            )
            if str(row.get(key) or "").strip().lower() == "yes"
        ]
        if approval:
            phase = regulatory = "Autorizado EMA"
        elif opinion or status.lower().startswith("opinion"):
            phase = regulatory = "Opinion CHMP"
        elif status:
            phase = regulatory = f"EMA: {status}"
        else:
            phase, regulatory = "Registro EMA", "Publicacion EMA"
        parts = [name or inn, f"DCI: {inn}" if inn else "", f"Titular: {maker or 'n/d'}"]
        if status:
            parts.append(f"Estado EMA: {status}")
        if flags:
            parts.append("Marcadores: " + ", ".join(flags))
        if indication:
            parts.append(indication)
        return CanonicalRecord(
            external_id=ident[:180],
            title=name or inn,
            url=clean_text(row.get("medicine_url"), 1000) or DOWNLOAD_PAGE,
            summary=clean_text(". ".join(p for p in parts if p), 1500),
            commercial_name=(name or inn)[:400],
            inn_name=inn,
            manufacturer=maker,
            indication=indication or area,
            technology_type="medicamento",
            development_phase=phase,
            horizon="inminente" if (approval or opinion) else "transicional",
            ema_approval_date=parse_compact_date(approval or opinion),
            regulatory_status=regulatory,
            published_date=approval or opinion or "",
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


def _is_current_human(row: dict) -> bool:
    if str(row.get("category") or "Human").strip().lower() != "human":
        return False
    status = str(row.get("medicine_status") or "").strip().lower()
    return not status.startswith(_STALE_STATUS)


def _latest_movement(row: dict) -> str:
    """Fecha ISO del ultimo hito regulatorio (dd/mm/aaaa en el reporte)."""
    best = ""
    for field in _DATE_FIELDS:
        value = parse_compact_date(str(row.get(field) or ""))
        if value and value.isoformat() > best:
            best = value.isoformat()
    return best


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
