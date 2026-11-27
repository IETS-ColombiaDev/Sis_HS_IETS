import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import Button from "../components/Button";
import { Input, Textarea, Select } from "../components/Field";
import PublicShell from "../components/PublicShell";
import { t, ts, fmtDate } from "../i18n";
import "./submissions.css";

const empty = {
  commercial_name: "",
  inn_name: "",
  mechanism: "",
  manufacturer: "",
  indication: "",
  development_phase: "",
  evidence_links: "",
  has_conflict: false,
  conflict_statement: "",
  coi_accepted: false,
  submitter_name: "",
  submitter_email: "",
  submitter_org: "",
  website: "",
};

const HINTS = {
  commercial_name: t("Nombre con el que se comercializa o se conoce la tecnología (marca o nombre del dispositivo)."),
  inn_name: t("Denominación Común Internacional: el nombre genérico del principio activo (ej. pembrolizumab). Para dispositivos, el nombre genérico del equipo."),
  mechanism: t("Cómo actúa la tecnología: mecanismo biológico, principio de funcionamiento o innovación que introduce."),
  indication: t("Enfermedad o condición de salud para la que se propone, y la población objetivo."),
  development_phase: t("Etapa actual: ensayos fase II o III, fase IV (poscomercialización) o ya aprobada por una agencia de referencia (FDA, EMA...)."),
  evidence_links: t("Enlaces públicos que respaldan la postulación: registro del ensayo, artículo, decisión regulatoria. Uno por línea; deben iniciar con http:// o https://."),
  coi: t("Conflicto de interés: cualquier relación económica o profesional con el fabricante que pueda sesgar la postulación. Declararlo no descarta la postulación."),
};

/** Carga el script de reCAPTCHA v3 una sola vez. React no ejecuta <script> de JSX. */
function loadRecaptcha(siteKey) {
  return new Promise((resolve, reject) => {
    if (window.grecaptcha?.execute) {
      resolve(window.grecaptcha);
      return;
    }
    const id = "recaptcha-v3-script";
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement("script");
      el.id = id;
      el.async = true;
      el.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
      document.head.appendChild(el);
    }
    el.addEventListener("load", () => window.grecaptcha.ready(() => resolve(window.grecaptcha)));
    el.addEventListener("error", () => reject(new Error("recaptcha")));
  });
}

export default function PublicSubmit() {
  const [form, setForm] = useState(empty);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(null);
  const [error, setError] = useState("");
  const [captcha, setCaptcha] = useState(null);
  const [captchaReady, setCaptchaReady] = useState(false);
  const recaptcha = useRef(null);
  const [track, setTrack] = useState({ code: "", email: "" });
  const [tracking, setTracking] = useState(false);
  const [trackResult, setTrackResult] = useState(null);
  const [trackError, setTrackError] = useState("");
  const [copied, setCopied] = useState(false);

  const checkStatus = async (e) => {
    e.preventDefault();
    setTrackError("");
    setTrackResult(null);
    if (!track.code.trim() || !track.email.trim()) {
      setTrackError(t("Escriba el radicado y el correo con el que envió la postulación."));
      return;
    }
    setTracking(true);
    try {
      const { data } = await axios.post("/api/public/submissions/status", { code: track.code.trim(), email: track.email.trim() });
      setTrackResult(data);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setTrackError(typeof detail === "string" ? ts(detail) : t("No se pudo consultar el estado. Intente de nuevo en unos minutos."));
    } finally {
      setTracking(false);
    }
  };

  const copyCode = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  useEffect(() => {
    axios
      .get("/api/public/submissions/config")
      .then(({ data }) => {
        setCaptcha(data);
        if (data.recaptcha_enabled && data.site_key) {
          loadRecaptcha(data.site_key)
            .then((g) => {
              recaptcha.current = g;
              setCaptchaReady(true);
            })
            .catch(() => setError(t("No se pudo cargar la verificación anti-robot. Revise su conexión y recargue la página.")));
        }
      })
      .catch(() => setCaptcha({ recaptcha_enabled: false, mode: "desconocido", message: "" }));
  }, []);

  const set = (key) => (e) => {
    const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.commercial_name.trim() && !form.inn_name.trim()) {
      setError(t("La tecnología reportada es obligatoria (nombre comercial o DCI)."));
      return;
    }
    if (!form.indication.trim()) {
      setError(t("La indicación propuesta es obligatoria."));
      return;
    }
    const links = form.evidence_links
      .split(/\n|,/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (links.length === 0) {
      setError(t("La fuente de información es obligatoria: adjunte al menos un enlace."));
      return;
    }
    const bad = links.find((l) => !/^https?:\/\//i.test(l));
    if (bad) {
      setError(t("Los enlaces deben iniciar con http:// o https:// (revise: {link}).", { link: bad.slice(0, 60) }));
      return;
    }
    if (form.has_conflict && form.conflict_statement.trim().length < 20) {
      setError(t("Describa el conflicto de interés (al menos 20 caracteres)."));
      return;
    }
    setSending(true);
    try {
      let token = "";
      if (captcha?.recaptcha_enabled) {
        if (!recaptcha.current) {
          setError(t("La verificación anti-robot aún no está lista. Espere unos segundos e intente de nuevo."));
          setSending(false);
          return;
        }
        token = await recaptcha.current.execute(captcha.site_key, { action: captcha.action || "postulacion" });
      }
      const { data } = await axios.post("/api/public/submissions", {
        ...form,
        evidence_links: links,
        recaptcha_token: token,
      });
      setDone(data);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      if (typeof detail === "string") setError(ts(detail));
      else if (Array.isArray(detail)) setError(t("Revise los campos obligatorios del formulario."));
      else setError(t("No se pudo enviar la postulación. Intente de nuevo en unos minutos."));
    } finally {
      setSending(false);
    }
  };

  return (
    <PublicShell
      kicker={t("Canal reactivo")}
      title={t("Postular una tecnología sanitaria")}
      lead={t("La postulación no entra sola al catálogo metodológico: el equipo del IETS la revisa, con declaración de conflicto de interés, antes de asignarla a un ciclo.")}
    >
      <details className="ps-status" data-testid="status-check">
        <summary>{t("¿Ya postuló? Consulte el estado de su postulación")}</summary>
        <form className="ps-status-body" onSubmit={checkStatus} noValidate>
          <div className="form-two-col">
            <Input id="ps-track-code" label={t("Radicado")} placeholder="POS-2026-00001" value={track.code} onChange={(e) => setTrack((p) => ({ ...p, code: e.target.value }))} />
            <Input id="ps-track-email" label={t("Correo con el que postuló")} type="email" value={track.email} onChange={(e) => setTrack((p) => ({ ...p, email: e.target.value }))} />
          </div>
          <Button type="submit" variant="secondary" loading={tracking}>{t("Consultar estado")}</Button>
          {trackError && <p className="public-submit-error" role="alert">{trackError}</p>}
          {trackResult && (
            <div className={`ps-status-result is-${trackResult.status}`} data-testid="status-result">
              <strong>{trackResult.tracking_code} · {ts(trackResult.status_label)}</strong>
              <p style={{ margin: "4px 0 0" }}>{ts(trackResult.message)}</p>
              <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "#64748B" }}>
                {t("Recibida el {fecha}", { fecha: fmtDate(trackResult.received_at) })}
                {trackResult.resolved_at ? " · " + t("Decisión del {fecha}", { fecha: fmtDate(trackResult.resolved_at) }) : ""}
              </p>
            </div>
          )}
        </form>
      </details>

      {done ? (
        <div className="public-submit-ok" data-testid="submit-ok">
          <strong>{t("Postulación recibida.")}</strong>
          <p>{ts(done.message)}</p>
          {done.tracking_code && (
            <>
              <div className="ps-tracking" data-testid="submit-tracking">
                <span>{t("Su radicado:")}</span>
                <span className="ps-tracking-code">{done.tracking_code}</span>
                <button type="button" className="linkish" onClick={() => copyCode(done.tracking_code)}>
                  {copied ? t("Copiado") : t("Copiar")}
                </button>
              </div>
              <p>{t("Guárdelo: con el radicado y su correo puede consultar el estado de la postulación en esta misma página.")}</p>
            </>
          )}
          <p style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <button type="button" className="linkish" onClick={() => { setDone(null); setForm(empty); setCopied(false); }}>
              {t("Enviar otra postulación")}
            </button>
            <Link to="/expedientes">{t("Consultar expedientes publicados")}</Link>
          </p>
        </div>
      ) : (
        <form onSubmit={submit} noValidate={false}>
          {captcha && (
            <p className={`fb-public-note${captcha.recaptcha_enabled ? " is-ok" : ""}`} data-testid="captcha-note">
              {captcha.recaptcha_enabled
                ? captchaReady
                  ? t("Formulario protegido con reCAPTCHA de Google. La verificación es invisible.")
                  : t("Cargando la verificación anti-robot...")
                : t("Verificación anti-robot en modo degradado: el formulario funciona con controles básicos (límite de envíos por conexión).")}
            </p>
          )}
          <fieldset className="ps-section">
            <legend><span>1</span> {t("Datos obligatorios")}</legend>
            <p className="fb-public-note">
              {t("Tecnología reportada: escriba el nombre comercial, la DCI o ambos. Basta con uno.")}
            </p>
            <div className="form-two-col">
              <Input id="ps-commercial" label={t("Tecnología reportada: nombre comercial")} hint={HINTS.commercial_name} value={form.commercial_name} onChange={set("commercial_name")} />
              <Input id="ps-inn" label={t("Tecnología reportada: DCI")} hint={HINTS.inn_name} value={form.inn_name} onChange={set("inn_name")} />
            </div>
            <Textarea id="ps-indication" label={t("Indicación propuesta")} hint={HINTS.indication} required rows={3} value={form.indication} onChange={set("indication")} help={t("Enfermedad o condición y población a la que se destina.")} />
            <Textarea
              id="ps-links"
              label={t("Fuente de información (enlaces, uno por línea)")}
              hint={HINTS.evidence_links}
              required
              rows={3}
              value={form.evidence_links}
              onChange={set("evidence_links")}
              placeholder="https://clinicaltrials.gov/study/NCT..."
              help={t("ClinicalTrials.gov, FDA, EMA, artículos o comunicados oficiales. Deben iniciar con http:// o https://.")}
            />
          </fieldset>

          <fieldset className="ps-section">
            <legend><span>2</span> {t("Información complementaria")}</legend>
            <p className="fb-public-note" data-testid="complementary-note">
              {t("Estos campos son opcionales. Si no tiene el dato, puede escribir «No disponible».")}
            </p>
            <div className="form-two-col">
              <Input id="ps-manufacturer" label={t("Fabricante o desarrollador")} value={form.manufacturer} onChange={set("manufacturer")} />
              <Select id="ps-phase" label={t("Fase de desarrollo")} hint={HINTS.development_phase} value={form.development_phase} onChange={set("development_phase")}>
                <option value="">{t("Seleccione...")}</option>
                <option value="Fase II">{t("Fase II")}</option>
                <option value="Fase III">{t("Fase III")}</option>
                <option value="Fase IV">{t("Fase IV")}</option>
                <option value="Aprobado en agencia de referencia">{t("Aprobado en agencia de referencia")}</option>
                <option value="Otro">{t("Otro")}</option>
                <option value="No disponible">{t("No disponible")}</option>
              </Select>
            </div>
            <Textarea id="ps-mechanism" label={t("Mecanismo de acción")} hint={HINTS.mechanism} rows={3} value={form.mechanism} onChange={set("mechanism")} />
          </fieldset>

          <fieldset className="ps-section">
            <legend><span>3</span> {t("Conflicto de interés")}</legend>
            <label className="public-check" title={HINTS.coi}>
              <input type="checkbox" checked={form.has_conflict} onChange={set("has_conflict")} />
              <span>{t("Declaro que existe un conflicto de interés")}</span>
            </label>
            {form.has_conflict && (
              <Textarea id="ps-conflict" label={t("Descripción del conflicto")} hint={HINTS.coi} required value={form.conflict_statement} onChange={set("conflict_statement")} />
            )}
            <label className="public-check">
              <input type="checkbox" checked={form.coi_accepted} onChange={set("coi_accepted")} required />
              <span>{t("Firmo la declaración de conflicto de interés. Sin esta firma la postulación no se guarda.")}</span>
            </label>
          </fieldset>

          <fieldset className="ps-section">
            <legend><span>4</span> {t("Sus datos de contacto")}</legend>
            <div className="form-two-col">
              <Input id="ps-name" label={t("Su nombre")} value={form.submitter_name} onChange={set("submitter_name")} help={t("Opcional.")} />
              <Input id="ps-email" label={t("Correo")} type="email" required value={form.submitter_email} onChange={set("submitter_email")} help={t("Le escribimos solo sobre esta postulación.")} />
            </div>
            <Input id="ps-org" label={t("Organización")} value={form.submitter_org} onChange={set("submitter_org")} help={t("Opcional.")} />
          </fieldset>
          <div className="honeypot" aria-hidden="true">
            <input tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} />
          </div>

          {error && <p className="public-submit-error" role="alert">{error}</p>}
          <Button type="submit" loading={sending} disabled={captcha?.recaptcha_enabled && !captchaReady} style={{ width: "100%", marginTop: 8 }}>
            {t("Enviar postulación")}
          </Button>
        </form>
      )}
    </PublicShell>
  );
}
