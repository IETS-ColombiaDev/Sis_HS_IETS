"""Base de conocimiento de busqueda: consulta, cobertura, exportar y cargar un paquete."""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from .. import search_knowledge
from ..audit import record_action
from ..database import get_db
from ..deps import get_current_user, require_permission
from ..models import User
from ..rbac import P_CONFIG_MANAGE

router = APIRouter(prefix="/api/search-knowledge", tags=["search-knowledge"])


@router.get("")
def query_knowledge(
    q: str = Query("", max_length=200, description="Texto a buscar en título, extracto, URL o dominio"),
    source_id: int | None = Query(None),
    status: str = Query("", pattern="^(|activa|sin_senal)$"),
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Paginas conocidas de las fuentes. La consulta cualquier perfil y cualquier ciclo."""
    return {
        "stats": search_knowledge.stats(db),
        "items": search_knowledge.search(db, q, source_id=source_id, status=status, limit=limit),
    }


@router.get("/coverage")
def knowledge_coverage(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Por fuente con ingesta activa: paginas conocidas y cuantas han aportado senales."""
    rows = search_knowledge.coverage(db)
    return {
        "sources": rows,
        "total": len(rows),
        "covered": sum(1 for r in rows if r["pages"]),
        "with_signals": sum(1 for r in rows if r["with_signals"]),
    }


@router.get("/export")
def export_knowledge(db: Session = Depends(get_db), user: User = Depends(require_permission(P_CONFIG_MANAGE))):
    """Descarga la base completa como paquete JSON (para llevarla a otro servidor o versionarla)."""
    body = json.dumps(search_knowledge.export_pack(db), ensure_ascii=False, indent=1)
    return Response(
        content=body.encode("utf-8"),
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="base_busqueda_eh.json"'},
    )


@router.post("/import")
def import_knowledge(
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_CONFIG_MANAGE)),
):
    """Suma un paquete a la base. Solo agrega o refuerza: nunca borra paginas ni baja sus cuentas."""
    try:
        out = search_knowledge.import_pack(db, payload, commit=False)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    record_action(
        db,
        entity_type="search_knowledge",
        entity_id="paquete",
        action="search_knowledge:import",
        new_value={k: out[k] for k in ("added", "updated", "skipped")},
    )
    db.commit()
    return {**out, "stats": search_knowledge.stats(db)}
