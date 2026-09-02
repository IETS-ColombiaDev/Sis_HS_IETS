"""Suite de regresion de extremo a extremo contra la API en ejecucion.

Cubre la operacion heredada y las fases 0 a 6 del plan de actualizacion:
bitacora inmutable, RBAC de cinco perfiles, ciclo operativo, staging, filtrado
con desduplicacion e INVIMA, motor oficial %P, conectores de ingesta, portal
reactivo de postulacion, evaluacion temprana y revision por pares.

Uso:
    cd backend
    .\\.venv\\Scripts\\python.exe smoke_test.py
    .\\.venv\\Scripts\\python.exe smoke_test.py --base http://127.0.0.1:8000
    .\\.venv\\Scripts\\python.exe smoke_test.py --skip-network
"""
from __future__ import annotations

import argparse
import datetime as dt
import sys
import uuid

import httpx

DEFAULT_BASE = "http://127.0.0.1:8000"


class Runner:
    def __init__(self, base: str):
        self.base = base.rstrip("/")
        self.api = f"{self.base}/api"
        self.client = httpx.Client(timeout=120.0)
        self.errors: list[str] = []
        self.headers: dict[str, str] = {}

    def check(self, name: str, fn):
        try:
            fn()
            print(f"  OK   {name}")
        except Exception as exc:  # noqa: BLE001
            self.errors.append(f"{name}: {exc}")
            print(f"  FAIL {name}: {exc}")

    def get(self, path: str, **kwargs):
        r = self.client.get(f"{self.api}{path}", headers=self.headers, **kwargs)
        r.raise_for_status()
        return r.json()

    def post(self, path: str, json=None, expect: int | None = None):
        r = self.client.post(f"{self.api}{path}", headers=self.headers, json=json)
        if expect is not None:
            if r.status_code != expect:
                raise RuntimeError(f"esperaba HTTP {expect}, recibio {r.status_code}: {r.text[:200]}")
            return r.json() if r.content else None
        r.raise_for_status()
        return r.json() if r.content else None

    def put(self, path: str, json=None, expect: int | None = None):
        r = self.client.put(f"{self.api}{path}", headers=self.headers, json=json)
        if expect is not None:
            if r.status_code != expect:
                raise RuntimeError(f"esperaba HTTP {expect}, recibio {r.status_code}: {r.text[:200]}")
            return r.json() if r.content else None
        r.raise_for_status()
        return r.json() if r.content else None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default=DEFAULT_BASE)
    parser.add_argument("--skip-network", action="store_true", help="Omite pruebas que salen a internet")
    args = parser.parse_args()

    r = Runner(args.base)
    # Las verificaciones de bitacora solo miran lo que produce esta corrida: la
    # base puede traer registros de versiones anteriores del sistema.
    started_at = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None).isoformat()
    print(f"==> Suite de regresion contra {r.base}\n")

    # ----------------------------------------------------------------- #
    print("-- Disponibilidad")
    r.check("health", lambda: r.client.get(f"{r.api}/health").raise_for_status())
    r.check("status", lambda: r.client.get(f"{r.api}/status").raise_for_status())

    # ----------------------------------------------------------------- #
    print("\n-- Fase 0: autenticacion y RBAC de cinco perfiles")
    session = {}

    def login():
        resp = r.client.post(
            f"{r.api}/auth/dev-login",
            json={"email": "admin@iets.org.co", "name": "Suite de regresion"},
        )
        resp.raise_for_status()
        data = resp.json()
        r.headers = {"Authorization": f"Bearer {data['access_token']}"}
        session.update(data["user"])
        if data["user"]["role"] != "superadmin":
            raise RuntimeError(f"se esperaba perfil superadmin, llego {data['user']['role']}")

    r.check("dev-login como superadmin", login)

    def check_permissions():
        me = r.get("/auth/me")
        for required in ("user:manage", "cycle:close", "audit:read", "priority:rate:tecnico"):
            if required not in me["permissions"]:
                raise RuntimeError(f"falta el permiso {required}")
        if sorted(me["rateable_criteria"]) != ["P1", "P2", "P3", "P4", "P5", "P6"]:
            raise RuntimeError("el superadmin debe poder calificar los seis criterios")

    r.check("matriz de permisos en /auth/me", check_permissions)

    def check_roles_catalog():
        roles = r.get("/users/roles")
        if len(roles) != 5:
            raise RuntimeError(f"se esperaban 5 perfiles, llegaron {len(roles)}")
        codes = {x["code"] for x in roles}
        expected = {
            "superadmin",
            "evaluador_tecnico",
            "evaluador_clinico",
            "tomador_decisiones",
            "revisor_pares",
        }
        if codes != expected:
            raise RuntimeError(f"perfiles inesperados: {codes}")

    r.check("catalogo de perfiles", check_roles_catalog)

    # ----------------------------------------------------------------- #
    print("\n-- Operacion heredada")
    for path in (
        "/sources",
        "/findings",
        "/notes",
        "/recommendations",
        "/scan/logs",
        "/dashboard/stats",
        "/dashboard/workbench",
        "/realtime/version",
    ):
        r.check(f"GET {path}", lambda p=path: r.get(p))

    r.check("export sources", lambda: r.client.get(f"{r.api}/sources/export", headers=r.headers).raise_for_status())
    r.check("export notes", lambda: r.client.get(f"{r.api}/notes/export?format=csv", headers=r.headers).raise_for_status())

    note = {}
    r.check(
        "crear nota",
        lambda: note.update(
            r.post("/notes", {"title": "Regresion", "content": "Prueba automatica", "entity_type": "general"})
        ),
    )
    r.check(
        "eliminar nota",
        lambda: r.client.delete(f"{r.api}/notes/{note['id']}", headers=r.headers).raise_for_status(),
    )

    # ----------------------------------------------------------------- #
    print("\n-- Fase 1: catalogos parametrizables")

    def check_clusters():
        clusters = r.get("/clusters")
        if len(clusters) < 6:
            raise RuntimeError(f"se esperaban al menos 6 clusteres, llegaron {len(clusters)}")

    def check_types():
        types = r.get("/tech-types")
        if len(types) < 7:
            raise RuntimeError(f"se esperaban al menos 7 tipologias, llegaron {len(types)}")

    def check_params():
        params = {p["key"] for p in r.get("/methodology/params")}
        for key in ("cycle.max_per_year", "cycle.window_weeks_min", "priority.points_prioritized"):
            if key not in params:
                raise RuntimeError(f"falta el parametro metodologico {key}")

    def check_enums():
        enums = r.get("/methodology/enums")
        for key in ("cycle_statuses", "technology_statuses", "conditions", "exclusion_reasons"):
            if not enums.get(key):
                raise RuntimeError(f"falta el catalogo de estados {key}")

    r.check("6 clusteres de salud", check_clusters)
    r.check("7 tipologias tecnologicas", check_types)
    r.check("parametros metodologicos en BD", check_params)
    r.check("catalogo de estados", check_enums)

    # ----------------------------------------------------------------- #
    print("\n-- Fase 1: ciclo operativo y maquina de estados")
    suffix = uuid.uuid4().hex[:6]
    today = dt.date.today()
    cycle = {}
    quota = {}

    def raise_quota():
        """La cuota anual es de 3 ciclos; se eleva para no agotarla entre corridas."""
        current = next(p for p in r.get("/methodology/params") if p["key"] == "cycle.max_per_year")
        quota["original"] = current["value"]
        r.put("/methodology/params/cycle.max_per_year", {"value": "999"})

    r.check("elevar cuota anual temporalmente", raise_quota)

    def reject_short_window():
        r.post(
            "/cycles",
            {
                "code": f"REG-corto-{suffix}",
                "opened_on": str(today),
                "data_cutoff_on": str(today + dt.timedelta(weeks=2)),
                "bulletin_due_on": str(today + dt.timedelta(weeks=3)),
            },
            expect=422,
        )

    r.check("rechaza ventana menor a 10 semanas", reject_short_window)

    def create_cycle():
        cycle.update(
            r.post(
                "/cycles",
                {
                    "code": f"REG-{suffix}",
                    "opened_on": str(today),
                    "data_cutoff_on": str(today + dt.timedelta(weeks=8)),
                    "bulletin_due_on": str(today + dt.timedelta(weeks=12)),
                    "notes": "Ciclo creado por la suite de regresion.",
                },
            )
        )
        if cycle["status"] != "en_configuracion":
            raise RuntimeError(f"estado inicial inesperado: {cycle['status']}")

    r.check("crear ciclo con ventana valida", create_cycle)

    def reject_invalid_transition():
        r.put(f"/cycles/{cycle['id']}/status", {"status": "en_evaluacion", "justification": ""}, expect=409)

    r.check("rechaza transicion invalida", reject_invalid_transition)

    def advance_to_prioritization():
        r.put(f"/cycles/{cycle['id']}/status", {"status": "en_filtrado", "justification": ""})
        updated = r.put(f"/cycles/{cycle['id']}/status", {"status": "en_priorizacion", "justification": ""})
        if updated["status"] != "en_priorizacion":
            raise RuntimeError(f"estado inesperado: {updated['status']}")

    r.check("transiciones validas hasta priorizacion", advance_to_prioritization)

    # ----------------------------------------------------------------- #
    print("\n-- Fase 1: staging y asignacion por lotes")
    staged = {}

    def read_staging():
        staged["stats"] = r.get("/technologies/staging/stats")
        staged["items"] = r.get("/technologies/staging", params={"limit": 5})

    r.check("bandeja de entrada", read_staging)

    def reject_unclassified():
        unclassified = [t for t in staged.get("items", []) if not (t["cluster_id"] and t["tech_type_id"])]
        if not unclassified:
            print("       (sin senales sin clasificar; se omite la verificacion)")
            return
        result = r.post(
            "/technologies/assign-to-cycle",
            {"technology_ids": [unclassified[0]["id"]], "cycle_id": cycle["id"]},
        )
        if result["assigned"] != 0 or not result["rejected"]:
            raise RuntimeError("una senal sin cluster o tipologia no debe poder asignarse")

    r.check("bloquea asignacion sin cluster ni tipologia", reject_unclassified)

    def classify_and_assign():
        items = staged.get("items") or []
        if not items:
            raise RuntimeError("no hay senales en el staging para probar la asignacion")
        clusters = r.get("/clusters")
        types = r.get("/tech-types")
        target = items[0]
        r.put(
            f"/technologies/{target['id']}",
            {
                "cluster_id": clusters[0]["id"],
                "tech_type_id": types[0]["id"],
                "condition": "emergente",
                "regulatory_status": "Sometido a revision FDA",
                "fda_approval_date": str(today - dt.timedelta(days=60)),
            },
        )
        result = r.post(
            "/technologies/assign-to-cycle",
            {"technology_ids": [target["id"]], "cycle_id": cycle["id"]},
        )
        if result["assigned"] != 1:
            raise RuntimeError(f"no se asigno la senal: {result}")
        staged["tech_id"] = target["id"]

    r.check("clasificar y asignar al ciclo", classify_and_assign)

    # ----------------------------------------------------------------- #
    print("\n-- Fase 3: filtrado, desduplicacion e INVIMA")

    def reject_qualify_without_novelty():
        """Criterio de aceptacion: nada avanza sin verificar la novedad."""
        r.post(
            f"/technologies/{staged['tech_id']}/cycles/{cycle['id']}/qualify",
            expect=409,
        )

    r.check("bloquea el paso a priorizacion sin criterio de novedad", reject_qualify_without_novelty)

    def dedup_scan():
        result = r.post(f"/screening/merges/scan?cycle_id={cycle['id']}")
        if result["threshold"] < 1:
            raise RuntimeError(f"umbral de similitud invalido: {result}")

    r.check("barrido de desduplicacion difusa", dedup_scan)

    def load_invima_index():
        """Carga por archivo plano: la ruta de contingencia del plan.

        La suite no depende del dato abierto porque su disponibilidad no esta
        garantizada, que es justamente el riesgo que la contingencia cubre.
        """
        csv = (
            "expediente;rsynso;producto;principioactivo;titular;estadoregistro;fechavencimiento\n"
            "SMOKE-1;INVIMA SMOKE-1;PRODUCTO DE PRUEBA SMOKE;MOLECULA SMOKE;TITULAR SMOKE;Vigente;31/12/2035\n"
        ).encode("utf-8")
        response = r.client.post(
            f"{r.api}/invima/sync/file",
            headers=r.headers,
            files={"file": ("registros_smoke.csv", csv, "text/csv")},
        )
        response.raise_for_status()
        log = response.json()
        if log["status"] == "error":
            raise RuntimeError(f"la carga plana fallo: {log['message']}")
        status = r.get("/invima/status")
        if status["total_records"] < 1:
            raise RuntimeError("el indice quedo vacio tras la carga")
        if status["stale"]:
            raise RuntimeError("un indice recien cargado no puede reportarse desactualizado")

    r.check("carga del indice INVIMA por archivo plano", load_invima_index)

    def invima_search_is_fast():
        start = dt.datetime.now()
        r.get("/invima/search", params={"q": "producto de prueba smoke"})
        elapsed_ms = (dt.datetime.now() - start).total_seconds() * 1000
        if elapsed_ms > 1000:
            raise RuntimeError(f"la consulta al indice tardo {elapsed_ms:.0f} ms")

    r.check("consulta al indice local del INVIMA", invima_search_is_fast)

    def invima_cross_check():
        state = r.post(f"/screening/novelty/{cycle['id']}/{staged['tech_id']}/invima-check")
        if not state["invima_checked_at"]:
            raise RuntimeError("el cruce no quedo fechado")

    r.check("cruce de la tecnologia con el indice regulatorio", invima_cross_check)

    def reject_novelty_without_justification():
        r.put(
            f"/screening/novelty/{cycle['id']}/{staged['tech_id']}",
            {"option_code": "nueva_indicacion", "justification": "porque si"},
            expect=409,
        )

    r.check("exige justificacion explicita en la via de novedad", reject_novelty_without_justification)

    def save_novelty():
        state = r.put(
            f"/screening/novelty/{cycle['id']}/{staged['tech_id']}",
            {"option_code": "no_disponible_en_pais"},
        )
        if not state["can_qualify"]:
            raise RuntimeError(f"la compuerta sigue cerrada: {state['blocking_reason']}")

    r.check("registrar la via de novedad", save_novelty)

    def qualify():
        r.post(f"/technologies/{staged['tech_id']}/cycles/{cycle['id']}/qualify")

    r.check("marcar apta para priorizacion", qualify)

    def unique_list():
        data = r.get(f"/screening/unique-list/{cycle['id']}")
        found = any(
            item["technology_id"] == staged["tech_id"]
            for group in data["clusters"]
            for item in group["items"]
        )
        if not found:
            raise RuntimeError("la tecnologia apta no aparece en el Listado Unico")

    r.check("Listado Unico por cluster", unique_list)

    def export_unique_list():
        response = r.client.get(
            f"{r.api}/screening/unique-list/{cycle['id']}/export", headers=r.headers
        )
        response.raise_for_status()
        if "cluster;" not in response.text:
            raise RuntimeError("el CSV exportado no tiene la cabecera esperada")

    r.check("exportacion del Listado Unico", export_unique_list)

    # ----------------------------------------------------------------- #
    print("\n-- Fase 4: conectores, crudo y portal reactivo")

    def list_connectors():
        codes = {c["code"] for c in r.get("/ingest/connectors")}
        needed = {"clinicaltrials", "fda", "ema", "pubmed", "html"}
        if not needed <= codes:
            raise RuntimeError(f"faltan conectores: {needed - codes}")

    r.check("catalogo de conectores", list_connectors)

    def ingest_fixture_and_raw():
        src = r.post(
            "/sources",
            {
                "title": f"Fixture-{suffix}",
                "url": f"https://fixture.example/{suffix}",
                "connector": "fixture",
                "scrape_enabled": True,
                "connector_config": {
                    "records": [
                        {
                            "external_id": f"EXT-{suffix}",
                            "title": f"Contrato mAb {suffix}",
                            "commercial_name": f"Contrato mAb {suffix}",
                            "inn_name": "contratumab",
                            "manufacturer": "Acme",
                            "indication": "Melanoma",
                            "nct_ids": ["NCT11111111"],
                            "raw": {"id": f"EXT-{suffix}", "phase": "PHASE3"},
                        }
                    ]
                },
            },
        )
        result = r.post("/ingest/run", {"source_ids": [src["id"]], "process_now": True})
        if result.get("processed") != 1:
            raise RuntimeError(f"el job no se proceso en la peticion: {result}")
        job = result["jobs"][0]
        if job["status"] not in {"ok", "parcial"} or job["items_new"] < 1:
            raise RuntimeError(f"fixture no persistio senales: {job}")
        items = r.get("/technologies/staging", params={"q": f"Contrato mAb {suffix}"})
        if not items:
            raise RuntimeError("la senal del conector no llego al staging")
        raw = r.get(f"/ingest/raw/{items[0]['id']}")
        if raw.get("payload", {}).get("id") != f"EXT-{suffix}":
            raise RuntimeError("el crudo no permite reconstruir la senal original")

    r.check("conector de contrato deja crudo y staging", ingest_fixture_and_raw)

    def public_submission_and_accept():
        resp = r.client.post(
            f"{r.api}/public/submissions",
            json={
                "commercial_name": f"Postulada {suffix}",
                "inn_name": "postulumab",
                "mechanism": "Anticuerpo monoclonal de prueba",
                "manufacturer": "Sociedad cientifica",
                "indication": "Asma grave",
                "development_phase": "Fase III",
                "evidence_links": ["https://clinicaltrials.gov/study/NCT22222222"],
                "has_conflict": False,
                "coi_accepted": True,
                "submitter_name": "Ana Perez",
                "submitter_email": f"ana.{suffix}@universidad.edu",
                "submitter_org": "Universidad",
            },
        )
        if resp.status_code != 201:
            raise RuntimeError(f"el portal publico rechazo la postulacion: {resp.status_code} {resp.text[:200]}")
        ack = resp.json()
        listed = r.get("/submissions", params={"status": "recibida"})
        if not any(s["id"] == ack["id"] for s in listed):
            raise RuntimeError("la postulacion no aparecio en moderacion")
        r.post(f"/submissions/{ack['id']}/accept", {"note": "Aceptada por la suite"})
        reactive = r.get("/technologies/staging", params={"channel": "reactiva", "q": f"Postulada {suffix}"})
        if not reactive:
            raise RuntimeError("la postulacion aceptada no llego a la bandeja como reactiva")
        if reactive[0].get("source_channel") != "reactiva":
            raise RuntimeError("el canal no quedo marcado como reactivo")

    r.check("postulacion publica llega a bandeja como reactiva", public_submission_and_accept)

    def reject_submission_without_coi():
        resp = r.client.post(
            f"{r.api}/public/submissions",
            json={
                "commercial_name": "Sin COI",
                "inn_name": "nocoimab",
                "mechanism": "x",
                "manufacturer": "x",
                "indication": "x",
                "development_phase": "Fase II",
                "evidence_links": ["https://example.org"],
                "coi_accepted": False,
                "submitter_name": "Nadie",
                "submitter_email": "nadie@example.org",
            },
        )
        if resp.status_code != 422:
            raise RuntimeError(f"esperaba 422 sin COI, recibio {resp.status_code}")

    r.check("rechaza postulacion sin declaracion de conflicto", reject_submission_without_coi)

    # ----------------------------------------------------------------- #
    print("\n-- Fase 2: motor oficial de priorizacion %P")

    def check_criteria():
        criteria = r.get("/priority/criteria")
        codes = [c["code"] for c in criteria]
        if codes != ["P1", "P2", "P3", "P4", "P5", "P6"]:
            raise RuntimeError(f"matriz incompleta: {codes}")
        if not any(c["auto_prefill"] for c in criteria):
            raise RuntimeError("ningun criterio tiene pre-llenado automatico")

    r.check("matriz P1 a P6 versionada", check_criteria)

    def check_suggestions():
        state = r.get(f"/priority/{cycle['id']}/{staged['tech_id']}")
        suggested = [s for s in state["scores"] if s["auto_suggested"] is not None]
        if len(suggested) < 3:
            raise RuntimeError("se esperaban sugerencias automaticas para P1, P5 y P6")

    r.check("pre-llenado de P1, P5 y P6", check_suggestions)

    def partial_rating():
        state = r.post(
            f"/priority/{cycle['id']}/{staged['tech_id']}/rate",
            {"criterion": "P1", "value": 1, "justification": "Sin registro sanitario en Colombia"},
        )
        if state["complete"] or state["priority_pct"] is not None:
            raise RuntimeError("el %P no debe calcularse con criterios pendientes")
        if len(state["missing"]) != 5:
            raise RuntimeError(f"faltantes inesperados: {state['missing']}")

    r.check("el %P no se calcula incompleto", partial_rating)

    def reject_invalid_value():
        r.post(
            f"/priority/{cycle['id']}/{staged['tech_id']}/rate",
            {"criterion": "P2", "value": 5},
            expect=422,
        )

    r.check("rechaza valor no binario", reject_invalid_value)

    def complete_rating():
        for code, value in (("P2", 1), ("P3", 1), ("P4", 0), ("P5", 1), ("P6", 0)):
            state = r.post(
                f"/priority/{cycle['id']}/{staged['tech_id']}/rate",
                {"criterion": code, "value": value},
            )
        if not state["complete"]:
            raise RuntimeError("la matriz deberia estar completa")
        if state["points"] != 4:
            raise RuntimeError(f"puntos inesperados: {state['points']}")
        if state["priority_pct"] != 66.67:
            raise RuntimeError(f"%P inesperado: {state['priority_pct']}")
        if state["classification"] != "priorizada":
            raise RuntimeError(f"clasificacion inesperada: {state['classification']}")

    r.check("4 puntos clasifican como priorizada (%P = 66,67)", complete_rating)

    def check_queue():
        queue = r.get(f"/priority/{cycle['id']}/queue")
        if not any(i["technology_id"] == staged["tech_id"] for i in queue):
            raise RuntimeError("la tecnologia no aparece en la cola del ciclo")
        stats = r.get(f"/priority/{cycle['id']}/stats")
        if stats["prioritized"] < 1:
            raise RuntimeError("el contador de priorizadas no se actualizo")

    r.check("cola y contadores de priorizacion", check_queue)

    # ----------------------------------------------------------------- #
    print("\n-- Fase 5: evaluacion temprana, Mini-HTA y pares")
    report = {}

    def send_to_eval():
        tech = r.post(f"/technologies/{staged['tech_id']}/cycles/{cycle['id']}/to-evaluation")
        if tech["status"] != "en_evaluacion":
            raise RuntimeError(f"no paso a evaluacion: {tech['status']}")
        queue = r.get("/reports", params={"cycle_id": cycle["id"]})
        item = next((i for i in queue if i["technology_id"] == staged["tech_id"]), None)
        if not item or not item.get("doc_id"):
            raise RuntimeError("el pase a evaluacion no abrio el expediente")
        report.update(item)

    r.check("priorizada pasa a evaluacion y abre ficha", send_to_eval)

    def coi_blocks_body():
        data = r.get(f"/reports/{report['doc_id']}")
        if not data.get("coi_required"):
            raise RuntimeError("el COI deberia ser bloqueante en la primera lectura")
        if data.get("body") is not None:
            raise RuntimeError("el cuerpo no debe entregarse sin COI")

    r.check("sin COI no se entrega el cuerpo del informe", coi_blocks_body)

    def sign_and_fill():
        opened = r.post(f"/reports/{report['doc_id']}/coi", {"accepted": True, "has_conflict": False})
        if opened.get("coi_required") or opened.get("body") is None:
            raise RuntimeError("tras firmar el COI deberia entregarse el cuerpo")
        body = {
            "health_condition": "Asma grave no controlada",
            "mechanism": "Anticuerpo monoclonal de prueba",
            "target_population_co": "Adultos con asma grave en el SGSSS",
            "evidence_state": "Fase III con desenlace de exacerbaciones",
            "comparators_sgsss": "Corticoides inhalados a dosis altas",
            "adoption_risks": "Presion presupuestal y desplazamiento de alternativa",
        }
        saved = r.put(f"/reports/{report['doc_id']}", {"body": body, "title": f"Ficha {suffix}"})
        if not saved["completeness"]["complete"]:
            raise RuntimeError(f"la ficha sigue incompleta: {saved['completeness']}")
        moved = r.post(f"/reports/{report['doc_id']}/transition", {"status": "revision_interna"})
        if moved["status"] != "revision_interna":
            raise RuntimeError(f"no entro a revision interna: {moved['status']}")

    r.check("COI, ficha completa y envio a revision interna", sign_and_fill)

    def reject_publish_without_external():
        r.post(f"/reports/{report['doc_id']}/transition", {"status": "revision_externa"})
        r.post(f"/reports/{report['doc_id']}/transition", {"status": "aprobado_comite"})
        r.post(
            f"/reports/{report['doc_id']}/transition",
            {"status": "publicado"},
            expect=409,
        )

    r.check("no publica sin revisor externo con COI", reject_publish_without_external)

    def invite_and_review():
        invite = r.post(
            f"/reports/{report['doc_id']}/invite",
            {
                "kind": "externo",
                "reviewer_name": "Revisor Externo",
                "reviewer_email": f"par.{suffix}@universidad.edu",
            },
        )
        token = invite.get("token")
        if not token:
            raise RuntimeError("la invitacion externa debe devolver el token una vez")
        raw = r.client.get(f"{r.api}/public/reviews/{token}")
        raw.raise_for_status()
        preview = raw.json()
        if preview["access"] != "coi_required" or preview.get("body") is not None:
            raise RuntimeError("el portal no debe mostrar el informe antes del COI")
        granted = r.client.post(
            f"{r.api}/public/reviews/{token}/coi",
            json={"accepted": True, "has_conflict": False},
        )
        if granted.status_code != 200 or granted.json().get("access") != "granted":
            raise RuntimeError(f"el COI del portal no habilito la lectura: {granted.text[:200]}")
        if not granted.json().get("body"):
            raise RuntimeError("tras el COI el portal debe entregar el cuerpo")
        done = r.client.post(
            f"{r.api}/public/reviews/{token}/submit",
            json={"verdict": "aprobado", "note": "Sin observaciones de la suite"},
        )
        if done.status_code != 200:
            raise RuntimeError(f"el revisor no pudo enviar el veredicto: {done.text[:200]}")
        published = r.post(f"/reports/{report['doc_id']}/transition", {"status": "publicado"})
        if published["status"] != "publicado":
            raise RuntimeError(f"no publico: {published['status']}")
        report["token"] = token

    r.check("revisor externo con COI habilita la publicacion", invite_and_review)

    def export_and_history():
        html = r.client.get(f"{r.api}/reports/{report['doc_id']}/export", headers=r.headers)
        html.raise_for_status()
        if "Instituto de Evaluacion Tecnologica en Salud" not in html.text:
            raise RuntimeError("el HTML no trae la marca institucional")
        versions = r.get(f"/reports/{report['doc_id']}/versions")
        if len(versions) < 3:
            raise RuntimeError(f"el historial deberia reconstruir transiciones, tiene {len(versions)}")

    r.check("HTML institucional e historial de versiones", export_and_history)

    def expired_reviewer_token():
        # Un JWT de revision ya resuelto sigue siendo el mismo token; caducamos
        # uno sintetico con el mismo alcance para verificar el rechazo auditado.
        from datetime import timedelta

        from app.security import create_access_token

        stale = create_access_token(
            subject="expirado@example.org",
            extra={"typ": "review", "aid": 0, "doc": report["doc_id"]},
            expires_delta=timedelta(seconds=-30),
        )
        resp = r.client.get(f"{r.api}/public/reviews/{stale}")
        if resp.status_code != 401:
            raise RuntimeError(f"el token caducado debio denegarse, recibio {resp.status_code}")

    r.check("token de revisor caducado deniega el acceso", expired_reviewer_token)

    # ----------------------------------------------------------------- #
    print("\n-- Fase 2: congelacion al cierre del ciclo")

    def close_cycle():
        r.put(f"/cycles/{cycle['id']}/status", {"status": "en_evaluacion", "justification": ""})
        closed = r.put(
            f"/cycles/{cycle['id']}/status",
            {"status": "cerrado_consolidado", "justification": "Cierre de la suite de regresion"},
        )
        if closed["status"] != "cerrado_consolidado":
            raise RuntimeError(f"el ciclo no cerro: {closed['status']}")

    r.check("cerrar y consolidar", close_cycle)

    # ----------------------------------------------------------------- #
    print("\n-- Fase 6: tablero, ficha publica, boletines y alertas")

    def strategy_dashboard_from_datamart():
        board = r.get("/strategy/dashboard", params={"cycle_id": cycle["id"]})
        if board["funnel"]["prioritized"] < 1:
            raise RuntimeError("el embudo no refleja la tecnologia priorizada")
        if "budget_heatmap" not in board:
            raise RuntimeError("el superadmin deberia ver la capa restringida")

    r.check("tablero estrategico con capa restringida", strategy_dashboard_from_datamart)

    def public_stats_hide_budget():
        resp = r.client.get(f"{r.api}/public/strategy/stats")
        resp.raise_for_status()
        data = resp.json()
        if "budget" in data or "budget_heatmap" in data or "comparators" in data:
            raise RuntimeError("la vista publica filtro modelaciones presupuestales")
        if "published" not in data:
            raise RuntimeError("faltan agregados de transparencia")

    r.check("estadisticas publicas sin presupuestos", public_stats_hide_budget)

    def public_fiche_of_published():
        listed = r.client.get(f"{r.api}/public/technologies", params={"q": suffix})
        listed.raise_for_status()
        items = listed.json()
        if not any(i["id"] == staged["tech_id"] for i in items):
            raise RuntimeError("la ficha publicada no aparece en el buscador publico")
        fiche = r.client.get(f"{r.api}/public/technologies/{staged['tech_id']}")
        fiche.raise_for_status()
        body = fiche.json().get("body") or {}
        if "budget_year_1" in body or "comparators_sgsss" in body:
            raise RuntimeError("la ficha publica expuso campos restringidos")
        html = r.client.get(f"{r.api}/public/technologies/{staged['tech_id']}/export")
        html.raise_for_status()
        if "Ficha publica" not in html.text:
            raise RuntimeError("el HTML publico no trae la marca de ficha publica")

    r.check("ficha publica sin campos restringidos", public_fiche_of_published)

    def bulletin_needs_approval():
        listed = r.get("/bulletins", params={"cycle_id": cycle["id"]})
        if not listed:
            raise RuntimeError("el cierre del ciclo no compilo el boletin")
        draft = listed[0]
        if draft["status"] not in {"pendiente_aprobacion", "borrador"}:
            raise RuntimeError(f"estado inesperado del boletin: {draft['status']}")
        r.post(f"/bulletins/{draft['id']}/approve", {"publish": False})
        published = r.post(f"/bulletins/{draft['id']}/approve", {"publish": True})
        if published["status"] != "publicado":
            raise RuntimeError("el boletin no se publico tras la aprobacion")

    r.check("boletin compilado al cierre y publicado con aprobacion", bulletin_needs_approval)

    def reject_unauthenticated_restricted():
        resp = r.client.get(
            f"{r.api}/strategy/dashboard",
            params={"cycle_id": cycle["id"]},
        )
        # Esta peticion va sin quitar el token del runner; se verifica la
        # exclusion en la capa publica. Un GET anonimo:
        anon = httpx.Client(timeout=30.0)
        denied = anon.get(f"{r.api}/strategy/dashboard", params={"cycle_id": cycle["id"]})
        anon.close()
        if denied.status_code not in {401, 403}:
            raise RuntimeError(f"el tablero restringido debio exigir auth, recibio {denied.status_code}")

    r.check("el tablero autenticado no es publico", reject_unauthenticated_restricted)

    def reject_frozen_rating():
        r.post(
            f"/priority/{cycle['id']}/{staged['tech_id']}/rate",
            {"criterion": "P1", "value": 0},
            expect=409,
        )

    r.check("rechaza calificar un ciclo congelado", reject_frozen_rating)

    # ----------------------------------------------------------------- #
    print("\n-- Fase 0: bitacora inmutable")

    def audit_has_trail():
        page = r.get("/audit", params={"entity_type": "cycles", "limit": 50})
        actions = {e["action"] for e in page["items"]}
        for required in ("create", "cycle:transition", "cycle:close"):
            if required not in actions:
                raise RuntimeError(f"la bitacora no registro '{required}'. Registradas: {actions}")

    r.check("registra creacion, transicion y cierre del ciclo", audit_has_trail)

    def audit_attributes_the_real_user():
        """Un registro atribuido a 'sistema' no sirve ante una auditoria.

        El usuario se resuelve en una dependencia que corre en el threadpool,
        con una copia del contexto; si la propagacion se rompe, todo queda
        atribuido al sistema y el defecto pasa inadvertido.
        """
        page = r.get("/audit", params={"limit": 200})
        propias = [
            e
            for e in page["items"]
            if e["occurred_at"] >= started_at
            and (e["request_path"] or "").startswith(("POST", "PUT"))
            and "/public/" not in (e["request_path"] or "")
        ]
        if not propias:
            raise RuntimeError("no hay registros de escritura de esta corrida que verificar")
        anonimas = [e for e in propias if e["user_email"] in ("", None, "sistema")]
        if anonimas:
            rutas = sorted({e["request_path"] for e in anonimas})
            raise RuntimeError(f"{len(anonimas)} registro(s) sin usuario real en: {rutas[:3]}")
        sin_ip = [e for e in propias if not e["ip_address"]]
        if sin_ip:
            raise RuntimeError(f"{len(sin_ip)} registro(s) sin direccion IP")

    r.check("atribuye cada cambio al usuario real, con IP y ruta", audit_attributes_the_real_user)

    def audit_entity_trail():
        trail = r.get(f"/audit/entity/cycles/{cycle['id']}")
        if len(trail) < 3:
            raise RuntimeError(f"la vida del ciclo deberia tener al menos 3 eventos, tiene {len(trail)}")

    r.check("reconstruye la vida completa del ciclo", audit_entity_trail)

    def audit_covers_methodology_params():
        """Un umbral que gobierna un calculo oficial no cambia sin dejar rastro."""
        trail = r.get("/audit/entity/methodology_params/cycle.max_per_year")
        if not any(e["action"] == "update" for e in trail):
            raise RuntimeError("el cambio de cuota anual no quedo registrado")

    r.check("registra cambios de parametros metodologicos", audit_covers_methodology_params)

    # ----------------------------------------------------------------- #
    if not args.skip_network:
        print("\n-- Captura desde la red")

        def preview():
            data = r.post("/scan/preview", {"url": "https://io.nihr.ac.uk/"})
            if not data.get("ok"):
                raise RuntimeError(data.get("message") or "la previsualizacion fallo")

        r.check("previsualizacion de enlace", preview)

    if quota.get("original"):
        r.check(
            "restaurar cuota anual",
            lambda: r.put("/methodology/params/cycle.max_per_year", {"value": quota["original"]}),
        )

    r.client.close()

    print()
    if r.errors:
        print(f"{len(r.errors)} error(es):")
        for e in r.errors:
            print(f"  - {e}")
        return 1

    print(f"Suite completa en verde (perfil={session.get('role')}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
