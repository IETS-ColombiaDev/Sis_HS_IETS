"""Mide el tiempo de consulta al indice local del INVIMA a escala realista.

La especificacion exige respuesta por debajo de 100 ms en el percentil 95. El
indice completo del INVIMA ronda los cientos de miles de registros, asi que la
medicion sobre la muestra sincronizada no dice nada util por si sola.
"""
import random
import statistics
import sys
import time

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.dedup import normalize_name
from app.invima import search
from app.models import InvimaRecord

TARGET = int(sys.argv[1]) if len(sys.argv) > 1 else 300_000

TERMS = [
    "pembrolizumab", "keytruda", "semaglutida", "ozempic", "trastuzumab",
    "cateter venoso central", "marcapasos", "insulina glargina", "nivolumab",
    "stent coronario", "prueba rapida covid", "dupilumab", "acido tranexamico",
]

PREFIXES = ["acido", "clorhidrato", "solucion", "tabletas", "kit", "sistema", "equipo"]
ROOTS = [
    "pembrolizumab", "trastuzumab", "nivolumab", "semaglutida", "insulina",
    "amoxicilina", "ibuprofeno", "cateter", "marcapasos", "stent", "jeringa",
    "reactivo", "prueba", "monitor", "valvula", "protesis", "dupilumab",
]
SUFFIXES = ["forte", "retard", "plus", "100 mg", "50 mg", "pediatrico", "sterile", "xl"]

engine = create_engine("sqlite://")
Base.metadata.create_all(bind=engine)
db = sessionmaker(bind=engine)()

print(f"Generando {TARGET:,} registros sinteticos...".replace(",", "."))
random.seed(42)
batch = []
for i in range(TARGET):
    producto = f"{random.choice(PREFIXES)} {random.choice(ROOTS)} {random.choice(SUFFIXES)} {i}"
    principio = random.choice(ROOTS)
    batch.append(
        {
            "expediente": str(2_000_000 + i),
            "registro": f"INVIMA {i}",
            "producto": producto.upper(),
            "principio_activo": principio.upper(),
            "titular": "LABORATORIO DE PRUEBA",
            "estado_registro": "Vigente",
            "producto_norm": normalize_name(producto),
            "principio_norm": normalize_name(principio),
        }
    )
    if len(batch) >= 10_000:
        db.bulk_insert_mappings(InvimaRecord, batch)
        batch.clear()
if batch:
    db.bulk_insert_mappings(InvimaRecord, batch)
db.commit()

total = db.query(InvimaRecord).count()
print(f"Registros en el indice: {total:,}".replace(",", "."))

for term in TERMS[:3]:
    search(db, term)

times: list[float] = []
for _ in range(4):
    for term in TERMS:
        start = time.perf_counter()
        search(db, term)
        times.append((time.perf_counter() - start) * 1000)

times.sort()
p95 = times[int(len(times) * 0.95) - 1]
print(f"Consultas: {len(times)}")
print(f"  mediana : {statistics.median(times):7.1f} ms")
print(f"  p95     : {p95:7.1f} ms   (objetivo < 100 ms)")
print(f"  maximo  : {max(times):7.1f} ms")
print("CUMPLE" if p95 < 100 else "NO CUMPLE")
db.close()
