"""Normalizacion tecnica con vocabularios controlados (RF09-RF12, fase 3).

Es la tercera funcion del modulo 2 y, como advierte el plan, la que mas se
olvida: sin denominaciones unificadas, ni el matching difuso ni el cruce con
INVIMA rinden lo esperado. Dos registros que dicen "diabetes tipo 2" y "DM2" no
se parecen como texto, pero comparten el codigo CIE-10 E11.

El alcance aqui es la *validacion y canonizacion* del codigo que captura el
evaluador, no la codificacion automatica: asignar un CIE-10 es un acto clinico.
El sistema valida la forma, canoniza el formato y sugiere a partir de los
catalogos, siempre como propuesta.
"""
from __future__ import annotations

import re

from sqlalchemy.orm import Session

from .models import Cluster, Technology

# --------------------------------------------------------------------------- #
#  ATC (Anatomical Therapeutic Chemical, OMS)
# --------------------------------------------------------------------------- #
# Cinco niveles: letra, dos digitos, letra, letra, dos digitos. Se aceptan
# codigos parciales porque una tecnologia emergente puede tener asignado solo el
# grupo terapeutico mientras la OMS no publica el nivel quimico.
_ATC = re.compile(r"^[A-Z](\d{2}([A-Z]([A-Z](\d{2})?)?)?)?$")

ATC_LEVEL_NAMES = {
    1: "Grupo anatómico principal",
    2: "Subgrupo terapéutico",
    3: "Subgrupo farmacológico",
    4: "Subgrupo químico",
    5: "Principio activo",
}


def normalize_atc(value: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", (value or "").upper())


def atc_level(code: str) -> int:
    """Nivel de especificidad del codigo, de 1 (anatomico) a 5 (principio activo)."""
    return {1: 1, 3: 2, 4: 3, 5: 4, 7: 5}.get(len(normalize_atc(code)), 0)


def validate_atc(value: str) -> tuple[bool, str]:
    code = normalize_atc(value)
    if not code:
        return True, ""
    if not _ATC.match(code) or atc_level(code) == 0:
        return False, f"'{value}' no tiene la forma de un código ATC (ejemplo: L01FF02)."
    return True, ""


# --------------------------------------------------------------------------- #
#  CIE-10
# --------------------------------------------------------------------------- #
# Una letra, dos digitos y hasta dos caracteres de subdivision. Se admite con y
# sin punto y se canoniza sin el, que es como llegan los datos del SGSSS.
_ICD10 = re.compile(r"^[A-TV-Z]\d{2}(\d{1,2})?$")


def normalize_icd10(value: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", (value or "").upper())


def validate_icd10(value: str) -> tuple[bool, str]:
    code = normalize_icd10(value)
    if not code:
        return True, ""
    if not _ICD10.match(code):
        return False, f"'{value}' no tiene la forma de un código CIE-10 (ejemplo: C50 o C509)."
    return True, ""


def normalize_icd10_list(values: list | None) -> tuple[list[str], list[str]]:
    """Devuelve los codigos canonizados y los que no pasaron validacion."""
    ok: list[str] = []
    bad: list[str] = []
    for raw in values or []:
        code = normalize_icd10(str(raw))
        if not code:
            continue
        valid, _ = validate_icd10(code)
        (ok if valid else bad).append(code if valid else str(raw))
    # Se preserva el orden de captura y se eliminan repetidos.
    return list(dict.fromkeys(ok)), bad


# --------------------------------------------------------------------------- #
#  MeSH
# --------------------------------------------------------------------------- #
def normalize_mesh(value: str) -> str:
    """MeSH son descriptores, no codigos: se normaliza el espaciado y el caso."""
    return re.sub(r"\s+", " ", (value or "").strip()).title()


def normalize_mesh_list(values: list | None) -> list[str]:
    terms = [normalize_mesh(str(v)) for v in values or []]
    return list(dict.fromkeys(t for t in terms if t))


# --------------------------------------------------------------------------- #
#  Nomenclatura de dispositivos (GMDN / EMDN)
# --------------------------------------------------------------------------- #
# GMDN: cinco digitos. EMDN: letra de categoria seguida de digitos por nivel.
_GMDN = re.compile(r"^\d{5}$")
_EMDN = re.compile(r"^[A-Z]\d{2,8}$")


def normalize_device_code(value: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", (value or "").upper())


def validate_device_code(value: str) -> tuple[bool, str]:
    code = normalize_device_code(value)
    if not code:
        return True, ""
    if _GMDN.match(code):
        return True, ""
    if _EMDN.match(code):
        return True, ""
    return False, (
        f"'{value}' no corresponde a GMDN (cinco dígitos) ni a EMDN "
        "(letra de categoría y dígitos, ejemplo: J0101)."
    )


def device_nomenclature_system(value: str) -> str:
    code = normalize_device_code(value)
    if _GMDN.match(code):
        return "GMDN"
    if _EMDN.match(code):
        return "EMDN"
    return ""


# --------------------------------------------------------------------------- #
#  Aplicacion sobre una tecnologia
# --------------------------------------------------------------------------- #
def normalize_technology(tech: Technology) -> dict:
    """Canoniza en sitio los vocabularios de la tecnologia.

    Devuelve el detalle de lo corregido y lo rechazado, para mostrarlo al
    evaluador en vez de descartar en silencio un codigo mal escrito.
    """
    report: dict = {"corregido": {}, "rechazado": {}}

    atc = normalize_atc(tech.atc_code)
    valid, message = validate_atc(atc)
    if not valid:
        report["rechazado"]["atc_code"] = message
    elif atc != (tech.atc_code or ""):
        report["corregido"]["atc_code"] = {"antes": tech.atc_code, "despues": atc}
        tech.atc_code = atc

    codes, bad = normalize_icd10_list(tech.icd10_codes)
    if bad:
        report["rechazado"]["icd10_codes"] = (
            f"Códigos sin forma válida de CIE-10: {', '.join(bad)}."
        )
    if codes != (tech.icd10_codes or []):
        report["corregido"]["icd10_codes"] = {"antes": tech.icd10_codes, "despues": codes}
        tech.icd10_codes = codes

    terms = normalize_mesh_list(tech.mesh_terms)
    if terms != (tech.mesh_terms or []):
        report["corregido"]["mesh_terms"] = {"antes": tech.mesh_terms, "despues": terms}
        tech.mesh_terms = terms

    device = normalize_device_code(tech.device_nomenclature)
    valid, message = validate_device_code(device)
    if not valid:
        report["rechazado"]["device_nomenclature"] = message
    elif device != (tech.device_nomenclature or ""):
        report["corregido"]["device_nomenclature"] = {
            "antes": tech.device_nomenclature,
            "despues": device,
        }
        tech.device_nomenclature = device

    return report


def suggest_vocabularies(db: Session, tech: Technology) -> dict:
    """Propone CIE-10 y MeSH a partir del cluster asignado.

    El cluster ya trae los prefijos CIE-10 y descriptores MeSH que lo definen,
    asi que sirve de punto de partida cuando el evaluador aun no codifico. Es
    una sugerencia de arranque, nunca una asignacion.
    """
    if not tech.cluster_id:
        return {"icd10_prefixes": [], "mesh_terms": [], "reason": "Sin clúster asignado."}
    cluster = db.get(Cluster, tech.cluster_id)
    if cluster is None:
        return {"icd10_prefixes": [], "mesh_terms": [], "reason": "Clúster inexistente."}
    return {
        "icd10_prefixes": list(cluster.icd10_prefixes or []),
        "mesh_terms": normalize_mesh_list(cluster.mesh_terms),
        "reason": f"Derivado del clúster '{cluster.name}'.",
    }
