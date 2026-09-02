"""Desduplicacion difusa de tecnologias (RF09, fase 3 del plan).

La captura ya evita el duplicado exacto por `content_hash`, pero eso solo
detecta la misma pagina traida dos veces. La misma tecnologia llega con nombres
distintos segun la fuente ("Keytruda 100 mg", "pembrolizumab", "MK-3475"), y ese
es el duplicado que contamina el Listado Unico.

Criterios de diseno:

- **El identificador de ensayo manda.** Compartir un NCT no es parecerse: es ser
  el mismo desarrollo. Se trata como coincidencia determinista, no difusa, y no
  se somete al umbral.
- **Tres algoritmos, no uno.** La especificacion pide Levenshtein, Jaro-Winkler
  y token sorting porque cada uno cubre un error distinto: erratas, prefijos
  compartidos y palabras reordenadas. Se calculan los tres y se conserva el
  desglose, para que el evaluador vea *por que* se propuso la fusion.
- **El fabricante confirma o desmiente, no propone.** Dos moleculas homonimas de
  laboratorios distintos casi nunca son la misma tecnologia, pero un fabricante
  vacio no debe penalizar.
- **La fusion nunca es automatica.** El sistema propone; una persona confirma y
  queda en la bitacora. Es exigencia explicita del modulo 2.
"""
from __future__ import annotations

import re
import unicodedata

from rapidfuzz import fuzz
from rapidfuzz.distance import JaroWinkler
from sqlalchemy.orm import Session

from .methodology import get_param
from .models import Technology

# Formas farmaceuticas, dosis y presentaciones: describen el empaque, no la
# identidad de la tecnologia. Sin retirarlas, "Keytruda 100 mg vial" y
# "Keytruda" se parecen mucho menos de lo que realmente se parecen.
_DOSAGE = re.compile(
    r"\b\d+([.,]\d+)?\s*(mg|mcg|ug|g|kg|ml|l|ui|iu|%|mg/ml|mg/kg|unidades?)\b",
    re.IGNORECASE,
)
_NOISE_WORDS = {
    "tableta", "tabletas", "capsula", "capsulas", "comprimido", "comprimidos",
    "solucion", "suspension", "inyectable", "vial", "ampolla", "ampollas",
    "jeringa", "prellenada", "polvo", "liofilizado", "concentrado", "crema",
    "gel", "parche", "spray", "aerosol", "gotas", "jarabe", "sobre", "sobres",
    "oral", "intravenosa", "subcutanea", "topica", "recubierta", "liberacion",
    "prolongada", "kit", "caja", "frasco", "unidad", "unidades",
}
# Sales y esteres: el mismo principio activo con distinto contraion.
_SALT_WORDS = {
    "clorhidrato", "hidrocloruro", "sodico", "sodica", "potasico", "potasica",
    "calcico", "calcica", "sulfato", "fosfato", "acetato", "maleato", "tartrato",
    "besilato", "mesilato", "succinato", "citrato", "fumarato", "bromhidrato",
    "dihidratado", "monohidratado", "anhidro", "de", "del", "la", "el", "y",
}
_NON_ALNUM = re.compile(r"[^a-z0-9\s]+")
_SPACES = re.compile(r"\s+")


def normalize_name(value: str) -> str:
    """Deja el nombre en su nucleo identificable: sin tildes, dosis ni empaque."""
    if not value:
        return ""
    text = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    text = text.lower()
    text = _DOSAGE.sub(" ", text)
    text = _NON_ALNUM.sub(" ", text)
    tokens = [t for t in _SPACES.split(text) if t and t not in _NOISE_WORDS]
    core = [t for t in tokens if t not in _SALT_WORDS]
    # Si al quitar sales no queda nada, el nombre era solo una sal: se conserva.
    return " ".join(core or tokens).strip()


def normalize_nct(value: str) -> str:
    text = (value or "").strip().upper().replace(" ", "")
    return text if text.startswith("NCT") else ""


def nct_set(tech: Technology) -> set[str]:
    raw = tech.nct_ids or []
    if isinstance(raw, str):
        raw = [raw]
    return {n for n in (normalize_nct(str(x)) for x in raw) if n}


def _triple_similarity(a: str, b: str) -> dict[str, float]:
    """Los tres algoritmos que pide la especificacion, por separado.

    Se conservan desglosados y no colapsados en un numero para que la propuesta
    de fusion sea explicable ante quien debe confirmarla.
    """
    if not a or not b:
        return {"levenshtein": 0.0, "jaro_winkler": 0.0, "token_sort": 0.0}
    return {
        "levenshtein": round(fuzz.ratio(a, b), 2),
        "jaro_winkler": round(JaroWinkler.normalized_similarity(a, b) * 100, 2),
        "token_sort": round(fuzz.token_sort_ratio(a, b), 2),
    }


def _blend(parts: dict[str, float]) -> float:
    """Mezcla ponderada de los tres algoritmos.

    Token sorting pesa mas porque el desorden de palabras es el error mas
    frecuente entre fuentes ("pembrolizumab Keytruda" frente a "Keytruda
    pembrolizumab"). Jaro-Winkler pesa por encima de Levenshtein porque premia
    el prefijo compartido, que es como se comportan las familias de principios
    activos (-mab, -tinib).
    """
    return round(
        0.25 * parts["levenshtein"] + 0.35 * parts["jaro_winkler"] + 0.40 * parts["token_sort"],
        2,
    )


# Cortes de la señal de fabricante, calibrados sobre razones sociales reales:
#
#     MSD / MSD Colombia SA .................. 100   misma casa
#     Novo Nordisk / Novo Nordisk Colombia ... 100   misma casa
#     Janssen Cilag / Johnson y Johnson ....... 40   distintas
#     Laboratorios Andinos / Pharma Global .... 36   distintas
#     Merck Sharp Dohme / MSD Colombia ........ 34   MISMA casa, por sigla
#     Bayer / Sanofi Aventis .................. 21   distintas
#     Roche / Pfizer .......................... 18   distintas
#
# La franja intermedia es ambigua: una sigla y su desarrollo puntuan igual que
# dos empresas sin relacion, y ninguna metrica de cadenas resuelve eso. Por eso
# el fabricante solo mueve el puntaje en los extremos, donde la evidencia es
# inequivoca, y calla en el medio en lugar de inventar una conclusion.
MANUFACTURER_SAME = 85
MANUFACTURER_DIFFERENT = 25


def manufacturer_similarity(a: str, b: str) -> float:
    """Parecido entre razones sociales.

    Se usa `token_set_ratio` y no la mezcla de los tres algoritmos porque el
    error tipico aqui no es la errata sino el sufijo corporativo: "MSD" y "MSD
    Colombia SA" son la misma casa y solo una metrica por conjunto de palabras
    lo reconoce.
    """
    left, right = normalize_name(a), normalize_name(b)
    if not left or not right:
        return 0.0
    return round(fuzz.token_set_ratio(left, right), 2)


def compare(a: Technology, b: Technology) -> dict:
    """Compara dos tecnologias y devuelve puntaje y evidencia del parecido."""
    shared_nct = nct_set(a) & nct_set(b)
    if shared_nct:
        return {
            "score": 100.0,
            "decisive": True,
            "matched_on": ["nct"],
            "shared_nct": sorted(shared_nct),
            "detail": {"nct": sorted(shared_nct)},
        }

    a_names = [n for n in (normalize_name(a.commercial_name), normalize_name(a.inn_name)) if n]
    b_names = [n for n in (normalize_name(b.commercial_name), normalize_name(b.inn_name)) if n]
    if not a_names or not b_names:
        return {"score": 0.0, "decisive": False, "matched_on": [], "detail": {}}

    # Se cruzan comercial y DCI porque las fuentes no son consistentes en cual
    # de los dos campo ponen la marca.
    best_parts: dict[str, float] = {}
    best = -1.0
    for left in a_names:
        for right in b_names:
            parts = _triple_similarity(left, right)
            blended = _blend(parts)
            if blended > best:
                best, best_parts = blended, parts

    detail: dict = {"nombre": best_parts}
    matched_on = ["nombre"]

    score = best
    if a.manufacturer and b.manufacturer:
        fab = manufacturer_similarity(a.manufacturer, b.manufacturer)
        detail["fabricante"] = {"token_set": fab}
        if fab >= MANUFACTURER_SAME:
            score = min(100.0, score + 4)
            matched_on.append("fabricante")
        elif fab < MANUFACTURER_DIFFERENT:
            score = max(0.0, score - 12)
            matched_on.append("fabricante_discrepante")

    if a.atc_code and b.atc_code:
        detail["atc"] = {"a": a.atc_code, "b": b.atc_code}
        if a.atc_code.strip().upper() == b.atc_code.strip().upper():
            score = min(100.0, score + 3)
            matched_on.append("atc")

    return {
        "score": round(score, 2),
        "decisive": False,
        "matched_on": matched_on,
        "detail": detail,
    }


def threshold(db: Session) -> int:
    return int(get_param(db, "dedup.similarity_threshold", 85) or 85)


def _candidates(db: Session, cycle_id: int | None) -> list[Technology]:
    """Universo de comparacion: lo vivo, nunca lo ya fusionado ni lo excluido."""
    query = db.query(Technology).filter(Technology.merged_into_id.is_(None))
    if cycle_id is not None:
        from .models import CycleTechnology

        ids = [
            row.technology_id
            for row in db.query(CycleTechnology.technology_id)
            .filter(
                CycleTechnology.cycle_id == cycle_id,
                CycleTechnology.status != "excluida",
            )
            .all()
        ]
        if not ids:
            return []
        query = query.filter(Technology.id.in_(ids))
    return query.order_by(Technology.id).all()


def _blocking_key(tech: Technology) -> str:
    """Primera letra del nucleo del nombre, para no comparar todos contra todos.

    Sin bloqueo, el barrido es cuadratico. Se agrupa por inicial porque
    Jaro-Winkler ya presupone prefijo compartido, asi que descartar por inicial
    distinta no pierde candidatos que el umbral fuera a aceptar por nombre.
    """
    for value in (tech.inn_name, tech.commercial_name):
        core = normalize_name(value)
        if core:
            return core[0]
    return ""


def find_duplicates(
    db: Session, *, cycle_id: int | None = None, limit: int = 200
) -> list[dict]:
    """Barre el acervo y devuelve los pares que superan el umbral vigente."""
    minimum = threshold(db)
    techs = _candidates(db, cycle_id)

    buckets: dict[str, list[Technology]] = {}
    by_nct: dict[str, list[Technology]] = {}
    for tech in techs:
        buckets.setdefault(_blocking_key(tech), []).append(tech)
        for nct in nct_set(tech):
            by_nct.setdefault(nct, []).append(tech)

    seen: set[tuple[int, int]] = set()
    pairs: list[dict] = []

    def consider(a: Technology, b: Technology) -> None:
        key = (min(a.id, b.id), max(a.id, b.id))
        if key in seen:
            return
        seen.add(key)
        result = compare(a, b)
        if result["decisive"] or result["score"] >= minimum:
            pairs.append(
                {
                    "technology_a_id": key[0],
                    "technology_b_id": key[1],
                    "score": result["score"],
                    "decisive": result["decisive"],
                    "matched_on": result["matched_on"],
                    "detail": result["detail"],
                }
            )

    # Los que comparten ensayo se emparejan siempre, sin pasar por el bloqueo.
    for group in by_nct.values():
        for i, a in enumerate(group):
            for b in group[i + 1 :]:
                consider(a, b)

    for group in buckets.values():
        for i, a in enumerate(group):
            for b in group[i + 1 :]:
                consider(a, b)

    pairs.sort(key=lambda p: (-p["score"], p["technology_a_id"]))
    return pairs[:limit]
