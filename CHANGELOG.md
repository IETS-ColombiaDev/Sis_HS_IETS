# Notas de versión

Una sección por entrega del cronograma. Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y [versionamiento semántico](https://semver.org/lang/es/). El flujo para producirlas está en [CONTRIBUTING.md](CONTRIBUTING.md).

> El 3 de noviembre de 2026 se renombraron los mensajes de los 38 commits anteriores (`UT`, `UT_Changes`, `UT_C`...) al formato de `CONTRIBUTING.md`, con el pie `Entrega:` según el corte en que quedó cada uno. Solo cambiaron los mensajes: contenido, autor y fechas son idénticos. La correspondencia entre identificadores anteriores y nuevos está en [docs/historial-commits.md](docs/historial-commits.md).

## [Sin publicar] — Entrega 5 · Inteligencia analítica y priorización (05-nov-2026) → `v7.1.0`

Commits `59448f5` … `dd45b65` (19 al 29 de octubre) y los que entren a `develop` hasta el cierre.

### Agregado
- PDF nativo de fichas técnicas, boletines e informes de evaluación (`59448f5`).
- Consulta en vivo al dato abierto del INVIMA cuando el índice local no alcanza el umbral (`e1f6cfb`).
- Guía rápida con diagramas por fase (`6bdd8ae`) y pantallas «Quién hace qué» y «Cómo se pasan el trabajo» (`9bc941a`).
- Vigilancia: respaldo por RSS de Google News para sitios que bloquean robots; NHS AAC y Cochrane por su RSS oficial (`c01519d`).
- Tablero estratégico rediseñado: resumen para decidir, embudo con pérdidas por etapa, llegada al mercado por franja, matriz de decisión por cuadrantes, avance de expedientes e impacto presupuestal (`ac0db4d`).
- Confiabilidad de la tecnología y origen de la señal en la bandeja, migración 0003 (`ebe9b51`).
- Componentes base de interfaz, asistente de navegación y menú por fases (`a0662df`).
- Formulario público de postulación y avisos (`7e70f19`).
- 97 fuentes, corroboración entre fuentes, datos de producto inferidos y reproceso de señales, migración 0004 (`3079e5d`).
- Bandeja: filtro por fecha de captura en hora de Colombia (`dd45b65`).

### Cambiado
- Conectores EMA, CTIS, FDA y Health Canada corregidos tras la ingesta real del 19 de octubre (`59448f5`).
- Worker de vigilancia encendido en Render; el escaneo ya no retiene escrituras durante la red (`e1f6cfb`).
- La sonda de fuentes marca en ámbar las URL que ya no existen y deja de suspender la ingesta por deriva de campos opcionales (`c01519d`).

### Documentación
- README del 20 de octubre (`c490fb0`).
- Consolidado de observaciones de la validación de la beta, plan de trabajo a diciembre y cronograma del componente de desarrollo.
- Flujo de ramas, convención de commits, plantilla de pull request y estas notas de versión.

### Integración continua
- El CI corre también en `develop` y valida el formato de los commits de cada pull request.

## [7.0.0] — Entrega 4 · Versión beta / producto mínimo viable (16-oct-2026)

Etiqueta `v7.0.0` sobre `d491460` (15-oct-2026), último commit antes de la liberación de la beta. Commits `1d5f81b` … `d491460`.

### Agregado
- Matriz de fuentes EH, perfiles de fuente y búsqueda web, migración 0002 (`1d5f81b`).
- MiniMax como proveedor principal de IA y guía de usuario (`d0f0e99`).
- Despliegue en Render con `render.yaml` sobre la imagen Docker (`5b2f1e7`).
- Flujo `keepalive` que mantiene despierto el plan gratuito de Render (`bf785a2`).
- Copia completa de la base en el navegador del administrador (IndexedDB), con exportación y restauración (`9dbfc52`, `0d0efc6`).
- Guía de bienvenida y validación de requerimientos (`62c03bd`).
- Persistencia de la base en Firestore y autenticación Firebase (`33cb4fc`).

### Corregido
- Errores 500 registrados con una referencia citable (`bd81b00`).
- Bloqueos de SQLite: WAL, `busy_timeout` y reintentos (`7d0e5bd`), copia por lotes (`646835b`) e ingreso sin escrituras concurrentes (`9fa380c`).
- Ingreso más rápido, sin consultar Firestore ni auditar campos de sesión (`ba844fa`).
- Ingreso sin credenciales en solo lectura (`6ac5f63`).
- Publicación en Firestore al arrancar y espera más larga en la interfaz (`0921f75`); cuenta de servicio en caché y recargas sin indicador de carga (`d491460`).

### Conocido
- `iets_horizonte.db` y su `-wal` llegaron a versionarse (`a686cc9`, `01e29fe`, `72d8860`).

## Base — Prototipo (E0) y entregas 1 a 3 (hasta 23-sep-2026)

- **E0, prototipo previo al componente** (10-jul-2026): `87e6593`, `30e5b74`.
- **E2** (2 al 10-sep-2026): ciclos, staging, priorización %P, desduplicación e INVIMA (`0b6a322`); catálogo D-06 y conectores (`48085a9`); Alembic, CI, Docker y versión 7.0.0 (`56f69c1`); `221a862`, `1dc981f`.
- E1 y E3 son documentales y no tienen commits. La etiqueta `unidadanalitica` apunta a `1dc981f`.
