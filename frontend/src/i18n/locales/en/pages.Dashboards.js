// src/pages/Dashboards.jsx: tablero estratégico (gobernanza anticipatoria).
// «Recorte» (las tecnologías que quedan tras aplicar los filtros) se traduce siempre como "selection".
export default {
  // --- Catálogos del tablero
  "Fase I": "Phase I",
  "Fase II": "Phase II",
  "Fase III": "Phase III",
  "Fase IV": "Phase IV",
  "Autorizada / en mercado": "Authorized / on the market",
  "Sin fase declarada": "No phase declared",
  "Inminente": "Imminent",
  "Transición": "Transition",
  "Emergente": "Emerging",
  "Lejano": "Distant",
  "Sin dato suficiente": "Not enough data",
  "Capturadas": "Captured",
  "Filtradas": "Screened",
  "Priorizadas": "Prioritized",
  "Evaluadas": "Assessed",
  "Publicadas": "Published",
  "Priorizada (4-6 puntos)": "Prioritized (4-6 points)",
  "Bajo vigilancia (3)": "Under surveillance (3)",
  "No priorizada o sin calificar": "Not prioritized or not rated",
  "Sin priorizar": "Not yet prioritized",
  "Priorizada, sin expediente": "Prioritized, no dossier",
  "En evaluación": "In assessment",
  "Publicada": "Published",
  "Borrador": "Draft",
  "Rev. interna": "Internal rev.",
  "Rev. externa": "External rev.",
  "Observaciones##estado": "Comments",
  "Comité": "Committee",
  "Publicado": "Published",
  "Ficha": "Fact sheet",
  "Informe": "Report",
  "Mini-HTA": "Mini-HTA",

  // --- Ayudas
  "Tablero de gobernanza anticipatoria (RF17): resume el ciclo para quien decide. Qué se priorizó, qué llega pronto al mercado, dónde está el trabajo de evaluación y cuánto podría costarle al sistema de salud.":
    "Anticipatory governance dashboard (RF17): summarizes the cycle for decision-makers. What was prioritized, what will reach the market soon, where the assessment work stands and how much it could cost the health system.",
  "Datamart: copia de las cifras del ciclo guardada al cerrarlo (con el time-to-market de ese momento). El tablero y sus filtros la usan sin volver a recorrer la base transaccional.":
    "Datamart: a copy of the cycle figures saved when the cycle was closed (with the time-to-market at that point). The dashboard and its filters use it without querying the transactional database again.",
  "Vuelve a calcular las cifras y el time-to-market con los datos actuales y reemplaza la copia guardada. Use esto si cambiaron fechas o informes después del cierre.":
    "Recalculates the figures and the time-to-market with the current data and replaces the saved copy. Use this if dates or reports changed after the cycle was closed.",
  "Cálculo en vivo: el ciclo está abierto, así que las cifras se arman ahora mismo con los datos actuales y los filtros elegidos.":
    "Live calculation: the cycle is open, so the figures are built right now from the current data and the selected filters.",
  "Qué mide: tecnologías asignadas a este ciclo. Cómo se calcula: todas las del recorte, sin importar su estado.":
    "What it measures: technologies assigned to this cycle. How it is calculated: all those in the selection, regardless of their status.",
  "Qué mide: tecnologías que pasaron el filtro de novedad. Cómo se calcula: estado en el ciclo apta, priorizada, bajo vigilancia, no priorizada, en evaluación o publicada.":
    "What it measures: technologies that passed the novelty filter. How it is calculated: cycle status eligible, prioritized, under surveillance, not prioritized, in assessment or published.",
  "Qué mide: tecnologías que superaron el umbral de puntos P1-P6. Cómo se calcula: estado en el ciclo priorizada, en evaluación o publicada.":
    "What it measures: technologies that exceeded the P1-P6 points threshold. How it is calculated: cycle status prioritized, in assessment or published.",
  "Qué mide: priorizadas con ficha, informe o Mini-HTA abierto en este ciclo. Cómo se calcula: estado en evaluación o publicada, o expediente del ciclo abierto.":
    "What it measures: prioritized technologies with a fact sheet, report or Mini-HTA opened in this cycle. How it is calculated: status in assessment or published, or a dossier opened in the cycle.",
  "Qué mide: evaluadas cuyo informe se publicó en este ciclo. Cómo se calcula: estado publicada o expediente del ciclo publicado.":
    "What it measures: assessed technologies whose report was published in this cycle. How it is calculated: status published, or a dossier published in the cycle.",
  "Recorte el tablero por clúster, tipología, etapa, cercanía al mercado y más. Todos los indicadores, gráficos y la tabla se recalculan. También puede hacer clic en una barra, una columna o un indicador. El enlace de la página guarda el recorte.":
    "Narrow the dashboard by cluster, technology type, stage, proximity to market and more. All indicators, charts and the table are recalculated. You can also click a bar, a column or an indicator. The page link keeps the selection.",
  "Clúster: grupo de enfermedades o problemas de salud (cáncer, huérfanas, alto costo, etc.) que organiza las tecnologías.":
    "Cluster: group of diseases or health problems (cancer, orphan diseases, high cost, etc.) used to organize the technologies.",
  "Tipología: tipo de tecnología (medicamento, terapia avanzada, dispositivo, diagnóstico, procedimiento o salud digital).":
    "Technology type: type of technology (medicine, advanced therapy, device, diagnostic, procedure or digital health).",
  "Fase clínica agrupada a partir de la fase declarada (I, II, III, IV o autorizada). Si menciona varias, cuenta la más avanzada.":
    "Clinical phase grouped from the declared phase (I, II, III, IV or authorized). If several are mentioned, the most advanced one counts.",
  "Estado de la tecnología dentro de este ciclo: asignada, apta, priorizada, bajo vigilancia, en evaluación, publicada, etc.":
    "Status of the technology within this cycle: assigned, eligible, prioritized, under surveillance, in assessment, published, etc.",
  "Etapa alcanzada del embudo: al elegir 'Priorizadas' quedan también las evaluadas y publicadas, porque pasaron por esa etapa.":
    "Funnel stage reached: choosing 'Prioritized' also keeps the assessed and published ones, because they went through that stage.",
  "Time-to-market: meses estimados hasta la llegada al mercado, desde la aprobación FDA/EMA o desde el fin de fase III más el plazo de revisión regulatoria.":
    "Time-to-market: estimated months until market entry, counted from FDA/EMA approval or from the end of phase III plus the regulatory review period.",
  "Puntos P1 a P6: seis preguntas oficiales de priorización; cada sí vale 1 punto. Las tecnologías sin calificación completa quedan fuera de este filtro.":
    "Points P1 to P6: six official prioritization questions; each yes is worth 1 point. Technologies without a complete rating are left out of this filter.",
  "Solo tecnologías cuya señal se capturó desde esta fecha (hora de Colombia).":
    "Only technologies whose signal was captured on or after this date (Colombia time).",
  "Solo tecnologías cuya señal se capturó hasta esta fecha, inclusive.":
    "Only technologies whose signal was captured up to and including this date.",
  "Cómo leerlo: cuántas tecnologías del recorte alcanzaron cada etapa y cuántas se quedaron entre una y otra. Clic en una etapa para ver solo las que la alcanzaron.":
    "How to read it: how many technologies in the selection reached each stage and how many dropped out between one stage and the next. Click a stage to see only those that reached it.",
  "Frases calculadas con el recorte actual: dónde se pierde el ciclo, dónde se concentra lo priorizado y qué falta para decidir.":
    "Statements calculated from the current selection: where the cycle loses technologies, where the prioritized ones are concentrated and what is still missing to decide.",
  "Listas de trabajo que salen del recorte: tecnologías que llegan pronto sin priorizar, priorizadas sin expediente, aprobadas afuera sin informe y expedientes devueltos con observaciones.":
    "Worklists drawn from the selection: technologies arriving soon that are not prioritized, prioritized ones without a dossier, technologies approved abroad without a report and dossiers returned with comments.",
  "Cómo leerlo: cada columna es una franja de cercanía al mercado y se divide por el resultado de la priorización. Lo más urgente es la parte azul oscura de 'Inminente': priorizadas que llegan en menos de un año. Clic en una columna para filtrar.":
    "How to read it: each column is a proximity-to-market band, split by the prioritization result. The most urgent part is the dark blue segment of 'Imminent': prioritized technologies arriving in under a year. Click a column to filter.",
  "Cómo leerlo: cada punto es una tecnología. Hacia la izquierda llega antes al mercado; hacia arriba tiene más puntos P1-P6. El cuadrante 'Actuar ya' reúne lo priorizado que llega antes del tope de 'inminente'. Clic en un punto para ubicarlo en la tabla.":
    "How to read it: each dot is a technology. Further left means it reaches the market sooner; further up means more P1-P6 points. The 'Act now' quadrant gathers the prioritized technologies arriving before the 'imminent' cut-off. Click a dot to locate it in the table.",
  "Cómo leerlo: cada barra es un clúster dividido por la etapa en que están hoy sus tecnologías. Muestra dónde se concentra lo priorizado y dónde está detenido el trabajo. Clic en una barra para filtrar.":
    "How to read it: each bar is a cluster split by the stage its technologies are in today. It shows where the prioritized ones are concentrated and where work is stalled. Click a bar to filter.",
  "Cómo leerlo: fichas, informes y Mini-HTA del recorte según su estado editorial, de borrador a publicado. Las columnas de revisión muestran dónde está el cuello de botella.":
    "How to read it: fact sheets, reports and Mini-HTAs in the selection by editorial status, from draft to published. The review columns show where the bottleneck is.",
  "Cuántas tecnologías del recorte hay por tipología. Clic para filtrar.":
    "How many technologies in the selection there are per technology type. Click to filter.",
  "Cuántas tecnologías del recorte hay por fase clínica. Clic para filtrar.":
    "How many technologies in the selection there are per clinical phase. Click to filter.",
  "Cómo leerlo: suma del impacto presupuestal estimado (años 1, 2 y 3) de los expedientes del recorte, por clúster. Más oscuro = mayor monto. Los montos salen de los campos de impacto presupuestal de fichas, informes y Mini-HTA.":
    "How to read it: sum of the estimated budget impact (years 1, 2 and 3) of the dossiers in the selection, by cluster. Darker = larger amount. The amounts come from the budget impact fields of fact sheets, reports and Mini-HTAs.",
  "Las tecnologías con mayor impacto presupuestal acumulado en tres años, según sus expedientes.":
    "The technologies with the largest cumulative budget impact over three years, according to their dossiers.",
  "Listado de las tecnologías que coinciden con los filtros. El nombre abre el módulo donde se trabaja la tecnología según su estado.":
    "List of the technologies that match the filters. The name opens the module where the technology is worked on, depending on its status.",
  "Comparadores del SGSSS: tratamientos que ya se usan en Colombia para la misma condición, contra los que se compara la nueva tecnología.":
    "SGSSS comparators: treatments already used in Colombia for the same condition, against which the new technology is compared.",
  "Los montos presupuestales y los comparadores solo los ven perfiles con acceso restringido (MinSalud, INVIMA, administración). El resto ve el tablero agregado, también en las exportaciones.":
    "Budget amounts and comparators are visible only to profiles with restricted access (MinSalud, INVIMA, administration). Everyone else sees the aggregate dashboard, including in exports.",
  "Descarga las tecnologías del recorte actual con sus dimensiones. Sin acceso restringido, el archivo no incluye montos presupuestales.":
    "Downloads the technologies in the current selection with their dimensions. Without restricted access, the file does not include budget amounts.",

  // --- Montos, meses y time-to-market
  "{n} billones": "{n} trillion",
  "{n} mil M": "{n} bn",
  "{n} M": "{n} M",
  "Sin monto": "No amount",
  "Sin dato": "No data",
  "{n} m": "{n} mo",
  "≤ {n} m": "≤ {n} mo",
  "{desde}-{hasta} m": "{desde}-{hasta} mo",
  "> {n} m": "> {n} mo",
  "sin fecha": "undated",
  "Falta fecha de fin de fase III o de aprobación": "Phase III end date or approval date is missing",
  "Ya tiene registro INVIMA": "Already has an INVIMA registration",
  "Ya aprobada (FDA/EMA {fecha})": "Already approved (FDA/EMA {fecha})",
  "Fecha esperada vencida ({fecha})": "Expected date overdue ({fecha})",
  "Llegada esperada {fecha}": "Expected arrival {fecha}",

  // --- Piezas comunes de los gráficos
  "clúster": "cluster",
  "tipología": "technology type",
  "etapa": "stage",
  "franja": "band",
  "fase": "phase",
  "Filtrar por {campo}": "Filter by {campo}",
  "{label}: {count}. Quitar filtro": "{label}: {count}. Remove filter",
  "{label}: {count}. Filtrar por este valor": "{label}: {count}. Filter by this value",
  "Qué es {label}": "What {label} is",
  "Total": "Total",

  // --- Embudo y lectura rápida
  "Embudo del ciclo": "Cycle funnel",
  "{n} no pasaron de {desde} a {hasta}": "{n} did not move from {desde} to {hasta}",
  "{label}: {count}. Quitar filtro de etapa": "{label}: {count}. Remove stage filter",
  "{label}: {count}. Filtrar por las que alcanzaron esta etapa": "{label}: {count}. Filter by those that reached this stage",
  "de {total} en el ciclo": "of {total} in the cycle",
  "{pct}% de las capturadas": "{pct}% of those captured",
  "El mayor corte del ciclo está entre {desde} y {hasta}: {n} de {total} no avanzaron.":
    "The largest drop-off in the cycle is between {desde} and {hasta}: {n} of {total} did not move forward.",
  "{cluster} concentra {n} de las {total} priorizadas ({pct}%).":
    "{cluster} accounts for {n} of the {total} prioritized technologies ({pct}%).",
  "{n} priorizada llega al mercado en menos de un año.": "{n} prioritized technology reaches the market in under a year.",
  "{n} priorizadas llegan al mercado en menos de un año.": "{n} prioritized technologies reach the market in under a year.",
  "{n} tecnología ya aprobada por FDA/EMA sin informe publicado.":
    "{n} technology already approved by FDA/EMA has no published report.",
  "{n} tecnologías ya aprobadas por FDA/EMA sin informe publicado.":
    "{n} technologies already approved by FDA/EMA have no published report.",
  "{n} priorizada todavía sin ficha, informe ni Mini-HTA abierto.":
    "{n} prioritized technology still has no fact sheet, report or Mini-HTA open.",
  "{n} priorizadas todavía sin ficha, informe ni Mini-HTA abierto.":
    "{n} prioritized technologies still have no fact sheet, report or Mini-HTA open.",
  "{n} tecnología no tiene fecha de fase III ni de aprobación: no se puede estimar su llegada.":
    "{n} technology has no phase III date or approval date: its arrival cannot be estimated.",
  "{n} tecnologías no tienen fecha de fase III ni de aprobación: no se puede estimar su llegada.":
    "{n} technologies have no phase III date or approval date: their arrival cannot be estimated.",
  "{n} pts": "{n} pts",
  "{n} puntos": "{n} points",
  "Sin calificar": "Not rated",

  // --- Matriz de decisión
  "Actuar ya ({n})": "Act now ({n})",
  "Preparar": "Prepare",
  "Revisar": "Review",
  "Vigilar": "Monitor",
  "Meses estimados al mercado": "Estimated months to market",
  "Sin calif.": "Not rated",
  "Puntos P1-P6": "P1-P6 points",
  "Estimación": "Estimate",
  "Ya aprobada o con registro": "Already approved or registered",
  "Fecha esperada vencida": "Expected date overdue",
  "{n} tecnología sin fecha de fase III ni de aprobación no se grafican.":
    "{n} technology with no phase III date or approval date is not plotted.",
  "{n} tecnologías sin fecha de fase III ni de aprobación no se grafican.":
    "{n} technologies with no phase III date or approval date are not plotted.",
  "Ver cuáles": "See which ones",
  "Todas las tecnologías del recorte tienen dato de time-to-market.":
    "All technologies in the selection have time-to-market data.",
  "Inminente hasta {meses} meses; revisión regulatoria de {dias} días.":
    "Imminent up to {meses} months; regulatory review of {dias} days.",

  // --- Avance de los expedientes
  "Ninguna tecnología del recorte tiene expediente de evaluación todavía.":
    "No technology in the selection has an assessment dossier yet.",
  "Expedientes por nivel de producto y estado editorial": "Dossiers by product level and editorial status",
  "Producto": "Product",
  "<b>{n}</b> expedientes en el recorte": "<b>{n}</b> dossiers in the selection",
  "{n} priorizada espera expediente →": "{n} prioritized technology is awaiting a dossier →",
  "{n} priorizadas esperan expediente →": "{n} prioritized technologies are awaiting a dossier →",

  // --- Presupuesto
  "Año 1": "Year 1",
  "Año 2": "Year 2",
  "Año 3": "Year 3",
  "Impacto presupuestal potencial por clúster y año (COP)": "Potential budget impact by cluster and year (COP)",
  "Clúster": "Cluster",
  "{n} de {total} con monto": "{n} of {total} with an amount",
  "{cluster} · {periodo}: {monto}. Clic para filtrar por el clúster.": "{cluster} · {periodo}: {monto}. Click to filter by this cluster.",
  "Total del recorte": "Selection total",
  '{n} expediente(s) tienen texto en impacto presupuestal sin un monto reconocible (por ejemplo "por estimar"). Escriba el valor en COP, como "3.200 millones" o "$ 3.200.000.000".':
    '{n} dossier(s) have text in the budget impact fields with no recognizable amount (for example "por estimar"). Enter the value in COP, such as "3.200 millones" or "$ 3.200.000.000".',
  "Ningún expediente del recorte tiene montos de impacto presupuestal.":
    "No dossier in the selection has budget impact amounts.",
  "{cluster} · {puntos} pts · año 1 {monto}": "{cluster} · {puntos} pts · year 1 {monto}",

  // --- Tabla del recorte
  "Ordenar por {label}": "Sort by {label}",
  "{n} de {total} tecnología(s)": "{n} of {total} technologies",
  "Quitar resaltado": "Remove highlight",
  "Buscar en el recorte": "Search the selection",
  "Nombre, clúster o fase": "Name, cluster or phase",
  "Tecnología": "Technology",
  "Tipología": "Technology type",
  "Estado": "Status",
  "Puntos": "Points",
  "Fase": "Phase",
  "Mostrando las {n}": "Showing all {n}",
  "Mostrando {desde}-{hasta} de {total}": "Showing {desde}-{hasta} of {total}",
  "Anterior": "Previous",
  "Siguiente": "Next",
  "Paginar": "Paginate",
  "Mostrar todas": "Show all",

  // --- Pantalla: mensajes
  "La fecha 'Captura desde' es posterior a 'Captura hasta'.": "The 'Captured from' date is later than 'Captured to'.",
  "No se pudo cargar el tablero estratégico": "Could not load the strategic dashboard",
  "Datamart y time-to-market recalculados": "Datamart and time-to-market recalculated",
  "No se pudo refrescar el datamart": "Could not refresh the datamart",
  "Recorte exportado ({name})": "Selection exported ({name})",
  "No se pudo exportar el recorte": "Could not export the selection",

  // --- Filtros activos
  "Sin clúster": "No cluster",
  "Clúster {id}": "Cluster {id}",
  "Sin tipología": "No technology type",
  "Tipología {id}": "Technology type {id}",
  "Clúster: {valor}": "Cluster: {valor}",
  "Tipología: {valor}": "Technology type: {valor}",
  "Fase: {valor}": "Phase: {valor}",
  "Estado: {valor}": "Status: {valor}",
  "Time-to-market: {valor}": "Time-to-market: {valor}",
  "Etapa alcanzada: {valor}": "Stage reached: {valor}",
  "Puntos: {n} o más": "Points: {n} or more",
  "Captura desde {fecha}": "Captured from {fecha}",
  "Captura hasta {fecha}": "Captured to {fecha}",

  // --- Estados vacíos y cabecera
  "Seleccione un ciclo": "Select a cycle",
  "El tablero estratégico se calcula por ciclo. Elija uno en el selector de ciclo de la parte superior; si no existe ninguno, cree el primero en Ciclos de escaneo.":
    "The strategic dashboard is calculated per cycle. Choose one in the cycle selector at the top; if none exists, create the first one in Scanning cycles.",
  "Ir a ciclos": "Go to cycles",
  "Construyendo el tablero estratégico...": "Building the strategic dashboard...",
  "No se pudo cargar el tablero": "Could not load the dashboard",
  "Revise su conexión e intente de nuevo.": "Check your connection and try again.",
  "Reintentar": "Retry",
  "Limpiar filtros": "Clear filters",
  "Tablero estratégico": "Strategic dashboard",
  "{ciclo}: qué se priorizó, qué llega pronto al mercado, cómo avanza la evaluación y cuánto podría costar.":
    "{ciclo}: what was prioritized, what will reach the market soon, how assessment is progressing and how much it could cost.",
  "Ciclo": "Cycle",
  "Quién ve los costos": "Who sees the costs",
  "Recalcular datamart": "Recalculate datamart",
  "Qué es recalcular datamart": "What recalculating the datamart is",
  "Ver boletín": "View bulletin",
  "Imprimir o guardar en PDF": "Print or save as PDF",
  "Imprimir": "Print",
  "Tablero estratégico - {ciclo}": "Strategic dashboard - {ciclo}",
  "Filtros: {filtros} · {n} tecnología(s) · {origen} · {capa} · Impreso {fecha}":
    "Filters: {filtros} · {n} technology(ies) · {origen} · {capa} · Printed {fecha}",
  "sin filtros": "no filters",
  "Datamart al cierre": "Datamart at closing",
  "Cálculo en vivo": "Live calculation",
  "Capa restringida": "Restricted layer",
  "Vista agregada": "Aggregate view",

  // --- Barra de filtros
  "Recorte": "Selection",
  "{n} filtro(s) activo(s)": "{n} active filter(s)",
  "filtro activo": "active filter",
  "filtros activos": "active filters",
  "No hay filtros activos: el tablero ya muestra todo el ciclo.": "There are no active filters: the dashboard already shows the whole cycle.",
  "Actualizando…": "Updating…",
  "Qué es datamart": "What a datamart is",
  "Qué es cálculo en vivo": "What live calculation is",
  "Actualizado {fecha}": "Updated {fecha}",
  "Qué capa de acceso veo": "Which access layer I see",
  "Filtros activos": "Active filters",
  "Quitar filtro {filtro}": "Remove filter {filtro}",
  "Todos": "All",
  "Todas": "All",
  "Etapa alcanzada": "Stage reached",
  "Llegada al mercado": "Market arrival",
  "Todas las franjas": "All bands",
  "Fase clínica": "Clinical phase",
  "Estado en el ciclo": "Status in the cycle",
  "Puntos mínimos P1-P6": "Minimum P1-P6 points",
  "Cualquiera": "Any",
  "3 o más (vigilancia)": "3 or more (surveillance)",
  "4 o más (priorizada)": "4 or more (prioritized)",
  "5 o más (informe)": "5 or more (report)",
  "Captura desde": "Captured from",
  "Captura hasta": "Captured to",
  "Corrija el rango para actualizar el tablero.": "Correct the range to update the dashboard.",
  "Más filtros (en uso)": "More filters (in use)",
  "Menos filtros ▲": "Fewer filters ▲",
  "Más filtros: fase, estado, puntos y fechas ▼": "More filters: phase, status, points and dates ▼",
  "Espere a que termine la exportación en curso.": "Wait for the export in progress to finish.",
  "No hay tecnologías en el recorte para exportar.": "There are no technologies in the selection to export.",
  "Exportar CSV": "Export CSV",
  "Exportar Excel": "Export Excel",
  "Qué incluye la exportación": "What the export includes",
  "Este ciclo aún no tiene tecnologías": "This cycle has no technologies yet",
  "El tablero se llena cuando se asignan tecnologías al ciclo desde la bandeja de entrada. Luego avanzan por filtrado, priorización y evaluación.":
    "The dashboard fills up when technologies are assigned to the cycle from the inbox. They then move through screening, prioritization and assessment.",
  "Ir a la bandeja de entrada": "Go to the inbox",
  "Ninguna tecnología coincide con estos filtros": "No technology matches these filters",
  "El ciclo tiene {n} tecnología(s), pero ninguna cumple todos los filtros a la vez. Quite alguno de los filtros activos o límpielos todos.":
    "The cycle has {n} technology(ies), but none meets all the filters at once. Remove one of the active filters or clear them all.",

  // --- Resumen para decidir
  "Resumen para decidir": "Decision summary",
  "{pct}% de las {n} capturadas": "{pct}% of the {n} captured",
  "Actuar ya": "Act now",
  "priorizadas que llegan en ≤ {n} meses": "prioritized technologies arriving in ≤ {n} months",
  "Tecnologías con 4 o más puntos P1-P6 cuya llegada estimada al mercado está dentro del tope de 'inminente'. Es la lista de mayor urgencia para quien decide.":
    "Technologies with 4 or more P1-P6 points whose estimated market arrival falls within the 'imminent' cut-off. This is the most urgent list for decision-makers.",
  "Llegan en menos de un año": "Arriving in under a year",
  "{n} ya aprobadas por FDA/EMA": "{n} already approved by FDA/EMA",
  "Tecnologías en la franja inminente de time-to-market, priorizadas o no.":
    "Technologies in the imminent time-to-market band, whether prioritized or not.",
  "Expedientes": "Dossiers",
  "{publicados} publicados · {curso} en curso": "{publicados} published · {curso} in progress",
  "Fichas, informes y Mini-HTA del recorte, en cualquier estado editorial.":
    "Fact sheets, reports and Mini-HTAs in the selection, in any editorial status.",
  "Impacto a 3 años": "3-year impact",
  "en {n} expediente con monto": "across {n} dossier with an amount",
  "en {n} expedientes con monto": "across {n} dossiers with an amount",
  "sin montos registrados": "no amounts recorded",
  "Suma del impacto presupuestal estimado en los años 1, 2 y 3 de los expedientes del recorte (COP).":
    "Sum of the estimated budget impact in years 1, 2 and 3 of the dossiers in the selection (COP).",
  "Por calificar": "To be rated",
  "aptas que esperan los puntos P1-P6": "eligible technologies awaiting P1-P6 points",
  "Tecnologías que pasaron el filtrado y todavía no tienen la calificación completa de priorización.":
    "Technologies that passed screening and do not yet have the complete prioritization rating.",
  "Lectura rápida": "Quick read",
  "Sin hallazgos destacados en este recorte.": "No notable findings in this selection.",
  "Requieren atención": "Need attention",
  "Llegan pronto y no están priorizadas": "Arriving soon and not prioritized",
  "Todo lo inminente ya pasó por priorización.": "Everything imminent has already gone through prioritization.",
  "Ver las {n} →": "View all {n} →",
  "Priorizadas sin expediente": "Prioritized without a dossier",
  "Toda priorizada tiene expediente abierto.": "Every prioritized technology has an open dossier.",
  "Aprobadas por FDA/EMA sin informe publicado": "Approved by FDA/EMA with no published report",
  "No hay aprobadas pendientes de informe.": "No approved technologies are awaiting a report.",
  "Expedientes con observaciones": "Dossiers with comments",
  "Ningún expediente fue devuelto con observaciones.": "No dossier was returned with comments.",

  // --- Secciones y gráficos
  "Llegada al mercado y prioridad": "Market arrival and priority",
  "¿Cuándo llegan al mercado?": "When do they reach the market?",
  "Sin tecnologías en el recorte.": "No technologies in the selection.",
  "Matriz de decisión": "Decision matrix",
  "Ninguna tecnología del recorte tiene fecha de fin de fase III ni de aprobación FDA/EMA, así que no hay time-to-market que graficar. Complete esas fechas en la ficha de la tecnología.":
    "No technology in the selection has a phase III end date or an FDA/EMA approval date, so there is no time-to-market to plot. Fill in those dates in the technology's fact sheet.",
  "Dónde está el trabajo": "Where the work is",
  "Clústeres por etapa": "Clusters by stage",
  "Avance de los expedientes": "Dossier progress",
  "Impacto presupuestal": "Budget impact",
  "Impacto por clúster y año": "Impact by cluster and year",
  "Ningún expediente del recorte tiene montos de impacto presupuestal. Se registran en los campos 'Impacto presupuestal año 1, 2 y 3' de fichas, informes y Mini-HTA (módulo Evaluación).":
    "No dossier in the selection has budget impact amounts. They are recorded in the 'Budget impact year 1, 2 and 3' fields of fact sheets, reports and Mini-HTAs (Assessment module).",
  "Modelación presupuestal restringida": "Restricted budget modeling",
  "Los montos de impacto presupuestal solo se muestran a perfiles con acceso restringido (MinSalud, INVIMA, administración). Si los necesita, solicite ese acceso al administrador.":
    "Budget impact amounts are shown only to profiles with restricted access (MinSalud, INVIMA, administration). If you need them, ask the administrator for that access.",
  "Mayor impacto a 3 años": "Largest 3-year impact",
  "Tecnologías del recorte": "Technologies in the selection",
  "Comparadores del SGSSS": "SGSSS comparators",
  "Grafo de gobernanza": "Governance graph",
  "Ocultar ▲": "Hide ▲",
  "Mostrar ▼": "Show ▼",
  "Mapa de relaciones del ciclo con el mismo recorte: amplíelo, consulte cada nodo con el asistente y guarde la vista.":
    "Relationship map of the cycle with the same selection: enlarge it, query each node with the assistant and save the view.",
  "Las mismas etapas del embudo en el ciclo que abrió justo antes, con el mismo recorte. Sirve para saber si este ciclo priorizó, evaluó o publicó más o menos que el anterior.": "The same funnel stages in the cycle that opened just before, with the same selection. It shows whether this cycle prioritised, assessed or published more or less than the previous one.",
  "Qué tan completos están los datos del recorte. Una tecnología sin clúster, tipología, fase o fecha de llegada queda en 'sin dato' y no aparece donde debería en los gráficos. Clic en una cifra para ver esas tecnologías y completarlas.": "How complete the data in the selection is. A technology without a cluster, type, phase or arrival date is left as 'no data' and does not appear where it should in the charts. Click a figure to see those technologies and complete them.",
  "Igual que en {ciclo}": "Same as in {ciclo}",
  "▲ {n} más que en {ciclo}": "▲ {n} more than in {ciclo}",
  "▼ {n} menos que en {ciclo}": "▼ {n} fewer than in {ciclo}",
  "Diferencia": "Difference",
  "El porcentaje es la parte de las capturadas de cada ciclo que alcanzó la etapa. Se aplica el mismo recorte a los dos ciclos, salvo las fechas de captura.": "The percentage is the share of each cycle's captured technologies that reached the stage. The same selection is applied to both cycles, except the capture dates.",
  "{n} de {total} con clúster, tipología, fase y fecha de llegada": "{n} of {total} with cluster, type, phase and arrival date",
  "{pct}% de fichas completas": "{pct}% of records complete",
  "Ver las {n}: {label}": "View the {n}: {label}",
  "Secciones del tablero": "Dashboard sections",
  "Descargas y recálculos": "Downloads and recalculations",
  "Quién descargó el recorte de este ciclo, con o sin montos, y cuándo se recalculó el datamart.": "Who downloaded this cycle's selection, with or without amounts, and when the datamart was recalculated.",
  "No se pudo cargar la actividad del tablero.": "The dashboard activity could not be loaded.",
  "Aún no hay descargas ni recálculos de este ciclo.": "There are no downloads or recalculations for this cycle yet.",
  "Enlace copiado: abre este mismo ciclo y recorte.": "Link copied: it opens this same cycle and selection.",
  "No se pudo copiar el enlace. Cópielo desde la barra de direcciones.": "The link could not be copied. Copy it from the address bar.",
  "Mercado": "Market",
  "Trabajo del ciclo": "Cycle work",
  "Calculado a las {hora}": "Calculated at {hora}",
  "Copia la dirección de esta página con el ciclo y los filtros actuales.": "Copies this page's address with the current cycle and filters.",
  "Frente al ciclo anterior": "Compared with the previous cycle",
  "Este es el primer ciclo registrado: todavía no hay un ciclo anterior con el cual comparar.": "This is the first cycle on record: there is no previous cycle to compare with yet.",
  "Calidad de los datos": "Data quality",
};
