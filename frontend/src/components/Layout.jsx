import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useRealtime } from "../realtime/RealtimeContext";
import Icon from "./Icon";
import Tooltip from "./Tooltip";

const NAV = [
  { section: "Panel" },
  { to: "/", label: "Resumen", icon: "home", end: true },
  { to: "/dashboards", label: "Dashboards", icon: "chart" },
  { section: "Escaneo de horizonte" },
  { to: "/fuentes", label: "Fuentes", icon: "globe" },
  { to: "/hallazgos", label: "Hallazgos", icon: "telescope" },
  { to: "/escaneo", label: "Escaneo web", icon: "radar" },
  { to: "/notas", label: "Notas", icon: "note" },
  { section: "Inteligencia" },
  { to: "/recomendaciones", label: "Recomendaciones", icon: "bulb" },
  { to: "/chat", label: "Asistente IA", icon: "chat" },
  { section: "Administracion", admin: true },
  { to: "/usuarios", label: "Usuarios", icon: "users", admin: true },
  { to: "/configuracion", label: "Configuracion", icon: "cog", admin: true },
];

function Sidebar({ open, onClose }) {
  const { isAdmin } = useAuth();
  return (
    <>
      {open && (
        <div
          onClick={onClose}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.4)",
            zIndex: 40,
          }}
          className="sidebar-overlay"
        />
      )}
      <aside
        style={{
          width: 280,
          background: "#fff",
          borderRight: "1px solid #E2E8F0",
          height: "100vh",
          position: "fixed",
          left: 0,
          top: 0,
          zIndex: 50,
          display: "flex",
          flexDirection: "column",
          transform: open ? "translateX(0)" : undefined,
        }}
        className={`sidebar ${open ? "sidebar-open" : ""}`}
      >
        <div style={{ padding: "20px 22px", borderBottom: "1px solid #E2E8F0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 13,
                background: "linear-gradient(135deg,#6366F1,#3B82F6)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                boxShadow: "0 6px 16px rgba(99,102,241,0.35)",
                flexShrink: 0,
              }}
            >
              <Icon name="radar" size={24} strokeWidth={2} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, lineHeight: 1.1 }}>
                Escaneo de Horizonte
              </div>
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  color: "#94A3B8",
                  fontWeight: 600,
                  marginTop: 2,
                }}
              >
                IETS Colombia
              </div>
            </div>
          </div>
        </div>

        <nav style={{ flex: 1, overflowY: "auto", padding: "14px 12px" }}>
          {NAV.map((item, i) => {
            if (item.section) {
              if (item.admin && !isAdmin) return null;
              return (
                <div
                  key={`s-${i}`}
                  style={{
                    fontSize: 11,
                    letterSpacing: 0.5,
                    textTransform: "uppercase",
                    color: "#94A3B8",
                    fontWeight: 600,
                    padding: "16px 12px 6px",
                  }}
                >
                  {item.section}
                </div>
              );
            }
            if (item.admin && !isAdmin) return null;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={onClose}
                style={({ isActive }) => ({
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px 10px 14px",
                  borderRadius: 9,
                  marginBottom: 2,
                  color: isActive ? "#4F46E5" : "#475569",
                  background: isActive ? "#EEF2FF" : "transparent",
                  fontWeight: isActive ? 600 : 500,
                  fontSize: 14,
                  textDecoration: "none",
                  transition: "background 150ms ease-in-out, color 150ms",
                })}
                onMouseEnter={(e) => {
                  if (e.currentTarget.getAttribute("aria-current") !== "page")
                    e.currentTarget.style.background = "#F1F5F9";
                }}
                onMouseLeave={(e) => {
                  const active = e.currentTarget.getAttribute("aria-current") === "page";
                  e.currentTarget.style.background = active ? "#EEF2FF" : "transparent";
                }}
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span
                        style={{
                          position: "absolute",
                          left: 0,
                          top: 8,
                          bottom: 8,
                          width: 3,
                          borderRadius: 3,
                          background: "linear-gradient(180deg,#6366F1,#3B82F6)",
                        }}
                      />
                    )}
                    <Icon name={item.icon} size={19} strokeWidth={isActive ? 2.1 : 1.8} />
                    {item.label}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>
        <div style={{ padding: 16, borderTop: "1px solid #E2E8F0", fontSize: 11, color: "#94A3B8" }}>
          Sistema de alerta temprana de tecnologias sanitarias.
        </div>
      </aside>
    </>
  );
}

function GeminiPill({ enabled, model, isAdmin }) {
  const navigate = useNavigate();
  const tone = enabled
    ? { color: "#065F46", bg: "#ECFDF5", border: "#A7F3D0", dot: "#10B981" }
    : { color: "#92400E", bg: "#FEF3C7", border: "#FDE68A", dot: "#F59E0B" };
  const label = enabled ? `IA activa${model ? ` · ${model}` : ""}` : "IA sin configurar";
  const tip = enabled
    ? `Inteligencia artificial habilitada (${model || "modelo automatico"}).${isAdmin ? " Clic para gestionar." : ""}`
    : isAdmin
    ? "La IA no tiene token. Clic para configurar el token de Gemini."
    : "La IA no esta configurada. Solicite a un administrador el token de Gemini.";
  return (
    <Tooltip text={tip}>
      <button
        onClick={() => isAdmin && navigate("/configuracion")}
        className="gemini-pill"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          fontSize: 12,
          fontWeight: 600,
          color: tone.color,
          background: tone.bg,
          border: `1px solid ${tone.border}`,
          padding: "5px 11px",
          borderRadius: 9999,
          cursor: isAdmin ? "pointer" : "default",
          maxWidth: 220,
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: tone.dot, flexShrink: 0 }} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      </button>
    </Tooltip>
  );
}

function Header({ onToggle }) {
  const { user, logout, status, isAdmin } = useAuth();
  const { updatedAt } = useRealtime();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  const titles = {
    "/": "Resumen general",
    "/dashboards": "Dashboards",
    "/fuentes": "Fuentes de informacion",
    "/hallazgos": "Hallazgos de escaneo",
    "/escaneo": "Escaneo web",
    "/notas": "Notas del equipo",
    "/recomendaciones": "Recomendaciones de adopcion",
    "/chat": "Asistente IA",
    "/usuarios": "Gestion de usuarios",
    "/configuracion": "Configuracion del sistema",
  };

  return (
    <header
      style={{
        height: 64,
        background: "rgba(255,255,255,0.9)",
        backdropFilter: "blur(8px)",
        borderBottom: "1px solid #E2E8F0",
        position: "sticky",
        top: 0,
        zIndex: 30,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <button
          onClick={onToggle}
          aria-label="Menu"
          className="hamburger"
          style={{
            border: "1px solid #E2E8F0",
            background: "#fff",
            borderRadius: 8,
            width: 38,
            height: 38,
            fontSize: 18,
            display: "none",
          }}
        >
          ☰
        </button>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>{titles[location.pathname] || "IETS"}</h2>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <Tooltip
          text={`Datos en tiempo real y compartidos: cualquier cambio (escaneos, hallazgos, recomendaciones) es visible al instante para todos los usuarios.${updatedAt ? ` Ultima actualizacion: ${new Date(updatedAt).toLocaleString()}.` : ""}`}
        >
          <div
            className="realtime-pill"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              fontSize: 12,
              fontWeight: 600,
              color: "#065F46",
              background: "#ECFDF5",
              border: "1px solid #A7F3D0",
              padding: "5px 12px",
              borderRadius: 9999,
              cursor: "help",
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#10B981",
                animation: "pulse 2s infinite",
              }}
            />
            En vivo
          </div>
        </Tooltip>

        {status && (
          <GeminiPill enabled={status.gemini_enabled} model={status.gemini_model} isAdmin={isAdmin} />
        )}

        <div style={{ position: "relative" }}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              border: "none",
              background: "transparent",
              padding: 4,
            }}
          >
            <Avatar user={user} />
            <div style={{ textAlign: "left" }} className="user-meta">
              <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{user?.name}</div>
              <div style={{ fontSize: 11, color: "#94A3B8", textTransform: "capitalize" }}>
                {user?.role}
              </div>
            </div>
          </button>
          {menuOpen && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 5 }} onClick={() => setMenuOpen(false)} />
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: 52,
                  background: "#fff",
                  border: "1px solid #E2E8F0",
                  borderRadius: 10,
                  boxShadow: "var(--shadow-dropdown)",
                  minWidth: 220,
                  zIndex: 10,
                  overflow: "hidden",
                }}
              >
                <div style={{ padding: "12px 16px", borderBottom: "1px solid #E2E8F0" }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{user?.name}</div>
                  <div style={{ fontSize: 12, color: "#64748B" }}>{user?.email}</div>
                </div>
                <button
                  onClick={logout}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 16px",
                    border: "none",
                    background: "transparent",
                    fontSize: 14,
                    color: "#EF4444",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#FEE2E2")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <Icon name="logout" size={17} />
                  Cerrar sesion
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function Avatar({ user }) {
  if (user?.picture) {
    return (
      <img
        src={user.picture}
        alt={user.name}
        style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover" }}
      />
    );
  }
  const initials = (user?.name || user?.email || "?")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: "50%",
        background: "linear-gradient(135deg,#6366F1,#3B82F6)",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 13,
        fontWeight: 700,
      }}
    >
      {initials}
    </div>
  );
}

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  return (
    <div>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="content-shell" style={{ marginLeft: 280, minHeight: "100vh" }}>
        <Header onToggle={() => setSidebarOpen((v) => !v)} />
        <main style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }} className="fade-in">
          {children}
        </main>
      </div>
    </div>
  );
}
