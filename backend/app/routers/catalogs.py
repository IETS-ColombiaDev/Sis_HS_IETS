"""Catalogos parametrizables: clusteres, tipologias y parametros metodologicos.

La especificacion advierte que estas taxonomias pueden variar tras la
referenciacion, por lo que se editan como dato y nunca se codifican.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user, require_permission
from ..events import bump_state_version
from ..evaluation import EDITORIAL_STATUS_LABELS, FIELD_LABELS, PRODUCT_LEVEL_LABELS
from ..methodology import (
    CONDITION_LABELS,
    CYCLE_STATUS_LABELS,
    EXCLUSION_REASONS,
    TECHNOLOGY_STATUS_LABELS,
)
from ..models import Cluster, MethodologyParam, TechType, User
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


def _create(db: Session, model, payload: CatalogItemCreate):
    if db.query(model).filter(model.code == payload.code).first():
        raise HTTPException(status_code=400, detail=f"Ya existe un registro con el codigo '{payload.code}'.")
    row = model(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    bump_state_version(db)
    return CatalogItemOut.model_validate(row)


def _update(db: Session, model, item_id: int, payload: CatalogItemUpdate):
    row = db.get(model, item_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro no encontrado")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    bump_state_version(db)
    return CatalogItemOut.model_validate(row)


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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parametro no encontrado")
    if row.value_type in ("int", "float"):
        try:
            float(payload.value)
        except ValueError:
            raise HTTPException(status_code=400, detail="El valor debe ser numerico.")
    row.value = payload.value
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
