import { useState } from "react";
import Icon from "./Icon";

/**
 * Acordeon accesible. Recibe items: [{ id, title, icon?, content }].
 * Permite abrir varios paneles a la vez.
 */
export default function Accordion({ items = [], defaultOpen = [] }) {
  const [open, setOpen] = useState(new Set(defaultOpen));

  const toggle = (id) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((it) => {
        const isOpen = open.has(it.id);
        return (
          <div
            key={it.id}
            style={{
              border: "1px solid #E2E8F0",
              borderRadius: 10,
              overflow: "hidden",
              background: isOpen ? "#FbFcFe" : "#fff",
            }}
          >
            <button
              onClick={() => toggle(it.id)}
              aria-expanded={isOpen}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "13px 16px",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              {it.icon && (
                <span
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: "#EEF2FF",
                    color: "#4F46E5",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon name={it.icon} size={17} />
                </span>
              )}
              <span style={{ flex: 1, fontSize: 14.5, fontWeight: 600, color: "#0F172A" }}>
                {it.title}
              </span>
              <span
                style={{
                  transition: "transform 200ms ease",
                  transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                  color: "#94A3B8",
                  display: "inline-flex",
                }}
              >
                <Icon name="chevron" size={18} />
              </span>
            </button>
            {isOpen && (
              <div
                style={{
                  padding: "0 16px 16px 16px",
                  fontSize: 13.5,
                  color: "#475569",
                  lineHeight: 1.7,
                  animation: "fadeIn 180ms ease-out",
                }}
              >
                {it.content}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
