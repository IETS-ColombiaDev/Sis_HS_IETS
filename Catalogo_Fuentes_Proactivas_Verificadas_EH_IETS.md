# Catálogo verificado de fuentes de información proactiva
## Módulo 0 (RF01) de la Plataforma de Escaneo de Horizonte del IETS

**Insumo metodológico:** `FUENTES_DE_INFORMACION_PROACTIVA_EH.xlsx`, hoja `MATRIZ FI EH`, 53 fuentes
**Sistema destino:** Sis_HS_IETS v6.0.0 (fases 0 a 6 cerradas, fase 7 en curso)
**Especificación:** RF01 y guía técnica del módulo 0, `Especificaciones-tecnicas-plataforma-EH_IETS_2026_V1.pdf`
**Decisión que cierra:** D-06, inventario definitivo de fuentes y conectores
**Fecha de verificación documental:** 2 de septiembre de 2026

## 1. Para qué sirve este documento

La matriz institucional lista 53 fuentes con su URL y lo que hay que consultar en cada una. Eso resuelve la pregunta metodológica, no la de ingeniería: un conector no se construye contra una URL, se construye contra un **contrato de datos**. Este catálogo agrega a cada fuente lo que el sistema necesita para capturarla sin intervención humana y sin romperse: mecanismo de acceso real, endpoint o ruta exacta, formato, clave de deduplicación, frecuencia sostenible, límite de peticiones, campos que aporta al modelo `Technology`, restricciones de uso y adaptador responsable.

También corrige lo que la verificación técnica mostró distinto de lo anotado en la matriz. Esas correcciones están en la sección 7 y son la parte que conviene leer primero.

## 2. Cómo se clasifica el acceso

El nivel de acceso determina el adaptador, el costo de mantenimiento y la fragilidad. Es el criterio que ordena todo el catálogo.

| Nivel | Qué significa | Fragilidad | Adaptador |
|---|---|---|---|
| **A** | API REST oficial, documentada, con contrato estable | Baja | Adaptador propio con prueba de contrato |
| **B** | Descarga estructurada oficial y programable (CSV, XLSX, XML, JSON estático) | Baja a media | `file_feed` con descarga y parseo |
| **C** | Endpoint JSON que sirve al portal público, sin documentación ni compromiso de estabilidad | Alta | Adaptador propio, con detección de cambio de esquema |
| **D** | Página o PDF sin capa de datos; requiere extracción | Alta | `html` o `pdf`, con selectores versionados |
| **E** | Curaduría humana; no hay ruta automatizable razonable | No aplica | `manual`, con recordatorio de revisión |

**Estado de verificación**, que se declara fuente por fuente para no confundir lo comprobado con lo supuesto:

- **Verificada (documental):** la ruta técnica está confirmada contra documentación oficial de la fuente o contra literatura técnica reciente.
- **Declarada:** la matriz institucional la reporta y la URL es coherente, pero la ruta de datos no se pudo confirmar en esta revisión.
- **Con observación:** hay un hallazgo que cambia lo anotado en la matriz.

Ninguna fuente de este catálogo se marca como probada en vivo contra el entorno del IETS. Esa comprobación la debe hacer el propio sistema, con el mecanismo de la sección 10.1, y su resultado es el que manda.

## 3. Resumen del catálogo

| Bloque | Fuentes | A | B | C | D | E |
|---|---|---|---|---|---|---|
| Registros de ensayos clínicos | 4 | 2 | 1 | 1 | 0 | 0 |
| Agencias regulatorias | 11 | 3 | 3 | 0 | 5 | 0 |
| Agencias de HTA y redes de EH | 12 | 0 | 2 | 1 | 8 | 1 |
| Literatura y organismos internacionales | 2 | 1 | 0 | 0 | 1 | 0 |
| Fabricantes de I+D | 24 | 0 | 0 | 0 | 18 | 6 |
| **Total** | **53** | **6** | **6** | **2** | **32** | **7** |

La lectura importante: **seis fuentes de nivel A y seis de nivel B aportan la mayor parte de la señal automatizable**, y son las que sostienen el pre-llenado de P1, P5 y P6. Las 32 fuentes de nivel D aportan contexto y confirmación, no deben gobernar el pipeline, y su costo de mantenimiento es el que hunde a los sistemas de escaneo cuando se las trata como si fueran APIs.

## 4. Registros de ensayos clínicos

Es el bloque que alimenta el horizonte temprano y la fecha de finalización de fase III, insumo del time-to-market.

| ID | Fuente | Nivel | Ruta técnica | Formato | Frecuencia | Clave de dedup | Adaptador |
|---|---|---|---|---|---|---|---|
| FP-CT-01 | ClinicalTrials.gov (NIH/NLM) | A | `GET https://clinicaltrials.gov/api/v2/studies` con `query.term`, `filter.overallStatus`, `filter.advanced`, paginación por `pageToken` | JSON | Diaria | `NCT id` | `clinicaltrials` (ya existe) |
| FP-CT-02 | WHO ICTRP | B | Descarga CSV/XML desde el portal de búsqueda; el agregado se actualiza semanalmente | CSV, XML | Semanal | `TRN` del registro primario | `who_ictrp` (hoy en lote) |
| FP-CT-03 | CTIS (EMA) | C | Portal público `euclinicaltrials.eu/ctis-public/search`; el listado se sirve por un endpoint JSON interno del portal, no documentado para terceros | JSON no contractual | Semanal | `EU CT number` | `ctis` (nuevo) |
| FP-CT-04 | ScanMedicine (NIHR Innovation Observatory) | D | `scanmedicine.com/clinicaltrials` y `/devices`; consolida 11 registros más datos de dispositivos de la FDA | HTML | Quincenal | `id de ScanMedicine` | `html` con selectores versionados |

**Notas de ingeniería del bloque**

1. **ClinicalTrials.gov v2** es pública y sin autenticación, con un límite práctico del orden de decenas de peticiones por minuto. Se pagina por cursor (`pageToken`), no por desplazamiento numérico, así que el conector debe guardar el cursor y no reconstruirlo. La respuesta viene anidada por módulos (`protocolSection.statusModule`, `sponsorCollaboratorsModule`, `conditionsModule`), y ese anidamiento es exactamente la razón por la que el crudo se guarda íntegro en `raw_records` antes de mapear.
2. **WHO ICTRP** no ofrece REST público. La descarga desde el portal es la ruta soportada y sus términos y condiciones aplican a todo dato obtenido, en cualquier formato. Esto confirma la decisión ya tomada en el sistema (P2-2): lote semanal, no consulta en vivo. Lo que falta no es código sino el acuerdo de espejo o de descarga periódica.
3. **CTIS** no tiene API pública oficial; la que existe es para los estados miembros. El acceso de terceros ocurre contra el JSON que consume el portal, que puede cambiar sin aviso. Se implementa con verificación de esquema en cada corrida y degradación explícita: si el esquema cambia, el conector se apaga solo y avisa, en lugar de ingerir basura.
4. **ScanMedicine** merece un tratamiento distinto al resto del nivel D: es el sistema del NIHRIO, el mismo referente en el que se inspira la plataforma del IETS, y consolida registros que de otro modo habría que integrar uno a uno. Vale la pena consultarlo también como control de calidad de la propia cobertura: si aparece allí una señal que el sistema no capturó, es un hueco del inventario.

## 5. Agencias regulatorias

Alimenta P1 (novedad en el país), P5 (aprobación reciente en agencia de referencia) y P6 (trámite regulatorio en curso), además del `regulatory_status`.

| ID | Fuente | Nivel | Ruta técnica | Formato | Frecuencia | Adaptador |
|---|---|---|---|---|---|---|
| FP-RG-01 | FDA, plataforma openFDA | A | `https://api.fda.gov/` con los conjuntos `device/510k`, `device/pma`, `device/classification`, `device/udi`, `drug/drugsfda`, `drug/label` | JSON | Diaria | `fda` (ampliar a multiconjunto) |
| FP-RG-02 | FDA, Breakthrough Devices Program | D | Página del programa y listados asociados; no hay conjunto abierto equivalente | HTML | Mensual | `html` |
| FP-RG-03 | FDA, dispositivos autorizados recientemente y CDRH | D | `Recently Approved Devices`, buscadores `cfPMA` y `cfIVD` de accessdata | HTML | Semanal | `html` |
| FP-RG-04 | EMA, medicamentos | B | Tablas descargables de la página de datos de medicamentos, que el sitio actualiza durante la noche | XLSX | Semanal | `ema` (migrar de HTML a descarga) |
| FP-RG-05 | EMA, medicamentos en evaluación y panel de expertos de dispositivos | D | Listado de medicamentos en evaluación y programa piloto de dispositivos innovadores | HTML | Quincenal | `html` |
| FP-RG-06 | Health Canada, MDALL | A | `https://health-products.canada.ca/api/medical-devices/` con recursos `device`, `deviceidentifier`, `licence`, `company`, parámetro `state=active` | JSON, XML | Semanal | `health_canada` (nuevo) |
| FP-RG-07 | Health Canada, Drug Product Database | A | `https://health-products.canada.ca/api/` para productos farmacéuticos | JSON, XML | Semanal | `health_canada` (nuevo) |
| FP-RG-08 | TGA, ARTG y medicamentos en evaluación | B | Buscador ARTG con exportación CSV/Excel por tipo terapéutico; conjunto de dispositivos con IA; bases de medicamentos bajo evaluación y de decisiones | CSV, XLSX | Mensual | `file_feed` |
| FP-RG-09 | MHRA, licencias otorgadas | D | Colección de listados de autorizaciones de comercialización, publicados como documentos | PDF, CSV irregular | Mensual | `pdf` |
| FP-RG-10 | PMDA (Japón), productos aprobados | D | Sección en inglés de información de aprobaciones | HTML, PDF | Mensual | `html` |
| FP-RG-11 | NMPA (China), MFDS (Corea), Swissmedic, Comisión Europea de dispositivos | D | Portales en inglés y listados de aprobación; sin capa de datos | HTML | Mensual o trimestral | `html` |

**Notas de ingeniería del bloque**

1. **openFDA es la única fuente regulatoria con un contrato de datos de primer nivel.** Datos bajo dominio público, veintitantos conjuntos bajo una sola URL base con la misma superficie de parámetros (`search`, `sort`, `count`, `limit`, `skip`). Sin llave el cupo es bajo, del orden de mil peticiones diarias; con una llave gratuita de `api.data.gov` sube a 240 por minuto y 120.000 por día. **Conseguir esa llave es una tarea de cinco minutos que multiplica por cien la capacidad de ingesta**, y hoy no está en el backlog. Hay un límite duro adicional: `skip + limit` no puede superar 25.000, así que el barrido histórico se hace por ventanas de fecha, no por desplazamiento.
2. **El hallazgo que más cambia el inventario es Health Canada.** La matriz la anotó como "no se evidencia un listado público exclusivo". Sí lo hay, y es mejor que un listado: una API JSON y XML documentada, con recursos separados para dispositivo, identificador de dispositivo, licencia y compañía, y filtro por estado activo o archivado. Pasa de fuente marginal a fuente de nivel A, y aporta un comparador regulatorio distinto al de FDA y EMA.
3. **EMA no expone REST, pero sí tablas descargables que el propio sitio actualiza cada noche.** Rastrear las páginas de EMA cuando existe la descarga es trabajo desperdiciado y frágil. El adaptador `ema` actual debería migrar a descarga programada del archivo y quedarse con HTML solo para el listado de medicamentos en evaluación, que es el que interesa para el horizonte y no está en la tabla descargable.
4. **TGA aporta algo que casi ninguna otra agencia publica: las bases de medicamentos bajo evaluación y de aprobaciones provisionales o prioritarias.** Para escaneo de horizonte eso vale más que el registro de lo ya aprobado, porque es señal anterior a la decisión. La exportación del ARTG exige una descarga por tipo terapéutico, cuatro en total para el registro completo.
5. **MHRA, PMDA, NMPA, MFDS y Swissmedic** se mantienen como confirmación regulatoria de segunda línea, con frecuencia mensual o trimestral. No conviene invertir esfuerzo de extracción fina en ellas: aportan sobre todo el dato de "aprobada en otra agencia de referencia", que P5 ya captura de FDA y EMA.

## 6. Agencias de HTA, redes de escaneo y literatura

Este bloque no aporta señales nuevas de tecnología en el sentido del módulo 0; aporta **priorización ajena ya hecha**, que es un insumo distinto y muy valioso: si el NIHRIO, la CDA-AMC o PCORI ya priorizaron una tecnología, eso es evidencia para P2, P3 y P4 y un ahorro de trabajo enorme.

| ID | Fuente | Nivel | Ruta técnica | Formato | Frecuencia | Adaptador |
|---|---|---|---|---|---|---|
| FP-HT-01 | PCORI Health Care Horizon Scanning System (operado con ECRI) | C | Base pública `horizonscandb.pcori.org`, con fichas fechadas por tecnología y seis áreas de interés | JSON del portal, HTML | Quincenal | `pcori_hs` (nuevo) |
| FP-HT-02 | NIHR Innovation Observatory | D | Sitio institucional y publicaciones; ScanMedicine se trata en FP-CT-04 | HTML, PDF | Mensual | `html` |
| FP-HT-03 | CDA-AMC (antes CADTH), Horizon Scanning | D | Sección de horizon scanning con listas de vigilancia e informes | HTML, PDF | Mensual | `html` |
| FP-HT-04 | ACE (Singapur), Horizon Scanning | D | Informes de escaneo publicados | PDF | Trimestral | `pdf` |
| FP-HT-05 | EuroScan / i-HTS | D | Sitio de la red y del toolkit; el acceso a la base de miembros es materia de convenio, no de rastreo | HTML | Trimestral | `html` más gestión institucional |
| FP-HT-06 | INAHTA, base internacional de informes HTA | C | Buscador `database.inahta.org` | HTML con parámetros de consulta | Mensual | `html` |
| FP-HT-07 | AIHTA y sistema de escaneo de la UE | D | Página del sistema de escaneo y publicaciones de la Comisión | HTML, PDF | Trimestral | `html` |
| FP-HT-08 | NICE | D | Guías de proceso y productos de valoración temprana | HTML, PDF | Mensual | `html` |
| FP-HT-09 | NHS England, Accelerated Access y demand signalling | D | Página del programa | HTML | Trimestral | `html` |
| FP-HT-10 | IQWiG | D | Buscador de proyectos y resultados, mayoritariamente en alemán | HTML | Trimestral | `html` |
| FP-HT-11 | KCE y BeNeLuxA | E | Informes puntuales de escaneo de horizonte, sin serie periódica | PDF | Semestral | `manual` |
| FP-HT-12 | AHRQ Healthcare Horizon Scanning System | E | Programa histórico; el material disponible corresponde al periodo que cerró en 2015 | PDF | No aplica | `manual`, solo consulta histórica |
| FP-LI-01 | PubMed / NLM | A | E-utilities (`esearch`, `efetch`, `esummary`) sobre la base MEDLINE | XML, JSON | Diaria | `pubmed` (ya existe) |
| FP-LI-02 | OMS, publicaciones sobre tecnologías emergentes | E | Publicaciones puntuales, sin serie | PDF | Anual | `manual` |

**Notas de ingeniería del bloque**

1. **PCORI es la fuente de mayor densidad metodológica de todo el catálogo.** Su base pública mantiene fichas con fecha de actualización por tecnología, cubre seis áreas que se solapan casi exactamente con los clústeres del IETS (cáncer, enfermedades cardiovasculares y cardiometabólicas, infecciosas, raras, salud mental y demencias) y opera con un horizonte de tres años, igual que el manual del IETS. Conviene tratarla como fuente de señal, no solo de consulta: una tecnología que aparece allí y no está en el ciclo del IETS es un hueco que hay que justificar.
2. **AHRQ está discontinuada para efectos operativos.** La observación de la matriz es correcta y este catálogo la confirma: se conserva como referencia metodológica histórica y se retira del ciclo de ingesta. Dejar un conector apuntando ahí solo produce corridas vacías que ensucian el registro.
3. **CADTH y CDA-AMC son la misma organización**, como ya anotó la matriz. Debe quedar una sola fuente con el alias de la otra, o el motor de desduplicación del módulo 2 va a proponer fusiones entre registros que en realidad vienen del mismo emisor.
4. **PubMed exige cortesía explícita**: tres peticiones por segundo sin llave, diez con llave de NCBI, y el correo institucional en cada llamada. El adaptador ya existe; falta declarar la llave y el correo en la configuración.
5. **EuroScan e INAHTA no se resuelven con código.** El valor real está detrás de la membresía y de los convenios que la propia especificación pide en el requerimiento de interoperabilidad internacional. Rastrear sus páginas públicas da poco; el trabajo aquí es institucional.

## 7. Fabricantes de I+D

Veinticuatro fuentes, todas de nivel D o E. Es el bloque más numeroso y el de menor rendimiento por hora de ingeniería.

**Fabricantes con pipeline publicado en tabla o listado estructurado** (extracción viable con selectores versionados, revisión mensual): AbbVie, Amgen, AstraZeneca, Bayer, Boehringer Ingelheim, Bristol Myers Squibb, Gilead, GSK, Johnson & Johnson, Lilly, Merck, Novartis, Pfizer, Roche, Sanofi.

**Fabricantes con portafolio comercial pero sin pipeline estructurado** (aportan poco al horizonte temprano; revisión trimestral o curaduría): Abbott, Baxter, BD, Boston Scientific, GE HealthCare, Medtronic, Mindray, Philips, Siemens Healthineers, Stryker.

**Reglas para todo el bloque**

1. **Un pipeline de fabricante no es una fuente primaria de señal, es una confirmación de una señal que ya debería haber entrado por ensayo clínico o por trámite regulatorio.** Si una molécula aparece en el pipeline de Novartis y no está en ClinicalTrials.gov ni en EMA, lo que hay que revisar es la consulta a esas dos fuentes, no la página de Novartis.
2. **Antes de rastrear cualquiera de estos sitios se consulta su `robots.txt` y sus condiciones de uso, y el resultado queda guardado con fecha en el registro de la fuente.** La propia matriz ya advierte, para Boston Scientific, que traer los datos de forma automatizada no es razonable. Esa advertencia aplica al bloque entero y debe quedar como campo del inventario, no como nota suelta.
3. **La periodicidad razonable es mensual para el primer grupo y trimestral para el segundo.** Los pipelines corporativos se actualizan por trimestre fiscal; rastrearlos a diario consume cupo y no produce señal nueva.
4. **Las fuentes de fabricantes de dispositivos rinden mejor por la vía regulatoria.** Para Medtronic, Boston Scientific, Stryker, Philips, Siemens o GE, el conjunto `device/510k` y `device/pma` de openFDA y la API de Health Canada dan la novedad fechada y estructurada que su página corporativa no da.

## 8. Correcciones y hallazgos frente a la matriz original

Estas ocho observaciones son la razón de ser del documento. Cada una cambia una decisión de implementación.

| # | Fuente | Lo que dice la matriz | Lo verificado | Qué cambia |
|---|---|---|---|---|
| 1 | Health Canada | "No se evidencia un listado público exclusivo", pertinencia por revisar | Existe API JSON y XML documentada para MDALL y para la base de productos farmacéuticos | Sube de nivel D a nivel A; entra en la primera ola de conectores |
| 2 | FDA | Ocho URL de páginas y buscadores | La plataforma openFDA cubre 510(k), PMA, clasificación, UDI, aprobaciones y etiquetas bajo una sola API con datos de dominio público | La mayoría de esas ocho URL se reemplazan por llamadas a la API; solo Breakthrough Devices y aprobaciones recientes siguen requiriendo extracción |
| 3 | EMA | Cuatro URL de páginas | Hay tablas descargables que el sitio actualiza cada noche | El adaptador migra de rastreo a descarga programada |
| 4 | CTIS | Registro de ensayos de la UE | No hay API pública para terceros; solo el JSON del portal, sin compromiso de estabilidad | Se implementa con verificación de esquema y apagado automático ante cambios |
| 5 | AHRQ | Última actualización de 2015, revisar pertinencia | Confirmado: el sistema no está vigente | Se retira del ciclo de ingesta y se conserva como referencia histórica |
| 6 | CADTH y CDA-AMC | Anotado como misma organización | Confirmado | Una sola fuente con alias, para no generar falsos duplicados en el módulo 2 |
| 7 | NMPA | Incluye un enlace a un rastreador de aprobaciones de un consultor privado | Es contenido de un tercero comercial, no fuente oficial | Se usa como pista de contexto, nunca como origen de un registro; no se cita en informes |
| 8 | Varias | URL con parámetros `utm_source` de seguimiento | Ensucian la clave de la fuente y pueden romper la comparación de URL | Normalizar y quitar parámetros de seguimiento al cargar el inventario |

Un hallazgo adicional de forma: **PCORI aparece dos veces en la matriz** (fila de organismos de HTA y fila de buscador con la base `horizonscandb`), y **la FDA otra vez** (fila general y fila de Breakthrough Devices). Son la misma fuente con dos rutas; deben quedar como una fuente con dos endpoints, no como dos fuentes.

## 9. Qué campo alimenta cada fuente

La verificación no vale nada si el dato no aterriza donde el motor de priorización lo necesita. Este es el mapeo contra el modelo actual.

| Campo de `Technology` | Fuente primaria | Fuente de respaldo | Consume |
|---|---|---|---|
| `commercial_name`, `inn_name` | ClinicalTrials.gov, openFDA `drug/drugsfda` | EMA (descarga), pipelines de fabricantes | Módulo 2, desduplicación |
| `manufacturer` | ClinicalTrials.gov (`leadSponsor`), openFDA | Health Canada (`company`) | Módulo 2 |
| `nct_ids` | ClinicalTrials.gov, WHO ICTRP, CTIS | ScanMedicine | Módulo 2, clave fuerte de dedup |
| `indication` | ClinicalTrials.gov (`conditionsModule`) | PubMed, PCORI | Sugerencia de clúster por CIE-10 y MeSH |
| `phase3_completion_date` | ClinicalTrials.gov (`statusModule`) | WHO ICTRP | Time-to-market y P6 |
| `fda_approval_date` | openFDA `drug/drugsfda`, `device/pma`, `device/510k` | Página de aprobaciones recientes | **P5** |
| `ema_approval_date` | EMA, tabla descargable | CTIS | **P5** |
| `regulatory_status` | openFDA, EMA, Health Canada, TGA (bajo evaluación) | PMDA, MHRA, Swissmedic | **P6** |
| `invima_registry` | Índice local de INVIMA (módulo 2, ya implementado) | Carga plana de contingencia | **P1** |
| `condition` (emergente o nueva) | Derivado de fase clínica más fecha de aprobación | Revisión del evaluador | Módulo 1 |
| Evidencia de priorización externa | PCORI, CDA-AMC, NIHRIO, ACE | INAHTA | Contexto para P2, P3 y P4 |

**Regla de precedencia cuando la misma tecnología llega por varias fuentes.** El módulo 2 ya propone fusiones sobre similitud; la precedencia define cuál registro gana el campo en conflicto:

1. Número de ensayo clínico (`NCT` o `EU CT`) coincidente: fusión con alta confianza, sin importar la diferencia de nombre.
2. Para fechas regulatorias, gana siempre la agencia emisora sobre cualquier agregador.
3. Para nombre e indicación, gana el registro de ensayo sobre la página del fabricante.
4. Una fuente de nivel D nunca sobreescribe un campo que ya trajo una fuente de nivel A o B; solo lo completa si está vacío, y queda anotado en el crudo.

## 10. Robustez operativa

La especificación pide resiliencia y el backlog ya trae cortacircuitos por conector y cola con reanudación. Esto es lo que falta para que el catálogo sea sostenible.

### 10.1 Sonda de salud por fuente

Cada fuente declara una petición mínima de comprobación y un resultado esperado. La sonda corre antes de cada corrida y a diario en las fuentes de nivel A.

| Estado | Criterio | Acción del sistema |
|---|---|---|
| Verde | Responde, esquema coincide, hay registros | Corrida normal |
| Ámbar | Responde pero el esquema cambió, o cero registros donde siempre hay | Ingesta suspendida para esa fuente, aviso en la bandeja, crudo guardado para diagnóstico |
| Rojo | No responde tras los reintentos, o el sitio bloquea | Cortacircuitos abierto, reintento con espera creciente, aviso al administrador |

Sin esto, una fuente que cambia de formato deja de aportar en silencio, y en un sistema de escaneo el silencio se confunde con "no hay tecnologías nuevas". Es el modo de falla más peligroso de todo el módulo 0.

### 10.2 Presupuesto de peticiones

| Fuente | Límite conocido | Política del conector |
|---|---|---|
| openFDA | Bajo sin llave; 240 por minuto y 120.000 por día con llave gratuita | Gestionar la llave y pausar 250 ms entre peticiones; ventanas por fecha para no chocar con el tope de 25.000 de desplazamiento |
| ClinicalTrials.gov | Del orden de decenas por minuto, sin autenticación | Página de 1.000 registros, cursor persistido, pausa de 1,5 s |
| PubMed E-utilities | 3 por segundo sin llave, 10 con llave | Declarar llave y correo institucional |
| Health Canada | Sin límite publicado | Corrida semanal completa fuera de horario laboral |
| WHO ICTRP | Descarga semanal | Un solo archivo por semana, nunca consulta en vivo |
| Nivel D en general | Sin garantía | Una petición por página, respeto de `robots.txt`, agente de usuario identificable con contacto institucional |

### 10.3 Prueba de contrato

Cada adaptador de nivel A o B lleva una prueba que corre en el pipeline con una respuesta guardada de la fuente y verifica que el mapeo sigue produciendo los campos esperados. Es el complemento de la sonda: la sonda detecta que la fuente cambió, la prueba detecta que el cambio rompe el mapeo. El backlog ya lo tiene identificado como P2-1.

### 10.4 Registro de procedencia

Cada registro que entra al staging guarda fuente, endpoint exacto, momento de captura, versión del adaptador y respuesta cruda. Ante una auditoría de Contraloría, la pregunta "de dónde salió este dato" tiene que responderse sin abrir el código y sin volver a consultar a la fuente. El campo `raw_records` del sistema ya lo permite; falta agregar la versión del adaptador.

### 10.5 Uso lícito

1. Los datos de openFDA son de dominio público. Los de WHO ICTRP están sujetos a términos que aplican a cualquier formato y método de obtención, y deben aceptarse formalmente. Los de las agencias nacionales suelen ser de uso público con atribución.
2. Los sitios de fabricantes son propiedad privada: se respeta `robots.txt`, se identifica el agente y no se rastrea lo que la propia matriz ya marcó como no razonable de automatizar.
3. Ninguna fuente de tercero comercial se usa como origen de un registro. Sirve para orientar la búsqueda, no para sustentar una ficha.

## 11. Plan de implementación por olas

Cada ola deja el sistema en un estado desplegable y aporta señal desde el primer día.

### Ola 1. Lo que ya tiene contrato de datos (2 a 3 semanas)

1. Gestionar la llave gratuita de openFDA y la de NCBI para PubMed. Es la tarea de mayor retorno por esfuerzo de todo el plan.
2. Ampliar el adaptador `fda` a multiconjunto: `device/510k`, `device/pma`, `device/classification`, `drug/drugsfda`.
3. Construir el adaptador `health_canada` sobre MDALL y la base de productos farmacéuticos.
4. Migrar el adaptador `ema` de rastreo a descarga programada de las tablas oficiales.
5. Implementar la sonda de salud de la sección 10.1 y las pruebas de contrato de la 10.3.

### Ola 2. Descargas programadas y registros restantes (2 a 3 semanas)

6. Adaptador `file_feed` genérico para descargas CSV y XLSX, con TGA como primer usuario.
7. Formalizar el lote semanal de WHO ICTRP y su aceptación de términos.
8. Adaptador `ctis` con verificación de esquema y apagado automático.

### Ola 3. Priorización ajena (2 semanas)

9. Adaptador `pcori_hs` sobre la base de horizon scanning, con fecha de actualización por ficha.
10. Extracción de CDA-AMC, ACE y NIHRIO como fuentes de contraste, con revisión mensual.
11. Panel de cobertura: tecnologías que aparecen en fuentes de contraste y no están en el ciclo activo del IETS. Este panel es el que convierte el catálogo en control de calidad del propio escaneo.

### Ola 4. Fabricantes y curaduría (2 semanas y mantenimiento continuo)

12. Extracción mensual de los quince pipelines estructurados, con selectores versionados y verificación previa de `robots.txt`.
13. Fuentes `manual` con recordatorio de revisión y responsable asignado, para KCE, OMS y el material histórico de AHRQ.

### Cambios de modelo que exigen las cuatro olas

```sql
ALTER TABLE sources ADD COLUMN access_level     TEXT;    -- A | B | C | D | E
ALTER TABLE sources ADD COLUMN connector        TEXT;    -- adaptador responsable
ALTER TABLE sources ADD COLUMN endpoint_config  JSONB;   -- endpoint, parámetros, paginación
ALTER TABLE sources ADD COLUMN sync_frequency   TEXT;    -- diaria | semanal | mensual | trimestral
ALTER TABLE sources ADD COLUMN rate_limit_rpm   INTEGER;
ALTER TABLE sources ADD COLUMN requires_api_key BOOLEAN DEFAULT FALSE;
ALTER TABLE sources ADD COLUMN terms_url        TEXT;
ALTER TABLE sources ADD COLUMN terms_accepted_at TIMESTAMPTZ;
ALTER TABLE sources ADD COLUMN robots_checked_at TIMESTAMPTZ;
ALTER TABLE sources ADD COLUMN health_status    TEXT;    -- verde | ambar | rojo
ALTER TABLE sources ADD COLUMN last_ok_at       TIMESTAMPTZ;
ALTER TABLE sources ADD COLUMN schema_signature TEXT;    -- huella del esquema observado
ALTER TABLE sources ADD COLUMN provides_fields  JSONB;   -- campos que aporta, sección 9
ALTER TABLE sources ADD COLUMN aliases          JSONB;   -- CADTH = CDA-AMC
```

Superficie de API nueva, coherente con la que ya existe:

| Método y ruta | Propósito |
|---|---|
| `POST /api/ingest/sources/{id}/probe` | Ejecuta la sonda y devuelve verde, ámbar o rojo con el detalle |
| `GET /api/ingest/health` | Tablero de salud de todas las fuentes, con antigüedad del último éxito |
| `GET /api/ingest/coverage?cycle_id=` | Tecnologías presentes en fuentes de contraste y ausentes del ciclo |
| `POST /api/ingest/sources/import` | Carga masiva del catálogo desde el archivo semilla |

## 12. Semilla del catálogo

Formato propuesto para cargar el inventario sin desplegar código, coherente con el criterio ya adoptado en el sistema de que las taxonomías son dato y no enumeración.

```yaml
- code: FP-CT-01
  name: ClinicalTrials.gov
  entity_type: registro_ensayos
  level: primaria
  country: EE. UU.
  access_level: A
  connector: clinicaltrials
  endpoint_config:
    base_url: https://clinicaltrials.gov/api/v2/studies
    params:
      filter.advanced: "AREA[Phase](PHASE2 OR PHASE3 OR PHASE4)"
      pageSize: 1000
    pagination: cursor
    cursor_field: nextPageToken
  sync_frequency: diaria
  rate_limit_rpm: 40
  requires_api_key: false
  provides_fields: [inn_name, manufacturer, nct_ids, indication, phase3_completion_date]
  probe:
    expect_status: 200
    expect_json_path: studies[0].protocolSection.identificationModule.nctId

- code: FP-RG-06
  name: Health Canada MDALL
  entity_type: agencia_regulatoria
  level: secundaria
  country: Canadá
  access_level: A
  connector: health_canada
  endpoint_config:
    base_url: https://health-products.canada.ca/api/medical-devices/device/
    params: { type: json, state: active }
  sync_frequency: semanal
  requires_api_key: false
  provides_fields: [commercial_name, manufacturer, regulatory_status]

- code: FP-HT-12
  name: AHRQ Healthcare Horizon Scanning System
  entity_type: organismo_hta
  access_level: E
  connector: manual
  active: false
  note: Programa no vigente; se conserva como referencia metodológica histórica
```

## 13. Estado de verificación fuente por fuente

| Bloque | Verificadas por documentación | Declaradas | Con observación |
|---|---|---|---|
| Registros de ensayos | ClinicalTrials.gov, WHO ICTRP, ScanMedicine | | CTIS (sin API pública) |
| Agencias regulatorias | openFDA, EMA (descargas), Health Canada, TGA | PMDA, NMPA, MFDS, Swissmedic, Comisión Europea | MHRA (sin listado estructurado), Health Canada (subió de nivel) |
| HTA y redes | PCORI, PubMed | NIHRIO, CDA-AMC, ACE, EuroScan, INAHTA, NICE, NHS, IQWiG, AIHTA, KCE | AHRQ (discontinuada), CADTH igual a CDA-AMC |
| Fabricantes | | 24 fuentes | Boston Scientific y el bloque completo, por condiciones de uso |

**Lo que queda por confirmar y no depende del equipo de desarrollo**

1. Aceptación formal de los términos de WHO ICTRP y decisión sobre espejo o descarga periódica (P2-2 y D-06).
2. Convenio con EuroScan e i-HTS, y con INAHTA, para acceso a las bases de miembros. Es el mismo trabajo institucional que exige el requerimiento de interoperabilidad internacional de la fase 7.
3. Gestión de las llaves gratuitas de openFDA y NCBI, con correo institucional del IETS.
4. Validación metodológica de la regla de precedencia de la sección 9, en particular de que una fuente de nivel D nunca sobreescriba a una de nivel A.
5. Confirmación de la coordinación sobre retirar AHRQ del ciclo de ingesta y unificar CADTH con CDA-AMC.

Con las olas 1 y 2 ejecutadas, el sistema pasa de cinco adaptadores a nueve, y de una cobertura mayoritariamente de rastreo a una cobertura en la que **doce fuentes con contrato de datos sostienen el pipeline y las 41 restantes lo enriquecen**. Ese es el punto en el que D-06 se puede cerrar de verdad.
