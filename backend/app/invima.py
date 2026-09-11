"""Indice local de registros sanitarios del INVIMA (RF11, fase 3).

El plan advierte que el acceso al dato abierto no esta garantizado y que las
actas de sala especializada solo se publican en PDF. Por eso el modulo se
construye alrededor de un **indice local** y no de una consulta en linea:

- La verificacion de novedad responde contra tablas propias, que es la unica
  forma de sostener el objetivo de 100 ms del percentil 95 sin depender de la
  disponibilidad de un tercero.
- La sincronizacion tiene dos rutas equivalentes: la API Socrata de
  datos.gov.co y la carga de archivo plano, que es el plan de contingencia
  previsto. Ninguna es privilegiada en el modelo de datos.
- La antiguedad del indice es un dato de primera clase. Un filtro regulatorio
  desactualizado no falla: da falsos negativos en silencio, que es peor.
"""
from __future__ import annotations

import csv
import io
from datetime import date, datetime, timezone
from typing import Iterable

import httpx
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from .dedup import _blend, _triple_similarity, normalize_name
from .methodology import INVIMA_STALE_DAYS, get_param
from .models import InvimaRecord, InvimaSync, Technology

SOCRATA_HOST = "https://www.datos.gov.co"
SOCRATA_PAGE_SIZE = 1000

# Conjuntos de datos que alimentan el indice. Se sincroniza mas de uno porque
# ninguno cubre por si solo el alcance de tecnologia sanitaria de la
# especificacion, y porque la disponibilidad de cada uno es inestable: al
# momento de implementar, el "Codigo Unico de Medicamentos vigentes"
# (`i7cb-raxc`) responde HTTP 200 con cero filas. Se conserva en la lista para
# que el indice lo recoja apenas la entidad lo republique.
#
# Limitacion conocida: ninguno de los conjuntos disponibles expone el principio
# activo, solo el nombre del producto. La verificacion por DCI queda degradada
# hasta que el CUM vuelva a publicar datos o se acuerde con el INVIMA una ruta
# estructurada (decision D-04 del BACKLOG).
SOCRATA_DATASETS: tuple[tuple[str, str], ...] = (
    ("ui32-p9f2", "Registros sanitarios y NSO, vigentes y vencidos"),
    ("y4qt-w6tk", "Registros sanitarios de dispositivos médicos"),
    ("i7cb-raxc", "Código Único de Medicamentos vigentes"),
)

# Correspondencia entre las columnas del dato abierto y el modelo local. Cada
# destino acepta varios origenes porque los nombres cambian entre conjuntos, e
# incluye erratas de la fuente que no se pueden corregir aguas arriba
# ("prodcuto" en el conjunto de dispositivos medicos).
FIELD_MAP: dict[str, tuple[str, ...]] = {
    "expediente": ("expediente", "numero_expediente", "expedientecum"),
    "registro": ("rsynso", "registro_sanitario", "registrosanitario", "registro"),
    "producto": ("producto", "prodcuto", "nombre_producto", "descripcioncomercial", "marca"),
    "titular": ("titular", "nombre_titular", "razonsocial"),
    "principio_activo": ("principioactivo", "principio_activo", "descripcionatc"),
    "atc_code": ("atc", "codigo_atc", "codigoatc"),
    "forma_farmaceutica": (
        "formafarmaceutica", "forma_farmaceutica", "descripcionformafarmaceutica", "grupo",
    ),
    "estado_registro": ("estadoregistro", "estado_registro", "estadocum"),
    "fecha_expedicion": ("fechaexpedicion", "fecha_expedicion", "fechaactivo"),
    "fecha_vencimiento": ("fechavencimiento", "fecha_vencimiento", "fechainactivo"),
}

# Estados que el INVIMA usa para un registro que habilita comercializacion.
ACTIVE_STATES = ("vigente", "activo")


def _pick(row: dict, names: Iterable[str]) -> str:
    for name in names:
        value = row.get(name)
        if value not in (None, ""):
            return str(value).strip()
    return ""


def _parse_date(value: str) -> date | None:
    if not value:
        return None
    text = value.strip()[:10]
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def _to_record_fields(row: dict) -> dict:
    lowered = {str(k).strip().lower(): v for k, v in row.items()}
    data = {dest: _pick(lowered, names) for dest, names in FIELD_MAP.items()}
    return {
        **data,
        "fecha_expedicion": _parse_date(data["fecha_expedicion"]),
        "fecha_vencimiento": _parse_date(data["fecha_vencimiento"]),
        "producto_norm": normalize_name(data["producto"]),
        "principio_norm": normalize_name(data["principio_activo"]),
        "raw_payload": row,
    }


def _upsert(db: Session, rows: Iterable[dict]) -> tuple[int, int]:
    """Inserta o actualiza por expediente, o por registro si no hay expediente."""
    inserted = updated = 0
    now = datetime.now(timezone.utc)
    for row in rows:
        fields = _to_record_fields(row)
        if not (fields["producto"] or fields["principio_activo"]):
            continue

        existing = None
        if fields["expediente"]:
            existing = (
                db.query(InvimaRecord)
                .filter(InvimaRecord.expediente == fields["expediente"])
                .first()
            )
        if existing is None and fields["registro"]:
            existing = (
                db.query(InvimaRecord).filter(InvimaRecord.registro == fields["registro"]).first()
            )

        if existing is None:
            db.add(InvimaRecord(**fields, synced_at=now))
            inserted += 1
        else:
            for key, value in fields.items():
                setattr(existing, key, value)
            existing.synced_at = now
            updated += 1
    return inserted, updated


# --------------------------------------------------------------------------- #
#  Sincronizacion
# --------------------------------------------------------------------------- #
def _sync_dataset(
    client: httpx.Client, db: Session, dataset: str, limit: int
) -> tuple[int, int]:
    url = f"{SOCRATA_HOST}/resource/{dataset}.json"
    ingested = changed = 0
    offset = 0
    while offset < limit:
        page = min(SOCRATA_PAGE_SIZE, limit - offset)
        response = client.get(url, params={"$limit": page, "$offset": offset})
        response.raise_for_status()
        rows = response.json()
        if not rows:
            break
        a, b = _upsert(db, rows)
        ingested += a
        changed += b
        offset += len(rows)
        if len(rows) < page:
            break
    return ingested, changed


def sync_from_socrata(
    db: Session, *, limit: int = 5000, triggered_by: str = "", timeout: float = 30.0
) -> InvimaSync:
    """Trae los conjuntos abiertos. Un conjunto caido no cancela a los demas."""
    log = InvimaSync(source="socrata", triggered_by=triggered_by, status="ok")
    db.add(log)
    db.flush()

    per_dataset = max(SOCRATA_PAGE_SIZE, limit // len(SOCRATA_DATASETS))
    ingested = changed = 0
    notes: list[str] = []
    failures = 0

    with httpx.Client(timeout=timeout, follow_redirects=True) as client:
        for dataset, label in SOCRATA_DATASETS:
            try:
                a, b = _sync_dataset(client, db, dataset, per_dataset)
                ingested += a
                changed += b
                notes.append(
                    f"{label}: {a} nuevos, {b} actualizados."
                    if a + b
                    else f"{label}: sin registros publicados."
                )
            except Exception as exc:  # noqa: BLE001
                # La indisponibilidad del dato abierto es un escenario previsto,
                # no un error del sistema: se registra y el indice conserva lo
                # que ya tenia.
                failures += 1
                notes.append(f"{label}: no disponible ({type(exc).__name__}).")

    log.rows_ingested = ingested
    log.rows_updated = changed
    log.message = " ".join(notes)
    log.finished_at = datetime.now(timezone.utc)

    if failures == len(SOCRATA_DATASETS):
        log.status = "error"
        log.message += (
            " Ningún conjunto respondió. El índice local conserva la versión "
            "anterior; use la carga de archivo plano como contingencia."
        )
    elif failures or ingested + changed == 0:
        log.status = "parcial"

    db.commit()
    db.refresh(log)
    return log


def sync_from_flat_file(
    db: Session, *, content: bytes, filename: str = "", triggered_by: str = ""
) -> InvimaSync:
    """Ruta de contingencia: carga del archivo plano publicado por la entidad."""
    log = InvimaSync(source="archivo_plano", triggered_by=triggered_by, status="ok")
    db.add(log)
    db.flush()

    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    try:
        sample = text[:4096]
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
            delimiter = dialect.delimiter
        except csv.Error:
            delimiter = ";" if sample.count(";") > sample.count(",") else ","
        rows = list(csv.DictReader(io.StringIO(text), delimiter=delimiter))
        ingested, changed = _upsert(db, rows)
        log.rows_ingested = ingested
        log.rows_updated = changed
        log.message = f"Carga de '{filename or 'archivo'}' con separador '{delimiter}'."
        if ingested + changed == 0:
            log.status = "parcial"
            log.message += (
                " Ninguna fila tenía producto ni principio activo reconocibles; "
                "revise que el archivo corresponda al listado de registros sanitarios."
            )
    except Exception as exc:  # noqa: BLE001
        log.status = "error"
        log.message = f"Archivo ilegible ({type(exc).__name__}: {exc})."

    log.finished_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(log)
    return log


# --------------------------------------------------------------------------- #
#  Estado del indice
# --------------------------------------------------------------------------- #
def index_status(db: Session) -> dict:
    total = db.query(func.count(InvimaRecord.id)).scalar() or 0
    last_ok = (
        db.query(InvimaSync)
        .filter(InvimaSync.status.in_(("ok", "parcial")))
        .order_by(InvimaSync.started_at.desc())
        .first()
    )
    last_any = db.query(InvimaSync).order_by(InvimaSync.started_at.desc()).first()

    synced_at = last_ok.finished_at or last_ok.started_at if last_ok else None
    age_days = None
    if synced_at is not None:
        reference = synced_at if synced_at.tzinfo else synced_at.replace(tzinfo=timezone.utc)
        age_days = (datetime.now(timezone.utc) - reference).days

    stale = total == 0 or age_days is None or age_days > INVIMA_STALE_DAYS
    if total == 0:
        warning = (
            "El índice local está vacío: la verificación de novedad no puede "
            "descartar que la tecnología ya tenga registro sanitario."
        )
    elif stale:
        warning = (
            f"El índice tiene {age_days} días de antigüedad, por encima del "
            f"máximo de {INVIMA_STALE_DAYS}. Sincronice antes de filtrar."
        )
    else:
        warning = ""

    return {
        "total_records": total,
        "synced_at": synced_at,
        "age_days": age_days,
        "stale": stale,
        "stale_after_days": INVIMA_STALE_DAYS,
        "warning": warning,
        "last_status": last_any.status if last_any else "",
        "last_source": last_any.source if last_any else "",
        "last_message": last_any.message if last_any else "",
    }


# --------------------------------------------------------------------------- #
#  Consulta
# --------------------------------------------------------------------------- #
def match_threshold(db: Session) -> int:
    return int(get_param(db, "invima.match_threshold", 88) or 88)


def _is_valid_registry(record: InvimaRecord) -> bool:
    estado = (record.estado_registro or "").lower()
    if any(token in estado for token in ACTIVE_STATES):
        expired = record.fecha_vencimiento is not None and record.fecha_vencimiento < date.today()
        return not expired
    if not estado:
        # Sin estado declarado se decide por la fecha de vencimiento.
        return record.fecha_vencimiento is None or record.fecha_vencimiento >= date.today()
    return False


def search(db: Session, term: str, *, limit: int = 20) -> list[dict]:
    """Busca en el indice local por producto o principio activo.

    El prefiltro se hace en SQL sobre las columnas normalizadas y solo entonces
    se puntua en memoria: traer la tabla entera para puntuarla no cumpliria el
    objetivo de tiempo de respuesta.
    """
    core = normalize_name(term)
    if not core:
        return []

    tokens = [t for t in core.split() if len(t) >= 4] or [core]
    filters = []
    for token in tokens[:3]:
        pattern = f"%{token}%"
        filters.append(InvimaRecord.producto_norm.like(pattern))
        filters.append(InvimaRecord.principio_norm.like(pattern))

    candidates = db.query(InvimaRecord).filter(or_(*filters)).limit(400).all()

    scored: list[dict] = []
    for record in candidates:
        best = 0.0
        field = ""
        for name, value in (("producto", record.producto_norm), ("principio_activo", record.principio_norm)):
            if not value:
                continue
            blended = _blend(_triple_similarity(core, value))
            if blended > best:
                best, field = blended, name
        scored.append(
            {
                "record": record,
                "score": round(best, 2),
                "matched_field": field,
                "valid_registry": _is_valid_registry(record),
            }
        )

    scored.sort(key=lambda item: -item["score"])
    return scored[:limit]


def check_technology(db: Session, tech: Technology) -> dict:
    """Cruza una tecnologia con el indice y resume si ya tiene registro vigente."""
    minimum = match_threshold(db)
    status = index_status(db)

    terms = [t for t in (tech.inn_name, tech.commercial_name) if t]
    best: dict | None = None
    matches: list[dict] = []
    for term in terms:
        for hit in search(db, term, limit=5):
            matches.append(hit)
            if best is None or hit["score"] > best["score"]:
                best = hit

    over = [m for m in matches if m["score"] >= minimum]
    valid = [m for m in over if m["valid_registry"]]

    return {
        "threshold": minimum,
        "index": status,
        "match_count": len(over),
        "best_score": best["score"] if best else 0.0,
        "has_valid_registry": bool(valid),
        "best": valid[0] if valid else (over[0] if over else best),
        "matches": over[:5],
    }


def purge_index(db: Session) -> int:
    removed = db.query(InvimaRecord).delete()
    db.commit()
    return removed
