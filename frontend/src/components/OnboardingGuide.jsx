import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import Icon from "./Icon";
import Button from "./Button";
import { t, tr, ts } from "../i18n";
import "./onboarding.css";

export const ONBOARDING_KEY = "iets_hs_onboarding_v1";

const PIPE = [
  { n: "01", label: t("Identificar") },
  { n: "02", label: t("Priorizar") },
  { n: "03", label: t("Evaluar") },
  { n: "04", label: t("Publicar") },
];

// Lo que cada perfil hace, en las palabras de Usuarios y perfiles.
const ROLE_INFO = {
  superadmin: {
    text: t("Control total: usuarios, configuración, catálogos, bitácora y cierre de ciclos."),
    can: [t("Vigilancia y bandeja"), t("Calificar P1 a P6"), t("Redactar y publicar"), t("Usuarios y configuración")],
  },
  evaluador_tecnico: {
    text: t("Opera la vigilancia, la bandeja de entrada, el filtrado y los ciclos."),
    can: [t("Vigilancia y bandeja"), t("Filtrado e INVIMA"), t("Calificar P1, P5 y P6"), t("Redactar informes")],
  },
  evaluador_clinico: {
    text: t("Opera la vigilancia, la bandeja y el filtrado; redacta informes."),
    can: [t("Vigilancia y bandeja"), t("Calificar P2, P3 y P4"), t("Redactar informes")],
  },
  tomador_decisiones: {
    text: t("Consulta el sistema y los tableros restringidos (presupuesto y comparadores)."),
    can: [t("Tablero estratégico"), t("Alertas tempranas"), t("Notas del equipo")],
  },
  revisor_pares: {
    text: t("Lee los expedientes y registra revisiones por pares."),
    can: [t("Revisar expedientes"), t("Comentar por campo"), t("Emitir veredicto")],
  },
};

const CRITERIA = [
  { code: "P1", label: t("Nueva en el país"), who: "tec" },
  { code: "P2", label: t("Relevancia clínica"), who: "cli" },
  { code: "P3", label: t("Carga e impacto financiero"), who: "cli" },
  { code: "P4", label: t("Impacto organizacional"), who: "cli" },
  { code: "P5", label: t("Aprobada por FDA/EMA (≤ 12 meses)"), who: "tec" },
  { code: "P6", label: t("En trámite regulatorio (≤ 6 meses)"), who: "tec" },
];

const EDITORIAL = [
  { label: t("Borrador"), hint: t("El equipo redacta") },
  { label: t("Revisión interna"), hint: t("Par del IETS") },
  { label: t("Revisión externa"), hint: t("Experto por enlace") },
  { label: t("Comité técnico"), hint: t("Visto bueno") },
  { label: t("Publicado"), hint: t("Listo para difundir") },
];

// Perfiles y momento en que participan. Coincide con los permisos de rbac.py y las
// transiciones editoriales de evaluation_service.py.
const PHASES = [t("Identificar"), t("Priorizar"), t("Evaluar"), t("Publicar"), t("Cierre")];
const ROLES = [
  {
    key: "superadmin",
    name: t("Superadministrador"),
    who: t("Coordinación del escaneo"),
    color: "#334155",
    phases: [0, 1, 2, 3, 4],
    tasks: [
      t("Crea usuarios, asigna perfiles y configura la metodología"),
      t("Puede hacer cualquier tarea y calificar los seis criterios"),
      t("Es el único que cierra el ciclo y congela los puntajes"),
    ],
  },
  {
    key: "evaluador_tecnico",
    name: t("Evaluador técnico"),
    who: t("Equipo de escaneo IETS"),
    color: "#1d4ed8",
    phases: [0, 1, 2, 3],
    tasks: [
      t("Ejecuta la vigilancia, clasifica la bandeja y arma el ciclo"),
      t("Depura duplicados y verifica la novedad con INVIMA"),
      t("Califica P1, P5 y P6 y coedita los expedientes"),
      t("Pasa a revisión externa, invita revisores, registra el comité y publica"),
    ],
  },
  {
    key: "evaluador_clinico",
    name: t("Evaluador clínico"),
    who: t("Equipo de escaneo IETS"),
    color: "#0d9488",
    phases: [0, 1, 2],
    tasks: [
      t("Apoya la vigilancia, la bandeja y el filtrado"),
      t("Califica P2, P3 y P4 (relevancia, carga e impacto organizacional)"),
      t("Redacta y coedita fichas, informes y Mini-HTA; corrige observaciones"),
    ],
  },
  {
    key: "revisor_pares",
    name: t("Revisor de pares"),
    who: t("Par interno con cuenta"),
    color: "#d97706",
    phases: [2],
    tasks: [
      t("Firma su conflicto de interés antes de leer"),
      t("Comenta el expediente campo por campo"),
      t("Puede devolverlo con observaciones"),
    ],
  },
  {
    key: "externo",
    name: t("Revisor externo"),
    who: t("Experto invitado, sin cuenta"),
    color: "#ea580c",
    phases: [2],
    tasks: [
      t("Entra con un enlace temporal que le llega por invitación"),
      t("Firma su conflicto de interés, comenta y emite veredicto"),
      t("Aprobado: sigue al comité. Observado: vuelve a corrección"),
    ],
  },
  {
    key: "tomador_decisiones",
    name: t("Tomador de decisiones"),
    who: t("MinSalud, INVIMA y directivos"),
    color: "#059669",
    phases: [3],
    tasks: [
      t("Consulta el tablero estratégico, incluida la capa presupuestal"),
      t("Recibe alertas tempranas y el boletín del ciclo"),
      t("Deja notas; no modifica la metodología"),
    ],
  },
];
const ROLE_BY_KEY = Object.fromEntries(ROLES.map((r) => [r.key, r]));

// Relevos del ciclo: quien entrega y quien recibe en cada paso.
const RELAY = [
  { phase: 0, roles: ["evaluador_tecnico", "evaluador_clinico"], text: t("Capturan señales (vigilancia y postulaciones), las clasifican por clúster y tipología y las asignan al ciclo.") },
  { phase: 0, roles: ["evaluador_tecnico"], text: t("Depura duplicados y cruza con INVIMA: queda el listado único listo para calificar.") },
  { phase: 1, roles: ["evaluador_tecnico", "evaluador_clinico"], text: t("Califican en paralelo: técnico P1, P5 y P6; clínico P2, P3 y P4. Con los seis, el sistema da el puntaje.") },
  { phase: 2, roles: ["evaluador_tecnico", "evaluador_clinico"], text: t("Abren el expediente (ficha, informe o Mini-HTA), lo coeditan y lo envían a revisión interna.") },
  { phase: 2, roles: ["revisor_pares"], text: t("El par interno comenta. El técnico pasa el expediente a revisión externa e invita al experto.") },
  { phase: 2, roles: ["externo"], text: t("El experto revisa por enlace. Si pide cambios, vuelve a borrador y los evaluadores corrigen.") },
  { phase: 3, roles: ["evaluador_tecnico", "superadmin"], text: t("Registran el visto bueno del comité técnico y publican: ficha pública, boletín y tablero.") },
  { phase: 3, roles: ["tomador_decisiones"], text: t("Consulta el tablero, las alertas y el boletín para decidir.") },
  { phase: 4, roles: ["superadmin"], text: t("Cierra el ciclo: los puntajes se congelan y lo que quedó en vigilancia pasa al siguiente.") },
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
      { to: "/", icon: "home", label: t("Bandeja de trabajo"), hint: t("Pendientes del ciclo, con enlace a cada uno.") },
      { to: "/dashboards", icon: "chart", label: t("Tablero estratégico"), hint: t("Clúster, tiempo al mercado y embudo del ciclo.") },
      { to: "/alertas", icon: "pulse", label: t("Alertas tempranas"), hint: t("Fase III en el país y alto riesgo presupuestal.") },
    ];
  }
  if (role === "revisor_pares") {
    return [
      { to: "/evaluacion", icon: "doc", label: t("Evaluación"), hint: t("Informes que esperan su revisión por pares.") },
      { to: "/", icon: "home", label: t("Bandeja de trabajo"), hint: t("Lo que su perfil tiene por hacer hoy.") },
      { to: "/dashboards", icon: "chart", label: t("Tablero"), hint: t("Estado del ciclo, sin calificar ni editar.") },
    ];
  }
  if (role === "evaluador_clinico") {
    return [
      { to: "/priorizacion", icon: "layers", label: t("Calificar P2, P3 y P4"), hint: t("Relevancia, carga de enfermedad e impacto organizacional.") },
      { to: "/bandeja-entrada", icon: "inbox", label: t("Bandeja de entrada"), hint: t("Clasifique clúster y tipología antes de asignar al ciclo.") },
      { to: "/", icon: "home", label: t("Bandeja de trabajo"), hint: t("Sus pendientes de hoy, en un solo lugar.") },
    ];
  }
  return [
    { to: "/vigilancia", icon: "radar", label: t("Ejecutar vigilancia"), hint: t("Captura señales de las fuentes del catálogo.") },
    { to: "/bandeja-entrada", icon: "inbox", label: t("Clasificar la bandeja"), hint: t("Sin clúster y tipología la señal no entra al ciclo.") },
    { to: "/priorizacion", icon: "layers", label: t("Priorizar (P1 a P6)"), hint: t("Seis preguntas oficiales. La IA sugiere; usted decide.") },
  ];
}

/* ---------- Diagramas de cada paso ---------- */

function WelcomeVisual({ user }) {
  const info = ROLE_INFO[user?.role] || ROLE_INFO.tomador_decisiones;
  const outputs = [
    { icon: "radar", phase: t("Identificar"), out: t("Señales en la bandeja") },
    { icon: "layers", phase: t("Priorizar"), out: t("Puntaje %P de 0 a 6") },
    { icon: "doc", phase: t("Evaluar"), out: t("Ficha, informe o Mini-HTA") },
    { icon: "bulb", phase: t("Publicar"), out: t("Boletín, ficha pública y tablero") },
  ];
  return (
    <div className="onb-visual">
      <div className="onb-role">
        <span className="onb-role-ico"><Icon name="users" size={20} /></span>
        <div>
          <small>{t("Su perfil")}</small>
          <strong>{ts(user?.role_label) || t("Usuario")}</strong>
          <p>{info.text}</p>
          <div className="onb-chips">
            {info.can.map((c) => (
              <span key={c} className="onb-chip"><Icon name="check" size={12} /> {c}</span>
            ))}
          </div>
        </div>
      </div>
      <div className="onb-cycle" aria-label={t("Qué produce cada fase del ciclo")}>
        {outputs.map((o, i) => (
          <div key={o.phase} className="onb-cycle-step">
            <span className="onb-cycle-ico"><Icon name={o.icon} size={18} /></span>
            <strong>{o.phase}</strong>
            <small>{o.out}</small>
            {i < outputs.length - 1 && <span className="onb-arrow" aria-hidden="true">→</span>}
          </div>
        ))}
      </div>
      <p className="onb-caption">
        <Icon name="calendar" size={14} /> <span>{tr("Todo ocurre dentro de un <b>ciclo</b> de 10 a 16 semanas. El ciclo activo se ve en la cabecera.", null, { b: (c) => <b>{c}</b> })}</span>
      </p>
    </div>
  );
}

function IntakeVisual() {
  return (
    <div className="onb-visual">
      <div className="onb-flow" aria-label={t("Camino de una señal hasta el ciclo")}>
        <div className="onb-flow-sources">
          <div className="onb-node">
            <Icon name="globe" size={16} />
            <span><strong>{t("Vigilancia")}</strong><small>{t("Ensayos, agencias, HTA y revistas")}</small></span>
          </div>
          <div className="onb-node">
            <Icon name="note" size={16} />
            <span><strong>{t("Postulaciones")}</strong><small>{t("Formulario público /postular")}</small></span>
          </div>
        </div>
        <span className="onb-flow-arrow" aria-hidden="true">→</span>
        <div className="onb-node is-key">
          <Icon name="inbox" size={16} />
          <span><strong>{t("Bandeja de entrada")}</strong><small>{t("Señales sin ciclo")}</small></span>
        </div>
        <span className="onb-flow-arrow" aria-hidden="true">→</span>
        <div className="onb-gate">
          <small>{t("Usted clasifica")}</small>
          <strong>{t("Clúster + tipología")}</strong>
        </div>
        <span className="onb-flow-arrow" aria-hidden="true">→</span>
        <div className="onb-node is-end">
          <Icon name="calendar" size={16} />
          <span><strong>{t("Ciclo activo")}</strong><small>{t("Entra a filtrado")}</small></span>
        </div>
      </div>
      <p className="onb-caption">
        <Icon name="info" size={14} /> <span>{tr("Una <b>señal</b> es el recorte capturado. Al clasificarla y asignarla al ciclo se vuelve una <b>tecnología</b> de trabajo.", null, { b: (c) => <b>{c}</b> })}</span>
      </p>
    </div>
  );
}

function PriorityVisual() {
  return (
    <div className="onb-visual">
      <div className="onb-filter-row" aria-label={t("Filtrado antes de calificar")}>
        {[t("Quitar duplicados"), t("Verificar novedad con INVIMA"), t("Listado único por clúster")].map((text, i) => (
          <span key={text} className="onb-filter-pill"><b>{i + 1}</b> {text}</span>
        ))}
      </div>
      <div className="onb-matrix" aria-label={t("Seis criterios de priorización")}>
        {CRITERIA.map((c) => (
          <div key={c.code} className={`onb-crit is-${c.who}`}>
            <span className="onb-crit-code">{c.code}</span>
            <span className="onb-crit-label">{c.label}</span>
            <span className="onb-crit-who">{c.who === "tec" ? t("Técnico") : t("Clínico")}</span>
          </div>
        ))}
      </div>
      <div className="onb-scale" aria-label={t("Escala de puntos y resultado")}>
        <div className="onb-scale-bar">
          {[0, 1, 2, 3, 4, 5, 6].map((n) => (
            <span key={n} className={n <= 2 ? "is-no" : n === 3 ? "is-watch" : "is-yes"}>{n}</span>
          ))}
        </div>
        <div className="onb-scale-labels">
          <span className="is-no">{t("0-2 · No priorizada")}</span>
          <span className="is-watch">{t("3 · Bajo vigilancia")}</span>
          <span className="is-yes">{t("4-6 · Priorizada")}</span>
        </div>
        <div className="onb-scale-labels onb-scale-levels">
          <span />
          <span />
          <span>{t("4 Ficha · 5 Informe · 6 Mini-HTA")}</span>
        </div>
      </div>
      <p className="onb-caption">
        <Icon name="spark" size={14} /> <span>{t("Cada sí vale 1 punto. La IA prellena P1, P5 y P6 como sugerencia; una persona confirma cada criterio.")}</span>
      </p>
    </div>
  );
}

function EditorialVisual() {
  return (
    <div className="onb-visual">
      <ol className="onb-track" aria-label={t("Estados editoriales del expediente")}>
        {EDITORIAL.map((s, i) => (
          <li key={s.label} className={i === EDITORIAL.length - 1 ? "is-end" : ""}>
            <span className="onb-track-dot">{i + 1}</span>
            <strong>{s.label}</strong>
            <small>{s.hint}</small>
          </li>
        ))}
      </ol>
      <div className="onb-loop">
        <Icon name="refresh" size={14} />
        <span>{tr("Si el revisor externo pide cambios, el expediente pasa a <b>Con observaciones</b> y vuelve a borrador.", null, { b: (c) => <b>{c}</b> })}</span>
      </div>
      <div className="onb-outputs" aria-label={t("Productos que se publican")}>
        {[
          { icon: "doc", t: t("PDF del expediente") },
          { icon: "book", t: t("Boletín del ciclo") },
          { icon: "globe", t: t("Ficha pública") },
          { icon: "chart", t: t("Tablero y alertas") },
        ].map((o) => (
          <span key={o.t} className="onb-output"><Icon name={o.icon} size={16} /> {o.t}</span>
        ))}
      </div>
      <p className="onb-caption">
        <Icon name="key" size={14} /> <span>{tr("Nadie lee ni edita un expediente sin firmar antes su <b>declaración de conflicto de interés</b>.", null, { b: (c) => <b>{c}</b> })}</span>
      </p>
    </div>
  );
}

function HelpVisual() {
  return (
    <div className="onb-visual">
      <div className="onb-compare">
        <div className="onb-col is-ai">
          <strong><Icon name="spark" size={16} /> {t("La IA puede")}</strong>
          <ul>
            <li>{t("Resumir y extraer datos de las fuentes")}</li>
            <li>{t("Sugerir clasificación y criterios P1, P5, P6")}</li>
            <li>{t("Redactar borradores y mejorar notas")}</li>
            <li>{t("Responder preguntas en el Asistente IA")}</li>
          </ul>
        </div>
        <div className="onb-col is-human">
          <strong><Icon name="users" size={16} /> {t("Solo una persona puede")}</strong>
          <ul>
            <li>{t("Fusionar duplicados")}</li>
            <li>{t("Confirmar el puntaje de priorización")}</li>
            <li>{t("Aprobar y publicar un expediente")}</li>
            <li>{t("Cerrar el ciclo")}</li>
          </ul>
        </div>
      </div>
      <div className="onb-tips">
        <div className="onb-tip"><span className="onb-tip-ico"><Icon name="info" size={16} /></span><span><strong>{t("Ícono ⓘ")}</strong><small>{t("Al lado de cada término: lo explica en lenguaje sencillo.")}</small></span></div>
        <div className="onb-tip"><span className="onb-tip-ico"><Icon name="compass" size={16} /></span><span><strong>{t("¿Cómo llego a…?")}</strong><small>{t("Abajo a la derecha (o Ctrl+K): pregunte cómo hacer algo y le muestra los pasos y el botón para ir.")}</small></span></div>
        <div className="onb-tip"><span className="onb-tip-ico"><Icon name="list" size={16} /></span><span><strong>{t("Guía de fase")}</strong><small>{t("Arriba de cada módulo: qué hacer ahí y botón al paso siguiente. Se puede plegar.")}</small></span></div>
        <div className="onb-tip"><span className="onb-tip-ico"><Icon name="pulse" size={16} /></span><span><strong>{t("En vivo")}</strong><small>{t("Los cambios del equipo aparecen solos, sin recargar.")}</small></span></div>
        <div className="onb-tip"><span className="onb-tip-ico"><Icon name="shield" size={16} /></span><span><strong>{t("Bitácora")}</strong><small>{t("Cada cambio queda registrado con usuario y fecha.")}</small></span></div>
      </div>
    </div>
  );
}

function RolesVisual({ user }) {
  return (
    <div className="onb-visual">
      <div className="onb-roles" aria-label={t("Perfiles del sistema")}>
        {ROLES.map((r) => {
          const mine = user?.role === r.key;
          return (
            <div key={r.key} className={`onb-rolecard${mine ? " is-mine" : ""}`} style={{ "--role": r.color }}>
              <div className="onb-rolecard-head">
                <span className="onb-rolecard-dot" aria-hidden="true" />
                <div>
                  <strong>
                    {r.name}
                    {mine && <span className="onb-you">{t("Usted")}</span>}
                  </strong>
                  <small>{r.who}</small>
                </div>
              </div>
              <div className="onb-rolephases" aria-label={t("Participa en: {phases}", { phases: r.phases.map((p) => PHASES[p]).join(", ") })}>
                {PHASES.map((p, i) => (
                  <span key={p} className={r.phases.includes(i) ? "is-on" : ""} title={p}>
                    {p}
                  </span>
                ))}
              </div>
              <ul>
                {r.tasks.map((task) => (
                  <li key={task}>{task}</li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <p className="onb-caption">
        <Icon name="shield" size={14} />{" "}
        <span>
          {tr(
            "Cada perfil solo ve los botones que le corresponden. Si un botón aparece gris, al pasar el cursor el sistema explica qué <b>perfil</b> lo puede usar.",
            null,
            { b: (c) => <b>{c}</b> }
          )}
        </span>
      </p>
    </div>
  );
}

function RelayVisual({ user }) {
  return (
    <div className="onb-visual">
      <ol className="onb-relay" aria-label={t("Relevos entre perfiles a lo largo del ciclo")}>
        {RELAY.map((step, i) => {
          const mine = step.roles.includes(user?.role);
          const showPhase = i === 0 || RELAY[i - 1].phase !== step.phase;
          return (
            <li key={i} className={mine ? "is-mine" : ""}>
              <span className="onb-relay-phase">{showPhase ? PHASES[step.phase] : ""}</span>
              <span className="onb-relay-dot" aria-hidden="true">
                {i + 1}
              </span>
              <div className="onb-relay-body">
                <div className="onb-relay-roles">
                  {step.roles.map((k) => (
                    <span key={k} className="onb-relay-role" style={{ "--role": ROLE_BY_KEY[k].color }}>
                      {ROLE_BY_KEY[k].name}
                    </span>
                  ))}
                </div>
                <p>{step.text}</p>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="onb-caption">
        <Icon name="pulse" size={14} />{" "}
        <span>
          {tr(
            "Los pasos donde usted participa están resaltados. Lo que cada uno termina aparece al instante en la <b>Bandeja de trabajo</b> de quien sigue.",
            null,
            { b: (c) => <b>{c}</b> }
          )}
        </span>
      </p>
    </div>
  );
}

function stepsFor(user) {
  const name = firstNameOf(user);
  return [
    {
      tab: t("Inicio##menú"),
      kicker: t("Bienvenida"),
      title: name ? t("{name}, este es el mapa del sistema", { name }) : t("Este es el mapa del sistema"),
      lead: t("El IETS vigila tecnologías sanitarias emergentes antes de que lleguen a Colombia. El trabajo avanza en cuatro fases; cada una deja un producto para la siguiente."),
      pipe: null,
      visual: <WelcomeVisual user={user} />,
    },
    {
      tab: t("Identificar"),
      kicker: t("Fase 1 · Identificar"),
      title: t("De la fuente a la bandeja"),
      lead: t("Hay dos puertas de entrada y las dos llegan a la misma bandeja. Lo que no se clasifica ni se asigna al ciclo no sigue adelante."),
      pipe: 0,
      visual: <IntakeVisual />,
      where: [
        { to: "/vigilancia", label: t("Vigilancia") },
        { to: "/bandeja-entrada", label: t("Bandeja de entrada") },
        { to: "/postulaciones", label: t("Postulaciones") },
      ],
    },
    {
      tab: t("Priorizar"),
      kicker: t("Fase 2 · Priorizar"),
      title: t("Filtrar, luego calificar"),
      lead: t("Primero se depura la lista. Después cada tecnología responde seis preguntas de sí o no, y el total decide qué pasa con ella."),
      pipe: 1,
      visual: <PriorityVisual />,
      where: [
        { to: "/filtrado", label: t("Filtrado y depuración") },
        { to: "/priorizacion", label: t("Priorización") },
      ],
    },
    {
      tab: t("Evaluar"),
      kicker: t("Fases 3 y 4 · Evaluar y publicar"),
      title: t("Documentar, revisar y diseminar"),
      lead: t("Cada tecnología priorizada recibe un expediente que pasa por revisión de pares antes de publicarse. Al cerrar el ciclo los puntajes quedan congelados."),
      pipe: [2, 3],
      visual: <EditorialVisual />,
      where: [
        { to: "/evaluacion", label: t("Evaluación") },
        { to: "/diseminacion", label: t("Diseminación") },
        { to: "/boletines", label: t("Boletines") },
      ],
    },
    {
      tab: t("Perfiles"),
      kicker: t("Personas del proceso"),
      title: t("Quién hace qué"),
      lead: t("Seis perfiles se reparten el trabajo. Cada tarjeta dice quién es, en qué fases participa y qué hace en ellas."),
      pipe: "all",
      visual: <RolesVisual user={user} />,
      where: user?.role === "superadmin" ? [{ to: "/usuarios", label: t("Usuarios y perfiles") }] : undefined,
    },
    {
      tab: t("Relevos"),
      kicker: t("Cómo interactúan"),
      title: t("Cómo se pasan el trabajo"),
      lead: t("El ciclo avanza por relevos: cada perfil termina su parte y la siguiente persona la recibe. Así se ve un ciclo completo, de la señal al cierre."),
      pipe: "all",
      visual: <RelayVisual user={user} />,
      where: [{ to: "/", label: t("Bandeja de trabajo") }],
    },
    {
      tab: t("Ayudas"),
      kicker: t("Para trabajar tranquilo"),
      title: t("La IA sugiere, usted decide"),
      lead: t("La inteligencia artificial ahorra lectura y redacción, pero las decisiones metodológicas siempre las toma una persona. Estas ayudas están en todas las pantallas."),
      pipe: "all",
      visual: <HelpVisual />,
      where: [{ to: "/chat", label: t("Asistente IA") }],
    },
    {
      tab: t("Empezar"),
      kicker: t("Empiece aquí"),
      title: t("Tres acciones de hoy"),
      lead: t("Confirme el ciclo en la cabecera y entre por cualquiera de estas puertas. Puede volver a esta guía cuando quiera con el botón Guía."),
      pipe: "all",
      actions: startActions(user),
      note: t("En equipos compartidos cierre sesión al terminar."),
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
  const bodyRef = useRef(null);
  const [index, setIndex] = useState(0);
  const last = index === steps.length - 1;
  const step = steps[index];

  useEffect(() => {
    if (!open) return;
    setIndex(0);
    const timer = window.setTimeout(() => dialogRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    bodyRef.current?.scrollTo?.(0, 0);
    // En celular las pestañas se desplazan: la activa debe quedar a la vista.
    dialogRef.current
      ?.querySelector(".onb-tabs .is-now")
      ?.scrollIntoView?.({ block: "nearest", inline: "center" });
  }, [index]);

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
              {t("Guía rápida · IETS Colombia")}
            </div>
            <button type="button" className="onb-close" onClick={() => onClose(true)} aria-label={t("Cerrar guía")}>
              <Icon name="x" size={18} />
            </button>
          </div>
          <h2 id="onb-title">{t("Cómo funciona el escaneo de horizonte")}</h2>
          <p className="onb-hero-sub">{t("Cuatro fases, un ciclo y decisiones humanas. Ocho pantallas para orientarse.")}</p>
          <div className="onb-pipeline" aria-hidden="true">
            {PIPE.map((p, i) => (
              <div key={p.n} className={`onb-pipe${pipeActive(step.pipe, i) ? " is-on" : ""}`}>
                <span className="onb-pipe-num">{p.n}</span>
                <span className="onb-pipe-label">{p.label}</span>
              </div>
            ))}
          </div>
        </div>

        <nav className="onb-tabs" aria-label={t("Pantallas de la guía")}>
          {steps.map((s, i) => (
            <button
              type="button"
              key={s.tab}
              className={i < index ? "is-done" : i === index ? "is-now" : ""}
              aria-current={i === index ? "step" : undefined}
              onClick={() => setIndex(i)}
            >
              <span className="onb-tab-num">{i + 1}</span>
              <span className="onb-tab-label">{s.tab}</span>
            </button>
          ))}
        </nav>

        <div className="onb-body" ref={bodyRef}>
          <div className="onb-step-kicker">{step.kicker}</div>
          <h3>{step.title}</h3>
          <p className="onb-lead">{step.lead}</p>
          {step.visual}
          {step.where && (
            <div className="onb-where">
              <span>{t("Dónde se hace:")}</span>
              {step.where.map((w) => (
                <button type="button" key={w.to} className="onb-where-link" onClick={() => go(w.to)}>
                  {w.label} →
                </button>
              ))}
            </div>
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
                  <span className="onb-action-go">{t("Ir →")}</span>
                </button>
              ))}
            </div>
          )}
          {step.note && <p className="onb-note">{step.note}</p>}
        </div>

        <div className="onb-footer">
          <div className="onb-footer-left">
            <span className="onb-step-count">
              {t("{n} de {total}", { n: index + 1, total: steps.length })}
            </span>
            {!last && (
              <button type="button" className="onb-skip" onClick={() => onClose(true)}>
                {t("Saltar guía")}
              </button>
            )}
          </div>
          <div className="onb-footer-right">
            {index > 0 && (
              <Button type="button" variant="secondary" onClick={() => setIndex((i) => i - 1)}>
                {t("Atrás")}
              </Button>
            )}
            {last ? (
              <Button type="button" onClick={() => onClose(true)}>
                {t("Entendido, empezar")}
              </Button>
            ) : (
              <Button type="button" onClick={() => setIndex((i) => i + 1)}>
                {t("Siguiente")}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
