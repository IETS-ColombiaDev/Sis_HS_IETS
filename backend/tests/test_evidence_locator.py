"""La senal apunta a la pagina exacta donde esta su cita, no a la portada de la fuente."""
import json

from frente_b_support import api  # noqa: F401  (fixture)

from app import ai_web, evidence_locator as loc

LANDING = "https://agencia.test/horizonte"
CORPUS = (
    f"## Pagina: {LANDING}\nTitulo: Horizonte\nListado de informes recientes. Oncosil y otros.\n\n"
    "## Pagina: https://agencia.test/horizonte/oncosil\nTitulo: OncoSil\n"
    "OncoSil is an implantable brachytherapy device with phosphorous-32 microparticles for pancreatic cancer.\n\n"
    "## Pagina: https://agencia.test/horizonte/intracept\nTitulo: Intracept\n"
    "The Intracept System performs basivertebral nerve ablation for chronic low back pain.\n\n"
    "## Resultados de busqueda web en el dominio\n"
    "- Informe Zolgensma | https://agencia.test/informes/zolgensma.html | Terapia génica onasemnogén abeparvovec para AME.\n"
)
FEED = (
    "## Canal: https://news.google.com/rss/search?q=site:x.test\n"
    "- Nuevo stent biodegradable aprobado (2026-10-01) | https://news.google.com/rss/articles/AAA\n"
    "  Un stent coronario biodegradable recibió la marca CE.\n"
    "- Otra noticia sin relación (2026-10-02) | https://news.google.com/rss/articles/BBB\n"
    "  Resultados trimestrales.\n"
)


def test_cita_lleva_a_la_ficha_no_a_la_portada():
    spot = loc.locate(CORPUS, LANDING, "basivertebral nerve ablation for chronic low back pain")
    assert spot["url"] == "https://agencia.test/horizonte/intracept"
    assert spot["how"] == "cita"
    assert spot["quote"] == "basivertebral nerve ablation for chronic low back pain"


def test_la_ficha_gana_a_la_portada_cuando_ambas_mencionan_el_nombre():
    spot = loc.locate(CORPUS, LANDING, "", hints=("Oncosil",))
    assert spot["url"] == "https://agencia.test/horizonte/oncosil"


def test_cita_tolera_tildes_mayusculas_y_puntuacion():
    spot = loc.locate(CORPUS, LANDING, "terapia genica onasemnogen abeparvovec para AME")
    assert spot["url"] == "https://agencia.test/informes/zolgensma.html"
    # El tramo devuelto es el original, con sus tildes: sirve para resaltar en la pagina.
    assert "onasemnogén" in spot["quote"]


def test_item_de_canal_lleva_a_su_propio_enlace():
    spot = loc.locate(FEED, "https://news.google.com/rss/search?q=site:x.test", "stent coronario biodegradable recibió la marca CE")
    assert spot["url"] == "https://news.google.com/rss/articles/AAA"


def test_sin_coincidencia_no_inventa_url():
    assert loc.locate(CORPUS, LANDING, "texto que no aparece en ninguna pagina visitada")["url"] == ""


def test_fragmento_de_texto():
    assert loc.text_fragment("corto") == "#:~:text=corto"
    frag = loc.text_fragment("one two three four five six seven eight nine ten eleven twelve")
    assert frag == "#:~:text=one%20two%20three%20four%20five,eight%20nine%20ten%20eleven%20twelve"
    # Coma y guion son sintaxis del fragmento: van codificados.
    assert loc.text_fragment("a, b-c") == "#:~:text=a%2C%20b%2Dc"
    assert loc.with_fragment("https://a.test/doc.pdf", "cita larga de prueba") == "https://a.test/doc.pdf"
    assert loc.with_fragment("https://news.google.com/rss/articles/A", "cita larga") == "https://news.google.com/rss/articles/A"
    assert loc.with_fragment("https://a.test/p#x", "cita") == "https://a.test/p#x"


def test_enlace_desde_el_crudo():
    raw = "Cita de la fuente: «basivertebral nerve ablation»\nresto"
    assert loc.signal_link("https://a.test/p", raw).endswith("#:~:text=basivertebral%20nerve%20ablation")
    pipe = "Fila original del pipeline: Remibrutinib | Phase III | CSU"
    assert loc.signal_link("https://novartis.test/pipeline", pipe, "Remibrutinib").endswith("#:~:text=Remibrutinib")
    assert loc.signal_link("https://a.test/p", "sin cita") == "https://a.test/p"


def test_parse_items_corrige_la_url_de_la_ia():
    rows = [
        {
            "title": "Intracept: ablación del nervio basivertebral",
            "technology": "Intracept System",
            # La IA dio la portada; la cita esta en la ficha.
            "url": LANDING,
            "evidencia": "The Intracept System performs basivertebral nerve ablation",
        },
        {
            "title": "OncoSil para cáncer de páncreas",
            "technology": "OncoSil",
            # URL del mismo sitio que el sistema nunca visito: suposicion de la IA.
            "url": "https://agencia.test/horizonte/oncosil-2024-informe",
            "evidencia": "implantable brachytherapy device with phosphorous-32 microparticles",
        },
    ]
    report: dict = {}
    items = ai_web._parse_items(json.dumps(rows), LANDING, "Agencia", source_text=CORPUS, report=report)
    assert [i["url"] for i in items] == [
        "https://agencia.test/horizonte/intracept",
        "https://agencia.test/horizonte/oncosil",
    ]
    assert report["located"] == 2
    assert items[0]["raw_content"].startswith("Cita de la fuente: «The Intracept System performs basivertebral nerve ablation»")


def test_senal_vieja_con_portada_recibe_la_url_exacta(api):
    from app import scraper
    from app.models import Finding, Source, Technology

    sid = api.add_source(url=LANDING, connector="html", connector_config={})
    with api.db() as db:
        f = Finding(source_id=sid, title="Intracept System", url=LANDING, content_hash="viejo", raw_content="x")
        db.add(f)
        db.flush()
        db.add(Technology(commercial_name="Intracept System", finding_id=f.id, url=LANDING))
        db.commit()
        src = db.get(Source, sid)
        # Otra corrida que tambien da la portada no cambia nada.
        assert not scraper._upgrade_general_url(db, src, LANDING, {"title": "Intracept System", "url": LANDING + "/"})
        data = {
            "title": "Intracept System",
            "url": "https://agencia.test/horizonte/intracept",
            "raw_content": "Cita de la fuente: \u00abbasivertebral nerve ablation\u00bb\nresto",
        }
        assert scraper._upgrade_general_url(db, src, LANDING, data)
        db.commit()
        f = db.query(Finding).filter(Finding.source_id == sid).one()
        assert f.url == "https://agencia.test/horizonte/intracept"
        assert f.link.endswith("#:~:text=basivertebral%20nerve%20ablation")
        assert db.query(Technology).filter(Technology.finding_id == f.id).one().url == f.url
