import { useCallback, useEffect, useMemo, useState } from "react";
import api, { apiError } from "../api/client";
import { Card, SectionTitle } from "./Card";
import Button from "./Button";
import Badge from "./Badge";
import ConfirmDialog from "./ConfirmDialog";
import { Input } from "./Field";

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
      toast?.error(apiError(e, "No se pudo leer la vigencia de las señales"));
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
      toast?.error(apiError(e, "No se pudo completar la acción"));
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
        toast?.success(`Vigencia general guardada: ${d.label}. Rige para las capturas nuevas.`);
      }
    );
  const allYears = () =>
    run("general", () => api.put("/intelligence/window", { scope: "all", year_from: null, year_to: null, keep_undated: true }), (d) => {
      take(d);
      setPreview(null);
      toast?.success("Vigencia general: todos los años.");
    });
  const saveOwn = (clear = false) =>
    run(
      "own",
      () => api.put("/intelligence/window", { scope: "sources", source_ids: [...picked], year_from: clear ? null : num(own.year_from), year_to: clear ? null : num(own.year_to) }),
      (d) => {
        take(d);
        setPreview(null);
        toast?.success(clear ? `${picked.size} fuente(s) vuelven a la vigencia general.` : `Vigencia propia guardada en ${picked.size} fuente(s).`);
        setPicked(new Set());
      }
    );
  const check = () => run("preview", () => api.post("/intelligence/window/preview", { source_ids: [...picked] }), setPreview);
  const apply = () =>
    run("apply", () => api.post("/intelligence/window/apply", { source_ids: [...picked] }), (d) => {
      setConfirm(false);
      setPreview(null);
      toast?.success(`${d.affected} señal(es) pasaron a Descartadas por estar fuera de la vigencia. Se pueden restaurar desde la Bandeja de entrada.`);
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
      <SectionTitle hint="Rango de años de publicación que el sistema acepta para las señales. Vacío significa todos los años.">
        Vigencia de las señales por año
      </SectionTitle>
      <p style={{ fontSize: 13, color: "#475569", marginTop: 0 }}>
        Por defecto entran las señales de <strong>todos los años</strong>. Aquí puede limitar el rango para todas las fuentes o darle un
        rango propio a algunas. El año sale de la fecha de publicación de la señal. Una señal publicada fuera del rango no entra a la
        bandeja en las capturas siguientes.
      </p>
      <div className="fb-toolbar" style={{ marginBottom: 10 }} data-testid="window-summary">
        <Badge tone={data.year_from || data.year_to ? "warning" : "ok"}>Vigencia general: {data.label}</Badge>
        <Badge tone="viewer">{data.own_sources} fuente(s) con vigencia propia</Badge>
        <Badge tone="viewer">{data.keep_undated ? "Las señales sin fecha se conservan" : "Las señales sin fecha quedan fuera"}</Badge>
      </div>

      {dated.length > 0 && (
        <div style={{ marginBottom: 14 }} data-testid="window-years">
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>
            Señales de la bandeja por año de publicación ({undated} sin fecha):
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "flex-end", overflowX: "auto", paddingBottom: 4 }}>
            {dated.map((y) => (
              <div key={y.year} style={{ textAlign: "center", fontSize: 11, color: "#475569", minWidth: 34 }} title={`${y.year}: ${y.signals} señal(es)`}>
                <div style={{ fontWeight: 600 }}>{y.signals}</div>
                <div style={{ height: Math.max(3, Math.round((48 * y.signals) / top)), background: "#4F46E5", borderRadius: "3px 3px 0 0" }} />
                <div>{y.year}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <h4 className="source-section-title">Vigencia general (todas las fuentes)</h4>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "0 16px", alignItems: "end" }}>
        <Input id="window-from" type="number" label="Desde el año" placeholder="Todos" min={data.min_year} max={data.max_year} disabled={!canManage}
          value={general.year_from} onChange={(e) => setGeneral({ ...general, year_from: e.target.value })} />
        <Input id="window-to" type="number" label="Hasta el año" placeholder="Todos" min={data.min_year} max={data.max_year} disabled={!canManage}
          value={general.year_to} onChange={(e) => setGeneral({ ...general, year_to: e.target.value })} />
        <label className="catalog-check" style={{ margin: "6px 0 14px" }}>
          <input type="checkbox" checked={general.keep_undated} disabled={!canManage} data-testid="window-keep-undated"
            onChange={(e) => setGeneral({ ...general, keep_undated: e.target.checked })} />
          <span>Conservar las señales sin fecha de publicación</span>
        </label>
      </div>
      <div className="fb-toolbar" style={{ marginBottom: 14 }}>
        <Button size="sm" onClick={saveGeneral} loading={busy === "general"} disabled={!canManage} data-testid="window-save">Guardar vigencia general</Button>
        <Button size="sm" variant="secondary" onClick={allYears} loading={busy === "general"} disabled={!canManage} data-testid="window-all-years">Todos los años</Button>
      </div>

      <h4 className="source-section-title">Vigencia propia de fuentes específicas</h4>
      <p className="source-section-note">
        Marque las fuentes y asígneles un rango. Una fuente con vigencia propia no usa la general. Sin marcar ninguna, la revisión de
        abajo aplica a todas.
      </p>
      <div className="fb-toolbar" style={{ alignItems: "flex-end", marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <Input id="window-filter" label="Buscar fuente" placeholder="Nombre de la fuente" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        <div style={{ width: 130 }}>
          <Input id="window-own-from" type="number" label="Desde" placeholder="Todos" value={own.year_from} onChange={(e) => setOwn({ ...own, year_from: e.target.value })} disabled={!canManage} />
        </div>
        <div style={{ width: 130 }}>
          <Input id="window-own-to" type="number" label="Hasta" placeholder="Todos" value={own.year_to} onChange={(e) => setOwn({ ...own, year_to: e.target.value })} disabled={!canManage} />
        </div>
      </div>
      <div className="fb-toolbar" style={{ marginBottom: 8 }}>
        <Button size="sm" onClick={() => saveOwn(false)} loading={busy === "own"} disabled={!canManage || picked.size === 0 || (!own.year_from && !own.year_to)} data-testid="window-save-own">
          Aplicar a {picked.size} fuente(s)
        </Button>
        <Button size="sm" variant="secondary" onClick={() => saveOwn(true)} loading={busy === "own"} disabled={!canManage || picked.size === 0} data-testid="window-clear-own">
          Volver a la vigencia general
        </Button>
        {picked.size > 0 && (
          <Button size="sm" variant="secondary" onClick={() => setPicked(new Set())}>Quitar selección</Button>
        )}
      </div>
      <div style={{ maxHeight: 260, overflow: "auto", border: "1px solid #e2e8f0", borderRadius: 8 }}>
        <table className="data-table" style={{ width: "100%", fontSize: 13 }} data-testid="window-sources">
          <thead>
            <tr>
              <th style={{ width: 34 }} />
              <th style={{ textAlign: "left" }}>Fuente</th>
              <th>Vigencia</th>
              <th>Señales en bandeja</th>
              <th>Años vistos</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.source_id}>
                <td style={{ textAlign: "center" }}>
                  <input type="checkbox" checked={picked.has(s.source_id)} onChange={() => toggle(s.source_id)} aria-label={`Seleccionar ${s.title}`} />
                </td>
                <td>{s.title}</td>
                <td style={{ textAlign: "center" }}>
                  <Badge tone={s.own ? "warning" : "viewer"}>{s.own ? `Propia: ${s.label}` : `General: ${s.label}`}</Badge>
                </td>
                <td style={{ textAlign: "center" }}>{s.signals}</td>
                <td style={{ textAlign: "center" }}>
                  {s.first_year ? (s.first_year === s.last_year ? s.first_year : `${s.first_year} a ${s.last_year}`) : "-"}
                  {s.undated ? ` (${s.undated} sin fecha)` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h4 className="source-section-title">Revisar lo ya capturado</h4>
      <p className="source-section-note">
        Muestra cuántas señales de la bandeja quedan fuera de la vigencia {picked.size ? `en las ${picked.size} fuente(s) marcadas` : "en todas las fuentes"}.
        No cambia nada hasta que usted lo confirme.
      </p>
      <div className="fb-toolbar" style={{ marginBottom: 8 }}>
        <Button size="sm" variant="secondary" onClick={check} loading={busy === "preview"} data-testid="window-preview">Revisar la bandeja</Button>
        {preview && preview.outside > 0 && canManage && (
          <Button size="sm" variant="danger" onClick={() => setConfirm(true)} data-testid="window-apply">
            Pasar {preview.outside} a Descartadas
          </Button>
        )}
      </div>
      {preview && (
        <div data-testid="window-preview-result" style={{ fontSize: 13 }}>
          {preview.open ? (
            <p style={{ color: "#64748b" }}>La vigencia está abierta a todos los años: ninguna señal queda fuera.</p>
          ) : preview.outside === 0 ? (
            <p style={{ color: "#166534" }}>Las {preview.inbox} señales revisadas están dentro de la vigencia.</p>
          ) : (
            <>
              <p>
                <strong>{preview.outside}</strong> de {preview.inbox} señales de la bandeja quedan fuera de la vigencia:
              </p>
              <ul style={{ paddingLeft: 18, margin: 0 }}>
                {preview.sources.map((row) => (
                  <li key={row.source_id ?? "sin"} style={{ marginBottom: 4 }}>
                    <strong>{row.source_title}</strong>: {row.count} (vigencia {row.window})
                    <div style={{ color: "#64748b", fontSize: 12 }}>
                      {row.sample.map((i) => `${i.name.slice(0, 50)} (${i.year ?? "sin fecha"})`).join(" · ")}
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
        title="Pasar a Descartadas las señales fuera de la vigencia"
        message={`${preview?.outside || 0} señal(es) de la bandeja pasarán a Descartadas con el motivo «Fuera de la vigencia configurada». No se borran: puede restaurarlas desde Bandeja de entrada › Descartadas.`}
        confirmLabel="Pasar a Descartadas"
        loading={busy === "apply"}
        onConfirm={apply}
        onClose={() => setConfirm(false)}
      />
    </Card>
  );
}
