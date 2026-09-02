"""Clasificacion asistida de clusteres y tipologias (fase 1, RF06 y RF07).

Clasificador ligero de reglas sobre la indicacion y el texto de la senal, con
mapeo a prefijos CIE-10 y terminos MeSH declarados en el catalogo. La salida es
siempre una **propuesta** que el evaluador confirma: la especificacion no admite
clasificacion automatica sin validacion humana.
"""
from __future__ import annotations

import re
import unicodedata

from sqlalchemy.orm import Session

from .models import Cluster, TechType


def normalize(text: str) -> str:
    """Minusculas sin tildes, para que las reglas no dependan de la acentuacion."""
    if not text:
        return ""
    decomposed = unicodedata.normalize("NFKD", text.lower())
    return "".join(c for c in decomposed if not unicodedata.combining(c))


def _score_keywords(blob: str, keywords: list[str] | None) -> tuple[int, list[str]]:
    hits: list[str] = []
    for kw in keywords or []:
        needle = normalize(kw).strip()
        if needle and needle in blob:
            hits.append(kw.strip())
    return len(hits), hits


def _score_icd10(codes: list[str] | None, prefixes: list[str] | None) -> tuple[int, list[str]]:
    hits: list[str] = []
    for code in codes or []:
        clean = (code or "").upper().replace(".", "").strip()
        for prefix in prefixes or []:
            if clean.startswith(prefix.upper()):
                hits.append(code)
                break
    return len(hits) * 3, hits  # el codigo explicito pesa mas que la palabra clave


def suggest_cluster(
    db: Session,
    *,
    indication: str = "",
    summary: str = "",
    title: str = "",
    icd10_codes: list[str] | None = None,
    mesh_terms: list[str] | None = None,
) -> tuple[int | None, str]:
    """Devuelve `(cluster_id, motivo)` o `(None, "")` si no hay evidencia."""
    blob = normalize(" ".join(filter(None, [indication, title, summary])))
    mesh_blob = normalize(" ".join(mesh_terms or []))

    best_id: int | None = None
    best_score = 0
    best_reason = ""

    for cluster in db.query(Cluster).filter(Cluster.is_active == True).order_by(Cluster.sort_order):  # noqa: E712
        score, hits = _score_keywords(blob, cluster.keywords)
        icd_score, icd_hits = _score_icd10(icd10_codes, cluster.icd10_prefixes)
        mesh_score, mesh_hits = _score_keywords(mesh_blob, cluster.mesh_terms)
        total = score + icd_score + mesh_score * 2
        if total > best_score:
            evidence = icd_hits + mesh_hits + hits
            best_score = total
            best_id = cluster.id
            best_reason = f"Coincidencias: {', '.join(evidence[:4])}"

    return (best_id, best_reason) if best_id else (None, "")


def suggest_tech_type(
    db: Session,
    *,
    legacy_type: str = "",
    title: str = "",
    summary: str = "",
    technology: str = "",
) -> tuple[int | None, str]:
    """Propone una de las 7 tipologias. El tipo heredado tiene prioridad."""
    blob = normalize(" ".join(filter(None, [technology, title, summary])))
    legacy = normalize(legacy_type).strip()

    types = list(db.query(TechType).filter(TechType.is_active == True).order_by(TechType.sort_order))  # noqa: E712

    # Las tipologias especificas (terapias avanzadas, IA, IVD) se evaluan antes que
    # las genericas para que "terapia genica" no caiga en "medicamento".
    best_id: int | None = None
    best_score = 0
    best_reason = ""
    for tt in types:
        score, hits = _score_keywords(blob, tt.keywords)
        if score:
            weight = score * (2 if tt.code in ("terapia_avanzada", "ia", "diagnostico_ivd") else 1)
            if weight > best_score:
                best_score = weight
                best_id = tt.id
                best_reason = f"Coincidencias: {', '.join(hits[:4])}"

    if best_id:
        return best_id, best_reason

    if legacy:
        for tt in types:
            if legacy in [normalize(x) for x in (tt.legacy_types or [])]:
                return tt.id, f"Tipo heredado '{legacy_type}'"

    return None, ""


_CONDITION_APPROVED = re.compile(
    r"\b(approved|approval|aprobad|autorizad|marketing authorization|registro sanitario)\b"
)
_CONDITION_TRIAL = re.compile(
    r"\b(phase\s*(ii|iii|2|3)|fase\s*(ii|iii|2|3)|ensayo clinico|clinical trial|investigational)\b"
)


def suggest_condition(*, phase: str = "", summary: str = "", title: str = "", horizon: str = "") -> str:
    """Propone la condicion del glosario: `emergente` o `nueva`.

    Dimension distinta del horizonte heredado; ambas conviven.
    """
    blob = normalize(" ".join(filter(None, [phase, title, summary])))
    if _CONDITION_APPROVED.search(blob):
        return "nueva"
    if _CONDITION_TRIAL.search(blob):
        return "emergente"
    if normalize(horizon) == "inminente":
        return "nueva"
    if normalize(horizon) in ("emergente", "transicional"):
        return "emergente"
    return ""
