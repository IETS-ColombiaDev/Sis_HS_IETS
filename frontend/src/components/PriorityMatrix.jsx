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
              <InfoTip text={GLOSSARY.pct_p} label="Qué es el porcentaje P" />
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
          Faltan {state.missing.join(", ")}. El índice %P no se calcula con criterios pendientes.
        </span>
      )}
    </div>
  );
}

const ROLE_SCOPE_LABEL = {
  evaluador_tecnico: "evaluador técnico",
  evaluador_clinico: "evaluador clínico",
};

function CriterionRow({ criterion, score, onRate, disabled, blockedReason, busy }) {
  const [justification, setJustification] = useState(score?.justification || "");
  const [open, setOpen] = useState(false);
  const value = score?.value;
  const canRate = score?.can_rate && !disabled;
  const roleLabel = ROLE_SCOPE_LABEL[criterion.role_scope] || (criterion.role_scope || "").replace(/_/g, " ");
  const lockedWhy = blockedReason || `${GLOSSARY.fa_criterio_bloqueado} Lo califica el ${roleLabel}.`;

  useEffect(() => {
    setJustification(score?.justification || "");
  }, [score?.justification]);

  return (
    <div className="pm-row" data-rated={value != null ? "true" : "false"} data-testid={`pm-row-${criterion.code}`}>
      <div className="pm-row-main">
        <div className="pm-row-head">
          <span className="pm-code term-label">
            {criterion.code}
            <InfoTip text={criterion.prompt || GLOSSARY.p16} label={`Qué es ${criterion.code}`} />
          </span>
          <span className="pm-short">{criterion.short_label}</span>
          {value != null && (
            <Badge tone={value === 1 ? "priorizada" : "no_priorizada"}>
              {value === 1 ? "Sí" : "No"}
            </Badge>
          )}
          {!canRate && value == null && (
            <span className="pm-locked" title={lockedWhy}>
              <Icon name="cog" size={13} /> Califica {roleLabel}
            </span>
          )}
        </div>
        <p className="pm-prompt">{criterion.prompt}</p>

        {score?.auto_suggested != null && value == null && (
          <div className="pm-suggestion">
            <strong>Sugerencia automática: {score.auto_suggested === 1 ? "Sí" : "No"}</strong>
            <span>{score.auto_reason}</span>
            <em>Requiere confirmación del evaluador.</em>
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
            aria-label={`Justificación de ${criterion.code}`}
            placeholder="Justificación (opcional pero recomendada para auditoría)"
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
              disabled={busy}
              title={`Responder Sí a ${criterion.code}: suma 1 punto.`}
              aria-label={`${criterion.code} Sí`}
            >
              Sí
            </button>
            <button
              type="button"
              className={`pm-btn pm-btn-no ${value === 0 ? "pm-btn-active" : ""}`}
              onClick={() => onRate(criterion.code, 0, justification)}
              disabled={busy}
              title={`Responder No a ${criterion.code}: no suma puntos.`}
              aria-label={`${criterion.code} No`}
            >
              No
            </button>
            <button
              type="button"
              className="pm-btn pm-btn-note"
              onClick={() => setOpen((v) => !v)}
              title={GLOSSARY.fa_justificacion_criterio}
              aria-label={`Agregar justificación a ${criterion.code}`}
            >
              <Icon name="note" size={14} />
            </button>
          </>
        ) : (
          <span className="pm-readonly" title={lockedWhy}>
            {value == null ? "Pendiente" : "Registrado"}
          </span>
        )}
      </div>
    </div>
  );
}

export default function PriorityMatrix({ cycleId, technologyId, onChange }) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    if (!cycleId || !technologyId) return;
    try {
      const { data } = await api.get(`/priority/${cycleId}/${technologyId}`);
      setState(data);
    } catch (e) {
      toast.error(apiError(e, "No se pudo cargar la matriz de priorización"));
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
    setBusy(true);
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
      toast.error(apiError(e, "No se pudo registrar la calificación"));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingBlock label="Cargando matriz P1 a P6..." />;
  if (!state) return null;

  const scoreFor = (code) => state.scores.find((s) => s.criterion === code);

  return (
    <div className="pm">
      <div className="pm-header">
        <div>
          <h3 className="pm-title term-label">
            Matriz oficial de priorización
            <InfoTip text={GLOSSARY.p16} label="Qué es la matriz P1 a P6" />
          </h3>
          <p className="pm-formula">
            %P = (suma de P1 a P6 / {state.total_criteria}) × 100 · Priorizada con{" "}
            {state.threshold_points} puntos o más · Bajo vigilancia con {state.watch_points}{" "}
            <InfoTip text={GLOSSARY.fa_franjas} label="Cómo se clasifican las franjas" />
          </p>
        </div>
        <PriorityGauge state={state} />
      </div>

      {state.frozen ? (
        <div className="pm-frozen">
          <Icon name="cog" size={15} />
          Ciclo cerrado: los puntajes están congelados. Una reevaluación debe hacerse en un ciclo
          posterior y generará un registro nuevo.
        </div>
      ) : state.rate_blocked_reason ? (
        <div className="pm-frozen" data-testid="pm-blocked">
          <Icon name="alert" size={15} />
          {state.rate_blocked_reason}
        </div>
      ) : null}

      <div className="pm-rows">
        {state.criteria.map((c) => (
          <CriterionRow
            key={c.code}
            criterion={c}
            score={scoreFor(c.code)}
            onRate={rate}
            disabled={state.frozen}
            blockedReason={state.rate_blocked_reason}
            busy={busy}
          />
        ))}
      </div>
    </div>
  );
}
