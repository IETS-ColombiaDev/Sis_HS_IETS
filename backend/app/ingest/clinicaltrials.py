"""Conector de ClinicalTrials.gov, API REST v2 (RF01).

Es la fuente mas informativa del escaneo: entrega la fase, la fecha estimada de
finalizacion, el patrocinador y el tipo de intervencion, que son justo los
insumos del pre-llenado de P5, P6 y del time-to-market.
"""
from __future__ import annotations

from .base import (
    CanonicalRecord,
    Connector,
    ConnectorResult,
    clean_text,
    parse_compact_date,
    register,
    request_json,
)

API_URL = "https://clinicaltrials.gov/api/v2/studies"

# El plan acota el escaneo a fases II, III y IV: antes de fase II la senal es
# demasiado temprana para un ciclo de 10 a 16 semanas.
DEFAULT_PHASES = ("PHASE2", "PHASE3", "PHASE4")

# Correspondencia con la taxonomia heredada de `Finding.technology_type`.
INTERVENTION_TYPE_MAP = {
    "DRUG": "medicamento",
    "BIOLOGICAL": "medicamento",
    "GENETIC": "medicamento",
    "COMBINATION_PRODUCT": "medicamento",
    "DEVICE": "dispositivo",
    "DIAGNOSTIC_TEST": "dispositivo",
    "RADIATION": "dispositivo",
    "PROCEDURE": "otro",
    "BEHAVIORAL": "digital",
    "OTHER": "otro",
}

PHASE_LABEL = {
    "PHASE1": "Fase I",
    "PHASE2": "Fase II",
    "PHASE3": "Fase III",
    "PHASE4": "Fase IV",
    "EARLY_PHASE1": "Fase I temprana",
    "NA": "No aplica",
}

# Un ensayo cuyo reclutamiento no ha terminado esta mas lejos del mercado que
# uno ya completado. Alimenta el horizonte heredado.
HORIZON_BY_STATUS = {
    "COMPLETED": "inminente",
    "ACTIVE_NOT_RECRUITING": "transicional",
    "ENROLLING_BY_INVITATION": "transicional",
    "RECRUITING": "emergente",
    "NOT_YET_RECRUITING": "emergente",
}


class ClinicalTrialsConnector(Connector):
    code = "clinicaltrials"
    label = "ClinicalTrials.gov (API v2)"
    description = (
        "Registro de ensayos clínicos de los NIH. Filtra fases II, III y IV y "
        "extrae fecha estimada de finalización, patrocinador e intervención."
    )
    # Su WAF responde 403 a cualquier User-Agent que no reconozca. Con el
    # encabezado por defecto del cliente HTTP la peticion pasa.
    send_user_agent = False
    min_interval = 1.5
    adapter_version = "2"

    def fetch(self, *, config: dict, url: str = "") -> ConnectorResult:
        config = config or {}
        phases = config.get("phases") or list(DEFAULT_PHASES)
        page_size = int(config.get("page_size", 50))
        term = clean_text(config.get("query_term", ""))

        params: dict[str, object] = {
            "pageSize": max(1, min(page_size, 200)),
            "sort": "LastUpdatePostDate:desc",
            "countTotal": "true",
        }
        advanced = f"AREA[Phase]({' OR '.join(phases)})" if phases else ""
        if advanced:
            params["filter.advanced"] = advanced
        if term:
            params["query.term"] = term
        if config.get("statuses"):
            params["filter.overallStatus"] = ",".join(config["statuses"])
        cursor = clean_text(config.get("pageToken") or config.get("cursor") or "")
        if cursor:
            params["pageToken"] = cursor

        data = request_json(
            API_URL,
            params=params,
            connector_code=self.code,
            send_user_agent=self.send_user_agent,
            min_interval=self.min_interval,
        )

        studies = data.get("studies") or []
        records = [self._to_record(s) for s in studies]
        records = [r for r in records if r is not None]
        total = data.get("totalCount")
        next_token = clean_text(data.get("nextPageToken"))
        message = f"{len(records)} estudios de {total if total is not None else 'n/d'} disponibles."
        if next_token:
            message += " Hay más páginas; el cursor queda persistido."
        from .base import schema_signature

        return ConnectorResult(
            records=records,
            message=message,
            next_cursor=next_token or None,
            schema_signature=schema_signature(data),
            adapter_version=self.adapter_version,
            endpoint=API_URL,
        )

    def _to_record(self, study: dict) -> CanonicalRecord | None:
        protocol = study.get("protocolSection") or {}
        ident = protocol.get("identificationModule") or {}
        nct_id = clean_text(ident.get("nctId"))
        if not nct_id:
            return None

        status_mod = protocol.get("statusModule") or {}
        design = protocol.get("designModule") or {}
        arms = protocol.get("armsInterventionsModule") or {}
        conditions_mod = protocol.get("conditionsModule") or {}
        sponsor_mod = protocol.get("sponsorCollaboratorsModule") or {}
        description = protocol.get("descriptionModule") or {}

        interventions = arms.get("interventions") or []
        primary = interventions[0] if interventions else {}
        intervention_name = clean_text(primary.get("name"), 400)
        intervention_type = (primary.get("type") or "").upper()

        phases = [p.upper() for p in (design.get("phases") or [])]
        phase_label = ", ".join(PHASE_LABEL.get(p, p) for p in phases) if phases else ""

        overall_status = (status_mod.get("overallStatus") or "").upper()
        conditions = [clean_text(c) for c in (conditions_mod.get("conditions") or []) if c]

        # La finalizacion primaria es la fecha que importa para el horizonte: es
        # cuando se sabra si el desenlace principal se cumplio.
        completion = (status_mod.get("primaryCompletionDateStruct") or {}).get("date") or (
            status_mod.get("completionDateStruct") or {}
        ).get("date")
        completion_date = parse_compact_date(completion)

        title = clean_text(ident.get("briefTitle") or ident.get("officialTitle"), 590)
        summary = clean_text(description.get("briefSummary"), 1500)

        return CanonicalRecord(
            external_id=nct_id,
            title=title or nct_id,
            url=f"https://clinicaltrials.gov/study/{nct_id}",
            summary=summary or clean_text(primary.get("description"), 1500),
            commercial_name=intervention_name or title[:400],
            manufacturer=clean_text((sponsor_mod.get("leadSponsor") or {}).get("name"), 300),
            mechanism=clean_text(primary.get("description"), 2000),
            indication="; ".join(conditions)[:2000],
            therapeutic_area="; ".join(conditions)[:300],
            technology_type=INTERVENTION_TYPE_MAP.get(intervention_type, "otro"),
            development_phase=phase_label,
            horizon=HORIZON_BY_STATUS.get(overall_status, "emergente"),
            nct_ids=[nct_id],
            # Solo se toma como fin de fase III si el estudio declara esa fase.
            phase3_completion_date=completion_date if "PHASE3" in phases else None,
            regulatory_status=f"Ensayo clinico {overall_status.replace('_', ' ').title()}".strip(),
            published_date=(status_mod.get("lastUpdatePostDateStruct") or {}).get("date", ""),
            raw=study,
        )


register(ClinicalTrialsConnector())
