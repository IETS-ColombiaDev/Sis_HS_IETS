import Modal from "./Modal";
import Button from "./Button";

export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = "Confirmar accion",
  message,
  confirmLabel = "Confirmar",
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
            Cancelar
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
