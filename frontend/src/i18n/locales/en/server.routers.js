// Mensajes que escribe el servidor en backend/app/routers/*.py, deps.py, security.py,
// rbac.py, schemas.py y main.py. La llave es el texto en español tal como sale del backend.

export default {
  "En moderación": "In moderation",
  "No aceptada": "Not accepted",
  "Su postulación está en moderación. El equipo del IETS aún no ha tomado una decisión.": "Your submission is in moderation. The IETS team has not made a decision yet.",
  "Su postulación fue aceptada y pasó a la vigilancia del IETS. Esto no implica una evaluación ni una recomendación.": "Your submission was accepted and moved into IETS surveillance. This does not imply an assessment or a recommendation.",
  "Su postulación no fue aceptada en esta revisión.": "Your submission was not accepted in this review.",
  "No encontramos una postulación con ese radicado y ese correo. Revise ambos datos.": "We could not find a submission with that tracking code and email. Check both.",
  "Fuera del alcance del escaneo de horizonte": "Outside the scope of horizon scanning",
  "La tecnología ya está en vigilancia o en el sistema": "The technology is already under surveillance or in the system",
  "Postulación duplicada": "Duplicate submission",
  "Fuente de información insuficiente o no verificable": "Insufficient or unverifiable source of information",
  "Tecnología ya disponible en el país (sin novedad)": "Technology already available in the country (no novelty)",
  "Datos incompletos o no identificables": "Incomplete or unidentifiable data",
  "No es una postulación válida (prueba o envío automático)": "Not a valid submission (test or automated sending)",
  "Otro motivo (se explica en la nota)": "Other reason (explained in the note)",
  "Postulación recibida por el formulario público": "Submission received through the public form",
  "Aceptada y enviada a la bandeja de entrada": "Accepted and sent to the inbox",
  "Reabierta para una nueva revisión": "Reopened for a new review",
  "El motivo de rechazo no existe. Elija uno de la lista.": "The rejection reason does not exist. Choose one from the list.",
  "Solo se reabren postulaciones rechazadas. Una aceptada ya creó una señal en la bandeja de entrada.": "Only rejected submissions can be reopened. An accepted one has already created a signal in the inbox.",
  "Explique por qué se reabre la postulación: queda en la bitácora.": "Explain why the submission is being reopened: it is recorded in the audit log.",
  // ------------------------------------------------------------------ deps.py
  "No autenticado": "Not authenticated",
  "Token inválido o expirado": "Invalid or expired token",
  "Token no válido para iniciar sesión": "Token not valid for signing in",
  "Usuario inactivo o inexistente": "Inactive or non-existent user",
  "La sesión caduco porque cambiaron las credenciales. Ingrese de nuevo.":
    "The session expired because the credentials changed. Sign in again.",
  "Debe cambiar su contraseña temporal antes de continuar.":
    "You must change your temporary password before continuing.",

  // -------------------------------------------------------------- security.py
  "Debe incluir al menos una letra.": "It must include at least one letter.",
  "Debe incluir al menos un número.": "It must include at least one number.",
  "No puede empezar ni terminar con espacios.": "It cannot start or end with spaces.",
  "No puede contener el usuario del correo.": "It cannot contain the user name of the email address.",

  // ------------------------------------------------------------------ rbac.py
  "Superadministrador": "Superadministrator",
  "Evaluador técnico": "Technical assessor",
  "Evaluador clínico": "Clinical assessor",
  "Tomador de decisiones": "Decision-maker",
  "Revisor por pares": "Peer reviewer",
  "Control total: usuarios, configuración, catálogos, bitácora y cierre de ciclos. Puede calificar los seis criterios.":
    "Full control: users, settings, catalogs, audit log and cycle closing. Can rate all six criteria.",
  "Opera la vigilancia, la bandeja de entrada, el filtrado y los ciclos; sincroniza el índice INVIMA y califica P1, P5 y P6.":
    "Runs surveillance, the inbox, screening and the cycles; synchronizes the INVIMA index and rates P1, P5 and P6.",
  "Opera la vigilancia, la bandeja de entrada y el filtrado; redacta informes y califica P2, P3 y P4.":
    "Runs surveillance, the inbox and screening; drafts reports and rates P2, P3 and P4.",
  "Consulta el sistema y los tableros restringidos (presupuestos y comparadores); puede escribir notas. No modifica la metodología.":
    "Views the system and the restricted dashboards (budgets and comparators); can write notes. Does not change the methodology.",
  "Consulta y registra revisiones por pares. El experto externo no necesita cuenta: entra con el enlace temporal de la invitación.":
    "Views and records peer reviews. The external expert does not need an account: they enter with the temporary link in the invitation.",
  "Consultar": "View",
  "Ver todos los módulos en modo lectura.": "View all modules in read-only mode.",
  "Editar fuentes": "Edit sources",
  "Crear, editar, habilitar y retirar fuentes del inventario.": "Create, edit, enable and retire sources in the inventory.",
  "Ejecutar vigilancia": "Run surveillance",
  "Lanzar la captura masiva o por fuente.": "Start the bulk or per-source capture.",
  "Asignar al ciclo": "Assign to the cycle",
  "Clasificar señales y asignarlas por lotes al ciclo.": "Classify signals and assign them to the cycle in batches.",
  "Editar tecnologías": "Edit technologies",
  "Modificar la ficha base de una tecnología.": "Change the base fact sheet of a technology.",
  "Gestionar ciclos": "Manage cycles",
  "Crear, editar y cambiar de estado los ciclos.": "Create, edit and change the status of cycles.",
  "Cerrar ciclos": "Close cycles",
  "Cerrar y consolidar un ciclo; congela los puntajes.": "Close and consolidate a cycle; freezes the scores.",
  "Editar catálogos": "Edit catalogs",
  "Clústeres, tipologías, criterios y parámetros metodológicos.":
    "Clusters, technology types, criteria and methodological parameters.",
  "Filtrar": "Screen",
  "Fusionar duplicados, verificar novedad y excluir con causa.":
    "Merge duplicates, verify novelty and exclude with a stated reason.",
  "Sincronizar INVIMA": "Synchronize INVIMA",
  "Actualizar el índice local de registros sanitarios.": "Update the local index of marketing authorizations.",
  "Calificar P1, P5, P6": "Rate P1, P5, P6",
  "Criterios técnico-regulatorios de la matriz %P.": "Technical and regulatory criteria of the %P matrix.",
  "Calificar P2, P3": "Rate P2, P3",
  "Criterios de relevancia clínica y carga de enfermedad.": "Clinical relevance and burden of disease criteria.",
  "Calificar P4": "Rate P4",
  "Criterio de impacto organizacional.": "Organizational impact criterion.",
  "Redactar informes": "Draft reports",
  "Fichas, informes, Mini-HTA y diseminación.": "Fact sheets, reports, Mini-HTA and dissemination.",
  "Revisar por pares": "Peer review",
  "Registrar observaciones y veredicto de revisión.": "Record review comments and verdict.",
  "Escribir notas": "Write notes",
  "Notas internas del equipo.": "Internal team notes.",
  "Ver bitácora": "View audit log",
  "Consultar la bitácora inmutable de auditoría.": "View the immutable audit log.",
  "Gestionar usuarios": "Manage users",
  "Crear cuentas, asignar perfiles y restablecer contraseñas.": "Create accounts, assign profiles and reset passwords.",
  "Configurar el sistema": "Configure the system",
  "IA, llaves de fuentes y parámetros institucionales.": "AI, source keys and institutional parameters.",
  "Tableros restringidos": "Restricted dashboards",
  "Ver montos presupuestales y comparadores del SGSSS.": "View budget amounts and SGSSS comparators.",

  // --------------------------------------------------------------- schemas.py
  "El motivo del descarte es obligatorio (mínimo 5 caracteres).":
    "The reason for discarding is required (minimum 5 characters).",
  "Grafo del ciclo": "Cycle graph",

  // ------------------------------------------------------------------ auth.py
  "Correo o contraseña incorrectos.": "Incorrect email or password.",
  "Usuario desactivado": "User deactivated",
  "Usuario desactivado. Contacte al administrador.": "User deactivated. Contact the administrator.",
  "Demasiados intentos desde esta conexión. Espere unos minutos e intente de nuevo.":
    "Too many attempts from this connection. Wait a few minutes and try again.",
  "La contraseña actual no es correcta.": "The current password is not correct.",
  "La nueva contraseña debe ser distinta de la actual.": "The new password must be different from the current one.",
  "Login con Google no configurado (falta GOOGLE_CLIENT_ID).":
    "Google sign-in is not configured (GOOGLE_CLIENT_ID is missing).",
  "Correo no verificado por Google": "Email not verified by Google",
  "Login de desarrollo deshabilitado": "Development sign-in is disabled",
  "Solo el superadministrador puede ver el sistema como otro perfil.":
    "Only the superadministrator can view the system as another profile.",
  "Perfil no válido.": "Invalid profile.",

  // ---------------------------------------------------------------- backup.py
  "Confirme la restauración escribiendo RESTAURAR.": "Confirm the restore by typing RESTAURAR.",

  // -------------------------------------------------------------- catalogs.py
  "El código debe tener entre 2 y 60 caracteres: minúsculas, números y guion bajo (ej. enf_raras).":
    "The code must have between 2 and 60 characters: lowercase letters, numbers and underscores (e.g. enf_raras).",
  "El nombre es obligatorio.": "The name is required.",
  "El nombre es obligatorio": "The name is required",
  "Registro no encontrado": "Record not found",
  "El nombre no puede quedar vacío.": "The name cannot be left empty.",
  "Es parte de la taxonomía oficial de la especificación: desactívelo en lugar de eliminarlo.":
    "It is part of the official taxonomy of the specification: deactivate it instead of deleting it.",
  "Parámetro no encontrado": "Parameter not found",
  "El valor no puede quedar vacío.": "The value cannot be left empty.",
  "El valor debe ser numérico.": "The value must be numeric.",
  "El valor debe ser un número entero.": "The value must be a whole number.",

  // ------------------------------------------------------------------ chat.py
  "Conversación no encontrada": "Conversation not found",
  "El mensaje no puede estar vacío": "The message cannot be empty",
  "Escriba una pregunta.": "Type a question.",

  // ---------------------------------------------------------------- config.py
  "No se pudo detectar un modelo MiniMax.": "Could not detect a MiniMax model.",
  "Escriba una consulta.": "Type a query.",
  "Tarea programada desconocida.": "Unknown scheduled task.",
  "Los cambios aplican a las señales que se capturen desde ahora; las ya capturadas no se reclasifican":
    "The changes apply to signals captured from now on; signals already captured are not reclassified",

  // ---------------------------------------------------------------- cycles.py
  "Ciclo no encontrado": "Cycle not found",
  "El código del ciclo es obligatorio.": "The cycle code is required.",
  "Un ciclo cerrado no admite modificaciones.": "A closed cycle cannot be modified.",
  "Las fechas de apertura y corte son obligatorias.": "The opening and cutoff dates are required.",
  "El ciclo puede cerrarse.": "The cycle can be closed.",
  "Solo un superadministrador puede cerrar y consolidar un ciclo.":
    "Only a superadministrator can close and consolidate a cycle.",

  // ------------------------------------------------------------- dashboard.py
  "Sin clasificar": "Unclassified",
  "Tecnología": "Technology",
  "Falta cruce con INVIMA": "INVIMA cross-check missing",
  "Falta vía de novedad": "Novelty pathway missing",
  "Revisar vía de novedad": "Review novelty pathway",
  "Calificar en la matriz P1-P6": "Rate in the P1-P6 matrix",
  "Sin clúster ni tipología": "No cluster or technology type",
  "Sin clúster": "No cluster",
  "Sin tipología": "No technology type",
  "Clasificaciones pendientes en la bandeja de entrada": "Pending classifications in the inbox",
  "Clasificar clúster y tipología": "Classify cluster and technology type",
  "Señales capturadas, sin asignar a ciclo y no fusionadas, a las que les falta el clúster o la tipología. Sin ambos datos no se pueden asignar a un ciclo.":
    "Captured signals, not assigned to a cycle and not merged, that are missing the cluster or the technology type. Without both they cannot be assigned to a cycle.",
  "Novedad por verificar": "Novelty to verify",
  "Verificar novedad e INVIMA": "Verify novelty and INVIMA",
  "Listas para declarar aptas": "Ready to be declared eligible",
  "Declarar aptas o excluir": "Declare eligible or exclude",
  "El índice INVIMA nunca se ha sincronizado.": "The INVIMA index has never been synchronized.",
  "Índice INVIMA desactualizado": "INVIMA index out of date",
  "Índice INVIMA vacío": "INVIMA index empty",
  "Sincronizar el índice": "Synchronize the index",
  "Fichas e informes en redacción": "Fact sheets and reports being drafted",
  "Continuar la redacción": "Continue drafting",
  "Expedientes de ciclos abiertos en borrador o devueltos con observaciones: los documentos que el equipo tiene que completar.":
    "Dossiers from open cycles that are in draft or were returned with comments: the documents the team has to complete.",
  "Fuentes tipo E por validar": "Type E sources to validate",
  "Validar fuentes manuales": "Validate manual sources",
  "Fuentes de consulta manual (nivel de acceso E: bases con licencia, portales con usuario o captcha) que la vigilancia automática no recorre. Cómo se calcula: fuentes E activas que nunca se han validado o cuya próxima revisión ya llegó, según su frecuencia en la matriz.":
    "Manually consulted sources (access level E: licensed databases, portals that require a login or a captcha) that automatic surveillance does not visit. How it is calculated: active E sources that have never been validated or whose next review is already due, according to their frequency in the matrix.",
  "Nunca validada": "Never validated",
  "Postulaciones por moderar": "Submissions to moderate",
  "Moderar postulaciones": "Moderate submissions",
  "Postulaciones del canal público (RF02) en estado recibida, sin aceptar ni rechazar.":
    "Submissions from the public channel (RF02) with status received, neither accepted nor rejected.",
  "Propuestas de fusión por resolver": "Merge proposals to resolve",
  "Confirmar o descartar fusiones": "Confirm or discard merges",
  "Pares de registros que el motor difuso propone fusionar (RF09). Ninguno se fusiona sin confirmación humana.":
    "Pairs of records that the fuzzy-matching engine proposes to merge (RF09). None is merged without human confirmation.",
  "Revisar el ciclo": "Review the cycle",
  "Bloqueos para cerrar el ciclo": "Blockers for closing the cycle",
  "Ver bloqueos de cierre": "View closing blockers",
  "Boletines por aprobar": "Bulletins to approve",
  "Aprobar y publicar": "Approve and publish",
  "Boletines compilados al cierre que esperan el visto del líder antes de publicarse (RF19).":
    "Bulletins compiled at closing that await the lead's approval before being published (RF19).",
  "Boletines publicados recientemente": "Recently published bulletins",
  "Leer boletines": "Read bulletins",
  "Alertas sin leer": "Unread alerts",
  "Revisar alertas": "Review alerts",
  "Alertas tempranas de sus suscripciones (cambio de fase en tecnologías de alto riesgo presupuestal, nuevo ensayo fase III en el país) que aún no marca como leídas.":
    "Early alerts from your subscriptions (phase change in technologies with high budget risk, new phase III trial in the country) that you have not yet marked as read.",
  "Alerta": "Alert",
  "Tablero estratégico": "Strategic dashboard",
  "Abrir el tablero estratégico": "Open the strategic dashboard",
  "Tecnologías priorizadas (incluidas las que pasaron a evaluación o se publicaron) en el último ciclo cerrado. El tablero muestra embudo, time-to-market e impacto presupuestal.":
    "Technologies prioritized (including those that moved on to assessment or were published) in the latest closed cycle. The dashboard shows the funnel, time-to-market and budget impact.",
  "Revisiones asignadas": "Assigned reviews",
  "Revisar documentos": "Review documents",
  "Revisiones por pares a su nombre que aún no envía (invitado o en lectura), de documentos no publicados.":
    "Peer reviews assigned to you that you have not yet submitted (invited or reading), for unpublished documents.",
  "COI firmado": "COI signed",
  "Falta firmar COI": "COI not yet signed",
  "Revisar señal": "Review signal",
  "Clasificar y asignar": "Classify and assign",
  "Verificar novedad": "Verify novelty",
  "Calificar P1-P6": "Rate P1-P6",
  "Recalificar": "Re-rate",
  "Abrir expediente": "Open dossier",
  "Continuar expediente": "Continue dossier",

  // ------------------------------------------------------------ evaluation.py
  "Documento no encontrado": "Document not found",
  "La tecnología no está asignada a este ciclo.": "The technology is not assigned to this cycle.",
  "Solo las tecnologías priorizadas abren expediente de evaluación temprana.":
    "Only prioritized technologies open an early assessment dossier.",
  "El ciclo está cerrado: no se abren expedientes nuevos en el.":
    "The cycle is closed: no new dossiers are opened in it.",
  "Sin declaración de conflicto de interés no se habilita la edición.":
    "Editing is not enabled without a conflict of interest declaration.",
  "Invitación no encontrada": "Invitation not found",
  "Sin declaración de conflicto de interés no se habilita la lectura.":
    "Reading is not enabled without a conflict of interest declaration.",
  "Se requiere permiso de informe o de revisión para comentar.":
    "Report or review permission is required to comment.",
  "Sin declaración de conflicto de interés no se habilitan comentarios.":
    "Comments are not enabled without a conflict of interest declaration.",
  "Sin declaración de conflicto de interés no se habilita la exportación.":
    "Export is not enabled without a conflict of interest declaration.",

  // -------------------------------------------------------------- findings.py
  "Estado de señal inválido.": "Invalid signal status.",
  "Tipo de tecnología inválido.": "Invalid technology type.",
  "Horizonte inválido.": "Invalid horizon.",
  "Hallazgo no encontrado": "Finding not found",
  "Fuente no encontrada": "Source not found",
  "El título de la señal es obligatorio.": "The signal title is required.",
  "El título de la señal no puede quedar vacío.": "The signal title cannot be left empty.",
  "IA no configurada. Configure MiniMax en Configuración.": "AI not configured. Set up MiniMax in Settings.",
  "La IA no pudo enriquecer el hallazgo. Intente de nuevo.": "The AI could not enrich the finding. Try again.",
  "La señal ya originó una tecnología asignada a un ciclo: forma parte del expediente y no se elimina. Márquela como descartada.":
    "The signal has already given rise to a technology assigned to a cycle: it is part of the dossier and is not deleted. Mark it as discarded.",
  "Otra tecnología se fusionó en esta; no se puede eliminar. Márquela como descartada.":
    "Another technology was merged into this one; it cannot be deleted. Mark it as discarded.",

  // ---------------------------------------------------------------- ingest.py
  "No hay fuentes habilitadas para ingerir.": "There are no sources enabled for ingestion.",
  "Los buscadores gratuitos (Yahoo, Bing, DuckDuckGo) bloquean o devuelven vacío cuando se les consulta en volumen, y más desde servidores en la nube. La vigilancia usa las páginas de la base de conocimiento de búsqueda y no espera a esos buscadores. Para sumar páginas nuevas desde el servidor, configure una llave de Brave Search API o un SearXNG propio en Configuración › Parámetros de fuentes, o cargue un paquete actualizado de la base de conocimiento.":
    "Free search engines (Yahoo, Bing, DuckDuckGo) block requests or return nothing when queried in volume, especially from cloud servers. Surveillance uses the pages in the search knowledge base and does not wait for those search engines. To add new pages from the server, set up a Brave Search API key or your own SearXNG instance in Settings › Source parameters, or upload an updated knowledge base package.",
  "Tecnología no encontrada": "Technology not found",

  // ---------------------------------------------------------- intelligence.py
  "La fecha no es válida (use AAAA-MM-DD).": "The date is not valid (use YYYY-MM-DD).",
  "Seleccione al menos una fuente.": "Select at least one source.",

  // ---------------------------------------------------------------- invima.py
  "El archivo está vacío.": "The file is empty.",

  // ----------------------------------------------------------------- notes.py
  "Nota general": "General note",
  "Nota no encontrada": "Note not found",
  "Tipo de entidad inválido": "Invalid entity type",
  "El contenido es obligatorio": "The content is required",
  "El elemento al que se quiere vincular la nota no existe.":
    "The item the note is to be linked to does not exist.",
  "El contenido no puede estar vacío": "The content cannot be empty",

  // -------------------------------------------------------------- priority.py
  "Ciclo cerrado: los puntajes están congelados.": "Cycle closed: the scores are frozen.",
  "Aún no pasa el filtrado: registre la verificación de novedad y márquela como apta.":
    "It has not passed screening yet: record the novelty verification and mark it as eligible.",
  "La tecnología fue excluida en el filtrado.": "The technology was excluded at screening.",
  "Ya pasó a evaluación temprana: la calificación quedó fija.":
    "It has already moved on to early assessment: the rating is now fixed.",

  // -------------------------------------------------------- public_catalog.py
  "Demasiadas consultas desde esta dirección. Intente de nuevo en un minuto.":
    "Too many queries from this address. Try again in a minute.",
  "la vista pública no puede filtrar modelaciones": "the public view must not leak modeling data",
  "Fase no reconocida.": "Unrecognized phase.",

  // ------------------------------------------------------- recommendations.py
  "El impacto debe ser alto, medio o bajo.": "The impact must be high, medium or low (alto, medio, bajo).",
  "El título de la recomendación es obligatorio.": "The recommendation title is required.",
  "El contenido de la recomendación es obligatorio.": "The recommendation content is required.",
  "Recomendación no encontrada": "Recommendation not found",
  "El título no puede quedar vacío.": "The title cannot be left empty.",
  "El contenido no puede quedar vacío.": "The content cannot be left empty.",

  // --------------------------------------------------------- review_portal.py
  "El enlace de revisión expiró. Solicite una nueva invitación.":
    "The review link has expired. Request a new invitation.",
  "Enlace de revisión inválido.": "Invalid review link.",
  "La invitación fue revocada por la coordinación del IETS.":
    "The invitation was revoked by the IETS coordination team.",

  // ------------------------------------------------------------------ scan.py
  "No hay fuentes habilitadas para escanear.": "There are no sources enabled for scanning.",
  "Las fuentes elegidas están retiradas del inventario vigente; no hay nada que encolar.":
    "The selected sources are retired from the current inventory; there is nothing to queue.",
  "La fuente está retirada del inventario vigente y la cola de ingesta la ignora.":
    "The source is retired from the current inventory and the ingestion queue ignores it.",
  "La ingesta de esta fuente está deshabilitada. Habilítela en el catálogo de fuentes.":
    "Ingestion is disabled for this source. Enable it in the source catalog.",
  "No se pudo encolar la fuente.": "Could not queue the source.",

  // ------------------------------------------------------------- screening.py
  "La tecnología no existe.": "The technology does not exist.",

  // --------------------------------------------------------------- sources.py
  "Agencias de HTA y redes de EH": "HTA agencies and HS networks",
  "El nombre de la fuente es obligatorio.": "The source name is required.",
  "La URL debe iniciar con http:// o https://": "The URL must start with http:// or https://",
  "El nivel de acceso debe ser A, B, C, D o E.": "The access level must be A, B, C, D or E.",
  "La configuración del conector debe ser un objeto JSON.": "The connector configuration must be a JSON object.",
  "La frecuencia en horas debe ser de al menos 1.": "The frequency in hours must be at least 1.",
  "La fuente está retirada del inventario vigente: la cola de ingesta la ignora. Registre una fuente nueva o recargue el catálogo verificado.":
    "The source is retired from the current inventory: the ingestion queue ignores it. Register a new source or reload the verified catalog.",
  "Suba el Excel de la matriz en formato .xlsx.": "Upload the matrix Excel file in .xlsx format.",
  "El Excel supera 10 MB.": "The Excel file exceeds 10 MB.",
  "No hay matriz empaquetada: suba el Excel.": "There is no bundled matrix: upload the Excel file.",
  "Suba el Excel de la matriz o pegue la URL de Google Sheets.":
    "Upload the matrix Excel file or paste the Google Sheets URL.",
  "Elija al menos una fuente para crear o actualizar.": "Choose at least one source to create or update.",
  "Enfoque inválido: revise el tema y la región.": "Invalid focus: check the topic and the region.",
  "Alcanzó el máximo de detecciones por ahora (6 cada 10 minutos). Espere unos minutos.":
    "You have reached the maximum number of detections for now (6 every 10 minutes). Wait a few minutes.",
  "Datos de la fuente propuesta incompletos (nombre y URL).": "The proposed source data is incomplete (name and URL).",
  "Las fuentes del catálogo verificado D-06 no se eliminan: la recarga del catálogo las volvería a crear. Deshabilite su ingesta si no desea vigilarla.":
    "Sources from the verified D-06 catalog are not deleted: reloading the catalog would create them again. Disable ingestion for the source if you do not want to monitor it.",

  // -------------------------------------------------------------- strategy.py
  "La fecha 'desde' es posterior a la fecha 'hasta'.": "The 'from' date is later than the 'to' date.",
  "Grafo no encontrado": "Graph not found",
  "El ciclo histórico no produce boletines.": "The historical cycle does not produce bulletins.",
  "Boletín no encontrado": "Bulletin not found",
  "Alerta no encontrada": "Alert not found",
  "El clúster indicado no existe.": "The specified cluster does not exist.",

  // ----------------------------------------------------------- submissions.py
  "Demasiadas postulaciones desde esta dirección. Intente más tarde.":
    "Too many submissions from this address. Try again later.",
  "Formulario protegido con reCAPTCHA v3.": "Form protected by reCAPTCHA v3.",
  "Verificación anti-robot en modo degradado: sin llaves de reCAPTCHA configuradas. Rigen el tope por IP y el campo trampa.":
    "Anti-bot verification in degraded mode: no reCAPTCHA keys configured. The per-IP limit and the honeypot field apply.",
  "Falta la verificación anti-robot. Recargue la página e intente de nuevo.":
    "The anti-bot verification is missing. Reload the page and try again.",
  "No se pudo contactar el servicio anti-robot. Intente de nuevo en unos minutos.":
    "Could not reach the anti-bot service. Try again in a few minutes.",
  "La verificación anti-robot no fue superada.": "The anti-bot verification was not passed.",
  "La verificación anti-robot no corresponde a este formulario.":
    "The anti-bot verification does not belong to this form.",
  "Postulación recibida.": "Submission received.",
  "La postulación quedó en moderación. El equipo del IETS la revisará.":
    "The submission is awaiting moderation. The IETS team will review it.",
  "Postulación no encontrada": "Submission not found",

  // ---------------------------------------------------------- technologies.py
  "Tecnología ya conocida": "Technology already known",
  "sin canal": "no channel",
  "Sin fuente": "No source",
  "No hay un ciclo activo. Cree un ciclo antes de asignar señales.":
    "There is no active cycle. Create a cycle before assigning signals.",
  "El ciclo está cerrado y no admite asignaciones.": "The cycle is closed and does not accept assignments.",
  "El ciclo histórico no admite asignaciones.": "The historical cycle does not accept assignments.",
  "Condición inválida: use 'emergente' o 'nueva'.": "Invalid condition: use 'emergente' or 'nueva'.",
  "Clúster inexistente.": "The cluster does not exist.",
  "Tipología inexistente.": "The technology type does not exist.",
  "El ciclo está congelado.": "The cycle is frozen.",
  "La tecnología fue excluida con causa tipificada y la exclusión no se revierte.":
    "The technology was excluded with a coded reason and the exclusion cannot be reversed.",
  "La causa de exclusión ya fue registrada y no es editable.":
    "The exclusion reason has already been recorded and cannot be edited.",
  "La tecnología ya está en evaluación temprana o publicada; no se excluye del ciclo. Registre la decisión en el expediente.":
    "The technology is already in early assessment or published; it is not excluded from the cycle. Record the decision in the dossier.",
  "El ciclo está cerrado y sus instancias congeladas.": "The cycle is closed and its entries are frozen.",
  "Solo las tecnologías priorizadas pasan a evaluación temprana.":
    "Only prioritized technologies move on to early assessment.",

  // ----------------------------------------------------------------- users.py
  "Usuario no encontrado": "User not found",
  "Es el único superadministrador activo. Asigne ese perfil a otra persona antes de cambiarlo.":
    "This is the only active superadministrator. Assign that profile to someone else before changing it.",
  "No puede quitarse a sí mismo el perfil de superadministrador.":
    "You cannot remove the superadministrator profile from yourself.",
  "No puede desactivarse a sí mismo.": "You cannot deactivate yourself.",
  "El correo no tiene un formato válido.": "The email address does not have a valid format.",
  "Cuenta creada. Entregue la contraseña temporal por un canal seguro: se mostrará una sola vez y deberá cambiarse en el primer ingreso.":
    "Account created. Hand over the temporary password through a secure channel: it is shown only once and must be changed at first sign-in.",
  "Cuenta creada con la contraseña indicada; deberá cambiarse en el primer ingreso.":
    "Account created with the password provided; it must be changed at first sign-in.",
  "Contraseña restablecida. Se mostrará una sola vez; las sesiones abiertas se cerraron.":
    "Password reset. It is shown only once; open sessions were closed.",
  "No puede eliminar su propia cuenta.": "You cannot delete your own account.",
  "La cuenta tiene actividad registrada en la bitácora y no puede eliminarse sin perder trazabilidad. Desactívela: dejará de tener acceso y su historia se conserva.":
    "The account has activity recorded in the audit log and cannot be deleted without losing traceability. Deactivate it: it will no longer have access and its history is kept.",
};

// ---------------------------------------------------------------------------
// Ayudas para los patrones
// ---------------------------------------------------------------------------

/** Traduce frase por frase un texto que el servidor armó uniendo oraciones con un espacio. */
function sentences(text, ts) {
  return text
    .replace(/\. (?=[A-ZÁÉÍÓÚÑ0-9¿¡])/g, ".\u0001")
    .split("\u0001")
    .map((part) => ts(part))
    .join(" ");
}

const DEADLINE = { "corte de datos": "data cutoff", "boletín": "bulletin" };
const DEADLINE_TITLE = { "corte de datos": "Data cutoff", "boletín": "Bulletin" };
const NOTE_ACTION = { editarla: "edit it", eliminarla: "delete it", mejorarla: "improve it" };
const TASK = { "vigilancia programada": "the scheduled surveillance", "barrido de duplicados": "the duplicate sweep" };
const PROFILE_FIELD = { "nivel de fuente": "source level", origen: "origin" };

/** "Ciclo 2026-1" → "Cycle 2026-1"; un código que no empieza por "Ciclo" queda igual. */
const cycleName = (name) => name.replace(/^Ciclo /, "Cycle ");
/** Nombre de respaldo que arma el servidor cuando la tecnología no tiene nombre. */
const techName = (name) => name.replace(/^Tecnología (\d+)$/, "Technology $1");

const PASSWORD_RULE =
  "(?:Debe tener al menos \\d+ caracteres\\.|Debe incluir al menos una letra\\.|Debe incluir al menos un número\\.|No puede empezar ni terminar con espacios\\.|No puede contener el usuario del correo\\.)";
const FILTER_PROBLEM =
  "(?:Franja de time-to-market desconocida: |Fase clínica desconocida: |Estado desconocido: |Etapa del embudo desconocida: |La fecha 'desde' es posterior)";

export const patterns = [
  // --------------------------------------------------------- validación (pydantic)
  { re: /^Value error, (.+)$/, en: (m, ts) => ts(m[1]) },

  // ------------------------------------------------------------------ main.py
  { re: /^Error interno del servidor \(ref ([0-9a-f]+)\)\.(.*)$/, en: "Internal server error (ref $1).$2" },

  // ------------------------------------------------------- deps.py, config.py
  {
    re: /^El perfil '(.+)' no tiene el permiso requerido \((.+)\) para ejecutar (.+)\.$/,
    en: (m, ts) =>
      `The profile '${ts(m[1])}' does not have the required permission (${m[2]}) to run ${TASK[m[3]] || m[3]}.`,
  },
  {
    re: /^El perfil '(.+)' no tiene el permiso requerido \((.+)\)\.$/,
    en: (m, ts) => `The profile '${ts(m[1])}' does not have the required permission (${m[2]}).`,
  },
  {
    re: /^El perfil '(.+)' no puede descargar el paquete de diseminación \(requiere report:write o analytics:restricted\)\.$/,
    en: (m, ts) =>
      `The profile '${ts(m[1])}' cannot download the dissemination package (requires report:write or analytics:restricted).`,
  },

  // -------------------------------------------------------------- security.py
  {
    re: new RegExp(`^${PASSWORD_RULE}(?: ${PASSWORD_RULE})+$`),
    en: (m, ts) => sentences(m[0], ts),
  },
  { re: /^Debe tener al menos (\d+) caracteres\.$/, en: "It must have at least $1 characters." },

  // ------------------------------------------------------------------ auth.py
  {
    re: /^Solo se permiten cuentas institucionales @(.+)$/,
    en: "Only institutional accounts @$1 are allowed",
  },
  {
    re: /^Cuenta bloqueada temporalmente por intentos fallidos\. Intente en (\d+) minuto\(s\) o pida al administrador que la desbloquee\.$/,
    en: "Account temporarily locked because of failed attempts. Try again in $1 minute(s) or ask the administrator to unlock it.",
  },
  {
    re: /^Cuenta bloqueada por (\d+) minutos tras (\d+) intentos fallidos\.$/,
    en: "Account locked for $1 minutes after $2 failed attempts.",
  },
  {
    re: /^Correo o contraseña incorrectos\. Le quedan (\d+) intento\(s\) antes del bloqueo\.$/,
    en: "Incorrect email or password. You have $1 attempt(s) left before the account is locked.",
  },
  { re: /^Credencial de Google inválida: (.+)$/, en: "Invalid Google credential: $1" },

  // ---------------------------------------------------------------- backup.py
  { re: /^No se pudo restaurar: (.+)$/, en: (m, ts) => `Could not restore: ${ts(m[1])}` },

  // -------------------------------------------------------------- catalogs.py
  { re: /^Ya existe un registro con el código '(.+)'\.$/, en: "A record with the code '$1' already exists." },
  {
    re: /^Está en uso por (\d+) tecnología\(s\): desactívelo para retirarlo de nuevas clasificaciones\.$/,
    en: "It is in use by $1 technology(ies): deactivate it to remove it from new classifications.",
  },

  // ------------------------------------------------------------------ chat.py
  { re: /^Grafo · (.+)$/, en: "Graph · $1" },

  // ---------------------------------------------------------------- config.py
  { re: /^Mejor modelo disponible: (.+)$/, en: "Best available model: $1" },

  // ---------------------------------------------------------------- cycles.py
  { re: /^Ya existe un ciclo con el código '(.+)'\.$/, en: "A cycle with the code '$1' already exists." },
  {
    re: /^No se puede eliminar: (.+) Edite el ciclo o ciérrelo\.$/,
    en: (m, ts) => `It cannot be deleted: ${sentences(m[1], ts)} Edit the cycle or close it.`,
  },
  {
    re: /^(\d+) tecnología\(s\) en evaluación sin informe final\.$/,
    en: "$1 technology(ies) in assessment without a final report.",
  },
  {
    re: /^(\d+) tecnología\(s\) bajo vigilancia propuestas para (.+)\.$/,
    en: "$1 technology(ies) under surveillance proposed for $2.",
  },

  // ------------------------------------------------------------- dashboard.py
  {
    re: /^Tecnologías del ciclo activo \((.+?)\) aptas para priorización y no congeladas a las que les falta al menos uno de sus criterios \((.+)\)\.$/,
    en: (m) =>
      `Technologies in the active cycle (${m[1] === "sin ciclo" ? "no cycle" : m[1]}) that are eligible for prioritization, not frozen and missing at least one of your criteria (${m[2]}).`,
  },
  {
    re: /^Tecnologías asignadas al ciclo (.+) que no pasan la compuerta de novedad: falta la vía de novedad, el cruce con el índice INVIMA o su justificación \(RF10, RF11\)\.$/,
    en: "Technologies assigned to cycle $1 that do not pass the novelty gate: the novelty pathway, the cross-check against the INVIMA index or its justification is missing (RF10, RF11).",
  },
  {
    re: /^Tecnologías asignadas al ciclo (.+) con la novedad y el cruce INVIMA completos: falta decidir si pasan a priorización o se excluyen\.$/,
    en: "Technologies assigned to cycle $1 with novelty and the INVIMA cross-check complete: it remains to decide whether they move on to prioritization or are excluded.",
  },
  {
    re: /^Tecnologías del ciclo (.+) en evaluación sin informe publicado ni justificación de cierre\. Mientras existan, el ciclo no se puede cerrar\.$/,
    en: "Technologies in cycle $1 in assessment with no published report and no closing justification. While any remain, the cycle cannot be closed.",
  },
  {
    re: /^(.+) El número es la antigüedad en días \(máximo (\d+)\)\.$/,
    en: (m, ts) => `${ts(m[1])} The number is the age in days (maximum ${m[2]}).`,
  },
  {
    re: /^Fecha de (corte de datos|boletín): (\S+)\. Se avisa desde (\d+) días antes\. El número son los días que faltan \(o que ya pasaron\)\.$/,
    en: (m) =>
      `${DEADLINE_TITLE[m[1]]} date: ${m[2]}. Warnings start ${m[3]} days before. The number is the days remaining (or already elapsed).`,
  },
  {
    re: /^(.+): (corte de datos|boletín) vencido hace (\d+) día\(s\)$/,
    en: (m) => `${cycleName(m[1])}: ${DEADLINE[m[2]]} ${m[3]} day(s) overdue`,
  },
  {
    re: /^(.+): (corte de datos|boletín) en (\d+) día\(s\)$/,
    en: (m) => `${cycleName(m[1])}: ${DEADLINE[m[2]]} in ${m[3]} day(s)`,
  },
  {
    re: /^(.+): (corte de datos|boletín) hoy$/,
    en: (m) => `${cycleName(m[1])}: ${DEADLINE[m[2]]} today`,
  },
  {
    re: /^Boletines epidemiológicos y financieros publicados en los últimos (\d+) días\.$/,
    en: "Epidemiological and financial bulletins published in the last $1 days.",
  },
  {
    re: /^Priorizadas del último ciclo cerrado \((.+)\)$/,
    en: "Prioritized in the latest closed cycle ($1)",
  },
  { re: /^([A-Z][A-Z0-9]*(?:, [A-Z][A-Z0-9]*)*) por calificar$/, en: "$1 to rate" },
  { re: /^Falta ([A-Z][A-Z0-9]*(?:, [A-Z][A-Z0-9]*)*)$/, en: "Missing $1" },
  { re: /^Vencida hace (\d+) día\(s\)$/, en: "Overdue by $1 day(s)" },
  { re: /^Similitud (\d+)%$/, en: "Similarity $1%" },
  {
    re: /^(?:(Tecnología \d+) \/ (.+)|(.+) \/ (Tecnología \d+))$/,
    en: (m) => `${techName(m[1] || m[3])} / ${techName(m[2] || m[4])}`,
  },
  { re: /^Postulación (\d+)$/, en: "Submission $1" },
  { re: /^Boletín (\d+)$/, en: "Bulletin $1" },
  { re: /^Documento (\d+)$/, en: "Document $1" },
  { re: /^Señal (\d+)$/, en: "Signal $1" },

  // ------------------------------------------------------------ intelligence.py
  { re: /^Parámetros desconocidos: (.+)\.$/, en: "Unknown parameters: $1." },

  // ---------------------------------------------------------------- invima.py
  { re: /^El archivo supera el máximo de (\d+) MB\.$/, en: "The file exceeds the maximum of $1 MB." },

  // ----------------------------------------------------------------- notes.py
  {
    re: /^Solo el autor de la nota o un superadministrador puede (editarla|eliminarla|mejorarla)\.$/,
    en: (m) => `Only the author of the note or a superadministrator can ${NOTE_ACTION[m[1]]}.`,
  },
  { re: /^Hallazgo #(\d+)$/, en: "Finding #$1" },
  { re: /^Fuente #(\d+)$/, en: "Source #$1" },
  { re: /^Recomendación #(\d+)$/, en: "Recommendation #$1" },

  // -------------------------------------------------------------- priority.py
  {
    re: /^Estado no válido para la cola\. Opciones: (.+)\.$/,
    en: "Status not valid for the queue. Options: $1.",
  },

  // ------------------------------------------------------- recommendations.py
  { re: /^Recomendación de adopción: (.+)$/, en: "Adoption recommendation: $1" },
  { re: /^(.+) · editado$/, en: "$1 · edited" },

  // ------------------------------------------------------------------ scan.py
  { re: /^Encolado \((.+)\)$/, en: "Queued ($1)" },

  // --------------------------------------------------------------- sources.py
  {
    re: /^El (nivel de fuente|origen) '(.*)' no está en la lista\. Opciones: (.*)\.$/,
    en: (m) => `The ${PROFILE_FIELD[m[1]]} '${m[2]}' is not in the list. Options: ${m[3]}.`,
  },
  {
    re: /^El tipo de tecnología '(.*)' no está en la lista\. Opciones: (.*)\.$/,
    en: "The technology type '$1' is not in the list. Options: $2.",
  },
  {
    re: /^El adaptador '(.*)' no existe\. Elija uno de la lista de conectores registrados\.$/,
    en: "The adapter '$1' does not exist. Choose one from the list of registered connectors.",
  },
  {
    re: /^No se pudo completar la detección de fuentes \((.+)\)\. Intente de nuevo\.$/,
    en: "Source detection could not be completed ($1). Try again.",
  },
  {
    re: /^Ya existe una fuente del catálogo con el mismo (dominio|nombre)\.$/,
    en: (m) => `A catalog source with the same ${m[1] === "dominio" ? "domain" : "name"} already exists.`,
  },
  {
    re: /^Ya existe ('.*') con el mismo (dominio|nombre)\.$/,
    en: (m) => `${m[1]} already exists with the same ${m[2] === "dominio" ? "domain" : "name"}.`,
  },
  {
    re: /^Ya existe una fuente con esa URL: '(.*)'\. Edítela en lugar de duplicarla\.$/,
    en: "A source with that URL already exists: '$1'. Edit it instead of duplicating it.",
  },
  { re: /^Otra fuente ya usa esa URL: '(.*)'\.$/, en: "Another source already uses that URL: '$1'." },
  {
    re: /^La fuente tiene (\d+) señal\(es\) capturadas, que son registro de captura y no se descartan\. Deshabilite la ingesta en lugar de eliminarla\.$/,
    en: "The source has $1 captured signal(s), which are capture records and are not discarded. Disable ingestion instead of deleting it.",
  },
  { re: /^Fuente propuesta por la detección con IA: (.+)$/, en: "Source proposed by AI detection: $1" },
  { re: /^Fuente agregada manualmente: (.+)$/, en: "Source added manually: $1" },

  // -------------------------------------------------------------- strategy.py
  {
    // Varios problemas de filtros unidos con un espacio.
    re: new RegExp(`^${FILTER_PROBLEM}.* ${FILTER_PROBLEM}`),
    en: (m, ts) =>
      m.input
        .replace(new RegExp(` (?=${FILTER_PROBLEM})`, "g"), "\u0001")
        .split("\u0001")
        .map((part) => ts(part))
        .join(" "),
  },
  { re: /^Franja de time-to-market desconocida: (.+)$/, en: "Unknown time-to-market band: $1" },
  { re: /^Fase clínica desconocida: (.+)$/, en: "Unknown clinical phase: $1" },
  { re: /^Estado desconocido: (.+)$/, en: "Unknown status: $1" },
  { re: /^Etapa del embudo desconocida: (.+)$/, en: "Unknown funnel stage: $1" },

  // ----------------------------------------------------------- submissions.py
  {
    re: /^Configuración de reCAPTCHA incompleta \(falta (RECAPTCHA_SITE_KEY|RECAPTCHA_SECRET)\): la verificación anti-robot está desactivada\. Rigen el tope por IP y el campo trampa\.$/,
    en: "Incomplete reCAPTCHA configuration ($1 is missing): anti-bot verification is disabled. The per-IP limit and the honeypot field apply.",
  },

  // ---------------------------------------------------------- technologies.py
  { re: /^Tecnología ya conocida: (.+)$/, en: "Technology already known: $1" },
  { re: /^Tecnología (\d+): no existe\.$/, en: "Technology $1: does not exist." },
  {
    re: /^Tecnología (\d+): no fue descartada desde la bandeja\.$/,
    en: "Technology $1: was not discarded from the inbox.",
  },
  { re: /^Tecnología (\d+): no está en la bandeja Legacy\.$/, en: "Technology $1: is not in the Legacy inbox." },
  { re: /^(.+): ya no está en la bandeja de entrada\.$/, en: "$1: is no longer in the inbox." },
  {
    re: /^(.+): requiere clúster y tipología antes de asignarse\.$/,
    en: "$1: requires a cluster and a technology type before it can be assigned.",
  },
  {
    re: /^La tecnología ya está asignada a un ciclo: no se puede quitar (el clúster|la tipología)\.$/,
    en: (m) =>
      `The technology is already assigned to a cycle: the ${m[1] === "el clúster" ? "cluster" : "technology type"} cannot be removed.`,
  },
  {
    re: /^La tecnología ya superó el filtrado y está en '(.+)'\.$/,
    en: (m, ts) => `The technology has already passed screening and is in '${ts(m[1])}'.`,
  },
  { re: /^Motivo inválido\. Opciones: (.+)$/, en: "Invalid reason. Options: $1" },
  { re: /^Tecnología (\d+)$/, en: "Technology $1" },

  // ----------------------------------------------------------------- users.py
  { re: /^Ya existe una cuenta con el correo (.+)\.$/, en: "An account with the email $1 already exists." },
];
