import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import api, { setToken, getToken, setUnauthorizedHandler } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => logout());
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
        setUser(data);
      } catch {
        setToken(null);
        setUser(null);
      }
    }
    setLoading(false);
  }, [loadStatus]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const loginWithGoogle = useCallback(async (credential) => {
    const { data } = await api.post("/auth/google", { credential });
    setToken(data.access_token);
    setUser(data.user);
    return data.user;
  }, []);

  const loginDev = useCallback(async (email, name) => {
    const { data } = await api.post("/auth/dev-login", { email, name });
    setToken(data.access_token);
    setUser(data.user);
    return data.user;
  }, []);

  const permissions = useMemo(() => new Set(user?.permissions || []), [user]);
  const can = useCallback((permission) => permissions.has(permission), [permissions]);

  const value = {
    user,
    status,
    loading,
    loginWithGoogle,
    loginDev,
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
