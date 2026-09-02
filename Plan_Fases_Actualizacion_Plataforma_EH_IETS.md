# Plan de actualización por fases
## Sistema de Escaneo de Horizonte del IETS (v1.0.0) hacia la Plataforma de EH / EAA especificada

**Documento base de requerimientos:** *Especificación de requerimientos técnicos, lógica metodológica y guía de arquitectura para la plataforma de Escaneo de Horizonte* (IETS, 31/08/2026, V1)
**Sistema actual:** Sis_HS_IETS v1.0.0 (FastAPI + React 18 + SQLite)
**Elaborado:** septiembre de 2026
**Estado:** propuesta para validación de la coordinación del proyecto y del equipo de desarrollo

## 1. Propósito del documento

Este plan traduce la brecha entre el sistema de información que hoy está en operación y los veinte requerimientos funcionales (RF01 a RF20) y los requerimientos no funcionales de la especificación, y la organiza en siete fases ejecutables. Cada fase declara alcance, criterios de aceptación y decisiones de negocio que deben quedar cerradas antes de codificar. Los cambios de modelo de datos se detallan en las fases que los introducen, la superficie de API se consolida en la sección 8 y los estados en la sección 7.

El plan no propone reconstruir la plataforma desde cero. El sistema actual ya cubre de forma parcial los módulos 0, 3, 4 y 5 de la especificación, y su arquitectura (FastAPI + SPA React) coincide con el stack sugerido en la sección 5.1.1 del documento de requerimientos. Lo que falta es, sobre todo, la capa metodológica formal: el ciclo operativo, los clústeres, el filtro regulatorio y el motor oficial de priorización.

## 2. Diagnóstico: qué existe hoy y qué falta

### 2.1 Correspondencia entre módulos actuales y módulos especificados

| Módulo especificado | Equivalente actual | Cobertura | Brecha principal |
|---|---|---|---|
| M0 Identificación y captura | `/vigilancia` + `/fuentes` (scraper HTML/PDF sobre 29 referentes) | Parcial | No hay conectores a APIs estructuradas, ni portal reactivo de postulación, ni staging con `raw_payload` |
| M1 Ciclo, clústeres y tipologías | No existe | Ausente | No hay entidad Ciclo, ni los 6 clústeres, ni las 7 tipologías tecnológicas |
| M2 Filtrado, desduplicación, normalización | Deduplicación exacta por `content_hash` | Mínima | No hay matching difuso, ni filtro de novedad, ni verificación contra INVIMA, ni listado único por clúster |
| M3 Motor de priorización | `priority.py` con heurística propia 0 a 100 y umbral 70 | Parcial y no conforme | La heurística no es la matriz oficial P1 a P6; falta calificación por rol, congelación de puntajes y trazabilidad de la calificación |
| M4 Evaluación temprana y revisión por pares | `/caracterizacion` (checklist y % de completitud) + `/diseminacion` | Parcial | No hay Mini-HTA con PICO ni impacto presupuestal, ni flujo editorial de 6 estados, ni portal de revisores externos, ni exportación a PDF institucional |
| M5 Dashboard, alertas y reportes | `/dashboards` con Recharts | Parcial | Faltan time-to-market, mapa de calor presupuestal, embudo de conversión, ficha pública, boletín trimestral y alertas |
| Capas transversales | Roles viewer/editor/admin; sin bitácora | Insuficiente | No hay bitácora inmutable, la matriz RBAC exige 5 perfiles y permisos a nivel de campo |

### 2.2 Brechas de arquitectura

1. **Motor de base de datos.** SQLite no soporta JSONB, `pgvector`, vistas materializadas ni los volúmenes e índices que exigen los módulos 0, 2 y 5. La migración a PostgreSQL es habilitante y bloquea al menos cuatro fases.
2. **Procesamiento asíncrono.** El escaneo hoy corre en el hilo de la petición. RF01 exige cron jobs con reintento exponencial y respeto de rate limits; se requiere una cola (Celery + Redis o equivalente).
3. **Frontera de autenticación.** El login está restringido al dominio `@iets.org.co`. RF02 (postulantes externos), RF16 (revisores por pares) y RF18 (consulta pública) requieren rutas de acceso fuera de ese dominio, con esquemas distintos: formulario público con reCAPTCHA, token temporal firmado, y usuarios federados de MSPS e INVIMA.
4. **Granularidad del dato.** Hoy la unidad es el `Finding` (una señal detectada en un rastreo). La especificación exige separar **tecnología** (entidad persistente) de **instancia de tecnología en un ciclo** (estado y puntajes propios), según la guía técnica del módulo 1.
5. **Ausencia de auditoría.** Ningún cambio de estado o de puntaje deja hoy registro inmutable. Es el requerimiento no funcional más crítico por tratarse de recursos públicos de funcionamiento.
6. **Línea gráfica y librería de visualización.** El sistema actual usa Recharts sobre la línea gráfica definida en `linea-grafica-y-ux-ui.md`. La guía técnica del módulo 5 pide Apache ECharts, Plotly o Chart.js, con fondo blanco puro, paleta institucional y tipografía sobria. Es un choque de criterio de diseño, no una brecha técnica, y debe resolverlo la coordinación antes de la fase 6.
7. **Stack frontend.** La guía técnica sugiere Next.js o Vue.js con TailwindCSS, pero la propia especificación aclara que son sugerencias sujetas a consideración del equipo desarrollador. React 18 + Vite cumple los requerimientos funcionales y de rendimiento; no se propone migrar. Sí se requiere renderizado del lado del servidor o prerenderizado únicamente para la ficha pública del RF18, si se busca indexación.

### 2.3 Funcionalidades actuales no contempladas en la especificación

Notas del equipo (`/notas`), asistente IA tipo chat RAG (`/chat`) y enriquecimiento con Gemini de fichas y notas no aparecen en el documento de requerimientos. La recomendación es conservarlos como capacidades de apoyo, con dos ajustes: reencauzar el chat RAG sobre `pgvector` (mencionado en el stack sugerido) y dejar explícito que ninguna salida generada por IA sustituye la calificación humana de los criterios P1 a P6 ni la revisión por pares.

## 3. Principios que ordenan la hoja de ruta

1. **El ciclo es el eje.** Casi todos los RF cuelgan de la existencia de un ciclo operativo. Por eso el módulo 1 se implementa antes que el módulo 0 ampliado, aunque su numeración sugiera lo contrario. El orden de las fases responde a dependencias, no a la numeración de los módulos.
2. **La operación actual no se detiene.** Cada fase deja el sistema desplegable. Las rutas y datos existentes se migran, no se descartan.
3. **Auditoría desde el primer día.** La bitácora inmutable se construye en la fase 0, antes que cualquier funcionalidad nueva, para que ningún cambio metodológico quede sin trazabilidad.
4. **Lo pendiente se marca, no se inventa.** Los puntos que la especificación deja abiertos en rojo (fuentes de RF01, variaciones de clústeres, ruta de acceso a INVIMA, activación del Mini-HTA, clasificación de time-to-market) se tratan como decisiones de negocio con responsable y fecha límite, no como supuestos del equipo de desarrollo.

## 4. Mapa general de fases

| Fase | Nombre | RF cubiertos | Tamaño | Duración estimada |
|---|---|---|---|---|
| 0 | Fundaciones: PostgreSQL, auditoría, RBAC y DevOps | RNF transversales | L | 4 a 6 semanas |
| 1 | Ciclos, clústeres, tipologías y staging mínimo | RF03, RF04, RF05, RF06, RF07, RF08 | L | 6 a 8 semanas |
| 2 | Motor oficial de priorización (%P) | Matriz P1 a P6 (módulo 3, sin RF numerado en la especificación) | M | 4 a 5 semanas |
| 3 | Filtrado, desduplicación difusa y verificación INVIMA | RF09, RF10, RF11, RF12 | L | 6 a 8 semanas |
| 4 | Ingesta ampliada: conectores API y portal reactivo | RF01, RF02, RF03 completo, RF04 completo | L | 6 a 8 semanas |
| 5 | Evaluación temprana, Mini-HTA y revisión por pares | RF13, RF14, RF15, RF16 | L | 8 a 10 semanas |
| 6 | Dashboard estratégico, ficha pública, boletines y alertas | RF17, RF18, RF19, RF20 | M | 5 a 6 semanas |
| 7 | Endurecimiento, interoperabilidad internacional y cierre | RNF de seguridad, disponibilidad e interoperabilidad | M | 4 semanas |

Duración total indicativa: 43 a 55 semanas con un equipo de dos desarrolladores backend, uno frontend y un analista metodológico a media dedicación. Las estimaciones son preliminares y deben recalcularse con el equipo que ejecute.

Las fases 2 y 3 pueden solaparse parcialmente si hay capacidad; las fases 0 y 1 son estrictamente secuenciales respecto de todo lo demás.

## 5. Detalle por fase

### Fase 0. Fundaciones: PostgreSQL, auditoría, RBAC y DevOps

**Objetivo.** Dejar la base técnica que exigen los requerimientos no funcionales antes de tocar la metodología.

**Alcance**

1. Migración de SQLite a PostgreSQL 15 o superior, con extensiones `pg_trgm`, `JSONB` y `pgvector`.
2. Introducción de Alembic para migraciones versionadas, reemplazando las migraciones ligeras de `database.py`.
3. Bitácora inmutable de auditoría (`audit_log`), append-only, con revocación del privilegio de UPDATE y DELETE a nivel de rol de base de datos, incluido el usuario de la aplicación.
4. Rediseño del RBAC de tres roles a los cinco perfiles de la Tabla 3, con permisos declarativos por módulo y, en lo que aplique, por campo.
5. Contenerización con Docker y `docker-compose` (api, worker, postgres, redis), y pipeline CI/CD con pruebas unitarias obligatorias para el módulo de priorización.
6. Ampliación de `smoke_test.py` a suite de regresión con cobertura mínima sobre los endpoints existentes.
7. Separación formal de entornos (desarrollo, pruebas y producción) con variables y secretos independientes. Hoy el `ALLOW_DEV_LOGIN` y el acceso rápido de administrador conviven con la configuración productiva, lo que es incompatible con el marco de auditoría de la sección 5 de la especificación.

**Modelo de datos**

```sql
CREATE TABLE audit_log (
  id            BIGSERIAL PRIMARY KEY,
  user_id       INTEGER,
  user_email    TEXT,
  ip_address    INET,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  entity_type   TEXT NOT NULL,
  entity_id     TEXT NOT NULL,
  action        TEXT NOT NULL,
  old_value     JSONB,
  new_value     JSONB,
  request_id    TEXT
);
REVOKE UPDATE, DELETE ON audit_log FROM app_user;
```

La escritura se hace por middleware de FastAPI más un listener de SQLAlchemy (`after_flush`), de modo que ningún camino de código pueda saltarse el registro.

**Mapeo de roles**

| Rol actual | Rol destino | Regla de migración |
|---|---|---|
| `admin` | `superadmin` | Directo |
| `editor` | `evaluador_tecnico` | Directo, con revisión manual de quién debe pasar a `evaluador_clinico` |
| `viewer` | `tomador_decisiones` | Directo si es cuenta de MSPS o INVIMA; en caso contrario, `viewer` interno |
| No existe | `evaluador_clinico` | Alta manual |
| No existe | `revisor_pares` | Se crea en la fase 5, sin cuenta permanente |

**Criterios de aceptación**

- La aplicación levanta contra PostgreSQL y la suite de regresión pasa en verde.
- Un intento de UPDATE sobre `audit_log` desde el usuario de aplicación falla a nivel de motor.
- Toda modificación de `Source`, `Finding` y `User` genera registro con valor anterior y nuevo.
- El pipeline CI ejecuta pruebas y construye la imagen en cada merge a la rama principal.
- El acceso de desarrollo está deshabilitado por configuración en el entorno productivo y su intento de uso queda registrado.

**Riesgos.** Pérdida o corrupción de datos en la migración. Mitigación: script de migración idempotente, ensayo completo en ambiente de pruebas, conteos de control por tabla y ventana de retorno a SQLite durante dos semanas.

### Fase 1. Ciclos, clústeres, tipologías y staging mínimo

**Objetivo.** Introducir la columna vertebral metodológica: el ciclo operativo y la separación entre tecnología e instancia de ciclo.

**Alcance funcional (RF03, RF04, RF05, RF06, RF07, RF08)**

1. CRUD de ciclos con código, fecha de apertura, fecha de corte de datos, fecha proyectada de boletín y estado (`En Configuración`, `En Filtrado`, `En Priorización`, `En Evaluación`, `Cerrado/Consolidado`), con validación de la regla de tres ciclos al año y ventana de 10 a 16 semanas.
2. Máquina de estados del ciclo. Un ciclo no cierra si existen tecnologías en estado `En Evaluación` sin informe final o justificación de cierre.
3. Taxonomía obligatoria de los 6 clústeres de salud (cáncer; enfermedades de alto costo; enfermedades huérfanas o raras; Covid-19 y otras infecciosas emergentes; enfermedades prevalentes; otras categorías sanitarias prioritarias) y de las 7 tipologías tecnológicas (medicamento químico o biológico; terapias avanzadas y génicas; dispositivos médicos; equipos y reactivos de diagnóstico in vitro; procedimientos quirúrgicos y nuevas técnicas clínicas; salud digital; algoritmos y sistemas de inteligencia artificial). Ambas se cargan como datos parametrizables y no como enumeraciones en código, porque la especificación advierte que pueden variar. El sistema actual solo maneja cuatro tipos de tecnología y ningún clúster.
4. Refactor del modelo: `Finding` se descompone en `technology` (entidad persistente) y `cycle_technology` (instancia por ciclo, dueña del estado y de los puntajes).
5. Staging mínimo: la señal capturada por el scraper actual pasa a estado `Capturada / No asignada` y aparece en una bandeja de entrada con filtros por fecha y fuente y selección por lotes para arrastre al ciclo activo.
6. Sugerencia asistida de clúster mediante clasificador ligero de reglas sobre `indicacion_patologia` mapeado a CIE-10 y MeSH, siempre como propuesta que el evaluador confirma.
7. Campo obligatorio de condición de la tecnología según el glosario de la especificación: **emergente** (en fases clínicas avanzadas II o III, previa a la aprobación regulatoria) o **nueva** (con aprobación en agencia de referencia menor o igual a 12 meses, sin adopción formal en el SGSSS). Hoy el sistema clasifica por horizonte (emergente, transicional, inminente), que es otra dimensión y debe convivir con esta, no sustituirla.
8. Campos base para el cálculo posterior de time-to-market: fecha estimada o real de finalización de ensayos fase III, fechas de aprobación en FDA y EMA, y estado del proceso regulatorio. Sin capturarlos desde esta fase, ni el pre-llenado de P1, P5 y P6 (fase 2) ni la visualización del RF17 (fase 6) son calculables.

**Modelo de datos**

```sql
CREATE TABLE cycle (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,              -- 'Ciclo I - 2026'
  opened_on DATE NOT NULL,
  data_cutoff_on DATE NOT NULL,
  bulletin_due_on DATE,
  status TEXT NOT NULL DEFAULT 'en_configuracion',
  closed_at TIMESTAMPTZ,
  closed_by INTEGER REFERENCES users(id)
);

CREATE TABLE technology (
  id SERIAL PRIMARY KEY,
  commercial_name TEXT,
  inn_name TEXT,                          -- DCI / principio activo
  manufacturer TEXT,
  nct_ids TEXT[],
  indication TEXT,
  mechanism TEXT,
  cluster_id INTEGER REFERENCES cluster(id),
  tech_type_id INTEGER REFERENCES tech_type(id),
  raw_payload JSONB,
  source_channel TEXT,                    -- 'proactiva' | 'reactiva'
  captured_at TIMESTAMPTZ NOT NULL,
  captured_by TEXT,
  status TEXT NOT NULL DEFAULT 'capturada_no_asignada'
);

CREATE TABLE cycle_technology (
  cycle_id INTEGER REFERENCES cycle(id),
  technology_id INTEGER REFERENCES technology(id),
  status TEXT NOT NULL,                   -- asignada | filtrada | excluida | priorizada | bajo_vigilancia | no_priorizada | en_evaluacion | publicada
  priority_pct NUMERIC(5,2),
  frozen BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (cycle_id, technology_id)
);
```

**Migración de datos.** Cada `Finding` existente se convierte en un `technology` con `raw_payload` reconstruido desde los campos actuales. Se crea un ciclo retroactivo (`Ciclo 0 - Histórico`) en estado cerrado al que se asocian todas las señales ya trabajadas, para preservar la trazabilidad sin contaminar los indicadores de los ciclos formales.

**Frontend.** Selector de ciclo activo persistente en el `Layout`. Nueva vista `/ciclos`. La bandeja de trabajo pasa a filtrar por ciclo. Las vistas `/priorizacion` y `/caracterizacion` quedan contextualizadas al ciclo seleccionado.

**Criterios de aceptación**

- Se puede crear un ciclo, arrastrar un lote de señales del staging y ver el estado cambiar a `asignada a ciclo`.
- El sistema rechaza la creación de un cuarto ciclo formal en el mismo año y de ciclos con ventana fuera del rango de 10 a 16 semanas, con mensaje explícito.
- No se puede cerrar un ciclo con tecnologías en evaluación sin informe.
- Toda tecnología asignada tiene clúster y tipología obligatorios.
- Cada acción anterior deja registro en `audit_log`.

**Decisiones pendientes de negocio.** Confirmar la lista definitiva de clústeres y tipologías (la especificación las deja sujetas a referenciación) y definir si el arrastre de una tecnología de un ciclo a otro conserva la calificación previa como referencia visible.

### Fase 2. Motor oficial de priorización (%P)

**Objetivo.** Reemplazar la heurística actual por la matriz oficial de seis criterios binarios del Manual Metodológico.

**Alcance**

1. Implementación de la matriz P1 a P6 con valores binarios y cálculo de `%P = (suma / 6) * 100`.
2. Transición automática de estados a `PRIORIZADA`, `BAJO VIGILANCIA` o `NO PRIORIZADA`, con umbrales parametrizados en base de datos y no en código.
3. Bandejas de calificación por rol y permisos a nivel de campo: el evaluador técnico califica P1, P5 y P6; el evaluador clínico califica P2 y P3; P4 queda pendiente de asignación (ver inconsistencia abajo). El cálculo de `%P` solo se dispara cuando los seis criterios están validados.
4. Pre-llenado automatizado de P1, P5 y P6 a partir de la fecha de aprobación FDA/EMA y de la consulta a INVIMA cuando esté disponible (fase 3), presentado siempre como sugerencia que el evaluador confirma o corrige.
5. Congelación de puntajes al cierre del ciclo. Una reevaluación en un ciclo posterior crea un registro histórico nuevo, nunca modifica el anterior.
6. Bandeja de monitoreo activo y arrastre automático entre ciclos: al cerrar un ciclo, toda tecnología en estado `BAJO VIGILANCIA` se propone automáticamente para el ciclo siguiente, generando una nueva instancia en `cycle_technology` con la calificación previa visible como referencia. Es una exigencia explícita del módulo 3 sin equivalente en el sistema actual.
7. Reencuadre de la heurística actual: `priority_score` se renombra a `screening_score` y se conserva únicamente para ordenar la cola de trabajo de señales aún no calificadas. Deja de mostrarse como puntaje de priorización y deja de gobernar transiciones de estado.

**Matriz de criterios a implementar**

| Criterio | Pregunta oficial | Perfil que califica |
|---|---|---|
| P1 | ¿La tecnología sanitaria es nueva, es decir, no se encuentra disponible en el país? | Evaluador técnico |
| P2 | ¿La condición a la que se destina es relevante por alta mortalidad, morbilidad o deterioro grave de calidad de vida? | Evaluador clínico |
| P3 | ¿La condición representa alta carga de enfermedad o impacto financiero sustancial para el SGSSS? | Evaluador clínico |
| P4 | ¿Se anticipa un impacto organizacional importante, como cambio de ruta clínica, infraestructura o entrenamiento complejo? | Por definir (ver inconsistencia 2) |
| P5 | ¿Ha sido aprobada por agencias de referencia internacional (EMA, FDA) en los últimos 12 meses o menos? | Evaluador técnico |
| P6 | ¿Está sometida o bajo proceso formal de evaluación regulatoria en agencias de referencia, en 6 meses o menos? | Evaluador técnico |

Los enunciados se almacenan como datos versionados, no como literales en código, para que un ajuste del Manual no obligue a un despliegue.

**Modelo de datos**

```sql
CREATE TABLE priority_score (
  id SERIAL PRIMARY KEY,
  cycle_id INTEGER NOT NULL,
  technology_id INTEGER NOT NULL,
  criterion TEXT NOT NULL,                -- 'P1'..'P6'
  value SMALLINT CHECK (value IN (0,1)),
  rated_by INTEGER REFERENCES users(id),
  rated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  auto_suggested SMALLINT,                -- sugerencia del algoritmo
  justification TEXT,
  UNIQUE (cycle_id, technology_id, criterion)
);
```

**Inconsistencias de la especificación que deben resolverse antes de codificar**

1. **Umbral de PRIORIZADA.** El documento define simultáneamente `%P ≥ 70%` y `4 a 6 puntos`. Cuatro puntos equivalen a 66,67%, que no alcanza el 70%. Las dos reglas no pueden convivir. Recomendación: implementar por conteo de puntos (≥4 priorizada, =3 bajo vigilancia, ≤2 no priorizada), que es la única lectura que produce tres franjas continuas, y dejar el umbral porcentual como etiqueta de despliegue. Requiere confirmación contra el Manual Metodológico.
2. **Responsable de P4.** La Tabla 2 y la Tabla 3 asignan P4 al evaluador clínico; la guía técnica del numeral 3.4.2 lo asigna al farmacéutico o biomédico. Debe definirse un único responsable, o habilitar calificación conjunta con regla de desempate.
3. **Umbral del sistema actual.** El 70% que hoy usa la plataforma sobre una escala continua de 0 a 100 no es comparable con el %P. Los tableros históricos deben marcarse como calculados bajo el modelo anterior para no inducir lecturas erróneas.
4. **Ausencia de RF numerados en el módulo 3.** La numeración de la especificación salta de RF12 (módulo 2) a RF13 (módulo 4). El módulo 3, que es el núcleo metodológico, no tiene requerimientos funcionales formalizados: su contenido está en la Tabla 2, en la fórmula y en la guía técnica. Se recomienda que la versión 2 del documento incorpore RF numerados para este módulo, porque hoy el corazón del sistema es el único componente sin requerimientos trazables ante una auditoría.

**Criterios de aceptación**

- Un evaluador clínico no puede escribir P1, P5 ni P6, y la API responde 403 ante el intento.
- El `%P` no se calcula ni se muestra mientras falte un criterio.
- Al cerrar el ciclo, un intento de modificar un puntaje falla y queda registrado.
- Existen pruebas unitarias que cubren las tres franjas de clasificación y los bordes (2, 3 y 4 puntos).

### Fase 3. Filtrado, desduplicación difusa y verificación INVIMA

**Objetivo.** Depurar el acervo del ciclo y garantizar que solo avancen tecnologías realmente nuevas para el país.

**Alcance (RF09, RF10, RF11, RF12)**

1. Motor de desduplicación con matching difuso sobre nombre comercial, DCI, número NCT y fabricante, usando RapidFuzz con Levenshtein, Jaro-Winkler y token sorting. Sobre 85% de similitud el sistema propone la fusión; la fusión siempre la confirma un evaluador y queda auditada.
2. Lista de verificación del criterio de novedad con las cuatro opciones del RF10, y catalogación como `Excluida` de modificaciones menores y genéricos convencionales.
3. Sincronización periódica del dataset de registros sanitarios de INVIMA desde datos.gov.co vía API Socrata y de las normas farmacológicas publicadas en el sitio web de INVIMA, almacenados en tablas locales indexadas con `pg_trgm` para consultas por debajo de 100 ms.
4. Registro del concepto de la Sala Especializada del INVIMA cuando exista, incluida la carga manual del acta en PDF mientras no haya una ruta de datos estructurada.
5. Motivo de exclusión tipificado y obligatorio, con timestamp e identificador del evaluador, no editable.
6. Normalización técnica, que es la tercera función del módulo y la que más se olvida: unificación de la denominación común internacional y del código ATC para medicamentos, de CIE-10 y MeSH para la indicación, y de una nomenclatura de dispositivos (GMDN o EMDN) para MedTech e IVD. Sin vocabularios controlados, ni el matching difuso ni la consulta a INVIMA rinden lo esperado.
7. Generación del Listado Único por Clúster como salida consolidada del módulo, exportable.

**Criterios de aceptación**

- Dos registros de la misma molécula con variación ortográfica quedan propuestos para fusión.
- Una tecnología con registro sanitario vigente en Colombia no puede pasar a estado `Filtrada / Apta para Priorización` sin justificación explícita de nueva indicación, nueva forma farmacéutica disruptiva o combinación.
- Ninguna exclusión se guarda sin causa tipificada.
- La consulta al índice local de INVIMA responde por debajo de 100 ms en el percentil 95.

**Bloqueantes externos.** La especificación advierte que puede no lograrse el consumo del dataset de INVIMA por datos abiertos y que las actas de sala especializada solo se publican en PDF. Se requiere gestión institucional con INVIMA para acordar la ruta de acceso. Plan de contingencia: carga programada de archivo plano más extracción asistida de los PDF, con alerta visible en la interfaz cuando el índice local tenga más de 30 días de antigüedad.

### Fase 4. Ingesta ampliada: conectores API y portal reactivo

**Objetivo.** Sustituir el rastreo genérico de páginas por ingesta estructurada donde exista una API, conservarlo donde no la haya, y habilitar el canal reactivo.

**Alcance (RF01, RF02, y completitud de RF03 y RF04)**

1. Arquitectura ELT con cola asíncrona (Celery + Redis) y tareas programadas. La extracción deja de correr en el hilo de la petición.
2. Conectores: ClinicalTrials.gov REST API v2 filtrando fases II, III y IV; WHO ICTRP; FDA New Drug Approvals y Breakthrough Devices; EMA Human Medicines Highlights; EuroScan i-HTS. Cada conector se implementa como adaptador independiente con su propio mapeo al esquema canónico.
3. Políticas de resiliencia: reintento exponencial, respeto de cabeceras de rate limit, circuit breaker por fuente y registro de ejecución por conector, extendiendo el `ScrapeLog` actual.
4. Persistencia del `raw_payload` completo en JSONB, conservando campos relacionales mínimos indexados.
5. Portal público de postulación con los campos obligatorios del RF02 (nombre comercial y DCI, mecanismo, fabricante, indicación, fase de desarrollo, enlaces a evidencia y declaración de conflicto de interés), protegido con reCAPTCHA v3 y validación estricta por JSON Schema.
6. Bandeja de entrada completa con filtros por fecha, fuente y canal, y transferencia por lotes al ciclo activo.
7. El scraper actual se conserva como conector de último recurso para fuentes sin API. PubMed E-Utilities se incorpora como fuente complementaria de evidencia, bajo la misma política de rate limiting.
8. Extracción y normalización, en cada conector, de las fechas que alimentan el time-to-market y el pre-llenado de criterios: finalización estimada de fase III (ClinicalTrials.gov), fecha de aprobación (FDA, EMA) y estado del trámite regulatorio.

**Criterios de aceptación**

- Una ejecución programada trae registros de al menos tres conectores y los deja en staging sin bloquear la aplicación web.
- Un corte de una fuente externa no interrumpe la ingesta de las demás.
- El `raw_payload` permite reconstruir la señal original sin volver a consultar la fuente.
- Una postulación externa llega a la bandeja marcada como reactiva, con su declaración de conflicto de interés adjunta.

**Decisión pendiente.** La especificación deja explícitamente por confirmar las fuentes y rutas que alimentan RF01. Debe cerrarse el inventario definitivo de conectores, con credenciales y términos de uso de cada API, antes del inicio de la fase.

### Fase 5. Evaluación temprana, Mini-HTA y revisión por pares

**Objetivo.** Convertir la caracterización actual en el flujo editorial completo que exige el Manual.

**Alcance (RF13, RF14, RF15, RF16)**

1. Editor estructurado de fichas de tecnologías emergentes, evolucionando el checklist actual de `/caracterizacion`, con los campos del RF13: resumen de la condición de salud, mecanismo biológico o tecnológico, población objetivo en Colombia, estado del arte de la evidencia clínica (fases de ensayos, desenlaces de eficacia y seguridad), posibles comparadores en el SGSSS y riesgos potenciales de adopción.
2. Tres niveles de producto documental diferenciados, como plantea la Tabla 1 de la especificación: ficha técnica, informe y Mini-HTA. Cada nivel tiene su plantilla, sus campos obligatorios y su ruta de aprobación, y el nivel exigido se determina en el momento de la priorización.
3. Editor de Mini-HTA con pregunta PICO estructurada, modelación preliminar de impacto presupuestal a 1 a 3 años y análisis de incertidumbre clínica.
4. Flujo editorial de seis estados: borrador en redacción, revisión interna de calidad por la coordinación del IETS, revisión externa por pares, con observaciones, aprobado por comité técnico y publicado en plataforma. Transiciones controladas por rol y auditadas.
5. Portal de revisores externos con token JWT cifrado, enviado por correo, con expiración a 10 días y alcance restringido al documento asignado. Sin creación de cuenta permanente.
6. Formulario digital obligatorio de declaración de conflicto de interés, bloqueante: sin declaración firmada no se habilita la lectura del informe. Aplica también al evaluador interno, según el glosario de revisión por pares.
7. Editor enriquecido (TipTap o ProseMirror) con control de versiones mayor y menor y comentarios en línea.
8. Marca de confidencialidad a nivel de documento y de campo, para las evaluaciones preliminares y la información recibida bajo acuerdo con desarrolladores. Determina qué se cifra en reposo (fase 7) y qué nunca aparece en la vista pública del RF18.
9. Exportación a PDF institucional mediante plantilla HTML/CSS con la línea gráfica del IETS, renderizada con WeasyPrint o Playwright headless.

**Criterios de aceptación**

- Un informe no avanza a publicado sin registro de al menos un revisor interno y un revisor externo con conflicto de interés declarado.
- Un token de revisor caducado deniega el acceso y queda registrado el intento.
- El PDF generado reproduce la maquetación institucional y es apto para entrega formal al Ministerio.
- El historial de versiones permite reconstruir el estado del documento en cualquier transición de estado.

**Decisiones pendientes.** La especificación deja abierto qué tecnologías priorizadas ameritan Mini-HTA y cuál es la ruta de activación de ese informe según diálogos tempranos. También pide revisar si la participación de expertos externos en otras etapas (por ejemplo priorización) requiere funciones adicionales. Ambas deben cerrarse antes del diseño detallado.

### Fase 6. Dashboard estratégico, ficha pública, boletines y alertas

**Objetivo.** Entregar la cara visible de la plataforma para MSPS, INVIMA y Comisión de Precios.

**Alcance (RF17, RF18, RF19, RF20)**

1. Dashboard con filtros dinámicos por clúster, tipología, fase clínica, nivel de priorización y rango de fechas, y las cuatro visualizaciones obligatorias: distribución por clúster, dispersión de time-to-market, mapa de calor de impacto presupuestal potencial y embudo de conversión del ciclo (capturadas, filtradas, priorizadas, evaluadas).
2. Doble capa de acceso: vista pública con estadísticas agregadas de transparencia y vista restringida con modelaciones presupuestales y comparadores estratégicos, solo para MSPS e INVIMA.
3. Ficha pública y buscador avanzado de expedientes, con descarga de la ficha técnica en PDF y enlace a los ensayos clínicos asociados.
4. Generador del Boletín Epidemiológico y Financiero de Tecnologías Emergentes, con periodicidad trimestral y maquetación ejecutiva.
5. Sistema de alertas configurables por cambio de fase de tecnologías de alto riesgo presupuestal y por detección de nuevo ensayo fase III en el país, con suscripción por usuario y por clúster, y canales de correo y notificación en plataforma.
6. Motor de cálculo de time-to-market a partir de la finalización de ensayos fase III y de los tiempos de revisión regulatoria, con las franjas que se definan (menos de 1 año, 1 a 2 años, 2 a 3 años, o la clasificación emergente, transición e inminente que quede aprobada). El cálculo se recalcula en cada cierre de etapa y queda versionado por ciclo.
7. Vistas materializadas o datamart refrescado tras cada cierre de etapa, para que el tablero no golpee tablas transaccionales.
8. Decisión y aplicación del criterio visual: librería de gráficos (Apache ECharts, Plotly o Chart.js frente al Recharts actual) y fondo blanco puro con paleta institucional, según la guía técnica del módulo 5.

**Criterios de aceptación**

- El tablero responde por debajo de 2 segundos en el percentil 95 con el volumen proyectado a tres ciclos.
- Un usuario de la vista pública no puede acceder, ni por API, a modelaciones presupuestales.
- El boletín se compila automáticamente con los datos del ciclo cerrado y requiere aprobación del líder antes de publicarse.

**Decisión pendiente.** La clasificación de time-to-market (emergente, transición, inminente) está sujeta a la revisión de NIHRIO y de la literatura, según nota de la especificación. Debe cerrarse antes de construir la visualización de dispersión.

### Fase 7. Endurecimiento, interoperabilidad y cierre

**Objetivo.** Cumplir los requerimientos no funcionales de seguridad, disponibilidad e interoperabilidad internacional.

**Alcance**

1. HTTPS/TLS 1.3 con certificados válidos en todos los entornos, y cifrado en reposo AES-256 para evaluaciones preliminares e información bajo acuerdo de confidencialidad con desarrolladores.
2. Arquitectura de disponibilidad para sostener 99,5% en horario laboral: réplica de base de datos, respaldo con recuperación puntual, monitoreo y alertas de infraestructura.
3. Pruebas de carga y afinamiento hasta cumplir el objetivo de 2 segundos en el percentil 95 de las pantallas de consulta.
4. Endpoints REST con OAuth2 para interoperabilidad con EuroScan (i-HTS), NIHRIO y CONETEC.
5. Documentación OpenAPI/Swagger publicada y actualizada automáticamente, para futura integración con sistemas de MinSalud e INVIMA.
6. Verificación final del marco de auditoría: prueba de extremo a extremo demostrando que la bitácora reconstruye la vida completa de una tecnología, desde su captura hasta la publicación de su informe.

**Criterios de aceptación**

- Auditoría de seguridad externa sin hallazgos críticos ni altos abiertos.
- Prueba de restauración de respaldo ejecutada con éxito y documentada.
- Un tercero autorizado consume la API de interoperabilidad con credenciales OAuth2 y obtiene el listado de tecnologías publicadas.

## 6. Matriz de trazabilidad de requerimientos

| RF | Descripción abreviada | Estado actual | Fase |
|---|---|---|---|
| RF01 | Captura proactiva por APIs y conectores | Parcial (scraping genérico) | 4 |
| RF02 | Portal web de postulación reactiva | Ausente | 4 |
| RF03 | Staging data lake con raw_payload | Ausente | 1 (mínimo), 4 (completo) |
| RF04 | Buzón de entrada y pre-visualización | Parcial (bandeja de trabajo) | 1, 4 |
| RF05 | Parametrización del ciclo operativo | Ausente | 1 |
| RF06 | Taxonomía de 6 clústeres | Ausente | 1 |
| RF07 | Clasificación por tipología tecnológica | Parcial (4 tipos, no los 7) | 1 |
| RF08 | Asignación de señales al ciclo activo | Ausente | 1 |
| RF09 | Desduplicación difusa | Mínima (hash exacto) | 3 |
| RF10 | Criterio de novedad e innovación | Ausente | 3 |
| RF11 | Verificación regulatoria INVIMA | Ausente | 3 |
| RF12 | Listado Único depurado por clúster | Ausente | 3 |
| Matriz P1 a P6 | Motor de priorización oficial | No conforme (heurística propia) | 2 |
| RF13 | Editor de fichas de tecnologías | Parcial (checklist) | 5 |
| RF14 | Editor Mini-HTA con PICO | Ausente | 5 |
| RF15 | Workflow de revisión por pares | Ausente | 5 |
| RF16 | Portal de revisores y conflicto de interés | Ausente | 5 |
| RF17 | Dashboard de gobernanza anticipatoria | Parcial | 6 |
| RF18 | Ficha pública y consulta rápida | Ausente | 6 |
| RF19 | Boletines trimestrales automatizados | Ausente | 6 |
| RF20 | Alertas tempranas | Ausente | 6 |
| RNF | Bitácora inmutable | Ausente | 0 |
| RNF | RBAC de 5 perfiles | Parcial (3 roles) | 0 |
| RNF | Cifrado, disponibilidad, interoperabilidad | Ausente | 7 |

Nota sobre la numeración: la especificación no asigna RF al módulo 3, por lo que la fila correspondiente se identifica por la matriz de criterios. Todos los demás requerimientos, del RF01 al RF20, tienen fase asignada y ninguno queda sin cubrir.

## 7. Máquina de estados consolidada

La especificación reparte los estados entre módulos y no los presenta juntos en ningún punto. Esta es la consolidación que debe implementarse, y sirve de contrato entre backend y frontend.

**Estado de la tecnología dentro de un ciclo**

```
capturada_no_asignada        (M0, staging)
      ↓ arrastre al ciclo
asignada_a_ciclo             (M1)
      ↓ filtrado
filtrada_apta_priorizacion   (M2)   ó   excluida  (M2, con causa tipificada)
      ↓ calificación P1 a P6
priorizada (%P alto)  |  bajo_vigilancia (%P medio)  |  no_priorizada (%P bajo)
      ↓                        ↓                              ↓
en_evaluacion (M4)      monitoreo activo,             archivo histórico
      ↓                 reingreso al ciclo siguiente
publicada (M4/M5)
```

**Estado editorial del documento (M4)**

```
borrador → revisión interna → revisión externa por pares → con observaciones
        → aprobado por comité técnico → publicado en plataforma
```

**Estado del ciclo (M1)**

```
en_configuracion → en_filtrado → en_priorizacion → en_evaluacion → cerrado_consolidado
```

Reglas de integridad que atraviesan las tres máquinas:

1. Un ciclo no cierra con tecnologías `en_evaluacion` sin informe final o justificación.
2. Al cerrar el ciclo, los puntajes quedan congelados y las tecnologías en `bajo_vigilancia` se proponen para el ciclo siguiente.
3. Ninguna transición ocurre sin registro en `audit_log`, con usuario, IP, fecha UTC y valores antes y después.
4. Ningún estado se representa como texto libre: todos son valores de catálogo versionado.

## 8. Superficie de API por fase

Los prefijos actuales se conservan. Estos son los que se agregan o se modifican, para dimensionar el trabajo de backend y de documentación OpenAPI.

| Fase | Prefijo | Operaciones principales |
|---|---|---|
| 0 | `/api/audit` | Consulta de bitácora, solo lectura, filtrable por entidad y usuario |
| 0 | `/api/users` | Se amplía a los cinco perfiles y a permisos por módulo |
| 1 | `/api/cycles` | CRUD, transición de estado, cierre con validaciones |
| 1 | `/api/clusters`, `/api/tech-types` | Catálogos parametrizables |
| 1 | `/api/technologies` | Reemplaza progresivamente a `/api/findings`; incluye `POST /assign-to-cycle` por lotes |
| 1 | `/api/staging` | Bandeja de entrada, filtros por fecha, fuente y canal |
| 2 | `/api/priority` | Calificación por criterio, cálculo de %P, congelación, arrastre entre ciclos |
| 3 | `/api/screening` | Propuestas de fusión, confirmación, exclusión con causa, listado único |
| 3 | `/api/invima` | Consulta al índice local, estado de sincronización del dataset |
| 4 | `/api/connectors` | Alta, ejecución y monitoreo por conector |
| 4 | `/api/public/submissions` | Portal reactivo, sin autenticación institucional |
| 5 | `/api/reports` | Fichas, informes y Mini-HTA, versiones y transiciones editoriales |
| 5 | `/api/reviews` | Asignación de revisores, tokens temporales, conflicto de interés, observaciones |
| 6 | `/api/analytics` | Series del tablero sobre vistas materializadas |
| 6 | `/api/public/technologies` | Ficha pública y buscador, sin datos confidenciales |
| 6 | `/api/bulletins` | Compilación, aprobación y publicación del boletín |
| 6 | `/api/alerts` | Suscripciones y reglas de notificación |
| 7 | `/api/partners` | Endpoints OAuth2 de interoperabilidad internacional |

Los prefijos `/api/notes`, `/api/chat`, `/api/config`, `/api/realtime` y `/api/health` se conservan sin cambio funcional.

## 9. Compatibilidad de rutas

La renumeración de módulos obliga a un segundo juego de redirecciones, además de las que ya existen. Se propone conservar ambas durante dos ciclos operativos completos.

| Ruta actual | Ruta destino | Observación |
|---|---|---|
| `/` | `/` | Bandeja contextualizada al ciclo activo |
| `/vigilancia` | `/ingesta` | Absorbe conectores API y canal reactivo |
| `/fuentes` | `/fuentes` | Sin cambio funcional mayor |
| No existe | `/ciclos` | Nueva, módulo 1 |
| No existe | `/filtrado` | Nueva, módulo 2 |
| `/priorizacion` | `/priorizacion` | Cambia el motor interno, no la ruta |
| `/caracterizacion` | `/evaluacion` | Absorbe fichas, Mini-HTA y revisión por pares |
| `/diseminacion` | `/publicaciones` | Absorbe boletines |
| `/dashboards` | `/tablero` | Con capa pública y capa restringida |
| `/notas`, `/chat` | Sin cambio | Capacidades de apoyo, fuera de la especificación |

## 10. Riesgos principales

| Riesgo | Impacto | Probabilidad | Mitigación |
|---|---|---|---|
| No se obtiene acceso estructurado al dataset de INVIMA | Alto: RF11 queda manual y frena el filtro nacional | Media | Gestión institucional temprana; contingencia con carga de archivo plano y extracción asistida de actas en PDF |
| La contradicción de umbrales en el módulo 3 se resuelve tarde | Alto: obliga a recalcular ciclos ya cerrados | Media | Cerrar la decisión antes de iniciar la fase 2, con acta firmada por la coordinación metodológica |
| Cambios en las taxonomías de clústeres y tipologías después de implementadas | Medio | Alta, la propia especificación lo anticipa | Parametrización en base de datos desde el diseño, nunca en código |
| Rate limiting o cambios de contrato en APIs externas | Medio | Alta | Adaptadores desacoplados, pruebas de contrato y monitoreo por conector |
| Dependencia de Gemini para contenido técnico publicable | Medio, reputacional y de auditoría | Media | Toda salida de IA queda como borrador atribuido, sujeto a validación humana y a revisión por pares |
| Migración de datos históricos con pérdida de trazabilidad | Alto | Baja | Ciclo histórico retroactivo, conteos de control y ventana de reversión |

## 11. Decisiones de negocio que deben cerrarse

| Tema | Fase que bloquea | Responsable sugerido | Fecha límite sugerida |
|---|---|---|---|
| Lista definitiva de clústeres y tipologías tecnológicas | 1 | Coordinación metodológica EH | Antes del inicio de la fase 1 |
| Regla única de umbral de priorización (puntos frente a porcentaje) | 2 | Coordinación metodológica EH | Antes del inicio de la fase 2 |
| Responsable único de la calificación de P4 | 2 | Coordinación metodológica EH | Antes del inicio de la fase 2 |
| Ruta de acceso a datos de INVIMA y a actas de sala especializada | 3 | Dirección Ejecutiva con INVIMA | Al menos 8 semanas antes de la fase 3 |
| Inventario definitivo de fuentes y conectores de RF01 | 4 | Coordinación metodológica y TIC | Antes del inicio de la fase 4 |
| Criterio de activación del Mini-HTA y su relación con diálogos tempranos | 5 | Coordinación metodológica con MSPS | Antes del inicio de la fase 5 |
| Alcance de la participación de expertos externos fuera de la revisión por pares | 5 | Coordinación metodológica EH | Antes del inicio de la fase 5 |
| Clasificación operativa de time-to-market | 6 | Coordinación metodológica EH | Antes del inicio de la fase 6 |
| Nivel de producto exigido por tecnología priorizada (ficha, informe o Mini-HTA) | 5 | Coordinación metodológica EH | Antes del inicio de la fase 5 |
| Librería de visualización y criterio de fondo blanco frente a la línea gráfica vigente | 6 | Coordinación de Gestión de Tecnologías y Comunicaciones | Antes del inicio de la fase 6 |
| Alcance del registro de diálogos tempranos en la plataforma | 5 | Coordinación metodológica con MSPS e INVIMA | Antes del inicio de la fase 5 |

## 12. Recomendaciones de ejecución

1. Congelar funcionalidades nuevas en la plataforma actual durante las fases 0 y 1. Son fases de refactor profundo y cualquier desarrollo paralelo multiplica el costo de integración.
2. Levantar un acta de decisiones metodológicas antes de cada fase, firmada por la coordinación del proyecto, que quede referenciada en el código como fuente de verdad de los parámetros implementados.
3. Mantener el `smoke_test.py` como suite viva. Cada fase agrega sus propias pruebas de aceptación al mismo pipeline.
4. Versionar el sistema en concordancia con las fases: v2.0 al cierre de la fase 1, v3.0 al cierre de la fase 3, v4.0 al cierre de la fase 5 y v5.0 al cierre de la fase 7.
5. Documentar en el README y en el BACKLOG el estado de cumplimiento de cada RF al cierre de cada fase, de modo que la trazabilidad hacia los entes de control esté siempre disponible sin trabajo adicional.

## 13. Anexo. Verificación de cobertura frente a la especificación

Esta sección deja constancia del barrido completo del documento de requerimientos, elemento por elemento, para que la revisión no dependa de la lectura del plan.

### 13.1 Requerimientos funcionales

Los veinte requerimientos funcionales (RF01 a RF20) están asignados a una fase en la matriz de la sección 6. No hay RF sin fase asignada. El módulo 3 no tiene RF numerados en la especificación y se cubre por la matriz de criterios de la fase 2.

### 13.2 Guías técnicas para desarrolladores

| Guía técnica | Elemento | Fase |
|---|---|---|
| Módulo 0 | Arquitectura ELT con cola asíncrona | 4 |
| Módulo 0 | Reintento exponencial y respeto de rate limits | 4 |
| Módulo 0 | Esquema híbrido con `raw_payload` en JSONB | 0 (motor), 4 (uso) |
| Módulo 0 | reCAPTCHA v3 y validación por JSON Schema | 4 |
| Módulo 1 | Tabla intermedia `ciclo_tecnologia` con puntajes por instancia | 1 |
| Módulo 1 | Sugerencia de clúster por NLP contra CIE-10 y MeSH | 1 |
| Módulo 1 | State machine del ciclo con bloqueo de cierre | 1 |
| Módulo 2 | Matching difuso con umbral de 85% | 3 |
| Módulo 2 | Integración con datos abiertos de INVIMA y normas farmacológicas | 3 |
| Módulo 2 | Conceptos de sala especializada del INVIMA | 3 |
| Módulo 2 | Motivo de exclusión tipificado e inmutable | 3 |
| Módulo 3 | Pre-llenado de P1, P5 y P6 | 2 |
| Módulo 3 | Bandejas colaborativas con permisos por campo | 2 |
| Módulo 3 | Congelación de puntajes al cierre del ciclo | 2 |
| Módulo 4 | Editor enriquecido con versionamiento y comentarios en línea | 5 |
| Módulo 4 | Tokens JWT temporales de 10 días para revisores | 5 |
| Módulo 4 | Exportación a PDF institucional | 5 |
| Módulo 5 | Vistas materializadas o datamart | 6 |
| Módulo 5 | Librería de visualización y criterio visual | 6 |
| Módulo 5 | RBAC de dos capas en el tablero | 6 |
| Sección 5.1.1 | Stack sugerido (evaluado, no adoptado en bloque) | 0 |
| Sección 5.1.1 | Contenerización y CI/CD | 0 |
| Sección 5.1.1 | Documentación OpenAPI y Swagger UI | 0 (base), 7 (publicación) |

### 13.3 Requerimientos no funcionales

| Requerimiento | Fase |
|---|---|
| Bitácora inmutable con usuario, IP, fecha UTC y valores antes y después | 0 |
| HTTPS/TLS 1.3 y cifrado AES-256 en reposo | 7 (marcado de datos sensibles en la 5) |
| Disponibilidad de 99,5% en horario laboral | 7 |
| Tiempo de respuesta bajo 2 segundos en el percentil 95 | 6 (diseño), 7 (verificación) |
| Interoperabilidad OAuth2 con EuroScan, NIHRIO y CONETEC | 7 |

### 13.4 Conceptos del glosario con incidencia funcional

| Concepto | Tratamiento en el plan |
|---|---|
| Tecnología emergente frente a nueva | Campo obligatorio en fase 1, distinto del horizonte que ya maneja el sistema |
| Time-to-market | Campos base en fases 1 y 4, motor de cálculo en fase 6 |
| Staging data lake | Fase 1 en versión mínima, fase 4 completo |
| Ciclo de escaneo | Fase 1 |
| Matching difuso | Fase 3 |
| Índice de priorización %P | Fase 2 |
| Revisión por pares y conflicto de interés | Fase 5 |
| Bitácora inmutable y RBAC | Fase 0 |
| **Diálogo temprano** | **Sin requerimiento funcional en la especificación.** El glosario lo define y el RF14 lo menciona como disparador del Mini-HTA, pero ningún RF describe su registro. Se marca como decisión pendiente de la fase 5 |
| Sistemas de alerta y conocimiento temprano (EAA) | Fase 6, vía RF20 |
| Búsqueda proactiva y reactiva | Fase 4, un canal por cada modalidad |
| Alcance de tecnología sanitaria (medicamentos, dispositivos, procedimientos, diagnóstico in vitro, salud digital, IA) | Fase 1, vía las 7 tipologías |
| Filtro de novedad e INVIMA | Fase 3 |
| Clústeres de salud del IETS | Fase 1 |
| Evaluación temprana (Mini-HTA) | Fase 5 |

### 13.5 Puntos de la especificación que quedan fuera del alcance de software

1. Los ajustes al Manual Metodológico que se deriven de las cuatro inconsistencias señaladas en la fase 2.
2. La gestión institucional con INVIMA para el acceso a datos, que condiciona la fase 3 pero no es tarea de desarrollo.
3. Los convenios de interoperabilidad con EuroScan, NIHRIO y CONETEC, requisito previo a la habilitación técnica de la fase 7.
4. La revisión de literatura que la especificación exige para cerrar clústeres, tipologías y clasificación de time-to-market.
