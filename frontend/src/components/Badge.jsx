const PRESETS = {
  emergente: { bg: "#EEF2FF", color: "#4338CA", border: "#C7D2FE" },
  transicional: { bg: "#DBEAFE", color: "#1E40AF", border: "#BFDBFE" },
  inminente: { bg: "#E0E7FF", color: "#3730A3", border: "#A5B4FC" },
  medicamento: { bg: "#F0FDFA", color: "#0F766E", border: "#99F6E4" },
  dispositivo: { bg: "#FEF3C7", color: "#92400E", border: "#FDE68A" },
  digital: { bg: "#EDE9FE", color: "#6D28D9", border: "#DDD6FE" },
  otro: { bg: "#F1F5F9", color: "#475569", border: "#E2E8F0" },
  nuevo: { bg: "#DBEAFE", color: "#1E40AF", border: "#BFDBFE" },
  revisado: { bg: "#F1F5F9", color: "#475569", border: "#E2E8F0" },
  priorizado: { bg: "#D1FAE5", color: "#065F46", border: "#6EE7B7" },
  descartado: { bg: "#FEE2E2", color: "#991B1B", border: "#FCA5A5" },
  alto: { bg: "#FEE2E2", color: "#991B1B", border: "#FCA5A5" },
  medio: { bg: "#FEF3C7", color: "#92400E", border: "#FDE68A" },
  bajo: { bg: "#D1FAE5", color: "#065F46", border: "#6EE7B7" },
  ok: { bg: "#D1FAE5", color: "#065F46", border: "#6EE7B7" },
  error: { bg: "#FEE2E2", color: "#991B1B", border: "#FCA5A5" },
  parcial: { bg: "#FEF3C7", color: "#92400E", border: "#FDE68A" },
  admin: { bg: "#EEF2FF", color: "#4338CA", border: "#C7D2FE" },
  editor: { bg: "#DBEAFE", color: "#1E40AF", border: "#BFDBFE" },
  viewer: { bg: "#F1F5F9", color: "#475569", border: "#E2E8F0" },

  // Perfiles RBAC de la especificacion (Tabla 3)
  superadmin: { bg: "#EEF2FF", color: "#4338CA", border: "#C7D2FE" },
  evaluador_tecnico: { bg: "#DBEAFE", color: "#1E40AF", border: "#BFDBFE" },
  evaluador_clinico: { bg: "#F0FDFA", color: "#0F766E", border: "#99F6E4" },
  tomador_decisiones: { bg: "#F1F5F9", color: "#475569", border: "#E2E8F0" },
  revisor_pares: { bg: "#FEF3C7", color: "#92400E", border: "#FDE68A" },

  // Estados del ciclo operativo
  en_configuracion: { bg: "#F1F5F9", color: "#475569", border: "#E2E8F0" },
  en_filtrado: { bg: "#DBEAFE", color: "#1E40AF", border: "#BFDBFE" },
  en_priorizacion: { bg: "#EEF2FF", color: "#4338CA", border: "#C7D2FE" },
  en_evaluacion: { bg: "#EDE9FE", color: "#6D28D9", border: "#DDD6FE" },
  cerrado_consolidado: { bg: "#D1FAE5", color: "#065F46", border: "#6EE7B7" },

  // Estados metodologicos de la tecnologia dentro del ciclo
  capturada_no_asignada: { bg: "#F1F5F9", color: "#475569", border: "#E2E8F0" },
  asignada_a_ciclo: { bg: "#DBEAFE", color: "#1E40AF", border: "#BFDBFE" },
  filtrada_apta_priorizacion: { bg: "#EEF2FF", color: "#4338CA", border: "#C7D2FE" },
  excluida: { bg: "#F1F5F9", color: "#64748B", border: "#E2E8F0" },
  priorizada: { bg: "#D1FAE5", color: "#065F46", border: "#6EE7B7" },
  bajo_vigilancia: { bg: "#FEF3C7", color: "#92400E", border: "#FDE68A" },
  no_priorizada: { bg: "#F1F5F9", color: "#64748B", border: "#E2E8F0" },
  publicada: { bg: "#CCFBF1", color: "#0F766E", border: "#5EEAD4" },

  // Condicion del glosario
  nueva: { bg: "#E0E7FF", color: "#3730A3", border: "#A5B4FC" },

  A: { bg: "#D1FAE5", color: "#065F46", border: "#6EE7B7" },
  B: { bg: "#CCFBF1", color: "#0F766E", border: "#5EEAD4" },
  C: { bg: "#FEF3C7", color: "#92400E", border: "#FDE68A" },
  D: { bg: "#DBEAFE", color: "#1E40AF", border: "#BFDBFE" },
  E: { bg: "#F1F5F9", color: "#475569", border: "#E2E8F0" },
  verde: { bg: "#D1FAE5", color: "#065F46", border: "#6EE7B7" },
  ambar: { bg: "#FEF3C7", color: "#92400E", border: "#FDE68A" },
  rojo: { bg: "#FEE2E2", color: "#991B1B", border: "#FCA5A5" },
  sin_sonda: { bg: "#F1F5F9", color: "#64748B", border: "#E2E8F0" },
  verificada: { bg: "#D1FAE5", color: "#065F46", border: "#6EE7B7" },
  declarada: { bg: "#DBEAFE", color: "#1E40AF", border: "#BFDBFE" },
  observacion: { bg: "#FEF3C7", color: "#92400E", border: "#FDE68A" },
  historico: { bg: "#F1F5F9", color: "#64748B", border: "#E2E8F0" },
  info: { bg: "#EEF2FF", color: "#4338CA", border: "#C7D2FE" },
  warning: { bg: "#FEF3C7", color: "#92400E", border: "#FDE68A" },
  default: { bg: "#F1F5F9", color: "#475569", border: "#E2E8F0" },
};

export default function Badge({ children, tone, style }) {
  const key = (tone || String(children || "").toLowerCase()).trim();
  const p = PRESETS[key] || PRESETS.default;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 9999,
        fontSize: 12,
        fontWeight: 600,
        background: p.bg,
        color: p.color,
        border: `1px solid ${p.border}`,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children || "—"}
    </span>
  );
}
