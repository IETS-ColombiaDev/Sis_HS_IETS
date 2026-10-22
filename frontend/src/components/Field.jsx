import { useId } from "react";
import InfoTip from "./InfoTip";
import Icon from "./Icon";

/**
 * Campos de formulario. Estilos en styles/ui.css.
 *
 * - `label` + `required` muestran el asterisco.
 * - `hint` es la explicacion del termino (icono i).
 * - `help` es una ayuda corta siempre visible bajo el campo (formato, ejemplo).
 * - `error` marca el campo, lo anuncia al lector de pantalla y lo explica.
 * Sin `id` se genera uno: asi la etiqueta siempre enfoca su campo.
 */
export function Label({ children, htmlFor, required, hint }) {
  return (
    <label htmlFor={htmlFor} className="field-label">
      <span>
        {children}
        {required && (
          <span className="field-required" aria-hidden="true">
            {" "}*
          </span>
        )}
      </span>
      <InfoTip text={hint} label={`Qué es ${typeof children === "string" ? children : "este campo"}`} />
    </label>
  );
}

function FieldShell({ id, label, required, hint, help, error, children, counter, flush }) {
  return (
    <div className={`field${error ? " has-error" : ""}${flush ? " field--flush" : ""}`}>
      {label && (
        <Label htmlFor={id} required={required} hint={hint}>
          {label}
        </Label>
      )}
      {children}
      {(error || help || counter) && (
        <div className="field-foot">
          {error ? (
            <div className="field-error" id={`${id}-error`} role="alert">
              <Icon name="alert" size={13} /> {error}
            </div>
          ) : help ? (
            <div className="field-help" id={`${id}-help`}>
              {help}
            </div>
          ) : (
            <span />
          )}
          {counter}
        </div>
      )}
    </div>
  );
}

// Las pantallas pasan style={{ marginBottom: 0 }} cuando el campo va en una
// barra de filtros o una fila: el contenedor tampoco debe sumar margen.
const isFlush = (style) => Boolean(style && style.marginBottom === 0);

function describedBy(id, error, help, extra) {
  const ids = [error ? `${id}-error` : help ? `${id}-help` : "", extra || ""].filter(Boolean).join(" ");
  return ids || undefined;
}

export function Input({ label, error, required, hint, help, className = "", id, ...props }) {
  const auto = useId();
  const fid = id || auto;
  return (
    <FieldShell id={fid} label={label} required={required} hint={hint} help={help} error={error} flush={isFlush(props.style)}>
      <input
        id={fid}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fid, error, help, props["aria-describedby"])}
        className={`field-control${className ? ` ${className}` : ""}`}
        {...props}
      />
    </FieldShell>
  );
}

export function Textarea({ label, error, required, hint, help, rows = 4, className = "", id, ...props }) {
  const auto = useId();
  const fid = id || auto;
  const max = Number(props.maxLength) || 0;
  const len = typeof props.value === "string" ? props.value.length : 0;
  const counter = max ? (
    <span className={`field-counter${len > max * 0.9 ? " is-near" : ""}`}>
      {len}/{max}
    </span>
  ) : null;
  return (
    <FieldShell id={fid} label={label} required={required} hint={hint} help={help} error={error} counter={counter} flush={isFlush(props.style)}>
      <textarea
        id={fid}
        rows={rows}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fid, error, help, props["aria-describedby"])}
        className={`field-control field-textarea${className ? ` ${className}` : ""}`}
        {...props}
      />
    </FieldShell>
  );
}

export function Select({ label, error, required, hint, help, children, className = "", id, ...props }) {
  const auto = useId();
  const fid = id || auto;
  return (
    <FieldShell id={fid} label={label} required={required} hint={hint} help={help} error={error} flush={isFlush(props.style)}>
      <select
        id={fid}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fid, error, help, props["aria-describedby"])}
        className={`field-control field-select${className ? ` ${className}` : ""}`}
        {...props}
      >
        {children}
      </select>
    </FieldShell>
  );
}
