"""Cruce de una postulacion con la vigilancia proactiva y con la web (RF-02-F).

Cuando llega una postulacion (canal reactivo), el evaluador necesita saber antes
de aceptarla si esa tecnologia ya la vio la vigilancia y que dice la web:

- **Vigilancia proactiva.** Se compara con todas las tecnologias vivas del
  sistema usando el mismo comparador del filtrado (`dedup.compare`: NCT
  compartido o similitud de nombre/DCI sobre el umbral vigente, ajustada por
  fabricante). Cada coincidencia trae su fuente y el enlace a la senal exacta
  (o el enlace que abre la pagina y resalta la senal, ver `link_resolver`).
- **Web.** Se busca el nombre (y el fabricante) en los motores configurados en
  Parametros de fuentes. Cada resultado dice si es de un dominio oficial
  (agencias, registros de ensayos) o de una fuente del catalogo.

El resultado queda en `submissions.cross_check` y en la bitacora. No cambia la
postulacion ni decide por el evaluador: es evidencia para moderar.
"""
from __future__ import annotations

import logging
import os
import re
import threading
from datetime import datetime, timezone
from urllib.parse import urlsplit

from sqlalchemy.orm import Session

from . import dedup
from .audit import record_action
from .models import Finding, Source, Submission, Technology

log = logging.getLogger(__name__)

MAX_PROACTIVE = 12
MAX_WEB = 8
# Dominios oficiales: agencias regulatorias, registros de ensayos y bases publicas.
OFFICIAL_DOMAINS = (
    "fda.gov", "ema.europa.eu", "europa.eu", "clinicaltrials.gov", "who.int", "invima.gov.co",
    "minsalud.gov.co", "iets.org.co", "nice.org.uk", "gov.uk", "canada.ca", "tga.gov.au",
    "pmda.go.jp", "nmpa.gov.cn", "anvisa.gov.br", "nih.gov", "ncbi.nlm.nih.gov", "cochranelibrary.com",
    "isrctn.com", "anzctr.org.au", "chictr.org.cn", "ctri.nic.in", "drks.de", "euclinicaltrials.eu",
)
STATUS_LABELS = {
    "capturada_no_asignada": "En la bandeja de entrada",
    "asignada_a_ciclo": "Asignada a un ciclo",
    "filtrada_apta_priorizacion": "Apta para priorización",
    "priorizada": "Priorizada",
    "bajo_vigilancia": "Bajo vigilancia",
    "en_evaluacion": "En evaluación",
    "publicada": "Publicada",
    "excluida": "Excluida",
    "descartada": "Descartada",
}


def _host(url: str) -> str:
    return (urlsplit(url or "").hostname or "").lower().removeprefix("www.")


def _in(host: str, domain: str) -> bool:
    return bool(host) and (host == domain or host.endswith("." + domain))


_NCT_RE = re.compile(r"NCT\d{8}", re.I)
PREFILTER_MIN = 75


def submission_ncts(submission: Submission) -> list[str]:
    """Identificadores NCT que la persona cito en sus enlaces de evidencia o en el mecanismo."""
    text = " ".join([*(str(u) for u in (submission.evidence_links or [])), submission.mechanism or ""])
    return sorted({m.upper() for m in _NCT_RE.findall(text)})


def _probe_tech(submission: Submission) -> Technology:
    """Tecnologia transitoria (no se guarda) con los datos de la postulacion."""
    return Technology(
        commercial_name=submission.commercial_name or "",
        inn_name=submission.inn_name or "",
        manufacturer=submission.manufacturer or "",
        nct_ids=submission_ncts(submission),
    )


def _candidate_ids(db: Session, submission: Submission) -> list[int]:
    """Prefiltro barato: tecnologias cuyo nombre se parece o que comparten NCT.

    Comparar a fondo contra todo el acervo dentro de la peticion del formulario
    publico costaba ~0,3 s de CPU por cada 1.000 tecnologias (unos 3 s en Render).
    Aqui solo se leen los nombres y se descarta lo que ni se parece; el comparador
    del filtrado (`dedup.compare`) decide despues sobre las pocas que quedan.
    """
    from rapidfuzz import fuzz

    from .link_resolver import keyfold

    names = [keyfold(n) for n in search_names(submission)]
    tokens = {t for n in search_names(submission) for t in _key_tokens(n) if len(t) >= 4}
    ncts = set(submission_ncts(submission))
    rows = (
        db.query(Technology.id, Technology.commercial_name, Technology.inn_name, Technology.nct_ids)
        .filter(Technology.merged_into_id.is_(None))
        .all()
    )
    keep: list[int] = []
    for tech_id, commercial, inn, tech_ncts in rows:
        if ncts and ncts & {str(n).upper() for n in (tech_ncts or [])}:
            keep.append(tech_id)
            continue
        folded = [keyfold(v) for v in (commercial, inn) if v]
        if not folded:
            continue
        if tokens and tokens & {t for v in folded for t in v.split()}:
            keep.append(tech_id)
            continue
        if any(fuzz.partial_ratio(n, v) >= PREFILTER_MIN for n in names for v in folded if n):
            keep.append(tech_id)
    return keep


CONTAINED_SCORE = 90


def _contained(submission: Submission, tech: Technology) -> int:
    """El nombre postulado aparece completo en el de la senal ("Lutathera" en "Lutathera (AAA601)").

    El comparador del filtrado mide similitud de la cadena completa y castiga el
    codigo o la sal que la fuente agrega al nombre. Aqui basta con que todas las
    palabras distintivas del nombre postulado esten en la senal, y al menos una
    sea especifica (5 letras o mas), para no casar por palabras genericas.
    """
    tech_tokens: set[str] = set()
    for value in (tech.commercial_name, tech.inn_name):
        tech_tokens |= set(_key_tokens(value or ""))
    if not tech_tokens:
        return 0
    for name in search_names(submission):
        tokens = _key_tokens(name)
        if tokens and any(len(t) >= 5 for t in tokens) and set(tokens) <= tech_tokens:
            return CONTAINED_SCORE
    return 0


def proactive_matches(db: Session, submission: Submission) -> dict:
    """Tecnologias del sistema que coinciden con la postulacion, mejor puntaje primero."""
    probe = _probe_tech(submission)
    threshold = dedup.threshold(db)
    own = submission.technology_id
    ids = _candidate_ids(db, submission)
    candidates: list[Technology] = []
    for start in range(0, len(ids), 500):
        chunk = ids[start : start + 500]
        candidates.extend(db.query(Technology).filter(Technology.id.in_(chunk)).order_by(Technology.id).all())
    candidates.sort(key=lambda t: t.id)
    scored = []
    for tech in candidates:
        if own and tech.id == own:
            continue
        payload = tech.raw_payload if isinstance(tech.raw_payload, dict) else {}
        if payload.get("origin") == "submission" and payload.get("submission_id") == submission.id:
            continue
        result = dedup.compare(probe, tech)
        if result["score"] < threshold:
            contained = _contained(submission, tech)
            if contained:
                result = {**result, "score": max(result["score"], float(contained)), "matched_on": ["nombre_contenido"]}
        if result["score"] >= threshold:
            scored.append((result, tech))
    scored.sort(key=lambda r: (-r[0]["score"], r[1].id))
    findings = {
        f.id: f
        for f in db.query(Finding).filter(Finding.id.in_([t.finding_id for _r, t in scored if t.finding_id] or [0])).all()
    }
    sources = {
        s.id: s
        for s in db.query(Source).filter(Source.id.in_([t.source_id for _r, t in scored if t.source_id] or [0])).all()
    }
    matches = []
    source_ids: set[int] = set()
    for result, tech in scored[:MAX_PROACTIVE]:
        finding = findings.get(tech.finding_id) if tech.finding_id else None
        source = sources.get(tech.source_id) if tech.source_id else None
        evidence = finding.evidence if finding is not None and isinstance(finding.evidence, dict) else {}
        if source is not None:
            source_ids.add(source.id)
        matches.append(
            {
                "technology_id": tech.id,
                "name": tech.commercial_name or tech.inn_name or "",
                "inn_name": tech.inn_name or "",
                "manufacturer": tech.manufacturer or "",
                "channel": tech.source_channel or "",
                "status": tech.status or "",
                "status_label": STATUS_LABELS.get(tech.status or "", tech.status or ""),
                "source_id": source.id if source else None,
                "source_title": source.title if source else ("Postulación" if tech.source_channel == "reactiva" else ""),
                "url": (finding.url if finding is not None else tech.url) or "",
                "link_type": (finding.link_type if finding is not None else "") or "",
                "locator_url": evidence.get("locator_url") or "",
                "captured_at": tech.captured_at.isoformat() if tech.captured_at else None,
                "score": result["score"],
                "decisive": bool(result.get("decisive")),
                "matched_on": result.get("matched_on") or [],
            }
        )
    return {
        "count": len(scored),
        "sources": len(source_ids),
        "threshold": threshold,
        "matches": matches,
    }


# --------------------------------------------------------------------------- #
#  Web: registros oficiales por API y buscadores con filtro de pertinencia
# --------------------------------------------------------------------------- #
# Los buscadores gratuitos bloquean a los robots y, cuando no bloquean, a veces
# devuelven resultados ajenos (inmobiliarias, contenido para adultos) ante una
# consulta que no reconocen. Por eso el cruce web se apoya primero en registros
# oficiales con API publica y estable, y de los buscadores solo muestra lo que
# menciona la tecnologia.
REGISTRY_TIMEOUT = 15.0
REGISTRY_ROWS = 3
GENERIC_TOKENS = {
    "the", "and", "for", "con", "para", "del", "los", "las", "una", "uno", "de", "la", "el", "y",
    "tablet", "tablets", "injection", "solution", "capsule", "capsules", "mg", "ml", "system", "device",
    "sistema", "dispositivo", "inyeccion", "solucion", "tableta", "tabletas", "capsula", "capsulas",
}


def _key_tokens(text: str) -> list[str]:
    from .link_resolver import keyfold

    return [t for t in keyfold(text).split() if len(t) >= 3 and t not in GENERIC_TOKENS]


def search_names(submission: Submission) -> list[str]:
    """Nombres a buscar: comercial y DCI (sin repetir)."""
    out: list[str] = []
    for value in (submission.commercial_name, submission.inn_name):
        value = (value or "").strip()
        if value and _key_tokens(value) and value.lower() not in [o.lower() for o in out]:
            out.append(value)
    return out


def is_relevant(result: dict, names: list[str]) -> bool:
    """Un resultado es pertinente si menciona por completo alguno de los nombres."""
    from .link_resolver import keyfold

    haystack = set(keyfold(f"{result.get('title', '')} {result.get('snippet', '')} {result.get('url', '')}").split())
    for name in names:
        tokens = _key_tokens(name)
        if tokens and all(t in haystack for t in tokens):
            return True
    return False


def web_query(submission: Submission) -> str:
    names = search_names(submission)
    if not names:
        return ""
    query = names[0]
    if submission.manufacturer:
        query += f" {submission.manufacturer.strip()}"
    return query[:240]


def _registry_json(url: str, params: dict, *, user_agent: bool = True) -> dict | None:
    from .ingest.base import ConnectorError, request_json

    try:
        return request_json(url, params=params, send_user_agent=user_agent, timeout=REGISTRY_TIMEOUT, max_attempts=2)
    except ConnectorError as exc:
        # openFDA responde 404 cuando no hay coincidencias: es un cero, no un error.
        if "HTTP 404" in str(exc):
            return {}
        raise


def _clinicaltrials(name: str) -> list[dict]:
    data = _registry_json(
        "https://clinicaltrials.gov/api/v2/studies",
        {"query.intr": name, "pageSize": REGISTRY_ROWS, "countTotal": "true",
         "fields": "NCTId,BriefTitle,OverallStatus,Phase"},
        user_agent=False,
    ) or {}
    out = []
    for study in data.get("studies") or []:
        proto = study.get("protocolSection") or {}
        ident = proto.get("identificationModule") or {}
        status = (proto.get("statusModule") or {}).get("overallStatus") or ""
        phases = ", ".join((proto.get("designModule") or {}).get("phases") or [])
        nct = ident.get("nctId") or ""
        if nct:
            out.append({
                "title": ident.get("briefTitle") or nct,
                "url": f"https://clinicaltrials.gov/study/{nct}",
                "snippet": " · ".join(x for x in (nct, status, phases) if x),
            })
    if data.get("totalCount"):
        for row in out:
            row["total"] = int(data["totalCount"])
    return out


def _openfda_drugs(name: str) -> list[dict]:
    term = name.replace('"', "")
    data = _registry_json(
        "https://api.fda.gov/drug/drugsfda.json",
        {"search": f'openfda.brand_name:"{term}" OR openfda.generic_name:"{term}"', "limit": REGISTRY_ROWS},
    ) or {}
    out = []
    for item in data.get("results") or []:
        appl = item.get("application_number") or ""
        brand = ", ".join((item.get("openfda") or {}).get("brand_name") or []) or term
        sponsor = item.get("sponsor_name") or ""
        digits = "".join(ch for ch in appl if ch.isdigit())
        if digits:
            out.append({
                "title": f"{brand} ({appl})",
                "url": f"https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=overview.process&ApplNo={digits}",
                "snippet": f"FDA Drugs@FDA · {sponsor}".strip(" ·"),
            })
    return out


def _openfda_devices(name: str) -> list[dict]:
    term = name.replace('"', "")
    data = _registry_json(
        "https://api.fda.gov/device/510k.json",
        {"search": f'device_name:"{term}"', "limit": REGISTRY_ROWS},
    ) or {}
    out = []
    for item in data.get("results") or []:
        k = item.get("k_number") or ""
        if k:
            out.append({
                "title": f"{item.get('device_name') or term} ({k})",
                "url": f"https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfPMN/pmn.cfm?ID={k}",  # el sitio distingue mayusculas
                "snippet": f"FDA 510(k) · {item.get('applicant') or ''} · {item.get('decision_date') or ''}".strip(" ·"),
            })
    return out


def _pubmed(name: str) -> list[dict]:
    from .config import settings

    email = getattr(settings, "ncbi_email", "") or "escaneo.horizonte@iets.org.co"
    data = _registry_json(
        "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi",
        {"db": "pubmed", "term": f'"{name}"', "retmax": REGISTRY_ROWS, "retmode": "json", "sort": "pub_date",
         "tool": "iets-horizon-scanning", "email": email},
    ) or {}
    result = data.get("esearchresult") or {}
    ids = result.get("idlist") or []
    if not ids:
        return []
    summary = _registry_json(
        "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi",
        {"db": "pubmed", "id": ",".join(ids), "retmode": "json", "tool": "iets-horizon-scanning", "email": email},
    ) or {}
    docs = summary.get("result") or {}
    out = []
    for pmid in ids:
        doc = docs.get(pmid) or {}
        out.append({
            "title": doc.get("title") or f"PMID {pmid}",
            "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
            "snippet": f"PubMed · {doc.get('source') or ''} · {doc.get('pubdate') or ''}".strip(" ·"),
            "total": int(result.get("count") or 0),
        })
    return out


REGISTRIES = (
    ("ClinicalTrials.gov", _clinicaltrials),
    ("FDA (medicamentos)", _openfda_drugs),
    ("FDA (dispositivos 510k)", _openfda_devices),
    ("PubMed", _pubmed),
)


def registry_matches(submission: Submission) -> tuple[list[dict], list[dict]]:
    """Fichas de registros oficiales para el nombre comercial o la DCI. Nunca lanza."""
    from concurrent.futures import ThreadPoolExecutor

    names = search_names(submission)
    jobs = [(label, fn, name) for name in names[:2] for label, fn in REGISTRIES]
    attempts: list[dict] = []
    rows: list[dict] = []

    def work(job):
        label, fn, name = job
        try:
            return label, name, fn(name), ""
        except Exception as exc:  # noqa: BLE001 - un registro caido no tumba el cruce
            return label, name, [], f"{type(exc).__name__}"

    with ThreadPoolExecutor(max_workers=6, thread_name_prefix="xcheck") as pool:
        for label, name, found, error in pool.map(work, jobs):
            attempts.append({"engine": label, "query": name, "status": "error" if error else ("ok" if found else "sin_resultados"),
                             "detail": error or f"{len(found)} resultado(s)"})
            for row in found:
                rows.append({**row, "registry": label})
    seen: set[str] = set()
    unique = []
    for row in rows:
        if row["url"] not in seen:
            seen.add(row["url"])
            unique.append(row)
    return unique, attempts


def web_matches(db: Session, submission: Submission) -> dict:
    """Registros oficiales y web para la tecnologia postulada (oficiales y del catalogo marcados)."""
    from . import source_profile, web_search

    names = search_names(submission)
    query = web_query(submission)
    if not names:
        return {"query": "", "results": [], "attempts": [], "engine": "", "official": 0, "discarded": 0,
                "error": "La postulación no trae nombre para buscar."}
    registry_rows, attempts = registry_matches(submission)
    engine_rows: list[dict] = []
    engine = ""
    discarded = 0
    try:
        out = web_search.search(query, cfg=source_profile.load_search(db), brave_key=source_profile.brave_api_key(db))
        engine = out.get("engine") or ""
        attempts += [{**a, "query": query} for a in (out.get("attempts") or [])]
        for row in out.get("results") or []:
            if is_relevant(row, names):
                engine_rows.append(row)
            else:
                discarded += 1
    except Exception as exc:  # noqa: BLE001 - los buscadores son complementarios
        attempts.append({"engine": "buscadores", "query": query, "status": "error", "detail": type(exc).__name__})

    catalog_hosts = {
        _host(s.url): s.title
        for s in db.query(Source.url, Source.title).filter(Source.retired.is_(False), Source.catalog_active.isnot(False)).all()
        if s.url
    }
    evidence_hosts = {_host(u) for u in (submission.evidence_links or [])}

    def shape(row: dict, kind: str) -> dict:
        url = row.get("url") or ""
        host = _host(url)
        return {
            "title": (row.get("title") or "")[:300],
            "url": url[:1024],
            "snippet": (row.get("snippet") or "")[:400],
            "host": host,
            "kind": kind,
            "registry": row.get("registry") or "",
            "total": int(row.get("total") or 0),
            "official": kind == "registro" or any(_in(host, d) for d in OFFICIAL_DOMAINS),
            "catalog_source": next((title for h, title in catalog_hosts.items() if h and _in(host, h)), ""),
            "cited_by_submitter": host in evidence_hosts,
        }

    results = [shape(r, "registro") for r in registry_rows] + [shape(r, "web") for r in engine_rows[:MAX_WEB]]
    error = ""
    if not results:
        error = "Ni los registros oficiales ni los buscadores trajeron resultados que mencionen la tecnología."
    return {
        "query": query,
        "names": names,
        "engine": engine,
        "attempts": attempts,
        "results": results,
        "official": sum(1 for r in results if r["official"]),
        "registries": sum(1 for r in results if r["kind"] == "registro"),
        "discarded": discarded,
        "error": error,
    }


def summarize(proactive: dict, web: dict | None) -> dict:
    count = proactive.get("count", 0)
    if count:
        text = (
            f"La vigilancia ya la detectó: {count} coincidencia(s) en {proactive.get('sources', 0)} fuente(s). "
            "Revise si es la misma tecnología antes de aceptar (al aceptarla, la bandeja la marcará en varias fuentes)."
        )
    else:
        text = "La vigilancia proactiva no la ha detectado: es una señal nueva aportada por la postulación."
    if web is not None:
        results = web.get("results") or []
        registries = sum(1 for r in results if r.get("kind") == "registro")
        others = len(results) - registries
        if results:
            text += f" Registros oficiales: {registries} ficha(s). Web: {others} resultado(s) que la mencionan."
        elif web.get("error"):
            text += f" {web['error']}"
    return {"proactive_count": count, "web_count": len((web or {}).get("results") or []), "text": text}


def run(db: Session, submission: Submission, *, web: bool = True, actor: str = "sistema") -> dict:
    """Cruza la postulacion, guarda el resultado y lo deja en la bitacora."""
    proactive = proactive_matches(db, submission)
    previous = submission.cross_check if isinstance(submission.cross_check, dict) else {}
    web_part = None
    if web:
        try:
            web_part = web_matches(db, submission)
        except Exception as exc:  # noqa: BLE001 - la web es complementaria
            log.warning("Cruce web de la postulacion %s fallo: %s", submission.id, exc)
            web_part = {"query": web_query(submission), "results": [], "attempts": [], "engine": "",
                        "error": f"No se pudo consultar la web ({type(exc).__name__})."}
    elif previous.get("web"):
        web_part = previous["web"]
    result = {
        "at": datetime.now(timezone.utc).isoformat(),
        "by": actor,
        "proactive": proactive,
        "web": web_part,
        "summary": summarize(proactive, web_part),
    }
    submission.cross_check = result
    record_action(
        db,
        entity_type="submissions",
        entity_id=str(submission.id),
        action="submission_cross_check",
        new_value={
            "coincidencias_vigilancia": proactive["count"],
            "resultados_web": len((web_part or {}).get("results") or []),
            "por": actor,
        },
    )
    db.commit()
    db.refresh(submission)
    return result


def _in_tests() -> bool:
    return bool(os.environ.get("PYTEST_CURRENT_TEST"))


def schedule_web(session_factory, submission_id: int) -> None:
    """Completa el cruce con la web en segundo plano (el formulario publico no espera)."""
    if _in_tests():
        return

    def work() -> None:
        db = session_factory()
        try:
            row = db.get(Submission, submission_id)
            if row is not None:
                run(db, row, web=True, actor="sistema")
        except Exception:  # noqa: BLE001
            log.exception("Cruce web en segundo plano de la postulacion %s", submission_id)
            db.rollback()
        finally:
            db.close()

    threading.Thread(target=work, name=f"submission-cross-{submission_id}", daemon=True).start()
