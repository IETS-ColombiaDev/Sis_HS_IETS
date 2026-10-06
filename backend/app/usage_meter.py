"""Contador de tokens de IA usado por el panel de administracion."""
from __future__ import annotations

import threading
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from . import settings_store

USAGE_PROMPT = "cfg.ai.usage_prompt"
USAGE_COMPLETION = "cfg.ai.usage_completion"
USAGE_TOTAL = "cfg.ai.usage_total"
USAGE_CALLS = "cfg.ai.usage_calls"
USAGE_LAST_AT = "cfg.ai.usage_last_at"
USAGE_LAST_MODEL = "cfg.ai.usage_last_model"

_lock = threading.Lock()
_state = {
    "prompt_tokens": 0,
    "completion_tokens": 0,
    "total_tokens": 0,
    "calls": 0,
    "last_at": "",
    "last_model": "",
}


def snapshot() -> dict:
    with _lock:
        return dict(_state)


def reset(db: Session | None = None) -> dict:
    with _lock:
        _state.update(
            prompt_tokens=0,
            completion_tokens=0,
            total_tokens=0,
            calls=0,
            last_at="",
            last_model="",
        )
        copy = dict(_state)
    if db is not None:
        _write(db, copy)
    return copy


def record(prompt_tokens: int = 0, completion_tokens: int = 0, total_tokens: int = 0, model: str = "") -> dict:
    prompt_tokens = max(0, int(prompt_tokens or 0))
    completion_tokens = max(0, int(completion_tokens or 0))
    total_tokens = max(0, int(total_tokens or 0)) or (prompt_tokens + completion_tokens)
    now = datetime.now(timezone.utc).isoformat()
    with _lock:
        _state["prompt_tokens"] += prompt_tokens
        _state["completion_tokens"] += completion_tokens
        _state["total_tokens"] += total_tokens
        _state["calls"] += 1
        _state["last_at"] = now
        if model:
            _state["last_model"] = model
        copy = dict(_state)
    try:
        from .database import SessionLocal

        db = SessionLocal()
        try:
            _write(db, copy)
        finally:
            db.close()
    except Exception:  # noqa: BLE001
        pass
    return copy


def load_from_db(db: Session) -> dict:
    def _int(key: str) -> int:
        raw = settings_store.get_value(db, key, "0")
        try:
            return max(0, int(float(raw or 0)))
        except ValueError:
            return 0

    loaded = {
        "prompt_tokens": _int(USAGE_PROMPT),
        "completion_tokens": _int(USAGE_COMPLETION),
        "total_tokens": _int(USAGE_TOTAL),
        "calls": _int(USAGE_CALLS),
        "last_at": settings_store.get_value(db, USAGE_LAST_AT, ""),
        "last_model": settings_store.get_value(db, USAGE_LAST_MODEL, ""),
    }
    with _lock:
        _state.update(loaded)
        return dict(_state)


def _write(db: Session, state: dict) -> None:
    settings_store.set_values(
        db,
        {
            USAGE_PROMPT: str(state["prompt_tokens"]),
            USAGE_COMPLETION: str(state["completion_tokens"]),
            USAGE_TOTAL: str(state["total_tokens"]),
            USAGE_CALLS: str(state["calls"]),
            USAGE_LAST_AT: state.get("last_at") or "",
            USAGE_LAST_MODEL: state.get("last_model") or "",
        },
    )
