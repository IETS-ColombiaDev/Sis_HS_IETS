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
        setError(typeof detail === "string" ? detail : "Esta ficha no está disponible en la consulta pública.");
      });
  }, [id]);

  const labels = data?.field_labels || {};
  const entries = Object.entries(data?.body || {}).filter(([, value]) => String(value || "").trim());

  return (
    <PublicShell
      kicker="Ficha pública"
      title={data?.title || (error ? "Expediente no disponible" : "Cargando…")}
      lead={
        data
          ? [data.inn_name, data.cluster, data.ttm_band_label].filter(Boolean).join(" · ")
          : undefined
      }
    >
      {error && <p className="public-submit-error">{error}</p>}

      {data && (
        <article className="iets-dossier is-public">
          <header className="iets-dossier-mast">
            <div className="iets-dossier-brand">IETS</div>
            <div>
              <p className="iets-dossier-kicker">Consulta pública · Escaneo de horizonte</p>
              <h2>{data.title}</h2>
              <p className="iets-dossier-sub">
                {[data.commercial_name, data.inn_name && `DCI ${data.inn_name}`, data.manufacturer]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          </header>

          <div className="public-fiche-meta">
            <div>
              <b>Clúster</b>
              <span>{data.cluster || "—"}</span>
            </div>
            <div>
              <b>Horizonte</b>
              <span>{data.ttm_band_label || "—"}</span>
            </div>
            <div>
              <b>Producto</b>
              <span>{data.product_level || "Ficha"}</span>
            </div>
          </div>

          {entries.map(([key, value], index) => (
            <article key={key} className="iets-dossier-block">
              <h4>
                <span className="iets-dossier-num-inline">0{index + 1}</span>
                {labels[key] || key}
              </h4>
              {String(value)
                .split("\n")
                .filter((p) => p.trim())
                .map((para, i) => (
                  <p key={`${key}-${i}`}>{para}</p>
                ))}
            </article>
          ))}

          <section className="iets-dossier-block">
            <h4>Ensayos clínicos asociados</h4>
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
              Descargar ficha técnica
            </Button>
            <Link to="/expedientes">Volver al buscador</Link>
          </div>
        </article>
      )}
    </PublicShell>
  );
}
