// src/components/IntelligencePanel.jsx — Configuración › Inteligencia.
export default {
  "nunca": "never",

  // Cuándo consultar a la IA
  "Nunca: solo reglas y aprendizaje": "Never: rules and learning only",
  "Solo si hay duda (reglas y aprendizaje no coinciden o la confianza es baja)":
    "Only when in doubt (rules and learning disagree or the confidence is low)",
  "Siempre": "Always",
  "clasificada": "classified",
  "descartada": "discarded",
  "pendiente": "pending",

  // Interruptores
  "Aprender de las clasificaciones": "Learn from the classifications",
  "La sugerencia usa las señales parecidas que el equipo ya clasificó o descartó.":
    "The suggestion uses the similar signals that the team has already classified or discarded.",
  "Calibración automática": "Automatic calibration",
  "Recalibra sola cuando hay suficientes clasificaciones nuevas.":
    "It recalibrates by itself when there are enough new classifications.",
  "Lectura analítica con IA": "AI analytical reading",
  "La IA redacta la lectura ejecutiva de Analítica con las cifras del sistema.":
    "The AI writes the executive reading in Analytics using the system's figures.",

  // Parámetros numéricos
  "Señales parecidas que votan": "Similar signals that vote",
  "Cuántas clasificaciones anteriores se consultan por señal.": "How many earlier classifications are consulted per signal.",
  "Parecido mínimo para votar (0 a 1)": "Minimum similarity to vote (0 to 1)",
  "Por debajo de este parecido una señal no cuenta.": "Below this similarity a signal does not count.",
  "Confianza mínima del aprendizaje (0 a 1)": "Minimum learning confidence (0 to 1)",
  "Desde esta confianza el aprendizaje pesa más que las reglas. La ajusta la calibración.":
    "From this confidence upward, learning outweighs the rules. Calibration adjusts it.",
  "Precisión objetivo de la calibración (0 a 1)": "Calibration target precision (0 to 1)",
  "La calibración busca la menor confianza que la cumpla.": "Calibration looks for the lowest confidence that meets it.",
  "Parecido para avisar de un descarte (0 a 1)": "Similarity to warn of a discard (0 to 1)",
  "Parecido con una señal descartada que dispara el aviso.": "Similarity to a discarded signal that triggers the warning.",
  "Ejemplos que ve la IA": "Examples the AI sees",
  "Clasificaciones del equipo incluidas en la consulta a la IA.": "Team classifications included in the query to the AI.",
  "Recalibrar cada (clasificaciones nuevas)": "Recalibrate every (new classifications)",
  "Solo con la calibración automática encendida.": "Only when automatic calibration is on.",
  "Horas que se conserva la lectura con IA": "Hours the AI reading is kept",
  "0 la renueva cada vez que cambian las cifras.": "0 renews it every time the figures change.",
  "Alerta de ruido por fuente (0 a 1)": "Noise alert per source (0 to 1)",
  "Fracción de señales descartadas de una fuente.": "Fraction of a source's signals that were discarded.",
  "Alerta de antigüedad (días)": "Age alert (days)",
  "Días de una señal sin clasificar.": "Days a signal has gone unclassified.",
  "Alerta de concentración (0 a 1)": "Concentration alert (0 to 1)",
  "Fracción de la clasificación en un solo clúster.": "Fraction of the classification in a single cluster.",

  // Prompts
  "Clasificación: instrucciones del sistema": "Classification: system instructions",
  "Clasificación: consulta": "Classification: query",
  "Variables: {signal}, {clusters}, {tech_types}, {examples}, {rules}, {learned}.":
    "Variables: {signal}, {clusters}, {tech_types}, {examples}, {rules}, {learned}.",
  "Analítica: instrucciones del sistema": "Analytics: system instructions",
  "Analítica: consulta": "Analytics: query",
  "Variables: {date}, {facts}.": "Variables: {date}, {facts}.",

  // Avisos
  "No se pudo leer la configuración de inteligencia": "The intelligence settings could not be read",
  "No se pudo completar la acción": "Could not complete the action",
  "Parámetros de inteligencia guardados.": "Intelligence parameters saved.",
  "Parámetros de inteligencia restaurados a los de fábrica.": "Intelligence parameters restored to the factory defaults.",
  "Base de conocimiento reconstruida: {n} señal(es) indexadas.": "Knowledge base rebuilt: {n} signal(s) indexed.",
  "Línea base fijada: lo capturado hasta hoy es la primera búsqueda histórica.":
    "Baseline set: everything captured up to today is the first historical search.",
  "No se pudo descargar la base de conocimiento": "The knowledge base could not be downloaded",

  // Base de conocimiento de señales
  "Memoria del sistema: cada señal capturada con su origen y con lo que el equipo decidió sobre ella. De aquí aprende la sugerencia de clasificación.":
    "System memory: every captured signal with its origin and what the team decided about it. The classification suggestion learns from here.",
  "Descargar base": "Download knowledge base",
  "Fijar línea base hoy": "Set baseline today",
  "Reconstruir": "Rebuild",
  "Base de conocimiento de señales": "Signal knowledge base",
  "Guarda un documento por señal: su texto, si viene de la <b>primera búsqueda histórica</b> o de una <b>vigilancia posterior</b>, su año y la decisión del equipo. Se actualiza sola, sirve a todos los ciclos y se respalda con la base del sistema (la que se copia a Firestore). Funciona aunque la IA esté apagada.":
    "It stores one document per signal: its text, whether it comes from the <b>first historical search</b> or from a <b>later surveillance run</b>, its year and the team's decision. It updates by itself, serves all cycles and is backed up with the system database (the one copied to Firestore). It works even when the AI is off.",
  "{n} señal(es) en la base": "{n} signal(s) in the knowledge base",
  "{n} de la primera búsqueda histórica": "{n} from the first historical search",
  "{n} de vigilancias posteriores": "{n} from later surveillance runs",
  "{n} postulaciones": "{n} submissions",
  "{n} clasificadas": "{n} classified",
  "{n} descartadas": "{n} discarded",
  "{n} por clasificar": "{n} to be classified",
  "Línea base (hasta cuándo una señal cuenta como histórica): {fecha}.":
    "Baseline (the date up to which a signal counts as historical): {fecha}.",
  "El sistema ya aprende de las clasificaciones.": "The system is already learning from the classifications.",
  "El sistema empieza a aprender con {n} señales clasificadas; mientras tanto sugiere con las reglas del catálogo.":
    "The system starts learning once there are {n} classified signals; in the meantime it makes suggestions using the catalog rules.",
  "Buscar señales parecidas a un texto": "Search for signals similar to a text",
  "Por ejemplo: terapia génica para hemofilia": "For example: gene therapy for hemophilia",
  "Buscar": "Search",
  "Ninguna señal de la base se parece a ese texto.": "No signal in the knowledge base is similar to that text.",
  "Señal": "Signal",
  "Parecido": "Similarity",
  "Decisión": "Decision",
  "Clúster y tipología": "Cluster and technology type",
  "Origen": "Origin",
  "Tecnología {id}": "Technology {id}",
  "Histórica": "Historical",
  "Postulación": "Submission",
  "Posterior": "Later",

  // Clasificador que aprende
  "Cómo se arma la sugerencia de clúster y tipología en la Bandeja de entrada.":
    "How the cluster and technology type suggestion is built in the Inbox.",
  "Restaurar": "Restore",
  "Guardar parámetros": "Save parameters",
  "Clasificador que aprende": "Learning classifier",
  "La sugerencia combina las <b>reglas del catálogo</b> (palabras clave, CIE-10, MeSH) con el voto de las <b>señales parecidas que el equipo ya clasificó</b>. Si la IA está encendida, puede arbitrar viendo esos mismos ejemplos. Siempre muestra la confianza y la evidencia; el evaluador confirma.":
    "The suggestion combines the <b>catalog rules</b> (keywords, ICD-10, MeSH) with the vote of the <b>similar signals the team has already classified</b>. If the AI is on, it can arbitrate by looking at those same examples. It always shows the confidence and the evidence; the assessor confirms.",
  "IA disponible ({modelo})": "AI available ({modelo})",
  "IA apagada: reglas y aprendizaje": "AI off: rules and learning",
  "Cuándo consultar a la IA para clasificar": "When to consult the AI to classify",
  "Analítica": "Analytics",

  // Calibración
  "Mide con las clasificaciones reales cuánto acierta cada método y ajusta los parámetros.":
    "Measures, against the actual classifications, how accurate each method is and adjusts the parameters.",
  "Calibrar ahora": "Calibrate now",
  "Calibración": "Calibration",
  "Predice cada señal ya clasificada sin mirarla (validación dejando una fuera) y compara con lo que decidió el equipo. Elige el número de señales parecidas con mejor acierto y la menor confianza que cumple la precisión objetivo.":
    "It predicts each already classified signal without looking at it (leave-one-out validation) and compares the result with what the team decided. It chooses the number of similar signals with the best accuracy and the lowest confidence that meets the target precision.",
  "Todavía no se ha calibrado. Hacen falta {n} señales clasificadas.": "Not calibrated yet. {n} classified signals are needed.",
  "Objetivo cumplido": "Target met",
  "Objetivo no alcanzado": "Target not reached",
  "Datos insuficientes": "Insufficient data",
  "Última: {fecha}.": "Last: {fecha}.",
  "Método": "Method",
  "Acierto en clúster": "Cluster accuracy",
  "Acierto en tipología": "Technology type accuracy",
  "Reglas del catálogo": "Catalog rules",
  "Aprendizaje ({n} señales parecidas)": "Learning ({n} similar signals)",
  "Combinado (lo que ve el evaluador)": "Combined (what the assessor sees)",
  "Referencia: decir siempre el clúster más frecuente": "Reference: always choosing the most frequent cluster",
  "Evaluado con {n} de {total} señales clasificadas, en {clusters} clúster(es) con ejemplos suficientes.":
    "Evaluated with {n} of {total} classified signals, in {clusters} cluster(s) with enough examples.",
  "Confianza mínima: {conf}, que cubre {cob} de las señales.": "Minimum confidence: {conf}, which covers {cob} of the signals.",
  "Confianza mínima: {conf}.": "Minimum confidence: {conf}.",
  "Los parámetros se aplicaron.": "The parameters were applied.",
  "Confianza que da el sistema": "Confidence given by the system",
  "Señales": "Signals",
  "Acierto real": "Actual accuracy",
  "{a} a {b} %": "{a} to {b}%",
  "Sugerencias confirmadas por el equipo": "Suggestions confirmed by the team",
  "De {n} señal(es) con sugerencia que el equipo ya clasificó, confirmó el clúster sugerido en {cluster} ({clusterPct}) y la tipología en {tipo} ({tipoPct}).":
    "Of {n} signal(s) with a suggestion that the team has already classified, it confirmed the suggested cluster in {cluster} ({clusterPct}) and the technology type in {tipo} ({tipoPct}).",
  "{n} de {total}": "{n} of {total}",
  "Aún no hay señales clasificadas después de una sugerencia ({n} sugerencia(s) registradas).":
    "No signals have been classified after a suggestion yet ({n} suggestion(s) recorded).",

  // Prompts de la IA
  "Instrucciones que recibe la IA. Deje un campo vacío para usar el texto de fábrica.":
    "Instructions the AI receives. Leave a field empty to use the factory text.",
  "Guardar prompts": "Save prompts",
  "Prompts de la IA": "AI prompts",
  "El prompt de la captura de señales está en la pestaña Prompts de vigilancia. Estos son los de la clasificación y la analítica.":
    "The signal capture prompt is in the Surveillance prompts tab. These are the ones for classification and analytics.",
  "Texto propio.": "Custom text.",
  "Vacío: se usa el de fábrica (se muestra como guía).": "Empty: the factory text is used (shown as a guide).",
  "Copiar el de fábrica para editarlo": "Copy the factory text to edit it",
};
