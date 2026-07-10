"""Control de version de estado para actualizaciones en tiempo real (polling)."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from .models import AppMeta

VERSION_KEY = "state_version"


def bump_state_version(db: Session) -> int:
    """Incrementa el contador global de version. Los clientes lo consultan
    periodicamente para saber si deben refrescar los datos."""
    meta = db.get(AppMeta, VERSION_KEY)
    if meta is None:
        meta = AppMeta(key=VERSION_KEY, value="1")
        db.add(meta)
        db.commit()
        return 1
    try:
        new_val = int(meta.value) + 1
    except (TypeError, ValueError):
        new_val = 1
    meta.value = str(new_val)
    meta.updated_at = datetime.now(timezone.utc)
    db.commit()
    return new_val


def get_state_version(db: Session) -> dict:
    meta = db.get(AppMeta, VERSION_KEY)
    if meta is None:
        return {"version": 0, "updated_at": None}
    return {
        "version": int(meta.value) if meta.value.isdigit() else 0,
        "updated_at": meta.updated_at,
    }
