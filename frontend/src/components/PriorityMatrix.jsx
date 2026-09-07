import { useCallback, useEffect, useState } from "react";
import api, { apiError } from "../api/client";
import { useToast } from "./Toast";
import Badge from "./Badge";
import Button from "./Button";
import Icon from "./Icon";
import { LoadingBlock } from "./Spinner";
import { TECH_STATUS_LABELS } from "../constants/methodology";
import { GLOSSARY } from "../constants/glossary";
import InfoTip from "./InfoTip";

/**
 * Matriz oficial de priorizacion P1 a P6.
 *
 * Reglas visibles para el usuario:
 * - Cada criterio es binario y lo califica el perfil habilitado.
 * - El %P no se muestra hasta que los seis criterios esten calificados.
 * - Un ciclo cerrado congela los puntajes: la matriz pasa a solo lectura.
 */
export function PriorityGauge({ state }) {
  if (!state) return null;
  const complete = state.complete;
  const pct = state.priority_pct;
  const classification = state.classification;

  return (
    <div className="pm-gauge">
      <div className="pm-gauge-value">
        {complete ? (
          <>
            <strong className="term-label">
              {pct}%
              <InfoTip text={GLOSSARY.pct_p} label="Que es el porcentaje P" />
            </strong>
            <span>
              {state.points} de {state.total_criteria} criterios
            </span>
          </>
        ) : (
          <>
            <strong className="pm-gauge-pending">—</strong>
            <span>
              {state.rated} de {state.total_criteria} calificados
            </span>
          </>
        )}
      </div>
      <div className="pm-gauge-track">
        <div
          className="pm-gauge-bar"
          style={{ width: `${complete ? pct : (state.rated / state.total_criteria) * 100}%` }}
          data-complete={complete ? "true" : "false"}
        />
      </div>
      {complete ? (
        <Badge tone={classification}>{TECH_STATUS_LABELS[classification]}</Badge>
      ) : (
        <span className="pm-gauge-hint">
          Faltan {state.missing.join(", ")}. El indice %P no se calcula con criterios pendientes.
        </span>
      )}
    </div>
  );
}

function CriterionRow({ criterion, score, onRate, disabled }) {
  const [justification, setJustification] = useState(score?.justification || "");
  const [open, setOpen] = useState(false);
  const value = score?.value;
  const canRate = score?.can_rate && !disabled;

  useEffect(() => {
    setJustification(score?.justification || "");
  }, [score?.justification]);

  return (
    <div className="pm-row" data-rated={value != null ? "true" : "false"}>
      <div className="pm-row-main">
        <div className="pm-row-head">
          <span className="pm-code term-label">
            {criterion.code}
            <InfoTip text={criterion.prompt || GLOSSARY.p16} label={`Que es ${criterion.code}`} />
          </span>
          <span className="pm-short">{criterion.short_label}</span>
          {value != null && (
            <Badge tone={value === 1 ? "priorizada" : "no_priorizada"}>
              {value === 1 ? "Si" : "No"}
            </Badge>
          )}
          {!canRate && value == null && (
            <span className="pm-locked">
              <Icon name="cog" size={13} /> Califica {criterion.role_scope.replace("_", " ")}
            </span>
          )}
        </div>
        <p className="pm-prompt">{criterion.prompt}</p>

        {score?.auto_suggested != null && value == null && (
          <div className="pm-suggestion">
            <strong>Sugerencia automatica: {score.auto_suggested === 1 ? "Si" : "No"}</strong>
            <span>{score.auto_reason}</span>
            <em>Requiere confirmacion del evaluador.</em>
          </div>
        )}

        {score?.rated_by_email && (
          <div className="pm-signature">
            Calificado por {score.rated_by_email}
            {score.rated_at ? ` · ${new Date(score.rated_at).toLocaleString()}` : ""}
            {score.justification ? ` · "${score.justification}"` : ""}
          </div>
        )}

        {open && canRate && (
          <textarea
            className="pm-justification"
            rows={2}
            placeholder="Justificacion (opcional pero recomendada para auditoria)"
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
          />
        )}
      </div>

      <div className="pm-actions">
        {canRate ? (
          <>
            <button
              type="button"
              className={`pm-btn pm-btn-yes ${value === 1 ? "pm-btn-active" : ""}`}
              onClick={() => onRate(criterion.code, 1, justification)}
            >
              Si
            </button>
            <button
              type="button"
              className={`pm-btn pm-btn-no ${value === 0 ? "pm-btn-active" : ""}`}
              onClick={() => onRate(criterion.code, 0, justification)}
            >
              No
            </button>
            <button
              type="button"
              className="pm-btn pm-btn-note"
              onClick={() => setOpen((v) => !v)}
              title="Agregar justificacion"
            >
              <Icon name="note" size={14} />
            </button>
          </>
        ) : (
          <span className="pm-readonly">{value == null ? "Pendiente" : "Registrado"}</span>
        )}
      </div>
    </div>
  );
}

export default function PriorityMatrix({ cycleId, technologyId, onChange }) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const load = useCallback(async () => {
    if (!cycleId || !technologyId) return;
    try {
      const { data } = await api.get(`/priority/${cycleId}/${technologyId}`);
      setState(data);
    } catch (e) {
      toast.error(apiError(e, "No se pudo cargar la matriz de priorizacion"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleId, technologyId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const rate = async (criterion, value, justification) => {
    try {
      const { data } = await api.post(`/priority/${cycleId}/${technologyId}/rate`, {
        criterion,
        value,
        justification,
      });
      setState(data);
      if (data.complete) {
        toast.success(
          `${criterion} registrado. %P = ${data.priority_pct}% → ${
            TECH_STATUS_LABELS[data.classification]
          }.`
        );
      } else {
        toast.success(`${criterion} registrado. Faltan ${data.missing.join(", ")}.`);
      }
      onChange?.(data);
    } catch (e) {
      toast.error(apiError(e, "No se pudo registrar la calificacion"));
    }
  };

  if (loading) return <LoadingBlock label="Cargando matriz P1 a P6..." />;
  if (!state) return null;

  const scoreFor = (code) => state.scores.find((s) => s.criterion === code);

  return (
    <div className="pm">
      <div className="pm-header">
        <div>
          <h3 className="pm-title">Matriz oficial de priorizacion</h3>
          <p className="pm-formula">
            %P = (suma de P1 a P6 / {state.total_criteria}) × 100 · Priorizada con{" "}
            {state.threshold_points} puntos o mas · Bajo vigilancia con {state.watch_points}
          </p>
        </div>
        <PriorityGauge state={state} />
      </div>

      {state.frozen && (
        <div className="pm-frozen">
          <Icon name="cog" size={15} />
          Ciclo cerrado: los puntajes estan congelados. Una reevaluacion debe hacerse en un ciclo
          posterior y generara un registro nuevo.
        </div>
      )}

      <div className="pm-rows">
        {state.criteria.map((c) => (
          <CriterionRow
            key={c.code}
            criterion={c}
            score={scoreFor(c.code)}
            onRate={rate}
            disabled={state.frozen}
          />
        ))}
      </div>
    </div>
  );
}
