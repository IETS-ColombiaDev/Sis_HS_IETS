// Textos que escribe el servidor sobre las alertas: tipos y reglas
// (backend/app/alert_service.py).

export default {
  "Cambio de etapa · alto riesgo presupuestal": "Stage change · high budget risk",
  "Duplicados propuestos": "Proposed duplicates",
  "Una tecnología pasa a fase III y su ficha menciona a Colombia.": "A technology moves to phase III and its record mentions Colombia.",
  "Llega a quien sigue el clúster de la tecnología.": "It reaches whoever follows the technology's cluster.",
  "Una tecnología de alto riesgo presupuestal cambia de etapa en el flujo (por ejemplo, de priorizada a en evaluación).": "A high-budget-risk technology changes stage in the workflow (for example, from prioritized to in assessment).",
  "Una tecnología de alto riesgo presupuestal cambia de fase clínica.": "A high-budget-risk technology changes clinical phase.",
  "Termina una vigilancia programada con señales nuevas o con fuentes que fallaron.": "A scheduled surveillance run ends with new signals or with sources that failed.",
  "Llega a quien puede ejecutar la vigilancia, sin necesidad de suscripción.": "It reaches whoever can run surveillance, with no subscription needed.",
  "El barrido automático encuentra tecnologías que parecen duplicadas.": "The automatic sweep finds technologies that look duplicated.",
  "Llega a quien puede fusionar tecnologías, sin necesidad de suscripción.": "It reaches whoever can merge technologies, with no subscription needed.",
};

export const patterns = [
  {
    re: /^Pasó de «(.+)» a «(.+)» con (\d+) puntos de priorización\.$/,
    en: (m, ts) => `It moved from «${ts(m[1])}» to «${ts(m[2])}» with ${m[3]} prioritization points.`,
  },
  {
    re: /^Aplica a tecnologías con (\d+) o más puntos en la matriz de priorización\.$/,
    en: "It applies to technologies with $1 or more points in the prioritization matrix.",
  },
];
