import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { apiError } from "../api/client";
import Button from "../components/Button";
import { Input } from "../components/Field";
import PasswordField from "../components/PasswordField";

const FEATURES = [
  ["🌐", "Vigilancia automatizada de agencias, registros de ensayos y literatura internacional"],
  ["🧭", "Ciclo metodológico IETS: filtrado, matriz P1-P6, evaluación temprana y pares"],
  ["📊", "Tablero de gobernanza, boletines y alertas tempranas para el SGSSS"],
];

export default function Login() {
  const { status, sessionNotice, loginWithPassword, loginWithGoogle, loginDev } = useAuth();
  const googleBtn = useRef(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const [devEmail, setDevEmail] = useState("");
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
              setError(apiError(e, "No se pudo iniciar sesión con Google"));
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
      setError("Escriba su correo y su contraseña.");
      return;
    }
    try {
      setLoading(true);
      await loginWithPassword(email.trim(), password);
    } catch (err) {
      setError(apiError(err, "No se pudo iniciar sesión"));
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
      setError(apiError(err, "No se pudo iniciar sesión"));
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
          background: "linear-gradient(135deg,#4F46E5 0%,#3B82F6 100%)",
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
          <div style={{ fontSize: 46, marginBottom: 20 }} aria-hidden="true">🔭</div>
          <h1 style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.15, color: "#fff" }}>
            Sistema de Escaneo de Horizonte
          </h1>
          <p style={{ fontSize: 16, opacity: 0.92, marginTop: 16, lineHeight: 1.6 }}>
            Identificación temprana de tecnologías sanitarias emergentes para Colombia, con la
            metodología oficial del IETS y trazabilidad completa en bitácora.
          </p>
          <div style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 14 }}>
            {FEATURES.map(([ic, t]) => (
              <div key={t} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 14 }}>
                <span style={{ fontSize: 18 }} aria-hidden="true">{ic}</span>
                <span style={{ opacity: 0.95 }}>{t}</span>
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
          <h2 style={{ fontSize: 22, fontWeight: 700 }}>Iniciar sesión</h2>
          <p style={{ color: "#64748B", fontSize: 14, marginTop: 6 }}>
            Ingrese con la cuenta que le asignó el administrador del sistema.
          </p>

          {sessionNotice && (
            <div role="status" className="login-notice login-notice-info">
              {sessionNotice}
            </div>
          )}

          <form onSubmit={submit} style={{ marginTop: 22 }} noValidate aria-label="Acceso con correo y contraseña">
            <Input
              id="login-email"
              label="Correo"
              hint={`Su correo institucional (@${domain}) o el que registró el administrador para su cuenta.`}
              placeholder={`nombre.apellido@${domain}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="username"
              autoFocus
              required
            />
            <PasswordField
              id="login-password"
              label="Contraseña"
              hint="Distingue mayúsculas y minúsculas. Tras 5 intentos fallidos la cuenta se bloquea 15 minutos."
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
              Ingresar
            </Button>
          </form>
          <p style={{ fontSize: 12.5, color: "#64748B", marginTop: 12, textAlign: "center" }}>
            ¿Olvidó su contraseña o no tiene cuenta? Solicítela al superadministrador del sistema.
          </p>

          {status?.google_login_enabled && (
            <>
              <div className="login-divider">o</div>
              <div ref={googleBtn} style={{ display: "flex", justifyContent: "center", minHeight: 44 }} />
            </>
          )}

          {status?.dev_login_enabled && (
            <div className="login-dev">
              <button type="button" className="login-dev-toggle" onClick={() => setDevOpen((v) => !v)} aria-expanded={devOpen}>
                <span>Acceso de desarrollo</span>
                <span className="login-dev-badge">solo fuera de producción</span>
                <span aria-hidden="true">{devOpen ? "▴" : "▾"}</span>
              </button>
              {devOpen && (
                <div style={{ marginTop: 12 }}>
                  <p style={{ fontSize: 12, color: "#92400E", marginBottom: 10 }}>
                    Entra sin contraseña. Queda deshabilitado automáticamente con ENVIRONMENT=production.
                  </p>
                  <Button variant="secondary" onClick={() => devLogin("admin@iets.org.co", "Administrador IETS")} loading={loading} style={{ width: "100%", marginBottom: 12 }}>
                    Acceso rápido como administrador
                  </Button>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (devEmail.trim()) devLogin(devEmail.trim(), devName.trim());
                    }}
                  >
                    <Input
                      id="dev-email"
                      label="Correo institucional"
                      placeholder={`usuario@${domain}`}
                      value={devEmail}
                      onChange={(e) => setDevEmail(e.target.value)}
                      type="email"
                      required
                    />
                    <Input id="dev-name" label="Nombre (opcional)" placeholder="Nombre y apellido" value={devName} onChange={(e) => setDevName(e.target.value)} />
                    <Button type="submit" variant="outline" loading={loading} style={{ width: "100%" }}>
                      Ingresar sin contraseña
                    </Button>
                  </form>
                </div>
              )}
            </div>
          )}

          <p style={{ fontSize: 13, color: "#64748B", marginTop: 20, textAlign: "center", lineHeight: 1.6 }}>
            ¿Desarrollador o sociedad científica?{" "}
            <Link to="/postular" style={{ fontWeight: 700, color: "#4F46E5" }}>
              Postule una tecnología
            </Link>
            <br />
            <Link to="/expedientes" style={{ color: "#4F46E5" }}>Consultar fichas públicas</Link>
            {" · "}
            <Link to="/transparencia" style={{ color: "#4F46E5" }}>Transparencia</Link>
          </p>
          {status?.version && (
            <p style={{ fontSize: 11, color: "#94A3B8", marginTop: 10, textAlign: "center" }}>Versión {status.version}</p>
          )}
        </main>
      </div>
    </div>
  );
}
