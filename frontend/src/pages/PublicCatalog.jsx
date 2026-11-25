import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import PublicShell from "../components/PublicShell";
import Button from "../components/Button";

const PAGE_SIZE = 20;
const EMPTY_FILTERS = { cluster_id: "", tech_type_id: "", phase: "", year: "" };

/**
 * Consulta publica de expedientes (RF18): busqueda por texto y filtros por
 * cluster, tipologia, fase de desarrollo y ano de publicacion, con paginacion.
 * Solo ofrece opciones que tienen al menos una ficha publica.
 */
export default function PublicCatalog() {
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [options, setOptions] = useState(null);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const search = useCallback(async (query, active, pageIndex) => {
    setError("");
    setLoading(true);
    try {
      const params = { q: query, limit: PAGE_SIZE, offset: pageIndex * PAGE_SIZE };
      Object.entries(active).forEach(([key, value]) => {
        if (value) params[key] = value;
      });
      const list = await axios.get("/api/public/technologies", { params });
      setItems(list.data);
      const count = Number(list.headers["x-total-count"]);
      setTotal(Number.isFinite(count) ? count : list.data.length);
      setPage(pageIndex);
    } catch {
      setError("No se pudo cargar el catálogo público. Intente de nuevo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    search("", EMPTY_FILTERS, 0);
    axios.get("/api/public/strategy/stats").then((res) => setStats(res.data)).catch(() => {});
    axios.get("/api/public/technologies/filters").then((res) => setOptions(res.data)).catch(() => {});
  }, [search]);

  const setFilter = (key, value) => {
    const next = { ...filters, [key]: value };
    setFilters(next);
    search(q, next, 0);
  };

  const clear = () => {
    setQ("");
    setFilters(EMPTY_FILTERS);
    search("", EMPTY_FILTERS, 0);
  };

  const filtered = Boolean(q) || Object.values(filters).some(Boolean);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasOptions =
    options && (options.clusters.length > 1 || options.tech_types.length > 1 || options.phases.length > 1 || options.years.length > 1);

  return (
    <PublicShell
      wide
      kicker="Consulta pública"
      title="Expedientes de tecnologías emergentes"
      lead="Fichas técnicas ya publicadas por el IETS. No incluye modelaciones presupuestales, comparadores estratégicos ni documentos confidenciales."
    >
      {stats && (
        <div className="public-kpis">
          <div>
            <b>{stats.published}</b>
            <span title="Tecnologías cuyo informe ya fue publicado. Algunas pueden no tener ficha pública por confidencialidad.">Tecnologías publicadas</span>
          </div>
          <div>
            <b>{stats.cycles}</b>
            <span>Ciclos formales</span>
          </div>
        </div>
      )}

      <form
        className="public-search"
        onSubmit={(e) => {
          e.preventDefault();
          search(q, filters, 0);
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value.slice(0, 80))}
          placeholder="Buscar por nombre comercial, denominación común internacional o indicación"
          aria-label="Buscar expediente"
        />
        <Button type="submit">Buscar</Button>
      </form>

      {hasOptions && (
        <div className="public-filters" data-testid="public-filters">
          {options.clusters.length > 1 && (
            <select aria-label="Filtrar por clúster" value={filters.cluster_id} onChange={(e) => setFilter("cluster_id", e.target.value)}>
              <option value="">Todos los clústeres</option>
              {options.clusters.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
          {options.tech_types.length > 1 && (
            <select aria-label="Filtrar por tipo de tecnología" value={filters.tech_type_id} onChange={(e) => setFilter("tech_type_id", e.target.value)}>
              <option value="">Todos los tipos de tecnología</option>
              {options.tech_types.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}
          {options.phases.length > 1 && (
            <select aria-label="Filtrar por fase de desarrollo" value={filters.phase} onChange={(e) => setFilter("phase", e.target.value)}>
              <option value="">Todas las fases</option>
              {options.phases.map((p) => (
                <option key={p.code} value={p.code}>{p.name}</option>
              ))}
            </select>
          )}
          {options.years.length > 1 && (
            <select aria-label="Filtrar por año de publicación" value={filters.year} onChange={(e) => setFilter("year", e.target.value)}>
              <option value="">Todos los años</option>
              {options.years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          )}
          {filtered && (
            <button type="button" className="public-filters-clear" onClick={clear}>
              Quitar filtros
            </button>
          )}
        </div>
      )}

      {error && <p className="public-submit-error">{error}</p>}
      {loading && <p className="public-submit-lead">Cargando expedientes...</p>}

      {!loading && !error && items.length === 0 && (
        <p className="public-submit-lead">
          {filtered ? "No hay expedientes públicos que coincidan con la búsqueda." : "Aún no hay expedientes publicados."}
        </p>
      )}
      {!loading && !error && items.length > 0 && (
        <p className="public-submit-lead" data-testid="public-count" aria-live="polite">
          {total === 1 ? "1 expediente" : `${total} expedientes`}
          {filtered ? " con estos criterios" : ""}
        </p>
      )}

      <ul className="public-fiche-list">
        {items.map((item) => (
          <li key={item.id}>
            <Link to={`/expedientes/${item.id}`}>
              <strong>{item.title}</strong>
              <span>
                {[item.inn_name, item.commercial_name, item.development_phase].filter(Boolean).join(" · ")}
              </span>
              {(item.nct_ids || []).length > 0 && (
                <em>Ensayos: {item.nct_ids.slice(0, 3).join(", ")}</em>
              )}
            </Link>
          </li>
        ))}
      </ul>

      {!loading && pages > 1 && (
        <nav className="public-pager" aria-label="Páginas de resultados">
          <Button variant="outline" disabled={page === 0} onClick={() => search(q, filters, page - 1)}>
            Anterior
          </Button>
          <span>Página {page + 1} de {pages}</span>
          <Button variant="outline" disabled={page + 1 >= pages} onClick={() => search(q, filters, page + 1)}>
            Siguiente
          </Button>
        </nav>
      )}
    </PublicShell>
  );
}
