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
import { t, ts, fmtDateTime } from "../i18n";

// El servidor exige esta longitud mínima para cambiar una respuesta ya registrada.
const MIN_CHANGE_NOTE = 10;

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
              <InfoTip text={GLOSSARY.pct_p} label={t("Qué es el porcentaje P")} />
            </strong>
            <span>
              {t("{puntos} de {total} criterios", { puntos: state.points, total: state.total_criteria })}
            </span>
          </>
        ) : (
          <>
            <strong className="pm-gauge-pending">-</strong>
            <span>
              {t("{n} de {total} calificados", { n: state.rated, total: state.total_criteria })}
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
          {t("Faltan {lista}. El índice %P no se calcula con criterios pendientes.", {
            lista: state.missing.join(", "),
          })}
        </span>
      )}
    </div>
  );
}

const ROLE_SCOPE_LABEL = {
  evaluador_tecnico: t("evaluador técnico"),
  evaluador_clinico: t("evaluador clínico"),
};

function CriterionRow({ criterion, score, onRate, disabled, blockedReason, busy }) {
  const [justification, setJustification] = useState(score?.justification || "");
  const [open, setOpen] = useState(false);
  const [needsNote, setNeedsNote] = useState(false);
  const value = score?.value;
  const stored = score?.justification || "";

  // Cambiar una respuesta mueve el %P: se pide explicar el cambio antes de enviarlo.
  const answer = (next) => {
    const note = justification.trim();
    const changing = value != null && value !== next;
    if (changing && (note.length < MIN_CHANGE_NOTE || note === stored.trim())) {
      setOpen(true);
      setNeedsNote(true);
      return;
    }
    setNeedsNote(false);
    onRate(criterion.code, next, note);
  };
  const canRate = score?.can_rate && !disabled;
  const roleLabel = ROLE_SCOPE_LABEL[criterion.role_scope] || (criterion.role_scope || "").replace(/_/g, " ");
  const lockedWhy =
    ts(blockedReason) || `${GLOSSARY.fa_criterio_bloqueado} ${t("Lo califica el {rol}.", { rol: roleLabel })}`;

  useEffect(() => {
    setJustification(score?.justification || "");
    setNeedsNote(false);
  }, [score?.justification, score?.value]);

  return (
    <div className="pm-row" data-rated={value != null ? "true" : "false"} data-testid={`pm-row-${criterion.code}`}>
      <div className="pm-row-main">
        <div className="pm-row-head">
          <span className="pm-code term-label">
            {criterion.code}
            <InfoTip
              text={ts(criterion.prompt) || GLOSSARY.p16}
              label={t("Qué es {codigo}", { codigo: criterion.code })}
            />
          </span>
          <span className="pm-short">{ts(criterion.short_label)}</span>
          {value != null && (
            <Badge tone={value === 1 ? "priorizada" : "no_priorizada"}>
              {value === 1 ? t("Sí") : t("No")}
            </Badge>
          )}
          {!canRate && value == null && (
            <span className="pm-locked" title={lockedWhy}>
              <Icon name="cog" size={13} /> {t("Califica {rol}", { rol: roleLabel })}
            </span>
          )}
        </div>
        <p className="pm-prompt">{ts(criterion.prompt)}</p>

        {score?.auto_suggested != null && value == null && (
          <div className="pm-suggestion">
            <strong>
              {score.auto_suggested === 1 ? t("Sugerencia automática: Sí") : t("Sugerencia automática: No")}
            </strong>
            <span>{ts(score.auto_reason)}</span>
            <em>{t("Requiere confirmación del evaluador.")}</em>
          </div>
        )}

        {score?.rated_by_email && (
          <div className="pm-signature">
            {t("Calificado por {quien}", { quien: score.rated_by_email })}
            {score.rated_at ? ` · ${fmtDateTime(score.rated_at)}` : ""}
            {score.justification ? ` · "${score.justification}"` : ""}
          </div>
        )}

        {open && canRate && (
          <textarea
            className="pm-justification"
            rows={2}
            aria-label={t("Justificación de {codigo}", { codigo: criterion.code })}
            placeholder={t("Justificación (opcional pero recomendada para auditoría)")}
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            maxLength={2000}
          />
        )}
        {needsNote && canRate && (
          <p className="pm-change-note" role="alert" data-testid={`pm-change-note-${criterion.code}`}>
            {t("Para cambiar la respuesta de {codigo}, escriba por qué (mínimo {n} caracteres) y pulse de nuevo Sí o No. El cambio queda en el recorrido.", {
              codigo: criterion.code,
              n: MIN_CHANGE_NOTE,
            })}
          </p>
        )}
      </div>

      <div className="pm-actions">
        {canRate ? (
          <>
            <button
              type="button"
              className={`pm-btn pm-btn-yes ${value === 1 ? "pm-btn-active" : ""}`}
              onClick={() => answer(1)}
              disabled={busy}
              title={t("Responder Sí a {codigo}: suma 1 punto.", { codigo: criterion.code })}
              aria-label={`${criterion.code} ${t("Sí")}`}
            >
              {t("Sí")}
            </button>
            <button
              type="button"
              className={`pm-btn pm-btn-no ${value === 0 ? "pm-btn-active" : ""}`}
              onClick={() => answer(0)}
              disabled={busy}
              title={t("Responder No a {codigo}: no suma puntos.", { codigo: criterion.code })}
              aria-label={`${criterion.code} ${t("No")}`}
            >
              {t("No")}
            </button>
            <button
              type="button"
              className="pm-btn pm-btn-note"
              onClick={() => setOpen((v) => !v)}
              title={GLOSSARY.fa_justificacion_criterio}
              aria-label={t("Agregar justificación a {codigo}", { codigo: criterion.code })}
            >
              <Icon name="note" size={14} />
            </button>
          </>
        ) : (
          <span className="pm-readonly" title={lockedWhy}>
            {value == null ? t("Pendiente") : t("Registrado")}
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
      toast.error(apiError(e, t("No se pudo cargar la matriz de priorización")));
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
          t("{criterio} registrado. %P = {pct}% → {estado}.", {
            criterio: criterion,
            pct: data.priority_pct,
            estado: TECH_STATUS_LABELS[data.classification],
          })
        );
      } else {
        toast.success(
          t("{criterio} registrado. Faltan {lista}.", { criterio: criterion, lista: data.missing.join(", ") })
        );
      }
      onChange?.(data);
    } catch (e) {
      toast.error(apiError(e, t("No se pudo registrar la calificación")));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingBlock label={t("Cargando matriz P1 a P6...")} />;
  if (!state) return null;

  const scoreFor = (code) => state.scores.find((s) => s.criterion === code);

  return (
    <div className="pm">
      <div className="pm-header">
        <div>
          <h3 className="pm-title term-label">
            {t("Matriz oficial de priorización")}
            <InfoTip text={GLOSSARY.p16} label={t("Qué es la matriz P1 a P6")} />
          </h3>
          <p className="pm-formula">
            {t("%P = (suma de P1 a P6 / {total}) × 100 · Priorizada con {umbral} puntos o más · Bajo vigilancia con {vigilancia}", {
              total: state.total_criteria,
              umbral: state.threshold_points,
              vigilancia: state.watch_points,
            })}{" "}
            <InfoTip text={GLOSSARY.fa_franjas} label={t("Cómo se clasifican las franjas")} />
          </p>
        </div>
        <PriorityGauge state={state} />
      </div>

      {state.frozen ? (
        <div className="pm-frozen">
          <Icon name="cog" size={15} />
          {t("Ciclo cerrado: los puntajes están congelados. Una reevaluación debe hacerse en un ciclo posterior y generará un registro nuevo.")}
        </div>
      ) : state.rate_blocked_reason ? (
        <div className="pm-frozen" data-testid="pm-blocked">
          <Icon name="alert" size={15} />
          {ts(state.rate_blocked_reason)}
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
