"""Fachada de IA: MiniMax (principal) con Gemini como respaldo opcional.

El proveedor `auto` usa MiniMax si hay llave; si no, Gemini.
El OCR de paginas e imagenes solo corre cuando `ai_ocr_enabled` esta activo
y MiniMax-M3 (vision) esta disponible.
"""
from __future__ import annotations

import json
import re
import threading

from . import gemini_service, minimax_service
from .config import settings

SYSTEM_ANALYST = (
    "Eres un analista senior de evaluacion de tecnologias sanitarias (ETS) del IETS "
    "(Instituto de Evaluacion Tecnologica en Salud de Colombia). Especialista en escaneo "
    "de horizonte (horizon scanning). Respondes en espanol, con rigor tecnico, de forma "
    "estructurada y accionable para el contexto del sistema de salud colombiano."
)

_lock = threading.Lock()
_runtime_provider: str = (settings.ai_provider or "auto").strip().lower() or "auto"
_runtime_ocr: bool = bool(settings.ai_ocr_enabled)
_runtime_web: bool = bool(settings.ai_web_enabled)


def configure_runtime(
    provider: str | None = None,
    ocr_enabled: bool | None = None,
    web_enabled: bool | None = None,
    minimax_api_key: str | None = None,
    minimax_model: str | None = None,
    gemini_api_key: str | None = None,
    gemini_model: str | None = None,
) -> None:
    global _runtime_provider, _runtime_ocr, _runtime_web
    with _lock:
        if provider is not None:
            value = (provider or "auto").strip().lower()
            _runtime_provider = value if value in {"auto", "minimax", "gemini"} else "auto"
        if ocr_enabled is not None:
            _runtime_ocr = bool(ocr_enabled)
        if web_enabled is not None:
            _runtime_web = bool(web_enabled)
    if minimax_api_key is not None or minimax_model is not None:
        minimax_service.configure_runtime(api_key=minimax_api_key, model=minimax_model)
    if gemini_api_key is not None or gemini_model is not None:
        gemini_service.configure_runtime(api_key=gemini_api_key, model=gemini_model)


def provider() -> str:
    return _runtime_provider


def active_provider() -> str:
    pref = provider()
    if pref == "minimax" and minimax_service.is_enabled():
        return "minimax"
    if pref == "gemini" and gemini_service.is_enabled():
        return "gemini"
    if pref == "auto":
        if minimax_service.is_enabled():
            return "minimax"
        if gemini_service.is_enabled():
            return "gemini"
    if minimax_service.is_enabled():
        return "minimax"
    if gemini_service.is_enabled():
        return "gemini"
    return ""


def is_enabled() -> bool:
    return bool(active_provider())


def has_key() -> bool:
    return minimax_service.has_key() or gemini_service.has_key()


def current_model() -> str:
    who = active_provider()
    if who == "minimax":
        return minimax_service.current_model()
    if who == "gemini":
        return gemini_service.current_model()
    return ""


def ocr_enabled() -> bool:
    return _runtime_ocr and minimax_service.is_enabled()


def web_assist_enabled() -> bool:
    return _runtime_web and is_enabled()


def list_available_models(for_provider: str | None = None) -> list[str]:
    who = (for_provider or active_provider() or "minimax").lower()
    if who == "gemini":
        return gemini_service.list_available_models()
    return minimax_service.list_available_models()


def detect_best_models() -> dict:
    """Relee modelos MiniMax y elige el mejor que responda."""
    models = minimax_service.list_available_models(force=True)
    chosen = minimax_service.detect_model(force=True, probe=True) or ""
    return {
        "ok": bool(chosen),
        "provider": "minimax",
        "model": chosen,
        "available_models": models,
        "vision_model": minimax_service.vision_model() if minimax_service.is_enabled() else "",
    }


def test_connection(provider_name: str | None = None, api_key: str | None = None) -> dict:
    who = (provider_name or active_provider() or "minimax").lower()
    if who == "gemini":
        result = gemini_service.test_connection(api_key=api_key)
        result["provider"] = "gemini"
        return result
    result = minimax_service.test_connection(api_key=api_key)
    result["provider"] = "minimax"
    return result


def generate(
    prompt: str,
    system: str | None = None,
    temperature: float = 0.5,
    images: list[dict] | None = None,
) -> tuple[str, str]:
    """Genera texto con el proveedor activo. Devuelve (texto, modelo)."""
    who = active_provider()
    if who == "minimax":
        text, model = minimax_service.generate(
            prompt,
            system=system,
            temperature=max(0.1, min(2.0, temperature if temperature else 0.7)),
            images=images,
        )
        if text and not text.startswith("[Error"):
            return text, model
        if gemini_service.is_enabled() and not images:
            fallback, gmodel = gemini_service._generate(prompt, system=system, temperature=temperature)
            if fallback:
                return fallback, gmodel or model
        return text, model
    if who == "gemini":
        return gemini_service._generate(prompt, system=system, temperature=temperature)
    return ("", "")


def generate_adoption_recommendation(finding, source) -> tuple[str, str]:
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
    text, model = generate(prompt, system=SYSTEM_ANALYST, temperature=0.6)
    if not text or text.startswith("[Error"):
        text = _fallback_recommendation(finding, source)
        model = model or "fallback (sin IA)"
    return text, model


def chat_answer(question: str, context: str, history: list[dict]) -> tuple[str, str]:
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
    text, model = generate(prompt, system=SYSTEM_ANALYST, temperature=0.5)
    if not text or text.startswith("[Error"):
        text = _fallback_chat(question, context)
        model = model or "fallback (sin IA)"
    return text, model


def enhance_note_content(title: str, content: str, context: str = "") -> tuple[str, str]:
    prompt = f"""Mejora la siguiente nota del equipo de escaneo de horizonte del IETS (Colombia).
Mantén el sentido original, hazla más clara, profesional y accionable. Usa Markdown breve si ayuda.

Titulo: {title or '(sin titulo)'}
Contexto vinculado: {context or 'nota general'}
Contenido actual:
{content}

Devuelve SOLO el contenido mejorado (sin repetir el titulo)."""
    text, model = generate(prompt, system=SYSTEM_ANALYST, temperature=0.4)
    if not text or text.startswith("[Error"):
        return (content, "fallback (sin IA)")
    return (text, model)


def enrich_finding(finding, source) -> tuple[dict, str]:
    prompt = f"""Analiza este hallazgo de escaneo de horizonte sanitario y responde SOLO con JSON valido (sin markdown):
{{
  "summary": "resumen claro max 400 caracteres",
  "technology": "nombre corto de la tecnologia",
  "technology_type": "medicamento|dispositivo|digital|otro",
  "horizon": "emergente|transicional|inminente|",
  "therapeutic_area": "area terapeutica o vacio",
  "phase": "fase de desarrollo o vacio"
}}

Hallazgo: {finding.title}
Resumen actual: {finding.summary or 'sin resumen'}
Tecnologia: {finding.technology or ''}
Fuente: {source.title if source else ''} ({getattr(source, 'url', '') or ''})
Contenido raw: {(finding.raw_content or '')[:800]}"""
    text, model = generate(prompt, system=SYSTEM_ANALYST, temperature=0.3)
    if not text or text.startswith("[Error"):
        return ({}, model or "fallback (sin IA)")
    try:
        match = re.search(r"\{[\s\S]*\}", text)
        data = json.loads(match.group(0) if match else text)
        allowed_types = {"medicamento", "dispositivo", "digital", "otro"}
        allowed_horizons = {"emergente", "transicional", "inminente", ""}
        if data.get("technology_type") not in allowed_types:
            data["technology_type"] = finding.technology_type or "otro"
        if data.get("horizon") not in allowed_horizons:
            data["horizon"] = finding.horizon or ""
        return (data, model)
    except Exception:  # noqa: BLE001
        return ({}, model)


def _fallback_recommendation(finding, source) -> str:
    return (
        f"### Recomendación preliminar (modo sin IA)\n\n"
        f"**Tecnología:** {finding.technology or finding.title}\n\n"
        f"**Tipo:** {finding.technology_type or 'no determinado'} | "
        f"**Horizonte:** {finding.horizon or 'no determinado'}\n\n"
        f"Este hallazgo proviene de *{source.title}*. Para generar una recomendación de adopción "
        f"detallada para Colombia, configure MiniMax o Gemini en Configuración. "
        f"Entretanto, se sugiere: (1) verificar la señal en INVIMA y en la ruta de ETS del IETS, "
        f"(2) estimar carga de enfermedad y población objetivo en Colombia, y (3) evaluar impacto "
        f"presupuestal preliminar.\n\nIMPACTO: medio"
    )


def _fallback_chat(question: str, context: str) -> str:
    if context.strip():
        return (
            "Modo sin IA (configure MiniMax en Configuración para respuestas generativas). "
            "Según la información disponible en el sistema, estos son los elementos más relevantes "
            f"para su consulta:\n\n{context[:1500]}"
        )
    return (
        "Modo sin IA. No se encontró contexto específico para su consulta en la base de datos. "
        "Configure MiniMax y ejecute un escaneo de las fuentes para enriquecer la información."
    )
