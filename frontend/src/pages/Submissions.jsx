import { useCallback, useEffect, useState } from "react";
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

const TONE = { recibida: "warning", aceptada: "success", rechazada: "danger" };
const TABS = [
  { key: "recibida", label: "Por moderar" },
  { key: "aceptada", label: "Aceptadas" },
  { key: "rechazada", label: "Rechazadas" },
  { key: "", label: "Todas" },
];

export default function Submissions() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
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
      toast.error(apiError(e, "No se pudieron cargar las postulaciones"));
    } finally {
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
          <button key={t.key || "todas"} type="button" className={filter === t.key ? "is-active" : ""} onClick={() => setFilter(t.key)}>
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
            <Card key={row.id} title={row.commercial_name} hint={`${row.inn_name} · ${row.submitter_org || row.submitter_email}`}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }} data-testid={`submission-${row.id}`}>
                <span title={GLOSSARY.fb_estado_postulacion}><Badge tone={TONE[row.status] || "neutral"}>{row.status}</Badge></span>
                {row.has_conflict ? (
                  <span title={GLOSSARY.coi}><Badge tone="warning">Declara conflicto de interés</Badge></span>
                ) : (
                  <span title={GLOSSARY.coi}><Badge tone="viewer">Sin conflicto declarado</Badge></span>
                )}
              </div>
              <p style={{ fontSize: 14, color: "#475569" }}>{row.indication}</p>
              <p style={{ fontSize: 13, color: "#64748B" }}>
                {row.development_phase} · {row.submitter_name} · {new Date(row.created_at).toLocaleString()}
              </p>
              {row.conflict_statement && (
                <p style={{ fontSize: 13, background: "#FEF3C7", padding: 10, borderRadius: 8 }}>{row.conflict_statement}</p>
              )}
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
        title={current ? `Revisar ${current.commercial_name}` : ""}
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
            <p style={{ fontSize: 14 }}>
              <strong>DCI:</strong> {current.inn_name}
              <br />
              <strong>Fabricante:</strong> {current.manufacturer}
              <br />
              <strong>Mecanismo:</strong> {current.mechanism}
              <br />
              <strong>Quien postula:</strong> {current.submitter_name} ({current.submitter_email}){current.submitter_org ? ` · ${current.submitter_org}` : ""}
            </p>
            {current.has_conflict && (
              <p style={{ fontSize: 13, background: "#FEF3C7", padding: 10, borderRadius: 8 }}>
                <strong>Conflicto declarado:</strong> {current.conflict_statement}
              </p>
            )}
            <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Evidencia</p>
            <ul style={{ fontSize: 13, overflowWrap: "anywhere" }}>
              {(current.evidence_links || []).map((lk) => (
                <li key={lk}>
                  <a href={lk} target="_blank" rel="noreferrer">{lk}</a>
                </li>
              ))}
            </ul>
            <Textarea id="submission-note" label="Nota de revisión (obligatoria si rechaza)" value={note} onChange={(e) => setNote(e.target.value)} />
          </>
        )}
      </Modal>
    </div>
  );
}
