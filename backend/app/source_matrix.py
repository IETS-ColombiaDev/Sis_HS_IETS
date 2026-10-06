"""Matriz institucional de fuentes proactivas del escaneo de horizonte (EH).

Origen: el Excel "FUENTES DE INFORMACION PROACTIVA EH" (hoja "MATRIZ FI EH",
columnas A-R, y hoja "Criterios de busqueda"). Este modulo:

- lee el Excel ubicando las columnas por su encabezado (tolera columnas movidas);
- normaliza nivel de fuente, prioridad, tipos de tecnologia, URLs y frecuencia;
- asocia cada fila a un codigo del catalogo D-06 o le asigna uno nuevo;
- arma el perfil de recorrido de cada fuente (URLs de entrada, ruta de acceso,
  que consultar, restricciones) que usan el rastreador y la IA.

El catalogo lee el JSON generado (app/data/matriz_fuentes_eh.json), asi que en
produccion no hace falta el Excel. El panel admin puede volver a subirlo.

Regenerar el JSON desde backend/:
    .\\.venv\\Scripts\\python.exe -m app.source_matrix "..\\FUENTES DE INFORMACION PROACTIVA EH (1).xlsx"
"""
from __future__ import annotations

import io
import json
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

DATA_FILE = Path(__file__).resolve().parent / "data" / "matriz_fuentes_eh.json"
MATRIX_SHEET_HINT = "matriz"
TERMS_SHEET_HINT = "criterio"

SOURCE_LEVELS = ("primaria", "secundaria", "terciaria", "por_definir")
PRIORITY_LEVELS = ("alta", "media", "baja", "revisar")
TECH_CODES = ("MED", "DM", "BIOM", "IA", "SD", "MT")
ORIGINS = ("FVEH042025", "AGREGADA")

# Encabezado normalizado -> campo. El orden importa: los mas especificos primero
# ("URL / sitio a consultar" contiene "consultar", igual que "Informacion a consultar").
_HEADER_RULES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("consult_raw", ("sitio a consultar",)),
    ("methodology_raw", ("documentos metdologicos", "documentos metodologicos", "informacion general y documentos")),
    ("consult_info", ("informacion a consultar",)),
    ("entity_label", ("tipo de entidad",)),
    ("source_level_raw", ("nivel de fuente",)),
    ("origin", ("verificada manual", "fuentes verificada")),
    ("name", ("sitio / organizacion", "sitio/organizacion", "organizacion")),
    ("country", ("pais",)),
    ("tech_types_raw", ("tipo de tecnologia",)),
    ("material_type", ("tipo de material",)),
    ("access_path", ("ruta de acceso",)),
    ("observations", ("observaciones",)),
    ("publication_structure", ("estructura de publicacion",)),
    ("format", ("formato",)),
    ("frequency_raw", ("frecuencia",)),
    ("language", ("idioma",)),
    ("interface", ("interfaz",)),
    ("restrictions", ("restricciones",)),
)
# Posicion por defecto (A-R) si el encabezado no se reconoce.
_DEFAULT_COLUMNS = (
    "entity_label", "source_level_raw", "origin", "name", "country", "tech_types_raw",
    "consult_raw", "methodology_raw", "material_type", "access_path", "consult_info",
    "observations", "publication_structure", "format", "frequency_raw", "language",
    "interface", "restrictions",
)

_TRACKING = {"utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"}
_URL_RE = re.compile(r"https?://[^\s|<>\"']+", re.I)
_EMPTY_VALUES = {"", "no aplica", "n/a", "na", "none", "-", "no disponible listado o buscadores"}

# Categorias de la hoja "Criterios de busqueda" -> tipo de tecnologia de la matriz.
TERM_CATEGORY_TECH = {
    "dispositivos implantables": "DM",
    "dispositivos medicos": "DM",
    "equipos biomedicos": "DM",
    "dispositivos de monitoreo": "DM",
    "tecnologias intervencionistas": "DM",
    "ia clinica": "IA",
    "samd": "SD",
    "telemedicina": "SD",
    "mhealth": "SD",
    "wearables": "SD",
    "medicamentos": "MED",
}

# --------------------------------------------------------------------------- #
#  Fila de la matriz -> codigo(s) del catalogo
# --------------------------------------------------------------------------- #
# El primer codigo recibe el perfil completo (URLs de entrada incluidas); los
# demas comparten la clasificacion (nivel, prioridad, tipos) porque son
# sub-servicios de la misma organizacion en el catalogo D-06.
MATRIX_CODE_RULES: tuple[tuple[str, tuple[str, ...]], ...] = (
    (r"^abbott", ("FP-MF-16",)),
    (r"^abbvie", ("FP-MF-01",)),
    (r"^amgen", ("FP-MF-02",)),
    (r"^astrazeneca", ("FP-MF-03",)),
    (r"^baxter", ("FP-MF-17",)),
    (r"^bayer", ("FP-MF-04",)),
    (r"^bd\b|becton", ("FP-MF-18",)),
    (r"^boehringer", ("FP-MF-05",)),
    (r"^boston scientific", ("FP-MF-19",)),
    (r"^br[iy]stol", ("FP-MF-06",)),
    (r"^ge health", ("FP-MF-20",)),
    (r"^gilead", ("FP-MF-07",)),
    (r"^gsk", ("FP-MF-08",)),
    (r"^johnson", ("FP-MF-09",)),
    (r"^lilly", ("FP-MF-10",)),
    (r"^medtronic", ("FP-MF-21",)),
    (r"^merck", ("FP-MF-11",)),
    (r"^mindray", ("FP-MF-25",)),
    (r"^novartis", ("FP-MF-12",)),
    (r"^pfizer", ("FP-MF-13",)),
    (r"^philips", ("FP-MF-22",)),
    (r"^roche", ("FP-MF-14",)),
    (r"^sanofi", ("FP-MF-15",)),
    (r"^siemens", ("FP-MF-23",)),
    (r"^stryker", ("FP-MF-24",)),
    (r"^nihon", ("FP-MF-26",)),
    (r"^fda\b", ("FP-RG-01", "FP-RG-02", "FP-RG-03")),
    (r"^ema\b", ("FP-RG-04", "FP-RG-05")),
    (r"^european commission", ("FP-RG-14",)),
    (r"^mhra", ("FP-RG-09",)),
    (r"^health canada", ("FP-RG-06", "FP-RG-07")),
    (r"^tga\b", ("FP-RG-08",)),
    (r"^pmda", ("FP-RG-10",)),
    (r"^nmpa", ("FP-RG-11",)),
    (r"^mfds", ("FP-RG-12",)),
    (r"^swissmedic", ("FP-RG-13",)),
    (r"^cdsco", ("FP-RG-15",)),
    (r"^aifa", ("FP-RG-16",)),
    (r"^redets", ("FP-HT-13",)),
    (r"^ace\b", ("FP-HT-04",)),
    (r"^ahrq", ("FP-HT-12",)),
    (r"cda-amc|cadth", ("FP-HT-03",)),
    (r"^eunethta", ("FP-HT-15", "FP-HT-07")),
    (r"^euroscan", ("FP-HT-05",)),
    (r"^inahta", ("FP-HT-06",)),
    (r"^iqwig", ("FP-HT-10",)),
    (r"^kce\b", ("FP-HT-11",)),
    (r"^nhs\b", ("FP-HT-09",)),
    (r"^nice\b", ("FP-HT-08",)),
    (r"^nihr\b", ("FP-HT-02", "FP-CT-04")),
    (r"^pcori", ("FP-HT-01",)),
    (r"^who\s*[-–]\s*world health", ("FP-LI-02",)),
    (r"^pubmed", ("FP-LI-01",)),
    (r"^clinical ?trials\.gov", ("FP-CT-01",)),
    (r"ictrp", ("FP-CT-02",)),
    (r"^isrctn", ("FP-CT-05",)),
    (r"^anzctr", ("FP-CT-06",)),
    (r"^chictr", ("FP-CT-07",)),
    (r"^ctis\b", ("FP-CT-03",)),
    (r"^drks", ("FP-CT-08",)),
    (r"^pactr", ("FP-CT-09",)),
    (r"^rebec", ("FP-CT-10",)),
    (r"^ctri\b", ("FP-CT-11",)),
    (r"^jprn", ("FP-CT-12",)),
    (r"^irct\b", ("FP-CT-13",)),
    (r"^cris\b", ("FP-CT-14",)),
    (r"^cochrane", ("FP-CT-15",)),
    (r"^scopus", ("FP-LI-03",)),
    (r"^ieee", ("FP-LI-04",)),
    (r"^embase", ("FP-LI-05",)),
    (r"^patentscope", ("FP-LI-06",)),
    (r"^medical device netw", ("FP-LI-07",)),
    (r"^medline", ("FP-LI-08",)),
    (r"^ihsi", ("FP-HT-14",)),
    (r"^medical data", ("FP-NW-01",)),
    (r"^science daily", ("FP-NW-02",)),
    (r"^reuters", ("FP-NW-03",)),
    (r"^ivanhoe", ("FP-NW-04",)),
    (r"^medscape", ("FP-NW-05",)),
    (r"^med device online", ("FP-NW-06",)),
    (r"^doc ?guide", ("FP-NW-07",)),
    (r"^cnn\b", ("FP-NW-08",)),
    (r"new york times", ("FP-NW-09",)),
    (r"\(jama\)|^jama\b", ("FP-NW-10",)),
    (r"^diario medico", ("FP-NW-11",)),
    (r"^noticias medicas", ("FP-NW-12",)),
    (r"^lancet", ("FP-NW-13",)),
    (r"nejm|new england journal", ("FP-NW-14",)),
    (r"^bmj\b", ("FP-NW-15",)),
)


# --------------------------------------------------------------------------- #
#  Normalizacion
# --------------------------------------------------------------------------- #
def fold(text: str) -> str:
    """Minusculas sin tildes ni espacios repetidos (para comparar)."""
    raw = unicodedata.normalize("NFKD", str(text or ""))
    raw = "".join(ch for ch in raw if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", raw).strip().lower()


def clean_text(value) -> str:
    """Texto de celda: lineas recortadas, sin vacias ni 'No aplica'."""
    if value is None:
        return ""
    lines = [re.sub(r"[ \t]+", " ", ln).strip() for ln in str(value).replace("\r", "").split("\n")]
    text = "\n".join(ln for ln in lines if ln)
    return "" if fold(text) in _EMPTY_VALUES else text


def clean_url(url: str) -> str:
    """URL sin parametros de rastreo ni fragmento, con esquema y host en minuscula."""
    raw = (url or "").strip().rstrip(".,;:)]")
    if not raw.lower().startswith(("http://", "https://")):
        return ""
    parts = urlsplit(raw)
    if not parts.netloc:
        return ""
    query = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if k.lower() not in _TRACKING]
    path = parts.path or "/"
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), path, urlencode(query), ""))


def _host(url: str) -> str:
    return (urlsplit(url).netloc or "").lower().removeprefix("www.")


def extract_urls(text: str, link: str = "") -> list[str]:
    """URLs de una celda (texto + hipervinculo), sin duplicados ni portadas redundantes."""
    found: list[str] = []
    for match in _URL_RE.findall(text or ""):
        url = clean_url(match)
        if url and url not in found:
            found.append(url)
    extra = clean_url(link)
    if extra and extra not in found:
        bare = urlsplit(extra).path in {"", "/"} and not urlsplit(extra).query
        # Un hipervinculo a la portada del mismo sitio no agrega una ruta nueva.
        if not (bare and any(_host(u) == _host(extra) for u in found)):
            found.append(extra)
    return found


def parse_tech_types(raw: str) -> list[str]:
    out: list[str] = []
    for token in re.findall(r"[A-Za-z]+", raw or ""):
        code = token.upper()
        if code == "SAMD":
            code = "SD"
        if code in TECH_CODES and code not in out:
            out.append(code)
    return out


def parse_source_level(raw: str) -> str:
    text = fold(raw)
    for level in ("primaria", "secundaria", "terciaria"):
        if text.startswith(level):
            return level
    for level in ("primaria", "secundaria", "terciaria"):
        if re.search(rf"\b{level}\b", text):
            return level
    return "por_definir"


def parse_priority(observations: str) -> str:
    """Prioridad declarada en Observaciones (columna L). Vacio si la matriz no la fija."""
    text = fold(observations)
    if not text:
        return ""
    if re.search(r"\balta aplicabilidad", text):
        return "alta"
    if re.search(r"\bmedia aplicabilidad", text):
        return "media"
    if re.search(r"\bbaja aplicabilidad", text):
        return "baja"
    if re.search(r"(revisar|verificar) pertinencia|no permite acceso", text):
        return "revisar"
    return ""


def parse_frequency(raw: str) -> str:
    text = fold(raw)
    if text.startswith("diari"):
        return "diaria"
    if text.startswith("semanal"):
        return "semanal"
    if text.startswith("mensual"):
        return "mensual"
    if text.startswith("trimestral"):
        return "trimestral"
    return ""


def code_for_name(name: str) -> tuple[str, ...]:
    text = fold(name)
    for pattern, codes in MATRIX_CODE_RULES:
        if re.search(pattern, text):
            return codes
    return ()


# --------------------------------------------------------------------------- #
#  Lectura del Excel
# --------------------------------------------------------------------------- #
def _map_headers(values: list) -> dict[int, str]:
    mapping: dict[int, str] = {}
    used: set[str] = set()
    for idx, value in enumerate(values):
        head = fold(value)
        if not head:
            continue
        for field, needles in _HEADER_RULES:
            if field in used:
                continue
            if any(n in head for n in needles):
                mapping[idx] = field
                used.add(field)
                break
    if "name" not in used:
        return {i: f for i, f in enumerate(_DEFAULT_COLUMNS)}
    return mapping


def _cell_link(cell) -> str:
    try:
        return (cell.hyperlink.target or "") if cell.hyperlink else ""
    except Exception:  # noqa: BLE001
        return ""


def _parse_matrix_sheet(ws) -> list[dict]:
    header_row = None
    for r in range(1, min(ws.max_row, 8) + 1):
        values = [c.value for c in ws[r]]
        if any("tipo de entidad" in fold(v) for v in values if v):
            header_row = r
            break
    if header_row is None:
        raise ValueError("No se encontró el encabezado 'Tipo de Entidad' en la hoja de la matriz.")
    mapping = _map_headers([c.value for c in ws[header_row]])
    rows: list[dict] = []
    for r in range(header_row + 1, ws.max_row + 1):
        cells = ws[r]
        raw: dict[str, str] = {}
        links: dict[str, str] = {}
        for idx, field in mapping.items():
            if idx >= len(cells):
                continue
            cell = cells[idx]
            raw[field] = "" if cell.value is None else str(cell.value)
            links[field] = _cell_link(cell)
        name = " / ".join(ln.strip() for ln in (raw.get("name") or "").splitlines() if ln.strip())
        if not name:
            continue
        rows.append(normalize_row(raw, links, excel_row=r, name=name))
    return rows


def normalize_row(raw: dict, links: dict | None = None, *, excel_row: int = 0, name: str = "") -> dict:
    links = links or {}
    consult = extract_urls(raw.get("consult_raw", ""), links.get("consult_raw", ""))
    methodology = extract_urls(raw.get("methodology_raw", ""), links.get("methodology_raw", ""))
    observations = clean_text(raw.get("observations"))
    codes = code_for_name(name or raw.get("name", ""))
    origin = fold(raw.get("origin")).upper()
    return {
        "excel_row": excel_row,
        "matrix_ref": f"MATRIZ FI EH fila {excel_row}" if excel_row else "MATRIZ FI EH",
        "codes": list(codes),
        "name": name or clean_text(raw.get("name")),
        "entity_label": clean_text(raw.get("entity_label")),
        "source_level": parse_source_level(raw.get("source_level_raw", "")),
        "source_level_raw": clean_text(raw.get("source_level_raw")),
        "origin": origin if origin in ORIGINS else origin[:40],
        "country": clean_text(raw.get("country")),
        "tech_types": parse_tech_types(raw.get("tech_types_raw", "")),
        "tech_types_raw": clean_text(raw.get("tech_types_raw")),
        "consult_urls": consult,
        "methodology_urls": methodology,
        "consult_note": "" if consult else clean_text(raw.get("consult_raw")),
        "methodology_note": "" if methodology else clean_text(raw.get("methodology_raw")),
        "material_type": clean_text(raw.get("material_type")),
        "access_path": clean_text(raw.get("access_path")),
        "consult_info": clean_text(raw.get("consult_info")),
        "observations": observations,
        "priority_level": parse_priority(observations),
        "publication_structure": clean_text(raw.get("publication_structure")),
        "format": clean_text(raw.get("format")),
        "frequency": parse_frequency(raw.get("frequency_raw", "")),
        "frequency_raw": clean_text(raw.get("frequency_raw")),
        "language": clean_text(raw.get("language")),
        "interface": clean_text(raw.get("interface")),
        "restrictions": clean_text(raw.get("restrictions")),
    }


def _parse_terms_sheet(ws) -> list[dict]:
    out: list[dict] = []
    for row in ws.iter_rows(values_only=True):
        if not row or not row[0]:
            continue
        category = clean_text(row[0])
        if fold(category).startswith("tipo de tecnologia"):
            continue
        terms_raw = clean_text(row[1] if len(row) > 1 else "")
        terms = [t.strip() for t in re.split(r"[,;\n]", terms_raw) if t.strip()]
        out.append(
            {
                "category": category,
                "tech_type": TERM_CATEGORY_TECH.get(fold(category), "MT"),
                "terms": terms,
            }
        )
    return out


def parse_workbook(source: str | Path | bytes) -> dict:
    """Lee el Excel de la matriz y devuelve filas normalizadas + criterios de busqueda."""
    import openpyxl

    handle = io.BytesIO(source) if isinstance(source, (bytes, bytearray)) else source
    try:
        wb = openpyxl.load_workbook(handle, data_only=True)
    except Exception as exc:  # noqa: BLE001
        raise ValueError(f"No se pudo abrir el Excel de la matriz: {exc}") from exc
    matrix_ws = next((ws for ws in wb.worksheets if MATRIX_SHEET_HINT in fold(ws.title)), wb.worksheets[0])
    terms_ws = next((ws for ws in wb.worksheets if TERMS_SHEET_HINT in fold(ws.title)), None)
    rows = _parse_matrix_sheet(matrix_ws)
    if not rows:
        raise ValueError("La hoja de la matriz no tiene filas con 'Sitio / organización'.")
    return {
        "sheet": matrix_ws.title,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "rows": rows,
        "search_terms": _parse_terms_sheet(terms_ws) if terms_ws is not None else [],
    }


# --------------------------------------------------------------------------- #
#  JSON empaquetado y perfil por fuente
# --------------------------------------------------------------------------- #
_cache: dict | None = None


def load_matrix() -> dict:
    """Matriz empaquetada. Si falta el archivo, una matriz vacia (el catalogo sigue valido)."""
    global _cache
    if _cache is None:
        try:
            _cache = json.loads(Path(DATA_FILE).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            _cache = {"rows": [], "search_terms": []}
    return _cache


def rows_by_code(matrix: dict | None = None) -> dict[str, tuple[dict, bool]]:
    """codigo -> (fila, es_codigo_principal)."""
    out: dict[str, tuple[dict, bool]] = {}
    for row in (matrix or load_matrix()).get("rows", []):
        for idx, code in enumerate(row.get("codes") or []):
            if code not in out or idx == 0:
                out[code] = (row, idx == 0)
    return out


def entry_urls_for(row: dict) -> list[str]:
    """URLs a recorrer: las de consulta (G); si no hay, las generales (H)."""
    return list(row.get("consult_urls") or row.get("methodology_urls") or [])


def profile_fields(row: dict, *, primary: bool = True) -> dict:
    """Campos del modelo Source que aporta una fila de la matriz."""
    fields = {
        "source_level": row.get("source_level") or "por_definir",
        "priority_level": row.get("priority_level") or "",
        "tech_types": list(row.get("tech_types") or []),
        "matrix_ref": row.get("matrix_ref") or "",
        "matrix_origin": row.get("origin") or "",
    }
    if primary:
        fields.update(
            {
                "entry_urls": entry_urls_for(row),
                "reference_urls": list(row.get("methodology_urls") or []),
                "material_type": row.get("material_type") or "",
                "access_path": row.get("access_path") or "",
                "consult_info": row.get("consult_info") or "",
                "observations": row.get("observations") or "",
                "usage_restrictions": row.get("restrictions") or "",
            }
        )
    return fields


def write_data_file(parsed: dict, path: Path | None = None) -> Path:
    path = path or DATA_FILE
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(parsed, ensure_ascii=False, indent=1), encoding="utf-8")
    global _cache
    _cache = None
    return path


def main(argv: list[str] | None = None) -> int:
    args = list(argv if argv is not None else sys.argv[1:])
    if not args:
        print("Uso: python -m app.source_matrix <ruta del Excel>")
        return 2
    parsed = parse_workbook(Path(args[0]))
    unmapped = [r["name"] for r in parsed["rows"] if not r["codes"]]
    path = write_data_file(parsed)
    print(f"{len(parsed['rows'])} filas, {len(parsed['search_terms'])} criterios -> {path}")
    if unmapped:
        print("Sin codigo de catalogo:", "; ".join(unmapped))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
