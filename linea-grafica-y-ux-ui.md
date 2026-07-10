# Línea gráfica y guía UX/UI — Sistema de diseño

Este documento define una **línea gráfica y reglas de interfaz reutilizables** para aplicaciones web corporativas o de gestión (paneles, RRHH, workflows, dashboards). Sirve para **estandarizar nuevos productos o módulos** sobre la misma base visual y de experiencia, sin atarlos a un nombre comercial concreto.

En este repositorio, los valores están implementados en `frontend/src/styles/theme.js` y en componentes compartidos (**Header**, **Sidebar**, **Alert**, **KPICard**, etc.). En otro proyecto, reproduce los mismos tokens y patrones; las rutas de archivos aquí son **referencia técnica**, no un requisito de marca.

**Fuente de verdad para tokens (este codebase):** `frontend/src/styles/theme.js`. Los hex deben coincidir con ese archivo; si el tema cambia, actualiza también esta guía.

---

## 1. Identidad y marca (configurable)

Esta guía no impone nombre de producto ni institución. Aplica así:

| Elemento | Regla |
|----------|--------|
| **Nombre del producto** | Texto principal del área de marca (sidebar o login). Tipografía destacada, una sola jerarquía dominante. |
| **Subtítulo / organismo** | Opcional: segunda línea en mayúsculas o con `letter-spacing` amplio, color `text.tertiary`, tamaño pequeño. |
| **Metadatos** | Título y descripción del documento (`<title>`, meta) alineados al despliegue (desarrollo, cliente, intranet). |

**Gradiente de acento (purple → blue):** ángulo 135°, de `#6366F1` a `#3B82F6`. Uso recomendado: **logo o bloque de marca**, **avatares sin imagen**, acentos decorativos leves. No sustituye al color sólido de botones primarios donde el contraste y la predictibilidad son críticos.

**White-label:** para otro cliente o producto, puedes cambiar solo nombre y metadatos manteniendo tokens y layout; si cambias colores institucionales, redefine `colors.primary` en el tema y revisa contraste (WCAG).

---

## 2. Paleta de color

### 2.1 Primarios

| Token (`colors.primary.*`) | Hex | Uso |
|----------------------------|-----|-----|
| `purple` | `#6366F1` | Acción principal «moderna», ítem activo de navegación, foco de marca en UI. |
| `purpleDark` | `#4F46E5` | Hover de botón primario (variante morada). |
| `purpleLight` | `#818CF8` | Acentos suaves. |
| `blue` | `#3B82F6` | Secundario, enlaces, foco en campos, cabeceras de tabla o módulos que ya usan azul. |
| `aquamarine` | `#06B6D4` | Acento cyan opcional. |

**Regla:** En **layouts tipo panel** (sidebar + barra superior), el **morado** conviene para navegación y estado activo; el **azul** para datos, gráficos y piezas legacy. Las **acciones globales primarias** deben usar un solo componente de botón coherente con el tema (en este repo: `@/components/Button.jsx`).

### 2.2 Neutrales y texto

| Rol | Token | Hex |
|-----|--------|-----|
| Texto principal | `colors.text.primary` | `#0F172A` |
| Texto secundario | `colors.text.secondary` | `#64748B` |
| Texto terciario | `colors.text.tertiary` | `#94A3B8` |
| Texto sobre oscuro | `colors.text.inverse` | `#FFFFFF` |
| Fondo app | `colors.backgrounds.app` | `#F8FAFC` |
| Tarjetas / barra lateral | `colors.backgrounds.card` / `sidebar` | `#FFFFFF` |
| Hover en listas | `colors.backgrounds.hover` | `#F1F5F9` |
| Ítem activo (menú) | `colors.backgrounds.active` | `#EEF2FF` |

### 2.3 Bordes

| Token | Hex |
|-------|-----|
| `colors.borders.light` | `#E2E8F0` |
| `colors.borders.medium` | `#CBD5E1` |
| `colors.borders.dark` | `#94A3B8` |

Divisores del shell: preferir una convención (`colors.borders.light` o equivalente `#e5e7eb`) y mantenerla en toda la app.

### 2.4 Estados (semántica)

| Estado | Borde / icono | Fondo suave (referencia en alerts) |
|--------|----------------|-------------------------------------|
| Éxito | `#10B981` | `#D1FAE5` |
| Advertencia | `#F59E0B` | `#FEF3C7` |
| Error | `#EF4444` | `#FEE2E2` |
| Información | `#3B82F6` | `#DBEAFE` |

**Badges de alerta / pendientes / destructivo:** rojo `#EF4444`, texto blanco.

**Banners de contexto** (ej. modo solo lectura, suplantación de rol, entorno de prueba): tono ámbar — fondo `#FEF3C7`, borde `#FDE68A`, texto `#92400E`; acciones secundarias coherentes con ese tono.

---

## 3. Tipografía

- **Familia:** stack del sistema + Inter (u otra sans neutra); en este proyecto: `fonts.primary` y carga en `layout.jsx`.
- **Escala** (`fonts.sizes`): p. ej. `xs` 11px, `sm` 13px, `base` 15px (cuerpo por defecto), `md` 16px, `2xl` 24px (títulos de página en cabecera).
- **Pesos:** `medium` (500) en etiquetas y controles; `semibold` (600) en secciones; `bold` (700) en métricas y títulos fuertes.
- **Mayúsculas:** reservadas a **etiquetas de agrupación** en navegación (`uppercase`, `letter-spacing` ~0.5px, `text.tertiary`).

Evitar tamaños sueltos fuera de la escala salvo casos justificados (densidad de tabla densa, etc.).

---

## 4. Espaciado, radios y elevación

- **Espaciado** (`spacing`): escala 4 → 64px. Tarjetas: padding habitual **24px** (`spacing.xl`).
- **Radios** (`borderRadius`): controles y tarjetas **8px** (`base`) o **12px** (`lg`); píldoras y avatares **pill** (`full`).
- **Sombras** (`shadows`): de `sm` a `xl`; hover de tarjeta/KPI: `md`. Dropdowns: sombra tipo `0 10px 25px rgba(0,0,0,0.12)`.
- **Transiciones** (`transitions`): `fast` 150ms, `base` 200ms, `slow` 300ms — `ease-in-out`.

---

## 5. Layout tipo panel (shell)

Patrón aplicable a cualquier backoffice o intranet.

| Zona | Medida / comportamiento |
|------|-------------------------|
| **Barra lateral** | Ancho fijo recomendado **280px**; fondo blanco; borde derecho claro; en móvil: drawer + overlay oscuro semitransparente. |
| **Cabecera** | Altura **64px**; sticky; fondo blanco con ligera transparencia y blur opcional; borde inferior claro. |
| **Área de contenido** | Fondo `#F8FAFC` (`backgrounds.app`); márgenes laterales alineados con la cabecera (p. ej. **24px**). |
| **Breakpoints** | **≥1024px:** sidebar fija; **<1024px:** menú hamburguesa. **≥768px:** mostrar metadatos de usuario en cabecera si aplica. |

Implementación de referencia en este repo: `Header.jsx`, `Sidebar.jsx`.

---

## 6. Componentes y patrones de UI

### 6.1 Botones

**Convención recomendada en este codebase:** `@/components/Button.jsx`.

| Variante | Uso |
|----------|-----|
| `primary` | Acción principal (morado del tema). |
| `secondary` | Acción secundaria neutra con borde. |
| `success` / `danger` | Confirmaciones inequívocas. |
| `ghost` / `outline` | Prioridad baja sobre fondo claro. |

Tamaños: `sm`, `md`, `lg`. Hover primario: ligera elevación + sombra `md`.

**Legado:** puede coexistir otro botón (p. ej. `@/components/ui/Button.jsx` con estilo azul en negrita). En **nuevos** flujos, unificar en un solo sistema.

### 6.2 Campos de formulario

Referencia: `@/components/ui/Input.jsx`.

- Label: `fonts.sizes.sm`, `semibold`, `text.primary`.
- Borde: `2px solid` neutro; error: `colors.status.error`.
- Focus: borde `colors.primary.blue` (o el token que defináis para foco accesible).

### 6.3 Modales

Patrón: overlay semitransparente, contenedor blanco, radio **12px**, cabecera con título, cuerpo y pie opcional con separadores. Ver `@/components/ui/Modal.jsx`.

### 6.4 Alertas / notificaciones

Tarjeta blanca, **borde izquierdo 4px** semántico, icono en círculo con fondo suave, jerarquía título + mensaje. Ver `@/components/Alert.jsx`.

### 6.5 Tarjetas de métricas (KPI)

Borde claro, radio `lg`, hover con `translateY(-2px)` y sombra; etiqueta en mayúsculas discreta; valor grande. Ver `@/components/Dashboard/KPICard.jsx`.

### 6.6 Tablas

Cabecera con fondo de marca fuerte (p. ej. `primary.blue`) y texto blanco es un patrón válido para listados densos. Alternativa más neutra: cabecera gris claro + `text.primary`; si se introduce, documentarla como variante única para no mezclar estilos por pantalla.

---

## 7. Accesibilidad y foco

- **Focus visible:** outline **2px** `#6366F1` (alineado a `primary.purple`), offset **2px** — ver `globals.css` en este proyecto.
- **Área táctil:** objetivo mínimo ~40px en controles principales en mobile.
- **Dropdowns:** cerrar con clic fuera; **aria-label** en controles solo icono.
- **Alertas:** `role="alert"` y `aria-live` cuando el mensaje sea crítico o dinámico.

---

## 8. Motion y feedback

- Entradas: animaciones cortas (p. ej. 0.3s fade/slide) sin bloquear la interacción.
- Listas: hover sutil (`translateX` leve); **pulse** solo en contadores que requieran atención (no globalizar).
- **Impresión / PDF:** clase utilitaria para ocultar navegación (`no-print` en este repo).

---

## 9. Scrollbars

- Vista global: barra fina; track y thumb en neutros del tema (coherentes con `#F1F5F9` / `#CBD5E1`).
- Panel lateral: scrollbar aún más discreta si el contenido es largo.

---

## 10. Iconografía y datos

- **Iconos:** puede usarse set emoji en navegación y vacíos si se busca rapidez sin librería de iconos; mantener tono profesional y consistente. Para productos nuevos, valorar iconos vectoriales (misma familia y tamaño).
- **Gráficos:** paleta sacada de `theme.js` (`accent.*`, `primary.*`); evitar colores fuera del sistema salvo leyendas externas.

---

## 11. Checklist para nuevas aplicaciones o módulos

1. Centralizar tokens en un solo **`theme`** (o design tokens exportados).
2. Usar **layout panel** coherente (sidebar + cabecera + contenido) cuando la app sea de gestión.
3. Un solo **botón primario** semántico por pantalla (y una familia de variantes).
4. Formularios con **estados** claros: normal, focus, error, disabled.
5. Mensajes al usuario: toast/alert con **colores semánticos** y texto breve.
6. Estados **vacío** y **carga**: mensaje claro, `text.secondary`, sin dead ends.
7. Revisar **contraste** y **navegación por teclado** antes de cerrar.

---

## 12. Mantenimiento

- Nuevos colores → tema central + actualización de esta guía.
- Unificar componentes duplicados (p. ej. dos botones) cuando sea posible y ajustar la sección 6.1.

---

*Referencia de implementación: Next.js 14 en este repositorio; tokens en `frontend/src/styles/theme.js`. La guía es aplicable a cualquier stack que reproduzca los mismos valores y patrones.*
