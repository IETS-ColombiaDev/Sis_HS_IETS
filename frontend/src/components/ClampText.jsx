import { useLayoutEffect, useRef, useState } from "react";

/**
 * Texto recortado a N lineas sin perder informacion.
 *
 * Los nombres de tecnologia llegan de las fuentes con cientos de caracteres
 * (titulo del ensayo, mecanismo, indicacion). En listas se recortan a 2-3
 * lineas; el nombre completo queda en el tooltip nativo (`title`) y en lectores
 * de pantalla, y con `expandable` aparece "Ver completo" para desplegarlo.
 *
 * Dentro de un <button> (items de cola) use expandable=false: un boton dentro
 * de otro boton no es HTML valido.
 */
export default function ClampText({
  text,
  lines = 2,
  expandable = false,
  as: Tag = "div",
  className = "",
  style,
  testId,
}) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const value = text == null ? "" : String(text);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || open) return;
    const measure = () => setOverflows(el.scrollHeight - el.clientHeight > 1);
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [value, lines, open]);

  const clampStyle = open
    ? {}
    : {
        display: "-webkit-box",
        WebkitBoxOrient: "vertical",
        WebkitLineClamp: lines,
        overflow: "hidden",
      };

  return (
    <>
      <Tag
        ref={ref}
        className={`clamp-text ${className}`.trim()}
        title={overflows || open ? value : undefined}
        data-testid={testId}
        data-clamped={!open && overflows ? "true" : "false"}
        style={{ overflowWrap: "anywhere", ...clampStyle, ...style }}
      >
        {value}
      </Tag>
      {expandable && (overflows || open) && (
        <button
          type="button"
          className="clamp-text-toggle"
          aria-expanded={open}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
        >
          {open ? "Ver menos" : "Ver nombre completo"}
        </button>
      )}
    </>
  );
}
