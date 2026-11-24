# Notas del desarrollador · III seguimiento de la matriz de requerimientos

Sistema de Información de Escaneo de Horizonte del IETS (SI EAA). Fecha de corte: 17-11-2026.

Stack confirmado en el repositorio: backend FastAPI + SQLAlchemy 2 + SQLite (copia en Firestore), migraciones con Alembic (`backend/alembic/versions`); frontend React 18 + Vite.

**Cómo se verificó.** Cada ajuste tiene pruebas automáticas en `backend/tests/test_iii_seguimiento.py` (26 pruebas) que levantan la aplicación completa sobre una base aislada y llaman los mismos endpoints que usa la interfaz. Además se ejecutó la suite completa del backend (631 pruebas aprobadas, 1 omitida, ninguna fallida) y se compiló el frontend sin errores. Los conteos de RF-001 se calcularon sobre una copia de la base local (1.126 señales, última captura del 13-10-2026). **No se verificó en el sistema desplegado ni en el navegador**: la base de producción no se consultó y la interfaz no se recorrió de forma manual. Por eso ningún requerimiento se declara CUMPLIDO hasta esa verificación.

**Secciones de la Guía de usuario modificadas:** encabezado (versión y novedades del 17-11-2026), 4.4, 6.4 (nueva), 8.3, 8.7, 8.8 (paso 6), 8.9, 8.10 (nueva), 10.9 (nueva), 14.3 (nueva), 25.6 y 30.1. La Guía ya no decía 95 en ninguna parte (se buscó en todos los documentos del repositorio); dice 97 fuentes, y se agregó la explicación de por qué 93 filas producen 97 fuentes.

---

## RF-001. Acceso a la fuente original de la señal

**Estado:** CUMPLIDO PARCIAL, 17-11-2026. La captura, la clasificación de enlaces, la evidencia, el reporte por fuente y la verificación de enlaces están implementados y probados. Falta rastrear en producción las dos señales de ejemplo, que no existen en la base local.

**Respuesta al II Seguimiento:**
- (30/10) El botón llevaba a la página principal de la búsqueda porque, en las fuentes que publican sus señales en un listado, tabla o buscador sin enlace propio por ítem, se guardaba como URL de la señal la misma página consultada. Ahora cada señal guarda aparte la URL consultada y la URL de la señal, y dice si el enlace es (Enlace exacto) o (Página de consulta, la fuente no ofrece enlace directo). En el segundo caso la ficha muestra la evidencia de captura para ubicar la señal en la página.
- (03/11) Las señales (dispositivos portátiles para diagnosticar trastornos respiratorios del sueño) y (MDP-generated follow-up) no están en la copia local de la base (capturas hasta el 13-10-2026), y la base de producción no se consultó en esta entrega. No se pudo reproducir su caso puntual. Con el ajuste, al abrirlas en el sistema desplegado mostrarán su tipo de enlace; si es página de consulta, verán la evidencia de captura. Se debe confirmar en producción con el procedimiento de la sección (Cómo verificarlo).

**Causa raíz:** clasificada sobre las 1.126 señales de la base local.

| Causa | Señales | Ejemplos |
|---|---|---|
| Se guardó la URL del listado o portada de la fuente y no la del ítem | 259 | Pipelines de AstraZeneca (40), Merck (31), Novartis (19), Johnson & Johnson (12); documentos PDF de referencia leídos como un todo |
| Se guardó la URL de entrada de la matriz (listado) | 8 | NIHR Innovation Observatory |
| Portada del sitio | 7 | Sitios satélite de NMPA (China) |
| Página de resultados de búsqueda o formulario | 5 | En la primera pasada salían 27, pero 22 eran anclas de sección de FDA Breakthrough Devices (`#s3`, `#s4`), que sí llevan al punto exacto; quedaron como exacto |
| Enlaces relativos mal resueltos | 1 | Fuente de prueba interna |
| Pérdida de fragmentos (#/...) | 0 señales | La normalización del catálogo quitaba los fragmentos al comparar URL; el clasificador nuevo conserva las rutas #/ |
| Enlaces caídos o redirigidos | Sin dato todavía | Se miden con (Verificar enlaces); no se ejecutó contra los sitios reales en esta entrega |
| Bloqueo de visualización embebida | No aplica | El sistema no embebe la fuente: abre el enlace en una pestaña nueva |

Las fuentes de pipeline (tablas de productos sin ficha por producto) son el caso estructural: la fuente no ofrece enlace directo al ítem, así que la respuesta correcta es mostrar la evidencia, no inventar un enlace.

Conteo por fuente (base local, después del ajuste): 842 señales con enlace exacto, 279 con página de consulta y evidencia, 5 sin enlace, 0 sin resolver (las 1.126 quedaron con evidencia). Las fuentes con más páginas de consulta: AstraZeneca pipeline (40 de 40), Merck pipeline (31 de 33), Toolkit V4 2025 (27 de 41), Navigating the future (19 de 19), Novartis pipeline (19 de 20), CTRI India (12 de 12), Johnson & Johnson pipeline (12 de 17), NIHR Innovation Observatory (12 de 36), FDA Breakthrough Devices (7 de 30). El reporte completo se descarga desde el sistema.

**Qué se cambió:**
- Migración reversible `backend/alembic/versions/0005_signal_links.py`: columnas nuevas en `findings` (`query_url`, `link_type`, `link_status`, `link_http`, `link_checked_at`, `evidence`) e índice por `link_type`. No modifica `findings.url`; el `downgrade` solo quita las columnas nuevas. Se probó bajar a 0004 y volver a subir sobre una copia de la base: las 1.126 señales y sus URL quedaron intactas.
- Módulo nuevo `backend/app/signal_links.py`: clasificación del enlace, evidencia de captura, aplicación a señales históricas, verificación de enlaces y reporte por fuente.
- Captura: `backend/app/scraper.py`, `backend/app/ingest_service.py` y `backend/app/routers/findings.py` guardan la URL consultada, el tipo de enlace y la evidencia de cada señal nueva.
- Al arrancar, las señales sin clasificar se clasifican solas (`backend/app/main.py`, `backfill_signal_links`), con registro en bitácora.
- Endpoints: `GET /api/findings/links/report`, `GET /api/findings/links/report.csv`, `POST /api/findings/links/classify`, `POST /api/findings/links/check`. Los dos últimos requieren permiso de edición de señales y quedan en bitácora (acciones `link_classify` y `link_check`).
- Interfaz: componente `SignalLinkInfo` en el panel (Origen de la señal) de la Bandeja de entrada y en la (Ficha de señal tecnológica); componente `LinkReport` en (Señales capturadas).

**Dónde se ve en el sistema:**
- (Bandeja de entrada) › clic en una señal › panel (Origen de la señal): etiqueta (Enlace exacto) o (Página de consulta, la fuente no ofrece enlace directo), botón (Abrir la señal en la fuente) o (Abrir la página de consulta) y bloque (Evidencia de captura).
- (Señales capturadas) › botón (Reporte de enlaces) › botones (Clasificar señales), (Verificar enlaces) y (Descargar CSV).

**Cómo verificarlo:**
1. Entre a (Señales capturadas) y pulse (Reporte de enlaces).
2. Pulse (Clasificar señales) y anote cuántas quedaron con enlace exacto, con página de consulta y sin enlace.
3. Pulse (Verificar enlaces), espere a que el contador llegue al total y revise la columna (No responden).
4. Pulse (Descargar CSV) y guarde el reporte por fuente.
5. Vaya a (Bandeja de trabajo), escriba en el buscador "trastornos respiratorios" y abra el resultado; repita con "MDP-generated".
6. En el panel (Origen de la señal) confirme que la etiqueta corresponde: si dice (Enlace exacto), el botón abre la ficha del ítem; si dice (Página de consulta), debe aparecer la evidencia con título, fragmento, fecha y hora, y URL consultada.

**Pendientes y limitaciones:**
- Verificar en producción las dos señales de ejemplo (pasos 5 y 6) y ejecutar (Verificar enlaces) contra los sitios reales.
- Algunos sitios bloquean la verificación automática; se marcan (El sitio bloquea la verificación automática) y no como caídos.
- En fuentes que no ofrecen enlace por ítem (tablas de pipeline, PDF de referencia) la señal queda con evidencia: no hay enlace exacto que guardar.

**Texto para la matriz (III Seguimiento):** Se rastreó la causa: en las fuentes que publican sus señales en listados, tablas de pipeline o buscadores sin enlace propio por ítem, el sistema guardaba como enlace de la señal la página consultada. Ahora cada señal guarda por separado la URL consultada y la URL exacta, y la interfaz distingue (Enlace exacto) de (Página de consulta, la fuente no ofrece enlace directo); en este segundo caso la ficha muestra la evidencia de captura (título, fragmento, fecha y hora, URL consultada). Se agregó en (Señales capturadas) el (Reporte de enlaces) por fuente con descarga en CSV y la opción (Verificar enlaces), que marca los que no responden. La corrección se aplicó a las señales ya capturadas sin cambiar sus URL: en la base de prueba, 842 quedaron con enlace exacto, 279 con página de consulta y evidencia, 5 sin enlace y ninguna sin resolver. Pendiente confirmar en producción las dos señales de ejemplo, que no estaban en la base de prueba.

---

## OBS-001. Prioridad de la fuente

**Estado:** CUMPLIDO PARCIAL, 17-11-2026. Retirada y probada con pruebas automáticas; falta verificarla en el sistema desplegado.

**Respuesta al II Seguimiento:**
- (03/11) Se confirma que no existe herramienta de clasificación y priorización de fuentes. La columna (Observaciones) de la matriz se guarda solo como texto y el cargue nunca la lee como prioridad.
- (06/11) Se eliminó el criterio: ninguna pantalla, proceso ni exportación usa o muestra la prioridad de la fuente. El dato histórico se conserva en la base y en la bitácora, detrás de un parámetro apagado.

**Causa raíz:** el commit del 06-11-2026 ya había quitado de la interfaz la prioridad, la (Prioridad sugerida), el botón (Aplicar), los filtros y el orden. En esta revisión quedaban restos: la API seguía entregando y aceptando el campo `priority_level` de la fuente, y el módulo de la matriz conservaba la lista de niveles de prioridad. Se revisó todo lo que podía depender de la prioridad de la fuente:

| Proceso | Resultado de la revisión |
|---|---|
| Orden de escaneo | Alfabético por nombre de la fuente; no usa prioridad |
| Cribado y puntajes (`screening_score`, %P) | No usan prioridad de la fuente |
| Tableros, alertas y exportación CSV del catálogo | No la usan ni la exportan |
| Contexto que recibe la IA | No la incluye |
| API de fuentes | Entregaba y aceptaba el campo: ahora lo devuelve vacío y lo ignora |

**Qué se cambió:**
- `backend/app/source_profile.py`: parámetro `cfg.sources.priority_enabled` (apagado por defecto) y función `source_priority_enabled`.
- `backend/app/routers/sources.py`: con el parámetro apagado, la API devuelve la prioridad vacía y no la acepta al crear ni al editar; el valor histórico queda intacto en la base.
- `backend/app/source_matrix.py` y `backend/app/source_import.py`: se retiró la lista de niveles de prioridad y las referencias en la documentación del código.
- Sin migración: no se borró ninguna columna ni dato.
- (Recargar catálogo), observado el 30/10: llama `POST /api/ingest/sources/import`. Reaplica el catálogo verificado D-06 y la matriz que ya está cargada en el sistema (no pide archivo): crea las fuentes oficiales que falten, actualiza sus datos y las URL de la matriz, retira las que ya no están en el catálogo, conserva lo editado por el equipo y las fuentes registradas a mano, no borra señales y deja registro en bitácora. Se agregó una prueba que lo ejecuta y comprueba que funciona y conserva las señales.

**Dónde se ve en el sistema:** (Catálogo de fuentes): las tarjetas, la tabla, los filtros y el formulario (Editar fuente) no muestran prioridad. El CSV de (CSV) no tiene columna de prioridad.

**Cómo verificarlo:**
1. Entre a (Catálogo de fuentes) y revise que ninguna tarjeta, columna o filtro mencione prioridad.
2. Abra (Editar fuente) en cualquier fuente y confirme que no hay campo de prioridad ni (Prioridad sugerida).
3. Pulse (CSV) y confirme en Excel que no hay columna de prioridad.
4. Pulse (Recargar catálogo), confirme, y verifique el mensaje con fuentes creadas, actualizadas y retiradas.

**Pendientes y limitaciones:** la reactivación requiere que el equipo técnico defina criterios después de la revisión de literatura; entonces se enciende `cfg.sources.priority_enabled` y se vuelve a habilitar la interfaz.

**Texto para la matriz (III Seguimiento):** Se eliminó la prioridad de la fuente según lo decidido el 06/11. La columna (Observaciones) de la matriz se guarda solo como texto y el cargue no la interpreta como prioridad. El (Catálogo de fuentes) no muestra prioridad, (Prioridad sugerida), botón (Aplicar) ni filtros u orden por prioridad, y la API ya no la entrega ni la acepta. Se revisó el orden de escaneo, el cribado, los puntajes, los tableros, las alertas, la IA y las exportaciones: ninguno depende de la prioridad de la fuente. Los datos históricos se conservan en la base y en la bitácora, detrás del parámetro `cfg.sources.priority_enabled`, apagado, para reactivarlo cuando el equipo técnico defina criterios. Se confirmó que (Recargar catálogo) reaplica el catálogo verificado y la matriz vigente sin borrar señales y conservando lo editado por el equipo. Se actualizaron las secciones 4.4, 8.7 y 8.9 de la Guía.

---

## OBS-002. Cargue de la matriz de fuentes

**Estado:** CUMPLIDO PARCIAL, 17-11-2026. Implementado y probado con el Excel vigente en pruebas automáticas; falta la verificación de un usuario autorizado en el sistema desplegado.

**Respuesta al II Seguimiento:**
- (30/10) Explicación del cargue en lenguaje no técnico: la matriz es el Excel donde el equipo técnico lista las fuentes y sus URL. Cargarla es entregarle al sistema la versión nueva. El sistema la lee, la compara con lo que ya tiene y muestra qué cambiaría, sin guardar nada. La persona revisa y confirma; entonces el sistema aplica los cambios, entrega un reporte y deja en la bitácora quién hizo el cargue y qué cambió en cada fuente. Lo que el equipo editó a mano no se pisa, salvo que se pida de forma expresa.
- (03/11) Hasta el 06/11 el cargue existía solo como proceso interno: la matriz empaquetada se aplicaba al arrancar el servidor y con (Recargar catálogo), que no pide archivo, y la importación de Excel estaba en (Configuración), visible solo para el superadministrador. El 06/11 se agregó la importación en el (Catálogo de fuentes). En esta entrega el botón se llama (Cargar matriz), está visible para los perfiles con permiso de edición de fuentes y completa el flujo pedido.

**Causa raíz:** función no visible por menú y por rol, explicada en la respuesta del 03/11. Además, el cargue quitaba en silencio las URL repetidas y no informaba diferencias entre la cantidad declarada y las URL listadas.

**Qué se cambió:**
- `backend/app/source_matrix.py`: lectura de la columna (Cant URL SI EAA); validación por fila (`row_issues`) de URL repetidas y cantidad declarada distinta; resumen `validation_summary` con filas, fuentes, URL, filas que producen varias fuentes, fuentes que aparecen en varias filas y URL por tipo de tecnología.
- `backend/app/source_import.py`: la vista previa marca los conflictos con ediciones manuales del equipo, devuelve la validación y, al aplicar, deja en bitácora por cada fuente el valor anterior y el nuevo de cada campo (acción `matrix_update`), además del registro del cargue (acción `matrix_import_compare`).
- Endpoints existentes: `POST /api/sources/matrix/compare` (subir y validar, sin guardar) y `POST /api/sources/matrix/apply` (confirmar y aplicar), con permiso `source:write`.
- Interfaz: `frontend/src/components/MatrixImportModal.jsx` (sección Validación de la matriz, marca de conflictos, botón (Descargar reporte) y reporte final automático al aplicar) y botón (Cargar matriz) en `frontend/src/pages/Sources.jsx`.
- Se mantienen las correcciones previas: se conservan las URL con #/, manda el texto escrito en la celda y no el hipervínculo oculto, y se respeta lo editado por el equipo (todas con prueba automática).

**Resultado con la matriz vigente** (archivo FUENTES DE INFORMACION PROACTIVA EH.xlsx, hoja MATRIZ FI EH, con la columna Cant URL SI EAA): 93 filas, 97 fuentes y 128 URL, que coinciden con lo esperado.

Por qué 93 filas producen 97 fuentes: cinco filas corresponden a varios servicios con código propio en el catálogo (FDA fila 29 da 3 fuentes, EMA fila 31 da 2, Health Canada fila 34 da 2, EUnetHTA fila 47 da 2 y NIHR fila 54 da 2) y dos organizaciones aparecen en dos filas (FDA filas 29 y 30, Health Canada filas 34 y 35). Contando cada código una sola vez quedan 97 fuentes.

Inconsistencias reportadas, sin corregir: FDA fila 29 repite `pma.cfm` (declara 9, lista 9, únicas 8); Health Canada fila 34 declara 1 y lista 2.

Conteo de URL de consulta por tipo de tecnología de la fila (verificación pedida en RF-006): DM 55, MT (multitecnología) 49, MED 43, IA 28, SD 10, BIOM 6. Una fila con varios tipos cuenta sus URL en cada tipo, por eso la suma pasa de 128.

**Dónde se ve en el sistema:** (Catálogo de fuentes) › botón (Cargar matriz) › (Subir Excel) o (URL de Google Sheets) › (Comparar con el inventario) › sección (Validación de la matriz), listas de fuentes nuevas, con cambios, sin cambios y ausentes › (Descargar reporte) › (Aplicar).

**Cómo verificarlo:**
1. Entre con un perfil de superadministrador, evaluador técnico o evaluador clínico a (Catálogo de fuentes).
2. Pulse (Cargar matriz), elija (Subir Excel) y seleccione el archivo de la matriz.
3. Pulse (Comparar con el inventario) y confirme que la validación diga 93 filas, 97 fuentes y 128 URL, y que liste las inconsistencias de FDA fila 29 y Health Canada fila 34.
4. Revise las fuentes con cambios; las que tengan la marca (Editado por el equipo) son conflictos con ediciones manuales.
5. Pulse (Descargar reporte) y abra el CSV en Excel.
6. Marque una fuente con cambios y pulse (Aplicar). Se descarga el reporte final.
7. En (Bitácora de auditoría) busque las acciones `matrix_import_compare` y `matrix_update`.
8. Entre con un perfil sin permiso de edición (tomador de decisiones o revisor de pares) y confirme que el botón aparece deshabilitado con su explicación.

**Pendientes y limitaciones:**
- El archivo recibido se llama FUENTES DE INFORMACION PROACTIVA EH.xlsx; el sistema acepta cualquier nombre (por ejemplo MATRIZ_FUENTES_ESCANEO_EH.xlsx) siempre que conserve la hoja de la matriz y sus encabezados.
- Las fuentes que están en el inventario y no en la matriz se listan, pero no se retiran solas: la decisión es del equipo.

**Texto para la matriz (III Seguimiento):** Hasta el 06/11 el cargue de la matriz era un proceso interno (al arrancar el servidor y con (Recargar catálogo), que no pide archivo) y la importación de Excel solo estaba en (Configuración) para el superadministrador; por eso no era visible. Ahora el (Catálogo de fuentes) tiene el botón (Cargar matriz), disponible para los perfiles con permiso de edición de fuentes. El flujo sube el Excel o la hoja de Google Sheets, valida, muestra la vista previa de fuentes nuevas, con cambios, sin cambios, ausentes y conflictos con lo editado por el equipo, y no guarda nada hasta que la persona confirma. Al aplicar entrega un reporte descargable y deja en la bitácora el cargue y, por fuente, el valor anterior y el nuevo. Las inconsistencias se reportan sin corregirlas: FDA fila 29 repite pma.cfm y Health Canada fila 34 declara 1 URL y lista 2. Con la matriz vigente el resultado es 93 filas, 97 fuentes y 128 URL; hay más fuentes que filas porque cinco filas agrupan servicios con código propio en el catálogo y dos organizaciones aparecen en dos filas. Se actualizaron las secciones 8.3, 8.10 y 30.1 de la Guía.

---

## RF-005. Buscador de tecnologías en la pantalla principal

**Estado:** CUMPLIDO PARCIAL, 17-11-2026. Implementado y probado con pruebas automáticas y con la copia de la base local; falta verificarlo en el sistema desplegado.

**Respuesta al II Seguimiento:** requerimiento nuevo. Al clasificar una tecnología ahora se puede encontrar por su nombre desde la (Bandeja de trabajo) y ver en qué módulo, etapa y estado está, quién la movió por última vez y su recorrido completo.

**Causa raíz:** no aplica (funcionalidad nueva).

**Qué se cambió:**
- Módulo nuevo `backend/app/tech_search.py`: búsqueda parcial sin distinguir mayúsculas ni tildes sobre nombre comercial, DCI (sinónimo), marca, fabricante, título y tecnología de la señal, y fuente. Calcula módulo, etapa y estado actuales (descartada en la bandeja, excluida, fusionada por duplicado, ciclo cerrado o histórico), responsable y fecha del último cambio según la bitácora, y el enlace directo.
- Endpoints: `GET /api/technologies/search?q=` y `GET /api/technologies/{id}/history` (solo lectura, cualquier perfil autenticado).
- Interfaz: componente `frontend/src/components/TechSearch.jsx` en la parte superior de la (Bandeja de trabajo). El enlace usa el parámetro `?tecnologia=<id>` que ya abren Bandeja de entrada, Filtrado, Priorización y Evaluación.
- Sin migración.

**Dónde se ve en el sistema:** (Bandeja de trabajo), caja (Buscar una tecnología o señal). En cada resultado: (Abrir el registro) y (Ver recorrido por etapas).

**Cómo verificarlo:**
1. En (Bandeja de entrada) clasifique o descarte una señal y anote su nombre.
2. Vaya a (Bandeja de trabajo) y escriba parte del nombre, sin tildes o en mayúsculas.
3. Confirme que el resultado muestre módulo, etapa, estado, responsable y fecha del último cambio.
4. Pulse (Ver recorrido por etapas) y verifique que aparezca el cambio que acaba de hacer, con su fecha y su usuario.
5. Pulse (Abrir el registro) y confirme que abre la tecnología en su módulo.
6. Escriba un texto que no exista y confirme el mensaje de que no hay resultados.

**Pendientes y limitaciones:**
- La búsqueda en inglés y español compara el texto tal como se capturó y como lo registró el equipo; no traduce términos (buscar "sueño" no encuentra "sleep").
- El campo de sinónimos que existe es la DCI; no hay una lista de sinónimos aparte.
- Las tecnologías descartadas en la bandeja se abren en (Bandeja de entrada); para verlas hay que elegir la vista de descartadas.

**Texto para la matriz (III Seguimiento):** Se agregó en la (Bandeja de trabajo) el buscador (Buscar una tecnología o señal), disponible para todos los perfiles con acceso de lectura. Busca por cualquier parte del nombre, sin distinguir mayúsculas ni tildes, en el nombre comercial, la DCI, la marca, el fabricante, el título de la señal y la fuente. Cada resultado muestra el nombre, el tipo de tecnología, el módulo y la etapa actuales, el estado (incluidas las descartadas, excluidas, fusionadas por duplicado y las de ciclos cerrados), el responsable y la fecha del último cambio, y el botón (Abrir el registro), que lleva directo a la tecnología en su módulo. Con (Ver recorrido por etapas) se consulta, desde la bitácora, cada cambio de etapa con fecha y usuario. Cuando no hay resultados el sistema lo indica. Se agregó la sección 6.4 de la Guía.

---

## RF-006. Limitar criterios de búsqueda a medicamentos y dispositivos médicos

**Estado:** REQUIERE DECISIÓN DEL EQUIPO TÉCNICO, 17-11-2026. La limitación está implementada y probada con pruebas automáticas; queda planteada la decisión del punto e).

**Respuesta al II Seguimiento:** requerimiento nuevo. Se verificó la matriz por tipo de tecnología y se dejaron activas solo Medicamentos y Dispositivos médicos; las otras nueve categorías quedan inactivas y se activan desde (Configuración) sin cambios de código.

**Causa raíz:** no aplica (ajuste de alcance). Antes todas las categorías alimentaban la búsqueda web de cada fuente, y las fuentes MT (multitecnología) usaban las 11.

**Verificación de la matriz (punto a):** URL de consulta por tipo de tecnología de la fila: DM 55, MT 49, MED 43, IA 28, SD 10, BIOM 6. MED y DM son los dos tipos con más URL propias, y las filas MT también cubren medicamentos y dispositivos. Las categorías de la hoja (Criterios de búsqueda) se asignan así: Dispositivos implantables, Dispositivos médicos, Equipos biomédicos, Dispositivos de monitoreo y Tecnologías intervencionistas a DM; IA clínica a IA; SaMD, Telemedicina, mHealth y Wearables a SD; Medicamentos a MED.

**Señales ya capturadas (punto d):** las señales no guardan la categoría de búsqueda que las originó, por lo que el conteo se informa por tipo de tecnología. En la base local: por tipo de la señal, medicamento 480, dispositivo 204, digital 146, otro 296; por tipo de la tecnología, IA 671, medicamento químico o biológico 170, dispositivos médicos 99, terapias avanzadas 55, diagnóstico in vitro 49, salud digital 9, procedimientos 7, sin tipo 77. No se reclasificó ni se borró ninguna. El conteo de producción se obtiene en el sistema desplegado.

**Qué se cambió:**
- `backend/app/source_profile.py`: cada categoría tiene el campo `active`; por defecto solo Medicamentos y Dispositivos médicos. Las configuraciones guardadas antes de este ajuste toman ese mismo alcance.
- `backend/app/web_search.py`: el escaneo usa solo los términos de las categorías activas.
- `backend/app/routers/config.py`: cada cambio de la configuración de búsqueda queda en bitácora con el valor anterior y el nuevo (acción `config:web_search`).
- `frontend/src/components/SourceParamsPanel.jsx`: casilla (Activa) por categoría y conteo de activas.
- Sin migración: la configuración vive en la tabla de parámetros.

**Dónde se ve en el sistema:** (Configuración) › (Parámetros de fuentes) › sección (Criterios de búsqueda por categoría), casilla (Activa) de cada categoría y botón (Guardar).

**Cómo verificarlo:**
1. Entre como superadministrador a (Configuración) › (Parámetros de fuentes).
2. En (Criterios de búsqueda por categoría) confirme que solo Medicamentos y Dispositivos médicos aparecen como (Activa) y que la nota diga 2 de 11.
3. Marque (Activa) en otra categoría, pulse (Guardar) y recargue la página: debe seguir activa.
4. En (Bitácora de auditoría) busque la acción `config:web_search` con el valor anterior y el nuevo.
5. Desmarque la categoría para volver al alcance vigente y guarde.

**Pendientes y limitaciones:**
- Decisión pendiente del equipo técnico: si Dispositivos implantables, Equipos biomédicos y Dispositivos de monitoreo se consideran parte de Dispositivos médicos (se activarían) o quedan inactivos. Mientras tanto quedan inactivos, que es la opción más conservadora.
- La limitación aplica a los términos de búsqueda web. Las fuentes con adaptador de API (ClinicalTrials.gov, openFDA, PubMed, Health Canada, CTIS) y el recorrido de las páginas de la matriz no usan estas categorías y siguen trayendo lo que publica cada fuente.

**Texto para la matriz (III Seguimiento):** Se revisó la matriz por tipo de tecnología: de las 128 URL de consulta, 55 son de filas DM, 43 de MED, 49 de filas multitecnología, 28 de IA, 10 de SaMD y 6 de biomédicos. En (Configuración) › (Parámetros de fuentes) › (Criterios de búsqueda por categoría) cada categoría tiene ahora la casilla (Activa) y el escaneo solo usa los términos de las categorías activas. Quedaron activas Medicamentos y Dispositivos médicos; las otras nueve quedan inactivas, no eliminadas, y se pueden activar desde Configuración sin cambios de código, con registro en bitácora. No se reclasificaron ni borraron señales ya capturadas. Queda pendiente que el equipo técnico decida si Dispositivos implantables, Equipos biomédicos y Dispositivos de monitoreo hacen parte de Dispositivos médicos o permanecen inactivos; mientras tanto quedan inactivos. Se actualizó la sección 25.6 de la Guía.

---

## Inventario de fuentes por enlace (MATRIZ_FUENTES_ESCANEO_EH)

**Estado:** CUMPLIDO PARCIAL, 17-11-2026. Implementado, probado con pruebas automáticas y simulado sobre una copia de la base local; falta verificarlo en el sistema desplegado.

**Solicitud:** eliminar las fuentes existentes y cargar como inventario la primera hoja del Excel MATRIZ_FUENTES_ESCANEO_EH (2).xlsx, dejar ese formato para las próximas cargas y que el flujo de escaneo use esa información para saber qué buscar.

**Decisión tomada con el usuario:** las fuentes anteriores no se borran de la base, porque el borrado en cascada eliminaría todas las señales capturadas. Se retiran y se marcan como legacy; sus señales pendientes pasan a una bandeja (Legacy) desde donde se pueden recuperar. Cada fila del Excel es una fuente propia (una por enlace).

**Resultado con el archivo recibido:** 142 filas de 85 organizaciones, 123 de consulta activa y 19 de información general o metodológica. Quedan 141 fuentes porque la URL de RedETS está en los ID 91 y 92 (se informa y se carga una vez). La hoja RESUMEN del archivo dice 141 enlaces, pero la hoja de la matriz tiene 142 filas: incluye EUDAMED (ID 142).

| Tipo de fuente | Cantidad | Tratamiento |
|---|---|---|
| Consulta activa con rastreo web | 108 | Recorre el enlace (máximo 12 páginas) con el contexto de su fila |
| Consulta activa por API oficial | 7 | ClinicalTrials.gov (ID 102), PubMed (101), CTIS (107), PCORI (99), EMA (61), openFDA Drugs@FDA (56) y Health Canada (65) heredan el adaptador del catálogo D-06. ICTRP (103) se rastrea como página: no tiene API pública estable |
| Consulta manual, sin ingesta | 8 | Boston Scientific (16 y 17), EMA (59 y 60, validación humana), Scopus (115), Synapse (117), Embase (119), IHSI (123) |
| Información general o metodológica | 18 | Referencia sin ingesta |

Simulación sobre la copia de la base local (124 fuentes, 1.126 señales): se crearon 141 fuentes EH, se retiraron las 124 anteriores como legacy, no se borró ninguna señal y 1.094 señales pendientes pasaron a la bandeja Legacy. Una segunda pasada no cambió nada, y una señal recuperada no volvió a Legacy.

**Qué se cambió:**
- Módulo nuevo `backend/app/link_matrix.py`: lectura del formato por enlace, validación (URL repetida o inválida, ID repetido, tipo de tecnología no reconocido), construcción de cada fuente, vista previa de la carga, aplicación al inventario con retiro legacy y bandeja Legacy.
- `backend/app/data/matriz_enlaces_eh.json`: la matriz empaquetada. Al arrancar, el servidor sincroniza el inventario con ella (`catalog_service.sync_catalog`); la primera vez reemplaza el inventario anterior y después solo actualiza, respetando lo editado por el equipo.
- `backend/app/source_matrix.py`: reconoce el formato por enlace en la primera hoja; el catálogo D-06 queda como referencia y lee la matriz anterior.
- Contexto para la IA (`source_profile.source_context`): organización, tipo de entidad, instrucción de extraer solo lo que corresponde a la página y a "Que consultar", y las observaciones del equipo.
- Migración reversible `0006_technology_legacy.py`: columna `technologies.legacy`. Probada bajando a 0005 y volviendo a subir sobre una copia de la base, sin pérdida de registros.
- Endpoints: `GET /api/technologies/staging?view=legacy`, `POST /api/technologies/staging/recover` (permiso de asignación de la bandeja, bitácora `staging:recover_legacy`), conteo `legacy` en `/api/technologies/staging/stats`. El cargue registra `matrix_links_apply` y, por fuente, `matrix_update`.
- Interfaz: pestaña (Legacy) con (Recuperar) en la Bandeja de entrada; en (Cargar matriz), validación del formato por enlace y lista (Inventario anterior que pasa a legacy).
- Pruebas: `backend/tests/test_matriz_enlaces.py` (21 pruebas) con el Excel recibido como insumo de prueba en `backend/tests/fixtures/`. Las pruebas del catálogo D-06 se mantienen validando ese modo.

**Dónde se ve en el sistema:** (Catálogo de fuentes), con las fuentes EH; (Bandeja de entrada) › pestaña (Legacy); (Catálogo de fuentes) › (Cargar matriz) para las próximas cargas.

**Cómo verificarlo:**
1. Después del despliegue, entre a (Catálogo de fuentes) y confirme que aparecen las fuentes con código EH (141 en total) y ninguna fuente activa del inventario anterior.
2. Abra una fuente, por ejemplo Abbott · Información de tecnologias Innovadoras, y confirme que trae su tipo de material, ruta de acceso e información a consultar.
3. Entre a (Bandeja de entrada) › pestaña (Legacy) y confirme que aparecen las señales del inventario anterior.
4. Recupere una señal con (Recuperar) y confirme que aparece en Pendientes.
5. Ejecute la vigilancia de una fuente EH y revise en (Vigilancia) que se accedió al enlace de la matriz.

**Pendientes y limitaciones:**
- La vigilancia completa recorre 115 fuentes con ingesta (antes 95), así que tardará más en el plan gratuito de Render, que procesa una fuente a la vez.
- Health Canada solo conserva la API de medicamentos, porque la matriz clasifica sus enlaces como MED; la API de dispositivos del catálogo anterior queda sin usar.
- Para las próximas cargas, el ID de cada enlace debe mantenerse estable: es lo que identifica la fuente (EH-ID) y conserva su historial.

---

## Validación integral y funcionamiento sin IA ni OCR (17-11-2026)

**Estado:** CUMPLIDO PARCIAL, 17-11-2026. Verificado en un servidor local con una copia de la base, contra los sitios reales y con la IA y el OCR apagados; falta repetirlo en el sistema desplegado.

**Qué se probó:**
1. Ingreso real con correo y contraseña: la contraseña errada se rechaza (401) y la correcta entra.
2. Primera vigilancia real sobre 12 fuentes del inventario por enlace, sin IA: ClinicalTrials.gov, PubMed, openFDA, EMA y CTIS por API; pipelines de Novartis, AbbVie y Roche; FDA, TGA, Science Daily y Abbott por página web. Todas terminaron sin error.
3. Herramientas sin IA: vista previa de enlace, dictamen de confiabilidad (solo chequeos), clasificación y verificación de enlaces, buscador y recorrido por etapas, asistente IA (respuesta de respaldo con datos del sistema), asistente de navegación (buscador local), barrido de duplicados, bandeja Legacy e informe de acceso.
4. Suites automáticas: backend completo y pruebas de navegador (Playwright).

**Causa raíz de lo que falló y se ajustó:**
- Sin IA, la extracción por reglas guardaba menús ("2024 Device Approvals"), noticias de ciencia general ("NASA… Moon Base") y notas corporativas (patrocinios, adquisiciones). Se agregó un filtro de reglas (`scraper.rules_gate`) que se aplica cuando la IA no decide: descarta menús, tarjetas de navegación, páginas administrativas y textos sin evidencia de tecnología sanitaria en el propio título. Las filas de pipeline se conservan siempre.
- Error previo en la clasificación por tipo: las raíces "therap", "vaccin", "device", "drug" exigían fin de palabra, por lo que "Therapy", "vaccines", "devices" o "drugs" no se reconocían y muchas señales quedaban como "otro". Se corrigieron las expresiones.
- Los nombres generados para las fuentes por enlace usaban la ruta de la URL y desbordaban las tarjetas en pantallas de 390 px. Ahora se arman con el tipo de material recortado por palabras, o con el dominio y el número del enlace; las tarjetas parten textos largos.
- Tres pruebas de navegador estaban desactualizadas frente a cambios ya aprobados (prioridad de fuente retirada por OBS-001 y rótulos legibles de los parámetros). Se actualizaron.
- La versión del sistema decía 7.0.0; se dejó en 7.1.0.

**Resultado de la vigilancia sin IA, antes y después del filtro:** FDA página de dispositivos de 12 a 2 señales (los 10 descartados eran menús); TGA de 40 a 4; Science Daily de 32 a 13 (solo noticias de salud con tecnología); AbbVie de 26 a 19; Abbott de 2 a 0 (eran páginas corporativas). Las API y los pipelines no cambiaron.

**Pendientes y limitaciones:**
- Páginas que cargan su contenido con JavaScript (por ejemplo el pipeline de Roche) no entregan datos sin navegador: quedan con pocas o ninguna señal y conviene revisarlas con IA activa o por consulta manual.
- Sin OCR no se leen PDF escaneados como imagen.
- La calidad sin IA es menor que con IA: el filtro reduce el ruido, pero la clasificación fina (fase, horizonte, área) es mejor con IA.

---

## Primera vigilancia completa del inventario por enlace (17-11-2026)

**Estado:** CUMPLIDO PARCIAL, 17-11-2026. Corrida completa en un servidor local aislado contra los sitios reales, con la IA y el OCR apagados; falta la primera corrida en el sistema desplegado.

**Resultado final:** las 115 fuentes con ingesta terminaron, ninguna con error, en 15 minutos con 3 fuentes a la vez (en Render, que procesa una a la vez, se estima del orden de 45 minutos). 930 señales nuevas: 65 fuentes entraron directo y trajeron señales, 28 entraron por respaldo (RSS oficial o Google News) porque el sitio bloquea robots (HTTP 403) o no responde desde fuera de su país, y 22 entraron sin señales.

**Qué se corrigió durante la corrida:**
- ICTRP de la OMS quedaba en error: no tiene API pública estable y había heredado el adaptador de API. Ahora se rastrea como página web y trae señales.
- Sin IA, las páginas internas que visita el rastreo no se convertían en señales. Ahora cada página visitada es candidata, con su URL exacta, y pasa por el filtro de reglas; para estas páginas se exige un producto concreto (código, DCI, forma farmacéutica, marca) o un hecho regulatorio o clínico, para no guardar páginas institucionales.
- Todas las fuentes de fabricantes se trataban como tablas de pipeline y no se recorrían. Ahora solo se tratan como tabla si la página trae filas de pipeline reconocibles; las páginas de innovación, portafolio y noticias se recorren.
- Ajustes del filtro con títulos reales: anclas de imagen médica y dispositivos (CT, ultrasonido, monitores, stents), avisos administrativos de los registros y guías regulatorias solo al inicio del título.

**Fuentes que bloquean robots:** no se intentó saltar la protección del sitio. Entran por la ruta legítima de respaldo y quedan marcadas como parciales en el informe de acceso.

**Pendientes y limitaciones:** las 22 fuentes sin señales sin IA son sitios que cargan con JavaScript o solo ofrecen un formulario de búsqueda (Amgen, EUDAMED, DRKS, CRiS, PACTR, PATENTSCOPE, IEEE, Medtronic) o páginas institucionales sin productos nombrados (Philips, Roche, Abbott, IQWiG, RedETS). Con la IA activa, la IA lee esas páginas; si siguen sin señales conviene pasarlas a consulta manual.

---

## Vigilancia más rápida y estable en Render (24-11-2026)

**Problema reportado:** en el sitio desplegado la vigilancia llegaba a cerca del 60 % y se rompía, y tardaba demasiado.

**Qué se midió:** corrida completa local de las 115 fuentes con una fuente a la vez (como Render), IA y OCR apagados, Firestore apagado. Localmente no se rompía, pero consumía 467 s de CPU: en Render (0,1 CPU) eso solo son unos 78 minutos de cómputo, y la CPU por minuto crecía a lo largo de la corrida.

**Causa principal del consumo:** cada descarga creaba un cliente HTTP nuevo con su propio contexto TLS; cargar las raíces de certificados cuesta ~0,2 s de CPU por página (en Render ~2 s) y no se reutilizaban conexiones. Era la mitad de la CPU de la vigilancia.

**Cambios:**
- Un solo contexto TLS por proceso y un pool de conexiones compartido (`ingest/base.py`); también en la búsqueda web, la sonda, la verificación de enlaces y las imágenes de la IA.
- Las páginas internas de cada fuente (entradas de la matriz, resultados de búsqueda, fichas) se descargan de a 4 a la vez; el análisis sigue en orden en el hilo de la fuente.
- Una página interna caída se reintenta 1 vez (antes hasta 3 veces con 15 s cada una). La URL principal conserva sus reintentos.
- Tras cada fuente se libera memoria (`gc` y `malloc_trim` en Linux) y la imagen fija `MALLOC_ARENA_MAX=2`, para que el proceso no crezca fuente a fuente hasta pasar los 512 MB de Render.
- Un job interrumpido por un reinicio vuelve al final de la cola, no al principio: si una fuente tumba el proceso, ya no lo vuelve a tumbar en bucle y la corrida sigue hasta el 100 %.
- Corregido un desempaque erróneo en `crawl_site` cuando no se le pasa el HTML de entrada.

**Resultado (misma máquina, mismas 115 fuentes):** de 37 a 20 minutos y de 467 a 127 s de CPU (−73 %), 115 de 115 terminadas, 0 errores, 935 señales (936 antes; la diferencia es variación de los sitios).

**Pendiente:** confirmar en Render con una corrida completa; si vuelve a detenerse, revisar en los registros de Render si hubo reinicio por memoria ("Out of memory") o por la verificación de salud.
