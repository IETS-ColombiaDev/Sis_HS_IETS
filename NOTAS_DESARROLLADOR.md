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

---

## Vigilancia que se reanuda sola y búsqueda sin buscadores bloqueados (25-11-2026, versión 7.3.0)

**Estado:** CUMPLIDO PARCIAL, 25-11-2026. Probado en local (suite de backend, suite de navegador y búsqueda real contra los sitios de las fuentes). Falta la verificación en el sistema desplegado, que solo se puede hacer después del despliegue.

Responde a tres observaciones del equipo sobre el sistema en Render.

### 1. La vigilancia quedó «en curso» 186 horas

**Causa.** En Render solo corre el proceso web y el trabajador regular está apagado (la imagen trae `INGEST_WORKER_ENABLED=false`). La cola la atendía únicamente el hilo que lanzó la corrida. Cuando el servicio se reinició o se suspendió, ese hilo murió: los trabajos quedaron pendientes sin nadie que los tomara, y el servicio tampoco se mantenía despierto porque el aviso de actividad (keep-alive) solo arrancaba junto con el trabajador regular.

**Corrección** (`worker.py`):

- **Vigilante de la cola** (`start_guardian`, `guardian_tick`). Un hilo liviano revisa cada minuto. Si hay trabajo vencido y nadie lo atiende, devuelve a la cola lo que quedó a medias y relanza el drenaje. La primera revisión ocurre 10 segundos después de arrancar, así que tras un reinicio la vigilancia sigue sola.
- El vigilante también hace el keep-alive cada 4 minutos mientras haya cola, con o sin trabajador regular.
- El propio drenaje devuelve a la cola los trabajos huérfanos (antes solo lo hacía el trabajador regular).
- Corre donde este proceso es el único que puede atender la cola: SQLite con un solo proceso (Render y equipos locales). Con PostgreSQL y varios procesos web no corre, porque allí la cola es del servicio `worker`. `INGEST_GUARDIAN=true|false` lo fuerza o lo apaga. Nunca corre dentro de las pruebas unitarias.
- La pantalla de vigilancia ya no dice «el worker regular no está en marcha»: explica que la cola la cuida el vigilante y que se reanuda sola.

**Lo que no cambia.** El vigilante no es un trabajador permanente: no lanza vigilancias programadas. Eso sigue siendo del trabajador regular, que en Render está apagado. Encenderlo es cuestión de dos variables en el panel (`INGEST_WORKER_ENABLED=true` e `INGEST_WORKER_FORCE=true`), pero implica vigilancias automáticas cada 6 horas con consumo de IA: es decisión del equipo. El servicio `worker` aparte sigue siendo la mejora prevista para cuando haya un plan de pago.

### 2. La búsqueda web traía 0 resultados y cada fuente perdía cerca de un minuto

**Causa medida.** Los buscadores gratuitos bloquean las consultas automáticas. Medido el 25-11-2026 desde un equipo de oficina (no desde la nube): DuckDuckGo respondió HTTP 202 (desafío) en todas las consultas, Bing ignoró `site:` y devolvió páginas ajenas, y Yahoo respondió bien las primeras consultas y luego HTTP 500. El minuto por fuente salía de sumar la redacción de consultas con IA (hasta 40 s) y la espera de motores que no contestaban, que se repetía en cada consulta porque un fallo de red no pausaba el motor.

**Corrección** (`web_search.py`, `search_knowledge.py`, `sitemap_search.py`):

- **Base de conocimiento de búsqueda** (tabla `search_knowledge`, migración `0008`). Guarda las páginas útiles de cada fuente. La vigilancia las visita sin consultar ningún buscador. No pertenece a un ciclo: la usan todas las corridas y todos los ciclos, y como vive en la base del sistema se respalda en Firestore y sobrevive a los reinicios.
- **Aprende sola.** Cada visita anota si la página aportó señales. La que no aporta en 2 visitas deja de visitarse y se vuelve a probar a los 45 días. Las que ya aportaron van primero.
- **Mapa del sitio como respaldo.** Si los buscadores no alcanzan, el sistema lee el `sitemap.xml` de la propia fuente (o el que declare su `robots.txt`) y elige las páginas por las palabras de la consulta y por lo recientes que son. Es una consulta a la fuente, no a un buscador: funciona desde la nube y no requiere llave. Lo que encuentra queda en la base.
- **Sin esperas inútiles.** Con páginas recientes en la base (30 días por defecto) no se consulta ningún buscador ni se le pide a la IA redactar consultas. Si todos los motores están en pausa, se salta la búsqueda en vivo de inmediato. Dos fallos de red seguidos pausan el motor. Tras 4 bloqueos seguidos la pausa pasa a 3 horas. Hay un tope de tiempo de búsqueda por fuente (45 s).
- **Paquete inicial.** `backend/app/data/base_busqueda_eh.json` viaja con el código y se carga solo al arrancar (una vez por versión del archivo). Se armó con `backend/scripts/build_search_knowledge.py`, que busca dentro del dominio de cada fuente, abre cada página y cuenta las señales que saca el extractor por reglas: 366 páginas de 47 sitios, 149 de ellas con señales (469 señales contadas). 326 salieron de los mapas de sitio y 40 de una búsqueda web asistida para fuentes sin mapa útil. De las 115 fuentes con ingesta activa, 83 tienen la búsqueda web encendida; sus sitios quedan marcados como ya buscados, así que la primera vigilancia no repite la búsqueda.
- **Pantalla.** Configuración › Parámetros de fuentes › Base de conocimiento de búsqueda: totales, consulta por texto, descargar y cargar un paquete. El informe de la vigilancia muestra cuántas fuentes usaron la base.
- **API.** `GET /api/search-knowledge` (cualquier perfil), `GET /api/search-knowledge/coverage`, `GET /api/search-knowledge/export` y `POST /api/search-knowledge/import` (solo quien administra la configuración; la carga queda en bitácora y nunca borra ni baja cuentas).

**Sobre la llave de Brave.** Ya no es necesaria para que la vigilancia funcione. Sigue siendo útil para que el servidor descubra páginas nuevas por su cuenta: si el equipo la crea y la pega en Configuración › Parámetros de fuentes, lo que Brave encuentre también queda en la base. La llave se crea con una cuenta del IETS en el sitio de Brave Search API; no se creó ninguna desde el desarrollo.

### 3. No se encontraban «Ubicar señales exactas» ni «Abrir la página y resaltar la señal»

Los dos botones existían, pero escondidos:

- **(Ubicar señales exactas)** estaba dentro del reporte plegado de Señales capturadas: había que pulsar primero (Reporte de enlaces). Ahora está siempre a la vista en la tarjeta «Enlaces a la fuente original», arriba de la lista de Señales capturadas.
- **(Abrir la página y resaltar la señal)** aparece en el detalle de una señal solo cuando el sistema ya ubicó esa señal dentro de su página. Las señales capturadas antes de esa función no lo tienen hasta que alguien pulsa (Ubicar señales exactas). No depende de que termine la vigilancia.

### 4. Pruebas

- **Backend:** 900 aprobadas y 1 omitida. 29 son nuevas (`test_vigilancia_reanudable_y_base_busqueda.py`): base de conocimiento, paquete, búsqueda por fuente sin buscadores, mapa del sitio, vigilante de la cola y API.
- **Navegador (E2E):** corrida completa con 105 aprobadas, 1 omitida (la del mapa de calor presupuestal, que se salta sola con la base vacía) y 1 fallida. La fallida era una aserción de la prueba nueva `search_knowledge.spec.js`, que esperaba una sola fila y la base ya trae las páginas del paquete; se corrigió y, al repetir ese archivo junto con `modulo0_pendientes.spec.js`, pasaron las 9. No se repitió la corrida completa después de ese ajuste, que solo tocó la prueba.
- **Verificación real** sobre una copia de la base, con Firestore y la IA apagados y los buscadores simulados en bloqueo (HTTP 429): el paso de búsqueda de las 83 fuentes tardó 0,1 s en total, sin una sola consulta a buscadores, y 47 fuentes recibieron páginas de la base. Una cola abandonada hacía 186 horas (un trabajo «ejecutando» y dos pendientes) fue reanudada por el vigilante y quedó atendida en 10 segundos, visitando páginas de la base.
- **Buscadores gratuitos**, medidos desde un equipo de oficina: no son utilizables de forma sostenida (ver punto 2).

### 5. Al desplegar

1. Hay una migración nueva (`0008`): solo crea la tabla `search_knowledge`. No toca ninguna otra.
2. Al arrancar se carga el paquete de la base de búsqueda. Compruébelo en Configuración › Parámetros de fuentes.
3. Si quedó una vigilancia a medias, el vigilante la reanuda sola a los pocos segundos. Si era la corrida atascada, también puede detenerla desde Vigilancia.
4. En la primera vigilancia, revise en el informe la línea «Base de conocimiento de búsqueda» y el tiempo por fuente.

### 6. Pendientes y limitaciones

- El servicio `worker` permanente y las vigilancias programadas en Render siguen pendientes de decisión y de plan de pago.
- El mapa del sitio no cubre todas las fuentes: hay sitios que no lo publican o que lo publican sin páginas relacionadas. Esas fuentes se siguen leyendo por su página principal y sus URL de entrada, como antes.
- El conteo de señales del paquete inicial se hizo con el extractor por reglas, sin IA. Es una estimación para ordenar las páginas; la vigilancia real lo corrige con cada visita.
- El paquete se debe refrescar cada cierto tiempo (el script se puede volver a correr) o complementar con una llave de buscador.

## II seguimiento del Módulo 0: bandeja que no se cae y señal exacta sin botón (25-11-2026, versión 7.3.1)

**Estado:** CUMPLIDO PARCIAL, 25-11-2026. Probado en local (suite de backend, suite de navegador y verificación contra los sitios reales sobre una copia de la base de la vigilancia: 141 fuentes y 651 señales). Falta la verificación en el sistema desplegado, que solo se puede hacer después del despliegue.

Responde a la columna «II Seguimiento» del consolidado de observaciones del Módulo 0. Se revisó cada ítem marcado VALIDADO y se atendieron los PENDIENTES de RF-001-A.

### 1. Ítems VALIDADO: se comprobó que siguen funcionando

Comprobados por API sobre la copia de la base real (`scratchpad/seg2/verif.py`) y por las pruebas automáticas:

| Ítem | Qué se comprobó | Resultado |
|---|---|---|
| OBS-001-B/C | Ninguna fuente expone prioridad; el CSV no trae la columna | 0 fuentes con valor; sin columna |
| OBS-002-A | La matriz se compara y se carga desde Catálogo de fuentes | 142 filas leídas; 141 sin cambios, 0 nuevas, 0 faltantes |
| RF-002-A | Misma tecnología en varias fuentes, con bono | 16 corroboradas; indicador y filtro coinciden; bono = 5 por fuente adicional, máximo 15 |
| RF-003-A | Datos de producto en la bandeja | fabricante en 226 de 500, forma farmacéutica en 50, concentración en 40, marca en 31, vía en 31 |
| RF-004-A | Descarte con motivo obligatorio y por grupo | sin motivo o en blanco: rechazo (422); lote de 3 con motivo: aceptado, queda en Descartadas y se restaura |
| RF-005-A | Buscador con el estado de la tecnología | responde con nombre, fabricante, fuente y etapa |
| RF-006-A | Criterios de búsqueda por categoría | panel y parámetros vigentes |
| Pregunta 4 | CSV legible del catálogo | punto y coma, 21 columnas, UTF-8 con BOM; también en Excel |
| Pregunta 5 | Recarga del catálogo por el equipo | misma comprobación de OBS-002-A |

Nada de lo validado cambió de comportamiento.

### 2. RF-001-A (25/11): bandeja de entrada vacía con error del servidor y bandeja de trabajo que no cargaba

**Causas encontradas en el código** (no se puede ver el sistema desplegado desde el desarrollo; estas son las que explican el síntoma):

1. La Bandeja de entrada recalculaba la corroboración entre fuentes **en cada consulta** mientras hubiera vigilancia, porque el acervo cambia con cada señal nueva, y **escribía en la base** al mismo tiempo que la vigilancia. En Render (un proceso, SQLite, CPU limitada) la consulta tardaba o fallaba con «database is locked».
2. Cuando el listado fallaba, la pantalla mostraba **«La bandeja está vacía»** y solo un aviso pasajero. El listado y los indicadores se pedían juntos: si fallaba uno, se perdían los dos.
3. Con el servicio recién despertado, la primera consulta supera el tiempo de espera del navegador.

**Corrección:**

- `corroboration.refresh_for_read` (nuevo). Con vigilancia en curso recalcula como mucho cada 3 minutos; si otro cálculo está en marcha no espera; si la base está ocupada, deshace y sirve el último cálculo. La Bandeja responde siempre.
- Al terminar la vigilancia, el drenaje deja la corroboración al día (`refresh_after_scan`).
- Bandeja de entrada (`Staging.jsx`): el listado y los indicadores van por separado. Si el listado no llega, la pantalla dice «No se pudo cargar la bandeja de entrada», aclara que **no está vacía**, reintenta sola cada 20 segundos (hasta 6 veces) y ofrece (Reintentar ahora). Si ya había señales en pantalla, las conserva y avisa.
- El mensaje de tiempo agotado explica que el servidor puede estar iniciando.
- La Bandeja de trabajo ya tenía pantalla de reintento; no cambió.

### 3. RF-001-A (18/11): no se identificaba la señal exacta

Se repitió la prueba aleatoria del equipo sobre la copia de la base (`scratchpad/seg2/muestra.py`, 50 señales con «enlace exacto», abriendo cada enlace). Hallazgos:

| Hallazgo | Señales afectadas en la base | Corrección |
|---|---|---|
| Health Canada abría el buscador de la Drug Product Database, no la ficha | 36 | El conector arma la ficha con el código del producto: `…/dpd-bdpp/info?lang=eng&code=<drug_code>` |
| FDA 510(k) abría el buscador de 510(k) | 10 | `…/cfPMN/pmn.cfm?ID=K…`; De Novo: `…/denovo.cfm?id=DEN…`; PMA con suplemento: `…/pma.cfm?id=P…S…` |
| Genéricos de la FDA (ANDA) abrían una página vacía: la URL quedaba `ApplNo=A214272` | 22 | Solo los dígitos: `ApplNo=214272` |
| El buscador de un registro oficial se presentaba como «Enlace exacto» | las anteriores | `signal_links.classify` reconoce esos buscadores como «página de consulta» |
| El cruce de postulaciones enlazaba 510(k) con una ruta en minúsculas que el sitio rechaza (HTTP 400) | enlaces del cruce | Ruta corregida (`cfPMN`) |

Los formatos se comprobaron contra los sitios el 25-11-2026.

**Señales ya capturadas.** `link_resolver.repair_registry_links` corre en cada arranque: toma el identificador del registro original de cada señal y le pone la URL de su ficha. La URL anterior queda en `evidence.resolved.previous_url`. Es idempotente y deja una entrada en bitácora (`link_registry_repair`). En la copia de la base corrigió las 68 señales.

**Sin botón.** `link_resolver.auto_start`, llamado por el vigilante de la cola cuando el sistema está libre, ubica solas las señales de «página de consulta» que nunca se intentaron ubicar. Cada señal se intenta una vez (un reinicio no repite descargas), máximo 3 corridas por proceso, nunca durante una vigilancia. `LINK_AUTO_RESOLVE=false` lo apaga. El botón (Ubicar señales exactas) sigue sirviendo para reintentar. En la copia de la base: 57 señales en 21 páginas, 8 segundos, 53 ubicadas con resaltado y 4 sin ubicar (2 de AIFA y 1 de Boehringer, que cargan con JavaScript, y 1 página que no respondió).

**Menos memoria.** `resolve_all` descarga y procesa de a 8 páginas y suelta el HTML antes del lote siguiente (antes guardaba todas las páginas a la vez).

**En pantalla.**

- En la fila de la Bandeja de entrada, el icono del enlace abre la página **resaltando la señal** cuando ya está ubicada (icono de lupa).
- Sin cita textual, el enlace pide resaltar el **nombre de la tecnología**. Si la página lo trae, el navegador lo marca; si no, abre igual. Con nombres del tipo «MARCA (principio activo)» se usa la marca.
- El detalle muestra, para un enlace exacto con cita, el texto que se resalta; para una ficha de registro oficial, lo dice; y para un enlace que pasa por Google Noticias, avisa que redirige al artículo.

**Resultado sobre las 651 señales de la copia:** 594 con enlace exacto, 53 abren la página resaltando la señal y 4 sin ubicar.

### 4. Lo que la prueba aleatoria muestra y no se pudo cerrar

De 50 señales con enlace exacto tomadas al azar después de las correcciones:

- En 14 la página descargada trae el nombre de la señal (11 con resaltado).
- 6 no se pudieron descargar desde el equipo de desarrollo (el sitio rechaza robots); en el navegador abren.
- En 30 la página abre, pero el texto descargado no trae el nombre literal. No son enlaces rotos:
  - 20 son enlaces de **Google Noticias** (181 de las 594 señales con enlace exacto). Se usan para fuentes que bloquean robots (Lancet, NEJM, Medscape, entre otras). El enlace redirige al artículo original, pero no admite resaltado y el sistema no puede comprobar el destino. Obtener la URL final exige un servicio interno de Google, no documentado; no se implementó.
  - Las otras 10 son registros que arman la página con JavaScript (5 de ClinicalTrials.gov, 3 de CTIS y 2 de PCORI): en el navegador muestran el estudio o la ficha.

**Decisión para el equipo técnico:** para las fuentes que hoy entran por Google Noticias, registrar en la matriz su canal RSS oficial (o una URL de listado) da enlaces directos al artículo.

### 5. Otros pendientes del seguimiento

- **RF-001-A, prueba piloto en URL de fabricantes (25/11, equipo técnico).** El sistema ya trae el insumo: Configuración › Parámetros de fuentes › Base de conocimiento de búsqueda lista, por fuente, las páginas de noticias y de pipeline que se visitan, y el Diagnóstico para la matriz dice en qué fabricantes conviene cambiar la URL. La prueba y la decisión sobre la matriz son del equipo técnico.
- **Pregunta 2, fuentes tipo E.** El aviso y el panel de validación responden: 8 fuentes por validar en la copia de la base. Falta el ejercicio de validación del equipo técnico.
- **Pregunta 8, términos del cribado.** Queda para después de la síntesis, como indicó el equipo.

### 6. Pruebas

- **Backend:** 930 aprobadas y 1 omitida. 30 son nuevas (`test_ii_seguimiento_modulo0.py`): bandeja con la base ocupada, sin recálculo en cada consulta durante la vigilancia, ubicación automática, lotes de páginas, resaltado por nombre, URL de registros oficiales y reparación de lo ya capturado. Se actualizó una aserción de `test_reliability.py` porque el enlace ahora pide resaltar el nombre.
- **Navegador (E2E):** 109 pruebas en total (2 nuevas en `ii_seguimiento.spec.js`). La corrida completa se cortó por el límite de tiempo del comando, así que se hizo en dos partes, cada una con la base vacía: la primera (de `auth_admin` a `flow_deeplinks`) dio 68 aprobadas y 1 omitida; la segunda (de `flow_dissemination` a `ux_shell`) dio 37 aprobadas, 1 omitida y 2 fallidas. Las 2 fallidas eran las pruebas nuevas, por un dato de la propia prueba (la señal de ejemplo no traía URL); se corrigieron y pasaron al repetir su archivo junto con `flow_staging_screening.spec.js`. Total: 107 aprobadas y 2 omitidas (las dos se saltan solas según el estado de la base). No se repitió la corrida completa de una sola vez.
- **Verificación real:** descrita en los puntos 1, 3 y 4.

### 7. Al desplegar

1. No hay migraciones nuevas.
2. Al arrancar se corrigen solos los enlaces de la FDA y de Health Canada (queda en bitácora).
3. Unos segundos después, con el sistema libre, se ubican solas las señales de «página de consulta».
4. Repetir la prueba aleatoria desde la Bandeja de entrada: el icono de lupa de la fila abre la página con la señal resaltada.

## Inteligencia del sistema: base de conocimiento de señales, clasificador que aprende y marco analítico (25-11-2026, versión 7.4.0)

**Estado:** CUMPLIDO PARCIAL, 25-11-2026. Probado en local (suite de backend, pruebas de navegador y verificación sobre una copia de la base real: 656 señales). La consulta a la IA se probó con respuestas simuladas: la llave del proveedor en el equipo de desarrollo está vencida (HTTP 401), así que falta verla con el proveedor real en el sistema desplegado.

### 1. Qué se pidió y cómo se entendió

| Pedido | Cómo quedó |
|---|---|
| Al clasificar, mostrar la URL exacta de lo capturado, conservando la señal en la fuente y la fuente original | Recuadro (Direcciones de la señal) en Clasificar: URL exacta de captura, página consultada y fuente original, escritas completas y con (Copiar) |
| Parametrizar el «ciclo de vida» de las fuentes por rango de años, general o por fuente, con todos los años por defecto | **Vigencia de las señales por año** (`signal_window.py`). Se interpretó como el rango de años de publicación que el sistema acepta. Si el equipo se refería a otra cosa (por ejemplo, la vida útil de la fuente en el catálogo), hay que ajustarlo |
| Un RAG en Firestore con la primera búsqueda histórica y las señales posteriores | Tabla `signal_knowledge` en la base del sistema, que es la que se copia a Firestore. Distingue `historica`, `vigilancia` y `postulacion` |
| Actualizar el prompt | Prompt de captura (URL exacta, fecha de publicación, exclusión de lo ya establecido) y prompts nuevos de clasificación y de analítica, editables |
| Un modelo que aprenda de las clasificaciones y sugiera mejor | Clasificador de reglas + parecido con lo ya clasificado + arbitraje de la IA con esos ejemplos |
| IA en la analítica y un marco analítico | Cuatro lentes calculados con reglas y lectura ejecutiva de la IA sobre esas cifras |
| Que se calibre | Validación dejando una fuera, a demanda y automática |
| Parametrizable y presente en todo el sistema | Pestaña Configuración › Inteligencia; aparece en Bandeja de entrada (Clasificar), Analítica, captura y vigilante de fondo |

### 2. Base de conocimiento de señales

- `SignalKnowledge` (migración `0009`, solo crea la tabla). Un documento por tecnología no fusionada: nombre, texto, términos, año, origen, clúster, tipología, condición, decisión (`pendiente`, `clasificada`, `descartada`) y motivo del descarte.
- `intelligence.sync` compara `technologies.updated_at` con lo indexado y solo rehace lo que cambió. La llaman la sugerencia, la analítica y el vigilante de la cola cuando el sistema está libre. No hay ganchos en cada escritura: si la sincronización falla, la tabla se reconstruye entera con (Reconstruir).
- **Origen.** La primera sincronización fija la línea base (`intelligence.baseline_until`): lo capturado hasta ese momento es `historica`. (Fijar línea base hoy) la mueve.
- **Por qué no una colección aparte en Firestore.** Firestore guarda la copia de la base SQLite. Una colección aparte sería una segunda fuente de verdad que habría que mantener sincronizada, y un servidor local no debe escribir en la colección de producción. La tabla viaja con la copia de siempre y se puede reconstruir.
- **Recuperación.** TF-IDF con coseno, en memoria, reconstruido cuando cambia la tabla. Con 656 señales el índice se arma en 0,3 s y una consulta tarda centésimas. No usa vectores de un modelo externo: no cabe en 512 MB ni funciona con la IA apagada. El parecido es léxico.

### 3. Clasificador

`intelligence.suggest` (lo usa `POST /api/technologies/{id}/suggest-classification`; el contrato anterior se conserva y se amplía):

1. **Reglas** del catálogo (`classification.py`, sin cambios).
2. **Aprendizaje**: las `neighbors` señales clasificadas más parecidas votan con su parecido. Confianza = parte del voto del ganador × fuerza del parecido más alto.
3. **Combinación**: si coinciden, sube la confianza; si el aprendizaje supera `min_confidence`, gana; si no, mandan las reglas, con la confianza que les midió la calibración.
4. **IA** según `ai_mode`: ve la señal, los catálogos, los ejemplos del equipo y las dos propuestas. Solo puede elegir nombres del catálogo. Una respuesta fuera del catálogo, sin JSON o con un error del proveedor se descarta.
5. **Aviso de descarte**: si se parece a señales descartadas por encima de `discard_similarity`.

Cada sugerencia queda en bitácora (`intelligence:suggest`); con eso `intelligence.acceptance` mide cuántas confirmó el evaluador.

**Hallazgo durante la verificación.** El proveedor devolvió `[Error MiniMax HTTP 401: {...}]`. El cuerpo del error es JSON y se tomaba como respuesta válida: la sugerencia decía «con IA» sin haberla usado. Se corrigió y tiene prueba.

### 4. Calibración

`intelligence.calibrate`: predice cada señal clasificada sin verla, con 3, 5, 7 y 11 vecinos. Elige el mejor y la menor confianza (desde 0,30) que cumple `target_precision` con al menos 5 casos. Reporta el acierto de las reglas, del aprendizaje y del combinado, la tabla de confianza frente a acierto real y la referencia de decir siempre el clúster más frecuente.

No calibra con menos de 20 señales clasificadas ni si casi todas están en un clúster. **Sobre la copia de la base real** hay 24 clasificadas, 21 de ellas en Cáncer: la calibración responde «datos insuficientes» y no cambia parámetros. Es el comportamiento correcto; la primera versión elegía una confianza mínima de 5 % con esos datos y se corrigió.

### 5. Marco analítico

`analytics_insights.py`. `facts` calcula las cifras; `framework` las convierte en hallazgos por lente; `narrative` pide a la IA la lectura con esas cifras y la guarda (`intelligence.analytics_narrative`). La lectura nunca se genera sola al abrir la pantalla: alguien pulsa el botón.

### 6. Vigencia por año

`signal_window.py`, clave `signals.window` en `app_meta` (general y por fuente). No se agregaron columnas a `sources`.

- Captura por página: `scraper.py` filtra los candidatos antes de guardar.
- Captura por conector: `ingest_service.persist_record` no crea la señal; el registro crudo queda y entra si después se amplía la vigencia.
- Sobre lo capturado: `preview` y `apply`. El descarte usa el mismo mecanismo de la bandeja (`staging:discard`), así que se ve en Descartadas y se restaura.

Sobre la copia real, de 638 señales en la bandeja: 380 de 2026, 20 de 2027 (fechas futuras de ensayos), 33 anteriores y 205 sin fecha. Con vigencia «desde 2026» quedarían fuera esas 33.

### 7. Pruebas

- **Backend:** 970 aprobadas y 1 omitida. 40 son nuevas (`test_inteligencia.py`): base de conocimiento, parecido, sugerencia con y sin ejemplos, IA simulada (acierto, respuesta fuera del catálogo, error del proveedor), calibración, mantenimiento de fondo, vigencia por año, API y marco analítico. Se ajustaron tres aserciones de `test_ii_seguimiento_modulo0.py`: el vigilante ahora también sincroniza la base de conocimiento.
- **Navegador (E2E):** 114 pruebas, 5 nuevas (`inteligencia.spec.js`). Se corrieron en tres partes por el límite de tiempo del comando, cada una con la base vacía: 39, 33 y 39 aprobadas. Total: 111 aprobadas, 3 omitidas (se saltan solas según el estado de la base) y ninguna fallida.
- **Verificación real** sobre la copia de la base, con la IA apagada: estado en 0,3 s la primera vez y 0,02 s después; sugerencia en 0,05 s; marco analítico en 0,05 s.

### 8. Al desplegar

1. Migración `0009`: solo crea `signal_knowledge`.
2. A los pocos segundos de arrancar, con el sistema libre, el vigilante llena la base de conocimiento. Lo capturado hasta ese momento queda como primera búsqueda histórica.
3. Revisar Configuración › Inteligencia: totales de la base y estado de la IA.
4. Probar (Sugerir clasificación) en una señal y (Generar lectura con IA) en Analítica: es la primera vez que corren con el proveedor real.

### 9. Pendientes y límites

- La IA real no se pudo probar en desarrollo (llave vencida).
- El clasificador aprende poco mientras haya pocas clasificaciones y casi todas en un clúster. Mejora sola a medida que el equipo clasifica.
- El parecido es léxico: no relaciona sinónimos ni idiomas distintos. Pasar a vectores semánticos exige un servicio de embeddings o más memoria que la del plan gratuito.
- 205 señales no tienen fecha de publicación: la vigencia no las puede juzgar y por defecto las conserva.
- El prompt de captura cambió en su texto de fábrica. Si en producción hay un prompt propio guardado, ese sigue mandando hasta que alguien pulse (Restaurar) en Prompts de vigilancia.

## Búsqueda a fondo, vigilancia que no se queda y enlaces verificados (25-11-2026, versión 7.4.1)

**Estado:** CUMPLIDO PARCIAL, 25-11-2026. Probado con tres vigilancias reales completas contra los sitios de las fuentes, sobre una copia de la base (141 fuentes, 115 con ingesta activa), y con las suites de backend y de navegador. Dos cosas no se pudieron verificar en desarrollo: la extracción con IA (la llave local del proveedor está vencida, HTTP 401) y el comportamiento en Render.

### 1. Lo que encontró la vigilancia real

La primera corrida real con el código de la 7.4.0 **se quedó en 38 %**. Las causas, tomadas del registro del servidor:

| Síntoma | Causa | Corrección |
|---|---|---|
| Una fuente (AMGEN) quedó «en curso» con «PendingRollbackError» | La base respondió «database is locked» al anotar las páginas de búsqueda; con la sesión rota, registrar el fallo también falló y el hilo murió sin cerrar el job | El fallo se deshace antes de registrarse (`ingest_service._run_job`, `scraper.scrape_source`). Si aun así el hilo muere, `_abandon_job` cierra el job en una sesión nueva y lo deja para reintento en un minuto |
| «database is locked» | Una escritura quedaba abierta mientras se esperaba a la red, y SQLite tiene un solo escritor | Se cierra la escritura antes de salir a la red (`_run_job`, `_run_adapter`). Las señales se guardan primero; la anotación de páginas de búsqueda y la traza van después, cada una en su propia escritura |
| Tres fuentes de la FDA llevaban minutos «recorriendo» | Tres fuentes a la vez abrían doce fichas de `fda.gov`; el sitio dejaba de responder | Tope de dos descargas simultáneas por sitio, sumando todas las fuentes (`scraper._host_slot`) |

Además queda un **detector de escrituras largas** (`database.py`): si una sesión mantiene una escritura abierta más de 5 segundos, el log dice en qué hilo. Sirve para encontrar el culpable en producción sin adivinar.

**Resultado con las correcciones** (dos corridas reales completas):

| Corrida | Fuentes | Completas | Parciales | Con error | Tiempo | Detectadas | Nuevas | «database is locked» |
|---|---|---|---|---|---|---|---|---|
| 2 | 115 de 115 | 54 | 61 | 0 | 6 min 1 s | 810 | 206 | 0 |
| 3 | 115 de 115 | 54 | 61 | 0 | 6 min 43 s | 847 | 233 | 0 |

Durante la corrida la Bandeja de entrada respondió en 0,19 s y el avance por fuente se actualizó todo el tiempo (etapa y detalle de cada fuente en curso).

**Parciales.** De las 61: 25 se leyeron por Google Noticias porque el sitio no respondió, 1 por el RSS oficial y 35 se visitaron sin detectar señales.

### 2. Calidad de la extracción: lo que se puede afirmar y lo que no

- **Sin IA** (como corrieron estas pruebas), 41 de las 115 fuentes no dieron ninguna señal aunque el sistema entró y recorrió sus páginas (por ejemplo Abbott: 12 a 15 páginas visitadas, 0 señales). El extractor por reglas es conservador: solo toma lo que reconoce como producto o tecnología nominada.
- **Con IA** el resultado debe ser mejor, pero **no se pudo medir**: la llave del proveedor en el equipo de desarrollo responde 401. Hay que medirlo en el sistema desplegado, donde la llave es válida, comparando el informe de la vigilancia por fuente.
- Las 233 señales nuevas de la corrida 3 llegaron con enlace exacto: 50 de ClinicalTrials.gov, 48 de la FDA, 17 de AbbVie, 15 de BMJ, 14 de DocGuide y el resto de otras fuentes.

### 3. Contenido plegado y tablas

El texto de cada página salía del extractor de «artículo principal», que descartaba lo que la página muestra plegado. Con una página de prueba se comprobó que se perdían un acordeón cerrado, una pestaña oculta y una tabla.

`scraper.folded_text` agrega al texto de la página lo que el HTML trae en `details`, acordeones, pestañas, bloques ocultos, «ver más» y tablas (hasta 80 filas y 6.000 caracteres), sin repetir lo ya leído y sin tomar menús, pies ni avisos de cookies. Equivale a desplegar la página.

**Límite.** No ejecuta JavaScript. Lo que un sitio pide al servidor después de un clic no está en el HTML y no se puede leer así (AIFA, Boehringer). Un navegador sin interfaz no cabe en los 512 MB del plan gratuito de Render.

### 4. Enlaces de las señales

**Botones.** En Clasificar las tres direcciones son botones como los demás: (URL exacta de la señal), (Página consultada) y (Fuente original), cada uno con un icono para copiar. El recuadro de tipo de enlace ya no repite sus propios botones.

**«Not found» y 404.** Se revisaron los enlaces en un navegador real:

| Fuente | Hallazgo | Corrección |
|---|---|---|
| CTIS (ensayos europeos), 40 señales | El enlace abría el buscador sin el ensayo | `ctis-public/view/<número>` abre la ficha. Las ya capturadas se corrigen al arrancar |
| PCORI, ClinicalTrials.gov | Abren bien y muestran la señal | Ninguna |
| Google Noticias | En el navegador redirigen al artículo de la fuente | Ninguna |

**Verificación automática** (`signal_links.check_links`, `auto_check`). El vigilante de la cola verifica solos los enlaces sin verificar, en tandas de 150.

- **Roto** solo es 404, 410 o una página cuyo título dice «no encontrado». En ese caso la señal deja de ofrecer ese enlace: pasa a su página consultada, queda lista para ubicarse allí y la dirección rota se guarda en `evidence.broken_url`.
- **Bloqueado** (401, 403, 429 y también 400) es un sitio que rechaza visitas automáticas. En el navegador abre.
- **Sin respuesta** se reintenta al día siguiente.

**Dos errores del verificador anterior**, medidos sobre 651 señales:

1. Pedía 40 páginas a la vez a un mismo sitio: PCORI y `fda.gov` dejaban de contestar y 54 señales salían como caídas sin estarlo. Ahora cada sitio se visita de a una página, con pausa, máximo 25 por tanda, y si rechaza tres seguidas se le deja hasta el día siguiente.
2. Usaba un cliente distinto al del rastreador y PCORI no le respondía. Ahora usa el mismo.

Con el verificador corregido, de las 651 señales de la copia: 620 abren, 31 bloquean la verificación automática y ninguna está rota.

**Aviso operativo.** Tras dos vigilancias y varias verificaciones seguidas, `accessdata.fda.gov` bloqueó temporalmente la IP del equipo de desarrollo (HTTP 400 a todo, también en el navegador). Es la razón de los topes de cortesía. En producción, lanzar varias vigilancias completas seguidas puede provocar lo mismo.

### 5. Base de conocimiento sincronizada

- Al terminar cada vigilancia, el drenaje sincroniza la base de conocimiento (y recalibra si toca) sin esperar al vigilante.
- La línea base se fija al arrancar el sistema, no en la primera sincronización: lo que capture la vigilancia que se reanuda tras el despliegue cuenta como señal posterior. En la corrida 3: 656 históricas y 233 posteriores.

### 6. Pruebas

- **Backend:** 1000 aprobadas y 1 omitida. 30 son nuevas (`test_busqueda_a_fondo.py`).
- **Navegador (E2E):** 115 pruebas en tres partes por el límite de tiempo del comando (39, 33 y 40 aprobadas). Total: 112 aprobadas, 3 omitidas y ninguna fallida.
- **Vigilancias reales:** las tres descritas en el punto 1.
- **Navegador real:** 18 enlaces de señales de 10 sitios, abiertos uno por uno.

### 7. Pendientes y límites

- Medir la extracción con IA en el sistema desplegado.
- Verificar todo en Render: allí la CPU es mucho menor y los tiempos serán más largos.
- Las 41 fuentes sin señales en la corrida sin IA deben revisarse con el informe de la vigilancia con IA; las que sigan en cero necesitan una URL más específica en la matriz o consulta manual.
- Sitios que arman su contenido con JavaScript: no se leen (punto 3).

## Prueba real con IA: vigilancia completa, calidad de la extracción y prompt de captura (25-11-2026, versión 7.4.2)

**Estado:** CUMPLIDO PARCIAL, 25-11-2026. Con una llave válida del proveedor (MiniMax-M3) se corrió una vigilancia real completa sobre una copia de la base, con Firestore apagado. Falta la verificación en Render.

### 1. Vigilancia real completa con IA

| | Sin IA (corrida 3) | Con IA (corrida 4) |
|---|---|---|
| Fuentes atendidas | 115 de 115 | 115 de 115 |
| Completas / parciales / con error | 54 / 61 / 0 | 70 / 45 / 0 |
| Tiempo | 6 min 43 s | 19 min 13 s |
| Señales detectadas | 847 | 1.152 |
| Señales nuevas | 233 | 812 |
| Fuentes sin ninguna señal | 41 | 25 |
| «database is locked» y escrituras largas | 0 | 0 |

De las 45 parciales con IA: 25 se leyeron por Google Noticias porque el sitio no respondió y 20 se visitaron sin detectar señales. Entre estas últimas están las que arman su contenido con JavaScript (AIFA, Boehringer) y varios registros de ensayos (ChiCTR, CRiS, DRKS, EUDAMED).

### 2. Calidad de lo extraído con IA

De las 812 señales nuevas, 707 salieron de la lectura de páginas (las demás llegaron por API: ClinicalTrials.gov, FDA y CTIS):

- 534 con enlace exacto y 173 con página de consulta; de estas, 146 ya abren la página resaltando la señal.
- 683 de 707 traen la cita textual de la fuente.
- 428 de 707 traen fecha de publicación.
- 132 entran por Google Noticias.

**¿La URL exacta contiene la señal?** Muestra aleatoria de 80 señales con enlace exacto fuera de Google Noticias, abriendo cada página:

- En 63 la página trae la señal.
- En 12 no se encontró el nombre. Al revisarlas, casi todas son temas genéricos que la IA tradujo («Hemodiálisis», «Inmunoterapia», «Oxígeno hiperbárico») tomados de páginas índice: el problema es la señal, no el enlace.
- 5 no se pudieron descargar desde el equipo de desarrollo.

**Ruido.** La IA toma como tecnología temas de salud y procedimientos en general cuando la fuente es una página índice (MedlinePlus, Noticias Médicas, la página de tecnologías de GSK).

### 3. Prompt de captura reforzado

Se agregó al prompt de fábrica la regla de que un tema de salud, un procedimiento o una clase terapéutica no es una señal salvo que el texto nombre un producto, marca, código, DCI o fabricante concreto, y que tampoco lo son los artículos de historia o de perfil de la empresa.

Medido repitiendo con IA las mismas 8 fuentes que más ruido dieron (Abbott, GSK, MedlinePlus, Noticias Médicas, ReBEC, Science Daily, DocGuide y JAMA): **de 76 señales a 47**. Desaparecieron «Colonoscopia», «Artroscopia», «Hemodiálisis», «Implantes dentales», «Brackets metálicos» y similares.

**Lo que sigue entrando.** Rótulos de páginas índice («MedlinePlus», «CT Scans», «Diagnostic Imaging»), contenido ajeno de un sitio de noticias («SSSTik», «fGet») y productos de nutrición de Abbott. La respuesta de la IA varía entre corridas, así que la cifra exacta no es fija.

**Qué hacer con ese ruido.** Para MedlinePlus y Noticias Médicas conviene registrar en la matriz una URL de novedades en lugar de la página índice, o pasarlas a consulta manual. Lo que el equipo descarte en la bandeja alimenta la base de conocimiento, y la sugerencia avisa cuando una señal nueva se parece a algo descartado.

### 4. Sugerencia de clasificación y lectura analítica con el proveedor real

- **Sugerencia:** 8 señales, entre 1,0 y 2,8 s cada una. Para una terapia génica propuso «Enfermedades huérfanas o raras» y «Terapias avanzadas y génicas» con motivo tomado del texto. Para títulos de artículos que no son una tecnología no propuso clúster, que es lo correcto.
- **Lectura analítica:** 2,4 s. Usó solo las cifras entregadas, en los cuatro párrafos del marco.

### 5. Verificación de enlaces después de la vigilancia

Arranca sola un minuto después de terminar la vigilancia y trabaja por tandas de 150. Con la cortesía por sitio, una tanda tarda unos 10 minutos y el resultado se escribe al terminar cada tanda: con 1.463 señales, verificarlas todas toma cerca de dos horas en segundo plano.

### 6. Pruebas

- **Backend:** 1000 aprobadas y 1 omitida. Con la llave válida en el `.env`, una prueba antigua de captura llamó a la IA real y falló: la suite no aislaba al proveedor. `conftest.py` ahora lo aísla siempre (`_hermetic_ai_provider`); las pruebas no gastan cupo ni dependen de la llave.
- **Navegador:** sin cambios desde la 7.4.1 (112 aprobadas y 3 omitidas de 115); esta versión solo cambia el texto del prompt.

### 7. Pendientes

- Verificar en Render, donde la CPU es mucho menor: la vigilancia con IA tardará bastante más de 19 minutos.
- Si en producción hay un prompt de captura propio guardado, el reforzado no aplica hasta pulsar (Restaurar) en Prompts de vigilancia.
- Revisar con el equipo técnico las 25 fuentes que no dan señales ni con IA.

## Entrega final: acceso a las fuentes, historial de vigilancias y ficha de modelos (26-11-2026, versión 7.5.0)

**Por qué.** La última vigilancia en producción informó «No pudo entrar» en 24 fuentes. Medido desde un equipo local
con el rastreador de la 7.4.2, 29 de las 115 fuentes con ingesta activa rechazan la descarga directa: 22 con HTTP 403,
una con 401, una con 404, una con 406 y cuatro sin respuesta. Casi todas son sitios públicos con filtro anti-robot.

**Qué cambió.**

- `app/access_routes.py` (nuevo). Dos rutas más de acceso:
  - *Cliente compatible con navegador* (`curl_cffi`). Repite la descarga con el saludo TLS y HTTP/2 de un navegador.
    En la medición local entraron 23 de 35 páginas que el cliente normal no leía (bloqueadas o devueltas como cascarón).
    **Viene apagado**: se enciende en Configuración › Parámetros de fuentes («Acceso con cliente compatible con
    navegador») y el servidor puede prohibirlo con `BROWSER_FETCH_ENABLED=false`. Respeta `robots.txt`, no resuelve
    captchas ni inicia sesión. Encenderlo es decisión del IETS: algunos sitios prohíben el acceso automático en sus
    condiciones de uso.
  - *Índice oficial de la revista en PubMed* (E-utilities de NCBI) para NEJM, The Lancet, BMJ, JAMA y Cochrane, cuyos
    sitios responden con un reto que ningún cliente HTTP supera. Arma un canal con título, resumen y enlace.
- `scraper._fetch_url` escala a la ruta de navegador cuando la respuesta es un bloqueo o un cascarón;
  `fallback_urls` agrega el índice de PubMed antes de Google News. Se retiró el canal RSS de BMJ, que ya responde 404.
- `ingest_service._run_job`: la sonda en ámbar o rojo ya no suspende una fuente web. En el historial local había 480
  errores «Sonda rojo: HTTP 403… Ingesta no arrancada»: la fuente quedaba sin leer y sin probar ninguna ruta.
- Historial de vigilancias: `scheduler_service.record_manual_scan`, `finalize_scan_runs` (ahora guarda el resumen) y
  `scan_history`; `GET /api/ingest/runs`. Las corridas manuales usan la tabla `scheduled_runs` con `detail.scope`
  (`todas` o `seleccion`) y no mueven el reloj de la tarea programada (`last_run` las ignora salvo `any_scope=True`).
  Sin migración: no hay columnas nuevas.
- Pantalla Vigilancia: «Última realizada» bajo el botón, tarjeta «Historial de vigilancias» e «Informe de acceso por
  fuente» plegable («Ver informe en tiempo real» durante la corrida).
- Configuración › Inteligencia: ficha «Modelos, aprendizaje y trazabilidad» (`intelligence.model_card` y
  `suggestion_trace`, componente `ModelCard.jsx`).
- Bandeja de trabajo: bloque «Última vigilancia». Tablero estratégico: «Fuentes sin acceso» en el diagnóstico y
  «Recuperar el acceso a fuentes» en lo prescriptivo.

**Lo que no se resuelve con código.** Con todas las rutas, quedan fuentes que solo se pueden leer por respaldo o a mano:
`cdsco.gov.in` y `ctri.nic.in` no responden desde fuera de India, `bd.com/es-es/our-products` ya no existe (404: hay que
actualizar la URL en la matriz) y `cda-amc.ca` responde con reto en todo el dominio. Para ellas rige Google News o la
consulta manual (fuentes tipo E).

**Pruebas.** `backend/tests/test_entrega_final.py` y `frontend/e2e/entrega_final.spec.js`.

## Interfaz en tres idiomas: español, inglés británico e inglés americano (26-11-2026, versión 7.6.0)

**Por qué.** El equipo pidió poder cambiar el idioma de la interfaz, con inglés británico y americano por separado.

**Cómo funciona.**

- `frontend/src/i18n/index.js`. El texto en español es la llave: `t("Guardar cambios")`. Sin entrada en el
  diccionario se muestra el español. `tr()` admite elementos dentro del texto, `ts()` traduce la prosa que escribe
  el servidor (coincidencia exacta y luego por patrón) y `intlLocale()` da la región para fechas y números.
- El idioma se guarda en `localStorage` (`iets_hs_lang`) y se resuelve antes de cargar la aplicación
  (`main.jsx` carga el diccionario y luego `bootstrap.jsx`). Cambiarlo recarga la página: por eso `t()` sirve igual
  en un componente que en una constante de módulo. El diccionario de inglés viaja en un fragmento aparte que solo
  se descarga si se usa.
- `frontend/src/i18n/locales/en/`. Un diccionario por archivo fuente, escrito en inglés americano
  (5.290 llaves). `british.js` deriva la ortografía británica; lo que cambia más que la ortografía va en el `gb`
  de cada diccionario. Los `server.*.js` traducen los mensajes del backend, con patrones para los que llevan datos.
- El backend sigue en español (los mensajes también se guardan en la base). Solo cambia el asistente: la cabecera
  `X-UI-Language` hace que `ai_service.chat_answer` y `/chat/navigate` respondan en el idioma de la interfaz.
- `components/LanguageSwitch.jsx`: selector en la cabecera, el ingreso y las pantallas públicas.

**Qué no se traduce.** Contenido (fuentes, señales, notas, boletines, postulaciones), respuestas ya guardadas de la
IA, documentos exportados (PDF, XLSX, CSV, paquete de diseminación), correos, nombres de entidades y los valores que
se comparan o se envían al servidor.

**Cómo agregar o corregir textos.** Reglas, glosario de términos y formato en `frontend/src/i18n/README.md`.
`node scripts/i18n-check.mjs` (en `frontend/`) lista llaves sin traducción, choques entre diccionarios y textos que
parecen español sin pasar por `t()`.

**Pruebas.** `frontend/e2e/idioma.spec.js`: el selector cambia y recuerda el idioma, y las 23 pantallas abren en
en-GB y en-US sin errores de consola. `backend/tests/test_idioma.py`: la instrucción de idioma llega al modelo.

**Pendientes.**

- La traducción se revisó por coherencia de términos, no por una persona nativa: conviene una lectura del equipo
  técnico en las pantallas que más usa.
- Documentos exportados y correos siguen en español.
- Los nombres de clústeres y tipologías editados a mano en Configuración se muestran como se escribieron.

## Respaldo por buscadores, pantallas reorganizadas y logo institucional (26-11-2026, versión 7.7.0)

**Por qué.** La primera vigilancia completa en producción con la 7.5.0 dejó 20 de 115 fuentes en «No pudo entrar».
El informe de acceso (`informe_acceso_fuentes_2026-11-26.csv`) muestra la misma causa en las 20: el sitio rechaza la
lectura directa desde Render (13 con HTTP 403, una con 400, una con 401, una con 406 y cuatro sin respuesta) y el
respaldo de Google News respondió HTTP 503 (19) o 429 (1). Desde un equipo local Google News sí contesta: bloquea la
dirección del centro de datos. En esa misma corrida la búsqueda web del sistema sí trajo resultados en 65 fuentes.

**Qué cambió en la vigilancia.**

- `scraper.py`: nueva ruta de respaldo `busqueda_web`. Si el sitio, sus canales y Google News fallan, se consultan los
  buscadores de `web_search` (en cascada, con pausa y base de conocimiento) por el dominio de la fuente y sus
  resultados se leen como un canal: solo quedan los ítems pertinentes y la corrida queda **parcial**, igual que con
  Google News. Se usa aunque la fuente tenga la búsqueda web apagada en su flujo, porque es el último recurso; sí
  respeta el interruptor general de Parámetros de fuentes.
- Sin resultados, la fuente sigue como «No pudo entrar» y el mensaje nombra también esa ruta
  («buscadores web: sin resultados»).
- `scan_progress.py`: etiqueta y ruta de respaldo nuevas; el informe de acceso la muestra como
  «Resultados de buscadores para el dominio (el sitio no respondió)».

**Qué cambió en la interfaz.**

- **Vigilancia** (`pages/Scan.jsx`): «Inventario» queda junto a «Ejecutar vigilancia». La vigilancia programada pasa a
  una franja; la cola de ingesta y la vista previa de un enlace quedan plegadas en la misma tarjeta (`<details>`), la
  cola se abre sola cuando tiene trabajos. No se quitó ninguna función.
- **Catálogo de fuentes** (`pages/Sources.jsx`): los ocho botones de la cabecera pasan a tres menús
  (`components/ActionMenu.jsx`): Descargar, Mantenimiento y Agregar fuente. Cada opción lleva su explicación y el
  motivo cuando está bloqueada.
- **Configuración** (`pages/Settings.jsx`, `components/layout.css`): menú lateral fijo agrupado por tema y cabecera
  de sección; en pantallas angostas vuelve a filas.
- **Logo institucional**: `app/branding.py`, `GET /api/branding` (público), `PUT` y `DELETE /api/config/branding`
  (permiso `config:manage`, quedan en bitácora). PNG, JPG o WebP hasta 400 KB, validados por la firma del archivo
  (un SVG se rechaza). Se guarda como data URL en `app_meta` (`brand.logo`), así viaja con la copia en Firestore.
  En el frontend: `branding/BrandingContext.jsx` (`BrandMark`) y `components/BrandingPanel.jsx`.

**Pruebas.** `tests/test_scan_progress_and_feeds.py` (respaldo por buscadores, con y sin resultados),
`tests/test_branding.py`, `e2e/identidad.spec.js`; se ajustaron `crud_scan`, `crud_sources`, `modulo0_pendientes` y
`menu_ordenado` a los controles reagrupados.

**Pendientes.**

- Confirmar en producción cuántas de las 20 fuentes entran por la ruta nueva: depende de que los buscadores respondan
  desde Render y de que tengan indexado el dominio. Las que sigan sin entrar necesitan el cliente compatible con
  navegador (decisión del IETS, Configuración › Parámetros de fuentes) o revisión de la URL en la matriz.
- Las señales que llegan por buscadores son titulares y fragmentos: conviene abrir el enlace antes de clasificarlas.

## Postulaciones robustas: radicado, motivos, reapertura y recorrido (27-11-2026, versión 7.8.0)

**Por qué.** El submódulo solo listaba las postulaciones y dejaba aceptar o rechazar con una nota libre. No había forma
de buscar, medir la cola, saber si una tecnología ya se había postulado, corregir un rechazo ni decirle a quien postuló
en qué iba su trámite.

**Servidor.**

- `alembic/versions/0010_submission_reject_reason.py`: columna `submissions.reject_reason` (código del motivo).
- `submission_service.py`:
  - `REJECT_REASONS` (ocho motivos). `reject_submission` recibe `reason`; sin motivo vale «otro», que exige nota.
  - `reopen_submission`: una rechazada vuelve a `recibida`; exige nota y deja `submission_reopened` en bitácora con la
    decisión anterior. Una aceptada no se reabre porque ya creó una `Technology`.
  - `tracking_code` (`POS-<año>-<id>`, derivado, sin columna) y `find_by_tracking` (radicado + correo).
  - `duplicates_of` (mismo nombre comercial o misma DCI) para avisar a quien modera; `_same_filing`, más estricta,
    impide que la misma persona radique dos veces la misma tecnología mientras la primera siga en moderación.
  - Validación: máximo 10 enlaces, sin repetidos, con dominio válido; textos hasta 4.000 caracteres.
  - `summary` (indicadores) e `history` (recorrido desde `audit_logs`, solo acciones `submission_*`).
- `routers/submissions.py`:
  - `GET /api/submissions` acepta `q`, `conflict`, `stale` y `order`; cada fila trae `tracking_code`,
    `reject_reason_label`, `waiting_days` y `duplicates`.
  - `GET /api/submissions/summary`, `GET /api/submissions/{id}`, `GET /api/submissions/{id}/history`,
    `POST /api/submissions/{id}/reopen`, `GET /api/submissions/export.csv` (permiso `staging:assign`, queda en bitácora,
    neutraliza celdas que empiezan por `=`, `+`, `-` o `@`).
  - `POST /api/public/submissions/status` (público, con el mismo tope por IP): responde igual si el radicado no existe
    o si el correo no coincide. Publica el motivo de la lista, nunca la nota interna ni los motivos «otro» y «no válida».

**Interfaz.**

- `pages/Submissions.jsx` y `pages/submissions.css`: indicadores, pestañas con conteo, búsqueda y filtros, tarjetas con
  radicado, espera y aviso de duplicados, ventana de revisión a dos columnas con decisión y recorrido, reapertura y
  exporte.
- `pages/PublicSubmit.jsx`: muestra el radicado al enviar y agrega la consulta de estado.
- `i18n/index.js`: las fechas que el servidor entrega sin zona horaria (SQLite) se leen como UTC en `fmtDate`,
  `fmtDateTime` y `fmtTime`. Antes la hora de recibida salía cinco horas corrida. Las pantallas que aún usan
  `new Date(x).toLocale…` directamente conservan ese desfase.

**Pruebas.** `tests/test_postulaciones_robustas.py` (8) y `e2e/postulaciones_robustas.spec.js` (2); se ajustaron
`test_frente_b_submissions.py` y `crud_submissions.spec.js`.

**Pendientes.**

- No se envía correo a quien postula cuando hay decisión: la consulta es por radicado. Activarlo requiere decidir el
  texto y confirmar el servidor de correo.
- El desfase de hora en las pantallas que no usan `fmtDateTime` queda por revisar una a una.

## Priorización robusta: avance, matriz del ciclo, recorrido y exporte (27-11-2026, versión 7.9.0)

**Por qué.** La pantalla solo dejaba calificar una tecnología a la vez. No se veía qué criterio frenaba el ciclo, no
había una vista de toda la matriz, una respuesta se podía cambiar sin explicación y no se podía sacar la matriz.

**Servidor.** Sin migración.

- `priority_overview.py` (nuevo, solo lectura): `stats` (avance por criterio, pendientes del perfil, %P promedio,
  distribución de puntos), `history` y `export_rows`.
- El recorrido sale de `audit_log`: altas y cambios de `priority_scores` (los captura el listener del ORM), más
  `priority:classify` y los cambios de estado de `cycle_technologies`. No hay tabla nueva.
- `priority_engine.rate_criterion`: cambiar el valor de un criterio ya calificado exige justificación de 10 caracteres
  o más (`MIN_CHANGE_NOTE`); repetir el mismo valor no. Justificación hasta 2.000 caracteres. Responde 409.
- `routers/priority.py`:
  - `GET /api/priority/{ciclo}/queue` acepta `order` (`cribado`, `pct`, `avance`, `nombre`, `recientes`) y `progress`
    (`completas`, `incompletas`); cada fila trae `scores` (valor por criterio), `my_missing` y `last_rated_at`.
  - `GET /api/priority/{ciclo}/stats` suma `progress_pct`, `pending_for_me`, `avg_pct`, `points_distribution`,
    `criteria`, `excluded` e `in_evaluation`.
  - `GET /api/priority/{ciclo}/export.csv` (cualquier usuario con sesión, queda como `priority:export` en bitácora,
    neutraliza celdas que empiezan por `=`, `+`, `-` o `@`).
  - `GET /api/priority/{ciclo}/{tecnología}/history`.

**Interfaz.**

- `pages/Prioritization.jsx` y `pages/prioritization.css`: selector de vista (calificar o matriz del ciclo), panel de
  avance por criterio, marcas por criterio en la cola, filtro por avance y orden, fichas en el detalle, recorrido
  plegable, navegación anterior/siguiente y «Siguiente que me toca», exporte.
- `components/PriorityMatrix.jsx`: al cambiar una respuesta abre la justificación y explica la regla antes de enviar;
  la fecha de la firma usa `fmtDateTime` (corrige el desfase de cinco horas).
- `i18n/locales/en/server.priority.js`: textos del recorrido y de la regla en inglés.

**Pruebas.** `tests/test_priorizacion_robusta.py` (5) y `e2e/priorizacion_robusta.spec.js` (1).

**Pendientes.**

- El exporte no respeta los filtros de la cola: siempre baja la matriz completa del ciclo.
- La matriz del ciclo pagina de a 50 como la cola; no hay vista de todo el ciclo en una sola tabla.

## Evaluación robusta: pestañas, observaciones con estado, versiones y exporte (27-11-2026, versión 7.10.0)

**Por qué.** El expediente era una sola tarjeta larga con el documento, la invitación, los revisores, las observaciones
y el historial uno tras otro. Las observaciones eran texto sin estado ni fecha, no se sabía qué había cambiado entre
versiones, se podía perder lo escrito al cambiar de tecnología y la cola no decía qué esperaba cada expediente.

**Servidor.**

- `alembic/versions/0011_review_comment_resolution.py`: `review_comments.resolved_at`, `resolved_by` y
  `resolution_note`. Se aplica sola al arrancar.
- `evaluation_service.py`: `resolve_comment` y `reopen_comment` (quedan en bitácora como `review:comment_resolved` y
  `review:comment_reopened`; un documento publicado ya no las admite), `queue_facts` (observaciones abiertas,
  revisiones entregadas y pendientes, invitaciones que vencen en 3 días y desde cuándo está en su estado),
  `changed_fields` y tope de 4.000 caracteres por observación.
- `routers/evaluation.py`:
  - `GET /api/reports` suma a cada fila `cluster_name`, `missing_count`, `open_comments`, `reviews_done`,
    `reviews_pending`, `invites_expiring`, `confidential`, `version`, `updated_at` y `status_since`.
  - `POST /api/reports/{doc}/comments/{id}/resolve` (permiso `report:write`) y `.../reopen` (informe o revisión).
  - `GET /api/reports/{doc}/versions` agrega `status_label` y `changed_fields` frente a la versión anterior.
  - `GET /api/reports/export.csv?cycle_id=` (queda como `report:export_queue`, neutraliza fórmulas).
  - Cada observación trae `version_label`.

**Interfaz.**

- `pages/Evaluation.jsx` y `pages/evaluation.css`: indicadores, cola con búsqueda y filtro, cabecera fija del
  expediente, pestañas, avance por sección, observaciones con resolver y reabrir, versiones con vista del documento,
  revisores en tarjetas, menú «Exportar».
- Cambios sin guardar: aviso, confirmación al cambiar de tecnología, `beforeunload` y transiciones bloqueadas hasta
  guardar.
- Aprobar en comité con observaciones abiertas pide confirmación; no lo impide.

**Pruebas.** `tests/test_evaluacion_robusta.py` (6) y `e2e/evaluacion_robusta.spec.js` (1); se ajustó
`flow_evaluation.spec.js` (pestaña de revisión, confirmación del comité y menú de exporte).

**Pendientes.**

- El portal del revisor externo (`/revisar/<token>`) no muestra si una observación fue resuelta ni la respuesta.
- No se avisa por correo al revisor cuando su observación se resuelve.
- No hay comparación lado a lado de dos versiones: solo la lista de campos que cambiaron.

## Diseminación robusta: validación de informes, origen, recorrido y paquete (27-11-2026, versión 7.11.0)

**Por qué.** Un informe generado por IA quedaba igual que uno revisado por una persona y viajaba en el paquete del
ciclo sin que nadie respondiera por él. La tarjeta no decía de qué señal salía, no había forma de saber quién lo
cambió y el paquete se descargaba a ciegas.

**Servidor.**

- `alembic/versions/0012_recommendation_validation.py`: `recommendations.status` (`borrador` | `validado`),
  `validated_by`, `validated_at`, `updated_by`, `updated_at`. Los informes existentes quedan en `borrador`: el sistema
  no afirma una validación que nadie hizo.
- `recommendation_service.py` (nuevo): `validate` (exige impacto y 80 caracteres), `reopen`, `origin_of` (manual, ia,
  preliminar), `context_for` (señal y tecnología en dos consultas), `history` (desde `audit_log`) y `export_rows`.
- `routers/recommendations.py`:
  - `GET /api/recommendations` acepta `cycle_id` y `status`; cada fila trae `status`, `origin`, `edited`, `words`,
    `finding_title`, `technology_id`, `technology_name`, validación y última edición.
  - `POST /{id}/validate`, `POST /{id}/reopen` (permiso `report:write`), `GET /{id}/history`.
  - `PUT /{id}`: si cambia título, contenido o impacto de un validado, vuelve a borrador (queda `recommendation:reopened`
    con motivo «Editado después de validar»). Guardar sin cambios no toca nada.
  - `DELETE /{id}`: 409 si está validado.
  - `GET /export.csv` (queda como `recommendation:export`, neutraliza fórmulas).
  - `GET /package/{ciclo}/preview`: el manifiesto del paquete sin descargarlo ni dejar registro.
- `dissemination_service.build_package`: solo recomendaciones validadas salvo `include_drafts`; el manifiesto suma
  `recommendations_skipped_draft` y cada `.md` dice quién validó.

**Interfaz.**

- `pages/Recommendations.jsx` y `pages/recommendations.css`: indicadores, pestañas por estado, filtros por origen y
  ciclo, tarjetas con estado y origen, ventana de lectura a dos columnas con validar, devolver y recorrido, tarjeta
  del paquete con vista previa, exporte y descarga en Markdown.
- `pages/Bulletins.jsx`: la insignia de un boletín aprobado sin publicar dice «Aprobado, listo para publicar».

**Pruebas.** `tests/test_diseminacion_robusta.py` (6) y `e2e/diseminacion_robusta.spec.js` (1); en
`test_frente_b_dissemination.py` la recomendación de la semilla ahora está validada.

**Pendientes.**

- Quien crea un informe puede validarlo: no se exige una segunda persona.
- La vista previa arma el paquete completo en memoria para contar; con ciclos muy grandes convendría contar sin armar.
- Boletines no se rediseñó; solo se corrigió la insignia.
