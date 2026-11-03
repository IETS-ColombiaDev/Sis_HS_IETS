# Historial de commits renombrados

El 3 de noviembre de 2026 se renombraron los mensajes de los 38 commits publicados hasta esa fecha para cumplir la convención de [CONTRIBUTING.md](../CONTRIBUTING.md). Solo cambió el mensaje: el contenido (árbol), el autor y las fechas de cada commit son idénticos al original, lo que se verificó commit por commit antes de publicar.

Como el identificador de un commit depende de su mensaje, todos cambiaron. Esta tabla permite seguir cualquier referencia anterior (actas, correos, despliegues de Render).

La entrega se asignó por fecha: la primera entrega del cronograma cuyo corte es igual o posterior a la fecha del commit. `E0` es el prototipo anterior al inicio del componente (25-ago-2026).

| Fecha | Entrega | Antes | Ahora | Mensaje anterior | Mensaje nuevo |
|---|---|---|---|---|---|
| 2026-07-10 | E0 | `12322b3` | `87e6593` | Initial commit | feat(base): prototipo inicial de escaneo de horizonte |
| 2026-07-10 | E0 | `a30ea84` | `30e5b74` | UT_C | feat(ia): mejora de notas y enriquecimiento de hallazgos con IA |
| 2026-09-02 | E2 | `2b29ed8` | `0b6a322` | UT_Chan | feat(ciclos): ciclos, staging, priorización %P, dedup e INVIMA |
| 2026-09-07 | E2 | `ee34f67` | `48085a9` | UT_Changes | feat(vigilancia): catálogo D-06, nuevos conectores y sonda |
| 2026-09-10 | E2 | `af4706f` | `56f69c1` | UT_C | feat(deploy): Alembic, CI, Docker y endurecimiento de la v7.0.0 |
| 2026-09-10 | E2 | `4776126` | `221a862` | Update README.md | docs(readme): nombre visible desde el directorio Firestore |
| 2026-09-10 | E2 | `f343a06` | `1dc981f` | UT_Changes | ci(db): validar migraciones por la línea status= |
| 2026-10-06 | E4 | `f9c1eab` | `1d5f81b` | UT_Changes | feat(fuentes): matriz de fuentes EH, perfiles y búsqueda web |
| 2026-10-06 | E4 | `81cb2e1` | `bd81b00` | UT_Changes | fix(api): registrar errores 500 con una referencia citable |
| 2026-10-07 | E4 | `2209689` | `d0f0e99` | UT_Changes | feat(ia): MiniMax como proveedor principal y guía de usuario |
| 2026-10-07 | E4 | `e6e3df0` | `7d0e5bd` | UT_Change | fix(db): WAL, busy_timeout y reintentos ante bloqueos de SQLite |
| 2026-10-08 | E4 | `590f515` | `5b2f1e7` | Stabilize Render deploy against SQLite locks. | fix(deploy): estabilizar el despliegue en Render ante bloqueos |
| 2026-10-08 | E4 | `3667ac6` | `a686cc9` | Update iets_horizonte.db-wal | chore(db): actualizar el WAL de la base local versionada |
| 2026-10-08 | E4 | `d587c93` | `9fa380c` | Fix login hang caused by SQLite write deadlock. | fix(auth): evitar el bloqueo del ingreso por escrituras en SQLite |
| 2026-10-08 | E4 | `d6c18fb` | `ba844fa` | Speed up login: skip Firestore and avoid audit noise on session fields. | perf(auth): ingreso sin consultar Firestore ni auditar la sesión |
| 2026-10-08 | E4 | `9eab05e` | `6ac5f63` | Make credential-less login read-only and stop SQLite ingest worker. | fix(auth): ingreso sin credenciales en solo lectura |
| 2026-10-08 | E4 | `3796f9e` | `01e29fe` | UT | chore(db): actualizar la base local versionada y su WAL |
| 2026-10-13 | E4 | `548d54f` | `bf785a2` | Add keepalive workflow so Render free tier stays awake. | ci(deploy): flujo keepalive para mantener despierto Render |
| 2026-10-13 | E4 | `fa5719b` | `72d8860` | Update iets_horizonte.db-wal | chore(db): actualizar el WAL de la base local versionada |
| 2026-10-13 | E4 | `dd57370` | `9dbfc52` | UT_Changes | feat(respaldo): API de copia de la base para el navegador |
| 2026-10-13 | E4 | `6e28f1c` | `0d0efc6` | Keep the full database in the admin browser so Render wipes do not lose work. | feat(respaldo): copia completa de la base en el navegador |
| 2026-10-13 | E4 | `caf22d0` | `62c03bd` | UT_Chnage | feat(guia): guía de bienvenida y validación de requerimientos |
| 2026-10-14 | E4 | `f2946b3` | `33cb4fc` | UT | feat(db): persistencia en Firestore y autenticación Firebase |
| 2026-10-14 | E4 | `ca9346b` | `646835b` | Render | fix(db): copia por lotes y COMMIT con reintento durante la copia |
| 2026-10-14 | E4 | `4742103` | `0921f75` | UT_C | fix(db): publicar en Firestore al arrancar y ampliar espera de UI |
| 2026-10-15 | E4 | `2405374` | `d491460` | UT_C | fix(db): cachear cuenta de servicio y recargas silenciosas en UI |
| 2026-10-19 | E5 | `cc7f53b` | `59448f5` | UT_Changes | feat(evaluacion): PDF nativo de fichas, boletines e informes |
| 2026-10-19 | E5 | `b23b3e8` | `e1f6cfb` | UT | feat(filtrado): consulta INVIMA en vivo y vigilancia en Render |
| 2026-10-19 | E5 | `f765e60` | `6bdd8ae` | Guia | feat(guia): guía rápida con diagramas por fase |
| 2026-10-20 | E5 | `033dde6` | `c01519d` | Sonda y escaneo: respaldo por Google News para sitios que bloquean robots | feat(vigilancia): respaldo por Google News para sitios bloqueados |
| 2026-10-20 | E5 | `84d4ee4` | `ac0db4d` | Tablero estrategico rediseñado y tooltips por encima de todo | feat(tablero): tablero estratégico rediseñado y tooltips encima |
| 2026-10-20 | E5 | `8780cf3` | `9bc941a` | Guia: perfiles, en que fases participan y como se pasan el trabajo | feat(guia): perfiles, fases en que participan y relevos |
| 2026-10-20 | E5 | `6bdf70d` | `c490fb0` | README: version final del 20 de octubre de 2026 | docs(readme): versión del 20 de octubre de 2026 |
| 2026-10-20 | E5 | `bc98e4c` | `ebe9b51` | Ut | feat(tecnologias): confiabilidad de la tecnología y origen de señal |
| 2026-10-22 | E5 | `bda167c` | `a0662df` | UT_Changes | feat(ui): componentes base, asistente de navegación y menú por fases |
| 2026-10-23 | E5 | `1a074f9` | `7e70f19` | UT_Escaneo | feat(ui): avisos, formulario público de postulación y pantallas |
| 2026-10-27 | E5 | `a7276f0` | `3079e5d` | UT_Changes | feat(fuentes): 97 fuentes, corroboración, datos de producto |
| 2026-10-29 | E5 | `fbaeff2` | `dd45b65` | UT_Change | feat(bandeja): filtro por fecha de captura en hora de Colombia |
