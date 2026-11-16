/**
 * Qué hace cada parámetro de Configuración › Gobierno metodológico y DE DÓNDE
 * SALE su valor. Se distingue lo que fija la metodología del IETS (especificación
 * técnica SI EAA y decisiones de la coordinación metodológica) de lo que es un
 * valor técnico del sistema. Los textos citan el documento o la decisión; las
 * decisiones abiertas (D-02, D-07, D-09, D-10) se marcan como tales.
 */

const SPEC = "Especificación técnica SI EAA";
const TECH = "Valor técnico del sistema (no metodológico), definido por el equipo desarrollador; se puede ajustar sin desplegar.";
const SCREEN =
  "Heurística del sistema, no de la metodología del IETS: solo ordena la bandeja de entrada para atender primero lo más maduro. " +
  "Valores de fábrica del equipo desarrollador (oct-2026), documentados en el consolidado de observaciones (pregunta 8). No cambia el %P ni la priorización oficial.";

export const PARAM_GROUPS = [
  { id: "screening", title: "Cribado de la bandeja de entrada", icon: "pulse", intro: "Puntaje de 0 a 100 con el que se ordenan las señales capturadas que aún no se califican. Cada regla suma puntos; el total se corta en 100. Al guardar un peso, el sistema recalcula de inmediato el cribado de todas las señales." },
  { id: "corroboration", title: "Corroboración entre fuentes", icon: "layers", intro: "Bono de orden para las señales que reporta más de una fuente. Solo cambia el orden de la bandeja: no toca el cribado ni el %P." },
  { id: "ingest", title: "Vigilancia de fuentes", icon: "radar", intro: "Cómo corre la vigilancia: cuántas fuentes a la vez, cuánto tiempo como máximo por fuente y cuándo se pausa una fuente que falla." },
  { id: "cycle", title: "Ciclos formales", icon: "clock", intro: "Reglas que se validan al crear o modificar un ciclo." },
  { id: "priority", title: "Priorización (matriz P1–P6)", icon: "sliders", intro: "Umbrales del motor oficial de priorización. Los ciclos cerrados conservan el resultado que obtuvieron." },
  { id: "dedup", title: "Filtrado y novedad", icon: "search", intro: "Umbrales de similitud para proponer fusiones y para sugerir que una tecnología ya tiene registro en Colombia." },
  { id: "evaluation", title: "Evaluación temprana", icon: "doc", intro: "Qué producto se sugiere según los puntos de la matriz y la vigencia del acceso de los revisores externos." },
  { id: "ttm", title: "Time-to-market", icon: "clock", intro: "Franjas para clasificar cuándo llegaría la tecnología al mercado." },
  { id: "alerts", title: "Alertas", icon: "info", intro: "Condiciones que disparan alertas a los suscriptores." },
  { id: "other", title: "Otros", icon: "sliders", intro: "" },
];

export const PARAM_INFO = {
  // --- Cribado -------------------------------------------------------------
  "screening.points_inminente": { group: "screening", title: "Horizonte inminente", help: "Suma si el horizonte de la señal es inminente (detectado por la IA o por reglas al capturarla).", origin: SCREEN },
  "screening.points_transicional": { group: "screening", title: "Horizonte transicional", help: "Suma si el horizonte es transicional.", origin: SCREEN },
  "screening.points_emergente": { group: "screening", title: "Horizonte emergente", help: "Suma si el horizonte es emergente.", origin: SCREEN },
  "screening.points_tech_type": { group: "screening", title: "Tipo de tecnología", help: "Suma si el tipo de la señal está en la lista «Tipos que suman».", origin: SCREEN },
  "screening.tech_types": { group: "screening", title: "Tipos que suman", help: "Tipos de tecnología que reciben los puntos anteriores, separados por coma (medicamento, dispositivo, digital, otro).", origin: SCREEN, text: true },
  "screening.points_regulatory": { group: "screening", title: "Hito regulatorio o fase III", help: "Suma si el título, la tecnología, la fase o el resumen contienen alguna de las palabras de hito regulatorio.", origin: SCREEN },
  "screening.keywords_regulatory": { group: "screening", title: "Palabras de hito regulatorio", help: "Separadas por coma; basta con que el texto contenga una (sin distinguir mayúsculas). Ej.: «aprob» cubre aprobado y aprobación.", origin: SCREEN, text: true },
  "screening.points_trial": { group: "screening", title: "Fase II o ensayo", help: "Suma solo si NO sumó el hito regulatorio y el texto contiene alguna palabra de ensayo.", origin: SCREEN },
  "screening.keywords_trial": { group: "screening", title: "Palabras de ensayo", help: "Separadas por coma.", origin: SCREEN, text: true },
  "screening.points_area": { group: "screening", title: "Área terapéutica", help: "Suma si la señal tiene área terapéutica o indicación.", origin: SCREEN },
  "screening.points_summary": { group: "screening", title: "Resumen completo", help: "Suma si el resumen tiene al menos los caracteres mínimos.", origin: SCREEN },
  "screening.summary_min_chars": { group: "screening", title: "Caracteres mínimos del resumen", help: "Largo desde el que el resumen cuenta como completo.", origin: SCREEN },
  "screening.points_identified": { group: "screening", title: "Tecnología identificada", help: "Suma si el nombre de la tecnología está identificado aparte del título (no es solo el titular).", origin: SCREEN },
  "screening.queue_threshold": { group: "screening", title: "Umbral de cribado alto", help: "Desde este puntaje la señal se destaca en la bandeja y cuenta en el indicador «Cribado alto» del tablero.", origin: SCREEN },
  // --- Corroboración --------------------------------------------------------
  "corroboration.bonus_per_source": { group: "corroboration", title: "Puntos por fuente adicional", help: "Cada fuente adicional que reporta la misma tecnología suma estos puntos al orden de la bandeja (se ve como «73 +5»).", origin: "Observación RF-002 del consolidado (09-10-2026): dar más peso a las señales detectadas en varias fuentes sin confundir repetición con importancia clínica. Los valores (+5 por fuente, máximo 15) son del sistema." },
  "corroboration.bonus_max": { group: "corroboration", title: "Tope del bono", help: "Máximo que puede sumar la corroboración, sin importar cuántas fuentes repitan la señal.", origin: "Observación RF-002 del consolidado (09-10-2026). Valor del sistema." },
  // --- Vigilancia -----------------------------------------------------------
  "ingest.parallel_jobs": { group: "ingest", title: "Fuentes a la vez", help: "Cuántas fuentes rastrea el servidor en paralelo. Más acelera la corrida; menos reduce la carga.", origin: `${TECH} En Render gratuito (0,1 CPU y 512 MB) el servidor lo limita a 1, aunque aquí diga más.` },
  "ingest.job_timeout_minutes": { group: "ingest", title: "Tiempo máximo por fuente (min)", help: "Si una fuente lo supera (página que no responde, IA lenta), se cierra con error y la vigilancia sigue con la siguiente. Evita que una sola fuente detenga toda la corrida.", origin: `${TECH} Agregado el 06-11-2026 para que una fuente lenta o colgada no detenga la corrida.` },
  "ingest.circuit_failures": { group: "ingest", title: "Fallos seguidos antes de pausar una fuente", help: "Tras esta cantidad de fallos consecutivos, la fuente se pausa (cortacircuitos) en la vigilancia programada.", origin: TECH },
  "ingest.circuit_cooldown_hours": { group: "ingest", title: "Horas de pausa del cortacircuitos", help: "Tiempo que la fuente queda en pausa antes de volver a intentarse. Una corrida manual la intenta igual.", origin: TECH },
  "ingest.max_records_per_run": { group: "ingest", title: "Registros máximos por corrida (APIs)", help: "Tope de registros que un conector de API guarda en cada corrida.", origin: TECH },
  // --- Ciclos ---------------------------------------------------------------
  "cycle.max_per_year": { group: "cycle", title: "Ciclos formales por año", help: "El sistema rechaza un ciclo más en el mismo año calendario.", origin: `${SPEC}, Módulo 1: hasta tres ciclos formales al año.` },
  "cycle.window_weeks_min": { group: "cycle", title: "Ventana mínima (semanas)", help: "Duración mínima de la ventana operativa de un ciclo.", origin: `${SPEC}, Módulo 1: ventana de 10 a 16 semanas.` },
  "cycle.window_weeks_max": { group: "cycle", title: "Ventana máxima (semanas)", help: "Duración máxima de la ventana operativa de un ciclo.", origin: `${SPEC}, Módulo 1: ventana de 10 a 16 semanas.` },
  // --- Priorización ---------------------------------------------------------
  "priority.points_prioritized": { group: "priority", title: "Puntos para PRIORIZADA", help: "Desde estos puntos (de 6) la tecnología queda priorizada.", origin: "Decisión D-02 (abierta) de la coordinación metodológica: la especificación define a la vez %P ≥ 70 % y 4 a 6 puntos, que no coinciden. Mientras se cierra, rige el conteo de puntos (≥ 4 priorizada)." },
  "priority.points_watch": { group: "priority", title: "Puntos para BAJO VIGILANCIA", help: "Con exactamente estos puntos la tecnología queda bajo vigilancia; por debajo, no priorizada.", origin: "Decisión D-02 (abierta): = 3 puntos, bajo vigilancia." },
  "priority.threshold_pct_label": { group: "priority", title: "Umbral %P de referencia", help: "Solo se muestra como referencia en pantalla; la clasificación la deciden los puntos.", origin: `${SPEC}, Módulo 3: %P ≥ 70 %. Ver D-02.` },
  "priority.criteria_total": { group: "priority", title: "Criterios de la matriz", help: "Denominador del %P = (suma de P1 a P6 / criterios) × 100.", origin: `${SPEC}, Módulo 3: matriz binaria oficial P1 a P6.` },
  // --- Filtrado ---------------------------------------------------------------
  "dedup.similarity_threshold": { group: "dedup", title: "Similitud para proponer fusión (%)", help: "Sobre este porcentaje el sistema propone fusionar dos registros; la fusión siempre la confirma un evaluador. También define cuándo dos señales de fuentes distintas son la misma tecnología (corroboración).", origin: `${SPEC}, Módulo 2 (desduplicación): sobre 85 % de similitud se propone la fusión.` },
  "invima.match_threshold": { group: "dedup", title: "Similitud con registro INVIMA (%)", help: "Desde este porcentaje se sugiere que la tecnología ya tiene registro sanitario vigente en el índice local del INVIMA. Es una sugerencia que confirma el evaluador.", origin: TECH },
  // --- Evaluación -------------------------------------------------------------
  "evaluation.mini_hta_min_points": { group: "evaluation", title: "Puntos para sugerir Mini-HTA", help: "Desde estos puntos de la matriz se sugiere Mini-HTA. Se puede cambiar por tecnología.", origin: "Decisiones D-07 y D-09 (abiertas) sobre el producto de evaluación temprana. Valor provisional." },
  "evaluation.informe_min_points": { group: "evaluation", title: "Puntos para sugerir informe técnico", help: "Desde estos puntos se sugiere informe técnico; por debajo, ficha.", origin: "Decisiones D-07 y D-09 (abiertas). Valor provisional." },
  "evaluation.reviewer_token_days": { group: "evaluation", title: "Vigencia del acceso del revisor (días)", help: "Días que dura el enlace firmado que recibe un revisor externo.", origin: `${SPEC}, Módulo 4: token del revisor con expiración a 10 días.` },
  // --- Time-to-market ---------------------------------------------------------
  "ttm.inminente_months_max": { group: "ttm", title: "Inminente: hasta (meses)", help: "Tope en meses para clasificar como inminente.", origin: "Decisión D-10 (abierta): la especificación deja la clasificación sujeta a la revisión de NIHRIO y de la literatura. Valor provisional." },
  "ttm.transicion_months_max": { group: "ttm", title: "Transición: hasta (meses)", help: "Tope en meses para clasificar como transición.", origin: "Decisión D-10 (abierta). Valor provisional." },
  "ttm.emergente_months_max": { group: "ttm", title: "Emergente: hasta (meses)", help: "Tope en meses para clasificar como emergente.", origin: "Decisión D-10 (abierta). Valor provisional." },
  "ttm.regulatory_review_days": { group: "ttm", title: "Días de revisión regulatoria", help: "Días que se suman al cierre de fase III para estimar la llegada al mercado.", origin: `${TECH} Ligado a D-10.` },
  // --- Alertas ----------------------------------------------------------------
  "alerts.high_budget_points": { group: "alerts", title: "Puntos de alto riesgo presupuestal", help: "Desde estos puntos de la matriz una tecnología cuenta como de alto riesgo presupuestal para las alertas.", origin: `${SPEC}, Módulo 5 (alertas por cambio de fase de tecnologías de alto riesgo presupuestal). El valor es del sistema.` },
  "alerts.phase3_country_tokens": { group: "alerts", title: "Palabras de ensayo fase III en el país", help: "Si un ensayo fase III contiene alguna, se alerta como ensayo en Colombia. Separadas por coma.", origin: `${SPEC}, Módulo 5 (alerta por nuevo ensayo fase III en el país).`, text: true },
};

export function paramInfo(key) {
  return PARAM_INFO[key] || { group: key.split(".")[0] in GROUP_IDS ? key.split(".")[0] : "other", title: "", help: "", origin: "" };
}

const GROUP_IDS = Object.fromEntries(PARAM_GROUPS.map((g) => [g.id, true]));
