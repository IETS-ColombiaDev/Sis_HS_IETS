"""Cliente de MiniMax (API internacional OpenAI-compatible).

Detecta el mejor modelo disponible para la API key, genera texto y
acepta imagenes (OCR / vision) con MiniMax-M3.
"""
from __future__ import annotations

import json
import re
import threading
from typing import Any

import httpx

from .config import settings

BASE_URL = "https://api.minimax.io/v1"
CODING_PLAN_REMAINS = f"{BASE_URL}/api/openplatform/coding_plan/remains"

# De mas capaz a mas ligero. M3 es el unico con vision/OCR documentado.
MODEL_PREFERENCE = [
    "MiniMax-M3",
    "MiniMax-M2.7",
    "MiniMax-M2.7-highspeed",
    "MiniMax-M2.5",
    "MiniMax-M2.5-highspeed",
    "MiniMax-M2.1",
    "MiniMax-M2.1-highspeed",
    "MiniMax-M2",
]
VISION_MODELS = {"MiniMax-M3"}
KNOWN_MODELS = list(MODEL_PREFERENCE)

_THINK_RE = re.compile(r"<think>[\s\S]*?</think>|<thinking>[\s\S]*?</thinking>", re.I)

_lock = threading.Lock()
_runtime_api_key: str = (settings.minimax_api_key or "").strip()
_runtime_model: str = (settings.minimax_model or "").strip()
_resolved_model: str | None = None
_cached_available: list[str] | None = None


def configure_runtime(api_key: str | None = None, model: str | None = None) -> None:
    global _runtime_api_key, _runtime_model, _resolved_model, _cached_available
    with _lock:
        if api_key is not None:
            _runtime_api_key = (api_key or "").strip()
        if model is not None:
            _runtime_model = (model or "").strip()
        _resolved_model = None
        _cached_available = None


def get_api_key() -> str:
    return _runtime_api_key


def has_key() -> bool:
    return bool(_runtime_api_key)


def is_enabled() -> bool:
    return bool(_runtime_api_key)


def _headers(key: str | None = None) -> dict[str, str]:
    token = (key or _runtime_api_key or "").strip()
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


def _extract_text(payload: dict) -> str:
    choices = payload.get("choices") or []
    if not choices:
        return ""
    message = choices[0].get("message") or {}
    content = message.get("content") or ""
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                parts.append(item.get("text") or "")
            elif isinstance(item, str):
                parts.append(item)
        content = "".join(parts)
    text = _THINK_RE.sub("", str(content)).strip()
    if text:
        return text
    reasoning = message.get("reasoning_content") or ""
    return str(reasoning).strip()


def _client(timeout: float = 45.0) -> httpx.Client:
    return httpx.Client(timeout=timeout, follow_redirects=True)


def list_catalog_models() -> list[str]:
    return list(KNOWN_MODELS)


def list_available_models(api_key: str | None = None, force: bool = False) -> list[str]:
    """Lista modelos reales de la cuenta; si falla, el catalogo conocido."""
    global _cached_available
    key = (api_key or _runtime_api_key or "").strip()
    if not key:
        return []
    if _cached_available is not None and not force and not api_key:
        return list(_cached_available)

    discovered: list[str] = []
    try:
        with _client(timeout=8.0) as client:
            resp = client.get(f"{BASE_URL}/models", headers=_headers(key))
        if resp.status_code < 400:
            data = resp.json()
            rows = data.get("data") if isinstance(data, dict) else data
            if isinstance(rows, list):
                for row in rows:
                    if isinstance(row, dict):
                        name = str(row.get("id") or row.get("name") or "").strip()
                    else:
                        name = str(row).strip()
                    if name:
                        discovered.append(name)
    except Exception:  # noqa: BLE001
        discovered = []

    if not discovered:
        discovered = list(KNOWN_MODELS)
    else:
        extra = [m for m in KNOWN_MODELS if m not in discovered]
        discovered = extra + discovered

    ordered = _order_models(discovered)
    if not api_key:
        _cached_available = ordered
    return ordered


def _order_models(names: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for pref in MODEL_PREFERENCE:
        for name in names:
            if name == pref or name.startswith(pref):
                if name not in seen:
                    out.append(name)
                    seen.add(name)
    for name in names:
        if name not in seen:
            out.append(name)
            seen.add(name)
    return out


def _pick_model(available: list[str], preferred: str = "") -> str:
    if preferred:
        if preferred in available:
            return preferred
        for name in available:
            if name.startswith(preferred):
                return name
        return preferred
    ordered = _order_models(available)
    return ordered[0] if ordered else MODEL_PREFERENCE[0]


def detect_model(force: bool = False, api_key: str | None = None, probe: bool = False) -> str | None:
    """Elige el mejor modelo. `probe=True` valida con una llamada real (lento)."""
    global _resolved_model
    key = (api_key or _runtime_api_key or "").strip()
    if not key:
        return None
    if _resolved_model and not force and not api_key:
        return _resolved_model

    available = list_available_models(api_key=key, force=force)
    chosen = _pick_model(available, _runtime_model if not api_key else "")
    if not probe:
        if not api_key:
            _resolved_model = chosen
        return chosen

    if _probe_model(key, chosen):
        if not api_key:
            _resolved_model = chosen
        return chosen

    for name in available:
        if name == chosen:
            continue
        if _probe_model(key, name):
            if not api_key:
                _resolved_model = name
            return name
    if not api_key:
        _resolved_model = chosen
    return chosen


def current_model() -> str:
    if not is_enabled():
        return ""
    return detect_model() or ""


def vision_model() -> str:
    """Modelo con vision/OCR. Si el activo no ve imagenes, fuerza M3."""
    active = current_model()
    if active in VISION_MODELS:
        return active
    available = list_available_models()
    for name in available:
        if name in VISION_MODELS:
            return name
    return "MiniMax-M3"


def supports_vision(model: str | None = None) -> bool:
    name = model or current_model()
    return name in VISION_MODELS or (name or "").startswith("MiniMax-M3")


def _probe_model(key: str, model: str) -> bool:
    try:
        payload = _completion_body(
            model=model,
            messages=[{"role": "user", "content": "Responde solo con: OK"}],
            temperature=1.0,
            max_tokens=16,
        )
        with _client(timeout=25.0) as client:
            resp = client.post(
                f"{BASE_URL}/chat/completions",
                headers=_headers(key),
                json=payload,
            )
        if resp.status_code >= 400:
            return False
        text = _extract_text(resp.json())
        return bool(text)
    except Exception:  # noqa: BLE001
        return False


def _completion_body(
    model: str,
    messages: list[dict],
    temperature: float,
    max_tokens: int,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": max(0.0, min(2.0, temperature)),
        "max_tokens": max_tokens,
        "max_completion_tokens": max_tokens,
    }
    if model.startswith("MiniMax-M3"):
        body["thinking"] = {"type": "disabled"}
    return body


def generate(
    prompt: str,
    system: str | None = None,
    temperature: float = 0.7,
    max_tokens: int = 2048,
    model: str | None = None,
    images: list[dict] | None = None,
    api_key: str | None = None,
) -> tuple[str, str]:
    """Genera texto. `images` es lista de {mime, data} en base64 o {url}."""
    key = (api_key or _runtime_api_key or "").strip()
    if not key:
        return ("", "")
    model_name = model or detect_model() or MODEL_PREFERENCE[0]
    if images and not supports_vision(model_name):
        model_name = vision_model()

    user_content: Any
    if images:
        parts: list[dict] = [{"type": "text", "text": prompt}]
        for img in images[:4]:
            url = img.get("url") or ""
            if not url and img.get("data"):
                mime = img.get("mime") or "image/png"
                url = f"data:{mime};base64,{img['data']}"
            if url:
                parts.append(
                    {
                        "type": "image_url",
                        "image_url": {"url": url, "detail": "high" if img.get("ocr") else "default"},
                    }
                )
        user_content = parts
    else:
        user_content = prompt

    messages: list[dict] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": user_content})

    try:
        payload = _completion_body(model_name, messages, temperature, max_tokens)
        with _client(timeout=60.0) as client:
            resp = client.post(
                f"{BASE_URL}/chat/completions",
                headers=_headers(key),
                json=payload,
            )
        if resp.status_code >= 400:
            return (f"[Error MiniMax HTTP {resp.status_code}: {resp.text[:240]}]", model_name)
        text = _extract_text(resp.json())
        return (text, model_name)
    except Exception as exc:  # noqa: BLE001
        return (f"[Error al consultar MiniMax: {exc}]", model_name)


def test_connection(api_key: str | None = None) -> dict:
    key = (api_key or _runtime_api_key or "").strip()
    if not key:
        return {"ok": False, "message": "No hay API key de MiniMax configurada.", "model": ""}
    try:
        models = list_available_models(api_key=key, force=True)
        chosen = detect_model(force=True, api_key=key, probe=True)
        if not chosen:
            return {"ok": False, "message": "La llave no expone modelos utilizables.", "model": ""}
        text, used = generate(
            "Responde solo con: OK",
            temperature=1.0,
            max_tokens=16,
            model=chosen,
            api_key=key,
        )
        if not text or text.startswith("[Error"):
            return {
                "ok": False,
                "message": text or "El modelo no devolvió contenido.",
                "model": used or chosen,
                "available_models": models,
            }
        remains = coding_plan_remains(api_key=key)
        extra = ""
        if remains.get("ok") and remains.get("summary"):
            extra = f" {remains['summary']}"
        return {
            "ok": True,
            "message": f"Conexión MiniMax exitosa. Modelo activo: {used}.{extra}",
            "model": used,
            "available_models": models,
            "coding_plan": remains,
        }
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "message": f"Error de conexión con MiniMax: {exc}", "model": ""}


def coding_plan_remains(api_key: str | None = None) -> dict:
    key = (api_key or _runtime_api_key or "").strip()
    if not key:
        return {"ok": False}
    try:
        with _client(timeout=15.0) as client:
            resp = client.get(CODING_PLAN_REMAINS, headers=_headers(key))
        if resp.status_code >= 400:
            return {"ok": False, "status": resp.status_code}
        data = resp.json()
        if isinstance(data, str):
            try:
                data = json.loads(data)
            except json.JSONDecodeError:
                return {"ok": True, "raw": data, "summary": ""}
        summary = ""
        if isinstance(data, dict):
            leftover = data.get("remain") or data.get("remaining") or data.get("data")
            if leftover is not None:
                summary = f"Saldo Coding Plan: {leftover}."
        return {"ok": True, "data": data, "summary": summary}
    except Exception:  # noqa: BLE001
        return {"ok": False}
