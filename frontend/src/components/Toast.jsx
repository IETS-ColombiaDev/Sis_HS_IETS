import { createContext, useCallback, useContext, useState } from "react";

const ToastContext = createContext(null);

const STATUS = {
  success: { bg: "#D1FAE5", border: "#10B981", color: "#065F46", icon: "✓" },
  error: { bg: "#FEE2E2", border: "#EF4444", color: "#991B1B", icon: "!" },
  warning: { bg: "#FEF3C7", border: "#F59E0B", color: "#92400E", icon: "⚠" },
  info: { bg: "#DBEAFE", border: "#3B82F6", color: "#1E40AF", icon: "i" },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (message, type = "info", ttl = 4200) => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t, { id, message, type }]);
      setTimeout(() => remove(id), ttl);
    },
    [remove]
  );

  const toast = {
    success: (m) => push(m, "success"),
    error: (m) => push(m, "error", 6000),
    warning: (m) => push(m, "warning"),
    info: (m) => push(m, "info"),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        style={{
          position: "fixed",
          top: 20,
          right: 20,
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          maxWidth: 380,
        }}
      >
        {toasts.map((t) => {
          const s = STATUS[t.type] || STATUS.info;
          return (
            <div
              key={t.id}
              role="alert"
              onClick={() => remove(t.id)}
              style={{
                background: "#fff",
                borderLeft: `4px solid ${s.border}`,
                borderRadius: 10,
                boxShadow: "var(--shadow-lg)",
                padding: "12px 16px",
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                cursor: "pointer",
                animation: "slideIn 0.25s ease-out",
              }}
            >
              <span
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: s.bg,
                  color: s.color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: 13,
                  flexShrink: 0,
                }}
              >
                {s.icon}
              </span>
              <span style={{ fontSize: 14, color: "#0f172a" }}>{t.message}</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de ToastProvider");
  return ctx;
}
