import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { apiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useRealtime } from "../realtime/RealtimeContext";
import { useToast } from "../components/Toast";
import ModuleHeader from "../components/ModuleHeader";
import { GLOSSARY } from "../constants/glossary";
import { PERM } from "../constants/methodology";
import PhaseGuide, { ModuleStatsRow } from "../components/PhaseGuide";
import { Card } from "../components/Card";
import Button from "../components/Button";
import HintButton from "../components/HintButton";
import Badge from "../components/Badge";
import Icon from "../components/Icon";
import InfoTip, { TermLabel } from "../components/InfoTip";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import DataTable from "../components/DataTable";
import NotesPanel from "../components/NotesPanel";
import { downloadFromApi } from "../utils/download";
import { Input, Textarea, Select } from "../components/Field";
import { LoadingBlock } from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import LinkPreview from "../components/LinkPreview";

const BLOCKS = [
  "Registros de ensayos clinicos",
  "Agencias regulatorias",
  "Agencias de HTA y redes de EH",
  "Literatura y organismos internacionales",
  "Fabricantes de I+D",
];
// El bloque se guarda tal cual en la base (catalogo D-06 sembrado); solo la etiqueta visible lleva tilde.
const BLOCK_LABELS = { "Registros de ensayos clinicos": "Registros de ensayos clínicos" };
const blockLabel = (c) => BLOCK_LABELS[c] || c;

const LEVELS = [
  { value: "A", label: "A · API estable" },
  { value: "B", label: "B · Feed o descarga oficial" },
  { value: "C", label: "C · Página estructurada" },
  { value: "D", label: "D · Página que confirma" },
  { value: "E", label: "E · Curaduría humana" },
];
const FREQUENCIES = ["diaria", "semanal", "quincenal", "mensual", "trimestral", "semestral", "anual"];
const HEALTH_LABELS = { verde: "Verde", ambar: "Ámbar", rojo: "Rojo", sin_sonda: "Sin sonda" };
const TABS = [
  { id: "catalogo", label: "Catálogo" },
  { id: "salud", label: "Salud de fuentes", hint: GLOSSARY.fb_salud },
  { id: "cobertura", label: "Cobertura", hint: GLOSSARY.fb_cobertura },
];

const EMPTY = {
  title: "",
  url: "",
  category: BLOCKS[1],
  description: "",
  language: "Inglés",
  scrape_enabled: true,
  connector: "html",
  access_level: "D",
  sync_frequency: "mensual",
  country: "",
  connectorConfigText: "{}",
};
const QUICK_EMPTY = { title: "", url: "", category: "Agencias de HTA y redes de EH" };

function healthTone(status) {
  if (status === "verde") return "verde";
  if (status === "ambar") return "ambar";
  if (status === "rojo") return "rojo";
  return "sin_sonda";
}

/** Motivo por el que no se puede eliminar, o cadena vacia si se puede. */
function deleteBlocker(s) {
  if (s.catalog_code && !s.retired) return "Es parte del catálogo verificado D-06: deshabilite su ingesta en lugar de eliminarla.";
  if ((s.findings_count || 0) > 0) return `Tiene ${s.findings_count} señal(es) capturadas, que no se descartan. Deshabilite su ingesta.`;
  return "";
}

function ingestBlocker(s) {
  if (s.retired || s.catalog_active === false) return GLOSSARY.fb_retirada;
  if (!s.scrape_enabled) return "La ingesta de esta fuente está apagada. Habilítela para poder consultarla.";
  return "";
}

export default function Sources() {
  const { can, user } = useAuth();
  const { version } = useRealtime();
  const toast = useToast();
  const navigate = useNavigate();
  const canWrite = can(PERM.SOURCE_WRITE);
  const canScan = can(PERM.SCAN_RUN);
  const roleLabel = user?.role_label || user?.role || "actual";
  const noWrite = `Su perfil (${roleLabel}) solo puede consultar el catálogo: no tiene el permiso source:write.`;
  const noScan = `Su perfil (${roleLabel}) no puede ejecutar la vigilancia (permiso scan:run).`;

  const [tab, setTab] = useState("catalogo");
  const [sources, setSources] = useState([]);
  const [connectors, setConnectors] = useState([]);
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
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quick, setQuick] = useState(QUICK_EMPTY);
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [scanningId, setScanningId] = useState(null);
  const [probingId, setProbingId] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [detailSource, setDetailSource] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmImport, setConfirmImport] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [probingAll, setProbingAll] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, h, c, k] = await Promise.all([
        api.get("/sources"),
        api.get("/ingest/health"),
        api.get("/ingest/coverage"),
        api.get("/ingest/connectors"),
      ]);
      setSources(s.data);
      setHealth(h.data);
      setCoverage(c.data);
      setConnectors(k.data);
    } catch (e) {
      toast.error(apiError(e, "No se pudieron cargar las fuentes"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load, version]);

  const connectorByCode = useMemo(() => Object.fromEntries(connectors.map((c) => [c.code, c])), [connectors]);
  const active = useMemo(() => sources.filter((s) => !s.retired && s.catalog_active !== false), [sources]);
  const retired = useMemo(() => sources.filter((s) => s.retired), [sources]);

  const filtered = useMemo(() => {
    const pool = showRetired ? sources : active;
    const q = search.toLowerCase();
    return pool.filter((s) => {
      const okBlock = !blockFilter || s.category === blockFilter;
      const okLevel = !levelFilter || s.access_level === levelFilter;
      const okHealth = !healthFilter || (s.health_status || "sin_sonda") === healthFilter;
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
    const rank = (c) => (BLOCKS.indexOf(c) === -1 ? BLOCKS.length : BLOCKS.indexOf(c));
    return [...map.entries()].sort((a, b) => rank(a[0]) - rank(b[0]));
  }, [filtered]);

  const stats = useMemo(
    () => ({
      total: active.length,
      vigiladas: active.filter((s) => s.scrape_enabled).length,
      contrast: active.filter((s) => s.is_contrast).length,
      governors: active.filter((s) => s.access_level === "A" || s.access_level === "B").length,
    }),
    [active]
  );

  const openAdvanced = (s = null) => {
    setEditing(s);
    setFormError("");
    setForm(
      s
        ? { ...EMPTY, ...s, connectorConfigText: JSON.stringify(s.connector_config || {}, null, 2) }
        : EMPTY
    );
    setModalOpen(true);
  };

  const save = async () => {
    setFormError("");
    if (!form.title.trim()) {
      setFormError("El nombre de la fuente es obligatorio.");
      return;
    }
    const requiresUrl = connectorByCode[form.connector]?.requires_url ?? true;
    if (requiresUrl && !form.url.trim()) {
      setFormError("Este adaptador necesita una URL.");
      return;
    }
    if (form.url.trim() && !/^https?:\/\//i.test(form.url.trim())) {
      setFormError("La URL debe iniciar con http:// o https://");
      return;
    }
    let connectorConfig = {};
    try {
      connectorConfig = JSON.parse(form.connectorConfigText || "{}");
      if (!connectorConfig || typeof connectorConfig !== "object" || Array.isArray(connectorConfig)) throw new Error();
    } catch {
      setFormError("La configuración del conector debe ser un objeto JSON válido, por ejemplo {}.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        url: form.url.trim(),
        category: form.category,
        description: form.description,
        language: form.language,
        scrape_enabled: form.scrape_enabled,
        connector: form.connector,
        access_level: form.access_level,
        sync_frequency: form.sync_frequency,
        country: form.country,
        connector_config: connectorConfig,
      };
      if (editing) await api.put(`/sources/${editing.id}`, payload);
      else await api.post("/sources", payload);
      toast.success(editing ? "Fuente actualizada" : "Fuente creada");
      setModalOpen(false);
      load();
    } catch (e) {
      setFormError(apiError(e, "No se pudo guardar la fuente"));
    } finally {
      setSaving(false);
    }
  };

  const saveQuick = async () => {
    if (!quick.title.trim() || !quick.url.trim()) {
      toast.warning("Escriba el nombre y la URL de la fuente");
      return;
    }
    setSaving(true);
    try {
      await api.post("/sources/quick", { ...quick, title: quick.title.trim(), url: quick.url.trim() });
      toast.success("Fuente registrada con ingesta activa");
      setQuickOpen(false);
      setQuick(QUICK_EMPTY);
      setPreview(null);
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo registrar la fuente"));
    } finally {
      setSaving(false);
    }
  };

  const runPreview = async () => {
    if (!/^https?:\/\//i.test(quick.url.trim())) {
      toast.warning("Escriba una URL que inicie con http:// o https://");
      return;
    }
    setPreviewing(true);
    setPreview(null);
    try {
      const { data } = await api.post("/scan/preview", { url: quick.url.trim() });
      setPreview(data);
      if (!quick.title.trim() && data.title) setQuick((q) => ({ ...q, title: data.title.slice(0, 200) }));
    } catch (e) {
      toast.error(apiError(e, "No se pudo previsualizar el enlace"));
    } finally {
      setPreviewing(false);
    }
  };

  const scanOne = async (s) => {
    setScanningId(s.id);
    try {
      const { data } = await api.post(`/scan/source/${s.id}`);
      if (data.status === "error") toast.error(`Ingesta con error: ${data.message || "sin detalle"}`);
      else toast.success(`Ingesta: ${data.items_new} nuevas de ${data.items_found}`);
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
      const msg = `Sonda ${HEALTH_LABELS[data.status] || data.status}: ${data.message || "sin detalle"}`;
      if (data.status === "verde") toast.success(msg);
      else toast.warning(msg);
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo ejecutar la sonda"));
    } finally {
      setProbingId(null);
    }
  };

  const toggleIngest = async (s) => {
    setTogglingId(s.id);
    try {
      await api.put(`/sources/${s.id}`, { scrape_enabled: !s.scrape_enabled });
      toast.success(s.scrape_enabled ? "Ingesta deshabilitada" : "Ingesta habilitada");
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo cambiar la ingesta"));
    } finally {
      setTogglingId(null);
    }
  };

  const doDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/sources/${confirmDelete.id}`);
      toast.success("Fuente eliminada");
      setConfirmDelete(null);
      setDetailSource(null);
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo eliminar la fuente"));
    } finally {
      setDeleting(false);
    }
  };

  const importCatalog = async () => {
    setImporting(true);
    try {
      const { data } = await api.post("/ingest/sources/import");
      toast.success(`Catálogo ${data.version}: ${data.updated} actualizadas, ${data.created} nuevas, ${data.retired} retiradas`);
      setConfirmImport(false);
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo importar el catálogo"));
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
      toast.error(apiError(e, "No se pudo sondear el catálogo"));
    } finally {
      setProbingAll(false);
    }
  };

  const acceptTerms = async (s) => {
    try {
      await api.post(`/ingest/sources/${s.id}/accept-terms`);
      toast.success("Términos aceptados y fechados");
      setDetailSource(null);
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudieron registrar los términos"));
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadFromApi(api, "/sources/export", "catalogo_fuentes_iets.csv");
      toast.success("Catálogo descargado");
    } catch (e) {
      toast.error(apiError(e, "No se pudo exportar"));
    } finally {
      setExporting(false);
    }
  };

  /** Botones de accion por fuente, con el motivo cuando no aplican. */
  const SourceActions = ({ s, compact = false }) => {
    const ingestWhy = !canScan ? noScan : ingestBlocker(s);
    const deleteWhy = !canWrite ? noWrite : deleteBlocker(s);
    return (
      <div className="fb-toolbar" style={{ justifyContent: compact ? "flex-end" : "flex-start", gap: 4 }}>
        <HintButton size="sm" variant="ghost" hint="Ver la ficha completa de la fuente y sus notas" onClick={() => setDetailSource(s)}>
          Ficha
        </HintButton>
        {canScan && (
          <HintButton size="sm" variant="ghost" hint={GLOSSARY.fb_sonda} loading={probingId === s.id} onClick={() => probeOne(s)}>
            <Icon name="pulse" size={14} /> Sonda
          </HintButton>
        )}
        {canScan && (
          <HintButton
            size="sm"
            variant="outline"
            hint={GLOSSARY.fb_ingerir}
            disabledHint={ingestWhy}
            disabled={Boolean(ingestWhy)}
            loading={scanningId === s.id}
            onClick={() => scanOne(s)}
          >
            <Icon name="radar" size={14} /> Ingerir
          </HintButton>
        )}
        {canWrite && (
          <>
            <HintButton size="sm" variant="ghost" hint="Editar los datos y el adaptador de la fuente" onClick={() => openAdvanced(s)}>
              <Icon name="edit" size={14} /> Editar
            </HintButton>
            {!s.retired && (
              <HintButton
                size="sm"
                variant="ghost"
                hint={s.scrape_enabled ? "Apagar la ingesta: deja de consultarse, sin borrar nada" : "Encender la ingesta de esta fuente"}
                loading={togglingId === s.id}
                onClick={() => toggleIngest(s)}
              >
                {s.scrape_enabled ? "Deshabilitar" : "Habilitar"}
              </HintButton>
            )}
            <HintButton
              size="sm"
              variant="ghost"
              style={{ color: deleteWhy ? undefined : "#DC2626" }}
              hint={GLOSSARY.fb_eliminar_fuente}
              disabledHint={deleteWhy}
              disabled={Boolean(deleteWhy)}
              onClick={() => setConfirmDelete(s)}
              aria-label={`Eliminar ${s.title}`}
            >
              <Icon name="trash" size={14} />
            </HintButton>
          </>
        )}
      </div>
    );
  };

  const tableColumns = [
    { key: "code", width: 100, label: "Código", render: (s) => <span className="catalog-code">{s.catalog_code || "—"}</span> },
    {
      key: "title",
      label: "Fuente",
      render: (s) => (
        <button type="button" className="linkish" onClick={() => setDetailSource(s)}>
          {s.title}
        </button>
      ),
    },
    { key: "level", width: 70, label: "Nivel", tip: <InfoTip text={GLOSSARY.fb_nivel} label="Qué es el nivel" />, render: (s) => <Badge tone={s.access_level}>{s.access_level || "—"}</Badge> },
    { key: "connector", width: 120, label: "Adaptador", tip: <InfoTip text={GLOSSARY.fb_adaptador} label="Qué es el adaptador" />, render: (s) => s.connector || "html" },
    { key: "health", width: 100, label: "Salud", tip: <InfoTip text={GLOSSARY.fb_salud} label="Qué es la salud" />, render: (s) => <Badge tone={healthTone(s.health_status)}>{HEALTH_LABELS[s.health_status || "sin_sonda"] || s.health_status}</Badge> },
    {
      key: "watch",
      width: 90,
      label: "Ingesta",
      tip: <InfoTip text={GLOSSARY.fb_ingesta} label="Qué es la ingesta" />,
      render: (s) => (s.retired ? <Badge tone="viewer">Retirada</Badge> : s.scrape_enabled ? <Badge tone="ok">Activa</Badge> : <Badge tone="viewer">Apagada</Badge>),
    },
    { key: "signals", width: 80, label: "Señales", align: "right", render: (s) => s.findings_count || 0 },
    { key: "actions", width: 330, align: "right", label: "Acciones", render: (s) => <SourceActions s={s} compact /> },
  ];

  if (loading) return <LoadingBlock label="Cargando catálogo verificado de fuentes..." />;

  const currentConnector = connectorByCode[form.connector];

  return (
    <div>
      <ModuleHeader
        step="identificacion"
        title="Catálogo de fuentes proactivas"
        titleHint={GLOSSARY.catalogo_fuentes}
        purpose="Inventario RF01 / D-06: fuentes verificadas clasificadas por contrato de datos. Las de nivel A y B sostienen el pipeline; el resto lo enriquece."
        actions={
          <div className="fb-toolbar">
            <HintButton variant="secondary" hint="Descarga el listado maestro en CSV (abre en Excel)" onClick={exportCsv} loading={exporting}>
              <Icon name="doc" size={16} /> CSV
            </HintButton>
            <HintButton variant="outline" hint={GLOSSARY.fb_sondear_ab} disabledHint={noScan} disabled={!canScan} onClick={probeGovernors} loading={probingAll}>
              <Icon name="pulse" size={16} /> Sondear A/B
            </HintButton>
            <HintButton variant="outline" hint={GLOSSARY.fb_recargar_catalogo} disabledHint={noWrite} disabled={!canWrite} onClick={() => setConfirmImport(true)}>
              <Icon name="layers" size={16} /> Recargar catálogo
            </HintButton>
            <HintButton variant="secondary" hint={GLOSSARY.fb_alta_rapida} disabledHint={noWrite} disabled={!canWrite} onClick={() => { setQuick(QUICK_EMPTY); setPreview(null); setQuickOpen(true); }}>
              <Icon name="plus" size={16} /> Alta rápida
            </HintButton>
            <HintButton hint="Registrar una fuente con adaptador, nivel, frecuencia y configuración" disabledHint={noWrite} disabled={!canWrite} onClick={() => openAdvanced()}>
              <Icon name="plus" size={16} /> Agregar fuente
            </HintButton>
          </div>
        }
      />

      {!canWrite && (
        <div className="fb-readonly-note" data-testid="sources-readonly">
          <Icon name="info" size={16} />
          <span>Modo consulta: {noWrite} Puede ver fichas, salud y cobertura, y descargar el CSV.</span>
        </div>
      )}

      <PhaseGuide
        phase="Módulo 0 · Identificación"
        hint={GLOSSARY.catalogo_fuentes}
        tasks={[
          "Las fuentes de nivel A y B gobiernan el pre-llenado de P1, P5 y P6.",
          "Una sonda ámbar o roja suspende la ingesta de esa fuente; el silencio no se confunde con 'no hay tecnologías'.",
          "Las fuentes de nivel D confirman; nunca sobreescriben un campo que ya trajo una A o B.",
        ]}
        nextLabel="Ejecutar vigilancia"
        onNext={() => navigate("/vigilancia")}
      />

      <ModuleStatsRow
        items={[
          { label: "Fuentes del catálogo", value: stats.total, sub: `${retired.length} retiradas del inventario anterior`, hint: "Fuentes vigentes del inventario (no cuenta las retiradas del catálogo anterior)." },
          { label: "Contrato A/B", value: stats.governors, sub: "Sostienen el pipeline", hint: GLOSSARY.fb_nivel },
          { label: "Ingesta activa", value: stats.vigiladas, hint: GLOSSARY.fb_ingesta },
          { label: "Fuentes de contraste", value: stats.contrast, sub: "Control de cobertura", hint: GLOSSARY.fb_contraste },
        ]}
      />

      <div className="catalog-tabs">
        {TABS.map((t) => (
          <span key={t.id} className="term-label">
            <button type="button" className={`view-toggle${tab === t.id ? " active" : ""}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
            {t.hint && <InfoTip text={t.hint} label={`Qué es ${t.label}`} />}
          </span>
        ))}
      </div>

      {tab === "catalogo" && (
        <>
          <Card style={{ marginBottom: 16 }} padding={16}>
            <div className="fb-toolbar">
              <input
                placeholder="Buscar por código, nombre, alias o URL..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="filter-input"
                aria-label="Buscar fuente"
                style={{ flex: 1, minWidth: 200 }}
              />
              <select value={blockFilter} onChange={(e) => setBlockFilter(e.target.value)} className="filter-select" aria-label="Filtrar por bloque">
                <option value="">Todos los bloques</option>
                {BLOCKS.map((c) => (
                  <option key={c} value={c}>{blockLabel(c)}</option>
                ))}
              </select>
              <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} className="filter-select" aria-label="Filtrar por nivel">
                <option value="">Todos los niveles</option>
                {LEVELS.map((l) => (
                  <option key={l.value} value={l.value}>Nivel {l.value}</option>
                ))}
              </select>
              <select value={healthFilter} onChange={(e) => setHealthFilter(e.target.value)} className="filter-select" aria-label="Filtrar por salud">
                <option value="">Cualquier salud</option>
                {Object.entries(HEALTH_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <label className="catalog-check">
                <input type="checkbox" checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)} />
                <TermLabel tip={GLOSSARY.fb_retirada}>Incluir retiradas</TermLabel>
              </label>
              <div style={{ display: "flex", gap: 4, background: "#F1F5F9", padding: 4, borderRadius: 8 }}>
                <button type="button" onClick={() => setViewMode("registry")} className={`view-toggle${viewMode === "registry" ? " active" : ""}`}>Tarjetas</button>
                <button type="button" onClick={() => setViewMode("table")} className={`view-toggle${viewMode === "table" ? " active" : ""}`}>Tabla</button>
              </div>
              <span style={{ fontSize: 13, color: "#64748B" }} data-testid="sources-count">{filtered.length} fuentes</span>
            </div>
          </Card>

          {filtered.length === 0 ? (
            <Card>
              <EmptyState
                icon="🌐"
                title="Sin fuentes que coincidan"
                message={
                  sources.length === 0
                    ? "El inventario está vacío. Recargue el catálogo verificado D-06 o registre una fuente."
                    : "Ajuste la búsqueda o los filtros, o marque 'Incluir retiradas'."
                }
                action={
                  search || blockFilter || levelFilter || healthFilter ? (
                    <Button variant="secondary" onClick={() => { setSearch(""); setBlockFilter(""); setLevelFilter(""); setHealthFilter(""); }}>
                      Limpiar filtros
                    </Button>
                  ) : null
                }
              />
            </Card>
          ) : viewMode === "registry" ? (
            <div className="registry-groups">
              {grouped.map(([cat, items]) => (
                <div key={cat} className="registry-group">
                  <div className="registry-group-head">
                    <h3>{blockLabel(cat)}</h3>
                    <Badge>{items.length}</Badge>
                  </div>
                  <div className="registry-group-grid">
                    {items.map((s) => (
                      <Card key={s.id} padding={16} className={`registry-card catalog-card catalog-card--${s.access_level || "D"}`}>
                        <div className="registry-card-top" data-testid={`source-card-${s.id}`}>
                          <span className="catalog-code">{s.catalog_code || "sin código"}</span>
                          <span title={GLOSSARY.fb_nivel}><Badge tone={s.access_level}>Nivel {s.access_level || "—"}</Badge></span>
                          <span title={GLOSSARY.fb_salud}><Badge tone={healthTone(s.health_status)}>{HEALTH_LABELS[s.health_status || "sin_sonda"] || s.health_status}</Badge></span>
                          {s.is_contrast && <span title={GLOSSARY.fb_contraste}><Badge tone="info">Contraste</Badge></span>}
                          {s.retired && <span title={GLOSSARY.fb_retirada}><Badge tone="viewer">Retirada</Badge></span>}
                          {!s.retired && !s.scrape_enabled && <span title={GLOSSARY.fb_ingesta}><Badge tone="viewer">Ingesta apagada</Badge></span>}
                        </div>
                        <h4>{s.title}</h4>
                        {s.url && (
                          <a href={s.url} target="_blank" rel="noreferrer" className="registry-url">
                            {s.url.replace(/^https?:\/\//, "").slice(0, 56)}
                          </a>
                        )}
                        <p>{s.description?.slice(0, 140) || "Sin descripción."}</p>
                        <div className="registry-card-stats">
                          <span title={GLOSSARY.fb_adaptador}>{s.connector}</span>
                          <span title={GLOSSARY.fb_frecuencia}>{s.sync_frequency || "—"}</span>
                          <span>{s.country || s.language}</span>
                          <span>{s.findings_count || 0} señales</span>
                          {s.requires_api_key && <span title="Funciona sin llave, pero con un cupo bajo. Configúrela en Configuración > Llaves de fuentes.">requiere llave</span>}
                        </div>
                        <div className="registry-card-actions">
                          <SourceActions s={s} />
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Card padding={0}>
              <DataTable stack columns={tableColumns} rows={filtered.map((s) => ({ key: s.id, data: s }))} minWidth={1080} />
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
                <span>{HEALTH_LABELS[k]}</span>
              </div>
            ))}
          </div>
          <p className="catalog-legend">{GLOSSARY.fb_salud} El silencio de una fuente A no significa «no hay tecnologías nuevas».</p>
          <DataTable
            stack
            columns={[
              { key: "code", width: 100, label: "Código", render: (s) => s.catalog_code || "—" },
              { key: "title", label: "Fuente", render: (s) => s.title },
              { key: "level", width: 70, label: "Nivel", tip: <InfoTip text={GLOSSARY.fb_nivel} />, render: (s) => <Badge tone={s.access_level}>{s.access_level}</Badge> },
              { key: "status", width: 100, label: "Estado", render: (s) => <Badge tone={healthTone(s.health_status)}>{HEALTH_LABELS[s.health_status || "sin_sonda"] || s.health_status}</Badge> },
              { key: "msg", label: "Detalle", render: (s) => s.message || "—" },
              {
                key: "act",
                width: 110,
                label: "",
                render: (s) =>
                  canScan ? (
                    <HintButton size="sm" variant="outline" hint={GLOSSARY.fb_sonda} loading={probingId === s.id} onClick={() => {
                      const src = sources.find((x) => x.id === s.id);
                      if (src) probeOne(src);
                    }}>
                      Repetir sonda
                    </HintButton>
                  ) : null,
              },
            ]}
            rows={(health?.items || []).map((s) => ({ key: s.id, data: s }))}
            minWidth={860}
            emptyMessage="Aún no hay sondas registradas. Use 'Sondear A/B' para la primera."
          />
        </Card>
      )}

      {tab === "cobertura" && (
        <Card>
          <h3 style={{ marginTop: 0 }}>Huecos frente a fuentes de contraste</h3>
          <p className="catalog-legend">
            Tecnologías que aparecen en PCORI, CDA-AMC, NIHRIO, ACE, ScanMedicine o INAHTA y no están en
            {coverage?.cycle_code ? ` ${coverage.cycle_code}` : " el ciclo activo"}.
            Si el contraste las tiene y el IETS no, hay que justificar el hueco.
          </p>
          <ModuleStatsRow
            items={[
              { label: "Ciclo", value: coverage?.cycle_code || "—", sub: `${coverage?.cycle_size || 0} tecnologías`, hint: "Ciclo contra el que se mide la cobertura (el activo)." },
              { label: "Captadas en contraste", value: coverage?.contrast_captured || 0, hint: GLOSSARY.fb_contraste },
              { label: "Huecos", value: coverage?.gap_count || 0, color: coverage?.gap_count ? "#F59E0B" : undefined, hint: GLOSSARY.fb_cobertura },
            ]}
          />
          {(coverage?.gaps || []).length === 0 ? (
            <EmptyState
              icon="✓"
              title="Sin huecos detectados"
              message="Aún no hay señales de contraste, o todas ya están en el ciclo. Ejecute la vigilancia de PCORI, CDA-AMC o ScanMedicine."
            />
          ) : (
            <DataTable
              stack
              columns={[
                { key: "name", label: "Tecnología", render: (g) => <strong>{g.commercial_name || g.inn_name}</strong> },
                { key: "src", label: "Fuente", render: (g) => `${g.catalog_code} · ${g.source_title}` },
                { key: "nct", label: "NCT", render: (g) => (g.nct_ids || []).join(", ") || "—" },
                { key: "ind", label: "Indicación", render: (g) => g.indication || "—" },
              ]}
              rows={(coverage?.gaps || []).map((g) => ({ key: g.technology_id, data: g }))}
              minWidth={820}
            />
          )}
        </Card>
      )}

      {/* Alta rapida */}
      <Modal
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        title="Alta rápida de fuente"
        width={620}
        footer={
          <>
            <Button variant="secondary" onClick={() => setQuickOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={saveQuick} loading={saving}>Registrar fuente</Button>
          </>
        }
      >
        <p style={{ fontSize: 13, color: "#64748B", marginTop: 0 }}>{GLOSSARY.fb_alta_rapida}</p>
        <Input id="quick-title" label="Nombre" required value={quick.title} onChange={(e) => setQuick({ ...quick, title: e.target.value })} />
        <div className="fb-inline-row">
          <Input id="quick-url" label="URL" required hint={GLOSSARY.fb_url} placeholder="https://..." value={quick.url} onChange={(e) => setQuick({ ...quick, url: e.target.value })} />
          <div style={{ flex: "0 0 auto", marginBottom: 14 }}>
            <HintButton variant="outline" hint={GLOSSARY.fb_vista_previa} disabledHint={noScan} disabled={!canScan} loading={previewing} onClick={runPreview}>
              <Icon name="eye" size={15} /> Vista previa
            </HintButton>
          </div>
        </div>
        <Select id="quick-block" label="Bloque" value={quick.category} onChange={(e) => setQuick({ ...quick, category: e.target.value })}>
          {BLOCKS.map((c) => <option key={c} value={c}>{blockLabel(c)}</option>)}
        </Select>
        {preview && <LinkPreview data={preview} />}
      </Modal>

      {/* Alta y edicion avanzada */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Editar fuente" : "Agregar fuente"}
        width={720}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={save} loading={saving}>{editing ? "Guardar cambios" : "Crear fuente"}</Button>
          </>
        }
      >
        {formError && <p className="public-submit-error" role="alert">{formError}</p>}
        {editing?.catalog_code && (
          <p style={{ fontSize: 12.5, color: "#92400E", background: "#FFFBEB", padding: "8px 10px", borderRadius: 8, marginTop: 0 }}>
            Fuente del catálogo D-06 ({editing.catalog_code}). Recargar el catálogo restituye sus datos oficiales.
          </p>
        )}
        <Input id="source-title" label="Nombre" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <Input id="source-url" label="URL" hint={GLOSSARY.fb_url} required={currentConnector?.requires_url ?? true} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
        <div className="fb-grid-2">
          <Select id="source-block" label="Bloque" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {[...new Set([...BLOCKS, form.category].filter(Boolean))].map((c) => <option key={c} value={c}>{blockLabel(c)}</option>)}
          </Select>
          <Select id="source-level" label="Nivel de fuente" hint={GLOSSARY.fb_nivel} value={form.access_level} onChange={(e) => setForm({ ...form, access_level: e.target.value })}>
            {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </Select>
          <Select id="source-connector" label="Adaptador" hint={GLOSSARY.fb_adaptador} value={form.connector} onChange={(e) => setForm({ ...form, connector: e.target.value })}>
            {connectors.map((c) => <option key={c.code} value={c.code}>{c.label} ({c.code})</option>)}
            {!connectorByCode[form.connector] && <option value={form.connector}>{form.connector}</option>}
          </Select>
          <Select id="source-frequency" label="Frecuencia" hint={GLOSSARY.fb_frecuencia} value={form.sync_frequency} onChange={(e) => setForm({ ...form, sync_frequency: e.target.value })}>
            {[...new Set([...FREQUENCIES, form.sync_frequency].filter(Boolean))].map((f) => <option key={f} value={f}>{f}</option>)}
          </Select>
        </div>
        {currentConnector?.description && <p style={{ fontSize: 12.5, color: "#64748B", marginTop: -6 }}>{currentConnector.description}</p>}
        <div className="fb-grid-2">
          <Input id="source-country" label="País o ámbito" value={form.country || ""} onChange={(e) => setForm({ ...form, country: e.target.value })} />
          <Input id="source-language" label="Idioma" value={form.language || ""} onChange={(e) => setForm({ ...form, language: e.target.value })} />
        </div>
        <Textarea id="source-description" label="Descripción" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
        <Textarea
          id="source-config"
          label="Configuración del conector (JSON)"
          hint={GLOSSARY.fb_config_conector}
          className="fb-json"
          value={form.connectorConfigText}
          onChange={(e) => setForm({ ...form, connectorConfigText: e.target.value })}
          rows={4}
          spellCheck={false}
        />
        <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, marginTop: 6 }}>
          <input type="checkbox" checked={form.scrape_enabled} onChange={(e) => setForm({ ...form, scrape_enabled: e.target.checked })} style={{ width: 18, height: 18 }} />
          <TermLabel tip={GLOSSARY.fb_ingesta}>Ingesta activa (vigilancia masiva y programada)</TermLabel>
        </label>
      </Modal>

      <Modal open={!!detailSource} onClose={() => setDetailSource(null)} title={detailSource?.title || "Fuente"} width={720}>
        {detailSource && (
          <div className="source-fiche">
            <div className="registry-card-top" style={{ marginBottom: 12 }}>
              <span className="catalog-code">{detailSource.catalog_code || "sin código"}</span>
              <Badge tone={detailSource.access_level}>Nivel {detailSource.access_level || "—"}</Badge>
              <Badge tone={healthTone(detailSource.health_status)}>{HEALTH_LABELS[detailSource.health_status || "sin_sonda"] || detailSource.health_status}</Badge>
              {detailSource.verification_status && <Badge tone={detailSource.verification_status}>{detailSource.verification_status}</Badge>}
            </div>
            <p>{detailSource.description}</p>
            <dl className="fiche-grid">
              <div><dt><TermLabel tip={GLOSSARY.fb_adaptador}>Adaptador</TermLabel></dt><dd>{detailSource.connector}</dd></div>
              <div><dt><TermLabel tip={GLOSSARY.fb_frecuencia}>Frecuencia</TermLabel></dt><dd>{detailSource.sync_frequency || "—"}</dd></div>
              <div><dt>País</dt><dd>{detailSource.country || "—"}</dd></div>
              <div><dt>Señales capturadas</dt><dd>{detailSource.findings_count || 0}</dd></div>
              <div><dt>Última consulta</dt><dd>{detailSource.last_scraped_at ? new Date(detailSource.last_scraped_at).toLocaleString() : "Nunca"}</dd></div>
              <div><dt>Campos que aporta</dt><dd>{(detailSource.provides_fields || []).join(", ") || "—"}</dd></div>
              <div><dt>Alias</dt><dd>{(detailSource.aliases || []).join(", ") || "—"}</dd></div>
              <div><dt>Términos</dt><dd>{detailSource.terms_accepted_at ? `Aceptados ${new Date(detailSource.terms_accepted_at).toLocaleDateString()}` : (detailSource.terms_url || "No aplican")}</dd></div>
              {detailSource.last_error && <div><dt>Último error</dt><dd>{detailSource.last_error.slice(0, 300)}</dd></div>}
            </dl>
            {detailSource.catalog_note && <p className="catalog-note">{detailSource.catalog_note}</p>}
            <div className="fb-toolbar" style={{ marginBottom: 8 }}>
              {detailSource.url && (
                <a href={detailSource.url} target="_blank" rel="noreferrer">
                  <Button variant="secondary" size="sm"><Icon name="external" size={14} /> Abrir fuente</Button>
                </a>
              )}
              {canWrite && detailSource.terms_url && !detailSource.terms_accepted_at && (
                <HintButton size="sm" hint="Deja fechado que el IETS aceptó los términos de uso de esta fuente" onClick={() => acceptTerms(detailSource)}>
                  Registrar aceptación de términos
                </HintButton>
              )}
            </div>
            <SourceActions s={detailSource} />
            <NotesPanel entityType="source" entityId={detailSource.id} />
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={doDelete}
        loading={deleting}
        title="Eliminar fuente"
        message={`Se eliminará "${confirmDelete?.title}" del inventario. No tiene señales capturadas. Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
      />
      <ConfirmDialog
        open={confirmImport}
        onClose={() => setConfirmImport(false)}
        onConfirm={importCatalog}
        loading={importing}
        title="Recargar catálogo D-06"
        message="Se actualizarán las fuentes oficiales con los datos del catálogo verificado y se retirarán las que ya no estén en el. Las señales nunca se borran. Las ediciones locales a fuentes oficiales se sobrescriben."
        confirmLabel="Recargar"
        confirmVariant="primary"
      />
    </div>
  );
}
