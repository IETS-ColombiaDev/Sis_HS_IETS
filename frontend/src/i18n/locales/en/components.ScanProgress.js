// src/components/ScanProgress.jsx — avance en vivo, informe de acceso, historial y barra flotante.
export default {
  // Pasos de una fuente
  "Cola": "Queue",
  "Acceso": "Access",
  "Recorrido##etapa": "Crawl",
  "Extracción": "Extraction",
  "Guardado##etapa": "Saving",
  "Lista##etapa": "Done",
  "Avance de la fuente": "Source progress",

  // Estado dentro de la tarjeta de una fuente
  "intento {n}/{max}": "attempt {n}/{max}",
  "suele tardar {tiempo}": "usually takes {tiempo}",
  "¿El sistema ya entró a la fuente?": "Has the system already reached the source?",
  "Accedió": "Reached",
  "Sin acceso aún": "Not reached yet",
  "{n} de ~{total} página(s)": "{n} of ~{total} page(s)",
  "{n} página(s)": "{n} page(s)",
  "<b>+{n}</b> nuevas de {found}": "<b>+{n}</b> new out of {found}",
  "Ocultar detalle": "Hide details",
  "Ver detalle: rutas, búsqueda, IA y pasos": "View details: routes, search, AI and steps",

  // Motores y rutas
  "base de conocimiento": "knowledge base",
  "mapa del sitio": "sitemap",
  "Sitio": "Site",
  "Sitio (cliente compatible con navegador)": "Site (browser-compatible client)",
  "Ruta de la matriz": "Matrix route",
  "RSS oficial": "Official RSS",
  "Índice de PubMed": "PubMed index",

  // Línea corta de búsqueda e IA
  "Búsqueda web apagada": "Web search off",
  "Búsqueda web: {n} resultado(s) de {domain} ({engines})": "Web search: {n} result(s) from {domain} ({engines})",
  "Búsqueda web: {n} resultado(s) de {domain}": "Web search: {n} result(s) from {domain}",
  "Sin IA (solo reglas)": "No AI (rules only)",
  "IA falló: {error}": "AI failed: {error}",
  "IA: {n} señal(es) ({ev} con cita verificada) · {ung} descartada(s) por no estar en el texto":
    "AI: {n} signal(s) ({ev} with a verified quote) · {ung} discarded because not found in the text",
  "IA: {n} señal(es) ({ev} con cita verificada)": "AI: {n} signal(s) ({ev} with a verified quote)",
  "IA: {n} señal(es) · {ung} descartada(s) por no estar en el texto":
    "AI: {n} signal(s) · {ung} discarded because not found in the text",
  "IA: {n} señal(es)": "AI: {n} signal(s)",

  // Detalle verificable de la corrida de una fuente
  "Rutas de acceso probadas": "Access routes tried",
  "Búsqueda web": "Web search",
  "Apagada": "Off",
  "ninguna": "none",
  "Consultas redactadas por la IA en {domain}: {queries}": "Queries written by the AI on {domain}: {queries}",
  "Consultas redactadas por reglas en {domain}: {queries}": "Queries written by rules on {domain}: {queries}",
  "Motores: {motores}. Resultados útiles: {n} ({k} de la base de conocimiento de búsqueda).":
    "Engines: {motores}. Useful results: {n} ({k} from the search knowledge base).",
  "Motores: {motores}. Resultados útiles: {n}.": "Engines: {motores}. Useful results: {n}.",
  "No se consultó ningún buscador: {motivo}.": "No search engine was queried: {motivo}.",
  "Extracción con IA": "AI extraction",
  "La IA falló ({error}); quedaron los candidatos por reglas.":
    "The AI failed ({error}); the rule-based candidates were kept.",
  "La IA devolvió {n} señal(es); se conservaron {kept} ({ev} con cita textual verificada en la fuente) y se descartaron {ung} porque no aparecen en el texto visitado.":
    "The AI returned {n} signal(s); {kept} were kept ({ev} with a verbatim quote verified in the source) and {ung} were discarded because they do not appear in the visited text.",
  "La IA devolvió {n} señal(es); se conservaron {kept} ({ev} con cita textual verificada en la fuente).":
    "The AI returned {n} signal(s); {kept} were kept ({ev} with a verbatim quote verified in the source).",
  "La IA devolvió {n} señal(es); se conservaron {kept} y se descartaron {ung} porque no aparecen en el texto visitado.":
    "The AI returned {n} signal(s); {kept} were kept and {ung} were discarded because they do not appear in the visited text.",
  "La IA devolvió {n} señal(es); se conservaron {kept}.": "The AI returned {n} signal(s); {kept} were kept.",
  "Reemplazó {n} de {total} candidato(s) por reglas.": "It replaced {n} of {total} rule-based candidate(s).",
  "OCR activo.": "OCR active.",
  "Descartadas: {titulos}": "Discarded: {titulos}",
  "Pasos": "Steps",

  // Informe de acceso (CSV y tabla)
  "Fuente": "Source",
  "Resultado": "Result",
  "Ruta": "Route",
  "Páginas": "Pages",
  "IA": "AI",
  "Detectadas": "Detected",
  "Nuevas": "New",
  "Detalle": "Details",
  "Fecha": "Date",
  "apagada": "off",
  "{n} resultado(s)": "{n} result(s)",
  "sin IA": "no AI",
  "{kept} conservadas / {ung} descartadas": "{kept} kept / {ung} discarded",
  "Informe de acceso por fuente": "Access report by source",
  "Ver informe en tiempo real": "View the report in real time",
  "Ocultar el informe": "Hide the report",
  "Ver el informe": "View the report",
  "{n} de {total} fuente(s) entraron": "{n} of {total} source(s) reached",
  "{n} no pudo entrar": "{n} could not be reached",
  "{n} sin ejecutar": "{n} not run",
  "actualizado {hora}": "updated {hora}",
  "{n} sin acceso": "{n} not reached",
  "En vivo": "Live",
  "Último resultado real de cada una de las {total} fuentes con ingesta activa: si entró, por dónde, qué buscó y qué encontró.":
    "Latest actual result for each of the {total} sources with active ingestion: whether it was reached, by which route, what was searched and what was found.",
  "Se actualiza solo cada 15 segundos mientras corre la vigilancia.":
    "It refreshes by itself every 15 seconds while the surveillance is running.",
  "Actualizar": "Refresh",
  "Rutas de acceso: sitio de la fuente → cliente compatible con navegador (encendido) → rutas de la matriz → RSS oficial → índice de la revista en PubMed → Google News.":
    "Access routes: source site → browser-compatible client (on) → matrix routes → official RSS → the journal's index in PubMed → Google News.",
  "Rutas de acceso: sitio de la fuente → cliente compatible con navegador (apagado; se enciende en Configuración › Parámetros de fuentes) → rutas de la matriz → RSS oficial → índice de la revista en PubMed → Google News.":
    "Access routes: source site → browser-compatible client (off; turn it on in Settings › Source parameters) → matrix routes → official RSS → the journal's index in PubMed → Google News.",
  "Rutas de acceso: sitio de la fuente → cliente compatible con navegador (no disponible en este servidor) → rutas de la matriz → RSS oficial → índice de la revista en PubMed → Google News.":
    "Access routes: source site → browser-compatible client (not available on this server) → matrix routes → official RSS → the journal's index in PubMed → Google News.",
  "Ruta / HTTP": "Route / HTTP",
  "Señales": "Signals",
  "nivel {nivel}": "level {nivel}",
  "Sin IA": "No AI",
  "{n} conservadas": "{n} kept",
  "{n} descartadas": "{n} discarded",
  "Ocultar": "Hide",
  "Ver todo": "View all",

  // Historial de vigilancias
  "En curso": "In progress",
  "Completa": "Complete",
  "Con novedades": "With issues",
  "Con error": "With errors",
  "Vigilancia en curso…": "Surveillance in progress…",
  "Última realizada: {fecha} · duró {duracion}": "Last run: {fecha} · took {duracion}",
  "Última realizada: aún no hay vigilancias registradas": "Last run: no surveillance runs recorded yet",
  "Historial de vigilancias": "Surveillance run history",
  "Cada corrida con su fecha y hora, cuánto tardó, quién la lanzó y qué dejó. Pulse una fila para ver el resumen.":
    "Each run with its date and time, how long it took, who started it and what it produced. Click a row to see the summary.",
  "Aún no hay vigilancias registradas. El historial empieza con la próxima corrida, manual o programada.":
    "No surveillance runs have been recorded yet. The history starts with the next run, manual or scheduled.",
  "Inicio##hora": "Start",
  "Duración": "Duration",
  "Estado": "Status",
  "Alcance": "Scope",
  "Fuentes": "Sources",
  "Lanzada por": "Started by",
  "terminó {fecha}": "finished {fecha}",
  "sin terminar": "not finished",
  "(va)": "(so far)",
  "Manual": "Manual",
  "Programada": "Scheduled",
  "{n} pendiente(s)": "{n} pending",
  "{n} entraron": "{n} reached",
  "<b>+{n}</b> nuevas": "<b>+{n}</b> new",
  "{n} detectadas": "{n} detected",
  "Programador": "Scheduler",
  "Ocultar resumen": "Hide summary",
  "Ver resumen": "View summary",
  "<b>{n}</b> entraron a la fuente": "<b>{n}</b> reached the source itself",
  "<b>{n}</b> por ruta de respaldo": "<b>{n}</b> via a fallback route",
  "<b>{n}</b> entraron sin señales": "<b>{n}</b> reached with no signals",
  "<b>{n}</b> fallaron al extraer": "<b>{n}</b> failed during extraction",
  "<b>{n}</b> no pudieron entrar": "<b>{n}</b> could not be reached",
  "<b>{n}</b> canceladas": "<b>{n}</b> canceled",
  "Fuentes con problema en esta corrida": "Sources with a problem in this run",
  "Sin detalle": "No details",
  "Ver solo las últimas": "View only the latest",
  "Ver las {n} vigilancias registradas": "View all {n} recorded surveillance runs",

  // Resumen de la corrida
  "En cola": "Queued",
  "Terminadas": "Finished",
  "Canceladas": "Canceled",
  "Vigilancia en curso": "Surveillance in progress",
  "Última vigilancia · {pct} %": "Latest surveillance run · {pct}%",
  "Corre en el servidor: puede cambiar de módulo o de pestaña, o cerrar el navegador. Sigue sola y le avisamos al terminar.":
    "It runs on the server: you can switch modules or tabs, or close the browser. It carries on by itself and you will be notified when it finishes.",
  "{n} de {total} fuente(s) procesadas: {done} terminadas": "{n} of {total} source(s) processed: {done} finished",
  "{n} con error": "{n} with errors",
  "{n} canceladas": "{n} canceled",
  "Cancela las fuentes que siguen en cola. Las que ya se están rastreando terminan su paso actual.":
    "Cancels the sources still in the queue. Those already being crawled finish their current step.",
  "Detener": "Stop",
  "Avance de la vigilancia": "Surveillance progress",
  "Avance": "Progress",
  "{n} de {total}": "{n} of {total}",
  "{pct} % · {done} ok": "{pct}% · {done} OK",
  "Transcurrido": "Elapsed",
  "Inició {hora}": "Started {hora}",
  "Tiempo restante": "Time remaining",
  "entre {rango}": "between {rango}",
  "Fin estimado": "Estimated finish",
  "{n} fuente(s) a la vez": "{n} source(s) at a time",
  "{pct} % de las fuentes procesadas": "{pct}% of the sources processed",
  "Sin respuesta del servidor hace {tiempo}. Si se reinició, la vigilancia se reanuda sola donde quedó.":
    "No response from the server for {tiempo}. If it restarted, the surveillance resumes by itself where it left off.",
  "Este servidor no tiene un trabajador permanente: la cola la cuida un vigilante que revisa cada minuto. Si el servicio se reinicia o se suspende, la vigilancia se reanuda sola donde quedó.":
    "This server has no permanent worker: the queue is looked after by a watchdog that checks every minute. If the service restarts or is suspended, the surveillance resumes by itself where it left off.",
  "El trabajador de vigilancia no está en marcha en este servidor: la cola se atiende desde la corrida que la lanzó.":
    "The surveillance worker is not running on this server: the queue is served from the run that started it.",
  "Esperando reintentos: la próxima fuente se vuelve a intentar a las {hora}.":
    "Waiting for retries: the next source will be retried at {hora}.",
  "Ahora": "Now",
  "lleva {tiempo}": "running for {tiempo}",
  "sin novedades hace {tiempo}": "no updates for {tiempo}",
  "Siguen": "Up next",
  "y {n} más": "and {n} more",
  "¿Cómo se calcula el tiempo?": "How is the time calculated?",
  "Cada fuente se estima con el promedio de sus 3 últimas corridas en este servidor y se ajusta a la velocidad real de esta corrida. Luego se reparte la cola entre {parallel} carril(es) en el orden en que el servidor la atenderá, incluidos los reintentos programados. El rango va de lo que la fuente tarda en sus corridas rápidas a lo que tarda en las lentas. Ninguna fuente pasa de {minutos} min: si los supera, se cierra con error y la corrida sigue.":
    "Each source is estimated from the average of its last 3 runs on this server and adjusted to the actual speed of this run. The queue is then distributed across {parallel} lane(s) in the order in which the server will handle it, including scheduled retries. The range goes from what the source takes in its fast runs to what it takes in its slow ones. No source goes beyond {minutos} min: if it does, it is closed with an error and the run continues.",
  "Ver todas": "View all",

  // Barra flotante
  "Mostrar el avance de la vigilancia": "Show the surveillance progress",
  "Minimizar": "Minimize",
  "{n} de {total} fuentes · {pct} %": "{n} of {total} sources · {pct}%",
  "Faltan ~{tiempo} · termina ~{hora}": "~{tiempo} left · ends ~{hora}",
  "Ahora: {fuente}": "Now: {fuente}",
  "Ver el detalle en Vigilancia →": "View the details in Surveillance →",

  // Estado de los buscadores
  "Búsqueda web apagada en Parámetros de fuentes.": "Web search is turned off in Source parameters.",
  "Búsqueda web: {n} de {total} fuente(s) obtuvieron resultados del dominio en su última corrida.":
    "Web search: {n} of {total} source(s) got results from the domain in their latest run.",
  "Motores: {motores} · API configurada.": "Engines: {motores} · API configured.",
  "Motores: {motores} · sin API.": "Engines: {motores} · no API.",
  "En pausa por bloqueo: {lista}.": "Paused because they were blocked: {lista}.",
  "Base de conocimiento de búsqueda: {pages} página(s) de {domains} sitio(s), {signals} ya aportaron señales. La vigilancia las visita sin consultar buscadores ({n} fuente(s) la usaron en su última corrida).":
    "Search knowledge base: {pages} page(s) from {domains} site(s), {signals} have already yielded signals. The surveillance visits them without querying search engines ({n} source(s) used it in their latest run).",
  "Base de conocimiento de búsqueda: {pages} página(s) de {domains} sitio(s), {signals} ya aportaron señales. La vigilancia las visita sin consultar buscadores.":
    "Search knowledge base: {pages} page(s) from {domains} site(s), {signals} have already yielded signals. The surveillance visits them without querying search engines.",
};
