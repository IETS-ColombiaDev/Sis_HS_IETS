import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api, { apiError } from "../api/client";
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

const TABS = [
  { id: "metodologia", label: "Gobierno metodológico", icon: "sliders" },
  { id: "ia", label: "Integración con IA", icon: "spark" },
  { id: "prompts", label: "Prompts de vigilancia", icon: "doc" },
  { id: "programacion", label: "Tareas programadas", icon: "clock" },
  { id: "fuentes", label: "Llaves de fuentes", icon: "globe" },
  { id: "parametros_fuentes", label: "Parámetros de fuentes", icon: "layers" },
];

export default function Settings() {
  const toast = useToast();
  const { refreshStatus } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = TABS.some((t) => t.id === searchParams.get("tab")) ? searchParams.get("tab") : "metodologia";
  const [tab, setTabState] = useState(initialTab);
  const setTab = (id) => {
    setTabState(id);
    setSearchParams(id === "metodologia" ? {} : { tab: id }, { replace: true });
  };
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
  const [scanMaxTokens, setScanMaxTokens] = useState(2048);
  const [scanMaxPages, setScanMaxPages] = useState(8);
  const [fetchTimeout, setFetchTimeout] = useState(25);
  const [childTimeout, setChildTimeout] = useState(15);
  const [aiTimeout, setAiTimeout] = useState(60);
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
    setScanMaxTokens(data.scan_max_tokens || 2048);
    setScanMaxPages(data.scan_max_pages || 8);
    setFetchTimeout(data.scan_fetch_timeout || 25);
    setChildTimeout(data.scan_child_timeout || 15);
    setAiTimeout(data.scan_ai_timeout || 60);
    setRetries(data.scan_retries ?? 3);
    setPauseMs(data.scan_pause_ms ?? 350);
    setNcbiEmail(data.ncbi_email || "");
  };

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/config");
      applyCfg(data);
    } catch (e) {
      toast.error(apiError(e, "No se pudo cargar la configuración"));
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
      .catch((e) => toast.error(apiError(e, "No se pudieron cargar los prompts")));
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
      toast.success("Contador de tokens reiniciado");
    } catch (e) {
      toast.error(apiError(e, "No se pudo reiniciar el uso"));
    } finally {
      setSaving(false);
    }
  };

  const refreshUsage = async () => {
    try {
      const { data } = await api.get("/config/usage");
      applyCfg(data);
      toast.success(data.minimax_plan_summary || "Uso de tokens actualizado");
    } catch (e) {
      toast.error(apiError(e, "No se pudo consultar el saldo"));
    }
  };

  const testConnection = async (who) => {
    setTesting(true);
    setBanner(null);
    try {
      const payload = { provider: who };
      if (who === "minimax" && minimaxToken.trim()) payload.minimax_api_key = minimaxToken.trim();
      if (who === "gemini" && token.trim()) payload.gemini_api_key = token.trim();
      const { data } = await api.post("/config/test", payload);
      setBanner({ type: data.ok ? "ok" : "error", message: data.message });
      if (data.ok) {
        toast.success(`Conexión ${who === "gemini" ? "Gemini" : "MiniMax"} verificada`);
        if (data.available_models?.length && who === "minimax") {
          setCfg((prev) => ({ ...prev, minimax_available_models: data.available_models, minimax_active_model: data.model }));
        }
      } else toast.error("La prueba de conexión falló");
    } catch (e) {
      const msg = apiError(e, "No se pudo probar la conexión");
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
      const { data } = await api.post("/config/detect-models");
      setBanner({ type: data.ok ? "ok" : "error", message: data.message });
      if (data.ok) {
        setMinimaxModel("");
        setCfg((prev) => ({
          ...prev,
          minimax_available_models: data.available_models || prev.minimax_available_models,
          minimax_active_model: data.model,
        }));
        toast.success(`Mejor modelo: ${data.model}`);
      }
    } catch (e) {
      toast.error(apiError(e, "No se pudieron detectar modelos"));
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
        scan_max_tokens: Number(scanMaxTokens) || 2048,
        scan_max_pages: Number(scanMaxPages) || 8,
        scan_fetch_timeout: Number(fetchTimeout) || 25,
        scan_child_timeout: Number(childTimeout) || 15,
        scan_ai_timeout: Number(aiTimeout) || 60,
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
          message: `IA activa con ${data.ai_active_provider || "MiniMax"} · ${data.ai_model || data.minimax_active_model}. OCR ${data.ai_ocr_enabled ? "encendido" : "apagado"}.`,
        });
        toast.success("Configuración de IA guardada");
      } else {
        setBanner({ type: "warn", message: "Configuración guardada, pero no hay una llave de IA válida." });
        toast.success("Configuración guardada");
      }
    } catch (e) {
      toast.error(apiError(e, "No se pudo guardar la configuración"));
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
      setBanner({ type: "warn", message: `Token de ${kind === "minimax" ? "MiniMax" : "Gemini"} eliminado.` });
      toast.success("Token eliminado");
    } catch (e) {
      toast.error(apiError(e, "No se pudo eliminar el token"));
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
      toast.error(apiError(e, "No se pudieron guardar las llaves"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingBlock label="Cargando configuración..." />;

  const aiOn = Boolean(cfg.ai_enabled);
  const models = cfg.minimax_available_models?.length
    ? cfg.minimax_available_models
    : ["MiniMax-M3", "MiniMax-M2.7", "MiniMax-M2.7-highspeed", "MiniMax-M2.5", "MiniMax-M2.5-highspeed", "MiniMax-M2.1", "MiniMax-M2"];

  return (
    <div>
      <PageHeader
        title="Configuración del sistema"
        titleHint={GLOSSARY.minimax}
        subtitle="Gobierne la metodología, MiniMax (con OCR de sitios) y las llaves de las fuentes de nivel A."
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
          label="Inteligencia Artificial"
          value={aiOn ? "Activa" : "Sin configurar"}
          tone={aiOn ? "ok" : "warn"}
          sub={aiOn ? `${cfg.ai_active_provider || "minimax"} · ${cfg.ai_model || cfg.minimax_active_model}` : "Requiere llave de MiniMax"}
          tip="MiniMax es el proveedor principal. Gemini queda como respaldo opcional."
        />
        <StatusCard
          icon="globe"
          label="IA en sitios / OCR"
          value={!aiOn ? "Requiere IA" : cfg.ai_ocr_enabled ? "OCR activo" : cfg.ai_web_enabled ? "Solo texto" : "Apagado"}
          tone={!aiOn ? "neutral" : cfg.ai_ocr_enabled ? "ok" : cfg.ai_web_enabled ? "info" : "neutral"}
          sub={cfg.ai_ocr_enabled ? `Visión: ${cfg.minimax_vision_model || "MiniMax-M3"}` : "La IA puede leer páginas; el OCR es opcional"}
          tip="Con OCR, MiniMax-M3 lee imágenes y PDF escaneados de las fuentes."
        />
        <StatusCard
          icon="shield"
          label="Login con Google"
          value={cfg.google_login_enabled ? "Habilitado" : "Deshabilitado"}
          tone={cfg.google_login_enabled ? "ok" : "neutral"}
          sub={`Dominio: @${cfg.allowed_domain}`}
          tip="Acceso con cuentas institucionales de Google del dominio permitido."
        />
        <StatusCard
          icon="info"
          label="Versión del sistema"
          value={`v${cfg.version}`}
          tone="neutral"
          sub={`${cfg.total_sources} fuentes · ${cfg.total_findings} hallazgos`}
          tip="Versión de la aplicación y volumen del inventario."
        />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <Button
            key={t.id}
            variant={tab === t.id ? "primary" : "secondary"}
            onClick={() => setTab(t.id)}
          >
            <Icon name={t.icon} size={16} /> {t.label}
          </Button>
        ))}
      </div>

      {tab === "metodologia" && <MethodologyPanel />}

      {tab === "programacion" && <SchedulePanel />}

      {tab === "parametros_fuentes" && <SourceParamsPanel toast={toast} />}

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
                {aiOn ? `Conectado · ${cfg.ai_active_provider || "minimax"}` : "No conectado"}
              </Badge>
            }
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <Icon name="key" size={18} /> MiniMax (IA principal)
            </span>
          </SectionTitle>

          <p style={{ fontSize: 13, color: "#64748B", marginTop: -6, marginBottom: 16 }}>
            MiniMax entra a las páginas de las fuentes, estructura señales de horizonte y, si lo
            habilita, lee imágenes y PDF escaneados con MiniMax-M3. La llave no se muestra completa.
          </p>

          {banner && <AlertBanner type={banner.type} message={banner.message} onClose={() => setBanner(null)} />}

          {cfg.minimax_has_key && (
            <MaskedKey
              label="Llave MiniMax"
              value={cfg.minimax_key_masked}
              onRemove={() => removeToken("minimax")}
              saving={saving}
            />
          )}

          <SecretInput
            label={cfg.minimax_has_key ? "Nueva llave MiniMax (reemplaza la actual)" : "API Key de MiniMax"}
            placeholder="sk-cp-... o sk-api-..."
            value={minimaxToken}
            show={showMinimaxToken}
            onToggle={() => setShowMinimaxToken((s) => !s)}
            onChange={setMinimaxToken}
          />

          <Select label="Proveedor" hint="Automático usa MiniMax si tiene llave y, si falla, Gemini. Elija uno solo si quiere forzarlo." value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="auto">Automático (MiniMax si hay llave; si no, Gemini)</option>
            <option value="minimax">Solo MiniMax</option>
            <option value="gemini">Solo Gemini</option>
          </Select>

          <Select label="Modelo MiniMax" hint="Automático elige el mejor modelo que responda con su llave. Use Detectar mejor modelo para probarlo." value={minimaxModel} onChange={(e) => setMinimaxModel(e.target.value)}>
            <option value="">Automático (mejor modelo disponible)</option>
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
            title="Paso 7 · IA entra a los sitios web"
            text="MiniMax lee el texto ya visitado (pasos 2-5) y nombra tecnologías. Si falla, se conserva la heurística del paso 4."
          />
          <ToggleRow
            checked={ocrEnabled}
            onChange={setOcrEnabled}
            title="Paso 6 · OCR con MiniMax-M3"
            text={`Solo corre si el PDF o la página no entregan texto. Visión: ${cfg.minimax_vision_model || "MiniMax-M3"}.`}
          />

          <Input
            id="scan-max-tokens"
            label="Tokens máximos por llamada de vigilancia"
            hint={GLOSSARY.token_ia}
            type="number"
            min={256}
            max={8192}
            value={scanMaxTokens}
            onChange={(e) => setScanMaxTokens(e.target.value)}
          />
          <Input
            id="scan-max-pages"
            label="Páginas internas a visitar por fuente"
            hint="El rastreador entra al listado y sigue hasta esta cantidad de fichas del mismo sitio."
            type="number"
            min={1}
            max={20}
            value={scanMaxPages}
            onChange={(e) => setScanMaxPages(e.target.value)}
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
            <Input id="scan-fetch-timeout" label="Timeout de descarga (s)" type="number" min={5} max={90} value={fetchTimeout} onChange={(e) => setFetchTimeout(e.target.value)} hint="Tiempo máximo para abrir la URL de la fuente." />
            <Input id="scan-child-timeout" label="Timeout de fichas (s)" type="number" min={5} max={60} value={childTimeout} onChange={(e) => setChildTimeout(e.target.value)} hint="Cada ficha interna. Si una falla, el rastreo sigue." />
            <Input id="scan-ai-timeout" label="Timeout de MiniMax (s)" type="number" min={15} max={120} value={aiTimeout} onChange={(e) => setAiTimeout(e.target.value)} hint="Si MiniMax no responde, se queda la heurística local." />
            <Input id="scan-retries" label="Reintentos HTTP" type="number" min={0} max={6} value={retries} onChange={(e) => setRetries(e.target.value)} hint="Reintenta 429, 502, 503, 504 y cortes de red." />
            <Input id="scan-pause" label="Pausa entre páginas (ms)" type="number" min={0} max={3000} value={pauseMs} onChange={(e) => setPauseMs(e.target.value)} hint="Evita que el sitio bloquee por ráfaga de peticiones." />
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
            <Button variant="secondary" onClick={() => testConnection("minimax")} loading={testing}>
              <Icon name="pulse" size={16} /> Probar MiniMax
            </Button>
            <Button variant="secondary" onClick={detectBest} loading={detecting}>
              <Icon name="spark" size={16} /> Detectar mejor modelo
            </Button>
            <Button onClick={save} loading={saving}>
              <Icon name="save" size={16} /> Guardar IA
            </Button>
          </div>

          <div style={{ marginTop: 22, paddingTop: 16, borderTop: "1px solid #E2E8F0" }}>
            <SectionTitle>Gemini (respaldo opcional)</SectionTitle>
            {cfg.gemini_has_key && (
              <MaskedKey
                label="Token Gemini"
                value={cfg.gemini_key_masked}
                onRemove={() => removeToken("gemini")}
                saving={saving}
              />
            )}
            <SecretInput
              label={cfg.gemini_has_key ? "Nuevo token Gemini" : "Token / API Key de Gemini"}
              placeholder="AIza..."
              value={token}
              show={showToken}
              onToggle={() => setShowToken((s) => !s)}
              onChange={setToken}
            />
            <Select label="Modelo Gemini" value={model} onChange={(e) => setModel(e.target.value)}>
              <option value="">Automático</option>
              {(cfg.available_models || []).map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </Select>
            <Button variant="outline" size="sm" onClick={() => testConnection("gemini")} loading={testing}>
              Probar Gemini
            </Button>
          </div>
        </Card>

        <Card style={{ background: "#F8FAFC" }}>
          <SectionTitle hint={GLOSSARY.token_ia}>Uso de tokens</SectionTitle>
          <div data-testid="ai-usage" style={{ display: "grid", gap: 10, marginBottom: 16 }}>
            <UsageRow label="Llamadas" value={cfg.ai_usage_calls || 0} />
            <UsageRow label="Tokens de entrada" value={cfg.ai_usage_prompt_tokens || 0} />
            <UsageRow label="Tokens de salida" value={cfg.ai_usage_completion_tokens || 0} />
            <UsageRow label="Total" value={cfg.ai_usage_total_tokens || 0} />
            {cfg.ai_usage_last_model && (
              <p style={{ margin: 0, fontSize: 12, color: "#64748B" }}>
                Último modelo: {cfg.ai_usage_last_model}
                {cfg.ai_usage_last_at ? ` · ${new Date(cfg.ai_usage_last_at).toLocaleString()}` : ""}
              </p>
            )}
            {cfg.minimax_plan_summary && (
              <p style={{ margin: 0, fontSize: 13, color: "#0F172A", fontWeight: 600 }}>{cfg.minimax_plan_summary}</p>
            )}
            <Button variant="outline" size="sm" onClick={refreshUsage}>
              Actualizar saldo
            </Button>
            <Button variant="outline" size="sm" onClick={resetUsage} loading={saving} disabled={!cfg.ai_usage_calls}>
              Reiniciar contador
            </Button>
          </div>
          <SectionTitle>Bitácora de entrada a sitios</SectionTitle>
          <p style={{ fontSize: 12, color: "#64748B", marginTop: -8 }}>
            Cada rastreo y vista previa deja los pasos (descarga, fichas, OCR, IA) con milisegundos y el error si el sitio no respondió.
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
                  toast.error(apiError(e, "No se pudo cargar la bitácora"));
                }
              }}
            >
              Actualizar logs
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!traces.length}
              onClick={async () => {
                try {
                  await api.post("/config/scan-traces/clear");
                  setTraces([]);
                  toast.success("Bitácora de entrada vaciada");
                } catch (e) {
                  toast.error(apiError(e, "No se pudo vaciar la bitácora"));
                }
              }}
            >
              Vaciar
            </Button>
          </div>
          <ScanTraceList traces={traces} />
        </Card>
      </div>
      </div>
      )}

      {tab === "fuentes" && (
        <Card>
          <SectionTitle hint={GLOSSARY.nivel_a}>Llaves de fuentes de nivel A</SectionTitle>
          <p style={{ fontSize: 13, color: "#64748B", marginTop: -6 }}>
            openFDA y PubMed multiplican su cupo con una llave gratuita. Sin ellas el sistema funciona,
            pero con un tope bajo que puede dejar corridas en ámbar. Las llaves no se muestran una vez guardadas.
          </p>
          <div style={{ display: "grid", gap: 12, maxWidth: 560 }}>
            <KeyStatus label="openFDA" configured={cfg.openfda_has_key} onRemove={() => saveSourceKeys({ openfda_api_key: "" }, "Llave de openFDA eliminada")} saving={saving} />
            <Input
              id="openfda-key"
              label="Llave openFDA (api.data.gov)"
              hint={GLOSSARY.fb_llave_openfda}
              type="password"
              autoComplete="off"
              value={openfdaKey}
              onChange={(e) => setOpenfdaKey(e.target.value)}
              placeholder={cfg.openfda_has_key ? "Escriba una nueva para reemplazarla" : "Pegue la llave gratuita"}
            />
            <KeyStatus label="NCBI / PubMed" configured={cfg.ncbi_has_key} onRemove={() => saveSourceKeys({ ncbi_api_key: "" }, "Llave de NCBI eliminada")} saving={saving} />
            <Input
              id="ncbi-key"
              label="Llave NCBI / PubMed"
              hint={GLOSSARY.fb_llave_ncbi}
              type="password"
              autoComplete="off"
              value={ncbiKey}
              onChange={(e) => setNcbiKey(e.target.value)}
              placeholder={cfg.ncbi_has_key ? "Escriba una nueva para reemplazarla" : "Opcional; 10 peticiones por segundo"}
            />
            <Input id="ncbi-email" label="Correo institucional NCBI" hint={GLOSSARY.fb_correo_ncbi} type="email" value={ncbiEmail} onChange={(e) => setNcbiEmail(e.target.value)} />
            <div>
              <Button
                onClick={() => {
                  if (ncbiEmail.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ncbiEmail.trim())) {
                    toast.error("El correo de NCBI no es válido");
                    return;
                  }
                  const payload = { ncbi_email: ncbiEmail.trim() };
                  if (openfdaKey.trim()) payload.openfda_api_key = openfdaKey.trim();
                  if (ncbiKey.trim()) payload.ncbi_api_key = ncbiKey.trim();
                  saveSourceKeys(payload, "Llaves de fuentes guardadas");
                }}
                loading={saving}
              >
                Guardar llaves
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function KeyStatus({ label, configured, onRemove, saving }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#475569" }} data-testid={`key-status-${label}`}>
      <Badge tone={configured ? "ok" : "viewer"}>{configured ? "Configurada" : "Sin llave"}</Badge>
      <span>{label}</span>
      {configured && (
        <Tooltip text="Borra la llave guardada desde esta pantalla. Si el servidor tiene una en su archivo .env, se vuelve a usar esa.">
          <button type="button" onClick={onRemove} disabled={saving} style={{ marginLeft: "auto", border: "none", background: "transparent", color: "#EF4444", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
            Eliminar llave guardada
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
    { n: "1", title: "Fuente en cola", text: "Solo fuentes con ingesta activa, en orden de prioridad de la matriz EH (alta primero).", on: true, meta: "Siempre" },
    { n: "2", title: "Descarga HTTP", text: `Abre la URL con ${retries} reintento(s) si hay 429/502/503, corte o timeout. Si falla, prueba las URLs de entrada de la matriz.`, on: true, meta: `${fetchTimeout}s` },
    { n: "3", title: "PDF o HTML", text: "Si es PDF extrae texto. Si es HTML, lee el listado.", on: true, meta: "Siempre" },
    { n: "4", title: "Heurística local", text: "Titulares, tipo, horizonte y área. No consume tokens. Si la IA falla, esto se conserva.", on: true, meta: "Siempre" },
    { n: "5", title: "Búsqueda web", text: "La IA redacta consultas site:dominio y los buscadores traen documentos de la fuente. Casilla por fuente.", on: aiOn, meta: "Por fuente" },
    { n: "6", title: "Ruta de la matriz", text: `Visita las URLs de entrada y sigue hasta ${scanMaxPages} fichas, primero las que coinciden con la ruta de acceso. ${pauseMs} ms de pausa.`, on: true, meta: `${childTimeout}s / ficha` },
    { n: "7", title: "OCR MiniMax-M3", text: "Solo si el PDF o la página no traen texto, el OCR está activo y la casilla OCR de la fuente está encendida.", on: Boolean(aiOn && ocrEnabled), meta: ocrEnabled ? "Activo" : "Apagado" },
    { n: "8", title: "IA estructura JSON", text: "MiniMax lee el corpus con el contexto de la matriz (prioridad, qué consultar) y nombra tecnologías. Si no responde, queda el paso 4.", on: Boolean(aiOn && webEnabled), meta: webEnabled ? `${aiTimeout}s` : "Apagado" },
    { n: "9", title: "Huella y bandeja", text: "Deduplica por hash y deja las señales nuevas en la bandeja de entrada.", on: true, meta: "Siempre" },
  ];
  return (
    <Card data-testid="ai-ingest-flow">
      <SectionTitle hint={GLOSSARY.flujo_ingesta}>Cómo entran las tecnologías (orden fijo)</SectionTitle>
      <p style={{ fontSize: 13, color: "#64748B", marginTop: -6, marginBottom: 14 }}>
        El orden no cambia. Lo que sí ajusta desde este panel es OCR, IA, tiempos, reintentos y el prompt.
        Un sitio que no responde no detiene las demás fuentes.
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
    return <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>Aún no hay corridas. Ejecute una vigilancia o una vista previa para ver los pasos aquí.</p>;
  }
  return (
    <div data-testid="scan-trace-list" style={{ display: "grid", gap: 10, maxHeight: 420, overflow: "auto" }}>
      {traces.slice(0, 12).map((t, i) => (
        <div key={`${t.at}-${i}`} style={{ border: "1px solid #E2E8F0", borderRadius: 10, padding: 10, background: "#fff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
            <strong style={{ fontSize: 13 }}>{t.source || t.url || "Fuente"}</strong>
            <Badge tone={t.ok ? "ok" : "warning"}>{t.status || (t.ok ? "ok" : "error")}</Badge>
          </div>
          <p style={{ margin: "4px 0 6px", fontSize: 12, color: "#64748B" }}>
            {t.kind === "preview" ? "Vista previa" : "Rastreo"} · {t.elapsed_ms || 0} ms · {t.pages_visited || 0} pág. · {t.items_found || 0} señales
            {t.ai ? " · IA" : ""}{t.ocr ? " · OCR" : ""}{t.web_search ? " · Búsqueda web" : ""}
            {t.priority ? ` · Prioridad ${t.priority}` : ""}
            {t.at ? ` · ${new Date(t.at).toLocaleString()}` : ""}
          </p>
          {t.message && <p style={{ margin: "0 0 6px", fontSize: 12, color: "#334155" }}>{t.message}</p>}
          {(t.steps || []).slice(0, 14).map((s, j) => (
            <div key={j} style={{ fontSize: 11, color: "#475569", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", marginBottom: 2 }}>
              {s.action} · {s.status} · {s.ms}ms {s.detail ? `· ${s.detail}` : ""}
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
      <strong>{Number(value).toLocaleString("es-CO")}</strong>
    </div>
  );
}

function PromptsPanel({ prompts, setPrompts, toast, saving, setSaving }) {
  if (!prompts) return <LoadingBlock label="Cargando prompts..." />;
  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.put("/config/prompts", {
        system: prompts.system,
        user: prompts.user,
        max_tokens: Number(prompts.max_tokens) || 2048,
        max_pages: Number(prompts.max_pages) || 8,
        max_chars: Number(prompts.max_chars) || 28000,
      });
      setPrompts(data);
      toast.success("Prompts de vigilancia guardados");
    } catch (e) {
      toast.error(apiError(e, "No se pudieron guardar los prompts"));
    } finally {
      setSaving(false);
    }
  };
  const reset = async () => {
    setSaving(true);
    try {
      const { data } = await api.post("/config/prompts/reset");
      setPrompts(data);
      toast.success("Prompts restaurados a los valores de fábrica");
    } catch (e) {
      toast.error(apiError(e, "No se pudieron restaurar los prompts"));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card data-testid="prompts-panel">
      <SectionTitle hint={GLOSSARY.prompt_vigilancia}>Instrucciones de MiniMax en el escaneo activo</SectionTitle>
      <p style={{ fontSize: 13, color: "#64748B", marginTop: -6 }}>
        El rastreador entra al listado, sigue hasta las fichas internas y entrega ese texto a MiniMax.
        El prompt de fábrica extrae solo tecnologías nominadas, no inventa NCT y responde JSON.
        Variables: {"{source_title}"}, {"{source_url}"}, {"{pages_visited}"}, {"{content}"}, {"{ocr_note}"} y {"{max_items}"}.
      </p>
      <Textarea
        id="prompt-system"
        label="Prompt de sistema"
        hint={GLOSSARY.prompt_vigilancia}
        rows={5}
        value={prompts.system}
        onChange={(e) => setPrompts({ ...prompts, system: e.target.value })}
      />
      <Textarea
        id="prompt-user"
        label="Prompt de extracción (usuario)"
        rows={16}
        value={prompts.user}
        onChange={(e) => setPrompts({ ...prompts, user: e.target.value })}
        style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13 }}
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <Input
          id="prompt-max-tokens"
          label="Tokens de salida"
          type="number"
          min={256}
          max={8192}
          value={prompts.max_tokens}
          onChange={(e) => setPrompts({ ...prompts, max_tokens: e.target.value })}
        />
        <Input
          id="prompt-max-pages"
          label="Páginas a visitar"
          type="number"
          min={1}
          max={20}
          value={prompts.max_pages}
          onChange={(e) => setPrompts({ ...prompts, max_pages: e.target.value })}
        />
        <Input
          id="prompt-max-chars"
          label="Caracteres de contenido"
          type="number"
          min={4000}
          max={80000}
          value={prompts.max_chars}
          onChange={(e) => setPrompts({ ...prompts, max_chars: e.target.value })}
        />
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
        <Button onClick={save} loading={saving}>
          <Icon name="save" size={16} /> Guardar prompts
        </Button>
        <Button variant="outline" onClick={reset} loading={saving}>
          Restaurar predeterminados
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
        title={show ? "Ocultar" : "Mostrar"}
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
      <Tooltip text="Eliminar la llave guardada.">
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
          <Icon name="trash" size={15} /> Eliminar
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
