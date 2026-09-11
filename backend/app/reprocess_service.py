"""Reproceso de lo ya capturado desde el crudo, sin volver a la fuente (RF03).

Dos correcciones de mapeo del frente B, ambas idempotentes (correr dos veces deja
la base igual) y auditadas por el listener de la bitacora:

1. **openFDA (`fda`)**: el adaptador tomaba la fecha de la ULTIMA solicitud
   (incluidos suplementos de etiquetado y fechas de sometimiento) como fecha de
   aprobacion FDA. Ahora solo la solicitud original aprobada llena
   `fda_approval_date`; lo demas va a `regulatory_status`. `reprocess_fda` vuelve
   a mapear el payload guardado en `raw_records` y corrige la tecnologia.
   Ademas repara la incoherencia "estado sometido a revision + fecha de
   aprobacion" en tecnologias sin crudo de openFDA que la respalde: la fecha pasa
   al estado del tramite y la aprobacion queda vacia.

2. **Pipelines de fabricantes (rastreo HTML)**: el nombre de la tecnologia era la
   fila completa de la tabla ("AMO959 AMO959 Prostate cancer Oncology: ...").
   `reprocess_pipelines` separa la fila (`ingest.pipeline_rows`) en producto,
   DCI, indicacion, fase y mecanismo. La fila original se conserva en
   `Finding.raw_content` ("Fila original del pipeline: ...") y en
   `Technology.raw_payload["pipeline"]["row"]`, de donde se relee en cada corrida.

Uso (en backend/):
    python -m app.reprocess_service                 # simulacion, no escribe
    python -m app.reprocess_service --apply         # aplica ambas correcciones
    python -m app.reprocess_service --apply --only fda
O desde la API: POST /api/ingest/reprocess?target=all&apply=true (superadmin).
"""
from __future__ import annotations

import argparse
import json
import re
from datetime import date

from sqlalchemy.orm import Session

from .audit import record_action
from .ingest.fda import FdaConnector
from .ingest.pipeline_rows import ROW_PREFIX, apply_pipeline_fields, is_pipeline_source, parse_row
from .models import Finding, RawRecord, Source, Technology

IN_PROCESS_TOKENS = ("sometid", "submitted", "under review", "en revision", "tramite")
APPROVED_TOKENS = ("aprobad", "approved", "autorizad")


def _dataset_for(payload: dict) -> str:
    if "k_number" in payload:
        return "device/510k"
    if "pma_number" in payload:
        return "device/pma"
    return "drug/drugsfda"


def _tech_for_raw(db: Session, raw: RawRecord) -> Technology | None:
    if raw.technology_id:
        tech = db.get(Technology, raw.technology_id)
        if tech is not None:
            return tech
    if raw.finding_id:
        return db.query(Technology).filter(Technology.finding_id == raw.finding_id).first()
    return None


def reprocess_fda(db: Session, *, apply: bool = False, actor: str = "reproceso") -> dict:
    """Recalcula fecha de aprobacion y estado FDA desde el crudo de openFDA."""
    connector = FdaConnector()
    changes: list[dict] = []
    seen: set[int] = set()
    raws = db.query(RawRecord).filter(RawRecord.connector == "fda").order_by(RawRecord.id).all()
    for raw in raws:
        payload = raw.payload if isinstance(raw.payload, dict) else None
        tech = _tech_for_raw(db, raw)
        if not payload or tech is None or tech.id in seen:
            continue
        seen.add(tech.id)
        record = connector._to_record(payload, _dataset_for(payload))
        if record is None:
            continue
        new_date = record.fda_approval_date
        new_status = record.regulatory_status[:120]
        if tech.fda_approval_date == new_date and (tech.regulatory_status or "") == new_status:
            continue
        changes.append(
            {
                "technology_id": tech.id,
                "motivo": "remapeo_openfda",
                "antes": {"fda_approval_date": _d(tech.fda_approval_date), "regulatory_status": tech.regulatory_status},
                "despues": {"fda_approval_date": _d(new_date), "regulatory_status": new_status},
            }
        )
        if apply:
            tech.fda_approval_date = new_date
            tech.regulatory_status = new_status

    # Incoherencias sin crudo de openFDA que las respalde.
    for tech in db.query(Technology).filter(Technology.fda_approval_date.isnot(None)).all():
        if tech.id in seen:
            continue
        status = (tech.regulatory_status or "").lower()
        if not any(t in status for t in IN_PROCESS_TOKENS) or any(t in status for t in APPROVED_TOKENS):
            continue
        moved = tech.fda_approval_date
        base = re.sub(r"\s*\(\d{4}-\d{2}-\d{2}\)\s*$", "", tech.regulatory_status or "").strip()
        new_status = f"{base} ({_d(moved)})"[:120]
        changes.append(
            {
                "technology_id": tech.id,
                "motivo": "sometido_con_fecha_de_aprobacion",
                "antes": {"fda_approval_date": _d(moved), "regulatory_status": tech.regulatory_status},
                "despues": {"fda_approval_date": None, "regulatory_status": new_status},
            }
        )
        if apply:
            tech.fda_approval_date = None
            tech.regulatory_status = new_status

    return _finish(db, "fda", changes, apply=apply, actor=actor)


def _original_row(finding: Finding | None, tech: Technology) -> str:
    """La fila tal como la entrego la fuente, sin importar cuantas veces se reproceso."""
    stored = ((tech.raw_payload or {}).get("pipeline") or {}).get("row") if isinstance(tech.raw_payload, dict) else None
    if stored:
        return stored
    if finding is not None:
        for line in (finding.raw_content or "").splitlines():
            if line.startswith(ROW_PREFIX):
                return line[len(ROW_PREFIX):]
        return finding.title or ""
    return tech.commercial_name or ""


def reprocess_pipelines(db: Session, *, apply: bool = False, actor: str = "reproceso") -> dict:
    """Separa en campos las filas de pipeline ya capturadas por el rastreo HTML."""
    changes: list[dict] = []
    sources = [s for s in db.query(Source).all() if is_pipeline_source(s)]
    for source in sources:
        for tech in db.query(Technology).filter(Technology.source_id == source.id).order_by(Technology.id).all():
            finding = db.get(Finding, tech.finding_id) if tech.finding_id else None
            row = _original_row(finding, tech)
            parsed = parse_row(row)
            if not parsed:
                continue
            before = {"commercial_name": tech.commercial_name, "indication": tech.indication, "mechanism": tech.mechanism}
            if apply:
                changed = apply_pipeline_fields(finding, tech, row, parsed, source.title)
            else:
                changed = (tech.commercial_name or "") != parsed["name"] or ROW_PREFIX not in ((finding.raw_content if finding else "") or "")
            if changed:
                changes.append(
                    {
                        "technology_id": tech.id,
                        "motivo": "fila_de_pipeline",
                        "antes": before,
                        "despues": {"commercial_name": parsed["name"], "indication": parsed["indication"], "mechanism": parsed["mechanism"]},
                    }
                )
    return _finish(db, "pipeline", changes, apply=apply, actor=actor)


def _finish(db: Session, target: str, changes: list[dict], *, apply: bool, actor: str) -> dict:
    if apply and changes:
        record_action(
            db,
            entity_type="technologies",
            entity_id=f"reproceso-{target}",
            action=f"ingest:reprocess_{target}",
            new_value={"cambios": len(changes), "tecnologias": [c["technology_id"] for c in changes][:200], "actor": actor},
        )
        db.commit()
    elif not apply:
        db.rollback()
    return {"target": target, "applied": apply, "changed": len(changes), "changes": changes}


def reprocess_all(db: Session, *, apply: bool = False, only: str = "all", actor: str = "reproceso") -> list[dict]:
    results = []
    if only in ("all", "fda"):
        results.append(reprocess_fda(db, apply=apply, actor=actor))
    if only in ("all", "pipeline"):
        results.append(reprocess_pipelines(db, apply=apply, actor=actor))
    return results


def _d(value) -> str | None:
    return value.isoformat() if isinstance(value, date) else (str(value) if value else None)


def main() -> None:  # pragma: no cover - uso manual
    from . import audit
    from .database import SessionLocal

    parser = argparse.ArgumentParser(description="Reprocesa desde el crudo los mapeos corregidos (openFDA y pipelines).")
    parser.add_argument("--apply", action="store_true", help="Escribe los cambios. Sin esta bandera solo simula.")
    parser.add_argument("--only", choices=("all", "fda", "pipeline"), default="all")
    args = parser.parse_args()
    audit.install_listeners()
    db = SessionLocal()
    try:
        for result in reprocess_all(db, apply=args.apply, only=args.only, actor="cli"):
            print(json.dumps({k: v for k, v in result.items() if k != "changes"}, ensure_ascii=False))
            for change in result["changes"][:50]:
                print("  ", json.dumps(change, ensure_ascii=False, default=str))
    finally:
        db.close()


if __name__ == "__main__":  # pragma: no cover
    main()
