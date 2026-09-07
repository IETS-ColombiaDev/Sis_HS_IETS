import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useCycle } from "../cycle/CycleContext";
import { useRealtime } from "../realtime/RealtimeContext";
import { aiEnabled, aiLabel } from "../ai/status";
import { CYCLE_STATUS_LABELS } from "../constants/methodology";
import { GLOSSARY } from "../constants/glossary";
import Icon from "./Icon";
import Tooltip from "./Tooltip";
import InfoTip from "./InfoTip";
import SafeAvatar from "./SafeAvatar";

const NAV = [
  { section: "Operacion diaria" },
  { to: "/", label: "Bandeja de trabajo", icon: "home", end: true, help: GLOSSARY.bandeja_trabajo },
  { to: "/ciclos", label: "Ciclos de escaneo", icon: "calendar", help: GLOSSARY.ciclo },
  { section: "Metodologia IETS" },
  { to: "/vigilancia", label: "1. Vigilancia", icon: "radar", help: GLOSSARY.vigilancia },
  { to: "/fuentes", label: "Catalogo de fuentes", icon: "globe", help: GLOSSARY.catalogo_fuentes },
  { to: "/bandeja-entrada", label: "Bandeja de entrada", icon: "inbox", help: GLOSSARY.bandeja_entrada },
  { to: "/postulaciones", label: "Postulaciones", icon: "note", help: GLOSSARY.postulacion },
  { to: "/filtrado", label: "Filtrado y depuracion", icon: "filter", help: GLOSSARY.filtrado },
  { to: "/priorizacion", label: "2. Priorizacion", icon: "layers", help: GLOSSARY.priorizacion },
  { to: "/evaluacion", label: "3. Evaluacion", icon: "doc", help: GLOSSARY.evaluacion },
  { to: "/diseminacion", label: "4. Diseminacion", icon: "bulb", help: GLOSSARY.diseminacion },
  { to: "/boletines", label: "Boletines del ciclo", icon: "doc", help: GLOSSARY.boletin },
  { to: "/notas", label: "Notas del equipo", icon: "note", help: "Notas internas del equipo, vinculadas a senales, fuentes o informes. No son el informe publico." },
  { section: "Analisis y alertas" },
  { to: "/dashboards", label: "Tablero estrategico", icon: "chart", help: GLOSSARY.tablero },
  { to: "/alertas", label: "Alertas tempranas", icon: "pulse", help: GLOSSARY.alertas },
  { to: "/senales", label: "Senales capturadas", icon: "list", help: GLOSSARY.senal },
  { to: "/chat", label: "Asistente IA", icon: "chat", help: GLOSSARY.minimax },
  { section: "Administracion", permission: "config:manage" },
  { to: "/auditoria", label: "Bitacora de auditoria", icon: "shield", permission: "audit:read", help: GLOSSARY.bitacora },
  { to: "/configuracion", label: "Configuracion", icon: "cog", permission: "config:manage", help: "Parametros de la metodologia, el modelo de IA y las llaves de las fuentes automaticas." },
  { to: "/usuarios", label: "Usuarios y perfiles", icon: "users", permission: "user:manage", help: GLOSSARY.rbac },
];

function Sidebar({ open, onClose }) {
  const { can } = useAuth();
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
              if (item.permission && !can(item.permission)) return null;
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
            if (item.permission && !can(item.permission)) return null;
            return (
              <div key={item.to} className="nav-row">
                <NavLink
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
                    flex: 1,
                    minWidth: 0,
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
                {item.help && (
                  <InfoTip text={item.help} position="right" label={`Que es ${item.label}`} />
                )}
              </div>
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

function GeminiPill({ status, isAdmin }) {
  const navigate = useNavigate();
  const enabled = aiEnabled(status);
  const label = aiLabel(status);
  const tone = enabled
    ? { color: "#065F46", bg: "#ECFDF5", border: "#A7F3D0", dot: "#10B981" }
    : { color: "#92400E", bg: "#FEF3C7", border: "#FDE68A", dot: "#F59E0B" };
  const tip = enabled
    ? `Inteligencia artificial activa (${label}).${status?.ai_ocr_enabled ? " OCR de sitios habilitado." : ""}${isAdmin ? " Clic para gestionar." : ""}`
    : isAdmin
    ? "La IA no tiene token. Clic para configurar MiniMax."
    : "La IA no esta configurada. Solicite a un administrador la llave de MiniMax.";
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
          maxWidth: 260,
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: tone.dot, flexShrink: 0 }} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      </button>
    </Tooltip>
  );
}

function cycleStatusLabel(cycle) {
  return cycle?.status_label || CYCLE_STATUS_LABELS[cycle?.status] || cycle?.status || "";
}

/** Selector del ciclo operativo: lista visual con estado, fechas e historicos. */
function CycleSelector() {
  const { cycles, cycleId, setCycleId, cycle, openCycles } = useCycle();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (ev) => {
      if (boxRef.current && !boxRef.current.contains(ev.target)) setOpen(false);
    };
    const onKey = (ev) => {
      if (ev.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (cycles.length === 0) {
    return (
      <Tooltip text="Aun no hay ciclos operativos. La priorizacion requiere uno.">
        <button className="cycle-pill cycle-pill-empty" onClick={() => navigate("/ciclos")}>
          <Icon name="calendar" size={15} />
          Crear ciclo de trabajo
        </button>
      </Tooltip>
    );
  }

  const historic = cycles.filter((c) => c.is_historic || c.status === "cerrado_consolidado");
  const active = openCycles.length ? openCycles : cycles.filter((c) => !historic.includes(c));

  return (
    <div className="cycle-switcher" ref={boxRef}>
      <InfoTip text={GLOSSARY.ciclo} position="bottom" label="Que es un ciclo de escaneo" />
      <button
        type="button"
        className="cycle-pill cycle-pill-button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Seleccionar ciclo operativo"
      >
        <Icon name="calendar" size={15} />
        <span className="cycle-pill-main">
          <strong>{cycle?.code || "Ciclo"}</strong>
          <em>{cycleStatusLabel(cycle)}</em>
        </span>
        <span className={`cycle-pill-chevron${open ? " is-open" : ""}`}>▾</span>
      </button>
      {open && (
        <div className="cycle-switcher-panel" role="listbox">
          <div className="cycle-switcher-head">
            <span>Ciclo en pantalla</span>
            <button type="button" onClick={() => { setOpen(false); navigate("/ciclos"); }}>
              Gestionar ciclos
            </button>
          </div>
          {active.length > 0 && (
            <div className="cycle-switcher-group">
              <div className="cycle-switcher-label">Abiertos</div>
              {active.map((c) => (
                <CycleOption
                  key={c.id}
                  cycle={c}
                  selected={c.id === cycleId}
                  onPick={() => {
                    setCycleId(c.id);
                    setOpen(false);
                  }}
                />
              ))}
            </div>
          )}
          {historic.length > 0 && (
            <div className="cycle-switcher-group">
              <div className="cycle-switcher-label">Historicos / cerrados</div>
              {historic.map((c) => (
                <CycleOption
                  key={c.id}
                  cycle={c}
                  selected={c.id === cycleId}
                  onPick={() => {
                    setCycleId(c.id);
                    setOpen(false);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CycleOption({ cycle, selected, onPick }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      className={`cycle-option${selected ? " is-selected" : ""}`}
      onClick={onPick}
    >
      <div className="cycle-option-top">
        <strong>{cycle.code}</strong>
        <span className={`cycle-option-status tone-${cycle.status || "en_configuracion"}`}>
          {cycleStatusLabel(cycle)}
        </span>
        {cycle.is_historic && <span className="cycle-option-hist">Historico</span>}
      </div>
      <div className="cycle-option-dates">
        Apertura {cycle.opened_on || "—"} · Corte {cycle.data_cutoff_on || "—"}
        {cycle.bulletin_due_on ? ` · Boletin ${cycle.bulletin_due_on}` : ""}
      </div>
    </button>
  );
}

function Header({ onToggle }) {
  const { user, logout, status, isAdmin } = useAuth();
  const { updatedAt } = useRealtime();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  const titles = {
    "/": "Bandeja de trabajo",
    "/ciclos": "Ciclos de escaneo",
    "/dashboards": "Indicadores",
    "/vigilancia": "Vigilancia",
    "/escaneo": "Vigilancia",
    "/fuentes": "Inventario de fuentes",
    "/bandeja-entrada": "Bandeja de entrada",
    "/filtrado": "Filtrado y depuracion",
    "/senales": "Senales capturadas",
    "/priorizacion": "Priorizacion",
    "/hallazgos": "Senales capturadas",
    "/caracterizacion": "Caracterizacion",
    "/diseminacion": "Diseminacion",
    "/recomendaciones": "Diseminacion",
    "/notas": "Notas",
    "/chat": "Asistente IA",
    "/auditoria": "Bitacora de auditoria",
    "/usuarios": "Usuarios y perfiles",
    "/configuracion": "Configuracion",
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

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <CycleSelector />

        <Tooltip text={`Sincronizacion en tiempo real.${updatedAt ? ` Ultima: ${new Date(updatedAt).toLocaleTimeString()}.` : ""}`}>
          <div className="header-status" title="En vivo">
            <span className="header-status-dot" />
            <span className="header-status-label">En vivo</span>
          </div>
        </Tooltip>

        {status && (
          <GeminiPill status={status} isAdmin={isAdmin} />
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
            <SafeAvatar user={user} />
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
