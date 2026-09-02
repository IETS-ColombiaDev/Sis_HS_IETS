import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import Button from "../components/Button";
import { Textarea } from "../components/Field";
import PublicShell from "../components/PublicShell";

export default function ReviewerPortal() {
  const { token } = useParams();
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  const [coi, setCoi] = useState({ accepted: false, has_conflict: false, statement: "" });
  const [comment, setComment] = useState("");
  const [verdict, setVerdict] = useState("aprobado");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  const encoded = encodeURIComponent(token || "");

  const load = async () => {
    setError("");
    try {
      const { data } = await axios.get(`/api/public/reviews/${encoded}`);
      setState(data);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "No se pudo abrir la invitacion.");
      setState(null);
    }
  };

  useEffect(() => {
    if (token) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const sign = async (e) => {
    e.preventDefault();
    setSending(true);
    setError("");
    try {
      const { data } = await axios.post(`/api/public/reviews/${encoded}/coi`, coi);
      setState(data);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "No se pudo registrar la declaracion.");
    } finally {
      setSending(false);
    }
  };

  const addComment = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      await axios.post(`/api/public/reviews/${encoded}/comments`, { body: comment });
      setComment("");
      await load();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "No se pudo comentar.");
    } finally {
      setSending(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      const { data } = await axios.post(`/api/public/reviews/${encoded}/submit`, {
        verdict,
        note,
      });
      setState(data);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "No se pudo enviar la revision.");
    } finally {
      setSending(false);
    }
  };

  const labels = state?.field_labels || {};

  return (
    <PublicShell
      kicker="Revision por pares"
      title="Expediente asignado"
      lead="Acceso temporal al informe. No crea cuenta institucional. El enlace caduca a los 10 dias."
    >
        {error && <p className="public-submit-error">{error}</p>}

        {state?.access === "coi_required" && (
          <form onSubmit={sign}>
            <p>
              Documento: <strong>{state.title}</strong> · {state.product_level_label}
            </p>
            <p>Hola {state.reviewer_name}. Debe declarar conflicto de interes antes de leer el informe.</p>
            <label className="public-check">
              <input
                type="checkbox"
                checked={coi.accepted}
                onChange={(e) => setCoi({ ...coi, accepted: e.target.checked })}
              />
              Acepto la declaracion de conflicto de interes y la confidencialidad del expediente.
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
              label="Detalle del conflicto (si aplica)"
              rows={3}
              value={coi.statement}
              onChange={(e) => setCoi({ ...coi, statement: e.target.value })}
            />
            <Button type="submit" loading={sending} disabled={!coi.accepted}>
              Firmar y leer el informe
            </Button>
          </form>
        )}

        {state?.access === "granted" && (
          <div>
            <p>
              <strong>{state.title}</strong> · {state.product_level_label}
              {state.confidential ? " · CONFIDENCIAL" : ""}
            </p>
            {Object.entries(state.body || {}).map(([key, value]) =>
              value ? (
                <section key={key} className="eval-public-block">
                  <h3>{labels[key] || key}</h3>
                  <p>{value}</p>
                </section>
              ) : null
            )}

            <form onSubmit={addComment}>
              <Textarea
                label="Observacion en linea"
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              <Button type="submit" variant="secondary" loading={sending} disabled={!comment.trim()}>
                Anadir observacion
              </Button>
            </form>

            {(state.comments || []).length > 0 && (
              <ul className="eval-comments">
                {state.comments.map((c) => (
                  <li key={c.id}>
                    <strong>{c.author}</strong>
                    <p>{c.body}</p>
                  </li>
                ))}
              </ul>
            )}

            <form onSubmit={submit} style={{ marginTop: 24 }}>
              <h3>Veredicto</h3>
              <label className="public-check">
                <input
                  type="radio"
                  name="verdict"
                  checked={verdict === "aprobado"}
                  onChange={() => setVerdict("aprobado")}
                />
                Apruebo el documento
              </label>
              <label className="public-check">
                <input
                  type="radio"
                  name="verdict"
                  checked={verdict === "observado"}
                  onChange={() => setVerdict("observado")}
                />
                Devuelvo con observaciones
              </label>
              <Textarea
                label="Nota para el comite"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <Button type="submit" loading={sending}>
                Enviar revision
              </Button>
            </form>
          </div>
        )}

    </PublicShell>
  );
}
