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
import { LoadingBlock } from "../components/Spinner";
import { PERM } from "../constants/methodology";
import { GLOSSARY } from "../constants/glossary";

const TONE = { recibida: "warning", aceptada: "ok", rechazada: "error" };
const STATUS_LABEL = { recibida: "Por moderar", aceptada: "Aceptada", rechazada: "Rechazada" };
const TABS = [
  { key: "recibida", label: "Por moderar" },
  { key: "aceptada", label: "Aceptadas" },
  { key: "rechazada", label: "Rechazadas" },
  { key: "", label: "Todas" },
];

const submissionName = (row) => row.commercial_name || row.inn_name || `Postulación #${row.id}`;

const show = (value) => (value && String(value).trim() ? value : "—");

function SubmissionFields({ row }) {
  const links = row.evidence_links || [];
  return (
    <div style={{ fontSize: 13.5, color: "#334155" }} data-testid={`submission-fields-${row.id}`}>
      <p style={{ fontSize: 13, fontWeight: 600, margin: "4px 0" }}>Datos obligatorios</p>
      <p style={{ margin: "0 0 8px" }}>
        <strong>Nombre comercial:</strong> {show(row.commercial_name)}
        <br />
        <strong>DCI:</strong> {show(row.inn_name)}
        <br />
        <strong>Indicación propuesta:</strong> {show(row.indication)}
      </p>
      <p style={{ fontSize: 13, fontWeight: 600, margin: "4px 0" }}>Fuente de información</p>
      {links.length ? (
        <ul style={{ fontSize: 13, overflowWrap: "anywhere", margin: "0 0 8px" }}>
          {links.map((lk) => (
            <li key={lk}>
              <a href={lk} target="_blank" rel="noreferrer">{lk}</a>
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ margin: "0 0 8px" }}>—</p>
      )}
      <p style={{ fontSize: 13, fontWeight: 600, margin: "4px 0" }}>Información complementaria</p>
      <p style={{ margin: "0 0 8px" }}>
        <strong>Fabricante o desarrollador:</strong> {show(row.manufacturer)}
        <br />
        <strong>Fase de desarrollo:</strong> {show(row.development_phase)}
        <br />
        <strong>Mecanismo de acción:</strong> {show(row.mechanism)}
      </p>
      <p style={{ fontSize: 13, fontWeight: 600, margin: "4px 0" }}>Quien postula</p>
      <p style={{ margin: "0 0 8px" }}>
        <strong>Nombre:</strong> {show(row.submitter_name)}
        <br />
        <strong>Correo:</strong> {show(row.submitter_email)}
        <br />
        <strong>Organización:</strong> {show(row.submitter_org)}
        <br />
        <strong>Recibida:</strong> {row.created_at ? new Date(row.created_at).toLocaleString() : "—"}
      </p>
      <p style={{ fontSize: 13, background: row.has_conflict ? "#FEF3C7" : "#F1F5F9", padding: 10, borderRadius: 8 }}>
        <strong>Conflicto de interés:</strong>{" "}
        {row.has_conflict ? show(row.conflict_statement) : "No declara conflicto (declaración firmada)."}
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
  const noReview = `Su perfil (${user?.role_label || user?.role}) puede consultar la cola pero no moderarla (permiso staging:assign).`;

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/submissions", { params: { status: filter || undefined } });
      setRows(data);
    } catch (e) {
      if (firstLoad.current) toast.error(apiError(e, "No se pudieron cargar las postulaciones"));
    } finally {
      firstLoad.current = false;
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  useEffect(() => {
    load();
  }, [load, version]);

  useEffect(() => {
    api.get("/public/submissions/config").then(({ data }) => setPortal(data)).catch(() => setPortal(null));
  }, []);

  const decide = async (action) => {
    if (!current) return;
    if (action === "reject" && !note.trim()) {
      toast.error("El rechazo exige un motivo visible para la bitácora.");
      return;
    }
    setSaving(action);
    try {
      const { data } = await api.post(`/submissions/${current.id}/${action}`, { note });
      if (action === "accept") toast.success(`Postulación aceptada: quedó en la bandeja de entrada como señal reactiva (tecnología #${data.technology_id}).`);
      else toast.success("Postulación rechazada. El motivo quedó registrado.");
      setCurrent(null);
      setNote("");
      await load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo resolver la postulación"));
    } finally {
      setSaving(null);
    }
  };

  const copyPortal = async () => {
    const url = `${window.location.origin}/postular`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Enlace del formulario público copiado");
    } catch {
      toast.info(url);
    }
  };

  if (loading) return <LoadingBlock label="Cargando postulaciones..." />;

  return (
    <div>
      <PageHeader
        title="Postulaciones reactivas"
        titleHint={GLOSSARY.postulacion}
        subtitle="Cola de moderación del canal público. Nada entra al staging sin revisión humana y declaración de conflicto de interés."
        actions={
          <>
            <HintButton variant="secondary" hint="Copiar el enlace del formulario público /postular para compartirlo" onClick={copyPortal}>
              <Icon name="link" size={16} /> Enlace del formulario
            </HintButton>
            <Button variant="secondary" onClick={() => navigate("/bandeja-entrada")}>
              <Icon name="inbox" size={16} /> Bandeja de entrada
            </Button>
          </>
        }
      />

      {portal && (
        <div className={`fb-public-note${portal.recaptcha_enabled ? " is-ok" : ""}`} data-testid="captcha-mode">
          <strong>Anti-robot del formulario: {portal.recaptcha_enabled ? "reCAPTCHA activo" : portal.mode === "incompleto" ? "configuración incompleta" : "modo degradado"}.</strong>{" "}
          {portal.message} <InfoTip text={GLOSSARY.fb_recaptcha} label="Qué es reCAPTCHA" />
        </div>
      )}

      {!canReview && (
        <div className="fb-readonly-note">
          <Icon name="info" size={16} />
          <span>Modo consulta: {noReview}</span>
        </div>
      )}

      <div className="screening-tabs" style={{ marginBottom: 16, display: "flex", alignItems: "center", flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button
            key={t.key || "todas"}
            type="button"
            className={`screening-tab${filter === t.key ? " is-active" : ""}`}
            aria-pressed={filter === t.key}
            onClick={() => setFilter(t.key)}
          >
            {t.label}
          </button>
        ))}
        <InfoTip text={GLOSSARY.fb_estado_postulacion} label="Qué significa cada estado" />
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon="📬"
            title="No hay postulaciones en este filtro"
            message="El formulario público vive en /postular. Las que lleguen aparecen aquí como 'por moderar'."
            action={<Button variant="secondary" onClick={copyPortal}>Copiar enlace del formulario</Button>}
          />
        </Card>
      ) : (
        <div className="merge-list">
          {rows.map((row) => (
            <Card key={row.id} title={submissionName(row)} hint={`${row.inn_name || "—"} · ${row.submitter_org || row.submitter_email}`}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }} data-testid={`submission-${row.id}`}>
                <span title={GLOSSARY.fb_estado_postulacion}><Badge tone={TONE[row.status] || "neutral"}>{STATUS_LABEL[row.status] || row.status}</Badge></span>
                {row.has_conflict ? (
                  <span title={GLOSSARY.coi}><Badge tone="warning">Declara conflicto de interés</Badge></span>
                ) : (
                  <span title={GLOSSARY.coi}><Badge tone="viewer">Sin conflicto declarado</Badge></span>
                )}
              </div>
              <SubmissionFields row={row} />
              {row.status !== "recibida" && (
                <p style={{ fontSize: 12.5, color: "#64748B" }}>
                  {row.status === "aceptada" ? "Aceptada" : "Rechazada"} por {row.reviewed_by || "—"}
                  {row.reviewed_at ? ` el ${new Date(row.reviewed_at).toLocaleString()}` : ""}
                  {row.review_note ? `. Nota: ${row.review_note}` : ""}
                </p>
              )}
              <div className="fb-toolbar" style={{ marginTop: 8 }}>
                {row.status === "recibida" && (
                  <HintButton size="sm" hint={GLOSSARY.fb_moderar} disabled={!canReview} disabledHint={noReview} onClick={() => { setCurrent(row); setNote(""); }}>
                    Revisar y decidir
                  </HintButton>
                )}
                {row.status === "aceptada" && row.technology_id && (
                  <Button size="sm" variant="ghost" onClick={() => navigate("/bandeja-entrada")}>
                    Ver en la bandeja (#{row.technology_id})
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
        title={current ? `Revisar ${submissionName(current)}` : ""}
        width={640}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCurrent(null)} disabled={Boolean(saving)}>Cancelar</Button>
            <HintButton
              variant="danger"
              onClick={() => decide("reject")}
              loading={saving === "reject"}
              disabled={!note.trim() || Boolean(saving)}
              hint="Rechazar la postulación. El motivo queda en la bitácora."
              disabledHint="Escriba el motivo del rechazo en la nota de revisión."
            >
              Rechazar
            </HintButton>
            <HintButton onClick={() => decide("accept")} loading={saving === "accept"} disabled={Boolean(saving)} hint={GLOSSARY.fb_moderar}>
              Aceptar y enviar a bandeja
            </HintButton>
          </>
        }
      >
        {current && (
          <>
            <SubmissionFields row={current} />
            <Textarea id="submission-note" label="Nota de revisión (obligatoria si rechaza)" value={note} onChange={(e) => setNote(e.target.value)} />
          </>
        )}
      </Modal>
    </div>
  );
}
