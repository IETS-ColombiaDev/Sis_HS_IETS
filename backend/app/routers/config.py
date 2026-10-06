"""Panel de configuracion del sistema (solo administradores).

Gestiona MiniMax (IA principal), Gemini (respaldo), OCR de sitios y
llaves de fuentes de nivel A.
"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import __version__, ai_service, gemini_service, minimax_service, prompt_store, scan_trace, scheduler_service, settings_store, usage_meter
from ..config import settings
from ..database import get_db
from ..deps import get_current_user, require_permission
from ..models import Finding, Source, User
from ..rbac import P_CONFIG_MANAGE, has_permission, role_label
from ..schemas import ConfigOut, ConfigUpdate, GeminiTestIn, GeminiTestOut, ScanPromptOut, ScanPromptUpdate, ScanTraceOut

# Valores del .env al importar el modulo (antes de que el arranque los pise con
# los de la BD). Permiten que "eliminar la llave guardada" vuelva al .env en vez
# de dejar viva en memoria la llave borrada hasta el proximo reinicio.
_ENV_INGEST_KEYS = {
    "openfda_api_key": settings.openfda_api_key,
    "ncbi_api_key": settings.ncbi_api_key,
    "ncbi_email": settings.ncbi_email,
}


def _apply_ingest_keys(db: Session) -> None:
    keys = settings_store.load_ingest_keys(db)
    for name, env_value in _ENV_INGEST_KEYS.items():
        setattr(settings, name, keys[name] or env_value)

router = APIRouter(prefix="/api/config", tags=["config"])


def _mask(key: str) -> str:
    if not key:
        return ""
    if len(key) <= 8:
        return "****"
    return f"{key[:4]}{'*' * 8}{key[-4:]}"


def _apply_ai_runtime(db: Session) -> None:
    cfg = settings_store.load_ai_config(db)
    ai_service.configure_runtime(
        provider=str(cfg["provider"]),
        ocr_enabled=bool(cfg["ocr_enabled"]),
        web_enabled=bool(cfg["web_enabled"]),
        minimax_api_key=str(cfg["minimax_api_key"]),
        minimax_model=str(cfg["minimax_model"]),
        gemini_api_key=str(cfg["gemini_api_key"]),
        gemini_model=str(cfg["gemini_model"]),
    )
    prompt_store.load_from_db(db)
    usage_meter.load_from_db(db)
    scan_trace.load_from_db(db)


def _build_config_out(db: Session) -> ConfigOut:
    cfg = settings_store.load_ai_config(db)
    ingest = settings_store.load_ingest_keys(db)
    openfda = ingest["openfda_api_key"] or settings.openfda_api_key
    ncbi = ingest["ncbi_api_key"] or settings.ncbi_api_key
    email = ingest["ncbi_email"] or settings.ncbi_email
    enabled = ai_service.is_enabled()
    gemini_on = gemini_service.is_enabled()
    minimax_on = minimax_service.is_enabled()
    prompts = prompt_store.current()
    usage = usage_meter.snapshot()
    plan = minimax_service.coding_plan_cached()
    return ConfigOut(
        gemini_enabled=enabled,
        gemini_has_key=gemini_service.has_key(),
        gemini_key_masked=_mask(gemini_service.get_api_key()),
        gemini_model=str(cfg["gemini_model"]),
        gemini_active_model=gemini_service.current_model() if gemini_on else "",
        available_models=gemini_service.list_available_models() if gemini_on else [],
        google_login_enabled=bool(settings.google_client_id),
        dev_login_enabled=settings.dev_login_enabled,
        allowed_domain=settings.allowed_email_domain,
        total_sources=db.query(Source).count(),
        total_findings=db.query(Finding).count(),
        version=__version__,
        openfda_has_key=bool(openfda),
        ncbi_has_key=bool(ncbi),
        ncbi_email=email,
        ai_enabled=enabled,
        ai_provider=str(cfg["provider"] or "auto"),
        ai_active_provider=ai_service.active_provider(),
        ai_model=ai_service.current_model() if enabled else "",
        ai_ocr_enabled=bool(cfg["ocr_enabled"]),
        ai_web_enabled=bool(cfg["web_enabled"]),
        minimax_has_key=minimax_service.has_key(),
        minimax_key_masked=_mask(minimax_service.get_api_key()),
        minimax_model=str(cfg["minimax_model"]),
        minimax_active_model=minimax_service.current_model() if minimax_on else "",
        minimax_available_models=minimax_service.list_available_models() if minimax_on else minimax_service.list_catalog_models(),
        minimax_vision_model=minimax_service.vision_model() if minimax_on else "MiniMax-M3",
        scan_max_tokens=int(prompts["max_tokens"]),
        scan_max_pages=int(prompts["max_pages"]),
        scan_fetch_timeout=int(prompts.get("fetch_timeout") or 25),
        scan_child_timeout=int(prompts.get("child_timeout") or 15),
        scan_ai_timeout=int(prompts.get("ai_timeout") or 60),
        scan_retries=int(prompts.get("retries") or 3),
        scan_pause_ms=int(prompts.get("pause_ms") or 350),
        ai_usage_prompt_tokens=int(usage.get("prompt_tokens") or 0),
        ai_usage_completion_tokens=int(usage.get("completion_tokens") or 0),
        ai_usage_total_tokens=int(usage.get("total_tokens") or 0),
        ai_usage_calls=int(usage.get("calls") or 0),
        ai_usage_last_at=str(usage.get("last_at") or ""),
        ai_usage_last_model=str(usage.get("last_model") or ""),
        minimax_plan_summary=str(plan.get("summary") or ""),
    )


@router.get("", response_model=ConfigOut)
def get_config(db: Session = Depends(get_db), user: User = Depends(require_permission(P_CONFIG_MANAGE))):
    return _build_config_out(db)


@router.put("", response_model=ConfigOut)
def update_config(
    payload: ConfigUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_CONFIG_MANAGE)),
):
    if payload.gemini_api_key is not None:
        settings_store.set_value(db, settings_store.GEMINI_API_KEY, payload.gemini_api_key.strip())
    if payload.gemini_model is not None:
        settings_store.set_value(db, settings_store.GEMINI_MODEL, payload.gemini_model.strip())
    if payload.minimax_api_key is not None:
        settings_store.set_value(db, settings_store.MINIMAX_API_KEY, payload.minimax_api_key.strip())
    if payload.minimax_model is not None:
        settings_store.set_value(db, settings_store.MINIMAX_MODEL, payload.minimax_model.strip())
    if payload.ai_provider is not None:
        settings_store.set_value(db, settings_store.AI_PROVIDER, (payload.ai_provider or "auto").strip().lower())
    if payload.ai_ocr_enabled is not None:
        settings_store.set_value(db, settings_store.AI_OCR_ENABLED, "true" if payload.ai_ocr_enabled else "false")
    if payload.ai_web_enabled is not None:
        settings_store.set_value(db, settings_store.AI_WEB_ENABLED, "true" if payload.ai_web_enabled else "false")
    if payload.openfda_api_key is not None:
        settings_store.set_value(db, settings_store.OPENFDA_API_KEY, payload.openfda_api_key.strip())
    if payload.ncbi_api_key is not None:
        settings_store.set_value(db, settings_store.NCBI_API_KEY, payload.ncbi_api_key.strip())
    if payload.ncbi_email is not None:
        settings_store.set_value(db, settings_store.NCBI_EMAIL, payload.ncbi_email.strip())
    if payload.scan_max_tokens is not None or payload.scan_max_pages is not None or payload.scan_fetch_timeout is not None or payload.scan_child_timeout is not None or payload.scan_ai_timeout is not None or payload.scan_retries is not None or payload.scan_pause_ms is not None:
        prompt_store.save_to_db(
            db,
            max_tokens=payload.scan_max_tokens,
            max_pages=payload.scan_max_pages,
            fetch_timeout=payload.scan_fetch_timeout,
            child_timeout=payload.scan_child_timeout,
            ai_timeout=payload.scan_ai_timeout,
            retries=payload.scan_retries,
            pause_ms=payload.scan_pause_ms,
        )

    _apply_ai_runtime(db)
    _apply_ingest_keys(db)
    return _build_config_out(db)


@router.post("/test", response_model=GeminiTestOut)
def test_ai(
    payload: GeminiTestIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_CONFIG_MANAGE)),
):
    who = (payload.provider or ai_service.active_provider() or "minimax").lower()
    key = payload.minimax_api_key if who == "minimax" else payload.gemini_api_key
    if who != "minimax" and payload.gemini_api_key:
        key = payload.gemini_api_key
    if who == "minimax" and not key and payload.minimax_api_key:
        key = payload.minimax_api_key
    result = ai_service.test_connection(provider_name=who, api_key=key)
    return GeminiTestOut(
        ok=result.get("ok", False),
        message=result.get("message", ""),
        model=result.get("model", ""),
        available_models=result.get("available_models", []),
        provider=result.get("provider", who),
    )


@router.post("/detect-models", response_model=GeminiTestOut)
def detect_models(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_CONFIG_MANAGE)),
):
    result = ai_service.detect_best_models()
    return GeminiTestOut(
        ok=result.get("ok", False),
        message=(
            f"Mejor modelo disponible: {result.get('model')}"
            if result.get("model")
            else "No se pudo detectar un modelo MiniMax."
        ),
        model=result.get("model", ""),
        available_models=result.get("available_models", []),
        provider="minimax",
    )


def _prompt_out() -> ScanPromptOut:
    data = prompt_store.current()
    return ScanPromptOut(
        system=str(data["system"]),
        user=str(data["user"]),
        max_tokens=int(data["max_tokens"]),
        max_pages=int(data["max_pages"]),
        max_chars=int(data["max_chars"]),
        placeholders=["source_title", "source_url", "pages_visited", "source_context", "content", "ocr_note", "max_items"],
        defaults=prompt_store.defaults(),
    )


@router.get("/prompts", response_model=ScanPromptOut)
def get_prompts(db: Session = Depends(get_db), user: User = Depends(require_permission(P_CONFIG_MANAGE))):
    prompt_store.load_from_db(db)
    return _prompt_out()


@router.put("/prompts", response_model=ScanPromptOut)
def update_prompts(
    payload: ScanPromptUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_CONFIG_MANAGE)),
):
    prompt_store.save_to_db(
        db,
        system=payload.system,
        user=payload.user,
        max_tokens=payload.max_tokens,
        max_pages=payload.max_pages,
        max_chars=payload.max_chars,
    )
    return _prompt_out()


@router.post("/prompts/reset", response_model=ScanPromptOut)
def reset_prompts(db: Session = Depends(get_db), user: User = Depends(require_permission(P_CONFIG_MANAGE))):
    prompt_store.reset_to_defaults(db)
    return _prompt_out()


def _search_out(cfg: dict, db: Session) -> dict:
    from .. import source_profile, web_search

    out = dict(cfg)
    out["brave_api_key_masked"] = _mask(source_profile.brave_api_key(db))
    out["cooldown"] = web_search.cooldown_status()
    out["engine_labels"] = source_profile.ENGINE_LABELS
    out["limits"] = {k: list(v) for k, v in source_profile.SEARCH_LIMITS.items()}
    return out


@router.get("/source-options")
def get_source_options(db: Session = Depends(get_db), user: User = Depends(require_permission(P_CONFIG_MANAGE))):
    from .. import source_profile

    return source_profile.load_options(db)


@router.put("/source-options")
def update_source_options(
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_CONFIG_MANAGE)),
):
    from .. import source_profile

    try:
        return source_profile.save_options(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/source-options/reset")
def reset_source_options(db: Session = Depends(get_db), user: User = Depends(require_permission(P_CONFIG_MANAGE))):
    from .. import source_profile

    return source_profile.reset_options(db)


@router.get("/web-search")
def get_web_search(db: Session = Depends(get_db), user: User = Depends(require_permission(P_CONFIG_MANAGE))):
    from .. import source_profile

    return _search_out(source_profile.load_search(db), db)


@router.put("/web-search")
def update_web_search(
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_CONFIG_MANAGE)),
):
    from .. import source_profile

    try:
        cfg = source_profile.save_search(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return _search_out(cfg, db)


@router.post("/web-search/reset")
def reset_web_search(db: Session = Depends(get_db), user: User = Depends(require_permission(P_CONFIG_MANAGE))):
    from .. import source_profile, web_search

    web_search.reset_cooldowns()
    return _search_out(source_profile.reset_search(db), db)


@router.post("/web-search/cooldowns/clear")
def clear_search_cooldowns(db: Session = Depends(get_db), user: User = Depends(require_permission(P_CONFIG_MANAGE))):
    from .. import source_profile, web_search

    web_search.reset_cooldowns()
    return _search_out(source_profile.load_search(db), db)


@router.post("/web-search/test")
def test_web_search(
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_CONFIG_MANAGE)),
):
    """Ejecuta una consulta libre con la cascada de motores (diagnostico)."""
    from .. import source_profile, web_search

    query = str(payload.get("query") or "").strip()[:300]
    if not query:
        raise HTTPException(status_code=422, detail="Escriba una consulta.")
    cfg = source_profile.load_search(db)
    return web_search.search(query, cfg=cfg, brave_key=source_profile.brave_api_key(db))


@router.post("/usage/reset", response_model=ConfigOut)
def reset_usage(db: Session = Depends(get_db), user: User = Depends(require_permission(P_CONFIG_MANAGE))):
    usage_meter.reset(db)
    return _build_config_out(db)


@router.get("/scan-traces", response_model=list[ScanTraceOut])
def list_scan_traces(db: Session = Depends(get_db), user: User = Depends(require_permission(P_CONFIG_MANAGE))):
    scan_trace.load_from_db(db)
    return [ScanTraceOut(**row) for row in scan_trace.list_traces()]


@router.post("/scan-traces/clear")
def clear_scan_traces(db: Session = Depends(get_db), user: User = Depends(require_permission(P_CONFIG_MANAGE))):
    scan_trace.clear(db)
    return {"ok": True, "cleared": True}


@router.get("/usage", response_model=ConfigOut)
def refresh_usage(db: Session = Depends(get_db), user: User = Depends(require_permission(P_CONFIG_MANAGE))):
    """Relee el saldo MiniMax (red) y el contador local de tokens."""
    if minimax_service.has_key():
        minimax_service.coding_plan_remains(cache_seconds=0)
    return _build_config_out(db)


# --------------------------------------------------------------------------- #
#  Tareas programadas del worker (P0-4 vigilancia y P1-4 duplicados)
# --------------------------------------------------------------------------- #
class ScheduleRunOut(BaseModel):
    id: int
    task: str
    label: str = ""
    status: str
    origin: str = ""
    triggered_by: str = ""
    started_at: datetime
    finished_at: datetime | None = None
    items_found: int = 0
    items_new: int = 0
    message: str = ""
    jobs_total: int = 0
    jobs_pending: int = 0
    cycle_code: str = ""


class ScheduleTaskOut(BaseModel):
    task: str
    label: str
    enabled: bool
    interval_hours: int
    next_run_at: datetime | None = None
    last_run: ScheduleRunOut | None = None


class ScheduleOut(BaseModel):
    scan_enabled: bool
    scan_interval_hours: int
    dedup_enabled: bool
    dedup_interval_hours: int
    worker_enabled: bool
    worker_running: bool
    worker_interval_seconds: int
    tasks: list[ScheduleTaskOut]


class ScheduleUpdate(BaseModel):
    scan_enabled: bool | None = None
    scan_interval_hours: int | None = None
    dedup_enabled: bool | None = None
    dedup_interval_hours: int | None = None


def _schedule_out(db: Session) -> ScheduleOut:
    from ..worker import is_running

    data = scheduler_service.schedule_overview(db)
    return ScheduleOut(
        **data,
        worker_enabled=bool(settings.ingest_worker_enabled),
        worker_running=is_running(),
        worker_interval_seconds=max(5, int(settings.ingest_worker_interval_seconds or 20)),
    )


@router.get("/schedule", response_model=ScheduleOut)
def get_schedule(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Estado de las tareas programadas. Lectura para todo perfil autenticado."""
    return _schedule_out(db)


@router.put("/schedule", response_model=ScheduleOut)
def update_schedule(
    payload: ScheduleUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_CONFIG_MANAGE)),
):
    before = settings_store.load_schedule(db)
    try:
        after = settings_store.save_schedule(db, **payload.model_dump(exclude_unset=True))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    from ..audit import record_action

    record_action(
        db,
        entity_type="scheduled_runs",
        entity_id="config",
        action="schedule:config",
        old_value=before,
        new_value=after,
    )
    db.commit()
    return _schedule_out(db)


@router.get("/schedule/runs", response_model=list[ScheduleRunOut])
def list_schedule_runs(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    task: str | None = Query(None),
    limit: int = Query(30, ge=1, le=200),
):
    """Registro de ejecucion de las tareas programadas, la mas reciente primero."""
    return scheduler_service.list_runs(db, task=task, limit=limit)


@router.post("/schedule/{task}/run", response_model=ScheduleRunOut)
def run_schedule_task(
    task: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Ejecuta ya la tarea, fuera de su horario. Queda registrada como manual."""
    meta = scheduler_service.TASKS.get(task)
    if meta is None:
        raise HTTPException(status_code=404, detail="Tarea programada desconocida.")
    if not has_permission(user, meta["permission"]):
        raise HTTPException(
            status_code=403,
            detail=(
                f"El perfil '{role_label(user.role)}' no tiene el permiso requerido "
                f"({meta['permission']}) para ejecutar {meta['label'].lower()}."
            ),
        )
    run = scheduler_service.run_task(db, task, origin="manual", triggered_by=user.email)
    if task == scheduler_service.TASK_SCAN and run.status == "en_curso":
        from ..worker import kick

        kick()
    return scheduler_service.run_out(db, run)
