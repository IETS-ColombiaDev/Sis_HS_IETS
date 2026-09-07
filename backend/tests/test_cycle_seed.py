"""Cuatro ciclos oficiales 2026: expurgo de ambiguos y embudo metodologico."""
from __future__ import annotations

import sys
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import cycle_seed, methodology  # noqa: E402
from app.database import Base  # noqa: E402
from app.models import (  # noqa: E402
    Bulletin,
    Cluster,
    Cycle,
    CycleTechnology,
    EvaluationDoc,
    Recommendation,
    TechType,
    Technology,
)


def _db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine, autoflush=False)()
    methodology.seed_catalogs(session)
    return session


def _techs(db, n=24):
    cluster = db.query(Cluster).first()
    ttype = db.query(TechType).first()
    rows = []
    for i in range(n):
        tech = Technology(
            commercial_name=f"Tecnologia semilla {i + 1}",
            inn_name=f"mol-{i + 1}",
            indication="Oncologia",
            summary="Senal de horizonte para el ejercicio oficial 2026.",
            cluster_id=cluster.id,
            tech_type_id=ttype.id,
            condition="emergente",
            horizon="transicional",
            screening_score=80 - i,
        )
        db.add(tech)
        rows.append(tech)
    db.commit()
    return rows


def test_sync_keeps_only_four_official_cycles():
    db = _db()
    try:
        db.add(Cycle(code="REG-abc123", year=2026, opened_on=__import__("datetime").date(2026, 1, 1), data_cutoff_on=__import__("datetime").date(2026, 4, 1), status="en_configuracion"))
        db.add(Cycle(code="Ciclo 0 - Historico", year=2026, opened_on=__import__("datetime").date(2026, 1, 1), data_cutoff_on=__import__("datetime").date(2026, 4, 1), status="cerrado_consolidado", is_historic=True))
        db.add(Cycle(code="TEST-CICLO", year=2026, opened_on=__import__("datetime").date(2026, 1, 1), data_cutoff_on=__import__("datetime").date(2026, 4, 1)))
        db.commit()
        _techs(db)

        result = cycle_seed.sync_official_cycles(db, force=True)
        assert result["ok"] is True
        codes = [c.code for c in db.query(Cycle).order_by(Cycle.opened_on).all()]
        assert codes == [
            "Ciclo I - 2026",
            "Ciclo II - 2026",
            "Ciclo IV - 2026",
            "Ciclo III - 2026",
        ]
        by_code = {c.code: c for c in db.query(Cycle).all()}
        assert by_code["Ciclo I - 2026"].status == "cerrado_consolidado"
        assert by_code["Ciclo II - 2026"].status == "en_evaluacion"
        assert by_code["Ciclo III - 2026"].status == "en_priorizacion"
        assert by_code["Ciclo IV - 2026"].status == "cerrado_consolidado"
        assert by_code["Ciclo I - 2026"].is_historic is False
        for cycle in by_code.values():
            n = db.query(CycleTechnology).filter(CycleTechnology.cycle_id == cycle.id).count()
            assert n >= 3

        iv = by_code["Ciclo IV - 2026"]
        published = (
            db.query(EvaluationDoc)
            .filter(EvaluationDoc.cycle_id == iv.id, EvaluationDoc.status == "publicado")
            .all()
        )
        assert len(published) >= 5
        levels = {doc.product_level for doc in published}
        assert "mini_hta" in levels
        assert "informe" in levels
        titles = " ".join(doc.title for doc in published).lower()
        assert "lutathera" in titles
        assert db.query(Bulletin).filter(Bulletin.cycle_id == iv.id, Bulletin.status == "publicado").count() == 1
        assert db.query(Recommendation).filter(Recommendation.model_used == "semilla-ciclo-iv").count() >= 5

        second = cycle_seed.sync_official_cycles(db)
        assert second["rebuilt"] is False
        assert db.query(Cycle).count() == 4
    finally:
        db.close()


def test_purge_removes_regression_cycles_without_touching_official():
    db = _db()
    try:
        _techs(db)
        cycle_seed.sync_official_cycles(db, force=True)
        db.add(Cycle(code="REG-ffff", year=2026, opened_on=__import__("datetime").date(2026, 9, 1), data_cutoff_on=__import__("datetime").date(2026, 12, 1)))
        db.commit()
        cycle_seed.sync_official_cycles(db)
        codes = {c.code for c in db.query(Cycle).all()}
        assert codes == set(cycle_seed.OFFICIAL_CODES)
        assert "REG-ffff" not in codes
    finally:
        db.close()
