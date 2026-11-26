// Estilos base primero: los de cada componente se cargan despues y los afinan.
import "./styles/globals.css";
import "./styles/shell.css";
import "./styles/ui.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./auth/AuthContext";
import { RealtimeProvider } from "./realtime/RealtimeContext";
import { ToastProvider } from "./components/Toast";
import { BackupProvider } from "./backup/BackupContext";
import { ScanProvider } from "./scan/ScanContext";
import { BrandingProvider } from "./branding/BrandingContext";
// Al final: afina los estilos base y los de cada componente.
import "./styles/horizon.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <BrandingProvider>
        <AuthProvider>
          <RealtimeProvider>
            <BackupProvider>
              <ScanProvider>
                <App />
              </ScanProvider>
            </BackupProvider>
          </RealtimeProvider>
        </AuthProvider>
        </BrandingProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
);
