"""Catalogos y parametros metodologicos del escaneo de horizonte (fase 1 y 2).

La especificacion advierte que clusteres, tipologias y umbrales pueden variar
tras la referenciacion. Por eso se cargan como datos parametrizables en base de
datos y no como enumeraciones en codigo: un ajuste del Manual Metodologico no
debe obligar a un despliegue.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from .models import Cluster, MethodologyParam, PriorityCriterion, TechType

# --------------------------------------------------------------------------- #
#  Estados (catalogo versionado, nunca texto libre)
# --------------------------------------------------------------------------- #
CYCLE_STATUSES = (
    "en_configuracion",
    "en_filtrado",
    "en_priorizacion",
    "en_evaluacion",
    "cerrado_consolidado",
)

CYCLE_STATUS_LABELS = {
    "en_configuracion": "En configuracion",
    "en_filtrado": "En filtrado",
    "en_priorizacion": "En priorizacion",
    "en_evaluacion": "En evaluacion",
    "cerrado_consolidado": "Cerrado / consolidado",
}

# Transiciones permitidas de la maquina de estados del ciclo (seccion 7 del plan).
CYCLE_TRANSITIONS: dict[str, tuple[str, ...]] = {
    "en_configuracion": ("en_filtrado",),
    "en_filtrado": ("en_priorizacion", "en_configuracion"),
    "en_priorizacion": ("en_evaluacion", "en_filtrado"),
    "en_evaluacion": ("cerrado_consolidado", "en_priorizacion"),
    "cerrado_consolidado": (),
}

TECHNOLOGY_STATUSES = (
    "capturada_no_asignada",
    "asignada_a_ciclo",
    "filtrada_apta_priorizacion",
    "excluida",
    "priorizada",
    "bajo_vigilancia",
    "no_priorizada",
    "en_evaluacion",
    "publicada",
)

TECHNOLOGY_STATUS_LABELS = {
    "capturada_no_asignada": "Capturada / no asignada",
    "asignada_a_ciclo": "Asignada al ciclo",
    "filtrada_apta_priorizacion": "Filtrada / apta para priorizacion",
    "excluida": "Excluida",
    "priorizada": "Priorizada",
    "bajo_vigilancia": "Bajo vigilancia",
    "no_priorizada": "No priorizada",
    "en_evaluacion": "En evaluacion",
    "publicada": "Publicada",
}

CONDITIONS = ("emergente", "nueva")

CONDITION_LABELS = {
    "emergente": "Emergente - en fases clinicas avanzadas (II o III), previa a aprobacion",
    "nueva": "Nueva - aprobada en agencia de referencia hace 12 meses o menos, sin adopcion en el SGSSS",
}

# Motivos de exclusion tipificados (RF10 / RF12); inmutables una vez aplicados.
EXCLUSION_REASONS = {
    "ya_disponible": "Ya disponible en el pais con registro sanitario vigente",
    "modificacion_menor": "Modificacion menor de una tecnologia existente",
    "generico_convencional": "Generico o biosimilar convencional sin innovacion",
    "duplicada": "Duplicada de otro registro del ciclo",
    "fuera_alcance": "Fuera del alcance de tecnologia sanitaria",
    "evidencia_insuficiente": "Evidencia insuficiente para caracterizar la senal",
}

# --------------------------------------------------------------------------- #
#  Criterio de novedad (RF10, fase 3)
# --------------------------------------------------------------------------- #
# Las cuatro vias por las que una tecnologia puede considerarse novedosa. El
# plan enuncia las tres ultimas al describir el criterio de aceptacion ("nueva
# indicacion, nueva forma farmaceutica disruptiva o combinacion") y la primera
# es el caso base. La lista se deja como dato y se marca la decision D-05
# porque la especificacion no las numera de forma explicita.
NOVELTY_OPTIONS = {
    "no_disponible_en_pais": (
        "No disponible en el pais: sin registro sanitario vigente ante el INVIMA"
    ),
    "nueva_indicacion": (
        "Nueva indicacion terapeutica de una tecnologia ya registrada"
    ),
    "nueva_forma_farmaceutica": (
        "Nueva forma farmaceutica o via de administracion con caracter disruptivo"
    ),
    "nueva_combinacion": (
        "Nueva combinacion de principios activos o de tecnologias ya existentes"
    ),
}

# Vias que exigen justificar por que sigue siendo novedosa pese al registro
# sanitario vigente. Sin registro previo, el caso base no requiere sustento.
NOVELTY_REQUIRES_JUSTIFICATION = (
    "nueva_indicacion",
    "nueva_forma_farmaceutica",
    "nueva_combinacion",
)

# Antiguedad maxima tolerable del indice local de INVIMA antes de advertir.
INVIMA_STALE_DAYS = 30

# --------------------------------------------------------------------------- #
#  Clusteres de salud del IETS (RF06)
# --------------------------------------------------------------------------- #
CLUSTER_SEED: list[dict] = [
    {
        "code": "cancer",
        "name": "Cancer",
        "description": "Neoplasias malignas y sus tecnologias asociadas de diagnostico y tratamiento.",
        "keywords": [
            "cancer", "oncolog", "tumor", "carcinoma", "melanoma", "leucemia",
            "linfoma", "mieloma", "sarcoma", "metasta", "quimioterap", "neoplas",
        ],
        "icd10_prefixes": ["C", "D0", "D1", "D2", "D3", "D4"],
        "mesh_terms": ["Neoplasms", "Antineoplastic Agents"],
        "sort_order": 1,
    },
    {
        "code": "alto_costo",
        "name": "Enfermedades de alto costo",
        "description": "Patologias de alto impacto financiero para el SGSSS segun la Cuenta de Alto Costo.",
        "keywords": [
            "alto costo", "enfermedad renal", "dialisis", "trasplante", "vih", "sida",
            "hemofilia", "artritis reumatoide", "esclerosis multiple", "hepatitis c",
        ],
        "icd10_prefixes": ["N18", "B20", "B21", "B22", "B23", "B24", "D66", "D67", "M05", "M06", "G35"],
        "mesh_terms": ["Renal Insufficiency, Chronic", "HIV Infections", "Multiple Sclerosis"],
        "sort_order": 2,
    },
    {
        "code": "huerfanas",
        "name": "Enfermedades huerfanas o raras",
        "description": "Condiciones de baja prevalencia reconocidas como huerfanas en Colombia.",
        "keywords": [
            "huerfana", "enfermedad rara", "rare disease", "orphan", "atrofia muscular",
            "fibrosis quistica", "duchenne", "pompe", "gaucher", "fabry", "amiloidosis",
        ],
        "icd10_prefixes": ["E70", "E71", "E72", "E74", "E75", "E76", "G12", "G71", "Q"],
        "mesh_terms": ["Rare Diseases", "Orphan Drug Production"],
        "sort_order": 3,
    },
    {
        "code": "infecciosas_emergentes",
        "name": "Covid-19 y otras infecciosas emergentes",
        "description": "Enfermedades infecciosas emergentes y reemergentes de interes en salud publica.",
        "keywords": [
            "covid", "sars-cov", "influenza", "pandemi", "dengue", "zika", "chikungunya",
            "mpox", "viruela del mono", "tuberculosis", "malaria", "brote", "vacuna",
            "antimicrobial resistance", "resistencia antimicrobiana",
        ],
        "icd10_prefixes": ["U07", "U09", "A", "B0", "B1", "J09", "J10", "J11"],
        "mesh_terms": ["COVID-19", "Communicable Diseases, Emerging", "Vaccines"],
        "sort_order": 4,
    },
    {
        "code": "prevalentes",
        "name": "Enfermedades prevalentes",
        "description": "Condiciones cronicas de alta prevalencia: cardiovasculares, metabolicas y mentales.",
        "keywords": [
            "diabet", "hipertens", "cardiovascular", "obesidad", "epoc", "asma",
            "depresion", "ansiedad", "salud mental", "alzheimer", "demencia",
            "accidente cerebrovascular", "insuficiencia cardiaca", "dislipidemia",
        ],
        "icd10_prefixes": ["E10", "E11", "E66", "I10", "I11", "I20", "I21", "I50", "I63", "J44", "J45", "F32", "F41", "G30"],
        "mesh_terms": ["Diabetes Mellitus", "Hypertension", "Cardiovascular Diseases", "Mental Disorders"],
        "sort_order": 5,
    },
    {
        "code": "otras_prioritarias",
        "name": "Otras categorias sanitarias prioritarias",
        "description": "Salud materna e infantil, salud sexual y reproductiva y demas prioridades sanitarias.",
        "keywords": [
            "materna", "neonatal", "pediatr", "salud sexual", "reproductiva", "prenatal",
            "geriatr", "cuidado paliativo", "rehabilitacion", "nutricion",
        ],
        "icd10_prefixes": ["O", "P", "Z3"],
        "mesh_terms": ["Maternal Health", "Child Health", "Reproductive Health"],
        "sort_order": 6,
    },
]

# --------------------------------------------------------------------------- #
#  Tipologias tecnologicas (RF07)
# --------------------------------------------------------------------------- #
TECH_TYPE_SEED: list[dict] = [
    {
        "code": "medicamento",
        "name": "Medicamento quimico o biologico",
        "description": "Moleculas pequenas, biologicos y biosimilares.",
        "keywords": ["medicamento", "farmaco", "drug", "molecula", "biologic", "anticuerpo", "inhibidor", "mab", "biosimilar"],
        "legacy_types": ["medicamento"],
        "sort_order": 1,
    },
    {
        "code": "terapia_avanzada",
        "name": "Terapias avanzadas y genicas",
        "description": "Terapia genica, celular, CAR-T e ingenieria de tejidos.",
        "keywords": ["terapia genica", "gene therapy", "car-t", "car t", "celulas madre", "stem cell", "crispr", "arn mensajero", "mrna", "terapia celular"],
        "legacy_types": [],
        "sort_order": 2,
    },
    {
        "code": "dispositivo",
        "name": "Dispositivos medicos",
        "description": "Equipos, implantes e insumos de uso clinico.",
        "keywords": ["dispositivo", "device", "implante", "protesis", "stent", "cateter", "marcapasos", "wearable"],
        "legacy_types": ["dispositivo"],
        "sort_order": 3,
    },
    {
        "code": "diagnostico_ivd",
        "name": "Equipos y reactivos de diagnostico in vitro",
        "description": "Pruebas diagnosticas, reactivos y plataformas de laboratorio.",
        "keywords": ["diagnostic", "in vitro", "ivd", "biomarcador", "reactivo", "prueba rapida", "secuenciacion", "pcr", "tamizaje", "screening test"],
        "legacy_types": [],
        "sort_order": 4,
    },
    {
        "code": "procedimiento",
        "name": "Procedimientos quirurgicos y nuevas tecnicas clinicas",
        "description": "Tecnicas quirurgicas, intervencionismo y procedimientos clinicos nuevos.",
        "keywords": ["procedimiento", "cirugia", "quirurgic", "surgery", "tecnica", "intervencion", "ablacion", "endoscop", "robotic surgery"],
        "legacy_types": [],
        "sort_order": 5,
    },
    {
        "code": "salud_digital",
        "name": "Salud digital",
        "description": "Telesalud, aplicaciones terapeuticas y monitoreo remoto.",
        "keywords": ["salud digital", "digital health", "telemedicina", "telesalud", "aplicacion movil", "app", "monitoreo remoto", "plataforma digital", "software as a medical device"],
        "legacy_types": ["digital"],
        "sort_order": 6,
    },
    {
        "code": "ia",
        "name": "Algoritmos y sistemas de inteligencia artificial",
        "description": "Modelos de aprendizaje automatico y sistemas de apoyo a la decision clinica.",
        "keywords": ["inteligencia artificial", "artificial intelligence", " ia ", " ai ", "machine learning", "aprendizaje automatico", "deep learning", "algoritmo", "red neuronal"],
        "legacy_types": [],
        "sort_order": 7,
    },
]

# --------------------------------------------------------------------------- #
#  Matriz oficial de priorizacion P1 a P6 (modulo 3)
# --------------------------------------------------------------------------- #
PRIORITY_CRITERIA_SEED: list[dict] = [
    {
        "code": "P1",
        "short_label": "Novedad en el pais",
        "prompt": "La tecnologia sanitaria es nueva, es decir, no se encuentra disponible en el pais.",
        "role_scope": "evaluador_tecnico",
        "auto_prefill": True,
        "sort_order": 1,
    },
    {
        "code": "P2",
        "short_label": "Relevancia clinica",
        "prompt": (
            "La condicion a la que se destina es relevante por alta mortalidad, morbilidad "
            "o deterioro grave de la calidad de vida."
        ),
        "role_scope": "evaluador_clinico",
        "auto_prefill": False,
        "sort_order": 2,
    },
    {
        "code": "P3",
        "short_label": "Carga e impacto financiero",
        "prompt": (
            "La condicion representa alta carga de enfermedad o impacto financiero sustancial "
            "para el SGSSS."
        ),
        "role_scope": "evaluador_clinico",
        "auto_prefill": False,
        "sort_order": 3,
    },
    {
        "code": "P4",
        "short_label": "Impacto organizacional",
        "prompt": (
            "Se anticipa un impacto organizacional importante, como cambio de ruta clinica, "
            "infraestructura o entrenamiento complejo."
        ),
        "role_scope": "evaluador_clinico",
        "auto_prefill": False,
        "sort_order": 4,
    },
    {
        "code": "P5",
        "short_label": "Aprobacion en agencia de referencia",
        "prompt": (
            "Ha sido aprobada por agencias de referencia internacional (EMA, FDA) en los "
            "ultimos 12 meses o menos."
        ),
        "role_scope": "evaluador_tecnico",
        "auto_prefill": True,
        "sort_order": 5,
    },
    {
        "code": "P6",
        "short_label": "Tramite regulatorio en curso",
        "prompt": (
            "Esta sometida o bajo proceso formal de evaluacion regulatoria en agencias de "
            "referencia, en 6 meses o menos."
        ),
        "role_scope": "evaluador_tecnico",
        "auto_prefill": True,
        "sort_order": 6,
    },
]

# --------------------------------------------------------------------------- #
#  Parametros metodologicos
# --------------------------------------------------------------------------- #
PARAM_SEED: list[dict] = [
    {
        "key": "cycle.max_per_year",
        "value": "3",
        "value_type": "int",
        "description": "Numero maximo de ciclos formales por ano calendario.",
    },
    {
        "key": "cycle.window_weeks_min",
        "value": "10",
        "value_type": "int",
        "description": "Duracion minima de la ventana operativa del ciclo, en semanas.",
    },
    {
        "key": "cycle.window_weeks_max",
        "value": "16",
        "value_type": "int",
        "description": "Duracion maxima de la ventana operativa del ciclo, en semanas.",
    },
    {
        "key": "priority.points_prioritized",
        "value": "4",
        "value_type": "int",
        "description": (
            "Puntos minimos para clasificar como PRIORIZADA. Regla vigente por conteo de "
            "puntos mientras la coordinacion metodologica cierra la decision D-02."
        ),
    },
    {
        "key": "priority.points_watch",
        "value": "3",
        "value_type": "int",
        "description": "Puntos exactos que clasifican como BAJO VIGILANCIA.",
    },
    {
        "key": "priority.threshold_pct_label",
        "value": "70",
        "value_type": "int",
        "description": "Umbral porcentual de referencia que se muestra en la interfaz.",
    },
    {
        "key": "priority.criteria_total",
        "value": "6",
        "value_type": "int",
        "description": "Cantidad de criterios de la matriz oficial (denominador de %P).",
    },
    {
        "key": "dedup.similarity_threshold",
        "value": "85",
        "value_type": "int",
        "description": (
            "Similitud minima (%) para proponer la fusion de dos registros. "
            "Bajarlo propone mas fusiones y exige mas revision humana."
        ),
    },
    {
        "key": "ingest.circuit_failures",
        "value": "3",
        "value_type": "int",
        "description": (
            "Fallos consecutivos de una fuente antes de abrir el cortacircuitos. "
            "Un referente caido no puede arrastrar al resto de la corrida."
        ),
    },
    {
        "key": "ingest.circuit_cooldown_hours",
        "value": "6",
        "value_type": "int",
        "description": "Horas que permanece abierto el cortacircuitos de una fuente.",
    },
    {
        "key": "ingest.max_records_per_run",
        "value": "50",
        "value_type": "int",
        "description": "Tope de registros que un conector persiste por corrida.",
    },
    {
        "key": "invima.match_threshold",
        "value": "88",
        "value_type": "int",
        "description": (
            "Similitud minima (%) para considerar que una tecnologia ya tiene "
            "registro sanitario vigente en el indice local del INVIMA."
        ),
    },
    {
        "key": "evaluation.mini_hta_min_points",
        "value": "6",
        "value_type": "int",
        "description": (
            "Puntos minimos de la matriz P1-P6 para sugerir Mini-HTA (D-07/D-09). "
            "El nivel se puede sobreescribir por tecnologia sin desplegar."
        ),
    },
    {
        "key": "evaluation.informe_min_points",
        "value": "5",
        "value_type": "int",
        "description": (
            "Puntos minimos para sugerir informe tecnico. Por debajo se sugiere "
            "ficha. Decisiones D-07 y D-09 siguen abiertas."
        ),
    },
    {
        "key": "evaluation.reviewer_token_days",
        "value": "10",
        "value_type": "int",
        "description": "Vigencia en dias del token JWT del revisor externo (RF16).",
    },
    {
        "key": "ttm.inminente_months_max",
        "value": "12",
        "value_type": "int",
        "description": "Tope en meses para clasificar time-to-market como inminente (D-10).",
    },
    {
        "key": "ttm.transicion_months_max",
        "value": "24",
        "value_type": "int",
        "description": "Tope en meses para clasificar time-to-market como transicion (D-10).",
    },
    {
        "key": "ttm.emergente_months_max",
        "value": "36",
        "value_type": "int",
        "description": "Tope en meses para clasificar time-to-market como emergente (D-10).",
    },
    {
        "key": "ttm.regulatory_review_days",
        "value": "180",
        "value_type": "int",
        "description": "Dias de revision regulatoria que se suman al cierre de fase III.",
    },
    {
        "key": "alerts.high_budget_points",
        "value": "5",
        "value_type": "int",
        "description": "Puntos minimos de la matriz para considerar alto riesgo presupuestal (RF20).",
    },
    {
        "key": "alerts.phase3_country_tokens",
        "value": "colombia,colombiano,colombiana",
        "value_type": "str",
        "description": "Tokens que senalan un ensayo fase III asociado al pais.",
    },
]

# Parametros que se sembraron alguna vez y ya no gobiernan ningun calculo. La
# migracion los elimina de las bases existentes para que la pantalla de
# configuracion no ofrezca perillas sin efecto.
#
# `screening.queue_threshold`: el destaque en la cola de cribado es una ayuda
# visual, no una regla metodologica, y vive como constante compartida entre
# `priority.SCREENING_QUEUE_THRESHOLD` y su equivalente en el frontend.
RETIRED_PARAMS: tuple[str, ...] = ("screening.queue_threshold",)


# --------------------------------------------------------------------------- #
#  Acceso a parametros
# --------------------------------------------------------------------------- #
def get_param(db: Session, key: str, default: int | float | str | None = None):
    row = db.get(MethodologyParam, key)
    if row is None:
        return default
    raw = row.value
    try:
        if row.value_type == "int":
            return int(raw)
        if row.value_type == "float":
            return float(raw)
        if row.value_type == "bool":
            return raw.strip().lower() in ("1", "true", "si", "yes")
    except (TypeError, ValueError):
        return default
    return raw


def get_params(db: Session) -> dict:
    return {row.key: get_param(db, row.key) for row in db.query(MethodologyParam).all()}


# --------------------------------------------------------------------------- #
#  Siembra idempotente
# --------------------------------------------------------------------------- #
def seed_catalogs(db: Session) -> None:
    """Crea catalogos y parametros si no existen. No sobrescribe ajustes locales."""
    for data in CLUSTER_SEED:
        if not db.query(Cluster).filter(Cluster.code == data["code"]).first():
            db.add(Cluster(**data))

    for data in TECH_TYPE_SEED:
        if not db.query(TechType).filter(TechType.code == data["code"]).first():
            db.add(TechType(**data))

    for data in PRIORITY_CRITERIA_SEED:
        exists = (
            db.query(PriorityCriterion)
            .filter(PriorityCriterion.code == data["code"], PriorityCriterion.version == 1)
            .first()
        )
        if not exists:
            db.add(PriorityCriterion(version=1, **data))

    for data in PARAM_SEED:
        if not db.get(MethodologyParam, data["key"]):
            db.add(MethodologyParam(**data))

    db.commit()
