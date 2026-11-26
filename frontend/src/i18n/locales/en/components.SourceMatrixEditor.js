// src/components/SourceMatrixEditor.jsx — campos de la matriz EH y flujo de escaneo de una fuente.
export default {
  // Listas de respaldo (las mismas del servidor por defecto)
  "Primaria": "Primary",
  "Secundaria": "Secondary",
  "Terciaria": "Tertiary",
  "Por definir": "To be defined",
  "Medicamentos": "Medicines",
  "Dispositivos médicos": "Medical devices",
  "Biomarcadores": "Biomarkers",
  "Inteligencia artificial": "Artificial intelligence",
  "Software como dispositivo (SaMD)": "Software as a medical device (SaMD)",
  "Múltiples tecnologías": "Multiple technologies",

  // Casillas del flujo
  "Recorrido del sitio": "Site crawl",
  "Seguir enlaces internos": "Follow internal links",
  "OCR de documentos e imágenes": "OCR of documents and images",
  "Lectura con IA": "AI reading",
  "Búsqueda web impulsada por IA": "AI-driven web search",

  // Validación
  'La URL "{url}" debe iniciar con http:// o https://': 'The URL "{url}" must start with http:// or https://',
  "Las páginas por fuente deben ser un entero entre 0 y 20 (0 = valor global).":
    "Pages per source must be a whole number between 0 and 20 (0 = global value).",

  // Formulario
  "Matriz EH": "HS matrix",
  "Origen en la matriz: {ref}": "Origin in the matrix: {ref}",
  "Nivel de fuente": "Source level",
  "Origen (matriz)": "Origin (matrix)",
  "Sin origen": "No origin",
  "Tipo de material": "Material type",
  "Informes, alertas, bases de datos...": "Reports, alerts, databases...",
  "Tipos de tecnología": "Technology types",
  "URLs de entrada (una por línea)": "Entry URLs (one per line)",
  "URLs de referencia o metodología": "Reference or methodology URLs",
  "Ruta de acceso": "Access path",
  "Qué consultar": "What to consult",
  "Observaciones": "Remarks",
  "Restricciones de uso": "Usage restrictions",
  "Flujo de escaneo de esta fuente": "Scanning flow for this source",
  "La búsqueda web está apagada en Configuración › Parámetros de fuentes: esta casilla no tendrá efecto hasta encenderla.":
    "Web search is turned off in Settings › Source parameters: this checkbox will have no effect until it is turned on.",
  "Páginas a seguir (0 = valor global)": "Pages to follow (0 = global value)",
  "Dominio de búsqueda": "Search domain",
  "Vacío = dominio de la URL": "Empty = domain of the URL",
  "Palabras guía para seguir enlaces (coma)": "Guide words for following links (comma-separated)",
  "Términos propios de búsqueda web (coma)": "Source-specific web search terms (comma-separated)",
  "Vacío = términos por tipo de tecnología": "Empty = terms by technology type",

  // Resultado de «Probar búsqueda web»
  "Dominio: <b>{dominio}</b> · Consultas redactadas por {origen}": "Domain: <b>{dominio}</b> · Queries written by {origen}",
  "la IA": "the AI",
  "reglas (sin IA)": "rules (no AI)",
  "Sin resultados dentro del dominio en esta prueba. Los motores gratuitos limitan las consultas seguidas: vuelva a intentar en unos minutos o configure Brave/SearXNG.":
    "No results within the domain in this test. Free engines limit consecutive queries: try again in a few minutes or set up Brave/SearXNG.",
};
