import { Link } from "react-router-dom";
import Modal from "./Modal";
import Button from "./Button";
import HintButton from "./HintButton";
import Badge from "./Badge";
import Icon from "./Icon";
import NotesPanel from "./NotesPanel";
import SignalLinkInfo from "./SignalLinkInfo";
import { TermLabel } from "./InfoTip";
import { ScreeningScore } from "./TriageBoard";
import { HORIZON_LABELS, STATUS_LABELS } from "../constants/methodology";
import { GLOSSARY } from "../constants/glossary";
import { intlLocale, t } from "../i18n";

const STATUSES = ["nuevo", "revisado", "priorizado", "descartado"];
// Etiquetas de los valores: el valor en español es el que se guarda y se envía al servidor.
const HORIZON_NAME = { emergente: t("emergente"), transicional: t("transicional"), inminente: t("inminente") };
const TYPE_NAME = { medicamento: t("medicamento"), dispositivo: t("dispositivo"), digital: t("digital"), otro: t("otro") };
const STATUS_NAME = { nuevo: t("nuevo"), revisado: t("revisado"), priorizado: t("priorizado"), descartado: t("descartado") };
// Badge elige el color por el valor: se le pasa como tono para que la etiqueta traducida no lo cambie.
const toneOf = (value) => String(value || "").toLowerCase();

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
    <Modal open={!!finding} onClose={onClose} title={t("Ficha de señal tecnológica")} width={720}>
      <div data-testid="finding-detail">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          <ScreeningScore score={finding.screening_score} />
          <Badge tone={toneOf(finding.technology_type || "otro")}>{TYPE_NAME[finding.technology_type || "otro"] || finding.technology_type}</Badge>
          {finding.horizon && <TooltipBadge label={HORIZON_NAME[finding.horizon] || finding.horizon} tone={toneOf(finding.horizon)} tip={HORIZON_LABELS[finding.horizon] || GLOSSARY.horizonte} />}
          <TooltipBadge label={STATUS_NAME[finding.status] || finding.status} tip={STATUS_LABELS[finding.status] || GLOSSARY.fb_estado_senal} tone={finding.status} />
        </div>
        <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 8, overflowWrap: "anywhere" }}>{finding.title}</h3>
        {finding.summary && (
          <p style={{ color: "#475569", fontSize: 14, marginBottom: 12, lineHeight: 1.6 }}>{finding.summary}</p>
        )}
        <p style={{ margin: "0 0 12px" }}>
          <Link to={`/chat?adjuntar=finding:${finding.id}`} data-testid="finding-ask-assistant" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#1D4ED8" }}>
            <Icon name="spark" size={14} /> {t("Preguntar al asistente sobre esta señal")}
          </Link>
        </p>
        <DL label={t("Tecnología")} value={finding.technology} />
        <DL label={t("Área terapéutica")} value={finding.therapeutic_area} />
        <DL label={t("Fase de desarrollo")} value={finding.phase} />
        <DL label={t("Publicado")} value={finding.published_date} />
        <DL label={t("Fuente")} value={finding.source_title} />
        <DL label={t("Capturada")} value={finding.created_at ? new Date(finding.created_at).toLocaleString(intlLocale()) : ""} />
        <DL label={t("Informes")} value={finding.recommendations_count ? t("{n} recomendación(es)", { n: finding.recommendations_count }) : ""} />

        <SignalLinkInfo
          url={finding.link || finding.url}
          linkType={finding.link_type}
          linkStatus={finding.link_status}
          queryUrl={finding.query_url}
          evidence={finding.evidence}
        />
        <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {finding.url && !finding.link_type && (
            <a href={finding.link || finding.url} target="_blank" rel="noopener noreferrer" title={finding.url}>
              <Button variant="secondary" size="sm"><Icon name="external" size={14} /> {t("Enlace original")}</Button>
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
              <Icon name="spark" size={14} /> {t("Enriquecer con IA")}
            </HintButton>
          )}
          {onGenerate && (
            <HintButton
              variant="outline"
              size="sm"
              hint={GLOSSARY.fb_generar_informe}
              disabled={!canGenerate}
              disabledHint={t("Su perfil no redacta informes (permiso report:write).")}
              loading={generating}
              onClick={() => onGenerate(finding)}
            >
              <Icon name="pulse" size={14} /> {t("Generar informe")}
            </HintButton>
          )}
          {isEditor && onEdit && (
            <HintButton variant="ghost" size="sm" hint={t("Corregir título, resumen y clasificación de la señal")} onClick={() => onEdit(finding)}>
              <Icon name="edit" size={14} /> {t("Editar")}
            </HintButton>
          )}
          {isEditor && onDelete && (
            <HintButton variant="ghost" size="sm" style={{ color: "#DC2626" }} hint={GLOSSARY.fb_eliminar_senal} onClick={() => onDelete(finding)}>
              <Icon name="trash" size={14} /> {t("Eliminar")}
            </HintButton>
          )}
        </div>
        {isEditor && (
          <div style={{ marginTop: 18, borderTop: "1px solid #F1F5F9", paddingTop: 14 }}>
            <div style={{ fontSize: 12, color: "#64748B", marginBottom: 8 }}>
              <TermLabel tip={GLOSSARY.fb_estado_senal}>{t("Estado de triage")}</TermLabel>
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
                  {STATUS_NAME[s]}
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
