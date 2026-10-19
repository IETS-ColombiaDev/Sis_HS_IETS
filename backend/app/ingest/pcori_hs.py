"""Conector de PCORI Health Care Horizon Scanning System.

La portada es una aplicacion React; los datos vienen de su API publica
(`/api/search/searchtopicsandtrends`, la misma que usa el buscador). Se toman
las fichas activas (topics = tecnologias, trends = tendencias) mas recientes.
"""
from __future__ import annotations

import html as html_lib
import re

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
SEARCH_API = "https://horizonscandb.pcori.org/api/search/searchtopicsandtrends"
_TAG_RE = re.compile(r"<[^>]+>")
_INLINE_RE = re.compile(r"</?(?:span|abbr|em|strong|b|i|sup|sub)\b[^>]*>", re.I)


class PcoriHsConnector(Connector):
    code = "pcori_hs"
    label = "PCORI Horizon Scanning"
    description = (
        "Base pública de horizon scanning operada con ECRI. Fichas fechadas "
        "por tecnología y seis áreas de interés."
    )
    min_interval = 1.0
    adapter_version = "2"

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

        if (config.get("mode") or "api").lower() == "api":
            return self._from_search_api(config)

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
            message=f"{len(records)} fichas extraídas de la portada de PCORI.",
            partial=True,
            adapter_version=self.adapter_version,
            endpoint=page,
        )

    def _from_search_api(self, config: dict) -> ConnectorResult:
        page_size = max(1, min(int(config.get("page_size", 40)), 200))
        body = {
            "limit": 1000,
            "skip": 0,
            "sortOrder": "desc",
            "sortBy": None,
            "preview": False,
            "query": {"searchPhrase": clean_text(config.get("search") or "*") or "*"},
        }
        data = request_json(
            SEARCH_API,
            json_body=body,
            connector_code=self.code,
            min_interval=self.min_interval,
            timeout=90.0,
        )
        response = data.get("response") if isinstance(data, dict) else None
        hits = (response or {}).get("hits")
        if not isinstance(hits, list):
            raise ConnectorError("La API de PCORI no devolvio la lista de fichas (response.hits).")
        if not config.get("include_archived"):
            hits = [h for h in hits if str(h.get("recordStatus") or "").lower() != "archived"]
        hits.sort(key=lambda h: str(h.get("updatedDate") or h.get("publishedDate") or ""), reverse=True)
        records = [self._from_api_hit(h) for h in hits[:page_size] if isinstance(h, dict)]
        records = [r for r in records if r]
        return ConnectorResult(
            records=records,
            message=f"{len(records)} fichas activas de PCORI (de {len(hits)}).",
            schema_signature=schema_signature(hits[:3]),
            adapter_version=self.adapter_version,
            endpoint=SEARCH_API,
        )

    def _from_api_hit(self, hit: dict) -> CanonicalRecord | None:
        title = _plain(hit.get("title"), 590)
        original = hit.get("originalId")
        doc_type = clean_text(hit.get("documentType") or "topics")
        if not title or original is None:
            return None
        name = _plain(hit.get("interventionName"), 400) or title
        description = _plain(hit.get("interventionDescription"), 1200)
        population = _plain(hit.get("patientPopulation"), 600)
        disease = _plain(hit.get("diseaseSpecific"), 300) or ", ".join(_titles(hit.get("diseasesConditions")))[:300]
        classes = _titles(hit.get("interventionClass"))
        developers = ", ".join(_titles(hit.get("developers")))[:300]
        phase = clean_text(hit.get("developmentPhase") or ("Tendencia" if doc_type == "trends" else ""))
        regulatory = _plain(hit.get("latestRegulatoryEvent"), 300)
        updated = clean_text(hit.get("updatedDate") or hit.get("publishedDate"))[:10]
        summary = ". ".join(
            p
            for p in (
                description or title,
                f"Poblacion: {population}" if population else "",
                f"Fase: {phase}" if phase else "",
                f"Clase: {', '.join(classes)}" if classes else "",
                f"Desarrollador: {developers}" if developers else "",
                f"Ultimo hito regulatorio: {regulatory}" if regulatory else "",
            )
            if p
        )
        return CanonicalRecord(
            external_id=f"{doc_type}-{original}",
            title=title,
            url=f"https://horizonscandb.pcori.org/report/{doc_type}/{original}",
            summary=clean_text(summary, 1500),
            commercial_name=name,
            manufacturer=developers,
            indication=disease,
            therapeutic_area=disease[:300],
            technology_type=_type_for(classes, hit),
            development_phase=phase or "Priorizacion externa",
            horizon=_horizon_for(phase),
            published_date=updated,
            regulatory_status=regulatory or "Ficha PCORI",
            raw=hit,
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


def _plain(value, limit: int = 0) -> str:
    # <span> de abreviaturas va en linea ("mRNA-4157"); el resto separa bloques.
    text = _INLINE_RE.sub("", str(value or ""))
    text = html_lib.unescape(_TAG_RE.sub(" ", text))
    text = text.replace("\u200b", " ").replace("\xa0", " ")
    return clean_text(text, limit) if limit else clean_text(text)


def _titles(items) -> list[str]:
    out = []
    for item in items or []:
        if isinstance(item, dict) and item.get("title"):
            out.append(_plain(item["title"]))
    return out


def _type_for(classes: list[str], hit: dict) -> str:
    blob = " ".join(classes + _titles(hit.get("theme"))).lower()
    if any(k in blob for k in ("device", "implant", "diagnostic", "imaging", "surgery", "procedure")):
        return "dispositivo"
    if any(k in blob for k in ("mobile health", "digital", "artificial intelligence", "software")):
        return "digital"
    if any(k in blob for k in ("pharma", "antibod", "therapy", "biotech", "oligonucleotide", "vaccine", "molecule", "conjugate")):
        return "medicamento"
    return "otro"


def _horizon_for(phase: str) -> str:
    text = (phase or "").lower()
    if "phase 3" in text or "phase 4" in text or "approved" in text:
        return "inminente"
    if "phase 2" in text:
        return "transicional"
    return "emergente"


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
