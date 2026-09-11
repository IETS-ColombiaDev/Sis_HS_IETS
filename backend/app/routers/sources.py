"""CRUD de fuentes de informacion (inventario de escaneo de horizonte)."""
from __future__ import annotations

import csv
import io

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import ingest
from ..catalog import FREQ_HOURS
from ..catalog_service import LOCAL_SOURCE_MARK, normalize_url
from ..database import get_db
from ..deps import get_current_user, require_permission
from ..events import bump_state_version
from ..models import Finding, IngestJob, RawRecord, Source, Technology, User
from ..rbac import P_SOURCE_WRITE
from ..schemas import SourceCreate, SourceOut, SourceQuickCreate, SourceUpdate

router = APIRouter(prefix="/api/sources", tags=["sources"])

# Bloques del catalogo D-06. Una fuente fuera de ellos no aparece en los filtros.
BLOCKS = (
    "Registros de ensayos clinicos",
    "Agencias regulatorias",
    "Agencias de HTA y redes de EH",
    "Literatura y organismos internacionales",
    "Fabricantes de I+D",
)
DEFAULT_QUICK_BLOCK = "Agencias de HTA y redes de EH"
ACCESS_LEVELS = {"", "A", "B", "C", "D", "E"}
HTML_CONNECTORS = {"html", "pdf"}
# Marca de orden de bytes: Excel en Windows abre el CSV como UTF-8 y no rompe tildes.
CSV_BOM = chr(0xFEFF)


def _to_out(db: Session, source: Source) -> SourceOut:
    count = db.query(func.count(Finding.id)).filter(Finding.source_id == source.id).scalar() or 0
    out = SourceOut.model_validate(source)
    out.findings_count = int(count)
    if out.connector_config is None:
        out.connector_config = {}
    return out


def _known_connectors() -> set[str]:
    return {c.code for c in ingest.all_connectors()} | HTML_CONNECTORS


def _validate(data: dict, *, current: Source | None = None) -> None:
    """Reglas comunes de alta y edicion. Los mensajes van a la interfaz tal cual."""
    if "title" in data and data["title"] is not None and not str(data["title"]).strip():
        raise HTTPException(status_code=422, detail="El nombre de la fuente es obligatorio.")
    url = data.get("url")
    if url:
        if not str(url).strip().lower().startswith(("http://", "https://")):
            raise HTTPException(status_code=422, detail="La URL debe iniciar con http:// o https://")
    connector = data.get("connector")
    if connector is not None:
        code = (connector or "html").strip().lower()
        if code not in _known_connectors():
            raise HTTPException(
                status_code=422,
                detail=f"El adaptador '{connector}' no existe. Elija uno de la lista de conectores registrados.",
            )
        data["connector"] = code
    level = data.get("access_level")
    if level is not None:
        level = (level or "").strip().upper()
        if level not in ACCESS_LEVELS:
            raise HTTPException(status_code=422, detail="El nivel de fuente debe ser A, B, C, D o E.")
        data["access_level"] = level
    config = data.get("connector_config")
    if config is not None and not isinstance(config, dict):
        raise HTTPException(status_code=422, detail="La configuración del conector debe ser un objeto JSON.")
    freq = data.get("sync_frequency")
    if freq and freq in FREQ_HOURS and "scan_interval_hours" not in data:
        data["scan_interval_hours"] = FREQ_HOURS[freq]
    hours = data.get("scan_interval_hours")
    if hours is not None and int(hours) < 1:
        raise HTTPException(status_code=422, detail="La frecuencia en horas debe ser de al menos 1.")
    if data.get("scrape_enabled") and current is not None and current.retired:
        raise HTTPException(
            status_code=409,
            detail=(
                "La fuente está retirada del inventario vigente: la cola de ingesta la ignora. "
                "Registre una fuente nueva o recargue el catálogo verificado."
            ),
        )


def _duplicate(db: Session, url: str, *, exclude_id: int | None = None) -> Source | None:
    norm = normalize_url(url or "")
    if not norm:
        return None
    for row in db.query(Source).filter(Source.retired.is_(False)).all():
        if exclude_id and row.id == exclude_id:
            continue
        if normalize_url(row.url or "") == norm:
            return row
    return None


@router.get("", response_model=list[SourceOut])
def list_sources(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    category: str | None = Query(None),
    q: str | None = Query(None),
):
    query = db.query(Source)
    if category:
        query = query.filter(Source.category == category)
    if q:
        like = f"%{q.lower()}%"
        query = query.filter(
            func.lower(Source.title).like(like) | func.lower(Source.description).like(like)
        )
    sources = query.order_by(Source.category, Source.title).all()
    return [_to_out(db, s) for s in sources]


@router.get("/categories", response_model=list[str])
def list_categories(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.query(Source.category).distinct().all()
    return sorted({r[0] for r in rows if r[0]} | set(BLOCKS))


@router.get("/export")
def export_sources(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Exporta el listado maestro de fuentes en CSV (con BOM para Excel)."""
    sources = db.query(Source).order_by(Source.category, Source.title).all()
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "codigo", "titulo", "url", "bloque", "nivel", "conector", "frecuencia",
        "salud", "vigilada", "hallazgos", "pais", "verificacion", "retirada",
    ])
    for s in sources:
        count = db.query(func.count(Finding.id)).filter(Finding.source_id == s.id).scalar() or 0
        writer.writerow([
            s.catalog_code,
            s.title,
            s.url,
            s.category,
            s.access_level,
            s.connector,
            s.sync_frequency,
            s.health_status,
            "si" if s.scrape_enabled else "no",
            count,
            s.country,
            s.verification_status,
            "si" if s.retired else "no",
        ])
    return StreamingResponse(
        iter([CSV_BOM + buf.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="fuentes_iets.csv"'},
    )


@router.get("/{source_id}", response_model=SourceOut)
def get_source(source_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    source = db.get(Source, source_id)
    if not source:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fuente no encontrada")
    return _to_out(db, source)


@router.post("", response_model=SourceOut, status_code=status.HTTP_201_CREATED)
def create_source(
    payload: SourceCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_SOURCE_WRITE)),
):
    data = payload.model_dump()
    data["title"] = (data.get("title") or "").strip()
    data["url"] = (data.get("url") or "").strip()
    _validate(data)
    dup = _duplicate(db, data["url"])
    if dup:
        raise HTTPException(
            status_code=409,
            detail=f"Ya existe una fuente con esa URL: '{dup.title}'. Edítela en lugar de duplicarla.",
        )
    if not (data.get("catalog_code") or "").strip():
        # Sin codigo de catalogo es una fuente local: la recarga del catalogo D-06
        # no debe retirarla (ver catalog_service.sync_catalog).
        data["verification_status"] = data.get("verification_status") or LOCAL_SOURCE_MARK
    source = Source(**data)
    db.add(source)
    db.commit()
    db.refresh(source)
    bump_state_version(db)
    return _to_out(db, source)


@router.post("/quick", response_model=SourceOut, status_code=status.HTTP_201_CREATED)
def create_source_quick(
    payload: SourceQuickCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_SOURCE_WRITE)),
):
    """Alta rapida: solo nombre y URL. Rastreo HTML, nivel D y frecuencia semanal."""
    title = payload.title.strip()
    url = payload.url.strip()
    if not title:
        raise HTTPException(status_code=422, detail="El nombre es obligatorio")
    if not url.lower().startswith(("http://", "https://")):
        raise HTTPException(status_code=422, detail="La URL debe iniciar con http:// o https://")
    dup = _duplicate(db, url)
    if dup:
        raise HTTPException(
            status_code=409,
            detail=f"Ya existe una fuente con esa URL: '{dup.title}'. Edítela en lugar de duplicarla.",
        )
    category = (payload.category or "").strip() or DEFAULT_QUICK_BLOCK
    source = Source(
        title=title[:590],
        url=url[:1020],
        category=category[:120],
        description=f"Fuente agregada manualmente: {title}",
        scrape_enabled=True,
        connector="html",
        access_level="D",
        sync_frequency="semanal",
        scan_interval_hours=FREQ_HOURS["semanal"],
        language="Espanol",
        link_status="Activo",
        verification_status=LOCAL_SOURCE_MARK,
    )
    db.add(source)
    db.commit()
    db.refresh(source)
    bump_state_version(db)
    return _to_out(db, source)


@router.put("/{source_id}", response_model=SourceOut)
def update_source(
    source_id: int,
    payload: SourceUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_SOURCE_WRITE)),
):
    source = db.get(Source, source_id)
    if not source:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fuente no encontrada")
    data = payload.model_dump(exclude_unset=True)
    if "title" in data and data["title"] is not None:
        data["title"] = data["title"].strip()
    if "url" in data and data["url"] is not None:
        data["url"] = data["url"].strip()
    _validate(data, current=source)
    if data.get("url"):
        dup = _duplicate(db, data["url"], exclude_id=source.id)
        if dup:
            raise HTTPException(
                status_code=409,
                detail=f"Otra fuente ya usa esa URL: '{dup.title}'.",
            )
    for key, value in data.items():
        setattr(source, key, value)
    db.commit()
    db.refresh(source)
    bump_state_version(db)
    return _to_out(db, source)


@router.delete("/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_source(
    source_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_SOURCE_WRITE)),
):
    """Elimina una fuente agregada a mano que aun no produjo senales.

    Las senales son el registro de captura y no se descartan: una fuente con
    senales se deshabilita, no se borra. Las del catalogo verificado D-06
    tampoco se borran, porque la siguiente recarga del catalogo las recrearia.
    """
    source = db.get(Source, source_id)
    if not source:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fuente no encontrada")
    if (source.catalog_code or "").strip() and not source.retired:
        raise HTTPException(
            status_code=409,
            detail=(
                "Las fuentes del catálogo verificado D-06 no se eliminan: la recarga del catálogo "
                "las volvería a crear. Deshabilite su ingesta si no desea vigilarla."
            ),
        )
    count = db.query(func.count(Finding.id)).filter(Finding.source_id == source.id).scalar() or 0
    if count:
        raise HTTPException(
            status_code=409,
            detail=(
                f"La fuente tiene {count} señal(es) capturadas, que son registro de captura y no "
                "se descartan. Deshabilite la ingesta en lugar de eliminarla."
            ),
        )
    # Sin llaves foraneas activas en SQLite, se limpian a mano las referencias.
    db.query(IngestJob).filter(IngestJob.source_id == source.id).delete(synchronize_session=False)
    db.query(RawRecord).filter(RawRecord.source_id == source.id).update(
        {RawRecord.source_id: None}, synchronize_session=False
    )
    db.query(Technology).filter(Technology.source_id == source.id).update(
        {Technology.source_id: None}, synchronize_session=False
    )
    db.delete(source)
    db.commit()
    bump_state_version(db)
    return None
