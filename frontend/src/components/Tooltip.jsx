import { useState, useRef } from "react";

/**
 * Tooltip ligero (sin dependencias). Envuelve cualquier elemento y muestra
 * una burbuja informativa al pasar el cursor o enfocar con teclado.
 *
 *   <Tooltip text="Explicacion..."><Button>Accion</Button></Tooltip>
 */
export default function Tooltip({ text, children, position = "top", maxWidth = 240 }) {
  const [open, setOpen] = useState(false);
  const timer = useRef(null);

  if (!text) return children;

  const show = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), 120);
  };
  const hide = () => {
    clearTimeout(timer.current);
    setOpen(false);
  };

  const pos = {
    top: { bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)" },
    bottom: { top: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)" },
    left: { right: "calc(100% + 8px)", top: "50%", transform: "translateY(-50%)" },
    right: { left: "calc(100% + 8px)", top: "50%", transform: "translateY(-50%)" },
  }[position];

  return (
    <span
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          style={{
            position: "absolute",
            zIndex: 1000,
            ...pos,
            maxWidth,
            width: "max-content",
            background: "#0F172A",
            color: "#fff",
            fontSize: 12,
            lineHeight: 1.4,
            fontWeight: 500,
            padding: "8px 10px",
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(15,23,42,0.28)",
            pointerEvents: "none",
            whiteSpace: "normal",
            textAlign: "left",
            animation: "fadeIn 120ms ease-out",
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}
