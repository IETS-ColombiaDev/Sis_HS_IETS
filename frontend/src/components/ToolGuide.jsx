import Accordion from "./Accordion";

const STEPS = [
  {
    id: "what",
    icon: "compass",
    title: "¿Qué es esta herramienta?",
    body: (
      <>
        Es el <strong>Sistema de Escaneo de Horizonte del IETS</strong>: una plataforma de alerta temprana
        que vigila fuentes internacionales y nacionales para detectar <strong>tecnologías sanitarias emergentes</strong>
        (medicamentos, dispositivos, salud digital) y generar <strong>recomendaciones de adopción para Colombia</strong>.
      </>
    ),
  },
  {
    id: "how",
    icon: "radar",
    title: "¿Cómo funciona?",
    body: (
      <ol style={{ margin: "0 0 0 18px", lineHeight: 1.7 }}>
        <li><strong>Fuentes</strong> — listado maestro de URLs y documentos vigilados.</li>
        <li><strong>Vigilancia</strong> — conectores de API y rastreo HTML/PDF consultan cada fuente, a mano o de forma programada.</li>
        <li><strong>Señales</strong> — tecnologías capturadas, clasificadas por tipo, horizonte y estado de triage.</li>
        <li><strong>Diseminación</strong> — recomendaciones de adopción para Colombia (IA como borrador) y paquete ZIP por ciclo.</li>
        <li><strong>Notas del equipo</strong> — observaciones editables, descargables y mejorables con IA.</li>
        <li><strong>Dashboards</strong> — gráficas que se actualizan en tiempo real cuando hay cambios.</li>
      </ol>
    ),
  },
  {
    id: "sources",
    icon: "globe",
    title: "¿De dónde salen las fuentes?",
    body: (
      <>
        El inventario inicial proviene del <strong>Excel de escaneo de horizonte del IETS</strong> (NIHR Innovation
        Observatory, productos IETS, MinSalud, referentes internacionales). Puede <strong>agregar más URLs</strong> en
        modo rápido (nombre + enlace) o modo avanzado (categoría, descripción, metadatos). Todas quedan en el
        listado maestro de Fuentes.
      </>
    ),
  },
  {
    id: "ai",
    icon: "bulb",
    title: "Inteligencia artificial (MiniMax, con Gemini de respaldo)",
    body: (
      <>
        Con una <strong>llave de MiniMax</strong> (o Gemini) configurada en Configuración (solo superadministrador), la IA funciona al 100%:
        genera recomendaciones de adopción, responde en el chat con contexto del sistema, enriquece señales y mejora
        notas del equipo. Sin llave, el sistema sigue operando con datos del escaneo y respuestas preliminares.
      </>
    ),
  },
  {
    id: "notes",
    icon: "note",
    title: "Notas y comentarios del equipo",
    body: (
      <>
        En <strong>Notas</strong> o dentro de cada señal, fuente o informe puede <strong>comentar</strong>,{" "}
        <strong>editar</strong>, <strong>fijar</strong> (📌) y <strong>descargar</strong> todas las notas en CSV.
        Los editores pueden pulir una nota con el botón <strong>Mejorar con IA</strong>.
      </>
    ),
  },
  {
    id: "live",
    icon: "pulse",
    title: "Tiempo real",
    body: (
      <>
        El indicador <strong>En vivo</strong> en la barra superior confirma que los datos se comparten al instante.
        Escaneos, hallazgos, notas y gráficas se refrescan automáticamente cada pocos segundos para todo el equipo.
      </>
    ),
  },
];

export default function ToolGuide() {
  return (
    <div style={{ marginBottom: 24 }}>
      <Accordion
        items={STEPS.map((s) => ({ id: s.id, icon: s.icon, title: s.title, content: s.body }))}
        defaultOpen={["what"]}
      />
    </div>
  );
}
