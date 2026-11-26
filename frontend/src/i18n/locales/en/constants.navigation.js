// src/constants/navigation.js: menú, títulos de pantalla y base del asistente de navegación.
export default {
  // --- Menú (NAV) y títulos (TITLES)
  "Inicio##menú": "Home",
  "Bandeja de trabajo": "Workbench",
  "Ciclos de escaneo": "Scanning cycles",
  "Notas del equipo": "Team notes",
  "Notas internas del equipo, vinculadas a señales, fuentes o informes. No son el informe público.":
    "Internal team notes, linked to signals, sources or reports. They are not the public report.",
  "Metodología IETS": "IETS methodology",
  "1. Vigilancia": "1. Surveillance",
  "Catálogo de fuentes": "Source catalog",
  "Señales capturadas": "Captured signals",
  "Bandeja de entrada": "Inbox",
  "Postulaciones": "Submissions",
  "Filtrado y depuración": "Screening and clean-up",
  "2. Priorización": "2. Prioritization",
  "3. Evaluación": "3. Assessment",
  "4. Diseminación": "4. Dissemination",
  "Boletines del ciclo": "Cycle bulletins",
  "Análisis y seguimiento": "Analysis and monitoring",
  "Tablero estratégico": "Strategic dashboard",
  "Alertas tempranas": "Early alerts",
  "Asistente IA": "AI assistant",
  "Administración": "Administration",
  "Configuración": "Settings",
  "Metodología, fuentes y vigilancia, inteligencia artificial y respaldo de datos.":
    "Methodology, sources and surveillance, artificial intelligence and data backup.",
  "Usuarios y perfiles": "Users and profiles",
  "Bitácora de auditoría": "Audit log",
  "Vigilancia": "Surveillance",
  "Priorización": "Prioritization",
  "Evaluación temprana": "Early assessment",
  "Diseminación": "Dissemination",

  // --- Asistente de navegación (HOWTO). Las listas de palabras clave van en minúscula,
  // sin tildes ni signos, separadas por ", ": es lo que la gente escribe al preguntar.
  "Ejecutar la vigilancia (capturar señales nuevas)": "Run surveillance (capture new signals)",
  "vigilancia, escanear, escaneo, capturar, buscar tecnologias, rastrear, ejecutar, nuevas senales, scan":
    "surveillance, scan, scanning, capture, search for technologies, crawl, run, new signals, horizon scan",
  "Abra 1. Vigilancia en el menú.": "Open 1. Surveillance in the menu.",
  "Pulse «Ejecutar vigilancia» para recorrer todas las fuentes activas, o «Rastrear» en una sola fuente.":
    "Click “Run surveillance” to go through all active sources, or “Crawl” on a single source.",
  "Las señales nuevas llegan a la Bandeja de entrada para clasificarlas.":
    "New signals arrive in the Inbox to be classified.",

  "Agregar o editar una fuente": "Add or edit a source",
  "fuente, agregar fuente, nueva fuente, sitio, url, alta rapida, catalogo, rss, editar fuente":
    "source, add source, new source, site, url, quick add, catalog, rss, edit source",
  "Abra Catálogo de fuentes.": "Open Source catalog.",
  "«Alta rápida» registra solo con la URL; «Agregar fuente» abre el formulario completo (adaptador, nivel, flujo de escaneo).":
    "“Quick add” registers a source with just the URL; “Add source” opens the full form (adapter, level, scanning flow).",
  "Use «Vista previa» para comprobar qué lee el sistema antes de guardar.":
    "Use “Preview” to check what the system reads before saving.",

  "Revisar si las fuentes funcionan (sonda de salud)": "Check whether sources are working (health probe)",
  "sonda, salud, fuente caida, rojo, ambar, 403, bloquea, no funciona fuente, sondear":
    "probe, source health, health probe, source down, in red, amber, 403, blocked, source not working, probing",
  "Abra Catálogo de fuentes y la pestaña «Salud de fuentes».": "Open Source catalog and the “Source health” tab.",
  "«Sondear todas» prueba el inventario completo en segundo plano (o «Solo A/B» las principales); «Sonda» o «Repetir sonda» prueba una sola.":
    "“Probe all” tests the full inventory in the background (or “A/B only” for the main ones); “Probe” or “Repeat probe” tests a single source.",
  "Verde = funciona (o usa una ruta de respaldo); ámbar = revise la URL; rojo = sin acceso.":
    "Green = working (or using a fallback route); amber = check the URL; red = no access.",

  "Clasificar una señal de la bandeja de entrada": "Classify a signal from the inbox",
  "clasificar, cluster, tipologia, bandeja de entrada, staging, sin clasificar, sugerir clasificacion":
    "classify, cluster, technology type, inbox, staging, unclassified, suggest classification",
  "Abra Bandeja de entrada y pulse «Clasificar» en la fila.": "Open Inbox and click “Classify” on the row.",
  "Revise el origen: «Abrir fuente original», «Ver JSON original» y «¿Es confiable? Analizar con IA».":
    "Check the origin: “Open original source”, “View original JSON” and “Is it reliable? Analyze with AI”.",
  "Elija clúster y tipología (o «Sugerir clasificación») y pulse «Guardar clasificación».":
    "Choose the cluster and technology type (or “Suggest classification”) and click “Save classification”.",

  "Saber si una señal es confiable": "Find out whether a signal is reliable",
  "confiable, confiabilidad, fiable, verificar, falsa, json, url original, origen, crudo":
    "reliable, reliability, trustworthy, verify, fake, json, original url, origin, raw",
  "En Bandeja de entrada pulse «Clasificar» (o «Editar») en la señal.":
    "In Inbox, click “Classify” (or “Edit”) on the signal.",
  "En «Origen de la señal» pulse «¿Es confiable? Analizar con IA».":
    "Under “Signal origin”, click “Is it reliable? Analyze with AI”.",
  "Lea el veredicto, las alertas y «Qué verificar»; despliegue los chequeos automáticos si quiere el detalle.":
    "Read the verdict, the alerts and “What to verify”; expand the automatic checks if you want the detail.",

  "Pasar señales al ciclo": "Move signals into the cycle",
  "asignar, pasar al ciclo, al ciclo, meter al ciclo, arrastrar, mover al ciclo, lote, entrar al ciclo":
    "assign, move to the cycle, to the cycle, into the cycle, add to the cycle, drag, batch, enter the cycle",
  "Elija el ciclo en el selector de la cabecera.": "Choose the cycle in the header selector.",
  "En Bandeja de entrada marque las señales clasificadas.": "In Inbox, select the classified signals.",
  "Pulse «Asignar al ciclo» y confirme. Las que no tienen clúster y tipología quedan fuera.":
    "Click “Assign to the cycle” and confirm. Signals without a cluster and technology type are left out.",

  "Crear, abrir o cerrar un ciclo": "Create, open or close a cycle",
  "ciclo, crear ciclo, nuevo ciclo, cerrar ciclo, consolidar, cambiar estado ciclo, corte":
    "cycle, create cycle, create a cycle, new cycle, close cycle, close the cycle, consolidate, change cycle status, cutoff",
  "Abra Ciclos de escaneo y pulse «Nuevo ciclo».": "Open Scanning cycles and click “New cycle”.",
  "Avance el estado con los botones de transición (filtrado → priorización → evaluación).":
    "Advance the status with the transition buttons (screening → prioritization → assessment).",
  "«Cerrar y consolidar» congela los puntajes; solo el superadministrador puede hacerlo.":
    "“Close and consolidate” freezes the scores; only the superadministrator can do it.",

  "Cambiar el ciclo que veo en pantalla": "Change the cycle shown on screen",
  "cambiar ciclo, otro ciclo, ciclo en pantalla, ciclo historico, seleccionar ciclo":
    "change cycle, switch cycle, another cycle, cycle on screen, historical cycle, select cycle",
  "Use el selector de ciclo de la cabecera (el botón con el calendario).":
    "Use the cycle selector in the header (the button with the calendar).",
  "Elija un ciclo abierto o uno histórico; todas las pantallas se ajustan a ese ciclo.":
    "Choose an open cycle or a historical one; every screen adjusts to that cycle.",

  "Moderar postulaciones externas": "Moderate external submissions",
  "postulacion, postulaciones, moderar, aceptar, rechazar, fabricante, formulario publico, reactiva":
    "submission, submissions, moderate, accept, reject, manufacturer, public form, reactive",
  "Abra Postulaciones; la pestaña «Por moderar» muestra las pendientes.":
    "Open Submissions; the “To moderate” tab shows the pending ones.",
  "Pulse «Revisar y decidir», lea el conflicto de interés y acepte o rechace.":
    "Click “Review and decide”, read the conflict of interest and accept or reject.",
  "«Copiar enlace del formulario» le da el enlace público para compartir.":
    "“Copy form link” gives you the public link to share.",

  "Quitar duplicados y verificar novedad (INVIMA)": "Remove duplicates and verify novelty (INVIMA)",
  "duplicado, fusionar, fusion, invima, novedad, registro sanitario, filtrar, barrido, listado unico, apta":
    "duplicate, merge, merging, invima, novelty, marketing authorization, screening, clean up, sweep, single list, eligible",
  "Abra Filtrado y depuración.": "Open Screening and clean-up.",
  "Pestaña «Duplicados»: «Ejecutar barrido» y confirme o descarte las fusiones.":
    "“Duplicates” tab: “Run sweep”, then confirm or discard the merges.",
  "Pestaña «Novedad y registro sanitario»: «Cruzar con el INVIMA», guarde el criterio y «Marcar apta para priorización».":
    "“Novelty and marketing authorization” tab: “Cross-check with INVIMA”, save the criterion and “Mark as eligible for prioritization”.",

  "Excluir una tecnología del ciclo": "Exclude a technology from the cycle",
  "excluir, descartar, sacar, eliminar del ciclo": "exclude, discard, take out, remove from the cycle",
  "En Filtrado y depuración o en 2. Priorización pulse «Excluir».":
    "In Screening and clean-up or in 2. Prioritization, click “Exclude”.",
  "Elija la causa tipificada y deje una nota. La exclusión queda en la bitácora.":
    "Choose the predefined reason and leave a note. The exclusion is recorded in the audit log.",

  "Calificar P1 a P6 (priorización)": "Score P1 to P6 (prioritization)",
  "priorizar, calificar, p1, p2, p3, p4, p5, p6, criterios, puntaje, %p, matriz":
    "prioritize, score, rating, p1, p2, p3, p4, p5, p6, criteria, criterion, all six, %p, matrix",
  "Abra 2. Priorización; «Solo lo que me toca» filtra lo de su perfil.":
    "Open 2. Prioritization; “Only mine to rate” filters what belongs to your profile.",
  "Elija una tecnología de la cola y responda Sí o No en cada criterio (justifique si se pide).":
    "Choose a technology from the queue and answer Yes or No for each criterion (give a justification if asked).",
  "Al completar los seis, el sistema asigna el estado: priorizada (4-6), bajo vigilancia (3) o no priorizada.":
    "When all six are complete, the system assigns the status: prioritized (4-6), under surveillance (3) or not prioritized.",

  "Redactar el expediente o informe de evaluación": "Write the dossier or assessment report",
  "expediente, informe, evaluacion, ficha, mini hta, redactar, borrador":
    "dossier, report, assessment, fact sheet, mini hta, write, draft",
  "Abra 3. Evaluación y pulse «Abrir expediente» en una tecnología priorizada.":
    "Open 3. Assessment and click “Open dossier” on a prioritized technology.",
  "Complete las secciones y «Guardar».": "Complete the sections and click “Save”.",
  "Envíe a revisión interna; luego el ciclo pasa a revisión externa, comité y publicación.":
    "Send it for internal review; the cycle then moves on to external review, committee and publication.",

  "Invitar a un revisor externo": "Invite an external reviewer",
  "revisor, revision externa, pares, invitacion, invitar, enlace revisor":
    "reviewer, external review, peer, invitation, invite, reviewer link",
  "En 3. Evaluación abra el expediente en revisión externa.": "In 3. Assessment, open the dossier under external review.",
  "Pulse «Generar invitación» y comparta el enlace; el revisor no necesita cuenta.":
    "Click “Generate invitation” and share the link; the reviewer does not need an account.",
  "«Revocar» anula una invitación. Las observaciones vuelven al expediente.":
    "“Revoke” cancels an invitation. The observations go back to the dossier.",

  "Descargar en PDF o exportar": "Download as PDF or export",
  "pdf, descargar, exportar, imprimir, html, zip, csv": "pdf, download, export, print, html, zip, csv",
  "Expediente: en 3. Evaluación, «Descargar PDF» o «Exportar HTML institucional».":
    "Dossier: in 3. Assessment, “Download PDF” or “Export institutional HTML”.",
  "Informes: en 4. Diseminación, «Descargar ZIP». Notas: «Descargar CSV».":
    "Reports: in 4. Dissemination, “Download ZIP”. Notes: “Download CSV”.",
  "Listado Único: en Filtrado, «Exportar CSV».": "Unified List: in Screening, “Export CSV”.",

  "Publicar informes y difundir": "Publish reports and disseminate",
  "diseminar, difundir, publicar, informe publico, recomendacion, generar informe":
    "disseminate, dissemination, distribute, publish, public report, recommendation, generate report, generate a report",
  "Abra 4. Diseminación.": "Open 4. Dissemination.",
  "«Nuevo informe» o «Generar desde una señal» (con IA); edite y guarde.":
    "“New report” or “Generate from a signal” (with AI); edit and save.",
  "Lo publicado aparece en la ficha pública de expedientes.":
    "Published items appear on the public dossier fact sheet.",

  "Compilar y publicar el boletín del ciclo": "Compile and publish the cycle bulletin",
  "boletin, compilar, resumen ejecutivo, minsalud": "bulletin, compile, executive summary, minsalud",
  "Abra Boletines del ciclo y pulse «Compilar desde el ciclo».":
    "Open Cycle bulletins and click “Compile from the cycle”.",
  "Revise, apruebe y pulse «Publicar».": "Review, approve and click “Publish”.",

  "Ver indicadores y gráficos del ciclo": "View the cycle's indicators and charts",
  "tablero, indicadores, graficos, estadisticas, dashboard, embudo, presupuesto, kpi":
    "dashboard, indicators, charts, graphs, statistics, funnel, budget, kpi",
  "Abra Tablero estratégico.": "Open Strategic dashboard.",
  "Filtre por ciclo, clúster o tipología; haga clic en barras y etapas para profundizar.":
    "Filter by cycle, cluster or technology type; click bars and stages to drill down.",

  "Revisar alertas tempranas": "Review early alerts",
  "alerta, alertas, aviso, notificacion, suscripcion": "alert, alerts, warning, notification, subscription",
  "Abra Alertas tempranas; «Marcar leída» o «Marcar todas como leídas».":
    "Open Early alerts; “Mark as read” or “Mark all as read”.",
  "Active suscripciones por correo por clúster.": "Turn on email subscriptions by cluster.",

  "Buscar una señal o tecnología capturada": "Search for a captured signal or technology",
  "buscar, senal, senales, hallazgo, tecnologia, encontrar": "search, signal, signals, finding, technology, find",
  "Abra Señales capturadas y use el buscador y los filtros.": "Open Captured signals and use the search box and the filters.",
  "«Ver» abre el detalle; «Informe» genera un análisis con IA.":
    "“View” opens the detail; “Report” generates an AI analysis.",

  "Dejar una nota para el equipo": "Leave a note for the team",
  "nota, notas, comentario, apunte": "note, notes, comment, annotation",
  "Abra Notas del equipo y pulse «Nueva nota».": "Open Team notes and click “New note”.",
  "Vincúlela a una señal, fuente o informe; puede fijarla arriba.":
    "Link it to a signal, source or report; you can pin it to the top.",

  "Preguntar a la IA sobre las tecnologías registradas": "Ask the AI about the registered technologies",
  "preguntar, ia, chat, asistente ia, conversar, minimax": "ask the ai, ai, chat, ai assistant, question, minimax",
  "Abra Asistente IA y escriba su pregunta; responde con lo que hay en el sistema.":
    "Open AI assistant and type your question; it answers with what is in the system.",

  "Crear usuarios o cambiar perfiles": "Create users or change profiles",
  "usuario, usuarios, perfil, rol, permiso, crear usuario, desbloquear, contrasena de otro":
    "user, users, profile, role, permission, create user, create a user, unlock, password of another user",
  "Abra Usuarios y perfiles y pulse «+ Nuevo usuario».": "Open Users and profiles and click “+ New user”.",
  "Elija el perfil; «Editar», «Desbloquear» o «Restablecer» desde la fila.":
    "Choose the profile; “Edit”, “Unlock” or “Reset” from the row.",

  "Configurar la IA (MiniMax)": "Set up the AI (MiniMax)",
  "configurar ia, token, llave, minimax, modelo, api key, ia sin configurar":
    "configure ai, configure the ai, set up ai, set up the ai, token, key, minimax, model, api key, ai not configured",
  "Abra Configuración, pestaña «Integración con IA».": "Open Settings, “AI integration” tab.",
  "Pegue la llave, «Detectar mejor modelo» y «Guardar IA».": "Paste the key, then “Detect best model” and “Save AI”.",

  "Copias de seguridad y Firebase": "Backups and Firebase",
  "copia, respaldo, backup, firebase, restaurar, guardado aqui": "backup, copy, firebase, restore, saved here",
  "Abra Configuración, pestaña «Persistencia (Firebase)».": "Open Settings, “Persistence (Firebase)” tab.",
  "Ahí ve la copia en la nube y la copia local del navegador.":
    "There you can see the cloud backup and the browser's local backup.",

  "Ver quién cambió algo (bitácora)": "See who changed something (audit log)",
  "bitacora, auditoria, quien cambio, historial, cambios, log":
    "audit log, audit, who changed, history, changes, audit trail",
  "Abra Bitácora de auditoría y filtre por entidad, acción o usuario.":
    "Open Audit log and filter by entity, action or user.",
  "«Vida» muestra toda la historia de un registro.": "“History” shows the full history of a record.",

  "Cambiar mi contraseña o cerrar sesión": "Change my password or sign out",
  "contrasena, password, clave, cerrar sesion, salir": "password, passcode, sign out, log out, logout, exit",
  "Pulse su nombre arriba a la derecha.": "Click your name at the top right.",
  "Elija «Cambiar contraseña» o «Cerrar sesión».": "Choose “Change password” or “Sign out”.",

  "Ver la guía rápida del sistema": "View the system's quick guide",
  "guia, tutorial, como funciona, empezar, ayuda, inicio, roles, quien hace que":
    "guide, tutorial, how it works, how does it work, get started, help, home, roles, who does what",
  "Pulse «Guía» en la cabecera.": "Click “Guide” in the header.",
  "Recorre las fases, los perfiles y cómo se pasan el trabajo.":
    "It walks through the phases, the profiles and how work is handed over.",

  "Ver lo que tengo pendiente": "See what I have pending",
  "pendiente, pendientes, tareas, que hago, por hacer, mi trabajo, hoy":
    "pending, outstanding, tasks, what do i do, to do, my work, today",
  "Abra Bandeja de trabajo: «Mis pendientes» lista lo que toca a su perfil, con el botón para ir a resolverlo.":
    "Open Workbench: “My pending tasks” lists what falls to your profile, with a button to go and deal with it.",

  // Palabras vacías y palabras genéricas del buscador local (separadas por espacio).
  "como donde que hago puedo para el la los las un una de del en y o a me mi se lo al por con quiero necesito hacer veo esta este":
    "how where what when why do does can could should i to the a an of in on at and or my me is it are for with want need make see this that there which",
  "senal senales tecnologia ciclo buscar ia ayuda inicio ejecutar": "signal signals technology cycle search ai help home run",

  // --- Preguntas sugeridas (SUGGESTED)
  "¿Qué tengo pendiente?": "What do I have pending?",
  "¿Cómo ejecuto la vigilancia?": "How do I run surveillance?",
  "¿Cómo cambio de ciclo?": "How do I switch cycle?",
  "¿Por qué una fuente sale en rojo?": "Why does a source show in red?",
  "¿Dónde quedan las señales?": "Where do the signals go?",
  "¿Cómo agrego una fuente?": "How do I add a source?",
  "¿Qué significa la sonda ámbar?": "What does the amber probe mean?",
  "¿Cómo pruebo una fuente?": "How do I test a source?",
  "¿Cómo clasifico una señal?": "How do I classify a signal?",
  "¿Cómo sé si es confiable?": "How do I know whether it is reliable?",
  "¿Cómo la paso al ciclo?": "How do I move it to the cycle?",
  "¿Cómo modero una postulación?": "How do I moderate a submission?",
  "¿Dónde está el formulario público?": "Where is the public form?",
  "¿Cómo fusiono duplicados?": "How do I merge duplicates?",
  "¿Cómo cruzo con el INVIMA?": "How do I cross-check with INVIMA?",
  "¿Cómo excluyo una tecnología?": "How do I exclude a technology?",
  "¿Cómo califico P1 a P6?": "How do I score P1 to P6?",
  "¿Qué criterios me tocan?": "Which criteria are mine?",
  "¿Qué pasa al completar los seis?": "What happens when all six are complete?",
  "¿Cómo abro un expediente?": "How do I open a dossier?",
  "¿Cómo invito a un revisor externo?": "How do I invite an external reviewer?",
  "¿Cómo descargo el PDF?": "How do I download the PDF?",
  "¿Cómo genero un informe con IA?": "How do I generate a report with AI?",
  "¿Dónde se publica?": "Where is it published?",
  "¿Cómo compilo el boletín?": "How do I compile the bulletin?",
  "¿Cómo creo un ciclo?": "How do I create a cycle?",
  "¿Cómo cierro el ciclo?": "How do I close the cycle?",
  "¿Cómo configuro la IA?": "How do I set up the AI?",
  "¿Dónde están las copias de seguridad?": "Where are the backups?",
  "¿Cómo creo un usuario?": "How do I create a user?",
  "¿Qué hace cada perfil?": "What does each profile do?",
};
