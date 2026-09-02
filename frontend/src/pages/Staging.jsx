import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { apiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useCycle } from "../cycle/CycleContext";
import { useRealtime } from "../realtime/RealtimeContext";
import { useToast } from "../components/Toast";
import { Card, PageHeader } from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Icon from "../components/Icon";
import Modal from "../components/Modal";
import { Input, Select } from "../components/Field";
import EmptyState from "../components/EmptyState";
import { LoadingBlock } from "../components/Spinner";
import PhaseGuide, { ModuleStatsRow } from "../components/PhaseGuide";
import { CONDITION_LABELS, PERM } from "../constants/methodology";

/**
 * Bandeja de entrada del staging (RF04): senales capturadas que aun no
 * pertenecen a ningun ciclo. Antes de arrastrarlas hay que clasificarlas:
 * cluster y tipologia son obligatorios (regla de la fase 1).
 */
export default function Staging() {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [clusters, setClusters] = useState([]);
  const [types, setTypes] = useState([]);
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(() => new Set());
  const [filters, setFilters] = useState({ q: "", source_id: "", channel: "" });
  const [editing, setEditing] = useState(null);
  const [rawPreview, setRawPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [result, setResult] = useState(null);

  const { can } = useAuth();
  const { cycle, cycleId, reload: reloadCycles } = useCycle();
  const { version } = useRealtime();
  const toast = useToast();
  const navigate = useNavigate();

  const canWrite = can(PERM.TECHNOLOGY_WRITE);
  const canAssign = can(PERM.STAGING_ASSIGN);

  const load = useCallback(async () => {
    try {
      const params = {};
      if (filters.q) params.q = filters.q;
      if (filters.source_id) params.source_id = filters.source_id;
      if (filters.channel) params.channel = filters.channel;
      const [list, st] = await Promise.all([
        api.get("/technologies/staging", { params }),
        api.get("/technologies/staging/stats"),
      ]);
      setItems(list.data);
      setStats(st.data);
    } catch (e) {
      toast.error(apiError(e, "No se pudo cargar la bandeja de entrada"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  useEffect(() => {
    load();
  }, [load, version]);

  useEffect(() => {
    (async () => {
      try {
        const [c, t, s] = await Promise.all([
          api.get("/clusters"),
          api.get("/tech-types"),
          api.get("/sources"),
        ]);
        setClusters(c.data);
        setTypes(t.data);
        setSources(s.data);
      } catch {
        /* los catalogos no bloquean la vista */
      }
    })();
  }, []);

  const classifiable = useMemo(
    () => items.filter((i) => i.cluster_id && i.tech_type_id),
    [items]
  );

  const selectedReady = useMemo(
    () => [...selected].filter((id) => classifiable.some((i) => i.id === id)),
    [selected, classifiable]
  );

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => (prev.size === items.length ? new Set() : new Set(items.map((i) => i.id))));
  };

  const openEdit = async (item) => {
    setEditing({
      ...item,
      cluster_id: item.cluster_id || item.suggested_cluster_id || "",
      tech_type_id: item.tech_type_id || "",
      condition: item.condition || "",
    });
  };

  const applySuggestion = async () => {
    try {
      const { data } = await api.post(`/technologies/${editing.id}/suggest-classification`);
      setEditing((prev) => ({
        ...prev,
        cluster_id: data.cluster_id || prev.cluster_id,
        tech_type_id: data.tech_type_id || prev.tech_type_id,
        suggested_cluster_reason: data.cluster_reason,
      }));
      if (!data.cluster_id && !data.tech_type_id) {
        toast.info("El clasificador no encontro evidencia suficiente. Clasifique manualmente.");
      }
    } catch (e) {
      toast.error(apiError(e, "No se pudo generar la sugerencia"));
    }
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      await api.put(`/technologies/${editing.id}`, {
        commercial_name: editing.commercial_name,
        inn_name: editing.inn_name,
        manufacturer: editing.manufacturer,
        indication: editing.indication,
        cluster_id: editing.cluster_id ? Number(editing.cluster_id) : null,
        tech_type_id: editing.tech_type_id ? Number(editing.tech_type_id) : null,
        condition: editing.condition || null,
        regulatory_status: editing.regulatory_status,
        fda_approval_date: editing.fda_approval_date || null,
        ema_approval_date: editing.ema_approval_date || null,
        phase3_completion_date: editing.phase3_completion_date || null,
      });
      toast.success("Clasificacion guardada.");
      setEditing(null);
      await load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo guardar"));
    } finally {
      setSaving(false);
    }
  };

  const doAssign = async () => {
    setSaving(true);
    try {
      const { data } = await api.post("/technologies/assign-to-cycle", {
        technology_ids: [...selected],
        cycle_id: cycleId || null,
      });
      setResult(data);
      setAssignOpen(false);
      setSelected(new Set());
      await load();
      await reloadCycles();
      if (data.assigned) toast.success(`${data.assigned} senal(es) asignadas a ${data.cycle_code}.`);
    } catch (e) {
      toast.error(apiError(e, "No se pudo asignar al ciclo"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingBlock label="Cargando bandeja de entrada..." />;

  return (
    <div>
      <PageHeader
        title="Bandeja de entrada"
        subtitle="Staging de senales capturadas que aun no pertenecen a ningun ciclo. Clasifique cluster y tipologia, y arrastre por lotes al ciclo activo."
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant="secondary" onClick={() => navigate("/postulaciones")}>
              <Icon name="note" size={16} /> Postulaciones
            </Button>
            {canAssign && (
              <Button
                onClick={() => setAssignOpen(true)}
                disabled={selected.size === 0 || !cycleId}
              >
                <Icon name="layers" size={17} /> Asignar {selected.size || ""} al ciclo
              </Button>
            )}
          </div>
        }
      />

      <PhaseGuide
        phase="Fase 1 · Identificacion"
        tasks={[
          "Revise las senales capturadas por vigilancia y por el canal reactivo.",
          "Confirme cluster y tipologia: son obligatorios para entrar al ciclo.",
          "Seleccione por lotes y arrastre al ciclo activo.",
        ]}
        nextLabel="Priorizacion"
        onNext={() => navigate("/priorizacion")}
      />

      {stats && (
        <ModuleStatsRow
          items={[
            { label: "Sin asignar", value: stats.unassigned, color: "#4F46E5" },
            { label: "Total capturadas", value: stats.total },
            {
              label: "Sin cluster",
              value: stats.without_cluster,
              color: stats.without_cluster ? "#D97706" : undefined,
              sub: "Bloquea la asignacion",
            },
            {
              label: "Sin tipologia",
              value: stats.without_tech_type,
              color: stats.without_tech_type ? "#D97706" : undefined,
              sub: "Bloquea la asignacion",
            },
            { label: "Listas para asignar", value: classifiable.length, color: "#059669" },
          ]}
        />
      )}

      {!cycleId && (
        <Card style={{ marginBottom: 18, background: "#FEF3C7", borderColor: "#FDE68A" }}>
          <div style={{ fontSize: 14, color: "#92400E" }}>
            <strong>No hay un ciclo seleccionado.</strong> Cree o seleccione un ciclo en{" "}
            <a href="/ciclos" style={{ color: "#92400E", fontWeight: 700 }}>
              Ciclos de escaneo
            </a>{" "}
            para poder arrastrar senales.
          </div>
        </Card>
      )}

      <Card style={{ marginBottom: 18 }} padding={16}>
        <div className="staging-filters">
          <Input
            placeholder="Buscar por nombre, DCI o resumen..."
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            style={{ marginBottom: 0 }}
          />
          <Select
            value={filters.source_id}
            onChange={(e) => setFilters({ ...filters, source_id: e.target.value })}
            style={{ marginBottom: 0 }}
          >
            <option value="">Todas las fuentes</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </Select>
          <Select
            value={filters.channel}
            onChange={(e) => setFilters({ ...filters, channel: e.target.value })}
            style={{ marginBottom: 0 }}
          >
            <option value="">Todos los canales</option>
            <option value="proactiva">Busqueda proactiva</option>
            <option value="reactiva">Postulacion reactiva</option>
          </Select>
        </div>
      </Card>

      {result && result.rejected?.length > 0 && (
        <Card style={{ marginBottom: 18, background: "#FEF2F2", borderColor: "#FECACA" }}>
          <div style={{ fontSize: 14, color: "#991B1B", fontWeight: 600, marginBottom: 6 }}>
            {result.rejected.length} senal(es) no se pudieron asignar
          </div>
          <ul style={{ fontSize: 13, color: "#7F1D1D", paddingLeft: 18 }}>
            {result.rejected.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </Card>
      )}

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon="📥"
            title="La bandeja esta vacia"
            message="Ejecute la vigilancia para capturar senales nuevas desde los referentes internacionales."
            action={<Button onClick={() => navigate("/vigilancia")}>Ir a vigilancia</Button>}
          />
        </Card>
      ) : (
        <Card padding={0}>
          <table className="staging-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <input
                    type="checkbox"
                    checked={selected.size === items.length && items.length > 0}
                    onChange={toggleAll}
                    aria-label="Seleccionar todo"
                  />
                </th>
                <th>Senal</th>
                <th>Cluster</th>
                <th>Tipologia</th>
                <th>Condicion</th>
                <th>Cribado</th>
                <th style={{ width: 110 }}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const ready = Boolean(item.cluster_id && item.tech_type_id);
                return (
                  <tr key={item.id} className={selected.has(item.id) ? "row-selected" : ""}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(item.id)}
                        onChange={() => toggle(item.id)}
                        aria-label={`Seleccionar ${item.commercial_name}`}
                      />
                    </td>
                    <td>
                      <div className="staging-name">{item.commercial_name || item.inn_name}</div>
                      <div className="staging-meta">
                        {item.source_title || "Sin fuente"} ·{" "}
                        {new Date(item.captured_at).toLocaleDateString()} ·{" "}
                        {item.source_channel === "reactiva" ? "Reactiva" : "Proactiva"}
                      </div>
                    </td>
                    <td>
                      {item.cluster_name ? (
                        <Badge tone="info">{item.cluster_name}</Badge>
                      ) : item.suggested_cluster_name ? (
                        <span className="staging-suggestion">
                          Sugerido: {item.suggested_cluster_name}
                        </span>
                      ) : (
                        <span className="staging-missing">Sin clasificar</span>
                      )}
                    </td>
                    <td>
                      {item.tech_type_name || <span className="staging-missing">Sin clasificar</span>}
                    </td>
                    <td>
                      {item.condition ? (
                        <Badge tone={item.condition}>{item.condition}</Badge>
                      ) : (
                        <span className="staging-missing">—</span>
                      )}
                    </td>
                    <td>
                      <span className="staging-score">{item.screening_score}</span>
                    </td>
                    <td>
                      {canWrite && (
                        <Button variant="ghost" size="sm" onClick={() => openEdit(item)}>
                          {ready ? "Editar" : "Clasificar"}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="Clasificar senal"
        width={640}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button onClick={saveEdit} loading={saving}>
              Guardar clasificacion
            </Button>
          </>
        }
      >
        {editing && (
          <>
            <div style={{ marginBottom: 14 }}>
              <Button variant="outline" size="sm" onClick={applySuggestion}>
                <Icon name="pulse" size={15} /> Sugerir clasificacion
              </Button>
              {editing.suggested_cluster_reason && (
                <div style={{ fontSize: 12, color: "#64748B", marginTop: 6 }}>
                  {editing.suggested_cluster_reason}
                </div>
              )}
            </div>

            <Input
              label="Nombre comercial"
              value={editing.commercial_name || ""}
              onChange={(e) => setEditing({ ...editing, commercial_name: e.target.value })}
            />
            <Input
              label="Denominacion comun internacional (DCI)"
              value={editing.inn_name || ""}
              onChange={(e) => setEditing({ ...editing, inn_name: e.target.value })}
            />
            <Input
              label="Fabricante"
              value={editing.manufacturer || ""}
              onChange={(e) => setEditing({ ...editing, manufacturer: e.target.value })}
            />
            <Input
              label="Indicacion / patologia"
              value={editing.indication || ""}
              onChange={(e) => setEditing({ ...editing, indication: e.target.value })}
            />

            <Select
              label="Cluster de salud"
              required
              value={editing.cluster_id || ""}
              onChange={(e) => setEditing({ ...editing, cluster_id: e.target.value })}
            >
              <option value="">Seleccione un cluster...</option>
              {clusters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>

            <Select
              label="Tipologia tecnologica"
              required
              value={editing.tech_type_id || ""}
              onChange={(e) => setEditing({ ...editing, tech_type_id: e.target.value })}
            >
              <option value="">Seleccione una tipologia...</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>

            <Select
              label="Condicion de la tecnologia"
              value={editing.condition || ""}
              onChange={(e) => setEditing({ ...editing, condition: e.target.value })}
            >
              <option value="">Sin definir</option>
              {Object.entries(CONDITION_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>

            <div className="form-two-col">
              <Input
                label="Aprobacion FDA"
                type="date"
                value={editing.fda_approval_date || ""}
                onChange={(e) => setEditing({ ...editing, fda_approval_date: e.target.value })}
              />
              <Input
                label="Aprobacion EMA"
                type="date"
                value={editing.ema_approval_date || ""}
                onChange={(e) => setEditing({ ...editing, ema_approval_date: e.target.value })}
              />
            </div>
            <div className="form-two-col">
              <Input
                label="Fin de fase III"
                type="date"
                value={editing.phase3_completion_date || ""}
                onChange={(e) => setEditing({ ...editing, phase3_completion_date: e.target.value })}
              />
              <Input
                label="Estado regulatorio"
                placeholder="Sometido a FDA, en revision EMA..."
                value={editing.regulatory_status || ""}
                onChange={(e) => setEditing({ ...editing, regulatory_status: e.target.value })}
              />
            </div>
            <p style={{ fontSize: 12, color: "#64748B" }}>
              Las fechas alimentan el pre-llenado de los criterios P1, P5 y P6 y el calculo de
              time-to-market.
            </p>
            {editing.has_raw && (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    const { data } = await api.get(`/ingest/raw/${editing.id}`);
                    setRawPreview(data);
                  } catch (err) {
                    toast.error(apiError(err, "No se pudo abrir el crudo"));
                  }
                }}
              >
                Ver senal original (RF03)
              </Button>
            )}
            {rawPreview && rawPreview.technology_id === editing.id && (
              <pre className="raw-preview">
                {JSON.stringify(rawPreview.payload, null, 2).slice(0, 4000)}
              </pre>
            )}
          </>
        )}
      </Modal>

      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title="Asignar al ciclo"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAssignOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={doAssign} loading={saving} disabled={selectedReady.length === 0}>
              Asignar {selectedReady.length}
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 14, color: "#475569" }}>
          Se asignaran <strong>{selectedReady.length}</strong> de {selected.size} senal(es)
          seleccionadas al ciclo <strong>{cycle?.code}</strong>.
        </p>
        {selected.size > selectedReady.length && (
          <div
            style={{
              background: "#FEF3C7",
              border: "1px solid #FDE68A",
              borderRadius: 8,
              padding: 12,
              marginTop: 12,
              fontSize: 13,
              color: "#92400E",
            }}
          >
            {selected.size - selectedReady.length} senal(es) quedan fuera porque les falta cluster o
            tipologia. La metodologia exige ambos antes de entrar al ciclo.
          </div>
        )}
      </Modal>
    </div>
  );
}
