"""Bitacora reciente del rastreador (pasos, tiempos y errores al entrar a sitios)."""
from __future__ import annotations

import json
import threading
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from . import settings_store

TRACES_KEY = "cfg.scan.traces"
MAX_TRACES = 20
MAX_STEPS = 40

_lock = threading.Lock()
_traces: list[dict] = []


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _trim(trace: dict) -> dict:
    steps = []
    for step in (trace.get("steps") or [])[:MAX_STEPS]:
        if not isinstance(step, dict):
            continue
        steps.append(
            {
                "action": str(step.get("action") or "")[:80],
                "url": str(step.get("url") or "")[:300],
                "status": str(step.get("status") or "")[:40],
                "ms": int(step.get("ms") or 0),
                "detail": str(step.get("detail") or "")[:240],
            }
        )
    return {
        "at": str(trace.get("at") or _now())[:80],
        "kind": str(trace.get("kind") or "scan")[:20],
        "source": str(trace.get("source") or "")[:200],
        "url": str(trace.get("url") or "")[:400],
        "ok": bool(trace.get("ok")),
        "status": str(trace.get("status") or "")[:40],
        "elapsed_ms": int(trace.get("elapsed_ms") or 0),
        "pages_visited": int(trace.get("pages_visited") or 0),
        "items_found": int(trace.get("items_found") or 0),
        "items_new": int(trace.get("items_new") or 0),
        "ai": bool(trace.get("ai")),
        "ocr": bool(trace.get("ocr")),
        "web_search": bool(trace.get("web_search")),
        "priority": str(trace.get("priority") or "")[:20],
        "source_level": str(trace.get("source_level") or "")[:20],
        "message": str(trace.get("message") or "")[:400],
        "steps": steps,
    }


def list_traces() -> list[dict]:
    with _lock:
        return [dict(row) for row in _traces]


def record(trace: dict, db: Session | None = None) -> list[dict]:
    row = _trim(trace)
    with _lock:
        _traces.insert(0, row)
        del _traces[MAX_TRACES:]
        copy = [dict(item) for item in _traces]
    if db is not None:
        try:
            settings_store.set_value(db, TRACES_KEY, json.dumps(copy, ensure_ascii=False))
        except Exception:  # noqa: BLE001
            pass
        return copy
    import os

    if os.environ.get("PYTEST_CURRENT_TEST"):
        return copy
    try:
        from .database import SessionLocal

        session = SessionLocal()
        try:
            settings_store.set_value(session, TRACES_KEY, json.dumps(copy, ensure_ascii=False))
        finally:
            session.close()
    except Exception:  # noqa: BLE001
        pass
    return copy


def load_from_db(db: Session) -> list[dict]:
    raw = settings_store.get_value(db, TRACES_KEY, "")
    rows: list[dict] = []
    if raw:
        try:
            data = json.loads(raw)
            if isinstance(data, list):
                rows = [_trim(item) for item in data if isinstance(item, dict)][:MAX_TRACES]
        except json.JSONDecodeError:
            rows = []
    with _lock:
        _traces[:] = rows
        return [dict(item) for item in _traces]


def clear(db: Session | None = None) -> list[dict]:
    with _lock:
        _traces.clear()
    if db is not None:
        settings_store.set_value(db, TRACES_KEY, "[]")
    return []
