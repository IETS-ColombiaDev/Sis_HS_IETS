"""Estimacion del tiempo que falta para terminar la vigilancia en curso.

No es un promedio global: cada fuente tarda distinto (una API responde en
segundos, un sitio con 20 paginas y lectura con IA tarda minutos). Por eso:

1. **Historial por fuente.** Para cada fuente se toman sus 3 ultimas corridas
   terminadas en *este mismo servidor* (la base de Render solo tiene corridas de
   Render) y se usa la MEDIA (el total es una suma de duraciones asimetricas:
   sumar medianas lo subestima). Rango: cuartil 25 a percentil 90. Una fuente
   sin historial usa lo observado en esta corrida o el historial general.
2. **Velocidad de hoy.** La mediana de las razones real/esperado de las fuentes
   ya terminadas ajusta lo que falta; pesa n / (n + 10), conservador para que
   unas pocas fuentes atipicas no lo desvien.
3. **Simulacion de la cola.** Con los carriles en paralelo, lo que le falta a
   cada fuente en curso y el orden real de la cola (incluidos los reintentos
   programados a futuro), se reparte el trabajo como lo hara el worker. El fin
   estimado es cuando el ultimo carril queda libre.

Validado contra 4 corridas reales (06-11-2026): con historial, error mediano
del 11 % y el fin real dentro del rango el 100 % del tiempo; con historial
escaso o URLs recien cambiadas, error mediano de 25 a 33 %.

Cada fuente se acota al tiempo maximo por fuente (`ingest.job_timeout_minutes`).
"""
from __future__ import annotations

import heapq
import statistics
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from .models import IngestJob

HISTORY_DAYS = 120
# Solo las corridas mas recientes: el sitio, la URL y la IA cambian con el tiempo, y
# corridas viejas casi instantaneas (fuente omitida o caida) no representan una corrida real.
HISTORY_PER_SOURCE = 3
DEFAULT_SECONDS = 90.0
FINAL = ("ok", "parcial", "error")


def _utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def _quantiles(values: list[float]) -> tuple[float, float, float]:
    """(bajo, central, alto) de la duracion de una fuente.

    El central es la MEDIA, no la mediana: las duraciones son asimetricas (de vez
    en cuando una fuente tarda mucho mas) y el tiempo total es una SUMA; sumar
    medianas subestima sistematicamente el total. Bajo = cuartil 25; alto =
    percentil 90 (con pocas muestras, el maximo con margen).
    """
    values = sorted(values)
    # Atipicos (una corrida colgada o una caida) no representan a la fuente.
    med = statistics.median(values)
    if len(values) >= 5:
        values = [v for v in values if v <= 3 * med] or values
    mean = statistics.fmean(values)
    if len(values) < 3:
        return mean * 0.6, mean, max(values) * 1.8
    low = statistics.quantiles(values, n=4, method="inclusive")[0]
    high = statistics.quantiles(values, n=10, method="inclusive")[-1] if len(values) >= 5 else max(values) * 1.3
    return min(low, mean), mean, max(high, mean)


def history(db: Session, source_ids: list[int], before: datetime) -> dict[int, list[float]]:
    """Duraciones (s) de las ultimas corridas terminadas de cada fuente antes de `before`."""
    if not source_ids:
        return {}
    since = before - timedelta(days=HISTORY_DAYS)
    rows = (
        db.query(IngestJob.source_id, IngestJob.started_at, IngestJob.finished_at)
        .filter(
            IngestJob.source_id.in_(source_ids),
            IngestJob.status.in_(FINAL),
            IngestJob.started_at.isnot(None),
            IngestJob.finished_at.isnot(None),
            IngestJob.finished_at >= since,
        )
        .order_by(IngestJob.id.desc())
        .limit(5000)
        .all()
    )
    out: dict[int, list[float]] = {}
    for source_id, started, finished in rows:
        started, finished = _utc(started), _utc(finished)
        if finished >= before:
            continue
        seconds = (finished - started).total_seconds()
        if 0 < seconds < 3 * 3600 and len(out.setdefault(source_id, [])) < HISTORY_PER_SOURCE:
            out[source_id].append(seconds)
    return out


def estimate(db: Session, jobs: list[IngestJob], *, lanes: int, timeout_s: float, now: datetime | None = None) -> dict | None:
    """Tiempo restante de la corrida activa. None si no hay nada pendiente ni en curso."""
    now = now or datetime.now(timezone.utc)
    active = [j for j in jobs if j.status in ("pendiente", "ejecutando")]
    if not active:
        return None
    run_start = min(_utc(j.created_at) or now for j in active)
    done = [
        j for j in jobs
        if j.status in FINAL and j.started_at and j.finished_at and _utc(j.finished_at) >= run_start
    ]
    hist = history(db, [j.source_id for j in jobs if j.source_id], run_start)
    pooled = [s for values in hist.values() for s in values]

    run_durations = [(_utc(j.finished_at) - _utc(j.started_at)).total_seconds() for j in done]
    if len(run_durations) >= 3:
        fallback = _quantiles(run_durations)
    elif pooled:
        fallback = _quantiles(pooled)
    else:
        fallback = (DEFAULT_SECONDS * 0.6, DEFAULT_SECONDS, DEFAULT_SECONDS * 1.6)

    def expected(source_id: int | None) -> tuple[tuple[float, float, float], bool]:
        values = hist.get(source_id or -1)
        return (_quantiles(values), True) if values else (fallback, False)

    # Velocidad de hoy frente al historial: mediana de las razones real/esperado
    # (robusta: una fuente que hoy cambio de URL o fallo rapido no la arrastra).
    ratios = []
    for j in done:
        (_, mid, _), known = expected(j.source_id)
        if known and mid > 0:
            ratios.append((_utc(j.finished_at) - _utc(j.started_at)).total_seconds() / mid)
    samples = len(ratios)
    measured = max(0.25, min(6.0, statistics.median(ratios))) if ratios else 1.0
    weight = samples / (samples + 10)
    factor = (1 - weight) + weight * measured

    running = [j for j in active if j.status == "ejecutando"]
    pending = sorted(
        (j for j in active if j.status == "pendiente"),
        key=lambda j: (_utc(j.scheduled_for) or now, j.id),
    )
    lanes = max(1, lanes, len(running))
    cap = max(60.0, float(timeout_s or 0) or 3600.0)

    def simulate(index: int) -> float:
        free: list[float] = []
        for j in running:
            quant = [min(cap, q * factor) for q in expected(j.source_id)[0]]
            elapsed = (now - (_utc(j.started_at) or now)).total_seconds()
            if elapsed < quant[index]:
                left = quant[index] - elapsed
            else:
                # Ya supero lo esperado: lo que falta hasta el siguiente cuartil y, pasado
                # el ultimo, una fraccion de lo que lleva. Asi el tiempo restante sube con
                # la demora en vez de quedarse fijo. Nunca mas alla del tope por fuente.
                later = [q for q in quant if q > elapsed]
                left = (later[0] - elapsed) if later else max(15.0, 0.3 * elapsed)
            free.append(max(5.0, min(left, cap - elapsed if cap > elapsed else 5.0)))
        free += [0.0] * (lanes - len(free))
        heapq.heapify(free)
        for j in pending:
            start = heapq.heappop(free)
            due = ((_utc(j.scheduled_for) or now) - now).total_seconds()
            start = max(start, due)
            heapq.heappush(free, start + min(cap, expected(j.source_id)[0][index] * factor))
        return max(free) if free else 0.0

    low, mid, high = simulate(0), simulate(1), simulate(2)
    with_history = sum(1 for j in active if hist.get(j.source_id or -1))
    elapsed_run = (now - run_start).total_seconds()
    per_source = statistics.median(run_durations) if run_durations else None
    return {
        "eta_seconds": int(round(mid)),
        "eta_low_seconds": int(round(min(low, mid))),
        "eta_high_seconds": int(round(max(high, mid))),
        "eta_at": (now + timedelta(seconds=mid)).isoformat(),
        "run_started_at": run_start.isoformat(),
        "elapsed_seconds": int(elapsed_run),
        "done_in_run": len(done),
        "remaining": len(active),
        "lanes": lanes,
        "speed_factor": round(factor, 2),
        "speed_samples": samples,
        "with_history": with_history,
        "median_seconds_this_run": int(per_source) if per_source else None,
        "timeout_seconds": int(cap),
        "basis": _basis(with_history, len(active), samples, factor),
    }


def _basis(with_history: int, remaining: int, samples: int, factor: float) -> str:
    parts = [f"{with_history} de {remaining} fuente(s) por procesar tienen historial propio en este servidor"]
    if samples:
        pace = "más lento" if factor > 1.05 else "más rápido" if factor < 0.95 else "a su ritmo habitual"
        parts.append(f"según {samples} fuente(s) ya terminadas, hoy va {pace} (×{factor:.2f})")
    else:
        parts.append("la velocidad se ajusta en cuanto terminen las primeras fuentes")
    return "; ".join(parts) + "."


def expected_seconds(db: Session, source_ids: list[int]) -> dict[int, int]:
    """Duracion tipica (media de las ultimas corridas) de cada fuente, para mostrarla junto a la fuente."""
    hist = history(db, source_ids, datetime.now(timezone.utc))
    return {sid: int(_quantiles(v)[1]) for sid, v in hist.items() if v}
