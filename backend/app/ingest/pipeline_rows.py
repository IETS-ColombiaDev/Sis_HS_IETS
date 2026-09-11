"""Filas de tablas de pipeline de fabricantes (Novartis, AstraZeneca, ...).

El rastreo HTML entrega cada fila de la tabla de pipeline como un texto plano
con todas las celdas concatenadas, p. ej.:

    "AMO959 AMO959 Prostate cancer Oncology: Solid Tumors Phase 1 DNA PK inhibitor Lead Indication"
    "AZD0754 prostate cancer AZD0754 - Phase I Close Mechanism: STEAP2 CAR-T
     Area under investigation:prostate cancer Molecule size: Large molecule"

Usar ese texto como nombre de la tecnologia rompe la ficha, la desduplicacion y
el tablero. Este modulo separa la fila en sus campos: identificador del producto
(codigo o nombre comercial con su DCI), indicacion, area terapeutica, fase,
mecanismo y rotulos auxiliares. La fila original nunca se descarta: quien llama
la conserva en el crudo para poder reconstruirla.

Si la fila no se parece a ninguno de los formatos conocidos, `parse_row`
devuelve None y el llamador deja el dato como estaba.
"""
from __future__ import annotations

import re

PARSER_VERSION = 1
# Prefijo con el que la fila original queda en `Finding.raw_content`.
ROW_PREFIX = "Fila original del pipeline: "

# Areas terapeuticas de las tablas de pipeline (Novartis las escribe como celda).
_AREAS = (
    r"Oncology: [A-Z][A-Za-z]+(?: [A-Z][A-Za-z]+)*",
    r"Cardiovascular, Renal and Metabolic",
    r"In-market Brands and Global Health",
    r"Global Health",
    r"Immunology",
    r"Neuroscience",
    r"Ophthalmology",
    r"Respiratory",
    r"Others?",
)
_AREA_RE = re.compile(r"\s(" + "|".join(_AREAS) + r")\s*$")
_PHASE_RE = re.compile(
    r"\b(Phase\s+(?:[1-4]|I{1,3}V?|IV)(?:\s*/\s*(?:[1-4]|I{1,3}V?|IV))?[ab]?|Registration|Submission|Filed)\b"
)
_CODE_RE = re.compile(r"^[A-Z]{2,6}-?\d{2,6}[A-Z0-9-]*$")
_TRADEMARK = "®™"
# Formato con rotulos (AstraZeneca y similares).
_LABELED_RE = re.compile(
    r"^(?P<head>.+?)\s+-\s+(?P<phase>Phase\s+[IVX0-9/]+[ab]?|LCM Projects|Registration|Filed|Submission)\s+"
    r"(?:Close\s+)?Mechanism:\s*(?P<mech>.+?)\s+Area under investigation:\s*(?P<ind>.+?)"
    r"(?:\s+Additional information:.*?)?(?:\s+First Major Market.*?)?\s+Molecule size:\s*(?P<size>.+?)"
    r"(?:\s+Status change:.*)?$",
    re.DOTALL,
)


def _clean(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "")).strip(" .;,-")


def _strip_marks(value: str) -> str:
    return value.translate({ord(c): None for c in _TRADEMARK}).strip()


def _looks_trial(token: str) -> bool:
    """Nombre de estudio o rotulo que sigue al producto: EvoPAR-Prostate02, SERENA-4, BaxHTN."""
    if any(ch.isdigit() for ch in token):
        return True
    if re.search(r"[a-z][A-Z]|[A-Z]{2,}[a-z]", token):
        return True
    return token.isupper() and len(token) >= 5


def _product_from_head(head: str) -> tuple[str, str]:
    """(nombre, dci) del segmento previo a la indicacion en el formato con rotulos."""
    head = _clean(head)
    if not head:
        return "", ""
    paren = re.match(r"^(.+?\(([^)]+)\))((?:\s+(?:\+|\+/-|/)\s*[a-z][\w-]*)*)", head)
    if paren:
        name = _clean(paren.group(1) + (paren.group(3) or ""))
        inner = paren.group(2).strip()
        generic_words = {"platform", "combination", "combinations", "formulation"}
        inn = inner if inner[:1].islower() and inner.lower() not in generic_words else ""
        return name, inn
    tokens = head.split()
    name_tokens = [tokens[0]]
    for tok in tokens[1:]:
        if _looks_trial(tok) and tok not in {"+", "+/-", "/"}:
            break
        name_tokens.append(tok)
    name = _clean(" ".join(name_tokens))
    inn = name if name[:1].islower() else ""
    return name, inn


def _parse_labeled(text: str) -> dict | None:
    m = _LABELED_RE.match(text)
    if not m:
        return None
    indication = _clean(m.group("ind"))
    head = m.group("head")
    # La fila repite: "{producto} {indicacion} {producto} [{estudio}]". Lo que va
    # despues de la indicacion es el producto con el nombre del estudio.
    if indication and indication in head:
        before, after = head.split(indication, 1)
        head = after.strip() or before.strip()
    name, inn = _product_from_head(head)
    if not name:
        return None
    phase = _clean(m.group("phase"))
    return {
        "name": name,
        "code": name if _CODE_RE.match(name) else "",
        "brand": "",
        "inn": inn,
        "indication": indication,
        "therapeutic_area": "",
        "phase": phase,
        "mechanism": _clean(m.group("mech")),
        "expected": "",
        "label": _clean(m.group("size")),
        "format": "rotulado",
    }


def _parse_cells(text: str) -> dict | None:
    """Formato de celdas sin rotulos (Novartis)."""
    phase_m = _PHASE_RE.search(text)
    if not phase_m:
        return None
    before = text[: phase_m.start()].strip()
    after = text[phase_m.end():].strip()
    tokens = before.split()
    if len(tokens) < 3 or not _CODE_RE.match(tokens[0]):
        return None
    code = tokens[0]
    area = ""
    area_m = _AREA_RE.search(" " + before)
    if area_m:
        area = area_m.group(1)
        before = before[: len(before) - len(area)].strip()
        tokens = before.split()
    brand = inn = ""
    rest = tokens[1:]
    if rest and rest[0] == code:
        rest = rest[1:]
    elif rest and any(ch in rest[0] for ch in _TRADEMARK):
        brand = _strip_marks(rest[0])
        rest = rest[1:]
    elif rest and (rest[0][:1].islower() or re.match(r"^\d+[A-Za-z]", rest[0])):
        inn = rest[0]
        rest = rest[1:]
    indication = _clean(" ".join(rest))
    expected = ""
    exp_m = re.match(r"^(≥\s*)?(20\d\d)\b", after)
    if exp_m:
        expected = _clean(exp_m.group(0))
        after = after[exp_m.end():].strip()
    label = ""
    lab_m = re.search(r"\s*\b((?:Lead|Supplementary|New)\s+Indication)\s*$", after)
    if lab_m:
        label = lab_m.group(1)
        after = after[: lab_m.start()].strip()
    if brand:
        name = f"{brand} ({code})"
    else:
        name = code
    return {
        "name": name,
        "code": code,
        "brand": brand,
        "inn": inn,
        "indication": indication,
        "therapeutic_area": area,
        "phase": _clean(phase_m.group(1)),
        "mechanism": _clean(after),
        "expected": expected,
        "label": label,
        "format": "celdas",
    }


def parse_row(text: str) -> dict | None:
    """Campos de una fila de pipeline, o None si no parece una."""
    value = _clean(text)
    if len(value) < 12:
        return None
    return _parse_labeled(value) or _parse_cells(value)


def is_pipeline_source(source) -> bool:
    """Solo las fuentes de pipeline de fabricantes pasan por el separador."""
    if source is None:
        return False
    category = (getattr(source, "category", "") or "").lower()
    title = (getattr(source, "title", "") or "").lower()
    url = (getattr(source, "url", "") or "").lower()
    return "fabricantes" in category or "pipeline" in title or "pipeline" in url


def compact_title(parsed: dict) -> str:
    """Titulo legible de la senal: producto, indicacion y fase."""
    parts = [parsed["name"]]
    if parsed.get("indication"):
        parts.append(parsed["indication"])
    title = " · ".join(parts)
    if parsed.get("phase"):
        title += f" ({parsed['phase']})"
    return title[:590]


def structured_summary(parsed: dict, source_title: str = "") -> str:
    bits = [f"Producto: {parsed['name']}"]
    if parsed.get("inn"):
        bits.append(f"DCI: {parsed['inn']}")
    for key, label in (
        ("indication", "Indicacion"),
        ("therapeutic_area", "Area terapeutica"),
        ("phase", "Fase"),
        ("expected", "Hito esperado"),
        ("mechanism", "Mecanismo"),
        ("label", "Nota"),
    ):
        if parsed.get(key):
            bits.append(f"{label}: {parsed[key]}")
    origin = f" Fila del pipeline de {source_title}." if source_title else ""
    return (". ".join(bits) + "." + origin)[:1500]


def apply_pipeline_fields(finding: Finding | None, tech: Technology | None, row: str, parsed: dict, source_title: str = "") -> bool:
    """Lleva cada parte de la fila a su campo. Devuelve True si algo cambio."""
    changed = False

    def put(obj, field, value):
        nonlocal changed
        if obj is not None and value is not None and getattr(obj, field) != value:
            setattr(obj, field, value)
            changed = True

    if finding is not None:
        put(finding, "title", compact_title(parsed))
        put(finding, "technology", parsed["name"][:400])
        put(finding, "phase", parsed.get("phase", "")[:120])
        put(finding, "therapeutic_area", (parsed.get("indication") or finding.therapeutic_area or "")[:300])
        put(finding, "summary", structured_summary(parsed, source_title))
        if ROW_PREFIX not in (finding.raw_content or ""):
            put(finding, "raw_content", (ROW_PREFIX + row + ("\n" + finding.raw_content if finding.raw_content else ""))[:8000])
    if tech is not None:
        put(tech, "commercial_name", parsed["name"][:400])
        if parsed.get("inn") and not (tech.inn_name or "").strip():
            put(tech, "inn_name", parsed["inn"][:400])
        if parsed.get("mechanism"):
            put(tech, "mechanism", parsed["mechanism"])
        if parsed.get("indication"):
            put(tech, "indication", parsed["indication"])
        put(tech, "development_phase", parsed.get("phase", "")[:120])
        put(tech, "summary", structured_summary(parsed, source_title))
        payload = dict(tech.raw_payload) if isinstance(tech.raw_payload, dict) else {}
        block = {"row": row, "parsed": parsed, "parser_version": PARSER_VERSION}
        if payload.get("pipeline") != block:
            payload["pipeline"] = block
            tech.raw_payload = payload
            changed = True
    return changed
