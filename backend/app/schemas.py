"""Esquemas Pydantic (validacion y serializacion de la API)."""
from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


# --------------------------------------------------------------------------- #
#  Auth / Users
# --------------------------------------------------------------------------- #
class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    name: str
    picture: str
    role: str
    role_label: str = ""
    permissions: list[str] = []
    rateable_criteria: list[str] = []
    is_active: bool
    created_at: datetime
    last_login: datetime | None = None


class UserRoleUpdate(BaseModel):
    role: str = Field(
        pattern="^(superadmin|evaluador_tecnico|evaluador_clinico|tomador_decisiones|revisor_pares)$"
    )


class RoleOption(BaseModel):
    code: str
    label: str
    permissions: list[str]


class UserActiveUpdate(BaseModel):
    is_active: bool


class GoogleLoginIn(BaseModel):
    credential: str  # id_token JWT de Google Identity Services


class DevLoginIn(BaseModel):
    email: str
    name: str = ""


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# --------------------------------------------------------------------------- #
#  Sources
# --------------------------------------------------------------------------- #
class SourceBase(BaseModel):
    title: str
    url: str = ""
    category: str = ""
    authors: str = ""
    year: str = ""
    description: str = ""
    relation_iets: str = ""
    language: str = ""
    resource_type: str = ""
    link_status: str = ""
    scrape_enabled: bool = True
    tags: str = ""
    connector: str = "html"
    connector_config: dict | None = None
    scan_interval_hours: int = 24


class SourceCreate(SourceBase):
    pass


class SourceQuickCreate(BaseModel):
    """Alta rapida: solo nombre y URL."""
    title: str
    url: str


class SourceUpdate(BaseModel):
    title: str | None = None
    url: str | None = None
    category: str | None = None
    authors: str | None = None
    year: str | None = None
    description: str | None = None
    relation_iets: str | None = None
    language: str | None = None
    resource_type: str | None = None
    link_status: str | None = None
    scrape_enabled: bool | None = None
    tags: str | None = None
    connector: str | None = None
    connector_config: dict | None = None
    scan_interval_hours: int | None = None


class SourceOut(SourceBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    last_scraped_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    findings_count: int = 0
    last_error: str = ""
    failure_streak: int = 0
    circuit_open_until: datetime | None = None


# --------------------------------------------------------------------------- #
#  Findings
# --------------------------------------------------------------------------- #
class FindingBase(BaseModel):
    title: str
    url: str = ""
    summary: str = ""
    technology: str = ""
    technology_type: str = ""
    horizon: str = ""
    phase: str = ""
    therapeutic_area: str = ""
    published_date: str = ""
    status: str = "nuevo"
    screening_score: int = 0


class FindingCreate(FindingBase):
    source_id: int


class FindingUpdate(BaseModel):
    title: str | None = None
    url: str | None = None
    summary: str | None = None
    technology: str | None = None
    technology_type: str | None = None
    horizon: str | None = None
    phase: str | None = None
    therapeutic_area: str | None = None
    published_date: str | None = None
    status: str | None = None
    screening_score: int | None = Field(None, ge=0, le=100)


class FindingOut(FindingBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    source_id: int
    source_title: str = ""
    source_category: str = ""
    source_url: str = ""
    raw_content: str = ""
    created_at: datetime
    updated_at: datetime
    recommendations_count: int = 0
    notes_count: int = 0
    technology_id: int | None = None


# --------------------------------------------------------------------------- #
#  Recommendations
# --------------------------------------------------------------------------- #
class RecommendationCreate(BaseModel):
    finding_id: int | None = None
    title: str = ""
    content: str = ""
    impact: str = ""


class RecommendationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    finding_id: int | None
    title: str
    content: str
    impact: str
    model_used: str
    created_by: str
    created_at: datetime


class RecommendationUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    impact: str | None = None


class GenerateRecommendationIn(BaseModel):
    finding_id: int


# --------------------------------------------------------------------------- #
#  Notes (notas de trabajo del equipo)
# --------------------------------------------------------------------------- #
class NoteCreate(BaseModel):
    entity_type: str = "general"  # finding | source | recommendation | general
    entity_id: int | None = None
    title: str = ""
    content: str
    pinned: bool = False


class NoteUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    pinned: bool | None = None


class NoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    entity_type: str
    entity_id: int | None = None
    title: str
    content: str
    author_email: str
    author_name: str
    pinned: bool
    created_at: datetime
    updated_at: datetime
    entity_label: str = ""


class AiEnhanceOut(BaseModel):
    ok: bool
    message: str = ""
    model_used: str = ""


# --------------------------------------------------------------------------- #
#  Scan / Scrape
# --------------------------------------------------------------------------- #
class ScrapeLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    source_id: int | None
    source_title: str = ""
    status: str
    items_found: int
    items_new: int
    message: str
    triggered_by: str
    started_at: datetime
    finished_at: datetime | None = None


class ScanRequest(BaseModel):
    source_ids: list[int] | None = None  # None => todas las habilitadas


class LinkPreviewIn(BaseModel):
    url: str


class PreviewCandidate(BaseModel):
    title: str
    technology_type: str = ""
    horizon: str = ""


class LinkPreviewOut(BaseModel):
    ok: bool
    url: str
    content_type: str = ""
    title: str = ""
    description: str = ""
    main_text: str = ""
    candidates: list[PreviewCandidate] = []
    candidates_count: int = 0
    message: str = ""


class ScanResult(BaseModel):
    logs: list[ScrapeLogOut]
    total_new: int
    total_found: int


# --------------------------------------------------------------------------- #
#  Chat
# --------------------------------------------------------------------------- #
class ChatMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    role: str
    content: str
    sources_used: str = ""
    created_at: datetime


class ChatSessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    user_email: str
    created_at: datetime
    updated_at: datetime


class ChatSessionDetail(ChatSessionOut):
    messages: list[ChatMessageOut] = []


class ChatSendIn(BaseModel):
    session_id: int | None = None
    message: str


class ChatSendOut(BaseModel):
    session: ChatSessionOut
    answer: ChatMessageOut
    model_used: str


# --------------------------------------------------------------------------- #
#  Dashboard / realtime / system
# --------------------------------------------------------------------------- #
class CountItem(BaseModel):
    label: str
    value: int


class DashboardStats(BaseModel):
    total_sources: int
    total_findings: int
    total_recommendations: int
    total_scrapes: int
    findings_last_7d: int
    by_category: list[CountItem]
    by_horizon: list[CountItem]
    by_technology_type: list[CountItem]
    by_status: list[CountItem]
    by_language: list[CountItem]
    top_sources: list[CountItem]
    recent_findings: list[FindingOut]
    last_scan: ScrapeLogOut | None = None


class WorkbenchStats(BaseModel):
    """Bandeja diaria del tecnico de escaneo de horizonte."""
    pending_review: int  # status=nuevo
    in_triage: int  # revisado
    prioritized: int  # priorizado
    high_priority: int  # priority_score >= 70
    needs_characterization: int  # priorizado o revisado sin ficha completa
    pending_recommendations: int  # priorizado sin recomendacion IA
    findings_last_7d: int
    sources_enabled: int
    last_scan: ScrapeLogOut | None = None
    queue: list[FindingOut]  # cola de trabajo (nuevos + alta prioridad)
    # Contexto metodologico (fases 1 y 2)
    active_cycle_id: int | None = None
    active_cycle_code: str = ""
    active_cycle_status: str = ""
    active_cycle_status_label: str = ""
    staging_unassigned: int = 0
    cycle_pending_rating: int = 0
    cycle_pending_for_me: int = 0
    cycle_prioritized: int = 0
    cycle_watchlist: int = 0
    my_criteria: list[str] = []


class StateVersionOut(BaseModel):
    version: int
    updated_at: datetime | None = None


class SystemStatus(BaseModel):
    gemini_enabled: bool
    gemini_model: str
    google_login_enabled: bool
    google_client_id: str
    dev_login_enabled: bool
    allowed_domain: str
    version: str
    recaptcha_site_key: str = ""


# --------------------------------------------------------------------------- #
#  Configuracion (panel de administracion)
# --------------------------------------------------------------------------- #
class ConfigOut(BaseModel):
    gemini_enabled: bool
    gemini_has_key: bool
    gemini_key_masked: str = ""
    gemini_model: str = ""          # modelo preferido fijado (vacio = auto)
    gemini_active_model: str = ""   # modelo efectivamente en uso
    available_models: list[str] = []
    google_login_enabled: bool
    dev_login_enabled: bool
    allowed_domain: str
    total_sources: int = 0
    total_findings: int = 0
    version: str


class ConfigUpdate(BaseModel):
    gemini_api_key: str | None = None  # None = no cambiar; "" = borrar
    gemini_model: str | None = None


class GeminiTestIn(BaseModel):
    gemini_api_key: str | None = None  # opcional: probar una key sin guardarla


class GeminiTestOut(BaseModel):
    ok: bool
    message: str
    model: str = ""
    available_models: list[str] = []


# =========================================================================== #
#  FASE 0 - Auditoria
# =========================================================================== #
class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_email: str
    user_role: str
    ip_address: str
    occurred_at: datetime
    entity_type: str
    entity_id: str
    action: str
    old_value: dict | None = None
    new_value: dict | None = None
    request_id: str
    request_path: str


class AuditPage(BaseModel):
    items: list[AuditLogOut]
    total: int
    limit: int
    offset: int


# =========================================================================== #
#  FASE 1 - Catalogos, ciclos, tecnologias
# =========================================================================== #
class CatalogItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    description: str = ""
    sort_order: int = 0
    is_active: bool = True


class CatalogItemCreate(BaseModel):
    code: str
    name: str
    description: str = ""
    keywords: list[str] = []
    sort_order: int = 0


class CatalogItemUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    keywords: list[str] | None = None
    sort_order: int | None = None
    is_active: bool | None = None


class MethodologyParamOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    key: str
    value: str
    value_type: str
    description: str = ""
    updated_at: datetime


class MethodologyParamUpdate(BaseModel):
    value: str


class CycleBase(BaseModel):
    code: str
    opened_on: date
    data_cutoff_on: date
    bulletin_due_on: date | None = None
    notes: str = ""


class CycleCreate(CycleBase):
    pass


class CycleUpdate(BaseModel):
    code: str | None = None
    opened_on: date | None = None
    data_cutoff_on: date | None = None
    bulletin_due_on: date | None = None
    notes: str | None = None


class CycleStatusUpdate(BaseModel):
    status: str
    justification: str = ""


class CycleSummary(BaseModel):
    total: int = 0
    assigned: int = 0
    filtered: int = 0
    excluded: int = 0
    prioritized: int = 0
    watchlist: int = 0
    not_prioritized: int = 0
    in_evaluation: int = 0
    published: int = 0


class CycleOut(CycleBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    year: int
    status: str
    status_label: str = ""
    is_historic: bool = False
    closed_at: datetime | None = None
    created_at: datetime
    allowed_transitions: list[str] = []
    summary: CycleSummary = CycleSummary()


class CycleCarryOverIn(BaseModel):
    target_cycle_id: int


class TechnologyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    commercial_name: str = ""
    inn_name: str = ""
    manufacturer: str = ""
    indication: str = ""
    mechanism: str = ""
    summary: str = ""
    url: str = ""
    nct_ids: list[str] = []
    cluster_id: int | None = None
    cluster_name: str = ""
    tech_type_id: int | None = None
    tech_type_name: str = ""
    suggested_cluster_id: int | None = None
    suggested_cluster_name: str = ""
    suggested_cluster_reason: str = ""
    condition: str = ""
    horizon: str = ""
    atc_code: str = ""
    icd10_codes: list[str] = []
    development_phase: str = ""
    regulatory_status: str = ""
    invima_registry: str = ""
    phase3_completion_date: date | None = None
    fda_approval_date: date | None = None
    ema_approval_date: date | None = None
    source_channel: str = "proactiva"
    source_id: int | None = None
    source_title: str = ""
    has_raw: bool = False
    raw_origin: str = ""
    finding_id: int | None = None
    captured_at: datetime
    captured_by: str = ""
    status: str = "capturada_no_asignada"
    status_label: str = ""
    screening_score: int = 0
    created_at: datetime
    updated_at: datetime
    # Contexto de ciclo (cuando se consulta dentro de un ciclo)
    cycle_id: int | None = None
    cycle_status: str = ""
    cycle_status_label: str = ""
    priority_pct: float | None = None
    priority_points: int | None = None
    frozen: bool = False
    previous_priority_pct: float | None = None
    carried_from_cycle_id: int | None = None
    criteria_rated: int = 0
    criteria_total: int = 6


class TechnologyUpdate(BaseModel):
    commercial_name: str | None = None
    inn_name: str | None = None
    manufacturer: str | None = None
    indication: str | None = None
    mechanism: str | None = None
    summary: str | None = None
    nct_ids: list[str] | None = None
    cluster_id: int | None = None
    tech_type_id: int | None = None
    condition: str | None = Field(None, pattern="^(emergente|nueva)?$")
    atc_code: str | None = None
    icd10_codes: list[str] | None = None
    development_phase: str | None = None
    regulatory_status: str | None = None
    invima_registry: str | None = None
    phase3_completion_date: date | None = None
    fda_approval_date: date | None = None
    ema_approval_date: date | None = None


class AssignToCycleIn(BaseModel):
    technology_ids: list[int]
    cycle_id: int | None = None  # None => ciclo activo


class AssignToCycleOut(BaseModel):
    cycle_id: int
    cycle_code: str
    assigned: int
    skipped: int
    rejected: list[str] = []


class ExclusionIn(BaseModel):
    reason_code: str
    note: str = ""


class StagingStats(BaseModel):
    total: int
    unassigned: int
    by_channel: list[CountItem] = []
    by_source: list[CountItem] = []
    without_cluster: int = 0
    without_tech_type: int = 0


# =========================================================================== #
#  FASE 2 - Motor de priorizacion %P
# =========================================================================== #
class PriorityCriterionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    code: str
    version: int
    prompt: str
    short_label: str = ""
    role_scope: str = ""
    auto_prefill: bool = False
    sort_order: int = 0
    source_reference: str = ""


class PriorityScoreOut(BaseModel):
    criterion: str
    value: int | None = None
    justification: str = ""
    rated_by_email: str = ""
    rated_at: datetime | None = None
    auto_suggested: int | None = None
    auto_reason: str = ""
    can_rate: bool = False


class PriorityStateOut(BaseModel):
    cycle_id: int
    technology_id: int
    technology_name: str = ""
    complete: bool = False
    missing: list[str] = []
    rated: int = 0
    total_criteria: int = 6
    points: int | None = None
    priority_pct: float | None = None
    classification: str | None = None
    frozen: bool = False
    threshold_points: int = 4
    watch_points: int = 3
    threshold_pct_label: int = 70
    criteria: list[PriorityCriterionOut] = []
    scores: list[PriorityScoreOut] = []


class RateCriterionIn(BaseModel):
    criterion: str = Field(pattern="^P[1-6]$")
    value: int = Field(ge=0, le=1)
    justification: str = ""


class PriorityQueueItem(BaseModel):
    technology_id: int
    cycle_id: int
    name: str
    cluster_name: str = ""
    tech_type_name: str = ""
    condition: str = ""
    status: str
    priority_pct: float | None = None
    points: int | None = None
    rated: int = 0
    total_criteria: int = 6
    frozen: bool = False
    pending_for_me: bool = False
    screening_score: int = 0


# =========================================================================== #
#  FASE 3 - Filtrado, desduplicacion e INVIMA
# =========================================================================== #
class TechnologyBrief(BaseModel):
    """Ficha minima para comparar dos registros lado a lado."""

    id: int
    commercial_name: str = ""
    inn_name: str = ""
    manufacturer: str = ""
    indication: str = ""
    atc_code: str = ""
    nct_ids: list[str] = []
    condition: str = ""
    cluster_name: str = ""
    tech_type_name: str = ""
    source_name: str = ""
    captured_at: datetime | None = None
    status: str = ""
    screening_score: int = 0


class MergeProposalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    technology_a_id: int
    technology_b_id: int
    cycle_id: int | None = None
    score: float = 0
    decisive: bool = False
    matched_on: list[str] = []
    detail: dict = {}
    status: str = "propuesta"
    kept_technology_id: int | None = None
    resolution_note: str = ""
    resolved_by: str = ""
    resolved_at: datetime | None = None
    detected_at: datetime | None = None
    technology_a: TechnologyBrief | None = None
    technology_b: TechnologyBrief | None = None


class MergeScanOut(BaseModel):
    detected: int = 0
    created: int = 0
    refreshed: int = 0
    pending: int = 0
    threshold: int = 85


class MergeResolveIn(BaseModel):
    keep_technology_id: int
    note: str = ""


class MergeDiscardIn(BaseModel):
    note: str = ""


class NoveltyOptionOut(BaseModel):
    code: str
    label: str
    requires_justification: bool = False


class InvimaMatchOut(BaseModel):
    registro: str = ""
    expediente: str = ""
    producto: str = ""
    titular: str = ""
    principio_activo: str = ""
    estado_registro: str = ""
    fecha_vencimiento: date | None = None
    score: float = 0
    matched_field: str = ""
    valid_registry: bool = False


class InvimaIndexOut(BaseModel):
    total_records: int = 0
    synced_at: datetime | None = None
    age_days: int | None = None
    stale: bool = True
    stale_after_days: int = 30
    warning: str = ""
    last_status: str = ""
    last_source: str = ""
    last_message: str = ""


class InvimaSyncOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    source: str = ""
    status: str = ""
    rows_ingested: int = 0
    rows_updated: int = 0
    message: str = ""
    started_at: datetime | None = None
    finished_at: datetime | None = None
    triggered_by: str = ""


class NoveltyOut(BaseModel):
    cycle_id: int
    technology_id: int
    technology_name: str = ""
    option_code: str = ""
    option_label: str = ""
    justification: str = ""
    requires_justification: bool = False
    invima_checked_at: datetime | None = None
    invima_match_count: int = 0
    invima_best_score: float = 0
    invima_registry: str = ""
    invima_holder: str = ""
    invima_status: str = ""
    has_valid_registry: bool = False
    sala_especializada_concept: str = ""
    sala_especializada_ref: str = ""
    assessed_by: str = ""
    assessed_at: datetime | None = None
    can_qualify: bool = False
    blocking_reason: str = ""
    matches: list[InvimaMatchOut] = []
    index: InvimaIndexOut | None = None


class NoveltyIn(BaseModel):
    option_code: str
    justification: str = ""
    sala_especializada_concept: str = ""
    sala_especializada_ref: str = ""


class UniqueListItem(BaseModel):
    technology_id: int
    commercial_name: str = ""
    inn_name: str = ""
    manufacturer: str = ""
    tech_type_name: str = ""
    condition: str = ""
    atc_code: str = ""
    icd10_codes: list[str] = []
    nct_ids: list[str] = []
    status: str = ""
    priority_pct: float | None = None
    invima_registry: str = ""


class UniqueListCluster(BaseModel):
    cluster_code: str
    cluster_name: str
    count: int = 0
    items: list[UniqueListItem] = []


class UniqueListOut(BaseModel):
    cycle_id: int
    cycle_code: str = ""
    cycle_status: str = ""
    frozen: bool = False
    generated_at: datetime | None = None
    total: int = 0
    excluded_count: int = 0
    merged_count: int = 0
    clusters: list[UniqueListCluster] = []


class ScreeningStats(BaseModel):
    pending_merges: int = 0
    confirmed_merges: int = 0
    assigned: int = 0
    qualified: int = 0
    excluded: int = 0
    novelty_assessed: int = 0
    invima_checked: int = 0
    dedup_threshold: int = 85
    invima_index: InvimaIndexOut | None = None
    exclusion_reasons: dict[str, str] = {}


class NormalizationOut(BaseModel):
    technology_id: int
    corregido: dict = {}
    rechazado: dict = {}
    sugerencias: dict = {}


# --------------------------------------------------------------------------- #
#  Fase 4: ingesta y postulacion
# --------------------------------------------------------------------------- #
class ConnectorOut(BaseModel):
    code: str
    label: str
    description: str = ""
    min_interval: float = 0.0
    requires_url: bool = False


class IngestRunIn(BaseModel):
    source_ids: list[int] = []
    process_now: bool = False


class IngestJobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    connector: str = ""
    source_id: int | None = None
    source_title: str = ""
    status: str
    attempts: int = 0
    items_found: int = 0
    items_new: int = 0
    message: str = ""
    triggered_by: str = ""
    origin: str = "manual"
    scheduled_for: datetime | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    created_at: datetime | None = None


class IngestRunOut(BaseModel):
    jobs: list[IngestJobOut]
    queued: int = 0
    processed: int = 0


class RawPreviewOut(BaseModel):
    technology_id: int
    origin: str = ""
    connector: str = ""
    external_id: str = ""
    fetched_at: datetime | None = None
    payload: dict = {}
    finding_id: int | None = None
    source_title: str = ""


class SubmissionPublicIn(BaseModel):
    commercial_name: str
    inn_name: str
    mechanism: str
    manufacturer: str
    indication: str
    development_phase: str
    evidence_links: list[str] = []
    has_conflict: bool = False
    conflict_statement: str = ""
    coi_accepted: bool = False
    submitter_name: str
    submitter_email: str
    submitter_org: str = ""
    recaptcha_token: str = ""
    website: str = ""  # honeypot: si viene lleno, se descarta en silencio


class SubmissionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    commercial_name: str
    inn_name: str = ""
    mechanism: str = ""
    manufacturer: str = ""
    indication: str = ""
    development_phase: str = ""
    evidence_links: list[str] = []
    has_conflict: bool = False
    conflict_statement: str = ""
    submitter_name: str = ""
    submitter_email: str = ""
    submitter_org: str = ""
    status: str
    review_note: str = ""
    reviewed_by: str = ""
    reviewed_at: datetime | None = None
    technology_id: int | None = None
    created_at: datetime


class SubmissionReviewIn(BaseModel):
    note: str = ""


class SubmissionPublicAck(BaseModel):
    id: int
    status: str
    message: str


# --------------------------------------------------------------------------- #
#  Fase 5: evaluacion temprana, Mini-HTA y revision por pares
# --------------------------------------------------------------------------- #
class EvaluationQueueItem(BaseModel):
    technology_id: int
    commercial_name: str = ""
    inn_name: str = ""
    entry_status: str = ""
    priority_points: int | None = None
    suggested_level: str = "ficha"
    suggested_level_label: str = ""
    doc_id: int | None = None
    doc_status: str = ""
    doc_status_label: str = ""
    product_level: str = ""
    completeness_pct: int = 0


class EvaluationDocUpdate(BaseModel):
    title: str | None = None
    product_level: str | None = None
    body: dict | None = None
    confidential: bool | None = None
    confidential_fields: list[str] | None = None


class EvaluationOpenIn(BaseModel):
    cycle_id: int
    technology_id: int
    product_level: str | None = None


class EvaluationTransitionIn(BaseModel):
    status: str
    note: str = ""


class EvaluationCoiIn(BaseModel):
    accepted: bool
    statement: str = ""
    has_conflict: bool = False


class ReviewInviteIn(BaseModel):
    kind: str = "externo"
    reviewer_name: str
    reviewer_email: str


class ReviewAssignmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    doc_id: int
    kind: str
    reviewer_name: str
    reviewer_email: str
    expires_at: datetime | None = None
    coi_signed: bool
    coi_has_conflict: bool = False
    status: str
    submitted_at: datetime | None = None
    created_at: datetime


class ReviewInviteOut(BaseModel):
    assignment: ReviewAssignmentOut
    token: str | None = None
    invite_path: str = ""


class ReviewCommentIn(BaseModel):
    field_key: str = ""
    body: str


class ReviewCommentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    doc_id: int
    assignment_id: int | None = None
    version_id: int | None = None
    field_key: str = ""
    body: str
    author: str = ""
    created_at: datetime


class ReviewSubmitIn(BaseModel):
    verdict: str
    note: str = ""


class EvaluationVersionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    doc_id: int
    major: int
    minor: int
    status: str
    body: dict | None = None
    note: str = ""
    created_by: str = ""
    created_at: datetime


class EvaluationCompleteness(BaseModel):
    required: list[str] = []
    missing: list[str] = []
    complete: bool = False
    pct: int = 0


class EvaluationDocOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    cycle_id: int
    technology_id: int
    product_level: str
    product_level_label: str = ""
    status: str
    status_label: str = ""
    allowed_transitions: list[str] = []
    title: str = ""
    body: dict | None = None
    confidential: bool = False
    confidential_fields: list[str] = []
    version_major: int = 0
    version_minor: int = 1
    created_by: str = ""
    updated_by: str = ""
    created_at: datetime
    updated_at: datetime
    published_at: datetime | None = None
    completeness: EvaluationCompleteness | None = None
    coi_required: bool = False
    assignments: list[ReviewAssignmentOut] = []
    comments: list[ReviewCommentOut] = []


class ReviewerAccessOut(BaseModel):
    access: str
    assignment_id: int
    doc_id: int
    title: str = ""
    product_level: str = ""
    product_level_label: str = ""
    status: str = ""
    reviewer_name: str = ""
    expires_at: datetime | None = None
    body: dict | None = None
    confidential: bool = False
    comments: list[ReviewCommentOut] = []
    field_labels: dict[str, str] = {}


# --------------------------------------------------------------------------- #
#  Fase 6: tablero estrategico, ficha publica, boletines y alertas
# --------------------------------------------------------------------------- #
class StrategyDashboardOut(BaseModel):
    cycle_id: int
    cycle_code: str = ""
    funnel: dict = {}
    by_cluster: list[dict] = []
    by_type: list[dict] = []
    by_band: list[dict] = []
    ttm_scatter: list[dict] = []
    restricted: bool = False
    from_cache: bool = False
    budget_heatmap: list[dict] | None = None
    budget_items: list[dict] | None = None
    comparators: list[dict] | None = None


class PublicStatsOut(BaseModel):
    published: int = 0
    cycles: int = 0
    by_cluster: list[dict] = []


class PublicFicheListItem(BaseModel):
    id: int
    doc_id: int
    title: str = ""
    commercial_name: str = ""
    inn_name: str = ""
    nct_ids: list[str] = []
    product_level: str = ""
    published_at: datetime | None = None


class PublicFicheOut(BaseModel):
    id: int
    doc_id: int
    title: str = ""
    commercial_name: str = ""
    inn_name: str = ""
    manufacturer: str = ""
    nct_ids: list[str] = []
    cluster: str = ""
    product_level: str = ""
    published_at: datetime | None = None
    ttm_band: str = ""
    ttm_band_label: str = ""
    body: dict = {}
    field_labels: dict[str, str] = {}


class BulletinOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    cycle_id: int
    title: str = ""
    status: str
    body: dict | None = None
    compiled_by: str = ""
    approved_by: str = ""
    published_at: datetime | None = None
    created_at: datetime


class BulletinDecisionIn(BaseModel):
    publish: bool = False


class AlertSubscriptionIn(BaseModel):
    cluster_id: int | None = None
    enabled: bool = True


class AlertSubscriptionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    cluster_id: int | None = None
    enabled: bool
    created_at: datetime


class AlertEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    kind: str
    title: str
    body: str = ""
    technology_id: int | None = None
    cluster_id: int | None = None
    read_at: datetime | None = None
    created_at: datetime

