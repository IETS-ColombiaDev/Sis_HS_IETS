import InfoTip from "./InfoTip";

/**
 * `title`, `hint` y `actions` son opcionales y componen la misma cabecera que
 * varias pantallas venian repitiendo a mano: un `SectionTitle` seguido de un
 * parrafo de contexto. Sin ellos el componente se comporta como antes.
 */
export function Card({ children, style, padding = 24, title, hint, actions }) {
  const hasHeader = Boolean(title || actions);
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #E2E8F0",
        borderRadius: 12,
        padding,
        ...style,
      }}
    >
      {hasHeader && (
        <div style={padding === 0 ? { padding: "18px 18px 0" } : undefined}>
          <SectionTitle right={actions}>{title}</SectionTitle>
        </div>
      )}
      {hint && (
        <p
          style={{
            fontSize: 13,
            color: "#64748B",
            marginTop: hasHeader ? -6 : 0,
            marginBottom: 16,
            ...(padding === 0 ? { padding: "0 18px" } : null),
          }}
        >
          {hint}
        </p>
      )}
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, titleHint }) {
  const heading =
    typeof title === "string" && titleHint ? (
      <span className="term-label">
        {title}
        <InfoTip text={titleHint} label={`Que es ${title}`} />
      </span>
    ) : (
      title
    );
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 16,
        marginBottom: 24,
        flexWrap: "wrap",
      }}
    >
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>{heading}</h1>
        {subtitle && (
          <p style={{ color: "#64748B", fontSize: 14, marginTop: 6, maxWidth: 720 }}>{subtitle}</p>
        )}
      </div>
      {actions && <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{actions}</div>}
    </div>
  );
}

export function SectionTitle({ children, right, hint }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 16,
      }}
    >
      <h3 style={{ fontSize: 16, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}>
        {children}
        {hint ? (
          <InfoTip
            text={hint}
            label={typeof children === "string" ? `Que es ${children}` : "Mas informacion"}
          />
        ) : null}
      </h3>
      {right}
    </div>
  );
}

export default Card;
