import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import useManualReview from "../scan/useManualReview";
import Button from "./Button";
import Icon from "./Icon";
import Modal from "./Modal";
import "./manual-review.css";

const KEY = "iets.manualReviewPrompt";

function seen(email) {
  try {
    return sessionStorage.getItem(`${KEY}:${email}`) === "1";
  } catch {
    return false;
  }
}

function remember(email) {
  try {
    sessionStorage.setItem(`${KEY}:${email}`, "1");
  } catch {
    // Sin almacenamiento de sesión el aviso puede volver a salir: no es grave.
  }
}

/**
 * Aviso al entrar (Módulo 0): si hay fuentes de consulta manual (nivel E) por
 * validar, el equipo técnico ve una ventana que lo invita a validarlas. Sale una
 * vez por sesión; el contador del menú y el aviso de la Bandeja siguen visibles.
 */
export default function ManualReviewPrompt({ suppressed = false }) {
  const { user } = useAuth();
  const { allowed, data, due } = useManualReview();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const email = user?.email || "";

  useEffect(() => {
    // Con la guía de bienvenida abierta se espera a que la cierren: no se apilan ventanas.
    if (suppressed || !allowed || !email || due <= 0 || seen(email)) return;
    if (location.pathname.startsWith("/bandeja-entrada")) return; // allí ya está el aviso
    setOpen(true);
    remember(email);
  }, [suppressed, allowed, email, due, location.pathname]);

  if (!open) return null;
  const pending = (data?.items || []).filter((i) => i.due);
  const close = () => setOpen(false);
  const go = () => {
    close();
    navigate("/bandeja-entrada?validar=fuentes-e");
  };
  return (
    <Modal
      open={open}
      onClose={close}
      title="Por favor valide manualmente estas fuentes"
      width={560}
      footer={
        <>
          <Button variant="secondary" onClick={close} data-testid="manual-prompt-later">
            Más tarde
          </Button>
          <Button onClick={go} data-testid="manual-prompt-go">
            <Icon name="check" size={16} /> Validar ahora
          </Button>
        </>
      }
    >
      <div data-testid="manual-review-prompt">
        <p style={{ marginTop: 0 }}>
          Hay <strong>{due}</strong> fuente{due === 1 ? "" : "s"} de consulta manual (tipo E) por validar. La vigilancia automática
          no entra a ellas (licencia, usuario o captcha): una persona del equipo debe consultarlas y registrar lo que encuentre.
        </p>
        <ul className="mr-steps" style={{ marginBottom: 0 }}>
          {pending.slice(0, 6).map((i) => (
            <li key={i.id}>
              {i.title}
              <span style={{ color: "#64748b" }}> - {i.never_reviewed ? "nunca validada" : `vencida hace ${i.overdue_days} día(s)`}</span>
            </li>
          ))}
          {pending.length > 6 && <li>… y {pending.length - 6} más.</li>}
        </ul>
      </div>
    </Modal>
  );
}
