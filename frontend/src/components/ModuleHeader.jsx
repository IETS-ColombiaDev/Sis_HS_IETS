import { PageHeader } from "./Card";
import WorkflowStrip from "./WorkflowStrip";

/**
 * Encabezado unificado por modulo: flujograma + titulo + una sola linea de proposito.
 * Evita banners HelpNote repetidos en cada pantalla.
 */
export default function ModuleHeader({ step, title, purpose, actions, showWorkflow = true, titleHint }) {
  return (
    <div className="module-header">
      {showWorkflow && <WorkflowStrip active={step} />}
      <PageHeader title={title} subtitle={purpose} actions={actions} titleHint={titleHint} />
    </div>
  );
}
