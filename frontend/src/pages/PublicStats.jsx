import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import PublicShell from "../components/PublicShell";
import { t, ts } from "../i18n";

export default function PublicStats() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    axios
      .get("/api/public/strategy/stats")
      .then((r) => setData(r.data))
      .catch(() => setError(t("No se pudieron cargar las estadísticas públicas.")));
  }, []);

  return (
    <PublicShell
      kicker={t("Transparencia")}
      title={t("Estadísticas agregadas del escaneo")}
      lead={t("Conteo público de tecnologías ya publicadas. Esta vista no expone presupuestos, comparadores ni expedientes confidenciales.")}
    >
      {error && <p className="public-submit-error">{error}</p>}
      {!data && !error && <p className="public-submit-lead">{t("Cargando estadísticas…")}</p>}
      {data && (
        <>
          <div className="public-kpis">
            <div>
              <b>{data.published}</b>
              <span>{t("Tecnologías publicadas")}</span>
            </div>
            <div>
              <b>{data.cycles}</b>
              <span>{t("Ciclos formales")}</span>
            </div>
          </div>
          <h2 className="public-section">{t("Distribución por clúster")}</h2>
          {(data.by_cluster || []).length === 0 ? (
            <p className="public-submit-lead">{t("Aún no hay fichas publicadas clasificadas.")}</p>
          ) : (
            <ul className="public-cluster-list">
              {(data.by_cluster || []).map((row) => {
                const max = Math.max(1, ...(data.by_cluster || []).map((r) => r.value || 0));
                return (
                  <li key={row.label} style={{ "--share": `${Math.round(((row.value || 0) / max) * 100)}%` }}>
                    <span>{ts(row.label)}</span>
                    <strong>{row.value}</strong>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="public-submit-foot">
            <Link to="/expedientes">{t("Consultar expedientes")}</Link>
          </p>
        </>
      )}
    </PublicShell>
  );
}
