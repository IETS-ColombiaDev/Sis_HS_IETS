/** Metodologia IETS de escaneo de horizonte — fases operativas del sistema.
 *
 *  Alineado con el Plan de actualizacion por fases: el ciclo operativo es el eje
 *  y la priorizacion usa la matriz oficial P1 a P6 (no la heuristica de cribado).
 */
export const IETS_PHASES = [
  {
    key: "identificacion",
    phase: "Fase 1",
    label: "Identificacion",
    short: "Vigilar fuentes y capturar senales",
    to: "/vigilancia",
    icon: "radar",
    hint: "Rastreo de referentes internacionales y captura en el staging",
  },
  {
    key: "priorizacion",
    phase: "Fase 2",
    label: "Priorizacion",
    short: "Calificar la matriz P1 a P6",
    to: "/priorizacion",
    icon: "layers",
    hint: "Matriz oficial de seis criterios binarios; %P = (suma / 6) x 100",
  },
  {
    key: "caracterizacion",
    phase: "Fase 3",
    label: "Evaluacion",
    short: "Ficha, informe o Mini-HTA",
    to: "/evaluacion",
    icon: "doc",
    hint: "Expediente editorial con revision por pares",
  },
  {
    key: "diseminacion",
    phase: "Fase 4",
    label: "Diseminacion",
    short: "Informar, publicar y alertar",
    to: "/diseminacion",
    icon: "bulb",
    hint: "Informes, boletines, ficha publica y tablero estrategico",
  },
];

/** Umbral de destaque de la cola de cribado. NO es el umbral de priorizacion. */
export const SCREENING_QUEUE_THRESHOLD = 70;

/** Puntos minimos de la matriz oficial para clasificar como PRIORIZADA.
 *  El backend es la fuente de verdad (methodology_params); este valor es solo
 *  el respaldo de la interfaz mientras carga. */
export const DEFAULT_PRIORITY_POINTS = 4;
export const DEFAULT_WATCH_POINTS = 3;
export const PRIORITY_CRITERIA_TOTAL = 6;

export const HORIZON_LABELS = {
  emergente: "Emergente — fases muy tempranas (preclinica / fase I)",
  transicional: "Transicional — desarrollo clinico o evaluacion (fase II/III)",
  inminente: "Inminente — proxima a autorizacion o lanzamiento",
};

/** Condicion del glosario de la especificacion: dimension distinta del horizonte. */
export const CONDITION_LABELS = {
  emergente: "Emergente — en fases clinicas avanzadas (II o III), previa a aprobacion",
  nueva: "Nueva — aprobada en agencia de referencia hace 12 meses o menos",
};

/** Vias del criterio de novedad (RF10). El backend es la fuente de verdad;
 *  estas etiquetas cortas son para las tablas, donde el enunciado no cabe. */
export const NOVELTY_SHORT_LABELS = {
  no_disponible_en_pais: "No disponible en el pais",
  nueva_indicacion: "Nueva indicacion",
  nueva_forma_farmaceutica: "Nueva forma farmaceutica",
  nueva_combinacion: "Nueva combinacion",
};

/** Antiguedad maxima del indice del INVIMA antes de advertir (RF11). */
export const INVIMA_STALE_DAYS = 30;

/** Estados de la senal capturada (modelo heredado, cola de cribado). */
export const STATUS_LABELS = {
  nuevo: "Senal nueva — pendiente de revision",
  revisado: "Revisado — en evaluacion de prioridad",
  priorizado: "Priorizado — pasa a caracterizacion profunda",
  descartado: "Descartado — bajo impacto o fuera de alcance",
};

/** Estados metodologicos de la tecnologia dentro de un ciclo. */
export const TECH_STATUS_LABELS = {
  capturada_no_asignada: "Capturada / no asignada",
  asignada_a_ciclo: "Asignada al ciclo",
  filtrada_apta_priorizacion: "Filtrada / apta para priorizacion",
  excluida: "Excluida",
  priorizada: "Priorizada",
  bajo_vigilancia: "Bajo vigilancia",
  no_priorizada: "No priorizada",
  en_evaluacion: "En evaluacion",
  publicada: "Publicada",
};

export const TECH_STATUS_TONE = {
  capturada_no_asignada: "#64748B",
  asignada_a_ciclo: "#3B82F6",
  filtrada_apta_priorizacion: "#6366F1",
  excluida: "#94A3B8",
  priorizada: "#059669",
  bajo_vigilancia: "#D97706",
  no_priorizada: "#94A3B8",
  en_evaluacion: "#7C3AED",
  publicada: "#0F766E",
};

/** Estados del ciclo operativo. */
export const CYCLE_STATUS_LABELS = {
  en_configuracion: "En configuracion",
  en_filtrado: "En filtrado",
  en_priorizacion: "En priorizacion",
  en_evaluacion: "En evaluacion",
  cerrado_consolidado: "Cerrado / consolidado",
};

export const CYCLE_STATUS_TONE = {
  en_configuracion: "#64748B",
  en_filtrado: "#3B82F6",
  en_priorizacion: "#6366F1",
  en_evaluacion: "#7C3AED",
  cerrado_consolidado: "#059669",
};

/** Perfiles RBAC (Tabla 3 de la especificacion). */
export const ROLE_LABELS = {
  superadmin: "Superadministrador",
  evaluador_tecnico: "Evaluador tecnico",
  evaluador_clinico: "Evaluador clinico",
  tomador_decisiones: "Tomador de decisiones",
  revisor_pares: "Revisor por pares",
};

/** Permisos usados por la interfaz para mostrar u ocultar acciones. */
export const PERM = {
  READ: "read",
  SOURCE_WRITE: "source:write",
  SCAN_RUN: "scan:run",
  STAGING_ASSIGN: "staging:assign",
  TECHNOLOGY_WRITE: "technology:write",
  CYCLE_WRITE: "cycle:write",
  CYCLE_CLOSE: "cycle:close",
  CATALOG_WRITE: "catalog:write",
  SCREENING_WRITE: "screening:write",
  INVIMA_SYNC: "invima:sync",
  REPORT_WRITE: "report:write",
  REVIEW_SUBMIT: "review:submit",
  NOTE_WRITE: "note:write",
  AUDIT_READ: "audit:read",
  USER_MANAGE: "user:manage",
  CONFIG_MANAGE: "config:manage",
  RESTRICTED_ANALYTICS: "analytics:restricted",
};

/**
 * Rutas heredadas y su destino actual. Las redirecciones viven en App.jsx;
 * este mapa documenta el contrato para enlaces guardados y correos antiguos.
 *
 * Ojo con /hallazgos: la lista de senales ya no vive en /priorizacion, que
 * ahora la ocupa la matriz oficial %P.
 */
export const LEGACY_ROUTES = {
  "/escaneo": "/vigilancia",
  "/hallazgos": "/senales",
  "/recomendaciones": "/diseminacion",
  "/staging": "/bandeja-entrada",
  "/caracterizacion": "/evaluacion",
};
