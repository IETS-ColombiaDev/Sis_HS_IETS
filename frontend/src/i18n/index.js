/**
 * Idiomas de la interfaz: español (origen), inglés británico e inglés americano.
 *
 * El texto en español ES la llave: `t("Guardar cambios")`. Sin diccionario (o si
 * falta una entrada) se muestra el español, así una traducción pendiente nunca
 * rompe una pantalla. Las reglas para quien agrega textos están en README.md.
 *
 * El idioma se fija antes de cargar la aplicación (ver main.jsx) y cambiarlo
 * recarga la página: por eso `t()` sirve igual dentro de un componente que en una
 * constante de módulo.
 */
import { createElement, Fragment } from "react";

const STORAGE_KEY = "iets_hs_lang";

export const LANGUAGES = [
  { code: "es", label: "Español", short: "ES", intl: "es-CO", html: "es" },
  { code: "en-GB", label: "English (UK)", short: "EN-GB", intl: "en-GB", html: "en-GB" },
  { code: "en-US", label: "English (US)", short: "EN-US", intl: "en-US", html: "en-US" },
];

const CODES = LANGUAGES.map((l) => l.code);

function readStored() {
  try {
    const value = localStorage.getItem(STORAGE_KEY) || "";
    return CODES.includes(value) ? value : "es";
  } catch {
    return "es";
  }
}

let current = readStored();
let exact = null; // { "texto en español": "English text" }
let patterns = []; // [{ re, en }] para mensajes del servidor con datos variables
const missing = new Set();

/** Llave normalizada: los saltos de línea y espacios repetidos no cuentan. */
export function normalizeKey(text) {
  return String(text).replace(/\s+/g, " ").trim();
}

/** "Abrir##verbo" → "Abrir". El sufijo separa dos usos del mismo texto en español. */
function stripContext(key) {
  const at = key.indexOf("##");
  // Al inicio no es contexto: "## Título" es un encabezado Markdown.
  return at <= 0 ? key : key.slice(0, at);
}

function interpolate(text, vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name) => (name in vars && vars[name] != null ? String(vars[name]) : name in vars ? "" : whole));
}

/** Carga el diccionario del idioma guardado. Se llama una vez, antes de montar la aplicación. */
export async function initI18n() {
  const lang = LANGUAGES.find((l) => l.code === current) || LANGUAGES[0];
  try {
    document.documentElement.lang = lang.html;
  } catch {
    /* sin documento (pruebas) */
  }
  if (current === "es") return;
  try {
    const mod = await import("./locales/en/index.js");
    const built = mod.buildDictionary(current);
    exact = built.exact;
    patterns = built.patterns;
  } catch (err) {
    // Sin diccionario la interfaz queda en español: mejor que una pantalla en blanco.
    console.error("No se pudo cargar el diccionario de idioma", err);
    current = "es";
  }
}

export function getLanguage() {
  return current;
}

export function isSpanish() {
  return current === "es";
}

/** Guarda el idioma y recarga: todas las pantallas y constantes quedan en el idioma nuevo. */
export function setLanguage(code) {
  if (!CODES.includes(code) || code === current) return;
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    /* modo privado: no se puede recordar */
    return;
  }
  window.location.reload();
}

/** Región para `Intl` y `toLocale*`: es-CO, en-GB o en-US. */
export function intlLocale() {
  return (LANGUAGES.find((l) => l.code === current) || LANGUAGES[0]).intl;
}

function lookup(key) {
  const norm = normalizeKey(key);
  if (current === "es" || !exact) return stripContext(norm);
  const hit = exact[norm];
  if (hit != null) return hit;
  if (import.meta.env?.DEV && !missing.has(norm)) {
    missing.add(norm);
    if (typeof window !== "undefined") window.__i18nMissing = [...missing];
  }
  return stripContext(norm);
}

/**
 * Traduce un texto de la interfaz. `vars` reemplaza `{nombre}` en el resultado:
 * t("{n} de {total} fuentes", { n: 3, total: 115 }).
 */
export function t(key, vars) {
  if (key == null || key === "") return key ?? "";
  if (typeof key !== "string") return key;
  return interpolate(lookup(key), vars);
}

/**
 * Como `t`, pero admite marcas para negritas, enlaces o cualquier elemento:
 * tr("Lea la <a>guía</a> antes de <b>publicar</b>", null, {
 *   a: (c) => <Link to="/guia">{c}</Link>, b: (c) => <strong>{c}</strong> })
 * Devuelve nodos de React. Una marca sin función se dibuja como texto.
 */
export function tr(key, vars, tags = {}) {
  const text = interpolateRich(lookup(key), vars);
  return createElement(Fragment, null, ...parseRich(text, tags, vars));
}

const SLOT = "\u0000";

// Las variables que son nodos de React no se pueden pegar en el texto: se marcan y se insertan al final.
function interpolateRich(text, vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name) => {
    if (!(name in vars)) return whole;
    const value = vars[name];
    if (value == null) return "";
    if (typeof value === "object") return `${SLOT}${name}${SLOT}`;
    return String(value);
  });
}

function fillSlots(text, vars, keyBase) {
  if (!text.includes(SLOT)) return [text];
  return text.split(SLOT).map((part, i) =>
    i % 2 === 1 ? createElement(Fragment, { key: `${keyBase}-v${i}` }, vars[part]) : part
  ).filter((part) => part !== "");
}

function parseRich(text, tags, vars, keyBase = "r") {
  const out = [];
  const re = /<(\w+)>([\s\S]*?)<\/\1>|<(\w+)\s*\/>/g;
  let last = 0;
  let match;
  let n = 0;
  while ((match = re.exec(text))) {
    if (match.index > last) out.push(...fillSlots(text.slice(last, match.index), vars, `${keyBase}-${n}`));
    const name = match[1] || match[3];
    const inner = match[1] ? parseRich(match[2], tags, vars, `${keyBase}-${n}i`) : [];
    const render = tags[name];
    const key = `${keyBase}-${n}`;
    if (typeof render === "function") {
      const child = inner.length === 0 ? undefined : inner.length === 1 ? inner[0] : createElement(Fragment, null, ...inner);
      out.push(createElement(Fragment, { key }, render(child)));
    } else {
      out.push(...inner);
    }
    last = re.lastIndex;
    n += 1;
  }
  if (last < text.length) out.push(...fillSlots(text.slice(last), vars, `${keyBase}-e`));
  return out;
}

/**
 * Traduce un texto que escribió el SERVIDOR (mensajes de error, desenlace de una
 * vigilancia, etiquetas de etapa). Coincidencia exacta primero y luego por patrón.
 * Lo que no reconoce se devuelve igual: nunca toca el contenido capturado ni lo
 * que escriben las personas.
 */
export function ts(text) {
  if (current === "es" || !exact || typeof text !== "string" || !text) return text;
  const norm = normalizeKey(text);
  const hit = exact[norm];
  if (hit != null) return hit;
  for (const p of patterns) {
    const m = p.re.exec(norm);
    if (!m) continue;
    if (typeof p.en === "function") return p.en(m, ts);
    return p.en.replace(/\$(\d)/g, (_, i) => m[Number(i)] ?? "");
  }
  return text;
}

// ---------------------------------------------------------------- fechas y números
function asDate(value) {
  if (value == null || value === "") return null;
  // El servidor guarda en UTC; SQLite devuelve la fecha sin zona y el navegador la
  // leería como hora local (cinco horas corrida en Colombia).
  const naive = typeof value === "string" && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(value);
  const d = value instanceof Date ? value : new Date(naive ? `${value.replace(" ", "T")}Z` : value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Fecha y hora en el formato de la región. `fallback` cuando no hay valor. */
export function fmtDateTime(value, options, fallback = "-") {
  const d = asDate(value);
  return d ? d.toLocaleString(intlLocale(), options) : fallback;
}

export function fmtDate(value, options, fallback = "-") {
  const d = asDate(value);
  return d ? d.toLocaleDateString(intlLocale(), options) : fallback;
}

export function fmtTime(value, options, fallback = "-") {
  const d = asDate(value);
  return d ? d.toLocaleTimeString(intlLocale(), options) : fallback;
}

export function fmtNumber(value, options) {
  const n = Number(value);
  if (value == null || value === "" || Number.isNaN(n)) return "-";
  return n.toLocaleString(intlLocale(), options);
}
