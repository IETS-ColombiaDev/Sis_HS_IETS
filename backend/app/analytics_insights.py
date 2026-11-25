"""Marco analitico del sistema: que pasa, por que, que puede pasar y que hacer.

Cuatro lentes sobre los mismos datos del sistema:

- **Descriptivo**: volumen capturado, estado de la bandeja, clusteres y fuentes.
- **Diagnostico**: de donde sale el ruido, que fuentes no aportan, que tan
  exactos son los enlaces y cuanto lleva la bandeja sin atender.
- **Predictivo**: tendencia de la captura, clusteres que crecen y tiempo
  estimado para evacuar la bandeja al ritmo actual.
- **Prescriptivo**: acciones concretas que se desprenden de lo anterior.

Todo se calcula con reglas sobre la base (funciona con la IA apagada). Si la IA
esta encendida, redacta ademas una lectura ejecutiva usando SOLO esas cifras;
se guarda para no gastar en cada visita. Los umbrales de alerta y los prompts
estan en Configuracion › Inteligencia.
"""
from __future__ import annotations

import hashlib
import json
import logging
import statistics
from collections import Counter
from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from . import intelligence, settings_store
from .models import Cluster, Finding, Source, Technology

log = logging.getLogger(__name__)

NARRATIVE_KEY = "intelligence.analytics_narrative"
MONTHS = 6
MIN_SIGNALS_FOR_NOISE = 5
LENSES = (
    ("descriptivo", "Descriptivo", "¿Qué está pasando?"),
    ("diagnostico", "Diagnóstico", "¿Por qué pasa?"),
    ("predictivo", "Predictivo", "¿Qué puede pasar?"),
    ("prescriptivo", "Prescriptivo", "¿Qué conviene hacer?"),
)
_MONTH_NAMES = ("ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic")


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _pct(part: float, whole: float) -> int:
    return int(round(100 * part / whole)) if whole else 0


def _slope(values: list[int]) -> float:
    """Pendiente por minimos cuadrados (senales por mes)."""
    n = len(values)
    if n < 2:
        return 0.0
    mean_x = (n - 1) / 2
    mean_y = sum(values) / n
    den = sum((i - mean_x) ** 2 for i in range(n))
    return sum((i - mean_x) * (v - mean_y) for i, v in enumerate(values)) / den if den else 0.0


def _months(now: datetime) -> list[tuple[int, int]]:
    out = []
    year, month = now.year, now.month
    for _ in range(MONTHS):
        out.append((year, month))
        month -= 1
        if month == 0:
            year, month = year - 1, 12
    return list(reversed(out))


def facts(db: Session, now: datetime | None = None) -> dict:
    """Cifras del sistema para los cuatro lentes."""
    now = now or datetime.now(timezone.utc)
    cfg = intelligence.load_config(db)
    techs = db.query(
        Technology.id, Technology.status, Technology.captured_at, Technology.updated_at, Technology.cluster_id,
        Technology.tech_type_id, Technology.source_id, Technology.corroboration_count,
    ).filter(Technology.merged_into_id.is_(None)).all()
    clusters = {c.id: c.name for c in db.query(Cluster).all()}
    sources = {s.id: s for s in db.query(Source).all()}

    total = len(techs)
    inbox = [t for t in techs if t.status == intelligence.STAGING_STATUS]
    discarded = [t for t in techs if t.status == intelligence.DISCARDED_STATUS]
    in_cycle = total - len(inbox) - len(discarded)
    inbox_classified = [t for t in inbox if t.cluster_id and t.tech_type_id]
    pending = [t for t in inbox if not (t.cluster_id and t.tech_type_id)]

    months = _months(now)
    per_month = Counter()
    for t in techs:
        captured = _aware(t.captured_at)
        if captured:
            per_month[(captured.year, captured.month)] += 1
    series = [{"label": f"{_MONTH_NAMES[m - 1]} {y}", "signals": per_month.get((y, m), 0)} for y, m in months]
    values = [p["signals"] for p in series]
    # El mes en curso esta incompleto: la tendencia se mide con los meses cerrados.
    closed = values[:-1]
    slope = _slope(closed)
    projection = max(0, int(round((closed[-1] if closed else 0) + slope)))

    last30 = sum(1 for t in techs if _aware(t.captured_at) and _aware(t.captured_at) >= now - timedelta(days=30))
    prev30 = sum(
        1 for t in techs
        if _aware(t.captured_at) and now - timedelta(days=60) <= _aware(t.captured_at) < now - timedelta(days=30)
    )

    classified = [t for t in techs if t.cluster_id and t.status != intelligence.DISCARDED_STATUS]
    by_cluster = Counter(t.cluster_id for t in classified)
    top_clusters = [
        {"name": clusters.get(cid, f"Clúster {cid}"), "signals": n, "share": _pct(n, len(classified))}
        for cid, n in by_cluster.most_common(5)
    ]
    recent = Counter(t.cluster_id for t in classified if _aware(t.captured_at) and _aware(t.captured_at) >= now - timedelta(days=60))
    before = Counter(
        t.cluster_id for t in classified
        if _aware(t.captured_at) and now - timedelta(days=120) <= _aware(t.captured_at) < now - timedelta(days=60)
    )
    growing = sorted(
        ({"name": clusters.get(cid, f"Clúster {cid}"), "recent": n, "before": before.get(cid, 0)} for cid, n in recent.items()
         if n >= 3 and n > before.get(cid, 0)),
        key=lambda g: -(g["recent"] - g["before"]),
    )[:3]

    per_source: dict[int, list[int]] = {}
    for t in techs:
        if t.source_id:
            entry = per_source.setdefault(t.source_id, [0, 0])
            entry[0] += 1
            entry[1] += t.status == intelligence.DISCARDED_STATUS
    noisy = sorted(
        ({"source_id": sid, "title": (sources[sid].title if sid in sources else "") or f"Fuente {sid}", "signals": n,
          "discarded": d, "rate": _pct(d, n)}
         for sid, (n, d) in per_source.items() if n >= MIN_SIGNALS_FOR_NOISE and d / n >= cfg["noise_alert"]),
        key=lambda r: (-r["rate"], -r["signals"]),
    )[:5]
    top_sources = sorted(
        ({"source_id": sid, "title": (sources[sid].title if sid in sources else "") or f"Fuente {sid}", "signals": n - d}
         for sid, (n, d) in per_source.items()),
        key=lambda r: -r["signals"],
    )[:5]
    active = [s for s in sources.values() if s.scrape_enabled and not getattr(s, "retired", False) and s.catalog_active is not False]
    silent = [s for s in active if s.id not in per_source]

    link_rows = dict(
        db.query(Finding.link_type, func.count(Finding.id)).group_by(Finding.link_type).all()
    )
    links_total = sum(link_rows.values())
    ages = sorted((now - _aware(t.captured_at)).days for t in pending if _aware(t.captured_at))
    old = sum(1 for a in ages if a >= cfg["backlog_days_alert"])
    done30 = sum(
        1 for t in techs
        if t.cluster_id and t.tech_type_id and _aware(t.updated_at) and _aware(t.updated_at) >= now - timedelta(days=30)
    )
    weekly_rate = done30 / 4.3
    weeks_to_clear = round(len(pending) / weekly_rate, 1) if weekly_rate >= 0.5 else None

    kb = intelligence.stats(db)
    calibration = intelligence.load_calibration(db)
    accepted = intelligence.acceptance(db)
    return {
        "date": now.date().isoformat(),
        "total": total, "inbox": len(inbox), "inbox_classified": len(inbox_classified), "pending": len(pending),
        "discarded": len(discarded), "in_cycle": in_cycle,
        "discard_rate": _pct(len(discarded), total),
        "corroborated": sum(1 for t in inbox if (t.corroboration_count or 1) > 1),
        "series": series, "slope": round(slope, 1), "projection": projection,
        "last30": last30, "prev30": prev30, "change30": _pct(last30 - prev30, prev30) if prev30 else None,
        "top_clusters": top_clusters, "concentration": top_clusters[0]["share"] if top_clusters else 0,
        "classified": len(classified), "growing": growing,
        "noisy_sources": noisy, "top_sources": top_sources, "active_sources": len(active), "silent_sources": len(silent),
        "exact_links": _pct(link_rows.get("exacto", 0), links_total), "links_total": links_total,
        "backlog_median_days": int(statistics.median(ages)) if ages else 0, "backlog_old": old,
        "classified_last30": done30, "weeks_to_clear": weeks_to_clear,
        "kb_documents": kb["documents"], "kb_classified": kb["classified"], "kb_discarded": kb["discarded"],
        "kb_historical": kb["historical"], "kb_later": kb["later"],
        "calibration_status": calibration.get("status") or "sin_calibrar",
        "calibration_accuracy": _pct(calibration.get("combined_cluster_accuracy") or 0, 1) if calibration.get("status") == "ok" else None,
        "suggestions_decided": accepted["decided"],
        "suggestions_accepted": _pct(accepted["cluster_accepted"], accepted["decided"]) if accepted["decided"] else None,
        "thresholds": {"noise_alert": _pct(cfg["noise_alert"], 1), "backlog_days_alert": cfg["backlog_days_alert"],
                       "concentration_alert": _pct(cfg["concentration_alert"], 1)},
    }


def _item(title: str, value, detail: str, severity: str = "info", link: str = "") -> dict:
    return {"title": title, "value": value, "detail": detail, "severity": severity, "link": link}


def framework(f: dict) -> list[dict]:
    """Los cuatro lentes con sus hallazgos, a partir de las cifras."""
    t = f["thresholds"]
    descriptive = [
        _item("Señales capturadas", f["total"],
              f"{f['inbox']} en la bandeja de entrada, {f['in_cycle']} en ciclos y {f['discarded']} descartadas."),
        _item("Por clasificar", f["pending"],
              f"{f['inbox_classified']} de la bandeja ya tienen clúster y tipología; {f['corroborated']} están en varias fuentes.",
              "warn" if f["pending"] else "ok", "/bandeja-entrada"),
        _item("Capturadas en 30 días", f["last30"],
              "Sin periodo anterior para comparar." if f["change30"] is None
              else f"{'+' if f['change30'] >= 0 else ''}{f['change30']} % frente a los 30 días anteriores ({f['prev30']})."),
    ]
    if f["top_clusters"]:
        top = f["top_clusters"][0]
        descriptive.append(_item("Clúster con más señales", top["name"],
                                 f"{top['signals']} señales clasificadas ({top['share']} % del total clasificado)."))

    diagnostic = [
        _item("Descarte", f"{f['discard_rate']} %",
              f"{f['discarded']} de {f['total']} señales se descartaron en la bandeja.",
              "warn" if f["discard_rate"] >= t["noise_alert"] else "info"),
        _item("Enlaces exactos", f"{f['exact_links']} %",
              f"De {f['links_total']} señales, las demás abren la página de consulta o no tienen enlace.",
              "ok" if f["exact_links"] >= 80 else "warn", "/senales"),
        _item("Fuentes sin señales", f["silent_sources"],
              f"De {f['active_sources']} fuentes con ingesta activa. Revise su URL en el Diagnóstico para la matriz.",
              "warn" if f["silent_sources"] else "ok", "/fuentes"),
        _item("Antigüedad de la bandeja", f"{f['backlog_median_days']} días",
              f"Mediana de las señales por clasificar; {f['backlog_old']} llevan {t['backlog_days_alert']} días o más.",
              "warn" if f["backlog_old"] else "ok", "/bandeja-entrada"),
    ]
    for row in f["noisy_sources"][:3]:
        diagnostic.append(_item("Fuente con mucho ruido", f"{row['rate']} %",
                                f"{row['title']}: {row['discarded']} de {row['signals']} señales descartadas.", "warn", "/fuentes"))

    direction = "sube" if f["slope"] > 0.5 else "baja" if f["slope"] < -0.5 else "se mantiene"
    predictive = [
        _item("Tendencia de captura", direction,
              f"{f['slope']:+} señales por mes en los últimos {MONTHS - 1} meses cerrados. "
              f"Proyección del próximo mes: {f['projection']}."),
        _item("Tiempo para evacuar la bandeja",
              f"{f['weeks_to_clear']} semanas" if f["weeks_to_clear"] is not None else "sin ritmo medible",
              f"Al ritmo de los últimos 30 días ({f['classified_last30']} clasificadas) frente a {f['pending']} por clasificar."
              if f["weeks_to_clear"] is not None else
              f"Hay {f['pending']} por clasificar y casi ninguna clasificación en 30 días: no se puede proyectar.",
              "warn" if f["weeks_to_clear"] is None and f["pending"] else "info"),
    ]
    for row in f["growing"]:
        predictive.append(_item("Clúster en crecimiento", row["name"],
                                f"{row['recent']} señales en 60 días frente a {row['before']} en los 60 anteriores."))

    actions = []
    if f["pending"] and (f["weeks_to_clear"] is None or f["weeks_to_clear"] > 8):
        actions.append(_item("Evacuar la bandeja", f["pending"],
                             "Use (Sugerir clasificación) y la asignación por lotes; descarte por grupo lo ya conocido.",
                             "warn", "/bandeja-entrada"))
    if f["noisy_sources"]:
        actions.append(_item("Revisar fuentes con ruido", len(f["noisy_sources"]),
                             f"Más del {t['noise_alert']} % de sus señales se descarta: ajuste su URL de entrada o sus términos.",
                             "warn", "/fuentes"))
    if f["silent_sources"]:
        actions.append(_item("Atender fuentes sin señales", f["silent_sources"],
                             "Abra Señales capturadas › Reporte de enlaces › Diagnóstico para la matriz.", "warn", "/senales"))
    if f["concentration"] >= t["concentration_alert"] and f["top_clusters"]:
        actions.append(_item("Equilibrar la vigilancia", f"{f['concentration']} %",
                             f"{f['top_clusters'][0]['name']} concentra la clasificación: revise si faltan fuentes de otros clústeres.",
                             "info", "/fuentes"))
    if f["calibration_status"] != "ok":
        actions.append(_item("Calibrar el clasificador", f["kb_classified"],
                             "Señales clasificadas en la base de conocimiento. Con 20 o más, calibre en Configuración › Inteligencia.",
                             "info", "/configuracion?tab=inteligencia"))
    elif f["suggestions_accepted"] is not None and f["suggestions_decided"] >= 10 and f["suggestions_accepted"] < 60:
        actions.append(_item("Recalibrar el clasificador", f"{f['suggestions_accepted']} %",
                             "El equipo confirma pocas sugerencias: recalibre o ajuste las palabras clave de los clústeres.",
                             "warn", "/configuracion?tab=inteligencia"))
    if f["exact_links"] < 80 and f["links_total"]:
        actions.append(_item("Mejorar el enlace a la señal", f"{f['exact_links']} %",
                             "Registre en la matriz el canal RSS o el listado de las fuentes que abren una página de consulta.",
                             "info", "/senales"))
    if not actions:
        actions.append(_item("Sin alertas", "al día", "Los indicadores están dentro de los umbrales configurados.", "ok"))
    groups = {"descriptivo": descriptive, "diagnostico": diagnostic, "predictivo": predictive, "prescriptivo": actions}
    return [{"lens": key, "title": title, "question": question, "items": groups[key]} for key, title, question in LENSES]


def _facts_for_prompt(f: dict) -> str:
    keep = {k: v for k, v in f.items() if k not in ("thresholds",)}
    return json.dumps(keep, ensure_ascii=False, indent=1)[:6000]


def _stored(db: Session) -> dict:
    raw = settings_store.get_value(db, NARRATIVE_KEY, "")
    try:
        data = json.loads(raw) if raw else {}
    except (ValueError, TypeError):
        data = {}
    return data if isinstance(data, dict) else {}


def narrative(db: Session, f: dict, *, force: bool = False) -> dict:
    """Lectura ejecutiva redactada por la IA con las cifras dadas (guardada entre visitas)."""
    from . import ai_service

    cfg = intelligence.load_config(db)
    if not cfg["analytics_ai"]:
        return {"text": "", "status": "apagada", "note": "La lectura con IA está apagada en Configuración › Inteligencia."}
    stored = _stored(db)
    # Las cifras cambian con cada senal: la lectura se renueva por tiempo, no por cada cambio.
    key = hashlib.sha256(json.dumps([f["date"], f["total"] // 25, f["pending"] // 25], sort_keys=True).encode()).hexdigest()[:16]
    fresh = False
    if stored.get("at"):
        try:
            age = datetime.now(timezone.utc) - datetime.fromisoformat(stored["at"])
            fresh = age < timedelta(hours=cfg["analytics_cache_hours"])
        except ValueError:
            fresh = False
    if not force and stored.get("text") and (fresh or stored.get("key") == key):
        return {"text": stored["text"], "model": stored.get("model", ""), "at": stored.get("at"), "status": "guardada"}
    if not intelligence.ai_available():
        return {"text": stored.get("text", ""), "model": stored.get("model", ""), "at": stored.get("at"), "status": "sin_ia",
                "note": "La IA no está configurada: se muestran los hallazgos calculados por reglas."}
    if not force and stored.get("text"):
        # Vencida: se sirve la anterior; se renueva cuando alguien la pide de forma explicita.
        return {"text": stored["text"], "model": stored.get("model", ""), "at": stored.get("at"), "status": "vencida"}
    if not force:
        return {"text": "", "status": "pendiente", "note": "Pulse (Generar lectura con IA) para redactarla."}
    p = intelligence.prompts(cfg)
    try:
        text, model = ai_service.generate(
            intelligence.fill(p["analytics_user"], date=f["date"], facts=_facts_for_prompt(f)),
            system=p["analytics_system"], temperature=0.2, max_tokens=700, timeout=60,
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("Lectura analitica con IA: %s", exc)
        text, model = "", ""
    text = (text or "").strip()
    if not text or text.startswith("[Error"):
        return {"text": stored.get("text", ""), "model": stored.get("model", ""), "at": stored.get("at"), "status": "error",
                "note": "La IA no respondió. Se conserva la lectura anterior, si la hay."}
    record = {"text": text[:4000], "model": model or "", "at": datetime.now(timezone.utc).isoformat(), "key": key}
    settings_store.set_value(db, NARRATIVE_KEY, json.dumps(record, ensure_ascii=False))
    db.commit()
    return {"text": record["text"], "model": record["model"], "at": record["at"], "status": "nueva"}


def insights(db: Session, *, generate: bool = False) -> dict:
    intelligence.safe_sync(db)
    f = facts(db)
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "framework": framework(f),
        "series": f["series"],
        "facts": f,
        "narrative": narrative(db, f, force=generate),
    }
