import { useLocation } from "react-router-dom";
import InfoTip from "./InfoTip";
import { sectionFor } from "../constants/navigation";

/**
 * `title`, `hint` y `actions` son opcionales y componen la misma cabecera que
 * varias pantallas venian repitiendo a mano: un `SectionTitle` seguido de un
 * parrafo de contexto. Sin ellos el componente se comporta como antes.
 */
export function Card({ children, style, padding = 20, title, hint, actions, className, "data-testid": testId }) {
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

/**
 * Cabecera de pantalla: una franja con la seccion del menu, el titulo, el
 * proposito y las acciones. `eyebrow` reemplaza la seccion si se indica.
 */
export function PageHeader({ title, subtitle, actions, titleHint, eyebrow }) {
  const { pathname } = useLocation();
  const kicker = eyebrow ?? sectionFor(pathname);
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
        {kicker && <span className="page-eyebrow">{kicker}</span>}
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
