// Preparacion de datos por API para las pruebas del flujo metodologico (frente A).
// La interfaz se prueba en cada spec; aqui solo se arma el escenario de partida
// para que cada prueba sea independiente del estado de la base.
import { expect } from "@playwright/test";
import { apiToken, auth, tokenForRole, uid } from "./helpers";

export const CYCLE_KEY = "iets_hs_cycle";

/** Cliente autenticado minimo sobre `request` de Playwright. */
export async function apiAs(request, role = "superadmin") {
  const token = role === "superadmin" ? await apiToken(request) : await tokenForRole(request, role);
  const headers = auth(token);
  const call = async (method, path, data, expectStatus) => {
    const res = await request[method](`/api${path}`, { headers, data });
    if (expectStatus !== undefined) {
      expect(res.status(), `${method.toUpperCase()} ${path}: ${await res.text()}`).toBe(expectStatus);
    } else {
      expect(res.ok(), `${method.toUpperCase()} ${path}: ${res.status()} ${await res.text()}`).toBeTruthy();
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  };
  return {
    token,
    get: (p, s) => call("get", p, undefined, s),
    post: (p, d, s) => call("post", p, d ?? {}, s),
    put: (p, d, s) => call("put", p, d ?? {}, s),
    del: (p, s) => call("delete", p, undefined, s),
  };
}

const FORWARD = ["en_configuracion", "en_filtrado", "en_priorizacion", "en_evaluacion"];

/** Anio libre para no chocar con la cuota de 3 ciclos formales por ano. */
export function freeYear() {
  return 2100 + Math.floor(Math.random() * 800);
}

export function isoDate(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Crea un ciclo valido (12 semanas) y lo avanza hasta `status`. */
export async function createCycle(api, { status = "en_configuracion", year = freeYear(), code } = {}) {
  const cycle = await api.post("/cycles", {
    code: code || uid("REG-E2E"),
    opened_on: isoDate(year, 1, 5),
    data_cutoff_on: isoDate(year, 3, 16),
    bulletin_due_on: isoDate(year, 3, 30),
    notes: "Creado por la suite E2E del frente A",
  });
  const target = FORWARD.indexOf(status);
  for (let i = 1; i <= target; i += 1) {
    await api.put(`/cycles/${cycle.id}/status`, { status: FORWARD[i], justification: "" });
  }
  return { ...cycle, status };
}

/**
 * Crea tecnologias en la bandeja con el conector de contrato (sin red). Devuelve
 * las tecnologias en el orden de `records`.
 */
export async function seedTechs(api, records) {
  // El conector persiste hasta `ingest.max_records_per_run` (50) por corrida:
  // se usa una fuente por bloque de 40.
  for (let start = 0; start < records.length; start += 40) {
    const tag = uid("fx");
    const chunk = records.slice(start, start + 40);
    const source = await api.post("/sources", {
      title: `Fixture ${tag}`,
      url: `https://fixture.example/${tag}`,
      connector: "fixture",
      scrape_enabled: true,
      connector_config: {
        records: chunk.map((r, i) => ({
          external_id: `${tag}-${i}`,
          title: r.name,
          commercial_name: r.name,
          inn_name: r.inn || "",
          manufacturer: r.manufacturer || "Laboratorio E2E",
          indication: r.indication || "Melanoma avanzado",
          nct_ids: r.nct || [],
          development_phase: r.phase || "Fase III",
          raw: { id: `${tag}-${i}` },
        })),
      },
    });
    const run = await api.post("/ingest/run", { source_ids: [source.id], process_now: true });
    expect(run.processed).toBe(1);
    // Que el worker programado no la vuelva a correr.
    await api.put(`/sources/${source.id}`, { scrape_enabled: false });
  }
  const out = [];
  for (const r of records) {
    const found = await api.get(`/technologies/staging?q=${encodeURIComponent(r.name.slice(0, 60))}&limit=5`);
    const tech = found.find((t) => t.commercial_name === r.name);
    expect(tech, `tecnologia sembrada ${r.name}`).toBeTruthy();
    out.push(tech);
  }
  return out;
}

export async function catalogs(api) {
  const [clusters, types] = await Promise.all([api.get("/clusters"), api.get("/tech-types")]);
  return { cluster: clusters[0], type: types[0], clusters, types };
}

export async function classify(api, techId, extra = {}) {
  const { cluster, type } = await catalogs(api);
  return api.put(`/technologies/${techId}`, {
    cluster_id: cluster.id,
    tech_type_id: type.id,
    condition: "emergente",
    ...extra,
  });
}

export async function assign(api, cycleId, ids) {
  const res = await api.post("/technologies/assign-to-cycle", { technology_ids: ids, cycle_id: cycleId });
  expect(res.assigned, JSON.stringify(res)).toBe(ids.length);
  return res;
}

/** Cruce INVIMA + via de novedad + apta (compuerta RF10/RF11). */
export async function qualify(api, cycleId, techId) {
  await api.post(`/screening/novelty/${cycleId}/${techId}/invima-check`);
  await api.put(`/screening/novelty/${cycleId}/${techId}`, {
    option_code: "nueva_indicacion",
    justification: "Indicacion no cubierta por ningun registro sanitario vigente en Colombia (E2E).",
  });
  await api.post(`/technologies/${techId}/cycles/${cycleId}/qualify`);
}

/** Califica los seis criterios con el superadministrador. */
export async function rateAll(api, cycleId, techId, values) {
  let state = null;
  for (const [i, value] of values.entries()) {
    state = await api.post(`/priority/${cycleId}/${techId}/rate`, { criterion: `P${i + 1}`, value });
  }
  return state;
}

/** Escenario completo hasta `status` de la instancia: asignada, apta o priorizada. */
export async function techInCycle(api, cycleId, { name, stage = "priorizada", values = [1, 1, 1, 1, 1, 0] } = {}) {
  const [tech] = await seedTechs(api, [{ name: name || uid("Tecnologia E2E") }]);
  await classify(api, tech.id);
  await assign(api, cycleId, [tech.id]);
  if (stage === "asignada") return tech;
  await qualify(api, cycleId, tech.id);
  if (stage === "apta") return tech;
  await rateAll(api, cycleId, tech.id, values);
  return tech;
}

/** Deja la pantalla trabajando sobre `cycleId` (una sola vez por pestana). */
export async function useCycleInPage(page, cycleId) {
  await page.addInitScript(([k, id]) => {
    if (!window.sessionStorage.getItem("e2e_cycle_injected")) {
      window.localStorage.setItem(k, String(id));
      window.sessionStorage.setItem("e2e_cycle_injected", "1");
    }
  }, [CYCLE_KEY, cycleId]);
}

/** Espera un toast que contenga el texto. */
export async function expectToast(page, text) {
  await expect(page.getByText(text, { exact: false }).first()).toBeVisible();
}
