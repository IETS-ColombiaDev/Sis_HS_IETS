import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { apiError, getLastEmail } from "../api/client";
import Button from "../components/Button";
import { Input } from "../components/Field";
import PasswordField from "../components/PasswordField";
import LanguageSwitch from "../components/LanguageSwitch";
import { BrandMark } from "../branding/BrandingContext";
import Icon from "../components/Icon";
import { t } from "../i18n";

const FEATURES = [
  ["radar", t("Vigilancia automatizada de agencias, registros de ensayos y literatura internacional")],
  ["layers", t("Ciclo metodológico IETS: filtrado, matriz P1-P6, evaluación temprana y pares")],
  ["chart", t("Tablero de gobernanza, boletines y alertas tempranas para el SGSSS")],
];

export default function Login() {
  const { status, sessionNotice, loginWithPassword, loginWithGoogle, loginDev } = useAuth();
  const googleBtn = useRef(null);
  const [email, setEmail] = useState(() => getLastEmail());
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const [devEmail, setDevEmail] = useState(() => getLastEmail());
  const [devName, setDevName] = useState("");
  const [devOpen, setDevOpen] = useState(false);
  const domain = status?.allowed_domain || "iets.org.co";

  useEffect(() => {
    if (!status?.google_login_enabled || !status?.google_client_id) return undefined;
    let tries = 0;
    let cancelled = false;
    const init = () => {
      if (cancelled) return;
      if (window.google?.accounts?.id) {
        window.google.accounts.id.initialize({
          client_id: status.google_client_id,
          callback: async (resp) => {
            try {
              setLoading(true);
              setError("");
              await loginWithGoogle(resp.credential);
            } catch (e) {
              setError(apiError(e, t("No se pudo iniciar sesión con Google")));
            } finally {
              setLoading(false);
            }
          },
        });
        setGoogleReady(true);
      } else if (tries < 40) {
        tries += 1;
        setTimeout(init, 150);
      }
    };
    init();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    if (googleReady && status?.google_client_id && googleBtn.current) {
      window.google.accounts.id.renderButton(googleBtn.current, {
        theme: "outline",
        size: "large",
        width: 316,
        text: "signin_with",
        shape: "pill",
      });
    }
  }, [googleReady, status]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError(t("Escriba su correo y su contraseña."));
      return;
    }
    try {
      setLoading(true);
      await loginWithPassword(email.trim(), password);
    } catch (err) {
      setError(apiError(err, t("No se pudo iniciar sesión. Si el servidor está ocupado, espere unos segundos e intente de nuevo.")));
      setPassword("");
    } finally {
      setLoading(false);
    }
  };

  const devLogin = async (targetEmail, targetName = "") => {
    try {
      setLoading(true);
      setError("");
      await loginDev(targetEmail, targetName);
    } catch (err) {
      setError(apiError(err, t("No se pudo iniciar sesión. Espere un momento e intente de nuevo.")));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-grid" style={{ minHeight: "100vh", display: "grid", gridTemplateColumns: "1fr 1fr" }}>
      {/* Panel de marca */}
      <div
        className="login-brand"
        style={{
          background: "linear-gradient(135deg,#1D4ED8 0%,#3B82F6 100%)",
          color: "#fff",
          padding: "64px 56px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ position: "relative", zIndex: 2, maxWidth: 460 }}>
          <BrandMark className="login-logo" iconSize={30} />
          <h1 style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.15, color: "#fff" }}>
            {t("Sistema de Escaneo de Horizonte")}
          </h1>
          <p style={{ fontSize: 16, opacity: 0.92, marginTop: 16, lineHeight: 1.6 }}>
            {t("Identificación temprana de tecnologías sanitarias emergentes para Colombia, con la metodología oficial del IETS y trazabilidad completa en bitácora.")}
          </p>
          <div style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 14 }}>
            {FEATURES.map(([ic, text]) => (
              <div key={text} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 14 }}>
                <span className="login-feature-ico" aria-hidden="true">
                  <Icon name={ic} size={17} />
                </span>
                <span style={{ opacity: 0.95 }}>{text}</span>
              </div>
            ))}
          </div>
        </div>
        <div
          aria-hidden="true"
          style={{ position: "absolute", width: 420, height: 420, borderRadius: "50%", background: "rgba(255,255,255,0.08)", bottom: -120, right: -120 }}
        />
      </div>

      {/* Panel de acceso */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 40, background: "#F8FAFC" }}>
        <main
          style={{
            width: "100%",
            maxWidth: 400,
            background: "#fff",
            border: "1px solid #E2E8F0",
            borderRadius: 16,
            padding: 32,
            boxShadow: "var(--shadow-md)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <LanguageSwitch />
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 700 }}>{t("Iniciar sesión")}</h2>
          <p style={{ color: "#64748B", fontSize: 14, marginTop: 6 }}>
            {t("Ingrese con la cuenta que le asignó el administrador del sistema.")}
          </p>

          {sessionNotice && (
            <div role="status" className="login-notice login-notice-info">
              {sessionNotice}
            </div>
          )}

          <form onSubmit={submit} style={{ marginTop: 22 }} noValidate aria-label={t("Acceso con correo y contraseña")}>
            <Input
              id="login-email"
              label={t("Correo")}
              hint={t("Su correo institucional (@{domain}) o el que registró el administrador para su cuenta.", { domain })}
              placeholder={t("nombre.apellido@{domain}", { domain })}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="username"
              autoFocus
              required
            />
            <PasswordField
              id="login-password"
              label={t("Contraseña")}
              hint={t("Distingue mayúsculas y minúsculas. Tras 5 intentos fallidos la cuenta se bloquea 15 minutos.")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error && (
              <div role="alert" className="login-notice login-notice-error">
                {error}
              </div>
            )}
            <Button type="submit" loading={loading} style={{ width: "100%", marginTop: 4 }}>
              {t("Ingresar")}
            </Button>
          </form>
          <p style={{ fontSize: 12.5, color: "#64748B", marginTop: 12, textAlign: "center" }}>
            {t("¿Olvidó su contraseña o no tiene cuenta? Solicítela al superadministrador del sistema.")}
          </p>

          {status?.google_login_enabled && (
            <>
              <div className="login-divider">{t("o")}</div>
              <div ref={googleBtn} style={{ display: "flex", justifyContent: "center", minHeight: 44 }} />
            </>
          )}

          {status?.dev_login_enabled && (
            <div className="login-dev">
              <button type="button" className="login-dev-toggle" onClick={() => setDevOpen((v) => !v)} aria-expanded={devOpen}>
                <span>{t("Acceso de desarrollo")}</span>
                <span className="login-dev-badge">{t("solo fuera de producción")}</span>
                <span aria-hidden="true">{devOpen ? "▴" : "▾"}</span>
              </button>
              {devOpen && (
                <div style={{ marginTop: 12 }}>
                  <p style={{ fontSize: 12, color: "#92400E", marginBottom: 10 }}>
                    {t("Entra sin contraseña. Queda deshabilitado automáticamente con ENVIRONMENT=production.")}
                  </p>
                  <Button variant="secondary" onClick={() => devLogin("admin@iets.org.co", "Administrador IETS")} loading={loading} style={{ width: "100%", marginBottom: 12 }}>
                    {t("Acceso rápido como administrador")}
                  </Button>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (devEmail.trim()) devLogin(devEmail.trim(), devName.trim());
                    }}
                  >
                    <Input
                      id="dev-email"
                      label={t("Correo institucional")}
                      placeholder={t("usuario@{domain}", { domain })}
                      value={devEmail}
                      onChange={(e) => setDevEmail(e.target.value)}
                      type="email"
                      required
                    />
                    <Input id="dev-name" label={t("Nombre (opcional)")} placeholder={t("Nombre y apellido")} value={devName} onChange={(e) => setDevName(e.target.value)} />
                    <Button type="submit" variant="outline" loading={loading} style={{ width: "100%" }}>
                      {t("Ingresar sin contraseña")}
                    </Button>
                  </form>
                </div>
              )}
            </div>
          )}

          <p style={{ fontSize: 13, color: "#64748B", marginTop: 20, textAlign: "center", lineHeight: 1.6 }}>
            {t("¿Desarrollador o sociedad científica?")}{" "}
            <Link to="/postular" style={{ fontWeight: 700, color: "#1D4ED8" }}>
              {t("Postule una tecnología")}
            </Link>
            <br />
            <Link to="/expedientes" style={{ color: "#1D4ED8" }}>{t("Consultar fichas públicas")}</Link>
            {" · "}
            <Link to="/transparencia" style={{ color: "#1D4ED8" }}>{t("Transparencia")}</Link>
          </p>
          {status?.version && (
            <p style={{ fontSize: 11, color: "#94A3B8", marginTop: 10, textAlign: "center" }}>{t("Versión {version}", { version: status.version })}</p>
          )}
        </main>
      </div>
    </div>
  );
}
