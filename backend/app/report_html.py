"""Plantillas HTML institucionales para fichas, informes, Mini-HTA y boletines."""
from __future__ import annotations

from html import escape

from . import evaluation as catalog


def _paras(text: str) -> str:
    raw = (text or "").strip() or "—"
    parts = [p.strip() for p in raw.split("\n") if p.strip()]
    if not parts:
        return "<p>—</p>"
    return "".join(f"<p>{escape(p)}</p>" for p in parts)


def render_evaluation_html(doc, tech=None, cycle_code: str = "") -> str:
    body = doc.body or {}
    fields = catalog.required_fields(doc.product_level)
    groups = [("Identificación y contexto", [k for k in fields if k in catalog.FICHA_FIELDS])]
    extra = [k for k in fields if k in catalog.INFORME_EXTRA_FIELDS]
    pico = [k for k in fields if k in catalog.MINI_HTA_EXTRA_FIELDS]
    if extra:
        groups.append(("Evaluación temprana", extra))
    if pico:
        groups.append(("Mini-HTA · PICO e impacto", pico))
    optional = []
    if (body.get("early_dialogue_notes") or "").strip():
        optional.append("early_dialogue_notes")
    if optional:
        groups.append(("Diálogo temprano", optional))

    sections = []
    index = 1
    for title, keys in groups:
        if not keys:
            continue
        blocks = []
        for key in keys:
            label = catalog.FIELD_LABELS.get(key, key)
            blocks.append(
                f"<article class='block'><h3>{escape(label)}</h3>{_paras(str(body.get(key) or ''))}</article>"
            )
        sections.append(
            f"<section class='chapter'><div class='chapter-num'>0{index}</div>"
            f"<h2>{escape(title)}</h2>{''.join(blocks)}</section>"
        )
        index += 1

    tech_name = escape((getattr(tech, "commercial_name", None) or doc.title or "Tecnología"))
    inn = escape((getattr(tech, "inn_name", None) or ""))
    maker = escape((getattr(tech, "manufacturer", None) or ""))
    level = escape(catalog.PRODUCT_LEVEL_LABELS.get(doc.product_level, doc.product_level))
    status = escape(catalog.EDITORIAL_STATUS_LABELS.get(doc.status, doc.status))
    version = f"{doc.version_major}.{doc.version_minor}"
    confidential = "CONFIDENCIAL" if doc.confidential else "USO INSTITUCIONAL"
    cycle = escape(cycle_code or "")
    return f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <title>{escape(doc.title or tech_name)} — IETS</title>
  <style>
    @page {{ margin: 16mm 14mm; }}
    :root {{ --ink:#0F172A; --muted:#64748B; --line:#E2E8F0; --brand:#1D4ED8; --brand-2:#0F766E; --paper:#F8FAFC; }}
    * {{ box-sizing: border-box; }}
    body {{ margin:0; font-family: "Segoe UI", "Calibri", Arial, sans-serif; color:var(--ink); background:#fff; }}
    .sheet {{ max-width: 880px; margin: 0 auto; padding: 8px 4px 24px; }}
    .mast {{ display:flex; justify-content:space-between; gap:16px; align-items:flex-start;
      border-bottom: 3px solid var(--brand); padding-bottom: 16px; margin-bottom: 20px; }}
    .brand-mark {{ width:48px; height:48px; border-radius:12px; background: linear-gradient(135deg,#1D4ED8,#0F766E);
      color:#fff; font-weight:800; display:flex; align-items:center; justify-content:center; font-size:13px; }}
    .kicker {{ letter-spacing:.16em; text-transform:uppercase; font-size:10px; color:var(--brand); font-weight:800; }}
    h1 {{ font-size: 22px; line-height:1.25; margin: 8px 0 6px; }}
    .sub {{ color:var(--muted); font-size:13px; }}
    .stamps {{ display:flex; flex-direction:column; gap:6px; align-items:flex-end; }}
    .stamp {{ font-size:10px; font-weight:800; letter-spacing:.06em; border:1px solid #F59E0B; color:#92400E;
      background:#FFFBEB; padding:4px 8px; border-radius:999px; }}
    .stamp.ok {{ border-color:#A7F3D0; color:#065F46; background:#ECFDF5; }}
    .meta {{ display:grid; grid-template-columns: repeat(4, 1fr); gap:10px; background:var(--paper);
      border:1px solid var(--line); border-radius:12px; padding:12px 14px; margin-bottom: 22px; }}
    .meta b {{ display:block; font-size:10px; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); }}
    .meta span {{ font-size:13px; font-weight:700; }}
    .chapter {{ margin: 22px 0; }}
    .chapter-num {{ font-size:11px; font-weight:800; color:var(--brand-2); letter-spacing:.14em; }}
    .chapter > h2 {{ font-size:16px; margin: 4px 0 12px; color:#134E4A; }}
    .block {{ background:#fff; border:1px solid var(--line); border-left:4px solid var(--brand);
      border-radius:10px; padding:12px 14px; margin: 0 0 10px; page-break-inside: avoid; }}
    .block h3 {{ font-size:13px; margin:0 0 6px; color:#1E3A8A; }}
    .block p {{ margin:0 0 8px; line-height:1.55; font-size:13.5px; }}
    .block p:last-child {{ margin:0; }}
    footer {{ margin-top: 28px; border-top:1px solid var(--line); padding-top:10px; font-size:11px; color:var(--muted); }}
    @media print {{ .sheet {{ max-width:none; }} .block {{ break-inside: avoid; }} }}
  </style>
</head>
<body>
  <div class="sheet">
    <header class="mast">
      <div>
        <div style="display:flex; gap:12px; align-items:center">
          <div class="brand-mark">IETS</div>
          <div>
            <div class="kicker">Instituto de Evaluación Tecnológica en Salud · Colombia</div>
            <div class="sub">Escaneo de horizonte · evaluación temprana de tecnologías sanitarias</div>
          </div>
        </div>
        <h1>{escape(doc.title or tech_name)}</h1>
        <div class="sub">{tech_name}{f" · DCI {inn}" if inn else ""}{f" · {maker}" if maker else ""}</div>
      </div>
      <div class="stamps">
        <div class="stamp {"ok" if doc.status == "publicado" else ""}">{escape(confidential)}</div>
        <div class="stamp ok">{level}</div>
      </div>
    </header>
    <div class="meta">
      <div><b>Producto</b><span>{level}</span></div>
      <div><b>Estado editorial</b><span>{status}</span></div>
      <div><b>Ciclo</b><span>{cycle or "—"}</span></div>
      <div><b>Versión</b><span>v{escape(version)}</span></div>
    </div>
    {''.join(sections)}
    <footer>
      Documento generado por la plataforma de escaneo de horizonte del IETS.
      Uso institucional. La adopción en el SGSSS requiere ruta INVIMA y concepto de ETS cuando corresponda.
    </footer>
  </div>
</body>
</html>"""


def render_bulletin_html(bulletin) -> str:
    body = bulletin.body or {}
    funnel = body.get("funnel") or {}
    cluster_rows = "".join(
        f"<tr><td>{escape(str(i.get('label') or '—'))}</td><td>{int(i.get('value') or 0)}</td></tr>"
        for i in body.get("by_cluster") or []
    )
    band_rows = "".join(
        f"<tr><td>{escape(str(i.get('label') or '—'))}</td><td>{int(i.get('value') or 0)}</td></tr>"
        for i in body.get("by_band") or []
    )
    return f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <title>{escape(bulletin.title)}</title>
  <style>
    @page {{ margin: 16mm; }}
    body {{ margin:0; font-family:"Segoe UI", Calibri, Arial, sans-serif; color:#0F172A; }}
    .sheet {{ max-width:900px; margin:0 auto; padding:8px 6px 24px; }}
    header {{ border-bottom:3px solid #1D4ED8; padding-bottom:14px; margin-bottom:18px; }}
    .kicker {{ letter-spacing:.16em; text-transform:uppercase; font-size:10px; color:#1D4ED8; font-weight:800; }}
    h1 {{ font-size:22px; margin:8px 0 4px; }}
    .kpis {{ display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin:16px 0 22px; }}
    .kpi {{ border:1px solid #E2E8F0; border-radius:12px; padding:12px; background:#F8FAFC; }}
    .kpi b {{ display:block; font-size:26px; color:#1D4ED8; }}
    .kpi span {{ font-size:11px; color:#64748B; text-transform:uppercase; letter-spacing:.06em; font-weight:700; }}
    table {{ width:100%; border-collapse:collapse; margin: 8px 0 20px; }}
    th, td {{ text-align:left; padding:8px 10px; border-bottom:1px solid #E2E8F0; font-size:13px; }}
    th {{ font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:#64748B; }}
    footer {{ font-size:11px; color:#94A3B8; border-top:1px solid #E2E8F0; padding-top:10px; }}
  </style>
</head>
<body>
  <div class="sheet">
    <header>
      <div class="kicker">IETS · Boletín epidemiológico y financiero</div>
      <h1>{escape(bulletin.title)}</h1>
      <p>Estado: {escape(bulletin.status)} · Compilado: {escape(str(body.get("compiled_on") or "—"))}</p>
    </header>
    <div class="kpis">
      <div class="kpi"><b>{funnel.get("captured", funnel.get("assigned", 0))}</b><span>Capturadas / asignadas</span></div>
      <div class="kpi"><b>{funnel.get("filtered", 0)}</b><span>Filtradas</span></div>
      <div class="kpi"><b>{funnel.get("prioritized", 0)}</b><span>Priorizadas</span></div>
      <div class="kpi"><b>{funnel.get("published", funnel.get("evaluated", 0))}</b><span>Publicadas / evaluadas</span></div>
    </div>
    <h2>Distribución por clúster</h2>
    <table><thead><tr><th>Clúster</th><th>N</th></tr></thead><tbody>{cluster_rows or "<tr><td>Sin datos</td><td>0</td></tr>"}</tbody></table>
    <h2>Time-to-market</h2>
    <table><thead><tr><th>Banda</th><th>N</th></tr></thead><tbody>{band_rows or "<tr><td>Sin datos</td><td>0</td></tr>"}</tbody></table>
    <footer>Boletín de la plataforma de escaneo de horizonte del IETS. Difusión formal solo con aprobación del líder de ciclo.</footer>
  </div>
</body>
</html>"""


def render_public_fiche_html(data: dict) -> str:
    from .evaluation import FIELD_LABELS

    blocks = []
    for key, value in (data.get("body") or {}).items():
        if not str(value or "").strip():
            continue
        label = FIELD_LABELS.get(key, key)
        blocks.append(f"<article class='block'><h3>{escape(label)}</h3>{_paras(str(value))}</article>")
    ncts = "".join(
        f"<li><a href='https://clinicaltrials.gov/study/{escape(n)}'>{escape(n)}</a></li>"
        for n in data.get("nct_ids") or []
    )
    return f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <title>{escape(data.get("title") or "Ficha pública")} — IETS</title>
  <style>
    body {{ font-family:"Segoe UI", Calibri, Arial, sans-serif; color:#0F172A; margin:0; }}
    .sheet {{ max-width:860px; margin:0 auto; padding:18px 16px 32px; }}
    header {{ border-bottom:3px solid #0F766E; padding-bottom:14px; margin-bottom:18px; }}
    .kicker {{ letter-spacing:.16em; text-transform:uppercase; color:#0F766E; font-size:10px; font-weight:800; }}
    .block {{ border:1px solid #E2E8F0; border-left:4px solid #0F766E; border-radius:10px; padding:12px 14px; margin:0 0 10px; }}
    h3 {{ font-size:13px; margin:0 0 6px; color:#134E4A; }}
    p {{ line-height:1.55; margin:0 0 8px; }}
  </style>
</head>
<body>
  <div class="sheet">
    <header>
      <div class="kicker">Ficha pública · Escaneo de horizonte IETS</div>
      <h1>{escape(data.get("title") or "")}</h1>
      <p>{escape(data.get("ttm_band_label") or "")} · {escape(data.get("cluster") or "")}</p>
    </header>
    {''.join(blocks)}
    <h2>Ensayos clínicos asociados</h2>
    <ul>{ncts or "<li>Sin identificadores NCT públicos</li>"}</ul>
  </div>
</body>
</html>"""
