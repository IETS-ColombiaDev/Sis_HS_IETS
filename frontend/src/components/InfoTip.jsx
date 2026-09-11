import Icon from "./Icon";
import Tooltip from "./Tooltip";

/**
 * Icono (i) con explicacion en hover o al enfocar.
 * Sirve para glosario de terminos tecnicos sin saturar la pantalla.
 */
export default function InfoTip({ text, position = "top", label = "Más información" }) {
  if (!text) return null;
  return (
    <Tooltip text={text} position={position} maxWidth={300}>
      <button
        type="button"
        className="info-tip"
        aria-label={label}
        tabIndex={0}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <Icon name="info" size={12} strokeWidth={2} />
      </button>
    </Tooltip>
  );
}

export function TermLabel({ children, tip, position = "top", label }) {
  const auto =
    typeof children === "string" || typeof children === "number"
      ? `Qué significa ${children}`
      : "Más información";
  return (
    <span className="term-label">
      {children}
      <InfoTip text={tip} position={position} label={label || auto} />
    </span>
  );
}
