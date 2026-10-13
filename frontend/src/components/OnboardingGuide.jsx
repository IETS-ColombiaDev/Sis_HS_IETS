import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import Icon from "./Icon";
import Button from "./Button";
import "./onboarding.css";

export const ONBOARDING_KEY = "iets_hs_onboarding_v1";

const PIPE = [
  { n: "01", label: "Identificar" },
  { n: "02", label: "Priorizar" },
  { n: "03", label: "Evaluar" },
  { n: "04", label: "Publicar" },
];

function firstNameOf(user) {
  const raw = (user?.first_name || user?.name || "").trim();
  const n = raw.split(/\s+/)[0] || "";
  if (!n || n.includes("@")) return "";
  return n.charAt(0).toUpperCase() + n.slice(1);
}

function startActions(user) {
  const role = user?.role;
  if (role === "tomador_decisiones") {
    return [
      { to: "/", icon: "home", label: "Bandeja de trabajo", hint: "Pendientes del ciclo, con enlace a cada uno." },
      { to: "/dashboards", icon: "chart", label: "Tablero estratégico", hint: "Clúster, tiempo al mercado y embudo del ciclo." },
      { to: "/alertas", icon: "pulse", label: "Alertas tempranas", hint: "Fase III en el país y alto riesgo presupuestal." },
    ];
  }
  if (role === "revisor_pares") {
    return [
      { to: "/evaluacion", icon: "doc", label: "Evaluación", hint: "Informes que esperan su revisión por pares." },
      { to: "/", icon: "home", label: "Bandeja de trabajo", hint: "Lo que su perfil tiene por hacer hoy." },
      { to: "/dashboards", icon: "chart", label: "Tablero", hint: "Estado del ciclo, sin calificar ni editar." },
    ];
  }
  if (role === "evaluador_clinico") {
    return [
      { to: "/priorizacion", icon: "layers", label: "Calificar P2, P3 y P4", hint: "Relevancia, carga de enfermedad e impacto organizacional." },
      { to: "/bandeja-entrada", icon: "inbox", label: "Bandeja de entrada", hint: "Clasifique clúster y tipología antes de asignar al ciclo." },
      { to: "/", icon: "home", label: "Bandeja de trabajo", hint: "Sus pendientes de hoy, en un solo lugar." },
    ];
  }
  return [
    { to: "/vigilancia", icon: "radar", label: "Ejecutar vigilancia", hint: "Captura señales de las 95 fuentes del catálogo." },
    { to: "/bandeja-entrada", icon: "inbox", label: "Clasificar la bandeja", hint: "Sin clúster y tipología la señal no entra al ciclo." },
    { to: "/priorizacion", icon: "layers", label: "Priorizar (P1 a P6)", hint: "Seis preguntas oficiales. La IA sugiere; usted decide." },
  ];
}

function stepsFor(user) {
  const name = firstNameOf(user);
  const role = user?.role_label || "su perfil";
  const actions = startActions(user);
  return [
    {
      kicker: "Bienvenida",
      title: name ? `${name}, este es el mapa del sistema` : "Este es el mapa del sistema",
      lead: `El IETS vigila tecnologías sanitarias emergentes antes de que lleguen a Colombia. Usted entra como ${role}. El trabajo vive dentro de un ciclo (pastilla de la cabecera): nada se prioriza ni se publica por fuera de él.`,
      pipe: null,
      points: [
        { icon: "radar", title: "Detectar", text: "Fuentes internacionales y postulaciones externas alimentan una sola bandeja." },
        { icon: "layers", title: "Decidir", text: "Personas califican la matriz P1 a P6. La IA no cierra el puntaje." },
        { icon: "shield", title: "Dejar rastro", text: "Cada cambio queda en una bitácora que no se edita ni se borra." },
      ],
    },
    {
      kicker: "Paso 1 · Identificar",
      title: "De la fuente a la bandeja",
      lead: "Hay dos puertas de entrada. Las dos terminan en la misma bandeja: lo que no se clasifica y asigna al ciclo no sigue.",
      pipe: 0,
      points: [
        { icon: "globe", title: "Canal proactivo", text: "Vigilancia consulta cerca de 95 fuentes (ensayos, agencias, HTA, revistas). Puede dispararla a mano." },
        { icon: "note", title: "Canal reactivo", text: "Alguien externo postula en /postular. Primero se modera; si se acepta, llega a la bandeja." },
        { icon: "inbox", title: "Señal ≠ tecnología", text: "La señal es el recorte capturado. La tecnología es la unidad que se clasifica (clúster + tipología) y entra al ciclo." },
      ],
    },
    {
      kicker: "Paso 2 · Priorizar",
      title: "Filtrar, luego calificar",
      lead: "Antes de poner nota se depura. Después, seis preguntas sí/no. Cuatro a seis puntos = priorizada (66,7 %). Tres = bajo vigilancia para el ciclo siguiente.",
      pipe: 1,
      points: [
        { icon: "filter", title: "Filtrado", text: "Duplicados (umbral 85 %, confirma una persona), novedad y cruce con INVIMA. Sin novedad no hay %P." },
        { icon: "users", title: "Quién califica", text: "Técnico: P1, P5 y P6. Clínico: P2, P3 y P4. Superadministrador puede todos." },
        { icon: "spark", title: "La IA sugiere", text: "Puede prellenar o redactar borradores. No fusiona, no prioriza ni publica sola." },
      ],
    },
    {
      kicker: "Pasos 3 y 4 · Evaluar y publicar",
      title: "Documentar, revisar y diseminar",
      lead: "Lo priorizado pasa a ficha, informe o Mini-HTA, con revisión por pares y conflicto de interés. Al cerrar el ciclo se congela el puntaje.",
      pipe: [2, 3],
      points: [
        { icon: "doc", title: "Evaluación", text: "Seis estados editoriales, de borrador a publicado. El revisor externo entra con un enlace, sin cuenta." },
        { icon: "bulb", title: "Diseminación", text: "Informes de adopción, boletín del ciclo, ficha pública (/expedientes) y alertas." },
        { icon: "chart", title: "Tablero", text: "Embudo del ciclo, clúster y tiempo al mercado. La capa presupuestal es restringida." },
      ],
    },
    {
      kicker: "Empiece aquí",
      title: "Tres acciones de hoy",
      lead: "Confirme el ciclo en la cabecera y entre por cualquiera de estas puertas. Puede reabrir esta guía con el botón Guía.",
      pipe: "all",
      actions,
      note: "En equipos compartidos cierre sesión al terminar. Si el servidor está en Render (disco temporal), el administrador debe ver «Guardado aquí» en la cabecera.",
    },
  ];
}

function pipeActive(stepPipe, index) {
  if (stepPipe === "all" || stepPipe == null) return true;
  if (Array.isArray(stepPipe)) return stepPipe.includes(index);
  return stepPipe === index;
}

export default function OnboardingGuide({ open, onClose, onNavigate }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const steps = useMemo(() => stepsFor(user), [user]);
  const dialogRef = useRef(null);
  const [index, setIndex] = useState(0);
  const last = index === steps.length - 1;
  const step = steps[index];

  useEffect(() => {
    if (!open) return;
    setIndex(0);
    const t = window.setTimeout(() => dialogRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose(true);
      if (e.key === "ArrowRight") setIndex((i) => Math.min(steps.length - 1, i + 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose, steps.length]);

  if (!open) return null;

  const go = (to) => {
    onClose(true);
    onNavigate?.();
    navigate(to);
  };

  return (
    <div className="onb-overlay" data-testid="onboarding-guide">
      <div
        ref={dialogRef}
        className="onb-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onb-title"
        tabIndex={-1}
      >
        <div className="onb-hero">
          <span className="onb-hero-orb onb-hero-orb-a" />
          <span className="onb-hero-orb onb-hero-orb-b" />
          <div className="onb-hero-top">
            <div className="onb-kicker">
              <span className="onb-kicker-dot" />
              Guía rápida · IETS Colombia
            </div>
            <button type="button" className="onb-close" onClick={() => onClose(true)} aria-label="Cerrar guía">
              <Icon name="x" size={18} />
            </button>
          </div>
          <h2 id="onb-title">Cómo funciona el escaneo de horizonte</h2>
          <p className="onb-hero-sub">Cuatro fases, un ciclo, decisiones humanas. Cinco pantallas para orientarse.</p>
          <div className="onb-pipeline" aria-hidden="true">
            {PIPE.map((p, i) => (
              <div key={p.n} className={`onb-pipe${pipeActive(step.pipe, i) ? " is-on" : ""}`}>
                <span className="onb-pipe-num">{p.n}</span>
                <span className="onb-pipe-label">{p.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="onb-body">
          <div className="onb-progress" aria-hidden="true">
            {steps.map((s, i) => (
              <span key={s.kicker} className={i < index ? "is-done" : i === index ? "is-now" : ""} />
            ))}
          </div>
          <div className="onb-step-kicker">{step.kicker}</div>
          <h3>{step.title}</h3>
          <p className="onb-lead">{step.lead}</p>
          {step.points && (
            <ul className="onb-points">
              {step.points.map((p) => (
                <li key={p.title}>
                  <span className="onb-ico">
                    <Icon name={p.icon} size={18} />
                  </span>
                  <div>
                    <strong>{p.title}</strong>
                    <span>{p.text}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {step.actions && (
            <div className="onb-actions">
              {step.actions.map((a) => (
                <button type="button" key={a.to} className="onb-action" onClick={() => go(a.to)}>
                  <span className="onb-action-ico">
                    <Icon name={a.icon} size={18} />
                  </span>
                  <span>
                    <strong>{a.label}</strong>
                    <small>{a.hint}</small>
                  </span>
                  <span className="onb-action-go">Ir →</span>
                </button>
              ))}
            </div>
          )}
          {step.note && <p className="onb-note">{step.note}</p>}
        </div>

        <div className="onb-footer">
          <div className="onb-footer-left">
            <span className="onb-step-count">
              {index + 1} de {steps.length}
            </span>
            {!last && (
              <button type="button" className="onb-skip" onClick={() => onClose(true)}>
                Saltar guía
              </button>
            )}
          </div>
          <div className="onb-footer-right">
            {index > 0 && (
              <Button type="button" variant="secondary" onClick={() => setIndex((i) => i - 1)}>
                Atrás
              </Button>
            )}
            {last ? (
              <Button type="button" onClick={() => onClose(true)}>
                Entendido, empezar
              </Button>
            ) : (
              <Button type="button" onClick={() => setIndex((i) => i + 1)}>
                Siguiente
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
