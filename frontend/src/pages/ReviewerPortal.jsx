import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import Button from "../components/Button";
import { Select, Textarea } from "../components/Field";
import PublicShell from "../components/PublicShell";

const VERDICT_LABEL = { aprobado: "Aprobado", observado: "Devuelto con observaciones" };

function detailOf(err, fallback) {
  const detail = err?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d) => d.msg).join("; ");
  if (err?.response?.status >= 500) return "El servidor no respondió. Intente de nuevo en unos minutos.";
  if (!err?.response) return "No hay conexión con la plataforma. Revise su red e intente de nuevo.";
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
      setError(detailOf(err, "No se pudo abrir la invitación."));
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
      setNotice("Declaración registrada. Ya puede leer el documento.");
    } catch (err) {
      setError(detailOf(err, "No se pudo registrar la declaración."));
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
      setNotice("Observación registrada.");
      await load();
    } catch (err) {
      setError(detailOf(err, "No se pudo comentar."));
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
      setNotice("Revisión enviada. Gracias: la coordinación del IETS ya puede verla.");
    } catch (err) {
      setError(detailOf(err, "No se pudo enviar la revisión."));
      setConfirming(false);
    } finally {
      setSending("");
    }
  };

  const labels = state?.field_labels || {};
  const submitted = ["aprobado", "observado"].includes(state?.assignment_status);

  return (
    <PublicShell
      kicker="Revisión por pares"
      title="Expediente asignado"
      lead="Acceso temporal al informe. No crea cuenta institucional. El enlace es personal y caduca a los 10 días."
    >
      {loading && <p>Abriendo la invitación...</p>}
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

      {!loading && !state && !error && <p>El enlace está incompleto. Use el enlace exacto que recibió.</p>}

      {state?.access === "coi_required" && (
        <form onSubmit={sign}>
          <p>
            Documento: <strong style={{ overflowWrap: "anywhere" }}>{state.title}</strong> ·{" "}
            {state.product_level_label}
          </p>
          <p>
            Hola {state.reviewer_name}. Debe declarar conflicto de interés antes de leer el informe.
            {state.expires_at ? ` Su enlace vence el ${new Date(state.expires_at).toLocaleDateString("es-CO")}.` : ""}
          </p>
          <label className="public-check">
            <input
              type="checkbox"
              checked={coi.accepted}
              onChange={(e) => setCoi({ ...coi, accepted: e.target.checked })}
              data-testid="portal-coi-accept"
            />
            Acepto la declaración de conflicto de interés y la confidencialidad del expediente.
          </label>
          <label className="public-check">
            <input
              type="checkbox"
              checked={coi.has_conflict}
              onChange={(e) => setCoi({ ...coi, has_conflict: e.target.checked })}
            />
            Tengo un conflicto que debo declarar
          </label>
          <Textarea
            id="portal-coi-statement"
            label="Detalle del conflicto (si aplica)"
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
                ? "Marque la aceptación para continuar."
                : coi.has_conflict && !coi.statement.trim()
                ? "Describa el conflicto que declara."
                : undefined
            }
            data-testid="portal-coi-sign"
          >
            Firmar y leer el informe
          </Button>
        </form>
      )}

      {state?.access === "granted" && (
        <div>
          <p>
            <strong style={{ overflowWrap: "anywhere" }}>{state.title}</strong> · {state.product_level_label}
            {state.status_label ? ` · Estado: ${state.status_label}` : ""}
            {state.confidential ? " · CONFIDENCIAL" : ""}
          </p>
          {Object.entries(state.body || {}).map(([key, value]) =>
            value ? (
              <section key={key} className="eval-public-block">
                <h3>{labels[key] || key}</h3>
                <p style={{ whiteSpace: "pre-wrap" }}>{value}</p>
              </section>
            ) : null
          )}

          <form onSubmit={addComment}>
            <h3>Observaciones</h3>
            <Select
              id="portal-comment-field"
              label="Campo (opcional)"
              value={commentField}
              onChange={(e) => setCommentField(e.target.value)}
            >
              <option value="">Documento completo</option>
              {Object.keys(state.body || {})
                .filter((k) => state.body[k])
                .map((k) => (
                  <option key={k} value={k}>
                    {labels[k] || k}
                  </option>
                ))}
            </Select>
            <Textarea
              id="portal-comment"
              label="Observación en línea"
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
              Añadir observación
            </Button>
          </form>

          {(state.comments || []).length > 0 && (
            <ul className="eval-comments">
              {state.comments.map((c) => (
                <li key={c.id}>
                  <strong>{c.author}</strong>
                  {c.field_key ? ` · ${labels[c.field_key] || c.field_key}` : ""}
                  <p>{c.body}</p>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={submit} style={{ marginTop: 24 }}>
            <h3>Veredicto</h3>
            {submitted && (
              <p className="fa-notice fa-notice--ok" data-testid="portal-submitted">
                Revisión enviada: {VERDICT_LABEL[state.assignment_status]}
                {state.submitted_at ? ` el ${new Date(state.submitted_at).toLocaleString("es-CO")}` : ""}.
                {state.can_submit ? " Puede actualizarla mientras el documento siga en revisión." : ""}
              </p>
            )}
            {!state.can_submit && !submitted && (
              <p className="fa-notice fa-notice--info">
                {state.status === "publicado"
                  ? "El documento ya fue publicado: la revisión está cerrada."
                  : "El documento aún no está en revisión externa. Podrá enviar su veredicto cuando la coordinación lo habilite; mientras tanto puede dejar observaciones."}
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
                  Apruebo el documento
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
                  Devuelvo con observaciones
                </label>
                <Textarea
                  id="portal-note"
                  label="Nota para el comité"
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                {confirming && (
                  <p className="fa-notice fa-notice--warn" role="alert">
                    Va a enviar el veredicto "{VERDICT_LABEL[verdict]}". Pulse de nuevo para confirmar.
                  </p>
                )}
                <Button type="submit" loading={sending === "submit"} data-testid="portal-submit">
                  {confirming ? "Confirmar envío" : "Enviar revisión"}
                </Button>
              </>
            )}
          </form>
        </div>
      )}
    </PublicShell>
  );
}
