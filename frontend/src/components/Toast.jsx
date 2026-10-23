import { createContext, useCallback, useContext, useMemo, useState } from "react";

const ToastContext = createContext(null);

const STATUS = {
  success: { bg: "#D1FAE5", border: "#10B981", color: "#065F46", icon: "✓" },
  error: { bg: "#FEE2E2", border: "#EF4444", color: "#991B1B", icon: "!" },
  warning: { bg: "#FEF3C7", border: "#F59E0B", color: "#92400E", icon: "!" },
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

  const toast = useMemo(
    () => ({
      success: (m) => push(m, "success"),
      error: (m) => push(m, "error", 6000),
      warning: (m) => push(m, "warning"),
      info: (m) => push(m, "info"),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => {
          const s = STATUS[t.type] || STATUS.info;
          return (
            <div
              key={t.id}
              role={t.type === "error" ? "alert" : "status"}
              className={`toast toast--${t.type}`}
              style={{ "--toast-accent": s.border, "--toast-bg": s.bg, "--toast-ink": s.color }}
            >
              <span className="toast-icon" aria-hidden="true">
                {s.icon}
              </span>
              <span className="toast-msg">{t.message}</span>
              <button type="button" className="toast-close" onClick={() => remove(t.id)} aria-label="Cerrar aviso">
                ×
              </button>
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
