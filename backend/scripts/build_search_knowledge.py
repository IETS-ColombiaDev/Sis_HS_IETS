"""Arma el paquete de la base de conocimiento de busqueda desde un equipo del IETS.

Los buscadores gratuitos bloquean las consultas que salen de la nube (Render),
pero responden desde un equipo de oficina. Este script hace alli la busqueda
completa: por cada fuente con ingesta activa y busqueda web encendida consulta
los buscadores dentro del dominio de la fuente, abre cada pagina encontrada y
cuenta cuantas senales saca de ella el extractor por reglas (sin IA). El
resultado se escribe como `app/data/base_busqueda_eh.json`, que viaja con el
codigo y se carga solo al arrancar el servidor.

Trabaja SIEMPRE sobre una copia de la base (`--db`): no toca Firestore ni la
base de produccion, y apaga la IA y el trabajador de ingesta.

Uso (desde `backend/`):

    python scripts/build_search_knowledge.py --db C:/ruta/copia.db
    python scripts/build_search_knowledge.py --db copia.db --only-missing

Se puede interrumpir y volver a lanzar con `--only-missing`: lo ya encontrado
queda en la copia de la base.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent


def _args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db", required=True, help="Copia local de la base SQLite (nunca la de producción)")
    ap.add_argument("--out", default=str(BACKEND / "app" / "data" / "base_busqueda_eh.json"))
    ap.add_argument("--queries", type=int, default=5, help="Consultas por fuente")
    ap.add_argument("--results", type=int, default=10, help="Páginas por fuente")
    ap.add_argument("--limit", type=int, default=0, help="Solo las primeras N fuentes (prueba)")
    ap.add_argument("--only-missing", action="store_true", help="Salta las fuentes que ya tienen páginas")
    ap.add_argument("--engines", default="", help="Motores separados por coma; «ninguno» usa solo el mapa del sitio")
    ap.add_argument("--no-search", action="store_true", help="No consulta buscadores: solo verifica y exporta")
    ap.add_argument("--assume-searched", action="store_true",
                    help="Da por buscados los sitios de todas las fuentes con búsqueda web (al retomar una corrida)")
    ap.add_argument("--no-verify", action="store_true", help="No abre las páginas para contar señales")
    ap.add_argument("--wait-blocked", type=int, default=150, help="Segundos de espera si todos los buscadores bloquean")
    return ap.parse_args()


def main() -> int:
    args = _args()
    db_path = Path(args.db).resolve()
    if not db_path.exists():
        print(f"No existe la base {db_path}")
        return 2
    os.environ["DATABASE_URL"] = f"sqlite:///{db_path.as_posix()}"
    os.environ["FIREBASE_DB_ENABLED"] = "false"
    os.environ["INGEST_WORKER_ENABLED"] = "false"
    os.environ["INGEST_GUARDIAN"] = "false"
    os.environ["AI_PROVIDER"] = "off"
    os.environ["MINIMAX_API_KEY"] = ""
    os.environ["GEMINI_API_KEY"] = ""
    sys.path.insert(0, str(BACKEND))

    from app import migrations, scraper, search_knowledge, sitemap_search, source_profile, web_search
    from app.database import Base, SessionLocal, engine
    from app.models import SearchKnowledge, Source

    migrations.upgrade_database()
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    cfg = source_profile.load_search(db)
    cfg.update(
        {"enabled": True, "ai_queries": False, "max_queries": args.queries, "max_results": args.results,
         "same_domain_only": True, "prefer_documents": False, "engine_min_interval_s": 6}
    )
    if args.engines.strip():
        cfg["engines"] = [] if args.engines.strip().lower() in {"ninguno", "none"} else [
            e.strip() for e in args.engines.split(",") if e.strip()
        ]
    brave_key = source_profile.brave_api_key(db)

    sources = [
        s for s in db.query(Source).filter(Source.scrape_enabled.is_(True)).order_by(Source.title).all()
        if not getattr(s, "retired", False) and s.catalog_active is not False
    ]
    if args.limit:
        sources = sources[: args.limit]
    print(f"{len(sources)} fuente(s) con ingesta activa. Motores: {', '.join(cfg['engines'])}", flush=True)
    searched = found = skipped = 0
    for idx, source in enumerate([] if args.no_search else sources, start=1):
        profile = source_profile.effective_profile(source)
        domain = web_search.search_domain(source, profile)
        label = f"[{idx}/{len(sources)}] {source.title[:60]}"
        if not profile.get("web_search") or not domain:
            skipped += 1
            print(f"{label}: búsqueda web apagada en el flujo de la fuente", flush=True)
            continue
        own = db.query(SearchKnowledge.id).filter(SearchKnowledge.source_id == source.id).count()
        if args.only_missing and own:
            print(f"{label}: ya tiene {own} página(s)", flush=True)
            continue
        waited = 0
        while cfg["engines"] and not web_search.available_engines(cfg, brave_key) and waited < 3:
            waited += 1
            print(f"    todos los buscadores en pausa: espera de {args.wait_blocked} s ({waited}/3)", flush=True)
            time.sleep(args.wait_blocked)
            web_search.reset_cooldowns()
        # Siempre en vivo: aqui la base se esta construyendo, no consultando.
        rows: list[dict] = []
        seen: set[str] = set()
        known = {(source.url or "").rstrip("/")} | {u.rstrip("/") for u in profile.get("entry_urls") or []}
        engines_used: set[str] = set()
        for query in web_search.rule_queries(source, profile, cfg) if cfg["engines"] else []:
            if len(rows) >= args.results:
                break
            res = web_search.search(query, cfg=cfg, brave_key=brave_key, domain=domain)
            for row in res["results"]:
                url = (row.get("url") or "").split("#")[0]
                key = url.rstrip("/")
                if not url or key in seen or key in known or not web_search.in_domain(url, domain):
                    continue
                if scraper._follow_skip(url):
                    continue
                seen.add(key)
                engines_used.add(res["engine"])
                rows.append({**row, "url": url, "query": query, "engine": res["engine"]})
                if len(rows) >= args.results:
                    break
            time.sleep(1.0)
        if len(rows) < args.results:
            # Respaldo sin buscadores: el mapa del sitio de la propia fuente.
            words = sitemap_search.query_words(
                web_search.rule_queries(source, profile, cfg),
                list(profile.get("search_terms") or []) + list(profile.get("follow_keywords") or []),
            )
            found_map = sitemap_search.discover(domain, words, limit=args.results - len(rows), base_url=source.url or "")
            for row in found_map["results"]:
                url = (row.get("url") or "").split("#")[0]
                key = url.rstrip("/")
                if not url or key in seen or key in known or not web_search.in_domain(url, domain):
                    continue
                seen.add(key)
                engines_used.add("sitemap")
                rows.append({**row, "url": url, "query": f"mapa del sitio de {domain}", "engine": "sitemap"})
        searched += 1
        out = search_knowledge.remember(db, source, domain, rows)
        search_knowledge.mark_searched(db, domain)
        found += out["added"]
        print(
            f"{label}: {len(rows)} página(s) en {domain} ({out['added']} nuevas) {', '.join(sorted(engines_used))}",
            flush=True,
        )

    if args.assume_searched:
        domains = []
        for source in sources:
            profile = source_profile.effective_profile(source)
            if profile.get("web_search") and web_search.search_domain(source, profile):
                domains.append(web_search.search_domain(source, profile))
        search_knowledge.mark_searched(db, domains)

    if not args.no_verify:
        _verify(db, scraper, search_knowledge)

    pack = search_knowledge.export_pack(db)
    Path(args.out).write_text(json.dumps(pack, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    st = search_knowledge.stats(db)
    print(
        f"\nFuentes buscadas: {searched} (sin búsqueda web: {skipped}). Páginas nuevas: {found}.\n"
        f"Base: {st['pages']} página(s) de {st['domains']} dominio(s); {st['with_signals']} con señales "
        f"({st['signals']} señales por reglas).\nPaquete: {args.out}",
        flush=True,
    )
    db.close()
    return 0


def _verify(db, scraper, search_knowledge) -> None:
    """Abre cada pagina aun sin visitar y cuenta las senales que saca el extractor por reglas."""
    from app.models import SearchKnowledge, Source

    pending = db.query(SearchKnowledge).filter(SearchKnowledge.visits == 0).order_by(SearchKnowledge.id).all()
    print(f"\nVerificando {len(pending)} página(s): se abre cada una y se cuentan las señales.", flush=True)
    sources = {s.id: s for s in db.query(Source).all()}
    for idx, row in enumerate(pending, start=1):
        source = sources.get(row.source_id or 0)
        signals = 0
        note = ""
        try:
            status, ctype, text, raw = scraper.fetch_url(row.url, timeout=25, retries=1)
            if status == 0 or status >= 400:
                note = f"HTTP {status}" if status else "sin conexión"
            else:
                payload = scraper._page_payload(row.url, text, ctype, raw)
                cands = scraper.extract_candidates(source, text) if (source is not None and text) else []
                crawl = {"landing_url": getattr(source, "url", "") or "", "pages": [payload]}
                gated = scraper.rules_gate(scraper._with_crawled(cands, crawl))
                signals = len(gated)
                row.title = row.title or (payload.get("title") or "")[:300]
        except Exception as exc:  # noqa: BLE001
            note = type(exc).__name__
        now = search_knowledge._now()
        row.visits = 1
        row.last_visit_at = now
        if signals:
            row.signals = signals
            row.last_signal_at = now
        elif note in {"HTTP 404", "HTTP 410"}:
            # La pagina ya no existe: no vale la pena llevarla al servidor.
            row.status = search_knowledge.STATUS_SILENT
            row.visits = search_knowledge.SILENT_AFTER_VISITS
        db.commit()
        print(f"  [{idx}/{len(pending)}] {signals:>3} señal(es) {note:<14} {row.url[:110]}", flush=True)
        time.sleep(0.4)


if __name__ == "__main__":
    raise SystemExit(main())
