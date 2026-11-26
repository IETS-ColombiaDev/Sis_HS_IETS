// src/components/SourceParamsPanel.jsx — Configuración › Parámetros de fuentes.
export default {
  // Listas desplegables
  "Nivel de fuente (primaria, secundaria...)": "Source level (primary, secondary...)",
  "Tipos de tecnología": "Technology types",
  "Código en mayúscula (MED, DM, IA...).": "Code in upper case (MED, DM, IA...).",
  "Origen en la matriz": "Origin in the matrix",
  "Valor": "Value",
  "Etiqueta visible": "Visible label",
  "Descripción": "Description",
  "Rango": "Rank",
  "Valor {n}": "Value {n}",
  "Etiqueta {n}": "Label {n}",
  "Descripción {n}": "Description {n}",
  "Rango {n}": "Rank {n}",
  "Subir##mover": "Move up",
  "Bajar##mover": "Move down",
  "Quitar": "Remove",
  "Agregar opción": "Add option",
  "Restaurar": "Restore",
  "Guardar listas": "Save lists",
  "Listas desplegables de las fuentes": "Dropdown lists for sources",

  // Parámetros numéricos de la búsqueda web
  "Consultas por fuente": "Queries per source",
  "Resultados a conservar": "Results to keep",
  "Resultados a abrir y leer": "Results to open and read",
  "Tiempo por consulta (s)": "Time per query (s)",
  "Pausa entre consultas (ms)": "Pause between queries (ms)",
  "Pausa de un motor bloqueado (min)": "Pause for a blocked engine (min)",
  "Tiempo máximo de búsqueda por fuente (s)": "Maximum search time per source (s)",
  "Días que la base cuenta como reciente": "Days the knowledge base counts as recent",

  // Interruptores
  "Búsqueda web activa": "Web search enabled",
  "Interruptor global. Cada fuente además tiene su casilla en el flujo.":
    "Global switch. Each source also has its own checkbox in the flow.",
  "Consultas redactadas por la IA": "Queries written by the AI",
  "La IA escribe las consultas con el contexto de la matriz. Si la IA no responde se usan reglas.":
    "The AI writes the queries using the matrix context. If the AI does not respond, rules are used.",
  "Solo resultados del dominio de la fuente": "Only results from the source's domain",
  "Descarta resultados de otros sitios (recomendado).": "Discards results from other sites (recommended).",
  "Priorizar documentos": "Prioritize documents",
  "PDF, informes y publicaciones se leen primero.": "PDFs, reports and publications are read first.",
  "Usar la base de conocimiento de búsqueda": "Use the search knowledge base",
  "Visita las páginas ya encontradas sin consultar buscadores. Si son recientes, no se busca en vivo.":
    "Visits pages already found without querying search engines. If they are recent, no live search is run.",
  "Respaldo por mapa del sitio": "Sitemap fallback route",
  "Si los buscadores bloquean o no traen nada, lee el mapa del sitio de la propia fuente. No requiere llave.":
    "If search engines block the request or return nothing, it reads the source's own sitemap. No key required.",
  "Acceso con cliente compatible con navegador": "Access with a browser-compatible client",
  "Si un sitio público rechaza al rastreador (HTTP 403 o 406, o no responde), repite la descarga como lo haría un navegador. Respeta robots.txt y no resuelve captchas ni inicia sesión. Enciéndalo solo si las condiciones de uso de las fuentes lo permiten: es decisión del IETS.":
    "If a public site rejects the crawler (HTTP 403 or 406, or no response), it repeats the download the way a browser would. It respects robots.txt and does not solve captchas or sign in. Turn it on only if the sources' terms of use allow it: the decision rests with IETS.",

  // Mensajes
  "No se pudieron cargar los parámetros de fuentes": "Could not load the source parameters",
  "Listas de la matriz guardadas": "Matrix lists saved",
  "No se pudieron guardar las listas": "Could not save the lists",
  "Listas restauradas a los valores de la matriz EH": "Lists restored to the HS matrix values",
  "No se pudieron restaurar las listas": "Could not restore the lists",
  "Búsqueda web guardada": "Web search saved",
  "No se pudo guardar la búsqueda web": "Could not save the web search settings",
  "Llave de Brave eliminada": "Brave key deleted",
  "No se pudo eliminar la llave": "Could not delete the key",
  "Búsqueda web restaurada a los valores por defecto": "Web search restored to the default values",
  "No se pudo restaurar": "Could not restore",
  "Motores reactivados": "Engines reactivated",
  "No se pudieron reactivar los motores": "Could not reactivate the engines",
  "No se pudo ejecutar la consulta": "Could not run the query",
  "Elija el Excel de la matriz EH (.xlsx)": "Choose the HS matrix Excel file (.xlsx)",
  "Matriz aplicada: {updated} actualizadas, {created} nuevas": "Matrix applied: {updated} updated, {created} new",
  "No se pudo importar la matriz": "Could not import the matrix",
  "Cargando parámetros de fuentes...": "Loading source parameters...",

  // Matriz EH (Excel)
  "Matriz EH (Excel)": "HS matrix (Excel)",
  "Cargue el Excel «Fuentes de información proactiva EH» para actualizar nivel de fuente, tipos de tecnología, URLs de entrada, ruta de acceso, qué consultar y los criterios de búsqueda.":
    "Upload the “Fuentes de información proactiva EH” Excel file to update the source level, technology types, entry URLs, access path, what to consult and the search criteria.",
  "Excel de la matriz EH": "HS matrix Excel file",
  "Sobrescribir lo editado en el panel": "Overwrite what was edited in the panel",
  "Importar Excel": "Import Excel",
  "Reaplicar matriz cargada": "Reapply the loaded matrix",
  "{rows} filas · {updated} fuentes actualizadas · {created} nuevas": "{rows} rows · {updated} sources updated · {created} new",
  "{n} criterios de búsqueda": "{n} search criteria",
  "sin URL: {lista}": "no URL: {lista}",

  // Búsqueda web
  "Guardar búsqueda web": "Save web search",
  "Búsqueda web impulsada por IA": "AI-driven web search",
  "Motores (en orden de uso)": "Engines (in order of use)",
  "En pausa {n} min": "Paused for {n} min",
  "Llave configurada": "Key configured",
  "Sin llave": "No key",
  "URL configurada": "URL configured",
  "Sin URL": "No URL",
  "Subir {motor}": "Move {motor} up",
  "Bajar {motor}": "Move {motor} down",
  "Reactivar motores en pausa": "Reactivate paused engines",
  "Llave de Brave Search API": "Brave Search API key",
  "Opcional. Plan gratuito con cupo mensual; es el motor más estable.":
    "Optional. Free plan with a monthly quota; it is the most stable engine.",
  "Pegue la llave para guardarla": "Paste the key to save it",
  "URL de SearXNG propio": "URL of your own SearXNG instance",
  "Opcional. Instancia SearXNG del IETS con formato JSON habilitado.":
    "Optional. IETS's SearXNG instance with JSON format enabled.",
  "Eliminar llave de Brave": "Delete Brave key",
  "Términos genéricos (coma)": "Generic terms (comma-separated)",
  "Se combinan con los de cada fuente y categoría.": "They are combined with those of each source and category.",

  // Criterios por categoría
  "Criterios de búsqueda por categoría (hoja «Criterios de búsqueda»)":
    "Search criteria by category (“Criterios de búsqueda” sheet)",
  "El escaneo usa solo las categorías marcadas como activas. Alcance vigente: Medicamentos y Dispositivos médicos. Las demás quedan inactivas (no se borran) y se pueden activar aquí cuando se amplíe el alcance. Activas: {n} de {total}.":
    "The scan uses only the categories marked as active. Current scope: Medicines and Medical devices. The rest stay inactive (they are not deleted) and can be activated here when the scope is extended. Active: {n} of {total}.",
  "Categoría {nombre} activa": "Category {nombre} active",
  "Activa": "Active",
  "Inactiva": "Inactive",
  "Categoría {n}": "Category {n}",
  "Tecnología {n}": "Technology {n}",
  "Términos {n}": "Terms {n}",
  "Quitar categoría": "Remove category",
  "Agregar categoría": "Add category",

  // Probar motores
  "Probar motores": "Test engines",
  "Consulta de prueba": "Test query",
  "Probar consulta": "Test query",
  "Respondió: <b>{motor}</b>": "Answered by: <b>{motor}</b>",
  "ningún motor": "no engine",
};
