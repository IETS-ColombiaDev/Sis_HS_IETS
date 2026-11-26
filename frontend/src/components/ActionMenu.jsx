import { useEffect, useId, useRef, useState } from "react";
import Button from "./Button";
import Icon from "./Icon";

/**
 * Botón que despliega un grupo de acciones relacionadas. Evita filas de siete
 * botones en la cabecera: cada acción conserva su nombre, su explicación y, si
 * está deshabilitada, el motivo.
 *
 * items: [{ key, label, description, icon, onSelect, disabled, disabledHint, loading, testId, danger }]
 */
export default function ActionMenu({ label, icon, items, variant = "secondary", size = "md", align = "left", testId, loading = false }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const id = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (ev) => {
      if (wrap.current && !wrap.current.contains(ev.target)) setOpen(false);
    };
    const onKey = (ev) => {
      if (ev.key === "Escape") {
        setOpen(false);
        wrap.current?.querySelector("button")?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const onMenuKey = (ev) => {
    if (ev.key !== "ArrowDown" && ev.key !== "ArrowUp" && ev.key !== "Home" && ev.key !== "End") return;
    const options = [...(wrap.current?.querySelectorAll('[role="menuitem"]:not([aria-disabled="true"])') || [])];
    if (!options.length) return;
    ev.preventDefault();
    const at = options.indexOf(document.activeElement);
    let next = 0;
    if (ev.key === "End") next = options.length - 1;
    else if (ev.key === "ArrowDown") next = at < 0 ? 0 : (at + 1) % options.length;
    else if (ev.key === "ArrowUp") next = at <= 0 ? options.length - 1 : at - 1;
    options[next].focus();
  };

  return (
    <div className={`action-menu action-menu--${align}`} ref={wrap} onKeyDown={onMenuKey}>
      <Button
        variant={variant}
        size={size}
        loading={loading}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((v) => !v)}
        data-testid={testId}
      >
        {icon && <Icon name={icon} size={16} />} {label}
        <span className={`action-menu-caret${open ? " is-open" : ""}`} aria-hidden="true">
          <Icon name="chevron" size={14} />
        </span>
      </Button>
      {open && (
        <div className="action-menu-list" role="menu" id={id} aria-label={typeof label === "string" ? label : undefined}>
          {items.map((item) => {
            const blocked = Boolean(item.disabled || item.loading);
            return (
              <button
                key={item.key || item.label}
                type="button"
                role="menuitem"
                className={`action-menu-item${item.danger ? " is-danger" : ""}`}
                aria-disabled={blocked || undefined}
                data-disabled-hint={item.disabled && item.disabledHint ? item.disabledHint : undefined}
                data-testid={item.testId}
                onClick={() => {
                  if (blocked) return;
                  setOpen(false);
                  item.onSelect?.();
                }}
              >
                <span className="action-menu-icon" aria-hidden="true">
                  {item.loading ? <span className="btn-spinner" /> : item.icon ? <Icon name={item.icon} size={16} /> : null}
                </span>
                <span className="action-menu-text">
                  <span className="action-menu-label">{item.label}</span>
                  {(item.disabled && item.disabledHint ? item.disabledHint : item.description) && (
                    <span className="action-menu-desc">{item.disabled && item.disabledHint ? item.disabledHint : item.description}</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
