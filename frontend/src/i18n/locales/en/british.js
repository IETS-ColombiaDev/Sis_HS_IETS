/**
 * Inglés británico a partir del americano.
 *
 * Los diccionarios se escriben en inglés americano. La ortografía británica sale
 * de esta tabla (palabra completa, respetando mayúsculas); lo que cambia más que
 * la ortografía se pone a mano en el `gb` de cada diccionario y tiene prioridad.
 *
 * Solo entran palabras cuyo cambio es seguro en este sistema. "program" queda
 * como "programme" porque aquí siempre es un programa institucional, no software.
 */
const STEMS = [
  // -ize / -ization (Oxford admite -ize, pero el NHS, NICE y el NIHR escriben -ise)
  ["prioritiz", "prioritis"],
  ["organiz", "organis"],
  ["authoriz", "authoris"],
  ["categoriz", "categoris"],
  ["summariz", "summaris"],
  ["standardiz", "standardis"],
  ["normaliz", "normalis"],
  ["customiz", "customis"],
  ["synchroniz", "synchronis"],
  ["recogniz", "recognis"],
  ["finaliz", "finalis"],
  ["centraliz", "centralis"],
  ["specializ", "specialis"],
  ["generaliz", "generalis"],
  ["harmoniz", "harmonis"],
  ["characteriz", "characteris"],
  ["optimiz", "optimis"],
  ["minimiz", "minimis"],
  ["maximiz", "maximis"],
  ["utiliz", "utilis"],
  ["visualiz", "visualis"],
  ["initializ", "initialis"],
  ["emphasiz", "emphasis"],
  ["anonymiz", "anonymis"],
  ["commercializ", "commercialis"],
  ["hospitaliz", "hospitalis"],
  ["randomiz", "randomis"],
  ["immuniz", "immunis"],
  ["digitiz", "digitis"],
  ["institutionaliz", "institutionalis"],
  ["formaliz", "formalis"],
  ["materializ", "materialis"],
  ["apologiz", "apologis"],
  ["criticiz", "criticis"],
  ["scrutiniz", "scrutinis"],
  ["capitaliz", "capitalis"],
  ["localiz", "localis"],
  ["personaliz", "personalis"],
  ["realiz", "realis"],
  ["stabiliz", "stabilis"],
  ["mobiliz", "mobilis"],
  ["modeliz", "modelis"],
  // -yze
  ["analyz", "analys"],
  ["paralyz", "paralys"],
  ["catalyz", "catalys"],
  // -or / -our
  ["color", "colour"],
  ["behavior", "behaviour"],
  ["favor", "favour"],
  ["honor", "honour"],
  ["labor", "labour"],
  ["neighbor", "neighbour"],
  ["tumor", "tumour"],
  ["rumor", "rumour"],
  ["endeavor", "endeavour"],
  // -er / -re
  ["center", "centre"],
  ["fiber", "fibre"],
  // consonante doble
  ["canceled", "cancelled"],
  ["canceling", "cancelling"],
  ["labeled", "labelled"],
  ["labeling", "labelling"],
  ["modeled", "modelled"],
  ["modeling", "modelling"],
  ["traveled", "travelled"],
  ["traveling", "travelling"],
  ["signaled", "signalled"],
  ["signaling", "signalling"],
  ["channeled", "channelled"],
  ["totaled", "totalled"],
  ["counselor", "counsellor"],
  ["enrollment", "enrolment"],
  ["installment", "instalment"],
  ["skillful", "skilful"],
  // medicina
  ["pediatric", "paediatric"],
  ["hematolog", "haematolog"],
  ["hemoglobin", "haemoglobin"],
  ["hemophilia", "haemophilia"],
  ["hemorrhag", "haemorrhag"],
  ["anemia", "anaemia"],
  ["anemic", "anaemic"],
  ["leukemia", "leukaemia"],
  ["anesthe", "anaesthe"],
  ["orthopedic", "orthopaedic"],
  ["gynecolog", "gynaecolog"],
  ["estrogen", "oestrogen"],
  ["esophag", "oesophag"],
  ["edema", "oedema"],
  ["diarrhea", "diarrhoea"],
  ["celiac", "coeliac"],
  ["etiolog", "aetiolog"],
  ["ischemi", "ischaemi"],
  ["septicemia", "septicaemia"],
  ["cesarean", "caesarean"],
  // otras
  ["catalog", "catalogue"],
  ["dialog", "dialogue"],
  ["program", "programme"],
  ["judgment", "judgement"],
  ["aging", "ageing"],
  ["gray", "grey"],
  ["defense", "defence"],
  ["offense", "offence"],
  ["skeptic", "sceptic"],
  ["artifact", "artefact"],
  ["check mark", "tick"],
  ["checkmark", "tick"],
];

// Palabras que empiezan igual que una raíz pero NO cambian.
const KEEP = new Set([
  "catalogue", "catalogued", "catalogues", "cataloguing", "dialogue", "dialogues",
  "programme", "programmes", "programmed", "programmer", "programmers", "programming", "programmatic",
  "programmatically", "programmable",
  "colorado", "coloration", "colorectal", "colorimetric", "colorimetry",
  "honorary", "honorific", "honorarium", "honoraria",
  "laboratory", "laboratories", "laborious",
  "tumorigenic", "tumorigenesis", "grayscale",
]);

// Formas completas que la regla por raíz no resuelve bien.
const WORDS = {
  centered: "centred",
  centering: "centring",
  license: "licence", // sustantivo; "licensed" y "licensing" se escriben igual en ambos
  licenses: "licences",
  cataloged: "catalogued",
  cataloging: "cataloguing",
  liter: "litre",
  liters: "litres",
  milliliter: "millilitre",
  milliliters: "millilitres",
  fulfill: "fulfil",
  fulfills: "fulfils",
  fulfillment: "fulfilment",
  aluminum: "aluminium",
  toward: "towards",
  afterward: "afterwards",
};

const PREFIX = /^(re|un|de|pre|mis|multi|sub|non|dis|over|under)-?/;

function matchCase(source, target) {
  if (source === source.toUpperCase() && source.length > 1) return target.toUpperCase();
  if (source[0] === source[0].toUpperCase()) return target[0].toUpperCase() + target.slice(1);
  return target;
}

function fromStem(lower) {
  if (KEEP.has(lower)) return lower;
  for (const [us, gb] of STEMS) {
    if (!us.includes(" ") && lower.startsWith(us)) return gb + lower.slice(us.length);
  }
  return null;
}

function convertWord(word) {
  const lower = word.toLowerCase();
  if (Object.prototype.hasOwnProperty.call(WORDS, lower)) return matchCase(word, WORDS[lower]);
  const direct = fromStem(lower);
  if (direct != null) return matchCase(word, direct);
  // Prefijos frecuentes: reorganize, uncategorized, deprioritize…
  const m = PREFIX.exec(lower);
  if (m) {
    const rest = lower.slice(m[0].length);
    if (Object.prototype.hasOwnProperty.call(WORDS, rest)) return matchCase(word, m[0] + WORDS[rest]);
    const inner = fromStem(rest);
    if (inner != null) return matchCase(word, m[0] + inner);
  }
  return word;
}

/** Convierte un texto en inglés americano a ortografía británica. No toca URL, códigos, variables ni palabras con tilde (nombres en español). */
export function toBritish(text) {
  if (typeof text !== "string" || !text) return text;
  let out = text;
  for (const [us, gb] of STEMS) {
    if (!us.includes(" ")) continue;
    out = out.replace(new RegExp(`\\b${us}\\b`, "gi"), (m) => matchCase(m, gb));
  }
  // Se saltan {variables}, <marcas>, $1 y cualquier cosa con forma de URL o ruta.
  return out.replace(/(\{\w+\}|<\/?\w+\s*\/?>|\$\d|https?:\/\/\S+|[\w.-]+\.[a-z]{2,}\/\S*|[\w.]+_[\w.]+)|\p{L}+/gu, (m, skip) => (skip || /[^A-Za-z]/.test(m) ? m : convertWord(m)));
}
