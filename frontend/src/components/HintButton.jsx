import Button from "./Button";
import Tooltip from "./Tooltip";

/**
 * Boton con ayuda contextual. Si esta deshabilitado, el tooltip explica por
 * que (regla metodologica, permiso o dato faltante) en lugar de dejar al
 * usuario frente a un boton gris sin respuesta.
 *
 * Un <button disabled> no recibe eventos de puntero en todos los navegadores,
 * asi que el tooltip se ancla a un contenedor enfocable y el boton deja pasar
 * el puntero.
 */
export default function HintButton({ hint, disabledHint, disabled, children, position = "top", style, ...props }) {
  const text = disabled ? disabledHint || hint : hint;
  if (!text) {
    return (
      <Button disabled={disabled} style={style} {...props}>
        {children}
      </Button>
    );
  }
  if (disabled) {
    return (
      <Tooltip text={text} position={position} maxWidth={280}>
        <span
          tabIndex={0}
          className="hint-button-wrap"
          data-disabled-hint={text}
          style={{ display: "inline-flex", cursor: "not-allowed" }}
        >
          <Button disabled style={{ pointerEvents: "none", ...style }} {...props}>
            {children}
          </Button>
        </span>
      </Tooltip>
    );
  }
  return (
    <Tooltip text={text} position={position} maxWidth={280}>
      <Button style={style} {...props}>
        {children}
      </Button>
    </Tooltip>
  );
}
