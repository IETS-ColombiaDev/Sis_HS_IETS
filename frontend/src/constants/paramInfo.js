/**
 * Qué hace cada parámetro de Configuración › Gobierno metodológico y DE DÓNDE
 * SALE su valor. Se distingue lo que fija la metodología del IETS (especificación
 * técnica SI EAA y decisiones de la coordinación metodológica) de lo que es un
 * valor técnico del sistema. Los textos citan el documento o la decisión; las
 * decisiones abiertas (D-02, D-07, D-09, D-10) se marcan como tales.
 */
import { t } from "../i18n";

const SPEC = t("Especificación técnica SI EAA");
const TECH = t("Valor técnico del sistema (no metodológico), definido por el equipo desarrollador; se puede ajustar sin desplegar.");
const SCREEN = t(
  "Heurística del sistema, no de la metodología del IETS: solo ordena la bandeja de entrada para atender primero lo más maduro. Valores de fábrica del equipo desarrollador (oct-2026), documentados en el consolidado de observaciones (pregunta 8). No cambia el %P ni la priorización oficial."
);

export const PARAM_GROUPS = [
  { id: "screening", title: t("Cribado de la bandeja de entrada"), icon: "pulse", intro: t("Puntaje de 0 a 100 con el que se ordenan las señales capturadas que aún no se califican. Cada regla suma puntos; el total se corta en 100. Al guardar un peso, el sistema recalcula de inmediato el cribado de todas las señales.") },
  { id: "corroboration", title: t("Corroboración entre fuentes"), icon: "layers", intro: t("Bono de orden para las señales que reporta más de una fuente. Solo cambia el orden de la bandeja: no toca el cribado ni el %P.") },
  { id: "ingest", title: t("Vigilancia de fuentes"), icon: "radar", intro: t("Cómo corre la vigilancia: cuántas fuentes a la vez, cuánto tiempo como máximo por fuente y cuándo se pausa una fuente que falla.") },
  { id: "cycle", title: t("Ciclos formales"), icon: "clock", intro: t("Reglas que se validan al crear o modificar un ciclo.") },
  { id: "priority", title: t("Priorización (matriz P1-P6)"), icon: "sliders", intro: t("Umbrales del motor oficial de priorización. Los ciclos cerrados conservan el resultado que obtuvieron.") },
  { id: "dedup", title: t("Filtrado y novedad"), icon: "search", intro: t("Umbrales de similitud para proponer fusiones y para sugerir que una tecnología ya tiene registro en Colombia.") },
  { id: "evaluation", title: t("Evaluación temprana"), icon: "doc", intro: t("Qué producto se sugiere según los puntos de la matriz y la vigencia del acceso de los revisores externos.") },
  { id: "ttm", title: t("Time-to-market"), icon: "clock", intro: t("Franjas para clasificar cuándo llegaría la tecnología al mercado.") },
  { id: "alerts", title: t("Alertas"), icon: "info", intro: t("Condiciones que disparan alertas a los suscriptores.") },
  { id: "other", title: t("Otros"), icon: "sliders", intro: "" },
];

export const PARAM_INFO = {
  // --- Cribado -------------------------------------------------------------
  "screening.points_inminente": { group: "screening", title: t("Horizonte inminente"), help: t("Suma si el horizonte de la señal es inminente (detectado por la IA o por reglas al capturarla)."), origin: SCREEN },
  "screening.points_transicional": { group: "screening", title: t("Horizonte transicional"), help: t("Suma si el horizonte es transicional."), origin: SCREEN },
  "screening.points_emergente": { group: "screening", title: t("Horizonte emergente"), help: t("Suma si el horizonte es emergente."), origin: SCREEN },
  "screening.points_tech_type": { group: "screening", title: t("Tipo de tecnología"), help: t("Suma si el tipo de la señal está en la lista «Tipos que suman»."), origin: SCREEN },
  "screening.tech_types": { group: "screening", title: t("Tipos que suman"), help: t("Tipos de tecnología que reciben los puntos anteriores, separados por coma (medicamento, dispositivo, digital, otro)."), origin: SCREEN, text: true },
  "screening.points_regulatory": { group: "screening", title: t("Hito regulatorio o fase III"), help: t("Suma si el título, la tecnología, la fase o el resumen contienen alguna de las palabras de hito regulatorio."), origin: SCREEN },
  "screening.keywords_regulatory": { group: "screening", title: t("Palabras de hito regulatorio"), help: t("Separadas por coma; basta con que el texto contenga una (sin distinguir mayúsculas). Ej.: «aprob» cubre aprobado y aprobación."), origin: SCREEN, text: true },
  "screening.points_trial": { group: "screening", title: t("Fase II o ensayo"), help: t("Suma solo si NO sumó el hito regulatorio y el texto contiene alguna palabra de ensayo."), origin: SCREEN },
  "screening.keywords_trial": { group: "screening", title: t("Palabras de ensayo"), help: t("Separadas por coma."), origin: SCREEN, text: true },
  "screening.points_area": { group: "screening", title: t("Área terapéutica"), help: t("Suma si la señal tiene área terapéutica o indicación."), origin: SCREEN },
  "screening.points_summary": { group: "screening", title: t("Resumen completo"), help: t("Suma si el resumen tiene al menos los caracteres mínimos."), origin: SCREEN },
  "screening.summary_min_chars": { group: "screening", title: t("Caracteres mínimos del resumen"), help: t("Largo desde el que el resumen cuenta como completo."), origin: SCREEN },
  "screening.points_identified": { group: "screening", title: t("Tecnología identificada"), help: t("Suma si el nombre de la tecnología está identificado aparte del título (no es solo el titular)."), origin: SCREEN },
  "screening.queue_threshold": { group: "screening", title: t("Umbral de cribado alto"), help: t("Desde este puntaje la señal se destaca en la bandeja y cuenta en el indicador «Cribado alto» del tablero."), origin: SCREEN },
  // --- Corroboración --------------------------------------------------------
  "corroboration.bonus_per_source": { group: "corroboration", title: t("Puntos por fuente adicional"), help: t("Cada fuente adicional que reporta la misma tecnología suma estos puntos al orden de la bandeja (se ve como «73 +5»)."), origin: t("Observación RF-002 del consolidado (09-10-2026): dar más peso a las señales detectadas en varias fuentes sin confundir repetición con importancia clínica. Los valores (+5 por fuente, máximo 15) son del sistema.") },
  "corroboration.bonus_max": { group: "corroboration", title: t("Tope del bono"), help: t("Máximo que puede sumar la corroboración, sin importar cuántas fuentes repitan la señal."), origin: t("Observación RF-002 del consolidado (09-10-2026). Valor del sistema.") },
  // --- Vigilancia -----------------------------------------------------------
  "ingest.parallel_jobs": { group: "ingest", title: t("Fuentes a la vez"), help: t("Cuántas fuentes rastrea el servidor en paralelo. Más acelera la corrida; menos reduce la carga."), origin: t("{tech} En Render gratuito (0,1 CPU y 512 MB) el servidor lo limita a 1, aunque aquí diga más.", { tech: TECH }) },
  "ingest.job_timeout_minutes": { group: "ingest", title: t("Tiempo máximo por fuente (min)"), help: t("Si una fuente lo supera (página que no responde, IA lenta), se cierra con error y la vigilancia sigue con la siguiente. Evita que una sola fuente detenga toda la corrida."), origin: t("{tech} Agregado el 06-11-2026 para que una fuente lenta o colgada no detenga la corrida.", { tech: TECH }) },
  "ingest.circuit_failures": { group: "ingest", title: t("Fallos seguidos antes de pausar una fuente"), help: t("Tras esta cantidad de fallos consecutivos, la fuente se pausa (cortacircuitos) en la vigilancia programada."), origin: TECH },
  "ingest.circuit_cooldown_hours": { group: "ingest", title: t("Horas de pausa del cortacircuitos"), help: t("Tiempo que la fuente queda en pausa antes de volver a intentarse. Una corrida manual la intenta igual."), origin: TECH },
  "ingest.max_records_per_run": { group: "ingest", title: t("Registros máximos por corrida (APIs)"), help: t("Tope de registros que un conector de API guarda en cada corrida."), origin: TECH },
  // --- Ciclos ---------------------------------------------------------------
  "cycle.max_per_year": { group: "cycle", title: t("Ciclos formales por año"), help: t("El sistema rechaza un ciclo más en el mismo año calendario."), origin: t("{spec}, Módulo 1: hasta tres ciclos formales al año.", { spec: SPEC }) },
  "cycle.window_weeks_min": { group: "cycle", title: t("Ventana mínima (semanas)"), help: t("Duración mínima de la ventana operativa de un ciclo."), origin: t("{spec}, Módulo 1: ventana de 10 a 16 semanas.", { spec: SPEC }) },
  "cycle.window_weeks_max": { group: "cycle", title: t("Ventana máxima (semanas)"), help: t("Duración máxima de la ventana operativa de un ciclo."), origin: t("{spec}, Módulo 1: ventana de 10 a 16 semanas.", { spec: SPEC }) },
  // --- Priorización ---------------------------------------------------------
  "priority.points_prioritized": { group: "priority", title: t("Puntos para PRIORIZADA"), help: t("Desde estos puntos (de 6) la tecnología queda priorizada."), origin: t("Decisión D-02 (abierta) de la coordinación metodológica: la especificación define a la vez %P ≥ 70 % y 4 a 6 puntos, que no coinciden. Mientras se cierra, rige el conteo de puntos (≥ 4 priorizada).") },
  "priority.points_watch": { group: "priority", title: t("Puntos para BAJO VIGILANCIA"), help: t("Con exactamente estos puntos la tecnología queda bajo vigilancia; por debajo, no priorizada."), origin: t("Decisión D-02 (abierta): = 3 puntos, bajo vigilancia.") },
  "priority.threshold_pct_label": { group: "priority", title: t("Umbral %P de referencia"), help: t("Solo se muestra como referencia en pantalla; la clasificación la deciden los puntos."), origin: t("{spec}, Módulo 3: %P ≥ 70 %. Ver D-02.", { spec: SPEC }) },
  "priority.criteria_total": { group: "priority", title: t("Criterios de la matriz"), help: t("Denominador del %P = (suma de P1 a P6 / criterios) × 100."), origin: t("{spec}, Módulo 3: matriz binaria oficial P1 a P6.", { spec: SPEC }) },
  // --- Filtrado ---------------------------------------------------------------
  "dedup.similarity_threshold": { group: "dedup", title: t("Similitud para proponer fusión (%)"), help: t("Sobre este porcentaje el sistema propone fusionar dos registros; la fusión siempre la confirma un evaluador. También define cuándo dos señales de fuentes distintas son la misma tecnología (corroboración)."), origin: t("{spec}, Módulo 2 (desduplicación): sobre 85 % de similitud se propone la fusión.", { spec: SPEC }) },
  "invima.match_threshold": { group: "dedup", title: t("Similitud con registro INVIMA (%)"), help: t("Desde este porcentaje se sugiere que la tecnología ya tiene registro sanitario vigente en el índice local del INVIMA. Es una sugerencia que confirma el evaluador."), origin: TECH },
  // --- Evaluación -------------------------------------------------------------
  "evaluation.mini_hta_min_points": { group: "evaluation", title: t("Puntos para sugerir Mini-HTA"), help: t("Desde estos puntos de la matriz se sugiere Mini-HTA. Se puede cambiar por tecnología."), origin: t("Decisiones D-07 y D-09 (abiertas) sobre el producto de evaluación temprana. Valor provisional.") },
  "evaluation.informe_min_points": { group: "evaluation", title: t("Puntos para sugerir informe técnico"), help: t("Desde estos puntos se sugiere informe técnico; por debajo, ficha."), origin: t("Decisiones D-07 y D-09 (abiertas). Valor provisional.") },
  "evaluation.reviewer_token_days": { group: "evaluation", title: t("Vigencia del acceso del revisor (días)"), help: t("Días que dura el enlace firmado que recibe un revisor externo."), origin: t("{spec}, Módulo 4: token del revisor con expiración a 10 días.", { spec: SPEC }) },
  // --- Time-to-market ---------------------------------------------------------
  "ttm.inminente_months_max": { group: "ttm", title: t("Inminente: hasta (meses)"), help: t("Tope en meses para clasificar como inminente."), origin: t("Decisión D-10 (abierta): la especificación deja la clasificación sujeta a la revisión de NIHRIO y de la literatura. Valor provisional.") },
  "ttm.transicion_months_max": { group: "ttm", title: t("Transición: hasta (meses)"), help: t("Tope en meses para clasificar como transición."), origin: t("Decisión D-10 (abierta). Valor provisional.") },
  "ttm.emergente_months_max": { group: "ttm", title: t("Emergente: hasta (meses)"), help: t("Tope en meses para clasificar como emergente."), origin: t("Decisión D-10 (abierta). Valor provisional.") },
  "ttm.regulatory_review_days": { group: "ttm", title: t("Días de revisión regulatoria"), help: t("Días que se suman al cierre de fase III para estimar la llegada al mercado."), origin: t("{tech} Ligado a D-10.", { tech: TECH }) },
  // --- Alertas ----------------------------------------------------------------
  "alerts.high_budget_points": { group: "alerts", title: t("Puntos de alto riesgo presupuestal"), help: t("Desde estos puntos de la matriz una tecnología cuenta como de alto riesgo presupuestal para las alertas."), origin: t("{spec}, Módulo 5 (alertas por cambio de fase de tecnologías de alto riesgo presupuestal). El valor es del sistema.", { spec: SPEC }) },
  "alerts.phase3_country_tokens": { group: "alerts", title: t("Palabras de ensayo fase III en el país"), help: t("Si un ensayo fase III contiene alguna, se alerta como ensayo en Colombia. Separadas por coma."), origin: t("{spec}, Módulo 5 (alerta por nuevo ensayo fase III en el país).", { spec: SPEC }), text: true },
};

export function paramInfo(key) {
  return PARAM_INFO[key] || { group: key.split(".")[0] in GROUP_IDS ? key.split(".")[0] : "other", title: "", help: "", origin: "" };
}

const GROUP_IDS = Object.fromEntries(PARAM_GROUPS.map((g) => [g.id, true]));
