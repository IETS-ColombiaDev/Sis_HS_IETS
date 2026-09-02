import Badge from "./Badge";
import Button from "./Button";
import Icon from "./Icon";
import Tooltip from "./Tooltip";
import { SCREENING_QUEUE_THRESHOLD } from "../constants/methodology";

/**
 * Puntaje de cribado de la senal capturada. Ordena la cola de trabajo; no es el
 * indice de priorizacion %P, que se calcula con la matriz oficial P1 a P6.
 */
export function ScreeningScore({ score, compact = false }) {
  const n = Number(score) || 0;
  const high = n >= SCREENING_QUEUE_THRESHOLD;
  const tone = high ? "priorizado" : n >= 50 ? "revisado" : "viewer";
  return (
    <Tooltip
      text={`Puntaje de cribado: ${n}. Ordena la cola de senales sin calificar (destaque desde ${SCREENING_QUEUE_THRESHOLD}). No es el indice %P de la matriz oficial.`}
    >
      <Badge tone={tone}>{compact ? `Cribado ${n}` : `Cribado ${n}/100`}</Badge>
    </Tooltip>
  );
}
export default function TriageBoard({ findings, isEditor, onOpen, onStatus, onGenerate }) {
  const columns = [
    { key: "nuevo", label: "Nuevas senales", tone: "nuevo" },
    { key: "revisado", label: "En revision", tone: "revisado" },
    { key: "priorizado", label: "Priorizadas", tone: "priorizado" },
    { key: "descartado", label: "Descartadas", tone: "descartado" },
  ];

  return (
    <div className="triage-board">
      {columns.map((col) => {
        const items = findings.filter((f) => f.status === col.key);
        return (
          <div key={col.key} className="triage-column">
            <div className="triage-column-head">
              <Badge tone={col.tone}>{col.label}</Badge>
              <span className="triage-count">{items.length}</span>
            </div>
            <div className="triage-column-body">
              {items.length === 0 ? (
                <p className="triage-empty">Sin items</p>
              ) : (
                items.map((f) => (
                  <div key={f.id} className="triage-card" onClick={() => onOpen(f)} role="button" tabIndex={0}>
                    <div className="triage-card-top">
                      <ScreeningScore score={f.screening_score} compact />
                      {f.horizon && <Badge>{f.horizon}</Badge>}
                    </div>
                    <div className="triage-card-title">{f.title}</div>
                    <div className="triage-card-meta">
                      <Badge>{f.technology_type || "otro"}</Badge>
                      <span title={f.source_title}>{f.source_title}</span>
                    </div>
                    {isEditor && (
                      <div className="triage-card-actions" onClick={(e) => e.stopPropagation()}>
                        {col.key === "nuevo" && (
                          <Button size="sm" variant="outline" onClick={() => onStatus(f, "revisado")}>
                            Revisar
                          </Button>
                        )}
                        {col.key === "revisado" && (
                          <>
                            <Button size="sm" onClick={() => onStatus(f, "priorizado")}>Priorizar</Button>
                            <Button size="sm" variant="ghost" onClick={() => onStatus(f, "descartado")}>Descartar</Button>
                          </>
                        )}
                        {col.key === "priorizado" && (
                          <Button size="sm" variant="outline" onClick={() => onGenerate(f)}>
                            <Icon name="pulse" size={13} /> IA
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
