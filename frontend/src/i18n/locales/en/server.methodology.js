// Textos del servidor: catálogos metodológicos (backend/app/methodology.py, evaluation.py, ttm.py,
// product_details.py) y catálogo de fuentes (catalog.py, catalog_service.py).
// Las llaves son el español exacto que produce el backend (los catálogos sembrados van sin tildes).

const MATRIX = "HS matrix";

// "MATRIZ FI EH fila 12" es el nombre de la hoja de Excel y su fila; "matriz EH" es el nombre genérico.
function matrixRef(ref) {
  if (ref === "matriz EH") return MATRIX;
  return ref.replace(/\bfila (\d+)\b/, "row $1");
}

export default {
  // ---------------------------------------------------------------- methodology.py: estados
  "En configuración": "In setup",
  "En filtrado": "In screening",
  "En priorización": "In prioritization",
  "En evaluación": "In assessment",
  "Cerrado / consolidado": "Closed / consolidated",
  "Capturada / no asignada": "Captured / unassigned",
  "Asignada al ciclo": "Assigned to the cycle",
  "Filtrada / apta para priorización": "Screened / eligible for prioritization",
  "Excluida": "Excluded",
  "Priorizada": "Prioritized",
  "Bajo vigilancia": "Under surveillance",
  "No priorizada": "Not prioritized",
  "Publicada": "Published",
  "Emergente - en fases clínicas avanzadas (II o III), previa a aprobación":
    "Emerging - in advanced clinical phases (II or III), before approval",
  "Nueva - aprobada en agencia de referencia hace 12 meses o menos, sin adopción en el SGSSS":
    "New - approved by a reference agency 12 months ago or less, not yet adopted in the SGSSS",

  // Motivos de exclusión
  "Ya disponible en el país con registro sanitario vigente":
    "Already available in the country with a valid marketing authorization",
  "Modificación menor de una tecnología existente": "Minor modification of an existing technology",
  "Genérico o biosimilar convencional sin innovación": "Conventional generic or biosimilar with no innovation",
  "Duplicada de otro registro del ciclo": "Duplicate of another record in the cycle",
  "Fuera del alcance de tecnología sanitaria": "Outside the scope of health technology",
  "Evidencia insuficiente para caracterizar la señal": "Insufficient evidence to characterize the signal",

  // Vías de novedad
  "No disponible en el país: sin registro sanitario vigente ante el INVIMA":
    "Not available in the country: no valid marketing authorization with INVIMA",
  "Nueva indicación terapéutica de una tecnología ya registrada":
    "New therapeutic indication for an already registered technology",
  "Nueva forma farmacéutica o vía de administración con carácter disruptivo":
    "New dosage form or route of administration of a disruptive nature",
  "Nueva combinación de principios activos o de tecnologías ya existentes":
    "New combination of active ingredients or of existing technologies",

  // ---------------------------------------------------------------- methodology.py: clústeres
  "Cancer": "Cancer",
  "Neoplasias malignas y sus tecnologias asociadas de diagnostico y tratamiento.":
    "Malignant neoplasms and their associated diagnostic and treatment technologies.",
  "Enfermedades de alto costo": "High-cost diseases",
  "Patologias de alto impacto financiero para el SGSSS segun la Cuenta de Alto Costo.":
    "Conditions with a high financial impact on the SGSSS according to the Cuenta de Alto Costo.",
  "Enfermedades huerfanas o raras": "Orphan or rare diseases",
  "Condiciones de baja prevalencia reconocidas como huerfanas en Colombia.":
    "Low-prevalence conditions recognized as orphan diseases in Colombia.",
  "Covid-19 y otras infecciosas emergentes": "Covid-19 and other emerging infectious diseases",
  "Enfermedades infecciosas emergentes y reemergentes de interes en salud publica.":
    "Emerging and re-emerging infectious diseases of public health interest.",
  "Enfermedades prevalentes": "Prevalent diseases",
  "Condiciones cronicas de alta prevalencia: cardiovasculares, metabolicas y mentales.":
    "High-prevalence chronic conditions: cardiovascular, metabolic and mental.",
  "Otras categorias sanitarias prioritarias": "Other priority health categories",
  "Salud materna e infantil, salud sexual y reproductiva y demas prioridades sanitarias.":
    "Maternal and child health, sexual and reproductive health and other health priorities.",

  // ---------------------------------------------------------------- methodology.py: tipologías
  "Medicamento quimico o biologico": "Chemical or biological medicine",
  "Moleculas pequenas, biologicos y biosimilares.": "Small molecules, biologics and biosimilars.",
  "Terapias avanzadas y genicas": "Advanced and gene therapies",
  "Terapia genica, celular, CAR-T e ingenieria de tejidos.": "Gene therapy, cell therapy, CAR-T and tissue engineering.",
  "Dispositivos medicos": "Medical devices",
  "Equipos, implantes e insumos de uso clinico.": "Equipment, implants and supplies for clinical use.",
  "Equipos y reactivos de diagnostico in vitro": "In vitro diagnostic equipment and reagents",
  "Pruebas diagnosticas, reactivos y plataformas de laboratorio.":
    "Diagnostic tests, reagents and laboratory platforms.",
  "Procedimientos quirurgicos y nuevas tecnicas clinicas": "Surgical procedures and new clinical techniques",
  "Tecnicas quirurgicas, intervencionismo y procedimientos clinicos nuevos.":
    "Surgical techniques, interventional procedures and new clinical procedures.",
  "Salud digital": "Digital health",
  "Telesalud, aplicaciones terapeuticas y monitoreo remoto.": "Telehealth, therapeutic apps and remote monitoring.",
  "Algoritmos y sistemas de inteligencia artificial": "Artificial intelligence algorithms and systems",
  "Modelos de aprendizaje automatico y sistemas de apoyo a la decision clinica.":
    "Machine learning models and clinical decision support systems.",

  // ---------------------------------------------------------------- methodology.py: matriz P1-P6
  "Novedad en el pais": "Novelty in the country",
  "La tecnologia sanitaria es nueva, es decir, no se encuentra disponible en el pais.":
    "The health technology is new, that is, it is not available in the country.",
  "Relevancia clinica": "Clinical relevance",
  "La condicion a la que se destina es relevante por alta mortalidad, morbilidad o deterioro grave de la calidad de vida.":
    "The condition it targets is relevant because of high mortality, morbidity or severe deterioration in quality of life.",
  "Carga e impacto financiero": "Burden and financial impact",
  "La condicion representa alta carga de enfermedad o impacto financiero sustancial para el SGSSS.":
    "The condition represents a high burden of disease or a substantial financial impact on the SGSSS.",
  "Impacto organizacional": "Organizational impact",
  "Se anticipa un impacto organizacional importante, como cambio de ruta clinica, infraestructura o entrenamiento complejo.":
    "A major organizational impact is expected, such as a change in the clinical pathway, infrastructure or complex training.",
  "Aprobacion en agencia de referencia": "Approval by a reference agency",
  "Ha sido aprobada por agencias de referencia internacional (EMA, FDA) en los ultimos 12 meses o menos.":
    "It has been approved by international reference agencies (EMA, FDA) in the last 12 months or less.",
  "Tramite regulatorio en curso": "Regulatory procedure under way",
  "Esta sometida o bajo proceso formal de evaluacion regulatoria en agencias de referencia, en 6 meses o menos.":
    "It has been submitted to, or is under formal regulatory review by, reference agencies, within 6 months or less.",

  // ---------------------------------------------------------------- methodology.py: parámetros
  "Numero maximo de ciclos formales por ano calendario.": "Maximum number of formal cycles per calendar year.",
  "Duracion minima de la ventana operativa del ciclo, en semanas.":
    "Minimum length of the cycle's operating window, in weeks.",
  "Duracion maxima de la ventana operativa del ciclo, en semanas.":
    "Maximum length of the cycle's operating window, in weeks.",
  "Puntos minimos para clasificar como PRIORIZADA. Regla vigente por conteo de puntos mientras la coordinacion metodologica cierra la decision D-02.":
    "Minimum points to classify as PRIORITIZED. Point-count rule in force until the methodology coordination team settles decision D-02.",
  "Puntos exactos que clasifican como BAJO VIGILANCIA.": "Exact points that classify as UNDER SURVEILLANCE.",
  "Umbral porcentual de referencia que se muestra en la interfaz.":
    "Reference percentage threshold shown in the interface.",
  "Cantidad de criterios de la matriz oficial (denominador de %P).":
    "Number of criteria in the official matrix (denominator of %P).",
  "Similitud minima (%) para proponer la fusion de dos registros. Bajarlo propone mas fusiones y exige mas revision humana.":
    "Minimum similarity (%) to propose merging two records. Lowering it proposes more merges and requires more human review.",
  "Fallos consecutivos de una fuente antes de abrir el cortacircuitos. Un referente caido no puede arrastrar al resto de la corrida.":
    "Consecutive failures of a source before the circuit breaker opens. One source that is down must not drag down the rest of the run.",
  "Horas que permanece abierto el cortacircuitos de una fuente.": "Hours a source's circuit breaker stays open.",
  "Fuentes que el worker rastrea a la vez durante la vigilancia (1 a 8). Más acelera la corrida completa; menos reduce la carga del servidor.":
    "Sources the worker crawls at the same time during surveillance (1 to 8). More speeds up the full run; fewer reduces the server load.",
  "Tope de registros que un conector persiste por corrida.": "Cap on the records a connector stores per run.",
  "Similitud minima (%) para considerar que una tecnologia ya tiene registro sanitario vigente en el indice local del INVIMA.":
    "Minimum similarity (%) to consider that a technology already has a valid marketing authorization in the local INVIMA index.",
  "Puntos minimos de la matriz P1-P6 para sugerir Mini-HTA (D-07/D-09). El nivel se puede sobreescribir por tecnologia sin desplegar.":
    "Minimum points in the P1-P6 matrix to suggest a Mini-HTA (D-07/D-09). The level can be overridden per technology without a deployment.",
  "Puntos minimos para sugerir informe tecnico. Por debajo se sugiere ficha. Decisiones D-07 y D-09 siguen abiertas.":
    "Minimum points to suggest a technical report. Below that, a fact sheet is suggested. Decisions D-07 and D-09 remain open.",
  "Vigencia en dias del token JWT del revisor externo (RF16).":
    "Validity in days of the external reviewer's JWT token (RF16).",
  "Tope en meses para clasificar time-to-market como inminente (D-10).":
    "Limit in months to classify time-to-market as imminent (D-10).",
  "Tope en meses para clasificar time-to-market como transicion (D-10).":
    "Limit in months to classify time-to-market as transition (D-10).",
  "Tope en meses para clasificar time-to-market como emergente (D-10).":
    "Limit in months to classify time-to-market as emerging (D-10).",
  "Dias de revision regulatoria que se suman al cierre de fase III.":
    "Days of regulatory review added to the end of phase III.",
  "Puntos minimos de la matriz para considerar alto riesgo presupuestal (RF20).":
    "Minimum matrix points to consider a technology high budget risk (RF20).",
  "Tokens que senalan un ensayo fase III asociado al pais.":
    "Tokens that indicate a phase III trial associated with the country.",
  "Cribado: puntos si el horizonte de la senal es inminente.": "Screening score: points if the signal's horizon is imminent.",
  "Cribado: puntos si el horizonte es transicional.": "Screening score: points if the horizon is transitional.",
  "Cribado: puntos si el horizonte es emergente.": "Screening score: points if the horizon is emerging.",
  "Cribado: puntos si el tipo de tecnologia esta en la lista de tipos que suman.":
    "Screening score: points if the technology type is in the list of types that score.",
  "Cribado: tipos de tecnologia que suman puntos (separados por coma).":
    "Screening score: technology types that score points (comma-separated).",
  "Cribado: puntos si la senal menciona fase III, aprobacion o un regulador.":
    "Screening score: points if the signal mentions phase III, approval or a regulator.",
  "Cribado: palabras que cuentan como hito regulatorio o fase III (separadas por coma).":
    "Screening score: words that count as a regulatory milestone or phase III (comma-separated).",
  "Cribado: puntos si menciona fase II o ensayo (solo si no sumo el hito regulatorio).":
    "Screening score: points if it mentions phase II or a trial (only if the regulatory milestone did not score).",
  "Cribado: palabras que cuentan como fase II o ensayo (separadas por coma).":
    "Screening score: words that count as phase II or a trial (comma-separated).",
  "Cribado: puntos si la senal tiene area terapeutica.": "Screening score: points if the signal has a therapeutic area.",
  "Cribado: puntos si el resumen es suficientemente largo.": "Screening score: points if the summary is long enough.",
  "Cribado: caracteres minimos del resumen para sumar sus puntos.":
    "Screening score: minimum characters in the summary for it to score its points.",
  "Cribado: puntos si la tecnologia esta identificada aparte del titulo.":
    "Screening score: points if the technology is identified separately from the title.",
  "Cribado: puntaje desde el que una senal se destaca como cribado alto.":
    "Screening score: score from which a signal is highlighted as a high screening score.",
  "Puntos de orden en la bandeja por cada fuente adicional que reporta la misma tecnologia.":
    "Inbox ranking points for each additional source that reports the same technology.",
  "Tope del bono de corroboracion en la bandeja.": "Cap on the corroboration bonus in the inbox.",
  "Minutos maximos que la vigilancia dedica a una fuente. Si se excede, la fuente se cierra con error y la corrida sigue con la siguiente.":
    "Maximum minutes surveillance spends on one source. If exceeded, the source is closed with an error and the run moves on to the next one.",

  // ---------------------------------------------------------------- evaluation.py
  "Ficha técnica": "Technical sheet",
  "Informe de evaluación temprana": "Early assessment report",
  "Borrador en redacción": "Draft in progress",
  "Revisión interna de calidad": "Internal quality review",
  "Revisión externa por pares": "External peer review",
  "Con observaciones": "With comments",
  "Aprobado por comité técnico": "Approved by the technical committee",
  "Publicado": "Published",
  "Condición de salud": "Health condition",
  "Mecanismo biológico o tecnológico": "Biological or technological mechanism",
  "Población objetivo en Colombia": "Target population in Colombia",
  "Estado del arte de la evidencia clínica": "State of the art of the clinical evidence",
  "Comparadores posibles en el SGSSS": "Possible comparators in the SGSSS",
  "Riesgos potenciales de adopción": "Potential adoption risks",
  "Narrativa del informe": "Report narrative",
  "Fases de ensayos y desenlaces": "Trial phases and outcomes",
  "Desenlaces de eficacia": "Efficacy outcomes",
  "Desenlaces de seguridad": "Safety outcomes",
  "PICO: población": "PICO: population",
  "PICO: intervención": "PICO: intervention",
  "PICO: comparador": "PICO: comparator",
  "PICO: desenlace": "PICO: outcome",
  "Impacto presupuestal año 1": "Budget impact year 1",
  "Impacto presupuestal año 2": "Budget impact year 2",
  "Impacto presupuestal año 3": "Budget impact year 3",
  "Incertidumbre clínica": "Clinical uncertainty",
  "Notas de diálogo temprano": "Early dialogue notes",
  "Nota de confidencialidad": "Confidentiality note",

  // ---------------------------------------------------------------- ttm.py
  "Inminente": "Imminent",
  "Transición": "Transition",
  "Emergente": "Emerging",
  "Lejano": "Distant",
  "Sin dato suficiente": "Not enough data",
  "Aprobación FDA/EMA": "FDA/EMA approval",
  "Registro INVIMA vigente": "Valid INVIMA registration",
  "Fin de fase III + revisión regulatoria": "End of phase III + regulatory review",
  "Sin fecha de fase III ni aprobación": "No phase III or approval date",

  // ---------------------------------------------------------------- product_details.py
  "Jeringa o pluma prellenada": "Pre-filled syringe or pen",
  "Solución inyectable": "Solution for injection",
  "Polvo para solución": "Powder for solution",
  "Concentrado para infusión": "Concentrate for infusion",
  "Tableta recubierta": "Film-coated tablet",
  "Liberación prolongada": "Extended release",
  "Tableta": "Tablet",
  "Cápsula": "Capsule",
  "Solución oral": "Oral solution",
  "Suspensión oral": "Oral suspension",
  "Inhalador": "Inhaler",
  "Aerosol nasal": "Nasal spray",
  "Solución oftálmica": "Ophthalmic solution",
  "Parche transdérmico": "Transdermal patch",
  "Crema": "Cream",
  "Ungüento": "Ointment",
  "Inyectable": "Injectable",
  "Infusión": "Infusion",
  "Vacuna": "Vaccine",
  "Solución": "Solution",
  "Suspensión": "Suspension",
  "Polvo": "Powder",
  "Líquido": "Liquid",
  "Subcutánea": "Subcutaneous",
  "Intravenosa": "Intravenous",
  "Intravítrea": "Intravitreal",
  "Intratecal": "Intrathecal",
  "Tópica": "Topical",
  "Inhalada": "Inhaled",
  "Transdérmica": "Transdermal",
  "Oftálmica": "Ophthalmic",

  // ---------------------------------------------------------------- catalog.py: bloques y tipos
  "Registros de ensayos clinicos": "Clinical trial registries",
  "Agencias regulatorias": "Regulatory agencies",
  "Agencias de HTA y redes de EH": "HTA agencies and HS networks",
  "Literatura y organismos internacionales": "Literature and international organizations",
  "Fabricantes de I+D": "R&D manufacturers",
  "Revistas y portales de noticias": "Journals and news portals",
  "Registro de ensayos": "Trial registry",
  "Agencia regulatoria": "Regulatory agency",
  "Organismo HTA / red": "HTA body / network",
  "Literatura": "Literature",
  "Fabricante de I+D": "R&D manufacturer",
  "Revista / portal de noticias": "Journal / news portal",
  "Base de patentes": "Patent database",
  "Activo": "Active",
  "Retirada del ciclo de ingesta": "Withdrawn from the ingestion cycle",
  "Curaduria humana": "Human curation",
  "API REST": "REST API",
  "Descarga estructurada": "Structured download",
  "JSON de portal": "Portal JSON",
  "Pagina / PDF": "Page / PDF",
  "Sitio web": "Website",
  "Portal / lote": "Portal / batch",
  "JSON de portal (no contractual)": "Portal JSON (non-contractual)",
  "Pagina web": "Web page",
  "XLSX / descarga": "XLSX / download",
  "PDF / CSV irregular": "PDF / irregular CSV",
  "JSON de portal / HTML": "Portal JSON / HTML",

  // Idiomas y países del catálogo
  "Ingles": "English",
  "Inglés": "English",
  "Aleman / Ingles": "German / English",
  "Espanol": "Spanish",
  "Portugues": "Portuguese",
  "Internacional": "International",
  "EE. UU.": "USA",
  "Union Europea": "European Union",
  "Reino Unido": "United Kingdom",
  "Japon": "Japan",
  "Singapur": "Singapore",
  "Alemania": "Germany",
  "Austria / Union Europea": "Austria / European Union",
  "Belgica / BeNeLuxA": "Belgium / BeNeLuxA",
  "Paises Bajos": "Netherlands",
  "Suiza": "Switzerland",
  "Francia": "France",
  "Corea del Sur": "South Korea",
  "Italia": "Italy",
  "Espana": "Spain",
  "Australia / Nueva Zelanda": "Australia / New Zealand",
  "Brasil": "Brazil",

  // ---------------------------------------------------------------- catalog.py: fichas de las fuentes
  "Registro de ensayos clinicos. API v2 publica sin autenticacion. Filtra fases II, III y IV; pagina por cursor (pageToken).":
    "Clinical trial registry. Public v2 API with no authentication. Filters phases II, III and IV; cursor-based paging (pageToken).",
  "Fuente primaria de horizonte temprano, NCT, patrocinador y fecha de fase III":
    "Primary source for early horizon, NCT, sponsor and phase III date",
  "Registro internacional de ensayos. No hay REST publico: lote semanal CSV/XML o espejo institucional. Los terminos aplican a cualquier formato.":
    "International trial registry. There is no public REST API: weekly CSV/XML batch or institutional mirror. The terms apply to any format.",
  "Cobertura fuera de ClinicalTrials.gov; clave de dedup = TRN": "Coverage beyond ClinicalTrials.gov; dedup key = TRN",
  "Requiere aceptacion formal de terminos (P2-2). Sin lote o espejo la corrida queda en ambar.":
    "Requires formal acceptance of the terms (P2-2). Without a batch or mirror the run stays amber.",
  "Portal publico de ensayos de la UE. No hay API oficial para terceros; se consume el JSON interno del portal con verificacion de esquema.":
    "Public EU trials portal. There is no official API for third parties; the portal's internal JSON is consumed with schema verification.",
  "Numero EU CT; respaldo de nct_ids y senal regulatoria europea":
    "EU CT number; backup for nct_ids and European regulatory signal",
  "Sin API publica. Si el esquema cambia, el conector se apaga solo.":
    "No public API. If the schema changes, the connector switches itself off.",
  "Consolida 11 registros de ensayos y datos de dispositivos de la FDA. Referente operativo del NIHRIO; tambien sirve como control de cobertura.":
    "Consolidates 11 trial registries and FDA device data. NIHRIO's operational benchmark; it also serves as a coverage check.",
  "Control de calidad de cobertura: si aparece alli y no en el ciclo, es un hueco":
    "Coverage quality control: if it appears there and not in the cycle, it is a gap",
  "Plataforma openFDA: device/510k, device/pma, device/classification, device/udi, drug/drugsfda y drug/label bajo una sola API de dominio publico.":
    "openFDA platform: device/510k, device/pma, device/classification, device/udi, drug/drugsfda and drug/label under a single public-domain API.",
  "Fuente primaria de fda_approval_date (P5) y regulatory_status (P6)":
    "Primary source for fda_approval_date (P5) and regulatory_status (P6)",
  "Sin llave el cupo es bajo. Con llave gratuita de api.data.gov: 240/min y 120.000/dia.":
    "Without a key the quota is low. With a free api.data.gov key: 240/min and 120,000/day.",
  "Pagina del programa Breakthrough Devices. No hay conjunto openFDA equivalente.":
    "Breakthrough Devices program page. There is no equivalent openFDA dataset.",
  "Senal de via acelerada de dispositivos; no sustituye openFDA":
    "Signal of the accelerated pathway for devices; does not replace openFDA",
  "Recently Approved Devices y buscadores cfPMA / cfIVD de accessdata.":
    "Recently Approved Devices and the accessdata cfPMA / cfIVD search tools.",
  "Respaldo de fda_approval_date cuando openFDA no trae el listado reciente":
    "Backup for fda_approval_date when openFDA does not return the recent listing",
  "Tablas oficiales de medicamentos que el sitio actualiza durante la noche. El adaptador descarga el archivo; el RSS queda como contingencia.":
    "Official medicine tables that the site updates overnight. The adapter downloads the file; the RSS feed remains as a contingency.",
  "Fuente primaria de ema_approval_date (P5)": "Primary source for ema_approval_date (P5)",
  "Listado de medicamentos en evaluacion y programa piloto de dispositivos innovadores.":
    "List of medicines under evaluation and pilot program for innovative devices.",
  "Senal de horizonte (P6) que no esta en la tabla descargable":
    "Horizon signal (P6) that is not in the downloadable table",
  "API JSON/XML documentada de dispositivos medicos: device, deviceidentifier, licence y company, con filtro state=active.":
    "Documented JSON/XML API for medical devices: device, deviceidentifier, licence and company, with the state=active filter.",
  "Comparador regulatorio de nivel A, distinto de FDA y EMA": "Level A regulatory comparator, other than FDA and EMA",
  "La matriz original no evidencio listado. La API existe y es de primer nivel.":
    "The original matrix did not show a listing. The API exists and is first-rate.",
  "API de productos farmaceuticos de Health Canada (JSON/XML).": "Health Canada drug products API (JSON/XML).",
  "Nombre comercial, fabricante y estado regulatorio de medicamentos":
    "Brand name, manufacturer and regulatory status of medicines",
  "Buscador ARTG con exportacion CSV/Excel por tipo terapeutico; bases de medicamentos bajo evaluacion y de decisiones. Senal anterior a la decision.":
    "ARTG search tool with CSV/Excel export by therapeutic type; databases of medicines under evaluation and of decisions. Signal ahead of the decision.",
  "regulatory_status de tecnologias bajo evaluacion (P6)": "regulatory_status of technologies under evaluation (P6)",
  "La exportacion completa del ARTG exige una descarga por tipo terapeutico.":
    "A full ARTG export requires one download per therapeutic type.",
  "Coleccion de listados de autorizaciones de comercializacion, publicados como documentos.":
    "Collection of marketing authorization listings, published as documents.",
  "Confirmacion regulatoria de segunda linea para P5": "Second-line regulatory confirmation for P5",
  "Seccion en ingles de informacion de aprobaciones.": "English-language section with approval information.",
  "Confirmacion regulatoria de segunda linea": "Second-line regulatory confirmation",
  "Portal en ingles con secciones de medicamentos y dispositivos medicos, sin capa de datos. La matriz EH le asigna aplicabilidad media: no publica listados ni guias metodologicas.":
    "English-language portal with sections on medicines and medical devices, with no data layer. The HS matrix rates its applicability as medium: it publishes neither listings nor methodological guides.",
  "Confirmacion regulatoria de segunda linea; nunca origen de un registro comercial":
    "Second-line regulatory confirmation; never the origin of a commercial record",
  "El rastreador privado de aprobaciones (CISEMA) figura en la matriz como referencia, no como origen: no se cita en informes.":
    "The private approvals tracker (CISEMA) appears in the matrix as a reference, not as an origin: it is not cited in reports.",
  "Base publica de horizon scanning con fichas fechadas y seis areas que se solapan con los clusteres del IETS. Horizonte de tres anos.":
    "Public horizon scanning database with dated fact sheets and six areas that overlap with the IETS clusters. Three-year horizon.",
  "Fuente de senal y de priorizacion ajena (P2, P3, P4). Hueco si no esta en el ciclo.":
    "Source of signals and of third-party prioritization (P2, P3, P4). A gap if it is not in the cycle.",
  "Sitio institucional y publicaciones. ScanMedicine se trata en FP-CT-04.":
    "Institutional site and publications. ScanMedicine is covered in FP-CT-04.",
  "Fuente de contraste y referente operativo de la plataforma":
    "Benchmark source and operational benchmark for the platform",
  "Seccion de horizon scanning: listas de vigilancia e informes. CADTH es el mismo emisor.":
    "Horizon scanning section: watch lists and reports. CADTH is the same issuer.",
  "Priorizacion ajena para P2–P4. Una sola fuente para no generar falsos duplicados.":
    "Third-party prioritization for P2–P4. A single source so as not to create false duplicates.",
  "CADTH y CDA-AMC son la misma organizacion. Quedan unificadas.":
    "CADTH and CDA-AMC are the same organization. They are merged.",
  "Informes de escaneo publicados.": "Published scanning reports.",
  "Fuente de contraste (priorizacion ajena)": "Benchmark source (third-party prioritization)",
  "Sitio de la red y del toolkit. El acceso a la base de miembros es materia de convenio.":
    "Site of the network and the toolkit. Access to the members' database is subject to an agreement.",
  "Interoperabilidad internacional (fase 7). El valor real esta detras de la membresia.":
    "International interoperability (phase 7). The real value lies behind membership.",
  "No se resuelve con codigo. Convenio institucional pendiente.":
    "Cannot be solved with code. Institutional agreement pending.",
  "Buscador database.inahta.org con parametros de consulta.": "database.inahta.org search tool with query parameters.",
  "Respaldo de priorizacion ajena; acceso pleno exige convenio":
    "Backup for third-party prioritization; full access requires an agreement",
  "Pagina del sistema de escaneo y publicaciones de la Comision.":
    "Page of the scanning system and Commission publications.",
  "Contexto europeo de escaneo": "European scanning context",
  "Guias de proceso y productos de valoracion temprana.": "Process guides and early value assessment products.",
  "Contexto de HTA de referencia": "Reference HTA context",
  "Pagina del programa Accelerated Access y demand signalling.":
    "Page of the Accelerated Access program and demand signalling.",
  "Senal de demanda del sistema ingles": "Demand signal from the English health system",
  "Buscador de proyectos y resultados, mayoritariamente en aleman.":
    "Search tool for projects and results, mostly in German.",
  "Contexto de HTA aleman": "German HTA context",
  "Informes puntuales de escaneo de horizonte, sin serie periodica.":
    "Occasional horizon scanning reports, with no regular series.",
  "Curaduria semestral con recordatorio de revision": "Six-monthly curation with a review reminder",
  "Programa historico. El material disponible corresponde al periodo que cerro en 2015.":
    "Historical program. The available material covers the period that ended in 2015.",
  "Referencia metodologica historica. Fuera del ciclo de ingesta.":
    "Historical methodological reference. Outside the ingestion cycle.",
  "Programa no vigente. Se conserva como referencia y se retira del ciclo de ingesta.":
    "Program no longer in force. It is kept as a reference and withdrawn from the ingestion cycle.",
  "E-utilities (esearch, efetch, esummary) sobre MEDLINE. Evidencia, no senal primaria.":
    "E-utilities (esearch, efetch, esummary) over MEDLINE. Evidence, not a primary signal.",
  "Fuente complementaria de evidencia clinica e indicacion": "Complementary source of clinical evidence and indication",
  "3 pet/s sin llave, 10 con llave NCBI. El correo institucional va en cada llamada.":
    "3 req/s without a key, 10 with an NCBI key. The institutional email is sent with every call.",
  "Publicaciones puntuales, sin serie.": "Occasional publications, with no series.",
  "Curaduria anual; no gobierna el pipeline": "Annual curation; does not drive the pipeline",
  "Pipeline publicado en tabla o listado estructurado. Es confirmacion de una senal que ya debio entrar por ensayo o tramite regulatorio.":
    "Pipeline published as a table or structured listing. It confirms a signal that should already have come in through a trial or a regulatory procedure.",
  "Portafolio e innovacion publicados (sin pipeline estructurado). Se recorren las URLs de entrada de la matriz EH y la IA extrae solo tecnologias nominadas.":
    "Published portfolio and innovation (no structured pipeline). The entry URLs from the HS matrix are crawled and the AI extracts only named technologies.",
  "Confirmacion de senal. Nivel D no sobreescribe campos de fuentes A/B.":
    "Signal confirmation. Level D does not overwrite fields from A/B sources.",
  "Senal temprana de dispositivos e innovacion; se confirma con openFDA y Health Canada.":
    "Early signal for devices and innovation; confirmed with openFDA and Health Canada.",
  "Consultar robots.txt y condiciones de uso antes de cada corrida.":
    "Check robots.txt and the terms of use before each run.",
  "No se rastrea de forma automatica.": "Not crawled automatically.",
  "Restriccion de uso de la matriz EH: traer datos de forma automatizada viola sus politicas y su infraestructura bloquea los scripts. Consulta humana; sin rastreo ni busqueda web.":
    "Usage restriction from the HS matrix: retrieving data automatically violates its policies and its infrastructure blocks scripts. Manual consultation; no crawling or web search.",
  "La base de datos IHSI exige cuenta de usuario: consulta humana. Los documentos de referencia quedan en la ficha.":
    "The IHSI database requires a user account: manual consultation. The reference documents are kept in the fact sheet.",
  "Requiere crear usuario; la version gratuita limita las busquedas: consulta humana.":
    "Requires creating a user account; the free version limits searches: manual consultation.",
  "No permite acceso gratuito: consulta humana con la suscripcion institucional.":
    "No free access: manual consultation with the institutional subscription.",
  "Acceso con suscripcion: consulta humana.": "Subscription access: manual consultation.",
  "Los nuevos ATC nivel 5 vienen en archivos Excel enlazados desde la pagina de actualizaciones.":
    "New level 5 ATC codes come in Excel files linked from the updates page.",
  "La URL de la matriz es la del servicio historico Reuters Health; la sonda dira si sigue activa.":
    "The matrix URL is that of the historical Reuters Health service; the probe will tell whether it is still active.",
  "La URL de la matriz (euroscan.org) responde con una página casi vacía: la red EuroScan opera hoy como i-HTS, y el sistema entra por i-hts.org.":
    "The matrix URL (euroscan.org) returns an almost empty page: the EuroScan network now operates as i-HTS, and the system goes in through i-hts.org.",

  // ---------------------------------------------------------------- catalog_service.py
  "Retirada al cargar el catálogo verificado D-06. Se conserva porque puede tener señales asociadas.":
    "Withdrawn when the verified D-06 catalog was loaded. It is kept because it may have associated signals.",
  "Creada al importar la matriz EH: asigne bloque, nivel y adaptador si hace falta.":
    "Created when importing the HS matrix: assign a block, level and adapter if needed.",
  "URL original de la matriz": "Original matrix URL",
  "API oficial (distinta a la matriz)": "Official API (different from the matrix)",
  "Página específica (distinta a la matriz)": "Specific page (different from the matrix)",
  "URL ajustada (la de la matriz no sirve)": "Adjusted URL (the matrix one does not work)",
  "URL distinta a la matriz": "URL different from the matrix",
  "Propuesta por IA (no está en la matriz)": "Proposed by AI (not in the matrix)",
  "Registrada por el equipo (no está en la matriz)": "Registered by the team (not in the matrix)",
  "No está en la matriz": "Not in the matrix",
  "La propuso la IA con «Detectar fuentes con IA»; no figura en la matriz EH.":
    "Proposed by the AI with “Detect sources with AI”; it is not in the HS matrix.",
  "La registró el equipo en el catálogo; no figura en la matriz EH.":
    "Registered by the team in the catalog; it is not in the HS matrix.",
  "Viene del catálogo verificado D-06; no figura en la matriz EH.":
    "It comes from the verified D-06 catalog; it is not in the HS matrix.",
};

const ENTITY = {
  "Registro de ensayos": "Trial registry",
  "Agencia regulatoria": "Regulatory agency",
  "Organismo HTA / red": "HTA body / network",
  "Literatura": "Literature",
  "Fabricante de I+D": "R&D manufacturer",
  "Revista / portal de noticias": "Journal / news portal",
  "Base de patentes": "Patent database",
};

export const patterns = [
  // catalog.py · ficha de una fuente que solo trae la matriz EH
  {
    re: /^(Registro de ensayos|Agencia regulatoria|Organismo HTA \/ red|Literatura|Fabricante de I\+D|Revista \/ portal de noticias|Base de patentes): (.+)\.$/,
    en: (m) => `${ENTITY[m[1]]}: ${m[2]}.`,
  },
  { re: /^Matriz EH \(([^)]*)\): (.+)$/, en: (m) => `${MATRIX} (${matrixRef(m[1])}): ${ENTITY[m[2]] || m[2]}` },
  { re: /^Matriz EH \(([^)]*)\)$/, en: (m) => `${MATRIX} (${matrixRef(m[1])})` },

  // catalog_service.py · procedencia de la URL principal
  { re: /^Es la URL que reporta la (.+)\.$/, en: (m) => `This is the URL reported by the ${matrixRef(m[1])}.` },
  {
    re: /^Se consulta por la API oficial \((.+?)\), que entrega datos estructurados; la (.+?) reporta (.*)\.$/,
    en: (m) =>
      `It is queried through the official API (${m[1]}), which returns structured data; the ${matrixRef(m[2])} reports ${m[3]}.`,
  },
  {
    re: /^Comparte la (.+?) con otra fuente y usa su página específica; la matriz reporta (.*)\.$/,
    en: (m) =>
      `It shares the ${matrixRef(m[1])} with another source and uses its own specific page; the matrix reports ${m[2]}.`,
  },
  {
    re: /^La URL en uso no es la original de la (.+?) \((.*)\)\.$/,
    en: (m) => `The URL in use is not the original one from the ${matrixRef(m[1])} (${m[2]}).`,
  },
];
