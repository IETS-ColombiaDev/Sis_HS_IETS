"""Paquete de conectores de ingesta. Importar este modulo registra todos."""
from __future__ import annotations

from .base import (  # noqa: F401
    CanonicalRecord,
    Connector,
    ConnectorError,
    ConnectorResult,
    RateLimited,
    all_connectors,
    get_connector,
    register,
)
from . import clinicaltrials  # noqa: F401
from . import ctis  # noqa: F401
from . import ema  # noqa: F401
from . import fda  # noqa: F401
from . import file_feed  # noqa: F401
from . import fixture  # noqa: F401
from . import health_canada  # noqa: F401
from . import manual  # noqa: F401
from . import pcori_hs  # noqa: F401
from . import pubmed  # noqa: F401
from . import who_ictrp  # noqa: F401
