"""Datos semilla: inventario de fuentes de escaneo de horizonte del IETS.

Contiene las 24 fuentes del inventario institucional (IETS_Escaneo_Horizonte_
Inventario.xlsx) mas fuentes adicionales de repositorios de horizon scanning
identificadas para ampliar la cobertura del sistema.
"""
from __future__ import annotations

# Categorias oficiales del inventario
CAT_PRODUCTO = "Producto directo IETS"
CAT_PARTICIPACION = "Participacion IETS (regional)"
CAT_CONTEXTO_CO = "Contexto Colombia (divulgativo)"
CAT_CONTEXTO_MINSALUD = "Contexto MinSalud"
CAT_REFERENTE = "Referente internacional"

INVENTORY_SOURCES: list[dict] = [
    {
        "title": "Plataforma de Escaneo de Horizonte del IETS",
        "url": "https://boletines.iets.org.co/",
        "category": CAT_PRODUCTO,
        "authors": "Instituto de Evaluacion Tecnologica en Salud (IETS)",
        "year": "s.f.",
        "description": (
            "Sitio institucional que define el sistema de escaneo de horizonte (alerta temprana) "
            "del IETS: metodologia en 4 fases (identificacion, priorizacion con umbral >70%, "
            "descripcion y diseminacion por clusteres) y formulario de participacion de expertos. "
            "No expone boletines por cluster publicados."
        ),
        "relation_iets": "Autoria IETS - producto propio del programa de escaneo de horizonte",
        "language": "Espanol",
        "resource_type": "Sitio web / micrositio",
        "link_status": "Activo (solo pagina de metodologia)",
        "tags": "IETS,metodologia,alerta temprana",
    },
    {
        "title": "Sitio principal del IETS",
        "url": "https://iets.org.co/",
        "category": CAT_PRODUCTO,
        "authors": "Instituto de Evaluacion Tecnologica en Salud (IETS)",
        "year": "2026",
        "description": (
            "Portal institucional del IETS: evaluacion de tecnologias, GPC, evaluaciones economicas, "
            "analisis de impacto presupuestal y notas tecnicas. Punto de entrada al repositorio de "
            "publicaciones."
        ),
        "relation_iets": "Autoria IETS - portal institucional",
        "language": "Espanol",
        "resource_type": "Sitio web",
        "link_status": "Activo",
        "tags": "IETS,portal,publicaciones",
    },
    {
        "title": "Sobre nosotros - IETS",
        "url": "https://iets.org.co/nosotros/sobre-nosotros/",
        "category": CAT_PRODUCTO,
        "authors": "Instituto de Evaluacion Tecnologica en Salud (IETS)",
        "year": "2026",
        "description": (
            "Descripcion del IETS como Agencia Nacional de Evaluacion de Tecnologia Sanitaria de "
            "Colombia; naturaleza juridica (Ley 1438/2011), reconocimiento como Centro de Investigacion "
            "de MinCiencias (Res. 0684/2024)."
        ),
        "relation_iets": "Autoria IETS - contexto institucional",
        "language": "Espanol",
        "resource_type": "Pagina web",
        "link_status": "Activo",
        "tags": "IETS,institucional",
    },
    {
        "title": (
            "Documento de base - IX Foro Latinoamericano de Politicas de HTAi 2024: "
            "'Navegando el Futuro: Escaneo del Horizonte y Dialogo Temprano en ETS'"
        ),
        "url": "https://htai.org/wp-content/uploads/2025/04/Documento-de-base-2024-VERSION-ESP.pdf",
        "category": CAT_PARTICIPACION,
        "authors": "HTAi / IECS (Instituto de Efectividad Clinica y Sanitaria)",
        "year": "2024",
        "description": (
            "Documento de base del foro realizado en Cartagena (Colombia). Tema central: escaneo de "
            "horizonte y dialogo temprano. Menciona a Colombia/IETS: los desarrolladores pueden "
            "solicitar analisis de horizonte a INVIMA o IETS, o un dialogo temprano al IETS (35-42 dias). "
            "Incluye experiencias de Brasil (CONITEC/EuroScan) y Canada (CDA)."
        ),
        "relation_iets": "Participacion IETS - Colombia como sede; IETS referenciado como agencia de analisis de horizonte / dialogo temprano",
        "language": "Espanol",
        "resource_type": "Documento tecnico (PDF)",
        "link_status": "Activo",
        "tags": "HTAi,foro,LATAM,dialogo temprano",
    },
    {
        "title": (
            "Navigating the future: horizon scanning and early dialogue in health technology "
            "assessment in Latin America (IJTAHC)"
        ),
        "url": "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12257038/",
        "category": CAT_PARTICIPACION,
        "authors": "Garcia Marti S; Stacco V; Pichon-Riviere A; Augustovski F; Alcaraz A; Espinoza MA (IECS-CONICET; PUC Chile)",
        "year": "2025",
        "description": (
            "Articulo revisado por pares (Int. J. Technol. Assess. Health Care, DOI "
            "10.1017/S0266462325100184) que sistematiza el Foro LATAM 2024 (59 representantes de 11 "
            "paises): barreras (ausencia de marco legal, datos limitados, capacidades) y soluciones "
            "(cooperacion regional, transparencia, programas piloto)."
        ),
        "relation_iets": "Participacion IETS - deriva del foro con sede en Colombia; contexto regional del que el IETS forma parte",
        "language": "Ingles",
        "resource_type": "Articulo cientifico (PMC)",
        "link_status": "Activo",
        "tags": "IJTAHC,LATAM,revision por pares",
    },
    {
        "title": "Escaneo de horizonte: Sabe que es y como puede participar en este proceso?",
        "url": "https://neuroeconomix.com/es/escaneo-de-horizonte-sabe-que-es-y-como-puede-participar-en-este-proceso/",
        "category": CAT_CONTEXTO_CO,
        "authors": "Lina Gomez - NeuroEconomix",
        "year": "2025",
        "description": (
            "Articulo divulgativo colombiano que explica el escaneo de horizonte como mecanismo de "
            "exploracion e identificacion de tecnologias emergentes previo a la aprobacion regulatoria "
            "y su introduccion en el mercado nacional."
        ),
        "relation_iets": "Contexto - no es IETS; util como material divulgativo del ecosistema colombiano",
        "language": "Espanol",
        "resource_type": "Articulo de blog",
        "link_status": "Activo",
        "tags": "Colombia,divulgacion",
    },
    {
        "title": "Medicamentos y Tecnologias en Salud (MinSalud)",
        "url": "https://www.minsalud.gov.co/salud/Paginas/home-medicamentos-y-tecnologias.aspx",
        "category": CAT_CONTEXTO_MINSALUD,
        "authors": "Ministerio de Salud y Proteccion Social (MSPS)",
        "year": "s.f.",
        "description": (
            "Pagina del MinSalud sobre politicas de acceso, calidad y uso racional de medicamentos, "
            "dispositivos y tecnologias en salud; definicion de tecnologia en salud segun INAHTA."
        ),
        "relation_iets": "Contexto normativo - no es escaneo de horizonte especifico; marco de ETS del sector",
        "language": "Espanol",
        "resource_type": "Pagina web",
        "link_status": "Activo",
        "tags": "MinSalud,normativa",
    },
    {
        "title": "Guia para la evaluacion de tecnologias de salud (ETS) en IPS",
        "url": "https://www.minsalud.gov.co/sites/rid/1/Guia_evalucaion_de_tecnoclogias_en_salud.pdf",
        "category": CAT_CONTEXTO_MINSALUD,
        "authors": "Ministerio de Salud y Proteccion Social (MSPS)",
        "year": "s.f.",
        "description": (
            "Guia de ETS a nivel de instituciones prestadoras de servicios de salud; incluye "
            "identificacion y priorizacion de nuevas tecnologias en el entorno hospitalario."
        ),
        "relation_iets": "Contexto - ETS hospitalaria; no autoria IETS de escaneo de horizonte",
        "language": "Espanol",
        "resource_type": "Documento tecnico (PDF)",
        "link_status": "Verificar (PDF pesado)",
        "tags": "MinSalud,ETS,IPS",
    },
    {
        "title": "Evaluacion de Tecnologias en Salud (MinSalud)",
        "url": "https://www.minsalud.gov.co/salud/Documents/Evaluaci%C3%B3n%20de%20Tecnologias%20en%20Salud.pdf",
        "category": CAT_CONTEXTO_MINSALUD,
        "authors": "Ministerio de Salud y Proteccion Social (MSPS)",
        "year": "s.f.",
        "description": (
            "Documento marco sobre ETS en Colombia: retos de sostenibilidad, envejecimiento poblacional "
            "y emergencia de nuevas tecnologias; anexos sobre ETS en Colombia y ajuste a planes de "
            "beneficios."
        ),
        "relation_iets": "Contexto - marco general de ETS",
        "language": "Espanol",
        "resource_type": "Documento tecnico (PDF)",
        "link_status": "Verificar (PDF pesado)",
        "tags": "MinSalud,ETS",
    },
    {
        "title": "Informe de Gestion MSPS 2024",
        "url": "https://www.minsalud.gov.co/sites/rid/Lists/BibliotecaDigital/RIDE/DE/PES/informe-gestion-msps-2024.pdf",
        "category": CAT_CONTEXTO_MINSALUD,
        "authors": "Ministerio de Salud y Proteccion Social (MSPS)",
        "year": "2025",
        "description": (
            "Informe anual de gestion: medicamentos y tecnologias, exclusiones (PTC), UPC, presupuestos "
            "maximos, soberania sanitaria. Contexto de decisiones de cobertura donde se inserta la ETS."
        ),
        "relation_iets": "Contexto - no menciona boletines de horizonte del IETS especificamente",
        "language": "Espanol",
        "resource_type": "Informe institucional (PDF)",
        "link_status": "Activo",
        "tags": "MinSalud,informe",
    },
    {
        "title": "Informe de Gestion MSPS 2025",
        "url": "https://www.minsalud.gov.co/sites/rid/Lists/BibliotecaDigital/RIDE/DE/PES/informe-gestion-msps-2025.pdf",
        "category": CAT_CONTEXTO_MINSALUD,
        "authors": "Ministerio de Salud y Proteccion Social (MSPS)",
        "year": "2025",
        "description": (
            "Informe anual de gestion 2025: ampliacion de cobertura, modernizacion de infraestructura, "
            "capacidades en CTeI. Contexto de politica sectorial."
        ),
        "relation_iets": "Contexto - marco de politica sectorial",
        "language": "Espanol",
        "resource_type": "Informe institucional (PDF)",
        "link_status": "Activo",
        "tags": "MinSalud,informe",
    },
    {
        "title": "Evaluacion de Tecnologias de Salud - OPS/OMS",
        "url": "https://www.paho.org/es/temas/evaluacion-tecnologias-salud",
        "category": CAT_REFERENTE,
        "authors": "Organizacion Panamericana de la Salud (OPS/OMS)",
        "year": "s.f.",
        "description": (
            "Marco regional de ETS de la OPS: identificacion de capacidades de ETS en paises emergentes "
            "de la Region de las Americas, procesos decisorios de incorporacion de tecnologias y toolbox "
            "adaptable."
        ),
        "relation_iets": "Referente - cooperacion regional en ETS; contexto del que Colombia/IETS participa",
        "language": "Espanol",
        "resource_type": "Pagina web / marco",
        "link_status": "Activo",
        "tags": "OPS,OMS,regional",
    },
    {
        "title": "Sintesis Rapida de Evidencia: herramientas de Horizon Scanning (marzo 2025)",
        "url": "https://docs.bvsalud.org/biblioref/2025/08/1611070/sre-horizon-scanning-descriptiva-2025.pdf",
        "category": CAT_REFERENTE,
        "authors": "Unidad de Politicas de Salud Informadas por Evidencia - Depto. ETESA-SBE, Ministerio de Salud de CHILE",
        "year": "2025",
        "description": (
            "SRE descriptiva que identifica y compara herramientas internacionales de horizon scanning "
            "(criterios EuroScan, IHSI, HSRIC, etc.), horizontes temporales y metodologias. NO es "
            "autoria del IETS."
        ),
        "relation_iets": "Referente comparado - Chile (NO confundir con producto IETS)",
        "language": "Espanol",
        "resource_type": "Documento tecnico (PDF)",
        "link_status": "Verificar (PDF pesado)",
        "tags": "Chile,comparado,herramientas",
    },
    {
        "title": "Toolkit V4 (2025) para identificacion y evaluacion de tecnologias nuevas y emergentes",
        "url": "https://ihts.org/the-new-toolkit-v4-2025/",
        "category": CAT_REFERENTE,
        "authors": "EuroScan International Network / international HealthTechScan (i-HTS)",
        "year": "2025",
        "description": (
            "Cuarta edicion del toolkit de EuroScan: sistema de Early Awareness and Alert (EAA), flujo de "
            "identificacion-priorizacion-evaluacion-monitoreo de tecnologias emergentes. Referencia "
            "metodologica estandar mundial."
        ),
        "relation_iets": "Referente metodologico - red de la que CONITEC (Brasil) es miembro latinoamericano; el IETS no figura como miembro formal",
        "language": "Ingles",
        "resource_type": "Herramienta metodologica (web)",
        "link_status": "Activo",
        "tags": "EuroScan,i-HTS,toolkit,metodologia",
    },
    {
        "title": "International Horizon Scanning Initiative (IHSI) - Base de datos",
        "url": "https://ihsi-horizonscandb.ecri.org/",
        "category": CAT_REFERENTE,
        "authors": "IHSI / ECRI",
        "year": "s.f.",
        "description": (
            "Sistema y base de datos internacional de horizon scanning de medicamentos en desarrollo; "
            "alerta sobre productos de alto impacto para paises miembros. High-Impact Reports semestrales."
        ),
        "relation_iets": "Referente - iniciativa multinacional europea; Colombia/IETS no es miembro",
        "language": "Ingles",
        "resource_type": "Base de datos / sitio",
        "link_status": "Activo",
        "tags": "IHSI,ECRI,base de datos",
    },
    {
        "title": "Mapping horizon scanning systems for medical devices: similarities, differences, and lessons learned",
        "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC11579676/",
        "category": CAT_REFERENTE,
        "authors": "IHSI Medical Devices Working Group (IHSI MDWG)",
        "year": "2024",
        "description": (
            "Mapeo de 16 sistemas de horizon scanning para dispositivos medicos (11 vigentes); horizonte "
            "tipico de 3 anos a pocos meses antes de la entrada al mercado; lecciones de intensidad de "
            "recursos y cooperacion internacional."
        ),
        "relation_iets": "Referente - dispositivos medicos; util para el Manual ETS de Dispositivos Medicos del IETS",
        "language": "Ingles",
        "resource_type": "Articulo cientifico (PMC)",
        "link_status": "Activo",
        "tags": "IHSI,dispositivos medicos,mapeo",
    },
    {
        "title": "Horizon Scanning (IHSI, PCORI, AHRQ Initiatives) - ECRI",
        "url": "https://home.ecri.org/pages/ecri-horizon-scanning",
        "category": CAT_REFERENTE,
        "authors": "ECRI",
        "year": "2024",
        "description": (
            "Pagina de ECRI sobre sus iniciativas de horizon scanning (IHSI, PCORI, AHRQ) para anticipar "
            "tecnologias, procedimientos y modelos de atencion emergentes."
        ),
        "relation_iets": "Referente - proveedor tecnico de sistemas de horizon scanning",
        "language": "Ingles",
        "resource_type": "Pagina web",
        "link_status": "Activo",
        "tags": "ECRI,AHRQ,PCORI",
    },
    {
        "title": "RedETS Horizon Scanning: Impact In The Decision-Making Process (PD155, IJTAHC)",
        "url": "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11719199/",
        "category": CAT_REFERENTE,
        "authors": "Punal-Riobo J; Lopez-Loureiro I; Maceira Rozas MC; Casal Accion B; y cols. (RedETS, Espana)",
        "year": "2025",
        "description": (
            "Programa de horizon scanning de la RedETS (Espana) enfocado en tecnologias sanitarias "
            "emergentes no farmacologicas y su impacto en la toma de decisiones. DOI "
            "10.1017/S0266462324003878."
        ),
        "relation_iets": "Referente - modelo nacional de horizon scanning replicable",
        "language": "Ingles",
        "resource_type": "Articulo cientifico (PMC)",
        "link_status": "Activo",
        "tags": "RedETS,Espana,modelo nacional",
    },
    {
        "title": "Scanning The Right Horizons: Does Singapore's Horizon Scanning Identify And Assess The Relevant Technologies? (PD156, IJTAHC)",
        "url": "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11718686/",
        "category": CAT_REFERENTE,
        "authors": "Autores del programa de HS de Singapur (Agency for Care Effectiveness)",
        "year": "2025",
        "description": (
            "Evaluacion del programa de HS de Singapur (2020-2023): 1.703 medtechs identificadas, salud "
            "digital como mayor proporcion; comparacion con las top-10 tendencias de CADTH."
        ),
        "relation_iets": "Referente - caso de HS de dispositivos/medtech y salud digital",
        "language": "Ingles",
        "resource_type": "Articulo cientifico (PMC)",
        "link_status": "Activo",
        "tags": "Singapur,ACE,medtech,salud digital",
    },
    {
        "title": "Horizon Scans can be accelerated using novel information retrieval and artificial intelligence tools",
        "url": "https://arxiv.org/pdf/2504.01627",
        "category": CAT_REFERENTE,
        "authors": "Innovation Observatory (NIHRIO) y cols.",
        "year": "2025",
        "description": (
            "Preprint sobre aceleracion/automatizacion del horizon scanning con recuperacion de "
            "informacion y LLMs; brechas actuales y desarrollos en curso."
        ),
        "relation_iets": "Referente - automatizacion con IA; alineado con la modernizacion digital del IETS",
        "language": "Ingles",
        "resource_type": "Preprint (arXiv)",
        "link_status": "Activo",
        "tags": "NIHRIO,IA,automatizacion,LLM",
    },
    {
        "title": "Methods for considering equality and equity implications in horizon scanning: a scoping review",
        "url": "https://www.medrxiv.org/content/10.1101/2024.10.28.24316274.full.pdf",
        "category": CAT_REFERENTE,
        "authors": "Autores (scoping review, medRxiv)",
        "year": "2024",
        "description": (
            "Revision de alcance sobre como incorporar consideraciones de igualdad y equidad en el "
            "horizon scanning de medicamentos e innovaciones sanitarias."
        ),
        "relation_iets": "Referente - equidad en HS; alineado con la doctrina de acceso equitativo del IETS",
        "language": "Ingles",
        "resource_type": "Preprint (medRxiv)",
        "link_status": "Activo",
        "tags": "equidad,scoping review",
    },
    {
        "title": "Looking at the fringes of MedTech innovation: a mapping review of horizon scanning and foresight methods",
        "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC10503360/",
        "category": CAT_REFERENTE,
        "authors": "Autores (mapping review, PMC)",
        "year": "2023",
        "description": (
            "Revision de mapeo de metodos de horizon scanning y prospectiva (foresight) aplicados a la "
            "innovacion en tecnologia medica; inventario de sistemas (IHSI, i-HTS, etc.)."
        ),
        "relation_iets": "Referente metodologico - metodos de HS y foresight",
        "language": "Ingles",
        "resource_type": "Articulo cientifico (PMC)",
        "link_status": "Activo",
        "tags": "foresight,medtech,mapeo",
    },
    {
        "title": "VII Informe Horizon Scanning de Medicamentos Huerfanos No Oncologicos (julio 2023)",
        "url": "https://gruposdetrabajo.sefh.es/orpharsefh/images/stories/documentos/7_Informe_Horizon_Scanning_VII-Julio2023.pdf",
        "category": CAT_REFERENTE,
        "authors": "Grupo Orphar-SEFH - Sociedad Espanola de Farmacia Hospitalaria",
        "year": "2023",
        "description": (
            "Informe aplicado de horizon scanning de medicamentos huerfanos no oncologicos en evaluacion "
            "por la EMA (PRIME, CHMP, CE); modelo de reporte periodico por area."
        ),
        "relation_iets": "Referente - ejemplo de boletin/informe de HS aplicado (huerfanos)",
        "language": "Espanol",
        "resource_type": "Informe tecnico (PDF)",
        "link_status": "Activo",
        "tags": "SEFH,huerfanos,informe",
    },
    {
        "title": "Horizon Scanning - Medicamentos Oncologicos (Fundacion ECO)",
        "url": "https://fundacioneco.es/project/horizon-scanning-medicamentos-oncologicos/",
        "category": CAT_REFERENTE,
        "authors": "Fundacion ECO / Omakase Consulting",
        "year": "s.f.",
        "description": (
            "Informe de horizon scanning de medicamentos oncologicos para anticipar la innovacion que "
            "podria incorporarse al Sistema Nacional de Salud espanol y planificar recursos."
        ),
        "relation_iets": "Referente - ejemplo de informe de HS aplicado (oncologia)",
        "language": "Espanol",
        "resource_type": "Proyecto / informe (web)",
        "link_status": "Activo",
        "tags": "Fundacion ECO,oncologia,informe",
    },
]

# Fuentes adicionales de repositorios de horizon scanning (ampliacion del sistema).
EXTRA_SOURCES: list[dict] = [
    {
        "title": "NIHR Innovation Observatory (NIHRIO)",
        "url": "https://io.nihr.ac.uk/",
        "category": CAT_REFERENTE,
        "authors": "NIHR Innovation Observatory - Newcastle University",
        "year": "2026",
        "description": (
            "Centro lider mundial de escaneo de horizonte en salud (Reino Unido). Publica dashboards "
            "vivos, briefings tecnologicos y articulos metodologicos (marco MIST). Referente de linea "
            "grafica y de modelo operativo de horizon scanning."
        ),
        "relation_iets": "Referente - modelo operativo y de diseminacion de horizon scanning",
        "language": "Ingles",
        "resource_type": "Sitio web / centro de HS",
        "link_status": "Activo",
        "tags": "NIHRIO,briefings,dashboards,referente",
    },
    {
        "title": "NIHRIO - Technology Briefings (Resources)",
        "url": "https://io.nihr.ac.uk/resources/",
        "category": CAT_REFERENTE,
        "authors": "NIHR Innovation Observatory",
        "year": "2026",
        "description": (
            "Repositorio de briefings tecnologicos y dashboards vivos del NIHRIO. Fuente estructurada "
            "de tecnologias emergentes (medicamentos, dispositivos, diagnosticos y salud digital)."
        ),
        "relation_iets": "Referente - repositorio de tecnologias emergentes con actualizacion frecuente",
        "language": "Ingles",
        "resource_type": "Repositorio web",
        "link_status": "Activo",
        "tags": "NIHRIO,tech briefings,emergentes",
    },
    {
        "title": "CADTH / CDA-AMC Horizon Scanning (Canada)",
        "url": "https://www.cda-amc.ca/horizon-scan",
        "category": CAT_REFERENTE,
        "authors": "Canada's Drug Agency (CDA-AMC, antes CADTH)",
        "year": "2026",
        "description": (
            "Programa de escaneo de horizonte de la agencia canadiense de medicamentos: boletines de "
            "vigilancia, watch lists y reportes de tendencias emergentes en salud."
        ),
        "relation_iets": "Referente - agencia nacional con programa maduro de horizon scanning",
        "language": "Ingles",
        "resource_type": "Sitio web / programa",
        "link_status": "Activo",
        "tags": "CADTH,CDA,Canada,watch list",
    },
    {
        "title": "CONITEC - Monitoramento do Horizonte Tecnologico (Brasil)",
        "url": "https://www.gov.br/conitec/pt-br",
        "category": CAT_REFERENTE,
        "authors": "CONITEC - Ministerio da Saude (Brasil)",
        "year": "2026",
        "description": (
            "Comision nacional de incorporacion de tecnologias de Brasil; unico miembro latinoamericano "
            "de EuroScan. Publica informes de monitoreo del horizonte tecnologico (MHT)."
        ),
        "relation_iets": "Referente regional - miembro LATAM de EuroScan; modelo de MHT replicable",
        "language": "Portugues",
        "resource_type": "Sitio web / programa",
        "link_status": "Activo",
        "tags": "CONITEC,Brasil,EuroScan,MHT",
    },
    {
        "title": "WHO - Emerging technologies and scientific innovations",
        "url": "https://www.who.int/teams/health-product-policy-and-standards/assistive-and-medical-technology/medical-devices/emerging-technologies",
        "category": CAT_REFERENTE,
        "authors": "World Health Organization (WHO)",
        "year": "2026",
        "description": (
            "Iniciativa de la OMS sobre tecnologias emergentes e innovaciones cientificas de alto "
            "impacto para sistemas de salud, con enfoque en paises de ingresos bajos y medios."
        ),
        "relation_iets": "Referente global - priorizacion de tecnologias emergentes con enfoque de equidad",
        "language": "Ingles",
        "resource_type": "Sitio web / iniciativa",
        "link_status": "Activo",
        "tags": "OMS,WHO,emergentes,LMIC",
    },
]


def all_seed_sources() -> list[dict]:
    return INVENTORY_SOURCES + EXTRA_SOURCES + API_SOURCES


# Referentes con API estructurada (fase 4). Se insertan tambien sobre bases
# ya pobladas, por URL, para no depender de vaciar el inventario.
API_SOURCES: list[dict] = [
    {
        "title": "ClinicalTrials.gov — API REST v2",
        "url": "https://clinicaltrials.gov/api/v2/studies",
        "category": CAT_REFERENTE,
        "authors": "U.S. National Library of Medicine (NIH)",
        "year": "2026",
        "description": (
            "Registro de ensayos clinicos. El conector filtra fases II, III y IV y extrae "
            "fecha estimada de finalizacion, patrocinador e intervencion."
        ),
        "relation_iets": "Referente global - insumo de time-to-market y de P5/P6",
        "language": "Ingles",
        "resource_type": "API REST",
        "link_status": "Activo",
        "tags": "ClinicalTrials,API,ensayos,fase III",
        "connector": "clinicaltrials",
        "connector_config": {"page_size": 40},
        "scan_interval_hours": 12,
        "scrape_enabled": True,
    },
    {
        "title": "FDA Drugs@FDA (openFDA)",
        "url": "https://api.fda.gov/drug/drugsfda.json",
        "category": CAT_REFERENTE,
        "authors": "U.S. Food and Drug Administration",
        "year": "2026",
        "description": "Aprobaciones de medicamentos. Extrae titular, principio activo y fecha.",
        "relation_iets": "Referente regulatorio - pre-llenado de P5",
        "language": "Ingles",
        "resource_type": "API REST",
        "link_status": "Activo",
        "tags": "FDA,openFDA,aprobaciones",
        "connector": "fda",
        "connector_config": {"page_size": 40},
        "scan_interval_hours": 24,
        "scrape_enabled": True,
    },
    {
        "title": "EMA — canal RSS de medicamentos humanos",
        "url": "https://www.ema.europa.eu/en/rss.xml",
        "category": CAT_REFERENTE,
        "authors": "European Medicines Agency",
        "year": "2026",
        "description": "Highlights y opiniones del CHMP. No hay REST oficial; se consume el RSS.",
        "relation_iets": "Referente regulatorio - pre-llenado de P5/P6",
        "language": "Ingles",
        "resource_type": "RSS",
        "link_status": "Activo",
        "tags": "EMA,RSS,CHMP",
        "connector": "ema",
        "connector_config": {"page_size": 25},
        "scan_interval_hours": 24,
        "scrape_enabled": True,
    },
    {
        "title": "PubMed E-Utilities",
        "url": "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi",
        "category": CAT_REFERENTE,
        "authors": "NCBI / National Library of Medicine",
        "year": "2026",
        "description": "Literatura de tecnologias emergentes y horizon scanning, como evidencia.",
        "relation_iets": "Fuente complementaria de evidencia clinica",
        "language": "Ingles",
        "resource_type": "API REST",
        "link_status": "Activo",
        "tags": "PubMed,evidencia,NCBI",
        "connector": "pubmed",
        "connector_config": {"page_size": 20},
        "scan_interval_hours": 24,
        "scrape_enabled": True,
    },
    {
        "title": "WHO ICTRP (espejo / lote)",
        "url": "https://trialsearch.who.int/",
        "category": CAT_REFERENTE,
        "authors": "World Health Organization",
        "year": "2026",
        "description": (
            "Registro internacional de ensayos. El portal no garantiza REST: el conector "
            "acepta un espejo JSON o un lote descargado (ruta de contingencia)."
        ),
        "relation_iets": "Referente global - cobertura fuera de ClinicalTrials.gov",
        "language": "Ingles",
        "resource_type": "Portal / lote",
        "link_status": "Activo (API no garantizada)",
        "tags": "OMS,ICTRP,ensayos",
        "connector": "who_ictrp",
        "connector_config": {},
        "scan_interval_hours": 48,
        "scrape_enabled": False,
    },
]
