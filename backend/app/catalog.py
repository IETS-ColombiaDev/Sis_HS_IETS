"""Catalogo verificado de fuentes proactivas (RF01 / D-06).

Fuente de verdad: Catalogo_Fuentes_Proactivas_Verificadas_EH_IETS.md
53 fuentes. Las taxonomias son dato: este modulo se carga, no se enumera
en los conectores. Un cambio de inventario no exige redeploy de adaptadores.
"""
from __future__ import annotations

CATALOG_VERSION = "2026-09-02"

# Categorias operativas del inventario (reemplazan las del listado institucional).
CAT_ENSAYOS = "Registros de ensayos clinicos"
CAT_REGULATORIA = "Agencias regulatorias"
CAT_HTA = "Agencias de HTA y redes de EH"
CAT_LITERATURA = "Literatura y organismos internacionales"
CAT_FABRICANTE = "Fabricantes de I+D"

FREQ_HOURS = {
    "diaria": 24,
    "semanal": 168,
    "quincenal": 336,
    "mensual": 720,
    "trimestral": 2160,
    "semestral": 4320,
    "anual": 8760,
}

ENTITY_LABELS = {
    "registro_ensayos": "Registro de ensayos",
    "agencia_regulatoria": "Agencia regulatoria",
    "organismo_hta": "Organismo HTA / red",
    "literatura": "Literatura",
    "fabricante": "Fabricante de I+D",
}


def _src(
    code: str,
    name: str,
    *,
    url: str,
    entity_type: str,
    category: str,
    access_level: str,
    connector: str,
    country: str = "",
    authors: str = "",
    description: str = "",
    relation_iets: str = "",
    language: str = "Ingles",
    resource_type: str = "",
    sync_frequency: str = "mensual",
    rate_limit_rpm: int | None = None,
    requires_api_key: bool = False,
    terms_url: str = "",
    provides_fields: list[str] | None = None,
    aliases: list[str] | None = None,
    verification_status: str = "declarada",
    catalog_note: str = "",
    is_contrast: bool = False,
    catalog_active: bool = True,
    scrape_enabled: bool = True,
    connector_config: dict | None = None,
    tags: str = "",
    year: str = "2026",
) -> dict:
    hours = FREQ_HOURS.get(sync_frequency, 720)
    if access_level == "E" or connector == "manual" or not catalog_active:
        scrape_enabled = False
    return {
        "catalog_code": code,
        "title": name,
        "url": url,
        "category": category,
        "authors": authors,
        "year": year,
        "description": description,
        "relation_iets": relation_iets,
        "language": language,
        "resource_type": resource_type or _resource_for(access_level, connector),
        "link_status": "Activo" if catalog_active else "Retirada del ciclo de ingesta",
        "scrape_enabled": scrape_enabled,
        "tags": tags or code,
        "connector": connector,
        "connector_config": connector_config or {},
        "scan_interval_hours": hours,
        "entity_type": entity_type,
        "access_level": access_level,
        "country": country,
        "sync_frequency": sync_frequency,
        "rate_limit_rpm": rate_limit_rpm,
        "requires_api_key": requires_api_key,
        "terms_url": terms_url,
        "provides_fields": provides_fields or [],
        "aliases": aliases or [],
        "verification_status": verification_status,
        "catalog_note": catalog_note,
        "is_contrast": is_contrast,
        "catalog_active": catalog_active,
        "retired": False,
        "health_status": "",
    }


def _resource_for(level: str, connector: str) -> str:
    if connector == "manual":
        return "Curaduria humana"
    return {
        "A": "API REST",
        "B": "Descarga estructurada",
        "C": "JSON de portal",
        "D": "Pagina / PDF",
        "E": "Curaduria humana",
    }.get(level, "Sitio web")


# --------------------------------------------------------------------------- #
#  Bloque 1. Registros de ensayos clinicos (4)
# --------------------------------------------------------------------------- #
_CT = [
    _src(
        "FP-CT-01",
        "ClinicalTrials.gov",
        url="https://clinicaltrials.gov/api/v2/studies",
        entity_type="registro_ensayos",
        category=CAT_ENSAYOS,
        access_level="A",
        connector="clinicaltrials",
        country="EE. UU.",
        authors="U.S. National Library of Medicine (NIH/NLM)",
        description=(
            "Registro de ensayos clinicos. API v2 publica sin autenticacion. "
            "Filtra fases II, III y IV; pagina por cursor (pageToken)."
        ),
        relation_iets="Fuente primaria de horizonte temprano, NCT, patrocinador y fecha de fase III",
        resource_type="API REST",
        sync_frequency="diaria",
        rate_limit_rpm=40,
        verification_status="verificada",
        provides_fields=["inn_name", "manufacturer", "nct_ids", "indication", "phase3_completion_date"],
        connector_config={
            "base_url": "https://clinicaltrials.gov/api/v2/studies",
            "page_size": 100,
            "pagination": "cursor",
            "cursor_field": "nextPageToken",
            "probe": {
                "url": "https://clinicaltrials.gov/api/v2/studies",
                "params": {"pageSize": 1, "countTotal": "true"},
                "expect_status": 200,
                "expect_json_path": "studies.0.protocolSection.identificationModule.nctId",
            },
        },
        tags="ClinicalTrials,API,ensayos,fase III,FP-CT-01",
    ),
    _src(
        "FP-CT-02",
        "WHO ICTRP",
        url="https://trialsearch.who.int/",
        entity_type="registro_ensayos",
        category=CAT_ENSAYOS,
        access_level="B",
        connector="who_ictrp",
        country="Internacional",
        authors="World Health Organization",
        description=(
            "Registro internacional de ensayos. No hay REST publico: lote semanal "
            "CSV/XML o espejo institucional. Los terminos aplican a cualquier formato."
        ),
        relation_iets="Cobertura fuera de ClinicalTrials.gov; clave de dedup = TRN",
        resource_type="Portal / lote",
        sync_frequency="semanal",
        terms_url="https://www.who.int/clinical-trials-registry-platform",
        verification_status="verificada",
        provides_fields=["nct_ids", "manufacturer", "indication", "phase3_completion_date"],
        catalog_note="Requiere aceptacion formal de terminos (P2-2). Sin lote o espejo la corrida queda en ambar.",
        scrape_enabled=False,
        connector_config={
            "probe": {
                "url": "https://trialsearch.who.int/",
                "expect_status": 200,
            }
        },
        tags="OMS,ICTRP,ensayos,lote,FP-CT-02",
    ),
    _src(
        "FP-CT-03",
        "CTIS (EMA)",
        url="https://euclinicaltrials.eu/ctis-public/search",
        entity_type="registro_ensayos",
        category=CAT_ENSAYOS,
        access_level="C",
        connector="ctis",
        country="Union Europea",
        authors="European Medicines Agency",
        description=(
            "Portal publico de ensayos de la UE. No hay API oficial para terceros; "
            "se consume el JSON interno del portal con verificacion de esquema."
        ),
        relation_iets="Numero EU CT; respaldo de nct_ids y senal regulatoria europea",
        resource_type="JSON de portal (no contractual)",
        sync_frequency="semanal",
        verification_status="observacion",
        provides_fields=["nct_ids", "manufacturer", "indication"],
        catalog_note="Sin API publica. Si el esquema cambia, el conector se apaga solo.",
        connector_config={
            "base_url": "https://euclinicaltrials.eu/ctis-public-api/search",
            "page_size": 40,
            "probe": {
                "url": "https://euclinicaltrials.eu/ctis-public/search",
                "expect_status": 200,
            },
        },
        tags="CTIS,EMA,ensayos,UE,FP-CT-03",
    ),
    _src(
        "FP-CT-04",
        "ScanMedicine (NIHR Innovation Observatory)",
        url="https://www.scanmedicine.com/clinicaltrials",
        entity_type="registro_ensayos",
        category=CAT_ENSAYOS,
        access_level="D",
        connector="html",
        country="Reino Unido",
        authors="NIHR Innovation Observatory",
        description=(
            "Consolida 11 registros de ensayos y datos de dispositivos de la FDA. "
            "Referente operativo del NIHRIO; tambien sirve como control de cobertura."
        ),
        relation_iets="Control de calidad de cobertura: si aparece alli y no en el ciclo, es un hueco",
        resource_type="Pagina web",
        sync_frequency="quincenal",
        verification_status="verificada",
        is_contrast=True,
        provides_fields=["nct_ids", "commercial_name"],
        aliases=["ScanMedicine"],
        connector_config={"probe": {"url": "https://www.scanmedicine.com/clinicaltrials", "expect_status": 200}},
        tags="ScanMedicine,NIHRIO,ensayos,dispositivos,FP-CT-04",
    ),
]


# --------------------------------------------------------------------------- #
#  Bloque 2. Agencias regulatorias (11)
# --------------------------------------------------------------------------- #
_RG = [
    _src(
        "FP-RG-01",
        "FDA openFDA",
        url="https://api.fda.gov/",
        entity_type="agencia_regulatoria",
        category=CAT_REGULATORIA,
        access_level="A",
        connector="fda",
        country="EE. UU.",
        authors="U.S. Food and Drug Administration",
        description=(
            "Plataforma openFDA: device/510k, device/pma, device/classification, "
            "device/udi, drug/drugsfda y drug/label bajo una sola API de dominio publico."
        ),
        relation_iets="Fuente primaria de fda_approval_date (P5) y regulatory_status (P6)",
        resource_type="API REST",
        sync_frequency="diaria",
        rate_limit_rpm=40,
        requires_api_key=True,
        terms_url="https://open.fda.gov/apis/authentication/",
        verification_status="verificada",
        provides_fields=["commercial_name", "inn_name", "manufacturer", "fda_approval_date", "regulatory_status"],
        catalog_note="Sin llave el cupo es bajo. Con llave gratuita de api.data.gov: 240/min y 120.000/dia.",
        aliases=["FDA", "openFDA", "Drugs@FDA"],
        connector_config={
            "datasets": ["drug/drugsfda", "device/510k", "device/pma"],
            "page_size": 40,
            "probe": {
                "url": "https://api.fda.gov/drug/drugsfda.json",
                "params": {"limit": 1},
                "expect_status": 200,
                "expect_json_path": "results.0.application_number",
            },
        },
        tags="FDA,openFDA,aprobaciones,P5,FP-RG-01",
    ),
    _src(
        "FP-RG-02",
        "FDA Breakthrough Devices Program",
        url="https://www.fda.gov/medical-devices/how-study-and-market-your-device/breakthrough-devices-program",
        entity_type="agencia_regulatoria",
        category=CAT_REGULATORIA,
        access_level="D",
        connector="html",
        country="EE. UU.",
        authors="U.S. Food and Drug Administration",
        description="Pagina del programa Breakthrough Devices. No hay conjunto openFDA equivalente.",
        relation_iets="Senal de via acelerada de dispositivos; no sustituye openFDA",
        sync_frequency="mensual",
        verification_status="verificada",
        provides_fields=["commercial_name", "regulatory_status"],
        aliases=["FDA Breakthrough Devices"],
        tags="FDA,breakthrough,dispositivos,FP-RG-02",
    ),
    _src(
        "FP-RG-03",
        "FDA dispositivos autorizados recientemente (CDRH)",
        url="https://www.fda.gov/medical-devices/device-approvals-denials-and-clearances/recently-approved-devices",
        entity_type="agencia_regulatoria",
        category=CAT_REGULATORIA,
        access_level="D",
        connector="html",
        country="EE. UU.",
        authors="U.S. Food and Drug Administration — CDRH",
        description="Recently Approved Devices y buscadores cfPMA / cfIVD de accessdata.",
        relation_iets="Respaldo de fda_approval_date cuando openFDA no trae el listado reciente",
        sync_frequency="semanal",
        verification_status="verificada",
        provides_fields=["commercial_name", "fda_approval_date", "regulatory_status"],
        tags="FDA,CDRH,dispositivos,FP-RG-03",
    ),
    _src(
        "FP-RG-04",
        "EMA medicamentos (tablas descargables)",
        url="https://www.ema.europa.eu/en/medicines/download-medicine-data",
        entity_type="agencia_regulatoria",
        category=CAT_REGULATORIA,
        access_level="B",
        connector="ema",
        country="Union Europea",
        authors="European Medicines Agency",
        description=(
            "Tablas oficiales de medicamentos que el sitio actualiza durante la noche. "
            "El adaptador descarga el archivo; el RSS queda como contingencia."
        ),
        relation_iets="Fuente primaria de ema_approval_date (P5)",
        resource_type="XLSX / descarga",
        sync_frequency="semanal",
        verification_status="verificada",
        provides_fields=["commercial_name", "inn_name", "manufacturer", "ema_approval_date", "regulatory_status"],
        aliases=["EMA"],
        connector_config={
            "mode": "download",
            "download_page": "https://www.ema.europa.eu/en/medicines/download-medicine-data",
            "feed_url": "https://www.ema.europa.eu/en/rss.xml",
            "page_size": 40,
            "probe": {
                "url": "https://www.ema.europa.eu/en/medicines/download-medicine-data",
                "expect_status": 200,
            },
        },
        tags="EMA,medicamentos,P5,FP-RG-04",
    ),
    _src(
        "FP-RG-05",
        "EMA medicamentos en evaluacion y panel de dispositivos",
        url="https://www.ema.europa.eu/en/medicines/medicines-under-evaluation",
        entity_type="agencia_regulatoria",
        category=CAT_REGULATORIA,
        access_level="D",
        connector="html",
        country="Union Europea",
        authors="European Medicines Agency",
        description="Listado de medicamentos en evaluacion y programa piloto de dispositivos innovadores.",
        relation_iets="Senal de horizonte (P6) que no esta en la tabla descargable",
        sync_frequency="quincenal",
        verification_status="verificada",
        provides_fields=["commercial_name", "regulatory_status"],
        tags="EMA,evaluacion,P6,FP-RG-05",
    ),
    _src(
        "FP-RG-06",
        "Health Canada MDALL",
        url="https://health-products.canada.ca/api/medical-devices/device/",
        entity_type="agencia_regulatoria",
        category=CAT_REGULATORIA,
        access_level="A",
        connector="health_canada",
        country="Canada",
        authors="Health Canada",
        description=(
            "API JSON/XML documentada de dispositivos medicos: device, deviceidentifier, "
            "licence y company, con filtro state=active."
        ),
        relation_iets="Comparador regulatorio de nivel A, distinto de FDA y EMA",
        resource_type="API REST",
        sync_frequency="semanal",
        verification_status="observacion",
        catalog_note="La matriz original no evidencio listado. La API existe y es de primer nivel.",
        provides_fields=["commercial_name", "manufacturer", "regulatory_status"],
        aliases=["MDALL", "Health Canada dispositivos"],
        connector_config={
            "dataset": "medical-devices",
            "base_url": "https://health-products.canada.ca/api/medical-devices/device/",
            "params": {"type": "json", "state": "active"},
            "page_size": 50,
            "probe": {
                "url": "https://health-products.canada.ca/api/medical-devices/device/",
                "params": {"type": "json", "state": "active"},
                "expect_status": 200,
            },
        },
        tags="Health Canada,MDALL,dispositivos,API,FP-RG-06",
    ),
    _src(
        "FP-RG-07",
        "Health Canada Drug Product Database",
        url="https://health-products.canada.ca/api/drug/drugproduct/",
        entity_type="agencia_regulatoria",
        category=CAT_REGULATORIA,
        access_level="A",
        connector="health_canada",
        country="Canada",
        authors="Health Canada",
        description="API de productos farmaceuticos de Health Canada (JSON/XML).",
        relation_iets="Nombre comercial, fabricante y estado regulatorio de medicamentos",
        resource_type="API REST",
        sync_frequency="semanal",
        verification_status="observacion",
        provides_fields=["commercial_name", "inn_name", "manufacturer", "regulatory_status"],
        aliases=["DPD", "Health Canada medicamentos"],
        connector_config={
            "dataset": "drug",
            "base_url": "https://health-products.canada.ca/api/drug/drugproduct/",
            "params": {"type": "json"},
            "page_size": 50,
            "probe": {
                "url": "https://health-products.canada.ca/api/drug/drugproduct/",
                "params": {"type": "json"},
                "expect_status": 200,
            },
        },
        tags="Health Canada,DPD,medicamentos,API,FP-RG-07",
    ),
    _src(
        "FP-RG-08",
        "TGA ARTG y medicamentos en evaluacion",
        url="https://www.tga.gov.au/resources/artg",
        entity_type="agencia_regulatoria",
        category=CAT_REGULATORIA,
        access_level="B",
        connector="file_feed",
        country="Australia",
        authors="Therapeutic Goods Administration",
        description=(
            "Buscador ARTG con exportacion CSV/Excel por tipo terapeutico; bases de "
            "medicamentos bajo evaluacion y de decisiones. Senal anterior a la decision."
        ),
        relation_iets="regulatory_status de tecnologias bajo evaluacion (P6)",
        resource_type="CSV / XLSX",
        sync_frequency="mensual",
        verification_status="verificada",
        provides_fields=["commercial_name", "manufacturer", "regulatory_status"],
        catalog_note="La exportacion completa del ARTG exige una descarga por tipo terapeutico.",
        scrape_enabled=False,
        connector_config={
            "format": "csv",
            "column_map": {
                "external_id": ["ARTG ID", "artg_id", "id"],
                "title": ["Product Name", "product_name", "name"],
                "commercial_name": ["Product Name", "product_name"],
                "manufacturer": ["Sponsor", "sponsor", "manufacturer"],
                "indication": ["Indication", "indication"],
            },
            "probe": {"url": "https://www.tga.gov.au/resources/artg", "expect_status": 200},
        },
        tags="TGA,ARTG,Australia,FP-RG-08",
    ),
    _src(
        "FP-RG-09",
        "MHRA licencias otorgadas",
        url="https://www.gov.uk/government/publications?departments%5B%5D=medicines-and-healthcare-products-regulatory-agency",
        entity_type="agencia_regulatoria",
        category=CAT_REGULATORIA,
        access_level="D",
        connector="pdf",
        country="Reino Unido",
        authors="Medicines and Healthcare products Regulatory Agency",
        description="Coleccion de listados de autorizaciones de comercializacion, publicados como documentos.",
        relation_iets="Confirmacion regulatoria de segunda linea para P5",
        resource_type="PDF / CSV irregular",
        sync_frequency="mensual",
        verification_status="observacion",
        provides_fields=["regulatory_status"],
        tags="MHRA,Reino Unido,FP-RG-09",
    ),
    _src(
        "FP-RG-10",
        "PMDA productos aprobados",
        url="https://www.pmda.go.jp/english/review-services/reviews/approved-information/0002.html",
        entity_type="agencia_regulatoria",
        category=CAT_REGULATORIA,
        access_level="D",
        connector="html",
        country="Japon",
        authors="Pharmaceuticals and Medical Devices Agency",
        description="Seccion en ingles de informacion de aprobaciones.",
        relation_iets="Confirmacion regulatoria de segunda linea",
        sync_frequency="mensual",
        verification_status="declarada",
        provides_fields=["regulatory_status"],
        tags="PMDA,Japon,FP-RG-10",
    ),
    _src(
        "FP-RG-11",
        "NMPA, MFDS, Swissmedic y Comision Europea de dispositivos",
        url="https://english.nmpa.gov.cn/",
        entity_type="agencia_regulatoria",
        category=CAT_REGULATORIA,
        access_level="D",
        connector="html",
        country="Varios",
        authors="NMPA / MFDS / Swissmedic / Comision Europea",
        description=(
            "Portales en ingles y listados de aprobacion sin capa de datos. "
            "NMPA no se cita desde rastreadores comerciales de terceros."
        ),
        relation_iets="Confirmacion regulatoria de segunda linea; nunca origen de un registro comercial",
        sync_frequency="trimestral",
        verification_status="observacion",
        catalog_note="El enlace de consultor privado de NMPA no se usa como origen ni se cita en informes.",
        provides_fields=["regulatory_status"],
        aliases=["NMPA", "MFDS", "Swissmedic"],
        scrape_enabled=False,
        tags="NMPA,MFDS,Swissmedic,dispositivos,FP-RG-11",
    ),
]


# --------------------------------------------------------------------------- #
#  Bloque 3. HTA, redes y literatura (14 = 12 HTA + 2 literatura)
# --------------------------------------------------------------------------- #
_HT = [
    _src(
        "FP-HT-01",
        "PCORI Health Care Horizon Scanning System",
        url="https://horizonscandb.pcori.org/",
        entity_type="organismo_hta",
        category=CAT_HTA,
        access_level="C",
        connector="pcori_hs",
        country="EE. UU.",
        authors="PCORI / ECRI",
        description=(
            "Base publica de horizon scanning con fichas fechadas y seis areas que "
            "se solapan con los clusteres del IETS. Horizonte de tres anos."
        ),
        relation_iets="Fuente de senal y de priorizacion ajena (P2, P3, P4). Hueco si no esta en el ciclo.",
        resource_type="JSON de portal / HTML",
        sync_frequency="quincenal",
        verification_status="verificada",
        is_contrast=True,
        provides_fields=["commercial_name", "indication"],
        aliases=["PCORI", "horizonscandb"],
        connector_config={
            "base_url": "https://horizonscandb.pcori.org/",
            "page_size": 40,
            "probe": {"url": "https://horizonscandb.pcori.org/", "expect_status": 200},
        },
        tags="PCORI,ECRI,horizon scanning,FP-HT-01",
    ),
    _src(
        "FP-HT-02",
        "NIHR Innovation Observatory",
        url="https://www.io.nihr.ac.uk/",
        entity_type="organismo_hta",
        category=CAT_HTA,
        access_level="D",
        connector="html",
        country="Reino Unido",
        authors="NIHR Innovation Observatory — Newcastle University",
        description="Sitio institucional y publicaciones. ScanMedicine se trata en FP-CT-04.",
        relation_iets="Fuente de contraste y referente operativo de la plataforma",
        sync_frequency="mensual",
        verification_status="declarada",
        is_contrast=True,
        provides_fields=["commercial_name", "indication"],
        aliases=["NIHRIO", "Innovation Observatory"],
        tags="NIHRIO,briefings,FP-HT-02",
    ),
    _src(
        "FP-HT-03",
        "CDA-AMC Horizon Scanning",
        url="https://www.cda-amc.ca/horizon-scanning",
        entity_type="organismo_hta",
        category=CAT_HTA,
        access_level="D",
        connector="html",
        country="Canada",
        authors="Canada's Drug Agency (CDA-AMC, antes CADTH)",
        description="Seccion de horizon scanning: listas de vigilancia e informes. CADTH es el mismo emisor.",
        relation_iets="Priorizacion ajena para P2–P4. Una sola fuente para no generar falsos duplicados.",
        sync_frequency="mensual",
        verification_status="observacion",
        is_contrast=True,
        provides_fields=["commercial_name", "indication"],
        aliases=["CADTH", "CDA-AMC", "Canada's Drug Agency"],
        catalog_note="CADTH y CDA-AMC son la misma organizacion. Quedan unificadas.",
        tags="CDA-AMC,CADTH,Canada,FP-HT-03",
    ),
    _src(
        "FP-HT-04",
        "ACE Horizon Scanning (Singapur)",
        url="https://www.ace-hta.gov.sg/healthcare-professionals/ace-horizon-scanning",
        entity_type="organismo_hta",
        category=CAT_HTA,
        access_level="D",
        connector="pdf",
        country="Singapur",
        authors="Agency for Care Effectiveness",
        description="Informes de escaneo publicados.",
        relation_iets="Fuente de contraste (priorizacion ajena)",
        sync_frequency="trimestral",
        verification_status="declarada",
        is_contrast=True,
        provides_fields=["commercial_name", "indication"],
        aliases=["ACE", "ACE Singapore"],
        tags="ACE,Singapur,FP-HT-04",
    ),
    _src(
        "FP-HT-05",
        "EuroScan / i-HTS",
        url="https://www.i-hts.org/",
        entity_type="organismo_hta",
        category=CAT_HTA,
        access_level="D",
        connector="html",
        country="Internacional",
        authors="EuroScan International Network / international HealthTechScan",
        description="Sitio de la red y del toolkit. El acceso a la base de miembros es materia de convenio.",
        relation_iets="Interoperabilidad internacional (fase 7). El valor real esta detras de la membresia.",
        sync_frequency="trimestral",
        verification_status="declarada",
        provides_fields=[],
        aliases=["EuroScan", "i-HTS", "iHTS"],
        catalog_note="No se resuelve con codigo. Convenio institucional pendiente.",
        tags="EuroScan,i-HTS,toolkit,FP-HT-05",
    ),
    _src(
        "FP-HT-06",
        "INAHTA base internacional de informes HTA",
        url="https://database.inahta.org/",
        entity_type="organismo_hta",
        category=CAT_HTA,
        access_level="C",
        connector="html",
        country="Internacional",
        authors="International Network of Agencies for Health Technology Assessment",
        description="Buscador database.inahta.org con parametros de consulta.",
        relation_iets="Respaldo de priorizacion ajena; acceso pleno exige convenio",
        sync_frequency="mensual",
        verification_status="declarada",
        is_contrast=True,
        provides_fields=["commercial_name", "indication"],
        aliases=["INAHTA"],
        tags="INAHTA,HTA,FP-HT-06",
    ),
    _src(
        "FP-HT-07",
        "AIHTA y sistema de escaneo de la UE",
        url="https://aihta.at/page/horizon-scanning/en",
        entity_type="organismo_hta",
        category=CAT_HTA,
        access_level="D",
        connector="html",
        country="Austria / Union Europea",
        authors="Austrian Institute for Health Technology Assessment",
        description="Pagina del sistema de escaneo y publicaciones de la Comision.",
        relation_iets="Contexto europeo de escaneo",
        sync_frequency="trimestral",
        verification_status="declarada",
        provides_fields=["commercial_name"],
        aliases=["AIHTA"],
        tags="AIHTA,UE,FP-HT-07",
    ),
    _src(
        "FP-HT-08",
        "NICE",
        url="https://www.nice.org.uk/",
        entity_type="organismo_hta",
        category=CAT_HTA,
        access_level="D",
        connector="html",
        country="Reino Unido",
        authors="National Institute for Health and Care Excellence",
        description="Guias de proceso y productos de valoracion temprana.",
        relation_iets="Contexto de HTA de referencia",
        sync_frequency="mensual",
        verification_status="declarada",
        provides_fields=["commercial_name", "indication"],
        aliases=["NICE"],
        tags="NICE,Reino Unido,FP-HT-08",
    ),
    _src(
        "FP-HT-09",
        "NHS England Accelerated Access",
        url="https://www.england.nhs.uk/aac/",
        entity_type="organismo_hta",
        category=CAT_HTA,
        access_level="D",
        connector="html",
        country="Reino Unido",
        authors="NHS England",
        description="Pagina del programa Accelerated Access y demand signalling.",
        relation_iets="Senal de demanda del sistema ingles",
        sync_frequency="trimestral",
        verification_status="declarada",
        provides_fields=[],
        tags="NHS,AAC,FP-HT-09",
    ),
    _src(
        "FP-HT-10",
        "IQWiG",
        url="https://www.iqwig.de/en/",
        entity_type="organismo_hta",
        category=CAT_HTA,
        access_level="D",
        connector="html",
        country="Alemania",
        authors="Institut fur Qualitat und Wirtschaftlichkeit im Gesundheitswesen",
        description="Buscador de proyectos y resultados, mayoritariamente en aleman.",
        relation_iets="Contexto de HTA aleman",
        language="Aleman / Ingles",
        sync_frequency="trimestral",
        verification_status="declarada",
        provides_fields=["commercial_name"],
        aliases=["IQWiG"],
        tags="IQWiG,Alemania,FP-HT-10",
    ),
    _src(
        "FP-HT-11",
        "KCE y BeNeLuxA",
        url="https://kce.fgov.be/en",
        entity_type="organismo_hta",
        category=CAT_HTA,
        access_level="E",
        connector="manual",
        country="Belgica / BeNeLuxA",
        authors="Belgian Health Care Knowledge Centre",
        description="Informes puntuales de escaneo de horizonte, sin serie periodica.",
        relation_iets="Curaduria semestral con recordatorio de revision",
        sync_frequency="semestral",
        verification_status="declarada",
        provides_fields=[],
        aliases=["KCE", "BeNeLuxA"],
        tags="KCE,BeNeLuxA,manual,FP-HT-11",
    ),
    _src(
        "FP-HT-12",
        "AHRQ Healthcare Horizon Scanning System",
        url="https://effectivehealthcare.ahrq.gov/products/horizon-scan",
        entity_type="organismo_hta",
        category=CAT_HTA,
        access_level="E",
        connector="manual",
        country="EE. UU.",
        authors="Agency for Healthcare Research and Quality",
        description="Programa historico. El material disponible corresponde al periodo que cerro en 2015.",
        relation_iets="Referencia metodologica historica. Fuera del ciclo de ingesta.",
        sync_frequency="anual",
        verification_status="observacion",
        catalog_active=False,
        catalog_note="Programa no vigente. Se conserva como referencia y se retira del ciclo de ingesta.",
        provides_fields=[],
        aliases=["AHRQ"],
        tags="AHRQ,historico,FP-HT-12",
    ),
    _src(
        "FP-LI-01",
        "PubMed / NLM",
        url="https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi",
        entity_type="literatura",
        category=CAT_LITERATURA,
        access_level="A",
        connector="pubmed",
        country="EE. UU.",
        authors="NCBI / National Library of Medicine",
        description="E-utilities (esearch, efetch, esummary) sobre MEDLINE. Evidencia, no senal primaria.",
        relation_iets="Fuente complementaria de evidencia clinica e indicacion",
        resource_type="API REST",
        sync_frequency="diaria",
        rate_limit_rpm=180,
        requires_api_key=True,
        terms_url="https://www.ncbi.nlm.nih.gov/books/NBK25497/",
        verification_status="verificada",
        provides_fields=["indication"],
        catalog_note="3 pet/s sin llave, 10 con llave NCBI. El correo institucional va en cada llamada.",
        connector_config={
            "page_size": 20,
            "probe": {
                "url": "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi",
                "params": {"db": "pubmed", "term": "horizon scanning", "retmode": "json", "retmax": 1},
                "expect_status": 200,
                "expect_json_path": "esearchresult.idlist",
            },
        },
        tags="PubMed,NCBI,evidencia,FP-LI-01",
    ),
    _src(
        "FP-LI-02",
        "OMS publicaciones sobre tecnologias emergentes",
        url="https://www.who.int/teams/health-product-policy-and-standards/assistive-and-medical-technology/medical-devices/emerging-technologies",
        entity_type="literatura",
        category=CAT_LITERATURA,
        access_level="E",
        connector="manual",
        country="Internacional",
        authors="World Health Organization",
        description="Publicaciones puntuales, sin serie.",
        relation_iets="Curaduria anual; no gobierna el pipeline",
        language="Ingles",
        sync_frequency="anual",
        verification_status="declarada",
        provides_fields=[],
        aliases=["OMS", "WHO emerging technologies"],
        tags="OMS,WHO,emergentes,manual,FP-LI-02",
    ),
]


def _maker(
    code: str,
    name: str,
    url: str,
    *,
    structured: bool,
    country: str = "Internacional",
    note: str = "",
    scrape: bool = True,
    connector: str = "html",
) -> dict:
    return _src(
        code,
        name,
        url=url,
        entity_type="fabricante",
        category=CAT_FABRICANTE,
        access_level="D" if structured else "E",
        connector=connector if structured and scrape else "manual",
        country=country,
        authors=name.split("—")[0].split("(")[0].strip(),
        description=(
            "Pipeline publicado en tabla o listado estructurado. Es confirmacion "
            "de una senal que ya debio entrar por ensayo o tramite regulatorio."
            if structured
            else "Portafolio comercial sin pipeline estructurado. Aporta poco al horizonte temprano."
        ),
        relation_iets=(
            "Confirmacion de senal. Nivel D no sobreescribe campos de fuentes A/B."
            if structured
            else "Curaduria trimestral. La novedad de dispositivos rinde mejor por openFDA y Health Canada."
        ),
        sync_frequency="mensual" if structured else "trimestral",
        verification_status="declarada",
        catalog_note=note or (
            "Consultar robots.txt y condiciones de uso antes de cada corrida."
            if structured
            else "No se rastrea de forma automatica."
        ),
        scrape_enabled=scrape and structured,
        provides_fields=["commercial_name", "inn_name", "manufacturer"] if structured else ["manufacturer"],
        tags=f"fabricante,{code}",
        connector_config={
            "probe": {"url": url, "expect_status": 200},
            "respect_robots": True,
        },
    )


_MF = [
    _maker("FP-MF-01", "AbbVie — pipeline", "https://www.abbvie.com/science/pipeline.html", structured=True, country="EE. UU."),
    _maker("FP-MF-02", "Amgen — pipeline", "https://www.amgenpipeline.com/", structured=True, country="EE. UU."),
    _maker("FP-MF-03", "AstraZeneca — pipeline", "https://www.astrazeneca.com/our-therapy-areas/pipeline.html", structured=True, country="Reino Unido"),
    _maker("FP-MF-04", "Bayer — pipeline", "https://www.bayer.com/en/pharma/pipeline", structured=True, country="Alemania"),
    _maker("FP-MF-05", "Boehringer Ingelheim — pipeline", "https://www.boehringer-ingelheim.com/science/human-health/clinical-pipeline", structured=True, country="Alemania"),
    _maker("FP-MF-06", "Bristol Myers Squibb — pipeline", "https://www.bms.com/researchers-and-partners/in-the-pipeline.html", structured=True, country="EE. UU."),
    _maker("FP-MF-07", "Gilead — pipeline", "https://www.gilead.com/science/pipeline", structured=True, country="EE. UU."),
    _maker("FP-MF-08", "GSK — pipeline", "https://www.gsk.com/en-gb/innovation/pipeline/", structured=True, country="Reino Unido"),
    _maker("FP-MF-09", "Johnson & Johnson — pipeline", "https://www.jnj.com/innovation", structured=True, country="EE. UU."),
    _maker("FP-MF-10", "Lilly — pipeline", "https://www.lilly.com/discovery/clinical-development-pipeline", structured=True, country="EE. UU."),
    _maker("FP-MF-11", "Merck — pipeline", "https://www.merck.com/research/product-pipeline/", structured=True, country="EE. UU."),
    _maker("FP-MF-12", "Novartis — pipeline", "https://www.novartis.com/research-development/novartis-pipeline", structured=True, country="Suiza"),
    _maker("FP-MF-13", "Pfizer — pipeline", "https://www.pfizer.com/science/drug-product-pipeline", structured=True, country="EE. UU."),
    _maker("FP-MF-14", "Roche — pipeline", "https://www.roche.com/innovation/pipeline", structured=True, country="Suiza"),
    _maker("FP-MF-15", "Sanofi — pipeline", "https://www.sanofi.com/en/science-and-innovation/research-clinical-trials/pipeline", structured=True, country="Francia"),
    _maker("FP-MF-16", "Abbott", "https://www.abbott.com/", structured=False, country="EE. UU."),
    _maker("FP-MF-17", "Baxter", "https://www.baxter.com/", structured=False, country="EE. UU."),
    _maker("FP-MF-18", "Becton Dickinson (BD)", "https://www.bd.com/", structured=False, country="EE. UU."),
    _maker(
        "FP-MF-19",
        "Boston Scientific",
        "https://www.bostonscientific.com/",
        structured=False,
        country="EE. UU.",
        note="La matriz advierte que traer los datos de forma automatizada no es razonable. Conector manual.",
        scrape=False,
    ),
    _maker("FP-MF-20", "GE HealthCare", "https://www.gehealthcare.com/", structured=False, country="EE. UU."),
    _maker("FP-MF-21", "Medtronic", "https://www.medtronic.com/", structured=False, country="EE. UU."),
    _maker("FP-MF-22", "Philips", "https://www.philips.com/healthcare", structured=False, country="Paises Bajos"),
    _maker("FP-MF-23", "Siemens Healthineers", "https://www.siemens-healthineers.com/", structured=False, country="Alemania"),
    _maker("FP-MF-24", "Stryker", "https://www.stryker.com/", structured=False, country="EE. UU."),
]


CATALOG_SOURCES: list[dict] = _CT + _RG + _HT + _MF


def all_catalog_sources() -> list[dict]:
    return list(CATALOG_SOURCES)


def all_seed_sources() -> list[dict]:
    """Compatibilidad con el arranque: el inventario operativo es el catalogo."""
    return all_catalog_sources()


# Las fuentes con contrato de datos (A/B) que el worker puede ingerir solo.
API_SOURCES: list[dict] = [
    row for row in CATALOG_SOURCES if row.get("access_level") in {"A", "B"} and row.get("catalog_active")
]


def catalog_stats() -> dict:
    rows = CATALOG_SOURCES
    levels = {k: 0 for k in "ABCDE"}
    for row in rows:
        levels[row["access_level"]] = levels.get(row["access_level"], 0) + 1
    return {
        "version": CATALOG_VERSION,
        "total": len(rows),
        "by_level": levels,
        "by_block": {
            CAT_ENSAYOS: sum(1 for r in rows if r["category"] == CAT_ENSAYOS),
            CAT_REGULATORIA: sum(1 for r in rows if r["category"] == CAT_REGULATORIA),
            CAT_HTA: sum(1 for r in rows if r["category"] == CAT_HTA),
            CAT_LITERATURA: sum(1 for r in rows if r["category"] == CAT_LITERATURA),
            CAT_FABRICANTE: sum(1 for r in rows if r["category"] == CAT_FABRICANTE),
        },
        "active": sum(1 for r in rows if r.get("catalog_active")),
        "contrast": sum(1 for r in rows if r.get("is_contrast")),
        "governors": sum(1 for r in rows if r.get("access_level") in {"A", "B"} and r.get("catalog_active")),
    }
