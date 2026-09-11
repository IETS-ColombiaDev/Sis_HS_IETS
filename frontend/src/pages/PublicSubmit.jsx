import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import Button from "../components/Button";
import { Input, Textarea, Select } from "../components/Field";
import PublicShell from "../components/PublicShell";

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
  commercial_name: "Nombre con el que se comercializa o se conoce la tecnología (marca o nombre del dispositivo).",
  inn_name: "Denominación Común Internacional: el nombre genérico del principio activo (ej. pembrolizumab). Para dispositivos, el nombre genérico del equipo.",
  mechanism: "Cómo actúa la tecnología: mecanismo biológico, principio de funcionamiento o innovación que introduce.",
  indication: "Enfermedad o condición de salud para la que se propone, y la población objetivo.",
  development_phase: "Etapa actual: ensayos fase II o III, fase IV (poscomercialización) o ya aprobada por una agencia de referencia (FDA, EMA...).",
  evidence_links: "Enlaces públicos que respaldan la postulación: registro del ensayo, artículo, decisión regulatoria. Uno por línea; deben iniciar con http:// o https://.",
  coi: "Conflicto de interés: cualquier relación económica o profesional con el fabricante que pueda sesgar la postulación. Declararlo no descarta la postulación.",
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
            .catch(() => setError("No se pudo cargar la verificación anti-robot. Revise su conexión y recargue la página."));
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
    const links = form.evidence_links
      .split(/\n|,/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (links.length === 0) {
      setError("Agregue al menos un enlace a evidencia.");
      return;
    }
    const bad = links.find((l) => !/^https?:\/\//i.test(l));
    if (bad) {
      setError(`Los enlaces deben iniciar con http:// o https:// (revise: ${bad.slice(0, 60)}).`);
      return;
    }
    if (form.has_conflict && form.conflict_statement.trim().length < 20) {
      setError("Describa el conflicto de interés (al menos 20 caracteres).");
      return;
    }
    setSending(true);
    try {
      let token = "";
      if (captcha?.recaptcha_enabled) {
        if (!recaptcha.current) {
          setError("La verificación anti-robot aún no está lista. Espere unos segundos e intente de nuevo.");
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
      if (typeof detail === "string") setError(detail);
      else if (Array.isArray(detail)) setError("Revise los campos obligatorios del formulario.");
      else setError("No se pudo enviar la postulación. Intente de nuevo en unos minutos.");
    } finally {
      setSending(false);
    }
  };

  return (
    <PublicShell
      kicker="Canal reactivo"
      title="Postular una tecnología sanitaria"
      lead="La postulación no entra sola al catálogo metodológico: el equipo del IETS la revisa, con declaración de conflicto de interés, antes de asignarla a un ciclo."
    >
      {done ? (
        <div className="public-submit-ok" data-testid="submit-ok">
          <strong>Postulación recibida.</strong>
          <p>{done.message}</p>
          <p style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <button type="button" className="linkish" onClick={() => { setDone(null); setForm(empty); }}>
              Enviar otra postulación
            </button>
            <Link to="/expedientes">Consultar expedientes publicados</Link>
          </p>
        </div>
      ) : (
        <form onSubmit={submit} noValidate={false}>
          {captcha && (
            <p className={`fb-public-note${captcha.recaptcha_enabled ? " is-ok" : ""}`} data-testid="captcha-note">
              {captcha.recaptcha_enabled
                ? captchaReady
                  ? "Formulario protegido con reCAPTCHA de Google. La verificación es invisible."
                  : "Cargando la verificación anti-robot..."
                : "Verificación anti-robot en modo degradado: el formulario funciona con controles básicos (límite de envíos por conexión)."}
            </p>
          )}
          <Input id="ps-commercial" label="Nombre comercial" hint={HINTS.commercial_name} required value={form.commercial_name} onChange={set("commercial_name")} />
          <Input id="ps-inn" label="Denominación común internacional (DCI)" hint={HINTS.inn_name} required value={form.inn_name} onChange={set("inn_name")} />
          <Textarea id="ps-mechanism" label="Mecanismo de acción" hint={HINTS.mechanism} required value={form.mechanism} onChange={set("mechanism")} />
          <Input id="ps-manufacturer" label="Fabricante o desarrollador" required value={form.manufacturer} onChange={set("manufacturer")} />
          <Textarea id="ps-indication" label="Indicación / patología" hint={HINTS.indication} required value={form.indication} onChange={set("indication")} />
          <Select id="ps-phase" label="Fase de desarrollo" hint={HINTS.development_phase} required value={form.development_phase} onChange={set("development_phase")}>
            <option value="">Seleccione...</option>
            <option value="Fase II">Fase II</option>
            <option value="Fase III">Fase III</option>
            <option value="Fase IV">Fase IV</option>
            <option value="Aprobado en agencia de referencia">Aprobado en agencia de referencia</option>
            <option value="Otro">Otro</option>
          </Select>
          <Textarea
            id="ps-links"
            label="Enlaces a evidencia (uno por línea)"
            hint={HINTS.evidence_links}
            required
            value={form.evidence_links}
            onChange={set("evidence_links")}
            placeholder="https://clinicaltrials.gov/study/NCT..."
          />

          <label className="public-check" title={HINTS.coi}>
            <input type="checkbox" checked={form.has_conflict} onChange={set("has_conflict")} />
            Declaro que existe un conflicto de interés
          </label>
          {form.has_conflict && (
            <Textarea id="ps-conflict" label="Descripción del conflicto" hint={HINTS.coi} required value={form.conflict_statement} onChange={set("conflict_statement")} />
          )}
          <label className="public-check">
            <input type="checkbox" checked={form.coi_accepted} onChange={set("coi_accepted")} required />
            Firmo la declaración de conflicto de interés. Sin esta firma la postulación no se guarda.
          </label>

          <Input id="ps-name" label="Su nombre" required value={form.submitter_name} onChange={set("submitter_name")} />
          <Input id="ps-email" label="Correo" type="email" required value={form.submitter_email} onChange={set("submitter_email")} />
          <Input id="ps-org" label="Organización" value={form.submitter_org} onChange={set("submitter_org")} />
          <div className="honeypot" aria-hidden="true">
            <input tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} />
          </div>

          {error && <p className="public-submit-error" role="alert">{error}</p>}
          <Button type="submit" loading={sending} disabled={captcha?.recaptcha_enabled && !captchaReady} style={{ width: "100%", marginTop: 8 }}>
            Enviar postulación
          </Button>
        </form>
      )}
    </PublicShell>
  );
}
