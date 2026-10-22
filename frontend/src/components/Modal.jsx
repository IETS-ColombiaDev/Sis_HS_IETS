import { useEffect, useId, useRef } from "react";
import Icon from "./Icon";

/**
 * Ventana modal. Cabecera y pie quedan fijos y el cuerpo se desplaza, asi los
 * botones de guardar siempre estan a la vista. Al abrir lleva el foco al
 * dialogo y al cerrar lo devuelve a donde estaba.
 */
export default function Modal({ open, onClose, title, children, footer, width = 560 }) {
  const box = useRef(null);
  const titleId = useId();
  // onClose suele ser una funcion nueva en cada render: con ella como
  // dependencia el foco saltaria al primer campo en cada tecla.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const onKey = (e) => {
      if (e.key === "Escape") closeRef.current?.();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    // Foco al primer campo editable; si no hay, al dialogo.
    const t = setTimeout(() => {
      const field = box.current?.querySelector(
        ".ui-modal-body input:not([type=hidden]):not([disabled]), .ui-modal-body select:not([disabled]), .ui-modal-body textarea:not([disabled])"
      );
      (field || box.current)?.focus({ preventScroll: true });
    }, 30);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      if (previous && typeof previous.focus === "function") previous.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="ui-modal-veil"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className="ui-modal"
        style={{ maxWidth: width }}
      >
        <div className="ui-modal-head">
          <h3 id={titleId}>{title}</h3>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="ui-modal-close">
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="ui-modal-body">{children}</div>
        {footer && <div className="ui-modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
