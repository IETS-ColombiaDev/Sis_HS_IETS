"""Proteccion de datos: nada se pierde por un despliegue, una migracion o una copia.

Cubre los riesgos hallados en la auditoria de datos (nov 2026):

- una migracion que reconstruye una tabla en SQLite no borra filas en cascada;
- los puntos de recuperacion de la copia en Firestore (antes de un despliegue,
  cierre del dia, otra instancia, antes de una restauracion) no se rotan;
- una base que no desciende de la copia guardada no la pisa;
- la base de Firestore con datos manda sobre una base nombrada vacia;
- la restauracion manual queda en bitacora y se puede deshacer.
"""
from __future__ import annotations

import base64
import json
import sqlite3
from pathlib import Path

import pytest
from alembic.operations import Operations
from alembic.runtime.migration import MigrationContext
from sqlalchemy import create_engine, event

from app import firebase_db, migrations


# --------------------------------------------------------------------------- #
#  Migraciones: reconstruir una tabla no borra a sus hijas
# --------------------------------------------------------------------------- #
def _engine_like_the_app(path: Path):
    """Engine con las llaves foraneas activas, igual que el de la aplicacion."""
    engine = create_engine(f"sqlite:///{path.as_posix()}")

    @event.listens_for(engine, "connect")
    def _on_connect(dbapi_conn, _record) -> None:  # noqa: ANN001
        dbapi_conn.execute("PRAGMA foreign_keys=ON")

    with engine.begin() as conn:
        conn.exec_driver_sql("CREATE TABLE sources (id INTEGER PRIMARY KEY, title TEXT, old TEXT)")
        conn.exec_driver_sql(
            "CREATE TABLE findings (id INTEGER PRIMARY KEY, title TEXT, "
            "source_id INTEGER REFERENCES sources(id) ON DELETE CASCADE)"
        )
        conn.exec_driver_sql("INSERT INTO sources (id, title, old) VALUES (1, 'FDA', 'x')")
        conn.exec_driver_sql("INSERT INTO findings (title, source_id) VALUES ('a', 1), ('b', 1)")
    return engine


def _drop_column(conn) -> None:
    """Lo que haria una revision futura: quitar una columna reconstruye la tabla."""
    ops = Operations(MigrationContext.configure(conn))
    with ops.batch_alter_table("sources", recreate="always") as batch:
        batch.drop_column("old")


def _findings(path: Path) -> int:
    with sqlite3.connect(path) as conn:
        return conn.execute("SELECT COUNT(*) FROM findings").fetchone()[0]


def test_rebuilding_a_table_with_foreign_keys_on_deletes_its_children(tmp_path):
    """El riesgo es real: asi se perderian las senales con una migracion comun."""
    path = tmp_path / "riesgo.db"
    engine = _engine_like_the_app(path)
    try:
        with engine.begin() as conn:
            _drop_column(conn)
    finally:
        engine.dispose()
    assert _findings(path) == 0


def test_schema_change_connection_keeps_the_children(tmp_path):
    path = tmp_path / "segura.db"
    engine = _engine_like_the_app(path)
    try:
        with migrations.schema_change_connection(engine) as conn:
            _drop_column(conn)
        # La columna se quito, las senales siguen y las llaves vuelven a quedar activas.
        with engine.connect() as conn:
            cols = {r[1] for r in conn.exec_driver_sql("PRAGMA table_info(sources)")}
            assert "old" not in cols
            assert conn.exec_driver_sql("PRAGMA foreign_keys").scalar() == 1
            assert conn.exec_driver_sql("PRAGMA foreign_key_check").fetchall() == []
    finally:
        engine.dispose()
    assert _findings(path) == 2


def test_schema_change_connection_restores_foreign_keys_after_a_failure(tmp_path):
    path = tmp_path / "falla.db"
    engine = _engine_like_the_app(path)
    try:
        with pytest.raises(RuntimeError, match="revision rota"):
            with migrations.schema_change_connection(engine) as conn:
                _drop_column(conn)
                raise RuntimeError("revision rota")
    finally:
        engine.dispose()
    # La transaccion se deshizo: la columna y las senales siguen ahi.
    with sqlite3.connect(path) as conn:
        assert "old" in {r[1] for r in conn.execute("PRAGMA table_info(sources)")}
    assert _findings(path) == 2


def test_upgrade_database_uses_the_safe_connection():
    import inspect

    assert "schema_change_connection" in inspect.getsource(migrations._upgrade_to_head)
    assert "_upgrade_to_head(engine)" in inspect.getsource(migrations.upgrade_database)


# --------------------------------------------------------------------------- #
#  Firestore simulado
# --------------------------------------------------------------------------- #
class Cloud:
    """Coleccion de Firestore en memoria, por base de datos."""

    def __init__(self) -> None:
        self.dbs: dict[str, dict[str, dict]] = {"(default)": {}}

    @property
    def docs(self) -> dict[str, dict]:
        return self.dbs.setdefault(firebase_db._active_database(), {})

    def meta(self) -> dict:
        return firebase_db.fetch_meta() or {}

    def gens(self) -> set[str]:
        out = set()
        for doc_id in self.docs:
            owner = firebase_db._chunk_owner(doc_id)
            if owner:
                out.add(owner[0])
        return out


@pytest.fixture
def cloud(monkeypatch):
    c = Cloud()
    monkeypatch.setattr(firebase_db, "enabled", lambda: True)
    monkeypatch.setattr(firebase_db.firebase_auth, "configured", lambda: True)
    monkeypatch.setattr(firebase_db, "_put_doc", lambda doc_id, fields: c.docs.__setitem__(doc_id, fields))
    monkeypatch.setattr(firebase_db, "_get_doc", lambda doc_id: c.docs.get(doc_id))
    monkeypatch.setattr(firebase_db, "_delete_doc", lambda doc_id: c.docs.pop(doc_id, None))
    monkeypatch.setattr(firebase_db, "_list_ids", lambda: list(c.docs))
    monkeypatch.setattr(firebase_db, "_pull_ok", True)
    monkeypatch.setattr(firebase_db, "_last_sha", "")
    monkeypatch.setattr(firebase_db, "_known_cloud_sha", "")  # se leyo la nube: estaba vacia
    monkeypatch.setattr(firebase_db, "_resolved_db", "(default)")
    monkeypatch.setattr(firebase_db, "CHUNK_BYTES", 8)
    monkeypatch.setattr(firebase_db, "code_id", lambda: "7.2.0+aaa")
    return c


def _push(monkeypatch, body: str, *, day: str = "2026-11-24", audit: int = 100, findings: int = 600, **kw):
    snap = {
        "epoch": "e1",
        "fingerprint": body,
        "taken_at": f"{day}T10:00:00+00:00",
        "raw_size": 1000,
        "counts": {"audit_log": audit, "findings": findings},
    }
    monkeypatch.setattr(
        firebase_db.browser_backup, "export_snapshot", lambda: (f"GZIP-{body}".encode(), snap)
    )
    return firebase_db.push_now(**kw)


def _reasons(cloud: Cloud) -> list[str]:
    return [c["reason"] for c in cloud.meta().get("checkpoints") or []]


def _payload_of(cloud: Cloud, item: dict) -> bytes:
    return firebase_db._fetch_payload(item)


# --------------------------------------------------------------------------- #
#  Puntos de recuperacion
# --------------------------------------------------------------------------- #
def test_the_copy_made_by_the_previous_code_is_pinned_before_a_deploy_overwrites_it(cloud, monkeypatch):
    assert _push(monkeypatch, "v1-a")["ok"]
    assert _push(monkeypatch, "v1-b")["ok"]
    assert _reasons(cloud) == []

    # Despliegue: arranca el codigo nuevo, restaura y sube varias veces seguidas.
    monkeypatch.setattr(firebase_db, "code_id", lambda: "7.3.0+bbb")
    for body in ("v2-arranque", "v2-bootstrap", "v2-uvicorn", "v2-uso"):
        assert _push(monkeypatch, body)["ok"]

    points = cloud.meta()["checkpoints"]
    assert [p["reason"] for p in points] == [firebase_db.PIN_DEPLOY]
    assert points[0]["code"] == "7.2.0+aaa"
    # La copia previa al despliegue sigue integra y se puede leer completa.
    assert _payload_of(cloud, points[0]) == b"GZIP-v1-b"
    assert points[0]["gen"] in cloud.gens()


def test_the_last_copy_of_each_day_is_kept_for_a_week(cloud, monkeypatch):
    for day in range(1, 12):
        assert _push(monkeypatch, f"dia-{day}-a", day=f"2026-11-{day:02d}")["ok"]
        assert _push(monkeypatch, f"dia-{day}-b", day=f"2026-11-{day:02d}")["ok"]

    points = cloud.meta()["checkpoints"]
    assert {p["reason"] for p in points} == {firebase_db.PIN_DAILY}
    assert len(points) == firebase_db.PIN_RETENTION[firebase_db.PIN_DAILY]
    # Son los cierres de los 7 dias anteriores al de hoy, del mas reciente al mas viejo.
    assert [p["taken_at"][:10] for p in points] == [f"2026-11-{d:02d}" for d in range(10, 3, -1)]
    assert _payload_of(cloud, points[0]) == b"GZIP-dia-10-b"
    # Los fragmentos de las copias que salieron del cupo si se borran.
    kept = {p["gen"] for p in points} | {cloud.meta()["gen"], cloud.meta()["prev_gen"]}
    assert cloud.gens() == kept


def test_a_copy_written_by_another_instance_is_pinned_instead_of_lost(cloud, monkeypatch):
    assert _push(monkeypatch, "mia-1")["ok"]
    # Otra instancia (la que se esta apagando en un redespliegue) sube su trabajo.
    known = firebase_db._known_cloud_sha
    assert _push(monkeypatch, "de-la-otra", audit=130)["ok"]
    monkeypatch.setattr(firebase_db, "_known_cloud_sha", known)
    monkeypatch.setattr(firebase_db, "_last_sha", "")

    assert _push(monkeypatch, "mia-2", audit=130)["ok"]

    points = cloud.meta()["checkpoints"]
    assert [p["reason"] for p in points] == [firebase_db.PIN_FOREIGN]
    assert _payload_of(cloud, points[0]) == b"GZIP-de-la-otra"


def test_a_foreign_copy_with_more_history_never_leaves_this_instance_unable_to_save(cloud, monkeypatch):
    """Redespliegue: la instancia vieja sigue registrando mientras la nueva ya arranco.

    La copia de la vieja trae mas bitacora que la base de la nueva. Bloquear la
    subida dejaria a la nueva sin guardar nunca; se sube y la ajena queda fijada.
    """
    assert _push(monkeypatch, "al-arrancar", audit=500)["ok"]
    known = firebase_db._known_cloud_sha
    assert _push(monkeypatch, "de-la-vieja", audit=540)["ok"]
    monkeypatch.setattr(firebase_db, "_known_cloud_sha", known)
    monkeypatch.setattr(firebase_db, "_last_sha", "")

    out = _push(monkeypatch, "de-la-nueva", audit=510)

    assert out["ok"], out
    points = cloud.meta()["checkpoints"]
    assert [p["reason"] for p in points] == [firebase_db.PIN_FOREIGN]
    assert _payload_of(cloud, points[0]) == b"GZIP-de-la-vieja"
    # A partir de ahi la copia vigente es la propia y la guarda vuelve a aplicar.
    assert _push(monkeypatch, "perdio-datos", audit=100)["reason"] == "count_guard"


def test_the_superadmin_can_override_a_blocked_copy_and_the_cloud_one_stays_pinned(cloud, monkeypatch):
    assert _push(monkeypatch, "guardada", audit=500)["ok"]
    assert _push(monkeypatch, "local-correcta", audit=300)["reason"] == "count_guard"

    monkeypatch.setattr(
        firebase_db.browser_backup, "export_snapshot",
        lambda: (b"GZIP-local-correcta", {"taken_at": "2026-11-24T10:00:00+00:00", "raw_size": 1000,
                                           "counts": {"audit_log": 300}}),
    )
    out = firebase_db.push_override()

    assert out["ok"]
    points = cloud.meta()["checkpoints"]
    assert [p["reason"] for p in points] == [firebase_db.PIN_MANUAL]
    assert _payload_of(cloud, points[0]) == b"GZIP-guardada"


def test_retention_is_per_reason_so_daily_copies_never_evict_the_pre_deploy_one(cloud, monkeypatch):
    assert _push(monkeypatch, "v1")["ok"]
    monkeypatch.setattr(firebase_db, "code_id", lambda: "7.3.0+bbb")
    for day in range(1, 15):
        assert _push(monkeypatch, f"dia-{day}", day=f"2026-12-{day:02d}")["ok"]

    reasons = _reasons(cloud)
    assert reasons.count(firebase_db.PIN_DEPLOY) == 1
    assert reasons.count(firebase_db.PIN_DAILY) == 7


# --------------------------------------------------------------------------- #
#  Guardas: una base que perdio datos no pisa la copia buena
# --------------------------------------------------------------------------- #
def test_a_base_that_does_not_descend_from_the_cloud_copy_is_not_uploaded(cloud, monkeypatch):
    assert _push(monkeypatch, "buena", audit=500)["ok"]
    good = cloud.meta()["sha256"]

    # Mismo tamano, pero con menos bitacora: es otra base (sembrada o atrasada).
    out = _push(monkeypatch, "atrasada", audit=120)

    assert out == {"ok": False, "reason": "count_guard", "detail": out["detail"]}
    assert "bitácora" in out["detail"]
    assert cloud.meta()["sha256"] == good
    assert firebase_db.status()["blocked_shrink"] is True


def test_a_base_that_lost_half_of_a_table_is_not_uploaded(cloud, monkeypatch):
    assert _push(monkeypatch, "buena", findings=651)["ok"]
    good = cloud.meta()["sha256"]

    out = _push(monkeypatch, "sin-senales", audit=101, findings=3)

    assert out["reason"] == "count_guard" and "findings" in out["detail"]
    assert cloud.meta()["sha256"] == good


def test_normal_work_and_small_deletions_are_uploaded(cloud, monkeypatch):
    assert _push(monkeypatch, "uno", audit=500, findings=651)["ok"]
    assert _push(monkeypatch, "dos", audit=530, findings=640)["ok"]
    assert cloud.meta()["counts"] == {"audit_log": 530, "findings": 640}


def test_a_deliberate_restore_can_upload_a_smaller_base_and_pins_the_previous_state(cloud, monkeypatch):
    assert _push(monkeypatch, "actual", audit=500)["ok"]

    out = _push(monkeypatch, "copia-vieja", audit=200, force=True, allow_shrink=True, pin=firebase_db.PIN_RESTORE)

    assert out["ok"]
    points = cloud.meta()["checkpoints"]
    assert [p["reason"] for p in points] == [firebase_db.PIN_RESTORE]
    assert _payload_of(cloud, points[0]) == b"GZIP-actual"


def test_old_cloud_copies_without_counts_do_not_block_the_first_upload(cloud, monkeypatch):
    # Copia hecha por una version anterior a esta proteccion: sin `counts` ni `code`.
    assert _push(monkeypatch, "legada")["ok"]
    meta = dict(cloud.docs[firebase_db.META_ID])
    for key in ("counts", "code", "checkpoints"):
        meta.pop(key)
    cloud.docs[firebase_db.META_ID] = meta

    assert _push(monkeypatch, "nueva", audit=5)["ok"]
    # Y esa copia legada queda fijada como la previa al despliegue.
    assert _reasons(cloud) == [firebase_db.PIN_DEPLOY]


# --------------------------------------------------------------------------- #
#  Restaurar un punto de recuperacion
# --------------------------------------------------------------------------- #
def test_restoring_a_checkpoint_first_saves_the_current_state(cloud, monkeypatch):
    assert _push(monkeypatch, "v1")["ok"]
    monkeypatch.setattr(firebase_db, "code_id", lambda: "7.3.0+bbb")
    assert _push(monkeypatch, "v2-danada")["ok"]
    target = next(p for p in firebase_db.list_checkpoints() if p["reason"] == firebase_db.PIN_DEPLOY)

    restored = {}
    monkeypatch.setattr(
        firebase_db.browser_backup, "restore_snapshot", lambda data, force=False: restored.update(data=data)
    )
    # Tras restaurar, la base local es la del punto de recuperacion.
    out_snap = {"epoch": "e1", "fingerprint": "r", "taken_at": "2026-11-24T11:00:00+00:00", "raw_size": 1000,
                "counts": {"audit_log": 90}}
    calls = iter([(b"GZIP-v2-danada-final", {**out_snap, "counts": {"audit_log": 101}}), (b"GZIP-v1", out_snap)])
    monkeypatch.setattr(firebase_db.browser_backup, "export_snapshot", lambda: next(calls))

    out = firebase_db.restore_checkpoint(target["gen"])

    assert out["ok"] and out["saved_previous"] and out["pushed"]
    assert restored["data"] == b"GZIP-v1"
    reasons = _reasons(cloud)
    # El estado danado quedo fijado: la restauracion se puede deshacer.
    assert firebase_db.PIN_RESTORE in reasons
    saved = [p for p in cloud.meta()["checkpoints"] if p["reason"] == firebase_db.PIN_RESTORE]
    assert b"GZIP-v2-danada-final" in {_payload_of(cloud, p) for p in saved}


def test_restoring_an_unknown_checkpoint_changes_nothing(cloud, monkeypatch):
    assert _push(monkeypatch, "v1")["ok"]
    before = json.dumps(cloud.docs, sort_keys=True, default=str)
    assert firebase_db.restore_checkpoint("no-existe") == {"ok": False, "reason": "not_found"}
    assert json.dumps(cloud.docs, sort_keys=True, default=str) == before


def test_list_checkpoints_shows_current_previous_and_pinned(cloud, monkeypatch):
    assert _push(monkeypatch, "v1")["ok"]
    monkeypatch.setattr(firebase_db, "code_id", lambda: "7.3.0+bbb")
    assert _push(monkeypatch, "v2")["ok"]
    assert _push(monkeypatch, "v3")["ok"]

    items = firebase_db.list_checkpoints()

    assert [i["reason"] for i in items] == ["actual", "anterior", firebase_db.PIN_DEPLOY]
    assert [i["label"] for i in items] == ["Copia actual", "Copia anterior", "Antes de un despliegue"]
    assert len({i["gen"] for i in items}) == 3


# --------------------------------------------------------------------------- #
#  En que base de Firestore vive la copia
# --------------------------------------------------------------------------- #
def test_the_database_that_holds_the_data_wins_over_an_empty_named_one(cloud, monkeypatch):
    # Los datos reales estan en (default); alguien crea la base nombrada vacia.
    assert _push(monkeypatch, "datos-reales")["ok"]
    monkeypatch.setattr(firebase_db, "_in_pytest", lambda: False)
    monkeypatch.setattr(firebase_db, "_try_named_database", lambda dbid: {"ok": True, "created": True})
    monkeypatch.setattr(firebase_db, "_resolved_db", None)

    out = firebase_db.ensure_database(probe_write=False)

    assert out["database"] == "(default)" and out["named"] is False
    assert firebase_db.fetch_meta()["chunk_count"] > 0


def test_a_named_database_with_data_is_used(cloud, monkeypatch):
    monkeypatch.setattr(firebase_db, "_resolved_db", "hs-iets")
    assert _push(monkeypatch, "en-la-nombrada")["ok"]
    monkeypatch.setattr(firebase_db, "_in_pytest", lambda: False)
    monkeypatch.setattr(firebase_db, "_try_named_database", lambda dbid: {"ok": True, "created": False})
    monkeypatch.setattr(firebase_db, "_resolved_db", None)

    assert firebase_db.ensure_database(probe_write=False)["database"] == "hs-iets"


def test_an_unresolved_database_is_never_read_as_empty(cloud, monkeypatch):
    assert _push(monkeypatch, "datos-reales")["ok"]
    monkeypatch.setattr(firebase_db, "_resolved_db", None)
    monkeypatch.setattr(firebase_db, "_pull_ok", False)

    def boom(**_kw):
        raise RuntimeError("sin red")

    monkeypatch.setattr(firebase_db, "ensure_database", boom)

    out = firebase_db.pull_if_needed()

    assert out == {"ok": False, "reason": "fetch_failed"}
    assert firebase_db._pull_ok is False
    # Y sin lectura correcta no se sube nada.
    assert _push(monkeypatch, "sembrada", audit=1)["reason"] == "pull_pending"


def test_counts_travel_with_every_real_snapshot(tmp_path, monkeypatch):
    """`export_snapshot` cuenta las tablas principales sobre la copia consistente."""
    from app import browser_backup

    db = tmp_path / "real.db"
    with sqlite3.connect(db) as conn:
        conn.execute("CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)")
        conn.execute("CREATE TABLE audit_log (id INTEGER PRIMARY KEY)")
        conn.execute("CREATE TABLE findings (id INTEGER PRIMARY KEY)")
        conn.executemany("INSERT INTO audit_log DEFAULT VALUES", [()] * 7)
        conn.executemany("INSERT INTO findings DEFAULT VALUES", [()] * 3)
    monkeypatch.setattr(browser_backup, "db_path", lambda: db)
    monkeypatch.setattr(browser_backup, "info", lambda: {"epoch": "e", "fingerprint": "f", "state_version": 1})

    payload, snap = browser_backup.export_snapshot()

    assert snap["counts"] == {"audit_log": 7, "findings": 3}
    assert base64.b64encode(payload)  # la copia sigue siendo el gzip de siempre


# --------------------------------------------------------------------------- #
#  El catalogo de fuentes: lo que el equipo cambia sobrevive a los reinicios
# --------------------------------------------------------------------------- #
from frente_b_support import api  # noqa: E402,F401  (fixture)

from app import catalog_service, link_matrix, matrix_store, source_matrix  # noqa: E402
from app.models import Source  # noqa: E402

XLSX = Path(__file__).parent / "fixtures" / "matriz_fuentes_escaneo_eh.xlsx"


@pytest.fixture()
def linked(api, monkeypatch, tmp_path):  # noqa: F811
    """Inventario por enlace con la matriz 'de la imagen' en un archivo temporal."""
    parsed = source_matrix.parse_workbook(XLSX)
    path = tmp_path / "matriz_enlaces_eh.json"
    monkeypatch.setattr(link_matrix, "DATA_FILE", path)
    link_matrix.write_packaged(parsed)
    with api.db() as db:
        catalog_service.sync_catalog(db, triggered_by="prueba")
    api.parsed = parsed
    api.matrix_path = path
    yield api
    source_matrix._cache = None


def _restart(linked) -> None:
    """Reinicio del servicio: nueva sincronizacion del catalogo, como en el arranque."""
    with linked.db() as db:
        catalog_service.sync_catalog(db, triggered_by="arranque")


def _source(linked, code="EH-003") -> Source:
    with linked.db() as db:
        return db.query(Source).filter(Source.catalog_code == code).one()


def test_basic_fields_edited_by_the_team_survive_a_restart(linked):
    src = _source(linked)
    edit = {
        "title": "Abbott (corregido por el equipo)",
        "url": "https://www.abbott.com/pagina-corregida",
        "scrape_enabled": False,
        "sync_frequency": "mensual",
        "scan_interval_hours": 720,
        "description": "Descripción del equipo",
    }
    assert linked.put(f"/api/sources/{src.id}", json=edit).status_code == 200

    _restart(linked)
    _restart(linked)

    after = _source(linked)
    for key, value in edit.items():
        assert getattr(after, key) == value, key
    assert set(edit) <= set(after.edited_fields)


def test_fields_the_team_did_not_touch_still_follow_the_matrix(linked):
    src = _source(linked)
    assert linked.put(f"/api/sources/{src.id}", json={"title": "Solo cambio el nombre"}).status_code == 200
    with linked.db() as db:
        row = db.get(Source, src.id)
        row.description = "valor viejo que nadie editó"
        db.commit()

    _restart(linked)

    after = _source(linked)
    assert after.title == "Solo cambio el nombre"
    assert after.description == src.description  # volvio al de la matriz


def test_reimporting_with_overwrite_is_the_only_way_to_discard_team_edits(linked):
    src = _source(linked)
    assert linked.put(f"/api/sources/{src.id}", json={"title": "Editado"}).status_code == 200
    with linked.db() as db:
        link_matrix.apply(db, linked.parsed, actor="prueba", overwrite=True)

    after = _source(linked)
    assert after.title == src.title
    assert "title" not in (after.edited_fields or [])


def test_a_source_the_team_took_out_of_the_catalog_is_not_reactivated(linked):
    src = _source(linked)
    assert linked.put(f"/api/sources/{src.id}", json={"catalog_active": False}).status_code == 200

    _restart(linked)

    assert _source(linked).catalog_active is False


def test_a_source_suspended_by_the_probe_is_not_reenabled_by_a_restart(linked):
    src = _source(linked)
    assert src.scrape_enabled is True
    with linked.db() as db:
        row = db.get(Source, src.id)
        row.scrape_enabled = False
        row.last_probe_detail = {"status": "rojo", "ingestion_suspended": True}
        db.commit()

    _restart(linked)

    assert _source(linked).scrape_enabled is False


def test_an_uploaded_matrix_survives_the_ephemeral_disk(linked):
    """Render vuelve al archivo de la imagen en cada reinicio: la matriz cargada se repone."""
    image = linked.matrix_path.read_text(encoding="utf-8")
    uploaded = json.loads(image)
    uploaded["rows"] = [r for r in uploaded["rows"] if r.get("code") != "EH-003"]
    with linked.db() as db:
        link_matrix.apply(db, uploaded, actor="equipo", overwrite=True)
        link_matrix.write_packaged(uploaded, db, actor="equipo")
    assert _source(linked).retired is True

    # Reinicio: el disco vuelve a la matriz de la imagen.
    linked.matrix_path.write_text(image, encoding="utf-8")
    source_matrix._cache = None
    _restart(linked)

    assert _source(linked).retired is True  # sigue vigente la matriz del equipo
    assert "EH-003" not in {r.get("code") for r in link_matrix.load_packaged()["rows"]}
    with linked.db() as db:
        assert matrix_store.rehydrate(db, "enlaces", linked.matrix_path) == "vigente"


def test_a_new_matrix_shipped_in_a_deploy_replaces_the_uploaded_one(linked):
    image = json.loads(linked.matrix_path.read_text(encoding="utf-8"))
    uploaded = {**image, "rows": [r for r in image["rows"] if r.get("code") != "EH-003"]}
    with linked.db() as db:
        link_matrix.write_packaged(uploaded, db, actor="equipo")

    # Despliegue con una matriz distinta a aquella sobre la que se cargo.
    shipped = {**image, "rows": [r for r in image["rows"] if r.get("code") != "EH-005"]}
    linked.matrix_path.write_text(json.dumps(shipped), encoding="utf-8")
    with linked.db() as db:
        assert matrix_store.rehydrate(db, "enlaces", linked.matrix_path) == "imagen_nueva"
        assert matrix_store.rehydrate(db, "enlaces", linked.matrix_path) == "sin_matriz_cargada"
    codes = {r.get("code") for r in json.loads(linked.matrix_path.read_text(encoding="utf-8"))["rows"]}
    assert "EH-003" in codes and "EH-005" not in codes


def test_a_damaged_stored_matrix_never_touches_the_disk(linked):
    image = linked.matrix_path.read_text(encoding="utf-8")
    with linked.db() as db:
        base = matrix_store.base_sha(db, "enlaces", linked.matrix_path)
        from app import settings_store

        settings_store.set_value(
            db, "matrix.uploaded.enlaces", json.dumps({"sha": "x", "base_sha": base, "data": "no-es-gzip"})
        )
        assert matrix_store.rehydrate(db, "enlaces", linked.matrix_path) == "error"
    assert linked.matrix_path.read_text(encoding="utf-8") == image


# --------------------------------------------------------------------------- #
#  Trabajo posterior a una restauracion: nunca se da por inexistente
# --------------------------------------------------------------------------- #
def test_any_write_after_a_restore_counts_as_work_even_without_the_version_counter(api):  # noqa: F811
    from app import audit, browser_backup
    from app.models import AppMeta

    with api.db() as db:
        version = browser_backup._meta(db, browser_backup.VERSION_KEY) or "0"
        db.merge(AppMeta(key=browser_backup.RESTORED_VERSION_KEY, value=version))
        db.commit()
        browser_backup.mark_restore_point(db)
        assert browser_backup._audit_untouched(db) is True

        # Una escritura que no toca el contador de version (como crear un usuario).
        audit.record_action(db, entity_type="users", entity_id="9", action="create")
        db.commit()

        assert (browser_backup._meta(db, browser_backup.VERSION_KEY) or "0") == version
        assert browser_backup._audit_untouched(db) is False


def test_bases_restored_before_this_mark_keep_the_previous_rule(api):  # noqa: F811
    from app import browser_backup

    with api.db() as db:
        assert browser_backup._meta(db, browser_backup.RESTORED_AUDIT_KEY) == ""
        assert browser_backup._audit_untouched(db) is True


def test_backup_endpoints_are_for_the_superadmin_and_leave_a_trail(api, monkeypatch):  # noqa: F811
    from app.models import AuditLog
    from app.routers import backup as backup_router

    # El router abre su propia sesion (la base se reemplaza al restaurar): en la
    # prueba apunta a la misma base en memoria que el cliente.
    monkeypatch.setattr(backup_router, "SessionLocal", api.Session)
    assert api.get("/api/backup/firebase/checkpoints", role="evaluador_tecnico").status_code == 403
    assert api.post("/api/backup/firebase/checkpoints/abc/restore", role="evaluador_tecnico").status_code == 403

    off = api.get("/api/backup/firebase/checkpoints")
    assert off.status_code == 200 and off.json()["enabled"] is False

    # Restaurar exige escribir la confirmacion.
    assert api.post("/api/backup/firebase/checkpoints/abc/restore").status_code == 400
    monkeypatch.setattr(firebase_db, "restore_checkpoint", lambda gen: {"ok": False, "reason": "not_found"})
    assert api.post("/api/backup/firebase/checkpoints/abc/restore?confirm=RESTAURAR").status_code == 404

    monkeypatch.setattr(
        firebase_db, "restore_checkpoint", lambda gen: {"ok": True, "restored": True, "taken_at": "2026-11-20T10:00:00+00:00"}
    )
    ok = api.post("/api/backup/firebase/checkpoints/abc123/restore?confirm=RESTAURAR")
    assert ok.status_code == 200 and ok.json()["access_token"]
    with api.db() as db:
        row = db.query(AuditLog).filter(AuditLog.action == "backup:restore_checkpoint").one()
        assert row.new_value["gen"] == "abc123" and row.user_email


def test_health_reports_the_backup_state_without_details(api):  # noqa: F811
    body = api.get("/api/health").json()
    assert body["status"] == "ok" and body["backup"] == {"enabled": False}
