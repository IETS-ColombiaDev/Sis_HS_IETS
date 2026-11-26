// Mensajes del servidor de la vigilancia (ingesta, rastreo, sondas, programación,
// búsqueda web, enlaces, matriz de fuentes, confiabilidad y adaptadores).
// Origen: backend/app/{ingest_service,scraper,scan_progress,scan_eta,scheduler_service,
// probe_service,link_resolver,link_matrix,signal_links,web_search,sitemap_search,
// source_discovery,source_import,source_matrix,source_profile,matrix_store,
// reliability_service}.py y backend/app/ingest/*.py.

// ---------------------------------------------------------------- ayudas
const fill = (en, m, ts) => (typeof en === "function" ? en(m, ts) : en.replace(/\$(\d)/g, (_, i) => m[Number(i)] ?? ""));
const pick = (map, value) => (Object.prototype.hasOwnProperty.call(map, value) ? map[value] : value);
const period = (text) => (/[.!?…:;]$/.test(text) ? text : `${text}.`);

/** Quita `suffix` del final de `text`, aunque el servidor lo haya cortado a la mitad. */
function cutSuffix(text, suffix, min = 4) {
  for (let k = suffix.length; k >= min; k -= 1) {
    const piece = suffix.slice(0, k);
    if (text.endsWith(piece)) return [text.slice(0, -piece.length).trimEnd(), true];
  }
  return [text, false];
}

/**
 * Traduce una cola hecha de frases conocidas. Si la última quedó cortada por el
 * servidor (`[:240]`), se muestra la frase completa en inglés.
 */
function tails(rest, pairs, ts) {
  let text = (rest || "").trim();
  const out = [];
  while (text) {
    const hit = pairs.find(([es]) => text.startsWith(es) || (text.length >= 12 && es.startsWith(text)));
    if (!hit) {
      out.push(ts(text));
      break;
    }
    out.push(hit[1]);
    text = text.startsWith(hit[0]) ? text.slice(hit[0].length).trim() : "";
  }
  return out.join(" ");
}

/** Traduce una nota hecha de frases seguidas; lo que no se reconoce queda igual. */
function chain(text, parts, ts) {
  let rest = (text || "").trim();
  const out = [];
  while (rest) {
    let hit = null;
    for (const [re, en] of parts) {
      const m = re.exec(rest);
      if (m) {
        hit = [m, en];
        break;
      }
    }
    if (!hit) {
      out.push(ts(rest));
      break;
    }
    out.push(fill(hit[1], hit[0], ts));
    rest = rest.slice(hit[0][0].length).trim();
  }
  return out.join(" ");
}

// ---------------------------------------------------------------- códigos y partes
const PROBE_COLOR = { verde: "green", ambar: "amber", rojo: "red" };

const ROLE_PAGE = {
  entrada: "entry page",
  "entrada matriz": "matrix entry page",
  busqueda: "search result",
  ficha: "detail page",
  paginacion: "pagination page",
};
const ROLE_SHORT = {
  entrada: "entry",
  entrada_matriz: "matrix entry",
  busqueda: "search",
  ficha: "detail",
  paginacion: "pagination",
  ninguna: "none",
};

const ROUTE_LABEL = {
  sitio: "site",
  "ruta de la matriz": "matrix route",
  "RSS oficial": "official RSS",
  "índice de PubMed": "PubMed index",
  "Google News": "Google News",
};
const ROUTE_STATUS = {
  "sin respuesta": "no response",
  "omitido (no respondió en una corrida reciente)": "skipped (did not respond in a recent run)",
};

const ENGINE_STATUS = {
  ok: "ok",
  bloqueado: "blocked",
  enfriamiento: "paused",
  error: "error",
  fuera_de_dominio: "off-domain",
  sin_resultados: "no results",
};
const engines = (text) =>
  text === "sin motores"
    ? "no engines"
    : text
        .split(", ")
        .map((part) => {
          const at = part.lastIndexOf(":");
          return at === -1 ? part : `${part.slice(0, at)}:${pick(ENGINE_STATUS, part.slice(at + 1))}`;
        })
        .join(", ");

const SKIP_REASON = {
  "este dominio ya se buscó hace poco y lo encontrado está en la base de conocimiento":
    "this domain was searched recently and what was found is in the knowledge base",
  "los buscadores están en pausa por bloqueo y no hay un motor con llave":
    "the search engines are paused after being blocked and there is no engine with a key",
};

const PACE = { "más lento": "slower than usual", "más rápido": "faster than usual", "a su ritmo habitual": "at its usual pace" };

const ROUTE_USED = (text) => {
  if (text === "el canal de Google News del dominio") return "the domain's Google News feed";
  const m = /^la ruta de respaldo (.+)$/.exec(text);
  return m ? `the fallback route ${m[1]}` : text;
};
const ROUTE_RE = "(el canal de Google News del dominio|la ruta de respaldo \\S+?)";

const TRY_ANYWAY = "Se intenta igual por las rutas de acceso.";

const PROBE_TAILS = [
  [
    "Tampoco hay nada publicado del dominio en Google News en los últimos 90 días: la fuente probablemente cambió de dirección o dejó de publicar. Revise y actualice la URL.",
    "Nothing from the domain has been published on Google News in the last 90 days either: the source has probably changed its address or stopped publishing. Review and update the URL.",
  ],
  [
    "El sitio bloquea el acceso automatico (proteccion anti-robot): registre sus senales con la carga manual de la bandeja de entrada o agregue una ruta alternativa (RSS, PDF) en el flujo de la fuente.",
    "The site blocks automated access (anti-bot protection): record its signals with the manual upload in the inbox or add an alternative route (RSS, PDF) in the source's workflow.",
  ],
];

const ORIGIN_LABEL = {
  "Consulta activa (SI EAA)": "Active consultation (SI EAA)",
  "Información general / metodológica": "General / methodological information",
};
const NOTE_MARKS = [" Se consulta por la API oficial del registro (", " Consulta manual: ", " Información general o metodológica: "];

const ENTITY = {
  "agencia regulatoria": "regulatory agency",
  "agencia de evaluación de tecnologías": "health technology assessment agency",
  "registro de ensayos clínicos": "clinical trials registry",
  "literatura científica": "scientific literature",
  fabricante: "manufacturer",
  "oficina de patentes": "patent office",
};
const LEVEL = {
  "API oficial": "official API",
  "descarga estructurada": "structured download",
  "datos de portal": "portal data",
  "página o PDF": "page or PDF",
  "curaduría manual": "manual curation",
};

const CHECK_LABELS =
  "Fuente del catálogo|Enlace a la señal|Conexión segura|La página sigue en línea|Identificadores comprobables|Hitos regulatorios o de desarrollo|Registro original conservado|Fecha de publicación|Descripción de la tecnología";

// Frases de la justificación de una fuente nueva (source_import): llegan seguidas en un solo texto.
const RATIONALE = [
  [/^El dominio (\S+) tiene adaptador con API \(([^)]+)\)\./, "The domain $1 has an adapter with an API ($2)."],
  [/^La URL principal es un PDF\./, "The main URL is a PDF."],
  [
    /^La matriz indica acceso con registro, suscripción o pago: curaduría humana\./,
    "The matrix indicates access by registration, subscription or payment: human curation.",
  ],
  [/^La matriz menciona un canal RSS: se lee como canal\./, "The matrix mentions an RSS feed: it is read as a feed."],
  [
    /^Publica tablas o listados: rastreo HTML con recorrido de fichas\./,
    "It publishes tables or listings: HTML crawl that follows detail pages.",
  ],
  [
    /^Sin API conocida: rastreo HTML con recorrido de fichas y extracción con IA\./,
    "No known API: HTML crawl that follows detail pages, with AI extraction.",
  ],
  [
    /^El sitio responde HTTP (\d+) a robots: la vigilancia caerá al RSS de Google News \(solo titulares pertinentes\)\. Si hay RSS oficial, agréguelo como URL de entrada\./,
    "The site responds HTTP $1 to bots: surveillance will fall back to the Google News RSS (relevant headlines only). If there is an official RSS, add it as an entry URL.",
  ],
  [
    /^No respondió \((.+?)\): revise la URL antes de activar la ingesta\./,
    (m, ts) => `It did not respond (${ts(m[1])}): check the URL before enabling ingestion.`,
  ],
  [
    /^Recomendado: (\w+)\. Configure el adaptador «Descarga estructurada» con la URL del archivo y el mapa de columnas\./,
    "Recommended: $1. Configure the “Structured download” adapter with the file URL and the column map.",
  ],
];

function catalogNote(m, ts) {
  const origin = pick(ORIGIN_LABEL, m[1]);
  const number = m[2] === "sin número" ? "no number" : m[2];
  let name = m[3];
  let reasons = "";
  const cuts = NOTE_MARKS.map((mark) => name.indexOf(`.${mark}`)).filter((i) => i !== -1);
  if (cuts.length) {
    const at = Math.min(...cuts);
    reasons = name.slice(at + 1).trim();
    name = name.slice(0, at);
  } else {
    name = name.replace(/\.$/, "");
  }
  const head = number === "no number" ? `${origin}, no original number, of ${name}.` : `${origin}, original no. ${number} of ${name}.`;
  return reasons ? `${head} ${chain(reasons, NOTE_REASONS, ts)}` : head;
}

const NOTE_REASONS = [
  [
    /^Se consulta por la API oficial del registro \((.*?)\); la URL de la matriz queda como referencia\./,
    "Queried through the registry's official API ($1); the matrix URL is kept as a reference.",
  ],
  [
    /^Consulta manual: el sitio no permite rastreo automático \((.*)\)$/,
    (m) => `Manual consultation: the site does not allow automated crawling (${m[1] === "catálogo verificado" ? "verified catalog" : m[1]})`,
  ],
  [
    /^Información general o metodológica: queda como referencia, sin ingesta\./,
    "General or methodological information: kept as a reference, without ingestion.",
  ],
  [/^Consulta manual:/, "Manual consultation:"],
];

// ---------------------------------------------------------------- textos fijos
export default {
  // --- ingest_service.py
  "Interrumpido: el proceso se detuvo durante la ejecución; se reintenta al final de la cola.":
    "Interrupted: the process stopped while running; it will be retried at the end of the queue.",
  "Error": "Error",
  "La fuente asociada ya no existe.": "The associated source no longer exists.",
  "Verificando la salud de la fuente antes de ingerir": "Checking the source's health before ingesting",
  "Rastreo HTML / PDF (último recurso)": "HTML / PDF crawl (last resort)",
  "El scraper genérico se conserva para referentes sin API.": "The generic scraper is kept for reference sources without an API.",
  "Extracción de PDF": "PDF extraction",
  "Documentos oficiales sin capa de datos (MHRA, ACE).": "Official documents without a data layer (MHRA, ACE).",
  "Fuente con API: los registros llegan estructurados, no se busca en la web":
    "Source with an API: records arrive structured, so the web is not searched",
  "Registros estructurados de la API: se mapean campo a campo, sin IA":
    "Structured records from the API: mapped field by field, without AI",
  "El escaneo HTML fallo.": "The HTML scan failed.",

  // --- scraper.py
  "El sitio no respondio tras los reintentos": "The site did not respond after the retries",
  "Pagina omitida; el rastreo continua": "Page skipped; the crawl continues",
  "La pagina ya estaba en el corpus": "The page was already in the corpus",
  "HTML de entrada ya descargado": "Entry HTML already downloaded",
  "Seguir enlaces internos esta apagado para esta fuente": "Following internal links is turned off for this source",
  "Canal RSS": "RSS feed",
  "Texto de la página (menú, leyenda, rótulo o párrafo), no una tecnología":
    "Page text (menu, caption, label or paragraph), not a technology",
  "Noticia corporativa, financiera, jurídica o política": "Corporate, financial, legal or political news",
  "Página de error o de verificación del sitio": "Error page or site verification page",
  "Página administrativa o de trámites": "Administrative or procedures page",
  "Página índice o listado general, no un ítem": "Index page or general listing, not an item",
  "Oferta de empleo": "Job posting",
  "Evento, webinar o viñeta de riesgos, sin producto": "Event, webinar or risk bullet point, with no product",
  "Título del propio sitio, página educativa o pregunta, sin producto":
    "The site's own title, an educational page or a question, with no product",
  "Opción de menú o categoría, sin producto": "Menu option or category, with no product",
  "IA apagada o sin configurar en Configuración › IA: solo extracción por reglas":
    "AI is turned off or not configured in Settings › AI: rule-based extraction only",
  "IA y OCR apagados en el flujo de esta fuente: solo extracción por reglas":
    "AI and OCR are turned off in this source's workflow: rule-based extraction only",
  "IA y OCR apagados en el flujo de esta fuente": "AI and OCR are turned off in this source's workflow",
  "sin senales nuevas": "no new signals",
  "Recorrido apagado en el flujo de esta fuente: solo página principal":
    "Crawling is turned off in this source's workflow: main page only",
  "No respondió en una corrida reciente (12 h)": "It did not respond in a recent run (12 h)",
  "No se pudo entrar a la fuente.": "The source could not be accessed.",
  "Identificando candidatos en la página principal": "Identifying candidates on the main page",
  "Fuente de pipeline: se lee la tabla del fabricante en la página principal, sin recorrido ni búsqueda web":
    "Pipeline source: the manufacturer's table on the main page is read, with no crawl or web search",
  "El canal de respaldo no trajo ítems pertinentes: nada que leer": "The fallback feed returned no relevant items: nothing to read",
  "Tiempo máximo por fuente agotado: la vigilancia siguió con la siguiente.":
    "Maximum time per source exceeded: surveillance moved on to the next one.",
  "Tiempo maximo de la fuente agotado": "Maximum time for the source exceeded",
  "URL inválida. Debe iniciar con http:// o https://": "Invalid URL. It must start with http:// or https://",
  "Por seguridad no se previsualizan direcciones de la red interna.": "For security, internal network addresses are not previewed.",
  "No se pudo conectar con el enlace tras los reintentos.": "Could not connect to the link after the retries.",
  "Documento PDF": "PDF document",
  "Documento binario/PDF sin texto extraíble.": "Binary/PDF document with no extractable text.",

  // --- scan_progress.py: etapas, rutas de acceso y desenlaces
  "En cola": "Queued",
  "Verificando salud": "Checking health",
  "Accediendo a la fuente": "Accessing the source",
  "Fuente accedida": "Source accessed",
  "Buscando en la web": "Searching the web",
  "Recorriendo páginas": "Crawling pages",
  "Extrayendo señales": "Extracting signals",
  "Guardando señales": "Saving signals",
  "Terminada": "Finished",
  "Cancelada": "Canceled",
  "Sitio de la fuente": "Source site",
  "Sitio de la fuente, con cliente compatible con navegador": "Source site, with a browser-compatible client",
  "Índice oficial de la revista en PubMed (el sitio no respondió)": "Official journal index in PubMed (the site did not respond)",
  "URL de entrada de la matriz EH": "Entry URL from the HS matrix",
  "RSS oficial del sitio (la portada no respondió)": "Official site RSS (the home page did not respond)",
  "RSS de Google News (el sitio no respondió)": "Google News RSS (the site did not respond)",
  "API del adaptador": "Adapter API",
  "Entró a la fuente": "Accessed the source",
  "Entró por una ruta de respaldo": "Accessed through a fallback route",
  "Entró, pero no encontró señales": "Accessed, but found no signals",
  "No pudo entrar": "Could not access",
  "Entró, pero la extracción falló": "Accessed, but extraction failed",
  "En curso": "In progress",
  "Sin ejecutar": "Not run",

  // --- scheduler_service.py
  "Vigilancia programada": "Scheduled surveillance",
  "Barrido de duplicados": "Duplicate sweep",
  "Fuentes con frecuencia vencida": "Sources due by frequency",
  "Todas las fuentes activas": "All active sources",
  "Fuentes seleccionadas": "Selected sources",
  "Ninguna fuente habilitada tenía la frecuencia vencida. No se encoló nada.":
    "No enabled source was due by frequency. Nothing was queued.",

  // --- probe_service.py
  "La fuente no declara URL de sonda.": "The source does not declare a probe URL.",
  "Responde y el contrato se sostiene (variaron campos opcionales).": "It responds and the contract holds (optional fields varied).",
  "El esquema cambió respecto de la última corrida exitosa.": "The schema changed since the last successful run.",
  "Responde con cero registros donde se esperaba señal.": "It responds with zero records where signals were expected.",
  "robots.txt desaconseja el rastreo automático.": "robots.txt discourages automated crawling.",
  "Responde y el contrato se sostiene.": "It responds and the contract holds.",
  "Verde": "Green",
  "Ámbar": "Amber",
  "Rojo": "Red",
  "Sin sonda": "Not probed",
  "Ninguna": "None",
  "Revisar la URL o el contrato de la fuente": "Review the source's URL or contract",
  "Revisar la URL en la matriz o pasar la fuente a consulta manual":
    "Review the URL in the matrix or switch the source to manual consultation",
  "Sondear": "Probe",

  // --- link_resolver.py
  "Enlace exacto encontrado en la página de la fuente": "Exact link found on the source's page",
  "La página abre y resalta la señal (la fuente no tiene enlace por ítem)":
    "The page opens and highlights the signal (the source has no per-item link)",
  "No se pudo ubicar la señal en la página": "The signal could not be located on the page",
  "Enlace exacto a la ficha del registro oficial": "Exact link to the record in the official registry",
  "La página no trae el nombre de la señal en su HTML (es probable que cargue su contenido con JavaScript).":
    "The page does not include the signal's name in its HTML (it probably loads its content with JavaScript).",
  "La página consultada no respondió al ubicar la señal.": "The page did not respond when locating the signal.",
  "sistema (automático)": "system (automatic)",
  "Enlaces exactos": "Exact links",
  "Las señales llevan a su ficha o artículo. No requiere cambios en la matriz.":
    "Signals lead to their own record or article. No changes to the matrix are needed.",
  "La fuente no tiene enlace por ítem": "The source has no per-item link",
  "La fuente publica sus señales en una tabla o listado sin enlace propio. El sistema abre la página y resalta la señal. No requiere cambio en la matriz.":
    "The source publishes its signals in a table or listing without their own link. The system opens the page and highlights the signal. No change to the matrix is needed.",
  "Actualizar la URL en la matriz": "Update the URL in the matrix",
  "La URL de la matriz no responde, redirige o ya no existe. Registre la dirección vigente de la sección.":
    "The matrix URL does not respond, redirects or no longer exists. Enter the section's current address.",
  "La matriz apunta a la portada": "The matrix points to the home page",
  "La URL de la matriz es la página principal del sitio. Registre la URL de la sección donde se publican las novedades (listado de noticias, pipeline, aprobaciones o informes).":
    "The matrix URL is the site's main page. Enter the URL of the section where new items are published (news listing, pipeline, approvals or reports).",
  "La matriz apunta a un buscador": "The matrix points to a search page",
  "La URL es un buscador o formulario: el resultado cambia en cada consulta. Registre una URL de listado fija, un canal RSS o una descarga oficial.":
    "The URL is a search page or form: the result changes with every query. Enter a fixed listing URL, an RSS feed or an official download.",
  "La señal no se puede ubicar en la página": "The signal cannot be located on the page",
  "La página no deja ubicar la señal (carga su contenido con JavaScript o cambió). Registre una URL más específica (listado, RSS o descarga) o pase la fuente a consulta manual.":
    "The page does not allow the signal to be located (it loads its content with JavaScript or it changed). Enter a more specific URL (listing, RSS or download) or switch the source to manual consultation.",
  "Falta ubicar las señales": "Signals not yet located",
  "Pulse «Ubicar señales exactas» para que el sistema busque el enlace o el texto de cada señal en su página.":
    "Click “Locate exact signals” so the system looks for the link or the text of each signal on its page.",
  "Sin señales todavía": "No signals yet",
  "La fuente aún no tiene señales capturadas.": "The source has no captured signals yet.",

  // --- link_matrix.py
  "Consulta activa (SI EAA)": "Active consultation (SI EAA)",
  "Información general / metodológica": "General / methodological information",
  "La primera hoja no tiene los encabezados ID, Sitio / organización, Origen del enlace y URL.":
    "The first sheet does not have the headers ID, Sitio / organización, Origen del enlace and URL.",
  "La fila no tiene ID numérico.": "The row has no numeric ID.",
  "La primera hoja de la matriz no tiene filas con URL.": "The first sheet of the matrix has no rows with a URL.",
  "(sin tipo)": "(no type)",
  "Información general o metodológica: queda como referencia, sin ingesta.":
    "General or methodological information: kept as a reference, without ingestion.",
  "Ya no está en la matriz de escaneo por enlace.": "No longer in the per-link scanning matrix.",
  "Retirada al cargar la matriz de escaneo por enlace (17-11-2026). Sus señales se conservan en la bandeja Legacy.":
    "Retired when the per-link scanning matrix was loaded (17-11-2026). Its signals are kept in the Legacy tray.",
  "Cancelado: la fuente quedó en el inventario legacy.": "Canceled: the source was moved to the legacy inventory.",
  "Fuente retirada al cargar la matriz de escaneo por enlace": "Source retired when the per-link scanning matrix was loaded",
  "Nombre": "Name",
  "Adaptador": "Adapter",
  "Ingesta activa": "Ingestion enabled",
  "Nivel de fuente": "Source level",
  "Tipos de tecnología": "Technology types",
  "Tipo de material": "Material type",
  "Ruta de acceso": "Access path",
  "Información a consultar": "Information to consult",
  "Observaciones": "Remarks",
  "Restricciones": "Restrictions",
  "Frecuencia": "Frequency",
  "Origen del enlace": "Link origin",
  "Formato por enlace: cada fila es una fuente. El adaptador sale de reglas (API oficial del registro o consulta manual por restricciones), no de la IA.":
    "Per-link format: each row is a source. The adapter is chosen by rules (the registry's official API, or manual consultation because of restrictions), not by the AI.",

  // --- signal_links.py
  "Enlace exacto": "Exact link",
  "Página de consulta, la fuente no ofrece enlace directo": "Query page; the source does not offer a direct link",
  "Sin enlace": "No link",
  "Responde": "Responds",
  "Redirige a otra página": "Redirects to another page",
  "No responde": "Not responding",
  "El sitio bloquea la verificación automática": "The site blocks automated verification",
  "Sin verificar": "Not verified",
  "El sitio no respondió a la verificación (se reintenta)": "The site did not respond to verification (it will be retried)",

  // --- web_search.py y sitemap_search.py
  "desafio anti-bot": "anti-bot challenge",
  "sin llave configurada": "no key configured",
  "sin URL configurada": "no URL configured",
  "motor desconocido": "unknown engine",
  "motor en pausa tras un bloqueo": "engine paused after being blocked",
  "sin motores": "no engines",
  "Búsqueda web apagada en Parámetros de fuentes": "Web search is turned off in Source parameters",
  "Búsqueda web apagada en Parámetros de fuentes.": "Web search is turned off in Source parameters.",
  "Búsqueda web apagada en el flujo de esta fuente": "Web search is turned off in this source's workflow",
  "La fuente no tiene dominio": "The source has no domain",
  "Sin motores disponibles o tiempo de búsqueda agotado: se omiten las consultas restantes":
    "No engines available or search time used up: the remaining queries are skipped",
  "La base de conocimiento no tiene páginas de este dominio": "The knowledge base has no pages from this domain",
  "sin dominio o sin palabras de consulta": "no domain or no query words",
  "el sitio no publica mapa del sitio": "the site does not publish a sitemap",

  // --- source_discovery.py
  "Propuesta por IA – pendiente de verificación": "Proposed by AI – pending verification",
  "URL inválida": "Invalid URL",
  "Dirección de red interna": "Internal network address",
  "IA no disponible: resultados de búsqueda sin clasificar (bloque, país y tipos sugeridos por reglas).":
    "AI not available: search results are unclassified (block, country and types suggested by rules).",
  "La IA no respondió a tiempo: resultados de búsqueda clasificados por reglas.":
    "The AI did not respond in time: search results classified by rules.",
  "No hay IA configurada y la búsqueda web está apagada en Parámetros de fuentes: no hay cómo detectar fuentes.":
    "No AI is configured and web search is turned off in Source parameters: there is no way to detect sources.",

  // --- source_import.py
  "URLs de entrada": "Entry URLs",
  "URLs de referencia": "Reference URLs",
  "Qué consultar": "What to consult",
  "Rastreo HTML con recorrido de fichas": "HTML crawl that follows detail pages",
  "Curaduría humana (sin ingesta automática)": "Human curation (no automatic ingestion)",
  "La URL no es de Google Sheets. Use un enlace como https://docs.google.com/spreadsheets/d/…":
    "The URL is not a Google Sheets URL. Use a link such as https://docs.google.com/spreadsheets/d/…",
  "Google no entregó la hoja: compártala como «Cualquier persona con el enlace · Lector» (o publíquela en la web) y vuelva a intentar.":
    "Google did not deliver the sheet: share it as “Anyone with the link · Viewer” (or publish it to the web) and try again.",
  "Google Sheets respondió 404: revise que el enlace de la hoja sea correcto.":
    "Google Sheets responded 404: check that the sheet link is correct.",
  "La hoja supera 10 MB.": "The sheet is larger than 10 MB.",
  "IA no solicitada: sugerencias por reglas.": "AI not requested: rule-based suggestions.",
  "La URL principal es un PDF.": "The main URL is a PDF.",
  "La matriz indica acceso con registro, suscripción o pago: curaduría humana.":
    "The matrix indicates access by registration, subscription or payment: human curation.",
  "La matriz menciona un canal RSS: se lee como canal.": "The matrix mentions an RSS feed: it is read as a feed.",
  "Publica tablas o listados: rastreo HTML con recorrido de fichas.":
    "It publishes tables or listings: HTML crawl that follows detail pages.",
  "Sin API conocida: rastreo HTML con recorrido de fichas y extracción con IA.":
    "No known API: HTML crawl that follows detail pages, with AI extraction.",
  "IA no disponible: sugerencias por reglas. Actívela en Configuración › IA para una revisión asistida.":
    "AI not available: rule-based suggestions. Turn it on in Settings › AI for an assisted review.",
  "La IA no respondió con un formato legible: quedan las sugerencias por reglas.":
    "The AI did not respond in a readable format: the rule-based suggestions remain.",
  "Configure el adaptador «Descarga estructurada» con la URL del archivo y el mapa de columnas.":
    "Configure the “Structured download” adapter with the file URL and the column map.",
  "La comparación expiró o no existe. Vuelva a cargar la matriz.": "The comparison expired or does not exist. Load the matrix again.",

  // --- source_matrix.py y matrix_store.py
  "No se encontró el encabezado 'Tipo de Entidad' en la hoja de la matriz.":
    "The 'Tipo de Entidad' header was not found in the matrix sheet.",
  "La hoja de la matriz no tiene filas con 'Sitio / organización'.": "The matrix sheet has no rows with 'Sitio / organización'.",
  "la matriz guardada no coincide con su huella": "the saved matrix does not match its fingerprint",

  // --- source_profile.py: listas de opciones y motores de búsqueda
  "Primaria": "Primary",
  "Produce la tecnología o el dato original (fabricante, registro, agencia que aprueba).":
    "Produces the technology or the original data (manufacturer, registry, approving agency).",
  "Secundaria": "Secondary",
  "Reporta o analiza tecnologías de otros (agencias regulatorias, revistas, noticias).":
    "Reports on or analyzes technologies from others (regulatory agencies, journals, news).",
  "Terciaria": "Tertiary",
  "Sintetiza o evalúa (agencias HTA, redes de EH, buscadores de literatura).":
    "Synthesizes or assesses (HTA agencies, horizon scanning networks, literature search engines).",
  "Por definir": "To be defined",
  "La matriz pide revisar el nivel de la fuente.": "The matrix asks for the source level to be reviewed.",
  "Medicamentos": "Medicines",
  "Medicamentos, biológicos, terapias avanzadas y vacunas.": "Medicines, biologics, advanced therapies and vaccines.",
  "Dispositivos médicos": "Medical devices",
  "Dispositivos, equipos biomédicos e implantables.": "Devices, biomedical equipment and implantables.",
  "Biomarcadores": "Biomarkers",
  "Biomarcadores y diagnóstico in vitro.": "Biomarkers and in vitro diagnostics.",
  "Inteligencia artificial": "Artificial intelligence",
  "IA clínica y algoritmos.": "Clinical AI and algorithms.",
  "Salud digital": "Digital health",
  "SaMD, telemedicina, mHealth y wearables.": "SaMD, telemedicine, mHealth and wearables.",
  "Multitecnología": "Multi-technology",
  "Cubre MED, DM y BIOM.": "Covers MED, DM and BIOM.",
  "Verificada manual EH 04-2025": "Manually verified HS 04-2025",
  "Fuente verificada a mano en la matriz de abril de 2025.": "Source verified by hand in the April 2025 matrix.",
  "Agregada a la matriz": "Added to the matrix",
  "Fuente añadida después de la verificación inicial.": "Source added after the initial verification.",
  "Yahoo (HTML, sin llave)": "Yahoo (HTML, no key)",
  "DuckDuckGo (HTML, sin llave)": "DuckDuckGo (HTML, no key)",
  "DuckDuckGo Lite (sin llave)": "DuckDuckGo Lite (no key)",
  "Bing (HTML, sin llave; filtra por dominio)": "Bing (HTML, no key; filters by domain)",
  "Brave Search API (requiere llave)": "Brave Search API (requires a key)",
  "SearXNG propio (URL del servidor)": "Self-hosted SearXNG (server URL)",
  "Los términos por categoría deben ser una lista.": "The terms per category must be a list.",
  "Elija al menos un motor de búsqueda.": "Choose at least one search engine.",
  "La URL de SearXNG debe iniciar con http:// o https://": "The SearXNG URL must start with http:// or https://",

  // --- reliability_service.py
  "Confiable": "Reliable",
  "Verificar antes de usar": "Verify before use",
  "Baja confiabilidad": "Low reliability",
  "Fuente del catálogo": "Catalog source",
  "Postulación externa: no viene de una fuente vigilada.": "External submission: it does not come from a monitored source.",
  "Sin fuente registrada.": "No source on record.",
  "Enlace a la señal": "Link to the signal",
  "No hay URL para comprobar el origen.": "There is no URL to check the origin.",
  "Llega por Google News: abra el enlace y confirme el medio que la publica.":
    "It arrives through Google News: open the link and confirm which outlet publishes it.",
  "Conexión segura": "Secure connection",
  "El enlace no usa HTTPS.": "The link does not use HTTPS.",
  "La página sigue en línea": "The page is still online",
  "Responde y menciona la tecnología.": "It responds and mentions the technology.",
  "Responde, pero no se encontró el nombre de la tecnología en el texto.":
    "It responds, but the technology's name was not found in the text.",
  "Identificadores comprobables": "Verifiable identifiers",
  "Sin NCT, registro ni identificador externo.": "No NCT, registration or external identifier.",
  "Hitos regulatorios o de desarrollo": "Regulatory or development milestones",
  "Registro original conservado": "Original record kept",
  "Se guardó el JSON tal como llegó de la fuente.": "The JSON was saved exactly as it arrived from the source.",
  "No se guardó el registro original.": "The original record was not saved.",
  "Fecha de publicación": "Publication date",
  "Descripción de la tecnología": "Technology description",
  "No trae indicación ni resumen: poca evidencia para clasificar.":
    "It has no indication or summary: little evidence for classification.",
  "La IA no devolvió un dictamen válido; se muestran solo los chequeos automáticos.":
    "The AI did not return a valid verdict; only the automatic checks are shown.",
  "La IA está apagada: el dictamen sale solo de los chequeos automáticos.":
    "The AI is turned off: the verdict comes from the automatic checks alone.",

  // --- ingest/*.py: adaptadores (etiqueta, descripción, resultado y errores)
  "Fallo desconocido": "Unknown failure",
  "Registro de ensayos clínicos de los NIH. Filtra fases II, III y IV y extrae fecha estimada de finalización, patrocinador e intervención.":
    "NIH clinical trials registry. Filters phases II, III and IV and extracts the estimated completion date, sponsor and intervention.",
  "CTIS (EMA, portal público)": "CTIS (EMA, public portal)",
  "Ensayos clínicos de la UE. JSON no contractual del portal; verifica el esquema en cada corrida y se apaga si cambia.":
    "EU clinical trials. Non-contractual JSON from the portal; it checks the schema on every run and switches itself off if it changes.",
  "lote local": "local batch",
  "CTIS respondió JSON pero sin número EU CT. El contrato del portal cambió.":
    "CTIS responded with JSON but without an EU CT number. The portal's contract has changed.",
  "EMA medicamentos (descarga + RSS)": "EMA medicines (download + RSS)",
  "Tablas oficiales descargables de la EMA, con el canal RSS como contingencia cuando el archivo no está disponible.":
    "Official downloadable EMA tables, with the RSS feed as a contingency when the file is not available.",
  "FDA openFDA (multiconjunto)": "FDA openFDA (multi-dataset)",
  "Aprobaciones de medicamentos y dispositivos. Extrae nombre comercial, principio activo, titular y fecha de presentación o decisión.":
    "Medicine and device approvals. Extracts the brand name, active ingredient, holder and submission or decision date.",
  "openFDA sin resultados.": "openFDA returned no results.",
  "Descarga estructurada (CSV / XLSX)": "Structured download (CSV / XLSX)",
  "Baja un archivo oficial y lo traduce con el mapa de columnas de la fuente.":
    "Downloads an official file and translates it with the source's column map.",
  "file_feed necesita download_url o un lote en connector_config.records. Para TGA, descargue el CSV/XLSX del ARTG y cárguelo como lote.":
    "file_feed needs download_url or a batch in connector_config.records. For TGA, download the ARTG CSV/XLSX and load it as a batch.",
  "Para leer XLSX instale openpyxl (ya está en requirements.txt).": "To read XLSX, install openpyxl (it is already in requirements.txt).",
  "Fixture de contrato (pruebas)": "Contract fixture (tests)",
  "No consulta redes. Solo existe para pruebas de contrato y la suite de regresión.":
    "It does not query any network. It exists only for contract tests and the regression suite.",
  "API oficial de dispositivos médicos y de productos farmacéuticos. Aporta nombre, titular y estado regulatorio.":
    "Official API for medical devices and pharmaceutical products. Provides the name, holder and regulatory status.",
  "Curaduría humana": "Human curation",
  "No hay ruta automatizable razonable. El sistema recuerda la revisión y acepta un lote cargado por el evaluador.":
    "There is no reasonable route to automate. The system issues a reminder for the review and accepts a batch loaded by the assessor.",
  "Fuente de curaduría: no hay lote cargado. Registre la revisión en la ficha y, si aplica, adjunte records.":
    "Curation source: no batch has been loaded. Record the review in the fact sheet and, if applicable, attach records.",
  "Base pública de horizon scanning operada con ECRI. Fichas fechadas por tecnología y seis áreas de interés.":
    "Public horizon scanning database operated with ECRI. Dated fact sheets per technology and six areas of interest.",
  "PCORI no expuso JSON ni fichas parseables en la portada. Configure api_url o entregue un lote en connector_config.records.":
    "PCORI did not expose JSON or parseable fact sheets on its home page. Configure api_url or provide a batch in connector_config.records.",
  "La API de PCORI no devolvio la lista de fichas (response.hits).": "The PCORI API did not return the list of fact sheets (response.hits).",
  "Índice de literatura del NCBI. Recupera artículos recientes de escaneo de horizonte y tecnologías emergentes como evidencia.":
    "NCBI literature index. Retrieves recent articles on horizon scanning and emerging technologies as evidence.",
  "PubMed no devolvió identificadores.": "PubMed returned no identifiers.",
  "Registro Internacional de Ensayos Clínicos de la OMS. Se alimenta de un espejo JSON o de un lote descargado; el portal oficial no garantiza API.":
    "WHO International Clinical Trials Registry. Fed from a JSON mirror or a downloaded batch; the official portal does not guarantee an API.",
  "WHO ICTRP no tiene un REST público estable. Configure api_url o entregue un lote en connector_config.records.":
    "WHO ICTRP does not have a stable public REST API. Configure api_url or provide a batch in connector_config.records.",
};

// ---------------------------------------------------------------- textos con datos
export const patterns = [
  // --- ingest_service.py: desenlace de un job
  {
    re: /^Tiempo máximo agotado: la fuente superó (\d+) min(?: \(iba en: (.+?)\))?\.(?: La vigilancia siguió con la siguiente\.(?: .*)?)?$/,
    en: (m, ts) => {
      let where = "";
      if (m[2]) {
        const at = m[2].indexOf(" · ");
        const label = at === -1 ? m[2] : m[2].slice(0, at);
        const stage = ts(label.charAt(0).toUpperCase() + label.slice(1));
        where = ` (it was at: ${stage.charAt(0).toLowerCase() + stage.slice(1)}${at === -1 ? "" : ` · ${ts(m[2].slice(at + 3))}`})`;
      }
      return `Maximum time exceeded: the source took longer than ${m[1]} min${where}. Surveillance moved on to the next one. Adjust the limit in Settings › Methodological governance (ingest.job_timeout_minutes).`;
    },
  },
  {
    re: /^Falló: (.+?)(?: · reintento (\d+)\/(\d+) a las (\S+) UTC)?$/,
    en: (m, ts) => {
      const body = m[1].replace(/ · reint[a-z]*[ \d\/a-zA-Z:]*$/, "");
      const head = `Failed: ${ts(m[2] ? m[1] : body)}`;
      if (!m[2]) return head;
      return `${head} · retry ${m[2]}/${m[3]} ${m[4] === "pronto" ? "soon" : `at ${m[4]} UTC`}`;
    },
  },
  { re: /^\+(\d+) nuevas de (\d+) detectadas( \(parcial\))?$/, en: (m) => `+${m[1]} new of ${m[2]} detected${m[3] ? " (partial)" : ""}` },
  { re: /^Cancelado por (.+)\.$/, en: (m, ts) => `Canceled by ${ts(m[1])}.` },
  { re: /^La fuente falló al guardar y se reintentará: (.*)$/, en: (m, ts) => `The source failed while saving and will be retried: ${ts(m[1])}` },
  { re: /^Circuito abierto hasta (.+)\.$/, en: "Circuit open until $1." },
  {
    re: /^Sonda (verde|ambar|rojo): (.+)$/,
    en: (m, ts) => {
      let body = m[2];
      let end = "";
      if (body.endsWith(". Ingesta no arrancada.")) {
        body = body.slice(0, -" Ingesta no arrancada.".length);
        if (body.endsWith("..")) body = body.slice(0, -1);
        end = "Ingestion not started.";
      } else {
        const [rest, cut] = cutSuffix(body, ` ${TRY_ANYWAY}`, 3);
        if (cut) {
          body = rest;
          end = "Trying anyway through the access routes.";
        }
      }
      let text = ts(body);
      if (text === body && body.endsWith(".")) {
        const bare = ts(body.slice(0, -1));
        if (bare !== body.slice(0, -1)) text = bare;
      }
      return `Probe ${PROBE_COLOR[m[1]]}: ${end ? `${period(text)} ${end}` : text}`;
    },
  },
  { re: /^No hay adaptador registrado para '(.+)'\.$/, en: "No adapter is registered for '$1'." },
  { re: /^Consultando la API \((.+)\)$/, en: (m, ts) => `Querying the API (${ts(m[1])})` },
  { re: /^API respondió: (\d+) registro\(s\)$/, en: "API responded: $1 record(s)" },
  { re: /^Guardando hasta (\d+) registro\(s\)$/, en: "Saving up to $1 record(s)" },
  { re: /^(\d+) registro\(s\)$/, en: "$1 record(s)" },

  // --- scraper.py: recorrido y extracción
  { re: /^(\d+) caracteres extraidos$/, en: "$1 characters extracted" },
  {
    re: /^Abriendo (\d+) ([a-z ]+?)\(s\) a la vez: (.*)$/,
    en: (m) => `Opening ${m[1]} ${pick(ROLE_PAGE, m[2])}(s) at once: ${m[3]}`,
  },
  { re: /^Abriendo ([a-z ]+?): (.*)$/, en: (m) => `Opening ${pick(ROLE_PAGE, m[1])}: ${m[2]}` },
  { re: /^(\d+) URL\(s\) de entrada de la matriz EH$/, en: "$1 entry URL(s) from the HS matrix" },
  {
    re: /^(\d+) fichas internas candidatas(?:; (\d+) coinciden con la ruta de acceso)?$/,
    en: (m) => `${m[1]} candidate internal detail pages${m[2] != null ? `; ${m[2]} match the access path` : ""}`,
  },
  {
    re: /^(\d+) pagina\(s\) \((.*?)\), (\d+) caracteres$/,
    en: (m) =>
      `${m[1]} page(s) (${m[2]
        .split(", ")
        .map((part) => part.replace(/^(\d+) (\w+)$/, (_, n, role) => `${n} ${pick(ROLE_SHORT, role)}`))
        .map((part) => pick(ROLE_SHORT, part))
        .join(", ")}), ${m[3]} characters`,
  },
  { re: /^(\d+) item\(s\) pertinentes del canal$/, en: "$1 relevant item(s) from the feed" },
  { re: /^(\d+) item\(s\) del canal$/, en: "$1 item(s) from the feed" },
  {
    re: /^IA leyendo (\d+) página\(s\) para extraer señales( con OCR)?$/,
    en: (m) => `AI reading ${m[1]} page(s) to extract signals${m[2] ? " with OCR" : ""}`,
  },
  {
    re: /^(?:(\d+) senales estructuradas|sin senales nuevas)(?:; (\d+) enlace\(s\) heuristico\(s\) descartados)?(?:; (\d+) de la IA descartadas por no estar en el texto visitado)?$/,
    en: (m) =>
      (m[1] != null ? `${m[1]} structured signals` : "no new signals") +
      (m[2] != null ? `; ${m[2]} heuristic link(s) discarded` : "") +
      (m[3] != null ? `; ${m[3]} from the AI discarded because they are not in the visited text` : ""),
  },
  { re: /^Accediendo a (.+)$/, en: "Accessing $1" },
  { re: /^Probando ruta de respaldo (.+)$/, en: "Trying fallback route $1" },
  {
    re: /^No se pudo entrar a la fuente(?: \(HTTP (\d+)\))?\.(?: Rutas probadas: (.+?)\.?)?$/,
    en: (m) => {
      const head = `The source could not be accessed${m[1] ? ` (HTTP ${m[1]})` : ""}.`;
      if (!m[2]) return head;
      const tried = m[2].split("; ").map((part) => {
        const at = part.indexOf(": ");
        if (at === -1) return pick(ROUTE_LABEL, part);
        return `${pick(ROUTE_LABEL, part.slice(0, at))}: ${pick(ROUTE_STATUS, part.slice(at + 2))}`;
      });
      return `${head} Routes tried: ${tried.join("; ")}.`;
    },
  },
  { re: /^Documento PDF descargado \(HTTP (\d+)\)$/, en: "PDF document downloaded (HTTP $1)" },
  { re: /^Deduplicando y guardando (\d+) candidato\(s\)$/, en: "Deduplicating and saving $1 candidate(s)" },
  {
    re: /^(\d+) items detectados, (\d+) nuevos\.(?: (\d+) con enlace corregido a la página exacta\.)?(?: (\d+) página\(s\) visitadas\.)?(?: Vía (.+?)\.)?(?: (\d+) ms\.)?$/,
    en: (m, ts) =>
      `${m[1]} items detected, ${m[2]} new.` +
      (m[3] != null ? ` ${m[3]} with the link corrected to the exact page.` : "") +
      (m[4] != null ? ` ${m[4]} page(s) visited.` : "") +
      (m[5] != null ? ` Via ${ts(m[5])}.` : "") +
      (m[6] != null ? ` ${m[6]} ms.` : ""),
  },
  { re: /^Error de red: (.*)$/, en: "Network error: $1" },
  { re: /^Error inesperado: (.*)$/, en: "Unexpected error: $1" },
  { re: /^Error al procesar: (.*)$/, en: "Processing error: $1" },
  { re: /^El servidor respondió HTTP (\d+)\.$/, en: "The server responded HTTP $1." },
  {
    re: /^PDF procesado \((\d+) bytes\)\. Se creará 1 hallazgo con el resumen del documento\.$/,
    en: "PDF processed ($1 bytes). 1 finding will be created with the document summary.",
  },
  {
    re: /^Se visitaron (\d+) página\(s\) y se detectaron (\d+) hallazgos potenciales\.$/,
    en: "$1 page(s) were visited and $2 potential findings were detected.",
  },

  // --- scan_progress.py
  { re: /^Página (\d+)(?: de ~(\d+))?: (.*)$/, en: (m) => `Page ${m[1]}${m[2] ? ` of ~${m[2]}` : ""}: ${m[3]}` },

  // --- scan_eta.py
  {
    re: /^(\d+) de (\d+) fuente\(s\) por procesar tienen historial propio en este servidor; (?:según (\d+) fuente\(s\) ya terminadas, hoy va (más lento|más rápido|a su ritmo habitual) \(×([\d.,]+)\)|la velocidad se ajusta en cuanto terminen las primeras fuentes)\.$/,
    en: (m) =>
      `${m[1]} of the ${m[2]} source(s) still to be processed have their own history on this server; ` +
      (m[3] != null
        ? `based on ${m[3]} source(s) already finished, today it is running ${PACE[m[4]]} (×${m[5]}).`
        : "the speed is adjusted as soon as the first sources finish."),
  },

  // --- scheduler_service.py
  {
    re: /^(\d+) fuente\(s\) procesadas: (\d+) señal\(es\) nuevas de (\d+) detectadas(?:; (\d+) con error)?(?:; no se pudo entrar a (\d+))?\.?$/,
    en: (m) =>
      `${m[1]} source(s) processed: ${m[2]} new signal(s) of ${m[3]} detected` +
      (m[4] != null ? `; ${m[4]} with errors` : "") +
      (m[5] != null ? `; ${m[5]} could not be accessed` : "") +
      ".",
  },
  { re: /^No se pudo encolar la vigilancia: (.*)$/, en: "The surveillance run could not be queued: $1" },
  {
    re: /^(\d+) fuente\(s\) encoladas; el worker las procesa en segundo plano\.$/,
    en: "$1 source(s) queued; the worker processes them in the background.",
  },
  { re: /^El barrido falló: (.*)$/, en: "The sweep failed: $1" },
  {
    re: /^Barrido sobre (.+): (\d+) pares sobre el umbral, (\d+) propuesta\(s\) nueva\(s\), (\d+) pendiente\(s\) de revisión\.$/,
    en: (m) => `Sweep over ${sweepScope(m[1])}: ${m[2]} pairs above the threshold, ${m[3]} new proposal(s), ${m[4]} pending review.`,
  },
  { re: /^(\d+) propuesta\(s\) de fusión nuevas por revisar$/, en: "$1 new merge proposal(s) to review" },
  {
    re: /^El barrido de duplicados encontró (\d+) par\(es\) nuevos en (.+)\. Revise y confirme o descarte cada propuesta en Filtrado y depuración > Duplicados\.$/,
    en: (m) =>
      `The duplicate sweep found ${m[1]} new pair(s) in ${sweepScope(m[2])}. Review and confirm or discard each proposal in Screening and clean-up > Duplicates.`,
  },
  { re: /^(\d+) señal\(es\) nuevas en la bandeja de entrada$/, en: "$1 new signal(s) in the inbox" },
  {
    re: /^La vigilancia (manual|programada) procesó (\d+) fuente\(s\) y dejó (\d+) señal\(es\) nuevas por clasificar en la Bandeja de entrada\.$/,
    en: (m) =>
      `The ${m[1] === "manual" ? "manual" : "scheduled"} surveillance run processed ${m[2]} source(s) and left ${m[3]} new signal(s) to classify in the Inbox.`,
  },
  { re: /^Fuente (\d+)$/, en: "Source $1" },
  { re: /^Tarea desconocida: (.*)$/, en: "Unknown task: $1" },

  // --- probe_service.py
  {
    re: new RegExp(`^La portada no responde \\((\\w+)\\); el escaneo usa ${ROUTE_RE}\\.$`),
    en: (m) => `The home page does not respond (${m[1]}); the scan uses ${ROUTE_USED(m[2])}.`,
  },
  {
    re: /^La portada rechaza al cliente básico \(HTTP (\d+)\); el escaneo entra con el cliente compatible con navegador\.$/,
    en: "The home page rejects the basic client (HTTP $1); the scan gets in with the browser-compatible client.",
  },
  {
    re: new RegExp(
      `^La dirección principal ya no existe \\(HTTP (\\d+)\\); mientras tanto el escaneo usa ${ROUTE_RE}\\.(?: Actualice la URL de la fuente\\.| A[a-zA-Z ]*)?$`
    ),
    en: (m) => `The main address no longer exists (HTTP ${m[1]}); meanwhile the scan uses ${ROUTE_USED(m[2])}. Update the source's URL.`,
  },
  {
    re: new RegExp(`^La portada responde HTTP (\\d+) \\(bloqueo anti-robot\\); el escaneo usa ${ROUTE_RE}\\.$`),
    en: (m) => `The home page responds HTTP ${m[1]} (anti-bot block); the scan uses ${ROUTE_USED(m[2])}.`,
  },
  {
    re: /^Fuente de consulta manual: el sitio está en línea \(HTTP (\d+) al acceso automático, esperado\)\.(?: Se consulta con usuario en el navegador\.| S[a-z ]*)?$/,
    en: "Manual-consultation source: the site is online (HTTP $1 to automated access, as expected). A user consults it in the browser.",
  },
  {
    re: /^HTTP (\d+) \(se esperaba (\d+)\)\.(?: (.+))?$/,
    en: (m, ts) => `HTTP ${m[1]} (expected ${m[2]}).${m[3] ? ` ${tails(m[3], PROBE_TAILS, ts)}` : ""}`,
  },
  { re: /^Responde pero falta la ruta (.+)\.$/, en: "It responds but the path $1 is missing." },
  { re: /^No responde: (.*)$/, en: "Not responding: $1" },
  { re: /^Alcance desconocido: (.*)$/, en: "Unknown scope: $1" },
  { re: /^Error de la sonda: (.*)$/, en: "Probe error: $1" },
  { re: /^robots\.txt inaccesible: (.*)$/, en: "robots.txt unreachable: $1" },

  // --- link_matrix.py
  {
    re: /^La celda URL no trae una URL válida: (.*)$/,
    en: (m) => `The URL cell does not contain a valid URL: ${m[1] === "(vacía)" ? "(empty)" : m[1]}`,
  },
  { re: /^El ID (\S+) ya está en la fila (\d+)\.$/, en: "ID $1 is already in row $2." },
  {
    re: /^La URL ya está en el ID (\S+) \(fila (\d+)\); se carga una sola vez\.$/,
    en: "The URL is already under ID $1 (row $2); it is loaded only once.",
  },
  {
    re: /^Tipo de tecnología no reconocido: (.*)$/,
    en: (m) => `Unrecognized technology type: ${m[1] === "(vacío)" ? "(empty)" : m[1]}`,
  },
  { re: /^MATRIZ_FUENTES_ESCANEO_EH ID (\S+) \(fila (\d+)\)$/, en: "MATRIZ_FUENTES_ESCANEO_EH ID $1 (row $2)" },
  { re: /^Matriz de escaneo EH, ID (\S+) \((.*)\)$/, en: "HS scanning matrix, ID $1 ($2)" },
  {
    re: /^(Ya no está en la matriz de escaneo por enlace\.|Retirada al cargar la matriz de escaneo por enlace \(17-11-2026\)\. Sus señales se conservan en la bandeja Legacy\.) (.+)$/,
    en: (m, ts) => `${ts(m[1])} ${ts(m[2])}`,
  },
  {
    re: /^(Consulta activa \(SI EAA\)|Información general \/ metodológica), N° original (.+?) de (.+)$/,
    en: catalogNote,
  },
  ...NOTE_REASONS.slice(0, 2).map(([re]) => ({ re, en: (m, ts) => chain(m.input, NOTE_REASONS, ts) })),
  { re: /^Consulta manual: (.*)$/, en: "Manual consultation: $1" },

  // --- web_search.py, sitemap_search.py y source_discovery.py
  { re: /^(\d+) resultado\(s\), ninguno de (.+)$/, en: "$1 result(s), none from $2" },
  { re: /^(\d+) resultado\(s\) del dominio · (.*)$/, en: (m) => `${m[1]} result(s) from the domain · ${engines(m[2])}` },
  { re: /^(\d+) resultado\(s\)$/, en: "$1 result(s)" },
  { re: /^«(.*)»: (\d+) resultado\(s\) · (.*)$/, en: (m) => `“${m[1]}”: ${m[2]} result(s) · ${engines(m[3])}` },
  { re: /^Redactando consultas de búsqueda para (.+)$/, en: "Writing search queries for $1" },
  {
    re: /^(\d+) consulta\(s\) redactadas por (la IA|reglas)$/,
    en: (m) => `${m[1]} search query(ies) written by ${m[2] === "la IA" ? "the AI" : "rules"}`,
  },
  { re: /^Consulta (\d+)\/(\d+): (.*)$/, en: "Query $1/$2: $3" },
  { re: /^No se consultó ningún buscador: (.*)$/, en: (m, ts) => `No search engine was queried: ${ts(pick(SKIP_REASON, m[1]))}` },
  { re: /^Leyendo el mapa del sitio de (.+)$/, en: "Reading the sitemap of $1" },
  { re: /^mapa del sitio de (.+)$/, en: "sitemap of $1" },
  { re: /^(\d+) página\(s\) del mapa del sitio · (.*)$/, en: (m, ts) => `${m[1]} page(s) from the sitemap · ${ts(m[2])}` },
  { re: /^(\d+) página\(s\) del mapa del sitio ·$/, en: "$1 page(s) from the sitemap" },
  {
    re: /^(\d+) página\(s\) tomadas de la base de conocimiento de búsqueda$/,
    en: "$1 page(s) taken from the search knowledge base",
  },
  { re: /^(\d+) mapa\(s\) leídos, (\d+) URL revisadas, (\d+) elegidas$/, en: "$1 sitemap(s) read, $2 URLs checked, $3 selected" },
  { re: /^Mapa del sitio(?: · modificada el (\S+))?$/, en: (m) => `Sitemap${m[1] ? ` · modified on ${m[1]}` : ""}` },
  { re: /^Sin conexión \((.+)\)$/, en: "No connection ($1)" },
  { re: /^HTTP (\d+): responde con acceso restringido$/, en: "HTTP $1: responds with restricted access" },

  // --- source_import.py
  { re: /^No se pudo descargar la hoja de Google Sheets \((.+)\)\.$/, en: "The Google Sheets sheet could not be downloaded ($1)." },
  { re: /^Google Sheets respondió HTTP (\d+)\.$/, en: "Google Sheets responded HTTP $1." },
  {
    re: /^La IA revisó (\d+) de (\d+) fuente\(s\) nueva\(s\)\.(?: Las (\d+) restantes quedan por reglas\.)?$/,
    en: (m) => `The AI reviewed ${m[1]} of ${m[2]} new source(s).${m[3] != null ? ` The remaining ${m[3]} stay rule-based.` : ""}`,
  },
  {
    re: /^Creada al importar la matriz EH \((.*?)\)\. Detección sugerida \((\w+)\): ([^.]+)\.(?: (.*))?$/,
    en: (m, ts) =>
      `Created when importing the HS matrix (${m[1]}). Suggested detection (${pick({ reglas: "rules", ia: "AI" }, m[2])}): ${ts(m[3])}.` +
      (m[4] ? ` ${chain(m[4], RATIONALE, ts)}` : ""),
  },
  ...RATIONALE.map(([re]) => ({ re, en: (m, ts) => chain(m.input, RATIONALE, ts) })),
  { re: /^(.+): sin URL válida$/, en: "$1: no valid URL" },
  { re: /^(.+): ya existe una fuente con esa URL$/, en: "$1: a source with that URL already exists" },
  { re: /^Matriz EH \((.*)\)$/, en: (m, ts) => `HS matrix (${ts(m[1])})` },

  // --- source_matrix.py
  {
    re: /^La celda repite (\d+) URL: (.+)\. Se carga una sola vez cada una\.$/,
    en: "The cell repeats $1 URL(s): $2. Each one is loaded only once.",
  },
  {
    re: /^Cant URL SI EAA declara (\d+) y la celda lista (\d+) URL(?: \((\d+) distintas\))?\.$/,
    en: (m) => `Cant URL SI EAA declares ${m[1]} and the cell lists ${m[2]} URL(s)${m[3] != null ? ` (${m[3]} distinct)` : ""}.`,
  },
  { re: /^MATRIZ FI EH fila (\d+)$/, en: "MATRIZ FI EH row $1" },
  { re: /^No se pudo abrir el Excel de la matriz: (.*)$/, en: "The matrix Excel file could not be opened: $1" },

  // --- source_profile.py: validaciones
  { re: /^Cada opción de '(.+)' debe ser un objeto con valor y etiqueta\.$/, en: "Each option in '$1' must be an object with a value and a label." },
  {
    re: /^El código '(.*)' de tipo de tecnología debe tener de 2 a 12 letras o números en mayúscula\.$/,
    en: "The technology type code '$1' must have 2 to 12 uppercase letters or numbers.",
  },
  {
    re: /^El código de origen '(.*)' solo admite letras, números, guion y guion bajo\.$/,
    en: "The origin code '$1' accepts only letters, numbers, hyphens and underscores.",
  },
  {
    re: /^El valor '(.*)' de '(.+)' debe tener de 2 a 40 letras minúsculas, números o '_'\.$/,
    en: "The value '$1' in '$2' must have 2 to 40 lowercase letters, numbers or '_'.",
  },
  { re: /^La opción '(.*)' necesita una etiqueta visible\.$/, en: "The option '$1' needs a visible label." },
  { re: /^La lista '(.+)' debe tener al menos una opción\.$/, en: "The list '$1' must have at least one option." },
  { re: /^La lista '(.+)' tiene valores repetidos\.$/, en: "The list '$1' has repeated values." },
  {
    re: /^Las URLs deben iniciar con http:\/\/ o https:\/\/ \(revise: (.*)\)\.$/,
    en: "URLs must start with http:// or https:// (check: $1).",
  },
  { re: /^'(.+)' debe ser un número entero\.$/, en: "'$1' must be a whole number." },
  { re: /^'(.+)' debe estar entre (\S+) y (\S+)\.$/, en: "'$1' must be between $2 and $3." },

  // --- reliability_service.py
  { re: /^Dominio institucional \((.+)\)\.$/, en: "Institutional domain ($1)." },
  { re: /^Pertenece al sitio de la fuente \((.+)\)\.$/, en: "It belongs to the source's site ($1)." },
  {
    re: /^Dominio (.+) distinto al de la fuente: confirme quién publica\.$/,
    en: (m) => `Domain ${m[1] === "desconocido" ? "unknown" : m[1]}, different from the source's: confirm who publishes it.`,
  },
  {
    re: /^El sitio bloquea la consulta automática \(HTTP (\d+)\): ábrala en el navegador\.$/,
    en: "The site blocks automated queries (HTTP $1): open it in the browser.",
  },
  { re: /^No se pudo abrir \((.+)\)\.$/, en: (m) => `It could not be opened (${m[1] === "sin respuesta" ? "no response" : m[1]}).` },
  {
    re: /^La IA propuso (\d+)\/100; se limitó a (\d+) porque solo puede subir hasta (\d+) puntos sobre la base verificable \((\d+)\)\.$/,
    en: "The AI proposed $1/100; it was capped at $2 because it can raise the score by at most $3 points above the verifiable baseline ($4).",
  },
  {
    re: /^La señal cumple (\d+) de (\d+) chequeos de origen y trazabilidad\.$/,
    en: "The signal passes $1 of $2 origin and traceability checks.",
  },
  {
    re: /^Hay (\d+) chequeo\(s\) a favor y (\d+) en contra: confirme el origen antes de priorizar\.$/,
    en: "There are $1 check(s) in favor and $2 against: confirm the origin before prioritizing.",
  },
  {
    re: /^Falla en (\d+) chequeo\(s\) clave de origen o trazabilidad: no la use sin verificar\.$/,
    en: "It fails $1 key origin or traceability check(s): do not use it without verifying.",
  },
  { re: new RegExp(`^(${CHECK_LABELS}): (.+)$`), en: (m, ts) => `${ts(m[1])}: ${ts(m[2])}` },
  {
    re: /^(?:.+; )?(?:registro INVIMA .+|id en .+: .+)$/,
    en: (m) =>
      m[0]
        .split("; ")
        .map((part) =>
          part
            .replace(/^registro INVIMA /, "INVIMA registration ")
            .replace(/^id en la fuente: /, "ID in the source: ")
            .replace(/^id en (.+?): /, "ID in $1: ")
        )
        .join("; "),
  },
  {
    re: /^(?:.+; )?fin de fase III \d{4}-\d\d-\d\d(?:; .+)?$/,
    en: (m) => m[0].replace(/(^|; )fin de fase III /, "$1end of phase III "),
  },
  {
    re: /^(.+) \((agencia regulatoria|agencia de evaluación de tecnologías|registro de ensayos clínicos|literatura científica|fabricante|oficina de patentes)?(?:, )?(?:nivel ([A-E]) \(([^)]+)\))?\)$/,
    en: (m) => {
      const bits = [];
      if (m[2]) bits.push(ENTITY[m[2]]);
      if (m[3]) bits.push(`level ${m[3]} (${pick(LEVEL, m[4])})`);
      return bits.length ? `${m[1]} (${bits.join(", ")})` : m[0];
    },
  },

  // --- ingest/base.py: errores de red de los adaptadores
  { re: /^Red inaccesible tras (\d+) intentos\. (.*)$/, en: (m, ts) => `Network unreachable after ${m[1]} attempts. ${ts(m[2])}` },
  { re: /^(HTTP \d+) tras (\d+) intentos$/, en: "$1 after $2 attempts" },
  { re: /^(?:(\w+): )?Descarga de (\S+) supero el tiempo total$/, en: (m) => `${m[1] ? `${m[1]}: ` : ""}Download of ${m[2]} exceeded the total time` },
  { re: /^Respuesta no interpretable como JSON: (.*)$/, en: "The response could not be parsed as JSON: $1" },

  // --- ingest/*.py: resultado de cada adaptador
  {
    re: /^(\d+) estudios de (\S+) disponibles\.(?: Hay más páginas; el cursor queda persistido\.)?$/,
    en: (m) =>
      `${m[1]} studies of ${m[2] === "n/d" ? "n/a" : m[2]} available.${m[0].includes("Hay más páginas") ? " There are more pages; the cursor is saved." : ""}`,
  },
  {
    re: /^El esquema de CTIS cambió \(esperado (.*?), observado (.*?)\)\.(?: Ingesta suspendida para no persistir basura\.)?$/,
    en: "The CTIS schema changed (expected $1, observed $2). Ingestion suspended so that bad data is not stored.",
  },
  {
    re: /^CTIS no respondió con un JSON utilizable \((.*)\)\. Entregue un lote en connector_config\.records o revise el portal\.$/,
    en: "CTIS did not respond with usable JSON ($1). Provide a batch in connector_config.records or check the portal.",
  },
  { re: /^(\d+) ensayos del portal CTIS\.$/, en: "$1 trials from the CTIS portal." },
  { re: /^(\d+) ensayos CTIS desde (.+)\.$/, en: (m, ts) => `${m[1]} CTIS trials from ${m[2] === "lote local" ? "a local batch" : ts(m[2])}.` },
  { re: /^(\d+) medicamentos EMA desde lote local\.$/, en: "$1 EMA medicines from a local batch." },
  {
    re: /^(\d+) medicamentos de uso humano del reporte oficial de la EMA \(de (\d+) vigentes\)\.$/,
    en: "$1 medicines for human use from the official EMA report (of $2 current).",
  },
  { re: /^(\d+) medicamentos de la tabla descargable de la EMA\.$/, en: "$1 medicines from the downloadable EMA table." },
  { re: /^(\d+) items del canal RSS de la EMA \(contingencia\)\.$/, en: "$1 items from the EMA RSS feed (contingency)." },
  { re: /^RSS de la EMA no interpretable: (.*)$/, en: "The EMA RSS could not be parsed: $1" },
  { re: /^(\d+) filas cargadas desde lote local\.$/, en: "$1 rows loaded from a local batch." },
  { re: /^(\d+) filas del archivo estructurado\.$/, en: "$1 rows from the structured file." },
  { re: /^(\d+) registros de fixture\.$/, en: "$1 fixture records." },
  { re: /^(\d+) dispositivos activos de Health Canada MDALL\.$/, en: "$1 active devices from Health Canada MDALL." },
  {
    re: /^(\d+) licencias recientes de dispositivos clase III-IV \(Health Canada MDALL\)\.$/,
    en: "$1 recent class III-IV device licences (Health Canada MDALL).",
  },
  {
    re: /^(\d+) productos recientes de uso humano de Health Canada DPD\.$/,
    en: "$1 recent products for human use from Health Canada DPD.",
  },
  { re: /^(\d+) registros de curaduría cargados a mano\.$/, en: "$1 curation records loaded by hand." },
  { re: /^(\d+) fichas PCORI desde lote local\.$/, en: "$1 PCORI fact sheets from a local batch." },
  { re: /^(\d+) fichas de PCORI\.$/, en: "$1 PCORI fact sheets." },
  { re: /^(\d+) fichas extraídas de la portada de PCORI\.$/, en: "$1 fact sheets extracted from the PCORI home page." },
  { re: /^(\d+) fichas activas de PCORI \(de (\d+)\)\.$/, en: "$1 active PCORI fact sheets (of $2)." },
  { re: /^(\d+) artículos de PubMed\.$/, en: "$1 PubMed articles." },
  { re: /^(\d+) registros ICTRP cargados desde lote local\.$/, en: "$1 ICTRP records loaded from a local batch." },
  { re: /^(\d+) estudios del espejo ICTRP\.$/, en: "$1 studies from the ICTRP mirror." },

  // --- genéricos (al final): «Ruta · HTTP 200» y la copia «[adaptador] mensaje» de scrape_logs
  { re: /^(.+) · HTTP (\d+)$/, en: (m, ts) => `${ts(m[1])} · HTTP ${m[2]}` },
  { re: /^\[([\w.-]+)\] (.+)$/, en: (m, ts) => `[${m[1]}] ${ts(m[2])}` },
];

function sweepScope(text) {
  if (text === "todo el acervo (no hay ciclo abierto)") return "the entire collection (there is no open cycle)";
  const m = /^el ciclo (.+)$/.exec(text);
  return m ? `cycle ${m[1]}` : text;
}
