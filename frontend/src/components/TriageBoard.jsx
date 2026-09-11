import Badge from "./Badge";
import Button from "./Button";
import Icon from "./Icon";
import Tooltip from "./Tooltip";
import ClampText from "./ClampText";
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
      text={`Puntaje de cribado: ${n}. Ordena la cola de señales sin calificar (destaque desde ${SCREENING_QUEUE_THRESHOLD}). No es el índice %P de la matriz oficial.`}
    >
      <Badge tone={tone}>{compact ? `Cribado ${n}` : `Cribado ${n}/100`}</Badge>
    </Tooltip>
  );
}
/**
 * Tablero de triage de senales. `counts` (opcional) trae el total por estado de
 * todo el conjunto filtrado; sin el, se cuentan solo las tarjetas cargadas.
 */
export default function TriageBoard({ findings, isEditor, onOpen, onStatus, onGenerate, counts }) {
  const columns = [
    { key: "nuevo", label: "Nuevas señales", tone: "nuevo" },
    { key: "revisado", label: "En revisión", tone: "revisado" },
    { key: "priorizado", label: "A seguir", tone: "priorizado" },
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
              <span className="triage-count" title={counts ? `${items.length} cargadas de ${counts[col.key] ?? items.length}` : undefined}>{counts?.[col.key] ?? items.length}</span>
            </div>
            <div className="triage-column-body">
              {items.length === 0 ? (
                <p className="triage-empty">Sin items</p>
              ) : (
                items.map((f) => (
                  <div
                    key={f.id}
                    className="triage-card"
                    onClick={() => onOpen(f)}
                    onKeyDown={(e) => { if (e.key === "Enter") onOpen(f); }}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="triage-card-top">
                      <ScreeningScore score={f.screening_score} compact />
                      {f.horizon && <Badge>{f.horizon}</Badge>}
                    </div>
                    <ClampText className="triage-card-title" text={f.title} lines={3} />
                    <div className="triage-card-meta">
                      <Badge>{f.technology_type || "otro"}</Badge>
                      <span title={f.source_title}>{f.source_title}</span>
                    </div>
                    {isEditor && (
                      <div className="triage-card-actions" onClick={(e) => e.stopPropagation()}>
                        {col.key === "nuevo" && (
                          <Tooltip text="Marcar como revisada: alguien del equipo ya la leyó.">
                            <Button size="sm" variant="outline" onClick={() => onStatus(f, "revisado")}>
                              Revisar
                            </Button>
                          </Tooltip>
                        )}
                        {col.key === "revisado" && (
                          <>
                            <Tooltip text="Marcarla como señal a seguir. No es la priorización oficial P1-P6: esa se hace en el ciclo.">
                              <Button size="sm" onClick={() => onStatus(f, "priorizado")}>Seguir</Button>
                            </Tooltip>
                            <Tooltip text="Marcarla como ruido o no pertinente. No se borra.">
                              <Button size="sm" variant="ghost" onClick={() => onStatus(f, "descartado")}>Descartar</Button>
                            </Tooltip>
                          </>
                        )}
                        {col.key === "priorizado" && (
                          <Tooltip text="Generar una recomendación de adopción para Colombia (con IA, o preliminar si no hay IA).">
                            <Button size="sm" variant="outline" onClick={() => onGenerate(f)}>
                              <Icon name="pulse" size={13} /> Informe
                            </Button>
                          </Tooltip>
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
