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

---

## Pendientes del Módulo 0 (24-11-2026)

**Estado:** CUMPLIDO PARCIAL, 24-11-2026. Implementado, con pruebas automáticas (backend y navegador) y verificado contra los sitios reales sobre una copia local de la base de la vigilancia del 24-11-2026 (141 fuentes, 935 señales). Falta verificarlo en el sistema desplegado.

### 1. RF-001: que el enlace lleve a la señal exacta

**Qué se hizo.** Módulo nuevo `backend/app/link_resolver.py`. Para cada señal en «página de consulta»:
1. Busca en la página un enlace cuyo texto sea el nombre de la señal, o la URL del producto declarada en los datos estructurados (JSON-LD). Si la encuentra, la señal pasa a **enlace exacto** y la URL anterior queda en `evidence.resolved.previous_url`. Si dos fichas distintas tienen el mismo nombre, desempata por el contexto (indicación o fase); si no puede, no adivina.
2. Si la fuente no tiene enlace por ítem (tablas de pipeline) y el nombre está en la página, guarda en `evidence.locator_url` un enlace con fragmento de texto (`#:~:text=`). Ese enlace abre la página y el navegador resalta la señal.
3. Si no la encuentra, lo dice (`evidence.resolved.reason`) y conserva la evidencia de captura.

Corre en la captura, sin descargas extra (usa el HTML que el rastreo ya tiene), y a demanda con (Ubicar señales exactas) en segundo plano. El **Diagnóstico para la matriz** dice por fuente si el equipo técnico debe mejorar la URL (portada, buscador, URL caída o contenido que carga con JavaScript) o si la fuente no ofrece enlace por ítem. Endpoints: `POST /api/findings/links/resolve`, `GET /api/findings/links/resolve/state`, `GET /api/findings/links/diagnosis` y `GET /api/findings/links/diagnosis.xlsx`.

**Resultado sobre las 935 señales reales:** de las 178 en página de consulta, 25 pasaron a enlace exacto, 148 abren la página resaltando la señal y 5 quedan sin ubicar. En total, 930 de 935 llevan a la señal exacta o al punto de la página donde está. Las 20 de Novartis entran con la URL propia de cada producto e indicación (p. ej. `…/novartis-pipeline#AAA601-GEPNETpediatrics`). Se verificó también en una captura real de Novartis, AstraZeneca y Merck.

**Fuentes en las que conviene mejorar la matriz** (diagnóstico más sondas):
- **Reuters Salud** (`reutershealth.com`): el sitio ya no publica (HTTP 401 y nada en Google News). Hay que registrar una URL vigente o retirar la fuente.
- **CTRI India**: rechaza la conexión desde fuera de la India. Hay que validar desde Render; si sigue igual, pasarla a consulta manual.
- **AIFA** (dos enlaces con ruta `#/…`) y **Boehringer Ingelheim**: la página carga su contenido con JavaScript y la señal no se puede ubicar. Hay que registrar una URL más específica (listado, RSS o descarga) o pasarlas a consulta manual.

### 2. Sondas de las 141 fuentes

**Qué se hizo.** «Sondear A/B» corría dentro de la petición y solo probaba 7 fuentes. Ahora **Sondear todas** corre en segundo plano, de a seis fuentes a la vez, y la pantalla muestra el avance (`POST /api/ingest/probe/run`, `GET /api/ingest/probe/status`). El **Informe de sondas (Excel)** (`GET /api/ingest/probe/report.xlsx`) lista cada fuente con su estado, el detalle y la acción sugerida, con las rojas primero.

**Resultado (corrida real, 24-11-2026):** 141 fuentes en 68 segundos. 139 verdes y 2 rojas (CTRI y Reuters, ver arriba). Entre las verdes, 24 bloquean robots (HTTP 403) y 7 no respondieron en su portada; todas entran por su ruta de respaldo oficial.

### 3. Fuentes tipo E por validar

**Qué se hizo.** Módulo `backend/app/manual_review.py`: lista las fuentes E activas y marca como «por validar» las que nunca se validaron o cuya fecha de próxima revisión (`sources.next_review_due`) ya llegó. La frecuencia sale de la matriz (semanal). Registrar una validación (resultado, nota y señales registradas) fija la próxima revisión y deja la constancia en la bitácora (acción `manual_review`). No se creó ninguna tabla. Se ve en cuatro lugares:
- un aviso al entrar, una vez por sesión, que no se apila con la guía de bienvenida;
- un contador junto a «Bandeja de entrada» en el menú;
- un aviso amarillo en la Bandeja de entrada con la ventana de validación;
- la tarjeta «Fuentes tipo E por validar» en la Bandeja de trabajo del superadministrador y del evaluador técnico.

Desde la ventana se registran las señales encontradas (`POST /api/findings`, que ahora valida tipo, horizonte y título). Inventario actual: 8 fuentes E (Boston Scientific ×2, EMA ×2, Scopus, Synapse, Embase, IHSI).

### 4. Catálogo en Excel

`GET /api/sources/export.xlsx` (botón «Descargar Excel»). El libro trae estas hojas:
- **Fuentes:** filtros, panel fijo, hipervínculos, estado de la sonda y señales capturadas;
- **Consulta manual (tipo E);**
- **Resumen:** conteos por nivel de acceso, nivel de fuente, tipo de tecnología, adaptador y salud;
- **Retiradas;**
- **Información.**

Las celdas que empiezan por `=`, `+`, `-` o `@` se escriben como texto, para evitar inyección de fórmulas. El CSV sigue disponible. El generador compartido está en `backend/app/xlsx_report.py`.

### 5. RF-02-F: cruce de postulaciones con la búsqueda proactiva y la web

**Qué se hizo.** Módulo `backend/app/submission_crosscheck.py` y migración reversible `0007` (`submissions.cross_check`). Al llegar, cada postulación se cruza con la vigilancia de inmediato; la parte web se completa en segundo plano. El evaluador puede repetir el cruce (`POST /api/submissions/{id}/cross-check`). Lo que vio queda guardado con la tecnología al aceptarla.
- **Vigilancia:** usa el comparador del filtrado y una regla de nombre contenido («Lutathera» en «Lutathera (AAA601)»; una palabra genérica sola no cuenta). Cada coincidencia trae el enlace a la señal exacta.
- **Registros oficiales por API:** ClinicalTrials.gov, FDA (Drugs@FDA y 510k) y PubMed.
- **Web:** solo se muestran los resultados de los buscadores que mencionan la tecnología.

**Por qué los registros oficiales:** en la prueba real, Yahoo y DuckDuckGo bloquearon y **Bing devolvió resultados ajenos, incluso contenido para adultos**, ante consultas que no reconocía. El filtro de pertinencia los descarta todos y la interfaz informa cuántos descartó.

**Resultado real:**
- «Lutathera» (Novartis) coincide con sus 2 señales del pipeline de Novartis, con enlace exacto. En los registros trae 3 ensayos de ClinicalTrials.gov, la ficha LUTATHERA NDA208700 de la FDA y artículos de PubMed.
- «Zilovertamab vedotin» coincide con la señal del pipeline de Merck y trae 3 ensayos de ClinicalTrials.gov.

### Cómo se verificó

- Backend: 29 pruebas nuevas en `backend/tests/test_modulo0_pendientes.py`. Suite completa en verde.
- Navegador: `frontend/e2e/modulo0_pendientes.spec.js` (aviso de entrada y validación de una fuente E, descargas en Excel, diagnóstico de enlaces y cruce de postulaciones). Se ajustó `onboarding.spec.js` porque el aviso aparece al cerrar la guía. Suite E2E completa en verde.
- Corridas reales contra los sitios sobre una copia local de la base, con Firestore apagado. No se tocó la base de producción.

### Pendientes y limitaciones

- Verificar en el sistema desplegado: Sondear todas, Ubicar señales exactas y una postulación de prueba.
- El resaltado de la señal depende del navegador: funciona en Chrome, Edge, Safari y Firefox recientes. En los demás abre la página sin resaltar.
- Sin IA, algunas «señales» de pipelines y portafolios son texto de la página y no productos (p. ej. «Identify and monitor side effects» en Merck). El enlace las ubica bien; el ruido es del filtro de captura y conviene revisarlo aparte.

---

## Auditoría del Módulo 0 (24-11-2026)

**Estado:** CUMPLIDO PARCIAL, 24-11-2026. Auditoría sobre el código que va en el PR de `develop` a `main`, con corridas reales contra los sitios en una copia local (Firestore apagado). Falta la verificación en el sistema desplegado.

**Qué se revisó:** vigilancia completa, sondas, enlaces, bandeja, fuentes tipo E, postulaciones, exportaciones, permisos de los endpoints nuevos, migración y concurrencia (sondeo de las 141 fuentes mientras corre la vigilancia: sin bloqueos de base ni errores).

### Hallazgos y correcciones

**1. Ruido en la captura sin IA (precisión).** De las 645 señales web de la corrida, 255 no eran tecnologías:
- menús desplegables (Swissmedic, MFDS);
- advertencias de seguridad de un dispositivo (Abbott, 46);
- leyendas y controles de tablas (Merck);
- páginas índice («2026 Biological Approvals»);
- ofertas de empleo (Bayer, por el respaldo de Google News);
- títulos del propio sitio (NEJM);
- noticias corporativas, jurídicas o políticas;
- páginas educativas, eventos y webinars.

Se agregaron reglas a `scraper.py`, cada una con su caso real en el comentario y en las pruebas: `never_a_signal` (también aplica a filas de pipeline), `is_prose`, `is_menu_dump`, `_INDEX_PAGE`, `_JOB_AD`, `_EVENT_PAGE`, `_ADVERSE_BULLET`, `_EDUCATIONAL` y ampliaciones de `_CORPORATE`, `_ADMIN_PAGE` y de las palabras genéricas. El criterio quedó en una sola función, `capture_noise_reason`, que usan la captura y la depuración.

**2. La misma señal repetida por varios enlaces de una organización.** Con el inventario por enlace, BD traía la misma lista de noticias en sus tres fuentes y Abbott en dos. Ahora, al guardar, si el mismo ítem (mismo título y misma URL) ya entró por otra fuente del mismo dominio, no se repite (`sibling_source_ids`).

**3. Corroboración inflada.** «En varias fuentes» contaba cada enlace como una fuente: dos páginas de la FDA con la misma tecnología sumaban como dos fuentes y daban bono de orden. Ahora el origen es la organización (`corroboration.org_host`: `accessdata.fda.gov` y `www.fda.gov` son `fda.gov`). El cálculo se rehace solo en la siguiente consulta de la bandeja.

**4. Health Canada traía productos de consumo.** El registro DPD clasifica como medicamento los protectores solares, enjuagues y antigripales de venta libre («COOLA ANTI-AGING HAND CREAM», «DAYQUIL»). Se filtran por principio activo (`is_consumer_product`): si todos los activos son de consumo o de venta libre, no entra. Con la API real, de 47 productos quedaron 35, todos medicamentos de prescripción o biológicos.

**5. El ruido que ya estaba en la bandeja.** Las reglas nuevas solo actúan sobre capturas futuras. Se agregó `reprocess_noise` (`POST /api/ingest/reprocess?target=ruido`, sin `apply` simula) y el botón **Depurar ruido** en la Bandeja de entrada, visible para quien administra la configuración. Pasa a Descartadas, con motivo y bitácora, lo que hoy no entraría: ruido, repetidas y productos de consumo. No borra nada y se puede restaurar. No entra en `target=all`.

**6. Costo del cruce de postulaciones.** Comparar contra todo el acervo dentro de la petición del formulario público costaba 0,28 s de CPU con 939 tecnologías (unos 3 s en Render, y crecía con la base). Un prefiltro por nombre y NCT deja solo las candidatas; el resultado es idéntico al exhaustivo (240 casos, 0 diferencias) y cinco veces más rápido. Además, el cruce ahora reconoce el NCT que la persona cita en sus enlaces de evidencia.

### Resultado medido

Vigilancia completa real con el código final (115 fuentes, una a la vez, sin IA), comparada con la del mismo día antes de la auditoría:

| | Antes | Después |
|---|---|---|
| Fuentes terminadas / con error | 115 / 0 | 115 / 0 |
| Tiempo total | 20 min | 20,5 min |
| Señales capturadas | 935 | 651 |
| Señales web que eran ruido | 255 de 645 | 15 de 375 (casos de Swissmedic y Bayer cubiertos por el último ajuste de reglas) |
| Mismo ítem repetido entre fuentes de una organización | 27 | 0 |
| Señales marcadas «en varias fuentes» | 184 | 14 (organizaciones distintas) |
| Con enlace exacto o que abren y resaltan la señal | 930 de 935 | 648 de 651 |

Sondeo de las 141 fuentes lanzado mientras corría la vigilancia: terminó sin bloqueos de base ni errores (139 verdes, 2 rojas). Sobre la base anterior, **Depurar ruido** retira 301 de 935 señales (ruido, repetidas y productos de venta libre) y una segunda pasada no cambia nada.

**Pruebas:** backend 825 aprobadas (103 del Módulo 0, con 51 títulos reales de ruido que ya no entran y 18 señales reales que siguen entrando); navegador 101 de 101; integración continua de GitHub en verde para el commit anterior (pytest, Alembic, PostgreSQL 15, imagen Docker, frontend y prueba de humo).

### Cómo aplicarlo en el sistema desplegado

1. Después del despliegue, en **Bandeja de entrada** pulse **Depurar ruido**, revise la lista y confirme.
2. Corra una vigilancia completa: las fuentes de una misma organización ya no repiten señales y el ruido no vuelve a entrar.
3. El indicador «En varias fuentes» se recalcula solo al abrir la bandeja.

### Pendientes y limitaciones

- El filtro sin IA es de reglas: prioriza no dejar entrar ruido. Puede perder algún titular legítimo redactado como pregunta o como frase larga sin nombre de producto. Con la IA activa, la IA decide.
- Quedan señales de calidad media que no son ruido claro, como artículos de divulgación de noticias generales. Decidir si se conservan es criterio metodológico del equipo técnico.

## Protección de datos y cierre de pendientes (24-11-2026, versión 7.2.0)

**Estado:** CUMPLIDO PARCIAL, 24-11-2026. Todo está probado en local (suite de backend, suite de navegador y arranque real sobre una copia de la base). Falta la verificación en el sistema desplegado, que solo se puede hacer después del despliegue.

**Qué se pidió:** que ningún cambio ni despliegue pueda borrar o dañar datos, cerrar lo que estaba a medias y comparar lo no tocado con los requerimientos de la raíz del repositorio.

**Cómo se hizo:** dos auditorías de solo lectura sobre todo el código (pérdida de datos, y requerimientos contra código), verificación de cada hallazgo leyendo el código y con una prueba que lo reproduce, y corrección.

### 1. Riesgos de pérdida de datos encontrados y corregidos

**1.1 Una migración podía borrar las señales en cascada.** En SQLite, quitar o cambiar una columna reconstruye la tabla (copia y `DROP`). El arranque migraba con las llaves foráneas activas, así que reconstruir `sources` habría borrado en cascada todas las señales, y reconstruir `technologies` o `cycles`, los puntajes y evaluaciones. Hoy ninguna revisión (0001 a 0007) reconstruye tablas, por eso no había pasado, pero la siguiente revisión que quitara una columna lo habría hecho en producción, y el ensayo por línea de comandos (`alembic -x url=...`) no lo detecta porque corre sin ese ajuste. Ahora `migrations.schema_change_connection` migra con las llaves apagadas en esa conexión, comprueba al final que no quedaron referencias rotas y vuelve a activarlas. La prueba `test_rebuilding_a_table_with_foreign_keys_on_deletes_its_children` deja demostrado el riesgo y `test_schema_change_connection_keeps_the_children`, la protección.

**1.2 Solo había una copia anterior y se pisaba en el arranque.** Firestore guardaba la copia vigente y la anterior. Cada arranque sube hasta tres copias en un minuto, así que un despliegue que dañara los datos restauraba la copia buena, la dañaba y borraba la buena antes de que alguien lo notara. Ahora hay **puntos de recuperación** que las copias siguientes no borran (`firebase_db.py`):

| Punto | Cuándo se fija | Cuántos se guardan |
|---|---|---|
| Antes de un despliegue | La primera copia que hace una versión nueva del código fija la última de la versión anterior | 5 |
| Cierre del día | La primera copia de un día fija la última del día anterior | 7 |
| Otra instancia | Al subir, la nube trae una copia que este proceso no conocía (dos instancias durante un redespliegue) | 3 |
| Antes de una restauración | Estado previo a cualquier restauración manual | 3 |
| Fijada a mano | Botón del panel | 3 |

El cupo es por motivo: las copias diarias nunca desplazan a la previa al despliegue. Se ven y se restauran en **Configuración → Copia de respaldo → Puntos de recuperación**. Cada copia guarda la versión del código que la hizo (`RENDER_GIT_COMMIT`) y el conteo de sus tablas principales.

**1.3 Una base con menos datos podía pisar la copia buena.** La única guarda era el tamaño (menos del 50 %). Ahora cada copia lleva el conteo de sus tablas y la subida se bloquea si la bitácora local tiene menos registros que la guardada (la bitácora solo crece: si tiene menos, esa base no desciende de la copia) o si señales, tecnologías, fuentes, usuarios, postulaciones o notas caen a menos de la mitad. El bloqueo se ve en el panel y en `/api/health`. Si el superadministrador confirma que la base del servidor es la correcta, **Publicar de todos modos** la sube y deja la copia guardada como punto de recuperación (`backup:push_override` en la bitácora).

**1.4 Dos instancias a la vez.** En un redespliegue la instancia nueva puede arrancar mientras la vieja sigue atendiendo, y su primera copia pisaba la última de la vieja. No se pueden fusionar dos bases, pero ahora esa copia ajena queda fijada como punto de recuperación en lugar de perderse. En ese caso la guarda por conteos no bloquea: la copia ajena puede traer más bitácora sin que la base local haya perdido nada, y bloquear dejaría a la instancia nueva sin poder guardar. Además, al apagar, primero se detiene la vigilancia y después se hace la copia final.

**1.5 En qué base de Firestore viven los datos.** El arranque prefería la base nombrada `hs-iets` y, si lograba crearla, empezaba a trabajar en una base vacía dejando los datos reales huérfanos en `(default)`. Ahora, si la base nombrada no tiene copia y `(default)` sí, se usa `(default)`. Y si no se pudo determinar la base (fallo de red al arrancar), no se lee ni se sube nada: antes una base inexistente respondía «sin datos» y el sistema quedaba operando vacío.

**1.6 Restaurar reemplazaba toda la base sin dejar rastro.** `POST /api/backup/restore?force=true` no quedaba en la bitácora ni guardaba el estado previo. Ahora, antes de reemplazar, el estado actual se sube y queda fijado; la acción queda en la bitácora de la base vigente (`backup:restore`, `backup:restore_checkpoint`, `backup:pin`).

**1.7 Lo escrito después de una restauración se daba por inexistente.** «Sin cambios desde la restauración» se medía con un contador que solo algunas pantallas incrementan (no lo hacen usuarios, configuración ni postulaciones). Una restauración posterior podía descartar esos cambios, y era la causa de que la contraseña de `BOOTSTRAP_ADMIN_PASSWORD` a veces se aplicara y a veces no. Ahora también se mira la bitácora, que registra todas las escrituras.

**1.8 La matriz cargada desde la interfaz se revertía al reiniciar.** El JSON de la matriz se escribía en el disco del servicio, que en Render es efímero. Tras el siguiente reinicio el arranque sincronizaba con la matriz de la imagen y revertía el inventario sin aviso. Ahora la matriz cargada se guarda también en la base (`matrix_store.py`) y el arranque la repone en disco antes de sincronizar. Si un despliegue trae una matriz nueva en la imagen, gana la de la imagen y queda aviso en el registro.

**1.9 El arranque pisaba ediciones del equipo sobre las fuentes.** Solo se protegían los campos de la matriz (nivel, tipos, URL de entrada...). El nombre, la URL, «ingesta activa», la frecuencia, la descripción y las etiquetas volvían al valor de la matriz en cada reinicio. Ahora cualquier campo que una persona cambie en el panel queda marcado y la sincronización no lo toca; solo lo pisa la reimportación con «Sobrescribir lo editado». Tampoco se reactiva una fuente que el equipo sacó del catálogo ni una que la sonda suspendió por fallar.

**1.10 La siembra de ciclos oficiales en el servicio desplegado.** La siembra reconstruye ciclos y solo estaba apagada con `ENVIRONMENT=production`. El servicio de Render trabaja sobre los datos reales aunque corra en `development`, así que ahora también se apaga cuando `RENDER=true`. `SEED_OFFICIAL_CYCLES=true` la vuelve a activar a propósito.

**1.11 Carga de matriz por la API.** `POST /api/sources/matrix/import` pisaba lo editado por defecto. Ahora hay que pedirlo (`overwrite=true`); la interfaz ya lo enviaba de forma explícita.

### 2. Pendientes funcionales cerrados

- **RF20, alerta por cambio de fase.** La alerta «cambio de fase» solo miraba el estado del flujo. Ahora también avisa cuando cambia la fase clínica real de una tecnología de alto riesgo presupuestal (`clinical_phase_change_high_budget`), incluso si el cambio llega por la vigilancia en un registro ya capturado: antes la ingesta ignoraba la fase nueva de un registro ya visto. Conocer la fase por primera vez no cuenta como cambio.
- **RF19, distribución del boletín.** El boletín publicado se envía a la alta dirección con el PDF adjunto (**Boletines → Enviar a la alta dirección**). La lista de destinatarios se recuerda; cada envío queda en el boletín y en la bitácora; un correo rechazado se informa sin ocultar los que sí salieron. Requiere SMTP configurado; sin él, la interfaz lo dice y ofrece descargar el PDF.
- **RF18, buscador avanzado de expedientes.** La consulta pública filtra por clúster, tipo de tecnología, fase de desarrollo y año de publicación, busca también por indicación y pagina los resultados. Solo ofrece opciones con al menos una ficha visible, de modo que no revela publicaciones confidenciales.
- **Notas del equipo.** Una respuesta tardía del servidor podía dejar en pantalla el contenido anterior de una nota recién editada. Solo se aplica la respuesta de la última consulta.
- **Bandeja de entrada.** Error 500 con una base recién creada: dos peticiones simultáneas recalculaban «en varias fuentes» a la vez. Ahora hay un solo cálculo a la vez.
- **Textos de la interfaz.** Sin rayas largas: se usan guiones normales.

### 3. Lo que no se cambió y por qué

Requiere decisión del equipo o infraestructura que no depende del código:

| Tema | Situación | Qué se necesita |
|---|---|---|
| RNF12, acceso de desarrollo en el servicio desplegado | La imagen (`Dockerfile`) fija `ENVIRONMENT=production` y `ALLOW_DEV_LOGIN=false`. Si el panel de Render los cambia a `development`, el acceso sin contraseña queda abierto a cualquier correo del dominio | Confirmar en el panel de Render y, si el equipo aún entra por acceso de desarrollo, crear antes las cuentas con contraseña (`BOOTSTRAP_ADMIN_*`) |
| RNF04, disponibilidad 99,5 % | Plan gratuito de Render con disco efímero | Plan de pago con disco persistente o PostgreSQL |
| RNF03, cifrado AES-256 en reposo | No implementado; la copia en Firestore va comprimida, no cifrada | Definir manejo de llaves |
| RNF06, API OAuth2 para EuroScan, NIHRIO y CONETEC | No implementado | Convenio y alcance con cada entidad |
| RNF07, PostgreSQL con pgvector | El código es agnóstico del motor; el despliegue usa SQLite | Base PostgreSQL |
| RF11, normas farmacológicas y carga del acta de Sala en PDF | Solo índice local y consulta en vivo de registros | Fuente oficial de normas y formato del acta |
| RF13, editor enriquecido con comentarios en línea | Formulario estructurado con comentarios por campo | Decisión de alcance |
| RF-006, criterios inactivos (implantables, equipos biomédicos, monitoreo) | Sin cambio | Decisión del equipo técnico |
| Apagado en Render | La copia final puede no caber en los 30 s que da la plataforma | Evaluar `maxShutdownDelaySeconds` en el servicio |
| Normalización ATC, CIE-10, MeSH y GMDN | El backend valida y normaliza; no hay pantalla para capturarlos | Diseño de la pantalla con el equipo técnico |

El documento `Consolidado de observaciones SI EAA MOD 0.xlsx` es del equipo técnico y no se modificó. Tiene tres datos desactualizados frente al sistema: OBS-001 figura cumplida con «Prioridad sugerida» y esa función se retiró; cita los botones «Sondear A/B» y «Correr ahora», que hoy se llaman «Sondear todas» y «Ejecutar ahora»; y describe 11 categorías de búsqueda activas, cuando por RF-006 quedan 2.

### 4. Pruebas

- **Backend:** 871 aprobadas y 1 omitida. 46 son nuevas: 34 de protección de datos (`test_proteccion_datos.py`), 5 de RF20 (`test_rf20_cambio_de_fase.py`), 5 de RF19 y 2 de RF18.
- **Verificación real sobre una copia de la base** (651 señales, 656 tecnologías, 141 fuentes), con el almacén de Firestore simulado en memoria y sin tocar la red:
  - dos arranques completos seguidos no pierden ni una fila y conservan una fuente editada por el equipo;
  - una base a la que se le borran todas las señales no logra sobrescribir la copia buena;
  - la copia previa al «despliegue» sobrevive a las subidas siguientes y, al restaurarla, vuelven las 651 señales con la base íntegra (`integrity_check` y `foreign_key_check` en orden).
- **Navegador (E2E):** 103 aprobadas y 1 omitida, con el código final y el frontend recién compilado (25-11-2026). Incluye las pruebas nuevas de puntos de recuperación (`backup_recovery.spec.js`), el envío del boletín y el buscador público. La omitida es `dashboards_tablero.spec.js` (mapa de calor presupuestal): se salta sola cuando la base de pruebas, que arranca vacía, no tiene ningún ciclo con montos presupuestales; no es un fallo ni cambió en esta entrega.

### 5. Al desplegar

1. No hay migración de esquema nueva: el arranque no cambia tablas.
2. La primera copia después del despliegue fija sola la última copia de la versión anterior («Antes de un despliegue»). Compruébelo en **Configuración → Copia de respaldo**.
3. Si algo se ve mal después de desplegar, restaure ese punto desde el mismo panel (pide escribir RESTAURAR). El estado dañado queda guardado, así que se puede deshacer.
4. Las copias anteriores a esta versión no traen conteos: la guarda por conteos empieza a actuar desde la segunda copia.
