"""Datos de producto de una senal: forma farmaceutica, concentracion, marca, modelo.

RF-003 de la validacion del modulo 0: la bandeja mostraba solo el nombre de la
tecnologia. Estos datos llegan por tres vias, en este orden de confianza:

1. El conector estructurado (openFDA trae forma, via y marca).
2. La lectura con IA de la pagina (campos del item: dosage_form, strength,
   route, brand, model, manufacturer).
3. Reglas sobre el titulo y el resumen (este modulo), que solo completan lo
   que siga vacio.

Las reglas son conservadoras: prefieren dejar el campo vacio a inventarlo. Un
valor encontrado aqui es una sugerencia que el evaluador confirma al clasificar.
"""
from __future__ import annotations

import re

FIELDS = ("dosage_form", "strength", "route", "brand", "model", "manufacturer")
LIMITS = {"dosage_form": 200, "strength": 200, "route": 120, "brand": 200, "model": 200, "manufacturer": 300}

# Forma farmaceutica: termino del texto -> etiqueta en espanol. Las compuestas van
# primero para que "solution for injection" no se quede en "solution".
_FORMS: list[tuple[str, str]] = [
    (r"pre-?filled (?:syringe|pen)|jeringa prellenada|pluma precargada", "Jeringa o pluma prellenada"),
    (r"(?:solution|suspension|emulsion) for (?:injection|infusion)|soluci[oó]n inyectable|para infusi[oó]n", "Solución inyectable"),
    (r"powder for (?:solution|suspension|concentrate)|polvo para (?:soluci[oó]n|suspensi[oó]n)|liofilizado|lyophili[sz]ed", "Polvo para solución"),
    (r"concentrate for (?:solution|infusion)|concentrado para", "Concentrado para infusión"),
    (r"film-?coated tablets?|tabletas? recubiertas?|comprimidos? recubiertos?", "Tableta recubierta"),
    (r"extended-?release|prolonged-?release|liberaci[oó]n prolongada", "Liberación prolongada"),
    (r"\btablets?\b|\btabletas?\b|\bcomprimidos?\b", "Tableta"),
    (r"\bcapsules?\b|\bc[aá]psulas?\b", "Cápsula"),
    (r"oral solution|soluci[oó]n oral", "Solución oral"),
    (r"oral suspension|suspensi[oó]n oral", "Suspensión oral"),
    (r"\binhaler\b|\binhalador\b|inhalation powder|polvo para inhalaci[oó]n", "Inhalador"),
    (r"nasal spray|aerosol nasal", "Aerosol nasal"),
    (r"eye drops|ophthalmic solution|colirio|soluci[oó]n oft[aá]lmica", "Solución oftálmica"),
    (r"transdermal patch|parche transd[eé]rmico", "Parche transdérmico"),
    (r"\bcream\b|\bcrema\b", "Crema"),
    (r"\bointment\b|\bung[uü]ento\b", "Ungüento"),
    (r"\bgel\b", "Gel"),
    (r"\binjection\b|\binjectable\b|\binyecci[oó]n\b|\binyectable\b", "Inyectable"),
    (r"\binfusion\b|\binfusi[oó]n\b", "Infusión"),
    (r"\bvaccine\b|\bvacuna\b", "Vacuna"),
    # Genericas al final: solo si no hubo una forma mas especifica.
    (r"\bsolution\b|\bsoluci[oó]n\b", "Solución"),
    (r"\bsuspension\b|\bsuspensi[oó]n\b", "Suspensión"),
    (r"\bpowder\b|\bpolvo\b", "Polvo"),
    (r"\bspray\b|\baerosol\b", "Aerosol"),
    (r"\bliquid\b|\bl[ií]quido\b", "Líquido"),
]
_FORM_RES = [(re.compile(p, re.I), label) for p, label in _FORMS]

_ROUTES: list[tuple[str, str]] = [
    (r"\bsubcutaneous(?:ly)?\b|\bsubcut[aá]ne[ao]\b|\bs\.?c\.?\b(?= (?:injection|use|administration))", "Subcutánea"),
    (r"\bintravenous(?:ly)?\b|\bintravenos[ao]\b|\bi\.?v\.?\b(?= (?:infusion|injection|use))", "Intravenosa"),
    (r"\bintramuscular(?:ly)?\b", "Intramuscular"),
    (r"\bintravitreal\b", "Intravítrea"),
    (r"\bintrathecal\b|\bintratecal\b", "Intratecal"),
    (r"\boral(?:ly)?\b|\bv[ií]a oral\b", "Oral"),
    (r"\btopical(?:ly)?\b|\bt[oó]pic[ao]\b", "Tópica"),
    (r"\binhaled\b|\binhalad[ao]\b", "Inhalada"),
    (r"\bnasal\b", "Nasal"),
    (r"\bsublingual\b", "Sublingual"),
    (r"\btransdermal\b|\btransd[eé]rmica\b", "Transdérmica"),
    (r"\bophthalmic\b|\boft[aá]lmica\b", "Oftálmica"),
    # openFDA usa "INJECTION" como via cuando no precisa cual.
    (r"\binjection\b|\binyectable\b", "Parenteral"),
]
_ROUTE_RES = [(re.compile(p, re.I), label) for p, label in _ROUTES]

# Concentracion: "100 mg", "2,5 mg/ml", "10 mg/kg", "300 UI". Hasta dos valores.
_STRENGTH = re.compile(
    r"\b\d+(?:[.,]\d+)?\s?(?:mg|mcg|µg|ug|g|ml|mL|UI|IU|units?|unidades|%)(?:\s?/\s?(?:ml|mL|kg|dose|dosis|h|g))?\b",
    re.I,
)
# Modelo de dispositivo: "Model X100", "modelo ABC-12", "(model: 7Z-2)". El codigo
# debe llevar un digito para no tomar palabras ("model of care").
_MODEL = re.compile(r"\b(?:model|modelo)\s*[:#]?\s*((?=[A-Za-z0-9\-./]*\d)[A-Za-z0-9][A-Za-z0-9\-./]{1,30})", re.I)
# Titulo que combina varias tecnologias ("daratumumab, carfilzomib and
# dexamethasone"): la forma o la via no se pueden atribuir a una sola.
_COMBINATION = re.compile(r",|;|\+|\b(?:and|plus|combined|combination|y|versus|vs\.?)\b", re.I)
# Marca: palabra(s) seguidas de (R) o (TM), p. ej. "Keytruda®", "FreeStyle Libre™".
# Las palabras previas deben ser palabras (no codigos como "AMG334").
_BRAND = re.compile(r"((?:[A-Z][a-z][A-Za-z\-]*\s)?[A-Z][\w\-]*)\s?(?:®|™|\(R\)|\(TM\))")


# Palabras que preceden a una marca sin ser parte de ella ("The Altaviva®").
_LEADING_WORDS = {"the", "new", "a", "an", "el", "la", "los", "las", "nuevo", "nueva", "our", "su"}


def _first(patterns, text: str) -> str:
    for regex, label in patterns:
        if regex.search(text):
            return label
    return ""


def extract(*, title: str = "", summary: str = "", technology_type: str = "") -> dict:
    """Datos de producto inferidos del texto. Solo devuelve claves con valor.

    Forma, via y concentracion se leen solo del titulo y solo si nombra una
    tecnologia: en un resumen o en un ensayo combinado ("A, B and C") no se
    sabe a cual pertenecen. Marca y modelo se leen tambien del resumen.
    """
    title = title or ""
    text = f"{title}. {summary or ''}"
    kind = (technology_type or "").lower()
    out: dict[str, str] = {}
    is_device = kind in {"dispositivo", "digital"}
    if not is_device and not _COMBINATION.search(title):
        form = _first(_FORM_RES, title)
        if form:
            out["dosage_form"] = form
        route = _first(_ROUTE_RES, title)
        if route:
            out["route"] = route
        strengths = list(dict.fromkeys(m.group(0).strip() for m in _STRENGTH.finditer(title)))
        if strengths:
            out["strength"] = ", ".join(strengths[:2])
    if kind != "medicamento":
        model = _MODEL.search(text)
        if model:
            out["model"] = model.group(1).strip(" .,;")
    brand = _BRAND.search(text)
    if brand:
        words = brand.group(1).split()
        if len(words) > 1 and words[0].lower() in _LEADING_WORDS:
            words = words[1:]
        out["brand"] = " ".join(words)
    return out


def _to_spanish(text: str, patterns) -> str:
    """Forma o via en la etiqueta del sistema ("SOLUTION;SUBCUTANEOUS" -> "Subcutánea")."""
    return _first(patterns, text) or text


def clean(details: dict | None) -> dict:
    """Normaliza un dict de detalles (de la IA o de un conector): recorta y descarta vacios.

    Forma farmaceutica y via quedan con la etiqueta en espanol del sistema, venga
    el dato de openFDA ("INJECTION, SOLUTION"), de la IA o de las reglas.
    """
    out: dict[str, str] = {}
    for key in FIELDS:
        value = (details or {}).get(key)
        if value is None:
            continue
        text = re.sub(r"\s+", " ", str(value)).strip(" .,;")
        if not text or text.lower() in {"n/a", "na", "none", "null", "vacio", "desconocido", "unknown", "-"}:
            continue
        if key == "dosage_form":
            text = _to_spanish(text, _FORM_RES)
        elif key == "route":
            # Una via que no se reconoce (openFDA a veces pone la forma) se descarta.
            text = _first(_ROUTE_RES, text)
            if not text:
                continue
        out[key] = text[: LIMITS[key]]
    return out


def merge(primary: dict | None, fallback: dict | None) -> dict:
    """Une dos juegos de detalles; el primero manda campo a campo."""
    out = clean(fallback)
    out.update(clean(primary))
    return out


# Campo de detalles -> columna de Technology.
TECH_COLUMNS = {
    "dosage_form": "dosage_form",
    "strength": "strength",
    "route": "route",
    "brand": "brand",
    "model": "device_model",
    "manufacturer": "manufacturer",
}


def apply_to_technology(tech, details: dict | None) -> None:
    """Completa las columnas vacias de la tecnologia; nunca pisa lo diligenciado."""
    for key, value in clean(details).items():
        column = TECH_COLUMNS[key]
        if not (getattr(tech, column, "") or "").strip():
            setattr(tech, column, value[: LIMITS[key]])
