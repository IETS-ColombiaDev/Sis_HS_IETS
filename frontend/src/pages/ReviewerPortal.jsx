import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import Button from "../components/Button";
import { Select, Textarea } from "../components/Field";
import PublicShell from "../components/PublicShell";
import { t, tr, ts, intlLocale } from "../i18n";

const VERDICT_LABEL = { aprobado: t("Aprobado"), observado: t("Devuelto con observaciones") };

function detailOf(err, fallback) {
  const detail = err?.response?.data?.detail;
  if (typeof detail === "string") return ts(detail);
  if (Array.isArray(detail)) return detail.map((d) => ts(d.msg)).join("; ");
  if (err?.response?.status >= 500) return t("El servidor no respondió. Intente de nuevo en unos minutos.");
  if (!err?.response) return t("No hay conexión con la plataforma. Revise su red e intente de nuevo.");
  return fallback;
}

export default function ReviewerPortal() {
  const { token } = useParams();
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [coi, setCoi] = useState({ accepted: false, has_conflict: false, statement: "" });
  const [comment, setComment] = useState("");
  const [commentField, setCommentField] = useState("");
  const [verdict, setVerdict] = useState("aprobado");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState("");
  const [confirming, setConfirming] = useState(false);

  const encoded = encodeURIComponent(token || "");

  const load = async () => {
    setError("");
    try {
      const { data } = await axios.get(`/api/public/reviews/${encoded}`);
      setState(data);
    } catch (err) {
      setError(detailOf(err, t("No se pudo abrir la invitación.")));
      setState(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) load();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const sign = async (e) => {
    e.preventDefault();
    setSending("coi");
    setError("");
    try {
      const { data } = await axios.post(`/api/public/reviews/${encoded}/coi`, coi);
      setState(data);
      setNotice(t("Declaración registrada. Ya puede leer el documento."));
    } catch (err) {
      setError(detailOf(err, t("No se pudo registrar la declaración.")));
    } finally {
      setSending("");
    }
  };

  const addComment = async (e) => {
    e.preventDefault();
    setSending("comment");
    setError("");
    try {
      await axios.post(`/api/public/reviews/${encoded}/comments`, { body: comment, field_key: commentField });
      setComment("");
      setCommentField("");
      setNotice(t("Observación registrada."));
      await load();
    } catch (err) {
      setError(detailOf(err, t("No se pudo comentar.")));
    } finally {
      setSending("");
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setSending("submit");
    setError("");
    try {
      const { data } = await axios.post(`/api/public/reviews/${encoded}/submit`, {
        verdict,
        note,
      });
      setState(data);
      setNote("");
      setConfirming(false);
      setNotice(t("Revisión enviada. Gracias: la coordinación del IETS ya puede verla."));
    } catch (err) {
      setError(detailOf(err, t("No se pudo enviar la revisión.")));
      setConfirming(false);
    } finally {
      setSending("");
    }
  };

  const labels = state?.field_labels || {};
  const submitted = ["aprobado", "observado"].includes(state?.assignment_status);

  return (
    <PublicShell
      kicker={t("Revisión por pares")}
      title={t("Expediente asignado")}
      lead={t("Acceso temporal al informe. No crea cuenta institucional. El enlace es personal y caduca a los 10 días.")}
    >
      {loading && <p>{t("Abriendo la invitación...")}</p>}
      {error && (
        <p className="public-submit-error" role="alert">
          {error}
        </p>
      )}
      {notice && !error && (
        <p className="fa-notice fa-notice--ok" role="status">
          {notice}
        </p>
      )}

      {!loading && !state && !error && <p>{t("El enlace está incompleto. Use el enlace exacto que recibió.")}</p>}

      {state?.access === "coi_required" && (
        <form onSubmit={sign}>
          <p>
            {tr("Documento: <b>{titulo}</b>", { titulo: <>{state.title}</> }, {
              b: (c) => <strong style={{ overflowWrap: "anywhere" }}>{c}</strong>,
            })}{" "}
            ·{" "}
            {ts(state.product_level_label)}
          </p>
          <p>
            {t("Hola {nombre}. Debe declarar conflicto de interés antes de leer el informe.", {
              nombre: state.reviewer_name,
            })}
            {state.expires_at
              ? ` ${t("Su enlace vence el {fecha}.", {
                  fecha: new Date(state.expires_at).toLocaleDateString(intlLocale()),
                })}`
              : ""}
          </p>
          <label className="public-check">
            <input
              type="checkbox"
              checked={coi.accepted}
              onChange={(e) => setCoi({ ...coi, accepted: e.target.checked })}
              data-testid="portal-coi-accept"
            />
            {t("Acepto la declaración de conflicto de interés y la confidencialidad del expediente.")}
          </label>
          <label className="public-check">
            <input
              type="checkbox"
              checked={coi.has_conflict}
              onChange={(e) => setCoi({ ...coi, has_conflict: e.target.checked })}
            />
            {t("Tengo un conflicto que debo declarar")}
          </label>
          <Textarea
            id="portal-coi-statement"
            label={t("Detalle del conflicto (si aplica)")}
            rows={3}
            value={coi.statement}
            onChange={(e) => setCoi({ ...coi, statement: e.target.value })}
          />
          <Button
            type="submit"
            loading={sending === "coi"}
            disabled={!coi.accepted || (coi.has_conflict && !coi.statement.trim())}
            title={
              !coi.accepted
                ? t("Marque la aceptación para continuar.")
                : coi.has_conflict && !coi.statement.trim()
                ? t("Describa el conflicto que declara.")
                : undefined
            }
            data-testid="portal-coi-sign"
          >
            {t("Firmar y leer el informe")}
          </Button>
        </form>
      )}

      {state?.access === "granted" && (
        <div>
          <p>
            <strong style={{ overflowWrap: "anywhere" }}>{state.title}</strong> · {ts(state.product_level_label)}
            {state.status_label ? ` · ${t("Estado: {estado}", { estado: ts(state.status_label) })}` : ""}
            {state.confidential ? ` · ${t("CONFIDENCIAL")}` : ""}
          </p>
          {Object.entries(state.body || {}).map(([key, value]) =>
            value ? (
              <section key={key} className="eval-public-block">
                <h3>{ts(labels[key] || key)}</h3>
                <p style={{ whiteSpace: "pre-wrap" }}>{value}</p>
              </section>
            ) : null
          )}

          <form onSubmit={addComment}>
            <h3>{t("Observaciones##revision")}</h3>
            <Select
              id="portal-comment-field"
              label={t("Campo (opcional)")}
              value={commentField}
              onChange={(e) => setCommentField(e.target.value)}
            >
              <option value="">{t("Documento completo")}</option>
              {Object.keys(state.body || {})
                .filter((k) => state.body[k])
                .map((k) => (
                  <option key={k} value={k}>
                    {ts(labels[k] || k)}
                  </option>
                ))}
            </Select>
            <Textarea
              id="portal-comment"
              label={t("Observación en línea")}
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <Button
              type="submit"
              variant="secondary"
              loading={sending === "comment"}
              disabled={!comment.trim()}
              data-testid="portal-comment-submit"
            >
              {t("Añadir observación")}
            </Button>
          </form>

          {(state.comments || []).length > 0 && (
            <ul className="eval-comments">
              {state.comments.map((c) => (
                <li key={c.id}>
                  <strong>{c.author}</strong>
                  {c.field_key ? ` · ${ts(labels[c.field_key] || c.field_key)}` : ""}
                  <p>{c.body}</p>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={submit} style={{ marginTop: 24 }}>
            <h3>{t("Veredicto")}</h3>
            {submitted && (
              <p className="fa-notice fa-notice--ok" data-testid="portal-submitted">
                {state.submitted_at
                  ? t("Revisión enviada: {veredicto} el {fecha}.", {
                      veredicto: VERDICT_LABEL[state.assignment_status],
                      fecha: new Date(state.submitted_at).toLocaleString(intlLocale()),
                    })
                  : t("Revisión enviada: {veredicto}.", { veredicto: VERDICT_LABEL[state.assignment_status] })}
                {state.can_submit ? ` ${t("Puede actualizarla mientras el documento siga en revisión.")}` : ""}
              </p>
            )}
            {!state.can_submit && !submitted && (
              <p className="fa-notice fa-notice--info">
                {state.status === "publicado"
                  ? t("El documento ya fue publicado: la revisión está cerrada.")
                  : t("El documento aún no está en revisión externa. Podrá enviar su veredicto cuando la coordinación lo habilite; mientras tanto puede dejar observaciones.")}
              </p>
            )}
            {state.can_submit && (
              <>
                <label className="public-check">
                  <input
                    type="radio"
                    name="verdict"
                    checked={verdict === "aprobado"}
                    onChange={() => {
                      setVerdict("aprobado");
                      setConfirming(false);
                    }}
                  />
                  {t("Apruebo el documento")}
                </label>
                <label className="public-check">
                  <input
                    type="radio"
                    name="verdict"
                    checked={verdict === "observado"}
                    onChange={() => {
                      setVerdict("observado");
                      setConfirming(false);
                    }}
                  />
                  {t("Devuelvo con observaciones")}
                </label>
                <Textarea
                  id="portal-note"
                  label={t("Nota para el comité")}
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                {confirming && (
                  <p className="fa-notice fa-notice--warn" role="alert">
                    {t('Va a enviar el veredicto "{veredicto}". Pulse de nuevo para confirmar.', {
                      veredicto: VERDICT_LABEL[verdict],
                    })}
                  </p>
                )}
                <Button type="submit" loading={sending === "submit"} data-testid="portal-submit">
                  {confirming ? t("Confirmar envío") : t("Enviar revisión")}
                </Button>
              </>
            )}
          </form>
        </div>
      )}
    </PublicShell>
  );
}
