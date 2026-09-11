/** Explicaciones en lenguaje sencillo para iconos de ayuda en toda la plataforma. */

export const GLOSSARY = {
  bandeja_trabajo:
    "Pantalla de inicio: resume lo que hay que atender hoy (bandeja, calificaciones pendientes y tecnologías priorizadas).",
  ciclo:
    "Ciclo de escaneo: periodo de trabajo (unas 10 a 16 semanas) en el que se captura, filtra, prioriza, evalúa y publica un conjunto de tecnologías. La cuota formal es de tres ciclos por año.",
  ciclo_cierre:
    "Al cerrar el ciclo se congelan los puntajes. Las tecnologías que quedaron en vigilancia se proponen para el ciclo siguiente.",
  corte_datos:
    "Fecha límite hasta la cual se aceptan señales nuevas en este ciclo. Lo que llegue después espera al siguiente.",
  boletin:
    "Resumen ejecutivo del ciclo (epidemiológico y financiero) para MinSalud, INVIMA y otros tomadores de decisión. Se publica después de la aprobación del líder.",
  vigilancia:
    "Búsqueda automática o programada en fuentes internacionales (ensayos, agencias, literatura) para detectar tecnologías que aún no están en Colombia.",
  catalogo_fuentes:
    "Lista de sitios y bases de datos que el sistema vigila. Las de nivel A/B alimentan el pipeline; las demás lo enriquecen.",
  bandeja_entrada:
    "Bandeja (staging): señales recién capturadas que todavía no pertenecen a un ciclo. Hay que clasificarlas y arrastrarlas al ciclo activo.",
  staging:
    "Staging: área temporal donde llegan las señales crudas. Nada entra al ciclo sin clasificar clúster y tipología.",
  postulacion:
    "Canal público: un fabricante o investigador propone una tecnología. Una persona del IETS debe aceptarla o rechazarla; no entra sola.",
  coi:
    "Conflicto de interés: relación económica o profesional que podría sesgar el juicio. Debe declararse antes de aceptar una postulación o una revisión.",
  filtrado:
    "Quitar duplicados, confirmar que la tecnología es novedosa para Colombia (cruzando con INVIMA) y armar el Listado Único por grupo de enfermedad.",
  listado_unico:
    "Listado Único: las tecnologías ya depuradas, sin duplicados, agrupadas por clúster. Es la entrada a la priorización.",
  desduplicacion:
    "El sistema propone pares que parecen la misma tecnología (nombres parecidos). Usted confirma si se fusionan o si son distintas.",
  novedad:
    "Criterio de novedad: la tecnología no está disponible en el país, o es una nueva indicación, forma o combinación. Se verifica con el índice del INVIMA.",
  invima:
    "INVIMA: autoridad sanitaria de Colombia. El cruce dice si el producto ya tiene registro sanitario en el país.",
  priorizacion:
    "Calificar cada tecnología con seis preguntas sí/no (P1 a P6). Las que suman más puntos pasan primero a evaluación.",
  p16:
    "P1 a P6 son seis criterios oficiales. Cada sí vale 1 punto. El evaluador técnico califica P1, P5 y P6; el clínico, P2, P3 y P4.",
  pct_p:
    "%P: porcentaje de priorización. Solo aparece cuando los seis criterios están calificados. Es (puntos / 6) x 100.",
  cribado:
    "Cribado: puntaje automático de la señal (no es la priorización oficial). Un valor alto solo indica que conviene revisarla pronto.",
  senal:
    "Señal: noticia o registro de una tecnología emergente capturada de una fuente. Todavía no es un expediente completo.",
  evaluacion:
    "Redactar la ficha, el informe o un Mini-HTA y pasarlo por revisión de pares antes de publicarlo.",
  mini_hta:
    "Mini-HTA: informe corto de evaluación de tecnología sanitaria, más profundo que una ficha. Suele pedirse cuando hay 6 puntos.",
  ficha:
    "Ficha técnica: resumen estructurado de la tecnología (indicación, evidencia, fase, horizonte) para quien decide.",
  revision_pares:
    "Un revisor independiente lee el informe, declara conflicto de interés y lo aprueba o lo devuelve con observaciones.",
  flujo_editorial:
    "Camino del informe: borrador → revisión interna → revisión externa → observaciones (si las hay) → comité → publicado.",
  borrador: "El equipo todavía está escribiendo el informe. No se ha enviado a revisión.",
  revision_interna: "Un par interno del IETS revisa el texto antes de salir a revisores externos.",
  revision_externa: "Un experto externo lee el expediente. Debe declarar conflicto de interés.",
  observado: "El revisor pidió cambios. El equipo corrige y vuelve a enviar.",
  comite: "El comité institucional da el visto bueno final antes de publicar.",
  publicado: "El informe ya está aprobado y puede ir al boletín, la ficha pública y el tablero.",
  diseminacion:
    "Compartir lo ya evaluado: informes, boletín, tablero y alertas para quien decide en el sistema de salud.",
  caracterizacion:
    "Completar los datos de la tecnología (horizonte, fase, área terapéutica, evidencia) que alimentan el informe.",
  horizonte:
    "Horizonte temporal: qué tan cerca está del mercado (emergente, transicional o inminente), distinto de la condición de novedad.",
  alertas:
    "Avisos automáticos: por ejemplo un ensayo fase III en Colombia o un cambio de fase en una tecnología de alto costo.",
  bitacora:
    "Registro que no se puede borrar ni editar. Cada cambio queda con usuario, fecha y valores antes/después, para reconstruir la historia.",
  rbac:
    "RBAC: cada persona tiene un perfil (superadmin, evaluador técnico, clínico, tomador de decisiones o revisor) y solo ve o hace lo que ese perfil permite.",
  ocr:
    "OCR: la IA lee texto dentro de imágenes o PDFs de sitios web cuando la página no entrega datos estructurados.",
  minimax:
    "MiniMax: modelo de inteligencia artificial usado para resumir, extraer datos de sitios y apoyar la redacción. No reemplaza el juicio del analista.",
  cluster:
    "Clúster: grupo de enfermedades o problemas de salud (cáncer, huérfanas, alto costo, etc.) para organizar las tecnologías.",
  tipologia:
    "Tipología: tipo de tecnología (medicamento, terapia avanzada, dispositivo, diagnóstico, procedimiento o salud digital).",
  fase:
    "Fase clínica: etapa de investigación en humanos (I, II, III, IV) o si ya está autorizada para venderse.",
  ttm:
    "Time-to-market: estimación de cuántos meses faltan para que la tecnología pueda llegar al mercado, según fase III y aprobaciones FDA/EMA.",
  fda: "FDA: agencia reguladora de medicamentos y dispositivos de Estados Unidos. Su aprobación es una señal de cercanía al mercado.",
  ema: "EMA: agencia reguladora de medicamentos de la Union Europea.",
  sgsss:
    "SGSSS: Sistema General de Seguridad Social en Salud de Colombia. Es el marco contra el que se comparan costos y alternativas.",
  comparadores:
    "Tratamientos que ya se usan en Colombia para la misma enfermedad, contra los que se compara la nueva tecnología.",
  datamart:
    "Datamart: copia de los números del ciclo guardada al cerrarlo, para que el tablero cargue rápido.",
  grafo:
    "Mapa de relaciones del ciclo. Cada nodo (ciclo, clúster, tecnología o detalle) se puede ampliar y consultar con IA. La vista y el chat se pueden guardar.",
  tablero:
    "Resumen del ciclo para quien decide: cuántas tecnologías avanzaron, qué tan cerca están del mercado y cuánto podrían costar.",
  capturadas: "Tecnologías que ya se asignaron a este ciclo de trabajo.",
  filtradas: "Pasaron el filtro de novedad y no son duplicadas. Ya pueden priorizarse.",
  priorizadas: "Superaron el umbral de puntos P1-P6 y merecen ficha o informe.",
  evaluadas: "Ya tienen ficha, informe o Mini-HTA en curso o listo.",
  publicadas: "El informe ya fue aprobado y puede compartirse.",
  bajo_vigilancia:
    "No se priorizó en este ciclo, pero se sigue observando. Suele proponerse para el ciclo siguiente.",
  nivel_a:
    "Fuente de nivel A: contrato de datos estable (API o feed). Es la base más confiable del pipeline automático.",

  // --- Frente A: flujo metodologico (ciclos, bandeja, filtrado, priorizacion, evaluacion, diseminacion) ---
  fa_ventana:
    "Ventana operativa: semanas entre la apertura y la fecha proyectada de boletín (o el corte de datos si no hay boletín). La metodología exige entre 10 y 16 semanas.",
  fa_cuota:
    "Cuota anual: máximo de ciclos formales por año calendario (parámetro cycle.max_per_year, hoy 3). El ciclo histórico no cuenta.",
  fa_codigo_ciclo: "Nombre único del ciclo, por ejemplo 'Ciclo I - 2027'. No puede repetirse.",
  fa_apertura: "Primer día de trabajo del ciclo. Define el año al que cuenta para la cuota.",
  fa_ciclo_en_configuracion: "El ciclo se está preparando: fechas y notas. Aún no recibe trabajo de filtrado.",
  fa_ciclo_en_filtrado: "Se depuran duplicados y se verifica la novedad frente al INVIMA.",
  fa_ciclo_en_priorizacion: "Los evaluadores califican P1 a P6 las tecnologías aptas.",
  fa_ciclo_en_evaluacion: "Las priorizadas se documentan como ficha, informe o Mini-HTA con revisión por pares.",
  fa_ciclo_cerrado_consolidado:
    "Ciclo cerrado: puntajes congelados, datamart y boletín compilados. No admite cambios.",
  fa_transicion:
    "Mueve el ciclo a otra etapa. Solo se permiten los pasos de la máquina de estados; se puede retroceder hasta antes del cierre.",
  fa_cerrar:
    "Cierra y consolida: congela todos los puntajes, compila el boletín y refresca el datamart. Solo el superadministrador. Es irreversible.",
  fa_arrastre:
    "Lleva a un ciclo abierto las tecnologías que quedaron bajo vigilancia en este ciclo cerrado. Entran como aptas para priorización y muestran su %P anterior como referencia.",
  fa_eliminar_ciclo:
    "Solo se elimina un ciclo creado por error: en configuración y sin tecnologías, expedientes ni boletines. La baja queda en la bitácora.",
  fa_embudo_asignadas: "Asignadas al ciclo que aún esperan la verificación de novedad.",
  fa_embudo_filtradas: "Pasaron el filtro de novedad y esperan calificación P1 a P6.",
  fa_embudo_priorizadas: "Sumaron 4 o más puntos: pasan a evaluación temprana.",
  fa_embudo_vigilancia: "Sumaron 3 puntos: se siguen observando y se arrastran al ciclo siguiente.",
  fa_embudo_evaluacion: "Tienen expediente abierto (ficha, informe o Mini-HTA) en curso.",
  fa_embudo_publicadas: "Su expediente ya fue publicado tras la revisión por pares.",
  fa_sin_asignar: "Señales capturadas que todavía no pertenecen a ningún ciclo.",
  fa_total_capturadas: "Todas las tecnologías registradas en el sistema, asignadas o no.",
  fa_sin_cluster: "Señales sin clúster confirmado. No pueden entrar a un ciclo hasta clasificarlas.",
  fa_sin_tipologia: "Señales sin tipología confirmada. No pueden entrar a un ciclo hasta clasificarlas.",
  fa_listas_asignar: "Señales de esta página con clúster y tipología: se pueden asignar ya.",
  fa_condicion:
    "Condición: emergente (en fase clínica II o III, antes de la aprobación) o nueva (aprobada en agencia de referencia hace 12 meses o menos). Es distinta del horizonte.",
  fa_sugerir:
    "El clasificador propone clúster y tipología a partir de CIE-10, MeSH y palabras clave de la señal. La propuesta siempre la confirma una persona.",
  fa_asignar_lote:
    "Asigna al ciclo en pantalla las señales seleccionadas que ya tienen clúster y tipología. Las demás quedan en la bandeja con el motivo.",
  fa_fechas_regulatorias:
    "Las fechas de aprobación FDA/EMA y de fin de fase III alimentan el pre-llenado de P1, P5 y P6 y el cálculo de time-to-market.",
  fa_estado_regulatorio:
    "Trámite ante agencias de referencia (ej. 'Sometido a FDA'). Si indica trámite en curso, P6 se sugiere como Sí.",
  fa_fusiones_revisar: "Pares de registros que el barrido propone como posible misma tecnología. Esperan decisión humana.",
  fa_fusiones_confirmadas: "Pares que una persona confirmó como la misma tecnología. El absorbido queda trazado, no borrado.",
  fa_por_filtrar: "Tecnologías del ciclo en estado 'asignada' que aún no pasan la verificación de novedad.",
  fa_aptas: "Pasaron el filtro de novedad y ya están en la cola de priorización.",
  fa_excluidas: "Salieron del ciclo con una causa tipificada e inmutable.",
  fa_novedad_verificada: "Tecnologías con vía de novedad registrada; debajo, cuántas se cruzaron con el índice del INVIMA.",
  fa_barrido:
    "Compara nombre comercial, DCI, NCT y fabricante del acervo del ciclo con tres algoritmos y deja propuestas de fusión sobre el umbral de similitud.",
  fa_confirmar_fusion:
    "Fusiona el par: el registro elegido se conserva y absorbe los datos que solo tenía el otro. El absorbido sale del Listado Único. No se deshace.",
  fa_descartar_fusion: "Declara que el par son tecnologías distintas. El barrido no lo volverá a proponer.",
  fa_levenshtein: "Levenshtein: detecta erratas y transliteraciones (Trastuzumab / Trastuzumap).",
  fa_jaro: "Jaro-Winkler: premia el prefijo común, donde vive la raíz del principio activo.",
  fa_token_sort: "Token sorting: detecta el mismo nombre con las palabras en otro orden.",
  fa_fabricante_sim:
    "Similitud de fabricante: solo pesa en los extremos (misma casa o casas claramente distintas); en la franja media no decide.",
  fa_via_novedad:
    "Por qué la tecnología es nueva para Colombia: no disponible en el país, nueva indicación, nueva forma farmacéutica o nueva combinación.",
  fa_justificacion_novedad:
    "Obligatoria (20 caracteres o más) cuando la vía no es 'no disponible en el país': explique por qué sigue siendo novedosa pese al registro.",
  fa_cruce_invima:
    "Busca la tecnología en la copia local del índice de registros sanitarios del INVIMA y deja la evidencia fechada. Es requisito para marcarla apta.",
  fa_sala_especializada:
    "Concepto de la Sala Especializada del INVIMA, si existe. Registre el resumen y la referencia del acta (número o enlace).",
  fa_marcar_apta:
    "Pasa la tecnología a la cola de priorización. Exige vía de novedad registrada y cruce con el INVIMA.",
  fa_excluir:
    "Saca la tecnología del ciclo con una causa tipificada. La causa queda con fecha y evaluador y no se puede cambiar.",
  fa_listado_csv: "Descarga el Listado Único del ciclo en CSV (separado por punto y coma, abre en Excel).",
  fa_en_cola: "Tecnologías del ciclo sujetas a calificación: aptas, priorizadas, bajo vigilancia o no priorizadas.",
  fa_pendientes: "Tecnologías de la cola a las que aún les falta algún criterio P1 a P6.",
  fa_priorizada: "Priorizada: 4 a 6 puntos. Pasa a evaluación temprana.",
  fa_bajo_vigilancia: "Bajo vigilancia: 3 puntos. Se sigue observando y se arrastra al ciclo siguiente.",
  fa_no_priorizada: "No priorizada: 0 a 2 puntos. Queda como archivo histórico del ciclo.",
  fa_franjas:
    "Franjas por conteo de puntos (decisión D-02): 4 o más priorizada, 3 bajo vigilancia, 2 o menos no priorizada. El porcentaje es solo una etiqueta.",
  fa_solo_mio: "Muestra solo las tecnologías a las que les falta un criterio que su perfil puede calificar.",
  fa_le_toca: "Falta al menos un criterio que su perfil califica.",
  fa_pasar_evaluacion:
    "Abre el expediente de evaluación temprana (ficha, informe o Mini-HTA según los puntos) y saca la tecnología de la matriz: su calificación queda fija.",
  fa_arrastrada: "Viene arrastrada de un ciclo anterior en el que quedó bajo vigilancia; se muestra su %P previo.",
  fa_justificacion_criterio:
    "Justificación opcional pero recomendada: queda con su calificación en la bitácora y ayuda en auditorías.",
  fa_criterio_bloqueado: "Este criterio lo califica otro perfil. Usted puede consultarlo pero no modificarlo.",
  fa_nivel_producto:
    "Nivel del documento: ficha (resumen), informe (con evidencia) o Mini-HTA (con PICO e impacto presupuestal). Se sugiere por puntos y se puede cambiar.",
  fa_completitud: "Porcentaje de campos obligatorios del nivel elegido que ya tienen contenido.",
  fa_confidencial:
    "Un documento confidencial nunca aparece en el catálogo público de expedientes, aunque se publique.",
  fa_abrir_expediente:
    "Crea el expediente de evaluación de esta tecnología priorizada y la pasa a 'en evaluación'.",
  fa_invitar_revisor:
    "Externo: recibe un enlace personal que vence en 10 días, sin cuenta institucional. Interno: un par del IETS. Para publicar se necesita al menos uno de cada tipo con COI firmado.",
  fa_revocar: "Anula la invitación: el enlace deja de abrir el portal. La fila queda en el historial.",
  fa_observacion: "Comentario anclado a un campo del documento y a la versión vigente. Lo ven el equipo y los revisores.",
  fa_exportar_html: "Abre la versión institucional imprimible. Use Imprimir > Guardar como PDF para el entregable formal.",
  fa_historial: "Cada guardado y cada transición crea una versión (mayor.menor) que permite reconstruir el documento.",
  fa_tr_revision_interna: "Envía el borrador a la revisión interna de calidad. Exige todos los campos obligatorios completos.",
  fa_tr_revision_externa: "Pasa el documento a los revisores externos invitados.",
  fa_tr_borrador: "Devuelve el documento a borrador para corregirlo.",
  fa_tr_con_observaciones: "Registra que la revisión externa pidió cambios; el equipo corrige en borrador.",
  fa_tr_aprobado_comite: "Registra el visto bueno del comité técnico. El siguiente paso es publicar.",
  fa_tr_publicado:
    "Publica el documento en la plataforma. Exige un revisor interno y uno externo con COI firmado. No se deshace.",
  fa_compilar_boletin:
    "Recalcula el boletín con las cifras actuales del ciclo. Si ya estaba aprobado, la aprobación se anula porque cambió el contenido.",
  fa_aprobar_boletin: "Visto bueno del líder sobre las cifras compiladas. Es requisito para publicar.",
  fa_publicar_boletin: "Publica el boletín aprobado. No se deshace.",
  fa_suscripcion:
    "Reciba avisos de todos los clústeres o solo de los que le interesan. Puede desactivarlos cuando quiera.",
  fa_canal_correo:
    "Si el IETS configuró el servidor de correo (SMTP), las alertas y las invitaciones también llegan por correo.",

  // ---------------------------------------------------------------------- //
  // Frente B: operacion, captura y CRUDs (fuentes, vigilancia, senales,
  // notas, diseminacion, postulaciones, chat, configuracion y auditoria).
  // ---------------------------------------------------------------------- //
  fb_adaptador:
    "Adaptador (conector): el programa que sabe leer esta fuente. Los de API (ClinicalTrials, openFDA, EMA, PubMed...) traen datos estructurados; 'html' y 'pdf' rastrean páginas cuando no hay API; 'manual' es curaduría humana.",
  fb_url:
    "Dirección que consulta el adaptador: la API o la página a rastrear. Debe iniciar con http:// o https://. Algunos adaptadores (manual, fixture) no la necesitan.",
  fb_frecuencia:
    "Cada cuánto se vuelve a consultar esta fuente. La vigilancia programada solo la encola cuando su frecuencia ya venció, para no saturar a la fuente.",
  fb_nivel:
    "Nivel de la fuente según su contrato de datos: A = API estable, B = feed o descarga oficial, C = página estructurada, D = página que solo confirma, E = curaduría humana. Una fuente D o E nunca sobreescribe un dato que ya trajo una A o B.",
  fb_salud:
    "Resultado de la última sonda. Verde: responde y el formato coincide. Ámbar: responde pero cambió el formato o vino vacía (la ingesta se suspende). Rojo: no responde. Sin sonda: aún no se ha probado.",
  fb_ingesta:
    "Si está activa, la fuente entra en la vigilancia masiva y en la programada. Apagarla no borra nada: solo deja de consultarse.",
  fb_contraste:
    "Fuente de contraste: otro sistema de escaneo (PCORI, NIHRIO, CDA-AMC...) que sirve para medir si al IETS se le escapó alguna tecnología.",
  fb_retirada:
    "Fuente del inventario anterior que ya no está en el catálogo verificado D-06. Se conserva por sus señales, pero la cola de ingesta la ignora.",
  fb_config_conector:
    "Parámetros del adaptador en formato JSON (por ejemplo filtros de búsqueda, columnas de un archivo o un lote de registros cargado a mano). Déjelo vacío si no sabe qué poner.",
  fb_alta_rapida:
    "Registra una página solo con nombre y URL. Queda como rastreo HTML de nivel D, frecuencia semanal y con ingesta activa; luego puede completarla en Editar.",
  fb_sonda:
    "Prueba rápida de salud: consulta la fuente sin guardar datos y dice si responde y si el formato sigue igual.",
  fb_ingerir:
    "Consulta esta fuente ahora mismo y deja las señales nuevas en la bandeja de entrada. Puede tardar unos segundos.",
  fb_recargar_catalogo:
    "Vuelve a aplicar el catálogo verificado D-06: actualiza las fuentes oficiales y retira las que ya no están. No borra señales.",
  fb_sondear_ab:
    "Ejecuta la sonda de salud sobre las fuentes de nivel A y B, que son las que sostienen el pre-llenado de P1, P5 y P6.",
  fb_eliminar_fuente:
    "Solo se eliminan fuentes agregadas a mano que aún no produjeron señales. Las del catálogo o con señales se deshabilitan: las señales son registro de captura.",
  fb_cobertura:
    "Tecnologías que aparecen en fuentes de contraste pero no en el ciclo. Cada hueco debe justificarse o incorporarse.",
  fb_cola:
    "Trabajos de ingesta: uno por fuente. Pendiente = en espera; ejecutando = en curso; ok = terminó; parcial = trajo parte; error = falló (se reintenta hasta 3 veces con espera creciente).",
  fb_vista_previa:
    "Muestra que información extraería el sistema de un enlace, sin guardar nada. Útil antes de registrar una fuente nueva.",
  fb_programada:
    "Vigilancia programada: cada cierto número de horas el sistema revisa qué fuentes vencieron según su frecuencia y las encola solo, sin que nadie oprima un botón.",
  fb_intervalo_vigilancia:
    "Cada cuántas horas el sistema revisa qué fuentes vencieron. No cambia la frecuencia de cada fuente: una fuente mensual no se consulta cada 6 horas.",
  fb_barrido_duplicados:
    "Barrido de duplicados programado: compara las tecnologías del ciclo activo y deja propuestas de fusión. Nunca fusiona solo; avisa en Alertas cuando hay propuestas nuevas.",
  fb_worker:
    "Proceso en segundo plano que atiende la cola y las tareas programadas sin frenar la aplicación web.",
  fb_registro_ejecucion:
    "Historial de cada ejecución programada o manual: cuándo empezó, cuánto encoló, cuántas señales nuevas trajo y si hubo errores.",
  fb_cribado:
    "Puntaje automático de 0 a 100 que solo ordena la cola: indica que conviene revisar primero. No es la priorización oficial P1-P6.",
  fb_estado_senal:
    "Estado de triage de la señal: nuevo (sin revisar), revisado, priorizado (vale la pena seguirla) o descartado (ruido o no pertinente).",
  fb_eliminar_senal:
    "Elimina una señal capturada por error mientras siga en la bandeja sin asignar. Si ya entró a un ciclo es parte del expediente: márquela como descartada.",
  fb_enriquecer:
    "La IA reescribe el resumen y sugiere tipo, horizonte, fase y área terapéutica. Revise el resultado: es un borrador.",
  fb_ia_apagada:
    "La IA no está configurada. Un superadministrador puede activarla en Configuración > Integración con IA.",
  fb_generar_informe:
    "Genera una recomendación de adopción para Colombia a partir de la señal. Sin IA configurada se crea una versión preliminar para completar a mano.",
  fb_nota_vinculo:
    "Elemento al que pertenece la nota: una señal, una fuente, un informe o ninguno (nota general del equipo).",
  fb_nota_fijar:
    "Una nota fijada aparece primero en las listas. Cualquier perfil que escribe notas puede fijarla o soltarla.",
  fb_nota_autor:
    "Solo el autor o un superadministrador puede editar o eliminar una nota.",
  fb_impacto:
    "Impacto esperado de adoptar la tecnología en Colombia (clínico, presupuestal y de equidad): alto, medio o bajo.",
  fb_origen_informe:
    "Cómo se produjo el texto: el modelo de IA usado, 'fallback (sin IA)' para la versión preliminar o 'manual'. 'editado' indica que una persona lo corrigió.",
  fb_paquete:
    "Descarga un ZIP del ciclo con el Listado Único, los informes de evaluación aprobados o publicados, las recomendaciones, sus notas y el boletín publicado. Nunca incluye documentos confidenciales.",
  fb_estado_postulacion:
    "Recibida: espera moderación. Aceptada: ya está en la bandeja de entrada como señal reactiva. Rechazada: no entra, con el motivo registrado.",
  fb_recaptcha:
    "Verificación anti-robot de Google (reCAPTCHA v3). Es invisible para la persona. Sin llaves configuradas el formulario opera en modo degradado con tope por IP.",
  fb_moderar:
    "Aceptar crea la tecnología en la bandeja de entrada marcada como reactiva, con la declaración de conflicto de interés adjunta. Rechazar exige un motivo.",
  fb_chat:
    "El asistente responde con lo que hay en el sistema (señales y fuentes) y cita de dónde lo sacó. Sin IA muestra el contexto encontrado en lugar de redactar.",
  fb_llave_openfda:
    "Llave gratuita de api.data.gov. Sube el cupo de openFDA de 1.000 a 120.000 consultas por día.",
  fb_llave_ncbi:
    "Llave gratuita de NCBI. Permite 10 consultas por segundo a PubMed en lugar de 3.",
  fb_correo_ncbi:
    "NCBI pide un correo de contacto en cada consulta. Use el buzón institucional del equipo.",
  fb_cluster_codigo:
    "Identificador corto y estable (minúsculas, números y guion bajo). No se puede cambiar después: las tecnologías quedan ligadas a el.",
  fb_palabras_clave:
    "Palabras separadas por coma que el clasificador busca en la indicación para sugerir este clúster o tipología.",
  fb_param:
    "Parámetro metodológico: se aplica de inmediato a los ciclos abiertos; los ciclos cerrados conservan el resultado que obtuvieron. Cada cambio queda en la bitácora.",
  fb_audit_entidad:
    "Tipo de registro que cambió (fuente, señal, ciclo, calificación...). Use 'Vida' para ver toda la historia de ese registro.",
  fb_audit_accion:
    "create = alta, update = cambio, delete = baja. Las demás son eventos de negocio (cierre de ciclo, asignación por lotes, ingesta, etc.).",
  fb_audit_ip:
    "Dirección desde la que se hizo la petición. Si está vacía, la acción la hizo un proceso interno.",
  fb_audit_vida:
    "Reconstruye en orden cronológico todo lo que le pasó a este registro, desde su creación.",
};
