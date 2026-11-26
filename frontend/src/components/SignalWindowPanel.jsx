import { useCallback, useEffect, useMemo, useState } from "react";
import api, { apiError } from "../api/client";
import { Card, SectionTitle } from "./Card";
import Button from "./Button";
import Badge from "./Badge";
import ConfirmDialog from "./ConfirmDialog";
import { Input } from "./Field";
import { t, tr, ts } from "../i18n";

const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));

/**
 * Vigencia de las señales por año de publicación. Por defecto entran todos los
 * años. Se fija de manera general o para fuentes específicas, se revisa qué
 * señales de la bandeja quedan fuera y, si se confirma, se pasan a Descartadas
 * (se pueden restaurar).
 */
export default function SignalWindowPanel({ toast, canManage = true }) {
  const [data, setData] = useState(null);
  const [general, setGeneral] = useState({ year_from: "", year_to: "", keep_undated: true });
  const [own, setOwn] = useState({ year_from: "", year_to: "" });
  const [picked, setPicked] = useState(() => new Set());
  const [filter, setFilter] = useState("");
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState("");
  const [confirm, setConfirm] = useState(false);

  const take = (d) => {
    setData(d);
    setGeneral({ year_from: d.year_from ?? "", year_to: d.year_to ?? "", keep_undated: d.keep_undated });
  };

  const load = useCallback(async () => {
    try {
      const { data: d } = await api.get("/intelligence/window");
      take(d);
    } catch (e) {
      toast?.error(apiError(e, t("No se pudo leer la vigencia de las señales")));
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (key, call, ok) => {
    setBusy(key);
    try {
      const result = await call();
      ok?.(result.data);
    } catch (e) {
      toast?.error(apiError(e, t("No se pudo completar la acción")));
    } finally {
      setBusy("");
    }
  };

  const saveGeneral = () =>
    run(
      "general",
      () => api.put("/intelligence/window", { scope: "all", year_from: num(general.year_from), year_to: num(general.year_to), keep_undated: general.keep_undated }),
      (d) => {
        take(d);
        setPreview(null);
        toast?.success(t("Vigencia general guardada: {label}. Rige para las capturas nuevas.", { label: ts(d.label) }));
      }
    );
  const allYears = () =>
    run("general", () => api.put("/intelligence/window", { scope: "all", year_from: null, year_to: null, keep_undated: true }), (d) => {
      take(d);
      setPreview(null);
      toast?.success(t("Vigencia general: todos los años."));
    });
  const saveOwn = (clear = false) =>
    run(
      "own",
      () => api.put("/intelligence/window", { scope: "sources", source_ids: [...picked], year_from: clear ? null : num(own.year_from), year_to: clear ? null : num(own.year_to) }),
      (d) => {
        take(d);
        setPreview(null);
        toast?.success(
          clear
            ? t("{n} fuente(s) vuelven a la vigencia general.", { n: picked.size })
            : t("Vigencia propia guardada en {n} fuente(s).", { n: picked.size })
        );
        setPicked(new Set());
      }
    );
  const check = () => run("preview", () => api.post("/intelligence/window/preview", { source_ids: [...picked] }), setPreview);
  const apply = () =>
    run("apply", () => api.post("/intelligence/window/apply", { source_ids: [...picked] }), (d) => {
      setConfirm(false);
      setPreview(null);
      toast?.success(t("{n} señal(es) pasaron a Descartadas por estar fuera de la vigencia. Se pueden restaurar desde la Bandeja de entrada.", { n: d.affected }));
      load();
    });

  const sources = useMemo(() => {
    const text = filter.trim().toLowerCase();
    return (data?.sources || []).filter((s) => !text || s.title.toLowerCase().includes(text));
  }, [data, filter]);
  const toggle = (id) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (!data) return null;
  const dated = data.years.filter((y) => y.year !== null);
  const undated = data.years.find((y) => y.year === null)?.signals || 0;
  const top = Math.max(1, ...dated.map((y) => y.signals));

  return (
    <Card data-testid="signal-window">
      <SectionTitle hint={t("Rango de años de publicación que el sistema acepta para las señales. Vacío significa todos los años.")}>
        {t("Vigencia de las señales por año")}
      </SectionTitle>
      <p style={{ fontSize: 13, color: "#475569", marginTop: 0 }}>
        {tr(
          "Por defecto entran las señales de <b>todos los años</b>. Aquí puede limitar el rango para todas las fuentes o darle un rango propio a algunas. El año sale de la fecha de publicación de la señal. Una señal publicada fuera del rango no entra a la bandeja en las capturas siguientes.",
          null,
          { b: (c) => <strong>{c}</strong> }
        )}
      </p>
      <div className="fb-toolbar" style={{ marginBottom: 10 }} data-testid="window-summary">
        <Badge tone={data.year_from || data.year_to ? "warning" : "ok"}>{t("Vigencia general: {label}", { label: ts(data.label) })}</Badge>
        <Badge tone="viewer">{t("{n} fuente(s) con vigencia propia", { n: data.own_sources })}</Badge>
        <Badge tone="viewer">{data.keep_undated ? t("Las señales sin fecha se conservan") : t("Las señales sin fecha quedan fuera")}</Badge>
      </div>

      {dated.length > 0 && (
        <div style={{ marginBottom: 14 }} data-testid="window-years">
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>
            {t("Señales de la bandeja por año de publicación ({undated} sin fecha):", { undated })}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "flex-end", overflowX: "auto", paddingBottom: 4 }}>
            {dated.map((y) => (
              <div key={y.year} style={{ textAlign: "center", fontSize: 11, color: "#475569", minWidth: 34 }} title={t("{year}: {n} señal(es)", { year: y.year, n: y.signals })}>
                <div style={{ fontWeight: 600 }}>{y.signals}</div>
                <div style={{ height: Math.max(3, Math.round((48 * y.signals) / top)), background: "#1D4ED8", borderRadius: "3px 3px 0 0" }} />
                <div>{y.year}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <h4 className="source-section-title">{t("Vigencia general (todas las fuentes)")}</h4>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "0 16px", alignItems: "end" }}>
        <Input id="window-from" type="number" label={t("Desde el año")} placeholder={t("Todos")} min={data.min_year} max={data.max_year} disabled={!canManage}
          value={general.year_from} onChange={(e) => setGeneral({ ...general, year_from: e.target.value })} />
        <Input id="window-to" type="number" label={t("Hasta el año")} placeholder={t("Todos")} min={data.min_year} max={data.max_year} disabled={!canManage}
          value={general.year_to} onChange={(e) => setGeneral({ ...general, year_to: e.target.value })} />
        <label className="catalog-check" style={{ margin: "6px 0 14px" }}>
          <input type="checkbox" checked={general.keep_undated} disabled={!canManage} data-testid="window-keep-undated"
            onChange={(e) => setGeneral({ ...general, keep_undated: e.target.checked })} />
          <span>{t("Conservar las señales sin fecha de publicación")}</span>
        </label>
      </div>
      <div className="fb-toolbar" style={{ marginBottom: 14 }}>
        <Button size="sm" onClick={saveGeneral} loading={busy === "general"} disabled={!canManage} data-testid="window-save">{t("Guardar vigencia general")}</Button>
        <Button size="sm" variant="secondary" onClick={allYears} loading={busy === "general"} disabled={!canManage} data-testid="window-all-years">{t("Todos los años")}</Button>
      </div>

      <h4 className="source-section-title">{t("Vigencia propia de fuentes específicas")}</h4>
      <p className="source-section-note">
        {t("Marque las fuentes y asígneles un rango. Una fuente con vigencia propia no usa la general. Sin marcar ninguna, la revisión de abajo aplica a todas.")}
      </p>
      <div className="fb-toolbar" style={{ alignItems: "flex-end", marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <Input id="window-filter" label={t("Buscar fuente")} placeholder={t("Nombre de la fuente")} value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        <div style={{ width: 130 }}>
          <Input id="window-own-from" type="number" label={t("Desde")} placeholder={t("Todos")} value={own.year_from} onChange={(e) => setOwn({ ...own, year_from: e.target.value })} disabled={!canManage} />
        </div>
        <div style={{ width: 130 }}>
          <Input id="window-own-to" type="number" label={t("Hasta")} placeholder={t("Todos")} value={own.year_to} onChange={(e) => setOwn({ ...own, year_to: e.target.value })} disabled={!canManage} />
        </div>
      </div>
      <div className="fb-toolbar" style={{ marginBottom: 8 }}>
        <Button size="sm" onClick={() => saveOwn(false)} loading={busy === "own"} disabled={!canManage || picked.size === 0 || (!own.year_from && !own.year_to)} data-testid="window-save-own">
          {t("Aplicar a {n} fuente(s)", { n: picked.size })}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => saveOwn(true)} loading={busy === "own"} disabled={!canManage || picked.size === 0} data-testid="window-clear-own">
          {t("Volver a la vigencia general")}
        </Button>
        {picked.size > 0 && (
          <Button size="sm" variant="secondary" onClick={() => setPicked(new Set())}>{t("Quitar selección")}</Button>
        )}
      </div>
      <div style={{ maxHeight: 260, overflow: "auto", border: "1px solid #e2e8f0", borderRadius: 8 }}>
        <table className="data-table" style={{ width: "100%", fontSize: 13 }} data-testid="window-sources">
          <thead>
            <tr>
              <th style={{ width: 34 }} />
              <th style={{ textAlign: "left" }}>{t("Fuente")}</th>
              <th>{t("Vigencia")}</th>
              <th>{t("Señales en bandeja")}</th>
              <th>{t("Años vistos")}</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.source_id}>
                <td style={{ textAlign: "center" }}>
                  <input type="checkbox" checked={picked.has(s.source_id)} onChange={() => toggle(s.source_id)} aria-label={t("Seleccionar {title}", { title: s.title })} />
                </td>
                <td>{s.title}</td>
                <td style={{ textAlign: "center" }}>
                  <Badge tone={s.own ? "warning" : "viewer"}>{s.own ? t("Propia: {label}", { label: ts(s.label) }) : t("General: {label}", { label: ts(s.label) })}</Badge>
                </td>
                <td style={{ textAlign: "center" }}>{s.signals}</td>
                <td style={{ textAlign: "center" }}>
                  {s.first_year ? (s.first_year === s.last_year ? s.first_year : t("{from} a {to}", { from: s.first_year, to: s.last_year })) : "-"}
                  {s.undated ? " " + t("({n} sin fecha)", { n: s.undated }) : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h4 className="source-section-title">{t("Revisar lo ya capturado")}</h4>
      <p className="source-section-note">
        {picked.size
          ? t("Muestra cuántas señales de la bandeja quedan fuera de la vigencia en las {n} fuente(s) marcadas. No cambia nada hasta que usted lo confirme.", { n: picked.size })
          : t("Muestra cuántas señales de la bandeja quedan fuera de la vigencia en todas las fuentes. No cambia nada hasta que usted lo confirme.")}
      </p>
      <div className="fb-toolbar" style={{ marginBottom: 8 }}>
        <Button size="sm" variant="secondary" onClick={check} loading={busy === "preview"} data-testid="window-preview">{t("Revisar la bandeja")}</Button>
        {preview && preview.outside > 0 && canManage && (
          <Button size="sm" variant="danger" onClick={() => setConfirm(true)} data-testid="window-apply">
            {t("Pasar {n} a Descartadas", { n: preview.outside })}
          </Button>
        )}
      </div>
      {preview && (
        <div data-testid="window-preview-result" style={{ fontSize: 13 }}>
          {preview.open ? (
            <p style={{ color: "#64748b" }}>{t("La vigencia está abierta a todos los años: ninguna señal queda fuera.")}</p>
          ) : preview.outside === 0 ? (
            <p style={{ color: "#166534" }}>{t("Las {n} señales revisadas están dentro de la vigencia.", { n: preview.inbox })}</p>
          ) : (
            <>
              <p>
                {tr(
                  "<b>{outside}</b> de {inbox} señales de la bandeja quedan fuera de la vigencia:",
                  { outside: preview.outside, inbox: preview.inbox },
                  { b: (c) => <strong>{c}</strong> }
                )}
              </p>
              <ul style={{ paddingLeft: 18, margin: 0 }}>
                {preview.sources.map((row) => (
                  <li key={row.source_id ?? "sin"} style={{ marginBottom: 4 }}>
                    {tr(
                      "<b>{source}</b>: {count} (vigencia {window})",
                      { source: <>{row.source_title}</>, count: row.count, window: <>{ts(row.window)}</> },
                      { b: (c) => <strong>{c}</strong> }
                    )}
                    <div style={{ color: "#64748b", fontSize: 12 }}>
                      {row.sample.map((i) => `${i.name.slice(0, 50)} (${i.year ?? t("sin fecha")})`).join(" · ")}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirm}
        title={t("Pasar a Descartadas las señales fuera de la vigencia")}
        message={t("{n} señal(es) de la bandeja pasarán a Descartadas con el motivo «Fuera de la vigencia configurada». No se borran: puede restaurarlas desde Bandeja de entrada › Descartadas.", { n: preview?.outside || 0 })}
        confirmLabel={t("Pasar a Descartadas")}
        loading={busy === "apply"}
        onConfirm={apply}
        onClose={() => setConfirm(false)}
      />
    </Card>
  );
}
