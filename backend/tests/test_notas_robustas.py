"""Notas del equipo: filtros, resumen, vínculo perdido, recorrido, límites y exporte."""
from __future__ import annotations

import pytest

from frente_a_helpers import Harness

from app import audit
from app.models import AuditLog, Note, Source
from app.routers import notes


@pytest.fixture()
def h():
    audit.install_listeners()
    harness = Harness(notes)
    yield harness
    harness.close()


def _note(h, role="superadmin", **kw):
    data = {"entity_type": "general", "content": "Observación del equipo", "title": "Nota"}
    data.update(kw)
    res = h.as_role(role).client.post("/api/notes", json=data)
    assert res.status_code == 201, res.text
    return res.json()


def _source(h, title="Fuente A"):
    row = Source(title=title, url=f"https://{title.replace(' ', '').lower()}.example")
    h.db.add(row)
    h.db.commit()
    return row


def test_filters_by_author_pin_and_text_and_sorts_with_pinned_first(h):
    _note(h, title="Beta", content="comité de marzo")
    _note(h, "evaluador_tecnico", title="Alfa", content="seguimiento INVIMA")
    pinned = _note(h, "evaluador_tecnico", title="Gamma", content="otra cosa", pinned=True)

    client = h.as_role("evaluador_tecnico").client
    assert [n["title"] for n in client.get("/api/notes", params={"mine": True}).json()] == ["Gamma", "Alfa"]
    assert [n["title"] for n in client.get("/api/notes", params={"author": "SUPERADMIN@iets.org.co"}).json()] == ["Beta"]
    assert [n["id"] for n in client.get("/api/notes", params={"pinned": True}).json()] == [pinned["id"]]
    assert [n["title"] for n in client.get("/api/notes", params={"pinned": False}).json()] == ["Alfa", "Beta"]
    assert [n["title"] for n in client.get("/api/notes", params={"q": "  invima "}).json()] == ["Alfa"]
    # La fijada va primero en cualquier orden.
    assert [n["title"] for n in client.get("/api/notes", params={"sort": "titulo"}).json()] == ["Gamma", "Alfa", "Beta"]
    assert [n["title"] for n in client.get("/api/notes", params={"sort": "no-existe"}).json()][0] == "Gamma"


def test_summary_counts_types_pins_mine_and_authors(h):
    source = _source(h)
    _note(h)
    _note(h, entity_type="source", entity_id=source.id, pinned=True)
    _note(h, "tomador_decisiones")

    data = h.as_role("superadmin").client.get("/api/notes/summary").json()
    assert (data["total"], data["pinned"], data["mine"]) == (3, 1, 2)
    assert data["by_type"] == {"general": 2, "source": 1}
    assert [(a["email"], a["count"]) for a in data["authors"]] == [
        ("superadmin@iets.org.co", 2), ("tomador_decisiones@iets.org.co", 1),
    ]
    assert h.as_role("revisor_pares").client.get("/api/notes/summary").json()["mine"] == 0


def test_note_tells_when_its_link_was_deleted_and_when_it_was_edited(h):
    source = _source(h, "Fuente por borrar")
    linked = _note(h, entity_type="source", entity_id=source.id)
    assert linked["entity_label"] == "Fuente por borrar" and linked["entity_missing"] is False and linked["edited"] is False

    h.db.delete(h.db.get(Source, source.id))
    h.db.commit()
    again = h.client.get(f"/api/notes/{linked['id']}").json()
    assert again["entity_missing"] is True and again["entity_label"] == f"Fuente #{source.id}"
    listed = h.client.get("/api/notes").json()
    assert listed[0]["entity_missing"] is True

    general = _note(h)
    assert general["entity_label"] == "Nota general" and general["entity_missing"] is False
    h.client.put(f"/api/notes/{general['id']}", json={"pinned": True})  # fijar no es editar
    assert h.client.get(f"/api/notes/{general['id']}").json()["edited"] is False
    h.client.put(f"/api/notes/{general['id']}", json={"content": "Texto nuevo"})
    assert h.client.get(f"/api/notes/{general['id']}").json()["edited"] is True


def test_content_limit_answers_422_and_title_is_trimmed(h):
    assert h.client.post("/api/notes", json={"content": "x" * 20001}).status_code == 422
    note = _note(h)
    too_long = h.client.put(f"/api/notes/{note['id']}", json={"content": "x" * 20001})
    assert too_long.status_code == 422 and "20000" in too_long.json()["detail"]
    ok = h.client.put(f"/api/notes/{note['id']}", json={"title": "  Con espacios  ", "content": "x" * 20000})
    assert ok.status_code == 200 and ok.json()["title"] == "Con espacios"


def test_history_tells_creation_edits_and_pins(h):
    note = _note(h)
    nid = note["id"]
    h.client.put(f"/api/notes/{nid}", json={"content": "Contenido corregido"})
    h.client.put(f"/api/notes/{nid}", json={"pinned": True})
    h.client.put(f"/api/notes/{nid}", json={"title": "Otro título", "content": "Otra vez"})
    h.client.put(f"/api/notes/{nid}", json={"pinned": False})

    events = h.client.get(f"/api/notes/{nid}/history").json()
    assert [e["kind"] for e in events] == ["created", "edited", "pinned", "edited", "unpinned"]
    assert events[1]["detail"] == "Cambió: contenido" and events[3]["detail"] == "Cambió: título, contenido"
    assert h.client.get("/api/notes/99999/history").status_code == 404
    # Quien solo lee también ve el recorrido.
    assert h.as_role("revisor_pares").client.get(f"/api/notes/{nid}/history").status_code == 200


def test_export_respects_the_filter_neutralises_formulas_and_is_audited(h):
    source = _source(h, "Fuente exportada")
    _note(h, title="=HYPERLINK(1)", content="+1 fórmula", entity_type="source", entity_id=source.id)
    _note(h, "tomador_decisiones", title="Ajena")

    res = h.as_role("superadmin").client.get("/api/notes/export", params={"mine": True})
    assert res.status_code == 200 and res.headers["content-type"].startswith("text/csv")
    lines = res.content.decode("utf-8-sig").splitlines()
    assert lines[0] == "id,titulo,contenido,tipo,entidad_id,vinculada_a,autor,fijada,creada,actualizada"
    assert len(lines) == 2
    assert "'=HYPERLINK(1)" in lines[1] and "'+1 fórmula" in lines[1] and "Fuente exportada" in lines[1]

    as_json = h.client.get("/api/notes/export", params={"format": "json"}).json()
    assert len(as_json) == 2 and {"entity_label", "edited", "entity_missing"} <= set(as_json[0])

    h.db.expire_all()
    events = h.db.query(AuditLog).filter(AuditLog.action == "note:export").order_by(AuditLog.id).all()
    assert [e.new_value for e in events] == [{"format": "csv", "rows": 1}, {"format": "json", "rows": 2}]
    assert h.db.query(Note).count() == 2
