import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../components/Toast";
import { apiError } from "../api/client";
import Button from "../components/Button";
import { Input } from "../components/Field";

export default function Login() {
  const { status, loginWithGoogle, loginDev } = useAuth();
  const toast = useToast();
  const googleBtn = useRef(null);
  const [devEmail, setDevEmail] = useState("");
  const [devName, setDevName] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);

  useEffect(() => {
    if (!status?.google_login_enabled || !status?.google_client_id) return undefined;
    let tries = 0;
    const init = () => {
      if (window.google?.accounts?.id) {
        window.google.accounts.id.initialize({
          client_id: status.google_client_id,
          callback: async (resp) => {
            try {
              setLoading(true);
              await loginWithGoogle(resp.credential);
            } catch (e) {
              toast.error(apiError(e, "No se pudo iniciar sesion con Google"));
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
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    if (googleReady && status?.google_client_id && googleBtn.current) {
      window.google.accounts.id.renderButton(googleBtn.current, {
        theme: "outline",
        size: "large",
        width: 320,
        text: "signin_with",
        shape: "pill",
      });
    }
  }, [googleReady, status]);

  const handleDev = async (e) => {
    e.preventDefault();
    if (!devEmail.trim()) return;
    try {
      setLoading(true);
      await loginDev(devEmail.trim(), devName.trim());
    } catch (err) {
      toast.error(apiError(err, "No se pudo iniciar sesion"));
    } finally {
      setLoading(false);
    }
  };

  const quickAccess = async () => {
    try {
      setLoading(true);
      await loginDev("admin@iets.org.co", "Administrador IETS");
    } catch (err) {
      toast.error(apiError(err, "No se pudo iniciar sesion"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
      }}
      className="login-grid"
    >
      {/* Panel de marca */}
      <div
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
        className="login-brand"
      >
        <div style={{ position: "relative", zIndex: 2, maxWidth: 460 }}>
          <div style={{ fontSize: 46, marginBottom: 20 }}>🔭</div>
          <h1 style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.15, color: "#fff" }}>
            Sistema de Escaneo de Horizonte
          </h1>
          <p style={{ fontSize: 16, opacity: 0.92, marginTop: 16, lineHeight: 1.6 }}>
            Identificacion temprana de tecnologias sanitarias emergentes para Colombia.
            Vigilancia de fuentes internacionales, analisis con IA y recomendaciones de adopcion.
          </p>
          <div style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 14 }}>
            {[
              ["🌐", "Vigilancia automatizada de fuentes globales de horizon scanning"],
              ["💡", "Recomendaciones de adopcion generadas con Gemini"],
              ["📊", "Dashboards y hallazgos actualizados en tiempo real"],
            ].map(([ic, t]) => (
              <div key={t} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 14 }}>
                <span style={{ fontSize: 18 }}>{ic}</span>
                <span style={{ opacity: 0.95 }}>{t}</span>
              </div>
            ))}
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            width: 420,
            height: 420,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.08)",
            bottom: -120,
            right: -120,
          }}
        />
      </div>

      {/* Panel de acceso */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 40,
          background: "#F8FAFC",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 380,
            background: "#fff",
            border: "1px solid #E2E8F0",
            borderRadius: 16,
            padding: 32,
            boxShadow: "var(--shadow-md)",
          }}
        >
          <h2 style={{ fontSize: 22, fontWeight: 700 }}>Iniciar sesion</h2>
          <p style={{ color: "#64748B", fontSize: 14, marginTop: 6 }}>
            Acceso exclusivo con cuentas institucionales{" "}
            <strong>@{status?.allowed_domain || "iets.org.co"}</strong>.
          </p>

          <div style={{ marginTop: 26 }}>
            {status?.google_login_enabled ? (
              <div ref={googleBtn} style={{ display: "flex", justifyContent: "center" }} />
            ) : (
              <div
                style={{
                  background: "#FEF3C7",
                  border: "1px solid #FDE68A",
                  color: "#92400E",
                  borderRadius: 8,
                  padding: "10px 14px",
                  fontSize: 13,
                }}
              >
                Login con Google no configurado. Defina <code>GOOGLE_CLIENT_ID</code> en el backend.
              </div>
            )}
          </div>

          {status?.dev_login_enabled && (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  margin: "24px 0 18px",
                  color: "#94A3B8",
                  fontSize: 12,
                }}
              >
                <div style={{ flex: 1, height: 1, background: "#E2E8F0" }} />
                ACCESO DE DESARROLLO
                <div style={{ flex: 1, height: 1, background: "#E2E8F0" }} />
              </div>
              <Button
                onClick={quickAccess}
                loading={loading}
                style={{ width: "100%", marginBottom: 16 }}
              >
                ⚡ Acceso rapido (Administrador)
              </Button>
              <div
                style={{
                  textAlign: "center",
                  fontSize: 12,
                  color: "#94A3B8",
                  marginBottom: 14,
                }}
              >
                o ingrese con otro correo
              </div>
              <form onSubmit={handleDev}>
                <Input
                  label="Correo institucional"
                  placeholder={`usuario@${status?.allowed_domain || "iets.org.co"}`}
                  value={devEmail}
                  onChange={(e) => setDevEmail(e.target.value)}
                  type="email"
                  required
                />
                <Input
                  label="Nombre (opcional)"
                  placeholder="Nombre y apellido"
                  value={devName}
                  onChange={(e) => setDevName(e.target.value)}
                />
                <Button type="submit" loading={loading} style={{ width: "100%", marginTop: 6 }}>
                  Ingresar
                </Button>
              </form>
              <p style={{ fontSize: 11, color: "#94A3B8", marginTop: 12, textAlign: "center" }}>
                El primer usuario registrado obtiene rol de administrador.
              </p>
            </>
          )}
          <p style={{ fontSize: 13, color: "#64748B", marginTop: 18, textAlign: "center" }}>
            ¿Desarrollador o sociedad cientifica?{" "}
            <Link to="/postular" style={{ fontWeight: 700, color: "#4F46E5" }}>
              Postule una tecnologia
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
