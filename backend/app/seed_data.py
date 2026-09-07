"""Inventario operativo de fuentes: reexporta el catalogo verificado RF01 / D-06.

El listado institucional anterior (29 referentes + extras + 5 APIs) queda
reemplazado. Quien importe `all_seed_sources` o `API_SOURCES` recibe el
catalogo de 53 fuentes. La siembra y la importacion viven en `catalog_service`.
"""
from __future__ import annotations

from .catalog import (  # noqa: F401
    API_SOURCES,
    CATALOG_SOURCES,
    CATALOG_VERSION,
    all_catalog_sources,
    all_seed_sources,
    catalog_stats,
)
