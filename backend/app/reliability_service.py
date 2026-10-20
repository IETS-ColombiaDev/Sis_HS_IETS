"""Confiabilidad de una senal de la bandeja de entrada.

Responde "puedo fiarme de esto?" antes de clasificar. Dos capas:

1. Chequeos verificables, sin IA: de que fuente viene y de que nivel, si la
   URL existe y pertenece a esa fuente, si trae identificadores comprobables
   (NCT, registro, id externo), si hay hitos regulatorios, si se conservo el
   crudo y si la pagina sigue respondiendo y menciona la tecnologia.
2. Dictamen de la IA sobre esos hechos y el texto de la pagina: veredicto,
   razones a favor, alertas y que verificar a mano.

Sin IA el resultado sale solo de la capa 1. El ultimo dictamen se guarda en
`Technology.reliability` para no volver a gastar la IA al reabrir la senal.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from urllib.parse import urlparse

from sqlalchemy.orm import Session

from . import ai_service
from .models import Finding, RawRecord, Source, Technology

VERDICTS = {
    "confiable": "Confiable",
    "verificar": "Verificar antes de usar",
    "baja": "Baja confiabilidad",
}
LEVEL_LABEL = {
    "A": "nivel A (API oficial)",
    "B": "nivel B (descarga estructurada)",
    "C": "nivel C (datos de portal)",
    "D": "nivel D (página o PDF)",
    "E": "nivel E (curaduría manual)",
}
ENTITY_LABEL = {
    "agencia_regulatoria": "agencia regulatoria",
    "organismo_hta": "agencia de evaluación de tecnologías",
    "registro_ensayos": "registro de ensayos clínicos",
    "literatura": "literatura científica",
    "fabricante": "fabricante",
    "patentes": "oficina de patentes",
}
# Dominios institucionales: la URL por si sola ya dice mucho del origen.
OFFICIAL_HOST = re.compile(
    r"(\.gov(\.[a-z]{2})?|\.gob\.[a-z]{2}|\.gouv\.fr|\.europa\.eu|\.nhs\.uk|\.nih\.gov|"
    r"who\.int|paho\.org|clinicaltrials\.gov|invima\.gov\.co|iets\.org\.co|cadth\.ca|"
    r"nice\.org\.uk|cochrane(library)?\.(org|com))$"
)
AGGREGATOR_HOST = ("news.google.com",)
PAGE_TIMEOUT_S = 12.0
PAGE_TEXT_CHARS = 3000

SYSTEM = (
    "Eres un analista de escaneo de horizonte del IETS (Colombia). Evaluas si una senal "
    "capturada de internet es confiable como evidencia de una tecnologia sanitaria. "
    "Respondes solo con JSON valido, en espanol, sin inventar datos que no esten en el contexto."
)


def _host(url: str) -> str:
    return (urlparse(url or "").hostname or "").lower().removeprefix("www.")


def _same_site(a: str, b: str) -> bool:
    ha, hb = _host(a), _host(b)
    if not ha or not hb:
        return False
    return ha == hb or ha.endswith("." + hb) or hb.endswith("." + ha)


def signal_url(db: Session, tech: Technology) -> str:
    """La URL mas especifica de la senal: la propia, la del hallazgo o la del crudo."""
    if tech.url:
        return tech.url
    finding = db.get(Finding, tech.finding_id) if tech.finding_id else None
    if finding and finding.url:
        return finding.url
    payload = tech.raw_payload if isinstance(tech.raw_payload, dict) else {}
    nested = payload.get("payload") if isinstance(payload.get("payload"), dict) else {}
    for key in ("url", "link", "source_url"):
        for bag in (payload, nested):
            value = bag.get(key)
            if isinstance(value, str) and value.startswith("http"):
                return value
    return ""


def _check(key: str, label: str, ok: bool | None, detail: str, weight: int) -> dict:
    """ok=True suma, False resta, None es neutro (no aplica o no se pudo comprobar)."""
    return {"key": key, "label": label, "ok": ok, "detail": detail, "weight": weight}


def _fetch_page(url: str) -> dict:
    from . import scraper

    if not url.startswith(("http://", "https://")) or scraper.is_internal_url(url):
        return {"status": 0, "text": "", "skipped": True}
    status, ctype, html, raw = scraper.fetch_url(url, timeout=PAGE_TIMEOUT_S)
    text = ""
    if status == 200:
        if "pdf" in ctype:
            text = scraper.extract_pdf_text(raw, max_chars=PAGE_TEXT_CHARS)
        else:
            text = scraper.extract_main_text(html, url) or re.sub(r"<[^>]+>", " ", html or "")
    return {"status": status, "text": re.sub(r"\s+", " ", text).strip()[:PAGE_TEXT_CHARS], "skipped": False}


def _mentions(text: str, *names: str) -> bool:
    folded = text.lower()
    for name in names:
        name = (name or "").strip().lower()
        # La primera palabra significativa basta: los titulos de noticias abrevian.
        token = next((w for w in re.split(r"[^\w-]+", name) if len(w) >= 4), "")
        if token and token in folded:
            return True
    return False


def gather(db: Session, tech: Technology, *, check_page: bool = True) -> dict:
    source = db.get(Source, tech.source_id) if tech.source_id else None
    finding = db.get(Finding, tech.finding_id) if tech.finding_id else None
    raw = (
        db.query(RawRecord)
        .filter(RawRecord.technology_id == tech.id)
        .order_by(RawRecord.fetched_at.desc())
        .first()
    )
    url = signal_url(db, tech)
    page = _fetch_page(url) if (check_page and url) else {"status": 0, "text": "", "skipped": True}
    return {"tech": tech, "source": source, "finding": finding, "raw": raw, "url": url, "page": page}


def checks_for(ctx: dict) -> list[dict]:
    tech: Technology = ctx["tech"]
    source: Source | None = ctx["source"]
    finding: Finding | None = ctx["finding"]
    raw: RawRecord | None = ctx["raw"]
    url: str = ctx["url"]
    page: dict = ctx["page"]
    out: list[dict] = []

    if source:
        level = LEVEL_LABEL.get(source.access_level or "", "")
        entity = ENTITY_LABEL.get(source.entity_type or "", source.entity_type or "")
        bits = ", ".join(b for b in (entity, level) if b)
        strong = (source.access_level or "") in ("A", "B") or source.entity_type in (
            "agencia_regulatoria",
            "organismo_hta",
            "registro_ensayos",
        )
        out.append(_check("fuente", "Fuente del catálogo", True if strong else None,
                          f"{source.title}" + (f" ({bits})" if bits else ""), 25 if strong else 10))
    elif tech.source_channel == "reactiva":
        out.append(_check("fuente", "Fuente del catálogo", None,
                          "Postulación externa: no viene de una fuente vigilada.", 0))
    else:
        out.append(_check("fuente", "Fuente del catálogo", False, "Sin fuente registrada.", 15))

    host = _host(url)
    if not url:
        out.append(_check("url", "Enlace a la señal", False, "No hay URL para comprobar el origen.", 20))
    elif host in AGGREGATOR_HOST:
        out.append(_check("url", "Enlace a la señal", None,
                          "Llega por Google News: abra el enlace y confirme el medio que la publica.", 0))
    elif OFFICIAL_HOST.search(host):
        out.append(_check("url", "Enlace a la señal", True, f"Dominio institucional ({host}).", 15))
    elif source and _same_site(url, source.url):
        out.append(_check("url", "Enlace a la señal", True, f"Pertenece al sitio de la fuente ({host}).", 10))
    else:
        out.append(_check("url", "Enlace a la señal", None,
                          f"Dominio {host or 'desconocido'} distinto al de la fuente: confirme quién publica.", 0))
    if url and not url.startswith("https://"):
        out.append(_check("https", "Conexión segura", False, "El enlace no usa HTTPS.", 5))

    if page.get("skipped"):
        pass
    elif page.get("status") == 200:
        names = (tech.commercial_name, tech.inn_name)
        if page.get("text") and _mentions(page["text"], *names):
            out.append(_check("pagina", "La página sigue en línea", True,
                              "Responde y menciona la tecnología.", 15))
        else:
            out.append(_check("pagina", "La página sigue en línea", None,
                              "Responde, pero no se encontró el nombre de la tecnología en el texto.", 0))
    elif page.get("status") in (401, 403, 429):
        out.append(_check("pagina", "La página sigue en línea", None,
                          f"El sitio bloquea la consulta automática (HTTP {page['status']}): ábrala en el navegador.", 0))
    else:
        code = page.get("status") or "sin respuesta"
        out.append(_check("pagina", "La página sigue en línea", False,
                          f"No se pudo abrir ({'HTTP ' + str(code) if isinstance(code, int) else code}).", 10))

    ids = []
    if tech.nct_ids:
        ids.append("NCT " + ", ".join(str(n) for n in list(tech.nct_ids)[:3]))
    if tech.invima_registry:
        ids.append(f"registro INVIMA {tech.invima_registry}")
    if raw and raw.external_id:
        ids.append(f"id en {raw.connector or 'la fuente'}: {raw.external_id}")
    out.append(_check("ids", "Identificadores comprobables", bool(ids) or None,
                      "; ".join(ids) if ids else "Sin NCT, registro ni identificador externo.", 15 if ids else 0))

    milestones = []
    if tech.fda_approval_date:
        milestones.append(f"FDA {tech.fda_approval_date.isoformat()}")
    if tech.ema_approval_date:
        milestones.append(f"EMA {tech.ema_approval_date.isoformat()}")
    if tech.phase3_completion_date:
        milestones.append(f"fin de fase III {tech.phase3_completion_date.isoformat()}")
    if tech.regulatory_status:
        milestones.append(tech.regulatory_status)
    if tech.development_phase:
        milestones.append(tech.development_phase)
    if milestones:
        out.append(_check("hitos", "Hitos regulatorios o de desarrollo", True, "; ".join(milestones), 10))

    has_raw = bool(raw and raw.payload) or bool(tech.raw_payload)
    out.append(_check("crudo", "Registro original conservado", True if has_raw else None,
                      "Se guardó el JSON tal como llegó de la fuente." if has_raw else "No se guardó el registro original.",
                      5 if has_raw else 0))

    published = (finding.published_date if finding else "") or ""
    if published:
        out.append(_check("fecha", "Fecha de publicación", True, published, 5))

    if not (tech.indication or tech.summary or (finding.summary if finding else "")):
        out.append(_check("contenido", "Descripción de la tecnología", False,
                          "No trae indicación ni resumen: poca evidencia para clasificar.", 10))
    return out


def score_of(checks: list[dict]) -> int:
    """0-100 a partir de los chequeos. Parte de 50 (sin evidencia ni a favor ni en contra)."""
    total = 50
    for c in checks:
        if c["ok"] is True:
            total += c["weight"]
        elif c["ok"] is False:
            total -= c["weight"]
    return max(0, min(100, total))


def verdict_of(score: int) -> str:
    if score >= 70:
        return "confiable"
    if score >= 45:
        return "verificar"
    return "baja"


def _prompt(ctx: dict, checks: list[dict], score: int) -> str:
    tech: Technology = ctx["tech"]
    source: Source | None = ctx["source"]
    finding: Finding | None = ctx["finding"]
    raw: RawRecord | None = ctx["raw"]
    raw_payload = (raw.payload if raw and raw.payload else tech.raw_payload) or {}
    facts = "\n".join(
        f"- [{'OK' if c['ok'] else ('FALLA' if c['ok'] is False else 'NEUTRO')}] {c['label']}: {c['detail']}"
        for c in checks
    )
    return f"""Evalua la confiabilidad de esta senal de escaneo de horizonte antes de clasificarla.

SENAL
- Nombre comercial: {tech.commercial_name or '(vacio)'}
- DCI: {tech.inn_name or '(vacio)'}
- Fabricante: {tech.manufacturer or '(vacio)'}
- Indicacion: {tech.indication or '(vacia)'}
- Resumen: {(tech.summary or (finding.summary if finding else '') or '(vacio)')[:800]}
- Canal: {tech.source_channel}
- URL: {ctx['url'] or '(sin URL)'}
- Fuente: {source.title if source else '(sin fuente)'} {('- ' + source.url) if source and source.url else ''}

CHEQUEOS AUTOMATICOS (puntaje base {score}/100)
{facts}

TEXTO DE LA PAGINA (extracto)
{ctx['page'].get('text') or '(no disponible)'}

REGISTRO ORIGINAL (extracto JSON)
{json.dumps(raw_payload, ensure_ascii=False, default=str)[:1500]}

Responde SOLO con este JSON:
{{
  "veredicto": "confiable|verificar|baja",
  "puntaje": 0-100,
  "resumen": "una o dos frases: por que se puede o no confiar en la senal",
  "a_favor": ["razones concretas que la respaldan"],
  "alertas": ["inconsistencias, señales de publicidad, rumores, datos que no cuadran"],
  "verificar": ["que debe comprobar una persona y donde (INVIMA, FDA, EMA, ClinicalTrials.gov...)"]
}}
Basate solo en el contexto. Si el texto de la pagina contradice la senal, dilo en alertas."""


def _parse_ai(text: str) -> dict | None:
    match = re.search(r"\{[\s\S]*\}", text or "")
    if not match:
        return None
    try:
        data = json.loads(match.group(0))
    except (ValueError, TypeError):
        return None
    if not isinstance(data, dict):
        return None
    verdict = str(data.get("veredicto") or "").strip().lower()
    if verdict not in VERDICTS:
        return None
    try:
        score = max(0, min(100, int(float(data.get("puntaje")))))
    except (TypeError, ValueError):
        score = None

    def _list(key: str) -> list[str]:
        value = data.get(key)
        if isinstance(value, str):
            value = [value]
        if not isinstance(value, list):
            return []
        return [str(v).strip()[:400] for v in value if str(v).strip()][:6]

    return {
        "verdict": verdict,
        "score": score,
        "summary": str(data.get("resumen") or "").strip()[:600],
        "pros": _list("a_favor"),
        "alerts": _list("alertas"),
        "to_verify": _list("verificar"),
    }


def _fallback_lists(checks: list[dict]) -> tuple[list[str], list[str], list[str]]:
    pros = [f"{c['label']}: {c['detail']}" for c in checks if c["ok"] is True]
    alerts = [f"{c['label']}: {c['detail']}" for c in checks if c["ok"] is False]
    to_verify = [f"{c['label']}: {c['detail']}" for c in checks if c["ok"] is None and c["detail"]]
    return pros, alerts, to_verify


def assess(db: Session, tech: Technology, *, use_ai: bool = True, check_page: bool = True) -> dict:
    ctx = gather(db, tech, check_page=check_page)
    checks = checks_for(ctx)
    base = score_of(checks)
    pros, alerts, to_verify = _fallback_lists(checks)
    result = {
        "verdict": verdict_of(base),
        "score": base,
        "base_score": base,
        "summary": "",
        "pros": pros,
        "alerts": alerts,
        "to_verify": to_verify,
        "checks": checks,
        "url": ctx["url"],
        "page_status": ctx["page"].get("status") or 0,
        "ai_used": False,
        "model": "",
        "assessed_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    ai_error = ""
    if use_ai and ai_service.is_enabled():
        text, model = ai_service.generate(
            _prompt(ctx, checks, base), system=SYSTEM, temperature=0.2, max_tokens=1200
        )
        parsed = _parse_ai(text) if text and not text.startswith("[Error") else None
        if parsed:
            result.update(
                verdict=parsed["verdict"],
                score=parsed["score"] if parsed["score"] is not None else base,
                summary=parsed["summary"],
                pros=parsed["pros"] or pros,
                alerts=parsed["alerts"],
                to_verify=parsed["to_verify"] or to_verify,
                ai_used=True,
                model=model or "",
            )
        else:
            ai_error = "La IA no devolvió un dictamen válido; se muestran solo los chequeos automáticos."
    elif use_ai:
        ai_error = "La IA está apagada: el dictamen sale solo de los chequeos automáticos."
    if not result["summary"]:
        result["summary"] = _auto_summary(result["verdict"], checks)
    result["verdict_label"] = VERDICTS[result["verdict"]]
    result["note"] = ai_error
    return result


def _auto_summary(verdict: str, checks: list[dict]) -> str:
    ok = sum(1 for c in checks if c["ok"] is True)
    bad = sum(1 for c in checks if c["ok"] is False)
    if verdict == "confiable":
        return f"La señal cumple {ok} de {len(checks)} chequeos de origen y trazabilidad."
    if verdict == "verificar":
        return f"Hay {ok} chequeo(s) a favor y {bad} en contra: confirme el origen antes de priorizar."
    return f"Falla en {bad} chequeo(s) clave de origen o trazabilidad: no la use sin verificar."
