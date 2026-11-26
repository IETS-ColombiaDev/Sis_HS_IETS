/** Metodologia IETS de escaneo de horizonte - fases operativas del sistema.
 *
 *  Alineado con el Plan de actualizacion por fases: el ciclo operativo es el eje
 *  y la priorizacion usa la matriz oficial P1 a P6 (no la heuristica de cribado).
 */
import { t } from "../i18n";

export const IETS_PHASES = [
  {
    key: "identificacion",
    phase: t("Fase 1"),
    label: t("Identificación"),
    short: t("Vigilar fuentes y capturar señales"),
    to: "/vigilancia",
    icon: "radar",
    hint: t("Buscar en el mundo señales de tecnologías nuevas y guardarlas para revisarlas."),
    help: t("Paso 1. El equipo vigila fuentes (ensayos, agencias, literatura) y captura señales de tecnologías que aún no están en Colombia. Nada se decide aquí: solo se detecta y se guarda en la bandeja."),
  },
  {
    key: "priorizacion",
    phase: t("Fase 2"),
    label: t("Priorización"),
    short: t("Calificar la matriz P1 a P6"),
    to: "/priorizacion",
    icon: "layers",
    hint: t("Ponerle nota a cada tecnología con seis preguntas sí/no (P1 a P6)."),
    help: t("Paso 2. Cada tecnología recibe seis preguntas oficiales (P1 a P6). Cada sí suma 1 punto. Las que llegan al umbral pasan primero a evaluación; las demás quedan en vigilancia o se descartan del ciclo."),
  },
  {
    key: "caracterizacion",
    phase: t("Fase 3"),
    label: t("Evaluación"),
    short: t("Ficha, informe o Mini-HTA"),
    to: "/evaluacion",
    icon: "doc",
    hint: t("Redactar la ficha o el informe y pasarlo por revisión de pares."),
    help: t("Paso 3. Se escribe la ficha, el informe o un Mini-HTA (informe más profundo) y un revisor independiente lo revisa antes de publicarlo."),
  },
  {
    key: "diseminacion",
    phase: t("Fase 4"),
    label: t("Diseminación"),
    short: t("Informar, publicar y alertar"),
    to: "/diseminacion",
    icon: "bulb",
    hint: t("Compartir informes, boletines, tablero y alertas con quien decide."),
    help: t("Paso 4. Se publica lo ya evaluado: informes, boletín del ciclo, tablero de indicadores y alertas para MinSalud, INVIMA y otros tomadores de decisión."),
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
  emergente: t("Emergente - fases muy tempranas (preclínica / fase I)"),
  transicional: t("Transicional - desarrollo clínico o evaluación (fase II/III)"),
  inminente: t("Inminente - próxima a autorización o lanzamiento"),
};

/** Condicion del glosario de la especificacion: dimension distinta del horizonte. */
export const CONDITION_LABELS = {
  emergente: t("Emergente - en fases clínicas avanzadas (II o III), previa a aprobación"),
  nueva: t("Nueva - aprobada en agencia de referencia hace 12 meses o menos"),
};

/** Vias del criterio de novedad (RF10). El backend es la fuente de verdad;
 *  estas etiquetas cortas son para las tablas, donde el enunciado no cabe. */
export const NOVELTY_SHORT_LABELS = {
  no_disponible_en_pais: t("No disponible en el país"),
  nueva_indicacion: t("Nueva indicación"),
  nueva_forma_farmaceutica: t("Nueva forma farmacéutica"),
  nueva_combinacion: t("Nueva combinación"),
};

/** Antiguedad maxima del indice del INVIMA antes de advertir (RF11). */
export const INVIMA_STALE_DAYS = 30;

/** Estados de la senal capturada (modelo heredado, cola de cribado). */
export const STATUS_LABELS = {
  nuevo: t("Señal nueva - pendiente de revisión"),
  revisado: t("Revisado - en evaluación de prioridad"),
  priorizado: t("Priorizado - pasa a caracterización profunda"),
  descartado: t("Descartado - bajo impacto o fuera de alcance"),
};

/** Estados metodologicos de la tecnologia dentro de un ciclo. */
export const TECH_STATUS_LABELS = {
  capturada_no_asignada: t("Capturada / no asignada"),
  asignada_a_ciclo: t("Asignada al ciclo"),
  filtrada_apta_priorizacion: t("Filtrada / apta para priorización"),
  excluida: t("Excluida"),
  priorizada: t("Priorizada"),
  bajo_vigilancia: t("Bajo vigilancia"),
  no_priorizada: t("No priorizada"),
  en_evaluacion: t("En evaluación"),
  publicada: t("Publicada"),
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
  en_configuracion: t("En configuración"),
  en_filtrado: t("En filtrado"),
  en_priorizacion: t("En priorización"),
  en_evaluacion: t("En evaluación"),
  cerrado_consolidado: t("Cerrado / consolidado"),
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
  superadmin: t("Superadministrador"),
  evaluador_tecnico: t("Evaluador técnico"),
  evaluador_clinico: t("Evaluador clínico"),
  tomador_decisiones: t("Tomador de decisiones"),
  revisor_pares: t("Revisor por pares"),
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
