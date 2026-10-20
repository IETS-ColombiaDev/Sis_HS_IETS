import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const GAP = 8;
const MARGIN = 8;

/**
 * Tooltip ligero (sin dependencias). Envuelve cualquier elemento y muestra
 * una burbuja informativa al pasar el cursor o enfocar con teclado.
 *
 *   <Tooltip text="Explicacion..."><Button>Accion</Button></Tooltip>
 *
 * La burbuja se dibuja en <body> con posicion fija: dentro de tarjetas, del
 * menu lateral o de tablas con desplazamiento quedaba recortada o por debajo
 * de la tarjeta siguiente. Si no cabe en el lado pedido se voltea, y nunca se
 * sale de la ventana.
 */
export default function Tooltip({ text, children, position = "top", maxWidth = 240 }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const timer = useRef(null);
  const anchor = useRef(null);
  const bubble = useRef(null);

  const place = useCallback(() => {
    const a = anchor.current?.getBoundingClientRect();
    const b = bubble.current?.getBoundingClientRect();
    if (!a || !b) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const fits = {
      top: a.top - GAP - b.height >= MARGIN,
      bottom: a.bottom + GAP + b.height <= vh - MARGIN,
      left: a.left - GAP - b.width >= MARGIN,
      right: a.right + GAP + b.width <= vw - MARGIN,
    };
    const opposite = { top: "bottom", bottom: "top", left: "right", right: "left" };
    let side = position;
    if (!fits[side]) side = fits[opposite[side]] ? opposite[side] : ["top", "bottom", "right", "left"].find((s) => fits[s]) || "bottom";
    let top;
    let left;
    if (side === "top" || side === "bottom") {
      top = side === "top" ? a.top - GAP - b.height : a.bottom + GAP;
      left = a.left + a.width / 2 - b.width / 2;
    } else {
      left = side === "left" ? a.left - GAP - b.width : a.right + GAP;
      top = a.top + a.height / 2 - b.height / 2;
    }
    left = Math.min(Math.max(MARGIN, left), vw - b.width - MARGIN);
    top = Math.min(Math.max(MARGIN, top), vh - b.height - MARGIN);
    setCoords({ top, left });
  }, [position]);

  useLayoutEffect(() => {
    if (open) place();
    else setCoords(null);
  }, [open, place, text]);

  useEffect(() => {
    if (!open) return undefined;
    // Al desplazar la pagina o un contenedor, la burbuja sigue a su ancla.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  useEffect(() => () => clearTimeout(timer.current), []);

  if (!text) return children;

  const show = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), 120);
  };
  const hide = () => {
    clearTimeout(timer.current);
    setOpen(false);
  };

  return (
    <span
      ref={anchor}
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {open &&
        createPortal(
          <span
            ref={bubble}
            role="tooltip"
            style={{
              position: "fixed",
              zIndex: 3000,
              top: coords ? coords.top : -9999,
              left: coords ? coords.left : -9999,
              visibility: coords ? "visible" : "hidden",
              maxWidth: Math.min(maxWidth, window.innerWidth - MARGIN * 2),
              width: "max-content",
              background: "#0F172A",
              color: "#fff",
              fontSize: 12,
              lineHeight: 1.45,
              fontWeight: 500,
              padding: "8px 10px",
              borderRadius: 8,
              boxShadow: "0 8px 24px rgba(15,23,42,0.28)",
              pointerEvents: "none",
              whiteSpace: "normal",
              textAlign: "left",
              textTransform: "none",
              letterSpacing: "normal",
              animation: "fadeIn 120ms ease-out",
            }}
          >
            {text}
          </span>,
          document.body
        )}
    </span>
  );
}
