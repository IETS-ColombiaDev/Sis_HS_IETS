// src/pages/Sources.jsx — catálogo de fuentes proactivas, salud de fuentes y cobertura.
export default {
  // Bloques del catálogo (el valor se guarda en español; solo cambia la etiqueta)
  "Registros de ensayos clínicos": "Clinical trial registries",
  "Agencias regulatorias": "Regulatory agencies",
  "Agencias de HTA y redes de EH": "HTA agencies and HS networks",
  "Literatura y organismos internacionales": "Literature and international organizations",
  "Fabricantes de I+D": "R&D manufacturers",
  "Revistas y portales de noticias": "Journals and news portals",
  "Sin bloque": "No block",

  // Flujo, niveles, frecuencias y estados
  "Recorrido": "Crawl",
  "IA": "AI",
  "Búsqueda web": "Web search",
  "A · API estable": "A · Stable API",
  "B · Feed o descarga oficial": "B · Official feed or download",
  "C · Página estructurada": "C · Structured page",
  "D · Página que confirma": "D · Page that confirms",
  "E · Curaduría humana": "E · Human curation",
  "diaria": "daily",
  "semanal": "weekly",
  "quincenal": "every two weeks",
  "mensual": "monthly",
  "trimestral": "quarterly",
  "semestral": "every six months",
  "anual": "yearly",
  "verificada": "verified",
  "observacion": "under observation",
  "declarada": "declared",
  "dominio": "domain",
  "nombre": "name",
  "Verde": "Green",
  "Ámbar": "Amber",
  "Rojo": "Red",
  "Sin sonda": "Not probed",
  "Catálogo": "Catalog",
  "Salud de fuentes": "Source health",
  "Cobertura": "Coverage",

  // Detección con IA: explicación
  "La IA busca en la web fuentes de escaneo de horizonte (agencias regulatorias y de ETS, registros de ensayos, pipelines, redes como EuroScan o i-HTS, portales de noticias) que aún no estén en el catálogo. Descarta por dominio las que ya existen y verifica que respondan. No crea nada hasta que usted dé de alta cada propuesta.":
    "The AI searches the web for horizon scanning sources (regulatory and HTA agencies, trial registries, pipelines, networks such as EuroScan or i-HTS, news portals) that are not yet in the catalog. It discards by domain those that already exist and checks that they respond. It creates nothing until you register each proposal.",

  // Motivos por los que una acción no aplica
  "Es parte del catálogo verificado D-06: deshabilite su ingesta en lugar de eliminarla.":
    "It is part of the verified D-06 catalog: disable its ingestion instead of deleting it.",
  "Tiene {n} señal(es) capturadas, que no se descartan. Deshabilite su ingesta.":
    "It has {n} captured signal(s), which are not discarded. Disable its ingestion.",
  "La ingesta de esta fuente está apagada. Habilítela para poder consultarla.":
    "Ingestion for this source is turned off. Enable it to be able to query the source.",
  "actual": "current",
  "Su perfil ({rol}) solo puede consultar el catálogo: no tiene el permiso source:write.":
    "Your profile ({rol}) can only view the catalog: it does not have the source:write permission.",
  "Su perfil ({rol}) no puede ejecutar la vigilancia (permiso scan:run).":
    "Your profile ({rol}) cannot run surveillance (scan:run permission).",

  // Mensajes
  "No se pudieron cargar las fuentes": "Could not load the sources",
  "Búsqueda web: {n} resultado(s) en {dominio}": "Web search: {n} result(s) on {dominio}",
  "Búsqueda web sin resultados en el dominio": "Web search returned no results on the domain",
  "No se pudo probar la búsqueda web": "Could not test the web search",
  "El nombre de la fuente es obligatorio.": "The source name is required.",
  "Este adaptador necesita una URL.": "This adapter needs a URL.",
  "La URL debe iniciar con http:// o https://": "The URL must start with http:// or https://",
  "La configuración del conector debe ser un objeto JSON válido, por ejemplo {}.":
    "The connector configuration must be a valid JSON object, for example {}.",
  "Fuente actualizada": "Source updated",
  "Fuente creada": "Source created",
  "No se pudo guardar la fuente": "Could not save the source",
  "Escriba el nombre y la URL de la fuente": "Enter the name and URL of the source",
  "Fuente registrada con ingesta activa": "Source registered with ingestion enabled",
  "No se pudo registrar la fuente": "Could not register the source",
  "Escriba una URL que inicie con http:// o https://": "Enter a URL that starts with http:// or https://",
  "No se pudo previsualizar el enlace": "The link could not be previewed",
  "Ingesta con error: {detalle}": "Ingestion failed: {detalle}",
  "sin detalle": "no details",
  "Ingesta: {nuevas} nuevas de {encontradas}": "Ingestion: {nuevas} new out of {encontradas}",
  "No se pudo ingerir la fuente": "Could not ingest the source",
  "Sonda {estado}: {detalle}": "Probe {estado}: {detalle}",
  "No se pudo ejecutar la sonda": "Could not run the probe",
  "Ingesta deshabilitada": "Ingestion disabled",
  "Ingesta habilitada": "Ingestion enabled",
  "No se pudo cambiar la ingesta": "Could not change the ingestion setting",
  "Fuente eliminada": "Source deleted",
  "No se pudo eliminar la fuente": "Could not delete the source",
  "Catálogo {version}: {updated} actualizadas, {created} nuevas, {retired} retiradas":
    "Catalog {version}: {updated} updated, {created} new, {retired} retired",
  "No se pudo importar el catálogo": "Could not import the catalog",
  "Sondeando las fuentes de nivel A y B en segundo plano.": "Probing level A and B sources in the background.",
  "Sondeando {n} fuente(s) en segundo plano. Puede seguir trabajando; el avance se ve en «Salud de fuentes».":
    "Probing {n} source(s) in the background. You can keep working; progress is shown in “Source health”.",
  "No se pudo iniciar el sondeo": "Could not start the probe run",
  "Sondeo terminado: {verdes} verdes, {ambar} ámbar y {rojas} rojas.":
    "Probe run finished: {verdes} green, {ambar} amber and {rojas} red.",
  "Términos aceptados y fechados": "Terms accepted and dated",
  "No se pudieron registrar los términos": "Could not record the terms",
  "Informe de sondas descargado": "Probe report downloaded",
  "Catálogo descargado": "Catalog downloaded",
  "No se pudo exportar": "Could not export",
  "{n} fuente(s) candidata(s) que no están en el catálogo": "{n} candidate source(s) that are not in the catalog",
  "No se encontraron fuentes nuevas con ese enfoque": "No new sources were found with that focus",
  "No se pudo completar la detección de fuentes": "Could not complete source detection",
  '"{titulo}" dada de alta, pendiente de verificación': '"{titulo}" registered, pending verification',
  "Ya existe en el catálogo": "Already in the catalog",
  "No se pudo dar de alta la fuente": "Could not register the source",
  "{n} fuente(s) dada(s) de alta, pendientes de verificación": "{n} source(s) registered, pending verification",
  "{n} no se registraron (ya existían o hubo un error)": "{n} were not registered (they already existed or an error occurred)",

  // Acciones por fuente
  "Ver la ficha completa de la fuente y sus notas": "View the source's full fact sheet and its notes",
  "Ficha": "Fact sheet",
  "Sonda": "Probe",
  "Ingerir": "Ingest",
  "Editar los datos y el adaptador de la fuente": "Edit the source's data and adapter",
  "Editar": "Edit",
  "Apagar la ingesta: deja de consultarse, sin borrar nada":
    "Turn off ingestion: the source is no longer queried, and nothing is deleted",
  "Encender la ingesta de esta fuente": "Turn on ingestion for this source",
  "Deshabilitar": "Disable",
  "Habilitar": "Enable",
  "Eliminar {nombre}": "Delete {nombre}",

  // Tabla
  "Código": "Code",
  "Fuente": "Source",
  "Acceso": "Access",
  "Qué es el nivel de acceso": "What the access level means",
  "Nivel de fuente": "Source level",
  "Qué es el nivel de fuente": "What the source level means",
  "Tecnologías": "Technologies",
  "Adaptador": "Adapter",
  "Qué es el adaptador": "What the adapter means",
  "Salud": "Health",
  "Qué es la salud": "What health means",
  "Ingesta": "Ingestion",
  "Qué es la ingesta": "What ingestion means",
  "Retirada": "Retired",
  "Activa": "Active",
  "Apagada": "Off",
  "Señales": "Signals",
  "Acciones": "Actions",
  "Cargando catálogo verificado de fuentes...": "Loading the verified source catalog...",

  // Cabecera
  "Catálogo de fuentes proactivas": "Proactive source catalog",
  "Inventario RF01 / D-06: fuentes verificadas clasificadas por contrato de datos. Las de nivel A y B sostienen el pipeline; el resto lo enriquece.":
    "RF01 / D-06 inventory: verified sources classified by data contract. Level A and B sources sustain the pipeline; the rest enrich it.",
  "Descarga el catálogo en Excel (.xlsx): hoja de fuentes con filtros e hipervínculos, fuentes de consulta manual (tipo E) y su estado, resumen por nivel, tipo y salud, y las fuentes retiradas.":
    "Downloads the catalog in Excel (.xlsx): a sheet of sources with filters and hyperlinks, manually consulted sources (type E) and their status, a summary by level, type and health, and the retired sources.",
  "Descargar Excel": "Download Excel",
  "El mismo listado en CSV (separado por punto y coma), para otros programas":
    "The same list as CSV (semicolon-separated), for other software",
  "Prueba todas las fuentes activas del inventario (no solo A y B) en segundo plano, de a varias a la vez. Deja el estado verde, ámbar o rojo de cada una y su informe en Excel.":
    "Tests all active sources in the inventory (not only A and B) in the background, several at a time. It records the green, amber or red status of each one and its report in Excel.",
  "Ya hay un sondeo en curso": "A probe run is already in progress",
  "Sondear todas": "Probe all",
  "Recargar catálogo": "Reload catalog",
  "Sube el Excel de la matriz de fuentes (MATRIZ_FUENTES_ESCANEO_EH, .xlsx) o una hoja de Google Sheets: valida, muestra la vista previa de diferencias y conflictos, y no guarda nada hasta que usted confirme. Genera un reporte descargable y queda en bitácora.":
    "Uploads the source matrix Excel file (MATRIZ_FUENTES_ESCANEO_EH, .xlsx) or a Google Sheets sheet: it validates, shows a preview of differences and conflicts, and saves nothing until you confirm. It generates a downloadable report and is recorded in the audit log.",
  "Cargar matriz": "Load matrix",
  "Detectar fuentes con IA": "Detect sources with AI",
  "Alta rápida": "Quick add",
  "Registrar una fuente con adaptador, nivel, frecuencia y configuración":
    "Register a source with adapter, level, frequency and configuration",
  "Agregar fuente": "Add source",
  "Modo consulta: {motivo} Puede ver fichas, salud y cobertura, y descargar el CSV.":
    "Read-only mode: {motivo} You can view fact sheets, health and coverage, and download the CSV.",

  // Guía de la fase
  "Módulo 0 · Identificación": "Module 0 · Identification",
  "Las fuentes de nivel A y B gobiernan el pre-llenado de P1, P5 y P6.":
    "Level A and B sources govern the pre-filling of P1, P5 and P6.",
  "Una sonda ámbar o roja suspende la ingesta de esa fuente; el silencio no se confunde con 'no hay tecnologías'.":
    "An amber or red probe suspends ingestion for that source; silence is not mistaken for 'there are no technologies'.",
  "Las fuentes de nivel D confirman; nunca sobreescriben un campo que ya trajo una A o B.":
    "Level D sources confirm; they never overwrite a field already brought by an A or B source.",
  "Ejecutar vigilancia": "Run surveillance",

  // Indicadores
  "Fuentes del catálogo": "Catalog sources",
  "{n} retiradas del inventario anterior": "{n} retired from the previous inventory",
  "Fuentes vigentes del inventario (no cuenta las retiradas del catálogo anterior).":
    "Current sources in the inventory (does not count those retired from the previous catalog).",
  "Contrato A/B": "A/B contract",
  "Sostienen el pipeline": "They sustain the pipeline",
  "Ingesta activa": "Ingestion enabled",
  "Fuentes de contraste": "Benchmark sources",
  "Control de cobertura": "Coverage check",
  "Fuentes primarias": "Primary sources",
  "URL original de la matriz": "Original matrix URL",
  "{n} con otra URL (ver etiqueta)": "{n} with a different URL (see tag)",
  "Todas usan la URL del Excel": "All use the URL from the Excel file",
  "Fuentes cuya URL principal es la que reporta la matriz EH (Excel). Las demás llevan una etiqueta que dice por qué usan otra: API oficial, página específica o URL de la matriz que no responde.":
    "Sources whose main URL is the one reported in the HS matrix (Excel). The rest carry a tag that says why they use a different one: official API, specific page, or a matrix URL that does not respond.",
  "Con búsqueda web": "With web search",
  "Apagada en Parámetros de fuentes": "Turned off in Source parameters",
  "IA + motores en el dominio": "AI + engines on the domain",
  "Qué es {termino}": "What {termino} means",

  // Filtros
  "Buscar por código, nombre, alias o URL...": "Search by code, name, alias or URL...",
  "Buscar fuente": "Search source",
  "Filtrar por bloque": "Filter by block",
  "Todos los bloques": "All blocks",
  "Filtrar por nivel de acceso": "Filter by access level",
  "Todo nivel de acceso": "Any access level",
  "Acceso {nivel}": "Access {nivel}",
  "Filtrar por nivel de fuente": "Filter by source level",
  "Primaria, secundaria...": "Primary, secondary...",
  "Filtrar por tipo de tecnología": "Filter by technology type",
  "Toda tecnología": "Any technology",
  "Filtrar por salud": "Filter by health",
  "Cualquier salud": "Any health status",
  "Incluir retiradas": "Include retired",
  "Tarjetas": "Cards",
  "Tabla": "Table",
  "{n} fuentes": "{n} sources",
  "Sin fuentes que coincidan": "No matching sources",
  "El inventario está vacío. Recargue el catálogo verificado D-06 o registre una fuente.":
    "The inventory is empty. Reload the verified D-06 catalog or register a source.",
  "Ajuste la búsqueda o los filtros, o marque 'Incluir retiradas'.":
    "Adjust the search or the filters, or check 'Include retired'.",
  "Limpiar filtros": "Clear filters",

  // Tarjetas
  "sin código": "no code",
  "Contraste": "Benchmark",
  "Ingesta apagada": "Ingestion off",
  "Sin descripción.": "No description.",
  "{n} señales": "{n} signals",
  "Funciona sin llave, pero con un cupo bajo. Configúrela en Configuración > Llaves de fuentes.":
    "It works without a key, but with a low quota. Set it up in Settings > Source keys.",
  "requiere llave": "requires a key",

  // Salud de fuentes
  "Sondeando {n} de {total}…": "Probing {n} of {total}…",
  "{verdes} verdes · {ambar} ámbar · {rojas} rojas": "{verdes} green · {ambar} amber · {rojas} red",
  "ahora: {lista}": "now: {lista}",
  "Último sondeo en lote: {fecha} ({total} fuentes, por {quien}).": "Latest batch probe run: {fecha} ({total} sources, by {quien}).",
  "Último sondeo en lote: {fecha} ({total} fuentes).": "Latest batch probe run: {fecha} ({total} sources).",
  "Use «Sondear todas» para probar el inventario completo.": "Use “Probe all” to test the full inventory.",
  "Solo A/B": "A/B only",
  "Informe en Excel de todas las fuentes: estado de la sonda, detalle y acción sugerida (rojas y ámbar primero).":
    "Excel report of all sources: probe status, details and suggested action (red and amber first).",
  "Informe de sondas (Excel)": "Probe report (Excel)",
  "El silencio de una fuente A no significa «no hay tecnologías nuevas».":
    "Silence from a level A source does not mean “there are no new technologies”.",
  "Estado": "Status",
  "Detalle": "Details",
  "Repetir sonda": "Repeat probe",
  "Aún no hay sondas registradas. Use «Sondear todas» para la primera.":
    "No probes have been recorded yet. Use “Probe all” to run the first one.",

  // Cobertura
  "Huecos frente a fuentes de contraste": "Gaps against benchmark sources",
  "Tecnologías que aparecen en PCORI, CDA-AMC, NIHRIO, ACE, ScanMedicine o INAHTA y no están en {ciclo}. Si el contraste las tiene y el IETS no, hay que justificar el hueco.":
    "Technologies that appear in PCORI, CDA-AMC, NIHRIO, ACE, ScanMedicine or INAHTA and are not in {ciclo}. If the benchmark has them and IETS does not, the gap must be justified.",
  "Tecnologías que aparecen en PCORI, CDA-AMC, NIHRIO, ACE, ScanMedicine o INAHTA y no están en el ciclo activo. Si el contraste las tiene y el IETS no, hay que justificar el hueco.":
    "Technologies that appear in PCORI, CDA-AMC, NIHRIO, ACE, ScanMedicine or INAHTA and are not in the active cycle. If the benchmark has them and IETS does not, the gap must be justified.",
  "Ciclo": "Cycle",
  "{n} tecnologías": "{n} technologies",
  "Ciclo contra el que se mide la cobertura (el activo).": "Cycle against which coverage is measured (the active one).",
  "Captadas en contraste": "Captured in benchmark sources",
  "Huecos": "Gaps",
  "Sin huecos detectados": "No gaps detected",
  "Aún no hay señales de contraste, o todas ya están en el ciclo. Ejecute la vigilancia de PCORI, CDA-AMC o ScanMedicine.":
    "There are no benchmark signals yet, or all of them are already in the cycle. Run surveillance for PCORI, CDA-AMC or ScanMedicine.",
  "Tecnología": "Technology",
  "Indicación": "Indication",

  // Detectar fuentes con IA
  "Cerrar": "Close",
  "Dar de alta las seleccionadas": "Register the selected ones",
  "Detectar de nuevo": "Detect again",
  "Detectar": "Detect",
  "Tipos de tecnología (opcional)": "Technology types (optional)",
  "Tema o enfoque (opcional)": "Topic or focus (optional)",
  "Ej.: terapias génicas, oncología de precisión": "E.g. gene therapies, precision oncology",
  "País o región (opcional)": "Country or region (optional)",
  "Ej.: Latinoamérica, Brasil, Europa": "E.g. Latin America, Brazil, Europe",
  "Activar la ingesta al dar de alta (si no, queda apagada hasta verificarla)":
    "Enable ingestion on registration (otherwise it stays off until the source is verified)",
  "Buscando en la web y comparando con el catálogo. Puede tardar uno o dos minutos...":
    "Searching the web and comparing with the catalog. This may take one or two minutes...",
  "{n} consulta(s) redactadas por la IA": "{n} query(ies) written by the AI",
  "{n} consulta(s) por reglas": "{n} query(ies) by rules",
  "{n} llamada(s) a la IA (máx. {max})": "{n} AI call(s) (max. {max})",
  "{n} ya en el catálogo": "{n} already in the catalog",
  "{n} descartada(s) por no responder": "{n} discarded for not responding",
  "Sin fuentes nuevas": "No new sources",
  "Pruebe con otro tema, otra región u otros tipos de tecnología.":
    "Try a different topic, another region or other technology types.",
  "Seleccionar {nombre}": "Select {nombre}",
  "Propuesta por el conocimiento de la IA, no por un resultado de búsqueda":
    "Proposed from the AI's own knowledge, not from a search result",
  "Conocimiento IA": "AI knowledge",
  "Acceso restringido": "Restricted access",
  "Sin justificación.": "No justification.",
  "País sin determinar": "Country not determined",
  "Ya existe": "Already exists",
  "Dada de alta": "Registered",
  "Dar de alta": "Register",
  "Encontradas que ya están en el catálogo ({n})": "Found but already in the catalog ({n})",
  "catálogo D-06": "D-06 catalog",
  "(coincide por {criterio})": "(matched by {criterio})",
  "Descartadas porque no respondieron ({n})": "Discarded because they did not respond ({n})",

  // Alta rápida y formulario completo
  "Alta rápida de fuente": "Quick add source",
  "Cancelar": "Cancel",
  "Registrar fuente": "Register source",
  "Nombre": "Name",
  "Vista previa": "Preview",
  "Bloque": "Block",
  "Editar fuente": "Edit source",
  "Guardar cambios": "Save changes",
  "Crear fuente": "Create source",
  "Fuente del catálogo D-06 ({codigo}). Recargar el catálogo restituye sus datos oficiales; la nivel de fuente, la ruta de acceso y el flujo que edite aquí se conservan.":
    "Source from the D-06 catalog ({codigo}). Reloading the catalog restores its official data; the source level, access path and flow you edit here are kept.",
  "Nivel de acceso (contrato de datos)": "Access level (data contract)",
  "Frecuencia": "Frequency",
  "País o ámbito": "Country or scope",
  "Idioma": "Language",
  "Descripción": "Description",
  "Configuración del conector (JSON)": "Connector configuration (JSON)",
  "Ingesta activa (vigilancia masiva y programada)": "Ingestion enabled (bulk and scheduled surveillance)",
  "Probar búsqueda web": "Test web search",

  // Ficha de la fuente
  "País": "Country",
  "Señales capturadas": "Captured signals",
  "Última consulta": "Last query",
  "Nunca": "Never",
  "Campos que aporta": "Fields it provides",
  "Alias": "Aliases",
  "Términos": "Terms",
  "Aceptados {fecha}": "Accepted {fecha}",
  "No aplican": "Not applicable",
  "Último error": "Last error",
  "Tipos de tecnología": "Technology types",
  "Origen en la matriz": "Origin in the matrix",
  "Flujo": "Flow",
  "Todo apagado": "Everything off",
  "{n} páginas": "{n} pages",
  "Tipo de material": "Material type",
  "Ruta de acceso:": "Access path:",
  "Qué consultar:": "What to consult:",
  "URLs de entrada:": "Entry URLs:",
  "Referencias:": "References:",
  "Observaciones:": "Remarks:",
  "Restricciones:": "Restrictions:",
  "URL principal:": "Main URL:",
  "URL original de la matriz:": "Original matrix URL:",
  "Abrir fuente": "Open source",
  "Deja fechado que el IETS aceptó los términos de uso de esta fuente":
    "Records the date on which IETS accepted this source's terms of use",
  "Registrar aceptación de términos": "Record acceptance of terms",

  // Confirmaciones
  "Eliminar fuente": "Delete source",
  'Se eliminará "{nombre}" del inventario. No tiene señales capturadas. Esta acción no se puede deshacer.':
    'This will delete "{nombre}" from the inventory. It has no captured signals. This action cannot be undone.',
  "Eliminar": "Delete",
  "Recargar catálogo D-06": "Reload D-06 catalog",
  "Se actualizarán las fuentes oficiales con los datos del catálogo verificado y se retirarán las que ya no estén en el. Las señales nunca se borran. Los datos oficiales (URL, adaptador, nivel de acceso) se restituyen; la priorización, la ruta de acceso y el flujo editados en el panel se conservan.":
    "Official sources will be updated with the data from the verified catalog, and those no longer in it will be retired. Signals are never deleted. Official data (URL, adapter, access level) is restored; the prioritization, access path and flow edited in the panel are kept.",
  "Recargar": "Reload",
};

// Solo lo que cambia más que la ortografía.
export const gb = {
  "quincenal": "fortnightly",
};
