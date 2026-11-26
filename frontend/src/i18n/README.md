# Idiomas de la interfaz

La interfaz está en español (origen), inglés británico (`en-GB`) e inglés americano (`en-US`).
El selector está en la cabecera, en la pantalla de ingreso y en las pantallas públicas.

## Cómo funciona

- **El texto en español es la llave.** `t("Guardar cambios")` muestra el español tal cual y,
  en inglés, la entrada `"Guardar cambios"` del diccionario. Si falta la entrada se ve el español.
- El idioma se lee de `localStorage` antes de cargar la aplicación (`main.jsx` → `bootstrap.jsx`)
  y cambiarlo **recarga la página**. Por eso `t()` se puede usar en cualquier parte: dentro de un
  componente, en una constante de módulo, en un `const COLUMNAS = [...]`.
- Los diccionarios se escriben en **inglés americano**. El británico sale solo: `locales/en/british.js`
  cambia la ortografía (prioritize → prioritise, catalog → catalogue, center → centre, program →
  programme, color → colour, pediatric → paediatric…). Lo que cambie más que la ortografía va en `gb`.
- Fechas y números usan la región del idioma (`es-CO`, `en-GB`, `en-US`).

## Las cuatro funciones (`import { t, tr, ts, intlLocale } from "../i18n"`)

```jsx
t("Guardar cambios")
t("{n} de {total} fuente(s) procesadas", { n: done, total })      // variables con {nombre}
tr("Lea la <a>guía</a> antes de <b>publicar</b>", null, {          // texto con elementos dentro
  a: (c) => <Link to="/guia">{c}</Link>,
  b: (c) => <strong>{c}</strong>,
})
tr("Revisado por {quien}", { quien: <Badge>{name}</Badge> })       // una variable puede ser un nodo
ts(job.message)                                                    // texto que escribió el SERVIDOR
new Date(x).toLocaleString(intlLocale())                           // o fmtDateTime(x), fmtDate(x), fmtTime(x), fmtNumber(n)
```

## Reglas al traducir un archivo

1. **Todo texto que ve una persona pasa por `t()`**: texto JSX, `title`, `placeholder`,
   `aria-label`, `alt`, `label=`, mensajes de `toast`, `confirm`, textos de botones, encabezados de
   tabla, opciones de listas, estados vacíos, valores por defecto de props (`title = t("Confirmar")`),
   y los `fallback` de `apiError(e, t("No se pudo guardar"))`.
2. **La llave es el texto en español exacto, en una sola cadena literal.** Nada de concatenar
   pedazos ni armar la frase con `+`: el orden de las palabras cambia en inglés.
   - `` `Hola ${name}, tiene ${n} alertas` `` → `t("Hola {name}, tiene {n} alertas", { name, n })`
   - `<p>Use <strong>Guardar</strong> para terminar.</p>` → `<p>{tr("Use <b>Guardar</b> para terminar.", null, { b: (c) => <strong>{c}</strong> })}</p>`
   - Plurales hechos a mano: `n === 1 ? t("señal") : t("señales")`. Si la frase entera cambia, dos frases enteras:
     `n === 1 ? t("1 señal nueva") : t("{n} señales nuevas", { n })`.
   - Un texto JSX partido en varias líneas es una sola llave (los espacios y saltos se normalizan).
3. **No cambie el español.** Ni una coma: las pruebas E2E buscan esos textos. Tampoco cambie
   lógica, estilos, `className`, `data-testid`, rutas ni nombres de campos del servidor.
4. **No traduzca datos**: valores que se comparan o se envían al servidor (`status === "pendiente"`,
   `value="alta"`), llaves de objetos, rutas, códigos, nombres de permisos. Para mostrarlos se
   traduce la **etiqueta**, no el valor: `<option value="alta">{t("Alta")}</option>`.
   Si un mapa convierte códigos en etiquetas (`{ pendiente: "Pendiente" }`), se envuelven las etiquetas:
   `{ pendiente: t("Pendiente") }`.
5. **No traduzca contenido**: títulos de señales, nombres de fuentes, tecnologías, notas, nombres
   de personas, textos que escribe el usuario, respuestas de la IA, contenido capturado de la web.
6. **Texto del servidor** (prosa en español que arma el backend: `message`, `detail`, `reason`,
   `label`/`description`/`help` de catálogos, etapas de la vigilancia, textos de alertas): se muestra
   con `ts(valor)`. `ts` devuelve el texto igual si no lo reconoce, así que es seguro. Los errores
   que pasan por `apiError()` ya se traducen solos.
7. **Fechas y números**: cambie `"es-CO"` por `intlLocale()` y los `toLocaleString()` sin región
   por `toLocaleString(intlLocale())` (o use `fmtDateTime`, `fmtDate`, `fmtTime`, `fmtNumber`).
8. **Si el archivo ya usa `t` como variable** (`.map((t) => …)`, `const t = …`), renombre esa
   variable local (por ejemplo a `item`, `tab`, `tech`) antes de importar `t`. No importe con alias.
9. **Mismo español, dos sentidos en inglés**: agregue un contexto con `##`: `t("Abrir##verbo")` y
   `t("Abrir##adjetivo")`. En español se muestra «Abrir»; cada llave tiene su traducción.
10. Términos fijos (no los cambie entre pantallas):

| Español | Inglés |
|---|---|
| Escaneo de horizonte | Horizon scanning |
| Vigilancia | Surveillance |
| Señal / señales capturadas | Signal / captured signals |
| Fuente / catálogo de fuentes | Source / source catalog |
| Bandeja de trabajo | Workbench |
| Bandeja de entrada | Inbox |
| Filtrado y depuración | Screening and clean-up |
| Tamizaje | Screening |
| Priorización | Prioritization |
| Evaluación (temprana) | (Early) assessment |
| Diseminación | Dissemination |
| Boletín | Bulletin |
| Postulación / postular | Submission / submit a technology |
| Ciclo de escaneo | Scanning cycle |
| Tecnología sanitaria | Health technology |
| Ficha | Fact sheet (ficha técnica: technical sheet) |
| Expediente | Dossier |
| Hallazgo | Finding |
| Tablero estratégico | Strategic dashboard |
| Alertas tempranas | Early alerts |
| Bitácora de auditoría | Audit log |
| Usuarios y perfiles | Users and profiles |
| Perfil (rol) | Profile |
| Revisor / revisión por pares | Reviewer / peer review |
| Fabricante | Manufacturer |
| Respaldo (ruta alterna de lectura) | Fallback route |
| Copia / copia de seguridad | Backup |
| Punto de recuperación | Recovery point |
| Asistente IA | AI assistant |
| IETS, INVIMA, MinSalud, nombres de entidades | sin traducir |

Trato: el español usa «usted»; en inglés, imperativo directo y neutro ("Save changes", "Select a source").
Frases completas con punto final si el español lo tiene; mayúscula solo inicial ("Source catalog", no "Source Catalog").

## Dónde va la traducción

Un diccionario por archivo fuente, en `locales/en/`, con el nombre del archivo:
`src/pages/Scan.jsx` → `locales/en/pages.Scan.js`; `src/components/Layout.jsx` → `locales/en/components.Layout.js`.

```js
// locales/en/pages.Scan.js
export default {
  "Última vigilancia": "Latest surveillance run",
  "{n} de {total} fuente(s) procesadas": "{n} of {total} source(s) processed",
};

// Opcional: solo cuando el británico cambia algo más que la ortografía.
export const gb = {
  "Programar": "Timetable",
};
```

Las variables `{n}` y las marcas `<b>` deben aparecer igual en la traducción.
Los mensajes del servidor van en `locales/en/server.*.js`, con `patterns` para los que llevan datos:

```js
export default { "La fuente asociada ya no existe.": "The associated source no longer exists." };
export const patterns = [
  { re: /^Circuito abierto hasta (.+)\.$/, en: "Circuit open until $1." },
  // Función cuando una parte capturada también es texto del servidor:
  { re: /^Sonda (ambar|rojo): (.+)$/, en: (m, ts) => `Probe ${m[1] === "rojo" ? "red" : "amber"}: ${ts(m[2])}` },
];
```

## Verificar

```bash
node scripts/i18n-check.mjs                     # todo
node scripts/i18n-check.mjs src/pages/Scan.jsx  # un archivo
```

- `FALTA`: llave usada en `t()`/`tr()` sin entrada en el diccionario.
- `CHOQUE`: la misma llave con dos traducciones distintas (unifique, o separe con `##`).
- `ESPAÑOL`: texto que parece español y no pasa por `t()`. Es una heurística: revise cada línea.
  Valores de datos, llaves y contenido no se traducen y pueden quedar en la lista.

En desarrollo, `window.__i18nMissing` (consola del navegador) lista las llaves que se pidieron y no existen.
