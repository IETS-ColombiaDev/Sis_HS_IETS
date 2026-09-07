import { Component } from "react";
import Button from "./Button";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, nonce: 0 };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error(this.props.title || "Error de interfaz", error);
  }

  reset = () => {
    this.setState((s) => ({ error: null, nonce: s.nonce + 1 }));
    this.props.onReset?.();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary" role="alert">
          <strong>{this.props.title || "Esta vista se detuvo"}</strong>
          <p>{this.props.hint || "El resto del sistema sigue disponible. Puede reintentar sin recargar todo el sitio."}</p>
          <Button size="sm" onClick={this.reset}>Reintentar</Button>
        </div>
      );
    }
    return <div key={this.state.nonce}>{this.props.children}</div>;
  }
}
