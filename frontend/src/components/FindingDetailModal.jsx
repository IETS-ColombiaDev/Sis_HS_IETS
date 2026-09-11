import Modal from "./Modal";
import Button from "./Button";
import HintButton from "./HintButton";
import Badge from "./Badge";
import Icon from "./Icon";
import NotesPanel from "./NotesPanel";
import { TermLabel } from "./InfoTip";
import { ScreeningScore } from "./TriageBoard";
import { HORIZON_LABELS, STATUS_LABELS } from "../constants/methodology";
import { GLOSSARY } from "../constants/glossary";

const STATUSES = ["nuevo", "revisado", "priorizado", "descartado"];

/**
 * Ficha de una senal capturada. `onEdit`, `onDelete` y `onGenerate` son
 * opcionales: sin ellos la ficha queda de solo lectura en esos aspectos.
 */
export default function FindingDetailModal({
  finding,
  onClose,
  isEditor,
  status,
  enhancingId,
  onEnhance,
  onQuickStatus,
  onEdit,
  onDelete,
  onGenerate,
  generating = false,
  canGenerate = false,
}) {
  if (!finding) return null;
  const aiOn = Boolean(status?.ai_enabled ?? status?.gemini_enabled);

  return (
    <Modal open={!!finding} onClose={onClose} title="Ficha de señal tecnológica" width={720}>
      <div data-testid="finding-detail">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          <ScreeningScore score={finding.screening_score} />
          <Badge>{finding.technology_type || "otro"}</Badge>
          {finding.horizon && <TooltipBadge label={finding.horizon} tip={HORIZON_LABELS[finding.horizon] || GLOSSARY.horizonte} />}
          <TooltipBadge label={finding.status} tip={STATUS_LABELS[finding.status] || GLOSSARY.fb_estado_senal} tone={finding.status} />
        </div>
        <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 8, overflowWrap: "anywhere" }}>{finding.title}</h3>
        {finding.summary && (
          <p style={{ color: "#475569", fontSize: 14, marginBottom: 12, lineHeight: 1.6 }}>{finding.summary}</p>
        )}
        <DL label="Tecnología" value={finding.technology} />
        <DL label="Área terapéutica" value={finding.therapeutic_area} />
        <DL label="Fase de desarrollo" value={finding.phase} />
        <DL label="Publicado" value={finding.published_date} />
        <DL label="Fuente" value={finding.source_title} />
        <DL label="Capturada" value={finding.created_at ? new Date(finding.created_at).toLocaleString() : ""} />
        <DL label="Informes" value={finding.recommendations_count ? `${finding.recommendations_count} recomendación(es)` : ""} />

        <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {finding.url && (
            <a href={finding.url} target="_blank" rel="noreferrer">
              <Button variant="secondary" size="sm"><Icon name="external" size={14} /> Enlace original</Button>
            </a>
          )}
          {isEditor && onEnhance && (
            <HintButton
              variant="outline"
              size="sm"
              hint={GLOSSARY.fb_enriquecer}
              disabled={!aiOn}
              disabledHint={GLOSSARY.fb_ia_apagada}
              loading={enhancingId === finding.id}
              onClick={() => onEnhance(finding)}
            >
              <Icon name="spark" size={14} /> Enriquecer con IA
            </HintButton>
          )}
          {onGenerate && (
            <HintButton
              variant="outline"
              size="sm"
              hint={GLOSSARY.fb_generar_informe}
              disabled={!canGenerate}
              disabledHint="Su perfil no redacta informes (permiso report:write)."
              loading={generating}
              onClick={() => onGenerate(finding)}
            >
              <Icon name="pulse" size={14} /> Generar informe
            </HintButton>
          )}
          {isEditor && onEdit && (
            <HintButton variant="ghost" size="sm" hint="Corregir título, resumen y clasificación de la señal" onClick={() => onEdit(finding)}>
              <Icon name="edit" size={14} /> Editar
            </HintButton>
          )}
          {isEditor && onDelete && (
            <HintButton variant="ghost" size="sm" style={{ color: "#DC2626" }} hint={GLOSSARY.fb_eliminar_senal} onClick={() => onDelete(finding)}>
              <Icon name="trash" size={14} /> Eliminar
            </HintButton>
          )}
        </div>
        {isEditor && (
          <div style={{ marginTop: 18, borderTop: "1px solid #F1F5F9", paddingTop: 14 }}>
            <div style={{ fontSize: 12, color: "#64748B", marginBottom: 8 }}>
              <TermLabel tip={GLOSSARY.fb_estado_senal}>Estado de triage</TermLabel>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {STATUSES.map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={finding.status === s ? "primary" : "secondary"}
                  onClick={() => onQuickStatus(finding, s)}
                  aria-pressed={finding.status === s}
                  title={STATUS_LABELS[s] || s}
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>
        )}
        <NotesPanel entityType="finding" entityId={finding.id} />
      </div>
    </Modal>
  );
}

function TooltipBadge({ label, tip, tone }) {
  return (
    <span title={tip}>
      <Badge tone={tone}>{label}</Badge>
    </span>
  );
}

function DL({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", gap: 8, padding: "5px 0", fontSize: 14, flexWrap: "wrap" }}>
      <div style={{ width: 150, color: "#94A3B8", flexShrink: 0 }}>{label}</div>
      <div style={{ color: "#0F172A", minWidth: 0, overflowWrap: "anywhere" }}>{value}</div>
    </div>
  );
}
