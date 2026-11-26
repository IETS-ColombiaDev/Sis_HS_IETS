import { useMemo, useState } from "react";
import api, { apiError } from "../api/client";
import Button from "./Button";
import HintButton from "./HintButton";
import Icon from "./Icon";
import Modal from "./Modal";
import { t, tr, ts } from "../i18n";
import "./manual-review.css";

/**
 * Depurar ruido de captura (auditoría del Módulo 0).
 *
 * Simula primero: muestra cuántas señales de la bandeja el filtro vigente ya no
 * dejaría entrar (texto de menús, leyendas, páginas índice, empleos, repetidas por
 * varios enlaces de una organización, productos de venta libre) y por qué. Al
 * confirmar pasan a «Descartadas», de donde se pueden restaurar. No borra nada.
 */
export default function NoiseCleanup({ onDone, toast }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [preview, setPreview] = useState(null);

  const simulate = async () => {
    setOpen(true);
    setPreview(null);
    setBusy("preview");
    try {
      const { data } = await api.post("/ingest/reprocess", null, { params: { target: "ruido" } });
      setPreview(data?.[0] || { changed: 0, changes: [] });
    } catch (e) {
      toast?.error(apiError(e, t("No se pudo simular la depuración")));
      setOpen(false);
    } finally {
      setBusy("");
    }
  };

  const apply = async () => {
    setBusy("apply");
    try {
      const { data } = await api.post("/ingest/reprocess", null, { params: { target: "ruido", apply: true } });
      const n = data?.[0]?.changed || 0;
      toast?.success(t("{n} señal(es) pasaron a Descartadas. Puede restaurarlas desde esa pestaña.", { n }));
      setOpen(false);
      onDone?.();
    } catch (e) {
      toast?.error(apiError(e, t("No se pudo aplicar la depuración")));
    } finally {
      setBusy("");
    }
  };

  const groups = useMemo(() => {
    const map = new Map();
    for (const c of preview?.changes || []) {
      if (!map.has(c.motivo)) map.set(c.motivo, []);
      map.get(c.motivo).push(c);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [preview]);

  return (
    <>
      <HintButton
        variant="secondary"
        hint={t("Revisa las señales sin asignar con el filtro de captura vigente y propone pasar a Descartadas las que no son tecnologías (texto de menús, leyendas, páginas índice, empleos, repetidas). Primero muestra la lista; no cambia nada hasta que confirme.")}
        onClick={simulate}
        data-testid="noise-cleanup-open"
      >
        <Icon name="filter" size={16} /> {t("Depurar ruido")}
      </HintButton>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t("Depurar ruido de captura")}
        width={760}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy === "apply"}>
              {t("Cancelar")}
            </Button>
            <Button onClick={apply} loading={busy === "apply"} disabled={!preview?.changed} data-testid="noise-cleanup-apply">
              {t("Pasar {n} a Descartadas", { n: preview?.changed || 0 })}
            </Button>
          </>
        }
      >
        {busy === "preview" || !preview ? (
          <p className="mr-intro">{t("Revisando las señales de la bandeja…")}</p>
        ) : preview.changed === 0 ? (
          <div className="mr-empty" data-testid="noise-cleanup-empty">
            {t("La bandeja está limpia: ninguna señal sin asignar es ruido de captura.")}
          </div>
        ) : (
          <div className="mr-panel" data-testid="noise-cleanup-preview">
            <p className="mr-intro">
              {tr(
                "<b>{n}</b> señal(es) sin asignar no son tecnologías según el filtro de captura vigente. Pasarán a <b>Descartadas</b> (no se borran y se pueden restaurar). Queda registro en la bitácora.",
                { n: preview.changed },
                { b: (c) => <strong>{c}</strong> }
              )}
            </p>
            {groups.map(([reason, items]) => (
              <details key={reason} className="mr-item" style={{ padding: "8px 12px" }}>
                <summary style={{ cursor: "pointer", fontWeight: 600 }}>
                  {items.length} · {ts(reason)}
                </summary>
                <ul className="mr-steps" style={{ marginTop: 6 }}>
                  {items.slice(0, 12).map((c) => (
                    <li key={c.technology_id}>
                      {c.titulo} <span style={{ color: "#64748b" }}>- {c.fuente}</span>
                    </li>
                  ))}
                  {items.length > 12 && <li>{t("… y {n} más.", { n: items.length - 12 })}</li>}
                </ul>
              </details>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}
