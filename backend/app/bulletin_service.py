"""Boletines del ciclo: contenido ampliado, edición, vigencia de las cifras y recorrido.

`strategy_service` compila, aprueba, publica y distribuye; este módulo arma el
contenido adicional del boletín y las consultas de solo lectura. No incluye
montos: el boletín lo abre cualquier perfil.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from . import audit, strategy_service, ttm
from .models import AuditLog, Bulletin, Cycle
from .strategy_service import FUNNEL_LABELS, FUNNEL_STAGES, StrategyRuleError

TITLE_MAX = 300
NOTE_MAX = 3000
TOP_LIMIT = 10
PRIORITIZED_STAGES = ("prioritized", "evaluated", "published")

STATUS_LABELS = {
    "borrador": "Borrador",
    "pendiente_aprobacion": "Pendiente de aprobación",
    "publicado": "Publicado",
}


def extra_body(db: Session, cycle: Cycle, rows: list[dict]) -> dict:
    """Lo que el boletín suma a las cifras del embudo: llegada, priorizadas y ciclo anterior."""
    ranked = sorted(
        (r for r in rows if r.get("stage") in PRIORITIZED_STAGES),
        key=lambda r: (-int(r.get("points") or 0), r.get("months") if r.get("months") is not None else 10**6, r.get("name") or ""),
    )
    top = [
        {
            "name": r.get("name") or "",
            "cluster": r.get("cluster") or "Sin clúster",
            "points": int(r.get("points") or 0),
            "band": r.get("band") or "desconocido",
            "band_label": ttm.TTM_BAND_LABELS.get(r.get("band") or "desconocido", r.get("band") or ""),
            "status_label": r.get("status_label") or "",
        }
        for r in ranked[:TOP_LIMIT]
    ]
    previous = strategy_service.comparison_for(db, cycle, {})
    quality = strategy_service.data_quality(rows, include_restricted=False)
    return {
        "summary": strategy_service.summary_counts(rows),
        "top_prioritized": top,
        "top_prioritized_total": len(ranked),
        "previous": (
            {"cycle_code": previous["cycle_code"], "funnel": previous["funnel"], "total": previous["total"]}
            if previous
            else None
        ),
        "quality_pct": quality["complete_pct"],
        "total": len(rows),
    }


def update(db: Session, bulletin: Bulletin, *, title: str | None, note: str | None, actor: str) -> Bulletin:
    """Título y nota editorial. Cambiar el texto de un boletín aprobado anula la aprobación."""
    from sqlalchemy.orm.attributes import flag_modified

    if bulletin.status == "publicado":
        raise StrategyRuleError("Un boletín publicado no se edita.")
    changed: list[str] = []
    if title is not None:
        clean = title.strip()
        if not clean:
            raise StrategyRuleError("El título del boletín es obligatorio.")
        if len(clean) > TITLE_MAX:
            raise StrategyRuleError(f"El título admite hasta {TITLE_MAX} caracteres.")
        if clean != (bulletin.title or ""):
            bulletin.title = clean
            changed.append("title")
    if note is not None:
        clean = note.strip()
        if len(clean) > NOTE_MAX:
            raise StrategyRuleError(f"La nota editorial admite hasta {NOTE_MAX} caracteres.")
        body = dict(bulletin.body or {})
        if clean != (body.get("note") or ""):
            body["note"] = clean
            body["note_by"] = actor
            bulletin.body = body
            flag_modified(bulletin, "body")
            changed.append("note")
    if not changed:
        return bulletin
    voided = bool((bulletin.approved_by or "").strip())
    if voided:
        bulletin.approved_by = ""
        bulletin.status = "pendiente_aprobacion"
    audit.record_action(
        db,
        entity_type="bulletins",
        entity_id=bulletin.id,
        action="bulletin:edit",
        new_value={"fields": changed, "approval_voided": voided},
    )
    return bulletin


def unapprove(db: Session, bulletin: Bulletin, *, actor: str, reason: str) -> Bulletin:
    if bulletin.status == "publicado":
        raise StrategyRuleError("Un boletín publicado no se devuelve: la publicación es definitiva.")
    if not (bulletin.approved_by or "").strip():
        raise StrategyRuleError("El boletín no está aprobado.")
    reason = (reason or "").strip()
    if not reason:
        raise StrategyRuleError("Escriba el motivo para anular la aprobación.")
    previous = bulletin.approved_by
    bulletin.approved_by = ""
    bulletin.status = "pendiente_aprobacion"
    audit.record_action(
        db,
        entity_type="bulletins",
        entity_id=bulletin.id,
        action="bulletin:unapprove",
        old_value={"approved_by": previous},
        new_value={"reason": reason[:500]},
    )
    return bulletin


def freshness(db: Session, bulletin: Bulletin) -> dict:
    """Si las cifras del ciclo cambiaron desde que se compiló el boletín."""
    cycle = db.get(Cycle, bulletin.cycle_id)
    if bulletin.status == "publicado" or cycle is None:
        return {"stale": False, "changes": []}
    current = strategy_service.build_payload(db, cycle)["funnel"]
    compiled = (bulletin.body or {}).get("funnel") or {}
    changes = [
        {
            "key": stage,
            "label": FUNNEL_LABELS.get(stage, stage),
            "compiled": int(compiled.get(stage) or 0),
            "current": int(current.get(stage) or 0),
        }
        for stage in FUNNEL_STAGES
        if int(compiled.get(stage) or 0) != int(current.get(stage) or 0)
    ]
    return {"stale": bool(changes), "changes": changes}


def history(db: Session, bulletin: Bulletin) -> list[dict]:
    """Recorrido del boletín según la bitácora, del más antiguo al más reciente."""
    rows = (
        db.query(AuditLog)
        .filter(AuditLog.entity_type == "bulletins", AuditLog.entity_id == str(bulletin.id))
        .order_by(AuditLog.occurred_at.asc(), AuditLog.id.asc())
        .all()
    )
    out: list[dict] = []
    compiled_once = False
    for ev in rows:
        new = ev.new_value if isinstance(ev.new_value, dict) else {}
        kind = label = detail = ""
        if ev.action == "bulletin:compile":
            kind, label = ("recompiled", "Recompilado con las cifras del ciclo") if compiled_once else ("compiled", "Compilado")
            compiled_once = True
        elif ev.action == "bulletin:edit":
            kind, label = "edited", "Editado"
            names = {"title": "título", "note": "nota editorial"}
            detail = "Cambió: " + ", ".join(names.get(f, f) for f in new.get("fields") or [])
            if new.get("approval_voided"):
                detail += " · La aprobación anterior se anuló"
        elif ev.action == "bulletin:approve":
            kind, label = "approved", "Aprobado"
        elif ev.action == "bulletin:unapprove":
            kind, label = "unapproved", "Aprobación anulada"
            detail = f"Motivo: {new.get('reason') or ''}"
        elif ev.action == "bulletin:publish":
            kind, label = "published", "Publicado"
        elif ev.action == "bulletin:distribute":
            kind, label = "distributed", "Enviado a la alta dirección"
            sent, failed = len(new.get("sent") or []), len(new.get("failed") or [])
            detail = f"{sent} destinatario(s)"
            if failed:
                detail += f" · {failed} sin entregar"
            if not new.get("with_pdf"):
                detail += " · sin PDF adjunto"
        elif ev.action == "bulletin:export":
            kind, label = "exported", "Descargado en PDF"
        else:
            continue
        out.append(
            {
                "kind": kind,
                "label": label,
                "detail": detail[:600],
                "at": ev.occurred_at.isoformat() if ev.occurred_at else "",
                "by": ev.user_email or "",
            }
        )
    return out
