import { forwardRef } from "react";

const VARIANTS = new Set(["primary", "secondary", "success", "danger", "ghost", "outline"]);
const SIZES = new Set(["sm", "md", "lg"]);

/**
 * Boton del sistema. Los estilos viven en styles/ui.css (hover, foco y
 * deshabilitado consistentes en todas las pantallas).
 *
 * Por defecto es type="button": dentro de un formulario, un boton sin tipo lo
 * envia (y sin manejador, recarga la pagina). Los envios declaran type="submit".
 */
const Button = forwardRef(function Button(
  { children, variant = "primary", size = "md", loading = false, disabled = false, type = "button", className = "", ...props },
  ref
) {
  const v = VARIANTS.has(variant) ? variant : "primary";
  const s = SIZES.has(size) ? size : "md";
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={`btn btn--${v} btn--${s}${loading ? " is-loading" : ""}${className ? ` ${className}` : ""}`}
      {...props}
    >
      {loading && <span className="btn-spinner" aria-hidden="true" />}
      {children}
    </button>
  );
});

export default Button;
