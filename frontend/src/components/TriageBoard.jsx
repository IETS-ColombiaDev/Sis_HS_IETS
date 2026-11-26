import Badge from "./Badge";
import Button from "./Button";
import Icon from "./Icon";
import Tooltip from "./Tooltip";
import ClampText from "./ClampText";
import { useScreeningThreshold } from "../scan/useScreeningThreshold";
import { t, ts } from "../i18n";

/**
 * Puntaje de cribado de la senal capturada. Ordena la cola de trabajo; no es el
 * indice de priorizacion %P, que se calcula con la matriz oficial P1 a P6.
 */
export function ScreeningScore({ score, compact = false }) {
  const threshold = useScreeningThreshold();
  const n = Number(score) || 0;
  const high = n >= threshold;
  const tone = high ? "priorizado" : n >= 50 ? "revisado" : "viewer";
  return (
    <Tooltip
      text={t("Puntaje de cribado: {n}. Ordena la cola de señales sin calificar (destaque desde {threshold}, ajustable en Configuración). No es el índice %P de la matriz oficial.", { n, threshold })}
    >
      <Badge tone={tone}>{compact ? t("Cribado {n}", { n }) : t("Cribado {n}/100", { n })}</Badge>
    </Tooltip>
  );
}
/**
 * Tablero de triage de senales. `counts` (opcional) trae el total por estado de
 * todo el conjunto filtrado; sin el, se cuentan solo las tarjetas cargadas.
 */
export default function TriageBoard({ findings, isEditor, onOpen, onStatus, onGenerate, counts }) {
  const columns = [
    { key: "nuevo", label: t("Nuevas señales"), tone: "nuevo" },
    { key: "revisado", label: t("En revisión"), tone: "revisado" },
    { key: "priorizado", label: t("A seguir"), tone: "priorizado" },
    { key: "descartado", label: t("Descartadas"), tone: "descartado" },
  ];

  return (
    <div className="triage-board">
      {columns.map((col) => {
        const items = findings.filter((f) => f.status === col.key);
        return (
          <div key={col.key} className="triage-column">
            <div className="triage-column-head">
              <Badge tone={col.tone}>{col.label}</Badge>
              <span className="triage-count" title={counts ? t("{n} cargadas de {total}", { n: items.length, total: counts[col.key] ?? items.length }) : undefined}>{counts?.[col.key] ?? items.length}</span>
            </div>
            <div className="triage-column-body">
              {items.length === 0 ? (
                <p className="triage-empty">{t("Sin items")}</p>
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
                      {f.horizon && <Badge tone={f.horizon}>{ts(f.horizon)}</Badge>}
                    </div>
                    <ClampText className="triage-card-title" text={f.title} lines={3} />
                    <div className="triage-card-meta">
                      <Badge tone={f.technology_type || "otro"}>{f.technology_type ? ts(f.technology_type) : t("otro")}</Badge>
                      <span title={f.source_title}>{f.source_title}</span>
                    </div>
                    {isEditor && (
                      <div className="triage-card-actions" onClick={(e) => e.stopPropagation()}>
                        {col.key === "nuevo" && (
                          <Tooltip text={t("Marcar como revisada: alguien del equipo ya la leyó.")}>
                            <Button size="sm" variant="outline" onClick={() => onStatus(f, "revisado")}>
                              {t("Revisar")}
                            </Button>
                          </Tooltip>
                        )}
                        {col.key === "revisado" && (
                          <>
                            <Tooltip text={t("Marcarla como señal a seguir. No es la priorización oficial P1-P6: esa se hace en el ciclo.")}>
                              <Button size="sm" onClick={() => onStatus(f, "priorizado")}>{t("Seguir")}</Button>
                            </Tooltip>
                            <Tooltip text={t("Marcarla como ruido o no pertinente. No se borra.")}>
                              <Button size="sm" variant="ghost" onClick={() => onStatus(f, "descartado")}>{t("Descartar")}</Button>
                            </Tooltip>
                          </>
                        )}
                        {col.key === "priorizado" && (
                          <Tooltip text={t("Generar una recomendación de adopción para Colombia (con IA, o preliminar si no hay IA).")}>
                            <Button size="sm" variant="outline" onClick={() => onGenerate(f)}>
                              <Icon name="pulse" size={13} /> {t("Informe")}
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
