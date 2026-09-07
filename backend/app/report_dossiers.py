"""Dossiers de evaluacion con contenido real de tecnologias vigiladas.

Se emparejan por nombre comercial, DCI o texto de la senal. Si no hay
coincidencia, se usa una plantilla generica pero completa.
"""
from __future__ import annotations

import re

from . import evaluation as eval_catalog

DOSSIERS: list[dict] = [
    {
        "match": r"lutathera|aaa601|oxodotreot|dotatate|gepn|sstr",
        "level": "mini_hta",
        "inn": "lutecio (177Lu) oxodotreotida",
        "manufacturer": "Novartis (Advanced Accelerator Applications)",
        "title": "Lutathera (lutecio Lu 177 oxodotreotida) en tumores neuroendocrinos gastroenteropancreaticos",
        "nct_hint": "NETTER",
        "body": {
            "health_condition": (
                "Tumores neuroendocrinos gastroenteropancreaticos (TNE-GEP) bien diferenciados, "
                "somatostatina-receptores positivos (SSTR+). En Colombia la carga se concentra en "
                "centros de referencia de oncologia; el diagnostico suele ser tardio y el acceso a "
                "medicina nuclear es heterogeneo entre regiones."
            ),
            "mechanism": (
                "Radioligando: el analogo de somatostatina (oxodotreotida) se une a SSTR2 y entrega "
                "lutecio-177, que emite radiacion beta de corto alcance sobre las celulas tumorales. "
                "Es terapia dirigida, no quimioterapia sistemica convencional."
            ),
            "target_population_co": (
                "Adultos con TNE-GEP SSTR+ irresecables o metastaticos que progresan a analogos de "
                "somatostatina. Poblacion nacional estimada en cientos de casos incidentes/anio, "
                "concentrada en Bogota, Medellin, Cali y Bucaramanga. La extension pediatrica del "
                "pipeline de Novartis (fase 2) no tiene aun via regulatoria local."
            ),
            "evidence_state": (
                "Ensayo NETTER-1 (fase III, NEJM 2017): Lutathera vs octreotida de alta dosis mejoro "
                "la supervivencia libre de progresion (PFS mediana 28,4 vs 8,4 meses). Aprobacion FDA "
                "(2018) y EMA. NETTER-2 y extensiones en GEP-NET y pediatria estan en el pipeline "
                "2026-2028 de Novartis. Evidencia colombiana: series de caso en medicina nuclear; "
                "no hay ensayo local pivote."
            ),
            "comparators_sgsss": (
                "Analogos de somatostatina (octreotida/lanreotida LS), everolimus, sunitinib en TNE "
                "pancreaticos, y retiro hepatico/quirurgico cuando es factible. La terapia con "
                "radioligando no tiene equivalente cubierto de forma homogenea en el PBS/SGSSS."
            ),
            "adoption_risks": (
                "Dependencia de lutecio-177 y de camaras SPECT/PET-SSTR; cupos de medicina nuclear; "
                "cadena de frio y radioproteccion; costo por ciclo (tipicamente 4 infusiones). "
                "Ruta INVIMA de radiofarmacos y capacidad IETS para Mini-HTA de alto impacto."
            ),
            "narrative": (
                "Lutathera es la senal de radioligando mas madura del ciclo. Ya es estandar en "
                "agencias de referencia y el pipeline de Novartis busca ampliar indicacion a GEP-NET "
                "pediatrico y a escenarios mas tempranos (NETTER-2). Para Colombia el cuello de "
                "botella no es solo el registro: es la red de medicina nuclear y el financiamiento "
                "por ciclo. Se recomienda Mini-HTA con modelacion presupuestal a 3 anios y mapa de "
                "centros habilitados."
            ),
            "evidence_phases": (
                "Fase III concluidos (NETTER-1). Extensiones fase III/II en curso (NETTER-2, GEP-NET "
                "pediatrico, horizonte 2028 segun pipeline Novartis 2026)."
            ),
            "efficacy_outcomes": (
                "PFS (desenlace primario NETTER-1), tasa de respuesta objetiva, calidad de vida "
                "(EORTC), supervivencia global (analisis posteriores)."
            ),
            "safety_outcomes": (
                "Nausea, linfopenia, trombocitopenia, nefropatia por exposicion tubular al "
                "radiofarmaco (se mitiga con aminoacidos). Contraindicacion relativa en insuficiencia "
                "renal grave."
            ),
            "pico_population": "Adultos con TNE-GEP SSTR+ irresecable/metastasico progresivo a analogos de somatostatina, en Colombia.",
            "pico_intervention": "Lutathera 7,4 GBq IV cada 8 semanas x 4 ciclos, con proteccion renal.",
            "pico_comparator": "Octreotida/lanreotida a dosis alta, everolimus o mejor cuidado de soporte cubierto.",
            "pico_outcome": "PFS a 20 meses, SG, eventos renales grado >=3, costo incremental por AVAC.",
            "budget_year_1": (
                "3200000000. Anio 1: 40-80 pacientes en centros de referencia. Costo dominante: "
                "radiofarmaco + hospitalizacion corta + imagen SSTR. Impacto alto y concentrado. "
                "Orden de magnitud en COP."
            ),
            "budget_year_2": (
                "4800000000. Anio 2: posible expansion si INVIMA habilita mas sedes. Incluir "
                "retratamiento seleccionado y seguimiento de toxicidad renal. Orden de magnitud en COP."
            ),
            "budget_year_3": (
                "4100000000. Anio 3: estabilizacion de cohorte prevalente. Sensible a precio de "
                "lutecio-177 y a entrada de competidores radioligando. Orden de magnitud en COP."
            ),
            "clinical_uncertainty": (
                "Generalizacion de NETTER-1 a la casuistica colombiana (estadio al diagnostico, "
                "acceso a Ga-68 DOTATATE). Incertidumbre en SG de largo plazo y en subgrupos "
                "pediatricos."
            ),
            "early_dialogue_notes": (
                "Dialogo temprano sugerido con INVIMA (radiofarmacos), red de medicina nuclear y "
                "cuentas de alto costo. Priorizar centros que ya operan analogos de somatostatina."
            ),
        },
    },
    {
        "match": r"scemblix|abl001|asciminib|bcr-abl|cml|leucemia mieloide",
        "level": "informe",
        "inn": "asciminib",
        "manufacturer": "Novartis",
        "title": "Scemblix (asciminib) en leucemia mieloide cronica, incluida la extension pediatrica",
        "body": {
            "health_condition": (
                "Leucemia mieloide cronica (LMC) Ph+ / BCR-ABL1. En Colombia es una enfermedad de "
                "alto costo con TKI de primera y segunda generacion ya posicionados (imatinib, "
                "dasatinib, nilotinib, bosutinib)."
            ),
            "mechanism": (
                "Inhibidor alosterico STAMP (Specifically Targeting the ABL Myristoyl Pocket), "
                "distinto del sitio ATP de los TKI clasicos. Cubre mutaciones de resistencia "
                "incluyendo T315I en esquemas aprobados internacionalmente."
            ),
            "target_population_co": (
                "Adultos con LMC en fase cronica resistentes o intolerantes a >=2 TKI. El pipeline "
                "2027 de Novartis incluye LMC pediatrica en fase 2: poblacion pequena pero de alto "
                "impacto etico y de equidad."
            ),
            "evidence_state": (
                "ASCEMBL (fase III): asciminib vs bosutinib en LMC resistente/intolerante; superior "
                "respuesta molecular mayor a 24 semanas. FDA 2021 (linea posterior) y ampliaciones "
                "posteriores. Extension pediatrica en curso (fase 2, horizonte ~2027)."
            ),
            "comparators_sgsss": (
                "Imatinib (primera linea habitual), dasatinib/nilotinib, bosutinib y, en "
                "refractariedad extrema, ponatinib o trasplante alogenico cuando hay donante."
            ),
            "adoption_risks": (
                "Precio de TKI de tercera via; desplazamiento de bosutinib/ponatinib; necesidad de "
                "monitoreo molecular (BCR-ABL IS) homogeneo. La via pediatrica exigira presentacion "
                "y dosificacion especifica."
            ),
            "narrative": (
                "Scemblix cierra una brecha real en LMC multirresistente y es la senal hematologica "
                "mas solida del ciclo. La novedad para Colombia no es el mecanismo en abstracto, "
                "sino la disponibilidad de una opcion post-2 TKI con mejor tolerabilidad GI que "
                "bosutinib y una linea pediatrica en el horizonte 2027."
            ),
            "evidence_phases": "Fase III (ASCEMBL) publicada. Fase 2 pediatrica en pipeline Novartis.",
            "efficacy_outcomes": "Respuesta molecular mayor (MMR), MR4, duracion de respuesta, supervivencia.",
            "safety_outcomes": "Hipertension, elevacion de enzimas pancreaticas/hepaticas; menor toxicidad GI comparada con bosutinib en ASCEMBL.",
            "early_dialogue_notes": "Coordinar con el programa de alto costo y con hematologia pediatrica de INSN / INC.",
        },
    },
    {
        "match": r"pelabresib|dak539|bet inhibitor|mielofibrosis|myelofibrosis",
        "level": "informe",
        "inn": "pelabresib",
        "manufacturer": "Novartis",
        "title": "Pelabresib (DAK539) en mielofibrosis: inhibidor BET en fase 3",
        "body": {
            "health_condition": (
                "Mielofibrosis primaria o secundaria (post-PV/PE). Enfermedad mieloproliferativa "
                "con esplenomegalia, sintomas constitucionales y riesgo de transformacion a LMA. "
                "En Colombia el diagnostico se concentra en hematologia de adultos de centros de "
                "cuarto nivel."
            ),
            "mechanism": (
                "Inhibidor de proteinas BET (bromodomain and extra-terminal). Modula transcripcion "
                "de oncogenes (MYC y otros) y vias inflamatorias de la medula."
            ),
            "target_population_co": (
                "Adultos con mielofibrosis intermedia-2 o de alto riesgo, candidatos a ruxolitinib "
                "o refractarios/intolerantes. Cohorte nacional limitada (decenas a pocos cientos)."
            ),
            "evidence_state": (
                "Programa fase 3 de Novartis con horizonte de lectura 2026 (pipeline corporativo). "
                "Manifesta (fase 3, combinacion con ruxolitinib) mostro senales de mejoria de "
                "volumen esplenico y sintomas en lecturas previas; la decision regulatoria global "
                "sigue pendiente al corte de este ciclo."
            ),
            "comparators_sgsss": (
                "Ruxolitinib (cuando accesible), hidroxiurea, danazol, transfusiones y, en "
                "seleccionados, trasplante alogenico."
            ),
            "adoption_risks": (
                "Incertidumbre de resultado fase 3; competencia de otros BET/inhibidores de "
                "progreso; costo oncohematologico. No hay registro INVIMA. Horizonte transicional "
                "a inminente si 2026 es positivo."
            ),
            "narrative": (
                "Pelabresib es una senal de vigilancia activa, no de adopcion inmediata. El IETS "
                "debe mantenerla en el radar 2026 porque un resultado positivo de fase 3 moveria "
                "la mielofibrosis de un mercado de un solo JAK2 a combinaciones. Se publica "
                "informe temprano, no Mini-HTA, hasta tener OS/SVR duradero."
            ),
            "evidence_phases": "Fase 3 en lectura 2026 (pipeline Novartis). Fase 2 previas en combinacion con ruxolitinib.",
            "efficacy_outcomes": "Reduccion de volumen esplenico (SVR35), TSS (sintomas), independencia transfusional, OS.",
            "safety_outcomes": "Trombocitopenia, anemia, infecciones; vigilancia de eventos tromboticos y transformacion.",
            "early_dialogue_notes": "Seguimiento a ASCO/EHA 2026 y a la ficha CHMP/FDA si se presenta dossier.",
        },
    },
    {
        "match": r"dji136|dll3|car-?t|small cell lung|celulas pequenas",
        "level": "ficha",
        "inn": "CAR-T anti-DLL3 (DJI136)",
        "manufacturer": "Novartis",
        "title": "DJI136, CAR-T anti-DLL3 en cancer de pulmon de celulas pequenas",
        "body": {
            "health_condition": (
                "Cancer de pulmon de celulas pequenas (CPCP / SCLC) en recaida. Enfermedad de mal "
                "pronostico, alta carga en fumadores, con opciones limitadas tras platino-etoposido "
                "e inmunoterapia."
            ),
            "mechanism": (
                "Celulas T autologas con receptor quimerico dirigido a DLL3, antigeno expresado en "
                "tumores neuroendocrinos pulmonares y poco en tejido sano adulto."
            ),
            "target_population_co": (
                "Adultos con SCLC en segunda linea o posterior, ECOG 0-1, con capacidad de "
                "aferesis y centros de terapia celular. La oferta nacional de CAR-T es incipiente."
            ),
            "evidence_state": (
                "Fase 1 (first-in-human) en el pipeline Novartis 2026. No hay datos de eficacia "
                "pivote. Tarlatamab (anti-DLL3 bispecific) ya marco la via DLL3 en SCLC a nivel "
                "global; DJI136 es la apuesta celular."
            ),
            "comparators_sgsss": (
                "Topotecan, lurbinectedina (acceso irregular), re-reto a platino, cuidados "
                "paliativos. Tarlatamab no esta posicionado en el pais."
            ),
            "adoption_risks": (
                "Complejidad CAR-T (CRS, ICANS), costo extremo, centros habilitados, competencia "
                "con T-engagers DLL3. Horizonte emergente. Solo ficha de vigilancia."
            ),
            "early_dialogue_notes": "Mapear centros con experiencia CAR-T (LAL/LBDCG) antes de cualquier via SCLC.",
        },
    },
    {
        "match": r"farabursen|cyx082|mir17|adpkd|poliquistosis|polycystic",
        "level": "ficha",
        "inn": "farabursen",
        "manufacturer": "Novartis",
        "title": "Farabursen (CYX082), inhibidor de MIR17 en poliquistosis renal autosomica dominante",
        "body": {
            "health_condition": (
                "Poliquistosis renal autosomica dominante (PQRAD / ADPKD), causa genetica frecuente "
                "de enfermedad renal cronica y de ingreso a dialisis en adultos jovenes."
            ),
            "mechanism": (
                "Oligonucleotido / inhibidor de microARN-17 (MIR17), via implicada en proliferacion "
                "quistica. Estrategia distinta a tolvaptan (antagonista V2)."
            ),
            "target_population_co": (
                "Adultos con PQRAD y riesgo rapido de descenso de TFG. En Colombia hay cohortes en "
                "nefrologia de tercer nivel; el subdiagnostico familiar es alto."
            ),
            "evidence_state": (
                "Fase 1 en pipeline Novartis (lead indication). Sin evidencia de desenlace renal "
                "duro. Tolvaptan es el comparador farmacologico de referencia internacional."
            ),
            "comparators_sgsss": (
                "Control de PA, IECA/ARA II, tolvaptan cuando hay acceso, preparacion a TRR "
                "(dialisis/trasplante)."
            ),
            "adoption_risks": (
                "Horizonte emergente. Incertidumbre de eficacia y de via de administracion. "
                "Vigilancia, no priorizacion de evaluacion completa."
            ),
            "early_dialogue_notes": "Seguimiento a fases 2 de descenso de volumen renal total (htTKV) y TFG.",
        },
    },
    {
        "match": r"cannabidiol|cbd|fragile x|x fragil",
        "level": "informe",
        "inn": "cannabidiol",
        "manufacturer": "Ensayo clinico (ClinicalTrials.gov)",
        "title": "Cannabidiol en ninos, adolescentes y adultos jovenes con sindrome de X fragil",
        "body": {
            "health_condition": (
                "Sindrome de X fragil, causa monogenica mas frecuente de discapacidad intelectual "
                "hereditaria y de TEA sindromico. En Colombia el diagnostico molecular (FMR1) no "
                "es universal."
            ),
            "mechanism": (
                "Cannabidiol (CBD) modula senalizacion endocannabinoide y excitabilidad neuronal; "
                "no es tetrahidrocannabinol. Se estudia sobre irritabilidad, ansiedad y conducta."
            ),
            "target_population_co": (
                "Ninos, adolescentes y adultos jovenes con X fragil confirmado. Cohorte pequena "
                "pero de altisima carga familiar y de servicios de rehabilitacion."
            ),
            "evidence_state": (
                "Estudio clinico registrado en ClinicalTrials.gov en poblacion pediatrica/joven. "
                "Epidiolex (CBD) ya tiene via en sindromes epilepticos raros (Dravet, LGS) en "
                "agencias de referencia; la extrapolacion a X fragil no esta establecida."
            ),
            "comparators_sgsss": (
                "Apoyo conductual, ISRS, antipsicoticos atipicos en irritabilidad grave, "
                "rehabilitacion. No hay farmaco modificador de la enfermedad cubierto."
            ),
            "adoption_risks": (
                "Calidad farmaceutica del CBD, interaccion farmacologica (CYP), estigma, y riesgo "
                "de uso no regulado. Si el ensayo es positivo, INVIMA exigira producto "
                "farmaceutico, no formulaciones artesanales."
            ),
            "narrative": (
                "La senal es pertinente por equidad pediatrica y por la presion social sobre "
                "cannabinoides. El IETS debe exigir evidencia de desenlace funcional (ABC-C, "
                "vineland) y no solo de 'mejoría percibida'. Informe temprano para ordenar el "
                "debate, no para recomendar cobertura."
            ),
            "evidence_phases": "Ensayo clinico en curso (ClinicalTrials.gov). CBD farmaceutico ya aprobado en otras indicaciones epilepticas.",
            "efficacy_outcomes": "Conducta adaptativa, irritabilidad, ansiedad, calidad de vida del cuidador.",
            "safety_outcomes": "Somnolencia, elevacion de transaminasas, interacciones con clobazam y valproato.",
            "early_dialogue_notes": "Articular con el programa de enfermedades huerfanas y con sociedades de genetica/neurologia pediatrica.",
        },
    },
]


def match_dossier(tech) -> dict | None:
    blob = " ".join(
        str(x or "")
        for x in (
            getattr(tech, "commercial_name", ""),
            getattr(tech, "inn_name", ""),
            getattr(tech, "summary", ""),
            getattr(tech, "indication", ""),
            getattr(tech, "mechanism", ""),
        )
    ).lower()
    for item in DOSSIERS:
        if re.search(item["match"], blob, re.I):
            return item
    return None


def body_for(tech, level: str) -> dict:
    dossier = match_dossier(tech)
    body = eval_catalog.empty_body()
    if dossier:
        body.update({k: v for k, v in dossier["body"].items() if v})
        return body
    name = (getattr(tech, "commercial_name", None) or getattr(tech, "inn_name", None) or "la tecnologia")
    indication = getattr(tech, "indication", "") or "condicion de interes para el SGSSS"
    summary = getattr(tech, "summary", "") or "Senal capturada en el inventario de fuentes verificadas."
    body.update(
        {
            "health_condition": f"{indication}. Requiere caracterizacion de carga y de ruta de atencion en Colombia.",
            "mechanism": getattr(tech, "mechanism", "") or f"Mecanismo declarado para {name} en la fuente primaria de vigilancia.",
            "target_population_co": f"Poblacion potencial con {indication} que consulta en el SGSSS, pendiente de dimensionamiento epidemiologico.",
            "evidence_state": summary[:900],
            "comparators_sgsss": "Estandar de cuidado cubierto o via de excepcion vigente, segun guia nacional o practica de centros de referencia.",
            "adoption_risks": "Incertidumbre regulatoria INVIMA, capacidad instalada y sostenibilidad presupuestal.",
            "narrative": f"Evaluacion temprana de {name} en el marco del escaneo de horizonte del IETS.",
            "evidence_phases": getattr(tech, "development_phase", "") or "Fase clinica reportada por la fuente.",
            "efficacy_outcomes": "Desenlaces clinicos reportados por la fuente primaria.",
            "safety_outcomes": "Perfil de seguridad en seguimiento; se requiere evidencia local.",
            "pico_population": f"Personas en Colombia con {indication}.",
            "pico_intervention": str(name),
            "pico_comparator": "Estandar de cuidado del SGSSS",
            "pico_outcome": "Eficacia, seguridad y factibilidad de adopcion",
            "budget_year_1": "Impacto presupuestal anio 1 por estimar con precio de referencia y cohorte incidente.",
            "budget_year_2": "Impacto presupuestal anio 2, incluyendo prevalencia tratada.",
            "budget_year_3": "Impacto presupuestal anio 3 en escenario de adopcion estable.",
            "clinical_uncertainty": "Generalizacion de la evidencia internacional al contexto colombiano.",
            "early_dialogue_notes": "Seguimiento a INVIMA, a agencias de referencia y a la fuente original de la senal.",
        }
    )
    return body


def title_for(tech, level: str) -> str:
    dossier = match_dossier(tech)
    if dossier:
        return dossier["title"][:500]
    name = (getattr(tech, "commercial_name", None) or getattr(tech, "inn_name", None) or "Tecnologia")
    label = {"ficha": "Ficha tecnica", "informe": "Informe de evaluacion temprana", "mini_hta": "Mini-HTA"}[level]
    return f"{label}: {name}"[:500]
