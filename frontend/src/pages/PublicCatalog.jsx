import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import PublicShell from "../components/PublicShell";
import Button from "../components/Button";

export default function PublicCatalog() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async (query = q) => {
    setError("");
    setLoading(true);
    try {
      const [list, st] = await Promise.all([
        axios.get("/api/public/technologies", { params: { q: query } }),
        axios.get("/api/public/strategy/stats"),
      ]);
      setItems(list.data);
      setStats(st.data);
    } catch {
      setError("No se pudo cargar el catalogo publico. Intente de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <PublicShell
      wide
      kicker="Consulta publica"
      title="Expedientes de tecnologias emergentes"
      lead="Fichas tecnicas ya publicadas por el IETS. No incluye modelaciones presupuestales, comparadores estrategicos ni documentos confidenciales."
    >
      {stats && (
        <div className="public-kpis">
          <div>
            <b>{stats.published}</b>
            <span>Fichas publicadas</span>
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
          load(q);
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value.slice(0, 80))}
          placeholder="Buscar por nombre comercial o denominacion comun internacional"
          aria-label="Buscar expediente"
        />
        <Button type="submit">Buscar</Button>
      </form>

      {error && <p className="public-submit-error">{error}</p>}
      {loading && <p className="public-submit-lead">Cargando expedientes…</p>}

      {!loading && items.length === 0 && (
        <p className="public-submit-lead">
          No hay expedientes publicos que coincidan con la busqueda.
        </p>
      )}

      <ul className="public-fiche-list">
        {items.map((item) => (
          <li key={item.id}>
            <Link to={`/expedientes/${item.id}`}>
              <strong>{item.title}</strong>
              <span>
                {[item.inn_name, item.commercial_name].filter(Boolean).join(" · ")}
              </span>
              {(item.nct_ids || []).length > 0 && (
                <em>Ensayos: {item.nct_ids.slice(0, 3).join(", ")}</em>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </PublicShell>
  );
}
