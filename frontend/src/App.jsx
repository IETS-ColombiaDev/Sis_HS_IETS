import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import Layout from "./components/Layout";
import { LoadingBlock } from "./components/Spinner";
import Login from "./pages/Login";
import ForcePasswordChange from "./pages/ForcePasswordChange";
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
import Evaluation from "./pages/Evaluation";
import ReviewerPortal from "./pages/ReviewerPortal";
import Cycles from "./pages/Cycles";
import Staging from "./pages/Staging";
import Screening from "./pages/Screening";
import Prioritization from "./pages/Prioritization";
import Audit from "./pages/Audit";
import PublicSubmit from "./pages/PublicSubmit";
import PublicCatalog from "./pages/PublicCatalog";
import PublicFiche from "./pages/PublicFiche";
import PublicStats from "./pages/PublicStats";
import Bulletins from "./pages/Bulletins";
import Alerts from "./pages/Alerts";
import Submissions from "./pages/Submissions";
import { CycleProvider } from "./cycle/CycleContext";
import ErrorBoundary from "./components/ErrorBoundary";

/** Protege una ruta por autenticacion y, opcionalmente, por permiso RBAC. */
function Protected({ children, permission }) {
  const { user, can } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (permission && !can(permission)) return <Navigate to="/" replace />;
  return (
    <Layout>
      <ErrorBoundary title="Esta pantalla se detuvo" hint="El menú sigue disponible. Reintente o cambie de módulo.">
        {children}
      </ErrorBoundary>
    </Layout>
  );
}

function LegacyRedirect({ to }) {
  return <Navigate to={to} replace />;
}

export default function App() {
  const { loading, user, pendingPasswordChange } = useAuth();

  if (loading) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <LoadingBlock label="Iniciando el sistema..." />
      </div>
    );
  }

  // Con contrasena temporal no se abre ninguna pantalla interna hasta cambiarla.
  if (pendingPasswordChange) return <ForcePasswordChange />;

  return (
    <CycleProvider>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/postular" element={<PublicSubmit />} />
        <Route path="/revisar/:token" element={<ReviewerPortal />} />
        <Route path="/expedientes" element={<PublicCatalog />} />
        <Route path="/expedientes/:id" element={<PublicFiche />} />
        <Route path="/transparencia" element={<PublicStats />} />
        <Route path="/" element={<Protected><Dashboard /></Protected>} />
        <Route path="/dashboards" element={<Protected><Dashboards /></Protected>} />

        {/* Fase 1 - Identificacion y ciclo operativo */}
        <Route path="/vigilancia" element={<Protected><Scan /></Protected>} />
        <Route path="/fuentes" element={<Protected><Sources /></Protected>} />
        <Route path="/bandeja-entrada" element={<Protected><Staging /></Protected>} />
        <Route path="/postulaciones" element={<Protected><Submissions /></Protected>} />
        <Route path="/ciclos" element={<Protected><Cycles /></Protected>} />
        <Route path="/senales" element={<Protected><Findings /></Protected>} />

        {/* Fase 3 del plan - Filtrado, desduplicacion e INVIMA */}
        <Route path="/filtrado" element={<Protected><Screening /></Protected>} />

        {/* Fase 2 - Priorizacion oficial %P */}
        <Route path="/priorizacion" element={<Protected><Prioritization /></Protected>} />

        {/* Fase 5 */}
        <Route path="/evaluacion" element={<Protected><Evaluation /></Protected>} />
        <Route path="/caracterizacion" element={<LegacyRedirect to="/evaluacion" />} />

        {/* Diseminacion heredada; boletines y ficha publica son fase 6 */}
        <Route path="/diseminacion" element={<Protected><Recommendations /></Protected>} />
        <Route path="/boletines" element={<Protected><Bulletins /></Protected>} />
        <Route path="/alertas" element={<Protected><Alerts /></Protected>} />
        <Route path="/notas" element={<Protected><Notes /></Protected>} />
        <Route path="/chat" element={<Protected><Chat /></Protected>} />

        {/* Administracion */}
        <Route path="/auditoria" element={<Protected permission="audit:read"><Audit /></Protected>} />
        <Route path="/usuarios" element={<Protected permission="user:manage"><Users /></Protected>} />
        <Route path="/configuracion" element={<Protected permission="config:manage"><Settings /></Protected>} />

        {/* Rutas heredadas: se conservan durante dos ciclos operativos completos */}
        <Route path="/escaneo" element={<LegacyRedirect to="/vigilancia" />} />
        <Route path="/hallazgos" element={<LegacyRedirect to="/senales" />} />
        <Route path="/recomendaciones" element={<LegacyRedirect to="/diseminacion" />} />
        <Route path="/staging" element={<LegacyRedirect to="/bandeja-entrada" />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </CycleProvider>
  );
}
