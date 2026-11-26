// src/constants/paramInfo.js — qué hace cada parámetro metodológico y de dónde sale su valor.
// {spec} = "Especificación técnica SI EAA"; {tech} = la frase del valor técnico del sistema.
// Los tipos de tecnología (medicamento, dispositivo, digital, otro) y las palabras de ejemplo
// son valores que la persona escribe tal cual en el parámetro: no se traducen.
export default {
  "Especificación técnica SI EAA": "SI EAA technical specification",
  "Valor técnico del sistema (no metodológico), definido por el equipo desarrollador; se puede ajustar sin desplegar.":
    "Technical value of the system (not methodological), set by the development team; it can be adjusted with no deployment.",
  "Heurística del sistema, no de la metodología del IETS: solo ordena la bandeja de entrada para atender primero lo más maduro. Valores de fábrica del equipo desarrollador (oct-2026), documentados en el consolidado de observaciones (pregunta 8). No cambia el %P ni la priorización oficial.":
    "A heuristic of the system, not of the IETS methodology: it only orders the inbox so that the most mature items are handled first. Factory values from the development team (Oct 2026), documented in the consolidated observations (question 8). It does not change the %P or the official prioritization.",

  // Grupos
  "Cribado de la bandeja de entrada": "Inbox screening score",
  "Puntaje de 0 a 100 con el que se ordenan las señales capturadas que aún no se califican. Cada regla suma puntos; el total se corta en 100. Al guardar un peso, el sistema recalcula de inmediato el cribado de todas las señales.":
    "Score from 0 to 100 used to order the captured signals that have not been rated yet. Each rule adds points; the total is capped at 100. When a weight is saved, the system immediately recalculates the triage of all signals.",
  "Corroboración entre fuentes": "Corroboration across sources",
  "Bono de orden para las señales que reporta más de una fuente. Solo cambia el orden de la bandeja: no toca el cribado ni el %P.":
    "Ordering bonus for signals reported by more than one source. It only changes the order of the inbox: it does not affect the screening score or the %P.",
  "Vigilancia de fuentes": "Source surveillance",
  "Cómo corre la vigilancia: cuántas fuentes a la vez, cuánto tiempo como máximo por fuente y cuándo se pausa una fuente que falla.":
    "How surveillance runs: how many sources at once, the maximum time per source and when a failing source is paused.",
  "Ciclos formales": "Formal cycles",
  "Reglas que se validan al crear o modificar un ciclo.": "Rules validated when a cycle is created or modified.",
  "Priorización (matriz P1-P6)": "Prioritization (P1-P6 matrix)",
  "Umbrales del motor oficial de priorización. Los ciclos cerrados conservan el resultado que obtuvieron.":
    "Thresholds of the official prioritization engine. Closed cycles keep the result they obtained.",
  "Filtrado y novedad": "Screening and novelty",
  "Umbrales de similitud para proponer fusiones y para sugerir que una tecnología ya tiene registro en Colombia.":
    "Similarity thresholds for proposing merges and for suggesting that a technology is already registered in Colombia.",
  "Evaluación temprana": "Early assessment",
  "Qué producto se sugiere según los puntos de la matriz y la vigencia del acceso de los revisores externos.":
    "Which product is suggested according to the matrix points, and how long external reviewers' access remains valid.",
  "Time-to-market": "Time to market",
  "Franjas para clasificar cuándo llegaría la tecnología al mercado.":
    "Bands for classifying when the technology would reach the market.",
  "Alertas": "Alerts",
  "Condiciones que disparan alertas a los suscriptores.": "Conditions that trigger alerts to subscribers.",
  "Otros": "Other",

  // Cribado
  "Horizonte inminente": "Imminent horizon",
  "Suma si el horizonte de la señal es inminente (detectado por la IA o por reglas al capturarla).":
    "Adds points if the signal's horizon is imminent (detected by the AI or by rules when it is captured).",
  "Horizonte transicional": "Transitional horizon",
  "Suma si el horizonte es transicional.": "Adds points if the horizon is transitional.",
  "Horizonte emergente": "Emerging horizon",
  "Suma si el horizonte es emergente.": "Adds points if the horizon is emerging.",
  "Tipo de tecnología": "Technology type",
  "Suma si el tipo de la señal está en la lista «Tipos que suman».":
    "Adds points if the signal's type is in the “Types that score” list.",
  "Tipos que suman": "Types that score",
  "Tipos de tecnología que reciben los puntos anteriores, separados por coma (medicamento, dispositivo, digital, otro).":
    "Technology types that receive the points above, separated by commas (medicamento, dispositivo, digital, otro).",
  "Hito regulatorio o fase III": "Regulatory milestone or phase III",
  "Suma si el título, la tecnología, la fase o el resumen contienen alguna de las palabras de hito regulatorio.":
    "Adds points if the title, the technology, the phase or the summary contains any of the regulatory milestone words.",
  "Palabras de hito regulatorio": "Regulatory milestone words",
  "Separadas por coma; basta con que el texto contenga una (sin distinguir mayúsculas). Ej.: «aprob» cubre aprobado y aprobación.":
    "Separated by commas; it is enough for the text to contain one (not case-sensitive). E.g. “aprob” covers aprobado and aprobación.",
  "Fase II o ensayo": "Phase II or trial",
  "Suma solo si NO sumó el hito regulatorio y el texto contiene alguna palabra de ensayo.":
    "Adds points only if the regulatory milestone did NOT score and the text contains a trial word.",
  "Palabras de ensayo": "Trial words",
  "Separadas por coma.": "Separated by commas.",
  "Área terapéutica": "Therapeutic area",
  "Suma si la señal tiene área terapéutica o indicación.": "Adds points if the signal has a therapeutic area or indication.",
  "Resumen completo": "Complete summary",
  "Suma si el resumen tiene al menos los caracteres mínimos.":
    "Adds points if the summary has at least the minimum number of characters.",
  "Caracteres mínimos del resumen": "Minimum summary characters",
  "Largo desde el que el resumen cuenta como completo.": "Length from which the summary counts as complete.",
  "Tecnología identificada": "Technology identified",
  "Suma si el nombre de la tecnología está identificado aparte del título (no es solo el titular).":
    "Adds points if the technology name is identified separately from the title (it is not just the headline).",
  "Umbral de cribado alto": "High screening score threshold",
  "Desde este puntaje la señal se destaca en la bandeja y cuenta en el indicador «Cribado alto» del tablero.":
    "From this score the signal is highlighted in the inbox and counts toward the “High screening score” indicator on the dashboard.",

  // Corroboración
  "Puntos por fuente adicional": "Points per additional source",
  "Cada fuente adicional que reporta la misma tecnología suma estos puntos al orden de la bandeja (se ve como «73 +5»).":
    "Each additional source reporting the same technology adds these points to the inbox order (shown as “73 +5”).",
  "Observación RF-002 del consolidado (09-10-2026): dar más peso a las señales detectadas en varias fuentes sin confundir repetición con importancia clínica. Los valores (+5 por fuente, máximo 15) son del sistema.":
    "Observation RF-002 of the consolidated observations (09-10-2026): give more weight to signals detected in several sources without confusing repetition with clinical importance. The values (+5 per source, maximum 15) are the system's.",
  "Tope del bono": "Bonus cap",
  "Máximo que puede sumar la corroboración, sin importar cuántas fuentes repitan la señal.":
    "Maximum that corroboration can add, no matter how many sources repeat the signal.",
  "Observación RF-002 del consolidado (09-10-2026). Valor del sistema.":
    "Observation RF-002 of the consolidated observations (09-10-2026). System value.",

  // Vigilancia
  "Fuentes a la vez": "Sources at once",
  "Cuántas fuentes rastrea el servidor en paralelo. Más acelera la corrida; menos reduce la carga.":
    "How many sources the server crawls in parallel. More speeds up the run; fewer reduces the load.",
  "{tech} En Render gratuito (0,1 CPU y 512 MB) el servidor lo limita a 1, aunque aquí diga más.":
    "{tech} On the free Render plan (0.1 CPU and 512 MB) the server limits it to 1, even if a higher value is set here.",
  "Tiempo máximo por fuente (min)": "Maximum time per source (min)",
  "Si una fuente lo supera (página que no responde, IA lenta), se cierra con error y la vigilancia sigue con la siguiente. Evita que una sola fuente detenga toda la corrida.":
    "If a source exceeds it (unresponsive page, slow AI), it is closed with an error and surveillance continues with the next one. It keeps a single source from stopping the whole run.",
  "{tech} Agregado el 06-11-2026 para que una fuente lenta o colgada no detenga la corrida.":
    "{tech} Added on 06-11-2026 so that a slow or hung source does not stop the run.",
  "Fallos seguidos antes de pausar una fuente": "Consecutive failures before pausing a source",
  "Tras esta cantidad de fallos consecutivos, la fuente se pausa (cortacircuitos) en la vigilancia programada.":
    "After this number of consecutive failures, the source is paused (circuit breaker) in scheduled surveillance.",
  "Horas de pausa del cortacircuitos": "Circuit breaker pause (hours)",
  "Tiempo que la fuente queda en pausa antes de volver a intentarse. Una corrida manual la intenta igual.":
    "How long the source stays paused before it is tried again. A manual run tries it anyway.",
  "Registros máximos por corrida (APIs)": "Maximum records per run (APIs)",
  "Tope de registros que un conector de API guarda en cada corrida.": "Cap on the records an API connector stores in each run.",

  // Ciclos
  "Ciclos formales por año": "Formal cycles per year",
  "El sistema rechaza un ciclo más en el mismo año calendario.": "The system rejects one more cycle in the same calendar year.",
  "{spec}, Módulo 1: hasta tres ciclos formales al año.": "{spec}, Module 1: up to three formal cycles per year.",
  "Ventana mínima (semanas)": "Minimum window (weeks)",
  "Duración mínima de la ventana operativa de un ciclo.": "Minimum length of a cycle's operating window.",
  "{spec}, Módulo 1: ventana de 10 a 16 semanas.": "{spec}, Module 1: window of 10 to 16 weeks.",
  "Ventana máxima (semanas)": "Maximum window (weeks)",
  "Duración máxima de la ventana operativa de un ciclo.": "Maximum length of a cycle's operating window.",

  // Priorización
  "Puntos para PRIORIZADA": "Points for PRIORITIZED",
  "Desde estos puntos (de 6) la tecnología queda priorizada.": "From this many points (out of 6) the technology is prioritized.",
  "Decisión D-02 (abierta) de la coordinación metodológica: la especificación define a la vez %P ≥ 70 % y 4 a 6 puntos, que no coinciden. Mientras se cierra, rige el conteo de puntos (≥ 4 priorizada).":
    "Decision D-02 (open) of the methodological coordination: the specification defines both %P ≥ 70% and 4 to 6 points, which do not match. Until it is closed, the point count applies (≥ 4 prioritized).",
  "Puntos para BAJO VIGILANCIA": "Points for UNDER SURVEILLANCE",
  "Con exactamente estos puntos la tecnología queda bajo vigilancia; por debajo, no priorizada.":
    "With exactly this many points the technology is placed under surveillance; below that, not prioritized.",
  "Decisión D-02 (abierta): = 3 puntos, bajo vigilancia.": "Decision D-02 (open): = 3 points, under surveillance.",
  "Umbral %P de referencia": "Reference %P threshold",
  "Solo se muestra como referencia en pantalla; la clasificación la deciden los puntos.":
    "Shown on screen for reference only; the classification is decided by the points.",
  "{spec}, Módulo 3: %P ≥ 70 %. Ver D-02.": "{spec}, Module 3: %P ≥ 70%. See D-02.",
  "Criterios de la matriz": "Matrix criteria",
  "Denominador del %P = (suma de P1 a P6 / criterios) × 100.": "Denominator of %P = (sum of P1 to P6 / criteria) × 100.",
  "{spec}, Módulo 3: matriz binaria oficial P1 a P6.": "{spec}, Module 3: official binary matrix P1 to P6.",

  // Filtrado
  "Similitud para proponer fusión (%)": "Similarity to propose a merge (%)",
  "Sobre este porcentaje el sistema propone fusionar dos registros; la fusión siempre la confirma un evaluador. También define cuándo dos señales de fuentes distintas son la misma tecnología (corroboración).":
    "Above this percentage the system proposes merging two records; the merge is always confirmed by an assessor. It also defines when two signals from different sources are the same technology (corroboration).",
  "{spec}, Módulo 2 (desduplicación): sobre 85 % de similitud se propone la fusión.":
    "{spec}, Module 2 (de-duplication): above 85% similarity the merge is proposed.",
  "Similitud con registro INVIMA (%)": "Similarity to an INVIMA registration (%)",
  "Desde este porcentaje se sugiere que la tecnología ya tiene registro sanitario vigente en el índice local del INVIMA. Es una sugerencia que confirma el evaluador.":
    "From this percentage the system suggests that the technology already has a valid marketing authorization in the local INVIMA index. It is a suggestion that the assessor confirms.",

  // Evaluación
  "Puntos para sugerir Mini-HTA": "Points to suggest Mini-HTA",
  "Desde estos puntos de la matriz se sugiere Mini-HTA. Se puede cambiar por tecnología.":
    "From this many matrix points, Mini-HTA is suggested. It can be changed per technology.",
  "Decisiones D-07 y D-09 (abiertas) sobre el producto de evaluación temprana. Valor provisional.":
    "Decisions D-07 and D-09 (open) on the early assessment product. Provisional value.",
  "Puntos para sugerir informe técnico": "Points to suggest a technical report",
  "Desde estos puntos se sugiere informe técnico; por debajo, ficha.":
    "From this many points a technical report is suggested; below that, a fact sheet.",
  "Decisiones D-07 y D-09 (abiertas). Valor provisional.": "Decisions D-07 and D-09 (open). Provisional value.",
  "Vigencia del acceso del revisor (días)": "Reviewer access validity (days)",
  "Días que dura el enlace firmado que recibe un revisor externo.":
    "Number of days the signed link sent to an external reviewer remains valid.",
  "{spec}, Módulo 4: token del revisor con expiración a 10 días.": "{spec}, Module 4: reviewer token expiring after 10 days.",

  // Time-to-market
  "Inminente: hasta (meses)": "Imminent: up to (months)",
  "Tope en meses para clasificar como inminente.": "Cap in months for classifying as imminent.",
  "Decisión D-10 (abierta): la especificación deja la clasificación sujeta a la revisión de NIHRIO y de la literatura. Valor provisional.":
    "Decision D-10 (open): the specification leaves the classification subject to the review of NIHRIO and of the literature. Provisional value.",
  "Transición: hasta (meses)": "Transition: up to (months)",
  "Tope en meses para clasificar como transición.": "Cap in months for classifying as transition.",
  "Decisión D-10 (abierta). Valor provisional.": "Decision D-10 (open). Provisional value.",
  "Emergente: hasta (meses)": "Emerging: up to (months)",
  "Tope en meses para clasificar como emergente.": "Cap in months for classifying as emerging.",
  "Días de revisión regulatoria": "Regulatory review days",
  "Días que se suman al cierre de fase III para estimar la llegada al mercado.":
    "Days added to the phase III completion date to estimate market arrival.",
  "{tech} Ligado a D-10.": "{tech} Linked to D-10.",

  // Alertas
  "Puntos de alto riesgo presupuestal": "High budget risk points",
  "Desde estos puntos de la matriz una tecnología cuenta como de alto riesgo presupuestal para las alertas.":
    "From this many matrix points a technology counts as high budget risk for alerts.",
  "{spec}, Módulo 5 (alertas por cambio de fase de tecnologías de alto riesgo presupuestal). El valor es del sistema.":
    "{spec}, Module 5 (alerts on phase changes of high budget risk technologies). The value is the system's.",
  "Palabras de ensayo fase III en el país": "Words for a phase III trial in the country",
  "Si un ensayo fase III contiene alguna, se alerta como ensayo en Colombia. Separadas por coma.":
    "If a phase III trial contains any of them, it is flagged as a trial in Colombia. Separated by commas.",
  "{spec}, Módulo 5 (alerta por nuevo ensayo fase III en el país).": "{spec}, Module 5 (alert for a new phase III trial in the country).",
};
