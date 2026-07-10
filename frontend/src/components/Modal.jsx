import { useEffect } from "react";

export default function Modal({ open, onClose, title, children, footer, width = 560 }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.45)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "48px 16px",
        zIndex: 1000,
        overflowY: "auto",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{
          background: "#fff",
          borderRadius: 12,
          width: "100%",
          maxWidth: width,
          boxShadow: "var(--shadow-xl)",
          animation: "fadeIn 0.25s ease-out",
        }}
      >
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid #E2E8F0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h3 style={{ fontSize: 18, fontWeight: 700 }}>{title}</h3>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              border: "none",
              background: "transparent",
              fontSize: 22,
              color: "#94A3B8",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
        <div style={{ padding: 24 }}>{children}</div>
        {footer && (
          <div
            style={{
              padding: "16px 24px",
              borderTop: "1px solid #E2E8F0",
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
