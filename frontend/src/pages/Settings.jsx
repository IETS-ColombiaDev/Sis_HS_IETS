import { useCallback, useEffect, useState } from "react";
import api, { apiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../components/Toast";
import { PageHeader, Card, SectionTitle } from "../components/Card";
import Button from "../components/Button";
import Badge from "../components/Badge";
import Icon from "../components/Icon";
import Tooltip from "../components/Tooltip";
import { Input, Select } from "../components/Field";
import { LoadingBlock } from "../components/Spinner";

export default function Settings() {
  const toast = useToast();
  const { refreshStatus } = useAuth();
  const [cfg, setCfg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [model, setModel] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [banner, setBanner] = useState(null); // {type, message}

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/config");
      setCfg(data);
      setModel(data.gemini_model || "");
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

  const testConnection = async () => {
    setTesting(true);
    setBanner(null);
    try {
      const { data } = await api.post("/config/test", {
        gemini_api_key: token.trim() ? token.trim() : null,
      });
      setBanner({ type: data.ok ? "ok" : "error", message: data.message });
      if (data.ok) toast.success("Conexion con Gemini verificada");
      else toast.error("La prueba de conexion fallo");
    } catch (e) {
      const msg = apiError(e, "No se pudo probar la conexion");
      setBanner({ type: "error", message: msg });
      toast.error(msg);
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setBanner(null);
    try {
      const payload = { gemini_model: model };
      if (token.trim()) payload.gemini_api_key = token.trim();
      const { data } = await api.put("/config", payload);
      setCfg(data);
      setToken("");
      setModel(data.gemini_model || "");
      refreshStatus();
      if (data.gemini_enabled) {
        setBanner({ type: "ok", message: `Configuracion guardada. IA activa con el modelo ${data.gemini_active_model}.` });
        toast.success("Configuracion guardada. IA activada.");
      } else {
        setBanner({ type: "warn", message: "Configuracion guardada, pero la IA sigue sin token valido." });
        toast.success("Configuracion guardada");
      }
    } catch (e) {
      toast.error(apiError(e, "No se pudo guardar la configuracion"));
    } finally {
      setSaving(false);
    }
  };

  const removeToken = async () => {
    setSaving(true);
    try {
      const { data } = await api.put("/config", { gemini_api_key: "" });
      setCfg(data);
      setToken("");
      refreshStatus();
      setBanner({ type: "warn", message: "Token eliminado. La IA opera ahora en modo basico." });
      toast.success("Token eliminado");
    } catch (e) {
      toast.error(apiError(e, "No se pudo eliminar el token"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingBlock label="Cargando configuracion..." />;

  return (
    <div>
      <PageHeader
        title="Configuracion del sistema"
        subtitle="Gestione la integracion con la IA (Gemini), verifique el estado de los servicios y consulte los parametros del sistema."
      />

      {/* Estado general */}
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
          value={cfg.gemini_enabled ? "Activa" : "Sin configurar"}
          tone={cfg.gemini_enabled ? "ok" : "warn"}
          sub={cfg.gemini_enabled ? cfg.gemini_active_model : "Requiere token de Gemini"}
          tip="Estado de la integracion con Google Gemini para recomendaciones y chat."
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
          icon="globe"
          label="Fuentes vigiladas"
          value={String(cfg.total_sources)}
          tone="info"
          sub={`${cfg.total_findings} hallazgos almacenados`}
          tip="Total de fuentes en el inventario y hallazgos extraidos."
        />
        <StatusCard
          icon="info"
          label="Version del sistema"
          value={`v${cfg.version}`}
          tone="neutral"
          sub={cfg.dev_login_enabled ? "Modo desarrollo activo" : "Modo produccion"}
          tip="Version de la aplicacion y modo de ejecucion."
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 16 }} className="dash-grid">
        {/* Panel Gemini */}
        <Card>
          <SectionTitle
            right={
              <Badge tone={cfg.gemini_enabled ? "ok" : "warn"}>
                {cfg.gemini_enabled ? "Conectado" : "No conectado"}
              </Badge>
            }
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <Icon name="key" size={18} /> Integracion con Gemini (IA)
            </span>
          </SectionTitle>

          <p style={{ fontSize: 13, color: "#64748B", marginTop: -6, marginBottom: 16 }}>
            El token habilita la generacion de recomendaciones de adopcion para Colombia y el asistente
            conversacional. Se guarda de forma segura en el servidor y nunca se expone completo.
          </p>

          {banner && <AlertBanner type={banner.type} message={banner.message} onClose={() => setBanner(null)} />}

          {cfg.gemini_has_key && (
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
              <span style={{ color: "#475569" }}>Token actual:</span>
              <code style={{ fontWeight: 700, color: "#0F172A" }}>{cfg.gemini_key_masked}</code>
              <Tooltip text="Eliminar el token guardado. La IA pasara a modo basico.">
                <button
                  onClick={removeToken}
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
          )}

          <div style={{ position: "relative" }}>
            <Input
              label={cfg.gemini_has_key ? "Nuevo token (reemplaza el actual)" : "Token / API Key de Gemini"}
              placeholder="AIza..."
              type={showToken ? "text" : "password"}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
              style={{ paddingRight: 42, fontFamily: "monospace" }}
            />
            <button
              type="button"
              onClick={() => setShowToken((s) => !s)}
              title={showToken ? "Ocultar" : "Mostrar"}
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
              <Icon name={showToken ? "eyeOff" : "eye"} size={18} />
            </button>
          </div>

          <Select
            label="Modelo"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            <option value="">Automatico (detectar el mejor disponible)</option>
            {(cfg.available_models || []).map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
            {model && !(cfg.available_models || []).includes(model) && (
              <option value={model}>{model}</option>
            )}
          </Select>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
            <Tooltip text="Valida el token contra la API de Gemini con una consulta real (no lo guarda).">
              <Button variant="secondary" onClick={testConnection} loading={testing}>
                <Icon name="pulse" size={16} /> Probar conexion
              </Button>
            </Tooltip>
            <Tooltip text="Guarda el token y el modelo. La IA se activa de inmediato.">
              <Button onClick={save} loading={saving}>
                <Icon name="save" size={16} /> Guardar configuracion
              </Button>
            </Tooltip>
          </div>

          <div
            style={{
              marginTop: 18,
              padding: "12px 14px",
              background: "#EFF6FF",
              border: "1px solid #DBEAFE",
              borderRadius: 8,
              fontSize: 13,
              color: "#1E40AF",
              display: "flex",
              gap: 10,
            }}
          >
            <Icon name="info" size={18} color="#3B82F6" style={{ marginTop: 1 }} />
            <div>
              Obtenga un token gratuito en{" "}
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                style={{ color: "#1D4ED8", fontWeight: 700 }}
              >
                Google AI Studio <Icon name="external" size={12} />
              </a>
              . Debe iniciar sesion con una cuenta de Google y crear una API key.
            </div>
          </div>
        </Card>

        {/* Guia rapida */}
        <Card style={{ background: "#F8FAFC" }}>
          <SectionTitle>Como funciona</SectionTitle>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#475569", lineHeight: 1.9 }}>
            <li>Pegue su <b>token de Gemini</b> y pulse <b>Probar conexion</b>.</li>
            <li>Si la prueba es exitosa, pulse <b>Guardar configuracion</b>.</li>
            <li>La IA se activa al instante para <b>todos los usuarios</b>.</li>
            <li>Genere <b>recomendaciones</b> desde Hallazgos y use el <b>Asistente IA</b>.</li>
          </ol>

          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
              Funciones que habilita la IA
            </div>
            {[
              ["bulb", "Recomendaciones de adopcion contextualizadas a Colombia (INVIMA, ruta ETS, impacto)."],
              ["chat", "Asistente conversacional (RAG) sobre fuentes y hallazgos del sistema."],
            ].map(([ic, txt]) => (
              <div key={ic} style={{ display: "flex", gap: 10, marginBottom: 10, fontSize: 13, color: "#475569" }}>
                <Icon name={ic} size={17} color="#6366F1" style={{ marginTop: 1 }} />
                <span>{txt}</span>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: 8,
              padding: "10px 12px",
              background: "#fff",
              border: "1px solid #E2E8F0",
              borderRadius: 8,
              fontSize: 12.5,
              color: "#64748B",
            }}
          >
            Sin token, el sistema sigue 100% operativo en <b>modo basico</b>: escaneo, dashboards,
            fuentes y hallazgos funcionan; las recomendaciones y el chat usan respuestas basadas en la base de datos.
          </div>
        </Card>
      </div>
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
