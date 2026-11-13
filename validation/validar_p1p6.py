"""Validacion P1-P6: compara la calificacion de un experto con la del sistema para un ciclo.

1. Llenar la plantilla
   Copia `plantilla_validacion_p1p6.csv` y llena una fila por tecnologia:
     tecnologia_id  ID de la tecnologia en el sistema
     nombre         Nombre (solo para el reporte)
     P1..P6         Si o No (tambien acepta Sí, 1, 0)
     justificacion  Texto libre del experto

2. Uso: python validation/validar_p1p6.py --csv <archivo> --ciclo <id> [--db URL | --api URL --token JWT]

3. Reporta: acuerdo y kappa de Cohen por criterio, acuerdo en la categoría final con los umbrales configurados 
en priority_engine, y diferencia de %P. Solo lee; no modifica la BD.

"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import urllib.request
from pathlib import Path

CRITERIA = ("P1", "P2", "P3", "P4", "P5", "P6")
ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
YES = {"si", "sí", "s", "1", "yes", "true"}
NO = {"no", "n", "0", "false"}


# --------------------------------------------------------------------------- #
#  Lectura
# --------------------------------------------------------------------------- #
def parse_bin(raw: str) -> int | None:
    value = (raw or "").strip().lower()
    if value in YES:
        return 1
    if value in NO:
        return 0
    return None


def read_csv(path: Path) -> list[dict]:
    rows = []
    with path.open(newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh)
        missing = [c for c in ("tecnologia_id", *CRITERIA) if c not in (reader.fieldnames or [])]
        if missing:
            sys.exit(f"El CSV no tiene las columnas: {', '.join(missing)}")
        for line, row in enumerate(reader, start=2):
            if not (row.get("tecnologia_id") or "").strip():
                continue
            values = {c: parse_bin(row.get(c, "")) for c in CRITERIA}
            bad = [c for c, v in values.items() if v is None]
            if bad:
                print(f"  [aviso] fila {line}: valor no Si/No en {', '.join(bad)}; se omite ese criterio")
            rows.append(
                {
                    "id": int(row["tecnologia_id"]),
                    "nombre": (row.get("nombre") or "").strip(),
                    "values": values,
                }
            )
    return rows


class DbSource:
    """Lee las calificaciones con las funciones de priority_engine."""

    def __init__(self, url: str):
        os.environ["DATABASE_URL"] = url
        sys.path.insert(0, str(BACKEND))
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker

        from app import priority_engine
        from app.methodology import get_param

        self.pe = priority_engine
        self.db = sessionmaker(bind=create_engine(url))()
        self.total = priority_engine.criteria_total(self.db)
        self.prioritized_at = int(get_param(self.db, "priority.points_prioritized", 4) or 4)
        self.watch_at = int(get_param(self.db, "priority.points_watch", 3) or 3)
        self.origin = f"BD ({url})"

    def scores(self, cycle_id: int, tech_id: int) -> dict[str, int]:
        return {c: int(s.value) for c, s in self.pe.get_scores(self.db, cycle_id, tech_id).items()}

    def classify(self, points: int) -> str:
        return self.pe.classify(self.db, points)

    def pct(self, points: int) -> float:
        return self.pe.compute_percentage(points, self.total)


class ApiSource:
    """Lee GET /api/priority/{ciclo}/{tecnologia}; usa los umbrales que reporta la API."""

    def __init__(self, base: str, token: str):
        self.base = base.rstrip("/")
        self.token = token
        self.total = self.prioritized_at = self.watch_at = None
        self.origin = f"API ({self.base})"

    def _get(self, cycle_id: int, tech_id: int) -> dict:
        req = urllib.request.Request(
            f"{self.base}/api/priority/{cycle_id}/{tech_id}",
            headers={"Authorization": f"Bearer {self.token}"},
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def scores(self, cycle_id: int, tech_id: int) -> dict[str, int]:
        state = self._get(cycle_id, tech_id)
        if self.total is None:
            self.total = int(state.get("total_criteria") or 6)
            self.prioritized_at = int(state.get("threshold_points") or 4)
            self.watch_at = int(state.get("watch_points") or 3)
        return {s["criterion"]: int(s["value"]) for s in state.get("scores", []) if s.get("value") is not None}

    def classify(self, points: int) -> str:
        # Misma regla de priority_engine.classify con los umbrales que expone la API.
        if points >= self.prioritized_at:
            return "priorizada"
        if points >= self.watch_at:
            return "bajo_vigilancia"
        return "no_priorizada"

    def pct(self, points: int) -> float:
        return round(points / self.total * 100, 2) if self.total else 0.0


# --------------------------------------------------------------------------- #
#  Estadisticos
# --------------------------------------------------------------------------- #
def cohen_kappa(pairs: list[tuple]) -> float | None:
    n = len(pairs)
    if n == 0:
        return None
    labels = {a for a, _ in pairs} | {b for _, b in pairs}
    po = sum(a == b for a, b in pairs) / n
    pe = sum(
        (sum(a == k for a, _ in pairs) / n) * (sum(b == k for _, b in pairs) / n) for k in labels
    )
    if pe == 1:
        return None  # sin variabilidad: kappa indefinida
    return (po - pe) / (1 - pe)


def fmt_kappa(k: float | None) -> str:
    return "n/d" if k is None else f"{k:.3f}"


def pct_agree(pairs: list[tuple]) -> str:
    return "n/d" if not pairs else f"{100 * sum(a == b for a, b in pairs) / len(pairs):.1f}%"


# --------------------------------------------------------------------------- #
def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--csv", required=True, type=Path, help="CSV del experto (ver plantilla)")
    ap.add_argument("--ciclo", required=True, type=int, help="ID del ciclo a comparar")
    ap.add_argument("--db", help="URL SQLAlchemy (por defecto DATABASE_URL o backend/iets_horizonte.db)")
    ap.add_argument("--api", help="URL base del backend; si se indica, se usa la API en lugar de la BD")
    ap.add_argument("--token", default=os.environ.get("IETS_TOKEN", ""), help="JWT para la API (o IETS_TOKEN)")
    args = ap.parse_args()

    if args.api:
        source = ApiSource(args.api, args.token)
    else:
        url = args.db or os.environ.get("DATABASE_URL") or f"sqlite:///{BACKEND / 'iets_horizonte.db'}"
        source = DbSource(url)

    expert_rows = read_csv(args.csv)
    per_criterion: dict[str, list[tuple]] = {c: [] for c in CRITERIA}
    cat_pairs, diffs, detail = [], [], []

    for row in expert_rows:
        system = source.scores(args.ciclo, row["id"])
        for c in CRITERIA:
            if row["values"][c] is not None and c in system:
                per_criterion[c].append((row["values"][c], system[c]))
        exp_ok = all(v is not None for v in row["values"].values())
        sys_ok = all(c in system for c in CRITERIA)
        if not (exp_ok and sys_ok):
            reason = "sin calificación completa en el sistema" if exp_ok else "CSV incompleto"
            detail.append(f"  {row['id']:>5}  {row['nombre'][:30]:<30}  -- excluida: {reason}")
            continue
        e_pts, s_pts = sum(row["values"].values()), sum(system[c] for c in CRITERIA)
        e_pct, s_pct = source.pct(e_pts), source.pct(s_pts)
        e_cat, s_cat = source.classify(e_pts), source.classify(s_pts)
        cat_pairs.append((e_cat, s_cat))
        diff = round((e_pts - s_pts) / (source.total or 6) * 100, 2)  # sin arrastrar redondeos
        diffs.append(diff)
        mark = "=" if e_cat == s_cat else "≠"
        detail.append(
            f"  {row['id']:>5}  {row['nombre'][:30]:<30}  {e_pct:6.2f}  {s_pct:6.2f}  {diff:+7.2f}"
            f"  {e_cat:<15} {mark} {s_cat}"
        )

    total = source.total or 6
    print(f"\nValidación P1-P6 — ciclo {args.ciclo}")
    print(f"Fuente del sistema: {source.origin}")
    print(f"CSV experto: {args.csv}  ({len(expert_rows)} tecnologías)")
    if source.prioritized_at is not None:
        print(
            f"Umbrales usados (configuración del sistema): priorizada >= {source.prioritized_at} pts "
            f"({source.prioritized_at / total * 100:.2f}%), bajo vigilancia >= {source.watch_at} pts "
            f"({source.watch_at / total * 100:.2f}%), no priorizada < {source.watch_at} pts; "
            f"total criterios = {total}"
        )

    print("\n1) Acuerdo por criterio")
    print(f"  {'Crit.':<6}{'n':>4}  {'Acuerdo':>8}  {'Kappa':>7}")
    for c in CRITERIA:
        pairs = per_criterion[c]
        print(f"  {c:<6}{len(pairs):>4}  {pct_agree(pairs):>8}  {fmt_kappa(cohen_kappa(pairs)):>7}")
    all_pairs = [p for c in CRITERIA for p in per_criterion[c]]
    print(f"  {'Global':<6}{len(all_pairs):>4}  {pct_agree(all_pairs):>8}  {fmt_kappa(cohen_kappa(all_pairs)):>7}")

    print("\n2) Acuerdo en la categoría final")
    print(f"  n = {len(cat_pairs)}  acuerdo = {pct_agree(cat_pairs)}  kappa = {fmt_kappa(cohen_kappa(cat_pairs))}")

    print("\n3) Diferencia de %P (experto - sistema)")
    if diffs:
        print(
            f"  media = {sum(diffs) / len(diffs):+.2f}  media absoluta = "
            f"{sum(abs(d) for d in diffs) / len(diffs):.2f}  máx. absoluta = {max(abs(d) for d in diffs):.2f}"
        )
    else:
        print("  n/d (ninguna tecnología completa en ambos lados)")

    print("\nDetalle por tecnología")
    print(f"  {'ID':>5}  {'Nombre':<30}  {'%P exp':>6}  {'%P sis':>6}  {'Dif.':>7}  Categoría experto / sistema")
    print("\n".join(detail))


if __name__ == "__main__":
    main()
