"""Inteligencia del sistema: base de conocimiento de senales, calibracion, analitica y vigencia por anos."""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import ai_service, analytics_insights, intelligence, signal_window
from ..audit import record_action
from ..database import get_db
from ..deps import get_current_user, require_permission
from ..models import User
from ..rbac import P_CONFIG_MANAGE

router = APIRouter(prefix="/api/intelligence", tags=["intelligence"])


def _status(db: Session) -> dict:
    cfg = intelligence.load_config(db)
    return {
        "config": cfg,
        "defaults": intelligence.DEFAULTS,
        "limits": {k: {"min": lo, "max": hi} for k, (lo, hi) in intelligence.LIMITS.items()},
        "ai_modes": list(intelligence.AI_MODES),
        "prompts": intelligence.prompts(cfg),
        "default_prompts": intelligence.default_prompts(),
        "ai_enabled": intelligence.ai_available(),
        "ai_model": ai_service.current_model() if intelligence.ai_available() else "",
        "knowledge": intelligence.stats(db),
        "calibration": intelligence.load_calibration(db),
        "acceptance": intelligence.acceptance(db),
        "model_card": intelligence.model_card(db),
        "trace": intelligence.suggestion_trace(db),
    }


@router.get("/status")
def status(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Parametros, estado de la base de conocimiento y ultima calibracion. Lo ve cualquier perfil."""
    intelligence.safe_sync(db)
    return _status(db)


@router.put("/config")
def update_config(payload: dict, db: Session = Depends(get_db), user: User = Depends(require_permission(P_CONFIG_MANAGE))):
    unknown = sorted(set(payload) - set(intelligence.DEFAULTS))
    if unknown:
        raise HTTPException(status_code=422, detail=f"Parámetros desconocidos: {', '.join(unknown)}.")
    before = intelligence.load_config(db)
    after = intelligence.save_config(db, payload)
    changed = {k: after[k] for k in after if after[k] != before[k]}
    if changed:
        record_action(db, entity_type="intelligence", entity_id="config", action="intelligence:config",
                      old_value={k: before[k] for k in changed}, new_value=changed)
        db.commit()
    return _status(db)


@router.post("/config/reset")
def reset_config(db: Session = Depends(get_db), user: User = Depends(require_permission(P_CONFIG_MANAGE))):
    before = intelligence.load_config(db)
    intelligence.reset_config(db)
    record_action(db, entity_type="intelligence", entity_id="config", action="intelligence:config_reset", old_value=before)
    db.commit()
    return _status(db)


@router.post("/reindex")
def reindex(db: Session = Depends(get_db), user: User = Depends(require_permission(P_CONFIG_MANAGE))):
    """Reconstruye la base de conocimiento desde las tecnologias capturadas."""
    out = intelligence.sync(db, full=True)
    record_action(db, entity_type="intelligence", entity_id="knowledge", action="intelligence:reindex", new_value=out)
    db.commit()
    return {"result": out, **_status(db)}


class BaselineIn(BaseModel):
    until: str | None = Field(None, description="Fecha ISO; vacio = ahora")


@router.post("/baseline")
def set_baseline(payload: BaselineIn, db: Session = Depends(get_db), user: User = Depends(require_permission(P_CONFIG_MANAGE))):
    """Fija hasta cuando una senal cuenta como «primera busqueda historica»."""
    from datetime import datetime

    when = None
    if payload.until:
        try:
            when = datetime.fromisoformat(payload.until)
        except ValueError:
            raise HTTPException(status_code=422, detail="La fecha no es válida (use AAAA-MM-DD).") from None
    intelligence.sync(db)
    stamp = intelligence.set_baseline(db, when)
    record_action(db, entity_type="intelligence", entity_id="knowledge", action="intelligence:baseline",
                  new_value={"until": stamp.isoformat()})
    db.commit()
    return _status(db)


@router.post("/calibrate")
def calibrate(
    apply: bool = Query(True, description="Aplicar a la configuracion los parametros que resulten"),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_CONFIG_MANAGE)),
):
    result = intelligence.calibrate(db, apply=apply, actor=user.email)
    return {"result": result, **_status(db)}


@router.get("/knowledge")
def knowledge(
    q: str = Query("", max_length=400),
    decision: str = Query("", pattern="^(|pendiente|clasificada|descartada)$"),
    origin: str = Query("", pattern="^(|historica|vigilancia|postulacion)$"),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Senales parecidas a un texto (recuperacion sobre la base de conocimiento)."""
    intelligence.safe_sync(db)
    items = intelligence.similar(db, q, limit=limit, decision=decision or None, origin=origin or None) if q.strip() else []
    return {"stats": intelligence.stats(db), "items": items}


@router.get("/knowledge/export")
def export_knowledge(db: Session = Depends(get_db), user: User = Depends(require_permission(P_CONFIG_MANAGE))):
    intelligence.safe_sync(db)
    body = json.dumps(intelligence.export(db), ensure_ascii=False, indent=1)
    return Response(
        content=body, media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="base_conocimiento_senales.json"'},
    )


@router.get("/insights")
def insights(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Marco analitico (descriptivo, diagnostico, predictivo y prescriptivo) y la lectura guardada."""
    return analytics_insights.insights(db)


@router.post("/insights/narrative")
def insights_narrative(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Redacta de nuevo la lectura con IA usando las cifras actuales."""
    return analytics_insights.insights(db, generate=True)


# --------------------------------------------------------------------------- #
#  Vigencia de las senales por ano
# --------------------------------------------------------------------------- #
class WindowIn(BaseModel):
    scope: str = Field("all", pattern="^(all|sources)$")
    source_ids: list[int] = []
    year_from: int | None = None
    year_to: int | None = None
    keep_undated: bool | None = None


class WindowScopeIn(BaseModel):
    source_ids: list[int] = []


@router.get("/window")
def window(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return signal_window.overview(db)


@router.put("/window")
def update_window(payload: WindowIn, db: Session = Depends(get_db), user: User = Depends(require_permission(P_CONFIG_MANAGE))):
    before = signal_window.load(db)
    try:
        if payload.scope == "sources":
            if not payload.source_ids:
                raise HTTPException(status_code=422, detail="Seleccione al menos una fuente.")
            signal_window.set_sources(db, payload.source_ids, year_from=payload.year_from, year_to=payload.year_to)
        else:
            signal_window.set_global(db, year_from=payload.year_from, year_to=payload.year_to, keep_undated=payload.keep_undated)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    record_action(
        db, entity_type="signals", entity_id="window", action="signals:window",
        old_value={"year_from": before["year_from"], "year_to": before["year_to"], "fuentes_propias": len(before["sources"])},
        new_value={"alcance": "fuentes" if payload.scope == "sources" else "general", "fuentes": payload.source_ids,
                   "year_from": payload.year_from, "year_to": payload.year_to, "keep_undated": payload.keep_undated},
    )
    db.commit()
    return signal_window.overview(db)


@router.post("/window/preview")
def window_preview(payload: WindowScopeIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return signal_window.preview(db, payload.source_ids or None)


@router.post("/window/apply")
def window_apply(payload: WindowScopeIn, db: Session = Depends(get_db), user: User = Depends(require_permission(P_CONFIG_MANAGE))):
    """Pasa a Descartadas las senales de la bandeja fuera de la vigencia (reversible)."""
    return signal_window.apply(db, actor=user.email, source_ids=payload.source_ids or None)
