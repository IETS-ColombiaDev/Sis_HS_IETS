// Textos del servidor: capa de dominio y servicios (backend/app/*_service.py, intelligence.py,
// analytics_insights.py, invima.py, firebase_db.py, browser_backup.py, minimax/gemini…).
// Los catálogos metodológicos y el catálogo de fuentes están en server.methodology.js.

// Códigos de estado que el backend intercala en algunas frases.
const TECH_STATUS = {
  capturada_no_asignada: "captured / not assigned",
  asignada_a_ciclo: "assigned to the cycle",
  filtrada_apta_priorizacion: "screened / eligible for prioritization",
  excluida: "excluded",
  priorizada: "prioritized",
  bajo_vigilancia: "under surveillance",
  no_priorizada: "not prioritized",
  en_evaluacion: "in assessment",
  publicada: "published",
  descartada: "discarded",
};

const CYCLE_STATUS = {
  en_configuracion: "in setup",
  en_filtrado: "in screening",
  en_priorizacion: "in prioritization",
  en_evaluacion: "in assessment",
  cerrado_consolidado: "closed / consolidated",
};

const MONTHS = {
  ene: "Jan", feb: "Feb", mar: "Mar", abr: "Apr", may: "May", jun: "Jun",
  jul: "Jul", ago: "Aug", sep: "Sep", oct: "Oct", nov: "Nov", dic: "Dec",
};

// signal_window.label(): "2019 a 2024", "desde 2019", "hasta 2024", "todos los años".
function windowLabel(text) {
  let m = /^(\d{4}) a (\d{4})$/.exec(text);
  if (m) return `${m[1]} to ${m[2]}`;
  m = /^desde (\d{4})$/.exec(text);
  if (m) return `from ${m[1]}`;
  m = /^hasta (\d{4})$/.exec(text);
  if (m) return `up to ${m[1]}`;
  return text === "todos los años" ? "all years" : text;
}

// firebase_db._guard_counts(): motivo por el que se bloquea una copia.
function guardReason(text) {
  let m = /^la bitácora local tiene (\d+) registros y la copia guardada (\d+): la base local no desciende de la copia guardada$/.exec(text);
  if (m) {
    return `the local audit log has ${m[1]} records and the saved backup has ${m[2]}: the local database does not descend from the saved backup`;
  }
  m = /^la tabla (\S+) pasaría de (\d+) a (\d+) filas$/.exec(text);
  if (m) return `table ${m[1]} would go from ${m[2]} to ${m[3]} rows`;
  return text;
}

const INVIMA_SETS = {
  "Registros sanitarios y NSO, vigentes y vencidos": "Marketing authorizations and NSO, valid and expired",
  "Registros sanitarios de dispositivos médicos": "Medical device marketing authorizations",
  "Código Único de Medicamentos vigentes": "Valid Unique Medicine Codes (CUM)",
};
const INVIMA_SET_RE = "(Registros sanitarios y NSO, vigentes y vencidos|Registros sanitarios de dispositivos médicos|Código Único de Medicamentos vigentes)";

const INVIMA_NO_ROWS =
  " None of the rows had a recognizable product or active ingredient; check that the file is the marketing authorization listing.";

export default {
  // ---------------------------------------------------------------- cycle_service.py
  "La fecha de cierre debe ser posterior a la de apertura.": "The closing date must be later than the opening date.",
  "El corte de datos debe ser posterior a la fecha de apertura.": "The data cut-off must be later than the opening date.",
  "La fecha proyectada de boletín no puede ser anterior al corte de datos.":
    "The projected bulletin date cannot be earlier than the data cut-off.",
  "El ciclo histórico no se elimina.": "The historical cycle cannot be deleted.",
  "Solo se elimina un ciclo en configuración.": "Only a cycle in setup can be deleted.",
  "El ciclo tiene tecnologías asignadas.": "The cycle has technologies assigned.",
  "El ciclo tiene expedientes de evaluación.": "The cycle has assessment dossiers.",
  "El ciclo tiene boletines.": "The cycle has bulletins.",
  "El ciclo ya está cerrado.": "The cycle is already closed.",
  "El ciclo destino está cerrado.": "The destination cycle is closed.",
  "El ciclo destino debe ser distinto del ciclo de origen.": "The destination cycle must be different from the source cycle.",
  "El ciclo histórico no recibe arrastres.": "The historical cycle does not accept carry-overs.",

  // ---------------------------------------------------------------- strategy_service.py
  "Tecnología": "Technology",
  "Autorizada / en mercado": "Authorized / on the market",
  "Autorizada": "Authorized",
  "Fase IV": "Phase IV",
  "Fase III": "Phase III",
  "Fase II": "Phase II",
  "Fase I": "Phase I",
  "Sin fase declarada": "No phase declared",
  "Capturadas": "Captured",
  "Filtradas": "Screened",
  "Priorizadas": "Prioritized",
  "Evaluadas": "Assessed",
  "Publicadas": "Published",
  "Sin clúster": "No cluster",
  "Sin tipología": "No technology type",
  "Sin dato: falta fecha de fin de fase III o de aprobación": "No data: the phase III end date or the approval date is missing",
  "Ya tiene registro INVIMA": "Already has an INVIMA registration",
  "Ya aprobada por FDA/EMA": "Already approved by FDA/EMA",
  "La fecha esperada ya pasó sin aprobación registrada": "The expected date has passed with no approval on record",
  "Ficha pública no disponible.": "Public fact sheet not available.",
  "El boletín ya está publicado.": "The bulletin is already published.",
  "El boletín requiere aprobación del líder antes de publicarse.":
    "The bulletin requires the lead's approval before it is published.",
  "Solo se distribuye un boletín publicado: apruébelo y publíquelo primero.":
    "Only a published bulletin can be distributed: approve and publish it first.",
  "Indique al menos un destinatario.": "Enter at least one recipient.",
  "El correo institucional no está configurado (SMTP). Descargue el PDF y envíelo por su correo.":
    "The institutional email is not configured (SMTP). Download the PDF and send it from your own email.",
  "Se detectó una señal de ensayo fase III asociada a Colombia.":
    "A phase III trial signal associated with Colombia was detected.",

  // ---------------------------------------------------------------- intelligence.py
  "Reglas del catálogo": "Catalog rules",
  "Aprendizaje (señales parecidas)": "Learning (similar signals)",
  "Aprendizaje con parecido bajo": "Learning with low similarity",
  "Reglas y aprendizaje coinciden": "Rules and learning agree",
  "IA generativa": "Generative AI",
  "IA confirma la propuesta": "AI confirms the proposal",
  "Sin evidencia": "No evidence",
  "sistema (automático)": "system (automatic)",
  "Sistema experto de reglas (determinista)": "Rule-based expert system (deterministic)",
  "Propone clúster, tipología y condición con palabras clave, códigos CIE-10 y términos MeSH del catálogo metodológico.":
    "Proposes cluster, technology type and condition using keywords, ICD-10 codes and MeSH terms from the methodology catalog.",
  "No aprende: aplica las reglas que el equipo mantiene en Configuración › Gobierno metodológico.":
    "It does not learn: it applies the rules the team maintains in Settings › Methodology governance.",
  "Catálogo de clústeres y tipologías vigente.": "Current catalog of clusters and technology types.",
  "Acierto medido en clúster": "Measured accuracy for cluster",
  "Acierto medido en tipología": "Measured accuracy for technology type",
  "Clasificador que aprende": "Learning classifier",
  "Aprendizaje supervisado por vecinos más cercanos (k-NN) sobre texto: TF-IDF y similitud coseno":
    "Supervised k-nearest-neighbor (k-NN) learning on text: TF-IDF and cosine similarity",
  "Busca las señales más parecidas que el equipo ya clasificó y vota el clúster y la tipología, ponderando por el parecido.":
    "Finds the most similar signals the team has already classified and votes on the cluster and technology type, weighted by similarity.",
  "Aprendizaje incremental basado en ejemplos: cada clasificación o descarte del equipo entra a la base de conocimiento y cuenta desde la siguiente sugerencia. No hay entrenamiento por lotes ni pesos ocultos: cada sugerencia cita las señales que la sustentan.":
    "Incremental, example-based learning: every classification or discard by the team goes into the knowledge base and counts from the next suggestion onward. There is no batch training and there are no hidden weights: each suggestion cites the signals that support it.",
  "Base de conocimiento de señales del propio IETS (se respalda con la base del sistema).":
    "Knowledge base of IETS's own signals (backed up together with the system database).",
  "Señales en la base": "Signals in the knowledge base",
  "Ejemplos clasificados (de ellos aprende)": "Classified examples (it learns from these)",
  "Ejemplos descartados (avisos)": "Discarded examples (warnings)",
  "Términos distintos en el vocabulario": "Distinct terms in the vocabulary",
  "Vecinos que votan (k)": "Voting neighbors (k)",
  "Parecido mínimo para votar": "Minimum similarity to vote",
  "Confianza mínima para preferirlo a las reglas": "Minimum confidence to prefer it over the rules",
  "Acierto combinado (lo que ve el evaluador)": "Combined accuracy (what the assessor sees)",
  "Última actualización de la base": "Last knowledge base update",
  "Apagado en los parámetros.": "Switched off in the parameters.",
  "Calibración": "Calibration",
  "Validación cruzada dejando una fuera (leave-one-out)": "Leave-one-out cross-validation",
  "Mide el acierto real de cada método con las clasificaciones del equipo y ajusta k y la confianza mínima.":
    "Measures the real accuracy of each method against the team's classifications and tunes k and the minimum confidence.",
  "Se recalcula solo cuando se pulsa «Calibrar ahora».": "It is recalculated only when “Calibrate now” is pressed.",
  "Señales ya clasificadas por el equipo.": "Signals already classified by the team.",
  "Última calibración": "Last calibration",
  "Señales evaluadas": "Signals evaluated",
  "Precisión objetivo": "Target precision",
  "Objetivo cumplido": "Target met",
  "Modelo de lenguaje de gran tamaño (LLM) preentrenado, consultado por API":
    "Pre-trained large language model (LLM), queried through an API",
  "Lee las páginas de las fuentes para extraer señales, arbitra la clasificación cuando reglas y aprendizaje no coinciden y redacta la lectura analítica. Nunca decide sola: el evaluador confirma.":
    "Reads the source pages to extract signals, arbitrates the classification when rules and learning disagree, and drafts the analytical reading. It never decides on its own: the assessor confirms.",
  "No se entrena ni se reajusta con datos del IETS. En cada consulta recibe como contexto los ejemplos ya clasificados por el equipo (aprendizaje en contexto) y el prompt configurado.":
    "It is not trained or fine-tuned on IETS data. In each query it receives as context the examples already classified by the team (in-context learning) and the configured prompt.",
  "Texto de la señal, ejemplos del equipo y prompts de Configuración. Lo extraído se contrasta con el texto visitado.":
    "Signal text, the team's examples and the prompts in Settings. What is extracted is checked against the visited text.",
  "Proveedor": "Provider",
  "Ninguno (IA apagada)": "None (AI switched off)",
  "Modelo de texto": "Text model",
  "Modelo de visión (OCR)": "Vision model (OCR)",
  "Cuándo clasifica": "When it classifies",
  "Nunca": "Never",
  "Solo si hay duda": "Only when in doubt",
  "Siempre": "Always",
  "Ejemplos del equipo en cada consulta": "Team examples in each query",
  "Lectura de sitios en la vigilancia": "Site reading during surveillance",
  "Consultas realizadas": "Queries made",
  "Tokens consumidos": "Tokens used",
  "Última consulta": "Last query",
  "Último modelo que respondió": "Last model that responded",
  "Sin IA el sistema sigue completo con reglas y aprendizaje.":
    "Without AI the system remains complete, with rules and learning.",
  "Si reglas y aprendizaje coinciden, se propone ese valor y la confianza sube.":
    "If rules and learning agree, that value is proposed and the confidence goes up.",
  "La IA no interviene en la clasificación.": "The AI takes no part in the classification.",
  "La IA se consulta solo cuando hay duda (desacuerdo o confianza baja) y su respuesta se muestra con su razón.":
    "The AI is consulted only when there is doubt (disagreement or low confidence) and its answer is shown with its reasoning.",
  "La IA se consulta en todas las sugerencias y su respuesta se muestra con su razón.":
    "The AI is consulted for every suggestion and its answer is shown with its reasoning.",
  "La decisión final siempre es del evaluador y queda en la bitácora de auditoría junto con la sugerencia que vio.":
    "The final decision always rests with the assessor and is recorded in the audit log together with the suggestion they saw.",

  // ---------------------------------------------------------------- analytics_insights.py
  "Descriptivo": "Descriptive",
  "¿Qué está pasando?": "What is happening?",
  "Diagnóstico": "Diagnostic",
  "¿Por qué pasa?": "Why is it happening?",
  "Predictivo": "Predictive",
  "¿Qué puede pasar?": "What could happen?",
  "Prescriptivo": "Prescriptive",
  "¿Qué conviene hacer?": "What should be done?",
  "Señales capturadas": "Captured signals",
  "Por clasificar": "To be classified",
  "Capturadas en 30 días": "Captured in 30 days",
  "Sin periodo anterior para comparar.": "No previous period to compare with.",
  "Clúster con más señales": "Cluster with the most signals",
  "Descarte": "Discards",
  "Enlaces exactos": "Exact links",
  "Fuentes sin señales": "Sources with no signals",
  "Fuentes sin acceso": "Sources with no access",
  "Aún no hay corridas registradas en el informe de acceso.": "There are no runs recorded in the access report yet.",
  "Antigüedad de la bandeja": "Inbox age",
  "Fuente con mucho ruido": "Source with a lot of noise",
  "Tendencia de captura": "Capture trend",
  "sube": "rising",
  "se mantiene": "steady",
  "Tiempo para evacuar la bandeja": "Time to clear the inbox",
  "sin ritmo medible": "no measurable pace",
  "Clúster en crecimiento": "Growing cluster",
  "Evacuar la bandeja": "Clear the inbox",
  "Use (Sugerir clasificación) y la asignación por lotes; descarte por grupo lo ya conocido.":
    "Use (Suggest classification) and batch assignment; discard what is already known as a group.",
  "Revisar fuentes con ruido": "Review noisy sources",
  "Atender fuentes sin señales": "Deal with sources that have no signals",
  "Abra Señales capturadas › Reporte de enlaces › Diagnóstico para la matriz.":
    "Open Captured signals › Link report › Diagnosis for the matrix.",
  "Recuperar el acceso a fuentes": "Restore access to sources",
  "Revise en Vigilancia › Informe de acceso las rutas probadas. Corrija la URL si cambió, agregue su canal RSS en la matriz o active el cliente compatible con navegador en Parámetros de fuentes.":
    "In Surveillance › Access report, check the routes that were tried. Correct the URL if it changed, add its RSS feed to the matrix or turn on the browser-compatible client in Source parameters.",
  "Equilibrar la vigilancia": "Balance surveillance",
  "Calibrar el clasificador": "Calibrate the classifier",
  "Señales clasificadas en la base de conocimiento. Con 20 o más, calibre en Configuración › Inteligencia.":
    "Classified signals in the knowledge base. With 20 or more, calibrate in Settings › Intelligence.",
  "Recalibrar el clasificador": "Recalibrate the classifier",
  "El equipo confirma pocas sugerencias: recalibre o ajuste las palabras clave de los clústeres.":
    "The team confirms few suggestions: recalibrate or adjust the cluster keywords.",
  "Mejorar el enlace a la señal": "Improve the link to the signal",
  "Registre en la matriz el canal RSS o el listado de las fuentes que abren una página de consulta.":
    "Record in the matrix the RSS feed or the listing for the sources that open a search page.",
  "Sin alertas": "No alerts",
  "al día": "up to date",
  "Los indicadores están dentro de los umbrales configurados.": "The indicators are within the configured thresholds.",
  "La lectura con IA está apagada en Configuración › Inteligencia.":
    "The AI reading is switched off in Settings › Intelligence.",
  "La IA no está configurada: se muestran los hallazgos calculados por reglas.":
    "The AI is not configured: the findings calculated by rules are shown.",
  "Pulse (Generar lectura con IA) para redactarla.": "Press (Generate AI reading) to draft it.",
  "La IA no respondió. Se conserva la lectura anterior, si la hay.":
    "The AI did not respond. The previous reading, if any, is kept.",

  // ---------------------------------------------------------------- screening_service.py
  "La propuesta de fusión no existe.": "The merge proposal does not exist.",
  "El registro que se conserva debe ser uno de los dos de la propuesta.":
    "The record to keep must be one of the two in the proposal.",
  "Alguna de las tecnologías ya no existe.": "One of the technologies no longer exists.",
  "La tecnología no existe.": "The technology does not exist.",
  "La tecnología no está asignada a este ciclo.": "The technology is not assigned to this cycle.",
  "El ciclo está congelado: la verificación no se modifica.": "The cycle is frozen: the verification cannot be changed.",
  "La tecnología fue excluida del ciclo; su verificación ya no se edita.":
    "The technology was excluded from the cycle; its verification can no longer be edited.",
  "Esta vía de novedad exige justificación explícita de al menos 20 caracteres.":
    "This novelty pathway requires an explicit justification of at least 20 characters.",
  "El índice del INVIMA reporta registro sanitario vigente: no puede declararse no disponible en el país. Elija la vía de novedad que corresponda y justifíquela.":
    "The INVIMA index reports a valid marketing authorization: it cannot be declared not available in the country. Choose the appropriate novelty pathway and justify it.",
  "Falta la verificación del criterio de novedad (RF10). Registre la vía de novedad antes de calificar la tecnología como apta.":
    "The novelty criterion verification (RF10) is missing. Record the novelty pathway before rating the technology as eligible.",
  "Falta cruzar la tecnología con el índice de registros sanitarios del INVIMA (RF11).":
    "The technology has not yet been cross-checked against the INVIMA marketing authorization index (RF11).",
  "La tecnología tiene registro sanitario vigente y la vía de novedad declarada la contradice.":
    "The technology has a valid marketing authorization and the declared novelty pathway contradicts it.",
  "La vía de novedad declarada exige justificación explícita.": "The declared novelty pathway requires an explicit justification.",
  "El ciclo no existe.": "The cycle does not exist.",
  "Sin clúster asignado": "No cluster assigned",

  // ---------------------------------------------------------------- signal_window.py
  "Fuera de la vigencia configurada": "Outside the configured validity window",
  "El año debe ser un número entero.": "The year must be a whole number.",
  "El año inicial no puede ser mayor que el año final.": "The start year cannot be later than the end year.",
  "todos los años": "all years",

  // ---------------------------------------------------------------- manual_review.py
  "Consultada, con señales registradas": "Consulted, with signals recorded",
  "Consultada, sin novedades": "Consulted, nothing new",
  "No se pudo consultar": "Could not be consulted",
  "Solo las fuentes de consulta manual (nivel E) se validan aquí.":
    "Only manual-consultation sources (level E) are validated here.",
  "Indique el resultado de la consulta.": "Enter the result of the consultation.",
  "Si no se pudo consultar, escriba el motivo en la nota.": "If it could not be consulted, write the reason in the note.",
  "Indique cuántas señales registró, o elija «Consultada, sin novedades».":
    "Enter how many signals you recorded, or choose “Consulted, nothing new”.",

  // ---------------------------------------------------------------- corroboration.py
  "Postulación (canal reactivo)": "Submission (reactive channel)",
  "Sin fuente": "No source",

  // ---------------------------------------------------------------- evaluation_service.py
  "Apertura del expediente": "Dossier opened",
  "Guardado de borrador": "Draft saved",
  "Observaciones del revisor": "Reviewer's comments",
  "El documento solo se edita en borrador o con observaciones.":
    "The document can only be edited as a draft or with comments.",
  "Falta un revisor interno con conflicto de interés declarado.":
    "An internal reviewer with a declared conflict of interest statement is missing.",
  "Falta un revisor externo con conflicto de interés declarado.":
    "An external reviewer with a declared conflict of interest statement is missing.",
  "Debe aceptar la declaración de conflicto de interés.": "You must accept the conflict of interest declaration.",
  "El revisor debe ser interno o externo.": "The reviewer must be internal or external.",
  "Nombre y correo del revisor son obligatorios.": "The reviewer's name and email are required.",
  "El correo del revisor no tiene un formato válido.": "The reviewer's email is not in a valid format.",
  "El documento ya está publicado: no admite nuevos revisores.":
    "The document is already published: no new reviewers can be added.",
  "La revisión ya fue enviada y no se revoca.": "The review has already been submitted and cannot be revoked.",
  "Invitación inexistente.": "The invitation does not exist.",
  "El documento ya no existe.": "The document no longer exists.",
  "El comentario no puede ir vacío.": "The comment cannot be empty.",
  "Sin declaración de conflicto de interés no hay revisión.":
    "There can be no review without a conflict of interest declaration.",
  "El veredicto debe ser aprobado u observado.": "The verdict must be approved or observed.",
  "El documento aún no está en revisión externa. Podrá enviar su veredicto cuando la coordinación lo pase a esa etapa; mientras tanto puede dejar observaciones.":
    "The document is not yet in external review. You will be able to submit your verdict once the coordination team moves it to that stage; in the meantime you can leave observations.",
  "El documento ya fue publicado; la revisión está cerrada.": "The document has already been published; the review is closed.",

  // ---------------------------------------------------------------- priority_engine.py
  "Sin registro sanitario colombiano en el sistema. Pendiente de verificación automática contra INVIMA (fase 3).":
    "No Colombian marketing authorization in the system. Automatic verification against INVIMA is pending (phase 3).",
  "Aprobación registrada con más de 12 meses de antigüedad.": "Approval on record is more than 12 months old.",
  "Sin fechas de aprobación FDA o EMA capturadas.": "No FDA or EMA approval dates captured.",
  "Sin estado de trámite regulatorio capturado.": "No regulatory procedure status captured.",
  "La calificación debe ser binaria (0 o 1).": "The rating must be binary (0 or 1).",
  "Los puntajes de este ciclo están congelados. Una reevaluación debe hacerse en un ciclo posterior, generando un registro nuevo.":
    "The scores for this cycle are frozen. A reassessment must be done in a later cycle, creating a new record.",
  "La tecnología fue excluida en el filtrado y no se califica.":
    "The technology was excluded during screening and cannot be rated.",
  "La tecnología aún no pasa el filtrado: registre la verificación de novedad y márquela como apta en Filtrado y depuración antes de calificarla (RF10).":
    "The technology has not yet passed screening: record the novelty verification and mark it as eligible in Screening and clean-up before rating it (RF10).",
  "La tecnología ya pasó a evaluación temprana; su calificación quedó fija para este ciclo.":
    "The technology has already moved on to early assessment; its rating is fixed for this cycle.",

  // ---------------------------------------------------------------- submission_service.py
  "La tecnología reportada es obligatoria (nombre comercial o DCI).":
    "The reported technology is required (brand name or INN).",
  "La indicación propuesta es obligatoria.": "The proposed indication is required.",
  "La fuente de información es obligatoria: adjunte al menos un enlace.":
    "The information source is required: provide at least one link.",
  "El correo de quien postula es obligatorio.": "The submitter's email is required.",
  "El correo de quien postula no es válido.": "The submitter's email is not valid.",
  "Si declara un conflicto de interés, debe describirlo (al menos 20 caracteres).":
    "If you declare a conflict of interest, you must describe it (at least 20 characters).",
  "Debe firmar la declaración de conflicto de interés.": "You must sign the conflict of interest declaration.",
  "Solo se aceptan postulaciones en estado recibida.": "Only submissions in the received status can be accepted.",
  "Solo se rechazan postulaciones en estado recibida.": "Only submissions in the received status can be rejected.",
  "El rechazo exige un motivo visible para la bitácora.": "A rejection requires a reason that is visible in the audit log.",

  // ---------------------------------------------------------------- submission_crosscheck.py
  "En la bandeja de entrada": "In the inbox",
  "Asignada a un ciclo": "Assigned to a cycle",
  "Apta para priorización": "Eligible for prioritization",
  "Descartada": "Discarded",
  "Postulación": "Submission",
  "FDA (medicamentos)": "FDA (medicines)",
  "FDA (dispositivos 510k)": "FDA (510(k) devices)",
  "La postulación no trae nombre para buscar.": "The submission has no name to search for.",
  "Ni los registros oficiales ni los buscadores trajeron resultados que mencionen la tecnología.":
    "Neither the official registries nor the search engines returned results that mention the technology.",
  "La vigilancia proactiva no la ha detectado: es una señal nueva aportada por la postulación.":
    "Proactive surveillance has not detected it: it is a new signal contributed by the submission.",

  // ---------------------------------------------------------------- technology_service.py
  "Ciclo retroactivo creado por la migracion de la fase 1. Agrupa las senales trabajadas bajo el modelo anterior de puntuacion continua (0-100), que no es comparable con el indice oficial %P.":
    "Retroactive cycle created by the phase 1 migration. It groups the signals worked on under the previous continuous scoring model (0-100), which is not comparable with the official %P index.",

  // ---------------------------------------------------------------- tech_search.py
  "Módulo 1. Identificación": "Module 1. Identification",
  "Módulo 2. Priorización": "Module 2. Prioritization",
  "Módulo 3. Evaluación": "Module 3. Assessment",
  "Módulo 4. Diseminación": "Module 4. Dissemination",
  "Bandeja de entrada": "Inbox",
  "Filtrado y depuración": "Screening and clean-up",
  "Priorización": "Prioritization",
  "Evaluación": "Assessment",
  "Fusionada por duplicado": "Merged as a duplicate",
  "Legacy (fuente del inventario anterior)": "Legacy (source from the previous inventory)",
  "Bandeja de entrada (Legacy)": "Inbox (Legacy)",
  "Descartada en la bandeja": "Discarded in the inbox",
  "Bandeja de entrada (descartadas)": "Inbox (discarded)",
  "Excluida en el filtrado": "Excluded during screening",
  "Ciclo cerrado (archivada)": "Closed cycle (archived)",
  "Ciclo histórico": "Historical cycle",
  "Escriba al menos dos letras.": "Type at least two letters.",
  "Sistema (captura automática)": "System (automatic capture)",
  "Registro creado": "Record created",
  "Cambio de datos": "Data change",
  "Registro eliminado": "Record deleted",
  "Restaurada a la bandeja": "Restored to the inbox",
  "Clasificada en la priorización": "Classified during prioritization",
  "Tecnología no encontrada": "Technology not found",

  // ---------------------------------------------------------------- search_knowledge.py
  "El paquete no tiene el formato esperado (falta la lista «pages»).":
    "The package is not in the expected format (the “pages” list is missing).",

  // ---------------------------------------------------------------- invima.py
  "Registros sanitarios y NSO, vigentes y vencidos": INVIMA_SETS["Registros sanitarios y NSO, vigentes y vencidos"],
  "Registros sanitarios de dispositivos médicos": INVIMA_SETS["Registros sanitarios de dispositivos médicos"],
  "Código Único de Medicamentos vigentes": INVIMA_SETS["Código Único de Medicamentos vigentes"],
  "El índice local está vacío: la verificación de novedad no puede descartar que la tecnología ya tenga registro sanitario.":
    "The local index is empty: the novelty verification cannot rule out that the technology already has a marketing authorization.",

  // ---------------------------------------------------------------- reprocess_service.py
  "Ruido de captura": "Capture noise",
  "Repetida: el mismo ítem ya entró por otro enlace de la misma organización":
    "Repeated: the same item already came in through another link from the same organization",
  "Producto de consumo o de venta libre (Health Canada)": "Consumer or over-the-counter product (Health Canada)",

  // ---------------------------------------------------------------- graph_service.py
  "Resuma este ciclo para un tomador de decisión de MinSalud: qué avanzó y qué falta.":
    "Summarize this cycle for a MinSalud decision-maker: what has progressed and what is still missing.",
  "¿Qué tecnologías del ciclo merecen vigilancia estrecha o Mini-HTA y por qué?":
    "Which technologies in the cycle deserve close surveillance or a Mini-HTA, and why?",
  "¿Dónde se atasca el embudo y qué habría que desbloquear antes del boletín?":
    "Where does the funnel get stuck, and what would need to be unblocked before the bulletin?",
  "¿Qué riesgo operativo hay si esta etapa no avanza?": "What is the operational risk if this stage does not move forward?",
  "Grupo de enfermedad": "Disease group",
  "Compare time-to-market y puntaje P1-P6 dentro de este clúster.":
    "Compare time-to-market and the P1-P6 score within this cluster.",
  "¿Qué implicaría su llegada al SGSSS en los próximos 24 meses?":
    "What would its arrival in the SGSSS in the next 24 months involve?",
  "¿Qué vacíos de evidencia o de registro INVIMA debería pedirle el IETS al desarrollador?":
    "What gaps in evidence or in INVIMA registration should IETS ask the developer to address?",
  "Evidencia y ensayos": "Evidence and trials",
  "Sin NCT público": "No public NCT",
  "Impacto presupuestal": "Budget impact",
  "Años 1-3": "Years 1-3",
  "Comparadores SGSSS": "SGSSS comparators",
  "Alternativas cubiertas": "Covered alternatives",

  // ---------------------------------------------------------------- ai_service.py / minimax_service.py / gemini_service.py
  "fallback (sin IA)": "fallback (no AI)",
  "fallback (sin Gemini)": "fallback (no Gemini)",
  "Modo sin IA. No se encontró contexto específico para su consulta en la base de datos. Configure MiniMax y ejecute un escaneo de las fuentes para enriquecer la información.":
    "No-AI mode. No specific context was found for your query in the database. Configure MiniMax and run a scan of the sources to enrich the information.",
  "Modo sin IA. No se encontró contexto específico para su consulta en la base de datos. Configure `GEMINI_API_KEY` y ejecute un escaneo de las fuentes para enriquecer la información.":
    "No-AI mode. No specific context was found for your query in the database. Configure `GEMINI_API_KEY` and run a scan of the sources to enrich the information.",
  "No hay API key de MiniMax configurada.": "No MiniMax API key is configured.",
  "La llave no expone modelos utilizables.": "The key does not expose any usable models.",
  "El modelo no devolvió contenido.": "The model returned no content.",
  "La librería google-generativeai no está instalada en el backend.":
    "The google-generativeai library is not installed on the backend.",
  "No hay API key configurada. Ingrese un token de Gemini.": "No API key is configured. Enter a Gemini token.",
  "La API key es válida pero no expone modelos con generateContent.":
    "The API key is valid but does not expose any models with generateContent.",
  "El modelo no devolvió contenido. Verifique cuotas/permisos.": "The model returned no content. Check quotas/permissions.",

  // ---------------------------------------------------------------- settings_store.py
  "Las reglas de horizonte deben ser un objeto.": "The horizon rules must be an object.",
  "El horizonte por defecto debe ser vacío, emergente, transicional o inminente.":
    "The default horizon must be empty, emergente, transicional or inminente.",

  // ---------------------------------------------------------------- browser_backup.py
  "La copia en el navegador solo aplica a SQLite.": "The browser backup only applies to SQLite.",
  "La copia llego vacia.": "The backup arrived empty.",
  "La copia supera el tamano permitido.": "The backup exceeds the allowed size.",
  "La base descomprimida es demasiado grande.": "The decompressed database is too large.",
  "El archivo no es una base SQLite valida.": "The file is not a valid SQLite database.",
  "La copia esta corrupta (quick_check).": "The backup is corrupt (quick_check).",
  "La copia no corresponde a este sistema.": "The backup does not belong to this system.",
  "La copia no trae su identidad; use la restauracion forzada.":
    "The backup does not carry its identity; use the forced restore.",
  "El servidor tiene una base distinta y posterior a la copia.":
    "The server has a different database that is newer than the backup.",
  "El servidor ya tiene trabajo registrado en su base actual; la copia del navegador solo se aplica con restauración forzada.":
    "The server already has work recorded in its current database; the browser backup can only be applied with a forced restore.",
  "El servidor ya tiene estos datos o unos mas recientes.": "The server already has this data or more recent data.",
  "La restauracion desde el navegador solo aplica a SQLite.": "Restoring from the browser only applies to SQLite.",
  "Ya hay una restauracion en curso.": "A restore is already in progress.",

  // ---------------------------------------------------------------- firebase_db.py
  "Antes de un despliegue": "Before a deployment",
  "Cierre del día": "End of day",
  "Escrita por otra instancia": "Written by another instance",
  "Antes de una restauración": "Before a restore",
  "Fijada a mano": "Pinned manually",
  "Copia actual": "Current backup",
  "Copia anterior": "Previous backup",
  "La persistencia de Horizonte no puede usar la coleccion de RRHH.":
    "Horizonte's persistence cannot use the HR collection.",
  "Firestore tardó demasiado en crear la base hs-iets.": "Firestore took too long to create the hs-iets database.",
  "La sonda no leyo la coleccion de Horizonte.": "The probe did not read the Horizonte collection.",
  "La copia en Firestore no trae fragmentos.": "The backup in Firestore contains no chunks.",
  "La copia en Firestore no coincide con su huella SHA-256.":
    "The backup in Firestore does not match its SHA-256 fingerprint.",
  "Copia en pausa: aún no se pudo leer Firestore; se reintenta sola.":
    "Backup paused: Firestore could not be read yet; it will retry on its own.",
  "no se pudo determinar la base de Firestore": "the Firestore database could not be determined",
};

export const patterns = [
  // ---------------------------------------------------------------- cycle_service.py
  {
    re: /^La ventana del ciclo es de (\d+) semanas y debe estar entre (\d+) y (\d+) semanas \(parámetro metodológico\)\.$/,
    en: "The cycle window is $1 weeks long and must be between $2 and $3 weeks (methodology parameter).",
  },
  {
    re: /^El año (\d+) ya tiene (\d+) ciclos formales y el máximo metodológico es (\d+)\. Cierre o reprograme un ciclo antes de crear otro\.$/,
    en: "The year $1 already has $2 formal cycles and the methodology maximum is $3. Close or reschedule a cycle before creating another one.",
  },
  {
    re: /^Transición no permitida de '([^']*)' a '([^']*)'\. Transiciones válidas: (.+)\.$/,
    en: (m) => `Transition from '${m[1]}' to '${m[2]}' is not allowed. Valid transitions: ${m[3] === "ninguna" ? "none" : m[3]}.`,
  },
  {
    re: /^No se puede cerrar: (\d+) tecnología\(s\) siguen en evaluación sin informe final\. Publique el informe o registre una justificación de cierre\.$/,
    en: "Cannot close: $1 technology(ies) are still in assessment with no final report. Publish the report or record a closing justification.",
  },

  // ---------------------------------------------------------------- strategy_service.py
  { re: /^Tecnología (\d+)$/, en: "Technology $1" },
  { re: /^Boletín epidemiológico y financiero — (.+)$/, en: "Epidemiological and financial bulletin — $1" },
  { re: /^Correos no válidos: (.+)$/, en: "Invalid email addresses: $1" },
  { re: /^Máximo (\d+) destinatarios por envío\.$/, en: "Maximum of $1 recipients per mailing." },
  { re: /^Nuevo ensayo fase III en el país: (.+)$/, en: "New phase III trial in the country: $1" },
  { re: /^Cambio de fase clínica en tecnología de alto riesgo: (.+)$/, en: "Clinical phase change in a high-risk technology: $1" },
  { re: /^Cambio de fase en tecnología de alto riesgo: (.+)$/, en: "Stage change in a high-risk technology: $1" },
  {
    re: /^Paso de (\S+) a (\S+) con (\d+) puntos de priorización\.$/,
    en: (m) => `Moved from ${TECH_STATUS[m[1]] || m[1]} to ${TECH_STATUS[m[2]] || m[2]} with ${m[3]} prioritization points.`,
  },
  {
    re: /^La fase de desarrollo pasó de «(.*?)» a «(.*?)» con (\d+) puntos de priorización\.$/,
    en: "The development phase changed from “$1” to “$2” with $3 prioritization points.",
  },

  // ---------------------------------------------------------------- intelligence.py / classification.py
  {
    re: /^(.+)\. Coincide con (\d+) señal\(es\) parecida\(s\) ya clasificada\(s\)\.$/,
    en: (m, ts) => `${ts(m[1])}. It matches ${m[2]} similar signal(s) already classified.`,
  },
  { re: /^Parecida a (\d+) señal\(es\) que el equipo ya clasificó así\.$/, en: "Similar to $1 signal(s) the team has already classified this way." },
  {
    re: /^Parecido bajo con (\d+) señal\(es\) ya clasificada\(s\): revísela con cuidado\.$/,
    en: "Low similarity to $1 signal(s) already classified: review it carefully.",
  },
  { re: /^Coincidencias: (.+)$/, en: "Matches: $1" },
  { re: /^Tipo heredado '(.*)'$/, en: "Legacy type '$1'" },
  {
    re: /^Se parece a (\d+) señal\(es\) que el equipo descartó(?: \(«(.*)»\))?\. Revise si aplica el mismo criterio\.$/,
    en: (m) =>
      `It resembles ${m[1]} signal(s) the team discarded${m[2] != null ? ` (“${m[2]}”)` : ""}. Check whether the same criterion applies.`,
  },
  {
    re: /^Hay (\d+) señal\(es\) clasificada\(s\); la calibración necesita al menos (\d+)\. Se conservan los parámetros actuales\.$/,
    en: "There are $1 classified signal(s); calibration needs at least $2. The current parameters are kept.",
  },
  {
    re: /^Las (\d+) señales clasificadas están casi todas en un solo clúster\. La calibración necesita al menos dos clústeres con (\d+) o más ejemplos cada uno\. Se conservan los parámetros actuales\.$/,
    en: "Almost all of the $1 classified signals are in a single cluster. Calibration needs at least two clusters with $2 or more examples each. The current parameters are kept.",
  },
  {
    re: /^Con (\d+) vecinos y confianza mínima de (\d+) % el aprendizaje acierta el clúster en (\d+) % de los casos y cubre (\d+) % de las señales\. Referencia: decir siempre el clúster más frecuente acertaría (\d+) %\.$/,
    en: "With $1 neighbors and a minimum confidence of $2%, learning gets the cluster right in $3% of cases and covers $4% of the signals. Baseline: always choosing the most frequent cluster would be right $5% of the time.",
  },
  {
    re: /^Con (\d+) vecinos y confianza mínima de (\d+) % el aprendizaje acierta el clúster en (\d+) % de los casos, por debajo del objetivo de (\d+) %: se conserva la confianza mínima actual y mandan las reglas\. Referencia: decir siempre el clúster más frecuente acertaría (\d+) %\.$/,
    en: "With $1 neighbors and a minimum confidence of $2%, learning gets the cluster right in $3% of cases, below the $4% target: the current minimum confidence is kept and the rules prevail. Baseline: always choosing the most frequent cluster would be right $5% of the time.",
  },
  {
    re: /^Empieza a votar con (\d+) señales clasificadas; hoy hay (\d+)\.$/,
    en: "It starts voting at $1 classified signals; there are $2 today.",
  },
  { re: /^Se recalcula sola cada (\d+) clasificaciones nuevas\.$/, en: "It is recalculated automatically every $1 new classifications." },
  {
    re: /^Aún no se ha calibrado: hacen falta (\d+) señales clasificadas\.$/,
    en: "Not calibrated yet: $1 classified signals are needed.",
  },
  {
    re: /^Si no coinciden, gana el aprendizaje solo cuando su confianza llega a (\d+) %; si no, quedan las reglas\.$/,
    en: "If they disagree, learning wins only when its confidence reaches $1%; otherwise the rules stand.",
  },

  // ---------------------------------------------------------------- analytics_insights.py
  { re: /^(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic) (\d{4})$/, en: (m) => `${MONTHS[m[1]]} ${m[2]}` },
  { re: /^Fuente (\d+)$/, en: "Source $1" },
  {
    re: /^(\d+) en la bandeja de entrada, (\d+) en ciclos y (\d+) descartadas\.$/,
    en: "$1 in the inbox, $2 in cycles and $3 discarded.",
  },
  {
    re: /^(\d+) de la bandeja ya tienen clúster y tipología; (\d+) están en varias fuentes\.$/,
    en: "$1 in the inbox already have a cluster and technology type; $2 appear in several sources.",
  },
  {
    re: /^([+-]?\d+(?:[.,]\d+)?) % frente a los 30 días anteriores \((\d+)\)\.$/,
    en: "$1% compared with the previous 30 days ($2).",
  },
  {
    re: /^(\d+) señales clasificadas \((\d+(?:[.,]\d+)?) % del total clasificado\)\.$/,
    en: "$1 classified signals ($2% of the classified total).",
  },
  { re: /^(\d+) de (\d+) señales se descartaron en la bandeja\.$/, en: "$1 of $2 signals were discarded in the inbox." },
  {
    re: /^De (\d+) señales, las demás abren la página de consulta o no tienen enlace\.$/,
    en: "Out of $1 signals; the rest open the search page or have no link.",
  },
  {
    re: /^De (\d+) fuentes con ingesta activa\. Revise su URL en el Diagnóstico para la matriz\.$/,
    en: "Out of $1 sources with active ingestion. Check their URL in the Diagnosis for the matrix.",
  },
  {
    re: /^De (\d+) fuentes rastreadas, en su última corrida\. El informe de acceso de Vigilancia dice qué rutas se probaron en cada una\.$/,
    en: "Out of $1 sources crawled, in their latest run. The Surveillance access report shows which routes were tried for each one.",
  },
  {
    re: /^Mediana de las señales por clasificar; (\d+) llevan (\d+) días o más\.$/,
    en: "Median for the signals to be classified; $1 have been waiting $2 days or more.",
  },
  { re: /^(.+): (\d+) de (\d+) señales descartadas\.$/, en: "$1: $2 of $3 signals discarded." },
  {
    re: /^([+-]?\d+(?:[.,]\d+)?) señales por mes en los últimos (\d+) meses cerrados\. Proyección del próximo mes: (.+)\.$/,
    en: "$1 signals per month over the last $2 closed months. Projection for next month: $3.",
  },
  {
    re: /^Al ritmo de los últimos 30 días \((\d+) clasificadas\) frente a (\d+) por clasificar\.$/,
    en: "At the pace of the last 30 days ($1 classified) against $2 still to be classified.",
  },
  {
    re: /^Hay (\d+) por clasificar y casi ninguna clasificación en 30 días: no se puede proyectar\.$/,
    en: "There are $1 to be classified and almost no classifications in 30 days: no projection is possible.",
  },
  {
    re: /^(\d+) señales en 60 días frente a (\d+) en los 60 anteriores\.$/,
    en: "$1 signals in 60 days compared with $2 in the previous 60.",
  },
  {
    re: /^Más del (\d+(?:[.,]\d+)?) % de sus señales se descarta: ajuste su URL de entrada o sus términos\.$/,
    en: "More than $1% of their signals are discarded: adjust their entry URL or their terms.",
  },
  {
    re: /^(.+) concentra la clasificación: revise si faltan fuentes de otros clústeres\.$/,
    en: (m, ts) => `${ts(m[1])} dominates the classification: check whether sources for other clusters are missing.`,
  },
  { re: /^(\d+) semanas$/, en: "$1 weeks" },
  { re: /^(\d+) días$/, en: "$1 days" },
  { re: /^(-?\d+(?:[.,]\d+)?) %$/, en: "$1%" },

  // ---------------------------------------------------------------- screening_service.py
  {
    re: /^La propuesta ya fue resuelta como '([^']*)' y no se reabre\.$/,
    en: "The proposal has already been resolved as '$1' and cannot be reopened.",
  },
  { re: /^La propuesta ya fue resuelta como '([^']*)'\.$/, en: "The proposal has already been resolved as '$1'." },
  {
    re: /^La tecnología #(\d+) ya fue fusionada con la #(\d+)\. Ejecute de nuevo el barrido para comparar contra el registro vigente\.$/,
    en: "Technology #$1 has already been merged into #$2. Run the sweep again to compare against the current record.",
  },
  { re: /^Fusionada con la tecnología #(\d+)\.$/, en: "Merged into technology #$1." },
  {
    re: /^Sin objeto: la tecnología #(\d+) fue absorbida por la #(\d+)\.$/,
    en: "No longer applicable: technology #$1 was absorbed into #$2.",
  },
  { re: /^Opción de novedad inválida\. Opciones: (.+)\.$/, en: "Invalid novelty option. Options: $1." },

  // ---------------------------------------------------------------- signal_window.py
  { re: /^El año debe estar entre (\d+) y (\d+)\.$/, en: "The year must be between $1 and $2." },
  {
    re: /^Fuera de la vigencia configurada: (?:año (\d{4})|sin fecha de publicación) \(vigencia (.+)\)$/,
    en: (m) =>
      `Outside the configured validity window: ${m[1] ? `year ${m[1]}` : "no publication date"} (window ${windowLabel(m[2])})`,
  },
  { re: /^desde (\d{4})$/, en: "from $1" },
  { re: /^hasta (\d{4})$/, en: "up to $1" },
  { re: /^(\d{4}) a (\d{4})$/, en: "$1 to $2" },

  // ---------------------------------------------------------------- evaluation_service.py
  { re: /^Nivel de producto desconocido: (.*)$/, en: "Unknown product level: $1" },
  { re: /^Su perfil no tiene el permiso requerido \((.+)\)\.$/, en: "Your profile does not have the required permission ($1)." },
  {
    re: /^Complete los campos obligatorios: (.+)\.$/,
    en: (m, ts) => `Complete the required fields: ${m[1].split(", ").map((part) => ts(part)).join(", ")}.`,
  },
  { re: /^No se puede pasar de '([^']*)' a '([^']*)'\.$/, en: "Cannot move from '$1' to '$2'." },
  {
    re: /^El perfil no tiene permiso para esta transición \((.+)\)\.$/,
    en: "The profile does not have permission for this transition ($1).",
  },
  {
    re: /^No se envía a revisión interna con campos obligatorios vacíos: (.+)$/,
    en: "It cannot be sent to internal review with required fields empty: $1",
  },
  { re: /^Transición (\S+) -> (\S+)$/, en: "Transition $1 -> $2" },

  // ---------------------------------------------------------------- priority_engine.py
  { re: /^Registro sanitario registrado en el sistema: (.+)$/, en: "Marketing authorization recorded in the system: $1" },
  { re: /^Aprobación reciente: (.+)$/, en: "Recent approval: $1" },
  { re: /^Estado regulatorio declarado: (.+)$/, en: "Declared regulatory status: $1" },
  { re: /^Criterio desconocido: (.*)$/, en: "Unknown criterion: $1" },
  {
    re: /^El perfil '(.*)' no califica el criterio (\S+)\.$/,
    en: (m, ts) => `The '${ts(m[1])}' profile does not rate criterion ${m[2]}.`,
  },

  // ---------------------------------------------------------------- submission_service.py / submission_crosscheck.py
  {
    re: /^Los enlaces a evidencia deben iniciar con http:\/\/ o https:\/\/ \(revise: (.*)\)\.$/,
    en: "Evidence links must start with http:// or https:// (check: $1).",
  },
  { re: /^(\d+) resultado\(s\)$/, en: "$1 result(s)" },
  { re: /^No se pudo consultar la web \((.+)\)\.$/, en: "The web could not be queried ($1)." },
  {
    re: /^(La vigilancia ya la detectó: (\d+) coincidencia\(s\) en (\d+) fuente\(s\)\. Revise si es la misma tecnología antes de aceptar \(al aceptarla, la bandeja la marcará en varias fuentes\)\.|La vigilancia proactiva no la ha detectado: es una señal nueva aportada por la postulación\.)(?: Registros oficiales: (\d+) ficha\(s\)\. Web: (\d+) resultado\(s\) que la mencionan\.| (.+))?$/,
    en: (m, ts) => {
      let out = m[2] != null
        ? `Surveillance has already detected it: ${m[2]} match(es) in ${m[3]} source(s). Check whether it is the same technology before accepting (once accepted, the inbox will flag it as present in several sources).`
        : "Proactive surveillance has not detected it: it is a new signal contributed by the submission.";
      if (m[4] != null) out += ` Official registries: ${m[4]} record(s). Web: ${m[5]} result(s) that mention it.`;
      else if (m[6] != null) out += ` ${ts(m[6])}`;
      return out;
    },
  },

  // ---------------------------------------------------------------- tech_search.py
  { re: /^Fusionada en «(.*)»$/, en: "Merged into “$1”" },
  {
    re: /^No se encontraron tecnologías ni señales con «(.*)»\. Pruebe con otra parte del nombre, la DCI, el fabricante o la fuente\.$/,
    en: "No technologies or signals were found with “$1”. Try another part of the name, the INN, the manufacturer or the source.",
  },
  { re: /^Asignada al ciclo (.+)$/, en: "Assigned to cycle $1" },
  {
    re: /^Estado: (.+)$/,
    en: (m, ts) => {
      const label = ts(m[1]);
      return label === m[1] ? m[0] : `Status: ${label}`;
    },
  },
  {
    re: /^(.+) → (.+)$/,
    en: (m, ts) => `${ts(m[1])} → ${ts(m[2])}`,
  },

  // ---------------------------------------------------------------- invima.py
  {
    // Un mensaje por conjunto de datos, unidos en una sola línea.
    re: new RegExp(`^${INVIMA_SET_RE}: `),
    en: (m) =>
      m.input
        .replace(new RegExp(`${INVIMA_SET_RE}: (\\d+) nuevos, (\\d+) actualizados\\.`, "g"), (_, set, a, b) => `${INVIMA_SETS[set]}: ${a} new, ${b} updated.`)
        .replace(new RegExp(`${INVIMA_SET_RE}: sin registros publicados\\.`, "g"), (_, set) => `${INVIMA_SETS[set]}: no published records.`)
        .replace(new RegExp(`${INVIMA_SET_RE}: no disponible \\(([^)]*)\\)\\.`, "g"), (_, set, why) => `${INVIMA_SETS[set]}: not available (${why}).`)
        .replace(
          "Ningún conjunto respondió. El índice local conserva la versión anterior; use la carga de archivo plano como contingencia.",
          "No dataset responded. The local index keeps the previous version; use the flat-file upload as a contingency.",
        ),
  },
  {
    re: /^Carga de '(.*?)' con separador '(.*?)'\.( Ninguna fila tenía producto ni principio activo reconocibles; revise que el archivo corresponda al listado de registros sanitarios\.)?$/,
    en: (m) => `Upload of '${m[1] === "archivo" ? "file" : m[1]}' with separator '${m[2]}'.${m[3] ? INVIMA_NO_ROWS : ""}`,
  },
  { re: /^Archivo ilegible \((.+)\)\.$/, en: "Unreadable file ($1)." },
  {
    re: /^El índice tiene (\d+) días de antigüedad, por encima del máximo de (\d+)\. Sincronice antes de filtrar\.$/,
    en: "The index is $1 days old, above the maximum of $2. Synchronize before screening.",
  },

  // ---------------------------------------------------------------- reprocess_service.py
  { re: /^Ruido de captura: (.+)$/, en: (m, ts) => `Capture noise: ${ts(m[1])}` },

  // ---------------------------------------------------------------- graph_service.py
  {
    re: /^(\d+) tecnologías · (\S+)$/,
    en: (m) => `${m[1]} technologies · ${CYCLE_STATUS[m[2]] || m[2]}`,
  },
  { re: /^(\d+) tecnologías$/, en: "$1 technologies" },
  {
    re: /^¿Qué significa que (\d+) tecnologías estén en '(.*)' en este ciclo\?$/,
    en: (m, ts) => `What does it mean that ${m[1]} technologies are at '${ts(m[2])}' in this cycle?`,
  },
  {
    re: /^¿Qué tecnologías de (.+) concentran más riesgo para el SGSSS\?$/,
    en: (m, ts) => `Which technologies in ${ts(m[1])} concentrate the most risk for the SGSSS?`,
  },
  { re: /^(.+) · (\d+) pts$/, en: (m, ts) => `${ts(m[1])} · ${m[2]} pts` },
  {
    re: /^(.+) · (s\/d|-?\d+(?:[.,]\d+)?) m$/,
    en: (m, ts) => `${ts(m[1])} · ${m[2] === "s/d" ? "n/a" : m[2]} mo`,
  },
  {
    re: /^Explique (.+) para un comité: evidencia, fase y cercanía al mercado\.$/,
    en: "Explain $1 to a committee: evidence, phase and proximity to market.",
  },
  {
    re: /^Interprete el time-to-market de (.+) y qué franja debería usar el tablero\.$/,
    en: "Interpret the time-to-market of $1 and which band the dashboard should use.",
  },
  {
    re: /^¿Qué ensayos o evidencia sostienen a (.+) y qué falta para Colombia\?$/,
    en: "Which trials or evidence support $1, and what is missing for Colombia?",
  },
  {
    re: /^Comente el orden de magnitud presupuestal de (.+) y sus supuestos\.$/,
    en: "Comment on the order of magnitude of the budget impact of $1 and its assumptions.",
  },
  { re: /^Compare (.+) con lo que ya se usa en el SGSSS\.$/, en: "Compare $1 with what is already used in the SGSSS." },
  {
    re: /^Nodo (.+) no encontrado en el grafo del ciclo (.+)\.$/,
    en: "Node $1 not found in the graph for cycle $2.",
  },

  // ---------------------------------------------------------------- minimax_service.py / gemini_service.py
  { re: /^\[Error MiniMax HTTP (\d+): (.*)\]$/, en: "[MiniMax error HTTP $1: $2]" },
  { re: /^\[Error al consultar MiniMax: (.*)\]$/, en: "[Error querying MiniMax: $1]" },
  { re: /^\[Error al consultar Gemini: (.*)\]$/, en: "[Error querying Gemini: $1]" },
  {
    re: /^Conexión MiniMax exitosa\. Modelo activo: (.+?)\.(?: Saldo Coding Plan: (.+)\.)?$/,
    en: (m) => `MiniMax connection successful. Active model: ${m[1]}.${m[2] != null ? ` Coding Plan balance: ${m[2]}.` : ""}`,
  },
  { re: /^Saldo Coding Plan: (.+)\.$/, en: "Coding Plan balance: $1." },
  { re: /^Error de conexión con MiniMax: (.*)$/, en: "MiniMax connection error: $1" },
  {
    re: /^Conexión exitosa\. Modelo activo: (.+)\. (\d+) modelos disponibles\.$/,
    en: "Connection successful. Active model: $1. $2 models available.",
  },
  { re: /^Error de conexión con Gemini: (.*)$/, en: "Gemini connection error: $1" },

  // ---------------------------------------------------------------- settings_store.py
  { re: /^El intervalo debe estar entre (\d+) y (\d+) horas\.$/, en: "The interval must be between $1 and $2 hours." },
  { re: /^Falta la lista de palabras clave de '(.*)'\.$/, en: "The keyword list for '$1' is missing." },
  { re: /^'(.*)…' supera (\d+) caracteres\.$/, en: "'$1…' exceeds $2 characters." },
  { re: /^'(.*)' debe empezar y terminar en letra o número\.$/, en: "'$1' must start and end with a letter or a number." },
  { re: /^La lista de '(.*)' no puede quedar vacía\.$/, en: "The list for '$1' cannot be left empty." },
  { re: /^La lista de '(.*)' admite como máximo (\d+) términos\.$/, en: "The list for '$1' allows at most $2 terms." },

  // ---------------------------------------------------------------- firebase_db.py
  { re: /^Falta el fragmento (\d+) de (\d+) en Firestore\.$/, en: "Chunk $1 of $2 is missing in Firestore." },
  {
    re: /^Copia bloqueada: la base local \((\d+) bytes\) es mucho menor que la guardada en Firestore \((\d+) bytes\)\. Se conserva la de la nube para no perder información\.$/,
    en: "Backup blocked: the local database ($1 bytes) is much smaller than the one saved in Firestore ($2 bytes). The cloud copy is kept so that no information is lost.",
  },
  {
    re: /^Copia bloqueada: (.+)\. Se conserva la copia de Firestore para no perder información\.$/,
    en: (m) => `Backup blocked: ${guardReason(m[1])}. The Firestore backup is kept so that no information is lost.`,
  },
];
