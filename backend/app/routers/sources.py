"""CRUD de fuentes de informacion (inventario de escaneo de horizonte)."""
from __future__ import annotations

import csv
import io

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import ingest, source_profile
from ..catalog import CATEGORIES, FREQ_HOURS
from ..catalog_service import LOCAL_SOURCE_MARK, normalize_url
from ..database import get_db
from ..deps import get_current_user, require_permission
from ..events import bump_state_version
from ..models import Finding, IngestJob, RawRecord, Source, Technology, User
from ..rbac import P_SCAN_RUN, P_SOURCE_WRITE
from ..schemas import SourceCreate, SourceOut, SourceQuickCreate, SourceUpdate

router = APIRouter(prefix="/api/sources", tags=["sources"])

# Bloques del catalogo D-06. Una fuente fuera de ellos no aparece en los filtros.
BLOCKS = CATEGORIES
MAX_MATRIX_BYTES = 10 * 1024 * 1024
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
    out.scan_profile = source_profile.normalize_profile(source.scan_profile)
    out.tech_types = list(source.tech_types or [])
    out.entry_urls = list(source.entry_urls or [])
    out.reference_urls = list(source.reference_urls or [])
    return out


def _validate_profile(db: Session, data: dict) -> None:
    """Listas desplegables de la matriz EH: solo valores definidos en Parámetros de fuentes."""
    options = source_profile.load_options(db)
    labels = {
        "source_level": "nivel de fuente",
        "priority_level": "nivel de priorización",
        "matrix_origin": "origen",
    }
    for key, label in labels.items():
        if data.get(key) is None:
            continue
        value = str(data[key]).strip()
        allowed = source_profile.option_values(options, key)
        if value and value not in allowed:
            raise HTTPException(
                status_code=422,
                detail=f"El {label} '{value}' no está en la lista. Opciones: {', '.join(sorted(allowed))}.",
            )
        data[key] = value
    if data.get("tech_types") is not None:
        allowed = source_profile.option_values(options, "tech_type")
        techs: list[str] = []
        for item in data["tech_types"]:
            code = str(item or "").strip().upper()
            if not code:
                continue
            if code not in allowed:
                raise HTTPException(
                    status_code=422,
                    detail=f"El tipo de tecnología '{code}' no está en la lista. Opciones: {', '.join(sorted(allowed))}.",
                )
            if code not in techs:
                techs.append(code)
        data["tech_types"] = techs
    for key in ("entry_urls", "reference_urls"):
        if data.get(key) is not None:
            try:
                data[key] = source_profile.clean_url_list(data[key])
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc
    if data.get("scan_profile") is not None:
        data["scan_profile"] = source_profile.normalize_profile(data["scan_profile"])
    for key in ("matrix_ref", "material_type", "access_path", "consult_info", "observations", "usage_restrictions"):
        if data.get(key) is not None:
            data[key] = str(data[key]).strip()


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
            raise HTTPException(status_code=422, detail="El nivel de acceso debe ser A, B, C, D o E.")
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
    source_level: str | None = Query(None),
    priority_level: str | None = Query(None),
    tech_type: str | None = Query(None),
):
    query = db.query(Source)
    if category:
        query = query.filter(Source.category == category)
    if source_level:
        query = query.filter(Source.source_level == source_level)
    if priority_level is not None and priority_level != "":
        value = "" if priority_level == "sin_asignar" else priority_level
        query = query.filter(func.coalesce(Source.priority_level, "") == value)
    if q:
        like = f"%{q.lower()}%"
        query = query.filter(
            func.lower(Source.title).like(like) | func.lower(Source.description).like(like)
        )
    sources = query.order_by(Source.category, Source.title).all()
    if tech_type:
        code = tech_type.strip().upper()
        sources = [s for s in sources if code in [str(t).upper() for t in (s.tech_types or [])]]
    return [_to_out(db, s) for s in sources]


@router.get("/options")
def source_options(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Listas desplegables de la matriz EH y resumen de la busqueda web (para el panel de fuentes)."""
    from .. import web_search

    cfg = source_profile.load_search(db)
    return {
        "options": source_profile.load_options(db),
        "blocks": list(BLOCKS),
        "access_levels": sorted(a for a in ACCESS_LEVELS if a),
        "scan_profile_defaults": source_profile.DEFAULT_SCAN_PROFILE,
        "max_pages_override": source_profile.MAX_PAGES_OVERRIDE,
        "engine_labels": source_profile.ENGINE_LABELS,
        "web_search": {
            "enabled": bool(cfg.get("enabled")),
            "ai_queries": bool(cfg.get("ai_queries")),
            "engines": cfg.get("engines") or [],
            "max_queries": cfg.get("max_queries"),
            "cooldown": web_search.cooldown_status(),
        },
    }


@router.post("/matrix/import")
async def import_matrix_file(
    file: UploadFile | None = File(None),
    overwrite: bool = Form(True),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_SOURCE_WRITE)),
):
    """Importa la matriz EH (Excel). Sin archivo, reaplica la matriz empaquetada.

    `overwrite=True` pisa lo editado en el panel con lo del Excel; `False` solo
    completa los campos vacios.
    """
    from .. import catalog_service, source_matrix

    if file is not None and file.filename:
        if not file.filename.lower().endswith((".xlsx", ".xlsm")):
            raise HTTPException(status_code=422, detail="Suba el Excel de la matriz en formato .xlsx.")
        content = await file.read(MAX_MATRIX_BYTES + 1)
        if len(content) > MAX_MATRIX_BYTES:
            raise HTTPException(status_code=413, detail="El Excel supera 10 MB.")
        try:
            parsed = source_matrix.parse_workbook(content)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        persist = True
    else:
        parsed = source_matrix.load_matrix()
        if not parsed.get("rows"):
            raise HTTPException(status_code=409, detail="No hay matriz empaquetada: suba el Excel.")
        persist = False
    summary = catalog_service.import_matrix(
        db, parsed, overwrite=overwrite, persist=persist, triggered_by=user.email
    )
    bump_state_version(db)
    return summary


@router.post("/{source_id}/web-search")
def preview_web_search(
    source_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_SCAN_RUN)),
):
    """Prueba la busqueda web de una fuente sin capturar senales."""
    from .. import web_search

    source = db.get(Source, source_id)
    if not source:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fuente no encontrada")
    profile = source_profile.effective_profile(source)
    profile["web_search"] = True  # la prueba corre aunque la casilla del flujo este apagada
    context = source_profile.source_context(source, source_profile.load_options(db))
    result = web_search.search_for_source(db, source, profile, context=context)
    result["follow_keywords"] = profile["follow_keywords"]
    result["entry_urls"] = profile["entry_urls"]
    return result


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
        "codigo", "titulo", "url", "bloque", "nivel_acceso", "nivel_fuente", "prioridad",
        "tipos_tecnologia", "conector", "frecuencia", "salud", "vigilada", "hallazgos", "pais",
        "verificacion", "retirada", "ref_matriz", "urls_entrada", "ruta_acceso", "que_consultar",
        "restricciones", "flujo",
    ])
    flow_labels = {"crawl": "recorrido", "follow_links": "enlaces", "ocr": "ocr", "ai": "ia", "web_search": "busqueda"}
    for s in sources:
        count = db.query(func.count(Finding.id)).filter(Finding.source_id == s.id).scalar() or 0
        profile = source_profile.normalize_profile(s.scan_profile)
        writer.writerow([
            s.catalog_code,
            s.title,
            s.url,
            s.category,
            s.access_level,
            s.source_level or "",
            s.priority_level or "",
            ";".join(s.tech_types or []),
            s.connector,
            s.sync_frequency,
            s.health_status,
            "si" if s.scrape_enabled else "no",
            count,
            s.country,
            s.verification_status,
            "si" if s.retired else "no",
            s.matrix_ref or "",
            " ".join(s.entry_urls or []),
            s.access_path or "",
            s.consult_info or "",
            s.usage_restrictions or "",
            ";".join(v for k, v in flow_labels.items() if profile.get(k)),
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
    _validate_profile(db, data)
    data["source_level"] = data.get("source_level") or "por_definir"
    for key in ("tech_types", "entry_urls", "reference_urls"):
        data[key] = data.get(key) or []
    data["scan_profile"] = source_profile.normalize_profile(data.get("scan_profile"))
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
        source_level="por_definir",
        tech_types=[],
        entry_urls=[],
        reference_urls=[],
        scan_profile=source_profile.normalize_profile(None),
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
    _validate_profile(db, data)
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
