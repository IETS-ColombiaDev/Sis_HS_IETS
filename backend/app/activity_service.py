"""Lo último que hizo una persona en el sistema, para retomar el trabajo desde la bandeja.

Lee la bitácora del propio usuario y la resume: una línea por operación (una
petición puede dejar varias filas), con el nombre de lo que tocó y la pantalla
donde se sigue. No muestra accesos ni tareas automáticas.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from .models import AuditLog, Bulletin, Cycle, EvaluationDoc, Recommendation, Source, Technology, User

# Acciones de negocio con nombre propio. Lo demás se describe por la entidad.
ACTION_LABELS = {
    "cycle:transition": "Cambió la etapa de un ciclo",
    "cycle:close": "Cerró un ciclo",
    "cycle:carry_over": "Arrastró tecnologías bajo vigilancia",
    "cycle:export": "Descargó el listado de ciclos",
    "staging:assign_batch": "Asignó tecnologías a un ciclo",
    "screening:novelty_saved": "Verificó la novedad de una tecnología",
    "screening:merge_confirmed": "Fusionó tecnologías duplicadas",
    "screening:merge_discarded": "Descartó una propuesta de fusión",
    "screening:invima_check": "Consultó el registro INVIMA",
    "screening:dedup_scan": "Buscó duplicados",
    "priority:classify": "Clasificó una tecnología en la matriz",
    "priority:export": "Descargó la matriz de priorización",
    "report:save": "Guardó un expediente de evaluación",
    "report:transition": "Cambió el estado de un expediente",
    "review:invite": "Invitó a un revisor",
    "review:submit": "Entregó una revisión",
    "review:comment_resolved": "Resolvió una observación",
    "review:comment_reopened": "Reabrió una observación",
    "recommendation:validated": "Validó un informe de diseminación",
    "recommendation:reopened": "Devolvió un informe a borrador",
    "recommendation:export": "Descargó el listado de informes",
    "dissemination:package": "Descargó el paquete de diseminación",
    "bulletin:compile": "Compiló un boletín",
    "bulletin:edit": "Editó un boletín",
    "bulletin:approve": "Aprobó un boletín",
    "bulletin:unapprove": "Anuló la aprobación de un boletín",
    "bulletin:publish": "Publicó un boletín",
    "bulletin:distribute": "Envió un boletín a la alta dirección",
    "bulletin:export": "Descargó un boletín en PDF",
    "strategy:export": "Descargó el recorte del tablero",
    "strategy:refresh": "Recalculó el tablero",
    "schedule:config": "Cambió la vigilancia programada",
    "signals:window_apply": "Aplicó la ventana de señales",
    "note:create": "Escribió una nota",
    "note:edit": "Editó una nota",
    "note:delete": "Eliminó una nota",
    "note:export": "Descargó las notas",
}
ENTITY_NAMES = {
    "technologies": "una tecnología",
    "cycles": "un ciclo",
    "cycle_technologies": "una tecnología del ciclo",
    "priority_scores": "una calificación P1-P6",
    "sources": "una fuente",
    "findings": "una señal",
    "recommendations": "un informe de diseminación",
    "evaluation_docs": "un expediente de evaluación",
    "bulletins": "un boletín",
    "submissions": "una postulación",
    "notes": "una nota",
    "novelty_assessments": "una verificación de novedad",
    "merge_proposals": "una propuesta de fusión",
    "users": "un usuario",
    "methodology_params": "un parámetro metodológico",
    "clusters": "un clúster",
    "tech_types": "una tipología",
}
GENERIC_VERBS = {"create": "Creó", "update": "Editó", "delete": "Eliminó"}
ENTITY_LINKS = {
    "cycles": "/ciclos",
    "sources": "/fuentes",
    "findings": "/senales",
    "recommendations": "/diseminacion",
    "evaluation_docs": "/evaluacion",
    "bulletins": "/boletines",
    "submissions": "/postulaciones",
    "notes": "/notas",
    "novelty_assessments": "/filtrado",
    "merge_proposals": "/filtrado",
    "priority_scores": "/priorizacion",
    "strategy_dashboard": "/dashboards",
    "users": "/usuarios",
    "methodology_params": "/configuracion",
    "clusters": "/configuracion",
    "tech_types": "/configuracion",
}
TECH_PAGES = {
    "capturada_no_asignada": "/bandeja-entrada",
    "asignada_a_ciclo": "/filtrado",
    "excluida": "/filtrado",
    "filtrada_apta_priorizacion": "/priorizacion",
    "bajo_vigilancia": "/priorizacion",
    "no_priorizada": "/priorizacion",
    "priorizada": "/evaluacion",
    "en_evaluacion": "/evaluacion",
    "publicada": "/evaluacion",
}
SCAN = 400  # filas de bitácora que se leen para armar la lista


def _rank(ev: AuditLog) -> int:
    """Qué fila representa mejor a la operación: la de negocio antes que la genérica."""
    if ev.action in ACTION_LABELS:
        return 0
    if ev.action in GENERIC_VERBS and ev.entity_type in ENTITY_NAMES:
        return 1 if ev.entity_type not in ("cycle_technologies", "priority_scores") else 2
    return 9


def _int(value) -> int | None:
    text = str(value or "")
    return int(text) if text.isdigit() else None


def recent(db: Session, user: User, limit: int = 8) -> list[dict]:
    rows = (
        db.query(AuditLog)
        .filter(AuditLog.user_id == user.id)
        .order_by(AuditLog.occurred_at.desc(), AuditLog.id.desc())
        .limit(SCAN)
        .all()
    )
    picked: list[AuditLog] = []
    seen: set[str] = set()
    for ev in rows:
        group = ev.request_id or f"fila-{ev.id}"
        if group in seen:
            continue
        candidates = [e for e in rows if (e.request_id or f"fila-{e.id}") == group]
        best = min(candidates, key=lambda e: (_rank(e), e.id))
        seen.add(group)
        if _rank(best) >= 9:
            continue
        # La misma acción repetida sobre lo mismo (guardar varias veces) cuenta una vez.
        if picked and (picked[-1].action, picked[-1].entity_type, picked[-1].entity_id) == (best.action, best.entity_type, best.entity_id):
            continue
        picked.append(best)
        if len(picked) >= limit:
            break

    def ids(entity: str) -> set[int]:
        return {i for i in (_int(e.entity_id) for e in picked if e.entity_type == entity) if i is not None}

    def load(model, entity: str) -> dict:
        wanted = ids(entity)
        return {r.id: r for r in db.query(model).filter(model.id.in_(wanted)).all()} if wanted else {}

    techs = load(Technology, "technologies")
    cycles = load(Cycle, "cycles")
    sources = load(Source, "sources")
    recs = load(Recommendation, "recommendations")
    docs = load(EvaluationDoc, "evaluation_docs")
    bulletins = load(Bulletin, "bulletins")
    dash_cycles = (
        {c.id: c for c in db.query(Cycle).filter(Cycle.id.in_(ids("strategy_dashboard"))).all()}
        if ids("strategy_dashboard")
        else {}
    )

    out = []
    for ev in picked:
        eid = _int(ev.entity_id)
        if ev.action in ACTION_LABELS:
            label = ACTION_LABELS[ev.action]
        else:
            label = f"{GENERIC_VERBS[ev.action]} {ENTITY_NAMES[ev.entity_type]}"
        name = ""
        to = ENTITY_LINKS.get(ev.entity_type, "")
        if ev.entity_type == "technologies" and eid in techs:
            tech = techs[eid]
            name = (tech.commercial_name or tech.inn_name or "").strip()
            page = TECH_PAGES.get(tech.status or "")
            to = f"{page}?tecnologia={tech.id}" if page else ""
        elif ev.entity_type == "cycles" and eid in cycles:
            name = cycles[eid].code
        elif ev.entity_type == "sources" and eid in sources:
            name = sources[eid].title or ""
        elif ev.entity_type == "recommendations" and eid in recs:
            name = recs[eid].title or ""
        elif ev.entity_type == "evaluation_docs" and eid in docs:
            name = docs[eid].title or ""
        elif ev.entity_type == "bulletins" and eid in bulletins:
            name = bulletins[eid].title or ""
        elif ev.entity_type == "strategy_dashboard" and eid in dash_cycles:
            name = dash_cycles[eid].code
            to = f"/dashboards?ciclo={eid}"
        if ev.action == "delete":
            to = ENTITY_LINKS.get(ev.entity_type, "")  # lo eliminado ya no tiene pantalla propia
        out.append(
            {
                "label": label,
                "name": name[:160],
                "to": to,
                "at": ev.occurred_at.isoformat() if ev.occurred_at else "",
            }
        )
    return out
