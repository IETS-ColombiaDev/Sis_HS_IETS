"""RBAC de cinco perfiles con permisos declarativos (fase 0 del plan).

Sustituye la escala lineal viewer < editor < admin por una matriz de permisos
por modulo, y agrega granularidad a nivel de campo para la calificacion de los
criterios P1 a P6 (exigencia del modulo 3 de la especificacion).

Los roles heredados se resuelven por alias, de modo que las cuentas existentes
siguen operando sin intervencion manual.
"""
from __future__ import annotations

# --------------------------------------------------------------------------- #
#  Perfiles (Tabla 3 de la especificacion)
# --------------------------------------------------------------------------- #
SUPERADMIN = "superadmin"
EVALUADOR_TECNICO = "evaluador_tecnico"
EVALUADOR_CLINICO = "evaluador_clinico"
TOMADOR_DECISIONES = "tomador_decisiones"
REVISOR_PARES = "revisor_pares"

ROLES: tuple[str, ...] = (
    SUPERADMIN,
    EVALUADOR_TECNICO,
    EVALUADOR_CLINICO,
    TOMADOR_DECISIONES,
    REVISOR_PARES,
)

ROLE_LABELS: dict[str, str] = {
    SUPERADMIN: "Superadministrador",
    EVALUADOR_TECNICO: "Evaluador tecnico",
    EVALUADOR_CLINICO: "Evaluador clinico",
    TOMADOR_DECISIONES: "Tomador de decisiones",
    REVISOR_PARES: "Revisor por pares",
}

# Migracion de roles heredados (seccion "Mapeo de roles" de la fase 0).
LEGACY_ROLE_MAP: dict[str, str] = {
    "admin": SUPERADMIN,
    "editor": EVALUADOR_TECNICO,
    "viewer": TOMADOR_DECISIONES,
}

# --------------------------------------------------------------------------- #
#  Permisos
# --------------------------------------------------------------------------- #
P_READ = "read"                              # lectura general del sistema
P_SOURCE_WRITE = "source:write"
P_SCAN_RUN = "scan:run"
P_STAGING_ASSIGN = "staging:assign"
P_TECHNOLOGY_WRITE = "technology:write"
P_CYCLE_WRITE = "cycle:write"
P_CYCLE_CLOSE = "cycle:close"
P_CATALOG_WRITE = "catalog:write"
P_SCREENING_WRITE = "screening:write"        # filtrado, fusion y exclusion (fase 3)
# Sincronizar el indice del INVIMA cambia la referencia regulatoria de todo el
# instituto, no el expediente de una tecnologia: se separa de `screening:write`.
P_INVIMA_SYNC = "invima:sync"
P_RATE_TECNICO = "priority:rate:tecnico"     # P1, P5, P6
P_RATE_CLINICO = "priority:rate:clinico"     # P2, P3
P_RATE_ORGANIZACIONAL = "priority:rate:p4"   # P4 (responsable por definir)
P_REPORT_WRITE = "report:write"
P_REVIEW_SUBMIT = "review:submit"
P_NOTE_WRITE = "note:write"
P_AUDIT_READ = "audit:read"
P_USER_MANAGE = "user:manage"
P_CONFIG_MANAGE = "config:manage"
P_RESTRICTED_ANALYTICS = "analytics:restricted"

_EVALUADOR_BASE = {
    P_READ,
    P_SOURCE_WRITE,
    P_SCAN_RUN,
    P_STAGING_ASSIGN,
    P_TECHNOLOGY_WRITE,
    P_SCREENING_WRITE,
    P_REPORT_WRITE,
    P_NOTE_WRITE,
}

ROLE_PERMISSIONS: dict[str, set[str]] = {
    SUPERADMIN: {
        P_READ,
        P_SOURCE_WRITE,
        P_SCAN_RUN,
        P_STAGING_ASSIGN,
        P_TECHNOLOGY_WRITE,
        P_CYCLE_WRITE,
        P_CYCLE_CLOSE,
        P_CATALOG_WRITE,
        P_SCREENING_WRITE,
        P_INVIMA_SYNC,
        P_RATE_TECNICO,
        P_RATE_CLINICO,
        P_RATE_ORGANIZACIONAL,
        P_REPORT_WRITE,
        P_REVIEW_SUBMIT,
        P_NOTE_WRITE,
        P_AUDIT_READ,
        P_USER_MANAGE,
        P_CONFIG_MANAGE,
        P_RESTRICTED_ANALYTICS,
    },
    EVALUADOR_TECNICO: _EVALUADOR_BASE | {P_RATE_TECNICO, P_CYCLE_WRITE, P_INVIMA_SYNC},
    EVALUADOR_CLINICO: _EVALUADOR_BASE | {P_RATE_CLINICO, P_RATE_ORGANIZACIONAL},
    TOMADOR_DECISIONES: {P_READ, P_NOTE_WRITE, P_RESTRICTED_ANALYTICS},
    REVISOR_PARES: {P_READ, P_REVIEW_SUBMIT},
}

# --------------------------------------------------------------------------- #
#  Permisos a nivel de campo: matriz de priorizacion
# --------------------------------------------------------------------------- #
# P4 queda asignado al evaluador clinico segun las Tablas 2 y 3; la guia tecnica
# del numeral 3.4.2 lo asigna al perfil farmaceutico o biomedico. Mientras la
# coordinacion metodologica no cierre la decision (ver BACKLOG, decision D-02),
# se habilita un permiso propio que hoy poseen el clinico y el superadmin.
CRITERION_PERMISSION: dict[str, str] = {
    "P1": P_RATE_TECNICO,
    "P2": P_RATE_CLINICO,
    "P3": P_RATE_CLINICO,
    "P4": P_RATE_ORGANIZACIONAL,
    "P5": P_RATE_TECNICO,
    "P6": P_RATE_TECNICO,
}


def canonical_role(role: str | None) -> str:
    """Normaliza un rol heredado o desconocido a uno de los cinco perfiles."""
    value = (role or "").strip().lower()
    if value in ROLE_PERMISSIONS:
        return value
    return LEGACY_ROLE_MAP.get(value, TOMADOR_DECISIONES)


def permissions_for(role: str | None) -> set[str]:
    return set(ROLE_PERMISSIONS[canonical_role(role)])


def has_permission(user, permission: str) -> bool:
    return permission in permissions_for(getattr(user, "role", None))


def can_rate(user, criterion: str) -> bool:
    permission = CRITERION_PERMISSION.get((criterion or "").upper())
    return bool(permission) and has_permission(user, permission)


def rateable_criteria(user) -> list[str]:
    perms = permissions_for(getattr(user, "role", None))
    return [code for code, perm in CRITERION_PERMISSION.items() if perm in perms]


def role_label(role: str | None) -> str:
    return ROLE_LABELS.get(canonical_role(role), canonical_role(role))
