"""Asistente: contexto elegido, memoria del equipo, valoración, reserva de datos y permisos."""
from __future__ import annotations

import pytest

from frente_a_helpers import Harness

from app import ai_service
from app.models import AssistantKnowledge, AuditLog, EvaluationDoc, Finding, Note, Recommendation, Source
from app.routers import chat


@pytest.fixture()
def h(monkeypatch):
    harness = Harness(chat)
    harness.seen = []

    def fake(question, context, history, language=None):
        harness.seen.append(context)
        return f"Respuesta a: {question}", "prueba"

    monkeypatch.setattr(ai_service, "chat_answer", fake)
    yield harness
    harness.close()


def _data(h):
    db = h.db
    source = Source(title="Agencia Europea", url="https://ema.example", category="Agencias regulatorias", description="Aprobaciones centralizadas")
    db.add(source)
    db.flush()
    finding = Finding(source_id=source.id, title="Terapia génica para hemofilia B", content_hash="h1", summary="Resultados de fase III con reducción de sangrados.", technology="Etranacogene", horizon="emergente")
    rec = Recommendation(title="Informe de hemofilia", content="Se recomienda seguimiento del precio de lanzamiento.", impact="alto", status="validado")
    note = Note(entity_type="general", title="Comité de marzo", content="El comité pidió revisar comparadores.", author_email="superadmin@iets.org.co", author_name="superadmin")
    cycle = h.cycle(status="en_evaluacion")
    tech = h.tech("Etranacogene", status="en_evaluacion")
    db.add_all([finding, rec, note])
    db.flush()
    doc = EvaluationDoc(
        cycle_id=cycle.id, technology_id=tech.id, title="Expediente hemofilia", status="borrador", product_level="ficha",
        body={"clinical_summary": "Eficacia sostenida a 3 años.", "budget_year_1": "COP 12.000 millones", "confidential_note": "Negociación en curso"},
    )
    db.add(doc)
    db.commit()
    return {"source": source, "finding": finding, "rec": rec, "note": note, "tech": tech, "doc": doc}


def _send(h, message, role="superadmin", **extra):
    res = h.as_role(role).client.post("/api/chat/send", json={"message": message, **extra})
    assert res.status_code == 200, res.text
    return res.json()


def test_search_lists_attachable_records_by_type(h):
    d = _data(h)
    found = h.client.get("/api/chat/context/search", params={"q": "hemofilia"}).json()
    by_type = {(r["type"], r["id"]) for r in found}
    assert {("finding", d["finding"].id), ("recommendation", d["rec"].id), ("evaluation_doc", d["doc"].id)} <= by_type
    assert all(r["title"] and r["type_label"] for r in found)

    only = h.client.get("/api/chat/context/search", params={"q": "", "types": "source,note"}).json()
    assert {r["type"] for r in only} == {"source", "note"}


def test_chosen_context_is_read_in_full_kept_in_the_session_and_cited(h):
    d = _data(h)
    refs = [{"type": "finding", "id": d["finding"].id}, {"type": "recommendation", "id": d["rec"].id}, {"type": "note", "id": 99999}]
    sent = _send(h, "Resume estos elementos", context=refs)
    context = h.seen[-1]
    assert "ELEMENTOS ADJUNTOS" in context
    assert "Resultados de fase III con reducción de sangrados." in context
    assert "Se recomienda seguimiento del precio de lanzamiento." in context

    assert sent["session"]["title"] == "Terapia génica para hemofilia B y 1 más"
    chosen = [r for r in sent["answer"]["refs"] if r["origin"] == "elegido"]
    assert [(r["type"], r["id"]) for r in chosen] == [("finding", d["finding"].id), ("recommendation", d["rec"].id)]  # la nota inexistente se omite
    assert chosen[0]["to"] == "/senales" and chosen[0]["type_label"] == "Señal"

    # La conversación recuerda el contexto: la siguiente pregunta lo vuelve a leer sin reenviarlo.
    sid = sent["session"]["id"]
    _send(h, "Y qué riesgos ves", session_id=sid)
    assert "Resultados de fase III con reducción de sangrados." in h.seen[-1]
    detail = h.client.get(f"/api/chat/sessions/{sid}").json()
    assert [(r["type"], r["id"]) for r in detail["context"]] == [("finding", d["finding"].id), ("recommendation", d["rec"].id)]

    # Se puede cambiar o vaciar el contexto de la conversación.
    changed = h.client.put(f"/api/chat/sessions/{sid}/context", json={"context": [{"type": "source", "id": d["source"].id}]})
    assert changed.status_code == 200 and [r["type"] for r in changed.json()] == ["source"]
    _send(h, "Otra pregunta", session_id=sid, context=[])
    assert "ELEMENTOS ADJUNTOS" not in h.seen[-1]
    too_many = [{"type": "finding", "id": i} for i in range(1, 14)]
    assert h.client.post("/api/chat/send", json={"message": "x", "context": too_many}).status_code == 422


def test_reserved_dossier_fields_only_reach_who_may_see_amounts(h):
    d = _data(h)
    ref = [{"type": "evaluation_doc", "id": d["doc"].id}]
    _send(h, "Qué dice el expediente", context=ref)  # superadmin: ve montos
    assert "COP 12.000 millones" in h.seen[-1] and "Eficacia sostenida" in h.seen[-1]

    _send(h, "Qué dice el expediente", role="revisor_pares", context=ref)
    assert "Eficacia sostenida" in h.seen[-1]
    assert "COP 12.000 millones" not in h.seen[-1] and "Negociación en curso" not in h.seen[-1]
    assert "Se omiten los campos reservados" in h.seen[-1]


def test_useful_answer_goes_to_the_memory_and_feeds_later_questions_of_everyone(h):
    _data(h)
    sent = _send(h, "Cuál es el criterio para priorizar terapias génicas")
    mid = sent["answer"]["id"]

    rated = h.client.post(f"/api/chat/messages/{mid}/feedback", json={"feedback": "no_util"})
    assert rated.status_code == 200 and rated.json()["feedback"] == "no_util"
    assert h.client.post(f"/api/chat/messages/{mid}/feedback", json={"feedback": "genial"}).status_code == 422

    saved = h.client.post(
        f"/api/chat/messages/{mid}/remember",
        json={"title": "Criterio para terapias génicas", "content": "Las terapias génicas se priorizan si llegan en menos de un año y superan 4 puntos."},
    )
    assert saved.status_code == 200
    entry = saved.json()
    assert entry["kind"] == "respuesta" and entry["question"].startswith("Cuál es el criterio") and entry["uses"] == 0
    assert h.client.get(f"/api/chat/sessions/{sent['session']['id']}").json()["messages"][-1]["remembered"] is True
    assert h.client.get(f"/api/chat/sessions/{sent['session']['id']}").json()["messages"][-1]["feedback"] == "util"
    again = h.client.post(f"/api/chat/messages/{mid}/remember", json={"title": "Otra vez"})
    assert again.status_code == 422 and "ya está en la memoria" in again.json()["detail"]

    # Otra persona pregunta algo parecido: el asistente recibe lo que el equipo guardó.
    other = _send(h, "Cómo priorizar una terapia génica nueva", role="evaluador_clinico")
    assert "MEMORIA DEL EQUIPO" in h.seen[-1] and "superan 4 puntos" in h.seen[-1]
    assert any(r["origin"] == "memoria" and r["title"] == "Criterio para terapias génicas" for r in other["answer"]["refs"])
    h.db.expire_all()
    assert h.db.get(AssistantKnowledge, entry["id"]).uses == 1

    # Una pregunta que no tiene que ver no la trae.
    _send(h, "Dispositivos de diagnóstico por imagen")
    assert "MEMORIA DEL EQUIPO" not in h.seen[-1]


def test_memory_can_be_taught_edited_archived_and_deleted_with_rules(h):
    taught = h.as_role("evaluador_tecnico").client.post(
        "/api/chat/memory", json={"title": "Umbral de alto riesgo", "content": "El umbral de alto riesgo presupuestal es de 5 puntos en la matriz."}
    )
    assert taught.status_code == 201 and taught.json()["kind"] == "dato" and taught.json()["can_manage"] is True
    eid = taught.json()["id"]
    assert h.client.post("/api/chat/memory", json={"title": "Corto", "content": "muy corto"}).status_code == 422
    assert h.as_role("revisor_pares").client.post("/api/chat/memory", json={"title": "T", "content": "x" * 40}).status_code == 403

    listed = h.as_role("revisor_pares").client.get("/api/chat/memory").json()  # quien solo lee también la consulta
    assert [i["id"] for i in listed["items"]] == [eid] and listed["items"][0]["can_manage"] is False
    assert listed["stats"] == {"active": 1, "archived": 0, "from_answers": 0, "taught": 1, "uses": 0}

    # Solo el autor o un superadministrador la cambian.
    assert h.as_role("evaluador_clinico").client.put(f"/api/chat/memory/{eid}", json={"status": "archivada"}).status_code == 403
    archived = h.as_role("evaluador_tecnico").client.put(f"/api/chat/memory/{eid}", json={"status": "archivada"})
    assert archived.status_code == 200 and archived.json()["status"] == "archivada"
    assert h.client.get("/api/chat/memory").json()["items"] == []
    assert len(h.client.get("/api/chat/memory", params={"status": "archivada"}).json()["items"]) == 1

    # Archivada, ya no alimenta las respuestas.
    _send(h, "Cuál es el umbral de alto riesgo presupuestal", role="evaluador_tecnico")
    assert "MEMORIA DEL EQUIPO" not in h.seen[-1]

    edited = h.as_role("superadmin").client.put(f"/api/chat/memory/{eid}", json={"status": "activa", "content": "El umbral de alto riesgo presupuestal es de 6 puntos en la matriz."})
    assert edited.status_code == 200 and "6 puntos" in edited.json()["content"]
    assert h.client.delete(f"/api/chat/memory/{eid}").status_code == 204
    actions = [e.action for e in h.db.query(AuditLog).filter(AuditLog.entity_type == "assistant_knowledge").order_by(AuditLog.id)]
    assert actions == ["assistant:teach", "assistant:memory_edit", "assistant:memory_edit", "assistant:forget"]


def test_memory_from_reserved_content_stays_with_who_may_see_it(h):
    d = _data(h)
    sent = _send(h, "Resumen del impacto presupuestal del expediente", context=[{"type": "evaluation_doc", "id": d["doc"].id}])
    saved = h.client.post(
        f"/api/chat/messages/{sent['answer']['id']}/remember",
        json={"title": "Impacto presupuestal de hemofilia", "content": "El impacto presupuestal del expediente es de COP 12.000 millones el primer año."},
    ).json()
    assert saved["restricted"] is True

    assert h.as_role("revisor_pares").client.get("/api/chat/memory").json()["items"] == []
    _send(h, "Cuál es el impacto presupuestal del expediente", role="revisor_pares")
    assert "COP 12.000 millones" not in h.seen[-1]
    _send(h, "Cuál es el impacto presupuestal del expediente", role="superadmin")
    assert "COP 12.000 millones" in h.seen[-1]


def test_answers_of_other_people_cannot_be_rated_or_saved(h):
    _data(h)
    mid = _send(h, "Pregunta privada")["answer"]["id"]
    other = h.as_role("evaluador_tecnico").client
    assert other.post(f"/api/chat/messages/{mid}/feedback", json={"feedback": "util"}).status_code == 404
    assert other.post(f"/api/chat/messages/{mid}/remember", json={"title": "Robada"}).status_code == 404
    assert h.db.query(AssistantKnowledge).count() == 0
