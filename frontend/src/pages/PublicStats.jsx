import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import PublicShell from "../components/PublicShell";

export default function PublicStats() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    axios
      .get("/api/public/strategy/stats")
      .then((r) => setData(r.data))
      .catch(() => setError("No se pudieron cargar las estadisticas publicas."));
  }, []);

  return (
    <PublicShell
      kicker="Transparencia"
      title="Estadisticas agregadas del escaneo"
      lead="Conteo publico de tecnologias ya publicadas. Esta vista no expone presupuestos, comparadores ni expedientes confidenciales."
    >
      {error && <p className="public-submit-error">{error}</p>}
      {data && (
        <>
          <div className="public-kpis">
            <div>
              <b>{data.published}</b>
              <span>Tecnologias publicadas</span>
            </div>
            <div>
              <b>{data.cycles}</b>
              <span>Ciclos formales</span>
            </div>
          </div>
          <h2 className="public-section">Distribucion por cluster</h2>
          {(data.by_cluster || []).length === 0 ? (
            <p className="public-submit-lead">Aun no hay fichas publicadas clasificadas.</p>
          ) : (
            <ul className="public-cluster-list">
              {(data.by_cluster || []).map((row) => (
                <li key={row.label}>
                  <span>{row.label}</span>
                  <strong>{row.value}</strong>
                </li>
              ))}
            </ul>
          )}
          <p className="public-submit-foot">
            <Link to="/expedientes">Consultar expedientes</Link>
          </p>
        </>
      )}
    </PublicShell>
  );
}
