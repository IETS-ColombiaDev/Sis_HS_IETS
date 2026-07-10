import { forwardRef } from "react";

const SIZES = {
  sm: { padding: "6px 12px", fontSize: 13 },
  md: { padding: "9px 16px", fontSize: 14 },
  lg: { padding: "12px 22px", fontSize: 15 },
};

const VARIANTS = {
  primary: { background: "#6366F1", color: "#fff", border: "1px solid #6366F1" },
  secondary: { background: "#fff", color: "#0F172A", border: "1px solid #CBD5E1" },
  success: { background: "#10B981", color: "#fff", border: "1px solid #10B981" },
  danger: { background: "#EF4444", color: "#fff", border: "1px solid #EF4444" },
  ghost: { background: "transparent", color: "#4F46E5", border: "1px solid transparent" },
  outline: { background: "transparent", color: "#4F46E5", border: "1px solid #C7D2FE" },
};

const Button = forwardRef(function Button(
  { children, variant = "primary", size = "md", loading = false, disabled = false, style, ...props },
  ref
) {
  const v = VARIANTS[variant] || VARIANTS.primary;
  const s = SIZES[size] || SIZES.md;
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      disabled={isDisabled}
      style={{
        ...v,
        ...s,
        borderRadius: 8,
        fontWeight: 600,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        transition: "all 200ms ease-in-out",
        opacity: isDisabled ? 0.6 : 1,
        cursor: isDisabled ? "not-allowed" : "pointer",
        whiteSpace: "nowrap",
        ...style,
      }}
      onMouseEnter={(e) => {
        if (isDisabled) return;
        if (variant === "primary") e.currentTarget.style.background = "#4F46E5";
        if (variant === "secondary") e.currentTarget.style.background = "#F1F5F9";
        if (variant === "ghost" || variant === "outline")
          e.currentTarget.style.background = "#EEF2FF";
        if (variant === "danger") e.currentTarget.style.background = "#DC2626";
        if (variant === "success") e.currentTarget.style.background = "#059669";
        e.currentTarget.style.boxShadow = "var(--shadow-md)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = v.background;
        e.currentTarget.style.boxShadow = "none";
      }}
      {...props}
    >
      {loading && (
        <span
          style={{
            width: 14,
            height: 14,
            border: "2px solid currentColor",
            borderTopColor: "transparent",
            borderRadius: "50%",
            animation: "spin 0.7s linear infinite",
            display: "inline-block",
          }}
        />
      )}
      {children}
    </button>
  );
});

export default Button;
