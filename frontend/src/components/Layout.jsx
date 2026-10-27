import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useCycle } from "../cycle/CycleContext";
import { useRealtime } from "../realtime/RealtimeContext";
import { aiEnabled, aiLabel } from "../ai/status";
import { CYCLE_STATUS_LABELS, ROLE_LABELS } from "../constants/methodology";
import { apiError } from "../api/client";
import { GLOSSARY } from "../constants/glossary";
import { NAV, TITLES, fold, sectionFor } from "../constants/navigation";
import Icon from "./Icon";
import Tooltip from "./Tooltip";
import InfoTip from "./InfoTip";
import SafeAvatar from "./SafeAvatar";
import Modal from "./Modal";
import ChangePasswordForm from "./ChangePasswordForm";
import OnboardingGuide, { ONBOARDING_KEY } from "./OnboardingGuide";
import NavAssistant from "./NavAssistant";
import { useToast } from "./Toast";
import { useBackup } from "../backup/BackupContext";
import "./layout.css";

function Sidebar({ open, onClose }) {
  const { can } = useAuth();
  const [filter, setFilter] = useState("");
  const q = fold(filter);

  // Con filtro se ocultan las secciones vacias; sin filtro, el menu completo.
  const items = useMemo(() => {
    const out = [];
    let pendingSection = null;
    for (const item of NAV) {
      if (item.section) {
        pendingSection = item.permission && !can(item.permission) ? null : item;
        continue;
      }
      if (item.permission && !can(item.permission)) continue;
      if (q && !fold(`${item.label} ${item.help || ""}`).includes(q)) continue;
      if (pendingSection) {
        out.push(pendingSection);
        pendingSection = null;
      }
      out.push(item);
    }
    return out;
  }, [can, q]);

  return (
    <>
      {open && <div onClick={onClose} className="sidebar-overlay" />}
      <aside className={`sidebar sb ${open ? "sidebar-open" : ""}`} aria-label="Menú de módulos">
        <div className="sb-brand">
          <div className="sb-logo">
            <Icon name="radar" size={22} strokeWidth={2} />
          </div>
          <div>
            <div className="sb-name">Escaneo de Horizonte</div>
            <div className="sb-org">IETS Colombia</div>
          </div>
        </div>

        <div className="sb-search">
          <Icon name="search" size={15} />
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Buscar módulo…"
            aria-label="Buscar módulo en el menú"
          />
        </div>

        <nav className="sb-nav">
          {items.map((item, i) =>
            item.section ? (
              <div key={`s-${i}`} className="sb-section">
                {item.section}
              </div>
            ) : (
              <div key={item.to} className="nav-row">
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={() => {
                    setFilter("");
                    onClose();
                  }}
                  className={({ isActive }) => `sb-link${isActive ? " is-active" : ""}`}
                >
                  <Icon name={item.icon} size={18} strokeWidth={1.9} />
                  <span className="sb-label">{item.label}</span>
                </NavLink>
                {item.help && <InfoTip text={item.help} position="right" label={`Qué es ${item.label}`} />}
              </div>
            )
          )}
          {items.length === 0 && <div className="sb-empty">Ningún módulo coincide con «{filter}».</div>}
        </nav>
        <div className="sb-foot">
          <Icon name="compass" size={14} />
          <span>
            ¿No encuentra algo? Pulse <kbd>Ctrl</kbd>+<kbd>K</kbd> o «¿Cómo llego a…?».
          </span>
        </div>
      </aside>
    </>
  );
}

function GeminiPill({ status, isAdmin }) {
  const navigate = useNavigate();
  const enabled = aiEnabled(status);
  const label = aiLabel(status);
  const tip = enabled
    ? `Inteligencia artificial activa (${label}).${status?.ai_ocr_enabled ? " OCR de sitios habilitado." : ""}${isAdmin ? " Clic para gestionar." : ""}`
    : isAdmin
    ? "La IA no tiene token. Clic para configurar MiniMax."
    : "La IA no está configurada. Solicite a un administrador la llave de MiniMax.";
  return (
    <Tooltip text={tip}>
      <button
        type="button"
        onClick={() => isAdmin && navigate("/configuracion")}
        className={`gemini-pill hdr-chip ${enabled ? "is-on" : "is-off"}`}
        style={{ cursor: isAdmin ? "pointer" : "default" }}
      >
        <span className="hdr-dot" />
        <span className="hdr-chip-text">{label}</span>
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
      <Tooltip text="Aún no hay ciclos operativos. La priorización requiere uno.">
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
      <InfoTip text={GLOSSARY.ciclo} position="bottom" label="Qué es un ciclo de escaneo" />
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
              <div className="cycle-switcher-label">Históricos / cerrados</div>
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
        {cycle.is_historic && <span className="cycle-option-hist">Histórico</span>}
      </div>
      <div className="cycle-option-dates">
        Apertura {cycle.opened_on || "—"} · Corte {cycle.data_cutoff_on || "—"}
        {cycle.bulletin_due_on ? ` · Boletín ${cycle.bulletin_due_on}` : ""}
      </div>
    </button>
  );
}

function BackupStatusPill() {
  const { status } = useAuth();
  const backup = useBackup();
  const fbOn = Boolean(status?.firebase_db_enabled || backup?.firebase?.enabled);
  const fbOk = Boolean(status?.firebase_db_synced || backup?.firebase?.synced);
  const fbName = status?.firebase_db_name || backup?.firebase?.collection || "hs_iets_db";
  if (fbOn) {
    return (
      <Tooltip text={fbOk ? `Base Firestore ${fbName} publicada. Sobrevive al disco de Render.` : "El espacio Firestore de Horizonte está activo; la primera publicación ocurre al guardar."}>
        <NavLink
          to="/configuracion?tab=copia_local"
          className="header-status"
          style={{ textDecoration: "none", color: "inherit" }}
        >
          <span className="header-status-dot" style={{ background: fbOk ? "#059669" : "#D97706" }} />
          <span className="header-status-label">{fbOk ? "Firebase" : "Firebase…"}</span>
        </NavLink>
      </Tooltip>
    );
  }
  if (!backup?.enabled || backup.supported === false) return null;
  const restoring = backup.status === "restoring";
  const saving = backup.status === "saving";
  const err = backup.status === "error";
  const has = Boolean(backup.current?.takenAt);
  const label = restoring ? "Restaurando…" : saving ? "Guardando…" : err ? "Copia con error" : has ? "Guardado aquí" : "Sin copia local";
  const tip = restoring
    ? "Se está devolviendo al servidor la copia guardada en este navegador."
    : saving
      ? "Se está actualizando la copia de la base en este navegador."
      : err
        ? backup.message || "No se pudo guardar o restaurar la copia local."
        : has
          ? `Copia del ${new Date(backup.current.takenAt).toLocaleString("es-CO")}. Si Render borra el disco, se restaura sola al ingresar.`
          : "Aún no hay copia en este navegador. Se guardará sola tras el primer cambio.";
  return (
    <Tooltip text={tip}>
      <NavLink
        to="/configuracion?tab=copia_local"
        className="header-status"
        style={{ textDecoration: "none", color: "inherit" }}
      >
        <span
          className="header-status-dot"
          style={{ background: err ? "#DC2626" : restoring || saving ? "#D97706" : has ? "#059669" : "#94A3B8" }}
        />
        <span className="header-status-label">{label}</span>
      </NavLink>
    </Tooltip>
  );
}

function EnvironmentBanner() {
  const { status } = useAuth();
  const env = status?.environment;
  if (!env || env === "production") return null;
  const label = env === "testing" ? "Entorno de pruebas" : "Entorno de desarrollo";
  return (
    <div className="env-banner" role="note">
      <strong>{label}.</strong>{" "}
      {status?.dev_login_enabled
        ? "El acceso sin contraseña está habilitado; en producción se apaga solo."
        : "Los datos pueden no ser los oficiales."}
    </div>
  );
}

const ROLE_ORDER = ["superadmin", "evaluador_tecnico", "evaluador_clinico", "tomador_decisiones", "revisor_pares"];

/**
 * "Ver como" del superadministrador: cambia el perfil efectivo de toda la
 * aplicación (menús, rutas, botones y permisos del servidor). Devuelve la
 * función que aplica el cambio y el estado de espera.
 */
function useActAs(onDone) {
  const { actAs } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async (role) => {
    if (busy) return;
    setBusy(true);
    try {
      const data = await actAs(role);
      toast.success(
        data?.acting_as
          ? `Viendo el sistema como ${data.role_label}. Sus permisos reales no cambiaron.`
          : `Volvió a su perfil: ${data?.role_label || ROLE_LABELS.superadmin}.`
      );
      onDone?.();
    } catch (err) {
      toast.error(apiError(err, "No se pudo cambiar de perfil."));
    } finally {
      setBusy(false);
    }
  };
  return [run, busy];
}

/** Aviso permanente mientras el superadministrador ve el sistema como otro perfil. */
function ActingBanner() {
  const { user, actingAs } = useAuth();
  const [restore, busy] = useActAs();
  if (!actingAs) return null;
  const realLabel = user?.real_role_label || ROLE_LABELS.superadmin;
  return (
    <div className="acting-banner" role="status" aria-live="polite">
      <Icon name="eye" size={15} />
      <span className="acting-banner-text">
        <strong>Viendo como: {user?.role_label}.</strong>{" "}
        <span className="acting-banner-hint">Menús, pantallas y permisos son los de ese perfil.</span>
      </span>
      <button
        type="button"
        className="acting-banner-btn"
        onClick={() => restore("superadmin")}
        disabled={busy}
        aria-label={`Volver a mi perfil (${realLabel})`}
      >
        {busy ? "Volviendo…" : `Volver a ${realLabel}`}
      </button>
    </div>
  );
}

function Header({ onToggle, onOpenGuide }) {
  const { user, logout, status, isAdmin, realRole, actingAs } = useAuth();
  const { updatedAt } = useRealtime();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const toast = useToast();
  const location = useLocation();
  const menuRef = useRef(null);
  const userBtnRef = useRef(null);
  const canSwitch = realRole === "superadmin";
  const [switchTo, switching] = useActAs(() => {
    setMenuOpen(false);
    userBtnRef.current?.focus();
  });

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (ev) => {
      if (ev.key === "Escape") {
        setMenuOpen(false);
        userBtnRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    // Al abrir, el foco entra al menú para operarlo con el teclado.
    menuRef.current?.querySelector('[role^="menuitem"]:not([disabled])')?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  // Flechas, Inicio y Fin recorren las opciones del menú (patrón WAI-ARIA).
  const onMenuKeyDown = (ev) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(ev.key)) return;
    const items = Array.from(menuRef.current?.querySelectorAll('[role^="menuitem"]:not([disabled])') || []);
    if (!items.length) return;
    ev.preventDefault();
    const idx = items.indexOf(document.activeElement);
    let next = 0;
    if (ev.key === "End") next = items.length - 1;
    else if (ev.key === "ArrowDown") next = idx < 0 ? 0 : (idx + 1) % items.length;
    else if (ev.key === "ArrowUp") next = idx <= 0 ? items.length - 1 : idx - 1;
    items[next].focus();
  };

  const title = TITLES[location.pathname] || "IETS";
  const section = sectionFor(location.pathname);
  useEffect(() => {
    document.title = `${title} | Escaneo de Horizonte IETS`;
  }, [title]);

  return (
    <header className="app-header hdr">
      <div className="app-header-left hdr-left">
        <button type="button" onClick={onToggle} aria-label="Abrir menú de módulos" className="hamburger">
          <Icon name="menu" size={18} />
        </button>
        <div className="hdr-crumb">
          {section && <span className="hdr-section">{section}</span>}
          <h2 className="header-title">{title}</h2>
        </div>
      </div>

      <div className="app-header-right hdr-right">
        <Tooltip text="Cómo funciona el sistema, pantalla por pantalla.">
          <button type="button" className="header-guide-btn" aria-label="Abrir guía rápida" onClick={onOpenGuide}>
            <Icon name="compass" size={16} />
            <span className="header-guide-label">Guía</span>
          </button>
        </Tooltip>
        <CycleSelector />

        <div className="hdr-status">
          <Tooltip text={`Sincronización en tiempo real.${updatedAt ? ` Última: ${new Date(updatedAt).toLocaleTimeString()}.` : ""}`}>
            <div className="header-status" title="En vivo">
              <span className="header-status-dot" />
              <span className="header-status-label">En vivo</span>
            </div>
          </Tooltip>
          <BackupStatusPill />
          {status && <GeminiPill status={status} isAdmin={isAdmin} />}
        </div>

        <div className="hdr-user">
          <button
            type="button"
            ref={userBtnRef}
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={
              actingAs
                ? `Menú de ${user?.name || "usuario"}. Viendo como ${user?.role_label}`
                : `Menú de ${user?.name || "usuario"}`
            }
            className={`hdr-user-btn${actingAs ? " is-acting" : ""}`}
          >
            <SafeAvatar user={user} />
            <div className="user-meta">
              <div className="hdr-user-name">{user?.name}</div>
              <div className="hdr-user-role">
                {actingAs ? `Viendo como: ${user?.role_label}` : user?.role_label || user?.role}
              </div>
            </div>
            <span className="hdr-caret">
              <Icon name="chevron" size={14} />
            </span>
          </button>
          {menuOpen && (
            <>
              <div className="hdr-menu-veil" onClick={() => setMenuOpen(false)} />
              <div
                className="hdr-menu"
                role="menu"
                aria-label="Menú de usuario"
                ref={menuRef}
                onKeyDown={onMenuKeyDown}
              >
                <div className="hdr-menu-head">
                  <div className="hdr-user-name">{user?.name}</div>
                  <div className="hdr-menu-mail">{user?.email}</div>
                  <div className="hdr-menu-role">
                    {user?.role_label}
                    {user?.rateable_criteria?.length ? ` · califica ${user.rateable_criteria.join(", ")}` : ""}
                  </div>
                  {actingAs && <div className="hdr-menu-real">Su perfil real: {user?.real_role_label}</div>}
                </div>
                {canSwitch && (
                  <div className="hdr-menu-group" role="group" aria-labelledby="hdr-actas-title">
                    <div className="hdr-menu-group-title" id="hdr-actas-title">
                      <Icon name="eye" size={14} />
                      Ver como (cambiar de perfil)
                    </div>
                    {ROLE_ORDER.map((code) => {
                      const checked = (user?.role || "superadmin") === code;
                      const label = ROLE_LABELS[code] || code;
                      return (
                        <button
                          key={code}
                          type="button"
                          role="menuitemradio"
                          aria-checked={checked}
                          disabled={switching}
                          className={`user-menu-item hdr-role-item${checked ? " is-current" : ""}`}
                          onClick={() => (checked ? setMenuOpen(false) : switchTo(code))}
                        >
                          <span className="hdr-role-mark" aria-hidden="true">
                            {checked ? <Icon name="check" size={14} /> : null}
                          </span>
                          {code === "superadmin" && actingAs ? `Volver a mi perfil (${label})` : label}
                        </button>
                      );
                    })}
                  </div>
                )}
                <button
                  type="button"
                  role="menuitem"
                  className="user-menu-item"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenGuide?.();
                  }}
                >
                  <Icon name="compass" size={17} />
                  Guía rápida
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="user-menu-item"
                  onClick={() => {
                    setMenuOpen(false);
                    setPwdOpen(true);
                  }}
                >
                  <Icon name="shield" size={17} />
                  Cambiar contraseña
                </button>
                <button type="button" role="menuitem" className="user-menu-item is-danger" onClick={() => logout()}>
                  <Icon name="logout" size={17} />
                  Cerrar sesión
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <Modal open={pwdOpen} onClose={() => setPwdOpen(false)} title="Cambiar contraseña" width={460}>
        <ChangePasswordForm
          onCancel={() => setPwdOpen(false)}
          onDone={() => {
            setPwdOpen(false);
            toast.success("Contraseña actualizada. Sus otras sesiones se cerraron.");
          }}
        />
      </Modal>
    </header>
  );
}

export default function Layout({ children }) {
  const { user, justLoggedIn, clearJustLoggedIn } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    if (!user || !justLoggedIn) return;
    clearJustLoggedIn();
    if (localStorage.getItem(ONBOARDING_KEY) !== "1") setGuideOpen(true);
  }, [user, justLoggedIn, clearJustLoggedIn]);

  // El marco ya no se rearma al navegar: la pantalla nueva empieza arriba.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);

  const closeGuide = (persist) => {
    setGuideOpen(false);
    if (persist) localStorage.setItem(ONBOARDING_KEY, "1");
  };

  return (
    <div className="app-frame">
      <a href="#contenido" className="skip-link">Saltar al contenido</a>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="content-shell">
        <EnvironmentBanner />
        <Header onToggle={() => setSidebarOpen((v) => !v)} onOpenGuide={() => setGuideOpen(true)} />
        <ActingBanner />
        <main id="contenido" tabIndex={-1} className="app-main">
          {/* Al cambiar de perfil ("ver como") la pantalla se rearma y recarga sus datos. */}
          <div key={`${pathname}|${user?.role || ""}`} className="page-enter">
            {children}
          </div>
        </main>
      </div>
      <NavAssistant onOpenGuide={() => setGuideOpen(true)} />
      {guideOpen ? <OnboardingGuide open onClose={closeGuide} /> : null}
    </div>
  );
}
