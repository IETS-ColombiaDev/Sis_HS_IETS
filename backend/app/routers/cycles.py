"""Ciclos operativos de escaneo (RF05, RF08). Eje de toda la metodologia."""
from __future__ import annotations

import csv
import io

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from .. import cycle_service
from ..audit import record_action
from ..cycle_service import CycleRuleError
from ..database import get_db
from ..deps import get_current_user, require_permission
from ..events import bump_state_version
from ..methodology import CYCLE_STATUS_LABELS, CYCLE_TRANSITIONS
from ..models import Cycle, User
from ..rbac import P_CYCLE_CLOSE, P_CYCLE_WRITE
from ..schemas import (
    CycleCarryOverIn,
    CycleCreate,
    CycleHistoryEvent,
    CycleOut,
    CycleStatusUpdate,
    CycleSummary,
    CycleUpdate,
)

router = APIRouter(prefix="/api/cycles", tags=["cycles"])

CODE_MAX = 120
NOTES_MAX = 4000


def _clean_text(data: dict) -> None:
    """Normaliza codigo y notas; responde 422 en vez de dejar que la base rechace el dato."""
    if "code" in data:
        code = (data["code"] or "").strip()
        if not code:
            raise HTTPException(status_code=422, detail="El código del ciclo es obligatorio.")
        if len(code) > CODE_MAX:
            raise HTTPException(status_code=422, detail=f"El código del ciclo admite hasta {CODE_MAX} caracteres.")
        data["code"] = code
    if "notes" in data:
        notes = data["notes"] or ""
        if len(notes) > NOTES_MAX:
            raise HTTPException(status_code=422, detail=f"Las notas del ciclo admiten hasta {NOTES_MAX} caracteres.")
        data["notes"] = notes


def _to_out(db: Session, cycle: Cycle) -> CycleOut:
    out = CycleOut.model_validate(cycle)
    out.status_label = CYCLE_STATUS_LABELS.get(cycle.status, cycle.status)
    out.allowed_transitions = list(CYCLE_TRANSITIONS.get(cycle.status, ()))
    out.summary = CycleSummary(**{
        k: v for k, v in cycle_service.cycle_summary(db, cycle).items() if k != "by_status"
    })
    if cycle.closed_by:
        closer = db.get(User, cycle.closed_by)
        out.closed_by_name = (closer.name or closer.email) if closer else ""
    return out


def _get(db: Session, cycle_id: int) -> Cycle:
    cycle = db.get(Cycle, cycle_id)
    if not cycle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ciclo no encontrado")
    return cycle


@router.get("", response_model=list[CycleOut])
def list_cycles(
    include_historic: bool = True,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = db.query(Cycle)
    if not include_historic:
        query = query.filter(Cycle.is_historic == False)  # noqa: E712
    cycles = query.order_by(Cycle.is_historic.asc(), Cycle.opened_on.desc()).all()
    return [_to_out(db, c) for c in cycles]


@router.get("/active", response_model=CycleOut | None)
def active_cycle(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    cycle = cycle_service.get_active_cycle(db)
    return _to_out(db, cycle) if cycle else None


@router.get("/export")
def export_cycles(
    format: str = Query("csv", pattern="^(csv|xlsx)$"),
    include_historic: bool = True,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Listado de ciclos con fechas, ventana y embudo (CSV o Excel). Queda en la bitácora."""
    query = db.query(Cycle)
    if not include_historic:
        query = query.filter(Cycle.is_historic == False)  # noqa: E712
    cycles = query.order_by(Cycle.is_historic.asc(), Cycle.opened_on.desc()).all()
    header, rows = cycle_service.export_rows(db, cycles)

    def safe(value):
        if not isinstance(value, str):
            return value
        # Una celda que empieza por =, +, - o @ se ejecutaria como formula al abrir el archivo.
        return "'" + value if value[:1] in ("=", "+", "-", "@") else value

    rows = [[safe(v) for v in row] for row in rows]
    record_action(
        db,
        entity_type="cycles",
        entity_id="listado",
        action="cycle:export",
        new_value={"format": format, "rows": len(rows)},
    )
    db.commit()
    if format == "xlsx":
        from openpyxl import Workbook
        from openpyxl.styles import Font
        from openpyxl.utils import get_column_letter

        wb = Workbook()
        ws = wb.active
        ws.title = "Ciclos"
        ws.append(header)
        for cell in ws[1]:
            cell.font = Font(bold=True)
        for row in rows:
            ws.append(row)
        ws.freeze_panes = "B2"
        for i, title in enumerate(header, start=1):
            ws.column_dimensions[get_column_letter(i)].width = max(12, min(40, len(title) + 4))
        buf = io.BytesIO()
        wb.save(buf)
        return Response(
            content=buf.getvalue(),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": 'attachment; filename="ciclos_de_escaneo.xlsx"'},
        )
    out = io.StringIO()
    writer = csv.writer(out, delimiter=";", lineterminator="\n")
    writer.writerow(header)
    writer.writerows(rows)
    return Response(
        content="\ufeff" + out.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="ciclos_de_escaneo.csv"'},
    )


@router.get("/{cycle_id}", response_model=CycleOut)
def get_cycle(cycle_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return _to_out(db, _get(db, cycle_id))


@router.post("", response_model=CycleOut, status_code=201)
def create_cycle(
    payload: CycleCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_CYCLE_WRITE)),
):
    data = payload.model_dump()
    _clean_text(data)
    if db.query(Cycle).filter(Cycle.code == data["code"]).first():
        raise HTTPException(status_code=400, detail=f"Ya existe un ciclo con el código '{data['code']}'.")

    closing = payload.bulletin_due_on or payload.data_cutoff_on
    year = payload.opened_on.year
    try:
        cycle_service.validate_dates(payload.opened_on, payload.data_cutoff_on, payload.bulletin_due_on)
        cycle_service.validate_year_quota(db, year)
        cycle_service.validate_window(db, payload.opened_on, closing)
    except CycleRuleError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    cycle = Cycle(year=year, status="en_configuracion", **data)
    db.add(cycle)
    db.commit()
    db.refresh(cycle)
    bump_state_version(db)
    return _to_out(db, cycle)


@router.put("/{cycle_id}", response_model=CycleOut)
def update_cycle(
    cycle_id: int,
    payload: CycleUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_CYCLE_WRITE)),
):
    cycle = _get(db, cycle_id)
    if cycle.status == "cerrado_consolidado":
        raise HTTPException(status_code=409, detail="Un ciclo cerrado no admite modificaciones.")

    data = payload.model_dump(exclude_unset=True)
    _clean_text(data)
    if "code" in data:
        code = data["code"]
        clash = db.query(Cycle.id).filter(Cycle.code == code, Cycle.id != cycle.id).first()
        if clash:
            # Sin esta verificacion la restriccion unica respondia 500.
            raise HTTPException(status_code=400, detail=f"Ya existe un ciclo con el código '{code}'.")
    for key in ("opened_on", "data_cutoff_on"):
        if key in data and data[key] is None:
            raise HTTPException(status_code=422, detail="Las fechas de apertura y corte son obligatorias.")
    for key, value in data.items():
        setattr(cycle, key, value)
    cycle.year = cycle.opened_on.year

    closing = cycle.bulletin_due_on or cycle.data_cutoff_on
    try:
        cycle_service.validate_dates(cycle.opened_on, cycle.data_cutoff_on, cycle.bulletin_due_on)
        if not cycle.is_historic:
            cycle_service.validate_year_quota(db, cycle.year, exclude_id=cycle.id)
        cycle_service.validate_window(db, cycle.opened_on, closing)
    except CycleRuleError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc))

    db.commit()
    db.refresh(cycle)
    bump_state_version(db)
    return _to_out(db, cycle)


@router.delete("/{cycle_id}", status_code=204)
def delete_cycle(
    cycle_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_CYCLE_WRITE)),
):
    """Elimina un ciclo creado por error (en configuracion y sin trabajo asociado).

    La baja queda en la bitacora por el listener de auditoria, con el valor
    anterior completo del ciclo.
    """
    cycle = _get(db, cycle_id)
    reasons = cycle_service.delete_blockers(db, cycle)
    if reasons:
        raise HTTPException(
            status_code=409,
            detail="No se puede eliminar: " + " ".join(reasons) + " Edite el ciclo o ciérrelo.",
        )
    # Residuos sin instancia (bases antiguas) y vistas guardadas del ciclo.
    cycle_service.delete_cycle_tree(db, cycle.id)
    db.delete(cycle)
    db.commit()
    bump_state_version(db)
    return Response(status_code=204)


@router.get("/{cycle_id}/close-check")
def close_check(
    cycle_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Verifica si el ciclo puede cerrarse y devuelve los bloqueos vigentes."""
    return cycle_service.close_preview(db, _get(db, cycle_id))


@router.get("/{cycle_id}/history", response_model=list[CycleHistoryEvent])
def cycle_history(
    cycle_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Recorrido del ciclo: creación, ediciones, cambios de etapa, cierre y arrastres."""
    return cycle_service.history(db, _get(db, cycle_id))


@router.get("/{cycle_id}/carry-over/preview")
def carry_over_preview(
    cycle_id: int,
    target_cycle_id: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Qué se arrastraría al ciclo destino, sin cambiar nada."""
    source = _get(db, cycle_id)
    target = _get(db, target_cycle_id) if target_cycle_id else None
    return cycle_service.carry_preview(db, source, target)


@router.put("/{cycle_id}/status", response_model=CycleOut)
def change_status(
    cycle_id: int,
    payload: CycleStatusUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_CYCLE_WRITE)),
):
    cycle = _get(db, cycle_id)
    if payload.status == "cerrado_consolidado":
        from ..rbac import has_permission

        if not has_permission(user, P_CYCLE_CLOSE):
            raise HTTPException(
                status_code=403,
                detail="Solo un superadministrador puede cerrar y consolidar un ciclo.",
            )
        try:
            cycle = cycle_service.close_cycle(db, cycle, actor=user.email, force_note=payload.justification)
        except CycleRuleError as exc:
            raise HTTPException(status_code=409, detail=str(exc))
    else:
        note = (payload.justification or "").strip()
        if cycle_service.is_backwards(cycle.status, payload.status) and not note:
            raise HTTPException(
                status_code=422,
                detail="Registre el motivo para devolver el ciclo a una etapa anterior.",
            )
        try:
            cycle = cycle_service.transition(db, cycle, payload.status, actor=user.email, note=note)
        except CycleRuleError as exc:
            raise HTTPException(status_code=409, detail=str(exc))

    if cycle.closed_by is None and cycle.status == "cerrado_consolidado":
        cycle.closed_by = user.id
        db.commit()
    bump_state_version(db)
    return _to_out(db, cycle)


@router.post("/{cycle_id}/carry-over")
def carry_over(
    cycle_id: int,
    payload: CycleCarryOverIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_CYCLE_WRITE)),
):
    """Arrastra al ciclo destino las tecnologias que quedaron bajo vigilancia."""
    source = _get(db, cycle_id)
    target = _get(db, payload.target_cycle_id)
    try:
        carried = cycle_service.carry_over_watchlist(db, source, target, actor=user.email)
    except CycleRuleError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    bump_state_version(db)
    return {
        "carried": carried,
        "source_cycle": source.code,
        "target_cycle": target.code,
        "message": f"{carried} tecnología(s) bajo vigilancia propuestas para {target.code}.",
    }
