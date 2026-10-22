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

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <RealtimeProvider>
            <BackupProvider>
              <App />
            </BackupProvider>
          </RealtimeProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
);
