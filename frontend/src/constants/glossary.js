/** Explicaciones en lenguaje sencillo para iconos de ayuda en toda la plataforma. */

export const GLOSSARY = {
  bandeja_trabajo:
    "Pantalla de inicio: resume lo que hay que atender hoy (bandeja, calificaciones pendientes y tecnologias priorizadas).",
  ciclo:
    "Ciclo de escaneo: periodo de trabajo (unas 10 a 16 semanas) en el que se captura, filtra, prioriza, evalua y publica un conjunto de tecnologias. La cuota formal es de tres ciclos por ano.",
  ciclo_cierre:
    "Al cerrar el ciclo se congelan los puntajes. Las tecnologias que quedaron en vigilancia se proponen para el ciclo siguiente.",
  corte_datos:
    "Fecha limite hasta la cual se aceptan senales nuevas en este ciclo. Lo que llegue despues espera al siguiente.",
  boletin:
    "Resumen ejecutivo del ciclo (epidemiologico y financiero) para MinSalud, INVIMA y otros tomadores de decision. Se publica despues de la aprobacion del lider.",
  vigilancia:
    "Busqueda automatica o programada en fuentes internacionales (ensayos, agencias, literatura) para detectar tecnologias que aun no estan en Colombia.",
  catalogo_fuentes:
    "Lista de sitios y bases de datos que el sistema vigila. Las de nivel A/B alimentan el pipeline; las demas lo enriquecen.",
  bandeja_entrada:
    "Bandeja (staging): senales recien capturadas que todavia no pertenecen a un ciclo. Hay que clasificarlas y arrastrarlas al ciclo activo.",
  staging:
    "Staging: area temporal donde llegan las senales crudas. Nada entra al ciclo sin clasificar cluster y tipologia.",
  postulacion:
    "Canal publico: un fabricante o investigador propone una tecnologia. Una persona del IETS debe aceptarla o rechazarla; no entra sola.",
  coi:
    "Conflicto de interes: relacion economica o profesional que podria sesgar el juicio. Debe declararse antes de aceptar una postulacion o una revision.",
  filtrado:
    "Quitar duplicados, confirmar que la tecnologia es novedosa para Colombia (cruzando con INVIMA) y armar el Listado Unico por grupo de enfermedad.",
  listado_unico:
    "Listado Unico: las tecnologias ya depuradas, sin duplicados, agrupadas por cluster. Es la entrada a la priorizacion.",
  desduplicacion:
    "El sistema propone pares que parecen la misma tecnologia (nombres parecidos). Usted confirma si se fusionan o si son distintas.",
  novedad:
    "Criterio de novedad: la tecnologia no esta disponible en el pais, o es una nueva indicacion, forma o combinacion. Se verifica con el indice del INVIMA.",
  invima:
    "INVIMA: autoridad sanitaria de Colombia. El cruce dice si el producto ya tiene registro sanitario en el pais.",
  priorizacion:
    "Calificar cada tecnologia con seis preguntas si/no (P1 a P6). Las que suman mas puntos pasan primero a evaluacion.",
  p16:
    "P1 a P6 son seis criterios oficiales. Cada si vale 1 punto. El evaluador tecnico califica P1, P5 y P6; el clinico, P2, P3 y P4.",
  pct_p:
    "%P: porcentaje de priorizacion. Solo aparece cuando los seis criterios estan calificados. Es (puntos / 6) x 100.",
  cribado:
    "Cribado: puntaje automatico de la senal (no es la priorizacion oficial). Un valor alto solo indica que conviene revisarla pronto.",
  senal:
    "Senal: noticia o registro de una tecnologia emergente capturada de una fuente. Todavia no es un expediente completo.",
  evaluacion:
    "Redactar la ficha, el informe o un Mini-HTA y pasarlo por revision de pares antes de publicarlo.",
  mini_hta:
    "Mini-HTA: informe corto de evaluacion de tecnologia sanitaria, mas profundo que una ficha. Suele pedirse cuando hay 6 puntos.",
  ficha:
    "Ficha tecnica: resumen estructurado de la tecnologia (indicacion, evidencia, fase, horizonte) para quien decide.",
  revision_pares:
    "Un revisor independiente lee el informe, declara conflicto de interes y lo aprueba o lo devuelve con observaciones.",
  flujo_editorial:
    "Camino del informe: borrador → revision interna → revision externa → observaciones (si las hay) → comite → publicado.",
  borrador: "El equipo todavia esta escribiendo el informe. No se ha enviado a revision.",
  revision_interna: "Un par interno del IETS revisa el texto antes de salir a revisores externos.",
  revision_externa: "Un experto externo lee el expediente. Debe declarar conflicto de interes.",
  observado: "El revisor pidio cambios. El equipo corrige y vuelve a enviar.",
  comite: "El comite institucional da el visto bueno final antes de publicar.",
  publicado: "El informe ya esta aprobado y puede ir al boletin, la ficha publica y el tablero.",
  diseminacion:
    "Compartir lo ya evaluado: informes, boletin, tablero y alertas para quien decide en el sistema de salud.",
  caracterizacion:
    "Completar los datos de la tecnologia (horizonte, fase, area terapeutica, evidencia) que alimentan el informe.",
  horizonte:
    "Horizonte temporal: que tan cerca esta del mercado (emergente, transicional o inminente), distinto de la condicion de novedad.",
  alertas:
    "Avisos automaticos: por ejemplo un ensayo fase III en Colombia o un cambio de fase en una tecnologia de alto costo.",
  bitacora:
    "Registro que no se puede borrar ni editar. Cada cambio queda con usuario, fecha y valores antes/despues, para reconstruir la historia.",
  rbac:
    "RBAC: cada persona tiene un perfil (superadmin, evaluador tecnico, clinico, tomador de decisiones o revisor) y solo ve o hace lo que ese perfil permite.",
  ocr:
    "OCR: la IA lee texto dentro de imagenes o PDFs de sitios web cuando la pagina no entrega datos estructurados.",
  minimax:
    "MiniMax: modelo de inteligencia artificial usado para resumir, extraer datos de sitios y apoyar la redaccion. No reemplaza el juicio del analista.",
  cluster:
    "Cluster: grupo de enfermedades o problemas de salud (cancer, huerfanas, alto costo, etc.) para organizar las tecnologias.",
  tipologia:
    "Tipologia: tipo de tecnologia (medicamento, terapia avanzada, dispositivo, diagnostico, procedimiento o salud digital).",
  fase:
    "Fase clinica: etapa de investigacion en humanos (I, II, III, IV) o si ya esta autorizada para venderse.",
  ttm:
    "Time-to-market: estimacion de cuantos meses faltan para que la tecnologia pueda llegar al mercado, segun fase III y aprobaciones FDA/EMA.",
  fda: "FDA: agencia reguladora de medicamentos y dispositivos de Estados Unidos. Su aprobacion es una senal de cercania al mercado.",
  ema: "EMA: agencia reguladora de medicamentos de la Union Europea.",
  sgsss:
    "SGSSS: Sistema General de Seguridad Social en Salud de Colombia. Es el marco contra el que se comparan costos y alternativas.",
  comparadores:
    "Tratamientos que ya se usan en Colombia para la misma enfermedad, contra los que se compara la nueva tecnologia.",
  datamart:
    "Datamart: copia de los numeros del ciclo guardada al cerrarlo, para que el tablero cargue rapido.",
  grafo:
    "Mapa de relaciones del ciclo. Cada nodo (ciclo, cluster, tecnologia o detalle) se puede ampliar y consultar con IA. La vista y el chat se pueden guardar.",
  tablero:
    "Resumen del ciclo para quien decide: cuantas tecnologias avanzaron, que tan cerca estan del mercado y cuanto podrian costar.",
  capturadas: "Tecnologias que ya se asignaron a este ciclo de trabajo.",
  filtradas: "Pasaron el filtro de novedad y no son duplicadas. Ya pueden priorizarse.",
  priorizadas: "Superaron el umbral de puntos P1-P6 y merecen ficha o informe.",
  evaluadas: "Ya tienen ficha, informe o Mini-HTA en curso o listo.",
  publicadas: "El informe ya fue aprobado y puede compartirse.",
  bajo_vigilancia:
    "No se priorizo en este ciclo, pero se sigue observando. Suele proponerse para el ciclo siguiente.",
  nivel_a:
    "Fuente de nivel A: contrato de datos estable (API o feed). Es la base mas confiable del pipeline automatico.",
};
