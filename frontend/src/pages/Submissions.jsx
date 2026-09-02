import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { apiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useRealtime } from "../realtime/RealtimeContext";
import { useToast } from "../components/Toast";
import { Card, PageHeader } from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Icon from "../components/Icon";
import Modal from "../components/Modal";
import { Textarea } from "../components/Field";
import EmptyState from "../components/EmptyState";
import { LoadingBlock } from "../components/Spinner";
import { PERM } from "../constants/methodology";

const TONE = { recibida: "warning", aceptada: "success", rechazada: "danger" };

export default function Submissions() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("recibida");
  const [current, setCurrent] = useState(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const { can } = useAuth();
  const { version } = useRealtime();
  const toast = useToast();
  const navigate = useNavigate();
  const canReview = can(PERM.STAGING_ASSIGN);

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

  const decide = async (action) => {
    if (!current) return;
    if (action === "reject" && !note.trim()) {
      toast.error("El rechazo exige un motivo.");
      return;
    }
    setSaving(true);
    try {
      await api.post(`/submissions/${current.id}/${action}`, { note });
      toast.success(action === "accept" ? "Postulacion aceptada. Quedo en la bandeja." : "Postulacion rechazada.");
      setCurrent(null);
      setNote("");
      await load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo resolver la postulacion"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingBlock label="Cargando postulaciones..." />;

  return (
    <div>
      <PageHeader
        title="Postulaciones reactivas"
        subtitle="Cola de moderacion del canal publico. Nada entra al staging sin revision humana y declaracion de conflicto de interes."
        actions={
          <Button variant="secondary" onClick={() => navigate("/bandeja-entrada")}>
            <Icon name="inbox" size={16} /> Bandeja de entrada
          </Button>
        }
      />

      <div className="screening-tabs" style={{ marginBottom: 16 }}>
        {["recibida", "aceptada", "rechazada", ""].map((key) => (
          <button
            key={key || "todas"}
            type="button"
            className={filter === key ? "is-active" : ""}
            onClick={() => setFilter(key)}
          >
            {key ? key : "Todas"}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon="📬"
            title="No hay postulaciones en este filtro"
            message="El formulario publico vive en /postular. Las que lleguen aparecen aqui como recibidas."
          />
        </Card>
      ) : (
        <div className="merge-list">
          {rows.map((row) => (
            <Card key={row.id} title={row.commercial_name} hint={`${row.inn_name} · ${row.submitter_org || row.submitter_email}`}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                <Badge tone={TONE[row.status] || "neutral"}>{row.status}</Badge>
                {row.has_conflict && <Badge tone="warning">Declara conflicto</Badge>}
              </div>
              <p style={{ fontSize: 14, color: "#475569" }}>{row.indication}</p>
              <p style={{ fontSize: 13, color: "#64748B" }}>
                {row.development_phase} · {row.submitter_name} ·{" "}
                {new Date(row.created_at).toLocaleString()}
              </p>
              {row.conflict_statement && (
                <p style={{ fontSize: 13, background: "#FEF3C7", padding: 10, borderRadius: 8 }}>
                  {row.conflict_statement}
                </p>
              )}
              {canReview && row.status === "recibida" && (
                <Button size="sm" onClick={() => setCurrent(row)} style={{ marginTop: 8 }}>
                  Revisar
                </Button>
              )}
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
            <Button variant="secondary" onClick={() => setCurrent(null)}>
              Cancelar
            </Button>
            <Button variant="secondary" onClick={() => decide("reject")} loading={saving}>
              Rechazar
            </Button>
            <Button onClick={() => decide("accept")} loading={saving}>
              Aceptar y enviar a bandeja
            </Button>
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
            </p>
            <ul style={{ fontSize: 13 }}>
              {(current.evidence_links || []).map((lk) => (
                <li key={lk}>
                  <a href={lk} target="_blank" rel="noreferrer">
                    {lk}
                  </a>
                </li>
              ))}
            </ul>
            <Textarea
              label="Nota de revision (obligatoria si rechaza)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </>
        )}
      </Modal>
    </div>
  );
}
