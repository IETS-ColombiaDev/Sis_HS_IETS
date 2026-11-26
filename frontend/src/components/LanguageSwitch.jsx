import { LANGUAGES, getLanguage, setLanguage, t } from "../i18n";

/**
 * Selector de idioma: español, inglés británico e inglés americano.
 * Cambiarlo recarga la página (ver i18n/index.js). `tone="dark"` para fondos azules.
 */
export default function LanguageSwitch({ tone = "light", className = "" }) {
  return (
    <label className={`lang-switch lang-switch--${tone} ${className}`.trim()}>
      <span className="sr-only">{t("Idioma de la interfaz")}</span>
      <span className="lang-switch-icon" aria-hidden="true">🌐</span>
      <select
        value={getLanguage()}
        onChange={(ev) => setLanguage(ev.target.value)}
        aria-label={t("Idioma de la interfaz")}
        title={t("Idioma de la interfaz")}
        data-testid="language-switch"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code} lang={l.html}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
