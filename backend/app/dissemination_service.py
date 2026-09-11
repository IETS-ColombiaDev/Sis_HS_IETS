"""Paquete de diseminacion por ciclo (backlog P5-4).

Arma un ZIP con lo que el ciclo produjo para compartirlo con quien decide:

- `LEEME.txt`: manifiesto con el ciclo, la fecha, quien lo genero y el conteo de
  cada seccion, incluido lo que se omitio y por que.
- `listado_unico_<ciclo>.csv`: el Listado Unico por cluster (RF12), tal como lo
  consolida `screening_service.unique_list`.
- `informes_evaluacion/`: HTML institucional de cada ficha, informe o Mini-HTA
  del ciclo. Por defecto solo los aprobados por comite o publicados; los
  confidenciales nunca viajan en el paquete.
- `recomendaciones/`: cada recomendacion de adopcion vinculada a una senal del
  ciclo, en Markdown, mas un indice CSV.
- `notas.csv`: las notas del equipo sobre esas senales y recomendaciones.
- `boletin_<ciclo>.html`: el boletin del ciclo, solo si ya esta publicado.

No escribe nada en la base: solo lee y empaqueta.
"""
from __future__ import annotations

import csv
import io
import re
import zipfile
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from .methodology import TECHNOLOGY_STATUS_LABELS
from .models import (
    Bulletin,
    Cycle,
    CycleTechnology,
    EvaluationDoc,
    Finding,
    Note,
    Recommendation,
    Technology,
)

FINAL_DOC_STATUSES = {"aprobado_comite", "publicado"}
CSV_BOM = chr(0xFEFF)


class DisseminationError(ValueError):
    """El paquete no se puede armar (por ejemplo, el ciclo no existe)."""


def _slug(text: str, limit: int = 60) -> str:
    value = re.sub(r"[^A-Za-z0-9]+", "-", (text or "").strip()).strip("-").lower()
    return (value or "sin-titulo")[:limit]


def _csv(rows: list[list], header: list[str]) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf, delimiter=";")
    writer.writerow(header)
    writer.writerows(rows)
    return CSV_BOM + buf.getvalue()


def package_filename(cycle: Cycle) -> str:
    return f"paquete_diseminacion_{_slug(cycle.code, 40)}.zip"


def build_package(
    db: Session, cycle_id: int, *, actor: str = "", include_drafts: bool = False
) -> tuple[bytes, dict]:
    """Devuelve (bytes del ZIP, manifiesto). El manifiesto tambien va en LEEME.txt."""
    from . import screening_service
    from .evaluation_service import render_institutional_html

    cycle = db.get(Cycle, cycle_id)
    if cycle is None:
        raise DisseminationError("El ciclo no existe.")

    tech_ids = [
        tid for (tid,) in db.query(CycleTechnology.technology_id).filter(CycleTechnology.cycle_id == cycle.id)
    ]
    techs = {t.id: t for t in db.query(Technology).filter(Technology.id.in_(tech_ids)).all()} if tech_ids else {}
    finding_ids = [t.finding_id for t in techs.values() if t.finding_id]

    buf = io.BytesIO()
    manifest: dict = {
        "cycle_id": cycle.id,
        "cycle_code": cycle.code,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "generated_by": actor,
        "include_drafts": include_drafts,
        "unique_list": 0,
        "evaluation_docs": 0,
        "evaluation_docs_skipped_confidential": 0,
        "evaluation_docs_skipped_draft": 0,
        "recommendations": 0,
        "notes": 0,
        "bulletin": False,
    }

    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        # 1. Listado Unico por cluster.
        data = screening_service.unique_list(db, cycle.id)
        rows = []
        for group in data["clusters"]:
            for item in group["items"]:
                rows.append(
                    [
                        group["cluster_name"],
                        item["commercial_name"],
                        item["inn_name"],
                        item["manufacturer"],
                        item["tech_type_name"],
                        item["condition"],
                        item["atc_code"],
                        " ".join(item["icd10_codes"]),
                        " ".join(str(n) for n in item["nct_ids"]),
                        TECHNOLOGY_STATUS_LABELS.get(item["status"], item["status"]),
                        item["priority_pct"] if item["priority_pct"] is not None else "",
                        item["invima_registry"],
                    ]
                )
        manifest["unique_list"] = len(rows)
        zf.writestr(
            f"listado_unico_{_slug(cycle.code, 40)}.csv",
            _csv(
                rows,
                [
                    "cluster", "nombre_comercial", "dci", "fabricante", "tipologia", "condicion",
                    "atc", "cie10", "nct", "estado", "porcentaje_p", "registro_invima",
                ],
            ),
        )

        # 2. Informes de evaluacion temprana (ficha / informe / Mini-HTA).
        docs = db.query(EvaluationDoc).filter(EvaluationDoc.cycle_id == cycle.id).order_by(EvaluationDoc.id).all()
        doc_index = []
        for doc in docs:
            if doc.confidential:
                manifest["evaluation_docs_skipped_confidential"] += 1
                continue
            if not include_drafts and doc.status not in FINAL_DOC_STATUSES:
                manifest["evaluation_docs_skipped_draft"] += 1
                continue
            tech = techs.get(doc.technology_id) or db.get(Technology, doc.technology_id)
            html = render_institutional_html(doc, tech, cycle_code=cycle.code)
            name = f"informes_evaluacion/{doc.id:04d}_{doc.product_level}_{_slug(doc.title or (tech.commercial_name if tech else ''))}.html"
            zf.writestr(name, html)
            doc_index.append(
                [doc.id, doc.title, doc.product_level, doc.status, f"{doc.version_major}.{doc.version_minor}", name]
            )
            manifest["evaluation_docs"] += 1
        zf.writestr(
            "informes_evaluacion/indice.csv",
            _csv(doc_index, ["id", "titulo", "nivel", "estado", "version", "archivo"]),
        )

        # 3. Recomendaciones de adopcion de las senales del ciclo.
        recs = (
            db.query(Recommendation)
            .filter(Recommendation.finding_id.in_(finding_ids))
            .order_by(Recommendation.id)
            .all()
            if finding_ids
            else []
        )
        rec_index = []
        for rec in recs:
            finding = db.get(Finding, rec.finding_id) if rec.finding_id else None
            name = f"recomendaciones/{rec.id:04d}_{_slug(rec.title)}.md"
            header = (
                f"# {rec.title}\n\n"
                f"- Ciclo: {cycle.code}\n"
                f"- Señal: {finding.title if finding else '—'}\n"
                f"- Impacto: {rec.impact or 'sin definir'}\n"
                f"- Origen: {rec.model_used or 'manual'} · {rec.created_by or ''}\n"
                f"- Fecha: {rec.created_at.date().isoformat() if rec.created_at else ''}\n\n"
                "> Toda salida de IA es un borrador sujeto a validación humana.\n\n---\n\n"
            )
            zf.writestr(name, header + (rec.content or ""))
            rec_index.append([rec.id, rec.title, rec.impact, rec.model_used, rec.created_by, name])
            manifest["recommendations"] += 1
        zf.writestr(
            "recomendaciones/indice.csv",
            _csv(rec_index, ["id", "titulo", "impacto", "origen", "autor", "archivo"]),
        )

        # 4. Notas del equipo sobre esas senales y recomendaciones.
        rec_ids = [r.id for r in recs]
        notes = []
        if finding_ids:
            notes += db.query(Note).filter(Note.entity_type == "finding", Note.entity_id.in_(finding_ids)).all()
        if rec_ids:
            notes += db.query(Note).filter(Note.entity_type == "recommendation", Note.entity_id.in_(rec_ids)).all()
        notes.sort(key=lambda n: (n.entity_type, n.entity_id or 0, n.id))
        manifest["notes"] = len(notes)
        zf.writestr(
            "notas.csv",
            _csv(
                [
                    [
                        n.id, n.entity_type, n.entity_id or "", n.title, n.content,
                        n.author_name or n.author_email, "si" if n.pinned else "no",
                        n.updated_at.isoformat() if n.updated_at else "",
                    ]
                    for n in notes
                ],
                ["id", "vinculada_a", "entidad_id", "titulo", "contenido", "autor", "fijada", "actualizada"],
            ),
        )

        # 5. Boletin del ciclo, solo publicado.
        bulletin = (
            db.query(Bulletin)
            .filter(Bulletin.cycle_id == cycle.id, Bulletin.status == "publicado")
            .order_by(Bulletin.id.desc())
            .first()
        )
        if bulletin is not None:
            from .report_html import render_bulletin_html

            zf.writestr(f"boletin_{_slug(cycle.code, 40)}.html", render_bulletin_html(bulletin))
            manifest["bulletin"] = True

        zf.writestr("LEEME.txt", _readme(manifest))

    return buf.getvalue(), manifest


def _readme(m: dict) -> str:
    lines = [
        "Paquete de diseminación - Sistema de Escaneo de Horizonte del IETS",
        "=" * 66,
        f"Ciclo: {m['cycle_code']} (id {m['cycle_id']})",
        f"Generado: {m['generated_at']} por {m['generated_by'] or 'sistema'}",
        "",
        "Contenido:",
        f"- Listado Único por clúster: {m['unique_list']} tecnología(s).",
        f"- Informes de evaluación: {m['evaluation_docs']} "
        + ("(incluye borradores)." if m["include_drafts"] else "(solo aprobados por comité o publicados)."),
        f"- Recomendaciones de adopción: {m['recommendations']}.",
        f"- Notas del equipo: {m['notes']}.",
        f"- Boletín publicado: {'sí' if m['bulletin'] else 'no (aún no publicado)'}.",
        "",
        "Omitido a propósito:",
        f"- {m['evaluation_docs_skipped_confidential']} informe(s) marcados como confidenciales.",
        f"- {m['evaluation_docs_skipped_draft']} informe(s) aún en redacción o revisión.",
        "",
        "Los CSV usan punto y coma como separador y codificación UTF-8 con BOM (abren en Excel).",
        "Las recomendaciones generadas con IA son borradores sujetos a validación humana.",
    ]
    return "\n".join(lines) + "\n"
