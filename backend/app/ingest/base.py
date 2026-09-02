"""Contrato comun de los conectores de ingesta (RF01).

Un conector traduce lo que publica una fuente externa al esquema canonico del
sistema. No sabe nada de la base de datos ni de la cola: recibe parametros,
devuelve registros y deja el crudo intacto. Eso permite reprocesar un cambio de
mapeo sin volver a consultar la fuente, que es lo que exige el RF03.
"""
from __future__ import annotations

import hashlib
import logging
import random
import re
import time
from dataclasses import dataclass, field
from datetime import date, datetime

import httpx

log = logging.getLogger(__name__)

# Contacto declarado en las peticiones, como piden los terminos de uso de
# openFDA y de las E-Utilities del NCBI.
CONTACT = "escaneo.horizonte@iets.org.co"
USER_AGENT = f"IETS-HorizonScanning/4.0 (+https://www.iets.org.co; {CONTACT})"


class ConnectorError(RuntimeError):
    """Fallo atribuible a la fuente externa, no al codigo del conector."""


class RateLimited(ConnectorError):
    """La fuente pidio explicitamente que bajemos el ritmo."""


@dataclass(slots=True)
class CanonicalRecord:
    """Una senal ya traducida al vocabulario del sistema.

    `raw` conserva el objeto original completo. Es deliberado que sea el unico
    campo sin normalizar: es la red de seguridad del RF03.
    """

    external_id: str
    title: str
    url: str = ""
    summary: str = ""

    commercial_name: str = ""
    inn_name: str = ""
    manufacturer: str = ""
    mechanism: str = ""
    indication: str = ""
    therapeutic_area: str = ""

    technology_type: str = ""  # taxonomia heredada: medicamento | dispositivo | digital | otro
    development_phase: str = ""
    horizon: str = ""

    nct_ids: list[str] = field(default_factory=list)
    phase3_completion_date: date | None = None
    fda_approval_date: date | None = None
    ema_approval_date: date | None = None
    regulatory_status: str = ""
    published_date: str = ""

    raw: dict = field(default_factory=dict)

    def content_hash(self, connector: str) -> str:
        """Identidad estable entre corridas.

        Se usa el identificador de la fuente, no el titulo: un ensayo que corrige
        su titulo sigue siendo el mismo ensayo, y duplicarlo obligaria despues a
        fusionarlo a mano en el modulo de filtrado.
        """
        norm = f"{connector}|{self.external_id}".strip().lower()
        return hashlib.sha256(norm.encode("utf-8")).hexdigest()[:32]


@dataclass(slots=True)
class ConnectorResult:
    records: list[CanonicalRecord]
    message: str = ""
    partial: bool = False


class Connector:
    """Adaptador de una fuente. Cada implementacion declara su propio mapeo."""

    code: str = ""
    label: str = ""
    description: str = ""
    # Algunas fuentes (ClinicalTrials.gov) rechazan con 403 cualquier
    # `User-Agent` que no reconozcan, asi que se deja declarar por conector.
    send_user_agent: bool = True
    # Pausa minima entre peticiones, en segundos. Las E-Utilities del NCBI
    # permiten 3 por segundo sin clave; openFDA, 240 por minuto.
    min_interval: float = 0.0
    requires_url: bool = False

    def fetch(self, *, config: dict, url: str = "") -> ConnectorResult:
        raise NotImplementedError


# --------------------------------------------------------------------------- #
#  Registro de conectores
# --------------------------------------------------------------------------- #
_REGISTRY: dict[str, Connector] = {}


def register(connector: Connector) -> Connector:
    _REGISTRY[connector.code] = connector
    return connector


def get_connector(code: str) -> Connector | None:
    return _REGISTRY.get((code or "").strip().lower())


def all_connectors() -> list[Connector]:
    return sorted(_REGISTRY.values(), key=lambda c: c.label)


# --------------------------------------------------------------------------- #
#  Cliente HTTP con reintento exponencial y respeto de rate limit
# --------------------------------------------------------------------------- #
RETRYABLE_STATUS = {429, 500, 502, 503, 504}
_last_call: dict[str, float] = {}


def _respect_interval(key: str, min_interval: float) -> None:
    if min_interval <= 0:
        return
    previous = _last_call.get(key, 0.0)
    wait = min_interval - (time.monotonic() - previous)
    if wait > 0:
        time.sleep(wait)
    _last_call[key] = time.monotonic()


def request_json(
    url: str,
    *,
    params: dict | None = None,
    connector_code: str = "",
    send_user_agent: bool = True,
    min_interval: float = 0.0,
    timeout: float = 40.0,
    max_attempts: int = 4,
) -> dict:
    """GET con reintento exponencial y jitter.

    El jitter no es cosmetico: sin el, varios conectores que fallan a la vez
    reintentan sincronizados y golpean la fuente en el mismo instante.
    """
    headers = {"Accept": "application/json"}
    if send_user_agent:
        headers["User-Agent"] = USER_AGENT

    last_error = ""
    for attempt in range(1, max_attempts + 1):
        _respect_interval(connector_code or url, min_interval)
        try:
            with httpx.Client(timeout=timeout, follow_redirects=True, headers=headers) as client:
                resp = client.get(url, params=params)

            if resp.status_code in RETRYABLE_STATUS:
                retry_after = _retry_after_seconds(resp)
                last_error = f"HTTP {resp.status_code}"
                if attempt == max_attempts:
                    if resp.status_code == 429:
                        raise RateLimited(f"{last_error} tras {attempt} intentos")
                    raise ConnectorError(f"{last_error} tras {attempt} intentos")
                _sleep_backoff(attempt, retry_after)
                continue

            if resp.status_code >= 400:
                raise ConnectorError(f"HTTP {resp.status_code}: {resp.text[:200]}")

            return resp.json()
        except (httpx.TimeoutException, httpx.TransportError) as exc:
            last_error = f"{type(exc).__name__}: {exc}"
            if attempt == max_attempts:
                raise ConnectorError(f"Red inaccesible tras {attempt} intentos. {last_error}")
            _sleep_backoff(attempt, None)
        except ValueError as exc:  # respuesta que no es JSON valido
            raise ConnectorError(f"Respuesta no interpretable como JSON: {exc}")

    raise ConnectorError(last_error or "Fallo desconocido")


def request_text(
    url: str,
    *,
    params: dict | None = None,
    connector_code: str = "",
    send_user_agent: bool = True,
    min_interval: float = 0.0,
    timeout: float = 40.0,
    max_attempts: int = 4,
    accept: str = "application/xml, text/xml, application/rss+xml, text/html, */*",
) -> str:
    """GET de texto (RSS, XML, HTML) con la misma politica de reintento."""
    headers = {"Accept": accept}
    if send_user_agent:
        headers["User-Agent"] = USER_AGENT

    last_error = ""
    for attempt in range(1, max_attempts + 1):
        _respect_interval(connector_code or url, min_interval)
        try:
            with httpx.Client(timeout=timeout, follow_redirects=True, headers=headers) as client:
                resp = client.get(url, params=params)

            if resp.status_code in RETRYABLE_STATUS:
                retry_after = _retry_after_seconds(resp)
                last_error = f"HTTP {resp.status_code}"
                if attempt == max_attempts:
                    if resp.status_code == 429:
                        raise RateLimited(f"{last_error} tras {attempt} intentos")
                    raise ConnectorError(f"{last_error} tras {attempt} intentos")
                _sleep_backoff(attempt, retry_after)
                continue

            if resp.status_code >= 400:
                raise ConnectorError(f"HTTP {resp.status_code}: {resp.text[:200]}")

            return resp.text
        except (httpx.TimeoutException, httpx.TransportError) as exc:
            last_error = f"{type(exc).__name__}: {exc}"
            if attempt == max_attempts:
                raise ConnectorError(f"Red inaccesible tras {attempt} intentos. {last_error}")
            _sleep_backoff(attempt, None)

    raise ConnectorError(last_error or "Fallo desconocido")


def _retry_after_seconds(resp: httpx.Response) -> float | None:
    raw = resp.headers.get("Retry-After", "")
    if not raw:
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def _sleep_backoff(attempt: int, retry_after: float | None) -> None:
    if retry_after is not None:
        time.sleep(min(retry_after, 30.0))
        return
    delay = min(2 ** (attempt - 1), 16) + random.uniform(0, 0.5)
    time.sleep(delay)


# --------------------------------------------------------------------------- #
#  Utilidades de normalizacion compartidas
# --------------------------------------------------------------------------- #
_NCT_RE = re.compile(r"\bNCT\d{8}\b", re.IGNORECASE)


def find_nct_ids(*texts: str) -> list[str]:
    found: list[str] = []
    for text in texts:
        for match in _NCT_RE.findall(text or ""):
            code = match.upper()
            if code not in found:
                found.append(code)
    return found


def parse_compact_date(value: str | None) -> date | None:
    """Acepta los formatos que devuelven las fuentes: 20260424, 2026-04-24, 2026-04."""
    text = (value or "").strip()
    if not text:
        return None
    for fmt in ("%Y%m%d", "%Y-%m-%d", "%d/%m/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    # Fecha con precision de mes: se ancla al primer dia para poder ordenarla.
    try:
        return datetime.strptime(text[:7], "%Y-%m").date()
    except ValueError:
        return None


def clean_text(value: str | None, limit: int = 0) -> str:
    text = re.sub(r"\s+", " ", (value or "").strip())
    return text[:limit] if limit else text
