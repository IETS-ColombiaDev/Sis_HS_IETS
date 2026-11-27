import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import api from "../api/client";
import Icon from "../components/Icon";
import { t } from "../i18n";

/**
 * Identidad institucional: el logo que el administrador carga en Configuración.
 * Lo usan el menú lateral, el ingreso y las pantallas públicas. La última copia
 * se guarda en el navegador para pintarla de inmediato al volver a entrar.
 */
const CACHE_KEY = "iets_hs_brand";
const BrandingContext = createContext({ logo: "", version: "", apply: () => {}, refresh: () => {} });

function readCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    return raw && typeof raw.logo === "string" ? raw : { logo: "", version: "" };
  } catch {
    return { logo: "", version: "" };
  }
}

function writeCache(value) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(value));
  } catch {
    /* modo privado o sin espacio: el logo se vuelve a pedir al entrar */
  }
}

export function BrandingProvider({ children }) {
  const [brand, setBrand] = useState(readCache);

  const apply = useCallback((value) => {
    const next = { logo: value?.logo || "", version: value?.version || "" };
    setBrand(next);
    writeCache(next);
  }, []);

  const refresh = useCallback(() => {
    api
      .get("/branding")
      .then(({ data }) => apply(data))
      .catch(() => {
        /* sin red: se conserva la copia del navegador */
      });
  }, [apply]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(() => ({ ...brand, apply, refresh }), [brand, apply, refresh]);
  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  return useContext(BrandingContext);
}

/**
 * Distintivo de la aplicación: el logo cargado o, si no hay, el ícono del sistema.
 * `className` es la caja que ya usaba cada pantalla; con logo se le agrega `has-logo`.
 */
export function BrandMark({ className = "", iconSize = 22 }) {
  const { logo } = useBranding();
  if (logo) {
    return (
      <div className={`${className} brand-mark has-logo`.trim()}>
        <img src={logo} alt={t("Logo institucional")} />
      </div>
    );
  }
  return (
    <div className={`${className} brand-mark`.trim()} aria-hidden="true">
      <Icon name="radar" size={iconSize} strokeWidth={2} />
    </div>
  );
}
