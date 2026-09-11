import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import Button from "../components/Button";
import Icon from "../components/Icon";

/**
 * Enlace directo a una tecnologia: `?tecnologia=<id>`.
 *
 * La bandeja de trabajo y el tablero enlazan a Bandeja de entrada, Filtrado,
 * Priorizacion y Evaluacion con este parametro. Cada pantalla lo lee para abrir
 * la tecnologia; al elegir otra, la URL se actualiza (enlace compartible) con
 * `replace`, de modo que Atras vuelve a la pantalla de origen y no recorre cada
 * seleccion.
 */
export const TECH_PARAM = "tecnologia";

export const PAGE_LABEL = {
  bandeja: "Bandeja de entrada",
  filtrado: "Filtrado y depuración",
  priorizacion: "Priorización",
  evaluacion: "Evaluación",
};

export const PAGE_PATH = {
  bandeja: "/bandeja-entrada",
  filtrado: "/filtrado",
  priorizacion: "/priorizacion",
  evaluacion: "/evaluacion",
};

/** Pantalla donde se trabaja cada estado de la instancia (mismo criterio del tablero). */
export function pageForStatus(status) {
  switch (status) {
    case "asignada_a_ciclo":
    case "excluida":
      return "filtrado";
    case "filtrada_apta_priorizacion":
    case "bajo_vigilancia":
    case "no_priorizada":
      return "priorizacion";
    case "priorizada":
    case "en_evaluacion":
    case "publicada":
      return "evaluacion";
    default:
      return "bandeja";
  }
}

export function useTechDeepLink() {
  const [params, setParams] = useSearchParams();
  const raw = params.get(TECH_PARAM);
  const techId = raw && /^\d+$/.test(raw) ? Number(raw) : null;
  const setTechId = useCallback(
    (id) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id) next.set(TECH_PARAM, String(id));
          else next.delete(TECH_PARAM);
          return next;
        },
        { replace: true }
      );
    },
    [setParams]
  );
  return { techId, rawParam: raw, invalidParam: Boolean(raw) && !techId, setTechId };
}

/** Ubicacion de la tecnologia (estado global e instancia por ciclo). null si no existe. */
export async function locateTech(api, id) {
  try {
    const { data } = await api.get(`/technologies/${id}/locate`);
    return data;
  } catch (e) {
    if (e?.response?.status === 404) return null;
    throw e;
  }
}

/**
 * Decide que hacer con el enlace en una pantalla.
 * `accepts(status)` indica si la pantalla trabaja ese estado de la instancia.
 */
export function resolveTechLink(loc, { cycleId, accepts }) {
  if (!loc) return { kind: "missing" };
  const entry = (loc.entries || []).find((e) => e.cycle_id === cycleId) || null;
  if (entry) {
    if (accepts(entry.status, entry)) return { kind: "ok", entry, loc };
    return { kind: "wrong-page", entry, loc, page: pageForStatus(entry.status) };
  }
  const others = (loc.entries || []).filter((e) => !e.is_historic);
  if (others.length === 0) return { kind: "staging", loc };
  return { kind: "other-cycle", entry: others[0], loc };
}

/**
 * Aviso para el usuario cuando el enlace no se puede abrir tal cual.
 * Devuelve { tone, message, actions } o null si no hay nada que avisar.
 */
export function buildTechNotice(res, { id, page, cycle, setCycleId, navigate }) {
  if (!res || res.kind === "ok") return null;
  const name = res.loc?.name ? `"${res.loc.name.slice(0, 90)}${res.loc.name.length > 90 ? "..." : ""}"` : `#${id}`;
  const goTo = (target, techId = id) => ({
    label: `Ir a ${PAGE_LABEL[target]}`,
    testId: `tech-link-go-${target}`,
    onClick: () => navigate(`${PAGE_PATH[target]}?${TECH_PARAM}=${techId}`),
  });
  const merged = res.loc?.merged_into_id
    ? [
        {
          label: `Ver la tecnología que la absorbió (#${res.loc.merged_into_id})`,
          testId: "tech-link-merged",
          onClick: () => navigate(`${PAGE_PATH.filtrado}?${TECH_PARAM}=${res.loc.merged_into_id}`),
        },
      ]
    : [];
  switch (res.kind) {
    case "missing":
      return {
        tone: "warn",
        message: `La tecnología #${id} no existe o fue eliminada. Revise el enlace.`,
        actions: [],
      };
    case "staging":
      if (page === "bandeja") return null;
      return {
        tone: "info",
        message: `La tecnología ${name} todavía está en la bandeja de entrada: no pertenece a ningún ciclo.`,
        actions: [goTo("bandeja"), ...merged],
      };
    case "other-cycle":
      return {
        tone: "info",
        message: `La tecnología ${name} no pertenece a ${cycle?.code || "el ciclo en pantalla"}: está en ${res.entry.cycle_code} (${res.entry.status_label}).`,
        actions: [
          {
            label: `Cambiar a ${res.entry.cycle_code}`,
            testId: "tech-link-switch-cycle",
            onClick: () => setCycleId(res.entry.cycle_id),
          },
          ...merged,
        ],
      };
    case "wrong-page": {
      const why = res.loc?.merged_into_id
        ? ` Fue fusionada con la #${res.loc.merged_into_id}.`
        : res.entry.exclusion_reason
        ? ` Causa: ${res.entry.exclusion_reason}.`
        : "";
      return {
        tone: "info",
        message: `La tecnología ${name} está en estado "${res.entry.status_label}" en ${res.entry.cycle_code}; se gestiona en ${PAGE_LABEL[res.page]}.${why}`,
        actions: res.page === page ? merged : [goTo(res.page), ...merged],
      };
    }
    default:
      return null;
  }
}

export function TechLinkNotice({ notice, onClose }) {
  if (!notice) return null;
  return (
    <div
      className={`fa-notice fa-notice--${notice.tone === "warn" ? "warn" : "info"} fa-link-notice`}
      role="status"
      data-testid="tech-link-notice"
    >
      <Icon name="link" size={16} />
      <div style={{ flex: 1 }}>
        <div>{notice.message}</div>
        {notice.actions?.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            {notice.actions.map((a) => (
              <Button key={a.label} size="sm" variant="secondary" onClick={a.onClick} data-testid={a.testId}>
                {a.label}
              </Button>
            ))}
          </div>
        )}
      </div>
      {onClose && (
        <button type="button" className="clamp-text-toggle" onClick={onClose} aria-label="Cerrar aviso">
          <Icon name="x" size={14} />
        </button>
      )}
    </div>
  );
}

/** Lleva el elemento a la vista y lo resalta brevemente (espera a que aparezca). */
export function focusElement(testId, attempts = 30) {
  const tick = (left) => {
    const el = document.querySelector(`[data-testid="${testId}"]`);
    if (el) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      // Atributo y no clase: React reescribe `className` al re-renderizar (por
      // ejemplo al marcar el elemento activo) y borraria el resaltado.
      el.removeAttribute("data-flash");
      void el.offsetWidth; // reinicia la animacion si se resalta dos veces
      el.setAttribute("data-flash", "1");
      window.setTimeout(() => el.removeAttribute("data-flash"), 2600);
      return;
    }
    if (left > 0) window.setTimeout(() => tick(left - 1), 150);
  };
  tick(attempts);
}
