import Accordion from "./Accordion";
import { t, tr } from "../i18n";

const B = { b: (c) => <strong>{c}</strong> };

const STEPS = [
  {
    id: "what",
    icon: "compass",
    title: t("¿Qué es esta herramienta?"),
    body: (
      <>
        {tr(
          "Es el <b>Sistema de Escaneo de Horizonte del IETS</b>: una plataforma de alerta temprana que vigila fuentes internacionales y nacionales para detectar <b>tecnologías sanitarias emergentes</b> (medicamentos, dispositivos, salud digital) y generar <b>recomendaciones de adopción para Colombia</b>.",
          null,
          B
        )}
      </>
    ),
  },
  {
    id: "how",
    icon: "radar",
    title: t("¿Cómo funciona?"),
    body: (
      <ol style={{ margin: "0 0 0 18px", lineHeight: 1.7 }}>
        <li>{tr("<b>Fuentes</b> - listado maestro de URLs y documentos vigilados.", null, B)}</li>
        <li>{tr("<b>Vigilancia</b> - conectores de API y rastreo HTML/PDF consultan cada fuente, a mano o de forma programada.", null, B)}</li>
        <li>{tr("<b>Señales</b> - tecnologías capturadas, clasificadas por tipo, horizonte y estado de triage.", null, B)}</li>
        <li>{tr("<b>Diseminación</b> - recomendaciones de adopción para Colombia (IA como borrador) y paquete ZIP por ciclo.", null, B)}</li>
        <li>{tr("<b>Notas del equipo</b> - observaciones editables, descargables y mejorables con IA.", null, B)}</li>
        <li>{tr("<b>Dashboards</b> - gráficas que se actualizan en tiempo real cuando hay cambios.", null, B)}</li>
      </ol>
    ),
  },
  {
    id: "sources",
    icon: "globe",
    title: t("¿De dónde salen las fuentes?"),
    body: (
      <>
        {tr(
          "El inventario inicial proviene del <b>Excel de escaneo de horizonte del IETS</b> (NIHR Innovation Observatory, productos IETS, MinSalud, referentes internacionales). Puede <b>agregar más URLs</b> en modo rápido (nombre + enlace) o modo avanzado (categoría, descripción, metadatos). Todas quedan en el listado maestro de Fuentes.",
          null,
          B
        )}
      </>
    ),
  },
  {
    id: "ai",
    icon: "bulb",
    title: t("Inteligencia artificial (MiniMax, con Gemini de respaldo)"),
    body: (
      <>
        {tr(
          "Con una <b>llave de MiniMax</b> (o Gemini) configurada en Configuración (solo superadministrador), la IA funciona al 100%: genera recomendaciones de adopción, responde en el chat con contexto del sistema, enriquece señales y mejora notas del equipo. Sin llave, el sistema sigue operando con datos del escaneo y respuestas preliminares.",
          null,
          B
        )}
      </>
    ),
  },
  {
    id: "notes",
    icon: "note",
    title: t("Notas y comentarios del equipo"),
    body: (
      <>
        {tr(
          "En <b>Notas</b> o dentro de cada señal, fuente o informe puede <b>comentar</b>, <b>editar</b>, <b>fijar</b> (📌) y <b>descargar</b> todas las notas en CSV. Los editores pueden pulir una nota con el botón <b>Mejorar con IA</b>.",
          null,
          B
        )}
      </>
    ),
  },
  {
    id: "live",
    icon: "pulse",
    title: t("Tiempo real"),
    body: (
      <>
        {tr(
          "El indicador <b>En vivo</b> en la barra superior confirma que los datos se comparten al instante. Escaneos, hallazgos, notas y gráficas se refrescan automáticamente cada pocos segundos para todo el equipo.",
          null,
          B
        )}
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
