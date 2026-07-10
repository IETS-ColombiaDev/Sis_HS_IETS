import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import Layout from "./components/Layout";
import { LoadingBlock } from "./components/Spinner";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Dashboards from "./pages/Dashboards";
import Sources from "./pages/Sources";
import Findings from "./pages/Findings";
import Scan from "./pages/Scan";
import Recommendations from "./pages/Recommendations";
import Notes from "./pages/Notes";
import Chat from "./pages/Chat";
import Users from "./pages/Users";
import Settings from "./pages/Settings";

function Protected({ children, adminOnly }) {
  const { user, isAdmin } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  const { loading, user } = useAuth();

  if (loading) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <LoadingBlock label="Iniciando el sistema..." />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<Protected><Dashboard /></Protected>} />
      <Route path="/dashboards" element={<Protected><Dashboards /></Protected>} />
      <Route path="/fuentes" element={<Protected><Sources /></Protected>} />
      <Route path="/hallazgos" element={<Protected><Findings /></Protected>} />
      <Route path="/escaneo" element={<Protected><Scan /></Protected>} />
      <Route path="/notas" element={<Protected><Notes /></Protected>} />
      <Route path="/recomendaciones" element={<Protected><Recommendations /></Protected>} />
      <Route path="/chat" element={<Protected><Chat /></Protected>} />
      <Route path="/usuarios" element={<Protected adminOnly><Users /></Protected>} />
      <Route path="/configuracion" element={<Protected adminOnly><Settings /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
