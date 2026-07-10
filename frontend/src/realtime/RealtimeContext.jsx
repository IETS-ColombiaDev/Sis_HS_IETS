import { createContext, useContext, useEffect, useRef, useState } from "react";
import api from "../api/client";
import { useAuth } from "../auth/AuthContext";

const RealtimeContext = createContext({ version: 0, updatedAt: null });

const POLL_MS = 4000;

export function RealtimeProvider({ children }) {
  const { user } = useAuth();
  const [version, setVersion] = useState(0);
  const [updatedAt, setUpdatedAt] = useState(null);
  const timer = useRef(null);

  useEffect(() => {
    if (!user) return undefined;
    let active = true;
    const poll = async () => {
      try {
        const { data } = await api.get("/realtime/version");
        if (active) {
          setVersion(data.version);
          setUpdatedAt(data.updated_at);
        }
      } catch {
        /* silencioso */
      }
    };
    poll();
    timer.current = setInterval(poll, POLL_MS);
    return () => {
      active = false;
      if (timer.current) clearInterval(timer.current);
    };
  }, [user]);

  return (
    <RealtimeContext.Provider value={{ version, updatedAt }}>{children}</RealtimeContext.Provider>
  );
}

export function useRealtime() {
  return useContext(RealtimeContext);
}
