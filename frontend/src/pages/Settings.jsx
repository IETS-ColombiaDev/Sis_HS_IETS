import { useCallback, useEffect, useState } from "react";
import api, { apiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../components/Toast";
import { PageHeader, Card, SectionTitle } from "../components/Card";
import { GLOSSARY } from "../constants/glossary";
import Button from "../components/Button";
import Badge from "../components/Badge";
import Icon from "../components/Icon";
import Tooltip from "../components/Tooltip";
import { Input, Select } from "../components/Field";
import { LoadingBlock } from "../components/Spinner";
import MethodologyPanel from "../components/MethodologyPanel";

const TABS = [
  { id: "metodologia", label: "Gobierno metodologico", icon: "sliders" },
  { id: "ia", label: "Integracion con IA", icon: "spark" },
  { id: "fuentes", label: "Llaves de fuentes", icon: "globe" },
];

export default function Settings() {
  const toast = useToast();
  const { refreshStatus } = useAuth();
  const [tab, setTab] = useState("ia");
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
    setNcbiEmail(data.ncbi_email || "");
  };

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/config");
      applyCfg(data);
    } catch (e) {
      toast.error(apiError(e, "No se pudo cargar la configuracion"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
        toast.success(`Conexion ${who === "gemini" ? "Gemini" : "MiniMax"} verificada`);
        if (data.available_models?.length && who === "minimax") {
          setCfg((prev) => ({ ...prev, minimax_available_models: data.available_models, minimax_active_model: data.model }));
        }
      } else toast.error("La prueba de conexion fallo");
    } catch (e) {
      const msg = apiError(e, "No se pudo probar la conexion");
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
        toast.success("Configuracion de IA guardada");
      } else {
        setBanner({ type: "warn", message: "Configuracion guardada, pero no hay una llave de IA valida." });
        toast.success("Configuracion guardada");
      }
    } catch (e) {
      toast.error(apiError(e, "No se pudo guardar la configuracion"));
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

  if (loading) return <LoadingBlock label="Cargando configuracion..." />;

  const aiOn = Boolean(cfg.ai_enabled);
  const models = cfg.minimax_available_models?.length
    ? cfg.minimax_available_models
    : ["MiniMax-M3", "MiniMax-M2.7", "MiniMax-M2.7-highspeed", "MiniMax-M2.5", "MiniMax-M2.5-highspeed", "MiniMax-M2.1", "MiniMax-M2"];

  return (
    <div>
      <PageHeader
        title="Configuracion del sistema"
        titleHint={GLOSSARY.minimax}
        subtitle="Gobierne la metodologia, MiniMax (con OCR de sitios) y las llaves de las fuentes de nivel A."
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
          value={cfg.ai_ocr_enabled ? "OCR activo" : cfg.ai_web_enabled ? "Solo texto" : "Apagado"}
          tone={cfg.ai_ocr_enabled ? "ok" : cfg.ai_web_enabled ? "info" : "neutral"}
          sub={cfg.ai_ocr_enabled ? `Vision: ${cfg.minimax_vision_model || "MiniMax-M3"}` : "La IA puede leer paginas; el OCR es opcional"}
          tip="Con OCR, MiniMax-M3 lee imagenes y PDF escaneados de las fuentes."
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
          label="Version del sistema"
          value={`v${cfg.version}`}
          tone="neutral"
          sub={`${cfg.total_sources} fuentes · ${cfg.total_findings} hallazgos`}
          tip="Version de la aplicacion y volumen del inventario."
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

      {tab === "ia" && (
      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 16 }} className="dash-grid">
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
            MiniMax entra a las paginas de las fuentes, estructura senales de horizonte y, si lo
            habilita, lee imagenes y PDF escaneados con MiniMax-M3. La llave no se muestra completa.
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

          <Select label="Proveedor" value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="auto">Automatico (MiniMax si hay llave; si no, Gemini)</option>
            <option value="minimax">Solo MiniMax</option>
            <option value="gemini">Solo Gemini</option>
          </Select>

          <Select label="Modelo MiniMax" value={minimaxModel} onChange={(e) => setMinimaxModel(e.target.value)}>
            <option value="">Automatico (mejor modelo disponible)</option>
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
            title="IA entra a los sitios web"
            text="Durante el escaneo, MiniMax lee el contenido real de la pagina y extrae tecnologias."
          />
          <ToggleRow
            checked={ocrEnabled}
            onChange={setOcrEnabled}
            title="Habilitar IA con OCR"
            text={`MiniMax-M3 lee imagenes y PDF escaneados. Vision: ${cfg.minimax_vision_model || "MiniMax-M3"}.`}
          />

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
              <option value="">Automatico</option>
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
          <SectionTitle>Como funciona</SectionTitle>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#475569", lineHeight: 1.9 }}>
            <li>La llave de MiniMax se carga desde el servidor o se pega aqui.</li>
            <li>Pulse <b>Detectar mejor modelo</b> para probar cual responde en su cuenta.</li>
            <li>Active <b>IA entra a los sitios</b> para extraer senales reales al escanear.</li>
            <li>Active <b>OCR</b> si las fuentes publican imagenes o PDF escaneados.</li>
            <li>Gemini queda como respaldo si MiniMax no responde.</li>
          </ol>
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
              Lo que habilita
            </div>
            {[
              ["globe", "Visita real de HTML/PDF de cada fuente y extraccion estructurada."],
              ["spark", "OCR con MiniMax-M3 sobre imagenes y paginas escaneadas."],
              ["bulb", "Recomendaciones de adopcion para Colombia y asistente RAG."],
              ["chat", "Enriquecimiento de fichas y notas del equipo."],
            ].map(([ic, txt]) => (
              <div key={ic} style={{ display: "flex", gap: 10, marginBottom: 10, fontSize: 13, color: "#475569" }}>
                <Icon name={ic} size={17} color="#6366F1" style={{ marginTop: 1 }} />
                <span>{txt}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
      )}

      {tab === "fuentes" && (
        <Card>
          <SectionTitle hint={GLOSSARY.nivel_a}>Llaves de fuentes de nivel A</SectionTitle>
          <p style={{ fontSize: 13, color: "#64748B", marginTop: -6 }}>
            openFDA y PubMed multiplican su cupo con una llave gratuita. Sin ellas el sistema funciona,
            pero con un tope bajo que puede dejar corridas en ambar.
          </p>
          <div style={{ display: "grid", gap: 12, maxWidth: 520 }}>
            <Input
              label="Llave openFDA (api.data.gov)"
              type="password"
              value={openfdaKey}
              onChange={(e) => setOpenfdaKey(e.target.value)}
              placeholder={cfg.openfda_has_key ? "Llave ya configurada" : "Pegue la llave gratuita"}
            />
            <Input
              label="Llave NCBI / PubMed"
              type="password"
              value={ncbiKey}
              onChange={(e) => setNcbiKey(e.target.value)}
              placeholder={cfg.ncbi_has_key ? "Llave ya configurada" : "Opcional; 10 peticiones por segundo"}
            />
            <Input
              label="Correo institucional NCBI"
              value={ncbiEmail}
              onChange={(e) => setNcbiEmail(e.target.value)}
            />
            <div>
              <Button
                onClick={async () => {
                  setSaving(true);
                  try {
                    const payload = { ncbi_email: ncbiEmail };
                    if (openfdaKey.trim()) payload.openfda_api_key = openfdaKey.trim();
                    if (ncbiKey.trim()) payload.ncbi_api_key = ncbiKey.trim();
                    const { data } = await api.put("/config", payload);
                    applyCfg(data);
                    setOpenfdaKey("");
                    setNcbiKey("");
                    toast.success("Llaves de fuentes guardadas");
                  } catch (e) {
                    toast.error(apiError(e, "No se pudieron guardar las llaves"));
                  } finally {
                    setSaving(false);
                  }
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
