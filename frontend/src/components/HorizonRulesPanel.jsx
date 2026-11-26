import { useCallback, useEffect, useState } from "react";
import api, { apiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Card, SectionTitle } from "./Card";
import Button from "./Button";
import { Select, Textarea } from "./Field";
import { LoadingBlock } from "./Spinner";
import { PERM } from "../constants/methodology";
import { t } from "../i18n";

const NOTICE = t("Los cambios aplican a las señales que se capturen desde ahora; las ya capturadas no se reclasifican");

const LEVELS = [
  { id: "inminente", label: t("Inminente"), help: t("Se evalúa primero: si alguna palabra coincide, la señal queda como inminente.") },
  { id: "transicional", label: t("Transicional"), help: t("Se evalúa si no coincidió ninguna palabra de inminente.") },
  { id: "emergente", label: t("Emergente"), help: t("Se evalúa al final, si no coincidieron las anteriores.") },
];

const toText = (terms) => (terms || []).join("\n");
const toTerms = (text) =>
  text
    .split("\n")
    .map((term) => term.trim().replace(/\s+/g, " "))
    .filter(Boolean);

function toDraft(rules) {
  return {
    inminente: toText(rules.inminente),
    transicional: toText(rules.transicional),
    emergente: toText(rules.emergente),
    default: rules.default || "",
  };
}

/**
 * Reglas de horizonte para paginas web (solo superadministrador): palabras o
 * frases simples por horizonte y valor por defecto. Cada cambio queda en la bitacora.
 */
export default function HorizonRulesPanel({ toast }) {
  const { can } = useAuth();
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data: res } = await api.get("/config/horizon-rules");
      setData(res);
      setDraft(toDraft(res));
    } catch (e) {
      toast.error(apiError(e, t("No se pudieron cargar las reglas de horizonte")));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!can(PERM.CONFIG_MANAGE)) return null;
  if (!draft) return <LoadingBlock label={t("Cargando reglas de horizonte...")} />;

  const payload = {
    inminente: toTerms(draft.inminente),
    transicional: toTerms(draft.transicional),
    emergente: toTerms(draft.emergente),
    default: draft.default,
  };
  const dirty = JSON.stringify(payload) !== JSON.stringify({
    inminente: data.inminente,
    transicional: data.transicional,
    emergente: data.emergente,
    default: data.default,
  });

  const save = async () => {
    const empty = LEVELS.find((l) => payload[l.id].length === 0);
    if (empty) {
      toast.error(t('La lista de "{label}" no puede quedar vacía.', { label: empty.label }));
      return;
    }
    setSaving(true);
    try {
      const { data: res } = await api.put("/config/horizon-rules", payload);
      setData(res);
      setDraft(toDraft(res));
      toast.success(t("Reglas de horizonte guardadas"));
    } catch (e) {
      toast.error(apiError(e, t("No se pudieron guardar las reglas de horizonte")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card data-testid="horizon-rules-panel">
      <SectionTitle>{t("Reglas de horizonte")}</SectionTitle>
      <p style={{ fontSize: 13, color: "#64748B", marginTop: -6 }}>
        {t("Clasifican por horizonte las señales extraídas de páginas web. Escriba una palabra o frase simple por línea (no expresiones regulares): se compara la palabra completa, sin distinguir mayúsculas ni tildes. No aplica a los conectores de bases de datos ni a la clasificación hecha por la IA.")}
      </p>
      <div
        role="note"
        style={{
          background: "#FFFBEB",
          border: "1px solid #FDE68A",
          color: "#92400E",
          borderRadius: 8,
          padding: "10px 12px",
          fontSize: 13,
          marginBottom: 16,
        }}
      >
        {NOTICE}
      </div>
      {LEVELS.map((l) => (
        <Textarea
          key={l.id}
          id={`horizon-${l.id}`}
          label={t("{label} ({n} términos)", { label: l.label, n: toTerms(draft[l.id]).length })}
          help={l.help}
          rows={6}
          value={draft[l.id]}
          onChange={(e) => setDraft({ ...draft, [l.id]: e.target.value })}
        />
      ))}
      <Select
        id="horizon-default"
        label={t("Horizonte por defecto (si ninguna palabra coincide)")}
        value={draft.default}
        onChange={(e) => setDraft({ ...draft, default: e.target.value })}
      >
        <option value="">{t("Sin determinar")}</option>
        <option value="emergente">{t("Emergente")}</option>
        <option value="transicional">{t("Transicional")}</option>
        <option value="inminente">{t("Inminente")}</option>
      </Select>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button onClick={save} disabled={saving || !dirty}>
          {saving ? t("Guardando...") : t("Guardar reglas")}
        </Button>
        <Button variant="secondary" onClick={() => setDraft(toDraft(data.defaults))} disabled={saving}>
          {t("Restaurar valores iniciales")}
        </Button>
        {dirty && (
          <Button variant="secondary" onClick={() => setDraft(toDraft(data))} disabled={saving}>
            {t("Descartar cambios")}
          </Button>
        )}
      </div>
    </Card>
  );
}
