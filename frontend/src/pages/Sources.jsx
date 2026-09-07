import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { apiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useRealtime } from "../realtime/RealtimeContext";
import { useToast } from "../components/Toast";
import ModuleHeader from "../components/ModuleHeader";
import { GLOSSARY } from "../constants/glossary";
import PhaseGuide, { ModuleStatsRow } from "../components/PhaseGuide";
import { Card } from "../components/Card";
import Button from "../components/Button";
import Badge from "../components/Badge";
import Icon from "../components/Icon";
import Tooltip from "../components/Tooltip";
import Modal from "../components/Modal";
import DataTable from "../components/DataTable";
import NotesPanel from "../components/NotesPanel";
import { downloadFromApi } from "../utils/download";
import { Input, Textarea, Select } from "../components/Field";
import { LoadingBlock } from "../components/Spinner";
import EmptyState from "../components/EmptyState";

const BLOCKS = [
  "Registros de ensayos clinicos",
  "Agencias regulatorias",
  "Agencias de HTA y redes de EH",
  "Literatura y organismos internacionales",
  "Fabricantes de I+D",
];

const LEVELS = ["A", "B", "C", "D", "E"];
const TABS = [
  { id: "catalogo", label: "Catalogo" },
  { id: "salud", label: "Salud de fuentes" },
  { id: "cobertura", label: "Cobertura" },
];

const EMPTY = {
  title: "",
  url: "",
  category: BLOCKS[1],
  authors: "",
  year: "2026",
  description: "",
  relation_iets: "",
  language: "Ingles",
  resource_type: "",
  link_status: "Activo",
  scrape_enabled: true,
  tags: "",
  connector: "html",
  access_level: "D",
  sync_frequency: "mensual",
};

function healthTone(status) {
  if (status === "verde") return "verde";
  if (status === "ambar") return "ambar";
  if (status === "rojo") return "rojo";
  return "sin_sonda";
}

export default function Sources() {
  const { isEditor } = useAuth();
  const { version } = useRealtime();
  const toast = useToast();
  const navigate = useNavigate();

  const [tab, setTab] = useState("catalogo");
  const [sources, setSources] = useState([]);
  const [health, setHealth] = useState(null);
  const [coverage, setCoverage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [blockFilter, setBlockFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [healthFilter, setHealthFilter] = useState("");
  const [viewMode, setViewMode] = useState("registry");
  const [showRetired, setShowRetired] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [scanningId, setScanningId] = useState(null);
  const [probingId, setProbingId] = useState(null);
  const [detailSource, setDetailSource] = useState(null);
  const [importing, setImporting] = useState(false);
  const [probingAll, setProbingAll] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, h, c] = await Promise.all([
        api.get("/sources"),
        api.get("/ingest/health"),
        api.get("/ingest/coverage"),
      ]);
      setSources(s.data);
      setHealth(h.data);
      setCoverage(c.data);
    } catch (e) {
      toast.error(apiError(e, "No se pudieron cargar las fuentes"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, version]);

  const active = useMemo(
    () => sources.filter((s) => !s.retired && s.catalog_active !== false),
    [sources]
  );
  const retired = useMemo(() => sources.filter((s) => s.retired), [sources]);

  const filtered = useMemo(() => {
    const pool = showRetired ? sources : active;
    return pool.filter((s) => {
      const okBlock = !blockFilter || s.category === blockFilter;
      const okLevel = !levelFilter || s.access_level === levelFilter;
      const okHealth = !healthFilter || (s.health_status || "sin_sonda") === healthFilter;
      const q = search.toLowerCase();
      const okSearch =
        !q ||
        [s.title, s.url, s.catalog_code, s.connector, s.description, ...(s.aliases || [])]
          .join(" ")
          .toLowerCase()
          .includes(q);
      return okBlock && okLevel && okHealth && okSearch;
    });
  }, [sources, active, showRetired, search, blockFilter, levelFilter, healthFilter]);

  const grouped = useMemo(() => {
    const map = new Map();
    filtered.forEach((s) => {
      const cat = s.category || "Sin bloque";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat).push(s);
    });
    return [...map.entries()].sort((a, b) => BLOCKS.indexOf(a[0]) - BLOCKS.indexOf(b[0]));
  }, [filtered]);

  const stats = useMemo(() => ({
    total: active.length,
    vigiladas: active.filter((s) => s.scrape_enabled).length,
    contrast: active.filter((s) => s.is_contrast).length,
  }), [active]);

  const governors = active.filter((s) => s.access_level === "A" || s.access_level === "B").length;

  const openAdvanced = (s = null) => {
    setEditing(s);
    setForm(s ? { ...EMPTY, ...s } : EMPTY);
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) {
      toast.warning("El titulo es obligatorio");
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form };
      if (editing) await api.put(`/sources/${editing.id}`, payload);
      else await api.post("/sources", payload);
      toast.success(editing ? "Fuente actualizada" : "Fuente creada");
      setModalOpen(false);
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo guardar la fuente"));
    } finally {
      setSaving(false);
    }
  };

  const scanOne = async (s) => {
    setScanningId(s.id);
    try {
      const { data } = await api.post(`/scan/source/${s.id}`);
      toast.success(`Ingesta: ${data.items_new} nuevos de ${data.items_found}`);
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo ingerir la fuente"));
    } finally {
      setScanningId(null);
    }
  };

  const probeOne = async (s) => {
    setProbingId(s.id);
    try {
      const { data } = await api.post(`/ingest/sources/${s.id}/probe`);
      toast.success(`Sonda ${data.status}: ${data.message || "sin detalle"}`);
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo ejecutar la sonda"));
    } finally {
      setProbingId(null);
    }
  };

  const importCatalog = async () => {
    setImporting(true);
    try {
      const { data } = await api.post("/ingest/sources/import");
      toast.success(`Catalogo ${data.version}: ${data.updated} actualizadas, ${data.created} nuevas, ${data.retired} retiradas`);
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo importar el catalogo"));
    } finally {
      setImporting(false);
    }
  };

  const probeGovernors = async () => {
    setProbingAll(true);
    try {
      await api.post("/ingest/probe", null, { params: { only_ab: true } });
      toast.success("Sonda ejecutada sobre las fuentes de nivel A y B");
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo sondear el catalogo"));
    } finally {
      setProbingAll(false);
    }
  };

  const acceptTerms = async (s) => {
    try {
      await api.post(`/ingest/sources/${s.id}/accept-terms`);
      toast.success("Terminos aceptados y fechados");
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudieron registrar los terminos"));
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadFromApi(api, "/sources/export", "catalogo_fuentes_iets.csv");
      toast.success("Catalogo descargado");
    } catch (e) {
      toast.error(apiError(e, "No se pudo exportar"));
    } finally {
      setExporting(false);
    }
  };

  const tableColumns = useMemo(
    () => [
      {
        key: "code",
        width: 110,
        label: "Codigo",
        render: (s) => <span className="catalog-code">{s.catalog_code || "—"}</span>,
      },
      {
        key: "title",
        label: "Fuente",
        render: (s) => (
          <button type="button" className="linkish" onClick={() => setDetailSource(s)}>
            {s.title}
          </button>
        ),
      },
      { key: "level", width: 70, label: "Nivel", render: (s) => <Badge tone={s.access_level}>{s.access_level || "—"}</Badge> },
      { key: "connector", width: 130, label: "Adaptador", render: (s) => s.connector || "html" },
      {
        key: "health",
        width: 110,
        label: "Salud",
        render: (s) => <Badge tone={healthTone(s.health_status)}>{s.health_status || "sin sonda"}</Badge>,
      },
      {
        key: "watch",
        width: 90,
        label: "Ingesta",
        render: (s) => (s.scrape_enabled ? <Badge tone="ok">Activa</Badge> : <Badge tone="viewer">Off</Badge>),
      },
      {
        key: "actions",
        width: 180,
        align: "right",
        label: "Acciones",
        render: (s) => (
          <div style={{ whiteSpace: "nowrap" }}>
            {isEditor && (
              <>
                <Tooltip text="Sonda de salud">
                  <Button size="sm" variant="ghost" loading={probingId === s.id} onClick={() => probeOne(s)}>
                    <Icon name="pulse" size={14} />
                  </Button>
                </Tooltip>
                <Tooltip text="Ingerir ahora">
                  <Button size="sm" variant="outline" loading={scanningId === s.id} disabled={!s.scrape_enabled} onClick={() => scanOne(s)}>
                    <Icon name="radar" size={14} />
                  </Button>
                </Tooltip>
                <Button size="sm" variant="ghost" onClick={() => openAdvanced(s)}>
                  <Icon name="edit" size={14} />
                </Button>
              </>
            )}
          </div>
        ),
      },
    ],
    [isEditor, probingId, scanningId]
  );

  if (loading) return <LoadingBlock label="Cargando catalogo verificado de fuentes..." />;

  return (
    <div>
      <ModuleHeader
        step="identificacion"
        title="Catalogo de fuentes proactivas"
        titleHint={GLOSSARY.catalogo_fuentes}
        purpose="Inventario definitivo RF01 / D-06: 53 fuentes verificadas, clasificadas por contrato de datos. Doce fuentes A/B sostienen el pipeline; el resto lo enriquece."
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant="secondary" onClick={exportCsv} loading={exporting}>
              <Icon name="doc" size={16} /> CSV
            </Button>
            {isEditor && (
              <>
                <Button variant="outline" onClick={probeGovernors} loading={probingAll}>
                  <Icon name="pulse" size={16} /> Sondear A/B
                </Button>
                <Button variant="outline" onClick={importCatalog} loading={importing}>
                  <Icon name="layers" size={16} /> Recargar catalogo
                </Button>
                <Button onClick={() => openAdvanced()}>
                  <Icon name="plus" size={16} /> Agregar
                </Button>
              </>
            )}
          </div>
        }
      />

      <PhaseGuide
        phase="Modulo 0 · Identificacion"
        hint={GLOSSARY.catalogo_fuentes}
        tasks={[
          "Las fuentes de nivel A y B gobiernan el pre-llenado de P1, P5 y P6.",
          "Una sonda ambar o roja suspende la ingesta de esa fuente; el silencio no se confunde con 'no hay tecnologias'.",
          "Las 32 de nivel D confirman; nunca sobreescriben un campo que ya trajo una A o B.",
        ]}
        nextLabel="Ejecutar vigilancia"
        onNext={() => navigate("/vigilancia")}
      />

      <ModuleStatsRow
        items={[
          { label: "Fuentes del catalogo", value: stats.total, sub: `${retired.length} retiradas del inventario anterior` },
          { label: "Contrato A/B", value: governors, sub: "Sostienen el pipeline" },
          { label: "Ingesta activa", value: stats.vigiladas },
          { label: "Fuentes de contraste", value: stats.contrast, sub: "Control de cobertura" },
        ]}
      />

      <div className="catalog-tabs">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={`view-toggle${tab === t.id ? " active" : ""}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "catalogo" && (
        <>
          <Card style={{ marginBottom: 16 }} padding={16}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <input
                placeholder="Buscar por codigo, nombre, alias o URL..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="filter-input"
                style={{ flex: 1, minWidth: 220 }}
              />
              <select value={blockFilter} onChange={(e) => setBlockFilter(e.target.value)} className="filter-select">
                <option value="">Todos los bloques</option>
                {BLOCKS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} className="filter-select">
                <option value="">Todos los niveles</option>
                {LEVELS.map((l) => (
                  <option key={l} value={l}>Nivel {l}</option>
                ))}
              </select>
              <select value={healthFilter} onChange={(e) => setHealthFilter(e.target.value)} className="filter-select">
                <option value="">Cualquier salud</option>
                <option value="verde">Verde</option>
                <option value="ambar">Ambar</option>
                <option value="rojo">Rojo</option>
                <option value="sin_sonda">Sin sonda</option>
              </select>
              <label className="catalog-check">
                <input type="checkbox" checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)} />
                Incluir retiradas
              </label>
              <div style={{ display: "flex", gap: 4, background: "#F1F5F9", padding: 4, borderRadius: 8 }}>
                <button type="button" onClick={() => setViewMode("registry")} className={`view-toggle${viewMode === "registry" ? " active" : ""}`}>Tarjetas</button>
                <button type="button" onClick={() => setViewMode("table")} className={`view-toggle${viewMode === "table" ? " active" : ""}`}>Tabla</button>
              </div>
              <span style={{ fontSize: 13, color: "#64748B" }}>{filtered.length} fuentes</span>
            </div>
          </Card>

          {filtered.length === 0 ? (
            <Card>
              <EmptyState icon="🌐" title="Sin fuentes" message="No hay fuentes que coincidan. Recargue el catalogo D-06." />
            </Card>
          ) : viewMode === "registry" ? (
            <div className="registry-groups">
              {grouped.map(([cat, items]) => (
                <div key={cat} className="registry-group">
                  <div className="registry-group-head">
                    <h3>{cat}</h3>
                    <Badge>{items.length}</Badge>
                  </div>
                  <div className="registry-group-grid">
                    {items.map((s) => (
                      <Card key={s.id} padding={16} className={`registry-card catalog-card catalog-card--${s.access_level || "D"}`}>
                        <div className="registry-card-top">
                          <span className="catalog-code">{s.catalog_code || "sin codigo"}</span>
                          <Badge tone={s.access_level}>Nivel {s.access_level || "—"}</Badge>
                          <Badge tone={healthTone(s.health_status)}>{s.health_status || "sin sonda"}</Badge>
                          {s.is_contrast && <Badge tone="info">Contraste</Badge>}
                          {s.retired && <Badge tone="viewer">Retirada</Badge>}
                        </div>
                        <h4>{s.title}</h4>
                        {s.url && (
                          <a href={s.url} target="_blank" rel="noreferrer" className="registry-url">
                            {s.url.replace(/^https?:\/\//, "").slice(0, 56)}
                          </a>
                        )}
                        <p>{s.description?.slice(0, 140) || "Sin descripcion."}</p>
                        <div className="registry-card-stats">
                          <span>{s.connector}</span>
                          <span>{s.sync_frequency || "—"}</span>
                          <span>{s.country || s.language}</span>
                          {s.requires_api_key && <span>requiere llave</span>}
                        </div>
                        <div className="registry-card-actions">
                          <Button size="sm" variant="ghost" onClick={() => setDetailSource(s)}>Ficha</Button>
                          {isEditor && (
                            <>
                              <Button size="sm" variant="ghost" loading={probingId === s.id} onClick={() => probeOne(s)}>Sonda</Button>
                              {s.scrape_enabled && (
                                <Button size="sm" variant="outline" loading={scanningId === s.id} onClick={() => scanOne(s)}>Ingerir</Button>
                              )}
                              <Button size="sm" variant="ghost" onClick={() => openAdvanced(s)}>Editar</Button>
                            </>
                          )}
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Card padding={0}>
              <DataTable columns={tableColumns} rows={filtered.map((s) => ({ key: s.id, data: s }))} minWidth={980} />
            </Card>
          )}
        </>
      )}

      {tab === "salud" && (
        <Card>
          <div className="health-counts">
            {["verde", "ambar", "rojo", "sin_sonda"].map((k) => (
              <div key={k} className={`health-pill health-pill--${k}`}>
                <strong>{health?.counts?.[k] ?? 0}</strong>
                <span>{k.replace("_", " ")}</span>
              </div>
            ))}
          </div>
          <p className="catalog-legend">
            Verde: responde y el esquema coincide. Ambar: responde pero el contrato cambio o vino vacio; la ingesta se suspende.
            Rojo: no responde. El silencio de una fuente A no es «no hay tecnologias nuevas».
          </p>
          <DataTable
            columns={[
              { key: "code", width: 110, label: "Codigo", render: (s) => s.catalog_code || "—" },
              { key: "title", label: "Fuente", render: (s) => s.title },
              { key: "level", width: 70, label: "Nivel", render: (s) => <Badge tone={s.access_level}>{s.access_level}</Badge> },
              { key: "status", width: 110, label: "Estado", render: (s) => <Badge tone={healthTone(s.health_status)}>{s.health_status}</Badge> },
              { key: "msg", label: "Detalle", render: (s) => s.message || "—" },
              {
                key: "act",
                width: 90,
                label: "",
                render: (s) =>
                  isEditor ? (
                    <Button size="sm" variant="outline" onClick={() => {
                      const src = sources.find((x) => x.id === s.id);
                      if (src) probeOne(src);
                    }}>
                      Repetir
                    </Button>
                  ) : null,
              },
            ]}
            rows={(health?.items || []).map((s) => ({ key: s.id, data: s }))}
            minWidth={860}
          />
        </Card>
      )}

      {tab === "cobertura" && (
        <Card>
          <h3 style={{ marginTop: 0 }}>Huecos frente a fuentes de contraste</h3>
          <p className="catalog-legend">
            Tecnologias que aparecen en PCORI, CDA-AMC, NIHRIO, ACE, ScanMedicine o INAHTA y no estan en
            {coverage?.cycle_code ? ` ${coverage.cycle_code}` : " el ciclo activo"}.
            Si el contraste las tiene y el IETS no, hay que justificar el hueco.
          </p>
          <ModuleStatsRow
            items={[
              { label: "Ciclo", value: coverage?.cycle_code || "—", sub: `${coverage?.cycle_size || 0} tecnologias` },
              { label: "Captadas en contraste", value: coverage?.contrast_captured || 0 },
              { label: "Huecos", value: coverage?.gap_count || 0, color: coverage?.gap_count ? "#F59E0B" : undefined },
            ]}
          />
          {(coverage?.gaps || []).length === 0 ? (
            <EmptyState
              icon="✓"
              title="Sin huecos detectados"
              message="Aun no hay senales de contraste, o todas ya estan en el ciclo. Ejecute la vigilancia de PCORI, CDA-AMC o ScanMedicine."
            />
          ) : (
            <DataTable
              columns={[
                { key: "name", label: "Tecnologia", render: (g) => <strong>{g.commercial_name || g.inn_name}</strong> },
                { key: "src", label: "Fuente", render: (g) => `${g.catalog_code} · ${g.source_title}` },
                { key: "nct", label: "NCT", render: (g) => (g.nct_ids || []).join(", ") || "—" },
                { key: "ind", label: "Indicacion", render: (g) => g.indication || "—" },
              ]}
              rows={(coverage?.gaps || []).map((g) => ({ key: g.technology_id, data: g }))}
              minWidth={820}
            />
          )}
        </Card>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Editar fuente" : "Agregar fuente"}
        width={680}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={save} loading={saving}>{editing ? "Guardar" : "Crear"}</Button>
          </>
        }
      >
        <Input label="Titulo" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <Input label="URL" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Select label="Bloque" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {BLOCKS.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Select label="Nivel de acceso" value={form.access_level} onChange={(e) => setForm({ ...form, access_level: e.target.value })}>
            {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </Select>
          <Input label="Conector" value={form.connector} onChange={(e) => setForm({ ...form, connector: e.target.value })} />
          <Input label="Frecuencia" value={form.sync_frequency} onChange={(e) => setForm({ ...form, sync_frequency: e.target.value })} />
        </div>
        <Textarea label="Descripcion" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
        <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, marginTop: 6 }}>
          <input type="checkbox" checked={form.scrape_enabled} onChange={(e) => setForm({ ...form, scrape_enabled: e.target.checked })} style={{ width: 18, height: 18 }} />
          Habilitar ingesta automatica
        </label>
      </Modal>

      <Modal open={!!detailSource} onClose={() => setDetailSource(null)} title={detailSource?.title || "Fuente"} width={720}>
        {detailSource && (
          <div className="source-fiche">
            <div className="registry-card-top" style={{ marginBottom: 12 }}>
              <span className="catalog-code">{detailSource.catalog_code}</span>
              <Badge tone={detailSource.access_level}>Nivel {detailSource.access_level}</Badge>
              <Badge tone={healthTone(detailSource.health_status)}>{detailSource.health_status || "sin sonda"}</Badge>
              <Badge tone={detailSource.verification_status}>{detailSource.verification_status || "—"}</Badge>
            </div>
            <p>{detailSource.description}</p>
            <dl className="fiche-grid">
              <div><dt>Adaptador</dt><dd>{detailSource.connector}</dd></div>
              <div><dt>Frecuencia</dt><dd>{detailSource.sync_frequency || "—"}</dd></div>
              <div><dt>Pais</dt><dd>{detailSource.country || "—"}</dd></div>
              <div><dt>Campos que aporta</dt><dd>{(detailSource.provides_fields || []).join(", ") || "—"}</dd></div>
              <div><dt>Alias</dt><dd>{(detailSource.aliases || []).join(", ") || "—"}</dd></div>
              <div><dt>Terminos</dt><dd>{detailSource.terms_accepted_at ? `Aceptados ${new Date(detailSource.terms_accepted_at).toLocaleDateString()}` : (detailSource.terms_url || "No aplican")}</dd></div>
            </dl>
            {detailSource.catalog_note && <p className="catalog-note">{detailSource.catalog_note}</p>}
            {detailSource.url && (
              <a href={detailSource.url} target="_blank" rel="noreferrer">
                <Button variant="secondary" size="sm"><Icon name="external" size={14} /> Abrir fuente</Button>
              </a>
            )}
            {isEditor && detailSource.terms_url && !detailSource.terms_accepted_at && (
              <Button size="sm" onClick={() => acceptTerms(detailSource)}>Registrar aceptacion de terminos</Button>
            )}
            <NotesPanel entityType="source" entityId={detailSource.id} />
          </div>
        )}
      </Modal>
    </div>
  );
}
