import InfoTip from "./InfoTip";

/**
 * `title`, `hint` y `actions` son opcionales y componen la misma cabecera que
 * varias pantallas venian repitiendo a mano: un `SectionTitle` seguido de un
 * parrafo de contexto. Sin ellos el componente se comporta como antes.
 */
export function Card({ children, style, padding = 24, title, hint, actions, className, "data-testid": testId }) {
  const hasHeader = Boolean(title || actions);
  return (
    <div className={`ui-card${className ? ` ${className}` : ""}`} data-testid={testId} style={{ padding, ...style }}>
      {hasHeader && (
        <div style={padding === 0 ? { padding: "18px 18px 0" } : undefined}>
          <SectionTitle right={actions}>{title}</SectionTitle>
        </div>
      )}
      {hint && (
        <p
          className="ui-card-hint"
          style={{
            marginTop: hasHeader ? -6 : 0,
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
        <InfoTip text={titleHint} label={`Qué es ${title}`} />
      </span>
    ) : (
      title
    );
  return (
    <div className="page-header">
      <div className="page-header-text">
        <h1 className="page-title">{heading}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ children, right, hint }) {
  return (
    <div className="section-title">
      <h3>
        {children}
        {hint ? (
          <InfoTip
            text={hint}
            label={typeof children === "string" ? `Qué es ${children}` : "Más información"}
          />
        ) : null}
      </h3>
      {right}
    </div>
  );
}

export default Card;
