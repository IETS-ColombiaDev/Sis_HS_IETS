"""Integracion con Gemini (Google Generative AI).

- Deteccion automatica del mejor modelo disponible que soporte generateContent.
- Generacion de recomendaciones de adopcion para Colombia.
- Chat conversacional (RAG) sobre la informacion del sistema.
- Degradacion elegante: si no hay API key, entrega respuestas basadas en la BD.
"""
from __future__ import annotations

import threading

from .config import settings

try:  # la libreria puede no estar instalada en algunos entornos
    import google.generativeai as genai

    _GENAI_AVAILABLE = True
except Exception:  # noqa: BLE001
    genai = None  # type: ignore
    _GENAI_AVAILABLE = False

# Orden de preferencia (de mas capaz/reciente a menos). Se elige el primero disponible.
_MODEL_PREFERENCE = [
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-2.0-flash-001",
    "gemini-1.5-pro",
    "gemini-1.5-flash",
]

_lock = threading.Lock()
_configured = False
_resolved_model: str | None = None

# Configuracion en tiempo de ejecucion (puede sobreescribir la del entorno / .env).
# Se inicializa con los valores del entorno y puede actualizarse desde el panel de
# configuracion (persistido en la BD via AppMeta).
_runtime_api_key: str = settings.gemini_api_key or ""
_runtime_model: str = settings.gemini_model or ""


def configure_runtime(api_key: str | None = None, model: str | None = None) -> None:
    """Actualiza la API key / modelo en caliente y reinicia el estado de configuracion."""
    global _runtime_api_key, _runtime_model, _configured, _resolved_model
    with _lock:
        if api_key is not None:
            _runtime_api_key = (api_key or "").strip()
        if model is not None:
            _runtime_model = (model or "").strip()
        _configured = False
        _resolved_model = None


def get_api_key() -> str:
    return _runtime_api_key


def has_key() -> bool:
    return bool(_runtime_api_key)


def is_enabled() -> bool:
    return _GENAI_AVAILABLE and bool(_runtime_api_key)


def _ensure_configured() -> None:
    global _configured
    if _configured:
        return
    with _lock:
        if _configured:
            return
        if is_enabled():
            genai.configure(api_key=_runtime_api_key)
        _configured = True


def list_available_models() -> list[str]:
    """Lista los modelos que soportan generateContent con la API key actual."""
    if not is_enabled():
        return []
    _ensure_configured()
    try:
        out: list[str] = []
        for m in genai.list_models():
            methods = getattr(m, "supported_generation_methods", []) or []
            if "generateContent" in methods:
                out.append(m.name.split("/")[-1])
        return sorted(set(out))
    except Exception:  # noqa: BLE001
        return []


def test_connection(api_key: str | None = None) -> dict:
    """Prueba la conexion con Gemini. Si se pasa api_key, prueba con esa (sin persistir)."""
    if not _GENAI_AVAILABLE:
        return {"ok": False, "message": "La libreria google-generativeai no esta instalada en el backend.", "model": ""}
    key = (api_key or _runtime_api_key or "").strip()
    if not key:
        return {"ok": False, "message": "No hay API key configurada. Ingrese un token de Gemini.", "model": ""}
    try:
        genai.configure(api_key=key)
        models = []
        for m in genai.list_models():
            methods = getattr(m, "supported_generation_methods", []) or []
            if "generateContent" in methods:
                models.append(m.name.split("/")[-1])
        if not models:
            return {"ok": False, "message": "La API key es valida pero no expone modelos con generateContent.", "model": ""}
        chosen = _pick_model(models, _runtime_model)
        # Prueba real de generacion (barata) para validar el token de extremo a extremo.
        model = genai.GenerativeModel(chosen)
        resp = model.generate_content("Responde solo con: OK")
        txt = (getattr(resp, "text", "") or "").strip()
        if not txt:
            return {"ok": False, "message": "El modelo no devolvio contenido. Verifique cuotas/permisos.", "model": chosen}
        # Restaurar configuracion con la key en runtime si era distinta.
        if _runtime_api_key and key != _runtime_api_key:
            genai.configure(api_key=_runtime_api_key)
        return {
            "ok": True,
            "message": f"Conexion exitosa. Modelo activo: {chosen}. {len(models)} modelos disponibles.",
            "model": chosen,
            "available_models": models,
        }
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "message": f"Error de conexion con Gemini: {exc}", "model": ""}


def _pick_model(available: list[str], preferred: str = "") -> str:
    if preferred:
        for name in available:
            if name == preferred or name.startswith(preferred):
                return name
    for pref in _MODEL_PREFERENCE:
        for name in available:
            if name == pref or name.startswith(pref):
                return name
    stable = [n for n in available if n.startswith("gemini") and "exp" not in n]
    return (stable or available)[0]


def detect_model(force: bool = False) -> str | None:
    """Detecta y memoriza el mejor modelo disponible."""
    global _resolved_model
    if not is_enabled():
        return None
    if _resolved_model and not force:
        return _resolved_model

    _ensure_configured()

    # 1) Si el usuario fijo un modelo, respetarlo.
    if _runtime_model:
        _resolved_model = _runtime_model
        return _resolved_model

    # 2) Descubrir modelos que soporten generateContent.
    try:
        available: list[str] = []
        for m in genai.list_models():
            methods = getattr(m, "supported_generation_methods", []) or []
            if "generateContent" in methods:
                name = m.name.split("/")[-1]
                available.append(name)
    except Exception:  # noqa: BLE001
        available = []

    if not available:
        # Fallback razonable si list_models falla pero hay key.
        _resolved_model = "gemini-1.5-flash"
        return _resolved_model

    # 3) Elegir por orden de preferencia; si no, el primero de la lista.
    for pref in _MODEL_PREFERENCE:
        for name in available:
            if name == pref or name.startswith(pref):
                _resolved_model = name
                return _resolved_model
    # Preferir cualquier 'gemini' estable no 'exp'.
    stable = [n for n in available if n.startswith("gemini") and "exp" not in n]
    _resolved_model = (stable or available)[0]
    return _resolved_model


def current_model() -> str:
    if not is_enabled():
        return ""
    return detect_model() or ""


def _generate(prompt: str, system: str | None = None, temperature: float = 0.4) -> tuple[str, str]:
    """Genera texto. Devuelve (texto, modelo_usado)."""
    model_name = detect_model()
    if not model_name:
        return ("", "")
    _ensure_configured()
    try:
        model = genai.GenerativeModel(
            model_name,
            system_instruction=system or None,
            generation_config={"temperature": temperature},
        )
        resp = model.generate_content(prompt)
        text = (getattr(resp, "text", "") or "").strip()
        return (text, model_name)
    except Exception as exc:  # noqa: BLE001
        return (f"[Error al consultar Gemini: {exc}]", model_name)


# --------------------------------------------------------------------------- #
#  Casos de uso
# --------------------------------------------------------------------------- #
SYSTEM_ANALYST = (
    "Eres un analista senior de evaluacion de tecnologias sanitarias (ETS) del IETS "
    "(Instituto de Evaluacion Tecnologica en Salud de Colombia). Especialista en escaneo "
    "de horizonte (horizon scanning). Respondes en espanol, con rigor tecnico, de forma "
    "estructurada y accionable para el contexto del sistema de salud colombiano."
)


def generate_adoption_recommendation(finding, source) -> tuple[str, str]:
    """Genera una recomendacion de adopcion para Colombia sobre un hallazgo."""
    prompt = f"""Analiza la siguiente tecnologia/senal identificada en un ejercicio de escaneo de horizonte y elabora una recomendacion de adopcion para Colombia.

TECNOLOGIA / HALLAZGO:
- Titulo: {finding.title}
- Tecnologia: {finding.technology}
- Tipo: {finding.technology_type}
- Horizonte estimado: {finding.horizon or 'no determinado'}
- Fase: {finding.phase or 'no determinada'}
- Area terapeutica: {finding.therapeutic_area or 'no determinada'}
- Resumen: {finding.summary or 'sin resumen'}
- Fuente: {source.title} ({source.url})

Entrega una recomendacion con esta estructura en Markdown:
1. **Sintesis** (2-3 lineas).
2. **Relevancia para Colombia** (carga de enfermedad, brechas de acceso, encaje en el sistema).
3. **Consideraciones regulatorias** (rol de INVIMA, ruta ETS del IETS, tiempos).
4. **Impacto potencial** (clinico, presupuestal, equidad) y una etiqueta de impacto: alto / medio / bajo.
5. **Acciones recomendadas** (pasos concretos y priorizados).
6. **Riesgos e incertidumbres**.

Se concreto y evita afirmaciones no sustentadas. Termina con una linea: "IMPACTO: alto|medio|bajo".
"""
    text, model = _generate(prompt, system=SYSTEM_ANALYST, temperature=0.5)
    if not text:
        text = _fallback_recommendation(finding, source)
        model = "fallback (sin Gemini)"
    return text, model


def chat_answer(question: str, context: str, history: list[dict]) -> tuple[str, str]:
    """Responde una pregunta usando el contexto recuperado de la BD (RAG)."""
    hist_txt = ""
    for h in history[-6:]:
        role = "Usuario" if h.get("role") == "user" else "Asistente"
        hist_txt += f"{role}: {h.get('content', '')}\n"

    prompt = f"""Contexto disponible del sistema de escaneo de horizonte del IETS (fuentes y hallazgos):
---
{context if context.strip() else 'No hay contexto especifico recuperado para esta consulta.'}
---

Historial reciente de la conversacion:
{hist_txt or '(sin historial)'}

Pregunta del usuario: {question}

Responde en espanol, basandote principalmente en el contexto proporcionado. Si el contexto no
alcanza, indicalo y ofrece orientacion general de ETS/escaneo de horizonte. Cita las fuentes por
su titulo cuando corresponda. Se claro y conciso."""
    text, model = _generate(prompt, system=SYSTEM_ANALYST, temperature=0.4)
    if not text:
        text = _fallback_chat(question, context)
        model = "fallback (sin Gemini)"
    return text, model


# --------------------------------------------------------------------------- #
#  Fallbacks (sin API key)
# --------------------------------------------------------------------------- #
def _fallback_recommendation(finding, source) -> str:
    return (
        f"### Recomendacion preliminar (modo sin IA)\n\n"
        f"**Tecnologia:** {finding.technology or finding.title}\n\n"
        f"**Tipo:** {finding.technology_type or 'no determinado'} | "
        f"**Horizonte:** {finding.horizon or 'no determinado'}\n\n"
        f"Este hallazgo proviene de *{source.title}*. Para generar una recomendacion de adopcion "
        f"detallada para Colombia, configure la variable `GEMINI_API_KEY` en el backend. "
        f"Entretanto, se sugiere: (1) verificar la senal en INVIMA y en la ruta de ETS del IETS, "
        f"(2) estimar carga de enfermedad y poblacion objetivo en Colombia, y (3) evaluar impacto "
        f"presupuestal preliminar.\n\nIMPACTO: medio"
    )


def _fallback_chat(question: str, context: str) -> str:
    if context.strip():
        return (
            "Modo sin IA (configure `GEMINI_API_KEY` para respuestas generativas). "
            "Segun la informacion disponible en el sistema, estos son los elementos mas relevantes "
            f"para su consulta:\n\n{context[:1500]}"
        )
    return (
        "Modo sin IA. No se encontro contexto especifico para su consulta en la base de datos. "
        "Configure `GEMINI_API_KEY` y ejecute un escaneo de las fuentes para enriquecer la informacion."
    )
