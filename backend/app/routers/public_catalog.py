"""Vista publica de transparencia y fichas (RF17 capa publica, RF18)."""
from __future__ import annotations

import time
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy.orm import Session

from .. import strategy_service
from ..database import get_db
from ..strategy_service import StrategyRuleError
from ..schemas import PublicFicheListItem, PublicFicheOut, PublicStatsOut

router = APIRouter(prefix="/api/public", tags=["public-catalog"])

# Tope por IP para el buscador publico. Vive en memoria: protege el listado, no un DDoS.
_hits: dict[str, list[float]] = defaultdict(list)
WINDOW = 60.0
MAX_HITS = 40


def _rate_limit(request: Request) -> None:
    ip = request.client.host if request.client else "unknown"
    now = time.monotonic()
    recent = [t for t in _hits[ip] if now - t < WINDOW]
    if len(recent) >= MAX_HITS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Demasiadas consultas desde esta dirección. Intente de nuevo en un minuto.",
        )
    recent.append(now)
    _hits[ip] = recent


@router.get("/strategy/stats", response_model=PublicStatsOut)
def public_stats(request: Request, db: Session = Depends(get_db)):
    _rate_limit(request)
    data = strategy_service.public_stats(db)
    if "budget" in data or "comparators" in data:
        raise HTTPException(status_code=500, detail="la vista pública no puede filtrar modelaciones")
    return PublicStatsOut(**data)


@router.get("/technologies", response_model=list[PublicFicheListItem])
def search_fiches(
    request: Request,
    response: Response,
    q: str = Query("", max_length=80),
    cluster_id: int | None = Query(default=None),
    tech_type_id: int | None = Query(default=None),
    phase: str = Query("", max_length=20),
    year: int | None = Query(default=None, ge=2000, le=2100),
    limit: int = Query(50, ge=1, le=50),
    offset: int = Query(0, ge=0, le=100000),
    db: Session = Depends(get_db),
):
    """Buscador avanzado de expedientes publicos (RF18). El total va en `X-Total-Count`."""
    _rate_limit(request)
    if phase and phase not in strategy_service.PUBLIC_PHASE_LABELS:
        raise HTTPException(status_code=422, detail="Fase no reconocida.")
    items, total = strategy_service.search_public_fiches(
        db, q=q, cluster_id=cluster_id, tech_type_id=tech_type_id, phase=phase, year=year,
        limit=limit, offset=offset,
    )
    response.headers["X-Total-Count"] = str(total)
    response.headers["Access-Control-Expose-Headers"] = "X-Total-Count"
    return [PublicFicheListItem(**item) for item in items]


@router.get("/technologies/filters")
def fiche_filters(request: Request, db: Session = Depends(get_db)):
    """Opciones de filtro con al menos una ficha publica (cluster, tipologia, fase, ano)."""
    _rate_limit(request)
    return strategy_service.public_fiche_filters(db)


@router.get("/technologies/{technology_id}", response_model=PublicFicheOut)
def get_fiche(technology_id: int, request: Request, db: Session = Depends(get_db)):
    _rate_limit(request)
    try:
        return PublicFicheOut(**strategy_service.public_fiche(db, technology_id))
    except StrategyRuleError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/technologies/{technology_id}/export")
def export_fiche(technology_id: int, request: Request, format: str = "html", db: Session = Depends(get_db)):
    _rate_limit(request)
    try:
        data = strategy_service.public_fiche(db, technology_id)
    except StrategyRuleError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    html = strategy_service.render_public_fiche_html(data)
    if format == "pdf":
        from ..pdf_export import pdf_response

        return pdf_response(html, f"ficha-publica-{technology_id}.pdf", data.get("title") or "Ficha pública")
    return Response(
        content=html,
        media_type="text/html; charset=utf-8",
        headers={"Content-Disposition": f'inline; filename="ficha-publica-{technology_id}.html"'},
    )
