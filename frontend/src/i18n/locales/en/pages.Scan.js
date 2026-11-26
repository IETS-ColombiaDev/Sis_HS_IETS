// src/pages/Scan.jsx — Vigilancia de fuentes (fase 1 · identificación).
export default {
  // Estados de trabajos y corridas
  "Pendiente": "Pending",
  "Ejecutando": "Running",
  "Ok": "OK",
  "Parcial": "Partial",
  "Error": "Error",
  "Cancelado": "Canceled",
  "En curso": "In progress",
  "Sin trabajo": "Nothing to do",

  // Fechas relativas
  "Hoy": "Today",
  "Ayer": "Yesterday",
  "Hace {d} días": "{d} days ago",
  "En la próxima vuelta del worker": "On the worker's next pass",

  // Permisos y avisos
  "Su perfil ({role}) no puede ejecutar la vigilancia (permiso scan:run).":
    "Your profile ({role}) cannot run the surveillance (scan:run permission).",
  "No se pudo cargar la vigilancia": "The surveillance could not be loaded",
  "Vigilancia encolada: {n} fuente(s). Siga el estado de cada una abajo; puede seguir trabajando.":
    "Surveillance queued: {n} source(s). Follow the status of each one below; you can keep working.",
  "No se pudo ejecutar la vigilancia": "The surveillance could not be run",
  "Se cancelaron {n} fuente(s) en cola. Las que ya corrían terminan su paso actual.":
    "{n} queued source(s) were canceled. Those already running finish their current step.",
  "No se pudo detener la vigilancia": "The surveillance could not be stopped",
  "Vigilancia programada ejecutada": "Scheduled surveillance run",
  "No se pudo ejecutar la vigilancia programada": "The scheduled surveillance could not be run",
  "error de ingesta": "ingestion error",
  "{title}: {n} señales nuevas de {total}": "{title}: {n} new signals out of {total}",
  "No se pudo escanear": "The source could not be scanned",
  "Escriba una URL que inicie con http:// o https://": "Enter a URL that starts with http:// or https://",
  "No se pudo previsualizar el enlace": "The link could not be previewed",
  "Cargando vigilancia...": "Loading surveillance...",

  // Cabecera
  "Vigilancia de fuentes": "Source surveillance",
  "Fase 1 · Identificación: el rastreador entra a cada fuente, sigue hasta las fichas internas y, si MiniMax está activo, extrae las señales.":
    "Phase 1 · Identification: the crawler visits each source, follows the links through to the inner record pages and, if MiniMax is active, extracts the signals.",
  "Inventario": "Inventory",
  "Encola las {n} fuentes con ingesta activa. El worker las procesa en segundo plano: puede seguir trabajando.":
    "Queues the {n} sources with active ingestion. The worker processes them in the background: you can keep working.",
  "No hay fuentes con ingesta activa. Habilite alguna en el catálogo de fuentes.":
    "There are no sources with active ingestion. Enable one in the source catalog.",
  "Ejecutar vigilancia ({n})": "Run surveillance ({n})",
  "Modo consulta: {motivo} Puede revisar la cola, el registro y la programación.":
    "Read-only mode: {motivo} You can review the queue, the log and the schedule.",

  // Guía de la fase
  "Fase 1 · Identificación": "Phase 1 · Identification",
  "Pulse «Ejecutar vigilancia»: corre en el servidor y puede seguir trabajando en otros módulos; la barra flotante muestra el avance y el tiempo restante.":
    "Press “Run surveillance”: it runs on the server and you can keep working in other modules; the floating bar shows the progress and the time remaining.",
  "Si un sitio rechaza al rastreador se prueban las rutas de respaldo (RSS oficial, índice de la revista en PubMed, Google News). El informe de acceso dice por dónde entró cada fuente.":
    "If a site rejects the crawler, the fallback routes are tried (official RSS, the journal's index in PubMed, Google News). The access report shows the route by which each source was reached.",
  "Cada corrida queda en el historial con su fecha y hora, su duración y su resumen.":
    "Each run is kept in the history with its date and time, its duration and its summary.",
  "Las señales nuevas llegan a la bandeja de entrada; el nivel D no pisa campos ya llenados por A/B.":
    "New signals arrive in the inbox; level D does not overwrite fields already filled in by A/B.",
  "Bandeja de entrada": "Inbox",

  // Indicadores
  "Referentes vigilados": "Monitored reference sources",
  "{n} en inventario": "{n} in inventory",
  "Señales capturadas": "Captured signals",
  "Total acumulado": "Cumulative total",
  "Señales que ya produjeron las fuentes vigiladas, desde siempre.":
    "Signals that the monitored sources have produced so far, since the beginning.",
  "Sin rastrear >7 días": "Not crawled for >7 days",
  "Requieren vigilancia": "Need surveillance",
  "Fuentes activas que no se consultan hace más de una semana (o nunca). Puede ser normal si su frecuencia es mensual.":
    "Active sources that have not been checked for more than a week (or ever). This can be normal if their frequency is monthly.",
  "Último lote nuevo": "Latest new batch",
  "Señales en el último rastreo": "Signals in the latest crawl",
  "Señales nuevas que trajo el rastreo más reciente del registro.":
    "New signals brought in by the most recent crawl in the log.",

  // Vigilancia programada
  "Vigilancia programada": "Scheduled surveillance",
  "Qué es la vigilancia programada": "What scheduled surveillance is",
  "Estado": "Status",
  "Activa": "Active",
  "Apagada": "Off",
  "Cada": "Every",
  "Próxima": "Next",
  "Última": "Last",
  "Aún no ha corrido": "Has not run yet",
  "En marcha": "Running",
  "Detenido": "Stopped",
  "Deshabilitado en este servidor": "Disabled on this server",
  "Corre ya la vigilancia programada: encola solo las fuentes cuya frecuencia venció.":
    "Runs the scheduled surveillance right now: it queues only the sources whose frequency is due.",
  "Ejecutar ahora": "Run now",
  "Cambiar el intervalo o apagar la tarea": "Change the interval or turn the task off",
  "Solo el superadministrador cambia la programación (permiso config:manage).":
    "Only the superadministrator can change the schedule (config:manage permission).",
  "Configurar": "Configure",
  "No se pudo leer la programación.": "The schedule could not be read.",

  // Vista previa
  "Vista previa de un enlace": "Link preview",
  "Qué es la vista previa": "What the preview is",
  "URL a previsualizar": "URL to preview",
  "Previsualizar": "Preview",

  // Cola de ingesta
  "Cola de ingesta": "Ingestion queue",
  "Qué es la cola de ingesta": "What the ingestion queue is",
  "Actualizar": "Refresh",
  "La extracción no corre en el hilo de la petición: el worker toma los trabajos en orden.":
    "Extraction does not run in the request thread: the worker takes the jobs in order.",
  "La cola está vacía. Ejecute la vigilancia o espere a la programada.":
    "The queue is empty. Run the surveillance or wait for the scheduled one.",
  "programado": "scheduled",
  "manual": "manual",
  "Encolando la vigilancia": "Queuing the surveillance",
  "El worker procesa las fuentes en segundo plano.": "The worker processes the sources in the background.",

  // Referentes en vigilancia
  "Fuentes con ingesta activa. Marque varias para rastrearlas juntas.":
    "Sources with active ingestion. Select several to crawl them together.",
  "Rastrear selección ({n})": "Crawl selection ({n})",
  "Referentes en vigilancia": "Reference sources under surveillance",
  "Buscar referente...": "Search reference sources...",
  "Buscar referente": "Search reference sources",
  "Filtrar por categoría": "Filter by category",
  "Todas las categorías": "All categories",
  "No hay fuentes con ingesta activa.": "There are no sources with active ingestion.",
  "No hay referentes que coincidan con la búsqueda o el filtro de estado.":
    "No reference sources match the search or the status filter.",
  "Ir al catálogo de fuentes": "Go to the source catalog",
  "Seleccionar {title}": "Select {title}",
  "Nivel {nivel}": "Level {nivel}",
  "Referente": "Reference source",
  "{n} señales": "{n} signals",
  "Tras varios fallos seguidos la fuente se pausa unas horas para no insistir sobre un servicio caído.":
    "After several failures in a row, the source is paused for a few hours so as not to keep hitting a service that is down.",
  "circuito abierto": "circuit open",
  "Nunca rastreado": "Never crawled",
  "Ver señales": "View signals",
  "Rastrear": "Crawl",

  // Registro de vigilancia
  "Bitácora de cada rastreo: cuándo corrió, qué fuente, cuántas señales nuevas y detectadas, y el mensaje del adaptador.":
    "Log of each crawl: when it ran, which source, how many new and detected signals, and the adapter's message.",
  "Filtrar registro por estado": "Filter log by status",
  "Todos": "All",
  "Registro de vigilancia": "Surveillance log",
  "Aún no hay rastreos registrados.": "No crawls have been recorded yet.",
  "Ningún rastreo con ese estado.": "No crawls with that status.",
  "Ejecutar primer rastreo": "Run the first crawl",
  "Rastreo masivo": "Bulk crawl",
  "<b>{n}</b> nuevas · {found} detectadas": "<b>{n}</b> new · {found} detected",
  "Ir a la bandeja →": "Go to the inbox →",
  "{n} rastreo(s) con error reciente. Revise la salud de la fuente en el catálogo.":
    "{n} crawl(s) with a recent error. Check the source's health in the catalog.",
};
