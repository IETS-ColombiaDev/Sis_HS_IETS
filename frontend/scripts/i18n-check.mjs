#!/usr/bin/env node
/**
 * Verifica las traducciones de la interfaz.
 *
 *   node scripts/i18n-check.mjs                    todo src/
 *   node scripts/i18n-check.mjs src/pages/Scan.jsx  solo esos archivos
 *   node scripts/i18n-check.mjs --strict           falla (código 1) si falta alguna llave
 *
 * Informa:
 *   FALTA   llaves usadas en t()/tr() que no están en ningún diccionario de inglés
 *   CHOQUE  la misma llave con dos traducciones distintas en diccionarios diferentes
 *   ESPAÑOL textos que parecen español y no pasan por t()/tr()/ts() (heurística: revisar a ojo)
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "src");
const localeDir = join(src, "i18n", "locales", "en");
const args = process.argv.slice(2);
const strict = args.includes("--strict");
const quiet = args.includes("--no-spanish");
const targets = args.filter((a) => !a.startsWith("--"));

const norm = (s) => String(s).replace(/\s+/g, " ").trim();

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "i18n" || name === "node_modules") continue;
      walk(full, out);
    } else if (/\.(jsx?|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

// ------------------------------------------------------------ diccionarios
const dict = new Map(); // llave -> { value, file }
const clashes = [];
for (const name of readdirSync(localeDir)) {
  if (!name.endsWith(".js") || name === "index.js" || name === "british.js") continue;
  let mod;
  try {
    mod = await import(pathToFileURL(join(localeDir, name)).href);
  } catch (err) {
    console.error(`ERROR  no se pudo cargar locales/en/${name}: ${err.message}`);
    process.exitCode = 1;
    continue;
  }
  for (const [key, value] of Object.entries(mod.default || {})) {
    const k = norm(key);
    if (typeof value !== "string") {
      console.error(`ERROR  locales/en/${name}: la llave "${k.slice(0, 60)}" no tiene un texto`);
      process.exitCode = 1;
      continue;
    }
    const before = dict.get(k);
    if (before && before.value !== value) clashes.push({ key: k, a: before, b: { value, file: name } });
    else if (!before) dict.set(k, { value, file: name });
    // Las variables y marcas deben sobrevivir a la traducción.
    const vars = (s) => [...s.matchAll(/\{(\w+)\}|<(\w+)>/g)].map((m) => m[0]).sort().join(",");
    if (vars(k) !== vars(value)) {
      console.error(`ERROR  locales/en/${name}: variables o marcas distintas en "${k.slice(0, 70)}"\n         es: ${vars(k) || "(ninguna)"}\n         en: ${vars(value) || "(ninguna)"}`);
      process.exitCode = 1;
    }
  }
  for (const key of Object.keys(mod.gb || {})) {
    if (!(mod.default || {})[key] && !dict.has(norm(key))) {
      console.error(`ERROR  locales/en/${name}: gb tiene "${norm(key).slice(0, 60)}" pero no está en default`);
      process.exitCode = 1;
    }
  }
}

// ------------------------------------------------------------ fuentes
const files = targets.length ? targets.map((f) => resolve(process.cwd(), f)) : walk(src);

function stripComments(code) {
  // Conserva la longitud y los saltos de línea para que los números de línea sirvan.
  return code
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, pre) => pre + " ".repeat(m.length - pre.length));
}

const STRING = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
const SPANISH = /[áéíóúñ¿¡Á-ÚÑ]|\b(el|la|los|las|del|para|con|sin|que|una|uno|por|como|más|esta|este|sus|aún|ya|no hay|se|al)\b/i;
const WORDS = /[A-Za-zÁ-úñ]{3,}/;

function unescape(s) {
  return s.replace(/\\n/g, "\n").replace(/\\(["'`\\])/g, "$1");
}

let missingTotal = 0;
let spanishTotal = 0;
for (const file of files) {
  const rel = relative(root, file).replace(/\\/g, "/");
  const code = stripComments(readFileSync(file, "utf8"));
  const lineOf = (index) => code.slice(0, index).split("\n").length;
  const missing = [];
  const spanish = [];
  const covered = []; // rangos de literales que ya son argumento de t/tr/ts

  // Llaves: t("…"), tr('…'), t(`…`) con literal como primer argumento.
  const CALL = /(?<![\w.$])(t|tr)\(\s*(?:"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`)/g;
  let m;
  while ((m = CALL.exec(code))) {
    const raw = m[2] ?? m[3] ?? m[4];
    covered.push([m.index, m.index + m[0].length]);
    if (m[4] != null && /\$\{/.test(raw)) {
      missing.push({ line: lineOf(m.index), key: `(plantilla con \${…}: use {variable}) ${raw.slice(0, 60)}` });
      continue;
    }
    const key = norm(unescape(raw));
    if (key && !dict.has(key)) missing.push({ line: lineOf(m.index), key });
  }
  // Argumentos de ts(...) y de llamadas anidadas dentro de t(...): se consideran cubiertos.
  const isCovered = (index) => covered.some(([a, b]) => index >= a && index < b);

  if (!quiet) {
    // Literales de cadena que parecen español.
    STRING.lastIndex = 0;
    while ((m = STRING.exec(code))) {
      const raw = m[1] ?? m[2] ?? m[3];
      if (isCovered(m.index)) continue;
      const text = unescape(raw).replace(/\$\{[^}]*\}/g, " ");
      if (!WORDS.test(text) || !SPANISH.test(text)) continue;
      if (!/\s/.test(text.trim()) && !/[áéíóúñ]/i.test(text)) continue; // identificadores sueltos
      const before = code.slice(Math.max(0, m.index - 40), m.index);
      if (/(from|import|require\()\s*$/.test(before)) continue;
      if (/(className|class|style|key|to|href|src|id|name|type|variant|tone|icon|data-[\w-]+|htmlFor|role|rel|target|method|autoComplete)\s*=\s*\{?\s*$/.test(before)) continue;
      if (/^[\w./:#?&=%@+-]+$/.test(text.trim())) continue; // rutas, urls, códigos
      spanish.push({ line: lineOf(m.index), text: norm(text).slice(0, 90) });
    }
    // Texto JSX entre etiquetas.
    const JSXTEXT = />([^<>{}]*[A-Za-zÁ-úñ]{3,}[^<>{}]*)</g;
    while ((m = JSXTEXT.exec(code))) {
      const text = norm(m[1]);
      if (!SPANISH.test(text)) continue;
      const before = code.slice(Math.max(0, m.index - 3), m.index + 1);
      if (/=>$/.test(before) || /[=<!&|?:(,]\s*$/.test(code.slice(Math.max(0, m.index - 2), m.index))) continue; // comparaciones y flechas, no JSX
      if (/[;=(){}]|&&|\|\|/.test(text)) continue; // es código, no texto
      spanish.push({ line: lineOf(m.index), text: text.slice(0, 90) });
    }
  }

  if (missing.length || spanish.length) console.log(`\n${rel}`);
  for (const x of missing) console.log(`  FALTA   ${x.line}: ${x.key}`);
  for (const x of spanish) console.log(`  ESPAÑOL ${x.line}: ${x.text}`);
  missingTotal += missing.length;
  spanishTotal += spanish.length;
}

if (!targets.length) {
  for (const c of clashes) {
    console.log(`\nCHOQUE  "${c.key.slice(0, 80)}"\n  ${c.a.file}: ${c.a.value}\n  ${c.b.file}: ${c.b.value}`);
  }
}

console.log(
  `\n${dict.size} llaves en los diccionarios · ${missingTotal} sin traducción · ${spanishTotal} textos en español por revisar` +
    (targets.length ? "" : ` · ${clashes.length} choque(s)`)
);
if (strict && (missingTotal || clashes.length)) process.exitCode = 1;
