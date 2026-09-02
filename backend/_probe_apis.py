"""Sonda temporal: verifica esquema real de las APIs candidatas de la fase 4."""
import json

import httpx

CTG = "https://clinicaltrials.gov/api/v2/studies"

print("=========== ClinicalTrials.gov v2: cabeceras ===========")
for label, headers in (
    ("sin headers", {}),
    ("solo accept json", {"Accept": "application/json"}),
    ("UA navegador", {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
        ),
        "Accept": "application/json",
    }),
    ("UA simple", {"User-Agent": "python-httpx"}),
):
    try:
        with httpx.Client(timeout=30, headers=headers, follow_redirects=True) as c:
            r = c.get(CTG, params={"pageSize": 1})
            print(f"[{label}] -> {r.status_code}")
            if r.status_code == 200:
                st = r.json()["studies"][0]
                ps = st["protocolSection"]
                print("   MODULOS:", list(ps.keys()))
                for mod in (
                    "identificationModule",
                    "statusModule",
                    "designModule",
                    "armsInterventionsModule",
                    "conditionsModule",
                    "sponsorCollaboratorsModule",
                ):
                    print(f"--- {mod} ---")
                    print(json.dumps(ps.get(mod, {}), indent=2, ensure_ascii=False)[:1200])
                break
    except Exception as exc:
        print(f"[{label}] FALLO:", type(exc).__name__, exc)

print()
print("=========== openFDA drugsfda: campos de interes ===========")
with httpx.Client(timeout=40, follow_redirects=True) as c:
    r = c.get(
        "https://api.fda.gov/drug/drugsfda.json",
        params={
            "search": 'submissions.submission_type:"ORIG" AND submissions.submission_status:"AP"',
            "limit": 2,
        },
    )
    print("status:", r.status_code)
    for res in r.json().get("results", []):
        print("TOP KEYS:", list(res.keys()))
        print("application_number:", res.get("application_number"))
        print("sponsor_name:", res.get("sponsor_name"))
        prods = res.get("products") or []
        print("products[0]:", json.dumps(prods[0], indent=2)[:600] if prods else None)
        ofd = res.get("openfda") or {}
        print("openfda keys:", list(ofd.keys()))
        print("  brand_name:", ofd.get("brand_name"))
        print("  generic_name:", ofd.get("generic_name"))
        print("  manufacturer_name:", ofd.get("manufacturer_name"))
        print("  pharm_class_epc:", ofd.get("pharm_class_epc"))
        origs = [
            s for s in (res.get("submissions") or [])
            if s.get("submission_type") == "ORIG"
        ]
        print("submissions ORIG:", json.dumps(origs[:1], indent=2)[:400])
        print("-" * 60)

print("=========== openFDA 510k: campos de interes ===========")
with httpx.Client(timeout=40, follow_redirects=True) as c:
    r = c.get(
        "https://api.fda.gov/device/510k.json",
        params={"search": "decision_date:[20260101 TO 20261231]", "limit": 1},
    )
    res = r.json()["results"][0]
    keep = {
        k: v for k, v in res.items()
        if k not in ("openfda",)
    }
    print(json.dumps(keep, indent=2, ensure_ascii=False)[:1500])
    ofd = res.get("openfda", {})
    print("openfda.device_name:", ofd.get("device_name"))
    print("openfda.device_class:", ofd.get("device_class"))
    print("openfda.medical_specialty_description:", ofd.get("medical_specialty_description"))
