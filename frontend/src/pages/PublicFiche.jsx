import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "axios";
import PublicShell from "../components/PublicShell";
import Button from "../components/Button";
import { t, ts } from "../i18n";

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
        setError(typeof detail === "string" ? ts(detail) : t("Esta ficha no está disponible en la consulta pública."));
      });
  }, [id]);

  const labels = data?.field_labels || {};
  const entries = Object.entries(data?.body || {}).filter(([, value]) => String(value || "").trim());

  return (
    <PublicShell
      kicker={t("Ficha pública")}
      title={data?.title || (error ? t("Expediente no disponible") : t("Cargando…"))}
      lead={
        data
          ? [data.inn_name, ts(data.cluster), ts(data.ttm_band_label)].filter(Boolean).join(" · ")
          : undefined
      }
    >
      {error && <p className="public-submit-error">{error}</p>}

      {data && (
        <article className="iets-dossier is-public">
          <header className="iets-dossier-mast">
            <div className="iets-dossier-brand">IETS</div>
            <div>
              <p className="iets-dossier-kicker">{t("Consulta pública · Escaneo de horizonte")}</p>
              <h2>{data.title}</h2>
              <p className="iets-dossier-sub">
                {[data.commercial_name, data.inn_name && t("DCI {name}", { name: data.inn_name }), data.manufacturer]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          </header>

          <div className="public-fiche-meta">
            <div>
              <b>{t("Clúster")}</b>
              <span>{ts(data.cluster) || "-"}</span>
            </div>
            <div>
              <b>{t("Horizonte")}</b>
              <span>{ts(data.ttm_band_label) || "-"}</span>
            </div>
            <div>
              <b>{t("Producto")}</b>
              <span>{ts(data.product_level) || t("Ficha")}</span>
            </div>
          </div>

          {entries.map(([key, value], index) => (
            <article key={key} className="iets-dossier-block">
              <h4>
                <span className="iets-dossier-num-inline">0{index + 1}</span>
                {ts(labels[key]) || key}
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
            <h4>{t("Ensayos clínicos asociados")}</h4>
            {(data.nct_ids || []).length === 0 ? (
              <p>{t("Sin identificadores NCT registrados.")}</p>
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
              onClick={() => window.open(`/api/public/technologies/${id}/export?format=pdf`, "_blank", "noopener")}
            >
              {t("Descargar ficha técnica")}
            </Button>
            <Button
              variant="outline"
              onClick={() => window.open(`/api/public/technologies/${id}/export`, "_blank", "noopener")}
            >
              {t("Ver versión web")}
            </Button>
            <Link to="/expedientes">{t("Volver al buscador")}</Link>
          </div>
        </article>
      )}
    </PublicShell>
  );
}
