import { useEffect, useState } from "react";
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

export default function PublicSubmit() {
  const [form, setForm] = useState(empty);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(null);
  const [error, setError] = useState("");
  const [siteKey, setSiteKey] = useState("");

  useEffect(() => {
    axios
      .get("/api/status")
      .then((r) => setSiteKey(r.data.recaptcha_site_key || ""))
      .catch(() => {});
  }, []);

  const set = (key) => (e) => {
    const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setSending(true);
    try {
      let token = "";
      if (siteKey && window.grecaptcha?.execute) {
        token = await window.grecaptcha.execute(siteKey, { action: "submit" });
      }
      const links = form.evidence_links
        .split(/\n|,/)
        .map((s) => s.trim())
        .filter(Boolean);
      const { data } = await axios.post("/api/public/submissions", {
        ...form,
        evidence_links: links,
        recaptcha_token: token,
      });
      setDone(data);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "No se pudo enviar la postulacion.");
    } finally {
      setSending(false);
    }
  };

  return (
    <PublicShell
      kicker="Canal reactivo"
      title="Postular una tecnologia sanitaria"
      lead="La postulacion no entra sola al catalogo metodologico: el equipo del IETS la revisa, con declaracion de conflicto de interes, antes de asignarla a un ciclo."
    >
      {siteKey && (
        <script src={`https://www.google.com/recaptcha/api.js?render=${siteKey}`} async />
      )}
        {done ? (
          <div className="public-submit-ok">
            <strong>Postulacion recibida.</strong>
            <p>{done.message}</p>
            <Link to="/login">Volver al inicio de sesion</Link>
          </div>
        ) : (
          <form onSubmit={submit}>
            <Input
              label="Nombre comercial"
              required
              value={form.commercial_name}
              onChange={set("commercial_name")}
            />
            <Input
              label="Denominacion comun internacional (DCI)"
              required
              value={form.inn_name}
              onChange={set("inn_name")}
            />
            <Textarea
              label="Mecanismo de accion"
              required
              value={form.mechanism}
              onChange={set("mechanism")}
            />
            <Input
              label="Fabricante o desarrollador"
              required
              value={form.manufacturer}
              onChange={set("manufacturer")}
            />
            <Textarea
              label="Indicacion / patologia"
              required
              value={form.indication}
              onChange={set("indication")}
            />
            <Select
              label="Fase de desarrollo"
              required
              value={form.development_phase}
              onChange={set("development_phase")}
            >
              <option value="">Seleccione...</option>
              <option value="Fase II">Fase II</option>
              <option value="Fase III">Fase III</option>
              <option value="Fase IV">Fase IV</option>
              <option value="Aprobado en agencia de referencia">
                Aprobado en agencia de referencia
              </option>
              <option value="Otro">Otro</option>
            </Select>
            <Textarea
              label="Enlaces a evidencia (uno por linea)"
              required
              value={form.evidence_links}
              onChange={set("evidence_links")}
              placeholder="https://clinicaltrials.gov/study/NCT..."
            />

            <label className="public-check">
              <input type="checkbox" checked={form.has_conflict} onChange={set("has_conflict")} />
              Declaro que existe un conflicto de interes
            </label>
            {form.has_conflict && (
              <Textarea
                label="Descripcion del conflicto"
                required
                value={form.conflict_statement}
                onChange={set("conflict_statement")}
              />
            )}
            <label className="public-check">
              <input type="checkbox" checked={form.coi_accepted} onChange={set("coi_accepted")} required />
              Firmo la declaracion de conflicto de interes. Sin esta firma la postulacion no se guarda.
            </label>

            <Input label="Su nombre" required value={form.submitter_name} onChange={set("submitter_name")} />
            <Input
              label="Correo"
              type="email"
              required
              value={form.submitter_email}
              onChange={set("submitter_email")}
            />
            <Input
              label="Organizacion"
              value={form.submitter_org}
              onChange={set("submitter_org")}
            />
            <div className="honeypot" aria-hidden="true">
              <input tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} />
            </div>

            {error && <p className="public-submit-error">{error}</p>}
            <Button type="submit" loading={sending} style={{ width: "100%", marginTop: 8 }}>
              Enviar postulacion
            </Button>
          </form>
        )}

    </PublicShell>
  );
}
