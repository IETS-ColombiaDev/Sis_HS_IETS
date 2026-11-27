import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { apiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useRealtime } from "../realtime/RealtimeContext";
import { useToast } from "../components/Toast";
import { Card, PageHeader } from "../components/Card";
import ActionMenu from "../components/ActionMenu";
import Badge from "../components/Badge";
import Button from "../components/Button";
import HintButton from "../components/HintButton";
import Icon from "../components/Icon";
import InfoTip from "../components/InfoTip";
import Modal from "../components/Modal";
import { Select, Textarea } from "../components/Field";
import EmptyState from "../components/EmptyState";
import SubmissionCrossCheck from "../components/SubmissionCrossCheck";
import { ModuleStatsRow } from "../components/PhaseGuide";
import { LoadingBlock } from "../components/Spinner";
import { PERM } from "../constants/methodology";
import { GLOSSARY } from "../constants/glossary";
import { downloadFromApi } from "../utils/download";
import { t, ts, fmtDate, fmtDateTime } from "../i18n";
import "./submissions.css";

const TONE = { recibida: "warning", aceptada: "ok", rechazada: "error" };
const STATUS_LABEL = { recibida: t("Por moderar"), aceptada: t("Aceptada"), rechazada: t("Rechazada") };
const TABS = [
  { key: "recibida", label: t("Por moderar"), count: "pending" },
  { key: "aceptada", label: t("Aceptadas"), count: "accepted" },
  { key: "rechazada", label: t("Rechazadas"), count: "rejected" },
  { key: "", label: t("Todas"), count: "total" },
];
const HISTORY_ICON = {
  submission_received: "inbox",
  submission_accepted: "check",
  submission_rejected: "x",
  submission_reopened: "clock",
  submission_cross_check: "search",
};

const submissionName = (row) => row.commercial_name || row.inn_name || t("Postulación #{id}", { id: row.id });
const show = (value) => (value && String(value).trim() ? value : "-");

function waitingLabel(row) {
  const days = row.waiting_days || 0;
  if (row.status !== "recibida") return days === 0 ? t("Resuelta el mismo día") : days === 1 ? t("Resuelta en 1 día") : t("Resuelta en {n} días", { n: days });
  if (days === 0) return t("Recibida hoy");
  return days === 1 ? t("Espera hace 1 día") : t("Espera hace {n} días", { n: days });
}

function Field({ label, children, wide = false }) {
  return (
    <div className={`subm-field${wide ? " is-wide" : ""}`}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Datos de la postulación, agrupados como en el formulario público. */
function SubmissionFields({ row }) {
  const links = row.evidence_links || [];
  return (
    <div className="subm-fields" data-testid={`submission-fields-${row.id}`}>
      <section>
        <h4>{t("Datos obligatorios")}</h4>
        <dl>
          <Field label={t("Nombre comercial:")}>{show(row.commercial_name)}</Field>
          <Field label={t("DCI:")}>{show(row.inn_name)}</Field>
          <Field label={t("Indicación propuesta:")} wide>{show(row.indication)}</Field>
        </dl>
      </section>
      <section>
        <h4>{t("Fuente de información")}</h4>
        {links.length ? (
          <ul className="subm-links">
            {links.map((lk) => (
              <li key={lk}>
                <Icon name="link" size={13} />
                <a href={lk} target="_blank" rel="noopener noreferrer">{lk}</a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="subm-empty">-</p>
        )}
      </section>
      <section>
        <h4>{t("Información complementaria")}</h4>
        <dl>
          <Field label={t("Fabricante o desarrollador:")}>{show(row.manufacturer)}</Field>
          <Field label={t("Fase de desarrollo:")}>{show(row.development_phase)}</Field>
          <Field label={t("Mecanismo de acción:")} wide>{show(row.mechanism)}</Field>
        </dl>
      </section>
      <section>
        <h4>{t("Quien postula")}</h4>
        <dl>
          <Field label={t("Nombre:")}>{show(row.submitter_name)}</Field>
          <Field label={t("Correo:")}>{show(row.submitter_email)}</Field>
          <Field label={t("Organización:")}>{show(row.submitter_org)}</Field>
          <Field label={t("Recibida:")}>{fmtDateTime(row.created_at)}</Field>
        </dl>
      </section>
      <p className={`subm-coi${row.has_conflict ? " is-declared" : ""}`}>
        <strong>{t("Conflicto de interés:")}</strong>{" "}
        {row.has_conflict ? show(row.conflict_statement) : t("No declara conflicto (declaración firmada).")}
      </p>
    </div>
  );
}

function Duplicates({ row, onOpen }) {
  const list = row.duplicates || [];
  if (!list.length) return null;
  return (
    <div className="subm-dupes" data-testid={`submission-dupes-${row.id}`}>
      <Icon name="layers" size={15} />
      <div>
        <strong>
          {list.length === 1 ? t("Hay otra postulación de la misma tecnología") : t("Hay {n} postulaciones más de la misma tecnología", { n: list.length })}
        </strong>
        <ul>
          {list.map((d) => (
            <li key={d.id}>
              <button type="button" className="linkish" onClick={() => onOpen(d.id)}>{d.tracking_code}</button>
              {" · "}
              {STATUS_LABEL[d.status] || d.status}
              {d.created_at ? ` · ${fmtDate(d.created_at)}` : ""}
              {d.same_submitter ? ` · ${t("misma persona")}` : ""}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function History({ events }) {
  if (!events) return <p className="subm-empty">{t("Cargando el recorrido...")}</p>;
  if (!events.length) return <p className="subm-empty">{t("Sin eventos registrados.")}</p>;
  return (
    <ol className="subm-history" data-testid="submission-history">
      {events.map((ev, i) => (
        <li key={`${ev.at}-${i}`} className={`is-${ev.action.replace("submission_", "")}`}>
          <span className="subm-history-dot" aria-hidden="true">
            <Icon name={HISTORY_ICON[ev.action] || "info"} size={13} />
          </span>
          <div>
            <strong>{ts(ev.label)}</strong>
            <span className="subm-history-meta">
              {fmtDateTime(ev.at)}
              {ev.by ? ` · ${ev.by}` : ""}
            </span>
            {ev.detail && <p>{ts(ev.detail)}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function decisionLine(row) {
  const name = row.reviewed_by || "-";
  if (row.status === "aceptada") {
    return row.reviewed_at ? t("Aceptada por {name} el {date}", { name, date: fmtDateTime(row.reviewed_at) }) : t("Aceptada por {name}", { name });
  }
  return row.reviewed_at ? t("Rechazada por {name} el {date}", { name, date: fmtDateTime(row.reviewed_at) }) : t("Rechazada por {name}", { name });
}

export default function Submissions() {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const firstLoad = useRef(true);
  const [filter, setFilter] = useState("recibida");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [conflict, setConflict] = useState("");
  const [order, setOrder] = useState("recientes");
  const [onlyStale, setOnlyStale] = useState(false);
  const [current, setCurrent] = useState(null);
  const [history, setHistory] = useState(null);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(null);
  const [reopening, setReopening] = useState(null);
  const [reopenNote, setReopenNote] = useState("");
  const [exporting, setExporting] = useState(false);
  const [portal, setPortal] = useState(null);

  const { can, user } = useAuth();
  const { version } = useRealtime();
  const toast = useToast();
  const navigate = useNavigate();
  const canReview = can(PERM.STAGING_ASSIGN);
  const noReview = t("Su perfil ({role}) puede consultar la cola pero no moderarla (permiso staging:assign).", { role: ts(user?.role_label) || user?.role });

  // La búsqueda espera a que la persona deje de escribir.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const params = useMemo(
    () => ({
      status: filter || undefined,
      q: query || undefined,
      conflict: conflict === "" ? undefined : conflict === "si",
      stale: onlyStale || undefined,
      order,
    }),
    [filter, query, conflict, onlyStale, order]
  );

  const load = useCallback(async () => {
    try {
      const [list, sum] = await Promise.all([api.get("/submissions", { params }), api.get("/submissions/summary")]);
      setRows(list.data);
      setSummary(sum.data);
    } catch (e) {
      if (firstLoad.current) toast.error(apiError(e, t("No se pudieron cargar las postulaciones")));
    } finally {
      firstLoad.current = false;
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  useEffect(() => {
    load();
  }, [load, version]);

  // Tras cruzar de nuevo, la tarjeta y la ventana de revisión muestran el resultado al instante.
  const replaceRow = (updated) => {
    setRows((list) => list.map((r) => (r.id === updated.id ? updated : r)));
    setCurrent((cur) => (cur && cur.id === updated.id ? updated : cur));
  };

  useEffect(() => {
    api.get("/public/submissions/config").then(({ data }) => setPortal(data)).catch(() => setPortal(null));
  }, []);

  const open = (row) => {
    setCurrent(row);
    setNote("");
    setReason("");
    setHistory(null);
    api
      .get(`/submissions/${row.id}/history`)
      .then(({ data }) => setHistory(data))
      .catch(() => setHistory([]));
  };

  const openById = async (id) => {
    const known = rows.find((r) => r.id === id);
    if (known) {
      open(known);
      return;
    }
    try {
      const { data } = await api.get(`/submissions/${id}`);
      open(data);
    } catch (e) {
      toast.error(apiError(e, t("No se pudo abrir la postulación")));
    }
  };

  const decide = async (action) => {
    if (!current) return;
    if (action === "reject" && !reason && !note.trim()) {
      toast.error(t("El rechazo exige un motivo visible para la bitácora."));
      return;
    }
    setSaving(action);
    try {
      const body = action === "reject" ? { note, reason: reason || "otro" } : { note };
      const { data } = await api.post(`/submissions/${current.id}/${action}`, body);
      if (action === "accept") toast.success(t("Postulación aceptada: quedó en la bandeja de entrada como señal reactiva (tecnología #{id}).", { id: data.technology_id }));
      else toast.success(t("Postulación rechazada. El motivo quedó registrado."));
      setCurrent(null);
      setNote("");
      setReason("");
      await load();
    } catch (e) {
      toast.error(apiError(e, t("No se pudo resolver la postulación")));
    } finally {
      setSaving(null);
    }
  };

  const reopen = async () => {
    if (!reopening || !reopenNote.trim()) return;
    setSaving("reopen");
    try {
      await api.post(`/submissions/${reopening.id}/reopen`, { note: reopenNote });
      toast.success(t("Postulación reabierta: volvió a la cola por moderar."));
      setReopening(null);
      setReopenNote("");
      setCurrent(null);
      await load();
    } catch (e) {
      toast.error(apiError(e, t("No se pudo reabrir la postulación")));
    } finally {
      setSaving(null);
    }
  };

  const portalUrl = `${window.location.origin}/postular`;
  const copyPortal = async () => {
    try {
      await navigator.clipboard.writeText(portalUrl);
      toast.success(t("Enlace del formulario público copiado"));
    } catch {
      toast.info(portalUrl);
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadFromApi(api, "/submissions/export.csv", "postulaciones.csv", {
        params: { status: params.status, q: params.q, conflict: params.conflict },
      });
    } catch (e) {
      toast.error(apiError(e, t("No se pudo descargar el listado")));
    } finally {
      setExporting(false);
    }
  };

  const reasons = summary?.reasons || [];
  const filtered = Boolean(query || conflict || onlyStale);
  const clearFilters = () => {
    setSearch("");
    setConflict("");
    setOnlyStale(false);
  };

  if (loading) return <LoadingBlock label={t("Cargando postulaciones...")} />;

  return (
    <div>
      <PageHeader
        title={t("Postulaciones reactivas")}
        titleHint={GLOSSARY.postulacion}
        subtitle={t("Cola de moderación del canal público. Nada entra al staging sin revisión humana y declaración de conflicto de interés.")}
        actions={
          <>
            <ActionMenu
              label={t("Formulario público")}
              icon="link"
              testId="submissions-portal-menu"
              items={[
                { key: "copy", label: t("Copiar enlace del formulario"), icon: "link", description: t("Copiar el enlace del formulario público /postular para compartirlo"), onSelect: copyPortal },
                { key: "open", label: t("Abrir el formulario"), icon: "eye", description: t("Ver el formulario como lo ve quien postula, en otra pestaña."), onSelect: () => window.open(portalUrl, "_blank", "noopener") },
              ]}
            />
            <HintButton
              variant="secondary"
              loading={exporting}
              disabled={!canReview}
              disabledHint={noReview}
              hint={t("Descarga en CSV las postulaciones del filtro actual, con su decisión y motivo. La descarga queda en la bitácora.")}
              onClick={exportCsv}
              data-testid="submissions-export"
            >
              <Icon name="doc" size={16} /> {t("Exportar CSV")}
            </HintButton>
            <Button variant="secondary" onClick={() => navigate("/bandeja-entrada")}>
              <Icon name="inbox" size={16} /> {t("Bandeja de entrada")}
            </Button>
          </>
        }
      />

      {summary && (
        <ModuleStatsRow
          items={[
            { label: t("Por moderar"), value: summary.pending, sub: summary.pending ? t("La más antigua espera hace {n} día(s)", { n: summary.oldest_pending_days }) : t("Cola al día"), color: summary.pending ? "#D97706" : "#059669", hint: t("Postulaciones recibidas que aún no tienen decisión."), testId: "subm-kpi-pending" },
            { label: t("Esperan 7 días o más"), value: summary.pending_stale, sub: t("Sin decisión"), color: summary.pending_stale ? "#DC2626" : undefined, hint: t("Postulaciones por moderar recibidas hace una semana o más. Conviene resolverlas primero.") },
            { label: t("Con conflicto declarado"), value: summary.pending_with_conflict, sub: t("Entre las pendientes"), hint: GLOSSARY.coi },
            { label: t("Aceptadas"), value: summary.accepted, sub: t("Pasaron a la bandeja de entrada"), color: summary.accepted ? "#059669" : undefined, hint: t("Postulaciones que se convirtieron en señal reactiva.") },
            { label: t("Rechazadas"), value: summary.rejected, sub: summary.reject_reasons?.[0] ? t("Motivo más frecuente: {motivo}", { motivo: ts(summary.reject_reasons[0].label) }) : t("Con motivo registrado"), hint: t("Postulaciones no aceptadas. Cada una guarda su motivo.") },
            { label: t("Tiempo de respuesta"), value: summary.median_response_days == null ? "-" : t("{n} d", { n: summary.median_response_days }), sub: t("Mediana entre recibida y decisión"), hint: t("Días que tarda la moderación en decidir, tomando la mediana de las postulaciones ya resueltas.") },
          ]}
        />
      )}

      {portal && (
        <div className={`fb-public-note${portal.recaptcha_enabled ? " is-ok" : ""}`} data-testid="captcha-mode">
          <strong>
            {portal.recaptcha_enabled
              ? t("Anti-robot del formulario: reCAPTCHA activo.")
              : portal.mode === "incompleto"
                ? t("Anti-robot del formulario: configuración incompleta.")
                : t("Anti-robot del formulario: modo degradado.")}
          </strong>{" "}
          {ts(portal.message)} <InfoTip text={GLOSSARY.fb_recaptcha} label={t("Qué es reCAPTCHA")} />
        </div>
      )}

      {!canReview && (
        <div className="fb-readonly-note">
          <Icon name="info" size={16} />
          <span>{t("Modo consulta: {detail}", { detail: noReview })}</span>
        </div>
      )}

      <Card padding={14} className="subm-toolbar">
        <div className="screening-tabs subm-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key || "todas"}
              type="button"
              className={`screening-tab${filter === tab.key ? " is-active" : ""}`}
              aria-pressed={filter === tab.key}
              onClick={() => setFilter(tab.key)}
            >
              {tab.label}
              {summary && <span className="subm-tab-count">{summary[tab.count]}</span>}
            </button>
          ))}
          <InfoTip text={GLOSSARY.fb_estado_postulacion} label={t("Qué significa cada estado")} />
        </div>
        <div className="subm-filters">
          <label className="subm-search">
            <Icon name="search" size={15} />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("Buscar por tecnología, indicación, postulante o radicado...")}
              aria-label={t("Buscar postulaciones")}
            />
          </label>
          <select value={conflict} onChange={(e) => setConflict(e.target.value)} aria-label={t("Filtrar por conflicto de interés")}>
            <option value="">{t("Con y sin conflicto")}</option>
            <option value="si">{t("Declara conflicto")}</option>
            <option value="no">{t("Sin conflicto declarado")}</option>
          </select>
          <select value={order} onChange={(e) => setOrder(e.target.value)} aria-label={t("Orden")}>
            <option value="recientes">{t("Más recientes primero")}</option>
            <option value="antiguas">{t("Más antiguas primero")}</option>
          </select>
          <label className="subm-check">
            <input type="checkbox" checked={onlyStale} onChange={(e) => setOnlyStale(e.target.checked)} />
            <span>{t("Solo las que esperan 7 días o más")}</span>
          </label>
          <span className="subm-count" data-testid="subm-count">
            {rows.length === 1 ? t("1 postulación") : t("{n} postulaciones", { n: rows.length })}
          </span>
        </div>
      </Card>

      {rows.length === 0 ? (
        <Card>
          {filtered ? (
            <EmptyState
              icon="🔎"
              title={t("Ninguna postulación coincide con la búsqueda")}
              message={t("Cambie el texto o los filtros para ver más resultados.")}
              action={<Button variant="secondary" onClick={clearFilters}>{t("Quitar filtros")}</Button>}
            />
          ) : (
            <EmptyState
              icon="📬"
              title={t("No hay postulaciones en este filtro")}
              message={t("El formulario público vive en /postular. Las que lleguen aparecen aquí como 'por moderar'.")}
              action={<Button variant="secondary" onClick={copyPortal}>{t("Copiar enlace del formulario")}</Button>}
            />
          )}
        </Card>
      ) : (
        <div className="merge-list subm-list">
          {rows.map((row) => (
            <Card key={row.id} padding={0} className={`subm-card is-${row.status}`}>
              <div className="subm-card-head" data-testid={`submission-${row.id}`}>
                <div className="subm-card-title">
                  <span className="subm-code">{row.tracking_code}</span>
                  <h3>{submissionName(row)}</h3>
                  <p>
                    {row.inn_name && row.commercial_name ? `${row.inn_name} · ` : ""}
                    {row.submitter_org || row.submitter_name || row.submitter_email}
                  </p>
                </div>
                <div className="subm-card-badges">
                  <span title={GLOSSARY.fb_estado_postulacion}><Badge tone={TONE[row.status] || "neutral"}>{STATUS_LABEL[row.status] || row.status}</Badge></span>
                  {row.has_conflict ? (
                    <span title={GLOSSARY.coi}><Badge tone="warning">{t("Declara conflicto de interés")}</Badge></span>
                  ) : (
                    <span title={GLOSSARY.coi}><Badge tone="viewer">{t("Sin conflicto declarado")}</Badge></span>
                  )}
                  <span className={`subm-wait${row.status === "recibida" && row.waiting_days >= 7 ? " is-late" : ""}`}>
                    <Icon name="clock" size={13} /> {waitingLabel(row)}
                  </span>
                </div>
              </div>

              <div className="subm-card-body">
                <SubmissionFields row={row} />
                <Duplicates row={row} onOpen={openById} />
                <SubmissionCrossCheck row={row} canRun={canReview} onUpdated={replaceRow} toast={toast} compact />
                {row.status !== "recibida" && (
                  <p className={`subm-decision is-${row.status}`}>
                    <Icon name={row.status === "aceptada" ? "check" : "x"} size={14} />
                    <span>
                      {decisionLine(row)}
                      {row.reject_reason_label ? ". " + t("Motivo: {motivo}", { motivo: ts(row.reject_reason_label) }) : ""}
                      {row.review_note ? ". " + t("Nota: {note}", { note: row.review_note }) : ""}
                    </span>
                  </p>
                )}
              </div>

              <div className="subm-card-foot">
                {row.status === "recibida" && (
                  <HintButton size="sm" hint={GLOSSARY.fb_moderar} disabled={!canReview} disabledHint={noReview} onClick={() => open(row)}>
                    {t("Revisar y decidir")}
                  </HintButton>
                )}
                {row.status !== "recibida" && (
                  <Button size="sm" variant="secondary" onClick={() => open(row)}>
                    {t("Ver detalle y recorrido")}
                  </Button>
                )}
                {row.status === "rechazada" && (
                  <HintButton
                    size="sm"
                    variant="ghost"
                    disabled={!canReview}
                    disabledHint={noReview}
                    hint={t("Devuelve la postulación a la cola por moderar. Exige explicar por qué.")}
                    onClick={() => { setReopening(row); setReopenNote(""); }}
                  >
                    {t("Reabrir")}
                  </HintButton>
                )}
                {row.status === "aceptada" && row.technology_id && (
                  <Button size="sm" variant="ghost" onClick={() => navigate("/bandeja-entrada")}>
                    {t("Ver en la bandeja (#{id})", { id: row.technology_id })}
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(current)}
        onClose={() => setCurrent(null)}
        title={current ? t("Revisar {name}", { name: submissionName(current) }) : ""}
        width={920}
        footer={
          current?.status === "recibida" ? (
            <>
              <Button variant="secondary" onClick={() => setCurrent(null)} disabled={Boolean(saving)}>{t("Cancelar")}</Button>
              <HintButton
                variant="danger"
                onClick={() => decide("reject")}
                loading={saving === "reject"}
                disabled={!canReview || (!reason && !note.trim()) || (reason === "otro" && !note.trim()) || Boolean(saving)}
                hint={t("Rechazar la postulación. El motivo queda en la bitácora.")}
                disabledHint={!canReview ? noReview : t("Elija el motivo del rechazo en la lista o escríbalo en la nota de revisión.")}
              >
                {t("Rechazar")}
              </HintButton>
              <HintButton onClick={() => decide("accept")} loading={saving === "accept"} disabled={!canReview || Boolean(saving)} disabledHint={noReview} hint={GLOSSARY.fb_moderar}>
                {t("Aceptar y enviar a bandeja")}
              </HintButton>
            </>
          ) : (
            <Button variant="secondary" onClick={() => setCurrent(null)}>{t("Cerrar")}</Button>
          )
        }
      >
        {current && (
          <div className="subm-detail">
            <div className="subm-detail-main">
              <div className="subm-detail-top">
                <span className="subm-code">{current.tracking_code}</span>
                <Badge tone={TONE[current.status] || "neutral"}>{STATUS_LABEL[current.status] || current.status}</Badge>
                <span className={`subm-wait${current.status === "recibida" && current.waiting_days >= 7 ? " is-late" : ""}`}>
                  <Icon name="clock" size={13} /> {waitingLabel(current)}
                </span>
              </div>
              <SubmissionFields row={current} />
              <Duplicates row={current} onOpen={openById} />
              <SubmissionCrossCheck row={current} canRun={canReview} onUpdated={replaceRow} toast={toast} />
            </div>
            <aside className="subm-detail-side">
              {current.status === "recibida" ? (
                <section className="subm-decide">
                  <h4>{t("Decisión")}</h4>
                  <p className="subm-decide-help">
                    {t("Aceptar crea una señal reactiva en la bandeja de entrada. Rechazar exige un motivo; la nota es opcional salvo en «Otro motivo».")}
                  </p>
                  <Select id="submission-reason" label={t("Motivo si rechaza")} value={reason} onChange={(e) => setReason(e.target.value)}>
                    <option value="">{t("Seleccione un motivo...")}</option>
                    {reasons.map((r) => (
                      <option key={r.code} value={r.code}>{ts(r.label)}</option>
                    ))}
                  </Select>
                  <Textarea
                    id="submission-note"
                    label={t("Nota de revisión (obligatoria si rechaza)")}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={4}
                    help={t("Queda en la bitácora. Quien postula solo ve el motivo de la lista, nunca esta nota.")}
                  />
                </section>
              ) : (
                <section className="subm-decide">
                  <h4>{t("Decisión")}</h4>
                  <p className={`subm-decision is-${current.status}`}>
                    <Icon name={current.status === "aceptada" ? "check" : "x"} size={14} />
                    <span>
                      {decisionLine(current)}
                      {current.reject_reason_label ? ". " + t("Motivo: {motivo}", { motivo: ts(current.reject_reason_label) }) : ""}
                      {current.review_note ? ". " + t("Nota: {note}", { note: current.review_note }) : ""}
                    </span>
                  </p>
                </section>
              )}
              <section>
                <h4>{t("Recorrido##postulación")}</h4>
                <History events={history} />
              </section>
            </aside>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(reopening)}
        onClose={() => setReopening(null)}
        title={reopening ? t("Reabrir {name}", { name: submissionName(reopening) }) : ""}
        width={520}
        footer={
          <>
            <Button variant="secondary" onClick={() => setReopening(null)} disabled={saving === "reopen"}>{t("Cancelar")}</Button>
            <HintButton
              onClick={reopen}
              loading={saving === "reopen"}
              disabled={!reopenNote.trim()}
              hint={t("Devuelve la postulación a la cola por moderar. Exige explicar por qué.")}
              disabledHint={t("Explique por qué se reabre la postulación.")}
            >
              {t("Reabrir postulación")}
            </HintButton>
          </>
        }
      >
        <p style={{ fontSize: 13.5, color: "#475569", marginTop: 0 }}>
          {t("La postulación vuelve a «Por moderar» y se borra la decisión anterior. El rechazo y esta reapertura quedan en el recorrido.")}
        </p>
        <Textarea id="submission-reopen-note" label={t("Por qué se reabre")} required value={reopenNote} onChange={(e) => setReopenNote(e.target.value)} rows={3} />
      </Modal>
    </div>
  );
}
