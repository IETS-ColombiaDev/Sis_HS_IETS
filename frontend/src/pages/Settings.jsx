import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api, { AI_TIMEOUT, apiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../components/Toast";
import { PageHeader, Card, SectionTitle } from "../components/Card";
import { GLOSSARY } from "../constants/glossary";
import Button from "../components/Button";
import Badge from "../components/Badge";
import Icon from "../components/Icon";
import Tooltip from "../components/Tooltip";
import { Input, Select, Textarea } from "../components/Field";
import { LoadingBlock } from "../components/Spinner";
import MethodologyPanel from "../components/MethodologyPanel";
import SchedulePanel from "../components/SchedulePanel";
import SourceParamsPanel from "../components/SourceParamsPanel";
import IntelligencePanel from "../components/IntelligencePanel";
import BackupPanel from "../components/BackupPanel";
import HorizonRulesPanel from "../components/HorizonRulesPanel";
import BrandingPanel from "../components/BrandingPanel";
import { t, ts, intlLocale, fmtDateTime } from "../i18n";

// Las pestañas, agrupadas por tema y en el orden en que se suelen configurar.
const TAB_GROUPS = [
  {
    title: t("Metodología"),
    tabs: [
      { id: "metodologia", label: t("Gobierno metodológico"), icon: "sliders", about: t("Criterios, pesos y umbrales con los que se filtra y se prioriza.") },
      { id: "reglas_horizonte", label: t("Reglas de horizonte"), icon: "filter", about: t("Palabras que incluyen o descartan una señal leída de páginas web.") },
    ],
  },
  {
    title: t("Fuentes y vigilancia"),
    tabs: [
      { id: "parametros_fuentes", label: t("Parámetros de fuentes"), icon: "layers", about: t("Listas de la matriz, búsqueda web y páginas útiles de cada fuente.") },
      { id: "fuentes", label: t("Llaves de fuentes"), icon: "globe", about: t("Llaves de acceso de los registros oficiales de nivel A.") },
      { id: "programacion", label: t("Tareas programadas"), icon: "clock", about: t("Cuándo corren solas la vigilancia y el barrido de duplicados.") },
      { id: "prompts", label: t("Prompts de vigilancia"), icon: "doc", about: t("Instrucciones que sigue la IA al capturar señales.") },
    ],
  },
  {
    title: t("Inteligencia artificial"),
    tabs: [
      { id: "ia", label: t("Integración con IA"), icon: "spark", about: t("Proveedor, llave, modelo y lectura de sitios con OCR.") },
      { id: "inteligencia", label: t("Inteligencia"), icon: "bulb", about: t("Sugerencia de clasificación, base de conocimiento, vigencia de señales y analítica.") },
    ],
  },
  {
    title: t("Datos y respaldo"),
    tabs: [
      { id: "copia_local", label: t("Persistencia (Firebase)"), icon: "save", about: t("Copia de la base, puntos de recuperación y restauración.") },
    ],
  },
  {
    title: t("Apariencia"),
    tabs: [
      { id: "identidad", label: t("Identidad institucional"), icon: "eye", about: t("Logo que se muestra en el menú, el ingreso y las pantallas públicas.") },
    ],
  },
];
const TABS = TAB_GROUPS.flatMap((g) => g.tabs);

export default function Settings() {
  const toast = useToast();
  const { refreshStatus } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = TABS.some((item) => item.id === searchParams.get("tab")) ? searchParams.get("tab") : "metodologia";
  const [tab, setTabState] = useState(initialTab);
  const setTab = (id) => {
    setTabState(id);
    setSearchParams(id === "metodologia" ? {} : { tab: id }, { replace: true });
  };
  // Un enlace interno (?tab=...) abre su pestaña aunque la pantalla ya esté montada.
  const urlTab = searchParams.get("tab");
  useEffect(() => {
    if (urlTab && TABS.some((item) => item.id === urlTab)) setTabState(urlTab);
  }, [urlTab]);
  const [cfg, setCfg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [minimaxToken, setMinimaxToken] = useState("");
  const [showMinimaxToken, setShowMinimaxToken] = useState(false);
  const [openfdaKey, setOpenfdaKey] = useState("");
  const [ncbiKey, setNcbiKey] = useState("");
  const [ncbiEmail, setNcbiEmail] = useState("");
  const [model, setModel] = useState("");
  const [minimaxModel, setMinimaxModel] = useState("");
  const [provider, setProvider] = useState("auto");
  const [ocrEnabled, setOcrEnabled] = useState(false);
  const [webEnabled, setWebEnabled] = useState(true);
  const [scanMaxTokens, setScanMaxTokens] = useState(4096);
  const [scanMaxPages, setScanMaxPages] = useState(8);
  const [fetchTimeout, setFetchTimeout] = useState(25);
  const [childTimeout, setChildTimeout] = useState(15);
  const [aiTimeout, setAiTimeout] = useState(120);
  const [retries, setRetries] = useState(3);
  const [pauseMs, setPauseMs] = useState(350);
  const [traces, setTraces] = useState([]);
  const [prompts, setPrompts] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [banner, setBanner] = useState(null);

  const applyCfg = (data) => {
    setCfg(data);
    setModel(data.gemini_model || "");
    setMinimaxModel(data.minimax_model || "");
    setProvider(data.ai_provider || "auto");
    setOcrEnabled(Boolean(data.ai_ocr_enabled));
    setWebEnabled(data.ai_web_enabled !== false);
    setScanMaxTokens(data.scan_max_tokens || 4096);
    setScanMaxPages(data.scan_max_pages || 8);
    setFetchTimeout(data.scan_fetch_timeout || 25);
    setChildTimeout(data.scan_child_timeout || 15);
    setAiTimeout(data.scan_ai_timeout || 120);
    setRetries(data.scan_retries ?? 3);
    setPauseMs(data.scan_pause_ms ?? 350);
    setNcbiEmail(data.ncbi_email || "");
  };

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/config");
      applyCfg(data);
    } catch (e) {
      toast.error(apiError(e, t("No se pudo cargar la configuración")));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (tab !== "prompts" || prompts) return undefined;
    let cancelled = false;
    api.get("/config/prompts")
      .then(({ data }) => {
        if (!cancelled) setPrompts(data);
      })
      .catch((e) => toast.error(apiError(e, t("No se pudieron cargar los prompts"))));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    if (tab !== "ia") return undefined;
    let cancelled = false;
    api.get("/config/scan-traces")
      .then(({ data }) => {
        if (!cancelled) setTraces(data || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tab]);

  const resetUsage = async () => {
    setSaving(true);
    try {
      const { data } = await api.post("/config/usage/reset");
      applyCfg(data);
      toast.success(t("Contador de tokens reiniciado"));
    } catch (e) {
      toast.error(apiError(e, t("No se pudo reiniciar el uso")));
    } finally {
      setSaving(false);
    }
  };

  const refreshUsage = async () => {
    try {
      const { data } = await api.get("/config/usage");
      applyCfg(data);
      toast.success(ts(data.minimax_plan_summary) || t("Uso de tokens actualizado"));
    } catch (e) {
      toast.error(apiError(e, t("No se pudo consultar el saldo")));
    }
  };

  const testConnection = async (who) => {
    setTesting(true);
    setBanner(null);
    try {
      const payload = { provider: who };
      if (who === "minimax" && minimaxToken.trim()) payload.minimax_api_key = minimaxToken.trim();
      if (who === "gemini" && token.trim()) payload.gemini_api_key = token.trim();
      const { data } = await api.post("/config/test", payload, { timeout: AI_TIMEOUT });
      setBanner({ type: data.ok ? "ok" : "error", message: ts(data.message) });
      if (data.ok) {
        toast.success(t("Conexión {provider} verificada", { provider: who === "gemini" ? "Gemini" : "MiniMax" }));
        if (data.available_models?.length && who === "minimax") {
          setCfg((prev) => ({ ...prev, minimax_available_models: data.available_models, minimax_active_model: data.model }));
        }
      } else toast.error(t("La prueba de conexión falló"));
    } catch (e) {
      const msg = apiError(e, t("No se pudo probar la conexión"));
      setBanner({ type: "error", message: msg });
      toast.error(msg);
    } finally {
      setTesting(false);
    }
  };

  const detectBest = async () => {
    setDetecting(true);
    setBanner(null);
    try {
      const { data } = await api.post("/config/detect-models", null, { timeout: AI_TIMEOUT });
      setBanner({ type: data.ok ? "ok" : "error", message: ts(data.message) });
      if (data.ok) {
        setMinimaxModel("");
        setCfg((prev) => ({
          ...prev,
          minimax_available_models: data.available_models || prev.minimax_available_models,
          minimax_active_model: data.model,
        }));
        toast.success(t("Mejor modelo: {model}", { model: data.model }));
      }
    } catch (e) {
      toast.error(apiError(e, t("No se pudieron detectar modelos")));
    } finally {
      setDetecting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setBanner(null);
    try {
      const payload = {
        gemini_model: model,
        minimax_model: minimaxModel,
        ai_provider: provider,
        ai_ocr_enabled: ocrEnabled,
        ai_web_enabled: webEnabled,
        scan_max_tokens: Number(scanMaxTokens) || 4096,
        scan_max_pages: Number(scanMaxPages) || 8,
        scan_fetch_timeout: Number(fetchTimeout) || 25,
        scan_child_timeout: Number(childTimeout) || 15,
        scan_ai_timeout: Number(aiTimeout) || 120,
        scan_retries: Number(retries) || 0,
        scan_pause_ms: Number(pauseMs) || 0,
      };
      if (token.trim()) payload.gemini_api_key = token.trim();
      if (minimaxToken.trim()) payload.minimax_api_key = minimaxToken.trim();
      const { data } = await api.put("/config", payload);
      applyCfg(data);
      setToken("");
      setMinimaxToken("");
      refreshStatus();
      if (data.ai_enabled) {
        setBanner({
          type: "ok",
          message: data.ai_ocr_enabled
            ? t("IA activa con {provider} · {model}. OCR encendido.", { provider: data.ai_active_provider || "MiniMax", model: data.ai_model || data.minimax_active_model })
            : t("IA activa con {provider} · {model}. OCR apagado.", { provider: data.ai_active_provider || "MiniMax", model: data.ai_model || data.minimax_active_model }),
        });
        toast.success(t("Configuración de IA guardada"));
      } else {
        setBanner({ type: "warn", message: t("Configuración guardada, pero no hay una llave de IA válida.") });
        toast.success(t("Configuración guardada"));
      }
    } catch (e) {
      toast.error(apiError(e, t("No se pudo guardar la configuración")));
    } finally {
      setSaving(false);
    }
  };

  const removeToken = async (kind) => {
    setSaving(true);
    try {
      const payload = kind === "minimax" ? { minimax_api_key: "" } : { gemini_api_key: "" };
      const { data } = await api.put("/config", payload);
      applyCfg(data);
      if (kind === "minimax") setMinimaxToken("");
      else setToken("");
      refreshStatus();
      setBanner({ type: "warn", message: t("Token de {provider} eliminado.", { provider: kind === "minimax" ? "MiniMax" : "Gemini" }) });
      toast.success(t("Token eliminado"));
    } catch (e) {
      toast.error(apiError(e, t("No se pudo eliminar el token")));
    } finally {
      setSaving(false);
    }
  };

  const saveSourceKeys = async (payload, message) => {
    setSaving(true);
    try {
      const { data } = await api.put("/config", payload);
      applyCfg(data);
      setOpenfdaKey("");
      setNcbiKey("");
      toast.success(message);
    } catch (e) {
      toast.error(apiError(e, t("No se pudieron guardar las llaves")));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingBlock label={t("Cargando configuración...")} />;

  const aiOn = Boolean(cfg.ai_enabled);
  const models = cfg.minimax_available_models?.length
    ? cfg.minimax_available_models
    : ["MiniMax-M3", "MiniMax-M2.7", "MiniMax-M2.7-highspeed", "MiniMax-M2.5", "MiniMax-M2.5-highspeed", "MiniMax-M2.1", "MiniMax-M2"];

  return (
    <div>
      <PageHeader
        title={t("Configuración del sistema")}
        titleHint={GLOSSARY.minimax}
        subtitle={t("Metodología, fuentes y vigilancia, inteligencia artificial y respaldo de datos.")}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: 14,
          marginBottom: 24,
        }}
      >
        <StatusCard
          icon="spark"
          label={t("Inteligencia Artificial")}
          value={aiOn ? t("Activa") : t("Sin configurar")}
          tone={aiOn ? "ok" : "warn"}
          sub={aiOn ? `${cfg.ai_active_provider || "minimax"} · ${cfg.ai_model || cfg.minimax_active_model}` : t("Requiere llave de MiniMax")}
          tip={t("MiniMax es el proveedor principal. Gemini queda como respaldo opcional.")}
        />
        <StatusCard
          icon="globe"
          label={t("IA en sitios / OCR")}
          value={!aiOn ? t("Requiere IA") : cfg.ai_ocr_enabled ? t("OCR activo") : cfg.ai_web_enabled ? t("Solo texto") : t("Apagado")}
          tone={!aiOn ? "neutral" : cfg.ai_ocr_enabled ? "ok" : cfg.ai_web_enabled ? "info" : "neutral"}
          sub={cfg.ai_ocr_enabled ? t("Visión: {model}", { model: cfg.minimax_vision_model || "MiniMax-M3" }) : t("La IA puede leer páginas; el OCR es opcional")}
          tip={t("Con OCR, MiniMax-M3 lee imágenes y PDF escaneados de las fuentes.")}
        />
        <StatusCard
          icon="shield"
          label={t("Login con Google")}
          value={cfg.google_login_enabled ? t("Habilitado") : t("Deshabilitado")}
          tone={cfg.google_login_enabled ? "ok" : "neutral"}
          sub={t("Dominio: @{domain}", { domain: cfg.allowed_domain })}
          tip={t("Acceso con cuentas institucionales de Google del dominio permitido.")}
        />
        <StatusCard
          icon="info"
          label={t("Versión del sistema")}
          value={`v${cfg.version}`}
          tone="neutral"
          sub={t("{sources} fuentes · {findings} hallazgos", { sources: cfg.total_sources, findings: cfg.total_findings })}
          tip={t("Versión de la aplicación y volumen del inventario.")}
        />
      </div>

      <div className="settings-layout">
        <nav className="settings-menu" aria-label={t("Secciones de configuración")}>
          {TAB_GROUPS.map((g) => (
            <div key={g.title} className="settings-group">
              <div className="settings-group-title">{g.title}</div>
              <div className="settings-group-tabs">
                {g.tabs.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`settings-nav-item${tab === item.id ? " is-active" : ""}`}
                    onClick={() => setTab(item.id)}
                    title={item.about}
                    aria-pressed={tab === item.id}
                  >
                    <span className="settings-nav-icon" aria-hidden="true">
                      <Icon name={item.icon} size={16} />
                    </span>
                    <span className="settings-nav-label">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="settings-content">
          <header className="settings-about" data-testid="settings-about">
            <span className="settings-about-icon" aria-hidden="true">
              <Icon name={TABS.find((item) => item.id === tab)?.icon || "cog"} size={18} />
            </span>
            <div>
              <h2>{TABS.find((item) => item.id === tab)?.label}</h2>
              <p>{TABS.find((item) => item.id === tab)?.about}</p>
            </div>
          </header>

      {tab === "metodologia" && <MethodologyPanel />}
      {tab === "identidad" && <BrandingPanel toast={toast} />}

      {tab === "programacion" && <SchedulePanel />}

      {tab === "parametros_fuentes" && <SourceParamsPanel toast={toast} />}
      {tab === "reglas_horizonte" && <HorizonRulesPanel toast={toast} />}
      {tab === "inteligencia" && <IntelligencePanel toast={toast} />}

      {tab === "copia_local" && <BackupPanel />}

      {tab === "prompts" && (
        <PromptsPanel
          prompts={prompts}
          setPrompts={setPrompts}
          toast={toast}
          saving={saving}
          setSaving={setSaving}
        />
      )}

      {tab === "ia" && (
      <div>
      <ScanIngestFlow cfg={cfg} webEnabled={webEnabled} ocrEnabled={ocrEnabled} fetchTimeout={fetchTimeout} childTimeout={childTimeout} aiTimeout={aiTimeout} retries={retries} pauseMs={pauseMs} scanMaxPages={scanMaxPages} />
      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 16, marginTop: 16 }} className="dash-grid">
        <Card>
          <SectionTitle
            hint={GLOSSARY.minimax}
            right={
              <Badge tone={aiOn ? "ok" : "warn"}>
                {aiOn ? t("Conectado · {provider}", { provider: cfg.ai_active_provider || "minimax" }) : t("No conectado")}
              </Badge>
            }
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <Icon name="key" size={18} /> {t("MiniMax (IA principal)")}
            </span>
          </SectionTitle>

          <p style={{ fontSize: 13, color: "#64748B", marginTop: -6, marginBottom: 16 }}>
            {t("MiniMax entra a las páginas de las fuentes, estructura señales de horizonte y, si lo habilita, lee imágenes y PDF escaneados con MiniMax-M3. La llave no se muestra completa.")}
          </p>

          {banner && <AlertBanner type={banner.type} message={banner.message} onClose={() => setBanner(null)} />}

          {cfg.minimax_has_key && (
            <MaskedKey
              label={t("Llave MiniMax")}
              value={cfg.minimax_key_masked}
              onRemove={() => removeToken("minimax")}
              saving={saving}
            />
          )}

          <SecretInput
            label={cfg.minimax_has_key ? t("Nueva llave MiniMax (reemplaza la actual)") : t("API Key de MiniMax")}
            placeholder={t("sk-cp-... o sk-api-...")}
            value={minimaxToken}
            show={showMinimaxToken}
            onToggle={() => setShowMinimaxToken((s) => !s)}
            onChange={setMinimaxToken}
          />

          <Select label={t("Proveedor")} hint={t("Automático usa MiniMax si tiene llave y, si falla, Gemini. Elija uno solo si quiere forzarlo.")} value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="auto">{t("Automático (MiniMax si hay llave; si no, Gemini)")}</option>
            <option value="minimax">{t("Solo MiniMax")}</option>
            <option value="gemini">{t("Solo Gemini")}</option>
            <option value="off">{t("Apagada (sin IA; se usan los modos de respaldo)")}</option>
          </Select>

          <Select label={t("Modelo MiniMax")} hint={t("Automático elige el mejor modelo que responda con su llave. Use Detectar mejor modelo para probarlo.")} value={minimaxModel} onChange={(e) => setMinimaxModel(e.target.value)}>
            <option value="">{t("Automático (mejor modelo disponible)")}</option>
            {models.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
            {minimaxModel && !models.includes(minimaxModel) && (
              <option value={minimaxModel}>{minimaxModel}</option>
            )}
          </Select>

          <ToggleRow
            checked={webEnabled}
            onChange={setWebEnabled}
            title={t("Paso 7 · IA entra a los sitios web")}
            text={t("MiniMax lee el texto ya visitado (pasos 2-5) y nombra tecnologías. Si falla, se conserva la heurística del paso 4.")}
          />
          <ToggleRow
            checked={ocrEnabled}
            onChange={setOcrEnabled}
            title={t("Paso 6 · OCR con MiniMax-M3")}
            text={t("Solo corre si el PDF o la página no entregan texto. Visión: {model}.", { model: cfg.minimax_vision_model || "MiniMax-M3" })}
          />

          <Input
            id="scan-max-tokens"
            label={t("Tokens máximos por llamada de vigilancia")}
            hint={GLOSSARY.token_ia}
            type="number"
            min={256}
            max={8192}
            value={scanMaxTokens}
            onChange={(e) => setScanMaxTokens(e.target.value)}
          />
          <Input
            id="scan-max-pages"
            label={t("Páginas internas a visitar por fuente")}
            hint={t("El rastreador entra al listado y sigue hasta esta cantidad de fichas del mismo sitio.")}
            type="number"
            min={1}
            max={20}
            value={scanMaxPages}
            onChange={(e) => setScanMaxPages(e.target.value)}
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
            <Input id="scan-fetch-timeout" label={t("Timeout de descarga (s)")} type="number" min={5} max={90} value={fetchTimeout} onChange={(e) => setFetchTimeout(e.target.value)} hint={t("Tiempo máximo para abrir la URL de la fuente.")} />
            <Input id="scan-child-timeout" label={t("Timeout de fichas (s)")} type="number" min={5} max={60} value={childTimeout} onChange={(e) => setChildTimeout(e.target.value)} hint={t("Cada ficha interna. Si una falla, el rastreo sigue.")} />
            <Input id="scan-ai-timeout" label={t("Timeout de MiniMax (s)")} type="number" min={15} max={120} value={aiTimeout} onChange={(e) => setAiTimeout(e.target.value)} hint={t("Si MiniMax no responde, se queda la heurística local.")} />
            <Input id="scan-retries" label={t("Reintentos HTTP")} type="number" min={0} max={6} value={retries} onChange={(e) => setRetries(e.target.value)} hint={t("Reintenta 429, 502, 503, 504 y cortes de red.")} />
            <Input id="scan-pause" label={t("Pausa entre páginas (ms)")} type="number" min={0} max={3000} value={pauseMs} onChange={(e) => setPauseMs(e.target.value)} hint={t("Evita que el sitio bloquee por ráfaga de peticiones.")} />
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
            <Button variant="secondary" onClick={() => testConnection("minimax")} loading={testing}>
              <Icon name="pulse" size={16} /> {t("Probar MiniMax")}
            </Button>
            <Button variant="secondary" onClick={detectBest} loading={detecting}>
              <Icon name="spark" size={16} /> {t("Detectar mejor modelo")}
            </Button>
            <Button onClick={save} loading={saving}>
              <Icon name="save" size={16} /> {t("Guardar IA")}
            </Button>
          </div>

          <div style={{ marginTop: 22, paddingTop: 16, borderTop: "1px solid #E2E8F0" }}>
            <SectionTitle>{t("Gemini (respaldo opcional)")}</SectionTitle>
            {cfg.gemini_has_key && (
              <MaskedKey
                label={t("Token Gemini")}
                value={cfg.gemini_key_masked}
                onRemove={() => removeToken("gemini")}
                saving={saving}
              />
            )}
            <SecretInput
              label={cfg.gemini_has_key ? t("Nuevo token Gemini") : t("Token / API Key de Gemini")}
              placeholder="AIza..."
              value={token}
              show={showToken}
              onToggle={() => setShowToken((s) => !s)}
              onChange={setToken}
            />
            <Select label={t("Modelo Gemini")} value={model} onChange={(e) => setModel(e.target.value)}>
              <option value="">{t("Automático")}</option>
              {(cfg.available_models || []).map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </Select>
            <Button variant="outline" size="sm" onClick={() => testConnection("gemini")} loading={testing}>
              {t("Probar Gemini")}
            </Button>
          </div>
        </Card>

        <Card style={{ background: "#F8FAFC" }}>
          <SectionTitle hint={GLOSSARY.token_ia}>{t("Uso de tokens")}</SectionTitle>
          <div data-testid="ai-usage" style={{ display: "grid", gap: 10, marginBottom: 16 }}>
            <UsageRow label={t("Llamadas")} value={cfg.ai_usage_calls || 0} />
            <UsageRow label={t("Tokens de entrada")} value={cfg.ai_usage_prompt_tokens || 0} />
            <UsageRow label={t("Tokens de salida")} value={cfg.ai_usage_completion_tokens || 0} />
            <UsageRow label={t("Total")} value={cfg.ai_usage_total_tokens || 0} />
            {cfg.ai_usage_last_model && (
              <p style={{ margin: 0, fontSize: 12, color: "#64748B" }}>
                {t("Último modelo: {model}", { model: cfg.ai_usage_last_model })}
                {cfg.ai_usage_last_at ? ` · ${fmtDateTime(cfg.ai_usage_last_at)}` : ""}
              </p>
            )}
            {cfg.minimax_plan_summary && (
              <p style={{ margin: 0, fontSize: 13, color: "#0F172A", fontWeight: 600 }}>{ts(cfg.minimax_plan_summary)}</p>
            )}
            <Button variant="outline" size="sm" onClick={refreshUsage}>
              {t("Actualizar saldo")}
            </Button>
            <Button variant="outline" size="sm" onClick={resetUsage} loading={saving} disabled={!cfg.ai_usage_calls}>
              {t("Reiniciar contador")}
            </Button>
          </div>
          <SectionTitle>{t("Bitácora de entrada a sitios")}</SectionTitle>
          <p style={{ fontSize: 12, color: "#64748B", marginTop: -8 }}>
            {t("Cada rastreo y vista previa deja los pasos (descarga, fichas, OCR, IA) con milisegundos y el error si el sitio no respondió.")}
          </p>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  const { data } = await api.get("/config/scan-traces");
                  setTraces(data || []);
                } catch (e) {
                  toast.error(apiError(e, t("No se pudo cargar la bitácora##sitios")));
                }
              }}
            >
              {t("Actualizar logs")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!traces.length}
              onClick={async () => {
                try {
                  await api.post("/config/scan-traces/clear");
                  setTraces([]);
                  toast.success(t("Bitácora de entrada vaciada"));
                } catch (e) {
                  toast.error(apiError(e, t("No se pudo vaciar la bitácora")));
                }
              }}
            >
              {t("Vaciar")}
            </Button>
          </div>
          <ScanTraceList traces={traces} />
        </Card>
      </div>
      </div>
      )}

      {tab === "fuentes" && (
        <Card>
          <SectionTitle hint={GLOSSARY.nivel_a}>{t("Llaves de fuentes de nivel A")}</SectionTitle>
          <p style={{ fontSize: 13, color: "#64748B", marginTop: -6 }}>
            {t("openFDA y PubMed multiplican su cupo con una llave gratuita. Sin ellas el sistema funciona, pero con un tope bajo que puede dejar corridas en ámbar. Las llaves no se muestran una vez guardadas.")}
          </p>
          <div style={{ display: "grid", gap: 12, maxWidth: 560 }}>
            <KeyStatus label="openFDA" configured={cfg.openfda_has_key} onRemove={() => saveSourceKeys({ openfda_api_key: "" }, t("Llave de openFDA eliminada"))} saving={saving} />
            <Input
              id="openfda-key"
              label={t("Llave openFDA (api.data.gov)")}
              hint={GLOSSARY.fb_llave_openfda}
              type="password"
              autoComplete="off"
              value={openfdaKey}
              onChange={(e) => setOpenfdaKey(e.target.value)}
              placeholder={cfg.openfda_has_key ? t("Escriba una nueva para reemplazarla") : t("Pegue la llave gratuita")}
            />
            <KeyStatus label="NCBI / PubMed" configured={cfg.ncbi_has_key} onRemove={() => saveSourceKeys({ ncbi_api_key: "" }, t("Llave de NCBI eliminada"))} saving={saving} />
            <Input
              id="ncbi-key"
              label={t("Llave NCBI / PubMed")}
              hint={GLOSSARY.fb_llave_ncbi}
              type="password"
              autoComplete="off"
              value={ncbiKey}
              onChange={(e) => setNcbiKey(e.target.value)}
              placeholder={cfg.ncbi_has_key ? t("Escriba una nueva para reemplazarla") : t("Opcional; 10 peticiones por segundo")}
            />
            <Input id="ncbi-email" label={t("Correo institucional NCBI")} hint={GLOSSARY.fb_correo_ncbi} type="email" value={ncbiEmail} onChange={(e) => setNcbiEmail(e.target.value)} />
            <div>
              <Button
                onClick={() => {
                  if (ncbiEmail.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ncbiEmail.trim())) {
                    toast.error(t("El correo de NCBI no es válido"));
                    return;
                  }
                  const payload = { ncbi_email: ncbiEmail.trim() };
                  if (openfdaKey.trim()) payload.openfda_api_key = openfdaKey.trim();
                  if (ncbiKey.trim()) payload.ncbi_api_key = ncbiKey.trim();
                  saveSourceKeys(payload, t("Llaves de fuentes guardadas"));
                }}
                loading={saving}
              >
                {t("Guardar llaves")}
              </Button>
            </div>
          </div>
        </Card>
      )}
        </div>
      </div>
    </div>
  );
}

function KeyStatus({ label, configured, onRemove, saving }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#475569" }} data-testid={`key-status-${label}`}>
      <Badge tone={configured ? "ok" : "viewer"}>{configured ? t("Configurada") : t("Sin llave")}</Badge>
      <span>{label}</span>
      {configured && (
        <Tooltip text={t("Borra la llave guardada desde esta pantalla. Si el servidor tiene una en su archivo .env, se vuelve a usar esa.")}>
          <button type="button" onClick={onRemove} disabled={saving} style={{ marginLeft: "auto", border: "none", background: "transparent", color: "#EF4444", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
            {t("Eliminar llave guardada")}
          </button>
        </Tooltip>
      )}
    </div>
  );
}

function ToggleRow({ checked, onChange, title, text }) {
  return (
    <label
      style={{
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
        margin: "12px 0",
        padding: "10px 12px",
        border: "1px solid #E2E8F0",
        borderRadius: 10,
        background: checked ? "#F0FDF4" : "#F8FAFC",
        cursor: "pointer",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: 3 }}
      />
      <span>
        <strong style={{ display: "block", fontSize: 13, color: "#0F172A" }}>{title}</strong>
        <span style={{ fontSize: 12, color: "#64748B" }}>{text}</span>
      </span>
    </label>
  );
}

function ScanIngestFlow({ cfg, webEnabled, ocrEnabled, fetchTimeout, childTimeout, aiTimeout, retries, pauseMs, scanMaxPages }) {
  const aiOn = Boolean(cfg?.ai_enabled);
  const steps = [
    { n: "1", title: t("Fuente en cola"), text: t("Solo fuentes con ingesta activa, en orden de prioridad de la matriz EH (alta primero)."), on: true, meta: t("Siempre") },
    { n: "2", title: t("Descarga HTTP"), text: t("Abre la URL con {retries} reintento(s) si hay 429/502/503, corte o timeout. Si falla, prueba las URLs de entrada de la matriz.", { retries }), on: true, meta: `${fetchTimeout}s` },
    { n: "3", title: t("PDF o HTML"), text: t("Si es PDF extrae texto. Si es HTML, lee el listado."), on: true, meta: t("Siempre") },
    { n: "4", title: t("Heurística local"), text: t("Titulares, tipo, horizonte y área. No consume tokens. Si la IA falla, esto se conserva."), on: true, meta: t("Siempre") },
    { n: "5", title: t("Búsqueda web"), text: t("La IA redacta consultas site:dominio y los buscadores traen documentos de la fuente. Casilla por fuente."), on: aiOn, meta: t("Por fuente") },
    { n: "6", title: t("Ruta de la matriz"), text: t("Visita las URLs de entrada y sigue hasta {pages} fichas, primero las que coinciden con la ruta de acceso. {pause} ms de pausa.", { pages: scanMaxPages, pause: pauseMs }), on: true, meta: t("{seconds}s / ficha", { seconds: childTimeout }) },
    { n: "7", title: "OCR MiniMax-M3", text: t("Solo si el PDF o la página no traen texto, el OCR está activo y la casilla OCR de la fuente está encendida."), on: Boolean(aiOn && ocrEnabled), meta: ocrEnabled ? t("Activo") : t("Apagado") },
    { n: "8", title: t("IA estructura JSON"), text: t("MiniMax lee el corpus con el contexto de la matriz (prioridad, qué consultar) y nombra tecnologías. Si no responde, queda el paso 4."), on: Boolean(aiOn && webEnabled), meta: webEnabled ? `${aiTimeout}s` : t("Apagado") },
    { n: "9", title: t("Huella y bandeja"), text: t("Deduplica por hash y deja las señales nuevas en la bandeja de entrada."), on: true, meta: t("Siempre") },
  ];
  return (
    <Card data-testid="ai-ingest-flow">
      <SectionTitle hint={GLOSSARY.flujo_ingesta}>{t("Cómo entran las tecnologías (orden fijo)")}</SectionTitle>
      <p style={{ fontSize: 13, color: "#64748B", marginTop: -6, marginBottom: 14 }}>
        {t("El orden no cambia. Lo que sí ajusta desde este panel es OCR, IA, tiempos, reintentos y el prompt. Un sitio que no responde no detiene las demás fuentes.")}
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
        {steps.map((s) => (
          <div
            key={s.n}
            style={{
              border: `1px solid ${s.on ? "#BBF7D0" : "#E2E8F0"}`,
              background: s.on ? "#F0FDF4" : "#F8FAFC",
              borderRadius: 12,
              padding: "12px 12px 10px",
              minHeight: 118,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
              <span style={{ fontWeight: 800, color: "#0F766E", fontSize: 12 }}>{s.n}</span>
              <Badge tone={s.on ? "ok" : "viewer"}>{s.meta}</Badge>
            </div>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#0F172A", marginBottom: 4 }}>{s.title}</div>
            <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.45 }}>{s.text}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ScanTraceList({ traces }) {
  if (!traces?.length) {
    return <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>{t("Aún no hay corridas. Ejecute una vigilancia o una vista previa para ver los pasos aquí.")}</p>;
  }
  return (
    <div data-testid="scan-trace-list" style={{ display: "grid", gap: 10, maxHeight: 420, overflow: "auto" }}>
      {traces.slice(0, 12).map((trace, i) => (
        <div key={`${trace.at}-${i}`} style={{ border: "1px solid #E2E8F0", borderRadius: 10, padding: 10, background: "#fff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
            <strong style={{ fontSize: 13 }}>{trace.source || trace.url || t("Fuente")}</strong>
            <Badge tone={trace.ok ? "ok" : "warning"}>{trace.status || (trace.ok ? "ok" : "error")}</Badge>
          </div>
          <p style={{ margin: "4px 0 6px", fontSize: 12, color: "#64748B" }}>
            {t("{kind} · {ms} ms · {pages} pág. · {items} señales", {
              kind: trace.kind === "preview" ? t("Vista previa") : t("Rastreo"),
              ms: trace.elapsed_ms || 0,
              pages: trace.pages_visited || 0,
              items: trace.items_found || 0,
            })}
            {trace.ai ? ` · ${t("IA")}` : ""}{trace.ocr ? " · OCR" : ""}{trace.web_search ? ` · ${t("Búsqueda web")}` : ""}
            {trace.priority ? ` · ${t("Prioridad {priority}", { priority: ts(trace.priority) })}` : ""}
            {trace.at ? ` · ${fmtDateTime(trace.at)}` : ""}
          </p>
          {trace.message && <p style={{ margin: "0 0 6px", fontSize: 12, color: "#334155" }}>{ts(trace.message)}</p>}
          {(trace.steps || []).slice(0, 14).map((s, j) => (
            <div key={j} style={{ fontSize: 11, color: "#475569", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", marginBottom: 2 }}>
              {s.action} · {s.status} · {s.ms}ms {s.detail ? `· ${ts(s.detail)}` : ""}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function UsageRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#334155" }}>
      <span>{label}</span>
      <strong>{Number(value).toLocaleString(intlLocale())}</strong>
    </div>
  );
}

function PromptsPanel({ prompts, setPrompts, toast, saving, setSaving }) {
  if (!prompts) return <LoadingBlock label={t("Cargando prompts...")} />;
  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.put("/config/prompts", {
        system: prompts.system,
        user: prompts.user,
        max_tokens: Number(prompts.max_tokens) || 4096,
        max_pages: Number(prompts.max_pages) || 8,
        max_chars: Number(prompts.max_chars) || 28000,
      });
      setPrompts(data);
      toast.success(t("Prompts de vigilancia guardados"));
    } catch (e) {
      toast.error(apiError(e, t("No se pudieron guardar los prompts")));
    } finally {
      setSaving(false);
    }
  };
  const reset = async () => {
    setSaving(true);
    try {
      const { data } = await api.post("/config/prompts/reset");
      setPrompts(data);
      toast.success(t("Prompts restaurados a los valores de fábrica"));
    } catch (e) {
      toast.error(apiError(e, t("No se pudieron restaurar los prompts")));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card data-testid="prompts-panel">
      <SectionTitle hint={GLOSSARY.prompt_vigilancia}>{t("Instrucciones de MiniMax en el escaneo activo")}</SectionTitle>
      <p style={{ fontSize: 13, color: "#64748B", marginTop: -6 }}>
        {t("El rastreador entra al listado, sigue hasta las fichas internas y entrega ese texto a MiniMax. El prompt de fábrica extrae solo tecnologías nominadas, no inventa NCT y responde JSON. Variables: {source_title}, {source_url}, {pages_visited}, {content}, {ocr_note} y {max_items}.")}
      </p>
      <Textarea
        id="prompt-system"
        label={t("Prompt de sistema")}
        hint={GLOSSARY.prompt_vigilancia}
        rows={5}
        value={prompts.system}
        onChange={(e) => setPrompts({ ...prompts, system: e.target.value })}
      />
      <Textarea
        id="prompt-user"
        label={t("Prompt de extracción (usuario)")}
        rows={16}
        value={prompts.user}
        onChange={(e) => setPrompts({ ...prompts, user: e.target.value })}
        style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13 }}
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <Input
          id="prompt-max-tokens"
          label={t("Tokens de salida")}
          type="number"
          min={256}
          max={8192}
          value={prompts.max_tokens}
          onChange={(e) => setPrompts({ ...prompts, max_tokens: e.target.value })}
        />
        <Input
          id="prompt-max-pages"
          label={t("Páginas a visitar")}
          type="number"
          min={1}
          max={20}
          value={prompts.max_pages}
          onChange={(e) => setPrompts({ ...prompts, max_pages: e.target.value })}
        />
        <Input
          id="prompt-max-chars"
          label={t("Caracteres de contenido")}
          type="number"
          min={4000}
          max={80000}
          value={prompts.max_chars}
          onChange={(e) => setPrompts({ ...prompts, max_chars: e.target.value })}
        />
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
        <Button onClick={save} loading={saving}>
          <Icon name="save" size={16} /> {t("Guardar prompts")}
        </Button>
        <Button variant="outline" onClick={reset} loading={saving}>
          {t("Restaurar predeterminados")}
        </Button>
      </div>
    </Card>
  );
}

function SecretInput({ label, placeholder, value, show, onToggle, onChange }) {
  return (
    <div style={{ position: "relative" }}>
      <Input
        label={label}
        placeholder={placeholder}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        style={{ paddingRight: 42, fontFamily: "monospace" }}
      />
      <button
        type="button"
        onClick={onToggle}
        title={show ? t("Ocultar") : t("Mostrar")}
        style={{
          position: "absolute",
          right: 10,
          top: 34,
          border: "none",
          background: "transparent",
          cursor: "pointer",
          color: "#64748B",
          padding: 4,
        }}
      >
        <Icon name={show ? "eyeOff" : "eye"} size={18} />
      </button>
    </div>
  );
}

function MaskedKey({ label, value, onRemove, saving }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "#F8FAFC",
        border: "1px solid #E2E8F0",
        borderRadius: 8,
        padding: "10px 12px",
        marginBottom: 14,
        fontSize: 13,
      }}
    >
      <Icon name="key" size={16} color="#64748B" />
      <span style={{ color: "#475569" }}>{label}:</span>
      <code style={{ fontWeight: 700, color: "#0F172A" }}>{value}</code>
      <Tooltip text={t("Eliminar la llave guardada.")}>
        <button
          onClick={onRemove}
          disabled={saving}
          style={{
            marginLeft: "auto",
            border: "none",
            background: "transparent",
            color: "#EF4444",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <Icon name="trash" size={15} /> {t("Eliminar")}
        </button>
      </Tooltip>
    </div>
  );
}

function StatusCard({ icon, label, value, sub, tone = "neutral", tip }) {
  const tones = {
    ok: { bg: "#ECFDF5", fg: "#059669", dot: "#10B981" },
    warn: { bg: "#FFFBEB", fg: "#B45309", dot: "#F59E0B" },
    error: { bg: "#FEF2F2", fg: "#DC2626", dot: "#EF4444" },
    info: { bg: "#EFF6FF", fg: "#2563EB", dot: "#3B82F6" },
    neutral: { bg: "#F8FAFC", fg: "#475569", dot: "#94A3B8" },
  }[tone];
  return (
    <Card style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 600, color: "#64748B" }}>
          {label}
          {tip && (
            <Tooltip text={tip}>
              <span style={{ display: "inline-flex", color: "#CBD5E1", cursor: "help" }}>
                <Icon name="info" size={14} />
              </span>
            </Tooltip>
          )}
        </div>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 9,
            background: tones.bg,
            color: tones.fg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name={icon} size={18} />
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: tones.dot }} />
        <span style={{ fontSize: 19, fontWeight: 800, color: "#0F172A" }}>{value}</span>
      </div>
      {sub && <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 4 }}>{sub}</div>}
    </Card>
  );
}

function AlertBanner({ type, message, onClose }) {
  const styles = {
    ok: { bg: "#ECFDF5", border: "#A7F3D0", fg: "#065F46", icon: "check" },
    warn: { bg: "#FFFBEB", border: "#FDE68A", fg: "#92400E", icon: "alert" },
    error: { bg: "#FEF2F2", border: "#FECACA", fg: "#991B1B", icon: "alert" },
  }[type] || { bg: "#EFF6FF", border: "#DBEAFE", fg: "#1E40AF", icon: "info" };
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        background: styles.bg,
        border: `1px solid ${styles.border}`,
        color: styles.fg,
        borderRadius: 8,
        padding: "10px 12px",
        marginBottom: 14,
        fontSize: 13,
      }}
    >
      <Icon name={styles.icon} size={17} style={{ marginTop: 1, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>{message}</div>
      {onClose && (
        <button onClick={onClose} style={{ border: "none", background: "transparent", cursor: "pointer", color: styles.fg }}>
          <Icon name="x" size={15} />
        </button>
      )}
    </div>
  );
}
