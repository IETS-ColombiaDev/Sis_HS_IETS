import { useState } from "react";
import api, { apiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { PERM } from "../constants/methodology";
import Badge from "./Badge";
import Button from "./Button";
import Icon from "./Icon";
import { Input, Select, Textarea } from "./Field";
import "./manual-review.css";

const OUTCOMES = [
  { value: "sin_novedades", label: "Consultada, sin novedades" },
  { value: "con_senales", label: "Consultada, con señales registradas" },
  { value: "no_accesible", label: "No se pudo consultar" },
];
const TYPES = [
  { value: "medicamento", label: "Medicamento" },
  { value: "dispositivo", label: "Dispositivo médico" },
  { value: "digital", label: "Salud digital" },
  { value: "otro", label: "Otro" },
];
const EMPTY_SIGNAL = { title: "", url: "", technology: "", technology_type: "medicamento", summary: "" };

function fmtDate(value) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
}

/** Una fuente E: qué consultar, registrar lo encontrado y cerrar la validación. */
function ManualSource({ item, onDone, toast }) {
  const { can } = useAuth();
  const canSignal = can(PERM.TECHNOLOGY_WRITE);
  const [open, setOpen] = useState(item.due);
  const [outcome, setOutcome] = useState("sin_novedades");
  const [note, setNote] = useState("");
  const [registered, setRegistered] = useState(0);
  const [signal, setSignal] = useState(null);
  const [busy, setBusy] = useState("");

  const saveSignal = async () => {
    if (!signal.title.trim()) {
      toast?.error("Escriba el nombre o título de la señal.");
      return;
    }
    setBusy("signal");
    try {
      await api.post("/findings", { ...signal, source_id: item.id });
      setRegistered((n) => n + 1);
      setOutcome("con_senales");
      setSignal(null);
      toast?.success("Señal registrada en la bandeja de entrada.");
    } catch (e) {
      toast?.error(apiError(e, "No se pudo registrar la señal"));
    } finally {
      setBusy("");
    }
  };

  const validate = async () => {
    setBusy("validate");
    try {
      await api.post(`/sources/${item.id}/manual-review`, { outcome, note, signals: outcome === "con_senales" ? Math.max(registered, 1) : 0 });
      toast?.success(`«${item.title}» quedó validada.`);
      setRegistered(0);
      setNote("");
      onDone?.();
    } catch (e) {
      toast?.error(apiError(e, "No se pudo registrar la validación"));
    } finally {
      setBusy("");
    }
  };

  const last = item.last_review;
  return (
    <article className={`mr-item${item.due ? " is-due" : ""}`} data-testid={`manual-source-${item.id}`}>
      <header className="mr-head">
        <div style={{ minWidth: 0 }}>
          <div className="mr-title">{item.title}</div>
          <div className="mr-meta">
            {item.due ? (
              <Badge tone="parcial">{item.never_reviewed ? "Nunca validada" : `Vencida hace ${item.overdue_days} día(s)`}</Badge>
            ) : (
              <Badge tone="ok">Al día · próxima {fmtDate(item.next_review_due)}</Badge>
            )}
            {item.frequency && <span>Frecuencia: {item.frequency}</span>}
            {last && (
              <span>
                Última: {fmtDate(last.at)} por {last.by || "—"} ({last.outcome_label})
              </span>
            )}
          </div>
        </div>
        <div className="mr-actions">
          {item.url && (
            <a className="so-link" href={item.url} target="_blank" rel="noopener noreferrer" data-testid={`manual-source-open-${item.id}`}>
              <Icon name="external" size={14} /> Abrir la fuente
            </a>
          )}
          <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? "Ocultar" : "Validar"}
          </Button>
        </div>
      </header>
      {open && (
        <div className="mr-body">
          {(item.consult_info || item.access_path) && (
            <p className="mr-hint">
              <strong>Qué consultar:</strong> {item.consult_info || item.access_path}
            </p>
          )}
          {item.usage_restrictions && (
            <p className="mr-hint">
              <strong>Restricciones:</strong> {item.usage_restrictions}
            </p>
          )}
          <ol className="mr-steps">
            <li>Abra la fuente con su usuario institucional y haga la consulta.</li>
            <li>Registre cada tecnología nueva que encuentre (queda en la bandeja de entrada con esta fuente).</li>
            <li>Marque la validación: así la fuente sale de la lista hasta su próxima revisión.</li>
          </ol>

          {canSignal &&
            (signal ? (
              <div className="mr-signal" data-testid="manual-signal-form">
                <Input label="Nombre o título de la señal" required value={signal.title} maxLength={590} onChange={(e) => setSignal({ ...signal, title: e.target.value })} />
                <Input label="Enlace exacto en la fuente" placeholder="https://…" value={signal.url} onChange={(e) => setSignal({ ...signal, url: e.target.value })} />
                <div className="mr-row">
                  <Input label="Tecnología (nombre comercial o DCI)" value={signal.technology} onChange={(e) => setSignal({ ...signal, technology: e.target.value })} />
                  <Select label="Tipo" value={signal.technology_type} onChange={(e) => setSignal({ ...signal, technology_type: e.target.value })}>
                    {TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <Textarea label="Resumen" rows={2} maxLength={1000} value={signal.summary} onChange={(e) => setSignal({ ...signal, summary: e.target.value })} />
                <div className="mr-row-end">
                  <Button size="sm" variant="ghost" onClick={() => setSignal(null)}>
                    Cancelar
                  </Button>
                  <Button size="sm" onClick={saveSignal} loading={busy === "signal"} data-testid="manual-signal-save">
                    Guardar señal
                  </Button>
                </div>
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setSignal(EMPTY_SIGNAL)} data-testid="manual-signal-add">
                <Icon name="plus" size={14} /> Registrar señal encontrada{registered ? ` (${registered} registrada${registered > 1 ? "s" : ""})` : ""}
              </Button>
            ))}

          <div className="mr-close">
            <Select label="Resultado de la consulta" value={outcome} onChange={(e) => setOutcome(e.target.value)} data-testid="manual-outcome">
              {OUTCOMES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            <Textarea
              label={outcome === "no_accesible" ? "Motivo (obligatorio)" : "Nota (opcional)"}
              rows={2}
              maxLength={1000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="mr-row-end">
              <Button onClick={validate} loading={busy === "validate"} data-testid={`manual-validate-${item.id}`}>
                <Icon name="check" size={14} /> Marcar como validada
              </Button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

/**
 * Lista de fuentes de consulta manual (nivel E): primero las por validar.
 * Se usa dentro del modal de la Bandeja de entrada.
 */
export default function ManualReviewPanel({ data, onChange, toast }) {
  const [showAll, setShowAll] = useState(false);
  if (!data) return null;
  const items = showAll ? data.items : data.items.filter((i) => i.due);
  return (
    <div className="mr-panel" data-testid="manual-review-panel">
      <p className="mr-intro">
        Estas fuentes no entran a la vigilancia automática (bases con licencia, portales con usuario o captcha): una persona del
        equipo las consulta en su navegador según la frecuencia de la matriz. <strong>{data.due}</strong> de {data.total} están por
        validar.
      </p>
      {items.map((item) => (
        <ManualSource key={item.id} item={item} onDone={onChange} toast={toast} />
      ))}
      {items.length === 0 && <div className="mr-empty">Todas las fuentes de consulta manual están al día.</div>}
      {data.total > data.due && (
        <Button size="sm" variant="ghost" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Ver solo las por validar" : `Ver también las ${data.total - data.due} al día`}
        </Button>
      )}
    </div>
  );
}
