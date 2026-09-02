import Modal from "./Modal";
import Button from "./Button";
import Badge from "./Badge";
import Icon from "./Icon";
import NotesPanel from "./NotesPanel";
import { ScreeningScore } from "./TriageBoard";
import { HORIZON_LABELS, STATUS_LABELS } from "../constants/methodology";

const STATUSES = ["nuevo", "revisado", "priorizado", "descartado"];

export default function FindingDetailModal({
  finding,
  onClose,
  isEditor,
  status,
  enhancingId,
  onEnhance,
  onQuickStatus,
}) {
  if (!finding) return null;

  return (
    <Modal open={!!finding} onClose={onClose} title="Ficha de senal tecnologica" width={720}>
      <div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          <ScreeningScore score={finding.screening_score} />
          <Badge>{finding.technology_type}</Badge>
          {finding.horizon && (
            <TooltipBadge label={finding.horizon} tip={HORIZON_LABELS[finding.horizon]} />
          )}
          <TooltipBadge label={finding.status} tip={STATUS_LABELS[finding.status]} tone={finding.status} />
        </div>
        <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>{finding.title}</h3>
        {finding.summary && (
          <p style={{ color: "#475569", fontSize: 14, marginBottom: 12, lineHeight: 1.6 }}>{finding.summary}</p>
        )}
        <DL label="Tecnologia" value={finding.technology} />
        <DL label="Area terapeutica" value={finding.therapeutic_area} />
        <DL label="Fase de desarrollo" value={finding.phase} />
        <DL label="Publicado" value={finding.published_date} />
        <DL label="Fuente" value={finding.source_title} />
        {finding.url && (
          <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a href={finding.url} target="_blank" rel="noreferrer">
              <Button variant="secondary" size="sm"><Icon name="external" size={14} /> Enlace original</Button>
            </a>
            {status?.gemini_enabled && isEditor && (
              <Button variant="outline" size="sm" loading={enhancingId === finding.id} onClick={() => onEnhance(finding)}>
                <Icon name="spark" size={14} /> Enriquecer con IA
              </Button>
            )}
          </div>
        )}
        {isEditor && (
          <div style={{ marginTop: 18, display: "flex", gap: 8, flexWrap: "wrap", borderTop: "1px solid #F1F5F9", paddingTop: 14 }}>
            {STATUSES.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={finding.status === s ? "primary" : "secondary"}
                onClick={() => onQuickStatus(finding, s)}
              >
                {s}
              </Button>
            ))}
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
    <div style={{ display: "flex", gap: 8, padding: "5px 0", fontSize: 14 }}>
      <div style={{ width: 150, color: "#94A3B8", flexShrink: 0 }}>{label}</div>
      <div style={{ color: "#0F172A" }}>{value}</div>
    </div>
  );
}
