/**
 * Une los diccionarios de inglés. Cada archivo de esta carpeta exporta:
 *   default  { "texto en español": "American English" }
 *   gb       { "texto en español": "British English" }   (opcional: solo cuando cambia algo más que la ortografía)
 *   patterns [{ re: /^…$/, en: "… $1 …" }]              (opcional: mensajes del servidor con datos variables)
 */
import { toBritish } from "./british.js";

const modules = import.meta.glob(["./*.js", "!./index.js", "!./british.js"], { eager: true });

function norm(text) {
  return String(text).replace(/\s+/g, " ").trim();
}

export function buildDictionary(language) {
  const british = language === "en-GB";
  const exact = {};
  const overrides = {};
  const patterns = [];
  for (const mod of Object.values(modules)) {
    for (const [key, value] of Object.entries(mod.default || {})) exact[norm(key)] = value;
    for (const [key, value] of Object.entries(mod.gb || {})) overrides[norm(key)] = value;
    for (const p of mod.patterns || []) patterns.push(p);
  }
  if (british) {
    for (const key of Object.keys(exact)) exact[key] = toBritish(exact[key]);
    Object.assign(exact, overrides);
    for (let i = 0; i < patterns.length; i += 1) {
      const p = patterns[i];
      if (p.gb != null) patterns[i] = { re: p.re, en: p.gb };
      else if (typeof p.en === "string") patterns[i] = { re: p.re, en: toBritish(p.en) };
      else patterns[i] = { re: p.re, en: (m, ts) => toBritish(p.en(m, ts)) };
    }
  }
  return { exact, patterns };
}
