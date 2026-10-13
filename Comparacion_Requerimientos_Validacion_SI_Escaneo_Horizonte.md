# Comparación uno a uno con la matriz de validación de requerimientos

**Fuente:** `Validacion_Requerimientos_SI_Escaneo_Horizonte.xlsx` (versión 1, 3 de septiembre de 2026).  
**Sistema comparado:** Sis_HS_IETS v7.0.0, código al 13 de octubre de 2026 (commit local `6e28f1c`).  
**Despliegue medido:** `https://sis-hs-iets.onrender.com`, 13 de octubre de 2026.

La matriz registra el **concepto de viabilidad** del IETS sobre cada RF/RNF de la especificación (`Viable` / `Replantear` / `Inviable`), no un certificado de que el software ya lo cumple. Esta nota contrasta, fila a fila: el enunciado, el concepto de la matriz, lo que el prototipo decía entonces, y **lo que el sistema hace hoy**.

### Cómo leer el dictamen

| Dictamen | Significado |
|---|---|
| **Cumple** | El software cubre el enunciado. Puede faltar una decisión de negocio o un dato institucional, pero no código. |
| **Cumple con brecha** | El flujo existe; falta un elemento concreto del enunciado o del ambiente. |
| **Parcial** | Hay implementación material, pero no el alcance completo. |
| **No cumple** | No está construido, o el despliegue actual lo contradice. |
| **Pendiente de publicar** | Está en el repositorio local y aún no en Render (hace falta `git push`). |

Las mediciones de Render se tomaron con el servicio ya despierto. El arranque en frío del plan gratuito superó los 70 s el 8 de octubre de 2026.

---

## 1. Requerimientos funcionales y criterios (27 filas)

### RF01 — Captura proactiva (APIs, web scraping y conectores)

| Campo de la matriz | Valor |
|---|---|
| Módulo / prioridad / entrega | M0 · Imprescindible · Entrega 4, sprint 2 act. 30 |
| Concepto IETS | Viable. Observación: sitios con CAPTCHA o arquitectura cambiante deben permitir **carga manual**. |
| Estado en el prototipo (matriz) | Adaptadores `clinicaltrials`, `fda`, `ema`, `pubmed` y `who_ictrp`; WHO ICTRP por lote |

**Hoy.** Catálogo D-06 + matriz EH: **95 fuentes** en seis bloques. Conectores API (`clinicaltrials`, `fda`, `ema`, `pubmed`, `who_ictrp`, `ctis`, Health Canada, etc.) y HTML de último recurso. Cada fuente tiene flujo (recorrido, OCR, IA, búsqueda web `site:`). Alta y edición manual en `/fuentes` y señales en `/bandeja-entrada`. Cola `ingest_jobs` con `POST /api/scan/run`.

**Brecha de despliegue.** En Render con SQLite el worker de vigilancia **está apagado** para no bloquear el login. El escaneo **manual** sí corre (ClinicalTrials.gov: 100 estudios en < 5 s el 8 oct). WHO ICTRP sigue por lote. EuroScan i-HTS no tiene conector API propio: entra como HTML.

**Dictamen: cumple con brecha** (vigilancia programada y CAPTCHA; carga manual sí existe).

---

### RF02 — Portal de postulación (canal reactivo)

| Campo de la matriz | Valor |
|---|---|
| Prioridad | Deseable |
| Concepto IETS | Viable como micrositio de consulta externa |
| Prototipo | Portal con COI bloqueante y cola de moderación; **sin reCAPTCHA en producción** |

**Hoy.** `/postular` público; campos de tecnología, evidencia y conflicto de interés; cola `/postulaciones`. Variables `RECAPTCHA_*` listas; en Render las llaves están vacías. Tope por IP configurable.

**Verificado 13 oct:** `GET /api/submissions` → 200.

**Dictamen: cumple con brecha** (reCAPTCHA no activo en Render).

---

### RF03 — Repositorio de acopio preliminar (staging)

| Campo de la matriz | Valor |
|---|---|
| Prioridad | Imprescindible |
| Concepto IETS | Viable. Observación: «necesario realizar una validación» |
| Prototipo | Tabla de crudos por conector e identificador externo |

**Hoy.** `raw_records` + `findings` con fuente, canal, fecha UTC y proceso/usuario. Reproceso sin volver a la fuente. Bitácora de ingesta.

**Verificado 13 oct:** el modelo opera; el lago en Render estaba **vacío** (0 hallazgos) porque el disco SQLite se borra al dormir el servicio.

**Dictamen: cumple** en software. La persistencia en el hosting actual no está garantizada hasta publicar la copia en el navegador o pasar a PostgreSQL.

---

### RF04 — Buzón de entrada y previsualización

| Campo de la matriz | Valor |
|---|---|
| Prioridad | Importante |
| Concepto IETS | Viable. Observación: validar IA y UX/UI con parámetros definidos |
| Prototipo | Filtro por canal, vista previa del crudo, transferencia por lotes |

**Hoy.** `/bandeja-entrada`: filtros, preview del crudo, clasificación y asignación por lotes al ciclo. Sin clúster ni tipología no asigna (HTTP 409).

**Dictamen: cumple.** La observación de la matriz es de aceptación metodológica/UX, no de ausencia de módulo.

---

### RF05 — Parametrización del ciclo operativo

| Campo de la matriz | Valor |
|---|---|
| Prioridad | Imprescindible |
| Concepto IETS | Viable. ¿Parametrización fija o editable? |
| Prototipo | Validación de regla de negocio y máquina de estados |

**Hoy.** `/ciclos`: código, apertura, corte, boletín; máximo 3 ciclos/año; ventana 10–16 semanas; estados del manual. Parámetros en `/configuracion` (metodología). Siembra de ciclos 2026 oficiales.

**Verificado 13 oct:** `GET /api/cycles` → 200, ciclo activo `Ciclo III - 2026`.

**Dictamen: cumple.** Los catálogos son editables por superadministrador.

---

### RF06 — Taxonomía de seis clústeres

| Campo de la matriz | Valor |
|---|---|
| Prioridad | Imprescindible |
| Concepto IETS | Viable. Parametrización fija o cambiable |

**Hoy.** Seis clústeres oficiales (cáncer, alto costo, huérfanas/raras, Covid-19 e infecciosas emergentes, prevalentes, otras prioritarias). Catálogo parametrizable; sugerencia CIE-10 / MeSH.

**Dictamen: cumple.**

---

### RF07 — Siete tipologías tecnológicas

| Campo de la matriz | Valor |
|---|---|
| Prioridad | Imprescindible |
| Concepto IETS | Viable. Parametrización fija o cambiable |

**Hoy.** Medicamento químico/biológico, terapias avanzadas y génicas, dispositivos, diagnóstico in vitro, procedimientos, salud digital, algoritmos de IA. Mapeo de tipos heredados.

**Dictamen: cumple.**

---

### RF08 — Asignación y arrastre al ciclo activo

| Campo de la matriz | Valor |
|---|---|
| Prioridad | Importante |
| Concepto IETS | **Replantear.** Ampliar búsqueda y configurar OCR activo |
| Prototipo | Transferencia por lotes auditada |

**Hoy.** Asignación por lotes desde la bandeja, auditada; arrastre de «bajo vigilancia» al ciclo siguiente al cerrar. OCR MiniMax-M3 existe (`AI_OCR_ENABLED` / panel). Búsqueda web `site:` por fuente. En Render el OCR puede estar en «solo texto» si el panel no lo enciende.

**Dictamen: cumple con brecha** respecto del replanteo (OCR no va forzado a «activo» en todos los ambientes).

---

### RF09 — Desduplicación inteligente (umbral 85 %)

| Campo de la matriz | Valor |
|---|---|
| Prioridad | Imprescindible |
| Concepto IETS | Viable. Revisar/validar (posibilidad de hacerlo internamente) |
| Prototipo | Motor difuso; la fusión la confirma un evaluador |

**Hoy.** RapidFuzz (Levenshtein, Jaro-Winkler, token sort). Umbral `dedup.similarity_threshold` (defecto 85 %). Propuestas en `/filtrado`; confirmar o descartar es humano. Nunca fusiona solo.

**Verificado 13 oct:** `GET /api/screening/merges` → 200.

**Dictamen: cumple.**

---

### RF10 — Criterio de novedad e innovación (cuatro vías)

| Campo de la matriz | Valor |
|---|---|
| Prioridad | Importante |
| Concepto IETS | Viable. Parametrización fija o cambiable |

**Hoy.** Catálogo editable de vías (NCE/NBE, indicación nueva, dispositivo de alto riesgo, algoritmo con nuevo soporte). Opción «otra» exige justificación. Compuerta: sin novedad verificada no se califica %P (HTTP 409).

**Verificado 13 oct:** `GET /api/screening/novelty/options` → 200.

**Dictamen: cumple.**

---

### RF11 — Verificación regulatoria INVIMA

| Campo de la matriz | Valor |
|---|---|
| Prioridad | Deseable |
| Concepto IETS | **Replantear.** Ampliar el requerimiento |
| Prototipo | Índice local; Socrata + archivo plano; cruce por principio activo degradado |

**Hoy.** Índice local (`invima_records`), sync datos.gov.co y carga por archivo plano, umbral de coincidencia parametrizable. El cruce por principio activo sigue siendo coincidencia aproximada, no un servicio oficial INVIMA.

**Verificado 13 oct:** `GET /api/invima/status` → 200, `total_records: 0`, `stale: true` (el índice no sobrevive al disco efímero de Render).

**Dictamen: parcial.** Hay módulo; no hay convenio de dato oficial ni índice persistente en el hosting actual.

---

### RF12 — Listado Único depurado

| Campo de la matriz | Valor |
|---|---|
| Prioridad | Importante |
| Concepto IETS | Viable. Validarlo |

**Hoy.** Listado por clúster, CSV, estados Apta / Excluida con motivo obligatorio. Alimenta la cola de priorización.

**Verificado 13 oct:** `GET /api/screening/stats` → 200.

**Dictamen: cumple.**

---

### P1 — Tecnología nueva en el país

| Campo de la matriz | Valor |
|---|---|
| Califica | Evaluador técnico · binario |
| Concepto IETS | **Replantear.** Definir parámetros, responsabilidad y decisión de la IA |
| Prototipo | Permiso por criterio y prellenado sugerido |

**Hoy.** Permiso `priority:rate:P1`. Prellenado sugerido; **quien califica es el humano**. La IA no decide P1.

**Dictamen: cumple** el enunciado técnico. El replanteo (si la IA debe decidir) sigue abierto en metodología, no en código.

---

### P2 — Relevancia de la condición

| Campo de la matriz | Valor |
|---|---|
| Califica | Evaluador clínico |
| Concepto IETS | **Replantear** (mismos términos que P1) |

**Hoy.** Permiso `priority:rate:P2`. Sin evaluador clínico asignado, P2/P3/P4 no se califican.

**Dictamen: cumple** el enunciado. Pendiente la decisión de IA automática.

---

### P3 — Carga de enfermedad o impacto financiero

| Campo de la matriz | Valor |
|---|---|
| Califica | Evaluador clínico |
| Concepto IETS | **Replantear** |

**Hoy.** Permiso `priority:rate:P3`. Igual que P2.

**Dictamen: cumple** el enunciado. Pendiente decisión de IA.

---

### P4 — Impacto organizacional

| Campo de la matriz | Valor |
|---|---|
| Califica | Especificación ambigua (clínico vs farmacéutico/biomédico) |
| Concepto IETS | **Replantear** |
| Prototipo | Permiso propio, hoy en evaluador clínico |

**Hoy.** Sigue asignado al evaluador clínico. No existe perfil «farmacéutico/biomédico» aparte.

**Dictamen: cumple con brecha** (ambigüedad de la especificación no resuelta; el software tomó un lado).

---

### P5 — Aprobación reciente EMA/FDA (≤ 12 meses)

| Campo de la matriz | Valor |
|---|---|
| Califica | Evaluador técnico; prellenado por fecha |
| Concepto IETS | **Replantear** |

**Hoy.** Permiso `priority:rate:P5` y prellenado desde fecha de aprobación.

**Dictamen: cumple** el enunciado. Pendiente decisión de IA.

---

### P6 — Trámite regulatorio en curso (≤ 6 meses)

| Campo de la matriz | Valor |
|---|---|
| Califica | Evaluador técnico |
| Concepto IETS | **Replantear** |

**Hoy.** Permiso `priority:rate:P6` y prellenado sugerido.

**Dictamen: cumple** el enunciado. Pendiente decisión de IA.

---

### %P — Índice de priorización y umbrales

| Campo de la matriz | Valor |
|---|---|
| Prioridad | Imprescindible |
| Concepto IETS | Viable. Validar y revisar |
| Prototipo | Por **conteo de puntos**, umbrales parametrizados, arrastre al ciclo siguiente |

**Hoy.** `%P = (P1+…+P6)/6×100`. Clasificación por **puntos** (4 a 6 = priorizada ⇒ 66,67 %), no por umbral 70 %. La especificación contradice ambas reglas; el software documenta y usa puntos. Al cerrar el ciclo se congelan puntajes; «bajo vigilancia» se propone al siguiente.

**Verificado 13 oct:** `GET /api/priority/3/stats` y `/queue` → 200.

**Dictamen: cumple** la regla implementada (puntos). No cumple un umbral 70 % si se interpretara al pie de la letra la otra frase de la especificación.

---

### RF13 — Editor de fichas de tecnologías emergentes

| Campo de la matriz | Valor |
|---|---|
| Prioridad | Importante |
| Concepto IETS | Viable. Validarlo |
| Prototipo | Tres niveles documentales; editor estructurado, sin enriquecido |

**Hoy.** `/evaluacion`: condición, mecanismo, población Colombia, evidencia, comparadores, riesgos. Sin editor WYSIWYG.

**Verificado 13 oct:** `GET /api/reports?cycle_id=3` → 200.

**Dictamen: cumple.**

---

### RF14 — Informes en profundidad (Mini-HTA)

| Campo de la matriz | Valor |
|---|---|
| Prioridad en matriz | Fuera de alcance |
| Concepto IETS | Viable (sin observación escrita) |
| Prototipo | Nivel sugerido por puntaje, sobreescribible; activación abierta |

**Hoy.** Producto Mini-HTA con PICO e impacto presupuestal preliminar. El sistema **sugiere** el nivel por %P; el evaluador lo puede cambiar. No hay regla institucional automática de «cuándo amerita Mini-HTA».

**Dictamen: cumple con brecha** (criterio de activación aún abierto, como en la matriz).

---

### RF15 — Workflow de revisión por pares (seis estados)

| Campo de la matriz | Valor |
|---|---|
| Prioridad en matriz | Fuera de alcance |
| Concepto IETS | Viable |
| Prototipo | Seis estados auditados |

**Hoy.** Borrador → revisión interna → revisión externa → con observaciones → aprobado por comité → publicado. Transiciones validadas y en bitácora.

**Dictamen: cumple.**

---

### RF16 — Portal de revisores externos y COI

| Campo de la matriz | Valor |
|---|---|
| Prioridad en matriz | Fuera de alcance |
| Concepto IETS | Viable |
| Prototipo | Token 10 días sin cuenta; **sin correo institucional** |

**Hoy.** `/revisar/:token`, COI obligatorio, observaciones estructuradas, solo lectura del informe. SMTP opcional (`SMTP_HOST`); si falta, la UI copia el enlace.

**Dictamen: cumple con brecha** (correo institucional no configurado en Render).

---

### RF17 — Dashboard de gobernanza anticipatoria

| Campo de la matriz | Valor |
|---|---|
| Prioridad | Imprescindible |
| Concepto IETS | Viable |
| Prototipo | Tablero con capa pública y restringida; TTM parametrizado |

**Hoy.** `/dashboards`: clúster, tipología, fase, nivel, fechas; distribución por clúster; tiempo al mercado; calor presupuestal (restringido); embudo del ciclo; grafo consultable.

**Verificado 13 oct:** `GET /api/strategy/dashboard?cycle_id=3` → 200 (153 ms). `GET /api/dashboard/stats` → 200 (166 ms).

**Dictamen: cumple.**

---

### RF18 — Ficha pública y consulta rápida

| Campo de la matriz | Valor |
|---|---|
| Prioridad | Deseable |
| Concepto IETS | Viable |
| Prototipo | Expedientes no confidenciales, sin montos; HTML institucional (no PDF nativo) |

**Hoy.** `/expedientes` sin login. Exportación HTML imprimible (Imprimir → PDF), no PDF binario.

**Verificado 13 oct:** `GET /api/public/technologies` y `/api/public/strategy/stats` → 200.

**Dictamen: cumple con brecha** (PDF nativo).

---

### RF19 — Boletín epidemiológico y financiero trimestral

| Campo de la matriz | Valor |
|---|---|
| Prioridad en matriz | Fuera de alcance |
| Concepto IETS | **Replantear** (sin texto de propuesta en la celda) |
| Prototipo | Compila al cerrar; aprobación del líder; PDF nativo pendiente |

**Hoy.** `/boletines`: compilación al cierre, maquetación HTML ejecutiva, aprobación. No hay PDF nativo ni envío automático a alta dirección.

**Verificado 13 oct:** `GET /api/bulletins?cycle_id=3` → 200.

**Dictamen: parcial** (el generador existe; el entregable PDF/distribución institucional no).

---

### RF20 — Alertas tempranas

| Campo de la matriz | Valor |
|---|---|
| Prioridad | Deseable |
| Concepto IETS | Viable |
| Prototipo | Alertas en plataforma; sin correo |

**Hoy.** `/alertas`: fase III en país y alto riesgo presupuestal; suscripciones por clúster. Correo solo si hay SMTP.

**Verificado 13 oct:** `GET /api/alerts`, `/subscriptions`, `/channels` → 200.

**Dictamen: cumple con brecha** (canal correo no configurado en Render).

---

## 2. Requerimientos no funcionales (12 filas)

### RNF01 — Bitácora inmutable

| Campo de la matriz | Valor |
|---|---|
| Prioridad | Imprescindible |
| Concepto IETS | Viable |
| Prototipo | Append-only, listener y middleware |

**Hoy.** `audit_log` con usuario, IP, UTC, valores antes/después. Triggers SQLite / `REVOKE` en PostgreSQL. El administrador no puede editar ni borrar filas.

**Verificado 13 oct:** `GET /api/audit?limit=10` → 200 (bitácora con el login).

**Dictamen: cumple.**

---

### RNF02 — Cinco perfiles RBAC

| Campo de la matriz | Valor |
|---|---|
| Prioridad | Imprescindible |
| Concepto IETS | Viable |
| Prototipo | Permisos declarativos y granularidad P1–P6 |

**Hoy.** Superadministrador, evaluador técnico, evaluador clínico, revisor por pares, tomador de decisiones. Permisos por módulo y por criterio.

**Verificado 13 oct:** usuario `superadmin` con matriz de permisos en `/api/auth/me`.

**Dictamen: cumple.**

---

### RNF03 — Cifrado en tránsito y en reposo (TLS 1.3 + AES-256)

| Campo de la matriz | Valor |
|---|---|
| Prioridad | Imprescindible |
| Concepto IETS | Viable |
| Prototipo | Marca de confidencialidad; cifrado en reposo pendiente del ambiente |

**Hoy.** Render termina HTTPS. Marca de confidencialidad por documento. La base SQLite del plan gratuito **no** está cifrada AES-256 en reposo.

**Dictamen: parcial** (tránsito sí; reposo no en el hosting actual).

---

### RNF04 — Disponibilidad 99,5 % en horario laboral

| Campo de la matriz | Valor |
|---|---|
| Prioridad | Imprescindible |
| Concepto IETS | Viable |
| Prototipo | Pendiente del ambiente institucional |

**Hoy.** Render **free** apaga el proceso sin tráfico (~15 min) y el disco es efímero. Arranque en frío medido: ~73 s. Hay un workflow `keepalive` (cada 10 min) en el repo; no sustituye un SLA institucional.

**Dictamen: no cumple** en el despliegue actual. El software no es el obstáculo.

---

### RNF05 — P95 de consulta menor a 2 s

| Campo de la matriz | Valor |
|---|---|
| Prioridad | Deseable |
| Concepto IETS | **Inviable** |
| Prototipo | Cumple en local; margen estrecho en índice INVIMA a escala |

**Hoy (Render, servicio caliente, 13 oct).** Login 1,1 s; `/me` 169 ms; ciclos 228 ms; tablero 166–490 ms; fuentes 1,05 s; MiniMax test 2,3 s (no es pantalla de consulta); salud en frío históricamente ≫ 2 s.

**Dictamen: cumple con brecha** en pantallas de consulta **con el servicio despierto**. No cumple el P95 si se incluye el arranque en frío. El concepto «Inviable» de la matriz se refería a escala INVIMA, no a que el resto de pantallas no pueda bajar de 2 s.

---

### RNF06 — OAuth2 hacia EuroScan / IO / CONETEC

| Campo de la matriz | Valor |
|---|---|
| Prioridad | Imprescindible |
| Concepto IETS | Viable |
| Prototipo | Pendiente de convenio institucional |

**Hoy.** No hay cliente OAuth2 hacia esas redes. Las fuentes se cubren por HTML/API pública, no por federación.

**Dictamen: no cumple.** Depende de convenio, no solo de código.

---

### RNF07 — PostgreSQL + JSONB + pgvector + vistas materializadas

| Campo de la matriz | Valor |
|---|---|
| Prioridad | Imprescindible |
| Concepto IETS | Viable |
| Prototipo | Código agnóstico; migración a PostgreSQL no ejecutada en producción |

**Hoy.** El código acepta `postgresql+psycopg://…` (JSONB, `pg_trgm`, `unaccent`). **Render corre SQLite** en `/app/data`. No hay pgvector ni vistas materializadas en el hosting actual.

**Dictamen: parcial** (portabilidad sí; producción actual no es PostgreSQL).

---

### RNF08 — Motor de tareas asíncronas

| Campo de la matriz | Valor |
|---|---|
| Prioridad | Imprescindible |
| Concepto IETS | Viable |
| Prototipo | Cola in-process; sin Redis/Celery |

**Hoy.** `ingest_jobs` + hilo en el proceso. Reintentos y circuitos por fuente. En Render SQLite el hilo **se fuerza apagado** para no bloquear el login. El disparo manual (`kick` / `scan/run`) sí encola y ejecuta.

**Dictamen: cumple con brecha** en software; **parcial en Render** (sin worker permanente).

---

### RNF09 — Contenerización y CI/CD

| Campo de la matriz | Valor |
|---|---|
| Prioridad | Importante |
| Concepto IETS | Viable |
| Prototipo (sep. 2026) | «Hoy no hay contenedores ni canalización» — **desactualizado** |

**Hoy.** `Dockerfile` multi-etapa, `docker-compose.yml` (api + worker + postgres), `deploy/docker-entrypoint.sh`, `.github/workflows/ci.yml` (pytest, Postgres, imagen, E2E). Render construye esa imagen.

**Dictamen: cumple.**

---

### RNF10 — Migraciones versionadas (reversibles)

| Campo de la matriz | Valor |
|---|---|
| Prioridad | Importante |
| Concepto IETS | Viable |
| Prototipo (sep. 2026) | «Migraciones idempotentes sin versionar» — **desactualizado** |

**Hoy.** Alembic `0001_baseline` y `0002_source_matrix_profile`. `python -m app.migrations`. Las migraciones ligeras de `database.py` siguen como red de seguridad.

**Dictamen: cumple.**

---

### RNF11 — OpenAPI actualizado automáticamente

| Campo de la matriz | Valor |
|---|---|
| Prioridad | Importante |
| Concepto IETS | Viable |
| Prototipo | Generado por FastAPI; falta publicación formal |

**Hoy.** `/docs` y `/openapi.json` los genera FastAPI. No hay portal institucional de API aparte.

**Dictamen: cumple con brecha** (falta el acto de publicación formal).

---

### RNF12 — Separación de ambientes y apagado del acceso de desarrollo

| Campo de la matriz | Valor |
|---|---|
| Prioridad | Importante |
| Concepto IETS | Viable |
| Prototipo | Bandera existe; falta perfil de entorno |

**Hoy.** `ENVIRONMENT` ∈ development/testing/production. En `production` el dev-login se ignora, `SECRET_KEY` débil impide arrancar, HSTS activo. **Render está en `ENVIRONMENT=development`**: `dev_login_enabled=true` (medido 13 oct). El acceso sin contraseña está abierto en internet.

**Dictamen: cumple en código; no cumple en el ambiente publicado.**

---

## 3. Resumen frente a la matriz

Conteos de **concepto IETS** (no cambian: son de la hoja `resumen`):

| Concepto | Funcionales | No funcionales | Total |
|---|---:|---:|---:|
| Viable | 18 | 11 | 29 |
| Inviable | 0 | 1 (RNF05) | 1 |
| Replantear | 9 | 0 | 9 |
| Total | 27 | 12 | 39 |

Dictamen de **software + despliegue actual** (esta nota):

| Dictamen | IDs |
|---|---|
| Cumple | RF03, RF04, RF05, RF06, RF07, RF09, RF10, RF12, P1–P3, P5, P6, %P (regla de puntos), RF13, RF15, RF17, RNF01, RNF02, RNF09, RNF10 |
| Cumple con brecha | RF01, RF02, RF08, P4, RF14, RF16, RF18, RF20, RNF05 (si el servicio está caliente), RNF08, RNF11 |
| Parcial | RF11, RF19, RNF03, RNF07 |
| No cumple (ambiente) | RNF04, RNF06, RNF12 en Render |
| Pendiente de publicar | Copia de la base en el navegador (`/api/backup`, IndexedDB) — commit `6e28f1c` no está en `origin/main` |

Los **nueve “Replantear”** de la matriz (RF08, RF11, P1–P6, RF19) no significan “no construido”. En P1–P6 y RF08 el código cubre el enunciado original; lo abierto es si la IA debe **decidir** o solo **sugerir**, y si el OCR debe ir siempre encendido. RF11 y RF19 siguen incompletos de alcance.

---

## 4. Hallazgos de operación que la matriz no cubría y hoy son bloqueantes

Estos ítems no son filas de la Excel; sí determinan si el sistema “funciona al 100 %” en Render:

1. **Disco efímero.** SQLite en el plan gratuito se borra al dormir o redesplegar. El 13 oct el inventario de trabajo estaba en **0 hallazgos**. El 8 oct se habían cargado decenas vía ClinicalTrials.gov.
2. **Copia en el navegador.** Diseñada precisamente para (1). Código listo; **no está en Render** hasta el `git push`.
3. **Login vs worker.** Varios workers o el hilo de ingesta sobre SQLite producían `database is locked` y el spinner de ingreso. Mitigado: un proceso, login de usuarios existentes **sin escritura**, worker apagado con SQLite.
4. **MiniMax.** Llave embebida + panel. Prueba real 13 oct: **OK, MiniMax-M3, 2,3 s**.
5. **Acceso de desarrollo público.** Contradice RNF12 mientras `ENVIRONMENT=development`.

---

## 5. Qué falta para cerrar la matriz en producción

Orden práctico, no de prioridad de la Excel:

1. Publicar `6e28f1c` (`git push origin main`) para activar la copia en el navegador.
2. Entrar una vez como administrador y confirmar **Guardado aquí** en la cabecera.
3. Poner `ENVIRONMENT=production` y `SECRET_KEY` propia; crear la cuenta con `BOOTSTRAP_ADMIN_*` o `/usuarios`.
4. Sustituir SQLite por PostgreSQL (addon Render, Neon o el `docker-compose` de `DEPLOY.md`) y `INGEST_WORKER_ENABLED=true`.
5. Sincronizar INVIMA y no perder el índice.
6. SMTP y reCAPTCHA si se quieren RF02/RF16/RF20 al pie de la letra.
7. Convenio para RNF06 (OAuth2 internacional) y cifrado en reposo (RNF03).
