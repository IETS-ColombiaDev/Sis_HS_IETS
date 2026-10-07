# Guía de usuario — Sistema de Escaneo de Horizonte del IETS

**Manual operativo completo** para el equipo del Instituto de Evaluación Tecnológica en Salud (IETS).
No es un resumen técnico: explica **qué ve en pantalla**, **qué botón oprimir**, **en qué orden**, **quién lo hace** y **qué hacer cuando algo falla**.

| | |
|---|---|
| **Versión del sistema** | 7.0.0 · octubre 2026 (catálogo + matriz EH de fuentes) |
| **Público** | Evaluadores técnicos y clínicos, tomadores de decisiones, revisores, superadministradores y personal de apoyo |
| **Cómo leerla** | Siga el orden de un ciclo nuevo la primera vez; después use el índice para el módulo del día |
| **Documentación técnica** | [`README.md`](README.md) · [`DEPLOY.md`](DEPLOY.md) · [`Catalogo_Fuentes_Proactivas_Verificadas_EH_IETS.md`](Catalogo_Fuentes_Proactivas_Verificadas_EH_IETS.md) |

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

1. **Vigila** de forma automática (y manual) cerca de **95 fuentes** internacionales.
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
| **Su nombre / perfil** | Cerrar sesión y datos de cuenta |

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
| **A** | API estable (ej. ClinicalTrials, openFDA) — gobierna pre-llenado |
| **B** | Feed o descarga oficial |
| **C** | Página estructurada |
| **D** | Página que confirma; no pisa datos de A/B |
| **E** | Curaduría humana |

### 4.3 Nivel de fuente (matriz EH)

| Valor | Idea |
|---|---|
| **Primaria** | Produce el dato original (ensayo, fabricante, agencia que aprueba) |
| **Secundaria** | Resume o evalúa (HTA, revistas) |
| **Terciaria** | Compila o difunde (portales, redes) |
| **Por definir** | Aún no clasificada en la matriz |

### 4.4 Prioridad de la fuente

Aplicabilidad para el escaneo (columna de observaciones de la matriz):

- **Alta** — se encola y escanea primero; más peso en el prompt de la IA.
- **Media / Baja**
- **Revisar** — pertinencia dudosa o acceso restringido.
- **Sin asignar** — la matriz no fijó prioridad.

### 4.5 %P vs screening_score

| Escala | Dónde | Qué es |
|---|---|---|
| **%P** | Priorización | Oficial: (suma P1–P6 / 6) × 100. Solo con los 6 criterios |
| **screening_score** | Señales | Heurística 0–100 para **ordenar** la cola. No decide priorización |

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

Es el inventario maestro: **qué sitios** se vigilan, con qué **adaptador**, cada cuánto, con qué **prioridad** y con qué **flujo** (recorrido, OCR, IA, búsqueda web).

Hay **95 fuentes** en seis bloques, alineadas a la matriz «Fuentes de información proactiva EH».

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

#### Salud de fuentes

Resultado de la última **sonda** (prueba sin guardar señales). Interprete:

| Color | Significado | Qué hacer |
|---|---|---|
| Verde | Responde y el formato coincide | Seguir vigilando |
| Ámbar | Responde pero cambió el formato o vino vacío | Revisar; la ingesta puede suspenderse |
| Rojo | No responde | Revisar URL, red, o apagar temporalmente |
| Sin sonda | Nunca se ha probado | Ejecutar Sonda o «Sondear A/B» |

#### Cobertura

Tecnologías que aparecen en fuentes de **contraste** y no están en el ciclo. Cada hueco debe justificarse o incorporarse. Si el conteo es 0, o aún no hay señales de contraste, o todo ya está en el ciclo.

### 8.3 Botones de la barra superior

| Botón | Quién | Qué hace |
|---|---|---|
| **CSV** | Quien consulta | Descarga el listado (incluye matriz y flujo) |
| **Sondear A/B** | Vigilancia | Sonda masiva de niveles A y B |
| **Recargar catálogo** | Escritura | Reaplica D-06: actualiza oficiales, retira obsoletas; **conserva** prioridad/ruta/flujo editados |
| **Alta rápida** | Escritura | Nombre + URL en minutos |
| **Agregar fuente** | Escritura | Formulario completo |

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

#### Matriz EH · priorización

| Campo | Qué poner |
|---|---|
| Nivel de fuente | Primaria / secundaria / terciaria / por definir |
| Nivel de priorización | Alta / media / baja / revisar / sin asignar |
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
- Términos propios de búsqueda: vacío = términos por tipo de tecnología.

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

| Se restituye desde D-06 | Se conserva si usted lo editó |
|---|---|
| URL, título oficial, adaptador | Prioridad |
| Nivel de acceso A–E | Nivel de fuente (si ya tenía valor) |
| Frecuencia / metadatos de catálogo | Ruta de acceso, qué consultar, URLs de entrada |
| | Flujo de escaneo (`scan_profile`) |

Si al **importar el Excel** en Configuración marca “Sobrescribir lo editado”, ahí sí se pisan los campos de la matriz.

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
3. Las fuentes se atienden en orden de **prioridad alta primero**.  
4. Observe la cola:
   - **pendiente** — espera turno  
   - **ejecutando** — en curso  
   - **ok** — terminó bien  
   - **parcial** — trajo algo o visitó, con matices  
   - **error** — falló; se reintenta hasta 3 veces  

Un error en una fuente **no detiene** las demás.

### 9.4 Vigilancia de una sola fuente

Desde Vigilancia o desde Fuentes › **Ingerir**:

1. Espere el toast: “Ingesta: X nuevas de Y”.  
2. Vaya a **Bandeja de entrada** a clasificar.

### 9.5 Qué ocurre “por detrás” en cada fuente (para interpretar logs)

1. Descarga de la URL principal.  
2. Si falla → prueba URLs de entrada (**respaldo**).  
3. Si el flujo lo permite → **búsqueda web** en el dominio.  
4. Recorrido: principal → entradas → resultados de búsqueda → fichas internas guiadas por la ruta.  
5. OCR / IA según casillas globales y de la fuente.  
6. Huella: si el contenido ya existía, no crea señal duplicada.

Detalle de pasos: Configuración › Integración con IA › bitácora de entrada a sitios.

### 9.6 Circuito abierto

Si una fuente falla muchas veces seguidas, el sistema la **pausa horas** (“circuito abierto”) para no castigar un sitio caído. El tip en pantalla lo explica. Cuando pase el tiempo, vuelva a intentar o revise la URL.

### 9.7 Vista previa de URL

Prueba un enlace sin registrar fuente. Útil antes de un alta rápida. No debe usarse para sondear la red interna del instituto (el servidor lo bloquea).

---

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
| Listas para asignar | Ya tienen lo mínimo |

### 10.3 Clasificar una señal (paso a paso)

1. Pulse la fila o **Clasificar**.  
2. Revise título, fuente, resumen, enlace.  
3. (Recomendado) **Sugerir clasificación**: la IA/reglas proponen clúster, tipología y condición con motivo.  
   - Si no hay evidencia: “Clasifique manualmente”.  
   - Si hay sugerencia: **revísela**; no es decisión final hasta guardar.  
4. Complete o corrija:
   - Nombre comercial  
   - DCI / INN (mejora desduplicación e INVIMA)  
   - Fabricante  
   - Indicación  
   - Clúster (obligatorio para asignar)  
   - Tipología (obligatoria para asignar)  
   - Condición (emergente / nueva)  
   - Fechas regulatorias si las conoce (FDA, EMA, etc.)  
5. **Guardar**.

### 10.4 Asignar por lotes

1. Marque las filas **listas** (clúster + tipología).  
2. Confirme el ciclo del encabezado.  
3. **Asignar al ciclo**.  
4. Toast: cuántas se asignaron; las que ya estaban se informan como omitidas.  
5. Continúe en **Filtrado** (cuando el ciclo esté en ese estado).

### 10.5 Canales

En filtros puede distinguir capturas **proactivas** (vigilancia) y **reactivas** (postulación aceptada).

### 10.6 Errores típicos

| Situación | Causa | Qué hacer |
|---|---|---|
| No deja asignar | Falta clúster o tipología | Clasifique primero |
| “Ya estaban en el ciclo” | Duplicó la asignación | Normal; no crea duplicado de instancia |
| No ve la señal | Filtro de búsqueda activo | Limpie filtros |

---

## 11. Postulaciones (canal reactivo)

**Ruta:** `/postulaciones` · Público: `/postular`

### 11.1 Flujo externo

1. La persona entra a `/postular`.  
2. Llena datos de la tecnología y declara **conflicto de interés**.  
3. Envía (reCAPTCHA si está activo; si no, modo degradado con tope por IP).  
4. Estado: **recibida**.

### 11.2 Moderación interna (paso a paso)

1. Abra Postulaciones.  
2. Filtre por “recibida”.  
3. Lea el contenido y el COI.  
4. **Aceptar** → la tecnología entra a la bandeja como **reactiva** (aún debe clasificarse/asignarse).  
5. **Rechazar** → escriba el motivo; queda en bitácora.

No acepte postulaciones incompletas “para salir del paso”: contaminan filtrado y priorización.

---

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
9. Exporte HTML si necesita versión institucional.

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
5. **Publicar** y/ o exportar.  

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
- Alto riesgo presupuestal (umbral de puntos).

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
| Cambiar perfil | Cambia permisos en el próximo token |
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
- Parámetros en caliente: cuota de ciclos, umbrales %P, similitud de duplicados, INVIMA, TTM, alertas, días del token del revisor, etc.  

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

#### Importar Excel

1. Seleccione el archivo «Fuentes de información proactiva EH» (`.xlsx`).  
2. Decida si **sobrescribe** lo editado en el panel.  
3. **Importar**.  
4. Revise el resumen: filas, actualizadas, creadas, criterios.  

Sin archivo: **Reaplicar matriz cargada** usa el JSON ya empaquetado.

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

## 26. Portales públicos

| URL | Quién | Qué hace |
|---|---|---|
| `/postular` | Ciudadanía / industria / academia | Postula tecnología + COI |
| `/expedientes` | Público | Busca fichas publicadas |
| `/expedientes/:id` | Público | Lee una ficha |
| `/transparencia` | Público | Cifras agregadas |
| `/revisar/:token` | Revisor invitado | Evalúa expediente |

Estos portales **no** muestran la bandeja interna ni datos de ciclos en configuración.

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
3. Salud del catálogo y recargas controladas.  
4. Cierre de ciclo cuando el embudo lo permita.  
5. Auditoría ante incidentes.  
6. Verificar que producción no tenga acceso de desarrollo.

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

Esperado para campos oficiales. Prioridad y flujo deberían permanecer. Si importó Excel con sobrescritura, revise ese flag.

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

Los tips (i) de la interfaz usan el mismo lenguaje; si un término no cuadra, abra el tip en pantalla.

---

## 30. Anexo: matriz EH y flujo de escaneo

### 30.1 Origen

Archivo **«FUENTES DE INFORMACION PROACTIVA EH»**:

- Hoja *MATRIZ FI EH*: ~89 filas → mapeadas a códigos del catálogo.  
- Hoja *Criterios de búsqueda*: 11 categorías de términos.

El catálogo resultante: **95 fuentes** (incluidas noticias).

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

---

## Cierre

Esta guía cubre el uso diario de **todos los módulos** del Sistema de Escaneo de Horizonte del IETS. Para instalar el servidor, variables de entorno, Docker o pruebas automatizadas use [`README.md`](README.md) y [`DEPLOY.md`](DEPLOY.md).

Si un botón no coincide con el nombre exacto de esta guía (textos menores de interfaz), confíe en el **tip (i)** de la pantalla: es la fuente de verdad del lenguaje visible al usuario.
