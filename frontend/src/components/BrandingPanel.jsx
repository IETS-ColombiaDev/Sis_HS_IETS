import { useRef, useState } from "react";
import api, { apiError } from "../api/client";
import { BrandMark, useBranding } from "../branding/BrandingContext";
import Button from "./Button";
import Card from "./Card";
import ConfirmDialog from "./ConfirmDialog";
import Icon from "./Icon";
import { t, tr } from "../i18n";

const MAX_BYTES = 400 * 1024;
const TYPES = ["image/png", "image/jpeg", "image/webp"];

/** Configuración › Identidad institucional: cargar, reemplazar o quitar el logo. */
export default function BrandingPanel({ toast }) {
  const { logo, apply } = useBranding();
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [dragging, setDragging] = useState(false);

  const upload = async (file) => {
    if (!file) return;
    if (!TYPES.includes(file.type)) {
      toast.error(t("Formato no admitido. Use una imagen PNG, JPG o WebP."));
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error(t("El logo supera el máximo de 400 KB. Reduzca la imagen e intente de nuevo."));
      return;
    }
    const body = new FormData();
    body.append("file", file);
    setBusy(true);
    try {
      const { data } = await api.put("/config/branding", body);
      apply(data);
      toast.success(t("Logo actualizado. Ya se ve en el menú, el ingreso y las pantallas públicas."));
    } catch (err) {
      toast.error(apiError(err, t("No se pudo cargar el logo")));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const { data } = await api.delete("/config/branding");
      apply(data);
      toast.success(t("Logo quitado. Se muestra de nuevo el distintivo del sistema."));
      setConfirmRemove(false);
    } catch (err) {
      toast.error(apiError(err, t("No se pudo quitar el logo")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card padding={22} data-testid="branding-panel">
      <div className="branding-grid">
        <div>
          <h3 className="branding-title">{t("Logo institucional")}</h3>
          <p className="branding-text">
            {t("Se muestra en el menú lateral, en la pantalla de ingreso y en las pantallas públicas. Si no hay logo se usa el distintivo del sistema.")}
          </p>

          <div
            className={`branding-drop${dragging ? " is-dragging" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              upload(e.dataTransfer.files?.[0]);
            }}
          >
            <Icon name="doc" size={22} />
            <div>
              <strong>{t("Arrastre aquí la imagen o elija un archivo")}</strong>
              <span>{t("PNG, JPG o WebP · máximo 400 KB · mejor con fondo transparente y forma cuadrada o apaisada")}</span>
            </div>
            <input
              ref={input}
              id="branding-file"
              type="file"
              accept={TYPES.join(",")}
              className="sr-only"
              aria-label={t("Archivo del logo")}
              onChange={(e) => upload(e.target.files?.[0])}
            />
          </div>

          <div className="branding-actions">
            <Button loading={busy} onClick={() => input.current?.click()}>
              <Icon name="plus" size={16} /> {logo ? t("Reemplazar logo") : t("Cargar logo")}
            </Button>
            {logo && (
              <Button variant="ghost" disabled={busy} onClick={() => setConfirmRemove(true)}>
                {t("Quitar logo")}
              </Button>
            )}
          </div>
          <p className="branding-note">
            {tr("El cambio queda en la <b>bitácora de auditoría</b> y aplica para todas las personas al recargar la página.", null, {
              b: (c) => <strong>{c}</strong>,
            })}
          </p>
        </div>

        <div className="branding-previews" aria-label={t("Vista previa")}>
          <div className="branding-preview branding-preview--dark">
            <BrandMark className="sb-logo" />
            <div>
              <div className="branding-preview-name">{t("Escaneo de Horizonte")}</div>
              <div className="branding-preview-org">IETS Colombia</div>
            </div>
          </div>
          <span className="branding-preview-label">{t("Menú lateral e ingreso (fondo azul)")}</span>
          <div className="branding-preview branding-preview--light">
            <BrandMark className="public-shell-mark" iconSize={20} />
            <div>
              <div className="branding-preview-name">{t("Escaneo de Horizonte")}</div>
              <div className="branding-preview-org">IETS Colombia</div>
            </div>
          </div>
          <span className="branding-preview-label">{t("Pantallas públicas (fondo claro)")}</span>
        </div>
      </div>

      <ConfirmDialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        onConfirm={remove}
        loading={busy}
        title={t("Quitar el logo")}
        message={t("Se quitará el logo cargado y volverá el distintivo del sistema en todas las pantallas.")}
        confirmLabel={t("Quitar logo")}
      />
    </Card>
  );
}
