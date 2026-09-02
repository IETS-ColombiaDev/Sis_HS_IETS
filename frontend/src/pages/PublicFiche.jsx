import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "axios";
import PublicShell from "../components/PublicShell";
import Button from "../components/Button";

export default function PublicFiche() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setData(null);
    setError("");
    axios
      .get(`/api/public/technologies/${id}`)
      .then((r) => setData(r.data))
      .catch((err) => {
        const detail = err?.response?.data?.detail;
        setError(typeof detail === "string" ? detail : "Esta ficha no esta disponible en la consulta publica.");
      });
  }, [id]);

  const labels = data?.field_labels || {};

  return (
    <PublicShell
      kicker="Ficha publica"
      title={data?.title || (error ? "Expediente no disponible" : "Cargando…")}
      lead={
        data
          ? [data.inn_name, data.cluster, data.ttm_band_label].filter(Boolean).join(" · ")
          : undefined
      }
    >
      {error && <p className="public-submit-error">{error}</p>}

      {data && (
        <>
          {Object.entries(data.body || {}).map(([key, value]) => (
            <section key={key} className="eval-public-block">
              <h3>{labels[key] || key}</h3>
              <p>{value}</p>
            </section>
          ))}

          <section className="eval-public-block">
            <h3>Ensayos clinicos asociados</h3>
            {(data.nct_ids || []).length === 0 ? (
              <p>Sin identificadores NCT registrados.</p>
            ) : (
              <ul>
                {data.nct_ids.map((n) => (
                  <li key={n}>
                    <a href={`https://clinicaltrials.gov/study/${n}`} target="_blank" rel="noreferrer">
                      {n}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="eval-actions">
            <Button
              variant="secondary"
              onClick={() => window.open(`/api/public/technologies/${id}/export`, "_blank", "noopener")}
            >
              Descargar ficha tecnica
            </Button>
            <Link to="/expedientes">Volver al buscador</Link>
          </div>
        </>
      )}
    </PublicShell>
  );
}
