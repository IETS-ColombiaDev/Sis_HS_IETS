import { useAuth } from "../auth/AuthContext";
import { useToast } from "../components/Toast";
import ChangePasswordForm from "../components/ChangePasswordForm";

/** Primer ingreso con contrasena temporal: se cambia antes de operar. */
export default function ForcePasswordChange() {
  const { pendingPasswordChange: account, logout } = useAuth();
  const toast = useToast();
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "#F8FAFC" }}>
      <main
        style={{
          width: "100%",
          maxWidth: 460,
          background: "#fff",
          border: "1px solid #E2E8F0",
          borderRadius: 16,
          padding: 32,
          boxShadow: "var(--shadow-md)",
        }}
      >
        <div style={{ fontSize: 34 }} aria-hidden="true">🔐</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginTop: 8 }}>Cree su contraseña personal</h1>
        <p style={{ color: "#64748B", fontSize: 14, marginTop: 6, marginBottom: 20, lineHeight: 1.6 }}>
          Hola{account?.name ? `, ${account.name}` : ""}. Ingreso con una contraseña temporal asignada por el
          administrador. Por seguridad, reemplácela ahora: nadie más, ni siquiera el administrador, conocerá la nueva.
        </p>
        <ChangePasswordForm
          forced
          onDone={() => toast.success("Contraseña actualizada. Bienvenido al sistema.")}
          onCancel={() => logout()}
        />
      </main>
    </div>
  );
}
