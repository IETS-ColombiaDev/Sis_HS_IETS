import { useCallback, useEffect, useRef, useState } from "react";
import api, { apiError } from "../api/client";
import { downloadFromApi } from "../utils/download";
import { Card, SectionTitle } from "./Card";
import Button from "./Button";
import Badge from "./Badge";
import Icon from "./Icon";
import { Input } from "./Field";
import { t, intlLocale } from "../i18n";

function fmtDate(value) {
  return value ? new Date(value).toLocaleDateString(intlLocale()) : t("nunca");
}

const ENGINE = { sitemap: t("Mapa del sitio"), base_conocimiento: t("Base##conocimiento"), brave_api: "Brave", searxng: "SearXNG" };

/**
 * Base de conocimiento de busqueda: paginas utiles de cada fuente que la
 * vigilancia visita sin consultar buscadores (que desde la nube bloquean).
 * La comparten todas las corridas y todos los ciclos. Aqui se consulta, se
 * descarga como paquete y se carga un paquete armado en otro equipo.
 */
export default function SearchKnowledgePanel({ toast }) {
  const [data, setData] = useState(null);
  const [coverage, setCoverage] = useState(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState("");
  const fileRef = useRef(null);
  const seq = useRef(0);

  const load = useCallback(
    async (text = "") => {
      const mine = ++seq.current;
      try {
        const [{ data: d }, { data: c }] = await Promise.all([
          api.get("/search-knowledge", { params: { q: text, limit: 30 } }),
          api.get("/search-knowledge/coverage"),
        ]);
        if (mine !== seq.current) return;
        setData(d);
        setCoverage(c);
      } catch (e) {
        toast?.error(apiError(e, t("No se pudo leer la base de conocimiento de búsqueda")));
      }
    },
    [toast]
  );

  useEffect(() => {
    load("");
  }, [load]);

  const submit = (e) => {
    e.preventDefault();
    load(q.trim());
  };

  const exportPack = async () => {
    setBusy("export");
    try {
      await downloadFromApi(api, "/search-knowledge/export", "base_busqueda_eh.json");
    } catch (e) {
      toast?.error(apiError(e, t("No se pudo descargar el paquete")));
    } finally {
      setBusy("");
    }
  };

  const importPack = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy("import");
    try {
      const pack = JSON.parse(await file.text());
      const { data: out } = await api.post("/search-knowledge/import", pack);
      toast?.success(t("Paquete cargado: {added} página(s) nuevas y {updated} ya conocidas. No se borró nada.", { added: out.added, updated: out.updated }));
      load(q.trim());
    } catch (e) {
      toast?.error(e instanceof SyntaxError ? t("El archivo no es un paquete JSON válido.") : apiError(e, t("No se pudo cargar el paquete")));
    } finally {
      setBusy("");
    }
  };

  const st = data?.stats;
  return (
    <Card padding={16} style={{ marginBottom: 16 }} data-testid="search-knowledge">
      <SectionTitle
        right={
          <div className="fb-toolbar">
            <Button size="sm" variant="secondary" onClick={exportPack} loading={busy === "export"} data-testid="knowledge-export">
              <Icon name="doc" size={14} /> {t("Descargar paquete")}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()} loading={busy === "import"} data-testid="knowledge-import">
              {t("Cargar paquete")}
            </Button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={importPack} data-testid="knowledge-file" />
          </div>
        }
      >
        {t("Base de conocimiento de búsqueda")}
      </SectionTitle>
      <p style={{ fontSize: 13, color: "#475569", marginTop: 0 }}>
        {t(
          "Páginas de cada fuente que ya se encontraron y que la vigilancia visita sin consultar buscadores. Sirve a todas las corridas y a todos los ciclos, y se respalda con la base del sistema. Una página que no aporta señales en {visitas} visitas deja de visitarse y se vuelve a probar a los {dias} días.",
          { visitas: st?.silent_after_visits ?? 2, dias: st?.retry_silent_days ?? 45 }
        )}
      </p>
      {st && (
        <div className="fb-toolbar" style={{ marginBottom: 10 }} data-testid="knowledge-stats">
          <Badge tone="ok">{t("{n} página(s)", { n: st.pages })}</Badge>
          <Badge tone="viewer">{t("{n} sitio(s)", { n: st.domains })}</Badge>
          <Badge tone="ok">{t("{n} han aportado señales", { n: st.with_signals })}</Badge>
          <Badge tone="warning">{t("{n} sin señal (en pausa)", { n: st.silent })}</Badge>
          {coverage ? (
            <Badge tone="viewer">
              {t("{n} de {total} fuentes activas con páginas conocidas", { n: coverage.covered, total: coverage.total })}
            </Badge>
          ) : null}
          <span style={{ fontSize: 12, color: "#64748b" }}>{t("Última actualización: {fecha}", { fecha: fmtDate(st.last_seen_at) })}</span>
        </div>
      )}
      <form onSubmit={submit} className="fb-toolbar" style={{ alignItems: "flex-end", marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <Input
            id="knowledge-q"
            label={t("Consultar la base")}
            placeholder={t("Por ejemplo: terapia génica, pipeline, nice.org.uk")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Button size="sm" type="submit" data-testid="knowledge-search">
          <Icon name="search" size={14} /> {t("Buscar")}
        </Button>
      </form>
      {data && data.items.length === 0 ? (
        <p style={{ fontSize: 13, color: "#64748b" }} data-testid="knowledge-empty">
          {st?.pages ? t("Ninguna página coincide con esa consulta.") : t("La base está vacía. Se llena con el paquete del sistema, con una vigilancia o cargando un paquete.")}
        </p>
      ) : null}
      {data && data.items.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table className="data-table" style={{ width: "100%", fontSize: 13 }} data-testid="knowledge-table">
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>{t("Página")}</th>
                <th style={{ textAlign: "left" }}>{t("Sitio")}</th>
                <th>{t("Origen")}</th>
                <th>{t("Visitas")}</th>
                <th>{t("Señales")}</th>
                <th>{t("Estado")}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((row) => (
                <tr key={row.id}>
                  <td>
                    <a href={row.url} target="_blank" rel="noopener noreferrer">
                      {row.title || row.url.replace(/^https?:\/\//, "").slice(0, 90)}
                    </a>
                    {row.source_title ? <div style={{ color: "#64748b", fontSize: 12 }}>{row.source_title}</div> : null}
                  </td>
                  <td>{row.domain}</td>
                  <td style={{ textAlign: "center" }}>{ENGINE[row.engine] || row.engine || "-"}</td>
                  <td style={{ textAlign: "center" }}>{row.visits}</td>
                  <td style={{ textAlign: "center" }}>{row.signals}</td>
                  <td style={{ textAlign: "center" }}>
                    <Badge tone={row.status === "activa" ? "ok" : "warning"}>{row.status === "activa" ? t("Activa") : t("Sin señal")}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Card>
  );
}
