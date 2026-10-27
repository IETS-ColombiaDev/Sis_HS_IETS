import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import api, {
  setToken,
  getToken,
  setUnauthorizedHandler,
  setLastEmail,
  getActingRole,
  setActingRole,
} from "../api/client";

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
  const [justLoggedIn, setJustLoggedIn] = useState(false);

  const logout = useCallback((notice = "") => {
    setToken(null);
    setActingRole("");
    setAccount(null);
    setJustLoggedIn(false);
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
        // "Ver como" guardado: solo vale si la cuenta real es superadministrador
        // y el servidor lo acepto; si no, se descarta.
        if (getActingRole() && !data?.acting_as) setActingRole("");
        setAccount(data);
      } catch {
        setToken(null);
        setActingRole("");
        setAccount(null);
      }
    }
    setLoading(false);
  }, [loadStatus]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const acceptSession = useCallback((data) => {
    // Un inicio de sesion (o un cambio de contrasena) arranca con el perfil propio.
    setActingRole("");
    setToken(data.access_token);
    setAccount(data.user);
    setLastEmail(data.user?.email);
    setSessionNotice("");
    setJustLoggedIn(true);
    loadStatus();
    return data.user;
  }, [loadStatus]);

  const clearJustLoggedIn = useCallback(() => setJustLoggedIn(false), []);

  const postAuth = useCallback(async (url, body) => {
    // Un reintento rapido: en Render/SQLite el primer intento a veces choca
    // con un arranque frio; el segundo suele entrar al instante.
    let lastErr;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const { data } = await api.post(url, body, { timeout: 20000 });
        return acceptSession(data);
      } catch (err) {
        lastErr = err;
        const retriable =
          err?.code === "ECONNABORTED" ||
          !err?.response ||
          (err?.response?.status >= 500 && err?.response?.status < 600);
        if (!retriable || attempt === 1) throw err;
      }
    }
    throw lastErr;
  }, [acceptSession]);

  const loginWithPassword = useCallback(
    (email, password) => postAuth("/auth/login", { email, password }),
    [postAuth]
  );

  const loginWithGoogle = useCallback(
    (credential) => postAuth("/auth/google", { credential }),
    [postAuth]
  );

  const loginDev = useCallback(
    (email, name) => postAuth("/auth/dev-login", { email, name }),
    [postAuth]
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

  /**
   * "Ver como" del superadministrador: el servidor valida y registra el cambio;
   * desde entonces cada peticion lleva la cabecera X-Acting-Role. Con
   * "superadmin" o vacio se vuelve al perfil propio.
   */
  const actAs = useCallback(async (role) => {
    const target = role && role !== "superadmin" ? role : "";
    const { data } = await api.post("/auth/acting-role", { role: target || null });
    setActingRole(data?.acting_as ? data.role : "");
    setAccount(data);
    return data;
  }, []);

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
    justLoggedIn,
    clearJustLoggedIn,
    refreshStatus: loadStatus,
    actAs,
    /** Perfil real de la cuenta (distinto de `user.role` mientras se "ve como"). */
    realRole: user?.real_role || user?.role || "",
    actingAs: Boolean(user?.acting_as),
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
