import { useCallback, useEffect, useMemo, useState } from "react";
import api, { apiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useCycle } from "../cycle/CycleContext";
import { useRealtime } from "../realtime/RealtimeContext";
import { useToast } from "../components/Toast";
import { Card, PageHeader } from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Icon from "../components/Icon";
import { Input, Select, Textarea } from "../components/Field";
import EmptyState from "../components/EmptyState";
import { LoadingBlock } from "../components/Spinner";
import PhaseGuide, { ModuleStatsRow } from "../components/PhaseGuide";
import { downloadFromApi } from "../utils/download";
import { PERM, TECH_STATUS_LABELS } from "../constants/methodology";

/**
 * Fase 3 del plan: depuracion del acervo del ciclo.
 *
 * Reune las tres funciones del modulo 2 en una sola pantalla porque en la
 * operacion son un mismo gesto: se limpian duplicados, se verifica que la
 * tecnologia sea nueva para el pais y se consolida el Listado Unico.
 */

const TABS = [
  { key: "duplicados", label: "Duplicados", icon: "layers" },
  { key: "novedad", label: "Novedad y registro sanitario", icon: "shield" },
  { key: "listado", label: "Listado unico", icon: "list" },
];

function pct(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function techLabel(tech) {
  if (!tech) return "—";
  return tech.inn_name || tech.commercial_name || `Tecnologia #${tech.id}`;
}

/** Ficha de un registro dentro de una propuesta de fusion. */
function MergeCandidate({ tech, selected, onSelect, disabled }) {
  if (!tech) return <div className="merge-card">Registro no disponible</div>;
  return (
    <div className={`merge-card${selected ? " is-selected" : ""}`}>
      <div className="merge-card-head">
        <strong>{techLabel(tech)}</strong>
        <Badge tone="info">#{tech.id}</Badge>
      </div>
      <dl className="merge-fields">
        {tech.commercial_name && (
          <>
            <dt>Comercial</dt>
            <dd>{tech.commercial_name}</dd>
          </>
        )}
        {tech.manufacturer && (
          <>
            <dt>Fabricante</dt>
            <dd>{tech.manufacturer}</dd>
          </>
        )}
        {tech.atc_code && (
          <>
            <dt>ATC</dt>
            <dd>{tech.atc_code}</dd>
          </>
        )}
        {tech.nct_ids?.length > 0 && (
          <>
            <dt>Ensayos</dt>
            <dd>{tech.nct_ids.join(", ")}</dd>
          </>
        )}
        {tech.cluster_name && (
          <>
            <dt>Cluster</dt>
            <dd>{tech.cluster_name}</dd>
          </>
        )}
        {tech.source_name && (
          <>
            <dt>Fuente</dt>
            <dd>{tech.source_name}</dd>
          </>
        )}
        <dt>Estado</dt>
        <dd>{tech.status}</dd>
      </dl>
      <Button
        variant={selected ? "primary" : "secondary"}
        size="sm"
        disabled={disabled}
        onClick={onSelect}
        style={{ width: "100%" }}
      >
        {selected ? "Se conserva este" : "Conservar este"}
      </Button>
    </div>
  );
}

/** Desglose de los tres algoritmos, para que la propuesta sea explicable. */
function MatchEvidence({ proposal }) {
  const name = proposal.detail?.nombre;
  const manufacturer = proposal.detail?.fabricante;
  return (
    <div className="merge-evidence">
      {proposal.decisive ? (
        <p className="merge-evidence-decisive">
          Ambos registros comparten el ensayo clinico{" "}
          <strong>{(proposal.detail?.nct || []).join(", ")}</strong>. No es un parecido
          de nombres: es el mismo desarrollo.
        </p>
      ) : (
        <>
          {name && (
            <div className="merge-metrics">
              <span>
                Levenshtein <strong>{name.levenshtein}</strong>
              </span>
              <span>
                Jaro-Winkler <strong>{name.jaro_winkler}</strong>
              </span>
              <span>
                Token sorting <strong>{name.token_sort}</strong>
              </span>
            </div>
          )}
          {manufacturer && (
            <div className="merge-metrics">
              <span>
                Fabricante <strong>{manufacturer.token_set}</strong>
              </span>
            </div>
          )}
        </>
      )}
      <div className="merge-signals">
        {(proposal.matched_on || []).map((tag) => (
          <Badge key={tag} tone={tag === "fabricante_discrepante" ? "warning" : "info"}>
            {tag.replace(/_/g, " ")}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function DuplicatesTab({ canWrite, onChanged }) {
  const { cycleId } = useCycle();
  const toast = useToast();
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [choice, setChoice] = useState({});
  const [notes, setNotes] = useState({});
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/screening/merges", {
        params: { status: "propuesta", limit: 50 },
      });
      setProposals(data);
      setChoice((prev) => {
        const next = { ...prev };
        data.forEach((p) => {
          if (!next[p.id]) next[p.id] = p.technology_a_id;
        });
        return next;
      });
    } catch (e) {
      toast.error(apiError(e, "No se pudieron cargar las propuestas de fusion"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const scan = async () => {
    setScanning(true);
    try {
      const { data } = await api.post("/screening/merges/scan", null, {
        params: cycleId ? { cycle_id: cycleId } : {},
      });
      toast.success(
        `Barrido con umbral ${data.threshold}%: ${data.detected} pares detectados, ` +
          `${data.created} propuestas nuevas.`
      );
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(apiError(e, "No se pudo ejecutar el barrido"));
    } finally {
      setScanning(false);
    }
  };

  const resolve = async (proposal, action) => {
    setBusyId(proposal.id);
    try {
      if (action === "confirm") {
        await api.post(`/screening/merges/${proposal.id}/confirm`, {
          keep_technology_id: choice[proposal.id],
          note: notes[proposal.id] || "",
        });
        toast.success("Registros fusionados. El absorbido queda trazado, no borrado.");
      } else {
        await api.post(`/screening/merges/${proposal.id}/discard`, {
          note: notes[proposal.id] || "",
        });
        toast.success("Propuesta descartada. El motor no volvera a proponerla.");
      }
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(apiError(e, "No se pudo resolver la propuesta"));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <LoadingBlock label="Cargando propuestas de fusion..." />;

  return (
    <>
      <Card
        title="Deteccion de duplicados"
        hint="El hash exacto solo atrapa la misma pagina traida dos veces. La misma tecnologia llega con nombres distintos segun la fuente, y ese es el duplicado que contamina el Listado Unico."
        padding={18}
        style={{ marginBottom: 18 }}
        actions={
          canWrite && (
            <Button onClick={scan} loading={scanning}>
              <Icon name="refresh" size={16} /> Ejecutar barrido
            </Button>
          )
        }
      >
        <p className="muted-note">
          El sistema propone; una persona confirma. Ninguna fusion es automatica y todas
          quedan en la bitacora con su autor.
        </p>
      </Card>

      {proposals.length === 0 ? (
        <EmptyState
          icon="✅"
          title="Sin duplicados pendientes"
          message="No hay pares por revisar. Ejecute el barrido despues de asignar nuevas senales al ciclo."
        />
      ) : (
        proposals.map((proposal) => (
          <Card key={proposal.id} padding={18} style={{ marginBottom: 16 }}>
            <div className="merge-head">
              <div>
                <Badge tone={proposal.decisive ? "priorizada" : "asignada_a_ciclo"}>
                  {proposal.decisive ? "Mismo ensayo clinico" : `Similitud ${pct(proposal.score)}`}
                </Badge>
              </div>
              <span className="muted-note">Propuesta #{proposal.id}</span>
            </div>

            <MatchEvidence proposal={proposal} />

            <div className="merge-pair">
              <MergeCandidate
                tech={proposal.technology_a}
                selected={choice[proposal.id] === proposal.technology_a_id}
                disabled={!canWrite}
                onSelect={() =>
                  setChoice((p) => ({ ...p, [proposal.id]: proposal.technology_a_id }))
                }
              />
              <MergeCandidate
                tech={proposal.technology_b}
                selected={choice[proposal.id] === proposal.technology_b_id}
                disabled={!canWrite}
                onSelect={() =>
                  setChoice((p) => ({ ...p, [proposal.id]: proposal.technology_b_id }))
                }
              />
            </div>

            {canWrite && (
              <>
                <Input
                  placeholder="Nota de la decision (opcional)"
                  value={notes[proposal.id] || ""}
                  onChange={(e) => setNotes((p) => ({ ...p, [proposal.id]: e.target.value }))}
                  style={{ marginBottom: 10 }}
                />
                <div className="merge-actions">
                  <Button
                    onClick={() => resolve(proposal, "confirm")}
                    loading={busyId === proposal.id}
                  >
                    Fusionar y conservar #{choice[proposal.id]}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => resolve(proposal, "discard")}
                    disabled={busyId === proposal.id}
                  >
                    Son distintas
                  </Button>
                </div>
              </>
            )}
          </Card>
        ))
      )}
    </>
  );
}

function InvimaPanel({ canSync, onChanged }) {
  const toast = useToast();
  const [status, setStatus] = useState(null);
  const [syncs, setSyncs] = useState([]);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const [s, h] = await Promise.all([
        api.get("/invima/status"),
        api.get("/invima/syncs", { params: { limit: 5 } }),
      ]);
      setStatus(s.data);
      setSyncs(h.data);
    } catch (e) {
      toast.error(apiError(e, "No se pudo consultar el indice del INVIMA"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const syncOnline = async () => {
    setBusy("online");
    try {
      const { data } = await api.post("/invima/sync");
      if (data.status === "error") {
        toast.error(data.message);
      } else {
        toast.success(
          `Indice actualizado: ${data.rows_ingested} nuevos, ${data.rows_updated} actualizados.`
        );
      }
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(apiError(e, "No se pudo sincronizar"));
    } finally {
      setBusy("");
    }
  };

  const uploadFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy("file");
    const form = new FormData();
    form.append("file", file);
    try {
      const { data } = await api.post("/invima/sync/file", form);
      if (data.status === "error") toast.error(data.message);
      else toast.success(`${data.rows_ingested} registros cargados desde el archivo.`);
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(apiError(e, "No se pudo cargar el archivo"));
    } finally {
      setBusy("");
      event.target.value = "";
    }
  };

  if (!status) return <LoadingBlock label="Consultando el indice..." />;

  return (
    <Card
      title="Indice local de registros sanitarios"
      hint="La verificacion responde contra una copia local y no contra el servicio en linea: es la unica forma de sostener el tiempo de respuesta y de seguir filtrando si la fuente no esta disponible."
      padding={18}
      style={{ marginBottom: 18 }}
    >
      {status.warning && (
        <div className={`invima-alert${status.total_records === 0 ? " is-empty" : ""}`}>
          <Icon name="alert" />
          <span>{status.warning}</span>
        </div>
      )}

      <ModuleStatsRow
        items={[
          { label: "Registros", value: status.total_records.toLocaleString("es-CO") },
          {
            label: "Antiguedad",
            value: status.age_days === null ? "—" : `${status.age_days} d`,
            sub: `Maximo ${status.stale_after_days} d`,
            color: status.stale ? "#EF4444" : "#059669",
          },
          {
            label: "Ultima sincronizacion",
            value: status.last_source || "—",
            sub: status.last_status || "sin ejecutar",
          },
        ]}
      />

      {canSync && (
        <div className="invima-actions">
          <Button onClick={syncOnline} loading={busy === "online"}>
            <Icon name="refresh" size={16} /> Sincronizar desde datos.gov.co
          </Button>
          <label className="invima-upload">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={uploadFile}
              disabled={busy === "file"}
            />
            <span>{busy === "file" ? "Cargando..." : "Cargar archivo plano (CSV)"}</span>
          </label>
        </div>
      )}
      <p className="muted-note">
        La carga de archivo plano es la ruta de contingencia prevista mientras no se
        acuerde con el INVIMA el acceso estructurado al dato.
      </p>

      {syncs.length > 0 && (
        <table className="invima-syncs">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Origen</th>
              <th>Estado</th>
              <th>Filas</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            {syncs.map((s) => (
              <tr key={s.id}>
                <td>{new Date(s.started_at).toLocaleString()}</td>
                <td>{s.source}</td>
                <td>
                  <Badge tone={s.status === "ok" ? "priorizada" : "warning"}>{s.status}</Badge>
                </td>
                <td>
                  {s.rows_ingested} / {s.rows_updated}
                </td>
                <td className="invima-message">{s.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function NoveltyTab({ canWrite, canSync, onChanged }) {
  const { cycleId, isClosed } = useCycle();
  const toast = useToast();
  const [queue, setQueue] = useState([]);
  const [options, setOptions] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState({ option_code: "", justification: "" });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    if (!cycleId) {
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get("/technologies", {
        params: { cycle_id: cycleId, cycle_status: "asignada_a_ciclo", limit: 200 },
      });
      setQueue(data);
      setActiveId((current) =>
        current && data.some((t) => t.id === current) ? current : data[0]?.id || null
      );
    } catch (e) {
      toast.error(apiError(e, "No se pudo cargar la cola de filtrado"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api
      .get("/screening/novelty/options")
      .then(({ data }) => setOptions(data))
      .catch(() => {});
  }, []);

  const loadDetail = useCallback(async () => {
    if (!cycleId || !activeId) {
      setDetail(null);
      return;
    }
    try {
      const { data } = await api.get(`/screening/novelty/${cycleId}/${activeId}`);
      setDetail(data);
      setForm({ option_code: data.option_code || "", justification: data.justification || "" });
    } catch (e) {
      toast.error(apiError(e, "No se pudo cargar la verificacion de novedad"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleId, activeId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const selectedOption = options.find((o) => o.code === form.option_code);
  const needsJustification = Boolean(selectedOption?.requires_justification);

  const runCheck = async () => {
    setBusy("check");
    try {
      const { data } = await api.post(`/screening/novelty/${cycleId}/${activeId}/invima-check`);
      setDetail(data);
      toast.success(
        data.has_valid_registry
          ? "El INVIMA reporta registro sanitario vigente para esta tecnologia."
          : "Sin registro sanitario vigente en el indice local."
      );
    } catch (e) {
      toast.error(apiError(e, "No se pudo cruzar con el INVIMA"));
    } finally {
      setBusy("");
    }
  };

  const save = async () => {
    setBusy("save");
    try {
      const { data } = await api.put(`/screening/novelty/${cycleId}/${activeId}`, {
        option_code: form.option_code,
        justification: form.justification,
      });
      setDetail(data);
      toast.success("Criterio de novedad registrado.");
      onChanged?.();
    } catch (e) {
      toast.error(apiError(e, "No se pudo guardar el criterio de novedad"));
    } finally {
      setBusy("");
    }
  };

  const qualify = async () => {
    setBusy("qualify");
    try {
      await api.post(`/technologies/${activeId}/cycles/${cycleId}/qualify`);
      toast.success("Tecnologia apta para priorizacion.");
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(apiError(e, "No se pudo calificar como apta"));
    } finally {
      setBusy("");
    }
  };

  if (loading) return <LoadingBlock label="Cargando cola de filtrado..." />;
  if (!cycleId)
    return (
      <EmptyState
        icon="🗓️"
        title="Sin ciclo activo"
        message="El filtrado ocurre dentro de un ciclo. Seleccione uno en la cabecera o abra uno nuevo."
      />
    );

  return (
    <>
      <InvimaPanel canSync={canSync} onChanged={onChanged} />

      {queue.length === 0 ? (
        <EmptyState
          icon="✅"
          title="Nada pendiente de filtrar"
          message="No hay tecnologias en estado asignada al ciclo esperando verificacion de novedad."
        />
      ) : (
        <div className="prio-layout">
          <Card padding={0} style={{ overflow: "hidden" }}>
            <div className="prio-list">
              {queue.map((tech) => (
                <button
                  key={tech.id}
                  type="button"
                  className={`prio-item ${tech.id === activeId ? "prio-item-active" : ""}`}
                  onClick={() => setActiveId(tech.id)}
                >
                  <div className="prio-item-name">
                    {tech.inn_name || tech.commercial_name || `#${tech.id}`}
                  </div>
                  <div className="prio-item-meta">
                    {tech.cluster_name || "Sin cluster"} ·{" "}
                    {TECH_STATUS_LABELS[tech.status] || tech.status}
                  </div>
                </button>
              ))}
            </div>
          </Card>

          <div className="prio-detail">
            {!detail ? (
              <LoadingBlock label="Cargando..." />
            ) : (
              <Card padding={18}>
                <h3 style={{ margin: "0 0 4px" }}>{detail.technology_name}</h3>
                <p className="muted-note" style={{ marginTop: 0 }}>
                  Una tecnologia con registro sanitario vigente en Colombia no avanza a
                  priorizacion sin justificar por que sigue siendo novedosa.
                </p>

                <div className="novelty-invima">
                  <div>
                    <span className="novelty-invima-label">Registro sanitario</span>
                    {detail.invima_checked_at ? (
                      <Badge tone={detail.has_valid_registry ? "warning" : "priorizada"}>
                        {detail.has_valid_registry ? "Vigente en Colombia" : "Sin registro vigente"}
                      </Badge>
                    ) : (
                      <Badge tone="info">Sin verificar</Badge>
                    )}
                  </div>
                  {canWrite && !isClosed && (
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={busy === "check"}
                      onClick={runCheck}
                    >
                      Cruzar con el INVIMA
                    </Button>
                  )}
                </div>

                {detail.matches?.length > 0 && (
                  <table className="novelty-matches">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th>Titular</th>
                        <th>Estado</th>
                        <th>Similitud</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.matches.map((m, i) => (
                        <tr key={`${m.registro}-${i}`}>
                          <td>{m.producto}</td>
                          <td>{m.titular}</td>
                          <td>{m.estado_registro}</td>
                          <td>{pct(m.score)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                <Select
                  label="Via de novedad"
                  value={form.option_code}
                  disabled={!canWrite || isClosed}
                  onChange={(e) => setForm((f) => ({ ...f, option_code: e.target.value }))}
                >
                  <option value="">Seleccione la via que aplica...</option>
                  {options.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.label}
                    </option>
                  ))}
                </Select>

                {needsJustification && (
                  <Textarea
                    label="Justificacion explicita"
                    required
                    rows={3}
                    placeholder="Explique por que la tecnologia sigue siendo novedosa pese al registro existente."
                    value={form.justification}
                    disabled={!canWrite || isClosed}
                    onChange={(e) => setForm((f) => ({ ...f, justification: e.target.value }))}
                  />
                )}

                {detail.blocking_reason && (
                  <div className="novelty-block">
                    <Icon name="alert" />
                    <span>{detail.blocking_reason}</span>
                  </div>
                )}

                {canWrite && !isClosed && (
                  <div className="merge-actions">
                    <Button
                      onClick={save}
                      loading={busy === "save"}
                      disabled={!form.option_code}
                    >
                      Guardar criterio
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={qualify}
                      loading={busy === "qualify"}
                      disabled={!detail.can_qualify}
                    >
                      Marcar apta para priorizacion
                    </Button>
                  </div>
                )}
              </Card>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function UniqueListTab() {
  const { cycleId } = useCycle();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadFromApi(
        api,
        `/screening/unique-list/${cycleId}/export`,
        `listado_unico_${data.cycle_code || cycleId}.csv`
      );
    } catch (e) {
      toast.error(apiError(e, "No se pudo exportar el Listado Unico"));
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    if (!cycleId) {
      setLoading(false);
      return;
    }
    api
      .get(`/screening/unique-list/${cycleId}`)
      .then(({ data: d }) => setData(d))
      .catch((e) => toast.error(apiError(e, "No se pudo generar el Listado Unico")))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleId]);

  if (loading) return <LoadingBlock label="Consolidando el Listado Unico..." />;
  if (!cycleId || !data)
    return (
      <EmptyState
        icon="🗓️"
        title="Sin ciclo activo"
        message="El Listado Unico es la salida consolidada de un ciclo."
      />
    );

  return (
    <>
      <Card
        title={`Listado Unico por cluster · ${data.cycle_code}`}
        hint="Salida consolidada del filtrado: el acervo depurado del ciclo, sin duplicados ni exclusiones."
        padding={18}
        style={{ marginBottom: 18 }}
        actions={
          <Button variant="secondary" onClick={exportCsv} loading={exporting}>
            <Icon name="save" size={16} /> Exportar CSV
          </Button>
        }
      >
        <ModuleStatsRow
          items={[
            { label: "En el listado", value: data.total, color: "#059669" },
            { label: "Excluidas", value: data.excluded_count, color: "#94A3B8" },
            { label: "Fusionadas", value: data.merged_count, color: "#6366F1" },
            { label: "Clusteres", value: data.clusters.length },
          ]}
        />
      </Card>

      {data.clusters.length === 0 ? (
        <EmptyState
          icon="📋"
          title="Listado vacio"
          message="Ninguna tecnologia del ciclo ha superado el filtrado todavia."
        />
      ) : (
        data.clusters.map((group) => (
          <Card
            key={group.cluster_code}
            title={`${group.cluster_name} (${group.count})`}
            padding={0}
            style={{ marginBottom: 16, overflow: "hidden" }}
          >
            <table className="unique-list">
              <thead>
                <tr>
                  <th>DCI / comercial</th>
                  <th>Fabricante</th>
                  <th>Tipologia</th>
                  <th>ATC</th>
                  <th>Estado</th>
                  <th>%P</th>
                </tr>
              </thead>
              <tbody>
                {group.items.map((item) => (
                  <tr key={item.technology_id}>
                    <td>
                      <strong>{item.inn_name || item.commercial_name}</strong>
                      {item.inn_name && item.commercial_name && (
                        <div className="muted-note">{item.commercial_name}</div>
                      )}
                    </td>
                    <td>{item.manufacturer || "—"}</td>
                    <td>{item.tech_type_name || "—"}</td>
                    <td>{item.atc_code || "—"}</td>
                    <td>{TECH_STATUS_LABELS[item.status] || item.status}</td>
                    <td>{item.priority_pct === null ? "—" : pct(item.priority_pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ))
      )}
    </>
  );
}

export default function Screening() {
  const [tab, setTab] = useState("duplicados");
  const [stats, setStats] = useState(null);
  const { cycleId } = useCycle();
  const { can } = useAuth();
  const { version } = useRealtime();

  const canWrite = can(PERM.SCREENING_WRITE);
  const canSync = can(PERM.INVIMA_SYNC);

  const loadStats = useCallback(async () => {
    try {
      const { data } = await api.get("/screening/stats", {
        params: cycleId ? { cycle_id: cycleId } : {},
      });
      setStats(data);
    } catch {
      /* los indicadores no bloquean la pantalla */
    }
  }, [cycleId]);

  useEffect(() => {
    loadStats();
  }, [loadStats, version]);

  const statItems = useMemo(() => {
    if (!stats) return [];
    return [
      { label: "Fusiones por revisar", value: stats.pending_merges, color: "#D97706" },
      { label: "Fusiones confirmadas", value: stats.confirmed_merges, color: "#6366F1" },
      { label: "Por filtrar", value: stats.assigned, color: "#3B82F6" },
      { label: "Aptas", value: stats.qualified, color: "#059669" },
      { label: "Excluidas", value: stats.excluded, color: "#94A3B8" },
      {
        label: "Novedad verificada",
        value: stats.novelty_assessed,
        sub: `${stats.invima_checked} cruzadas con INVIMA`,
      },
    ];
  }, [stats]);

  return (
    <div>
      <PageHeader
        title="Filtrado y depuracion"
        subtitle="Modulo 2 de la especificacion: desduplicacion difusa, criterio de novedad con verificacion regulatoria y Listado Unico por cluster."
      />

      <PhaseGuide
        phase="Modulo 2"
        tasks={[
          "Ejecutar el barrido difuso y resolver los pares propuestos: fusionar o declarar que son distintas.",
          "Cruzar cada tecnologia con el indice del INVIMA y registrar por que via es novedosa.",
          "Marcar como apta lo que supera el filtro; excluir con causa tipificada lo que no.",
          "Consolidar y exportar el Listado Unico por cluster.",
        ]}
        nextLabel="Priorizacion P1 a P6"
        nextTo="/priorizacion"
      />

      {statItems.length > 0 && <ModuleStatsRow items={statItems} />}

      <div className="screening-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`screening-tab${tab === t.key ? " is-active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            <Icon name={t.icon} /> {t.label}
          </button>
        ))}
      </div>

      {tab === "duplicados" && <DuplicatesTab canWrite={canWrite} onChanged={loadStats} />}
      {tab === "novedad" && (
        <NoveltyTab canWrite={canWrite} canSync={canSync} onChanged={loadStats} />
      )}
      {tab === "listado" && <UniqueListTab />}
    </div>
  );
}
