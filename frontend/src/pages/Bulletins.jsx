import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { apiError } from "../api/client";
import { downloadFromApi } from "../utils/download";
import { useAuth } from "../auth/AuthContext";
import { useCycle } from "../cycle/CycleContext";
import { useRealtime } from "../realtime/RealtimeContext";
import { useToast } from "../components/Toast";
import { Card } from "../components/Card";
import Button from "../components/Button";
import HintButton from "../components/HintButton";
import Badge from "../components/Badge";
import ConfirmDialog from "../components/ConfirmDialog";
import Modal from "../components/Modal";
import Icon from "../components/Icon";
import InfoTip from "../components/InfoTip";
import EmptyState from "../components/EmptyState";
import { Input, Textarea } from "../components/Field";
import { LoadingBlock } from "../components/Spinner";
import ModuleHeader from "../components/ModuleHeader";
import { PERM } from "../constants/methodology";
import { GLOSSARY } from "../constants/glossary";
import { fmtDateTime, t, ts, intlLocale } from "../i18n";
import "./prioritization.css";
import "./bulletins.css";

const BULLETIN_STATUS = {
  borrador: t("Borrador"),
  pendiente_aprobacion: t("Pendiente de aprobación"),
  publicado: t("Publicado"),
};

const NOTE_MAX = 3000;
const TITLE_MAX = 300;
const EMAIL_RE = /^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]{2,}$/;

const HISTORY_ICON = {
  compiled: "plus",
  recompiled: "refresh",
  edited: "edit",
  approved: "check",
  unapproved: "refresh",
  published: "doc",
  distributed: "send",
  exported: "print",
};

const isApproved = (b) => b.status !== "publicado" && Boolean(b.approved_by);
const TABS = [
  { key: "todos", label: t("Todos"), match: () => true },
  { key: "por_aprobar", label: t("Por aprobar"), match: (b) => b.status !== "publicado" && !b.approved_by },
  { key: "aprobados", label: t("Aprobados sin publicar"), match: isApproved },
  { key: "publicados", label: t("Publicados"), match: (b) => b.status === "publicado" },
];

const FUNNEL_ROWS = [
  { key: "captured", label: t("Capturadas") },
  { key: "filtered", label: t("Filtradas") },
  { key: "prioritized", label: t("Priorizadas") },
  { key: "evaluated", label: t("Evaluadas") },
  { key: "published", label: t("Publicadas") },
];

function parseRecipients(text) {
  const good = [];
  const bad = [];
  text
    .split(/[,;\s]+/)
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean)
    .forEach((email) => {
      if (EMAIL_RE.test(email)) {
        if (!good.includes(email)) good.push(email);
      } else bad.push(email);
    });
  return { good, bad };
}

function BulletinKpis({ body }) {
  const funnel = body?.funnel || {};
  const items = [
    { label: t("Asignadas"), value: funnel.captured ?? funnel.assigned ?? 0, hint: GLOSSARY.capturadas },
    { label: t("Filtradas"), value: funnel.filtered ?? 0, hint: GLOSSARY.filtradas },
    { label: t("Priorizadas"), value: funnel.prioritized ?? body?.prioritized ?? 0, hint: GLOSSARY.priorizadas },
    { label: t("Publicadas"), value: funnel.published ?? body?.published ?? 0, hint: GLOSSARY.publicadas },
  ];
  return (
    <div className="bulletin-kpis">
      {items.map((item) => (
        <div key={item.label} className="bulletin-kpi">
          <b>{item.value}</b>
          <span className="term-label">
            {item.label}
            <InfoTip text={item.hint} label={t("Qué cuenta {label}", { label: item.label })} />
          </span>
        </div>
      ))}
    </div>
  );
}

/** Compilado → Aprobado → Publicado → Enviado. */
function BulletinSteps({ bulletin }) {
  const sent = (bulletin.body?.distribution || []).some((d) => (d.sent || []).length > 0);
  const published = bulletin.status === "publicado";
  const steps = [
    { key: "compilado", label: t("Compilado"), done: true },
    { key: "aprobado", label: t("Aprobado"), done: published || Boolean(bulletin.approved_by) },
    { key: "publicado", label: t("Publicado"), done: published },
    { key: "enviado", label: t("Enviado"), done: sent },
  ];
  const next = steps.findIndex((s) => !s.done);
  return (
    <ol className="bl-steps" aria-label={t("Avance del boletín")} data-testid={`bulletin-steps-${bulletin.id}`}>
      {steps.map((s, i) => (
        <li key={s.key} className={s.done ? "is-done" : i === next ? "is-next" : ""}>
          <span aria-hidden="true">{s.done ? <Icon name="check" size={11} /> : i + 1}</span>
          {s.label}
        </li>
      ))}
    </ol>
  );
}

/** Avisa si el ciclo cambió después de compilar. Solo para boletines sin publicar. */
function StaleNotice({ bulletin, version }) {
  const [info, setInfo] = useState(null);
  useEffect(() => {
    let alive = true;
    api
      .get(`/bulletins/${bulletin.id}/freshness`)
      .then(({ data }) => alive && setInfo(data))
      .catch(() => alive && setInfo(null));
    return () => {
      alive = false;
    };
  }, [bulletin.id, bulletin.updated_at, version]);
  if (!info?.stale) return null;
  return (
    <div className="fa-notice fa-notice--warn bl-stale" data-testid={`bulletin-stale-${bulletin.id}`}>
      <div>
        <strong>{t("Las cifras del ciclo cambiaron después de compilar este boletín.")}</strong>
        <div style={{ marginTop: 4 }}>
          {info.changes.map((c) => `${ts(c.label)}: ${c.compiled} → ${c.current}`).join(" · ")}
        </div>
        <div style={{ marginTop: 4 }}>{t("Recompile para actualizarlas. Si ya estaba aprobado, habrá que aprobarlo de nuevo.")}</div>
      </div>
    </div>
  );
}

function BulletinHistory({ bulletin }) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState(null);
  const [failed, setFailed] = useState(false);
  const sends = (bulletin.body?.distribution || []).length;

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setFailed(false);
    api
      .get(`/bulletins/${bulletin.id}/history`)
      .then(({ data }) => alive && setEvents(Array.isArray(data) ? data : []))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [open, bulletin.id, bulletin.updated_at, bulletin.status, bulletin.approved_by, sends]);

  return (
    <details className="prio-history-fold bl-fold" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary data-testid={`bulletin-history-toggle-${bulletin.id}`}>
        <Icon name="clock" size={14} /> {t("Recorrido del boletín")}
        <span>{t("Compilaciones, ediciones, aprobación, publicación, envíos y descargas")}</span>
      </summary>
      {failed ? (
        <p className="prio-history-empty">{t("No se pudo cargar el recorrido del boletín.")}</p>
      ) : events == null ? (
        <p className="prio-history-empty">{t("Cargando el recorrido...")}</p>
      ) : events.length === 0 ? (
        <p className="prio-history-empty">{t("Sin eventos registrados.")}</p>
      ) : (
        <ol className="prio-history bl-history" data-testid={`bulletin-history-${bulletin.id}`}>
          {events.map((ev, i) => (
            <li key={`${ev.at}-${i}`} className={`is-${ev.kind}`}>
              <span className="prio-history-dot" aria-hidden="true">
                <Icon name={HISTORY_ICON[ev.kind] || "info"} size={13} />
              </span>
              <div>
                <strong>{ts(ev.label)}</strong>
                <span className="prio-history-meta">
                  {fmtDateTime(ev.at)}
                  {ev.by ? ` · ${ev.by}` : ""}
                </span>
                {ev.detail && <p>{ts(ev.detail)}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}

function BulletinContent({ body }) {
  const summary = body?.summary;
  const top = body?.top_prioritized || [];
  const previous = body?.previous;
  const funnel = body?.funnel || {};
  return (
    <>
      {body?.note && (
        <blockquote className="bl-note" data-testid="bulletin-note">
          <b>{t("Mensaje del líder del ciclo")}</b>
          <p>{body.note}</p>
        </blockquote>
      )}
      <BulletinKpis body={body} />
      {summary && (
        <p className="bl-lead">
          {t("{n} tecnología(s) llegan al mercado en menos de un año; {m} de ellas están priorizadas. Expedientes de evaluación: {d}, publicados: {p}.", {
            n: summary.imminent ?? 0,
            m: summary.act_now ?? 0,
            d: summary.docs ?? 0,
            p: summary.docs_published ?? 0,
          })}
        </p>
      )}
      {(body?.by_cluster || []).length > 0 && (
        <ul className="bulletin-clusters">
          {body.by_cluster.map((row) => (
            <li key={row.label}>
              <span>{ts(row.label)}</span>
              <strong>{row.value}</strong>
            </li>
          ))}
        </ul>
      )}
      {top.length > 0 && (
        <details className="prio-history-fold bl-fold" open>
          <summary>
            <Icon name="layers" size={14} /> {t("Tecnologías priorizadas")}
            <span>
              {body.top_prioritized_total > top.length
                ? t("Las {n} con más puntos, de {total}", { n: top.length, total: body.top_prioritized_total })
                : t("{n} en este boletín", { n: top.length })}
            </span>
          </summary>
          <div className="bl-table-wrap">
            <table className="bl-table" data-testid="bulletin-top">
              <thead>
                <tr>
                  <th>{t("Tecnología")}</th>
                  <th>{t("Clúster")}</th>
                  <th>{t("Puntos")}</th>
                  <th>{t("Llegada al mercado")}</th>
                </tr>
              </thead>
              <tbody>
                {top.map((row, i) => (
                  <tr key={`${row.name}-${i}`}>
                    <td>{row.name}</td>
                    <td>{ts(row.cluster)}</td>
                    <td>{row.points}</td>
                    <td>{ts(row.band_label)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      {previous && (
        <details className="prio-history-fold bl-fold">
          <summary>
            <Icon name="chart" size={14} /> {t("Frente al ciclo anterior")}
            <span>{previous.cycle_code}</span>
          </summary>
          <div className="bl-table-wrap">
            <table className="bl-table" data-testid="bulletin-previous">
              <thead>
                <tr>
                  <th>{t("Etapa")}</th>
                  <th>{t("Este ciclo")}</th>
                  <th>{previous.cycle_code}</th>
                </tr>
              </thead>
              <tbody>
                {FUNNEL_ROWS.map((row) => (
                  <tr key={row.key}>
                    <td>{row.label}</td>
                    <td>{funnel[row.key] ?? 0}</td>
                    <td>{previous.funnel?.[row.key] ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </>
  );
}

function Distribution({ bulletin }) {
  const list = bulletin.body?.distribution || [];
  if (list.length === 0) return null;
  const last = list[list.length - 1];
  const when = last.at ? new Date(last.at).toLocaleString(intlLocale()) : "";
  const n = (last.sent || []).length;
  return (
    <details className="prio-history-fold bl-fold">
      <summary data-testid={`bulletin-sent-${bulletin.id}`}>
        <Icon name="send" size={14} />{" "}
        {last.by
          ? t("Último envío: {when}, a {n} destinatario(s), por {by}.", { when, n, by: last.by })
          : t("Último envío: {when}, a {n} destinatario(s).", { when, n })}
        <span>{t("{n} envío(s) registrados", { n: list.length })}</span>
      </summary>
      <ul className="bl-sends">
        {[...list].reverse().map((d, i) => (
          <li key={`${d.at}-${i}`}>
            <strong>{fmtDateTime(d.at)}</strong>
            {d.by ? ` · ${d.by}` : ""}
            <div>{t("Entregado a: {lista}", { lista: (d.sent || []).join(", ") || t("nadie") })}</div>
            {(d.failed || []).length > 0 && (
              <div className="bl-sends-failed">{t("Sin entregar: {lista}", { lista: d.failed.map((f) => f.email).join(", ") })}</div>
            )}
            {d.with_pdf === false && <div className="bl-sends-failed">{t("Se envió sin el PDF adjunto.")}</div>}
          </li>
        ))}
      </ul>
    </details>
  );
}

export default function Bulletins() {
  const { cycleId, cycle, isHistoric } = useCycle();
  const { can } = useAuth();
  const { version } = useRealtime();
  const toast = useToast();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [publishing, setPublishing] = useState(null);
  const [tab, setTab] = useState("todos");
  const [allCycles, setAllCycles] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ title: "", note: "" });
  const [unapproving, setUnapproving] = useState(null);
  const [reason, setReason] = useState("");
  const [deleting, setDeleting] = useState(null);
  // RF19: distribucion del boletin publicado a la alta direccion.
  const [sending, setSending] = useState(null);
  const [recipients, setRecipients] = useState("");
  const [mailReady, setMailReady] = useState(true);
  const [maxRecipients, setMaxRecipients] = useState(40);
  const [sendError, setSendError] = useState("");
  const canWrite = can(PERM.CYCLE_WRITE);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/bulletins", { params: cycleId && !allCycles ? { cycle_id: cycleId } : {} });
      setItems(data);
    } catch (e) {
      toast.error(apiError(e, t("No se pudieron cargar los boletines")));
    } finally {
      setLoading(false);
    }
  }, [cycleId, allCycles, toast]);

  useEffect(() => {
    load();
  }, [load, version]);

  const openSend = async (bulletin) => {
    setSendError("");
    setSending(bulletin);
    try {
      const { data } = await api.get("/bulletins/distribution");
      setMailReady(Boolean(data.email));
      setMaxRecipients(Number(data.max_recipients) || 40);
      setRecipients((prev) => prev || (data.recipients || []).join(", "));
    } catch (e) {
      setSendError(apiError(e, t("No se pudo leer la lista de destinatarios")));
    }
  };

  const parsed = useMemo(() => parseRecipients(recipients), [recipients]);

  const send = async () => {
    if (parsed.good.length === 0 && parsed.bad.length === 0) {
      setSendError(t("Escriba al menos un correo."));
      return;
    }
    setSendError("");
    setBusy(`send-${sending.id}`);
    try {
      const { data } = await api.post(`/bulletins/${sending.id}/distribute`, { recipients: parsed.good }, { timeout: 180000 });
      const failed = data.failed || [];
      if (failed.length > 0) {
        toast.warning(t("Enviado a {n}; no se pudo entregar a {failed}.", { n: data.sent.length, failed: failed.map((f) => f.email).join(", ") }));
      } else {
        toast.success(t("Boletín enviado a {n} destinatario(s).", { n: data.sent.length }));
      }
      setSending(null);
      load();
    } catch (e) {
      setSendError(apiError(e, t("No se pudo enviar el boletín")));
    } finally {
      setBusy("");
    }
  };

  const compile = async () => {
    setBusy("compile");
    try {
      await api.post(`/bulletins/compile/${cycleId}`);
      toast.success(t("Boletín compilado con las cifras actuales. Queda pendiente de aprobación."));
      load();
    } catch (e) {
      toast.error(apiError(e, t("No se pudo compilar")));
    } finally {
      setBusy("");
    }
  };

  const approve = async (id, publish) => {
    setBusy(`${publish ? "pub" : "apr"}-${id}`);
    try {
      await api.post(`/bulletins/${id}/approve`, { publish });
      toast.success(publish ? t("Boletín publicado.") : t("Boletín aprobado. Ya se puede publicar."));
      setPublishing(null);
      load();
    } catch (e) {
      toast.error(apiError(e, t("La decisión fue rechazada")));
    } finally {
      setBusy("");
    }
  };

  const startEdit = (b) => {
    setForm({ title: b.title || "", note: b.body?.note || "" });
    setEditing(b);
  };

  const formError = !form.title.trim()
    ? t("El título es obligatorio.")
    : form.title.trim().length > TITLE_MAX
    ? t("El título admite hasta {n} caracteres.", { n: TITLE_MAX })
    : form.note.trim().length > NOTE_MAX
    ? t("La nota editorial admite hasta {n} caracteres.", { n: NOTE_MAX })
    : "";

  const saveEdit = async () => {
    setBusy(`edit-${editing.id}`);
    try {
      const { data } = await api.put(`/bulletins/${editing.id}`, { title: form.title, note: form.note });
      const voided = Boolean(editing.approved_by) && !data.approved_by;
      toast.success(voided ? t("Boletín actualizado. La aprobación anterior se anuló: hay que aprobarlo de nuevo.") : t("Boletín actualizado."));
      setEditing(null);
      load();
    } catch (e) {
      toast.error(apiError(e, t("No se pudo guardar el boletín")));
    } finally {
      setBusy("");
    }
  };

  const confirmUnapprove = async () => {
    setBusy(`unapr-${unapproving.id}`);
    try {
      await api.post(`/bulletins/${unapproving.id}/unapprove`, { reason: reason.trim() });
      toast.success(t("Aprobación anulada. El boletín vuelve a estar pendiente."));
      setUnapproving(null);
      load();
    } catch (e) {
      toast.error(apiError(e, t("No se pudo anular la aprobación")));
    } finally {
      setBusy("");
    }
  };

  const confirmDelete = async () => {
    setBusy(`del-${deleting.id}`);
    try {
      await api.delete(`/bulletins/${deleting.id}`);
      toast.success(t("Boletín eliminado."));
      setDeleting(null);
      load();
    } catch (e) {
      toast.error(apiError(e, t("No se pudo eliminar el boletín")));
    } finally {
      setBusy("");
    }
  };

  const exportHtml = async (b) => {
    try {
      const { data } = await api.get(`/bulletins/${b.id}/export`, { responseType: "blob" });
      const win = window.open(URL.createObjectURL(data), "_blank", "noopener");
      if (!win) toast.info(t("Si no se abrió una pestaña nueva, permita las ventanas emergentes para este sitio."));
    } catch (e) {
      toast.error(apiError(e, t("No se pudo abrir el boletín")));
    }
  };

  const exportPdf = async (b) => {
    setBusy(`pdf-${b.id}`);
    try {
      await downloadFromApi(api, `/bulletins/${b.id}/export?format=pdf`, `boletin-${b.id}.pdf`);
    } catch (e) {
      toast.error(apiError(e, t("No se pudo generar el PDF del boletín")));
    } finally {
      setBusy("");
    }
  };

  const ofCycle = items.filter((b) => b.cycle_id === cycleId);
  const hasOpenDraft = ofCycle.some((b) => b.status !== "publicado");
  const counts = Object.fromEntries(TABS.map((x) => [x.key, items.filter(x.match).length]));
  const visible = items.filter(TABS.find((x) => x.key === tab)?.match || (() => true));

  return (
    <div>
      <ModuleHeader
        step="diseminacion"
        title={t("Boletines del ciclo")}
        titleHint={GLOSSARY.boletin}
        purpose={
          cycle
            ? t("Fase 4 · {code}. Resumen ejecutivo epidemiológico y financiero para publicar después de la aprobación del líder.", { code: cycle.code })
            : t("Fase 4 · Resumen ejecutivo para publicar después de la aprobación.")
        }
        actions={
          canWrite && cycleId ? (
            <HintButton
              onClick={compile}
              loading={busy === "compile"}
              disabled={isHistoric}
              disabledHint={t("El ciclo histórico no produce boletines.")}
              hint={
                hasOpenDraft
                  ? `${GLOSSARY.fa_compilar_boletin} ${t("Actualiza el borrador pendiente.")}`
                  : GLOSSARY.fa_compilar_boletin
              }
              data-testid="bulletin-compile"
            >
              {hasOpenDraft ? t("Recompilar desde el ciclo") : t("Compilar desde el ciclo")}
            </HintButton>
          ) : null
        }
      />
      {loading ? (
        <LoadingBlock label={t("Cargando boletines...")} />
      ) : !cycleId ? (
        <Card>
          <EmptyState
            icon="🗓️"
            title={t("Seleccione un ciclo")}
            message={t("Cada boletín resume un ciclo. Elija uno en la cabecera.")}
            action={<Button onClick={() => navigate("/ciclos")}>{t("Ir a ciclos")}</Button>}
          />
        </Card>
      ) : (
        <>
          <Card padding={16} style={{ marginBottom: 16 }}>
            <div className="screening-tabs bl-tabs">
              {TABS.map((x) => (
                <button
                  key={x.key}
                  type="button"
                  className={`screening-tab${tab === x.key ? " is-active" : ""}`}
                  onClick={() => setTab(x.key)}
                  data-testid={`bulletins-tab-${x.key}`}
                >
                  {x.label}
                  <span className="bl-count">{counts[x.key]}</span>
                </button>
              ))}
            </div>
            <label className="bl-all">
              <input
                type="checkbox"
                checked={allCycles}
                onChange={(e) => setAllCycles(e.target.checked)}
                data-testid="bulletins-all-cycles"
              />
              {t("Ver los boletines de todos los ciclos")}
            </label>
          </Card>

          {items.length === 0 ? (
            <Card>
              <EmptyState
                icon="📰"
                title={t("Sin boletines")}
                message={
                  canWrite
                    ? t("Se compila automáticamente al cerrar el ciclo, o pulse Compilar desde el ciclo.")
                    : t("Se compila automáticamente al cerrar el ciclo. Un evaluador técnico o el superadministrador lo aprueba y publica.")
                }
              />
            </Card>
          ) : visible.length === 0 ? (
            <Card>
              <EmptyState
                icon="🔎"
                title={t("Ningún boletín en esta pestaña")}
                message={t("Cambie de pestaña para ver los demás boletines.")}
                action={
                  <Button variant="outline" onClick={() => setTab("todos")}>
                    {t("Ver todos")}
                  </Button>
                }
              />
            </Card>
          ) : (
            visible.map((b) => (
              <Card key={b.id} style={{ marginBottom: 16 }}>
                <div className="bulletin-card-head" data-testid={`bulletin-${b.id}`}>
                  <div style={{ minWidth: 0 }}>
                    <p className="iets-dossier-kicker">
                      {t("Boletín epidemiológico y financiero")}
                      {allCycles && b.cycle_code ? ` · ${b.cycle_code}` : ""}
                    </p>
                    <h3 style={{ overflowWrap: "anywhere" }}>{b.title}</h3>
                    <p className="bulletin-card-meta">
                      {b.compiled_by
                        ? t("Compilado {date} por {name}", { date: b.body?.compiled_on || "-", name: b.compiled_by })
                        : t("Compilado {date}", { date: b.body?.compiled_on || "-" })}
                      {b.approved_by ? " · " + t("Aprobado por {name}", { name: b.approved_by }) : ""}
                      {b.published_at ? " · " + t("Publicado {date}", { date: new Date(b.published_at).toLocaleDateString(intlLocale()) }) : ""}
                    </p>
                  </div>
                  <Badge tone={b.status === "publicado" || b.approved_by ? "ok" : "warning"}>
                    {b.status !== "publicado" && b.approved_by ? t("Aprobado, listo para publicar") : BULLETIN_STATUS[b.status] || b.status}
                  </Badge>
                </div>
                <BulletinSteps bulletin={b} />
                {b.status !== "publicado" && <StaleNotice bulletin={b} version={version} />}
                <BulletinContent body={b.body} />
                <Distribution bulletin={b} />
                <div className="eval-actions bl-actions">
                  {canWrite && b.status !== "publicado" && (
                    <>
                      <HintButton
                        variant="secondary"
                        onClick={() => approve(b.id, false)}
                        loading={busy === `apr-${b.id}`}
                        disabled={Boolean(b.approved_by)}
                        disabledHint={t("Ya aprobado por {name}. Si recompila, la aprobación se anula.", { name: b.approved_by })}
                        hint={GLOSSARY.fa_aprobar_boletin}
                        data-testid={`bulletin-approve-${b.id}`}
                      >
                        {t("Aprobar")}
                      </HintButton>
                      <HintButton
                        variant="success"
                        onClick={() => setPublishing(b)}
                        disabled={!b.approved_by}
                        disabledHint={t("Requiere la aprobación del líder antes de publicarse (RF19).")}
                        hint={GLOSSARY.fa_publicar_boletin}
                        data-testid={`bulletin-publish-${b.id}`}
                      >
                        {t("Publicar")}
                      </HintButton>
                      {b.approved_by && (
                        <HintButton
                          variant="ghost"
                          onClick={() => {
                            setReason("");
                            setUnapproving(b);
                          }}
                          hint={t("Devuelve el boletín a pendiente de aprobación. Pide el motivo.")}
                          data-testid={`bulletin-unapprove-${b.id}`}
                        >
                          {t("Anular aprobación")}
                        </HintButton>
                      )}
                      <HintButton
                        variant="ghost"
                        onClick={() => startEdit(b)}
                        hint={t("Cambie el título o escriba el mensaje del líder que encabeza el boletín.")}
                        data-testid={`bulletin-edit-${b.id}`}
                      >
                        <Icon name="edit" size={14} /> {t("Título y mensaje")}
                      </HintButton>
                      <HintButton
                        variant="ghost"
                        style={{ color: "#DC2626" }}
                        onClick={() => setDeleting(b)}
                        hint={t("Elimina este boletín sin publicar. Se puede volver a compilar cuando haga falta.")}
                        data-testid={`bulletin-delete-${b.id}`}
                      >
                        <Icon name="trash" size={14} /> {t("Eliminar")}
                      </HintButton>
                    </>
                  )}
                  {canWrite && b.status === "publicado" && (
                    <HintButton
                      onClick={() => openSend(b)}
                      hint={t("Envía el boletín publicado, con su PDF adjunto, a los correos de la alta dirección.")}
                      data-testid={`bulletin-send-${b.id}`}
                    >
                      {t("Enviar a la alta dirección")}
                    </HintButton>
                  )}
                  <HintButton
                    variant="outline"
                    onClick={() => exportHtml(b)}
                    hint={t("Abre la versión ejecutiva en una pestaña nueva.")}
                    data-testid={`bulletin-export-${b.id}`}
                  >
                    {t("Ver HTML ejecutivo")}
                  </HintButton>
                  <HintButton
                    variant="outline"
                    onClick={() => exportPdf(b)}
                    loading={busy === `pdf-${b.id}`}
                    hint={t("Descarga el boletín en PDF (A4) listo para distribuir.")}
                    data-testid={`bulletin-pdf-${b.id}`}
                  >
                    {t("Descargar PDF")}
                  </HintButton>
                </div>
                <BulletinHistory bulletin={b} />
              </Card>
            ))
          )}
        </>
      )}

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={t("Título y mensaje del boletín")}
        width={600}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              {t("Cancelar")}
            </Button>
            <HintButton
              onClick={saveEdit}
              loading={Boolean(editing) && busy === `edit-${editing?.id}`}
              disabled={Boolean(formError)}
              disabledHint={formError}
              data-testid="bulletin-edit-save"
            >
              {t("Guardar cambios")}
            </HintButton>
          </>
        }
      >
        {editing?.approved_by && (
          <div className="fa-notice fa-notice--warn" style={{ marginBottom: 12 }}>
            {t("Este boletín ya está aprobado. Si cambia el texto, la aprobación se anula y hay que aprobarlo de nuevo.")}
          </div>
        )}
        <Input
          id="bulletin-title"
          label={t("Título")}
          required
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
        <Textarea
          id="bulletin-note"
          label={t("Mensaje del líder del ciclo")}
          hint={t("Texto libre que encabeza el boletín: qué destaca este ciclo y qué se le pide a quien decide. Al recompilar se conserva.")}
          rows={6}
          maxLength={NOTE_MAX}
          value={form.note}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
          placeholder={t("Por ejemplo: este ciclo priorizó tres terapias avanzadas que llegan al país en menos de un año...")}
        />
      </Modal>

      <Modal
        open={Boolean(unapproving)}
        onClose={() => setUnapproving(null)}
        title={t("Anular la aprobación")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setUnapproving(null)}>
              {t("Cancelar")}
            </Button>
            <HintButton
              onClick={confirmUnapprove}
              loading={Boolean(unapproving) && busy === `unapr-${unapproving?.id}`}
              disabled={!reason.trim()}
              disabledHint={t("Escriba el motivo.")}
              data-testid="bulletin-unapprove-confirm"
            >
              {t("Anular aprobación")}
            </HintButton>
          </>
        }
      >
        <p style={{ fontSize: 14, color: "#475569", marginBottom: 14 }}>
          {t("«{title}» vuelve a quedar pendiente de aprobación. El motivo queda en el recorrido del boletín.", { title: unapproving?.title || "" })}
        </p>
        <Textarea
          id="bulletin-unapprove-reason"
          label={t("Motivo")}
          required
          rows={3}
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={Boolean(deleting) && busy === `del-${deleting?.id}`}
        title={t("Eliminar boletín")}
        confirmLabel={t("Eliminar boletín")}
        message={t('Se eliminará "{title}", que no está publicado. El mensaje del líder se pierde. La baja queda en la bitácora.', { title: deleting?.title || "" })}
      />

      <Modal
        open={Boolean(sending)}
        onClose={() => setSending(null)}
        title={t("Enviar el boletín a la alta dirección")}
        width={560}
        footer={
          <div className="fb-toolbar" style={{ justifyContent: "flex-end" }}>
            <Button variant="outline" onClick={() => setSending(null)}>{t("Cancelar")}</Button>
            <Button
              onClick={send}
              loading={Boolean(sending) && busy === `send-${sending?.id}`}
              disabled={!mailReady || parsed.bad.length > 0 || parsed.good.length > maxRecipients}
            >
              {t("Enviar boletín")}
            </Button>
          </div>
        }
      >
        <p style={{ fontSize: 13.5, color: "#475569", lineHeight: 1.6, marginBottom: 12 }}>
          {t("Se enviará «{title}» con el PDF adjunto. La lista se recuerda para el siguiente boletín y cada envío queda registrado.", { title: sending?.title || "" })}
        </p>
        {!mailReady && (
          <div role="alert" className="login-notice login-notice-error" style={{ marginBottom: 12 }}>
            {t("El correo institucional no está configurado en el servidor. Descargue el PDF y envíelo por su correo.")}
          </div>
        )}
        <label htmlFor="bulletin-recipients" style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
          {t("Destinatarios (separados por coma)")}
        </label>
        <textarea
          id="bulletin-recipients"
          className="filter-input"
          rows={4}
          style={{ width: "100%", resize: "vertical" }}
          value={recipients}
          onChange={(e) => setRecipients(e.target.value)}
          placeholder="direccion@iets.org.co, despacho@minsalud.gov.co"
        />
        <p className={`bl-recipients${parsed.bad.length || parsed.good.length > maxRecipients ? " is-bad" : ""}`} data-testid="bulletin-recipients-count">
          {parsed.bad.length > 0
            ? t("Correos no válidos: {lista}", { lista: parsed.bad.slice(0, 5).join(", ") })
            : parsed.good.length > maxRecipients
            ? t("{n} destinatarios: el máximo por envío es {max}.", { n: parsed.good.length, max: maxRecipients })
            : t("{n} destinatario(s) válidos", { n: parsed.good.length })}
        </p>
        {sendError && (
          <div role="alert" className="public-submit-error" style={{ marginTop: 10 }}>{sendError}</div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(publishing)}
        onClose={() => setPublishing(null)}
        onConfirm={() => approve(publishing.id, true)}
        loading={Boolean(publishing) && busy === `pub-${publishing?.id}`}
        title={t("Publicar boletín")}
        confirmVariant="success"
        confirmLabel={t("Publicar")}
        message={t('Se publicará "{title}" con las cifras aprobadas. La publicación no se deshace.', { title: publishing?.title || "" })}
      />
    </div>
  );
}
