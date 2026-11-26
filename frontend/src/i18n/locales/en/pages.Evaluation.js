// src/pages/Evaluation.jsx — Fase 3: expediente editorial y revisión por pares.
export default {
  // Etiquetas de los campos del expediente
  "Condición de salud": "Health condition",
  "Mecanismo biológico o tecnológico": "Biological or technological mechanism",
  "Población objetivo en Colombia": "Target population in Colombia",
  "Estado del arte de la evidencia clínica": "State of the art of the clinical evidence",
  "Comparadores posibles en el SGSSS": "Possible comparators in the SGSSS",
  "Riesgos potenciales de adopción": "Potential adoption risks",
  "Narrativa del informe": "Report narrative",
  "Fases de ensayos": "Trial phases",
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

  // Ayuda por campo
  "Enfermedad o problema de salud al que se dirige, con su carga en Colombia si se conoce.":
    "Disease or health problem it addresses, with its burden in Colombia if known.",
  "Cómo actúa la tecnología (mecanismo biológico o principio tecnológico).":
    "How the technology works (biological mechanism or technological principle).",
  "Quiénes la usarían en Colombia y cuántos pacientes aproximadamente.":
    "Who would use it in Colombia and approximately how many patients.",
  "Fases de ensayos disponibles y calidad de la evidencia de eficacia y seguridad.":
    "Trial phases available and quality of the efficacy and safety evidence.",
  "Riesgos para el sistema: presupuesto, infraestructura, entrenamiento, equidad.":
    "Risks for the health system: budget, infrastructure, training, equity.",
  "Síntesis del informe en lenguaje para tomadores de decisión.":
    "Summary of the report in language for decision-makers.",
  "Ensayos por fase, con identificadores (NCT) cuando existan.":
    "Trials by phase, with identifiers (NCT) where available.",
  "Resultados de eficacia: desenlace, magnitud del efecto e incertidumbre.":
    "Efficacy results: outcome, effect size and uncertainty.",
  "Eventos adversos relevantes y su frecuencia.": "Relevant adverse events and their frequency.",
  "P de PICO: población de la pregunta de evaluación.": "P in PICO: population of the assessment question.",
  "I de PICO: la tecnología evaluada, dosis y vía.":
    "I in PICO: the technology being assessed, dose and route of administration.",
  "C de PICO: alternativa vigente en el SGSSS contra la que se compara.":
    "C in PICO: current alternative in the SGSSS against which it is compared.",
  "O de PICO: desenlaces que importan (clínicos y de calidad de vida).":
    "O in PICO: outcomes that matter (clinical and quality of life).",
  "Impacto presupuestal estimado del primer año, en COP (ej. 3.200 millones).":
    "Estimated budget impact for the first year, in COP (e.g. 3,200 million).",
  "Impacto presupuestal estimado del segundo año, en COP.": "Estimated budget impact for the second year, in COP.",
  "Impacto presupuestal estimado del tercer año, en COP.": "Estimated budget impact for the third year, in COP.",
  "Qué no se sabe todavía y cómo cambiaría la recomendación.":
    "What is not yet known and how it would change the recommendation.",
  "Registro opcional de diálogos tempranos con MSPS, INVIMA o desarrolladores (D-12).":
    "Optional record of early dialogues with MSPS, INVIMA or developers (D-12).",

  // Flujo editorial
  "Flujo editorial": "Editorial workflow",
  "Borrador": "Draft",
  "Interna": "Internal",
  "Externa": "External",
  "Observado": "Comments",
  "Comité": "Committee",
  "Publicado": "Published",
  "Qué es {termino}": "What {termino} means",
  "Invitado": "Invited",
  "Pendiente": "Pending",
  "Invitación enviada por correo": "Invitation sent by email",
  "En lectura": "Reading",
  "Aprobado": "Approved",
  "Revocado": "Revoked",
  "Enviar a revisión interna": "Send to internal review",
  "Pasar a revisión externa": "Move to external review",
  "Devolver con observaciones": "Return with comments",
  "Aprobar en comité": "Approve in committee",
  "Publicar": "Publish",
  "Regresar a borrador": "Return to draft",

  // Grupos de campos y vista del expediente
  "Ficha técnica": "Technical sheet",
  "Informe de evaluación": "Assessment report",
  "Mini-HTA: PICO e impacto presupuestal": "Mini-HTA: PICO and budget impact",
  "Informe de evaluación temprana": "Early assessment report",
  "Mini-HTA": "Mini-HTA",
  "Diálogo temprano": "Early dialogue",
  "Ciclo institucional": "Institutional cycle",

  // Mensajes
  "El enlace de tecnología no es válido.": "The technology link is not valid.",
  "La tecnología #{id} no aparece en la cola de evaluación de {ciclo}.":
    "Technology #{id} does not appear in the assessment queue of {ciclo}.",
  "este ciclo": "this cycle",
  "No se pudo cargar la cola de evaluación": "Could not load the assessment queue",
  "No se pudo abrir la tecnología del enlace": "Could not open the technology in the link",
  "No se pudo abrir el expediente": "Could not open the dossier",
  "Expediente abierto como {nivel}. Firme el COI para empezar.":
    "Dossier opened as {nivel}. Sign the COI declaration to begin.",
  "Guardado v{version}": "Saved v{version}",
  "No se pudo guardar": "Could not save",
  "Declaración registrada. Ya puede leer el informe.": "Declaration recorded. You can now read the report.",
  "No se pudo firmar el conflicto de interés": "Could not sign the conflict of interest declaration",
  "Estado editorial: {estado}": "Editorial status: {estado}",
  "La transición fue rechazada": "The transition was rejected",
  "Invitación enviada por correo a {correo}.": "Invitation sent by email to {correo}.",
  "Invitación creada. El enlace se copió al portapapeles.": "Invitation created. The link was copied to the clipboard.",
  "Invitación creada. Copie el enlace ahora: solo se muestra una vez.":
    "Invitation created. Copy the link now: it is shown only once.",
  "Revisor interno asignado. Debe firmar su COI al abrir el expediente.":
    "Internal reviewer assigned. They must sign their COI declaration when opening the dossier.",
  "No se pudo invitar": "Could not send the invitation",
  "Enlace copiado.": "Link copied.",
  "El navegador no permitió copiar. Seleccione el enlace y cópielo a mano.":
    "The browser did not allow copying. Select the link and copy it manually.",
  "Invitación revocada. El enlace ya no abre el portal.": "Invitation revoked. The link no longer opens the portal.",
  "No se pudo revocar la invitación": "Could not revoke the invitation",
  "Observación registrada": "Comment recorded",
  "No se pudo comentar": "Could not add the comment",
  "Si no se abrió una pestaña nueva, permita las ventanas emergentes para este sitio.":
    "If a new tab did not open, allow pop-ups for this site.",
  "No se pudo exportar": "Could not export",
  "No se pudo generar el PDF": "Could not generate the PDF",

  // Pantalla
  "Seleccione un ciclo": "Select a cycle",
  "La evaluación vive dentro del ciclo operativo. Elija uno en la cabecera o en Ciclos de escaneo.":
    "Assessment takes place within the operational cycle. Choose one in the header or in Scanning cycles.",
  "Ir a ciclos": "Go to cycles",
  "Cargando evaluación...": "Loading assessment...",
  "En cola##tecnologias": "In queue",
  "Tecnologías priorizadas, en evaluación o publicadas en este ciclo.":
    "Technologies prioritized, in assessment or published in this cycle.",
  "Con expediente": "With a dossier",
  "Tienen ficha, informe o Mini-HTA abierto.": "They have an open technical sheet, report or Mini-HTA.",
  "Publicados": "Published",
  "Evaluación": "Assessment",
  "Fase 3 · {ciclo}. Expediente editorial: ficha, informe o Mini-HTA con revisión por pares.":
    "Phase 3 · {ciclo}. Editorial dossier: technical sheet, report or Mini-HTA with peer review.",
  "Fase 3 · Expediente editorial: ficha, informe o Mini-HTA con revisión por pares.":
    "Phase 3 · Editorial dossier: technical sheet, report or Mini-HTA with peer review.",
  "Fase 3": "Phase 3",
  "Abra el expediente de cada priorizada y complete la ficha, el informe o el Mini-HTA según el puntaje.":
    "Open the dossier for each prioritized technology and complete the technical sheet, report or Mini-HTA according to the score.",
  "Declare conflicto de interés antes de leer o editar el expediente.":
    "Declare any conflict of interest before reading or editing the dossier.",
  "Invite un revisor interno y uno externo. El enlace externo dura 10 días.":
    "Invite one internal and one external reviewer. The external link lasts 10 days.",
  "Boletines del ciclo": "Cycle bulletins",
  "Nada en evaluación": "Nothing in assessment",
  "Pase tecnologías priorizadas a evaluación desde la matriz P1 a P6.":
    "Move prioritized technologies to assessment from the P1 to P6 matrix.",
  "Ir a priorización": "Go to prioritization",
  "Cola del ciclo": "Cycle queue",
  "sin expediente": "no dossier",
  "Esta tecnología priorizada ({puntos} puntos) aún no tiene expediente. Se sugiere <b>{nivel}</b>.":
    "This prioritized technology ({puntos} points) does not have a dossier yet. Suggested level: <b>{nivel}</b>.",
  "El ciclo está cerrado: no se abren expedientes nuevos.": "The cycle is closed: no new dossiers can be opened.",
  "Abrir expediente": "Open dossier",
  "Su perfil no redacta informes; un evaluador debe abrirlo.":
    "Your profile does not write reports; an assessor must open it.",
  "Abriendo expediente...": "Opening dossier...",

  // Conflicto de interés
  "Declaración de conflicto de interés": "Conflict of interest declaration",
  "Qué es el conflicto de interés": "What a conflict of interest is",
  "Sin declaración firmada no se habilita la lectura del informe, tampoco para el evaluador interno.":
    "Without a signed declaration the report cannot be read, not even by the internal assessor.",
  "Declaro no tener conflicto, o lo describo abajo, y acepto la confidencialidad.":
    "I declare that I have no conflict, or I describe it below, and I accept the confidentiality terms.",
  "Tengo un conflicto que debo declarar": "I have a conflict that I must declare",
  "Detalle del conflicto (si aplica)": "Details of the conflict (if applicable)",
  "Marque la aceptación de la declaración para continuar.": "Select the declaration acceptance box to continue.",
  "Describa el conflicto que declara.": "Describe the conflict you are declaring.",
  "Firmar y continuar": "Sign and continue",

  // Documento
  "Confidencial": "Confidential",
  "El ciclo está cerrado: el documento no se edita.": "The cycle is closed: the document cannot be edited.",
  "Guardar": "Save",
  "Ver campos": "View fields",
  "Ver expediente": "View dossier",
  "Exportar HTML institucional": "Export institutional HTML",
  "Descarga el documento institucional en PDF (A4).": "Downloads the institutional document as a PDF (A4).",
  "Descargar PDF": "Download PDF",
  "Título": "Title",
  "Nivel de producto (sugerido por puntaje; se puede cambiar)": "Product level (suggested by score; can be changed)",
  "Marcar como confidencial. No se publicará en el catálogo de expedientes.":
    "Mark as confidential. It will not be published in the dossier catalog.",
  "Qué implica confidencial": "What confidential implies",
  "Completitud {pct}%": "Completeness {pct}%",
  "Faltan: {campos}": "Missing: {campos}",

  // Invitación de revisores
  "Invitar revisor": "Invite reviewer",
  "Cómo funciona la invitación": "How the invitation works",
  "Tipo": "Type",
  "Externo (sin cuenta institucional, enlace de 10 días)": "External (no institutional account, 10-day link)",
  "Interno": "Internal",
  "Nombre": "Name",
  "Correo": "Email",
  "Generar invitación": "Generate invitation",
  "La invitación salió por correo. Guarde el enlace por si el revisor no la recibe.":
    "The invitation was sent by email. Keep the link in case the reviewer does not receive it.",
  "Sin correo configurado.": "Email is not configured.",
  "El enlace es personal y solo se muestra ahora.": "The link is personal and is shown only now.",
  "Copiado": "Copied",
  "Copiar enlace": "Copy link",
  "Revisores": "Reviewers",
  "Qué es la revisión por pares": "What peer review is",
  "Todavía no hay revisores asignados.": "No reviewers have been assigned yet.",
  "externo": "external",
  "interno": "internal",
  "COI firmado": "COI signed",
  "sin COI": "no COI",
  "vence {fecha}": "expires {fecha}",
  "Revocar": "Revoke",

  // Observaciones
  "Observación en línea": "Inline comment",
  "Qué es una observación en línea": "What an inline comment is",
  "Campo": "Field",
  "Documento completo": "Whole document",
  "Comentario": "Comment",
  "Escriba el comentario antes de registrarlo.": "Write the comment before recording it.",
  "Registrar observación": "Record comment",
  "Historial de versiones ({n})": "Version history ({n})",

  // Confirmaciones
  "Publicar documento": "Publish document",
  "El documento quedará publicado en la plataforma y, si no es confidencial, en el catálogo público de expedientes. La publicación no se deshace.":
    "The document will be published on the platform and, if it is not confidential, in the public dossier catalog. Publication cannot be undone.",
  "Revocar invitación": "Revoke invitation",
  "El enlace de {nombre} dejará de abrir el portal. La invitación queda en el historial.":
    "The link for {nombre} will no longer open the portal. The invitation remains in the history.",
  "este revisor": "this reviewer",
};
