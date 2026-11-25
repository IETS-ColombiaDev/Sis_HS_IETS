"""Inteligencia del sistema: base de conocimiento de senales y clasificador que aprende.

Tres piezas, todas parametrizables desde Configuracion › Inteligencia:

1. **Base de conocimiento de senales** (`signal_knowledge`). Un documento por
   tecnologia capturada, con su origen (la primera busqueda historica o una
   vigilancia posterior) y la decision del equipo (clasificada o descartada).
   Se sincroniza sola desde `technologies` y se puede reconstruir entera.

2. **Recuperacion** (`similar`). Busca las senales mas parecidas a un texto por
   TF-IDF y coseno. No necesita modelo externo ni memoria extra: corre en el
   plan gratuito de Render y funciona con la IA apagada.

3. **Clasificador que aprende** (`suggest`). Combina las reglas del catalogo
   (palabras clave, CIE-10, MeSH) con el voto de las senales parecidas que el
   equipo ya clasifico. Si la IA esta encendida, puede arbitrar con esos mismos
   ejemplos a la vista (recuperacion aumentada). Devuelve siempre la confianza
   y la evidencia; el evaluador confirma.

`calibrate` mide con los datos reales cuanto acierta cada metodo (dejando una
senal por fuera cada vez) y ajusta el numero de vecinos y la confianza minima.

Nada de esto decide por el evaluador: sugiere, explica y aprende de lo que el
confirma.
"""
from __future__ import annotations

import json
import logging
import math
import re
import threading
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from . import settings_store
from .models import AuditLog, Cluster, Finding, SignalKnowledge, Source, Technology, TechType

log = logging.getLogger(__name__)

CONFIG_KEY = "intelligence.config"
CALIBRATION_KEY = "intelligence.calibration"
BASELINE_KEY = "intelligence.baseline_until"
SUGGEST_ACTION = "intelligence:suggest"
STAGING_STATUS = "capturada_no_asignada"
DISCARDED_STATUS = "excluida"
DISCARD_ACTION = "staging:discard"

AI_MODES = ("nunca", "desacuerdo", "siempre")

CLASSIFY_SYSTEM_PROMPT = (
    "Eres el asistente de clasificacion del escaneo de horizonte del IETS (Colombia). "
    "Clasificas UNA tecnologia sanitaria en un cluster terapeutico y una tipologia del catalogo dado. "
    "Reglas: 1) Solo puedes elegir nombres que esten en los catalogos; si ninguno aplica, deja el campo vacio. "
    "2) Te apoyas en los ejemplos que el equipo ya clasifico: son el criterio vigente del IETS y pesan mas que tu intuicion. "
    "3) No inventas datos de la tecnologia. 4) Respondes UNICAMENTE un objeto JSON, sin markdown ni comentarios."
)
CLASSIFY_USER_PROMPT = """Tecnologia por clasificar:
{signal}

Clusters disponibles: {clusters}
Tipologias disponibles: {tech_types}

Ejemplos parecidos que el equipo ya clasifico (de mayor a menor parecido):
{examples}

Propuesta de las reglas del catalogo: {rules}
Propuesta por parecido con lo ya clasificado: {learned}

Devuelve SOLO este JSON:
{"cluster": "nombre exacto del catalogo o vacio", "tipologia": "nombre exacto del catalogo o vacio", "condicion": "emergente|nueva|vacio", "confianza": 0-100, "motivo": "una frase con la evidencia del texto o de los ejemplos"}"""

ANALYTICS_SYSTEM_PROMPT = (
    "Eres analista del escaneo de horizonte del IETS (Colombia). Redactas una lectura ejecutiva de los "
    "indicadores que se te entregan. Reglas: 1) Usas SOLO las cifras entregadas; prohibido inventar numeros, "
    "tecnologias o causas. 2) Espanol claro, frases cortas, sin adjetivos de relleno. 3) Sigues el marco: "
    "que pasa, por que pasa, que puede pasar y que hacer. 4) Maximo 180 palabras, en cuatro parrafos cortos "
    "titulados Descriptivo, Diagnostico, Predictivo y Prescriptivo."
)
ANALYTICS_USER_PROMPT = """Indicadores del sistema al {date}:
{facts}

Escribe la lectura analitica con el marco de cuatro pasos. Si un indicador no tiene datos, dilo en lugar de suponer."""

DEFAULTS: dict = {
    # Sugerencias de clasificacion
    "enabled": True,  # usar la base de conocimiento al sugerir
    "ai_mode": "desacuerdo",  # nunca | desacuerdo (reglas y aprendizaje no coinciden o hay poca confianza) | siempre
    "neighbors": 7,  # senales parecidas que votan
    "min_similarity": 0.12,  # parecido minimo para votar (0-1)
    "min_confidence": 0.55,  # confianza minima para preferir el aprendizaje sobre las reglas (0-1)
    "target_precision": 0.80,  # precision que la calibracion busca garantizar
    "discard_similarity": 0.60,  # parecido con una senal descartada para avisar
    "examples_in_prompt": 6,  # ejemplos que se le muestran a la IA
    "auto_calibrate": True,  # recalibrar sola cuando hay clasificaciones nuevas
    "auto_calibrate_every": 25,  # cada cuantas clasificaciones nuevas
    # Analitica
    "analytics_ai": True,  # redactar la lectura analitica con IA
    "analytics_cache_hours": 12,
    "noise_alert": 0.50,  # fraccion de descartes de una fuente que dispara la alerta
    "backlog_days_alert": 30,  # dias de una senal sin clasificar
    "concentration_alert": 0.40,  # fraccion de un solo cluster
    # Prompts (vacio = el de fabrica)
    "classify_system": "",
    "classify_user": "",
    "analytics_system": "",
    "analytics_user": "",
}
LIMITS = {
    "neighbors": (1, 25),
    "min_similarity": (0.0, 0.9),
    "min_confidence": (0.0, 1.0),
    "target_precision": (0.5, 0.99),
    "discard_similarity": (0.2, 1.0),
    "examples_in_prompt": (0, 12),
    "auto_calibrate_every": (5, 500),
    "analytics_cache_hours": (0, 168),
    "noise_alert": (0.1, 1.0),
    "backlog_days_alert": (1, 365),
    "concentration_alert": (0.1, 1.0),
}
_BOOL = ("enabled", "auto_calibrate", "analytics_ai")
_INT = ("neighbors", "examples_in_prompt", "auto_calibrate_every", "analytics_cache_hours", "backlog_days_alert")
_TEXT = ("classify_system", "classify_user", "analytics_system", "analytics_user")
MIN_LABELED_TO_LEARN = 5
MIN_LABELED_TO_CALIBRATE = 20
MIN_PER_CLUSTER = 3
CALIBRATION_SAMPLE = 1500
_STOP = frozenset(
    """de la el en los las del con por para una uno que como mas sus este esta estos estas sobre entre sin
    the and for with from that this are was were has have not its their into than also been which
    tecnologia tecnologias salud health study trial clinical ensayo estudio pacientes patients treatment tratamiento
    medicamento drug device dispositivo fase phase nuevo nueva new uso use""".split()
)


# --------------------------------------------------------------------------- #
#  Configuracion
# --------------------------------------------------------------------------- #
def normalize_config(data: dict | None) -> dict:
    out = dict(DEFAULTS)
    for key, value in (data or {}).items():
        if key not in DEFAULTS:
            continue
        if key in _BOOL:
            out[key] = bool(value) if not isinstance(value, str) else value.strip().lower() in ("1", "true", "si", "sí", "on")
        elif key == "ai_mode":
            out[key] = value if value in AI_MODES else DEFAULTS[key]
        elif key in _TEXT:
            out[key] = str(value or "").strip()[:8000]
        else:
            try:
                number = float(value)
            except (TypeError, ValueError):
                continue
            lo, hi = LIMITS[key]
            number = max(lo, min(hi, number))
            out[key] = int(round(number)) if key in _INT else round(number, 3)
    return out


def load_config(db: Session) -> dict:
    raw = settings_store.get_value(db, CONFIG_KEY, "")
    try:
        return normalize_config(json.loads(raw) if raw else {})
    except (ValueError, TypeError):
        return dict(DEFAULTS)


def save_config(db: Session, changes: dict) -> dict:
    current = load_config(db)
    current.update({k: v for k, v in (changes or {}).items() if k in DEFAULTS})
    cfg = normalize_config(current)
    settings_store.set_value(db, CONFIG_KEY, json.dumps(cfg, ensure_ascii=False))
    db.commit()
    return cfg


def reset_config(db: Session) -> dict:
    settings_store.set_value(db, CONFIG_KEY, "")
    db.commit()
    return dict(DEFAULTS)


def prompts(cfg: dict) -> dict:
    """Prompts vigentes: los de Configuracion o, si estan vacios, los de fabrica."""
    return {
        "classify_system": cfg.get("classify_system") or CLASSIFY_SYSTEM_PROMPT,
        "classify_user": cfg.get("classify_user") or CLASSIFY_USER_PROMPT,
        "analytics_system": cfg.get("analytics_system") or ANALYTICS_SYSTEM_PROMPT,
        "analytics_user": cfg.get("analytics_user") or ANALYTICS_USER_PROMPT,
    }


def default_prompts() -> dict:
    return prompts({})


def fill(template: str, **values) -> str:
    """Sustituye {clave} sin interpretar las llaves JSON de la plantilla."""
    for key, value in values.items():
        template = template.replace("{" + key + "}", str(value if value is not None else ""))
    return template


# --------------------------------------------------------------------------- #
#  Texto
# --------------------------------------------------------------------------- #
def fold(text: str) -> str:
    text = unicodedata.normalize("NFKD", text or "")
    return "".join(ch for ch in text if not unicodedata.combining(ch)).lower()


_WORD = re.compile(r"[a-z0-9][a-z0-9\-]{2,}")
_YEAR = re.compile(r"(?<!\d)(19[89]\d|20\d{2})(?!\d)")


def tokenize(text: str) -> list[str]:
    """Palabras utiles del texto (sin tildes, sin palabras vacias), con repeticion."""
    out = []
    for word in _WORD.findall(fold(text)):
        word = word.strip("-")
        if len(word) >= 3 and word not in _STOP and not word.isdigit():
            out.append(word)
    return out


def year_of(*values) -> int | None:
    """Primer ano plausible que aparezca en las fechas dadas (texto o fecha)."""
    limit = datetime.now(timezone.utc).year + 1
    for value in values:
        if value is None or value == "":
            continue
        if hasattr(value, "year"):
            return int(value.year)
        text = str(value)
        compact = re.fullmatch(r"\s*((?:19|20)\d{2})[01]\d[0-3]\d\s*", text)  # 20261123
        if compact:
            return int(compact.group(1))
        for match in _YEAR.finditer(text):
            year = int(match.group(1))
            if year <= limit:
                return year
    return None


def document_text(tech: Technology, finding: Finding | None = None) -> str:
    parts = [
        tech.commercial_name,
        tech.inn_name,
        tech.indication,
        tech.mechanism,
        tech.summary,
        tech.manufacturer,
        tech.development_phase,
        tech.regulatory_status,
        " ".join(str(m) for m in (tech.mesh_terms or [])),
        " ".join(str(c) for c in (tech.icd10_codes or [])),
        (finding.therapeutic_area if finding else ""),
        (finding.technology_type if finding else ""),
    ]
    return re.sub(r"\s+", " ", " ".join(p for p in parts if p)).strip()[:4000]


# --------------------------------------------------------------------------- #
#  Sincronizacion de la base de conocimiento
# --------------------------------------------------------------------------- #
def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def baseline_until(db: Session) -> datetime | None:
    raw = settings_store.get_value(db, BASELINE_KEY, "")
    try:
        return _aware(datetime.fromisoformat(raw)) if raw else None
    except ValueError:
        return None


def set_baseline(db: Session, when: datetime | None = None) -> datetime:
    """Fija hasta cuando una senal cuenta como «primera busqueda historica»."""
    when = _aware(when) or datetime.now(timezone.utc)
    settings_store.set_value(db, BASELINE_KEY, when.isoformat())
    db.query(SignalKnowledge).filter(SignalKnowledge.origin != "postulacion").update(
        {SignalKnowledge.origin: "vigilancia"}, synchronize_session=False
    )
    db.query(SignalKnowledge).filter(
        SignalKnowledge.origin != "postulacion", SignalKnowledge.captured_at <= when
    ).update({SignalKnowledge.origin: "historica"}, synchronize_session=False)
    db.commit()
    _invalidate()
    return when


def _discard_reasons(db: Session, ids: list[int]) -> dict[int, str]:
    if not ids:
        return {}
    out: dict[int, str] = {}
    rows = (
        db.query(AuditLog.entity_id, AuditLog.new_value)
        .filter(AuditLog.entity_type == "technologies", AuditLog.action == DISCARD_ACTION,
                AuditLog.entity_id.in_([str(i) for i in ids]))
        .order_by(AuditLog.id)
        .all()
    )
    for entity_id, value in rows:
        if isinstance(value, dict) and str(entity_id).isdigit():
            out[int(entity_id)] = str(value.get("reason") or "")[:600]
    return out


def _decision(tech: Technology, discarded: dict[int, str]) -> str:
    if tech.status == DISCARDED_STATUS and tech.id in discarded:
        return "descartada"
    if tech.cluster_id and tech.tech_type_id:
        return "clasificada"
    return "pendiente"


def sync(db: Session, *, full: bool = False) -> dict:
    """Pone la base de conocimiento al dia con `technologies`. Barata si nada cambio."""
    known = {
        tid: (row_id, updated)
        for row_id, tid, updated in db.query(
            SignalKnowledge.id, SignalKnowledge.technology_id, SignalKnowledge.source_updated_at
        ).all()
    }
    live = db.query(Technology.id, Technology.updated_at).filter(Technology.merged_into_id.is_(None)).all()
    live_ids = {tid for tid, _u in live}
    stale = [
        tid for tid, updated in live
        if full or tid not in known or _aware(known[tid][1]) != _aware(updated)
    ]
    gone = [row_id for tid, (row_id, _u) in known.items() if tid not in live_ids]
    if not stale and not gone:
        return {"indexed": 0, "removed": 0, "total": len(known)}

    baseline = baseline_until(db)
    if baseline is None:
        # Primera vez: lo que ya esta capturado es la primera busqueda historica.
        baseline = datetime.now(timezone.utc)
        settings_store.set_value(db, BASELINE_KEY, baseline.isoformat())
    indexed = 0
    for start in range(0, len(stale), 400):
        chunk = stale[start : start + 400]
        techs = db.query(Technology).filter(Technology.id.in_(chunk)).all()
        findings = {
            f.id: f for f in db.query(Finding).filter(Finding.id.in_([t.finding_id for t in techs if t.finding_id] or [0])).all()
        }
        discarded = _discard_reasons(db, [t.id for t in techs if t.status == DISCARDED_STATUS])
        rows = {
            r.technology_id: r
            for r in db.query(SignalKnowledge).filter(SignalKnowledge.technology_id.in_(chunk)).all()
        }
        for tech in techs:
            finding = findings.get(tech.finding_id)
            text = document_text(tech, finding)
            row = rows.get(tech.id)
            if row is None:
                row = SignalKnowledge(technology_id=tech.id)
                db.add(row)
            captured = _aware(tech.captured_at)
            row.finding_id = tech.finding_id
            row.source_id = tech.source_id
            row.origin = (
                "postulacion" if tech.source_channel == "reactiva"
                else "historica" if captured and captured <= baseline
                else "vigilancia"
            )
            row.name = (tech.commercial_name or tech.inn_name or "")[:400]
            row.text = text
            row.terms = sorted(set(tokenize(text)))[:400]
            row.year = year_of(
                finding.published_date if finding else "", tech.fda_approval_date, tech.ema_approval_date
            )
            row.cluster_id = tech.cluster_id
            row.tech_type_id = tech.tech_type_id
            row.condition = tech.condition or ""
            row.decision = _decision(tech, discarded)
            row.reason = discarded.get(tech.id, "") if row.decision == "descartada" else ""
            row.url = (finding.url if finding and finding.url else tech.url or "")[:1024]
            row.captured_at = captured
            row.source_updated_at = tech.updated_at
            row.indexed_at = datetime.now(timezone.utc)
            indexed += 1
        db.flush()
    if gone:
        db.query(SignalKnowledge).filter(SignalKnowledge.id.in_(gone)).delete(synchronize_session=False)
    db.commit()
    _invalidate()
    return {"indexed": indexed, "removed": len(gone), "total": len(live_ids)}


def safe_sync(db: Session) -> dict:
    """`sync` que nunca tumba a quien la llama (la base puede estar ocupada)."""
    from sqlalchemy.exc import SQLAlchemyError

    try:
        return sync(db)
    except SQLAlchemyError as exc:
        db.rollback()
        log.warning("Base de conocimiento de senales: no se pudo sincronizar (%s)", type(exc).__name__)
        return {"indexed": 0, "removed": 0, "total": 0, "error": True}


# --------------------------------------------------------------------------- #
#  Indice en memoria (TF-IDF y coseno)
# --------------------------------------------------------------------------- #
class Index:
    def __init__(self, docs: list[dict]):
        self.docs = docs
        n = len(docs)
        df: Counter = Counter()
        counts: list[Counter] = []
        for doc in docs:
            tf = Counter(tokenize(doc["text"]))
            counts.append(tf)
            df.update(tf.keys())
        self.idf = {term: math.log(1 + (n + 1) / (freq + 0.5)) for term, freq in df.items()}
        self.postings: dict[str, list[tuple[int, float]]] = defaultdict(list)
        self.norms: list[float] = []
        for i, tf in enumerate(counts):
            total = 0.0
            for term, freq in tf.items():
                weight = (1 + math.log(freq)) * self.idf[term]
                self.postings[term].append((i, weight))
                total += weight * weight
            self.norms.append(math.sqrt(total) or 1.0)
        self.by_tech = {doc["technology_id"]: i for i, doc in enumerate(docs)}

    def query(self, text: str, *, limit: int = 10, exclude: int | None = None, accept=None) -> list[tuple[dict, float]]:
        tf = Counter(tokenize(text))
        if not tf:
            return []
        weights = {t: (1 + math.log(f)) * self.idf[t] for t, f in tf.items() if t in self.idf}
        norm = math.sqrt(sum(w * w for w in weights.values())) or 1.0
        scores: dict[int, float] = defaultdict(float)
        for term, weight in weights.items():
            for i, doc_weight in self.postings[term]:
                scores[i] += weight * doc_weight
        ranked = []
        for i, dot in scores.items():
            doc = self.docs[i]
            if exclude is not None and doc["technology_id"] == exclude:
                continue
            if accept is not None and not accept(doc):
                continue
            ranked.append((doc, min(1.0, dot / (norm * self.norms[i]))))
        ranked.sort(key=lambda pair: (-pair[1], -pair[0]["technology_id"]))
        return ranked[:limit]


_index_lock = threading.Lock()
_index_cache: dict = {"key": None, "index": None}


def _invalidate() -> None:
    with _index_lock:
        _index_cache["key"] = None
        _index_cache["index"] = None


def index(db: Session) -> Index:
    count, last = db.query(func.count(SignalKnowledge.id), func.max(SignalKnowledge.indexed_at)).one()
    key = (id(db.get_bind()), count, str(last))
    with _index_lock:
        if _index_cache["key"] == key and _index_cache["index"] is not None:
            return _index_cache["index"]
    docs = [
        {
            "technology_id": r.technology_id, "name": r.name, "text": r.text, "decision": r.decision,
            "cluster_id": r.cluster_id, "tech_type_id": r.tech_type_id, "condition": r.condition,
            "origin": r.origin, "year": r.year, "reason": r.reason, "source_id": r.source_id, "url": r.url,
        }
        for r in db.query(SignalKnowledge).all()
    ]
    built = Index(docs)
    with _index_lock:
        _index_cache["key"] = key
        _index_cache["index"] = built
    return built


def _names(db: Session) -> tuple[dict[int, str], dict[int, str], dict[int, str]]:
    clusters = {c.id: c.name for c in db.query(Cluster).all()}
    types = {t.id: t.name for t in db.query(TechType).all()}
    sources = dict(db.query(Source.id, Source.title).all())
    return clusters, types, sources


def _public(doc: dict, score: float, names) -> dict:
    clusters, types, sources = names
    return {
        "technology_id": doc["technology_id"],
        "name": doc["name"],
        "similarity": round(score, 3),
        "decision": doc["decision"],
        "origin": doc["origin"],
        "year": doc["year"],
        "cluster_id": doc["cluster_id"],
        "cluster_name": clusters.get(doc["cluster_id"], ""),
        "tech_type_id": doc["tech_type_id"],
        "tech_type_name": types.get(doc["tech_type_id"], ""),
        "condition": doc["condition"],
        "reason": doc["reason"],
        "source_title": sources.get(doc["source_id"], ""),
        "url": doc["url"],
    }


def similar(
    db: Session, text: str, *, limit: int = 10, decision: str | None = None, origin: str | None = None,
    exclude: int | None = None,
) -> list[dict]:
    """Senales de la base parecidas a `text`, con su decision y su parecido (0-1)."""
    names = _names(db)

    def accept(doc: dict) -> bool:
        return (not decision or doc["decision"] == decision) and (not origin or doc["origin"] == origin)

    return [_public(doc, score, names) for doc, score in index(db).query(text, limit=limit, exclude=exclude, accept=accept)]


def stats(db: Session) -> dict:
    by_decision = dict(db.query(SignalKnowledge.decision, func.count(SignalKnowledge.id)).group_by(SignalKnowledge.decision).all())
    by_origin = dict(db.query(SignalKnowledge.origin, func.count(SignalKnowledge.id)).group_by(SignalKnowledge.origin).all())
    years = [
        {"year": year, "signals": n}
        for year, n in db.query(SignalKnowledge.year, func.count(SignalKnowledge.id))
        .group_by(SignalKnowledge.year).order_by(SignalKnowledge.year).all()
    ]
    baseline = baseline_until(db)
    return {
        "documents": sum(by_decision.values()),
        "classified": by_decision.get("clasificada", 0),
        "discarded": by_decision.get("descartada", 0),
        "pending": by_decision.get("pendiente", 0),
        "historical": by_origin.get("historica", 0),
        "later": by_origin.get("vigilancia", 0),
        "submissions": by_origin.get("postulacion", 0),
        "years": years,
        "baseline_until": baseline.isoformat() if baseline else None,
        "learning": by_decision.get("clasificada", 0) >= MIN_LABELED_TO_LEARN,
        "min_to_learn": MIN_LABELED_TO_LEARN,
        "min_to_calibrate": MIN_LABELED_TO_CALIBRATE,
    }


# --------------------------------------------------------------------------- #
#  Clasificador: reglas + aprendizaje (+ IA)
# --------------------------------------------------------------------------- #
def _vote(neighbors: list[tuple[dict, float]], field: str) -> tuple[int | None, float, int]:
    """(valor ganador, confianza 0-1, vecinos que lo apoyan).

    Confianza = parte del voto que se lleva el ganador x fuerza del parecido
    (un vecino casi identico vale mas que varios lejanos).
    """
    weights: dict[int, float] = defaultdict(float)
    support: Counter = Counter()
    for doc, score in neighbors:
        value = doc.get(field)
        if value:
            weights[value] += score
            support[value] += 1
    if not weights:
        return None, 0.0, 0
    winner = max(weights, key=lambda v: (weights[v], support[v], -v))
    share = weights[winner] / sum(weights.values())
    best = max(score for doc, score in neighbors if doc.get(field) == winner)
    strength = min(1.0, best / 0.5)
    return winner, round(share * strength, 3), support[winner]


def learned(idx: Index, text: str, cfg: dict, *, exclude: int | None = None, k: int | None = None) -> dict:
    """Propuesta por parecido con lo que el equipo ya clasifico."""
    k = int(k or cfg["neighbors"])
    hits = idx.query(text, limit=k, exclude=exclude, accept=lambda d: d["decision"] == "clasificada")
    hits = [(doc, score) for doc, score in hits if score >= cfg["min_similarity"]]
    cluster_id, cluster_conf, cluster_n = _vote(hits, "cluster_id")
    type_id, type_conf, type_n = _vote(hits, "tech_type_id")
    conditions = Counter(doc["condition"] for doc, _s in hits if doc["condition"])
    return {
        "neighbors": hits,
        "cluster_id": cluster_id, "cluster_confidence": cluster_conf, "cluster_support": cluster_n,
        "tech_type_id": type_id, "tech_type_confidence": type_conf, "tech_type_support": type_n,
        "condition": conditions.most_common(1)[0][0] if conditions else "",
    }


def _rules(db: Session, tech: Technology, finding: Finding | None) -> dict:
    from .classification import suggest_cluster, suggest_condition, suggest_tech_type

    cluster_id, cluster_reason = suggest_cluster(
        db, indication=tech.indication, summary=tech.summary, title=tech.commercial_name,
        icd10_codes=tech.icd10_codes, mesh_terms=tech.mesh_terms,
    )
    type_id, type_reason = suggest_tech_type(
        db, legacy_type=finding.technology_type if finding else "", title=tech.commercial_name,
        summary=tech.summary, technology=tech.inn_name,
    )
    condition = suggest_condition(
        phase=tech.development_phase or (finding.phase if finding else ""), summary=tech.summary,
        title=tech.commercial_name, horizon=tech.horizon or (finding.horizon if finding else ""),
    )
    return {"cluster_id": cluster_id, "cluster_reason": cluster_reason, "tech_type_id": type_id,
            "tech_type_reason": type_reason, "condition": condition}


def _combine(rule_value, rule_reason: str, learn_value, confidence: float, support: int, cfg: dict, prior: float) -> dict:
    """Elige entre reglas y aprendizaje para un campo. `prior` = acierto medido de las reglas."""
    if learn_value and rule_value and learn_value == rule_value:
        return {"value": rule_value, "confidence": round(min(0.99, max(confidence, prior) + 0.15), 3),
                "method": "reglas_y_aprendizaje",
                "reason": f"{rule_reason}. Coincide con {support} señal(es) parecida(s) ya clasificada(s)."}
    if learn_value and confidence >= cfg["min_confidence"]:
        return {"value": learn_value, "confidence": confidence, "method": "aprendizaje",
                "reason": f"Parecida a {support} señal(es) que el equipo ya clasificó así."}
    if rule_value:
        return {"value": rule_value, "confidence": round(prior, 3), "method": "reglas", "reason": rule_reason}
    if learn_value:
        return {"value": learn_value, "confidence": confidence, "method": "aprendizaje_debil",
                "reason": f"Parecido bajo con {support} señal(es) ya clasificada(s): revísela con cuidado."}
    return {"value": None, "confidence": 0.0, "method": "sin_evidencia", "reason": ""}


def _parse_json(text: str) -> dict:
    match = re.search(r"\{.*\}", text or "", re.S)
    if not match:
        return {}
    try:
        data = json.loads(match.group(0))
    except ValueError:
        return {}
    return data if isinstance(data, dict) else {}


def _match_name(value, catalog: dict[int, str]) -> int | None:
    wanted = fold(str(value or "")).strip()
    if not wanted:
        return None
    for key, name in catalog.items():
        if fold(name).strip() == wanted:
            return key
    return None


def ai_available() -> bool:
    """La IA esta configurada (punto unico, para poder apagarla en las pruebas)."""
    from . import ai_service

    return ai_service.is_enabled()


def _ask_ai(db: Session, tech: Technology, text: str, cfg: dict, examples: list[dict], rules: dict, learn: dict, names) -> dict:
    """Arbitraje de la IA con los ejemplos del equipo a la vista. {} si no aplica o falla."""
    from . import ai_service

    if not ai_available():
        return {}
    clusters, types, _sources = names
    active_clusters = {c.id: c.name for c in db.query(Cluster).filter(Cluster.is_active == True).all()}  # noqa: E712
    active_types = {t.id: t.name for t in db.query(TechType).filter(TechType.is_active == True).all()}  # noqa: E712
    lines = [
        f"- {e['name'][:120]} | cluster: {e['cluster_name'] or 'n/d'} | tipologia: {e['tech_type_name'] or 'n/d'} | parecido {int(e['similarity'] * 100)}%"
        for e in examples[: int(cfg["examples_in_prompt"])]
    ]
    p = prompts(cfg)
    prompt = fill(
        p["classify_user"],
        signal=text[:1800],
        clusters="; ".join(active_clusters.values()),
        tech_types="; ".join(active_types.values()),
        examples="\n".join(lines) or "(todavia no hay ejemplos parecidos)",
        rules=f"cluster={clusters.get(rules['cluster_id'], 'ninguno')}, tipologia={types.get(rules['tech_type_id'], 'ninguna')}",
        learned=f"cluster={clusters.get(learn['cluster_id'], 'ninguno')} (confianza {int(learn['cluster_confidence'] * 100)}%), "
                f"tipologia={types.get(learn['tech_type_id'], 'ninguna')} (confianza {int(learn['tech_type_confidence'] * 100)}%)",
    )
    try:
        answer, model = ai_service.generate(prompt, system=p["classify_system"], temperature=0.1, max_tokens=400, timeout=45)
    except Exception as exc:  # noqa: BLE001
        log.warning("Clasificacion con IA: %s", exc)
        return {}
    if not answer or answer.lstrip().startswith("[Error"):
        # El proveedor devolvio un error (llave invalida, cupo): no es una respuesta.
        log.warning("Clasificacion con IA: el proveedor no respondio (%s)", (answer or "")[:120])
        return {}
    data = _parse_json(answer)
    if not data or not ({"cluster", "tipologia"} & set(data)):
        return {}
    try:
        confidence = max(0.0, min(1.0, float(data.get("confianza") or 0) / 100))
    except (TypeError, ValueError):
        confidence = 0.0
    condition = fold(str(data.get("condicion") or "")).strip()
    return {
        "cluster_id": _match_name(data.get("cluster"), active_clusters),
        "tech_type_id": _match_name(data.get("tipologia"), active_types),
        "condition": condition if condition in ("emergente", "nueva") else "",
        "confidence": round(confidence, 3),
        "reason": str(data.get("motivo") or "").strip()[:400],
        "model": model or "",
    }


def suggest(db: Session, tech: Technology, *, use_ai: bool | None = None, record: bool = True) -> dict:
    """Sugerencia de cluster, tipologia y condicion, con confianza y evidencia."""
    cfg = load_config(db)
    finding = db.get(Finding, tech.finding_id) if tech.finding_id else None
    rules = _rules(db, tech, finding)
    names = _names(db)
    clusters, types, _sources = names
    text = document_text(tech, finding)
    calibration = load_calibration(db)
    prior_cluster = float(calibration.get("rules_cluster_accuracy") or 0.5)
    prior_type = float(calibration.get("rules_type_accuracy") or 0.6)

    learn = {"neighbors": [], "cluster_id": None, "cluster_confidence": 0.0, "cluster_support": 0,
             "tech_type_id": None, "tech_type_confidence": 0.0, "tech_type_support": 0, "condition": ""}
    discard_hint = None
    examples: list[dict] = []
    if cfg["enabled"]:
        safe_sync(db)
        idx = index(db)
        if sum(1 for d in idx.docs if d["decision"] == "clasificada") >= MIN_LABELED_TO_LEARN:
            learn = learned(idx, text, cfg, exclude=tech.id)
        examples = [_public(doc, score, names) for doc, score in learn["neighbors"]]
        dropped = idx.query(text, limit=3, exclude=tech.id, accept=lambda d: d["decision"] == "descartada")
        dropped = [(doc, score) for doc, score in dropped if score >= cfg["discard_similarity"]]
        if dropped:
            top = dropped[0]
            discard_hint = {
                "count": len(dropped),
                "similarity": round(top[1], 3),
                "name": top[0]["name"],
                "reason": top[0]["reason"],
                "technology_id": top[0]["technology_id"],
                "message": f"Se parece a {len(dropped)} señal(es) que el equipo descartó"
                           + (f" («{top[0]['reason'][:160]}»)" if top[0]["reason"] else "") + ". Revise si aplica el mismo criterio.",
            }

    cluster = _combine(rules["cluster_id"], rules["cluster_reason"], learn["cluster_id"], learn["cluster_confidence"],
                       learn["cluster_support"], cfg, prior_cluster)
    tech_type = _combine(rules["tech_type_id"], rules["tech_type_reason"], learn["tech_type_id"],
                         learn["tech_type_confidence"], learn["tech_type_support"], cfg, prior_type)
    condition = rules["condition"] or learn["condition"]

    ai = {}
    mode = cfg["ai_mode"] if use_ai is None else ("siempre" if use_ai else "nunca")
    unsure = (
        cluster["method"] in ("sin_evidencia", "aprendizaje_debil") or tech_type["method"] in ("sin_evidencia", "aprendizaje_debil")
        or (rules["cluster_id"] and learn["cluster_id"] and rules["cluster_id"] != learn["cluster_id"])
        or cluster["confidence"] < cfg["min_confidence"]
    )
    if mode == "siempre" or (mode == "desacuerdo" and unsure):
        ai = _ask_ai(db, tech, text, cfg, examples, rules, learn, names)
        if ai.get("cluster_id") and (cluster["method"] in ("sin_evidencia", "aprendizaje_debil", "reglas") or ai["cluster_id"] == cluster["value"]):
            agrees = ai["cluster_id"] == cluster["value"]
            cluster = {"value": ai["cluster_id"],
                       "confidence": round(min(0.99, max(ai["confidence"], cluster["confidence"]) + (0.1 if agrees else 0)), 3),
                       "method": "ia_confirma" if agrees else "ia", "reason": ai["reason"] or cluster["reason"]}
        if ai.get("tech_type_id") and (tech_type["method"] in ("sin_evidencia", "aprendizaje_debil", "reglas") or ai["tech_type_id"] == tech_type["value"]):
            agrees = ai["tech_type_id"] == tech_type["value"]
            tech_type = {"value": ai["tech_type_id"],
                         "confidence": round(min(0.99, max(ai["confidence"], tech_type["confidence"]) + (0.1 if agrees else 0)), 3),
                         "method": "ia_confirma" if agrees else "ia", "reason": ai["reason"] or tech_type["reason"]}
        condition = condition or ai.get("condition", "")

    out = {
        "cluster_id": cluster["value"],
        "cluster_name": clusters.get(cluster["value"], ""),
        "cluster_reason": cluster["reason"],
        "cluster_confidence": int(round(cluster["confidence"] * 100)),
        "cluster_method": cluster["method"],
        "tech_type_id": tech_type["value"],
        "tech_type_name": types.get(tech_type["value"], ""),
        "tech_type_reason": tech_type["reason"],
        "tech_type_confidence": int(round(tech_type["confidence"] * 100)),
        "tech_type_method": tech_type["method"],
        "condition": condition,
        "similar": examples[:5],
        "discard_hint": discard_hint,
        "ai_used": bool(ai),
        "ai_model": ai.get("model", ""),
        "learning": bool(learn["neighbors"]),
        "min_confidence": int(round(cfg["min_confidence"] * 100)),
    }
    if record and (out["cluster_id"] or out["tech_type_id"]):
        from .audit import record_action

        record_action(
            db, entity_type="technologies", entity_id=tech.id, action=SUGGEST_ACTION,
            new_value={"cluster_id": out["cluster_id"], "tech_type_id": out["tech_type_id"],
                       "cluster_method": out["cluster_method"], "tech_type_method": out["tech_type_method"],
                       "cluster_confidence": out["cluster_confidence"], "tech_type_confidence": out["tech_type_confidence"]},
        )
        db.commit()
    return out


def acceptance(db: Session, *, limit: int = 2000) -> dict:
    """Cuantas sugerencias termino confirmando el evaluador (por metodo)."""
    rows = (
        db.query(AuditLog.entity_id, AuditLog.new_value)
        .filter(AuditLog.entity_type == "technologies", AuditLog.action == SUGGEST_ACTION)
        .order_by(AuditLog.id.desc()).limit(limit).all()
    )
    last: dict[int, dict] = {}
    for entity_id, value in rows:
        if str(entity_id).isdigit() and isinstance(value, dict):
            last.setdefault(int(entity_id), value)
    if not last:
        return {"suggested": 0, "decided": 0, "cluster_accepted": 0, "type_accepted": 0, "by_method": []}
    techs = {
        t.id: t for t in db.query(Technology).filter(Technology.id.in_(list(last))).all()
    }
    decided = cluster_ok = type_ok = 0
    methods: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for tid, value in last.items():
        tech = techs.get(tid)
        if tech is None or not tech.cluster_id or not tech.tech_type_id:
            continue
        decided += 1
        hit = bool(value.get("cluster_id")) and value.get("cluster_id") == tech.cluster_id
        cluster_ok += hit
        type_ok += bool(value.get("tech_type_id")) and value.get("tech_type_id") == tech.tech_type_id
        bucket = methods[str(value.get("cluster_method") or "reglas")]
        bucket[0] += 1
        bucket[1] += hit
    return {
        "suggested": len(last), "decided": decided, "cluster_accepted": cluster_ok, "type_accepted": type_ok,
        "by_method": [{"method": m, "decided": n, "accepted": ok} for m, (n, ok) in sorted(methods.items())],
    }


# --------------------------------------------------------------------------- #
#  Calibracion
# --------------------------------------------------------------------------- #
def load_calibration(db: Session) -> dict:
    raw = settings_store.get_value(db, CALIBRATION_KEY, "")
    try:
        data = json.loads(raw) if raw else {}
    except (ValueError, TypeError):
        data = {}
    return data if isinstance(data, dict) else {}


def calibrate(db: Session, *, apply: bool = True, actor: str = "sistema") -> dict:
    """Mide el acierto de cada metodo con lo ya clasificado y ajusta los parametros.

    Validacion dejando una fuera: cada senal clasificada se predice sin verla.
    Elige el numero de vecinos con mejor acierto y la menor confianza minima que
    cumple la precision objetivo. Con pocos datos no cambia nada y lo dice.
    """
    from .audit import record_action

    sync(db)
    cfg = load_config(db)
    idx = index(db)
    labeled = [d for d in idx.docs if d["decision"] == "clasificada"]
    labeled.sort(key=lambda d: -d["technology_id"])
    sample = labeled[:CALIBRATION_SAMPLE]
    now = datetime.now(timezone.utc).isoformat()
    if len(labeled) < MIN_LABELED_TO_CALIBRATE:
        out = {"at": now, "status": "insuficiente", "labeled": len(labeled), "needed": MIN_LABELED_TO_CALIBRATE,
               "message": f"Hay {len(labeled)} señal(es) clasificada(s); la calibración necesita al menos {MIN_LABELED_TO_CALIBRATE}. "
                          "Se conservan los parámetros actuales."}
        settings_store.set_value(db, CALIBRATION_KEY, json.dumps(out, ensure_ascii=False))
        db.commit()
        return out
    per_cluster = Counter(d["cluster_id"] for d in labeled)
    variety = sum(1 for n in per_cluster.values() if n >= MIN_PER_CLUSTER)
    majority = max(per_cluster.values()) / len(labeled)
    if variety < 2:
        out = {"at": now, "status": "insuficiente", "labeled": len(labeled), "needed": MIN_LABELED_TO_CALIBRATE,
               "message": f"Las {len(labeled)} señales clasificadas están casi todas en un solo clúster. La calibración necesita al menos "
                          f"dos clústeres con {MIN_PER_CLUSTER} o más ejemplos cada uno. Se conservan los parámetros actuales."}
        settings_store.set_value(db, CALIBRATION_KEY, json.dumps(out, ensure_ascii=False))
        db.commit()
        return out

    techs = {t.id: t for t in db.query(Technology).filter(Technology.id.in_([d["technology_id"] for d in sample])).all()}
    findings = {f.id: f for f in db.query(Finding).filter(Finding.id.in_([t.finding_id for t in techs.values() if t.finding_id] or [0])).all()}
    rules_cluster = rules_type = rules_n = 0
    rule_cache: dict[int, dict] = {}
    for doc in sample:
        tech = techs.get(doc["technology_id"])
        if tech is None:
            continue
        rules = _rules(db, tech, findings.get(tech.finding_id))
        rule_cache[doc["technology_id"]] = rules
        rules_n += 1
        rules_cluster += rules["cluster_id"] == doc["cluster_id"]
        rules_type += rules["tech_type_id"] == doc["tech_type_id"]

    grid = sorted({3, 5, 7, 11, int(cfg["neighbors"])})
    by_k = {}
    predictions: dict[int, list[tuple[float, bool, float, bool]]] = {}
    loose = dict(cfg, min_similarity=min(cfg["min_similarity"], 0.05))
    for k in grid:
        rows = []
        for doc in sample:
            guess = learned(idx, doc["text"], loose, exclude=doc["technology_id"], k=k)
            rows.append((guess["cluster_confidence"], guess["cluster_id"] == doc["cluster_id"],
                         guess["tech_type_confidence"], guess["tech_type_id"] == doc["tech_type_id"]))
        predictions[k] = rows
        by_k[k] = {
            "cluster_accuracy": round(sum(r[1] for r in rows) / len(rows), 3),
            "type_accuracy": round(sum(r[3] for r in rows) / len(rows), 3),
        }
    best_k = max(grid, key=lambda k: (by_k[k]["cluster_accuracy"] + by_k[k]["type_accuracy"], -k))
    rows = predictions[best_k]

    curve = []
    chosen = None
    # Por debajo de 0,30 la «confianza» es casi azar: no se ofrece como umbral.
    for step in range(6, 19):
        threshold = round(step * 0.05, 2)
        kept = [r for r in rows if r[0] >= threshold]
        precision = sum(r[1] for r in kept) / len(kept) if kept else 0.0
        point = {"threshold": threshold, "coverage": round(len(kept) / len(rows), 3), "precision": round(precision, 3), "n": len(kept)}
        curve.append(point)
        if chosen is None and len(kept) >= 5 and precision >= cfg["target_precision"]:
            chosen = point
    bins = []
    for lo in (0.0, 0.2, 0.4, 0.6, 0.8):
        inside = [r for r in rows if lo <= r[0] < lo + 0.2 or (lo == 0.8 and r[0] >= 0.8)]
        bins.append({"from": lo, "to": round(lo + 0.2, 1), "n": len(inside),
                     "precision": round(sum(r[1] for r in inside) / len(inside), 3) if inside else None})

    threshold = chosen["threshold"] if chosen else cfg["min_confidence"]
    # Lo que vera el evaluador: el aprendizaje si supera la confianza minima; si no, las reglas.
    combined = 0
    for doc, row in zip(sample, rows):
        if row[0] >= threshold:
            combined += row[1]
        else:
            combined += (rule_cache.get(doc["technology_id"]) or {}).get("cluster_id") == doc["cluster_id"]

    out = {
        "at": now, "status": "ok", "labeled": len(labeled), "evaluated": len(sample),
        "neighbors": best_k, "by_neighbors": [{"neighbors": k, **v} for k, v in by_k.items()],
        "min_confidence": threshold, "target_precision": cfg["target_precision"],
        "target_met": chosen is not None,
        "coverage": chosen["coverage"] if chosen else None,
        "rules_cluster_accuracy": round(rules_cluster / rules_n, 3) if rules_n else None,
        "rules_type_accuracy": round(rules_type / rules_n, 3) if rules_n else None,
        "learned_cluster_accuracy": by_k[best_k]["cluster_accuracy"],
        "learned_type_accuracy": by_k[best_k]["type_accuracy"],
        "combined_cluster_accuracy": round(combined / len(sample), 3),
        # Acierto de decir siempre el cluster mas frecuente: el piso contra el que se compara.
        "majority_baseline": round(majority, 3), "clusters_with_examples": variety,
        "curve": curve, "bins": bins, "applied": False,
        "message": (
            f"Con {best_k} vecinos y confianza mínima de {int(threshold * 100)} % el aprendizaje acierta el clúster en "
            f"{int((chosen['precision'] if chosen else by_k[best_k]['cluster_accuracy']) * 100)} % de los casos"
            + (f" y cubre {int(chosen['coverage'] * 100)} % de las señales." if chosen else
               f", por debajo del objetivo de {int(cfg['target_precision'] * 100)} %: se conserva la confianza mínima actual y mandan las reglas.")
            + f" Referencia: decir siempre el clúster más frecuente acertaría {int(majority * 100)} %."
        ),
    }
    if apply:
        save_config(db, {"neighbors": best_k, "min_confidence": threshold} if chosen else {"neighbors": best_k})
        out["applied"] = True
    settings_store.set_value(db, CALIBRATION_KEY, json.dumps(out, ensure_ascii=False))
    record_action(db, entity_type="intelligence", entity_id="calibration", action="intelligence:calibrate",
                  new_value={k: out[k] for k in ("labeled", "neighbors", "min_confidence", "target_met", "learned_cluster_accuracy",
                                                 "rules_cluster_accuracy", "combined_cluster_accuracy", "applied")} | {"ejecutado_por": actor})
    db.commit()
    return out


def auto_maintain(session_factory) -> str:
    """Tarea de fondo (vigilante de la cola): sincroniza y recalibra si hay clasificaciones nuevas."""
    db = session_factory()
    try:
        cfg = load_config(db)
        if not cfg["enabled"]:
            return ""
        done = sync(db)
        if not cfg["auto_calibrate"]:
            return "sincronizada" if done["indexed"] or done["removed"] else ""
        labeled = db.query(func.count(SignalKnowledge.id)).filter(SignalKnowledge.decision == "clasificada").scalar() or 0
        previous = int(load_calibration(db).get("labeled") or 0)
        if labeled >= MIN_LABELED_TO_CALIBRATE and labeled - previous >= cfg["auto_calibrate_every"]:
            calibrate(db, apply=True, actor="sistema (automático)")
            return "calibrada"
        return "sincronizada" if done["indexed"] or done["removed"] else ""
    except Exception:  # noqa: BLE001
        db.rollback()
        log.exception("Mantenimiento de la base de conocimiento de senales")
        return ""
    finally:
        db.close()


def export(db: Session) -> dict:
    """Paquete de la base de conocimiento (para respaldo o analisis externo)."""
    names = _names(db)
    rows = db.query(SignalKnowledge).order_by(SignalKnowledge.technology_id).all()
    return {
        "version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "stats": stats(db),
        "documents": [
            {
                "technology_id": r.technology_id, "name": r.name, "text": r.text, "origin": r.origin, "year": r.year,
                "decision": r.decision, "cluster": names[0].get(r.cluster_id, ""), "tech_type": names[1].get(r.tech_type_id, ""),
                "condition": r.condition, "reason": r.reason, "source": names[2].get(r.source_id, ""), "url": r.url,
                "captured_at": r.captured_at.isoformat() if r.captured_at else None,
            }
            for r in rows
        ],
    }
