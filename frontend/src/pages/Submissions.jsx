import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { apiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useRealtime } from "../realtime/RealtimeContext";
import { useToast } from "../components/Toast";
import { Card, PageHeader } from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import HintButton from "../components/HintButton";
import Icon from "../components/Icon";
import InfoTip from "../components/InfoTip";
import Modal from "../components/Modal";
import { Textarea } from "../components/Field";
import EmptyState from "../components/EmptyState";
import SubmissionCrossCheck from "../components/SubmissionCrossCheck";
import { LoadingBlock } from "../components/Spinner";
import { PERM } from "../constants/methodology";
import { GLOSSARY } from "../constants/glossary";
import { t, ts, intlLocale } from "../i18n";

const TONE = { recibida: "warning", aceptada: "ok", rechazada: "error" };
const STATUS_LABEL = { recibida: t("Por moderar"), aceptada: t("Aceptada"), rechazada: t("Rechazada") };
const TABS = [
  { key: "recibida", label: t("Por moderar") },
  { key: "aceptada", label: t("Aceptadas") },
  { key: "rechazada", label: t("Rechazadas") },
  { key: "", label: t("Todas") },
];

const submissionName = (row) => row.commercial_name || row.inn_name || t("Postulación #{id}", { id: row.id });

const show = (value) => (value && String(value).trim() ? value : "-");

function SubmissionFields({ row }) {
  const links = row.evidence_links || [];
  return (
    <div style={{ fontSize: 13.5, color: "#334155" }} data-testid={`submission-fields-${row.id}`}>
      <p style={{ fontSize: 13, fontWeight: 600, margin: "4px 0" }}>{t("Datos obligatorios")}</p>
      <p style={{ margin: "0 0 8px" }}>
        <strong>{t("Nombre comercial:")}</strong> {show(row.commercial_name)}
        <br />
        <strong>{t("DCI:")}</strong> {show(row.inn_name)}
        <br />
        <strong>{t("Indicación propuesta:")}</strong> {show(row.indication)}
      </p>
      <p style={{ fontSize: 13, fontWeight: 600, margin: "4px 0" }}>{t("Fuente de información")}</p>
      {links.length ? (
        <ul style={{ fontSize: 13, overflowWrap: "anywhere", margin: "0 0 8px" }}>
          {links.map((lk) => (
            <li key={lk}>
              <a href={lk} target="_blank" rel="noreferrer">{lk}</a>
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ margin: "0 0 8px" }}>-</p>
      )}
      <p style={{ fontSize: 13, fontWeight: 600, margin: "4px 0" }}>{t("Información complementaria")}</p>
      <p style={{ margin: "0 0 8px" }}>
        <strong>{t("Fabricante o desarrollador:")}</strong> {show(row.manufacturer)}
        <br />
        <strong>{t("Fase de desarrollo:")}</strong> {show(row.development_phase)}
        <br />
        <strong>{t("Mecanismo de acción:")}</strong> {show(row.mechanism)}
      </p>
      <p style={{ fontSize: 13, fontWeight: 600, margin: "4px 0" }}>{t("Quien postula")}</p>
      <p style={{ margin: "0 0 8px" }}>
        <strong>{t("Nombre:")}</strong> {show(row.submitter_name)}
        <br />
        <strong>{t("Correo:")}</strong> {show(row.submitter_email)}
        <br />
        <strong>{t("Organización:")}</strong> {show(row.submitter_org)}
        <br />
        <strong>{t("Recibida:")}</strong> {row.created_at ? new Date(row.created_at).toLocaleString(intlLocale()) : "-"}
      </p>
      <p style={{ fontSize: 13, background: row.has_conflict ? "#FEF3C7" : "#F1F5F9", padding: 10, borderRadius: 8 }}>
        <strong>{t("Conflicto de interés:")}</strong>{" "}
        {row.has_conflict ? show(row.conflict_statement) : t("No declara conflicto (declaración firmada).")}
      </p>
    </div>
  );
}

export default function Submissions() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const firstLoad = useRef(true);
  const [filter, setFilter] = useState("recibida");
  const [current, setCurrent] = useState(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(null);
  const [portal, setPortal] = useState(null);

  const { can, user } = useAuth();
  const { version } = useRealtime();
  const toast = useToast();
  const navigate = useNavigate();
  const canReview = can(PERM.STAGING_ASSIGN);
  const noReview = t("Su perfil ({role}) puede consultar la cola pero no moderarla (permiso staging:assign).", { role: ts(user?.role_label) || user?.role });

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/submissions", { params: { status: filter || undefined } });
      setRows(data);
    } catch (e) {
      if (firstLoad.current) toast.error(apiError(e, t("No se pudieron cargar las postulaciones")));
    } finally {
      firstLoad.current = false;
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

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

  const decide = async (action) => {
    if (!current) return;
    if (action === "reject" && !note.trim()) {
      toast.error(t("El rechazo exige un motivo visible para la bitácora."));
      return;
    }
    setSaving(action);
    try {
      const { data } = await api.post(`/submissions/${current.id}/${action}`, { note });
      if (action === "accept") toast.success(t("Postulación aceptada: quedó en la bandeja de entrada como señal reactiva (tecnología #{id}).", { id: data.technology_id }));
      else toast.success(t("Postulación rechazada. El motivo quedó registrado."));
      setCurrent(null);
      setNote("");
      await load();
    } catch (e) {
      toast.error(apiError(e, t("No se pudo resolver la postulación")));
    } finally {
      setSaving(null);
    }
  };

  const copyPortal = async () => {
    const url = `${window.location.origin}/postular`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("Enlace del formulario público copiado"));
    } catch {
      toast.info(url);
    }
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
            <HintButton variant="secondary" hint={t("Copiar el enlace del formulario público /postular para compartirlo")} onClick={copyPortal}>
              <Icon name="link" size={16} /> {t("Enlace del formulario")}
            </HintButton>
            <Button variant="secondary" onClick={() => navigate("/bandeja-entrada")}>
              <Icon name="inbox" size={16} /> {t("Bandeja de entrada")}
            </Button>
          </>
        }
      />

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

      <div className="screening-tabs" style={{ marginBottom: 16, display: "flex", alignItems: "center", flexWrap: "wrap" }}>
        {TABS.map((tab) => (
          <button
            key={tab.key || "todas"}
            type="button"
            className={`screening-tab${filter === tab.key ? " is-active" : ""}`}
            aria-pressed={filter === tab.key}
            onClick={() => setFilter(tab.key)}
          >
            {tab.label}
          </button>
        ))}
        <InfoTip text={GLOSSARY.fb_estado_postulacion} label={t("Qué significa cada estado")} />
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon="📬"
            title={t("No hay postulaciones en este filtro")}
            message={t("El formulario público vive en /postular. Las que lleguen aparecen aquí como 'por moderar'.")}
            action={<Button variant="secondary" onClick={copyPortal}>{t("Copiar enlace del formulario")}</Button>}
          />
        </Card>
      ) : (
        <div className="merge-list">
          {rows.map((row) => (
            <Card key={row.id} title={submissionName(row)} hint={`${row.inn_name || "-"} · ${row.submitter_org || row.submitter_email}`}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }} data-testid={`submission-${row.id}`}>
                <span title={GLOSSARY.fb_estado_postulacion}><Badge tone={TONE[row.status] || "neutral"}>{STATUS_LABEL[row.status] || row.status}</Badge></span>
                {row.has_conflict ? (
                  <span title={GLOSSARY.coi}><Badge tone="warning">{t("Declara conflicto de interés")}</Badge></span>
                ) : (
                  <span title={GLOSSARY.coi}><Badge tone="viewer">{t("Sin conflicto declarado")}</Badge></span>
                )}
              </div>
              <SubmissionFields row={row} />
              <SubmissionCrossCheck row={row} canRun={canReview} onUpdated={replaceRow} toast={toast} compact />
              {row.status !== "recibida" && (
                <p style={{ fontSize: 12.5, color: "#64748B" }}>
                  {row.status === "aceptada"
                    ? row.reviewed_at
                      ? t("Aceptada por {name} el {date}", { name: row.reviewed_by || "-", date: new Date(row.reviewed_at).toLocaleString(intlLocale()) })
                      : t("Aceptada por {name}", { name: row.reviewed_by || "-" })
                    : row.reviewed_at
                      ? t("Rechazada por {name} el {date}", { name: row.reviewed_by || "-", date: new Date(row.reviewed_at).toLocaleString(intlLocale()) })
                      : t("Rechazada por {name}", { name: row.reviewed_by || "-" })}
                  {row.review_note ? ". " + t("Nota: {note}", { note: row.review_note }) : ""}
                </p>
              )}
              <div className="fb-toolbar" style={{ marginTop: 8 }}>
                {row.status === "recibida" && (
                  <HintButton size="sm" hint={GLOSSARY.fb_moderar} disabled={!canReview} disabledHint={noReview} onClick={() => { setCurrent(row); setNote(""); }}>
                    {t("Revisar y decidir")}
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
        width={640}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCurrent(null)} disabled={Boolean(saving)}>{t("Cancelar")}</Button>
            <HintButton
              variant="danger"
              onClick={() => decide("reject")}
              loading={saving === "reject"}
              disabled={!note.trim() || Boolean(saving)}
              hint={t("Rechazar la postulación. El motivo queda en la bitácora.")}
              disabledHint={t("Escriba el motivo del rechazo en la nota de revisión.")}
            >
              {t("Rechazar")}
            </HintButton>
            <HintButton onClick={() => decide("accept")} loading={saving === "accept"} disabled={Boolean(saving)} hint={GLOSSARY.fb_moderar}>
              {t("Aceptar y enviar a bandeja")}
            </HintButton>
          </>
        }
      >
        {current && (
          <>
            <SubmissionFields row={current} />
            <SubmissionCrossCheck row={current} canRun={canReview} onUpdated={replaceRow} toast={toast} />
            <Textarea id="submission-note" label={t("Nota de revisión (obligatoria si rechaza)")} value={note} onChange={(e) => setNote(e.target.value)} />
          </>
        )}
      </Modal>
    </div>
  );
}
