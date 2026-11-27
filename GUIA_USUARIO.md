# Guía de usuario — Sistema de Escaneo de Horizonte del IETS

**Manual operativo completo** para el equipo del Instituto de Evaluación Tecnológica en Salud (IETS).
No es un resumen técnico: explica **qué ve en pantalla**, **qué botón oprimir**, **en qué orden**, **quién lo hace** y **qué hacer cuando algo falla**.

| | |
|---|---|
| **Versión del sistema** | 7.11.0 · actualizada el 27 de noviembre de 2026 (diseminación: informes en borrador o validados, origen y recorrido de cada informe, vista previa del paquete del ciclo y exporte; antes, 7.10.0: evaluación: expediente por pestañas, observaciones que se resuelven y reabren, cambios entre versiones, aviso de cambios sin guardar y exporte; antes, 7.9.0: priorización: avance por criterio, matriz del ciclo, recorrido, justificación al cambiar una respuesta y exporte; antes, 7.8.0: postulaciones: radicado y consulta pública del estado, motivos de rechazo, reapertura, duplicados, búsqueda, indicadores y exporte; antes, 7.7.0: respaldo por buscadores cuando un sitio y Google Noticias rechazan la lectura, Vigilancia y Catálogo de fuentes reorganizados, Configuración con menú lateral y carga del logo institucional; antes, 7.6.0: interfaz en español, inglés británico e inglés americano con selector de idioma; antes, 7.5.0: entrega final: rutas de acceso a las fuentes, historial de vigilancias con fecha, hora y duración, informe de acceso plegable y ficha de modelos de inteligencia; antes, 7.4.2: búsqueda a fondo: contenido plegado y tablas, vigilancia que no se queda, enlaces verificados y botones de dirección en Clasificar; prompt de captura reforzado tras la prueba real con IA) |
| **Público** | Evaluadores técnicos y clínicos, tomadores de decisiones, revisores, superadministradores y personal de apoyo |
| **Cómo leerla** | Siga el orden de un ciclo nuevo la primera vez; después use el índice para el módulo del día |
| **Documentación técnica** | [`README.md`](README.md) · [`DEPLOY.md`](DEPLOY.md) · [`Catalogo_Fuentes_Proactivas_Verificadas_EH_IETS.md`](Catalogo_Fuentes_Proactivas_Verificadas_EH_IETS.md) |

### Novedades del 24 de noviembre de 2026 (pendientes del Módulo 0)

| Qué cambió | Dónde leerlo |
|---|---|
| **La señal exacta (RF-001)**: (Ubicar señales exactas) busca cada señal de «página de consulta» en su página. Si la página la enlaza, la señal pasa a (Enlace exacto); si la fuente la publica en una tabla sin enlace propio, el botón (Abrir la página y resaltar la señal) abre la página en el punto exacto. El **Diagnóstico para la matriz** dice qué fuentes debe mejorar el equipo técnico en la matriz y cómo | [10.9](#109-enlace-a-la-fuente-original-y-evidencia-de-captura) y [14.3](#143-reporte-de-enlaces-por-fuente) |
| **Sondear todas**: prueba las 141 fuentes del inventario en segundo plano y deja su informe en Excel | [8.3](#83-botones-de-la-barra-superior) y [8.11](#811-sondear-todas-las-fuentes-paso-a-paso) |
| **Fuentes tipo E por validar**: aviso al entrar, contador junto a «Bandeja de entrada», tarjeta en la Bandeja de trabajo y validación paso a paso | [10.11](#1011-fuentes-de-consulta-manual-tipo-e-por-validar) |
| **Catálogo en Excel**: libro con fuentes, consulta manual, resumen y retiradas (el CSV sigue disponible) | [8.3](#83-botones-de-la-barra-superior) |
| **Cruce de postulaciones (RF-02-F)** con la vigilancia proactiva, registros oficiales (ClinicalTrials.gov, FDA, PubMed) y la web | [11.3](#113-cruce-con-la-vigilancia-y-la-web) |
| **Captura más precisa**: el filtro sin IA ya no deja entrar texto de menús, leyendas, párrafos, páginas índice, empleos ni noticias no tecnológicas; la misma noticia no se repite por varios enlaces de una organización; Health Canada no trae productos de venta libre. **Depurar ruido** retira de la bandeja lo que ya había entrado | [10.12](#1012-depurar-ruido-de-captura) |
| **«En varias fuentes» cuenta organizaciones**: dos enlaces del mismo sitio (por ejemplo dos páginas de la FDA) son una sola fuente | [10.7](#107-misma-tecnología-en-varias-fuentes-corroboración) |

### Novedades del 17 de noviembre de 2026 (III seguimiento)

| Qué cambió | Dónde leerlo |
|---|---|
| **Enlace a la fuente original**: cada señal dice si su enlace es (Enlace exacto) o (Página de consulta, la fuente no ofrece enlace directo); en el segundo caso muestra la evidencia de captura. Reporte de enlaces por fuente y verificación de enlaces caídos (RF-001) | [10.9](#109-enlace-a-la-fuente-original-y-evidencia-de-captura) y [14.3](#143-reporte-de-enlaces-por-fuente) |
| **Prioridad de la fuente retirada** de pantallas, procesos y exportaciones; queda apagada por parámetro (OBS-001) | [4.4](#44-la-fuente-ya-no-se-prioriza), [8.7](#87-recargar-catálogo--qué-se-conserva) y [8.9](#89-url-original-de-la-matriz-y-etiquetas) |
| **Cargar matriz** desde el Catálogo de fuentes: validación, vista previa de diferencias y conflictos, reporte descargable y bitácora (OBS-002) | [8.10](#810-cargar-matriz-paso-a-paso) y [30.1](#301-origen) |
| **Buscador de tecnologías** en la pantalla principal, con módulo, etapa, estado y recorrido (RF-005) | [6.4](#64-buscar-una-tecnología-o-señal) |
| **Criterios de búsqueda**: solo Medicamentos y Dispositivos médicos activos; las demás categorías se activan desde Configuración (RF-006) | [25.6](#256-parámetros-de-fuentes-matriz-eh) |
| **Nuevo inventario de fuentes**: la matriz MATRIZ_FUENTES_ESCANEO_EH (primera hoja, un enlace por fila) reemplaza el catálogo anterior: 141 fuentes, una por enlace. Las fuentes anteriores quedan retiradas y sus señales pendientes pasan a la pestaña (Legacy) de la Bandeja de entrada | [8.1](#81-para-qué-sirve), [8.10](#810-cargar-matriz-paso-a-paso), [10.10](#1010-bandeja-legacy) y [30.1](#301-origen) |

### Novedades del 27 de octubre de 2026

Ajustes del consolidado de observaciones SI EAA (módulo 0: identificación y captura de señales):

| Qué cambió | Dónde leerlo |
|---|---|
| **Misma tecnología en varias fuentes**: la bandeja la marca «En N fuentes» y la sube en el orden, sin tocar el cribado ni el %P (RF-002) | [10.7](#107-misma-tecnología-en-varias-fuentes-corroboración) |
| **Datos de producto**: forma farmacéutica, concentración, vía, marca y modelo en cada señal (RF-003) | [10.3](#103-clasificar-una-señal-paso-a-paso) y [10.8](#108-de-dónde-salen-los-datos-de-producto) |
| **Matriz EH vigente**: 93 filas, 128 URL de consulta; las fuentes ya cargadas reciben las URL nuevas sin perder lo editado (OBS-002) | [8.7](#87-recargar-catálogo--qué-se-conserva) y [30.1](#301-origen) |
| **Sin priorización de fuentes**: era un comentario interno de la matriz; ya no ordena la cola ni pesa en la IA (06-11-2026) | [4.4](#44-la-fuente-ya-no-se-prioriza) |
| **URL original de la matriz** en cada fuente web, con etiqueta cuando se usa otra (06-11-2026) | [8.9](#89-url-original-de-la-matriz-y-etiquetas) |
| **Vigilancia que no se detiene**: tiempo máximo por fuente, avance en cualquier pantalla y tiempo estimado de fin (06-11-2026) | [9.3](#93-vigilancia-masiva) y [9.8](#98-tiempo-estimado-cómo-se-calcula) |
| **Cribado parametrizable** con explicación de dónde sale cada valor (06-11-2026) | [25.1](#251-gobierno-metodológico) |
| **Detectar fuentes con IA**: propone sitios que aún no están en el catálogo | [8.8](#88-detectar-fuentes-con-ia-paso-a-paso) |
| **Ver como otro perfil** (solo superadministrador) | [3.3](#33-ver-como-otro-perfil-solo-superadministrador) |
| CSV del catálogo legible en Excel (punto y coma, UTF-8) | [8.3](#83-botones-de-la-barra-superior) |
| **Filtro por fechas en la bandeja** («Desde / Hasta» de captura), agregado el 29 de octubre (RF-04) | [10.5](#105-filtros-y-canales) |

---

## Índice

1. [Presentación del sistema](#1-presentación-del-sistema)
2. [Acceso, pantalla de inicio y elementos comunes](#2-acceso-pantalla-de-inicio-y-elementos-comunes)
3. [Perfiles: quién hace qué](#3-perfiles-quién-hace-qué)
4. [Conceptos que debe dominar](#4-conceptos-que-debe-dominar)
5. [El ciclo completo (checklist maestro)](#5-el-ciclo-completo-checklist-maestro)
6. [Bandeja de trabajo](#6-bandeja-de-trabajo)
7. [Ciclos de escaneo](#7-ciclos-de-escaneo)
8. [Catálogo de fuentes](#8-catálogo-de-fuentes)
9. [Vigilancia](#9-vigilancia)
10. [Bandeja de entrada (staging)](#10-bandeja-de-entrada-staging)
11. [Postulaciones (canal reactivo)](#11-postulaciones-canal-reactivo)
12. [Filtrado y depuración](#12-filtrado-y-depuración)
13. [Priorización oficial (%P)](#13-priorización-oficial-p)
14. [Señales capturadas](#14-señales-capturadas)
15. [Evaluación temprana](#15-evaluación-temprana)
16. [Portal del revisor externo](#16-portal-del-revisor-externo)
17. [Diseminación (informes de adopción)](#17-diseminación-informes-de-adopción)
18. [Boletines del ciclo](#18-boletines-del-ciclo)
19. [Notas del equipo](#19-notas-del-equipo)
20. [Tablero estratégico](#20-tablero-estratégico)
21. [Alertas tempranas](#21-alertas-tempranas)
22. [Asistente IA](#22-asistente-ia)
23. [Bitácora de auditoría](#23-bitácora-de-auditoría)
24. [Usuarios y perfiles](#24-usuarios-y-perfiles)
25. [Configuración (administración)](#25-configuración-administración)
26. [Portales públicos](#26-portales-públicos)
27. [Rutinas por rol](#27-rutinas-por-rol)
28. [Problemas frecuentes (diagnóstico)](#28-problemas-frecuentes-diagnóstico)
29. [Glosario](#29-glosario)
30. [Anexo: matriz EH y flujo de escaneo](#30-anexo-matriz-eh-y-flujo-de-escaneo)

---

## 1. Presentación del sistema

### 1.1 Para qué existe

El escaneo de horizonte (EH) busca **tecnologías sanitarias emergentes** antes de que lleguen masivamente al mercado colombiano: medicamentos, dispositivos, procedimientos, diagnóstico, salud digital e inteligencia artificial clínica.

El sistema:

1. **Vigila** de forma automática (y manual) **141 fuentes** internacionales (una por enlace de la matriz de escaneo).
2. **Recibe** postulaciones externas con conflicto de interés declarado.
3. **Clasifica** lo capturado (clúster, tipología, condición).
4. **Filtra** duplicados y verifica novedad frente al INVIMA.
5. **Prioriza** con la matriz oficial P1–P6 del Manual Metodológico.
6. **Documenta** (ficha, informe o Mini-HTA) con revisión por pares.
7. **Disemina** recomendaciones, boletines, fichas públicas y alertas.
8. **Deja rastro** de cada decisión en una bitácora que no se borra.

Inspiración operativa: observatorios como el NIHR Innovation Observatory, adaptado a la metodología y gobierno del IETS.

### 1.2 Dos canales de entrada

| Canal | Quién lo alimenta | Cómo llega al ciclo |
|---|---|---|
| **Proactivo** | El sistema consulta fuentes (ClinicalTrials, FDA, EMA, HTA, fabricantes, revistas…) | Vigilancia → bandeja de entrada → asignación al ciclo |
| **Reactivo** | Una persona externa postula en `/postular` | Postulaciones (moderación) → bandeja → asignación |

Ambos canales terminan en la misma **bandeja de entrada**. No hay “cola mágica” distinta: lo que no se clasifica y asigna **no entra** a filtrado ni a priorización.

### 1.3 Qué no hace el sistema

- No decide solo si una tecnología se prioriza: los criterios P1–P6 los califican personas.
- No fusiona duplicados sin confirmación humana.
- No publica un informe sin el flujo editorial (incluido COI cuando aplica).
- No borra señales capturadas: el registro de captura se conserva.

---

## 2. Acceso, pantalla de inicio y elementos comunes

### 2.1 Cómo entrar

1. Abra la URL que le entregó TI (en desarrollo local suele ser `http://127.0.0.1:8000`).
2. En **Iniciar sesión**:
   - Correo institucional `@iets.org.co`.
   - Contraseña.
3. Pulse **Entrar**.

**Primera vez / contraseña temporal**

Si el superadministrador le creó la cuenta, verá una pantalla que **obliga a cambiar la contraseña** antes de usar el menú. Requisitos habituales: longitud mínima (10), no reutilizar la temporal, no usar el correo como contraseña. Tras el cambio se abre una sesión nueva (las anteriores quedan invalidadas).

**Google**

Si el instituto configuró Google Identity, verá el botón de Google. Solo correos del dominio permitido. Si no aparece, use correo y contraseña.

**Acceso de desarrollo**

En servidores de prueba puede verse «Acceso rápido como administrador». **En producción debe estar apagado.** Si lo ve en la URL pública del IETS, detenga el uso y avise a TI: cualquiera con un correo `@iets.org.co` podría entrar sin contraseña.

### 2.2 Qué hay en el encabezado (siempre visible)

| Elemento | Para qué sirve |
|---|---|
| **Menú (☰)** | Abre o cierra el listado de módulos |
| **Ciclo activo** | Pastilla con el código del ciclo (ej. `Ciclo IV - 2026`). Filtrado, priorización, evaluación y tableros trabajan sobre ese ciclo. Pulse para cambiar o ir a `/ciclos` |
| **Estado del ciclo** | «En filtrado», «En priorización», etc. |
| **En vivo** | El sistema está sincronizando cambios entre pantallas |
| **Modelo de IA** | Si MiniMax/Gemini está conectado |
| **Su nombre / perfil** | Cerrar sesión, cambiar contraseña, guía rápida y, para el superadministrador, **Ver como (cambiar de perfil)** (ver 3.3) |

**Regla de oro:** antes de priorizar, filtrar o mirar el tablero, confirme que el **ciclo del encabezado** es el correcto. Un error aquí es la causa más frecuente de “no veo mis tecnologías”.

### 2.3 Elementos que se repiten en casi todos los módulos

| Elemento | Cómo usarlo |
|---|---|
| **Título + ícono de ayuda (i)** | El tip explica el concepto en lenguaje del IETS |
| **Guía de fase** (caja superior) | Recuerda en qué paso metodológico está y qué sigue |
| **Filas de indicadores** | Conteos del módulo (sin asignar, aptas, etc.) |
| **Botones con tip** | Si están deshabilitados, el tip dice **por qué** (permiso o estado) |
| **Tablas / tarjetas** | Alternan vistas; la búsqueda filtra sin borrar datos |
| **Modales** | Formularios; Cancelar no guarda; Guardar valida campos |
| **Toasts** (avisos flotantes) | Confirmación o error; lea el texto completo |

### 2.4 Cerrar sesión

Use el menú de su perfil → salir. En equipos compartidos, cierre siempre la sesión.

---

### Logo institucional

El superadministrador lo carga en **Configuración › Apariencia › Identidad institucional**: arrastre la imagen o pulse **Cargar logo** (PNG, JPG o WebP, máximo 400 KB; mejor con fondo transparente). Se muestra en el menú lateral, en la pantalla de ingreso y en las pantallas públicas. **Quitar logo** vuelve al distintivo del sistema. El cambio queda en la bitácora de auditoría.

### Cómo están agrupadas las acciones

- **Vigilancia.** «Inventario» y «Ejecutar vigilancia» están juntos en la cabecera. Debajo del historial, una sola franja muestra la **vigilancia programada** (estado, intervalo, próxima y última corrida) con «Ejecutar ahora» y «Configurar». La **cola de ingesta** y la **vista previa de un enlace** están plegadas en esa misma tarjeta: pulse su título para abrirlas. La cola se abre sola cuando tiene trabajos.
- **Catálogo de fuentes.** Tres menús: **Descargar** (Excel o CSV), **Mantenimiento** (Sondear todas, Recargar catálogo) y **Agregar fuente** (Alta rápida, Registro completo, Cargar matriz, Detectar fuentes con IA). Cada opción dice qué hace y, si está bloqueada, por qué.
- **Configuración.** Las secciones están en un menú lateral agrupado por tema; a la derecha se ve la sección abierta con su explicación.

### Idioma de la interfaz

El selector con el globo (🌐) está en la cabecera, en la pantalla de ingreso y en las pantallas públicas. Ofrece **Español**, **English (UK)** e **English (US)**.

- Al cambiarlo la página se recarga y todo el sistema queda en ese idioma: menú, pantallas, ayudas, guía, mensajes y errores. El navegador recuerda la elección.
- El inglés británico y el americano difieren en ortografía (*prioritisation / prioritization*, *catalogue / catalog*, *programme / program*) y en el formato de fechas y números (26/11/2026 frente a 11/26/2026).
- El Asistente IA y el asistente de navegación responden en el idioma elegido.
- **No se traduce el contenido**: nombres y descripciones de las fuentes, títulos de señales, notas, boletines, postulaciones y lo que escriben las personas se muestran como se guardaron. Los documentos que se descargan (PDF, Excel, CSV) salen en español.
- Si un texto no tiene traducción se muestra en español; nunca queda un espacio vacío.

## 3. Perfiles: quién hace qué

### 3.1 Tabla operativa

| Tarea | Superadmin | Eval. técnico | Eval. clínico | Tomador | Revisor pares |
|---|:---:|:---:|:---:|:---:|:---:|
| Consultar casi todo | Sí | Sí | Sí | Sí | Sí |
| Crear / editar fuentes | Sí | Sí | Sí | — | — |
| Ejecutar vigilancia / sonda | Sí | Sí | Sí | — | — |
| Clasificar y asignar bandeja | Sí | Sí | Sí | — | — |
| Filtrado, fusión, novedad | Sí | Sí | Sí | — | — |
| Sincronizar INVIMA | Sí | Sí | — | — | — |
| Crear / editar ciclos | Sí | Sí | — | — | — |
| **Cerrar ciclo** | Sí | — | — | — | — |
| Calificar P1, P5, P6 | Sí | Sí | — | — | — |
| Calificar P2, P3, P4 | Sí | — | Sí | — | — |
| Informes / evaluación | Sí | Sí | Sí | — | Envío revisión |
| Notas | Sí | Sí | Sí | Sí | — |
| Tablero con capa presupuestal | Sí | — | — | Sí | — |
| Usuarios y configuración | Sí | — | — | — | — |
| Bitácora completa | Sí | — | — | — | — |

### 3.2 Mensajes cuando no puede actuar

El sistema no oculta todo: a menudo muestra el botón **apagado** con el motivo:

- «Su perfil (Tomador de decisiones) solo puede consultar…»
- «La fuente está retirada…»
- «Falta verificación de novedad…»

No intente “forzar” con otra URL: la API también bloqueará (403/409) y el intento puede quedar en bitácora.

### 3.3 Ver como otro perfil (solo superadministrador)

Sirve para comprobar qué ve y qué puede hacer cada perfil sin crear cuentas de prueba.

1. Pulse su nombre en la esquina superior derecha.
2. En **Ver como (cambiar de perfil)** elija Evaluador técnico, Evaluador clínico, Tomador de decisiones o Revisor por pares.
3. La pantalla se recarga con ese perfil: menús, botones apagados, rutas permitidas y **también los permisos del servidor** son los de ese perfil. Si abre una pantalla que el perfil no puede usar (ej. Configuración), el sistema lo devuelve a la Bandeja de trabajo.
4. Mientras dure, verá una franja ámbar «**Viendo como: …**» bajo el encabezado y un borde ámbar en su nombre.
5. Para terminar pulse **Volver a Superadministrador** en la franja, o elija «Volver a mi perfil» en el menú.

Reglas:

- Solo cambia el perfil **efectivo** de su sesión: su cuenta sigue siendo superadministrador y nadie más se ve afectado.
- Cada activación y cada regreso quedan en la bitácora (`auth:acting_role`, `auth:acting_role_end`).
- Los cambios que haga mientras actúa como otro perfil quedan a su nombre en la bitácora.
- La elección se recuerda al recargar la página y se borra al cerrar sesión.
- Otros perfiles no ven esta opción; el servidor ignora el intento si no es superadministrador.

---

## 4. Conceptos que debe dominar

### 4.1 Señal vs tecnología vs instancia en ciclo

```
Fuente vigilada
    → genera SEÑALES (Finding): título, URL, texto, huella
        → se proyecta a TECNOLOGÍA (Technology): unidad que dura años
            → se ASIGNA a un CICLO
                → crea INSTANCIA (CycleTechnology): estado y %P de ese ciclo
```

- La **señal** es evidencia de captura: no se descarta del sistema.
- La **tecnología** es lo que prioriza y evalúa.
- La **instancia** permite que en el Ciclo I quede “bajo vigilancia” y en el Ciclo II se reevalúe **sin borrar** el historial anterior.

### 4.2 Nivel de acceso de la fuente (A–E)

Contrato de datos (no confundir con “nivel de fuente” primaria/secundaria):

| Nivel | Significado práctico |
|---|---|
| **A** | API estable (ej. ClinicalTrials, openFDA): sus datos pre-llenan la ficha |
| **B** | Feed o descarga oficial (RSS, CSV, XML) |
| **C** | Página web estructurada: tablas o listados que se leen automáticamente |
| **D** | Página que solo confirma: se lee como texto y no pisa datos de A/B |
| **E** | Curaduría humana: login, pago o captcha; la consulta la hace una persona |

Indica **cómo** se obtiene el dato, no qué tan importante es la fuente. Todo el inventario se prueba en lote con **Sondear todas** (o solo A y B con **Solo A/B**); si dos fuentes se contradicen, prevalece el nivel más alto.

### 4.3 Nivel de fuente (matriz EH)

| Valor | Idea |
|---|---|
| **Primaria** | Produce el dato original (ensayo, fabricante, agencia que aprueba) |
| **Secundaria** | Resume o evalúa (HTA, revistas) |
| **Terciaria** | Compila o difunde (portales, redes) |
| **Por definir** | Aún no clasificada en la matriz |

### 4.4 La fuente ya no se prioriza

Por decisión del equipo técnico (06-11-2026) **no existe prioridad de fuente**. Lo que la matriz registra en la columna (Observaciones) es un criterio de aplicabilidad al proyecto y se guarda solo como texto: el cargue de la matriz nunca lo lee como prioridad.

- El (Catálogo de fuentes) no muestra prioridad, prioridad sugerida, botón (Aplicar) ni filtros u orden por prioridad.
- La vigilancia atiende las fuentes por orden alfabético; el cribado, los puntajes, los tableros, las alertas, la IA y el CSV del catálogo no usan la prioridad de la fuente.
- Los valores históricos se conservan en la base y en la bitácora, pero no se muestran ni se pueden editar mientras el parámetro `cfg.sources.priority_enabled` siga apagado. Se reactivará cuando el equipo técnico defina criterios tras la revisión de literatura.

Lo que distingue a una fuente es su **nivel** (primaria, secundaria, terciaria) y su **nivel de acceso** (A a E). Este ajuste no toca la priorización de señales ni de tecnologías: la relevancia de cada señal la ordena el cribado y la decide el %P.

### 4.5 %P vs screening_score

| Escala | Dónde | Qué es |
|---|---|---|
| **%P** | Priorización | Oficial: (suma P1–P6 / 6) × 100. Solo con los 6 criterios |
| **screening_score** | Señales | Heurística 0–100 para **ordenar** la cola. No decide priorización |

Cómo se suma el screening_score: +35 inminente / +25 transicional / +15 emergente; +12 si es medicamento, dispositivo o digital; +18 si menciona fase III, aprobación, FDA, EMA, NICE o regulador (o +10 si fase II o ensayo); +8 con área terapéutica; +10 con resumen de 120 caracteres o más; +7 si la tecnología está identificada aparte del título. Con **70 o más** se resalta en la cola.

### 4.6 Condición de la tecnología

| Valor | Significado |
|---|---|
| **Emergente** | Fases clínicas avanzadas, aún sin aprobación |
| **Nueva** | Aprobada en agencia de referencia hace ≤ 12 meses, sin adopción formal en el SGSSS |

Es distinta del “horizonte” heredado (emergente/transicional/inminente) que a veces ve en señales antiguas.

---

## 5. El ciclo completo (checklist maestro)

Use esta lista al abrir un ciclo nuevo. Márquela en papel o en una nota del sistema.

### Fase 0 — Preparación

- [ ] Superadmin o técnico crea el ciclo en `/ciclos` (código, apertura, corte, boletín).
- [ ] Ventana 10–16 semanas; no supera 3 ciclos formales del año.
- [ ] Todos eligen ese ciclo en el encabezado.
- [ ] (Opcional) Revisar salud de fuentes A/B y parámetros en Configuración.

### Fase 1 — Identificación

- [ ] Vigilancia masiva o por fuente (`/vigilancia`, `/fuentes`).
- [ ] Revisar cola: ok / parcial / error.
- [ ] En `/bandeja-entrada`: clasificar clúster + tipología (+ condición).
- [ ] Asignar por lotes al ciclo.
- [ ] Moderar `/postulaciones` si hay entradas reactivas.

### Fase 2 — Filtrado

- [ ] Pasar el ciclo a **En filtrado**.
- [ ] Barrido de duplicados → confirmar o descartar.
- [ ] Sincronizar INVIMA si el índice está viejo (>30 días).
- [ ] Declarar novedad de cada tecnología (vía válida).
- [ ] Revisar Listado Único por clúster.

### Fase 3 — Priorización

- [ ] Pasar a **En priorización**.
- [ ] Técnicos: P1, P5, P6.
- [ ] Clínicos: P2, P3, P4.
- [ ] Verificar que el %P aparece (6/6).
- [ ] Enviar priorizadas a evaluación cuando corresponda.

### Fase 4 — Evaluación y diseminación

- [ ] Pasar a **En evaluación**.
- [ ] Abrir ficha / informe / Mini-HTA; COI; revisiones.
- [ ] Generar informes de adopción en `/diseminacion`.
- [ ] Compilar y aprobar boletín.
- [ ] Revisar alertas y tablero.

### Fase 5 — Cierre

- [ ] Superadmin cierra el ciclo (justifica si hace falta).
- [ ] Revisar arrastre de “bajo vigilancia” al ciclo siguiente.
- [ ] Paquete ZIP / exportaciones según política del IETS.

---

## 6. Bandeja de trabajo

**Ruta:** `/` · **Menú:** Bandeja de trabajo

### 6.1 Para qué sirve

Es su “escritorio del día”: pendientes **de su perfil** (no de todo el instituto), cada uno con enlace a la tecnología y al módulo correcto.

### 6.2 Qué hacer al llegar

1. Confirme el **ciclo activo**.
2. Lea los indicadores del embudo (asignadas, filtradas, priorizadas…).
3. Abra la primera tarjeta pendiente.
4. Resuélvala (calificar, revisar, moderar…).
5. Vuelva a `/` o use el enlace “siguiente” si la interfaz lo ofrece.

### 6.3 Si la bandeja está vacía

- No hay trabajo para su perfil en ese ciclo, **o**
- El ciclo está en un estado donde aún no aplica su tarea (ej. clínico en “En configuración”), **o**
- Está mirando el ciclo equivocado.

### 6.4 Buscar una tecnología o señal

En la parte superior de la (Bandeja de trabajo) está la caja (Buscar una tecnología o señal). La ven todos los perfiles con acceso de lectura.

1. Escriba al menos dos letras de cualquier parte del nombre. No importan mayúsculas ni tildes: portatil, PORTÁTIL y "monitor port" encuentran lo mismo. Puede escribir en español o en inglés (se busca en el texto tal como se capturó y como lo clasificó el equipo).
2. La búsqueda revisa el nombre comercial, la DCI, la marca, el fabricante, el título de la señal y la fuente.
3. Cada resultado muestra: nombre, tipo de tecnología, módulo y etapa actual, estado (incluidas las descartadas en la bandeja, las excluidas, las fusionadas por duplicado y las de ciclos cerrados), responsable del último cambio, fecha del último cambio y en qué campo coincidió.
4. (Abrir el registro) lleva directo a la tecnología en su módulo (Bandeja de entrada, Filtrado, Priorización o Evaluación).
5. (Ver recorrido por etapas) muestra, tomado de la bitácora, cada cambio de etapa con fecha, hora y persona.

Si no hay resultados, el sistema lo dice y sugiere buscar por otra parte del nombre, la DCI, el fabricante o la fuente.

---

## 7. Ciclos de escaneo

**Ruta:** `/ciclos` · **Quién crea:** evaluador técnico o superadmin · **Quién cierra:** solo superadmin

### 7.1 Para qué sirve

Sin ciclo no hay priorización ni evaluación contextualizadas. El ciclo es la **carpeta formal** del trabajo de 10–16 semanas.

### 7.2 Crear un ciclo (paso a paso)

1. Entre a **Ciclos de escaneo**.
2. Pulse **Nuevo ciclo** (o equivalente).
3. Complete:
   - **Código:** único, ej. `Ciclo I - 2027` (no se puede repetir).
   - **Fecha de apertura:** primer día de trabajo; define el año de la cuota.
   - **Corte de datos:** hasta qué fecha se consideran capturas para el ciclo.
   - **Fecha de boletín:** ancla la ventana de 10–16 semanas.
   - Notas internas (opcional).
4. Guarde. El ciclo nace en **En configuración**.

Si el sistema rechaza:

- Ventana fuera de 10–16 semanas → ajuste fechas.
- Ya hay 3 ciclos formales ese año → cierre o espere; no fuerce un cuarto.

### 7.3 Estados y transiciones

```
En configuración
      ↓
En filtrado
      ↓
En priorización
      ↓
En evaluación
      ↓
Cerrado / consolidado
```

Los retrocesos están permitidos en la máquina de estados, pero **no “deshacen”** fusión ni calificaciones ya hechas: solo reabren el momento del flujo. Ante la duda, consulte a coordinación metodológica.

**Cómo cambiar de estado**

1. Abra el ciclo.
2. Use el botón de transición (ej. “Pasar a filtrado”).
3. Si responde error, lea el mensaje: suele faltar trabajo previo o el permiso de cierre.

### 7.4 Cerrar un ciclo

1. Solo el **superadministrador** ve la acción de cierre.
2. El sistema puede pedir justificación si hay tecnologías en evaluación sin informe.
3. Tras el cierre:
   - No se puede volver a calificar (409).
   - Los puntajes quedan congelados.
   - Lo **bajo vigilancia** se propone para arrastre al ciclo siguiente.

### 7.5 Eliminar un ciclo

Solo ciclos en configuración **sin trabajo**. Si ya hay tecnologías asignadas, no se elimina: se cierra o se deja histórico.

### 7.6 Selector del encabezado vs lista de ciclos

- La lista en `/ciclos` administra todos.
- El selector del encabezado elige **con cuál está trabajando ahora**.
- Cambiar el selector no cambia el estado del ciclo; solo cambia el contexto de las pantallas.

---

## 8. Catálogo de fuentes

**Ruta:** `/fuentes` · **Menú:** Catálogo de fuentes

### 8.1 Para qué sirve

Es el inventario maestro: **qué enlaces** se vigilan, con qué **adaptador**, cada cuánto y con qué **flujo** (recorrido, OCR, IA, búsqueda web).

Desde el 17 de noviembre de 2026 el inventario es la primera hoja de la matriz **MATRIZ_FUENTES_ESCANEO_EH** (hoja MATRIZ ESCANEO, un enlace por fila): **142 filas de 85 organizaciones**, que dan **141 fuentes**, una por URL distinta (la URL de RedETS aparece en dos filas y se carga una vez). Cada fuente tiene el código EH- seguido del ID de la fila y lleva su propio contexto: tipo de material, ruta de acceso, información a consultar, observaciones y restricciones.

| Tipo de enlace | Fuentes | Qué hace el sistema |
|---|---|---|
| Consulta activa con rastreo web | 108 | Recorre el enlace (hasta 12 páginas) y extrae señales con el contexto de la fila |
| Consulta activa por API oficial | 7 | ClinicalTrials.gov, PubMed, CTIS, PCORI, EMA, openFDA (Drugs@FDA) y Health Canada se consultan por su API, que entrega datos estructurados; la URL de la matriz queda como referencia. ICTRP de la OMS no tiene API pública estable y se rastrea como página web |
| Consulta manual | 8 | Sitios con validación humana, registro de usuario o prohibición de rastreo (Boston Scientific, dos enlaces de EMA, Scopus, Synapse, Embase, IHSI): quedan en el catálogo sin ingesta |
| Información general o metodológica | 18 | Quedan como referencia, sin ingesta |

La búsqueda web dentro del dominio se hace una sola vez por dominio (desde su primer enlace activo), para no repetir la misma búsqueda en cada enlace de una organización. Las fuentes del inventario anterior quedan retiradas, no borradas (ver 10.10).

### 8.2 Las tres pestañas

#### Catálogo

Listado en tarjetas o tabla. Filtros:

| Filtro | Uso |
|---|---|
| Buscar | Código, nombre, alias, URL, ruta de acceso, qué consultar |
| Bloque | Uno de los seis bloques |
| Nivel de acceso | A–E |
| Prioridad | Alta, media, baja, revisar, sin asignar |
| Nivel de fuente | Primaria, secundaria, terciaria, por definir |
| Tipo de tecnología | MED, DM, BIOM, IA, SD, MT |
| Incluir retiradas | Muestra fuentes del inventario anterior |

**Insignias en la tarjeta**

- Acceso A–E  
- Prioridad …  
- Primaria / Secundaria / …  
- Salud (verde / ámbar / rojo / sin sonda)  
- Contraste / Retirada / Ingesta apagada
- Chips: Recorrido · OCR · IA · Búsqueda web (tachados = apagados)
- **Etiqueta de URL** — «URL original de la matriz» o, si se usa otra, por qué (ver 8.9)

#### Salud de fuentes

Resultado de la última **sonda** (prueba sin guardar señales). Interprete:

| Color | Significado | Qué hacer |
|---|---|---|
| Verde | Responde y el formato coincide | Seguir vigilando |
| Ámbar | Responde pero cambió el formato o vino vacío | Revisar; la ingesta puede suspenderse |
| Rojo | No responde | Revisar URL, red, o apagar temporalmente |
| Sin sonda | Nunca se ha probado | Ejecutar Sonda o «Sondear todas» |

#### Cobertura

Tecnologías que aparecen en fuentes de **contraste** y no están en el ciclo. Cada hueco debe justificarse o incorporarse. Si el conteo es 0, o aún no hay señales de contraste, o todo ya está en el ciclo.

### 8.3 Botones de la barra superior

| Botón | Quién | Qué hace |
|---|---|---|
| **Descargar Excel** | Quien consulta | Descarga el catálogo en Excel (`.xlsx`): hoja **Fuentes** (una fila por fuente activa, con filtros, hipervínculos, estado de la sonda y señales capturadas), **Consulta manual (tipo E)** (estado de validación), **Resumen** (conteos por nivel de acceso, nivel de fuente, tipo de tecnología, adaptador y salud), **Retiradas** e **Información** |
| **CSV** | Quien consulta | El mismo listado en texto separado por punto y coma (UTF-8), para otros programas |
| **Sondear todas** | Vigilancia | Prueba todas las fuentes activas en segundo plano, de a varias a la vez (ver 8.11) |
| **Recargar catálogo** | Escritura | Reaplica el catálogo verificado D-06 y la matriz que ya está cargada en el sistema (no pide archivo): crea las fuentes oficiales que falten, actualiza sus datos y URL de la matriz, retira las que ya no están en el catálogo y **conserva** lo que el equipo editó y las fuentes registradas a mano. No borra señales (ver 8.7) |
| **Cargar matriz** | Escritura | Sube el Excel de la matriz (MATRIZ_FUENTES_ESCANEO_EH, `.xlsx`) o una hoja de Google Sheets, la valida y muestra la vista previa de diferencias antes de aplicar (ver 8.10) |
| **Detectar fuentes con IA** | Escritura | Busca en la web sitios de escaneo de horizonte que aún no están en el catálogo y los propone (ver 8.8) |
| **Alta rápida** | Escritura | Nombre + URL en minutos |
| **Agregar fuente** | Escritura | Formulario completo |

### 8.11 Sondear todas las fuentes (paso a paso)

1. En el Catálogo de fuentes pulse **Sondear todas**. El sistema pasa a la pestaña **Salud de fuentes**.
2. La sonda corre en el servidor, de a seis fuentes a la vez: puede seguir trabajando. El avance (fuentes probadas, verdes, ámbar y rojas) se actualiza solo.
3. Al terminar aparece el resumen. Pulse **Informe de sondas (Excel)**: trae cada fuente con su estado, el detalle y la **acción sugerida**, con las rojas y ámbar primero.
4. Lleve al equipo técnico las fuentes rojas o con «la dirección principal ya no existe»: hay que corregir su URL en la matriz o pasarlas a consulta manual.

**Solo A/B** prueba solo las fuentes de nivel A y B. La sonda no modifica señales; deja el estado en la fuente y una entrada en la bitácora.

### 8.4 Alta rápida (paso a paso)

1. **Alta rápida**.
2. Nombre y URL (`https://…`).
3. Elija bloque.
4. (Recomendado) **Vista previa**: el servidor visita el enlace y muestra título/extracto **sin guardar**.
5. **Registrar fuente**.
6. Queda: adaptador HTML, acceso D, frecuencia semanal, ingesta activa, nivel de fuente “por definir”.
7. Ábrala con **Editar** y complete matriz + flujo.

**Errores frecuentes**

- URL sin `http://` o `https://` → rechazo.
- URL ya existente → “Ya existe una fuente con esa URL…”.

### 8.5 Editar fuente (formulario completo)

#### Datos básicos

- Nombre, URL, bloque, **nivel de acceso** (A–E), adaptador, frecuencia, país, idioma, descripción.
- Configuración JSON del conector (solo si sabe qué poner; vacío = `{}`).
- Casilla **Ingesta activa**.

#### Matriz EH

| Campo | Qué poner |
|---|---|
| Nivel de fuente | Primaria / secundaria / terciaria / por definir |
| Origen | Según lista (DOC_TEC, etc.) |
| Tipo de material | Informes, alertas, bases… |
| Tipos de tecnología | Marque uno o varios códigos |
| URLs de entrada | Una por línea; el recorrido las visita; sirven de **respaldo** si la URL principal falla |
| URLs de referencia | Metodología o documentos de apoyo |
| Ruta de acceso | Ej. `medscape → News & Perspective → Cardiology` |
| Qué consultar | Instrucción para la persona y para la IA |
| Observaciones / restricciones | Acceso pago, login, etc. |

#### Flujo de escaneo

Marque solo lo que aplica a **esta** fuente:

1. Recorrido del sitio  
2. Seguir enlaces internos (pide recorrido encendido)  
3. OCR  
4. Lectura con IA  
5. Búsqueda web  

Campos numéricos / texto:

- Páginas a seguir: `0` = usa el valor global de Configuración › Prompts.  
- Dominio de búsqueda: vacío = dominio de la URL.  
- Palabras guía: además de las derivadas de la ruta.  
- Términos propios de búsqueda: vacío = términos por tipo de tecnología (hoja *Criterios de búsqueda*; MT usa todas las categorías). Orden: propios, por tipo y genéricos; rotan a diario.

**Probar búsqueda web** (con la fuente ya guardada): lanza consultas `site:` y muestra resultados **sin** crear señales. Ideal antes de una vigilancia grande.

### 8.6 Acciones por tarjeta

| Acción | Efecto |
|---|---|
| **Ficha** | Detalle + notas + ruta + URLs |
| **Sonda** | Prueba de salud |
| **Ingerir** | Vigilancia inmediata de esa fuente |
| **Editar** | Formulario |
| **Deshabilitar / Habilitar** | Apaga o enciende ingesta (no borra historial) |
| **Eliminar** | Solo fuentes locales **sin** señales; las del catálogo no se borran |

### 8.7 Recargar catálogo — qué se conserva

La recarga corre sola en cada arranque del servidor y con el botón **Recargar catálogo**.

| Siempre se restituye desde D-06 | Sigue a la matriz vigente… | …salvo que el equipo lo haya editado |
|---|---|---|
| URL, título oficial, adaptador | Nivel de fuente, tipos de tecnología | Se conserva lo editado |
| Nivel de acceso A–E | URLs de entrada y de referencia | Se conserva lo editado |
| Frecuencia / metadatos de catálogo | Ruta de acceso, qué consultar, tipo de material, observaciones, restricciones | Se conserva lo editado |
| | Flujo de escaneo (`scan_profile`) | Se conserva lo editado |

**Cómo sabe el sistema qué editó el equipo.** Cada vez que alguien guarda **Editar fuente**, el campo cambiado queda marcado como *editado* y la recarga ya no lo pisa. Lo que nadie tocó sigue a la matriz: si la matriz agrega una URL, la fuente la recibe en el siguiente arranque.

En la primera recarga de una base anterior a esta regla, el sistema consulta la **bitácora**: solo cuenta como editado lo que una persona cambió desde el formulario de la fuente. Las URL que el equipo agregó de sitios que la matriz no menciona se conservan junto a las de la matriz.

Para volver a la matriz un campo editado: importe el Excel en Configuración marcando **«Sobrescribir lo editado»** (ver 25.6); eso pisa los campos y borra la marca.

### 8.8 Detectar fuentes con IA (paso a paso)

Para ampliar el inventario con sitios que todavía no se vigilan (agencias regulatorias y de ETS, registros de ensayos, pipelines de fabricantes, redes como EuroScan o i-HTS, portales de noticias).

1. En `/fuentes` pulse **Detectar fuentes con IA** (requiere permiso de edición de fuentes).
2. (Opcional) Marque **tipos de tecnología**, escriba un **tema** (ej. «terapias génicas») y un **país o región** (ej. «Latinoamérica»).
3. (Opcional) Marque **Activar la ingesta al dar de alta**; si no, la fuente queda apagada hasta que la verifique.
4. Pulse **Detectar**. El sistema:
   - pide a la IA consultas de búsqueda y las lanza en los motores web configurados;
   - **descarta por dominio** lo que ya existe en el catálogo o en la base (también subdominios: `news.medtronic.com` cuenta como Medtronic);
   - clasifica cada candidata (nombre, país, bloque, tipos, nivel de acceso A–E, nivel de fuente y por qué sirve);
   - visita cada una: las que no responden van a «Descartadas porque no respondieron»; las que piden acceso se marcan «acceso restringido».
5. Revise la lista y pulse **Dar de alta** en cada propuesta útil, o marque varias y **Dar de alta las seleccionadas**.
6. La fuente nueva queda con la etiqueta `propuesta_ia` y la nota «Propuesta por IA – pendiente de verificación». Ábrala con **Editar**, confirme los datos y active la ingesta.

Límites por corrida: 2 llamadas a la IA, hasta 6 consultas web y 12 candidatas; máximo 6 corridas por persona cada 10 minutos. Cada corrida y cada alta quedan en la bitácora.

Sin IA disponible, la detección sigue con los resultados de búsqueda filtrados contra el catálogo y clasificados por reglas; el aviso lo indica («IA no disponible…»). Con la búsqueda web apagada, no hay de dónde proponer y el sistema lo dice.

**Nada se crea sin su clic.** La IA propone; la persona decide.

### 8.9 URL original de la matriz y etiquetas

La URL principal de cada fuente web es la **original de la matriz EH** (Excel «FUENTES DE INFORMACIÓN PROACTIVA EH»): la primera URL de consulta de su fila. El rastreo entra primero por ahí y luego recorre las demás URL de la fila. Debajo de la URL, cada tarjeta y la ficha muestran una etiqueta:

| Etiqueta | Qué significa |
|---|---|
| **URL original de la matriz** | Es la URL que reporta el Excel |
| **API oficial (distinta a la matriz)** | ClinicalTrials.gov, openFDA, Health Canada, PubMed, CTIS: se consultan por su API, que entrega datos estructurados. La ficha muestra la URL que reporta la matriz |
| **URL ajustada (la de la matriz no sirve)** | La URL del Excel no responde o está vacía; la ficha dice por qué (hoy solo EuroScan, que opera como i-HTS) |
| **Página específica (distinta a la matriz)** | Fuente que comparte fila con otra y usa su propia página |
| **URL distinta a la matriz** | Alguien cambió la URL; la ficha muestra la original para comparar |
| **Propuesta por IA** / **Registrada por el equipo** | No está en la matriz |

El indicador **URL original de la matriz** del catálogo cuenta cuántas fuentes usan la del Excel y cuántas otra. Si una URL del Excel deja de funcionar, corríjala en el Excel y vuelva a cargar la matriz con (Cargar matriz).

Las tarjetas y la ficha de la fuente ya no muestran etiquetas de prioridad ni (Prioridad sugerida): ver 4.4.

### 8.10 Cargar matriz (paso a paso)

**Quién:** perfiles con permiso de edición de fuentes (superadministrador, evaluador técnico y evaluador clínico). Los demás ven el botón deshabilitado con la explicación.

**Formato vigente.** La primera hoja del Excel MATRIZ_FUENTES_ESCANEO_EH, con un enlace por fila y estas columnas: ID, Tipo de Entidad, Nivel de Fuente, Fuente verificada, Sitio / organización, País, Tipo de Tecnología, Origen del enlace, N° original, URL, Dominio, Tipo de material, Ruta de acceso, Información a consultar, Observaciones, Estructura de publicación, Formato, Frecuencia de actualización, Idioma, Disponibilidad de Interfaz y Restricciones de uso. El ID identifica la fuente entre cargas (código EH-ID): no lo cambie para un enlace que ya existe. Las hojas Criterios de búsqueda y Fuentes sin buscador se leen como apoyo. El sistema reconoce solo el formato; el formato anterior (una fila por organización) se sigue aceptando.

Con el formato por enlace la matriz es el inventario completo: al aplicar, las fuentes que no son de la matriz pasan a legacy (se retiran, no se borran) y la vista previa las lista en (Inventario anterior que pasa a legacy). Las registradas a mano por el equipo se conservan.

**Explicación sencilla.** La matriz de fuentes es el Excel donde el equipo técnico lista las fuentes que el sistema debe vigilar y las URL de cada una. Cargar la matriz es entregarle al sistema la versión nueva de ese Excel. El sistema la lee, la compara con lo que ya tiene y le muestra qué cambiaría, sin guardar nada. Usted revisa y confirma. Solo entonces el sistema aplica los cambios, le entrega un reporte y deja registro en la bitácora de quién hizo el cargue y qué cambió.

1. En `/fuentes` pulse (Cargar matriz).
2. Elija (Subir Excel) y seleccione el archivo `.xlsx`, o (URL de Google Sheets) y pegue el enlace de la hoja.
3. Pulse (Comparar con el inventario). El sistema valida y muestra:
   - **Validación de la matriz**: cuántas filas, fuentes y URL de consulta trae, y las inconsistencias (cantidad declarada en la columna Cant URL SI EAA distinta de las URL listadas, URL repetidas en una celda). Las inconsistencias se informan y **no se corrigen en silencio**: ajústelas en el Excel y vuelva a cargarlo.
   - **Fuentes nuevas**, **con cambios** (valor actual frente al de la matriz), **sin cambios** y **en el inventario pero no en esta matriz** (retiradas de la matriz; no se borran solas).
   - **Conflictos**: campos que el equipo editó a mano y que la matriz trae distintos, marcados (Editado por el equipo).
4. (Opcional) (Descargar reporte) baja la vista previa en CSV.
5. Marque qué crear y qué actualizar. Deje sin marcar (Sobrescribir lo editado en el panel) para respetar lo editado por el equipo.
6. Pulse (Aplicar). Se descarga el reporte final y queda en la bitácora el cargue completo y, por fuente, el valor anterior y el nuevo de cada campo.

Cómo se leen las URL: manda el **texto escrito** en la celda; el hipervínculo oculto solo se usa si el texto no trae ninguna URL. Las rutas #/ de sitios tipo SPA se conservan.

---

## 9. Vigilancia

**Ruta:** `/vigilancia` · **Menú:** 1. Vigilancia

### 9.1 Para qué sirve

Poner fuentes en la **cola de ingesta**, ejecutarlas y ver el resultado (cuántas señales nuevas).

### 9.2 Paneles de la pantalla

1. **Guía de fase** — recuerda identificación.  
2. **Indicadores** — trabajos, fuentes vigiladas, etc.  
3. **Cola de trabajos** — cada job: fuente, estado, mensaje, tiempos.  
4. **Listado de fuentes vigilables** — con Ingerir / estado de circuito.

### 9.3 Vigilancia masiva

1. Confirme que las fuentes deseadas tienen **ingesta activa** y no están retiradas.  
2. Lance la vigilancia masiva / programada según botones de la pantalla.  
3. Las fuentes se atienden por orden alfabético (no hay prioridad de fuentes). La corrida **vive en el servidor**: puede cambiar de módulo o de pestaña, o cerrar el navegador, y sigue. Mientras corre, una **barra flotante** en cualquier pantalla y el título de la pestaña del navegador muestran el avance y el tiempo restante; al terminar aparece un aviso.  
4. Observe la cola:
   - **pendiente** — espera turno  
   - **ejecutando** — en curso  
   - **ok** — terminó bien  
   - **parcial** — trajo algo o visitó, con matices  
   - **error** — falló; se reintenta hasta 3 veces  

Un error en una fuente **no detiene** las demás. Ninguna fuente puede tardar más del **tiempo máximo por fuente** (20 min de fábrica, parámetro `ingest.job_timeout_minutes`): si lo supera, se cierra con error «Tiempo máximo agotado» y la corrida sigue con la siguiente.

El resumen de arriba muestra: **Avance** (fuentes procesadas de esta corrida), **Transcurrido**, **Tiempo restante** (con su rango), **Fin estimado** (hora), qué fuente se está rastreando **ahora** (cuánto lleva y cuánto suele tardar) y cuáles **siguen**.

### 9.4 Vigilancia de una sola fuente

Desde Vigilancia o desde Fuentes › **Ingerir**:

1. Espere el toast: “Ingesta: X nuevas de Y”.  
2. Vaya a **Bandeja de entrada** a clasificar.

### 9.5 Qué ocurre “por detrás” en cada fuente (para interpretar logs)

1. Descarga de la URL principal.  
2. Si falla → prueba URLs de entrada (**respaldo**).  
3. Si el flujo lo permite → **búsqueda web** en el dominio.  
4. Recorrido: principal → entradas → resultados de búsqueda → fichas internas guiadas por la ruta.  
5. De cada página lee el cuerpo y, además, lo que la página trae **plegado u oculto**: acordeones, pestañas, bloques «ver más» y **tablas**. No toma menús, pies de página ni avisos de cookies.  
6. Abre los **documentos PDF** que encuentra y lee su texto.  
7. OCR / IA según casillas globales y de la fuente.  
8. Huella: si el contenido ya existía, no crea señal duplicada.

**Lo que no puede leer.** Los sitios que arman su contenido con JavaScript después de cargar (por ejemplo AIFA o Boehringer) o que exigen pulsar para pedir más datos al servidor: ese contenido no está en la página descargada. El Diagnóstico para la matriz (14.3) los señala para registrar una URL más específica o pasarlos a consulta manual.

**Cortesía con los sitios.** Entre todas las fuentes en curso, el sistema abre como mucho dos páginas a la vez de un mismo sitio. El inventario tiene varios enlaces de un mismo sitio (FDA, BD, Abbott): sin ese tope el sitio dejaba de responder y la vigilancia se quedaba esperando.

Detalle de pasos: Configuración › Integración con IA › bitácora de entrada a sitios.

### 9.6 Circuito abierto

Si una fuente falla muchas veces seguidas, el sistema la **pausa horas** (“circuito abierto”) para no castigar un sitio caído. El tip en pantalla lo explica. Cuando pase el tiempo, vuelva a intentar o revise la URL.

### 9.8 Tiempo estimado: cómo se calcula

1. **Por fuente.** Cada fuente se estima con el promedio de sus 3 últimas corridas en ese mismo servidor (una API tarda segundos; un sitio con muchas páginas y lectura con IA, minutos). Sin historial, usa lo observado en la corrida.
2. **Velocidad de hoy.** Lo que tardaron las fuentes ya terminadas frente a lo habitual ajusta el resto (si hoy va el doble de lento, el tiempo restante crece).
3. **Cola real.** Se reparte el trabajo entre los carriles en el orden en que el servidor lo atenderá, incluidos los reintentos programados.

El **rango** sale de la variación de cada fuente. Medido sobre 4 corridas reales: con historial, el error típico fue del 11 % y el fin real cayó dentro del rango; con fuentes nuevas o URL recién cambiadas, el error típico fue de 25 a 33 % y se corrige a medida que terminan fuentes. «¿Cómo se calcula el tiempo?», en el resumen, muestra cuántas fuentes tienen historial y la velocidad medida.

### 9.9 Si la vigilancia parece detenida

- **Sin respuesta del servidor**: el aviso amarillo lo dice. Si el servidor se reinició, al volver retoma las fuentes que quedaron a medias.
- **Esperando reintentos**: una fuente falló y se reintenta a la hora indicada.
- **Una fuente «sin novedades hace X min»**: se cerrará sola al llegar al tiempo máximo por fuente.
- En el servidor de Render (plan gratuito), mientras haya fuentes en cola, el propio servicio se mantiene despierto, aunque nadie tenga la página abierta.
- **Si el servidor se reinicia o se suspende a mitad de una vigilancia**, un vigilante de la cola la reanuda sola a los pocos segundos de volver: no hay que relanzarla. La pantalla lo indica con el aviso «la cola la cuida un vigilante».
- **Si una fuente falla al guardar** (por ejemplo, con la base ocupada), no queda «en curso»: se cierra sola y se reintenta un minuto después.
- **Si una corrida vieja sigue marcada «en curso»**, pulse (Detener): cancela lo que quedaba en cola. Lo ya capturado se conserva.

**Búsqueda web sin esperas.** La vigilancia ya no espera a los buscadores gratuitos, que bloquean las consultas hechas desde la nube. Primero visita las páginas de la **base de conocimiento de búsqueda** (ver 25.6); si faltan, lee el **mapa del sitio** de la propia fuente. En el detalle de cada fuente verá de dónde salieron los resultados: «base de conocimiento», «mapa del sitio» o el nombre del buscador.

### 9.7 Vista previa de URL

Prueba un enlace sin registrar fuente. Útil antes de un alta rápida. No debe usarse para sondear la red interna del instituto (el servidor lo bloquea).

---

### 9.10 Si la IA o el OCR no están disponibles

La vigilancia no se detiene sin IA. Cuando la IA está apagada, sin cupo, sin respuesta o con error, el sistema sigue así:

| Herramienta | Sin IA ni OCR |
|---|---|
| Registros por API (ClinicalTrials.gov, PubMed, openFDA, EMA, CTIS, PCORI, Health Canada) | Igual que con IA: los datos vienen estructurados de la API |
| Páginas web y tablas de pipeline | Extracción por reglas con filtro de calidad: se descartan menús y secciones, noticias de ciencia sin relación con salud, notas corporativas y páginas administrativas. Las filas de pipeline se conservan siempre |
| Documentos PDF | Se lee el texto con el extractor de PDF; sin OCR no se leen PDF escaneados como imagen |
| (¿Es confiable?) | Dictamen solo con los chequeos automáticos |
| Asistente IA | Responde con los datos del sistema (modelo "fallback (sin IA)") |
| Asistente de navegación | Usa el buscador local de pantallas |
| Buscador, enlaces, duplicados, INVIMA, priorización | No dependen de la IA |

En la ficha de la fuente, en (Vigilancia), el paso de extracción dice "IA apagada o sin configurar: solo extracción por reglas" y cuántos candidatos descartó el filtro.

## 10. Bandeja de entrada (staging)

**Ruta:** `/bandeja-entrada` · **Menú:** Bandeja de entrada

### 10.1 Para qué sirve

Las señales/tecnologías **recién capturadas** esperan aquí **sin ciclo**. Usted:

1. Clasifica (clúster, tipología, condición, datos de identidad).  
2. Asigna por lotes al ciclo del encabezado.

**Sin clúster y tipología no hay asignación.**

### 10.2 Indicadores

| Indicador | Significado |
|---|---|
| Sin asignar | Aún no están en ningún ciclo |
| Total capturadas | Universo de la bandeja |
| Sin clúster / sin tipología | Bloquean el lote |
| **En varias fuentes** | Señales sin asignar que otra fuente también reporta (ver 10.7) |
| Listas para asignar | Ya tienen lo mínimo |

**Qué muestra cada fila**

- Nombre de la señal y, debajo, sus **datos de producto** en etiquetas grises: forma farmacéutica, concentración, vía, marca, modelo, fabricante (los que se conozcan).
- Fuente, fecha y canal; botón **↗** para abrir la fuente original.
- **En N fuentes** (azul) si otras fuentes reportan la misma tecnología.
- Columna **Cribado**: el puntaje y, si aplica, el bono de corroboración (ej. `73 +5`).

**Orden de la lista:** cribado + bono de corroboración, de mayor a menor; a igual puntaje, lo más reciente primero.

### 10.3 Clasificar una señal (paso a paso)

1. Pulse la fila o **Clasificar**.  
2. Revise título, fuente, resumen, enlace (botón **↗ Abrir la fuente original**).
   - Debajo del tipo de enlace hay **tres botones**, cada uno con un icono para copiar la dirección:
     - **URL exacta de la señal**: abre la ficha, noticia o registro donde está la señal. Si la fuente no da enlace por ítem, el botón se llama (Página donde está la señal) y abre la página con la señal resaltada.
     - **Página consultada**: el listado, buscador o canal que el sistema recorrió para encontrarla.
     - **Fuente original**: la dirección de la fuente en el catálogo.
   - El sistema **verifica solo** cada enlace. Si la URL exacta ya no existe en el sitio (error 404 o página de «no encontrado»), no se ofrece como exacta: la señal pasa a su página consultada y un texto lo explica, con la dirección que dejó de existir.
3. (Recomendado) **Sugerir clasificación**: propone clúster, tipología y condición, cada uno con su **confianza** y de dónde sale:
   - **Reglas del catálogo**: palabras clave, CIE-10 y MeSH de los clústeres y tipologías.
   - **Aprendido de clasificaciones anteriores**: señales parecidas que el equipo ya clasificó. (Ver las señales parecidas) las lista con su parecido.
   - **IA**: si está encendida, arbitra viendo esos mismos ejemplos.
   - Si la señal se parece a otras que el equipo **descartó**, un aviso amarillo lo dice con el motivo de aquel descarte.
   - Si no hay evidencia: “Clasifique manualmente”.
   - La sugerencia **no es decisión final hasta guardar**. Lo que usted guarda es de lo que el sistema aprende.
4. Complete o corrija:
   - Nombre comercial
   - DCI / INN (mejora desduplicación e INVIMA)
   - Fabricante
   - **Datos de producto**: forma farmacéutica, concentración y vía de administración (medicamentos); marca y modelo (dispositivos). Vienen pre-llenados cuando la captura los encontró: confírmelos o corríjalos.
   - Indicación  
   - Clúster (obligatorio para asignar)  
   - Tipología (obligatoria para asignar)  
   - Condición (emergente / nueva)  
   - Fechas regulatorias si las conoce (FDA, EMA, etc.)
5. Si la señal está corroborada, el recuadro **Detectada en N fuentes** lista las otras fuentes, el nombre con que la reportan, si coincidió por NCT o por similitud, y un enlace a cada una.
6. **Guardar**.

### 10.4 Asignar por lotes

1. Marque las filas **listas** (clúster + tipología).  
2. Confirme el ciclo del encabezado.  
3. **Asignar al ciclo**.  
4. Toast: cuántas se asignaron; las que ya estaban se informan como omitidas.  
5. Continúe en **Filtrado** (cuando el ciclo esté en ese estado).

### 10.5 Filtros y canales

La barra de filtros de la bandeja permite combinar:

| Filtro | Qué hace |
|---|---|
| Buscar | Texto en el nombre, la DCI o el resumen |
| Fuente | Solo las señales de una fuente del catálogo |
| Canal | **Búsqueda proactiva** (vigilancia) o **Postulación reactiva** (postulación aceptada) |
| **Desde / Hasta** | Rango de fechas de captura, en hora de Colombia; «Hasta» incluye todo ese día |
| Solo detectadas en varias fuentes | Señales corroboradas (ver 10.7) |

### 10.6 Errores típicos

| Situación | Causa | Qué hacer |
|---|---|---|
| No deja asignar | Falta clúster o tipología | Clasifique primero |
| “Ya estaban en el ciclo” | Duplicó la asignación | Normal; no crea duplicado de instancia |
| No ve la señal | Filtro de búsqueda activo | Limpie filtros (incluidas las fechas «Desde / Hasta» y la casilla «Solo detectadas en varias fuentes») |
| Aparece «No se pudo cargar la bandeja de entrada» | El servidor está iniciando (llevaba un rato sin uso) o está ocupado con una vigilancia | **La bandeja no está vacía**: las señales siguen guardadas. La pantalla reintenta sola cada 20 segundos; también puede pulsar (Reintentar ahora) |
| Arriba de la lista dice «No se pudo actualizar la lista» | La última actualización no llegó | Se sigue mostrando la lista anterior. Pulse (Reintentar) |

### 10.7 Misma tecnología en varias fuentes (corroboración)

Cuando la misma tecnología aparece en fuentes distintas (por ejemplo FDA, EMA y Health Canada), la bandeja lo hace visible:

- **Cómo se reconoce:** mismo identificador de ensayo (NCT), o nombre comercial / DCI equivalentes según el **umbral de similitud** de Configuración (el mismo del filtrado de duplicados; por defecto 85). Se ignoran mayúsculas, dosis y presentaciones.
- **Qué cuenta:** solo **organizaciones distintas**. Dos señales de la misma fuente, o de dos enlaces del mismo sitio (el inventario tiene varios enlaces de la FDA, de BD o de Abbott), son la misma fuente vista dos veces, no una corroboración. Una postulación del canal reactivo cuenta como una fuente más. También cuenta una tecnología que ya está en un ciclo desde otra fuente.
- **Qué cambia:** cada fuente adicional suma **5 puntos al orden** de la bandeja (máximo 15). Así lo que se repite se revisa primero.
- **Qué no cambia:** el cribado, el %P y la clasificación. **Repetirse no es importancia clínica**: la priorización oficial sigue siendo P1–P6.
- **Filtro:** casilla **Solo detectadas en varias fuentes**.
- **No fusiona nada.** Si son la misma tecnología y quiere un solo registro, use **Filtrado y depuración › Duplicados** (la fusión siempre la confirma una persona).

El cálculo se actualiza solo al abrir la bandeja cuando hubo capturas o cambios. **Mientras corre una vigilancia** se actualiza como mucho cada 3 minutos y otra vez al terminar, para que la bandeja abra rápido: durante ese rato la etiqueta (En N fuentes) de las señales recién capturadas puede tardar en aparecer.

### 10.9 Enlace a la fuente original y evidencia de captura

En el panel (Origen de la señal) y en la ficha de la señal el enlace lleva una etiqueta:

| Etiqueta | Qué significa | Qué hacer |
|---|---|---|
| **Enlace exacto** | La URL lleva a la ficha, artículo, documento o registro de la señal | Pulse (Abrir la señal en la fuente) |
| **Página de consulta, la fuente no ofrece enlace directo** | La fuente publica la señal en un listado, buscador, tabla de pipeline o portada sin enlace propio por ítem | Si aparece **(Abrir la página y resaltar la señal)**, púlselo: abre la página y el navegador se desplaza a la señal y la resalta (Chrome, Edge, Safari y Firefox recientes). Si no aparece, lea la **Evidencia de captura** (título, fragmento, fecha y hora, URL consultada) y busque ese texto con (Abrir la página de consulta) |
| **Sin enlace** | La señal no trae URL | Use la evidencia de captura |

Si la verificación de enlaces encontró que la URL no responde o redirige a la portada, aparece además la marca (No responde) o (Redirige a otra página).

**Desde la lista de la bandeja.** El icono junto a la fecha de cada señal abre su fuente. Si es una **lupa**, el sistema ya ubicó la señal dentro de la página: al pulsarla, la página abre con la señal resaltada. Si es una flecha, abre la ficha o el artículo de la señal (o la página de consulta, si aún no se ubicó).

**Qué resalta el navegador.** La cita textual de la fuente cuando la hay; si no, el nombre de la tecnología. Si la página no trae ese texto, abre normalmente, sin resaltado. No aplica a documentos PDF.

**Registros oficiales.** Las señales de la FDA (medicamentos, 510(k), De Novo y PMA con suplemento) y de Health Canada (medicamentos) abren la **ficha del producto** en el registro, no el buscador. Las capturadas antes se corrigieron solas; la dirección anterior queda en la evidencia.

**Enlaces por Google Noticias.** Algunas fuentes bloquean la lectura automática (revistas y portales de noticias) y se leen por su canal en Google Noticias. Ese enlace redirige al artículo original, pero no admite resaltado: en el artículo, busque el título de la señal con Ctrl+F. El detalle de la señal lo avisa.

**Cómo se ubica la señal exacta.** Al capturar, **automáticamente cuando el sistema está libre** (sin que nadie pulse nada; cada señal se intenta una vez) y cuando alguien pulsa (Ubicar señales exactas) en Señales capturadas (ver 14.3), el sistema busca cada señal de «página de consulta» en su página: si la página tiene un enlace con el nombre de la señal (o declara la URL del producto en sus datos estructurados, como los pipelines de Novartis), la señal pasa a **Enlace exacto** y la URL anterior queda en la evidencia; si no, y el nombre está en la página, arma el enlace que la resalta. Nunca inventa un enlace: si no encuentra la señal, lo dice y deja la evidencia.

### 10.11 Fuentes de consulta manual (tipo E) por validar

Las fuentes de nivel de acceso **E** (bases con licencia, portales con usuario o captcha, por ejemplo Scopus, Embase, Synapse o IHSI) no entran a la vigilancia automática: una persona del equipo las consulta en su navegador según la frecuencia de la matriz (semanal, salvo que la matriz diga otra). Para que no se pierdan de vista:

- **Al entrar** al sistema, quien tiene permiso de la bandeja ve la ventana **«Por favor valide manualmente estas fuentes»** con las pendientes. (Validar ahora) lleva a la Bandeja de entrada; (Más tarde) la cierra hasta la próxima sesión.
- **En el menú**, junto a «Bandeja de entrada», un contador naranja dice cuántas están por validar.
- **En la Bandeja de entrada**, un aviso amarillo arriba con el botón (Validar ahora).
- **En la Bandeja de trabajo**, la tarjeta «Fuentes tipo E por validar».

**Paso a paso:**

1. Pulse (Validar ahora). Se abre la lista: primero las nunca validadas y las vencidas.
2. En cada fuente lea **Qué consultar** y **Restricciones**, y pulse (Abrir la fuente). Haga la consulta con su usuario institucional.
3. Por cada tecnología nueva que encuentre pulse (Registrar señal encontrada): nombre, enlace exacto, tecnología, tipo y resumen. Queda en la bandeja con esa fuente.
4. Elija el **Resultado de la consulta**: «Consultada, sin novedades», «Consultada, con señales registradas» o «No se pudo consultar» (en este caso escriba el motivo). Pulse (Marcar como validada).
5. La fuente sale de la lista hasta su próxima revisión según su frecuencia; si no se pudo consultar, vuelve a aparecer al día siguiente.

Cada validación queda en la bitácora (quién, cuándo, resultado, nota y señales registradas). El Excel del catálogo trae la hoja «Consulta manual (tipo E)» con el estado de todas.

### 10.12 Depurar ruido de captura

La vigilancia sin IA lee páginas y decide con reglas qué es una señal. Esas reglas se afinaron el 24 de noviembre de 2026: ya no entran textos de menú, leyendas de tablas, párrafos, páginas índice, ofertas de empleo ni noticias que no hablan de una tecnología. Lo que había entrado antes se retira con **Depurar ruido** (botón de la Bandeja de entrada; solo lo ve quien administra la configuración):

1. Pulse **Depurar ruido**. El sistema revisa las señales sin asignar y muestra cuántas no son tecnologías, agrupadas por motivo, con ejemplos. Todavía no cambia nada.
2. Revise la lista. Si está de acuerdo, pulse **Pasar N a Descartadas**.
3. Las señales pasan a la pestaña **Descartadas** con el motivo «Ruido de captura: …». No se borran: desde esa pestaña se restauran.

Usa exactamente el mismo criterio que la captura: no descarta nada que hoy entraría. Solo toca señales proactivas sin asignar; las postulaciones y lo que ya está en un ciclo no se tocan.

### 10.10 Bandeja Legacy

La pestaña (Legacy) de la Bandeja de entrada reúne las señales pendientes de las fuentes del inventario anterior, retiradas al cargar la matriz por enlace. No se borró nada: las señales, sus tecnologías y la bitácora siguen en el sistema.

1. Abra (Bandeja de entrada) y pulse la pestaña (Legacy). El número entre paréntesis es cuántas hay.
2. Revise cada señal como en Pendientes (filtros, enlace a la fuente, evidencia).
3. Pulse (Recuperar) en una señal, o seleccione varias y pulse (Recuperar N), para devolverlas a Pendientes y clasificarlas o asignarlas al ciclo.

Solo pasan a Legacy las señales que estaban sin asignar. Las que ya estaban en un ciclo, fusionadas o descartadas siguen donde estaban. Una señal recuperada no vuelve a Legacy en los siguientes arranques. Recuperar requiere permiso de asignación de la bandeja y queda en bitácora (acción staging:recover_legacy).

### 10.8 De dónde salen los datos de producto

En este orden de confianza; lo de abajo solo completa lo que falte:

1. **Conector oficial** (openFDA): forma, vía, concentración, marca y titular tal como los publica la agencia.
2. **Lectura con IA** de la página: solo si el texto lo dice.
3. **Reglas sobre el título**: forma, concentración y vía se leen del título y **no** se asignan cuando el título combina varias tecnologías (ej. «A, B y C»); marca (palabra con ® o ™) y modelo (código con números tras «model/modelo») también se buscan en el resumen.

Los valores se muestran en español («Inyectable», «Subcutánea»…). Nunca se pisa lo que un evaluador ya diligenció. Las señales capturadas antes de esta versión se completaron automáticamente una sola vez al actualizar el sistema.

---

## 11. Postulaciones (canal reactivo)

**Ruta:** `/postulaciones` · Público: `/postular`

### 11.1 Flujo externo

1. La persona entra a `/postular`.  
2. Llena los **3 campos obligatorios**: **Tecnología reportada** (nombre comercial o DCI), **Indicación propuesta** y **Fuente de información** (al menos un enlace `http://` o `https://`). También son obligatorios su **correo** y la firma de la declaración de **conflicto de interés**.  
   Fabricante, fase de desarrollo, mecanismo de acción, nombre y organización son **Información complementaria** opcional: si no tiene el dato, puede escribir «No disponible».  
   > Requerimiento replanteado por pruebas del equipo metodológico (nov 2026).  
3. Envía (reCAPTCHA si está activo; si no, modo degradado con tope por IP).  
4. Estado: **recibida**.

### 11.2 Moderación interna (paso a paso)

1. Abra Postulaciones.  
2. Filtre por “recibida”.  
3. Lea el contenido y el COI. La tarjeta y la ventana de revisión muestran todos los campos que diligenció la persona; los vacíos aparecen como «—».  
4. Revise el **Cruce con la vigilancia y la web** (ver 11.3): dice si la vigilancia ya detectó la tecnología y qué registros oficiales la mencionan.
5. **Aceptar** → la tecnología entra a la bandeja como **reactiva** (aún debe clasificarse/asignarse). Lo que mostraba el cruce queda guardado con la tecnología.
6. **Rechazar** → escriba el motivo; queda en bitácora.

No acepte postulaciones incompletas “para salir del paso”: contaminan filtrado y priorización.

### 11.3 Cruce con la vigilancia y la web

Cada postulación se cruza sola al llegar (RF-02-F); el botón (Cruzar de nuevo) repite el cruce cuando quiera.

| Bloque | Qué muestra | Cómo se obtiene |
|---|---|---|
| **Vigilancia proactiva** | Las señales del sistema que corresponden a la misma tecnología, con su fuente, su estado y el enlace a la señal exacta (o el que abre la página y la resalta) | Mismo comparador del Filtrado (NCT compartido o nombre/DCI sobre el umbral). También cuenta cuando el nombre postulado aparece completo en el de la señal («Lutathera» en «Lutathera (AAA601)») |
| **Registros oficiales** | Fichas de ClinicalTrials.gov, FDA (medicamentos y dispositivos 510k) y PubMed que mencionan el nombre comercial o la DCI | Consulta directa a las API públicas de esos registros |
| **Web** | Resultados de los buscadores configurados que **mencionan** la tecnología; los oficiales y los del catálogo van marcados | Los buscadores devuelven a veces resultados ajenos: el sistema descarta los que no mencionan la tecnología y dice cuántos descartó |

El cruce no acepta ni rechaza: es evidencia para decidir. Si la vigilancia ya la detectó, al aceptarla la bandeja la marcará «En varias fuentes».

---


### Diseminación: informes con validación, origen y paquete con vista previa (versión 7.11.0)

- **Borrador y validado.** Todo informe nace como **borrador**, lo redacte una persona o la IA. Para que salga a quien decide, alguien con permiso de redacción lo abre y pulsa **Validar informe**: con eso confirma que revisó el contenido. El informe necesita impacto definido y un contenido mínimo.
- **Editar un validado lo devuelve a borrador.** Si cambia el título, el contenido o el impacto de un informe validado, vuelve a borrador y hay que validarlo de nuevo. También puede devolverlo con «Devolver a borrador» y escribir el motivo. Un informe validado no se elimina sin devolverlo antes.
- **Indicadores.** Por validar, validados, **IA sin revisar** (generados desde una señal que nadie ha editado ni validado) e impacto.
- **Filtros.** Pestañas por estado con su conteo, búsqueda (también por señal o tecnología), origen (a mano, con IA, preliminar sin IA), impacto y «Solo del ciclo actual».
- **Origen a la vista.** Cada tarjeta muestra la tecnología y la señal de la que sale el informe.
- **Ventana de lectura.** A la derecha del contenido: estado, datos (origen, quién lo creó y editó, extensión) y el **recorrido** (creado, editado, validado, devuelto, con fecha y persona). «Descargar Markdown» baja el informe.
- **Paquete del ciclo.** Antes de descargar, la tarjeta dice **qué trae** (tecnologías del Listado Único, informes de evaluación, recomendaciones, notas, boletín) y **qué se queda por fuera** (recomendaciones sin validar, informes en redacción, confidenciales). Solo viajan las recomendaciones validadas, salvo que marque «Incluir borradores».
- **Exportar CSV.** Descarga el listado de informes con estado, impacto, origen y quién validó. Queda en la bitácora.
- **Boletines.** Un boletín aprobado y aún sin publicar ahora dice «Aprobado, listo para publicar».

> **Importante:** los informes que existían antes de esta versión quedan como **borrador**, porque nadie los había validado de forma explícita. Mientras no se validen, no se incluyen en el paquete (a menos que marque «Incluir borradores»).

### Evaluación: expediente por pestañas, observaciones con estado y versiones (versión 7.10.0)

- **Indicadores.** Arriba verá cuántas tecnologías no tienen expediente, cuántos expedientes están en redacción, en revisión, en comité y publicados, y cuántas **observaciones abiertas** hay en el ciclo.
- **Cola.** Busque por nombre, DCI o clúster y filtre por estado editorial. Cada tecnología muestra su avance, las observaciones sin resolver y los revisores externos que aún no entregan.
- **Expediente por pestañas.** «Documento» (campos y vista previa), «Revisión por pares» (revisores e invitaciones), «Observaciones» y «Versiones». Los botones de guardar y de cambio de estado están siempre arriba.
- **Cambios sin guardar.** Mientras edita aparece el aviso «Cambios sin guardar». El sistema pregunta antes de cambiar de tecnología o de cerrar la pestaña, y no deja mover el documento de estado hasta guardar.
- **Avance por sección.** Bajo la completitud, cada sección (ficha, informe, Mini-HTA) dice cuántos campos lleva. Un campo con texto queda marcado en verde y, si tiene observaciones abiertas, lo indica debajo.
- **Observaciones con estado.** Cada observación está abierta o resuelta. Quien redacta la resuelve con «Resolver» y puede escribir qué cambió; quien revisa puede reabrirla. Al aprobar en comité con observaciones abiertas, el sistema avisa y pide confirmar.
- **Versiones.** Cada versión dice el estado, la fecha, quién la generó y qué campos cambiaron frente a la anterior. «Ver esta versión» muestra el documento como estaba.
- **Revisores.** Cada revisor aparece con su estado, si firmó el conflicto de interés y cuántos días le quedan al enlace.
- **Exportar.** «Exportar CSV» (arriba) descarga el estado editorial de todo el ciclo; la descarga queda en la bitácora. El HTML institucional y el PDF del documento están en el menú «Exportar» del expediente.

### Priorización: avance, matriz del ciclo y recorrido (versión 7.9.0)

- **Indicadores.** Además de la cola y las franjas, verá cuántas tecnologías **le tocan a usted** (les falta un criterio que su perfil califica) y cuántas ya pasaron a evaluación.
- **Avance de la matriz.** Una barra muestra cuántas tecnologías tienen los seis criterios y, debajo, cada criterio (P1 a P6) con cuántas respuestas lleva. Los que califica su perfil aparecen resaltados.
- **Cola.** Cada tecnología trae seis marcas, una por criterio: verde es «Sí», gris es «No», hueca es pendiente y ámbar es pendiente que le toca a usted. Puede filtrar por avance (con criterios pendientes o matriz completa) y ordenar por cribado, %P, cercanía a completar, calificación reciente o nombre.
- **Matriz del ciclo.** El botón «Matriz del ciclo» cambia la pantalla a una tabla con una fila por tecnología y una columna por criterio, con puntos, %P y estado. Pulse el nombre para abrirla y calificar.
- **Cambiar una respuesta.** Si un criterio ya tiene respuesta y la cambia, el sistema pide una justificación de al menos 10 caracteres. Repetir la misma respuesta no la pide.
- **Recorrido.** Bajo la matriz de cada tecnología, «Recorrido en la matriz» muestra quién calificó o cambió cada criterio, cuándo, con qué justificación, y cada vez que la matriz quedó completa.
- **Siguiente que me toca.** Al pie del detalle, lleva a la siguiente tecnología de la página que espera una respuesta suya.
- **Exportar CSV.** Descarga la matriz completa del ciclo con la respuesta de cada criterio, quién la dio, cuándo y su justificación. La descarga queda en la bitácora.

### Moderación de postulaciones (versión 7.8.0)

- **Indicadores.** Arriba de la cola: por moderar, las que esperan 7 días o más, las pendientes con conflicto de interés declarado, aceptadas, rechazadas (con el motivo más frecuente) y el tiempo de respuesta (mediana en días).
- **Buscar y filtrar.** Busque por tecnología, indicación, fabricante, postulante o radicado. Filtre por conflicto de interés, ordene por antigüedad o deje solo las que esperan 7 días o más. Cada pestaña muestra cuántas hay.
- **Radicado.** Cada postulación tiene un radicado (`POS-2026-00012`). Quien postula lo recibe al enviar el formulario.
- **Duplicados.** Si hay otra postulación de la misma tecnología (mismo nombre comercial o misma DCI), la tarjeta lo avisa con el radicado y el estado de la otra; pulse el radicado para abrirla. El formulario no deja que la misma persona radique dos veces la misma tecnología mientras la primera siga en moderación.
- **Revisar y decidir.** La ventana muestra los datos, el cruce con la vigilancia y la web, y a la derecha la decisión y el **recorrido** (recibida, cruces, rechazo, reapertura, aceptación, con fecha y persona).
- **Rechazar con motivo.** Elija el motivo de la lista (fuera de alcance, ya en vigilancia, duplicada, fuente insuficiente, sin novedad, datos incompletos, no válida). La nota es opcional salvo en «Otro motivo». Quien postula solo ve el motivo de la lista, nunca la nota.
- **Reabrir.** Una postulación rechazada se puede devolver a la cola con «Reabrir», explicando por qué. Una aceptada no se reabre: ya creó una señal en la bandeja de entrada.
- **Exportar CSV.** Descarga las postulaciones del filtro actual con su decisión y motivo. La descarga queda en la bitácora.

**Para quien postula.** En `/postular`, «¿Ya postuló? Consulte el estado de su postulación» pide el radicado y el correo y responde si está en moderación, aceptada o no aceptada. Con un correo distinto al de la postulación no muestra nada.

## 12. Filtrado y depuración

**Ruta:** `/filtrado` · **Requisito:** ciclo en **En filtrado** (o transición válida)

### 12.1 Por qué existe este módulo

Calificar P1–P6 cuesta seis juicios. Hacerlo sobre un **duplicado** o un **genérico** mal clasificado desperdicia el recurso más escaso: el tiempo del evaluador.

Ordene el trabajo en tres pestañas: **Duplicados → Novedad → Listado único**.

### 12.2 Pestaña Duplicados

#### Ejecutar el barrido

1. Pulse **Barrido de duplicados** (o el botón equivalente).  
2. Espere la lista de **propuestas** (no fusiones automáticas).

El motor compara nombre comercial, DCI, NCT y fabricante con varios algoritmos. Reglas clave:

- **Mismo NCT** → casi siempre el mismo desarrollo (propuesta fuerte).  
- **Mismo nombre, distinto fabricante** → suelen ser competidores; el umbral exige más evidencia.  
- **Usted** confirma o descarta.

#### Confirmar fusión

1. Abra la propuesta; revise puntajes y fichas.  
2. Elija cuál es la **principal** (la que permanece).  
3. Confirme.  
4. La absorbida queda enlazada (`merged_into_id`), sale del Listado Único, **no se borra**.

#### Descartar

Si no son el mismo desarrollo, descarte. Queda rastro para no reproponer el par en vano.

### 12.3 Pestaña Novedad

#### Regla dura

**Sin verificación de novedad válida en este ciclo, no se puede calificar** (error 409).

#### Vías que cumplen

| Vía | Cuándo marcarla |
|---|---|
| No disponible en el país | Sin registro sanitario vigente en Colombia |
| Nueva indicación | Ya registrada, nueva condición |
| Nueva forma farmacéutica | Cambio de vía/presentación con impacto clínico |
| Nueva combinación | Asociación de principios ya existentes |

#### Vías que niegan (no aptas a priorización)

- Genérico / biosimilar  
- Modificación menor de empaque/presentación  

#### Cómo registrar

1. Seleccione la tecnología.  
2. Elija la vía.  
3. Si elige “otra”, escriba justificación.  
4. (Recomendado) **Cruce INVIMA** para apoyar “no disponible en el país”.  
5. Guarde.

La novedad es **por ciclo**: lo novedoso en 2026 puede no serlo en 2027.

### 12.4 Índice INVIMA

| Acción | Quién | Notas |
|---|---|---|
| Sincronizar desde datos.gov.co | Técnico / superadmin | Puede fallar un conjunto y otros no |
| Cargar archivo CSV/Excel | Idem | Contingencia sin red |

Si llevan **más de 30 días** sin sincronizar, la pantalla alerta: un índice viejo da falsos “no registrados”.

**Limitación conocida:** algunos conjuntos abiertos no traen principio activo; la búsqueda por DCI puede degradarse. El sistema lo advierte en pantalla.

### 12.5 Listado Único

Vista por clúster de lo que sobrevivió. Exporte CSV para mesas de trabajo o anexos. Es la base que alimenta la cola de priorización.

### 12.6 Normalización (opcional)

Canoniza códigos ATC, CIE-10, MeSH, GMDN/EMDN. Si falta un código, propone candidatos; **una persona confirma**.

---

## 13. Priorización oficial (%P)

**Ruta:** `/priorizacion` · **Requisito:** ciclo en **En priorización** + tecnologías filtradas aptas

### 13.1 Si no hay ciclo seleccionado

Verá un mensaje pidiendo crear o seleccionar ciclo. Use el encabezado o `/ciclos`.

### 13.2 Qué ve en pantalla

- Filtros de estado (por calificar, priorizadas, bajo vigilancia…).  
- Cola de tecnologías con:
  - progreso X/6 criterios  
  - %P (solo si 6/6)  
  - marca “le toca” según su perfil  
  - si viene arrastrada de otro ciclo  

### 13.3 Matriz P1–P6 (detalle)

| ID | Pregunta (resumen) | Perfil | Pre-llenado |
|:---:|---|---|:---:|
| **P1** | ¿Es nueva / no está disponible en el país? | Técnico | Sí (INVIMA / evidencias) |
| **P2** | ¿Condición de alta mortalidad, morbilidad o deterioro grave de CV? | Clínico | — |
| **P3** | ¿Alta carga de enfermedad o impacto financiero sustancial al SGSSS? | Clínico | — |
| **P4** | ¿Impacto organizacional importante (ruta clínica, infraestructura, entrenamiento)? | Clínico | — |
| **P5** | ¿Aprobada por EMA o FDA en los últimos 12 meses? | Técnico | Sí |
| **P6** | ¿En evaluación regulatoria de referencia en ≤ 6 meses? | Técnico | Sí |

### 13.4 Cómo calificar (paso a paso)

1. Elija una tecnología de la cola (prioridad: las que “le tocan”).  
2. Lea el expediente resumido (indicación, fechas, sugerencias).  
3. Para cada criterio de su perfil:
   - Revise la **sugerencia** (si existe) y el motivo.  
   - Marque **Sí** o **No**.  
   - Escriba justificación cuando la metodología lo pida.  
4. Guarde / envíe la calificación.  
5. Si otro perfil aún no califica, el %P seguirá vacío: coordine.

**Importante:** el pre-llenado **nunca** se aplica solo. Si lo confirma sin leer, usted asume la decisión.

### 13.5 Clasificación automática al completar los 6

| Puntos | %P | Resultado | Siguiente paso |
|:---:|:---:|---|---|
| 4–6 | ≥ 66,67 | **Priorizada** | Evaluación temprana |
| 3 | 50 | **Bajo vigilancia** | Seguimiento; arrastre |
| 0–2 | ≤ 33,33 | **No priorizada** | Queda registro; no pasa a evaluación |

### 13.6 Acciones adicionales

- **Pasar a evaluación temprana** — cuando esté priorizada.  
- **Excluir del ciclo** — con motivo; no borra la tecnología del sistema.

### 13.7 Si no puede calificar

| Mensaje / síntoma | Causa |
|---|---|
| 403 | Su perfil no califica ese Pi |
| 409 novedad | Falta verificación o vía que niega |
| 409 cerrado | Ciclo cerrado / congelado |
| %P en blanco | Faltan criterios |

---

## 14. Señales capturadas

**Ruta:** `/senales`

### 14.1 Para qué sirve

Cola de **señales** (no la matriz oficial). Ordenadas por `screening_score` para revisar ruido, enriquecer textos o descartar basura temprana.

### 14.2 Acciones habituales

- Filtrar por estado: nuevo, revisado, priorizado (cribado), descartado.  
- Abrir detalle.  
- **Enriquecer con IA** (si hay modelo): reescribe resumen y sugiere campos; usted confirma.  
- Eliminar solo si **no** entró a un ciclo (si ya es expediente, use descartar / excluir en el flujo metodológico).

No use esta pantalla como sustituto de `/priorizacion`.

### 14.3 Reporte de enlaces por fuente

Arriba de la lista está la tarjeta «Enlaces a la fuente original» con dos botones siempre visibles: (Ubicar señales exactas) y (Reporte de enlaces). Pulse (Reporte de enlaces). Muestra, por fuente, cuántas señales tienen enlace exacto, cuántas solo página de consulta (con evidencia), cuántas no tienen enlace y cuántas no responden.

- (Clasificar señales): vuelve a clasificar todas las señales y guarda su evidencia de captura. No cambia ninguna URL. Queda en bitácora.
- (Verificar enlaces): abre cada enlace en segundo plano. **Ya no hace falta pulsarlo**: el sistema verifica solo los enlaces nuevos cuando está libre, por tandas. Distingue cuatro casos: **Responde**; **No responde** (error 404 o página de «no encontrado»: la señal pasa a su página consultada); **El sitio bloquea la verificación automática** (en el navegador abre); y **sin respuesta** (se reintenta al día siguiente). A un mismo sitio le pide las páginas de a una y con pausa, y si el sitio rechaza varias seguidas lo deja en paz hasta el día siguiente. Antes marcaba los que no responden o redirigen a la portada. Tarda unos minutos; el avance aparece en el mismo panel. Queda en bitácora.
- (Ubicar señales exactas): busca cada señal de «página de consulta» en su página y la lleva a enlace exacto o a enlace que la resalta (ver 10.9). Corre en segundo plano y muestra cuántas ubicó. Queda en bitácora. **Ya no hace falta pulsarlo para las señales nuevas o anteriores**: el sistema lo hace solo cuando está libre. Úselo para reintentar las que quedaron sin ubicar, por ejemplo después de corregir una URL en la matriz.
- (Diagnóstico en Excel) y (CSV): el reporte por fuente para el equipo técnico.

La pestaña **Diagnóstico para la matriz** dice, por fuente, si hay que **mejorar la matriz** y cómo:

| Diagnóstico | ¿Cambiar la matriz? | Qué hacer |
|---|---|---|
| Enlaces exactos | No | Nada |
| La fuente no tiene enlace por ítem | No | Nada: el sistema abre la página y resalta la señal |
| Actualizar la URL en la matriz | **Sí** | La URL no responde, redirige o ya no existe: registre la dirección vigente |
| La matriz apunta a la portada | **Sí** | Registre la URL de la sección donde se publican las novedades |
| La matriz apunta a un buscador | **Sí** | Registre un listado fijo, un canal RSS o una descarga oficial |
| La señal no se puede ubicar en la página | **Sí** | La página carga con JavaScript o cambió: registre una URL más específica o pase la fuente a consulta manual |

Requieren permiso de edición de señales; consultar y descargar está abierto a todos los perfiles.

---

## 15. Evaluación temprana

**Ruta:** `/evaluacion` · **Menú:** 3. Evaluación

### 15.1 Productos

| Producto | Uso típico |
|---|---|
| **Ficha** | Caracterización breve |
| **Informe** | Documento más amplio |
| **Mini-HTA** | Cuando puntaje/parámetros lo sugieren |

### 15.2 Flujo editorial (estados)

```
Borrador
  → Revisión interna
    → Revisión externa
      → Observado (vuelve a corregir) 
        → Comité
          → Publicado
```

### 15.3 Paso a paso sugerido

1. Confirme ciclo en **En evaluación** y tecnología priorizada.  
2. Abra o cree el expediente.  
3. Complete secciones del cuerpo.  
4. Declare **COI** cuando el flujo lo exija (sin COI no avanza).  
5. Envíe a revisión interna.  
6. Invite revisor externo (correo o copiar enlace si no hay SMTP).  
7. Atienda observaciones.  
8. Pase a comité y publique.  
9. Exporte la versión institucional: **Exportar HTML institucional** o **Descargar PDF**.

### 15.4 Invitaciones

- Token con vigencia (defecto **10 días**, parametrizable).  
- Puede **revocar** una invitación pendiente.  
- El revisor entra por `/revisar/...` sin cuenta IETS.

---

## 16. Portal del revisor externo

**Ruta:** `/revisar/:token` (sin login del menú interno)

### 16.1 Qué debe hacer el revisor

1. Abrir el enlace del correo (o el que le pegaron).  
2. Leer las instrucciones de COI y **declarar**.  
3. Revisar el expediente (solo tras COI).  
4. Comentar por secciones / campos.  
5. Emitir veredicto.  
6. Si el enlace venció, pedir uno nuevo al equipo IETS.

### 16.2 Qué ve el equipo IETS

En Evaluación: estado de la asignación, comentarios, necesidad de corrección, posibilidad de reenviar.

---

## 17. Diseminación (informes de adopción)

**Ruta:** `/diseminacion` · **Menú:** 4. Diseminación

### 17.1 Para qué sirve

Redactar la **recomendación de adopción para Colombia** (diferente del expediente de evaluación temprana, aunque se nutre de él).

### 17.2 Paso a paso

1. Seleccione la señal/tecnología.  
2. **Generar**:
   - Con IA si está configurada;  
   - o plantilla “fallback” para completar a mano.  
3. Edite el texto.  
4. Indique impacto esperado (clínico, presupuestal, equidad: alto/medio/bajo).  
5. Guarde. El sistema registra si el origen fue IA, manual o editado.

### 17.3 Paquete del ciclo

Desde administración / API de paquete: ZIP con Listado Único, informes aprobados, recomendaciones, notas y boletín **sin** confidenciales. Útil para entrega a dirección.

---

## 18. Boletines del ciclo

**Ruta:** `/boletines`

### 18.1 Paso a paso

1. Seleccione el ciclo.  
2. **Compilar** borrador a partir de lo publicado/priorizado según reglas del módulo.  
3. Revisar contenido.  
4. **Aprobar** (líder / perfil habilitado).  
5. **Publicar** y exportar: **Ver HTML ejecutivo** (pestaña nueva) o **Descargar PDF** (A4, listo para distribuir).
6. **Enviar a la alta dirección**: aparece cuando el boletín ya está publicado (ver 18.2).

### 18.2 Enviar el boletín a la alta dirección

1. En el boletín publicado pulse **Enviar a la alta dirección**.
2. Escriba los correos separados por coma. La lista se recuerda para el siguiente boletín.
3. Pulse **Enviar boletín**. Cada destinatario recibe un correo con las cifras del ciclo y el PDF adjunto.

Bajo el título del boletín queda la línea **Último envío** con fecha, número de destinatarios y quién lo envió; el envío también queda en la bitácora. Si un correo es rechazado, el sistema lo dice y los demás igual salen.

Solo se puede enviar un boletín **publicado**. Si el servidor no tiene correo institucional configurado, la ventana lo avisa: descargue el PDF y envíelo por su correo.

Coordine con la fecha de boletín definida al crear el ciclo.

---

## 19. Notas del equipo

**Ruta:** `/notas` · también panel dentro de fichas

### 19.1 Buenas prácticas

- Una nota = un hecho o decisión (“Se fusionó con X porque comparten NCT…”).  
- Vincule a señal, fuente o informe cuando aplique.  
- **Fije** las que deben verse primero.  
- No ponga datos personales sensibles innecesarios (la bitácora y respaldos existen).

Solo el autor o un superadmin edita/elimina.

---

## 20. Tablero estratégico

**Ruta:** `/dashboards`

### 20.1 Bloques principales

0. **Marco analítico del sistema**: cuatro preguntas sobre los datos de todo el sistema (no solo del ciclo):
   - **Descriptivo** (¿qué pasa?): señales capturadas, por clasificar, captura de 30 días y clúster con más señales.
   - **Diagnóstico** (¿por qué?): porcentaje de descarte, enlaces exactos, fuentes sin señales, antigüedad de la bandeja y fuentes con mucho ruido.
   - **Predictivo** (¿qué puede pasar?): tendencia de la captura, tiempo estimado para evacuar la bandeja y clústeres en crecimiento.
   - **Prescriptivo** (¿qué hacer?): acciones concretas con enlace a la pantalla donde se atienden.
   - Con la IA encendida, (Generar lectura con IA) redacta un resumen ejecutivo usando **solo esas cifras**. Se guarda para la siguiente visita. Sin IA, el marco funciona igual.
1. **Embudo del ciclo** — capturadas → filtradas → priorizadas → evaluadas → publicadas.  
2. **Por clúster** — distribución.  
3. **TTM** — tiempo al mercado (umbrales configurables).  
4. **Calor presupuestal** — solo perfiles con analítica restringida (superadmin, tomador).  
5. **Grafo de gobernanza** — nodos del ciclo, posiciones, chat por nodo, vistas guardadas.  
6. **Exportar** — CSV/Excel con los mismos filtros.

### 20.2 Cómo leerlo sin engañarse

1. Ciclo correcto en el encabezado.  
2. Mismo corte de datos que la coordinación.  
3. “0 priorizadas” puede ser normal el día 2 del filtrado.  
4. Compare con el Listado Único si duda de un número.

### 20.3 Grafo

- Expanda nodos de interés.  
- Use el chat del nodo para preguntar en contexto (queda en historial aparte del chat general).  
- Guarde la vista (nombre) para la siguiente reunión.

---

## 21. Alertas tempranas

**Ruta:** `/alertas`

### 21.1 Tipos habituales

- Fase III con mención a Colombia (u otros tokens configurados).  
- Cambio de franja de una tecnología de alto riesgo presupuestal (umbral de puntos).  
- **Cambio de fase clínica** de una tecnología de alto riesgo presupuestal: por ejemplo, pasa de fase II a fase III. Avisa aunque el cambio llegue por la vigilancia en un registro que ya se había capturado. Conocer la fase por primera vez no genera alerta.

### 21.2 Qué hacer

1. Abra la alerta.  
2. Vaya a la tecnología.  
3. Decida: priorizar revisión, nota, o marcar leída.  
4. Configure suscripciones (plataforma / correo) si su perfil lo permite.

“Leer todas” limpia la bandeja visual; no borra el hecho histórico.

---

## 22. Asistente IA

**Ruta:** `/chat`

### 22.1 Cómo usarlo bien

1. Pregunte con contexto: ciclo, tecnología, clúster.  
2. Lea las **citas** / fuentes que muestra.  
3. No copie a un informe oficial sin validar contra la ficha.  

Si la IA está apagada, verá contexto recuperado sin redacción generativa.

Las consultas del grafo no se mezclan con este historial.

---

## 23. Bitácora de auditoría

**Ruta:** `/auditoria` · **Solo** quien tenga permiso de auditoría (superadmin)

### 23.1 Consultas útiles

- Por usuario: “¿quién cerró el ciclo?”  
- Por entidad: vida completa de una tecnología.  
- Por acción: `auth:login_failed`, fusiones, cambios de parámetro.  

### 23.2 Qué no encontrará

- Contenidos crudos enormes (`raw_content`) ni fotos de perfil: se excluyen a propósito.  
- Borrados de la bitácora: el motor **no permite** UPDATE/DELETE.

---

## 24. Usuarios y perfiles

**Ruta:** `/usuarios` · **Solo superadministrador**

### 24.1 Alta de una persona

1. Correo `@iets.org.co`.  
2. Nombre (puede completarse desde directorio RRHH/Firestore).  
3. Perfil (técnico, clínico, tomador, revisor, superadmin).  
4. El sistema genera / usted define contraseña temporal.  
5. Entregue la temporal por canal seguro; la persona **debe** cambiarla al entrar.

### 24.2 Otras acciones

| Acción | Efecto |
|---|---|
| Cambiar perfil | Cambia el perfil **real** de la persona; aplica en el próximo token. Para solo *probar* lo que ve un perfil, use **Ver como** (3.3) |
| Restablecer contraseña | Nueva temporal + must_change |
| Desbloquear | Tras intentos fallidos |
| Desactivar | No entra; sesiones invalidadas |
| Eliminar | Solo si las reglas de gobierno lo permiten (revise mensaje) |

No deje un solo superadmin sin respaldo institucional.

---

## 25. Configuración (administración)

**Ruta:** `/configuracion` · **Solo** `config:manage`

### 25.1 Gobierno metodológico

- CRUD de **clústeres** y **tipologías** (código estable; palabras clave).  
- Parámetros en caliente, **agrupados por módulo**: cribado de la bandeja, corroboración, vigilancia (fuentes a la vez, tiempo máximo por fuente, cortacircuitos), ciclos, priorización, filtrado, evaluación, time-to-market y alertas.
- Cada parámetro dice **qué hace** y **de dónde sale su valor**: la especificación técnica SI EAA, una decisión de la coordinación metodológica (las abiertas, como D-02, D-07, D-09 y D-10, se marcan) o un valor técnico del sistema.
- **Cribado**: los puntos de cada regla (horizonte, tipo, hito regulatorio o ensayo, área, resumen, tecnología identificada), las palabras clave y el umbral de «cribado alto». El recuadro «Cómo se calcula hoy» muestra la fórmula con los valores vigentes. Al guardar un peso, se recalcula de inmediato el cribado de todas las señales.

Cada cambio queda en bitácora. Los ciclos **cerrados** no recalculan el pasado.

### 25.2 Integración con IA

- Pegar llave MiniMax (principal) y/o Gemini.  
- Proveedor: automático / minimax / gemini.  
- Interruptores globales: IA en sitios, OCR.  
- Contador de tokens.  
- **Bitácora de entrada a sitios**: cada corrida con pasos (descarga, búsqueda, fichas, OCR, IA, prioridad).  
- Diagrama del flujo de ingesta (orden fijo de pasos).

### 25.3 Prompts de vigilancia

Edite el texto que usa la IA al extraer. Debe poder usar `{content}` y `{source_context}`. Ajuste páginas máximas, caracteres, timeouts, reintentos, pausa entre fichas. **Restaurar** vuelve a los valores de fábrica.

### 25.4 Tareas programadas

- Cada cuántas horas revisar fuentes vencidas.  
- Barrido de duplicados programado (solo propone; no fusiona).  
- Historial de ejecuciones.  
- Botón de correr ahora.

### 25.5 Llaves de fuentes

- openFDA → más cupo en FDA.  
- NCBI + correo → más velocidad en PubMed.  

Sin llave el sistema sigue, con cupos bajos.

### 25.6 Parámetros de fuentes (matriz EH)

#### Criterios de búsqueda por categoría

En (Configuración) › (Parámetros de fuentes), sección (Criterios de búsqueda por categoría), cada una de las 11 categorías tiene la casilla (Activa). El escaneo usa **solo** los términos de las categorías activas.

- Alcance vigente (III seguimiento, 17-11-2026): activas **Medicamentos** y **Dispositivos médicos**. Las otras nueve (Dispositivos implantables, Equipos biomédicos, Dispositivos de monitoreo, Tecnologías intervencionistas, IA clínica, SaMD, Telemedicina, mHealth y Wearables) quedan inactivas, no eliminadas.
- Para ampliar el alcance marque la casilla y pulse (Guardar). No requiere cambios de código. Cada cambio queda en la bitácora con el valor anterior y el nuevo.
- Las señales ya capturadas en categorías inactivas no se reclasifican ni se borran.
- **Decisión pendiente del equipo técnico**: si Dispositivos implantables, Equipos biomédicos y Dispositivos de monitoreo se consideran parte de Dispositivos médicos (se activarían) o siguen inactivas.

#### Base de conocimiento de búsqueda

Al final de (Parámetros de fuentes). Son las páginas de cada fuente que ya se encontraron y que la vigilancia visita sin consultar buscadores. No pertenece a un ciclo: la usan todas las corridas y todos los ciclos, y se respalda junto con la base del sistema.

| Elemento | Qué muestra o hace |
|---|---|
| Totales | Páginas guardadas, sitios, cuántas ya aportaron señales, cuántas están en pausa por no aportar y cuántas fuentes activas tienen páginas conocidas |
| (Consultar la base) | Busca por texto en título, extracto, dirección o sitio. Cualquier perfil puede consultarla |
| (Descargar paquete) | Baja toda la base en un archivo `base_busqueda_eh.json` |
| (Cargar paquete) | Suma un paquete armado en otro equipo. Solo agrega o refuerza: nunca borra páginas ni baja sus cuentas |

Cómo se mantiene sola:

- Cada vigilancia anota si la página aportó señales. Las que aportan van primero en la siguiente corrida.
- Una página que no aporta en 2 visitas deja de visitarse («Sin señal») y se vuelve a probar a los 45 días.
- Lo que encuentre un buscador con llave o el mapa del sitio queda guardado aquí.

Interruptores relacionados, en la misma pantalla: **Usar la base de conocimiento de búsqueda** y **Respaldo por mapa del sitio** (los dos encendidos por defecto), **Tiempo máximo de búsqueda por fuente** y **Días que la base cuenta como reciente**.

**Llave de Brave Search (opcional).** La vigilancia funciona sin ella. Sirve para que el servidor descubra páginas nuevas por su cuenta: créela con una cuenta del IETS en el sitio de Brave Search API, péguela en esta pantalla y marque el motor «Brave Search API».

#### Importar Excel

1. Seleccione el archivo «Fuentes de información proactiva EH» (`.xlsx`).
2. Decida si **sobrescribe** lo editado en el panel:
   - **Sin marcar** (recomendado): actualiza todo lo que el equipo no editó y respeta lo editado (ver 8.7).
   - **Marcado**: el Excel manda en todos los campos de la matriz y se borran las marcas de edición.
3. **Importar**.
4. Revise el resumen: filas, actualizadas, creadas, criterios.

Sin archivo: **Reaplicar matriz cargada** usa el JSON ya empaquetado.

Cómo se leen las URL del Excel: manda el **texto escrito** en la celda (es el listado que valida el equipo en «Cant URL SI EAA»); el hipervínculo oculto de la celda solo se usa si el texto no trae ninguna URL. Las rutas «#/…» de sitios tipo SPA se conservan.

### 25.7 Reprocesar lo ya capturado

Corrige el mapeo de señales viejas **sin volver a la fuente** (usa el crudo guardado). Es para TI o el superadministrador:

- API: `POST /api/ingest/reprocess?target=…&apply=true` (sin `apply=true` solo simula y muestra los cambios).
- Consola, en `backend/`: `python -m app.reprocess_service --apply --only …`

| Objetivo | Qué corrige |
|---|---|
| `fda` | Fecha de aprobación y estado del trámite desde el crudo de openFDA |
| `pipeline` | Separa filas de pipelines de fabricantes en producto, DCI, indicación y fase |
| `producto` | Completa forma farmacéutica, concentración, vía, marca y modelo (solo campos vacíos) |
| `all` | Los tres |

Todo reproceso aplicado queda en la bitácora.

#### Listas desplegables

Edite valores/etiquetas/rangos de prioridad, niveles, tipos de tecnología, orígenes. Guarde. Las pantallas de Fuentes validan contra estas listas.

#### Búsqueda web

- Encendido global.  
- Consultas por IA.  
- Solo mismo dominio / priorizar documentos.  
- Orden de motores (Yahoo, DuckDuckGo, Lite, Bing, Brave, SearXNG).  
- Llave Brave y URL SearXNG.  
- Límites (consultas, resultados, pausas, enfriamiento).  
- Términos genéricos y por categoría (hoja de criterios).  
- **Probar consulta** de diagnóstico.  
- Reactivar motores en pausa tras bloqueos.

---

### 25.8 Copia de respaldo y puntos de recuperación

**Ruta:** `/configuracion`, pestaña de copia de respaldo. Solo el superadministrador.

La base del sistema se copia sola a Firebase después de cada cambio y se restaura sola cuando el servidor reinicia. El panel **Base en Firebase** muestra si está sincronizada y la fecha de la última publicación.

**Puntos de recuperación.** Son copias que las publicaciones siguientes no borran:

| Punto | Qué es | Cuántos se guardan |
|---|---|---|
| Copia actual | La vigente; es la que se restaura sola al arrancar | 1 |
| Copia anterior | La inmediatamente anterior | 1 |
| Antes de un despliegue | Última copia hecha con la versión anterior del sistema | 5 |
| Cierre del día | Última copia de cada día | 7 |
| Escrita por otra instancia | La subió otro proceso del servicio durante un redespliegue | 3 |
| Antes de una restauración | Estado que había justo antes de restaurar | 3 |
| Fijada a mano | La que usted fija con **Fijar el estado actual** | 3 |

Cada línea muestra la fecha, el tamaño, la versión del sistema y cuántas señales, tecnologías, fuentes y usuarios tenía.

**Volver a un punto anterior:**

1. Ubique el punto por su fecha y pulse **Restaurar**.
2. Escriba `RESTAURAR` cuando el sistema lo pida.
3. La página se recarga con los datos de ese punto.

El estado que había queda guardado como «Antes de una restauración»: si se equivocó, restaure ese punto y vuelve a donde estaba. La restauración queda en la bitácora.

**Antes de un cambio delicado** (cargar una matriz nueva, depurar ruido, cerrar un ciclo) pulse **Fijar el estado actual**.

**Si aparece «Copia bloqueada».** El sistema detectó que la base del servidor tiene menos datos que la copia guardada y no la sobrescribió. No se perdió nada: avise a TI. Lo normal es restaurar la copia actual desde este mismo panel. Si TI confirma que la base del servidor es la correcta, **Publicar de todos modos** (pide escribir `PUBLICAR`) la sube y deja la copia guardada como punto de recuperación.

---

### 25.9 Inteligencia

Pestaña **Inteligencia**. La consulta cualquier perfil; la cambia quien administra la configuración. Todo cambio queda en bitácora.

**Base de conocimiento de señales.** Es la memoria del sistema: un documento por señal con su texto, su año, su origen y lo que el equipo decidió.

- **Primera búsqueda histórica** y **vigilancias posteriores**: lo capturado hasta la línea base es histórico; lo que llega después, posterior. (Fijar línea base hoy) mueve ese corte.
- Se actualiza sola. (Reconstruir) la rehace desde cero; (Descargar base) la entrega en un archivo.
- (Buscar señales parecidas a un texto) muestra qué hay en la base y qué se decidió.
- Sirve a todos los ciclos y se respalda con la base del sistema (la que se copia a Firestore).

**Clasificador que aprende.**

| Parámetro | Para qué sirve | De fábrica |
|---|---|---|
| Aprender de las clasificaciones | Usa las señales parecidas ya clasificadas o descartadas | Encendido |
| Cuándo consultar a la IA | Nunca, solo si hay duda, o siempre | Solo si hay duda |
| Señales parecidas que votan | Cuántas clasificaciones anteriores se consultan | 7 |
| Parecido mínimo para votar | Por debajo, una señal no cuenta | 0,12 |
| Confianza mínima del aprendizaje | Desde aquí el aprendizaje pesa más que las reglas | 0,55 |
| Precisión objetivo | Lo que la calibración busca garantizar | 0,80 |
| Parecido para avisar de un descarte | Dispara el aviso amarillo | 0,60 |
| Ejemplos que ve la IA | Clasificaciones del equipo incluidas en la consulta | 6 |

El sistema empieza a aprender con 5 señales clasificadas. Antes sugiere solo con las reglas del catálogo.

**Calibración.** (Calibrar ahora) predice cada señal ya clasificada sin mirarla y compara con lo que decidió el equipo. Muestra el acierto de las reglas, del aprendizaje y del combinado, y lo compara con decir siempre el clúster más frecuente. Si cumple la precisión objetivo, ajusta sola los parámetros. Necesita 20 señales clasificadas en al menos dos clústeres; si no las hay, lo dice y no cambia nada. Con la calibración automática encendida se repite cada 25 clasificaciones nuevas.

**Sugerencias confirmadas por el equipo.** Cuántas sugerencias terminó confirmando el evaluador, por método. Si baja, recalibre o ajuste las palabras clave de los clústeres.

**Analítica.** Enciende o apaga la lectura con IA y fija los umbrales de las alertas: ruido por fuente, antigüedad de la bandeja y concentración en un clúster.

**Prompts de la IA.** Instrucciones de la clasificación y de la analítica. Un campo vacío usa el texto de fábrica.

**Vigencia de las señales por año.** Por defecto entran las señales de todos los años.

1. **Vigencia general**: escriba (Desde el año) y (Hasta el año) y guarde. Vale para todas las fuentes sin vigencia propia. (Todos los años) la quita.
2. **Vigencia propia**: marque fuentes en la tabla, escriba su rango y pulse (Aplicar a N fuentes). (Volver a la vigencia general) se la quita.
3. **Revisar lo ya capturado**: (Revisar la bandeja) dice cuántas señales quedan fuera, por fuente, sin cambiar nada. (Pasar a Descartadas) las mueve con el motivo «Fuera de la vigencia configurada». Se restauran desde Bandeja de entrada › Descartadas.

El año sale de la fecha de publicación de la señal. Una señal sin fecha se conserva, salvo que desmarque (Conservar las señales sin fecha de publicación). La vigencia rige para las capturas siguientes: lo publicado fuera del rango no entra a la bandeja.

---

## 26. Portales públicos

| URL | Quién | Qué hace |
|---|---|---|
| `/postular` | Ciudadanía / industria / academia | Postula tecnología + COI |
| `/expedientes` | Público | Busca fichas publicadas por nombre, denominación común o indicación, y las filtra por clúster, tipo de tecnología, fase de desarrollo y año de publicación |
| `/expedientes/:id` | Público | Lee una ficha; **Descargar ficha técnica** entrega PDF y **Ver versión web**, HTML |
| `/transparencia` | Público | Cifras agregadas |
| `/revisar/:token` | Revisor invitado | Evalúa expediente |

Estos portales **no** muestran la bandeja interna ni datos de ciclos en configuración.

En `/expedientes` los filtros solo ofrecen opciones que tienen al menos una ficha pública, los resultados van de 20 en 20 y **Quitar filtros** vuelve a la lista completa. Las publicaciones confidenciales no aparecen ni se cuentan.

---

## 27. Rutinas por rol

### 27.1 Evaluador técnico (día típico)

1. `/` — pendientes propios.  
2. `/fuentes` — mirar salud A/B; sondear si hay ámbar.  
3. `/vigilancia` — cola y errores.  
4. `/bandeja-entrada` — clasificar y asignar.  
5. `/filtrado` — duplicados + novedad + INVIMA.  
6. `/priorizacion` — P1, P5, P6.  
7. `/evaluacion` — avanzar expedientes técnicos.  
8. Notas de decisiones de fusión / novedad.

### 27.2 Evaluador clínico (día típico)

1. `/` — pendientes de P2–P4 y revisiones.  
2. `/priorizacion` — calificar con justificación clínica.  
3. `/evaluacion` — contenido clínico del expediente.  
4. `/alertas` — fase III país / impacto.  
5. Notas a dirección si hay controversia.

### 27.3 Tomador de decisiones

1. `/dashboards` — embudo y capa presupuestal.  
2. `/alertas` y `/boletines`.  
3. `/` si tiene pendientes de lectura.  
4. Notas de decisión.

### 27.4 Superadministrador (semana típica)

1. Usuarios nuevos / desbloqueos.
2. Configuración: IA, prompts, programadas, matriz EH.
3. Revisar **prioridades sugeridas** y **Detectar fuentes con IA** (mensual).
4. Tras cambiar permisos o pantallas, comprobar con **Ver como** lo que ve cada perfil.  
5. Salud del catálogo y recargas controladas.
6. Cierre de ciclo cuando el embudo lo permita.
7. Auditoría ante incidentes.
8. Verificar que producción no tenga acceso de desarrollo.

### 27.5 Revisor externo

1. Abrir enlace.  
2. COI.  
3. Comentar y veredicto.  
4. Devolver al IETS; no usa el menú interno.

---

## 28. Problemas frecuentes (diagnóstico)

### 28.1 “No veo tecnologías en priorización”

1. ¿Ciclo correcto en el encabezado?  
2. ¿Ciclo en **En priorización**?  
3. ¿Están asignadas y con novedad válida?  
4. ¿Filtro de la cola demasiado estrecho?  
5. ¿Fueron fusionadas hacia otra tecnología?

### 28.2 “La vigilancia no trae nada”

1. ¿Ingesta activa?  
2. ¿Salud verde?  
3. ¿Circuito abierto?  
4. ¿Flujo con recorrido/IA/búsqueda apagados?  
5. ¿Ya se capturó el mismo contenido (huella)?  
6. Probar búsqueda web y revisar bitácora de sitios.

### 28.3 “No puedo calificar P3”

Su perfil no es clínico (ni superadmin). Pida a quien corresponda o un cambio de perfil justificado.

### 28.4 “Recargué el catálogo y se movió la URL”

Esperado para los campos que nadie editó: siguen a la matriz vigente (ver 8.7). Todo lo que el equipo cambió desde **Editar fuente** permanece, incluidos el nombre, la URL, «ingesta activa» y la frecuencia, también después de un reinicio del servidor. Una fuente que el equipo sacó del catálogo o que la sonda suspendió por fallar tampoco se reactiva sola. La matriz que se carga desde la interfaz se conserva entre reinicios. Si importó Excel con «Sobrescribir lo editado», el Excel mandó en todo.

### 28.5 “Error interno del servidor”

Anote hora y el código `ref …` si aparece. Envíelo a TI. En entornos no productivos el mensaje puede incluir la causa técnica.

### 28.6 “El acceso rápido aparece en producción”

Incidente de seguridad. Pedir `ENVIRONMENT=production`, `SECRET_KEY` fuerte y `create-admin`. No use el acceso rápido en ese servidor.

### 28.7 “INVIMA no encuentra el medicamento”

1. ¿Índice sincronizado?  
2. Pruebe por nombre de producto, no solo DCI.  
3. Recuerde limitaciones del dato abierto.  
4. Documente la vía de novedad con justificación si el cruce no aplica.

### 28.8 “La IA inventa NCT”

El prompt pide NCT verificables; aun así **verifique** en ClinicalTrials antes de priorizar. No invente identificadores en la ficha.

### 28.9 “Dice ‘En 3 fuentes’ pero no es la misma tecnología”

La coincidencia por nombre es difusa. Abra **Clasificar** y revise el recuadro «Detectada en N fuentes» (dice si coincidió por NCT o por similitud). Si son distintas, no hace falta hacer nada: el bono solo ordena. Si el error se repite, suba el umbral de similitud en Configuración › Gobierno metodológico (afecta también al filtrado de duplicados).

### 28.10 “No aparece la forma farmacéutica o la marca”

El texto de la fuente no la decía, o el título mezcla varias tecnologías (las reglas no adivinan). Complétela al **Clasificar**. Las señales nuevas leídas con IA la traen cuando el sitio la publica.

### 28.11 “Detectar fuentes con IA no propone nada”

1. ¿Está encendida la **búsqueda web** en Configuración › Parámetros de fuentes?
2. ¿Hay motores en pausa por bloqueo? Reactívelos ahí mismo.
3. Pruebe un tema más concreto o sin filtro de país.
4. Si dice «Demasiadas detecciones seguidas», espere unos minutos (máximo 6 cada 10 minutos).

### 28.12 “Agregué una URL en el Excel y la fuente no la tiene”

1. ¿La URL está **escrita** en la celda? El hipervínculo oculto no cuenta si la celda ya trae otra URL.
2. ¿Se reimportó el Excel o se reinició el servidor después del cambio?
3. ¿Alguien editó las URL de esa fuente en el panel? Entonces está marcada como editada: agregue la URL en **Editar** o reimporte con «Sobrescribir lo editado».

---

## 29. Glosario

| Término | Definición |
|---|---|
| **EH** | Escaneo de horizonte |
| **Señal** | Registro de captura desde una fuente |
| **Tecnología** | Unidad metodológica persistente |
| **Ciclo** | Ventana formal 10–16 semanas |
| **Instancia** | Tecnología dentro de un ciclo |
| **%P** | Índice oficial de priorización |
| **Cribado / screening_score** | Orden heurístico de señales |
| **Listado Único** | Tecnologías del ciclo tras filtrado |
| **COI** | Conflicto de interés |
| **HTA** | Health Technology Assessment |
| **INVIMA** | Autoridad sanitaria colombiana de medicamentos/dispositivos |
| **NCT** | ID de ensayo en ClinicalTrials.gov |
| **DCI / INN** | Denominación Común Internacional |
| **TTM** | Tiempo al mercado |
| **SGSSS** | Sistema General de Seguridad Social en Salud |
| **D-06** | Catálogo verificado de fuentes proactivas |
| **Matriz EH** | Excel de fuentes proactivas (prioridad, rutas, tipos) |
| **SaMD / SD** | Software as Medical Device |
| **Fuente de contraste** | Fuente para medir huecos de cobertura |
| **Fuente retirada** | Ya no está en el catálogo vigente; conserva señales |
| **Sonda** | Prueba de salud sin guardar señales |
| **Ingesta** | Consulta real que puede crear señales |
| **Bitácora** | Auditoría append-only |
| **Staging** | Bandeja de entrada |
| **Mini-HTA** | Evaluación corta estructurada |
| **Embudo** | Conversión entre fases del ciclo |
| **Corroboración** | La misma tecnología reportada por fuentes distintas; suma al orden de la bandeja, no a su importancia |
| **Datos de producto** | Forma farmacéutica, concentración, vía, marca y modelo de una señal |
| **URL original de la matriz** | La primera URL de consulta de la fila de la fuente en el Excel; si se usa otra, la fuente lo dice en una etiqueta |
| **Tiempo máximo por fuente** | Tope de minutos de una fuente en la vigilancia; al superarlo se cierra con error y la corrida sigue |
| **Campo editado** | Campo de la matriz que el equipo cambió en el panel; la recarga del catálogo lo respeta |
| **Ver como** | Vista del sistema con los permisos de otro perfil, solo para el superadministrador |

Los tips (i) de la interfaz usan el mismo lenguaje; si un término no cuadra, abra el tip en pantalla.

---

## 30. Anexo: matriz EH y flujo de escaneo

### 30.1 Origen

**Inventario vigente (desde el 17-11-2026).** Archivo MATRIZ_FUENTES_ESCANEO_EH, primera hoja (MATRIZ ESCANEO, un enlace por fila): 142 filas de 85 organizaciones, 123 de consulta activa y 19 de información general o metodológica. Da 141 fuentes porque la URL de RedETS está en los ID 91 y 92 (se informa como inconsistencia y se carga una vez). La hoja RESUMEN del archivo dice 141 enlaces; la hoja de la matriz tiene 142 filas (incluye EUDAMED, ID 142). Lo que sigue en esta sección describe la matriz anterior (una fila por organización), que se conserva como referencia del catálogo D-06.

Archivo **«FUENTES DE INFORMACION PROACTIVA EH»**:

- Hoja *MATRIZ FI EH*: 93 filas → mapeadas a códigos del catálogo, con 128 URL de consulta.  
- Hoja *Criterios de búsqueda*: 11 categorías de términos. Si una categoría viene sin términos (hoy *Medicamentos*), el sistema usa: new drug approval, investigational drug, drug pipeline, new molecular entity, orphan drug, biosimilar.

En la columna de URL manda el texto escrito: el hipervínculo de la celda solo se usa si el texto no trae URL. Las rutas «#/…» de sitios tipo SPA (ej. AIFA) se conservan.

El catálogo resultante: **97 fuentes** (incluidas noticias), con **141 URL de entrada**: las 128 URL de consulta SI EAA más las URL generales de las filas que no tienen URL de consulta (el recorrido necesita al menos una por fuente).

**Por qué 93 filas dan 97 fuentes.** Una fila de la matriz puede corresponder a varios servicios que en el catálogo tienen código propio (FDA fila 29 → 3 fuentes; EMA fila 31 → 2; Health Canada fila 34 → 2; EUnetHTA fila 47 → 2; NIHR fila 54 → 2) y, a la vez, algunas fuentes aparecen en dos filas (FDA filas 29 y 30, Health Canada filas 34 y 35). Contando cada código una sola vez quedan 97 fuentes. Las 128 URL son las URL de consulta distintas de cada fila. El sistema muestra estos tres números al cargar la matriz.

Para revisar en la matriz institucional (no lo corrige el sistema; al cargar la matriz aparece en **Validación de la matriz**):

- FDA (fila 29) repite `pma.cfm` en 2.2 y 2.6: declara 9 URL, únicas 8.
- Health Canada (fila 34) declara 1 URL pero lista 2.
- La fila *Medicamentos* de «Criterios de búsqueda» no tiene términos.

### 30.2 Orden de una corrida completa

1. Encola por prioridad.  
2. Descarga URL (o respaldo).  
3. Búsqueda web `site:dominio` (IA o reglas).  
4. Recorrido guiado por URLs de entrada y ruta de acceso.  
5. OCR si hace falta.  
6. IA de extracción con `{source_context}`.  
7. Huella → bandeja.

### 30.3 Dónde se administra

| Qué | Dónde |
|---|---|
| Por fuente (casillas, URLs, ruta) | `/fuentes` › Editar |
| Listas y motores globales | `/configuracion` › Parámetros de fuentes |
| Prompt y páginas globales | `/configuracion` › Prompts / IA |
| Logs de una corrida | `/configuracion` › IA › bitácora de sitios |

### 30.4 Recomendación de operación

- Deje **prioridad alta** a agencias y registros críticos.  
- Apague búsqueda web en sitios que la prohíben o son de pago.  
- Use **Probar búsqueda web** antes del barrido mensual.  
- No marque “sobrescribir” al importar Excel salvo que coordinación lo pida.
- Revise cada mes las **prioridades sugeridas** y lleve las decisiones al Excel institucional.

---

## Cierre

Esta guía cubre el uso diario de **todos los módulos** del Sistema de Escaneo de Horizonte del IETS. Para instalar el servidor, variables de entorno, Docker o pruebas automatizadas use [`README.md`](README.md) y [`DEPLOY.md`](DEPLOY.md).

Si un botón no coincide con el nombre exacto de esta guía (textos menores de interfaz), confíe en el **tip (i)** de la pantalla: es la fuente de verdad del lenguaje visible al usuario.
