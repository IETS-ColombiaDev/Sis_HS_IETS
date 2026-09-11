import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import api, { setToken, getToken, setUnauthorizedHandler } from "../api/client";

const AuthContext = createContext(null);

/**
 * Sesion del usuario.
 *
 * `account` es la cuenta autenticada tal como la devuelve la API. `user` solo
 * existe cuando la cuenta puede operar: con una contrasena temporal pendiente
 * de cambio, `user` es null y `pendingPasswordChange` trae la cuenta, de modo
 * que ninguna pantalla ni contexto dispare peticiones que la API rechazaria.
 */
export function AuthProvider({ children }) {
  const [account, setAccount] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionNotice, setSessionNotice] = useState("");

  const logout = useCallback((notice = "") => {
    setToken(null);
    setAccount(null);
    setSessionNotice(typeof notice === "string" ? notice : "");
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (getToken()) logout("Su sesión terminó. Ingrese de nuevo para continuar.");
    });
  }, [logout]);

  const loadStatus = useCallback(async () => {
    try {
      const { data } = await api.get("/status");
      setStatus(data);
    } catch {
      setStatus(null);
    }
  }, []);

  const bootstrap = useCallback(async () => {
    await loadStatus();
    const token = getToken();
    if (token) {
      try {
        const { data } = await api.get("/auth/me");
        setAccount(data);
      } catch {
        setToken(null);
        setAccount(null);
      }
    }
    setLoading(false);
  }, [loadStatus]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const acceptSession = useCallback((data) => {
    setToken(data.access_token);
    setAccount(data.user);
    setSessionNotice("");
    return data.user;
  }, []);

  const loginWithPassword = useCallback(
    async (email, password) => {
      const { data } = await api.post("/auth/login", { email, password });
      return acceptSession(data);
    },
    [acceptSession]
  );

  const loginWithGoogle = useCallback(
    async (credential) => {
      const { data } = await api.post("/auth/google", { credential });
      return acceptSession(data);
    },
    [acceptSession]
  );

  const loginDev = useCallback(
    async (email, name) => {
      const { data } = await api.post("/auth/dev-login", { email, name });
      return acceptSession(data);
    },
    [acceptSession]
  );

  const changePassword = useCallback(
    async (currentPassword, newPassword) => {
      const { data } = await api.post("/auth/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
      });
      return acceptSession(data);
    },
    [acceptSession]
  );

  const user = account && !account.must_change_password ? account : null;
  const permissions = useMemo(() => new Set(user?.permissions || []), [user]);
  const can = useCallback((permission) => permissions.has(permission), [permissions]);

  const value = {
    user,
    account,
    pendingPasswordChange: account?.must_change_password ? account : null,
    status,
    loading,
    sessionNotice,
    loginWithPassword,
    loginWithGoogle,
    loginDev,
    changePassword,
    logout,
    refreshStatus: loadStatus,
    can,
    permissions,
    /** Criterios P1 a P6 que este perfil puede calificar. */
    rateableCriteria: user?.rateable_criteria || [],
    // Compatibilidad: se derivan de la matriz de permisos, no del nombre del rol.
    isEditor: can("technology:write"),
    isAdmin: can("user:manage"),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
