"""Conector de PubMed E-Utilities (RF01).

No es una fuente de tecnologias por si sola: aporta evidencia clinica que
acompaña a las senales capturadas en ClinicalTrials.gov y en las agencias.
El plan la pide como fuente complementaria, bajo la misma politica de ritmo
(3 peticiones por segundo sin clave de NCBI).
"""
from __future__ import annotations

from ..config import settings
from .base import (
    CanonicalRecord,
    Connector,
    ConnectorResult,
    clean_text,
    parse_compact_date,
    register,
    request_json,
    schema_signature,
)

ESEARCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
ESUMMARY = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"

DEFAULT_TERM = (
    '("horizon scanning"[Title/Abstract] OR "emerging technolog*"[Title/Abstract] '
    'OR "first in class"[Title/Abstract]) AND ("2024/01/01"[Date - Publication] : '
    '"3000"[Date - Publication])'
)


class PubmedConnector(Connector):
    code = "pubmed"
    label = "PubMed (E-Utilities)"
    description = (
        "Índice de literatura del NCBI. Recupera artículos recientes de "
        "escaneo de horizonte y tecnologías emergentes como evidencia."
    )
    min_interval = 0.12
    adapter_version = "2"

    def fetch(self, *, config: dict, url: str = "") -> ConnectorResult:
        config = config or {}
        term = clean_text(config.get("query_term") or DEFAULT_TERM)
        retmax = int(config.get("page_size", 25))
        common = _ncbi_params(config)

        search = request_json(
            ESEARCH,
            params={
                "db": "pubmed",
                "term": term,
                "retmode": "json",
                "retmax": max(1, min(retmax, 100)),
                "sort": "pub_date",
                **common,
            },
            connector_code=self.code,
            min_interval=self.min_interval,
        )
        idlist = ((search.get("esearchresult") or {}).get("idlist")) or []
        if not idlist:
            return ConnectorResult(records=[], message="PubMed no devolvió identificadores.")

        summary = request_json(
            ESUMMARY,
            params={"db": "pubmed", "id": ",".join(idlist), "retmode": "json", **common},
            connector_code=self.code,
            min_interval=self.min_interval,
        )
        result = summary.get("result") or {}
        records = []
        for pmid in idlist:
            rec = self._to_record(pmid, result.get(pmid) or {})
            if rec:
                records.append(rec)
        return ConnectorResult(
            records=records,
            message=f"{len(records)} artículos de PubMed.",
            schema_signature=schema_signature(summary),
            adapter_version=self.adapter_version,
            endpoint=ESUMMARY,
        )

    def _to_record(self, pmid: str, doc: dict) -> CanonicalRecord | None:
        title = clean_text(doc.get("title"), 590)
        if not title:
            return None
        authors = doc.get("authors") or []
        first = ""
        if authors and isinstance(authors[0], dict):
            first = clean_text(authors[0].get("name"))
        pubdate = clean_text(doc.get("pubdate") or doc.get("epubdate"))
        return CanonicalRecord(
            external_id=f"PMID:{pmid}",
            title=title,
            url=f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
            summary=clean_text(
                f"{doc.get('source', '')}. {pubdate}. {first}".strip(". "),
                1500,
            ),
            commercial_name=title[:400],
            manufacturer=clean_text(doc.get("source"), 300),
            technology_type="otro",
            development_phase="Evidencia publicada",
            horizon="emergente",
            published_date=pubdate,
            fda_approval_date=None,
            phase3_completion_date=parse_compact_date(pubdate[:10] if len(pubdate) >= 7 else ""),
            raw=doc,
        )


def _ncbi_params(config: dict) -> dict:
    params = {
        "email": clean_text(config.get("email") or settings.ncbi_email) or "escaneo.horizonte@iets.org.co",
        "tool": "iets_horizon_scanning",
    }
    api_key = clean_text(config.get("api_key") or settings.ncbi_api_key)
    if api_key:
        params["api_key"] = api_key
    return params


register(PubmedConnector())
