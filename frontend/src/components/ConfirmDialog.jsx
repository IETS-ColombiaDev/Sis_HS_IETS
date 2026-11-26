import Modal from "./Modal";
import Button from "./Button";
import { t } from "../i18n";

export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = t("Confirmar acción"),
  message,
  confirmLabel = t("Confirmar"),
  confirmVariant = "danger",
  loading = false,
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width={440}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {t("Cancelar")}
          </Button>
          <Button variant={confirmVariant} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p style={{ color: "#475569", fontSize: 14 }}>{message}</p>
    </Modal>
  );
}
