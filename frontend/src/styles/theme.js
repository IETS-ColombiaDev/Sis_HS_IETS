// Design tokens - Sistema de Escaneo de Horizonte del IETS
// Fuente de verdad de la linea grafica (ver linea-grafica-y-ux-ui.md).

export const theme = {
  colors: {
    primary: {
      purple: "#6366F1",
      purpleDark: "#4F46E5",
      purpleLight: "#818CF8",
      blue: "#3B82F6",
      aquamarine: "#06B6D4",
    },
    text: {
      primary: "#0F172A",
      secondary: "#64748B",
      tertiary: "#94A3B8",
      inverse: "#FFFFFF",
    },
    backgrounds: {
      app: "#F8FAFC",
      card: "#FFFFFF",
      sidebar: "#FFFFFF",
      hover: "#F1F5F9",
      active: "#EEF2FF",
    },
    borders: {
      light: "#E2E8F0",
      medium: "#CBD5E1",
      dark: "#94A3B8",
    },
    status: {
      success: "#10B981",
      successBg: "#D1FAE5",
      warning: "#F59E0B",
      warningBg: "#FEF3C7",
      error: "#EF4444",
      errorBg: "#FEE2E2",
      info: "#3B82F6",
      infoBg: "#DBEAFE",
    },
  },
  gradient: "linear-gradient(135deg, #6366F1 0%, #3B82F6 100%)",
  fonts: {
    primary:
      "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    sizes: {
      xs: "11px",
      sm: "13px",
      base: "15px",
      md: "16px",
      lg: "18px",
      xl: "20px",
      "2xl": "24px",
      "3xl": "30px",
    },
  },
  spacing: {
    xs: "4px",
    sm: "8px",
    md: "12px",
    base: "16px",
    lg: "20px",
    xl: "24px",
    "2xl": "32px",
    "3xl": "48px",
    "4xl": "64px",
  },
  borderRadius: {
    sm: "6px",
    base: "8px",
    lg: "12px",
    xl: "16px",
    full: "9999px",
  },
  shadows: {
    sm: "0 1px 2px rgba(15,23,42,0.06)",
    base: "0 1px 3px rgba(15,23,42,0.10), 0 1px 2px rgba(15,23,42,0.06)",
    md: "0 4px 6px rgba(15,23,42,0.08), 0 2px 4px rgba(15,23,42,0.06)",
    lg: "0 10px 15px rgba(15,23,42,0.10), 0 4px 6px rgba(15,23,42,0.05)",
    xl: "0 20px 25px rgba(15,23,42,0.12), 0 10px 10px rgba(15,23,42,0.04)",
    dropdown: "0 10px 25px rgba(0,0,0,0.12)",
  },
  transitions: {
    fast: "150ms ease-in-out",
    base: "200ms ease-in-out",
    slow: "300ms ease-in-out",
  },
};

// Paleta para graficos (derivada de los tokens).
export const chartColors = [
  "#6366F1",
  "#3B82F6",
  "#06B6D4",
  "#10B981",
  "#F59E0B",
  "#818CF8",
  "#EF4444",
  "#8B5CF6",
];

export const horizonColors = {
  emergente: "#818CF8",
  transicional: "#3B82F6",
  inminente: "#6366F1",
  "": "#CBD5E1",
};

export const impactColors = {
  alto: { bg: "#FEE2E2", text: "#991B1B", border: "#FCA5A5" },
  medio: { bg: "#FEF3C7", text: "#92400E", border: "#FDE68A" },
  bajo: { bg: "#D1FAE5", text: "#065F46", border: "#6EE7B7" },
};

export default theme;
