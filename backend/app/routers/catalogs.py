"""Catalogos parametrizables: clusteres, tipologias y parametros metodologicos.

La especificacion advierte que estas taxonomias pueden variar tras la
referenciacion, por lo que se editan como dato y nunca se codifican.
"""
from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user, require_permission
from ..events import bump_state_version
from ..evaluation import EDITORIAL_STATUS_LABELS, FIELD_LABELS, PRODUCT_LEVEL_LABELS
from ..methodology import (
    CLUSTER_SEED,
    TECH_TYPE_SEED,
    CONDITION_LABELS,
    CYCLE_STATUS_LABELS,
    EXCLUSION_REASONS,
    TECHNOLOGY_STATUS_LABELS,
)
from ..models import Cluster, MethodologyParam, TechType, Technology, User
from ..rbac import P_CATALOG_WRITE
from ..schemas import (
    CatalogItemCreate,
    CatalogItemOut,
    CatalogItemUpdate,
    MethodologyParamOut,
    MethodologyParamUpdate,
)

router = APIRouter(prefix="/api", tags=["catalogs"])


def _list_catalog(db: Session, model, include_inactive: bool):
    query = db.query(model)
    if not include_inactive:
        query = query.filter(model.is_active == True)  # noqa: E712
    return [CatalogItemOut.model_validate(r) for r in query.order_by(model.sort_order, model.name)]


@router.get("/clusters", response_model=list[CatalogItemOut])
def list_clusters(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return _list_catalog(db, Cluster, include_inactive)


@router.get("/tech-types", response_model=list[CatalogItemOut])
def list_tech_types(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return _list_catalog(db, TechType, include_inactive)


CODE_RE = re.compile(r"^[a-z0-9][a-z0-9_]{1,59}$")
SEEDED_CODES = {Cluster: {d["code"] for d in CLUSTER_SEED}, TechType: {d["code"] for d in TECH_TYPE_SEED}}


def _create(db: Session, model, payload: CatalogItemCreate):
    data = payload.model_dump()
    data["code"] = (data.get("code") or "").strip().lower()
    data["name"] = (data.get("name") or "").strip()
    if not CODE_RE.match(data["code"]):
        raise HTTPException(
            status_code=422,
            detail="El código debe tener entre 2 y 60 caracteres: minúsculas, números y guion bajo (ej. enf_raras).",
        )
    if not data["name"]:
        raise HTTPException(status_code=422, detail="El nombre es obligatorio.")
    data["keywords"] = [k.strip() for k in (data.get("keywords") or []) if str(k).strip()]
    if db.query(model).filter(model.code == data["code"]).first():
        raise HTTPException(status_code=409, detail=f"Ya existe un registro con el código '{data['code']}'.")
    row = model(**data)
    db.add(row)
    db.commit()
    db.refresh(row)
    bump_state_version(db)
    return CatalogItemOut.model_validate(row)


def _update(db: Session, model, item_id: int, payload: CatalogItemUpdate):
    row = db.get(model, item_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro no encontrado")
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and not (data["name"] or "").strip():
        raise HTTPException(status_code=422, detail="El nombre no puede quedar vacío.")
    if data.get("keywords") is not None:
        data["keywords"] = [k.strip() for k in data["keywords"] if str(k).strip()]
    for key, value in data.items():
        setattr(row, key, value.strip() if isinstance(value, str) else value)
    db.commit()
    db.refresh(row)
    bump_state_version(db)
    return CatalogItemOut.model_validate(row)


def _delete(db: Session, model, item_id: int) -> None:
    """Borra solo lo agregado localmente y sin uso; lo demas se desactiva."""
    row = db.get(model, item_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro no encontrado")
    if row.code in SEEDED_CODES[model]:
        raise HTTPException(
            status_code=409,
            detail="Es parte de la taxonomía oficial de la especificación: desactívelo en lugar de eliminarlo.",
        )
    if model is Cluster:
        used = db.query(Technology).filter(
            (Technology.cluster_id == row.id) | (Technology.suggested_cluster_id == row.id)
        ).count()
    else:
        used = db.query(Technology).filter(Technology.tech_type_id == row.id).count()
    if used:
        raise HTTPException(
            status_code=409,
            detail=f"Está en uso por {used} tecnología(s): desactívelo para retirarlo de nuevas clasificaciones.",
        )
    db.delete(row)
    db.commit()
    bump_state_version(db)


@router.post("/clusters", response_model=CatalogItemOut, status_code=201)
def create_cluster(
    payload: CatalogItemCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_CATALOG_WRITE)),
):
    return _create(db, Cluster, payload)


@router.put("/clusters/{item_id}", response_model=CatalogItemOut)
def update_cluster(
    item_id: int,
    payload: CatalogItemUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_CATALOG_WRITE)),
):
    return _update(db, Cluster, item_id, payload)


@router.post("/tech-types", response_model=CatalogItemOut, status_code=201)
def create_tech_type(
    payload: CatalogItemCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_CATALOG_WRITE)),
):
    return _create(db, TechType, payload)


@router.put("/tech-types/{item_id}", response_model=CatalogItemOut)
def update_tech_type(
    item_id: int,
    payload: CatalogItemUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_CATALOG_WRITE)),
):
    return _update(db, TechType, item_id, payload)


@router.delete("/clusters/{item_id}", status_code=204)
def delete_cluster(
    item_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_CATALOG_WRITE)),
):
    _delete(db, Cluster, item_id)
    return None


@router.delete("/tech-types/{item_id}", status_code=204)
def delete_tech_type(
    item_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_CATALOG_WRITE)),
):
    _delete(db, TechType, item_id)
    return None


@router.get("/methodology/params", response_model=list[MethodologyParamOut])
def list_params(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.query(MethodologyParam).order_by(MethodologyParam.key).all()
    return [MethodologyParamOut.model_validate(r) for r in rows]


@router.put("/methodology/params/{key}", response_model=MethodologyParamOut)
def update_param(
    key: str,
    payload: MethodologyParamUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_CATALOG_WRITE)),
):
    row = db.get(MethodologyParam, key)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parámetro no encontrado")
    value = (payload.value or "").strip()
    if not value:
        raise HTTPException(status_code=400, detail="El valor no puede quedar vacío.")
    if row.value_type in ("int", "float"):
        try:
            number = float(value)
        except ValueError:
            raise HTTPException(status_code=400, detail="El valor debe ser numérico.")
        if row.value_type == "int" and not number.is_integer():
            raise HTTPException(status_code=400, detail="El valor debe ser un número entero.")
        if row.value_type == "int":
            value = str(int(number))
    row.value = value
    db.commit()
    db.refresh(row)
    bump_state_version(db)
    return MethodologyParamOut.model_validate(row)


@router.get("/methodology/enums")
def list_enums(user: User = Depends(get_current_user)):
    """Catalogos de estados y etiquetas: contrato unico entre backend y frontend."""
    return {
        "cycle_statuses": CYCLE_STATUS_LABELS,
        "technology_statuses": TECHNOLOGY_STATUS_LABELS,
        "conditions": CONDITION_LABELS,
        "exclusion_reasons": EXCLUSION_REASONS,
        "product_levels": PRODUCT_LEVEL_LABELS,
        "editorial_statuses": EDITORIAL_STATUS_LABELS,
        "evaluation_fields": FIELD_LABELS,
    }
