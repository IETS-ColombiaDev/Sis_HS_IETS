import { Link, NavLink } from "react-router-dom";
import Icon from "./Icon";

/**
 * Marco institucional de las pantallas publicas.
 * Evita que postular, expedientes, transparencia y revision parezcan formularios sueltos.
 */
export default function PublicShell({ kicker, title, lead, children, wide }) {
  return (
    <div className="public-shell">
      <header className="public-shell-bar">
        <Link to="/transparencia" className="public-shell-brand">
          <span className="public-shell-mark">
            <Icon name="radar" size={20} />
          </span>
          <span>
            <strong>Escaneo de Horizonte</strong>
            <em>IETS Colombia</em>
          </span>
        </Link>
        <nav className="public-shell-nav">
          <NavLink to="/expedientes">Expedientes</NavLink>
          <NavLink to="/transparencia">Transparencia</NavLink>
          <NavLink to="/postular">Postular tecnología</NavLink>
          <NavLink to="/login" className="public-shell-access">
            Acceso institucional
          </NavLink>
        </nav>
      </header>

      <main className={`public-shell-main${wide ? " is-wide" : ""}`}>
        {kicker && <p className="public-submit-kicker">{kicker}</p>}
        {title && <h1>{title}</h1>}
        {lead && <p className="public-submit-lead">{lead}</p>}
        {children}
      </main>

      <footer className="public-shell-foot">
        Instituto de Evaluación Tecnológica en Salud. Las fichas públicas no incluyen
        modelaciones presupuestales ni información confidencial.
      </footer>
    </div>
  );
}
