import { useState } from "react";
import Icon from "./Icon";

/**
 * Nota de ayuda contextual para explicar que hace cada modulo.
 * Se puede cerrar y recuerda el estado por 'id' en localStorage.
 */
export default function HelpNote({ id, children, tone = "info", dismissible = true }) {
  const key = id ? `help_dismissed_${id}` : null;
  const [open, setOpen] = useState(() => {
    if (!key) return true;
    return localStorage.getItem(key) !== "1";
  });

  if (!open) return null;

  const tones = {
    info: { bg: "#EFF6FF", border: "#DBEAFE", fg: "#1E3A8A", icon: "#3B82F6" },
    tip: { bg: "#F5F3FF", border: "#DDD6FE", fg: "#5B21B6", icon: "#7C3AED" },
  }[tone] || { bg: "#EFF6FF", border: "#DBEAFE", fg: "#1E3A8A", icon: "#3B82F6" };

  const dismiss = () => {
    if (key) localStorage.setItem(key, "1");
    setOpen(false);
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        background: tones.bg,
        border: `1px solid ${tones.border}`,
        borderRadius: 10,
        padding: "12px 14px",
        marginBottom: 16,
        fontSize: 13.5,
        color: tones.fg,
        lineHeight: 1.6,
      }}
    >
      <span style={{ color: tones.icon, marginTop: 1, flexShrink: 0 }}>
        <Icon name="info" size={18} />
      </span>
      <div style={{ flex: 1 }}>{children}</div>
      {dismissible && (
        <button
          onClick={dismiss}
          title="Ocultar ayuda"
          style={{ border: "none", background: "transparent", cursor: "pointer", color: tones.fg, flexShrink: 0, opacity: 0.7 }}
        >
          <Icon name="x" size={16} />
        </button>
      )}
    </div>
  );
}
