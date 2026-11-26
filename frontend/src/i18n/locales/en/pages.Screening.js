// src/pages/Screening.jsx: filtrado y depuración (duplicados, novedad e INVIMA, Listado Único).
export default {
  // Pestañas
  "Duplicados": "Duplicates",
  "Novedad y registro sanitario": "Novelty and marketing authorization",
  "Listado único": "Unified list",

  // Ficha de un registro en una propuesta de fusión
  "Tecnología #{id}": "Technology #{id}",
  "Registro no disponible": "Record not available",
  "Comercial": "Brand name",
  "Fabricante": "Manufacturer",
  "Ensayos": "Trials",
  "Clúster": "Cluster",
  "Fuente": "Source",
  "Estado": "Status",
  "Se conserva este": "This one is kept",
  "Conservar este": "Keep this one",

  // Evidencia de la coincidencia
  "Ambos registros comparten el ensayo clínico <b>{nct}</b>. No es un parecido de nombres: es el mismo desarrollo.":
    "Both records share the clinical trial <b>{nct}</b>. It is not a similarity of names: it is the same development.",
  "Qué es Levenshtein": "What Levenshtein is",
  "Qué es Jaro-Winkler": "What Jaro-Winkler is",
  "Qué es token sorting": "What token sorting is",
  "Cómo pesa el fabricante": "How the manufacturer is weighted",

  // Pestaña de duplicados
  "No se pudieron cargar las propuestas de fusión": "The merge proposals could not be loaded",
  "Barrido con umbral {threshold}%: {detected} pares detectados, {created} propuestas nuevas.":
    "Sweep with a {threshold}% threshold: {detected} pairs detected, {created} new proposals.",
  "No se pudo ejecutar el barrido": "The sweep could not be run",
  "Registros fusionados. El absorbido queda trazado, no borrado.":
    "Records merged. The absorbed record remains traceable, not deleted.",
  "Propuesta descartada. El motor no volverá a proponerla.": "Proposal discarded. The engine will not propose it again.",
  "No se pudo resolver la propuesta": "The proposal could not be resolved",
  "Cargando propuestas de fusión...": "Loading merge proposals...",
  "Detección de duplicados": "Duplicate detection",
  "El hash exacto solo atrapa la misma página traída dos veces. La misma tecnología llega con nombres distintos según la fuente, y ese es el duplicado que contamina el Listado Único.":
    "The exact hash only catches the same page fetched twice. The same technology arrives under different names depending on the source, and that is the duplicate that contaminates the Unified List.",
  "Seleccione un ciclo para barrer su acervo.": "Select a cycle to sweep its pool.",
  "El ciclo está cerrado: su acervo ya no cambia.": "The cycle is closed: its pool no longer changes.",
  "{hint} Barre {ciclo}.": "{hint} Sweeps {ciclo}.",
  "el ciclo en pantalla": "the cycle on screen",
  "Ejecutar barrido": "Run sweep",
  "El sistema propone; una persona confirma. Ninguna fusión es automática y todas quedan en la bitácora con su autor.":
    "The system proposes; a person confirms. No merge is automatic and all of them are recorded in the audit log with their author.",
  "Sin duplicados pendientes": "No pending duplicates",
  "No hay pares por revisar. Ejecute el barrido después de asignar nuevas señales al ciclo.":
    "There are no pairs to review. Run the sweep after assigning new signals to the cycle.",
  "Mismo ensayo clínico": "Same clinical trial",
  "Similitud {pct}": "Similarity {pct}",
  "Propuesta #{id}": "Proposal #{id}",
  "Nota de la decisión de la propuesta {id}": "Decision note for proposal {id}",
  "Nota de la decisión (opcional)": "Decision note (optional)",
  "Fusionar y conservar #{id}": "Merge and keep #{id}",
  "Son distintas": "They are different",
  "Confirmar fusión": "Confirm merge",
  "Fusionar": "Merge",
  'Se conserva #{kept} ({name}) y absorbe a #{dropped}, que sale del Listado Único con causa "duplicada". La fusión no se deshace.':
    'Record #{kept} ({name}) is kept and absorbs #{dropped}, which leaves the Unified List with the reason "duplicate". The merge cannot be undone.',

  // Índice del INVIMA
  "No se pudo consultar el índice del INVIMA": "The INVIMA index could not be queried",
  "Índice actualizado: {nuevos} nuevos, {actualizados} actualizados.": "Index updated: {nuevos} new, {actualizados} updated.",
  "No se pudo sincronizar": "The synchronization failed",
  "{n} registros cargados desde el archivo.": "{n} records loaded from the file.",
  "No se pudo cargar el archivo": "The file could not be uploaded",
  "Consultando el índice...": "Querying the index...",
  "Índice local de registros sanitarios": "Local index of marketing authorizations",
  "La verificación responde contra una copia local y no contra el servicio en línea: es la única forma de sostener el tiempo de respuesta y de seguir filtrando si la fuente no está disponible.":
    "The verification runs against a local copy rather than the online service: it is the only way to sustain the response time and to keep screening if the source is unavailable.",
  "Registros": "Records",
  "Registros sanitarios en la copia local del índice del INVIMA.":
    "Marketing authorizations in the local copy of the INVIMA index.",
  "Antigüedad": "Age",
  "{n} d": "{n} d",
  "Máximo {n} d": "Maximum {n} d",
  "Días desde la última sincronización. Un índice viejo da falsos 'sin registro' en silencio.":
    "Days since the last synchronization. An old index silently returns false 'no authorization' results.",
  "Última sincronización": "Last synchronization",
  "sin ejecutar": "not run",
  "Origen y resultado de la última carga: datos.gov.co (Socrata) o archivo plano.":
    "Origin and result of the last load: datos.gov.co (Socrata) or flat file.",
  "Descarga los conjuntos abiertos de datos.gov.co. Puede tardar varios minutos.":
    "Downloads the open datasets from datos.gov.co. It may take several minutes.",
  "Sincronizar desde datos.gov.co": "Synchronize from datos.gov.co",
  "Cargando...": "Loading...",
  "Cargar archivo plano (CSV)": "Upload flat file (CSV)",
  "Solo los perfiles con permiso de sincronización actualizan el índice.":
    "Only profiles with synchronization permission update the index.",
  "La carga de archivo plano es la ruta de contingencia prevista mientras no se acuerde con el INVIMA el acceso estructurado al dato.":
    "The flat file upload is the planned contingency route until structured access to the data is agreed with INVIMA.",
  "Fecha": "Date",
  "Origen": "Origin",
  "Filas nuevas / filas actualizadas en la carga.": "New rows / updated rows in the load.",
  "Filas": "Rows",
  "Detalle": "Details",

  // Pestaña de novedad
  "No se pudo cargar la cola de filtrado": "The screening queue could not be loaded",
  "No se pudo cargar la verificación de novedad": "The novelty verification could not be loaded",
  "El INVIMA reporta registro sanitario vigente para esta tecnología.":
    "INVIMA reports a valid marketing authorization for this technology.",
  "Sin registro sanitario vigente en el índice local.": "No valid marketing authorization in the local index.",
  "No se pudo cruzar con el INVIMA": "The cross-check with INVIMA failed",
  "Criterio de novedad registrado. Ya puede marcarla apta para priorización.":
    "Novelty criterion recorded. You can now mark it as eligible for prioritization.",
  "Criterio registrado. {motivo}": "Criterion recorded. {motivo}",
  "No se pudo guardar el criterio de novedad": "The novelty criterion could not be saved",
  "Tecnología apta para priorización. Pasó a la cola P1 a P6.":
    "Technology eligible for prioritization. It moved to the P1 to P6 queue.",
  "No se pudo calificar como apta": "It could not be marked as eligible",
  "Tecnología excluida con causa registrada.": "Technology excluded and the reason recorded.",
  "No se pudo excluir": "Could not exclude",
  "Cargando cola de filtrado...": "Loading screening queue...",
  "Sin ciclo activo": "No active cycle",
  "El filtrado ocurre dentro de un ciclo. Seleccione uno en la cabecera o abra uno nuevo.":
    "Screening takes place within a cycle. Select one in the header or open a new one.",
  "Guarde primero el criterio de novedad que modificó.": "First save the novelty criterion you changed.",
  "Seleccione la vía de novedad que aplica.": "Select the novelty pathway that applies.",
  "La justificación debe tener al menos 20 caracteres.": "The justification must be at least 20 characters long.",
  "Nada pendiente de filtrar": "Nothing pending screening",
  "No hay tecnologías en estado 'asignada al ciclo' esperando verificación de novedad. Asigne señales desde la bandeja de entrada o revise el Listado Único.":
    "There are no technologies with 'assigned to cycle' status awaiting novelty verification. Assign signals from the inbox or review the Unified List.",
  "Por filtrar · {total} tecnología(s)": "To be screened · {total} technology(ies)",
  "Buscar en la cola de filtrado": "Search the screening queue",
  "Buscar por nombre o clúster...": "Search by name or cluster...",
  "Sin clúster": "No cluster",
  "Ninguna tecnología coincide con la búsqueda.": "No technology matches the search.",
  "Una tecnología con registro sanitario vigente en Colombia no avanza a priorización sin justificar por qué sigue siendo novedosa.":
    "A technology with a valid marketing authorization in Colombia does not move on to prioritization without a justification of why it is still novel.",
  "Registro sanitario": "Marketing authorization",
  "Qué es el registro sanitario": "What a marketing authorization is",
  "Vigente en Colombia": "Valid in Colombia",
  "Sin registro vigente": "No valid authorization",
  "Sin verificar": "Not verified",
  "Cruzado {fecha}": "Cross-checked {fecha}",
  "Cruzar con el INVIMA": "Cross-check with INVIMA",
  "Producto": "Product",
  "Titular": "Holder",
  "Parecido entre el nombre de la tecnología y el producto registrado. Sobre el umbral invima.match_threshold se considera hallado.":
    "Similarity between the technology name and the registered product. Above the invima.match_threshold threshold it is considered found.",
  "Similitud": "Similarity",
  "Vía de novedad": "Novelty pathway",
  "Seleccione la vía que aplica...": "Select the pathway that applies...",
  "Justificación explícita": "Explicit justification",
  "Explique por qué la tecnología sigue siendo novedosa pese al registro existente.":
    "Explain why the technology is still novel despite the existing authorization.",
  "Faltan {n} caracteres.": "{n} more characters needed.",
  "Concepto de la Sala Especializada del INVIMA (opcional)": "Opinion of INVIMA's Sala Especializada (optional)",
  "Qué es la Sala Especializada": "What the Sala Especializada is",
  "Resumen del concepto": "Summary of the opinion",
  "Referencia del acta": "Reference of the minutes",
  "Acta No. 12 de 2026 o enlace al PDF": "Minutes No. 12 of 2026 or link to the PDF",
  "Guardar criterio": "Save criterion",
  "Marcar apta para priorización": "Mark as eligible for prioritization",
  "Excluir con causa": "Exclude with a reason",
  "Ciclo cerrado: la verificación queda congelada como evidencia.":
    "Cycle closed: the verification is frozen as evidence.",
  "Excluir del ciclo": "Exclude from the cycle",
  "Cancelar": "Cancel",
  "Seleccione el motivo tipificado: es obligatorio.": "Select the predefined reason: it is required.",
  "Excluir": "Exclude",
  "<b>{name}</b> saldrá del ciclo. La causa es obligatoria y no editable una vez registrada; queda con fecha y evaluador en la bitácora.":
    "<b>{name}</b> will leave the cycle. The reason is required and cannot be edited once recorded; it is stored with date and assessor in the audit log.",
  "Motivo tipificado": "Predefined reason",
  "Seleccione un motivo...": "Select a reason...",
  "Observación": "Note",

  // Listado Único
  "Listado Único exportado en CSV.": "Unified List exported as CSV.",
  "No se pudo exportar el Listado Único": "The Unified List could not be exported",
  "No se pudo generar el Listado Único": "The Unified List could not be generated",
  "Consolidando el Listado Único...": "Consolidating the Unified List...",
  "El Listado Único es la salida consolidada de un ciclo.": "The Unified List is the consolidated output of a cycle.",
  "Listado Único por clúster · {code}": "Unified List by cluster · {code}",
  "Salida consolidada del filtrado: el acervo depurado del ciclo, sin duplicados ni exclusiones.":
    "Consolidated output of screening: the cycle's cleaned-up pool, without duplicates or exclusions.",
  "El listado está vacío: no hay nada que exportar todavía.": "The list is empty: there is nothing to export yet.",
  "Exportar CSV": "Export CSV",
  "En el listado": "In the list",
  "Excluidas": "Excluded",
  "Fusionadas": "Merged",
  "Registros absorbidos por fusiones confirmadas (en todo el sistema). No aparecen en el listado.":
    "Records absorbed by confirmed merges (across the whole system). They do not appear in the list.",
  "Clústeres": "Clusters",
  "Listado vacío": "Empty list",
  "Ninguna tecnología del ciclo ha superado el filtrado todavía. Marque aptas en la pestaña de novedad.":
    "No technology in the cycle has passed screening yet. Mark technologies as eligible in the novelty tab.",
  "DCI / comercial": "INN / brand name",
  "Tipología": "Technology type",
  "Código ATC: clasificación anatómica, terapéutica y química de la OMS para medicamentos.":
    "ATC code: the WHO Anatomical Therapeutic Chemical classification for medicines.",

  // Enlace directo y cabecera
  "El enlace de tecnología no es válido.": "The technology link is not valid.",
  "Ver la tecnología que la absorbió (#{id})": "View the technology that absorbed it (#{id})",
  'La tecnología "{name}" fue excluida de {cycle} (causa: {reason}) al fusionarse con la #{id}. No aparece en el Listado Único.':
    'The technology "{name}" was excluded from {cycle} (reason: {reason}) when it was merged into #{id}. It does not appear in the Unified List.',
  'La tecnología "{name}" fue excluida de {cycle} (causa: {reason}). No aparece en el Listado Único.':
    'The technology "{name}" was excluded from {cycle} (reason: {reason}). It does not appear in the Unified List.',
  'La tecnología "{name}" fue excluida de {cycle} al fusionarse con la #{id}. No aparece en el Listado Único.':
    'The technology "{name}" was excluded from {cycle} when it was merged into #{id}. It does not appear in the Unified List.',
  'La tecnología "{name}" fue excluida de {cycle}. No aparece en el Listado Único.':
    'The technology "{name}" was excluded from {cycle}. It does not appear in the Unified List.',
  "No se pudo abrir la tecnología del enlace": "Could not open the technology in the link",
  "Fusiones por revisar": "Merges to review",
  "Fusiones confirmadas": "Confirmed merges",
  "Por filtrar": "To be screened",
  "Aptas": "Eligible",
  "Novedad verificada": "Novelty verified",
  "{n} cruzadas con INVIMA": "{n} cross-checked with INVIMA",
  "Filtrado y depuración": "Screening and clean-up",
  "Módulo 2 de la especificación en {code}: desduplicación difusa, criterio de novedad con verificación regulatoria y Listado Único por clúster.":
    "Module 2 of the specification in {code}: fuzzy deduplication, novelty criterion with regulatory verification and Unified List by cluster.",
  "Módulo 2 de la especificación: desduplicación difusa, criterio de novedad con verificación regulatoria y Listado Único por clúster.":
    "Module 2 of the specification: fuzzy deduplication, novelty criterion with regulatory verification and Unified List by cluster.",
  "Módulo 2": "Module 2",
  "Ejecutar el barrido difuso y resolver los pares propuestos: fusionar o declarar que son distintas.":
    "Run the fuzzy sweep and resolve the proposed pairs: merge them or declare that they are different.",
  "Cruzar cada tecnología con el índice del INVIMA y registrar por qué vía es novedosa.":
    "Cross-check each technology against the INVIMA index and record the pathway by which it is novel.",
  "Marcar como apta lo que supera el filtro; excluir con causa tipificada lo que no.":
    "Mark as eligible whatever passes the screening; exclude whatever does not, with a predefined reason.",
  "Consolidar y exportar el Listado Único por clúster.": "Consolidate and export the Unified List by cluster.",
  "Priorización P1 a P6": "Prioritization P1 to P6",
};
