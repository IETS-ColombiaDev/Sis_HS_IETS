"""Pruebas de la evaluacion temprana, Mini-HTA y revision por pares (fase 5)."""
from __future__ import annotations

import datetime as dt
import sys
from datetime import timedelta
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import evaluation as catalog  # noqa: E402
from app import evaluation_service, methodology, rbac  # noqa: E402
from app.database import Base  # noqa: E402
from app.evaluation_service import EvaluationRuleError  # noqa: E402
from app.models import (  # noqa: E402
    Cycle,
    CycleTechnology,
    EvaluationDoc,
    MethodologyParam,
    Technology,
    User,
)
from app.security import create_access_token  # noqa: E402


@pytest.fixture()
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine, autoflush=False)()
    methodology.seed_catalogs(session)
    yield session
    session.close()


@pytest.fixture()
def admin(db):
    user = User(email="admin@iets.org.co", name="Admin", role=rbac.SUPERADMIN)
    db.add(user)
    db.commit()
    return user


def _cycle_and_tech(db, *, points=4):
    opened = dt.date.today()
    cycle = Cycle(
        code="C-EVAL",
        year=opened.year,
        opened_on=opened,
        data_cutoff_on=opened + dt.timedelta(weeks=12),
        status="en_evaluacion",
    )
    tech = Technology(commercial_name="Alfamab", inn_name="alfamab", indication="Asma")
    db.add_all([cycle, tech])
    db.commit()
    entry = CycleTechnology(
        cycle_id=cycle.id,
        technology_id=tech.id,
        status="en_evaluacion",
        priority_points=points,
    )
    db.add(entry)
    db.commit()
    return cycle, tech, entry


def _fill(doc, level="ficha"):
    body = catalog.empty_body()
    for key in catalog.required_fields(level):
        body[key] = f"Contenido de {key}"
    doc.body = body
    doc.product_level = level


def test_suggests_product_level_from_parametrized_thresholds(db):
    assert evaluation_service.suggest_product_level(db, 6) == "mini_hta"
    assert evaluation_service.suggest_product_level(db, 5) == "informe"
    assert evaluation_service.suggest_product_level(db, 4) == "ficha"

    db.get(MethodologyParam, "evaluation.mini_hta_min_points").value = "5"
    db.commit()
    assert evaluation_service.suggest_product_level(db, 5) == "mini_hta"


def test_ensure_document_uses_suggested_level(db, admin):
    cycle, tech, _ = _cycle_and_tech(db, points=6)
    doc = evaluation_service.ensure_document(
        db, cycle.id, tech.id, actor=admin.email
    )
    assert doc.product_level == "mini_hta"
    assert doc.status == "borrador"
    assert doc.version_minor == 1


def test_incomplete_ficha_cannot_leave_draft(db, admin):
    cycle, tech, _ = _cycle_and_tech(db)
    doc = evaluation_service.ensure_document(db, cycle.id, tech.id, actor=admin.email)
    with pytest.raises(EvaluationRuleError, match="campos obligatorios"):
        evaluation_service.transition(db, doc, "revision_interna", actor=admin)


def test_pico_fields_are_required_only_for_mini_hta(db):
    body = catalog.empty_body()
    for key in catalog.FICHA_FIELDS:
        body[key] = "x"
    assert catalog.missing_fields(body, "ficha") == []
    assert "pico_population" in catalog.missing_fields(body, "mini_hta")
    for key in catalog.INFORME_EXTRA_FIELDS + catalog.MINI_HTA_EXTRA_FIELDS:
        body[key] = "x"
    assert catalog.missing_fields(body, "mini_hta") == []


def test_cannot_publish_without_internal_and_external_coi(db, admin):
    cycle, tech, _ = _cycle_and_tech(db)
    doc = evaluation_service.ensure_document(db, cycle.id, tech.id, actor=admin.email)
    _fill(doc)
    evaluation_service.transition(db, doc, "revision_interna", actor=admin)
    evaluation_service.transition(db, doc, "revision_externa", actor=admin)
    evaluation_service.transition(db, doc, "aprobado_comite", actor=admin)
    with pytest.raises(EvaluationRuleError, match="revisor interno"):
        evaluation_service.transition(db, doc, "publicado", actor=admin)

    internal = evaluation_service.ensure_internal_assignment(db, doc, admin)
    evaluation_service.sign_coi(db, internal, accepted=True, actor=admin.email)
    with pytest.raises(EvaluationRuleError, match="revisor externo"):
        evaluation_service.transition(db, doc, "publicado", actor=admin)


def test_publish_requires_both_coi_and_snapshots_version(db, admin):
    cycle, tech, _ = _cycle_and_tech(db)
    doc = evaluation_service.ensure_document(db, cycle.id, tech.id, actor=admin.email)
    _fill(doc)
    internal = evaluation_service.ensure_internal_assignment(db, doc, admin)
    evaluation_service.sign_coi(db, internal, accepted=True)
    _, token = evaluation_service.invite_reviewer(
        db, doc, kind="externo", name="Par", email="par@externo.org", actor=admin.email
    )
    assignment, _ = evaluation_service.resolve_reviewer_token(db, token)
    evaluation_service.sign_coi(db, assignment, accepted=True)

    evaluation_service.transition(db, doc, "revision_interna", actor=admin)
    evaluation_service.transition(db, doc, "revision_externa", actor=admin)
    evaluation_service.transition(db, doc, "aprobado_comite", actor=admin)
    evaluation_service.transition(db, doc, "publicado", actor=admin)

    assert doc.status == "publicado"
    versions = evaluation_service.versions_of(db, doc.id)
    statuses = {v.status for v in versions}
    assert "borrador" in statuses
    assert "publicado" in statuses
    published = [v for v in versions if v.status == "publicado"][0]
    assert published.body["health_condition"]


def test_expired_reviewer_token_is_denied(db, admin):
    cycle, tech, _ = _cycle_and_tech(db)
    doc = evaluation_service.ensure_document(db, cycle.id, tech.id, actor=admin.email)
    assignment, _ = evaluation_service.invite_reviewer(
        db, doc, kind="externo", name="Par", email="par@externo.org", actor=admin.email
    )
    stale = create_access_token(
        subject="par@externo.org",
        extra={"typ": "review", "aid": assignment.id, "doc": doc.id},
        expires_delta=timedelta(seconds=-30),
    )
    with pytest.raises(EvaluationRuleError, match="TOKEN_EXPIRED"):
        evaluation_service.resolve_reviewer_token(db, stale)


def test_reviewer_cannot_read_before_coi(db, admin):
    cycle, tech, _ = _cycle_and_tech(db)
    doc = evaluation_service.ensure_document(db, cycle.id, tech.id, actor=admin.email)
    _, token = evaluation_service.invite_reviewer(
        db, doc, kind="externo", name="Par", email="par@externo.org", actor=admin.email
    )
    assignment, resolved = evaluation_service.resolve_reviewer_token(db, token)
    assert assignment.coi_signed is False
    assert resolved.id == doc.id
    with pytest.raises(EvaluationRuleError, match="conflicto"):
        evaluation_service.submit_review(db, assignment, verdict="aprobado")


def test_html_export_carries_institutional_marks(db, admin):
    cycle, tech, _ = _cycle_and_tech(db)
    doc = evaluation_service.ensure_document(db, cycle.id, tech.id, actor=admin.email)
    _fill(doc)
    html = evaluation_service.render_institutional_html(doc, tech)
    assert "Instituto de Evaluacion Tecnologica en Salud" in html
    assert "Alfamab" in html
    assert "Condicion de salud" in html


def test_published_doc_unblocks_cycle_close(db, admin):
    from app import cycle_service

    cycle, tech, entry = _cycle_and_tech(db)
    doc = evaluation_service.ensure_document(db, cycle.id, tech.id, actor=admin.email)
    _fill(doc)
    internal = evaluation_service.ensure_internal_assignment(db, doc, admin)
    evaluation_service.sign_coi(db, internal, accepted=True)
    _, token = evaluation_service.invite_reviewer(
        db, doc, kind="externo", name="Par", email="par@externo.org", actor=admin.email
    )
    assignment, _ = evaluation_service.resolve_reviewer_token(db, token)
    evaluation_service.sign_coi(db, assignment, accepted=True)
    evaluation_service.transition(db, doc, "revision_interna", actor=admin)
    evaluation_service.transition(db, doc, "revision_externa", actor=admin)
    evaluation_service.transition(db, doc, "aprobado_comite", actor=admin)
    evaluation_service.transition(db, doc, "publicado", actor=admin)
    db.commit()

    assert cycle_service.blocking_entries(db, cycle) == []
    assert evaluation_service.has_published_report(db, cycle.id, tech.id)
    assert entry.technology_id == tech.id
    assert db.get(EvaluationDoc, doc.id).status == "publicado"
