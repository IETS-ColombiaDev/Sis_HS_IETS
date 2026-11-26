import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { SCAN_TIMEOUT, apiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useRealtime } from "../realtime/RealtimeContext";
import { useToast } from "../components/Toast";
import ModuleHeader from "../components/ModuleHeader";
import { GLOSSARY } from "../constants/glossary";
import { PERM } from "../constants/methodology";
import PhaseGuide, { ModuleStatsRow } from "../components/PhaseGuide";
import { Card } from "../components/Card";
import Button from "../components/Button";
import ActionMenu from "../components/ActionMenu";
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
import { UrlOriginTag } from "../components/UrlOrigin";
import MatrixImportModal from "../components/MatrixImportModal";
import SourceMatrixEditor, {
  FALLBACK_OPTIONS,
  MatrixBadges,
  WebSearchResult,
  matrixFormFrom,
  matrixPayload,
  optionLabel,
} from "../components/SourceMatrixEditor";
import { t, tr, ts, intlLocale } from "../i18n";

const BLOCKS = [
  "Registros de ensayos clinicos",
  "Agencias regulatorias",
  "Agencias de HTA y redes de EH",
  "Literatura y organismos internacionales",
  "Fabricantes de I+D",
  "Revistas y portales de noticias",
];
const FLOW_SHORT = { crawl: t("Recorrido"), ocr: "OCR", ai: t("IA"), web_search: t("Búsqueda web") };
// El bloque se guarda tal cual en la base (catalogo D-06 sembrado); solo la etiqueta visible lleva tilde.
const BLOCK_LABELS = {
  "Registros de ensayos clinicos": t("Registros de ensayos clínicos"),
  "Agencias regulatorias": t("Agencias regulatorias"),
  "Agencias de HTA y redes de EH": t("Agencias de HTA y redes de EH"),
  "Literatura y organismos internacionales": t("Literatura y organismos internacionales"),
  "Fabricantes de I+D": t("Fabricantes de I+D"),
  "Revistas y portales de noticias": t("Revistas y portales de noticias"),
  "Sin bloque": t("Sin bloque"),
};
const blockLabel = (c) => BLOCK_LABELS[c] || c;

const LEVELS = [
  { value: "A", label: t("A · API estable") },
  { value: "B", label: t("B · Feed o descarga oficial") },
  { value: "C", label: t("C · Página estructurada") },
  { value: "D", label: t("D · Página que confirma") },
  { value: "E", label: t("E · Curaduría humana") },
];
const FREQUENCIES = ["diaria", "semanal", "quincenal", "mensual", "trimestral", "semestral", "anual"];
// Los valores se guardan en español; solo la etiqueta visible cambia con el idioma.
const FREQUENCY_LABELS = {
  diaria: t("diaria"),
  semanal: t("semanal"),
  quincenal: t("quincenal"),
  mensual: t("mensual"),
  trimestral: t("trimestral"),
  semestral: t("semestral"),
  anual: t("anual"),
};
const frequencyLabel = (f) => FREQUENCY_LABELS[f] || f;
const VERIFICATION_LABELS = { verificada: t("verificada"), observacion: t("observacion"), declarada: t("declarada") };
const MATCH_LABELS = { dominio: t("dominio"), nombre: t("nombre") };
const HEALTH_LABELS = { verde: t("Verde"), ambar: t("Ámbar"), rojo: t("Rojo"), sin_sonda: t("Sin sonda") };
const TABS = [
  { id: "catalogo", label: t("Catálogo") },
  { id: "salud", label: t("Salud de fuentes"), hint: GLOSSARY.fb_salud },
  { id: "cobertura", label: t("Cobertura"), hint: GLOSSARY.fb_cobertura },
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
  ...matrixFormFrom(null),
};
const QUICK_EMPTY = { title: "", url: "", category: "Agencias de HTA y redes de EH" };
const DISCOVER_EMPTY = { tech_types: [], focus: "", region: "" };
const DISCOVER_HINT = t(
  "La IA busca en la web fuentes de escaneo de horizonte (agencias regulatorias y de ETS, registros de ensayos, pipelines, redes como EuroScan o i-HTS, portales de noticias) que aún no estén en el catálogo. Descarta por dominio las que ya existen y verifica que respondan. No crea nada hasta que usted dé de alta cada propuesta."
);

function healthTone(status) {
  if (status === "verde") return "verde";
  if (status === "ambar") return "ambar";
  if (status === "rojo") return "rojo";
  return "sin_sonda";
}

/** Motivo por el que no se puede eliminar, o cadena vacia si se puede. */
function deleteBlocker(s) {
  if (s.catalog_code && !s.retired) return t("Es parte del catálogo verificado D-06: deshabilite su ingesta en lugar de eliminarla.");
  if ((s.findings_count || 0) > 0) return t("Tiene {n} señal(es) capturadas, que no se descartan. Deshabilite su ingesta.", { n: s.findings_count });
  return "";
}

function ingestBlocker(s) {
  if (s.retired || s.catalog_active === false) return GLOSSARY.fb_retirada;
  if (!s.scrape_enabled) return t("La ingesta de esta fuente está apagada. Habilítela para poder consultarla.");
  return "";
}

export default function Sources() {
  const { can, user } = useAuth();
  const { version } = useRealtime();
  const toast = useToast();
  const navigate = useNavigate();
  const canWrite = can(PERM.SOURCE_WRITE);
  const canScan = can(PERM.SCAN_RUN);
  const roleLabel = ts(user?.role_label) || user?.role || t("actual");
  const noWrite = t("Su perfil ({rol}) solo puede consultar el catálogo: no tiene el permiso source:write.", { rol: roleLabel });
  const noScan = t("Su perfil ({rol}) no puede ejecutar la vigilancia (permiso scan:run).", { rol: roleLabel });

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
  const [tierFilter, setTierFilter] = useState("");
  const [techFilter, setTechFilter] = useState("");
  const [meta, setMeta] = useState({ options: FALLBACK_OPTIONS, web_search: { enabled: true } });
  const [webSearch, setWebSearch] = useState(null);
  const [searchingWeb, setSearchingWeb] = useState(false);
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
  const firstLoad = useRef(true);
  const [deleting, setDeleting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [probingAll, setProbingAll] = useState(false);
  const [bulk, setBulk] = useState(null);
  const [exporting, setExporting] = useState("");
  // Deteccion de fuentes con IA
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [matrixOpen, setMatrixOpen] = useState(false);
  const [discoverForm, setDiscoverForm] = useState(DISCOVER_EMPTY);
  const [discovering, setDiscovering] = useState(false);
  const [discovery, setDiscovery] = useState(null);
  const [discoverError, setDiscoverError] = useState("");
  const [acceptingUrl, setAcceptingUrl] = useState("");
  const [accepted, setAccepted] = useState({});
  const [selected, setSelected] = useState({});
  const [enableIngest, setEnableIngest] = useState(false);

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
      if (firstLoad.current) toast.error(apiError(e, t("No se pudieron cargar las fuentes")));
    } finally {
      firstLoad.current = false;
      setLoading(false);
    }
    try {
      const { data } = await api.get("/sources/options");
      setMeta(data);
    } catch {
      // Sin las listas del servidor se usan las de respaldo.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load, version]);

  const connectorByCode = useMemo(() => Object.fromEntries(connectors.map((c) => [c.code, c])), [connectors]);
  const options = meta.options || FALLBACK_OPTIONS;
  const active = useMemo(() => sources.filter((s) => !s.retired && s.catalog_active !== false), [sources]);
  const retired = useMemo(() => sources.filter((s) => s.retired), [sources]);

  const filtered = useMemo(() => {
    const pool = showRetired ? sources : active;
    const q = search.toLowerCase();
    return pool.filter((s) => {
      const okBlock = !blockFilter || s.category === blockFilter;
      const okLevel = !levelFilter || s.access_level === levelFilter;
      const okHealth = !healthFilter || (s.health_status || "sin_sonda") === healthFilter;
      const okTier = !tierFilter || (s.source_level || "por_definir") === tierFilter;
      const okTech = !techFilter || (s.tech_types || []).includes(techFilter);
      const okSearch =
        !q ||
        [s.title, s.url, s.catalog_code, s.connector, s.description, s.access_path, s.consult_info, ...(s.aliases || [])]
          .join(" ")
          .toLowerCase()
          .includes(q);
      return okBlock && okLevel && okHealth && okTier && okTech && okSearch;
    }).sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  }, [sources, active, showRetired, search, blockFilter, levelFilter, healthFilter, tierFilter, techFilter]);
  const anyFilter = search || blockFilter || levelFilter || healthFilter || tierFilter || techFilter;
  const clearFilters = () => {
    setSearch("");
    setBlockFilter("");
    setLevelFilter("");
    setHealthFilter("");
    setTierFilter("");
    setTechFilter("");
  };

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
      primarias: active.filter((s) => s.source_level === "primaria").length,
      urlMatriz: active.filter((s) => s.url_origin === "matriz").length,
      urlDistinta: active.filter((s) => s.url_origin && s.url_origin !== "matriz").length,
      buscables: active.filter((s) => s.scrape_enabled && s.scan_profile?.web_search !== false).length,
    }),
    [active]
  );

  const openAdvanced = (s = null) => {
    setEditing(s);
    setFormError("");
    setWebSearch(null);
    setForm(
      s
        ? { ...EMPTY, ...s, connectorConfigText: JSON.stringify(s.connector_config || {}, null, 2), ...matrixFormFrom(s) }
        : EMPTY
    );
    setModalOpen(true);
  };

  const testWebSearch = async (s) => {
    setSearchingWeb(true);
    setWebSearch(null);
    try {
      const { data } = await api.post(`/sources/${s.id}/web-search`, null, { timeout: SCAN_TIMEOUT });
      setWebSearch(data);
      if ((data.results || []).length) toast.success(t("Búsqueda web: {n} resultado(s) en {dominio}", { n: data.results.length, dominio: data.domain }));
      else toast.warning(t("Búsqueda web sin resultados en el dominio"));
    } catch (e) {
      toast.error(apiError(e, t("No se pudo probar la búsqueda web")));
    } finally {
      setSearchingWeb(false);
    }
  };

  const save = async () => {
    setFormError("");
    if (!form.title.trim()) {
      setFormError(t("El nombre de la fuente es obligatorio."));
      return;
    }
    const requiresUrl = connectorByCode[form.connector]?.requires_url ?? true;
    if (requiresUrl && !form.url.trim()) {
      setFormError(t("Este adaptador necesita una URL."));
      return;
    }
    if (form.url.trim() && !/^https?:\/\//i.test(form.url.trim())) {
      setFormError(t("La URL debe iniciar con http:// o https://"));
      return;
    }
    let connectorConfig = {};
    try {
      connectorConfig = JSON.parse(form.connectorConfigText || "{}");
      if (!connectorConfig || typeof connectorConfig !== "object" || Array.isArray(connectorConfig)) throw new Error();
    } catch {
      setFormError(t("La configuración del conector debe ser un objeto JSON válido, por ejemplo {}."));
      return;
    }
    const matrix = matrixPayload(form);
    if (matrix.error) {
      setFormError(matrix.error);
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
        ...matrix.payload,
      };
      if (editing) await api.put(`/sources/${editing.id}`, payload);
      else await api.post("/sources", payload);
      toast.success(editing ? t("Fuente actualizada") : t("Fuente creada"));
      setModalOpen(false);
      load();
    } catch (e) {
      setFormError(apiError(e, t("No se pudo guardar la fuente")));
    } finally {
      setSaving(false);
    }
  };

  const saveQuick = async () => {
    if (!quick.title.trim() || !quick.url.trim()) {
      toast.warning(t("Escriba el nombre y la URL de la fuente"));
      return;
    }
    setSaving(true);
    try {
      await api.post("/sources/quick", { ...quick, title: quick.title.trim(), url: quick.url.trim() });
      toast.success(t("Fuente registrada con ingesta activa"));
      setQuickOpen(false);
      setQuick(QUICK_EMPTY);
      setPreview(null);
      load();
    } catch (e) {
      toast.error(apiError(e, t("No se pudo registrar la fuente")));
    } finally {
      setSaving(false);
    }
  };

  const runPreview = async () => {
    if (!/^https?:\/\//i.test(quick.url.trim())) {
      toast.warning(t("Escriba una URL que inicie con http:// o https://"));
      return;
    }
    setPreviewing(true);
    setPreview(null);
    try {
      const { data } = await api.post("/scan/preview", { url: quick.url.trim() }, { timeout: SCAN_TIMEOUT });
      setPreview(data);
      if (!quick.title.trim() && data.title) setQuick((q) => ({ ...q, title: data.title.slice(0, 200) }));
    } catch (e) {
      toast.error(apiError(e, t("No se pudo previsualizar el enlace")));
    } finally {
      setPreviewing(false);
    }
  };

  const scanOne = async (s) => {
    setScanningId(s.id);
    try {
      const { data } = await api.post(`/scan/source/${s.id}`, null, { timeout: SCAN_TIMEOUT });
      if (data.status === "error") toast.error(t("Ingesta con error: {detalle}", { detalle: ts(data.message) || t("sin detalle") }));
      else toast.success(t("Ingesta: {nuevas} nuevas de {encontradas}", { nuevas: data.items_new, encontradas: data.items_found }));
      load();
    } catch (e) {
      toast.error(apiError(e, t("No se pudo ingerir la fuente")));
    } finally {
      setScanningId(null);
    }
  };

  const probeOne = async (s) => {
    setProbingId(s.id);
    try {
      const { data } = await api.post(`/ingest/sources/${s.id}/probe`);
      const msg = t("Sonda {estado}: {detalle}", { estado: HEALTH_LABELS[data.status] || data.status, detalle: ts(data.message) || t("sin detalle") });
      if (data.status === "verde") toast.success(msg);
      else toast.warning(msg);
      load();
    } catch (e) {
      toast.error(apiError(e, t("No se pudo ejecutar la sonda")));
    } finally {
      setProbingId(null);
    }
  };

  const toggleIngest = async (s) => {
    setTogglingId(s.id);
    try {
      await api.put(`/sources/${s.id}`, { scrape_enabled: !s.scrape_enabled });
      toast.success(s.scrape_enabled ? t("Ingesta deshabilitada") : t("Ingesta habilitada"));
      load();
    } catch (e) {
      toast.error(apiError(e, t("No se pudo cambiar la ingesta")));
    } finally {
      setTogglingId(null);
    }
  };

  const doDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/sources/${confirmDelete.id}`);
      toast.success(t("Fuente eliminada"));
      setConfirmDelete(null);
      setDetailSource(null);
      load();
    } catch (e) {
      toast.error(apiError(e, t("No se pudo eliminar la fuente")));
    } finally {
      setDeleting(false);
    }
  };

  const importCatalog = async () => {
    setImporting(true);
    try {
      const { data } = await api.post("/ingest/sources/import");
      toast.success(t("Catálogo {version}: {updated} actualizadas, {created} nuevas, {retired} retiradas", { version: data.version, updated: data.updated, created: data.created, retired: data.retired }));
      setConfirmImport(false);
      load();
    } catch (e) {
      toast.error(apiError(e, t("No se pudo importar el catálogo")));
    } finally {
      setImporting(false);
    }
  };

  // Sondeo en lote: corre en el servidor (de a varias fuentes a la vez) y aquí
  // solo se consulta el avance. Así no se corta la petición con 141 fuentes.
  const startBulk = async (scope) => {
    setProbingAll(true);
    try {
      const { data } = await api.post("/ingest/probe/run", null, { params: { scope } });
      setBulk(data);
      toast.info(
        scope === "ab"
          ? t("Sondeando las fuentes de nivel A y B en segundo plano.")
          : t("Sondeando {n} fuente(s) en segundo plano. Puede seguir trabajando; el avance se ve en «Salud de fuentes».", { n: data.total })
      );
    } catch (e) {
      toast.error(apiError(e, t("No se pudo iniciar el sondeo")));
    } finally {
      setProbingAll(false);
    }
  };
  const probeGovernors = () => startBulk("ab");
  const probeEverything = () => {
    setTab("salud");
    startBulk("all");
  };

  // Avance del sondeo en lote: se consulta al abrir la pantalla y cada 3 s mientras corre.
  useEffect(() => {
    let alive = true;
    let timer;
    const poll = async () => {
      try {
        const { data } = await api.get("/ingest/probe/status");
        if (!alive) return;
        setBulk((prev) => {
          if (prev?.running && !data.running) {
            load();
            const c = data.counts || {};
            toast.success(t("Sondeo terminado: {verdes} verdes, {ambar} ámbar y {rojas} rojas.", { verdes: c.verde || 0, ambar: c.ambar || 0, rojas: c.rojo || 0 }));
          }
          return data;
        });
        if (data.running) timer = setTimeout(poll, 3000);
      } catch {
        // El avance es informativo: si falla una consulta, la siguiente lo corrige.
      }
    };
    if (bulk === null || bulk?.running) poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulk?.running]);

  const acceptTerms = async (s) => {
    try {
      await api.post(`/ingest/sources/${s.id}/accept-terms`);
      toast.success(t("Términos aceptados y fechados"));
      setDetailSource(null);
      load();
    } catch (e) {
      toast.error(apiError(e, t("No se pudieron registrar los términos")));
    }
  };

  const exportFile = async (kind) => {
    setExporting(kind);
    const today = new Date().toISOString().slice(0, 10);
    const target = {
      xlsx: ["/sources/export.xlsx", `catalogo_fuentes_iets_${today}.xlsx`],
      csv: ["/sources/export", "catalogo_fuentes_iets.csv"],
      probes: ["/ingest/probe/report.xlsx", `sondas_fuentes_${today}.xlsx`],
    }[kind];
    try {
      await downloadFromApi(api, target[0], target[1]);
      toast.success(kind === "probes" ? t("Informe de sondas descargado") : t("Catálogo descargado"));
    } catch (e) {
      toast.error(apiError(e, t("No se pudo exportar")));
    } finally {
      setExporting("");
    }
  };

  const openDiscover = () => {
    setDiscoverError("");
    setDiscoverOpen(true);
  };

  const toggleDiscoverTech = (code) => {
    setDiscoverForm((f) => ({
      ...f,
      tech_types: f.tech_types.includes(code) ? f.tech_types.filter((x) => x !== code) : [...f.tech_types, code],
    }));
  };

  const runDiscover = async () => {
    setDiscovering(true);
    setDiscoverError("");
    setDiscovery(null);
    setSelected({});
    try {
      const { data } = await api.post(
        "/sources/discover",
        { ...discoverForm, focus: discoverForm.focus.trim(), region: discoverForm.region.trim() },
        { timeout: SCAN_TIMEOUT }
      );
      setDiscovery(data);
      setSelected(Object.fromEntries((data.candidates || []).map((c) => [c.url, true])));
      const n = (data.candidates || []).length;
      if (n) toast.success(t("{n} fuente(s) candidata(s) que no están en el catálogo", { n }));
      else toast.warning(t("No se encontraron fuentes nuevas con ese enfoque"));
    } catch (e) {
      setDiscoverError(apiError(e, t("No se pudo completar la detección de fuentes")));
    } finally {
      setDiscovering(false);
    }
  };

  /** Da de alta una candidata. Devuelve true si quedo registrada (o ya lo estaba). */
  const acceptCandidate = async (c, { quiet = false } = {}) => {
    setAcceptingUrl(c.url);
    try {
      const { data } = await api.post("/sources/discover/accept", { ...c, enable_ingest: enableIngest });
      setAccepted((prev) => ({ ...prev, [c.url]: { title: data.title, existing: false } }));
      if (!quiet) toast.success(t('"{titulo}" dada de alta, pendiente de verificación', { titulo: data.title }));
      return true;
    } catch (e) {
      if (e?.response?.status === 409) {
        setAccepted((prev) => ({ ...prev, [c.url]: { title: apiError(e, t("Ya existe en el catálogo")), existing: true } }));
      }
      if (!quiet) toast.error(apiError(e, t("No se pudo dar de alta la fuente")));
      return false;
    } finally {
      setAcceptingUrl("");
    }
  };

  const acceptSelected = async () => {
    const pending = (discovery?.candidates || []).filter((c) => selected[c.url] && !accepted[c.url]);
    let ok = 0;
    for (const c of pending) {
      if (await acceptCandidate(c, { quiet: true })) ok += 1;
    }
    if (ok) toast.success(t("{n} fuente(s) dada(s) de alta, pendientes de verificación", { n: ok }));
    if (ok < pending.length) toast.warning(t("{n} no se registraron (ya existían o hubo un error)", { n: pending.length - ok }));
    load();
  };

  /** Botones de accion por fuente, con el motivo cuando no aplican. */
  const SourceActions = ({ s, compact = false }) => {
    const ingestWhy = !canScan ? noScan : ingestBlocker(s);
    const deleteWhy = !canWrite ? noWrite : deleteBlocker(s);
    return (
      <div className="fb-toolbar" style={{ justifyContent: compact ? "flex-end" : "flex-start", gap: 4 }}>
        <HintButton size="sm" variant="ghost" hint={t("Ver la ficha completa de la fuente y sus notas")} onClick={() => setDetailSource(s)}>
          {t("Ficha")}
        </HintButton>
        {canScan && (
          <HintButton size="sm" variant="ghost" hint={GLOSSARY.fb_sonda} loading={probingId === s.id} onClick={() => probeOne(s)}>
            <Icon name="pulse" size={14} /> {t("Sonda")}
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
            <Icon name="radar" size={14} /> {t("Ingerir")}
          </HintButton>
        )}
        {canWrite && (
          <>
            <HintButton size="sm" variant="ghost" hint={t("Editar los datos y el adaptador de la fuente")} onClick={() => openAdvanced(s)}>
              <Icon name="edit" size={14} /> {t("Editar")}
            </HintButton>
            {!s.retired && (
              <HintButton
                size="sm"
                variant="ghost"
                hint={s.scrape_enabled ? t("Apagar la ingesta: deja de consultarse, sin borrar nada") : t("Encender la ingesta de esta fuente")}
                loading={togglingId === s.id}
                onClick={() => toggleIngest(s)}
              >
                {s.scrape_enabled ? t("Deshabilitar") : t("Habilitar")}
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
              aria-label={t("Eliminar {nombre}", { nombre: s.title })}
            >
              <Icon name="trash" size={14} />
            </HintButton>
          </>
        )}
      </div>
    );
  };

  const tableColumns = [
    { key: "code", width: 100, label: t("Código"), render: (s) => <span className="catalog-code">{s.catalog_code || "-"}</span> },
    {
      key: "title",
      label: t("Fuente"),
      render: (s) => (
        <button type="button" className="linkish" onClick={() => setDetailSource(s)}>
          {s.title}
        </button>
      ),
    },
    { key: "level", width: 80, label: t("Acceso"), tip: <InfoTip text={GLOSSARY.fb_nivel} label={t("Qué es el nivel de acceso")} />, render: (s) => <Badge tone={s.access_level}>{s.access_level || "-"}</Badge> },
    { key: "tier", width: 100, label: t("Nivel de fuente"), tip: <InfoTip text={GLOSSARY.fb_nivel_fuente} label={t("Qué es el nivel de fuente")} />, render: (s) => optionLabel(options, "source_level", s.source_level || "por_definir") },
    { key: "tech", width: 110, label: t("Tecnologías"), render: (s) => (s.tech_types || []).join(", ") || "-" },
    { key: "connector", width: 120, label: t("Adaptador"), tip: <InfoTip text={GLOSSARY.fb_adaptador} label={t("Qué es el adaptador")} />, render: (s) => s.connector || "html" },
    { key: "health", width: 100, label: t("Salud"), tip: <InfoTip text={GLOSSARY.fb_salud} label={t("Qué es la salud")} />, render: (s) => <Badge tone={healthTone(s.health_status)}>{HEALTH_LABELS[s.health_status || "sin_sonda"] || s.health_status}</Badge> },
    {
      key: "watch",
      width: 90,
      label: t("Ingesta"),
      tip: <InfoTip text={GLOSSARY.fb_ingesta} label={t("Qué es la ingesta")} />,
      render: (s) => (s.retired ? <Badge tone="viewer">{t("Retirada")}</Badge> : s.scrape_enabled ? <Badge tone="ok">{t("Activa")}</Badge> : <Badge tone="viewer">{t("Apagada")}</Badge>),
    },
    { key: "signals", width: 80, label: t("Señales"), align: "right", render: (s) => s.findings_count || 0 },
    { key: "actions", width: 330, align: "right", label: t("Acciones"), render: (s) => <SourceActions s={s} compact /> },
  ];

  if (loading) return <LoadingBlock label={t("Cargando catálogo verificado de fuentes...")} />;

  const currentConnector = connectorByCode[form.connector];

  return (
    <div>
      <ModuleHeader
        step="identificacion"
        title={t("Catálogo de fuentes proactivas")}
        titleHint={GLOSSARY.catalogo_fuentes}
        purpose={t("Inventario RF01 / D-06: fuentes verificadas clasificadas por contrato de datos. Las de nivel A y B sostienen el pipeline; el resto lo enriquece.")}
        actions={
          <div className="fb-toolbar">
            <ActionMenu
              label={t("Descargar")}
              icon="doc"
              testId="sources-download-menu"
              loading={Boolean(exporting)}
              items={[
                {
                  key: "xlsx",
                  label: t("Descargar Excel"),
                  icon: "doc",
                  description: t("Catálogo en .xlsx: fuentes con filtros e hipervínculos, fuentes tipo E, resumen y retiradas."),
                  onSelect: () => exportFile("xlsx"),
                  testId: "sources-export-xlsx",
                },
                {
                  key: "csv",
                  label: "CSV",
                  icon: "list",
                  description: t("El mismo listado en CSV (separado por punto y coma), para otros programas"),
                  onSelect: () => exportFile("csv"),
                },
              ]}
            />
            <ActionMenu
              label={t("Mantenimiento")}
              icon="pulse"
              testId="sources-maintenance-menu"
              loading={probingAll}
              items={[
                {
                  key: "probe",
                  label: t("Sondear todas"),
                  icon: "pulse",
                  description: t("Prueba todas las fuentes activas en segundo plano y deja su estado verde, ámbar o rojo y un informe en Excel."),
                  disabled: !canScan || bulk?.running,
                  disabledHint: bulk?.running ? t("Ya hay un sondeo en curso") : noScan,
                  onSelect: probeEverything,
                  testId: "sources-probe-all",
                },
                {
                  key: "reload",
                  label: t("Recargar catálogo"),
                  icon: "layers",
                  description: GLOSSARY.fb_recargar_catalogo,
                  disabled: !canWrite,
                  disabledHint: noWrite,
                  onSelect: () => setConfirmImport(true),
                },
              ]}
            />
            <ActionMenu
              label={t("Agregar fuente")}
              icon="plus"
              variant="primary"
              align="right"
              testId="sources-add-menu"
              items={[
                {
                  key: "quick",
                  label: t("Alta rápida"),
                  icon: "plus",
                  description: GLOSSARY.fb_alta_rapida,
                  disabled: !canWrite,
                  disabledHint: noWrite,
                  onSelect: () => { setQuick(QUICK_EMPTY); setPreview(null); setQuickOpen(true); },
                },
                {
                  key: "full",
                  label: t("Registro completo"),
                  icon: "cog",
                  description: t("Registrar una fuente con adaptador, nivel, frecuencia y configuración"),
                  disabled: !canWrite,
                  disabledHint: noWrite,
                  onSelect: () => openAdvanced(),
                },
                {
                  key: "matrix",
                  label: t("Cargar matriz"),
                  icon: "doc",
                  description: t("Sube el Excel de la matriz de fuentes o una hoja de Google Sheets: muestra las diferencias y no guarda nada hasta que usted confirme."),
                  disabled: !canWrite,
                  disabledHint: noWrite,
                  onSelect: () => setMatrixOpen(true),
                },
                {
                  key: "discover",
                  label: t("Detectar fuentes con IA"),
                  icon: "spark",
                  description: DISCOVER_HINT,
                  disabled: !canWrite,
                  disabledHint: noWrite,
                  onSelect: openDiscover,
                },
              ]}
            />
          </div>
        }
      />

      {!canWrite && (
        <div className="fb-readonly-note" data-testid="sources-readonly">
          <Icon name="info" size={16} />
          <span>{t("Modo consulta: {motivo} Puede ver fichas, salud y cobertura, y descargar el CSV.", { motivo: noWrite })}</span>
        </div>
      )}

      <PhaseGuide
        phase={t("Módulo 0 · Identificación")}
        hint={GLOSSARY.catalogo_fuentes}
        tasks={[
          t("Las fuentes de nivel A y B gobiernan el pre-llenado de P1, P5 y P6."),
          t("Una sonda ámbar o roja suspende la ingesta de esa fuente; el silencio no se confunde con 'no hay tecnologías'."),
          t("Las fuentes de nivel D confirman; nunca sobreescriben un campo que ya trajo una A o B."),
        ]}
        nextLabel={t("Ejecutar vigilancia")}
        onNext={() => navigate("/vigilancia")}
      />

      <ModuleStatsRow
        items={[
          { label: t("Fuentes del catálogo"), value: stats.total, sub: t("{n} retiradas del inventario anterior", { n: retired.length }), hint: t("Fuentes vigentes del inventario (no cuenta las retiradas del catálogo anterior).") },
          { label: t("Contrato A/B"), value: stats.governors, sub: t("Sostienen el pipeline"), hint: GLOSSARY.fb_nivel },
          { label: t("Ingesta activa"), value: stats.vigiladas, hint: GLOSSARY.fb_ingesta },
          { label: t("Fuentes de contraste"), value: stats.contrast, sub: t("Control de cobertura"), hint: GLOSSARY.fb_contraste },
          { label: t("Fuentes primarias"), value: stats.primarias, hint: GLOSSARY.fb_nivel_fuente },
          {
            label: t("URL original de la matriz"),
            value: stats.urlMatriz,
            sub: stats.urlDistinta ? t("{n} con otra URL (ver etiqueta)", { n: stats.urlDistinta }) : t("Todas usan la URL del Excel"),
            hint: t("Fuentes cuya URL principal es la que reporta la matriz EH (Excel). Las demás llevan una etiqueta que dice por qué usan otra: API oficial, página específica o URL de la matriz que no responde."),
          },
          { label: t("Con búsqueda web"), value: stats.buscables, sub: meta.web_search?.enabled === false ? t("Apagada en Parámetros de fuentes") : t("IA + motores en el dominio"), hint: GLOSSARY.fb_flujo_busqueda },
        ]}
      />

      <div className="catalog-tabs">
        {TABS.map((item) => (
          <span key={item.id} className="term-label">
            <button type="button" className={`view-toggle${tab === item.id ? " active" : ""}`} onClick={() => setTab(item.id)}>
              {item.label}
            </button>
            {item.hint && <InfoTip text={item.hint} label={t("Qué es {termino}", { termino: item.label })} />}
          </span>
        ))}
      </div>

      {tab === "catalogo" && (
        <>
          <Card style={{ marginBottom: 16 }} padding={16}>
            <div className="fb-toolbar">
              <input
                placeholder={t("Buscar por código, nombre, alias o URL...")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="filter-input"
                aria-label={t("Buscar fuente")}
                style={{ flex: 1, minWidth: 200 }}
              />
              <select value={blockFilter} onChange={(e) => setBlockFilter(e.target.value)} className="filter-select" aria-label={t("Filtrar por bloque")}>
                <option value="">{t("Todos los bloques")}</option>
                {BLOCKS.map((c) => (
                  <option key={c} value={c}>{blockLabel(c)}</option>
                ))}
              </select>
              <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} className="filter-select" aria-label={t("Filtrar por nivel de acceso")}>
                <option value="">{t("Todo nivel de acceso")}</option>
                {LEVELS.map((l) => (
                  <option key={l.value} value={l.value}>{t("Acceso {nivel}", { nivel: l.value })}</option>
                ))}
              </select>
              <select value={tierFilter} onChange={(e) => setTierFilter(e.target.value)} className="filter-select" aria-label={t("Filtrar por nivel de fuente")}>
                <option value="">{t("Primaria, secundaria...")}</option>
                {(options.source_level || []).map((o) => (
                  <option key={o.value} value={o.value}>{ts(o.label)}</option>
                ))}
              </select>
              <select value={techFilter} onChange={(e) => setTechFilter(e.target.value)} className="filter-select" aria-label={t("Filtrar por tipo de tecnología")}>
                <option value="">{t("Toda tecnología")}</option>
                {(options.tech_type || []).map((o) => (
                  <option key={o.value} value={o.value}>{o.value} · {ts(o.label)}</option>
                ))}
              </select>
              <select value={healthFilter} onChange={(e) => setHealthFilter(e.target.value)} className="filter-select" aria-label={t("Filtrar por salud")}>
                <option value="">{t("Cualquier salud")}</option>
                {Object.entries(HEALTH_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <label className="catalog-check">
                <input type="checkbox" checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)} />
                <TermLabel tip={GLOSSARY.fb_retirada}>{t("Incluir retiradas")}</TermLabel>
              </label>
              <div style={{ display: "flex", gap: 4, background: "#F1F5F9", padding: 4, borderRadius: 8 }}>
                <button type="button" onClick={() => setViewMode("registry")} className={`view-toggle${viewMode === "registry" ? " active" : ""}`}>{t("Tarjetas")}</button>
                <button type="button" onClick={() => setViewMode("table")} className={`view-toggle${viewMode === "table" ? " active" : ""}`}>{t("Tabla")}</button>
              </div>
              <span style={{ fontSize: 13, color: "#64748B" }} data-testid="sources-count">{t("{n} fuentes", { n: filtered.length })}</span>
            </div>
          </Card>

          {filtered.length === 0 ? (
            <Card>
              <EmptyState
                icon="🌐"
                title={t("Sin fuentes que coincidan")}
                message={
                  sources.length === 0
                    ? t("El inventario está vacío. Recargue el catálogo verificado D-06 o registre una fuente.")
                    : t("Ajuste la búsqueda o los filtros, o marque 'Incluir retiradas'.")
                }
                action={
                  anyFilter ? (
                    <Button variant="secondary" onClick={clearFilters}>
                      {t("Limpiar filtros")}
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
                          <span className="catalog-code">{s.catalog_code || t("sin código")}</span>
                          <span title={GLOSSARY.fb_nivel}><Badge tone={s.access_level}>{t("Acceso {nivel}", { nivel: s.access_level || "-" })}</Badge></span>
                          <MatrixBadges source={s} options={options} />
                          <span title={GLOSSARY.fb_salud}><Badge tone={healthTone(s.health_status)}>{HEALTH_LABELS[s.health_status || "sin_sonda"] || s.health_status}</Badge></span>
                          {s.is_contrast && <span title={GLOSSARY.fb_contraste}><Badge tone="info">{t("Contraste")}</Badge></span>}
                          {s.retired && <span title={GLOSSARY.fb_retirada}><Badge tone="viewer">{t("Retirada")}</Badge></span>}
                          {!s.retired && !s.scrape_enabled && <span title={GLOSSARY.fb_ingesta}><Badge tone="viewer">{t("Ingesta apagada")}</Badge></span>}
                        </div>
                        <h4>{s.title}</h4>
                        {s.url && (
                          <a href={s.url} target="_blank" rel="noreferrer" className="registry-url">
                            {s.url.replace(/^https?:\/\//, "").slice(0, 56)}
                          </a>
                        )}
                        <UrlOriginTag source={s} />
                        <p>{s.description?.slice(0, 140) || t("Sin descripción.")}</p>
                        <div className="registry-card-stats">
                          <span title={GLOSSARY.fb_adaptador}>{s.connector}</span>
                          <span title={GLOSSARY.fb_frecuencia}>{frequencyLabel(s.sync_frequency) || "-"}</span>
                          <span>{s.country || s.language}</span>
                          <span>{t("{n} señales", { n: s.findings_count || 0 })}</span>
                          {(s.tech_types || []).length > 0 && <span title={GLOSSARY.fb_tipos_tecnologia}>{s.tech_types.join(" · ")}</span>}
                          {s.requires_api_key && <span title={t("Funciona sin llave, pero con un cupo bajo. Configúrela en Configuración > Llaves de fuentes.")}>{t("requiere llave")}</span>}
                        </div>
                        {s.scrape_enabled && !s.retired && (
                          <div className="source-flow-chips" title={GLOSSARY.fb_flujo_fuente}>
                            {Object.entries(FLOW_SHORT).map(([k, label]) => (
                              <span key={k} className={`flow-chip${s.scan_profile?.[k] === false ? " off" : ""}`}>{label}</span>
                            ))}
                          </div>
                        )}
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
          <div className="fb-toolbar" style={{ justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontSize: 14, flex: "1 1 320px" }} data-testid="probe-bulk-state">
              {bulk?.running ? (
                <>
                  <strong>
                    {t("Sondeando {n} de {total}…", { n: bulk.done, total: bulk.total })}
                  </strong>{" "}
                  <span style={{ color: "#64748b" }}>
                    {t("{verdes} verdes · {ambar} ámbar · {rojas} rojas", { verdes: bulk.counts?.verde || 0, ambar: bulk.counts?.ambar || 0, rojas: bulk.counts?.rojo || 0 })}
                    {bulk.current?.length ? " · " + t("ahora: {lista}", { lista: bulk.current.slice(0, 2).join(", ") }) : ""}
                  </span>
                  <div className="probe-progress" aria-hidden="true">
                    <div style={{ width: `${bulk.total ? Math.round((100 * bulk.done) / bulk.total) : 0}%` }} />
                  </div>
                </>
              ) : bulk?.finished_at ? (
                <span style={{ color: "#64748b" }}>
                  {bulk.by
                    ? t("Último sondeo en lote: {fecha} ({total} fuentes, por {quien}).", { fecha: new Date(bulk.finished_at).toLocaleString(intlLocale()), total: bulk.total, quien: bulk.by })
                    : t("Último sondeo en lote: {fecha} ({total} fuentes).", { fecha: new Date(bulk.finished_at).toLocaleString(intlLocale()), total: bulk.total })}
                </span>
              ) : (
                <span style={{ color: "#64748b" }}>{t("Use «Sondear todas» para probar el inventario completo.")}</span>
              )}
            </div>
            <div className="fb-toolbar">
              <HintButton
                size="sm"
                variant="outline"
                hint={GLOSSARY.fb_sondear_ab}
                disabledHint={bulk?.running ? t("Ya hay un sondeo en curso") : noScan}
                disabled={!canScan || bulk?.running}
                onClick={probeGovernors}
              >
                {t("Solo A/B")}
              </HintButton>
              <HintButton
                size="sm"
                variant="secondary"
                hint={t("Informe en Excel de todas las fuentes: estado de la sonda, detalle y acción sugerida (rojas y ámbar primero).")}
                onClick={() => exportFile("probes")}
                loading={exporting === "probes"}
                data-testid="probe-report-xlsx"
              >
                <Icon name="doc" size={14} /> {t("Informe de sondas (Excel)")}
              </HintButton>
            </div>
          </div>
          <div className="health-counts">
            {["verde", "ambar", "rojo", "sin_sonda"].map((k) => (
              <div key={k} className={`health-pill health-pill--${k}`}>
                <strong>{health?.counts?.[k] ?? 0}</strong>
                <span>{HEALTH_LABELS[k]}</span>
              </div>
            ))}
          </div>
          <p className="catalog-legend">{GLOSSARY.fb_salud} {t("El silencio de una fuente A no significa «no hay tecnologías nuevas».")}</p>
          <DataTable
            stack
            columns={[
              { key: "code", width: 100, label: t("Código"), render: (s) => s.catalog_code || "-" },
              { key: "title", label: t("Fuente"), render: (s) => s.title },
              { key: "level", width: 80, label: t("Acceso"), tip: <InfoTip text={GLOSSARY.fb_nivel} />, render: (s) => <Badge tone={s.access_level}>{s.access_level}</Badge> },
              { key: "status", width: 100, label: t("Estado"), render: (s) => <Badge tone={healthTone(s.health_status)}>{HEALTH_LABELS[s.health_status || "sin_sonda"] || s.health_status}</Badge> },
              { key: "msg", label: t("Detalle"), render: (s) => ts(s.message) || "-" },
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
                      {t("Repetir sonda")}
                    </HintButton>
                  ) : null,
              },
            ]}
            rows={(health?.items || []).map((s) => ({ key: s.id, data: s }))}
            minWidth={860}
            emptyMessage={t("Aún no hay sondas registradas. Use «Sondear todas» para la primera.")}
          />
        </Card>
      )}

      {tab === "cobertura" && (
        <Card>
          <h3 style={{ marginTop: 0 }}>{t("Huecos frente a fuentes de contraste")}</h3>
          <p className="catalog-legend">
            {coverage?.cycle_code
              ? t("Tecnologías que aparecen en PCORI, CDA-AMC, NIHRIO, ACE, ScanMedicine o INAHTA y no están en {ciclo}. Si el contraste las tiene y el IETS no, hay que justificar el hueco.", { ciclo: coverage.cycle_code })
              : t("Tecnologías que aparecen en PCORI, CDA-AMC, NIHRIO, ACE, ScanMedicine o INAHTA y no están en el ciclo activo. Si el contraste las tiene y el IETS no, hay que justificar el hueco.")}
          </p>
          <ModuleStatsRow
            items={[
              { label: t("Ciclo"), value: coverage?.cycle_code || "-", sub: t("{n} tecnologías", { n: coverage?.cycle_size || 0 }), hint: t("Ciclo contra el que se mide la cobertura (el activo).") },
              { label: t("Captadas en contraste"), value: coverage?.contrast_captured || 0, hint: GLOSSARY.fb_contraste },
              { label: t("Huecos"), value: coverage?.gap_count || 0, color: coverage?.gap_count ? "#F59E0B" : undefined, hint: GLOSSARY.fb_cobertura },
            ]}
          />
          {(coverage?.gaps || []).length === 0 ? (
            <EmptyState
              icon="✓"
              title={t("Sin huecos detectados")}
              message={t("Aún no hay señales de contraste, o todas ya están en el ciclo. Ejecute la vigilancia de PCORI, CDA-AMC o ScanMedicine.")}
            />
          ) : (
            <DataTable
              stack
              columns={[
                { key: "name", label: t("Tecnología"), render: (g) => <strong>{g.commercial_name || g.inn_name}</strong> },
                { key: "src", label: t("Fuente"), render: (g) => `${g.catalog_code} · ${g.source_title}` },
                { key: "nct", label: "NCT", render: (g) => (g.nct_ids || []).join(", ") || "-" },
                { key: "ind", label: t("Indicación"), render: (g) => g.indication || "-" },
              ]}
              rows={(coverage?.gaps || []).map((g) => ({ key: g.technology_id, data: g }))}
              minWidth={820}
            />
          )}
        </Card>
      )}

      {/* Deteccion de fuentes con IA */}
      <MatrixImportModal
        open={matrixOpen}
        onClose={() => setMatrixOpen(false)}
        onApplied={() => load()}
        connectors={connectors}
        toast={toast}
      />

      <Modal
        open={discoverOpen}
        onClose={() => !discovering && setDiscoverOpen(false)}
        title={t("Detectar fuentes con IA")}
        width={860}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDiscoverOpen(false)} disabled={discovering}>{t("Cerrar")}</Button>
            {(discovery?.candidates || []).length > 0 && (
              <Button
                variant="outline"
                onClick={acceptSelected}
                loading={Boolean(acceptingUrl)}
                disabled={discovering || !(discovery.candidates || []).some((c) => selected[c.url] && !accepted[c.url])}
              >
                {t("Dar de alta las seleccionadas")}
              </Button>
            )}
            <Button onClick={runDiscover} loading={discovering}>
              <Icon name="spark" size={15} /> {discovery ? t("Detectar de nuevo") : t("Detectar")}
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 13, color: "#64748B", marginTop: 0 }}>{DISCOVER_HINT}</p>
        <fieldset style={{ border: 0, padding: 0, margin: "0 0 12px" }}>
          <legend style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{t("Tipos de tecnología (opcional)")}</legend>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {(options.tech_type || []).map((o) => (
              <label key={o.value} className="catalog-check" title={ts(o.description || o.label)}>
                <input type="checkbox" checked={discoverForm.tech_types.includes(o.value)} onChange={() => toggleDiscoverTech(o.value)} disabled={discovering} />
                {o.value} · {ts(o.label)}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="fb-grid-2">
          <Input
            id="discover-focus"
            label={t("Tema o enfoque (opcional)")}
            placeholder={t("Ej.: terapias génicas, oncología de precisión")}
            maxLength={200}
            value={discoverForm.focus}
            disabled={discovering}
            onChange={(e) => setDiscoverForm({ ...discoverForm, focus: e.target.value })}
          />
          <Input
            id="discover-region"
            label={t("País o región (opcional)")}
            placeholder={t("Ej.: Latinoamérica, Brasil, Europa")}
            maxLength={120}
            value={discoverForm.region}
            disabled={discovering}
            onChange={(e) => setDiscoverForm({ ...discoverForm, region: e.target.value })}
          />
        </div>
        <label className="catalog-check" style={{ marginBottom: 8 }}>
          <input type="checkbox" checked={enableIngest} onChange={(e) => setEnableIngest(e.target.checked)} />
          {t("Activar la ingesta al dar de alta (si no, queda apagada hasta verificarla)")}
        </label>

        {discoverError && <p className="public-submit-error" role="alert">{discoverError}</p>}
        {discovering && (
          <p role="status" aria-live="polite" style={{ fontSize: 13, color: "#475569" }}>
            {t("Buscando en la web y comparando con el catálogo. Puede tardar uno o dos minutos...")}
          </p>
        )}

        {discovery && !discovering && (
          <div aria-live="polite">
            {discovery.message && (
              <p role="status" style={{ fontSize: 12.5, color: "#92400E", background: "#FFFBEB", padding: "8px 10px", borderRadius: 8 }}>
                {ts(discovery.message)}
              </p>
            )}
            <p style={{ fontSize: 12.5, color: "#64748B" }}>
              {discovery.query_origin === "ia"
                ? t("{n} consulta(s) redactadas por la IA", { n: discovery.queries?.length || 0 })
                : t("{n} consulta(s) por reglas", { n: discovery.queries?.length || 0 })}
              {" · "}{t("{n} llamada(s) a la IA (máx. {max})", { n: discovery.ai_calls, max: discovery.limits?.max_ai_calls })}
              {" · "}{t("{n} ya en el catálogo", { n: (discovery.already_in_catalog || []).length })}
              {" · "}{t("{n} descartada(s) por no responder", { n: (discovery.discarded || []).length })}
            </p>
            {(discovery.candidates || []).length === 0 ? (
              <EmptyState icon="🔎" title={t("Sin fuentes nuevas")} message={t("Pruebe con otro tema, otra región u otros tipos de tecnología.")} />
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
                {discovery.candidates.map((c) => {
                  const done = accepted[c.url];
                  return (
                    <li key={c.url} style={{ border: "1px solid #E2E8F0", borderRadius: 10, padding: 12, background: done ? "#F8FAFC" : "#fff" }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <input
                          type="checkbox"
                          aria-label={t("Seleccionar {nombre}", { nombre: c.name })}
                          checked={Boolean(selected[c.url]) && !done}
                          disabled={Boolean(done)}
                          onChange={(e) => setSelected((prev) => ({ ...prev, [c.url]: e.target.checked }))}
                          style={{ width: 18, height: 18, marginTop: 2 }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                            <strong>{c.name}</strong>
                            <Badge tone={c.access_level}>{t("Acceso {nivel}", { nivel: c.access_level })}</Badge>
                            <Badge tone="info">{optionLabel(options, "source_level", c.source_level)}</Badge>
                            {c.origin === "ia" && <span title={t("Propuesta por el conocimiento de la IA, no por un resultado de búsqueda")}><Badge tone="warning">{t("Conocimiento IA")}</Badge></span>}
                            {c.reachable?.status >= 400 && <span title={ts(c.reachable.detail)}><Badge tone="ambar">{t("Acceso restringido")}</Badge></span>}
                          </div>
                          <a href={c.url} target="_blank" rel="noreferrer" className="registry-url">{c.url.replace(/^https?:\/\//, "").slice(0, 80)}</a>
                          <p style={{ margin: "4px 0", fontSize: 13 }}>{c.justification || t("Sin justificación.")}</p>
                          <p style={{ margin: 0, fontSize: 12, color: "#64748B" }}>
                            {blockLabel(c.category)} · {c.country || t("País sin determinar")} · {(c.tech_types || []).join(", ") || "-"}
                          </p>
                        </div>
                        <div style={{ flex: "0 0 auto" }}>
                          {done ? (
                            <Badge tone={done.existing ? "viewer" : "ok"}>{done.existing ? t("Ya existe") : t("Dada de alta")}</Badge>
                          ) : (
                            <Button size="sm" variant="outline" loading={acceptingUrl === c.url} disabled={Boolean(acceptingUrl)} onClick={() => acceptCandidate(c).then((ok) => ok && load())}>
                              {t("Dar de alta")}
                            </Button>
                          )}
                        </div>
                      </div>
                      {done?.existing && <p style={{ margin: "6px 0 0 28px", fontSize: 12, color: "#64748B" }}>{done.title}</p>}
                    </li>
                  );
                })}
              </ul>
            )}
            {(discovery.already_in_catalog || []).length > 0 && (
              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: "pointer", fontSize: 13 }}>{t("Encontradas que ya están en el catálogo ({n})", { n: discovery.already_in_catalog.length })}</summary>
                <ul style={{ fontSize: 12.5, color: "#475569" }}>
                  {discovery.already_in_catalog.map((e) => (
                    <li key={e.url}>{e.url.replace(/^https?:\/\//, "").slice(0, 70)} → {e.source_title || t("catálogo D-06")} {t("(coincide por {criterio})", { criterio: MATCH_LABELS[e.match] || ts(e.match) })}</li>
                  ))}
                </ul>
              </details>
            )}
            {(discovery.discarded || []).length > 0 && (
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: "pointer", fontSize: 13 }}>{t("Descartadas porque no respondieron ({n})", { n: discovery.discarded.length })}</summary>
                <ul style={{ fontSize: 12.5, color: "#475569" }}>
                  {discovery.discarded.map((d) => (
                    <li key={d.url}>{d.name} · {d.url.replace(/^https?:\/\//, "").slice(0, 70)} · {ts(d.detail)}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </Modal>

      {/* Alta rapida */}
      <Modal
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        title={t("Alta rápida de fuente")}
        width={620}
        footer={
          <>
            <Button variant="secondary" onClick={() => setQuickOpen(false)} disabled={saving}>{t("Cancelar")}</Button>
            <Button onClick={saveQuick} loading={saving}>{t("Registrar fuente")}</Button>
          </>
        }
      >
        <p style={{ fontSize: 13, color: "#64748B", marginTop: 0 }}>{GLOSSARY.fb_alta_rapida}</p>
        <Input id="quick-title" label={t("Nombre")} required value={quick.title} onChange={(e) => setQuick({ ...quick, title: e.target.value })} />
        <div className="fb-inline-row">
          <Input id="quick-url" label="URL" required hint={GLOSSARY.fb_url} placeholder="https://..." value={quick.url} onChange={(e) => setQuick({ ...quick, url: e.target.value })} />
          <div style={{ flex: "0 0 auto", marginBottom: 14 }}>
            <HintButton variant="outline" hint={GLOSSARY.fb_vista_previa} disabledHint={noScan} disabled={!canScan} loading={previewing} onClick={runPreview}>
              <Icon name="eye" size={15} /> {t("Vista previa")}
            </HintButton>
          </div>
        </div>
        <Select id="quick-block" label={t("Bloque")} value={quick.category} onChange={(e) => setQuick({ ...quick, category: e.target.value })}>
          {BLOCKS.map((c) => <option key={c} value={c}>{blockLabel(c)}</option>)}
        </Select>
        {preview && <LinkPreview data={preview} />}
      </Modal>

      {/* Alta y edicion avanzada */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? t("Editar fuente") : t("Agregar fuente")}
        width={820}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>{t("Cancelar")}</Button>
            <Button onClick={save} loading={saving}>{editing ? t("Guardar cambios") : t("Crear fuente")}</Button>
          </>
        }
      >
        {formError && <p className="public-submit-error" role="alert">{formError}</p>}
        {editing?.catalog_code && (
          <p style={{ fontSize: 12.5, color: "#92400E", background: "#FFFBEB", padding: "8px 10px", borderRadius: 8, marginTop: 0 }}>
            {t("Fuente del catálogo D-06 ({codigo}). Recargar el catálogo restituye sus datos oficiales; la nivel de fuente, la ruta de acceso y el flujo que edite aquí se conservan.", { codigo: editing.catalog_code })}
          </p>
        )}
        <Input id="source-title" label={t("Nombre")} required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <Input id="source-url" label="URL" hint={GLOSSARY.fb_url} required={currentConnector?.requires_url ?? true} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
        <div className="fb-grid-2">
          <Select id="source-block" label={t("Bloque")} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {[...new Set([...BLOCKS, form.category].filter(Boolean))].map((c) => <option key={c} value={c}>{blockLabel(c)}</option>)}
          </Select>
          <Select id="source-access" label={t("Nivel de acceso (contrato de datos)")} hint={GLOSSARY.fb_nivel} value={form.access_level} onChange={(e) => setForm({ ...form, access_level: e.target.value })}>
            {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </Select>
          <Select id="source-connector" label={t("Adaptador")} hint={GLOSSARY.fb_adaptador} value={form.connector} onChange={(e) => setForm({ ...form, connector: e.target.value })}>
            {connectors.map((c) => <option key={c.code} value={c.code}>{ts(c.label)} ({c.code})</option>)}
            {!connectorByCode[form.connector] && <option value={form.connector}>{form.connector}</option>}
          </Select>
          <Select id="source-frequency" label={t("Frecuencia")} hint={GLOSSARY.fb_frecuencia} value={form.sync_frequency} onChange={(e) => setForm({ ...form, sync_frequency: e.target.value })}>
            {[...new Set([...FREQUENCIES, form.sync_frequency].filter(Boolean))].map((f) => <option key={f} value={f}>{frequencyLabel(f)}</option>)}
          </Select>
        </div>
        {currentConnector?.description && <p style={{ fontSize: 12.5, color: "#64748B", marginTop: -6 }}>{ts(currentConnector.description)}</p>}
        <div className="fb-grid-2">
          <Input id="source-country" label={t("País o ámbito")} value={form.country || ""} onChange={(e) => setForm({ ...form, country: e.target.value })} />
          <Input id="source-language" label={t("Idioma")} value={form.language || ""} onChange={(e) => setForm({ ...form, language: e.target.value })} />
        </div>
        <Textarea id="source-description" label={t("Descripción")} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
        <Textarea
          id="source-config"
          label={t("Configuración del conector (JSON)")}
          hint={GLOSSARY.fb_config_conector}
          className="fb-json"
          value={form.connectorConfigText}
          onChange={(e) => setForm({ ...form, connectorConfigText: e.target.value })}
          rows={4}
          spellCheck={false}
        />
        <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, marginTop: 6 }}>
          <input type="checkbox" checked={form.scrape_enabled} onChange={(e) => setForm({ ...form, scrape_enabled: e.target.checked })} style={{ width: 18, height: 18 }} />
          <TermLabel tip={GLOSSARY.fb_ingesta}>{t("Ingesta activa (vigilancia masiva y programada)")}</TermLabel>
        </label>
        <SourceMatrixEditor form={form} setForm={setForm} options={options} webSearchOn={meta.web_search?.enabled !== false} />
        {editing && canScan && (
          <div style={{ marginTop: 4 }}>
            <HintButton variant="outline" size="sm" hint={GLOSSARY.fb_probar_busqueda} loading={searchingWeb} onClick={() => testWebSearch(editing)}>
              <Icon name="radar" size={14} /> {t("Probar búsqueda web")}
            </HintButton>
            <WebSearchResult data={webSearch} />
          </div>
        )}
      </Modal>

      <Modal open={!!detailSource} onClose={() => setDetailSource(null)} title={detailSource?.title || t("Fuente")} width={720}>
        {detailSource && (
          <div className="source-fiche">
            <div className="registry-card-top" style={{ marginBottom: 12 }}>
              <span className="catalog-code">{detailSource.catalog_code || t("sin código")}</span>
              <Badge tone={detailSource.access_level}>{t("Acceso {nivel}", { nivel: detailSource.access_level || "-" })}</Badge>
              <MatrixBadges source={detailSource} options={options} />
              <Badge tone={healthTone(detailSource.health_status)}>{HEALTH_LABELS[detailSource.health_status || "sin_sonda"] || detailSource.health_status}</Badge>
              {detailSource.verification_status && <Badge tone={detailSource.verification_status}>{VERIFICATION_LABELS[detailSource.verification_status] || ts(detailSource.verification_status)}</Badge>}
            </div>
            <p>{detailSource.description}</p>
            <dl className="fiche-grid">
              <div><dt><TermLabel tip={GLOSSARY.fb_adaptador}>{t("Adaptador")}</TermLabel></dt><dd>{detailSource.connector}</dd></div>
              <div><dt><TermLabel tip={GLOSSARY.fb_frecuencia}>{t("Frecuencia")}</TermLabel></dt><dd>{frequencyLabel(detailSource.sync_frequency) || "-"}</dd></div>
              <div><dt>{t("País")}</dt><dd>{detailSource.country || "-"}</dd></div>
              <div><dt>{t("Señales capturadas")}</dt><dd>{detailSource.findings_count || 0}</dd></div>
              <div><dt>{t("Última consulta")}</dt><dd>{detailSource.last_scraped_at ? new Date(detailSource.last_scraped_at).toLocaleString(intlLocale()) : t("Nunca")}</dd></div>
              <div><dt>{t("Campos que aporta")}</dt><dd>{(detailSource.provides_fields || []).join(", ") || "-"}</dd></div>
              <div><dt>{t("Alias")}</dt><dd>{(detailSource.aliases || []).join(", ") || "-"}</dd></div>
              <div><dt>{t("Términos")}</dt><dd>{detailSource.terms_accepted_at ? t("Aceptados {fecha}", { fecha: new Date(detailSource.terms_accepted_at).toLocaleDateString(intlLocale()) }) : (detailSource.terms_url || t("No aplican"))}</dd></div>
              {detailSource.last_error && <div><dt>{t("Último error")}</dt><dd>{ts(detailSource.last_error).slice(0, 300)}</dd></div>}
              <div><dt><TermLabel tip={GLOSSARY.fb_nivel_fuente}>{t("Nivel de fuente")}</TermLabel></dt><dd>{optionLabel(options, "source_level", detailSource.source_level || "por_definir")}</dd></div>
              <div><dt><TermLabel tip={GLOSSARY.fb_tipos_tecnologia}>{t("Tipos de tecnología")}</TermLabel></dt><dd>{(detailSource.tech_types || []).map((code) => optionLabel(options, "tech_type", code)).join(", ") || "-"}</dd></div>
              <div><dt>{t("Origen en la matriz")}</dt><dd>{[detailSource.matrix_ref, detailSource.matrix_origin].filter(Boolean).join(" · ") || "-"}</dd></div>
              <div>
                <dt><TermLabel tip={GLOSSARY.fb_flujo_fuente}>{t("Flujo")}</TermLabel></dt>
                <dd>
                  {Object.entries(FLOW_SHORT)
                    .filter(([k]) => detailSource.scan_profile?.[k] !== false)
                    .map(([, label]) => label)
                    .join(" · ") || t("Todo apagado")}
                  {detailSource.scan_profile?.max_pages ? " · " + t("{n} páginas", { n: detailSource.scan_profile.max_pages }) : ""}
                </dd>
              </div>
              {detailSource.material_type && <div><dt>{t("Tipo de material")}</dt><dd>{detailSource.material_type}</dd></div>}
            </dl>
            {(detailSource.access_path || detailSource.consult_info || (detailSource.entry_urls || []).length > 0) && (
              <div className="source-matrix-fiche">
                {detailSource.access_path && <p><strong>{t("Ruta de acceso:")}</strong> {detailSource.access_path}</p>}
                {detailSource.consult_info && <p><strong>{t("Qué consultar:")}</strong> {detailSource.consult_info}</p>}
                {(detailSource.entry_urls || []).length > 0 && (
                  <div>
                    <strong>{t("URLs de entrada:")}</strong>
                    <ul>
                      {detailSource.entry_urls.map((u) => (
                        <li key={u}><a href={u} target="_blank" rel="noreferrer">{u.replace(/^https?:\/\//, "").slice(0, 90)}</a></li>
                      ))}
                    </ul>
                  </div>
                )}
                {(detailSource.reference_urls || []).length > 0 && (
                  <p><strong>{t("Referencias:")}</strong> {detailSource.reference_urls.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer" style={{ marginRight: 8 }}>{u.replace(/^https?:\/\//, "").slice(0, 60)}</a>)}</p>
                )}
                {detailSource.observations && <p><strong>{t("Observaciones:")}</strong> {detailSource.observations}</p>}
                {detailSource.usage_restrictions && <p><strong>{t("Restricciones:")}</strong> {detailSource.usage_restrictions}</p>}
              </div>
            )}
            {detailSource.catalog_note && <p className="catalog-note">{detailSource.catalog_note}</p>}
            <div className="url-origin-detail">
              <strong>{t("URL principal:")}</strong>{" "}
              {detailSource.url ? <a href={detailSource.url} target="_blank" rel="noreferrer">{detailSource.url}</a> : "-"}
              <UrlOriginTag source={detailSource} detailed />
              {detailSource.matrix_url && detailSource.url_origin !== "matriz" && (
                <p style={{ margin: "4px 0 0" }}>
                  <strong>{t("URL original de la matriz:")}</strong>{" "}
                  <a href={detailSource.matrix_url} target="_blank" rel="noreferrer">{detailSource.matrix_url}</a>
                </p>
              )}
            </div>
            <div className="fb-toolbar" style={{ marginBottom: 8 }}>
              {detailSource.url && (
                <a href={detailSource.url} target="_blank" rel="noreferrer">
                  <Button variant="secondary" size="sm"><Icon name="external" size={14} /> {t("Abrir fuente")}</Button>
                </a>
              )}
              {canWrite && detailSource.terms_url && !detailSource.terms_accepted_at && (
                <HintButton size="sm" hint={t("Deja fechado que el IETS aceptó los términos de uso de esta fuente")} onClick={() => acceptTerms(detailSource)}>
                  {t("Registrar aceptación de términos")}
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
        title={t("Eliminar fuente")}
        message={t('Se eliminará "{nombre}" del inventario. No tiene señales capturadas. Esta acción no se puede deshacer.', { nombre: confirmDelete?.title })}
        confirmLabel={t("Eliminar")}
      />
      <ConfirmDialog
        open={confirmImport}
        onClose={() => setConfirmImport(false)}
        onConfirm={importCatalog}
        loading={importing}
        title={t("Recargar catálogo D-06")}
        message={t("Se actualizarán las fuentes oficiales con los datos del catálogo verificado y se retirarán las que ya no estén en el. Las señales nunca se borran. Los datos oficiales (URL, adaptador, nivel de acceso) se restituyen; la priorización, la ruta de acceso y el flujo editados en el panel se conservan.")}
        confirmLabel={t("Recargar")}
        confirmVariant="primary"
      />
    </div>
  );
}
