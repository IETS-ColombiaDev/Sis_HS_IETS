# Notas de versión

Una sección por entrega del cronograma. Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y [versionamiento semántico](https://semver.org/lang/es/). El flujo para producirlas está en [CONTRIBUTING.md](CONTRIBUTING.md).

> Hasta el 29 de octubre de 2026 los commits no seguían una convención (`UT`, `UT_Changes`, `UT_C`...). Las secciones de E4 y E5 se reconstruyeron a partir de las fechas de los commits, de `BACKLOG.md` y de los commits que sí traían descripción. La historia no se reescribe: los identificadores de commit se conservan para auditoría.

## [Sin publicar] — Entrega 5 · Inteligencia analítica y priorización (05-nov-2026) → `v7.1.0`

Commits `cc7f53b` … `fbaeff2` (19 al 29 de octubre) y los que entren a `develop` hasta el cierre.

### Agregado
- Guía rápida: pantallas «Quién hace qué» y «Cómo se pasan el trabajo», alineadas con `rbac.py` y las transiciones editoriales (`8780cf3`).
- Tablero estratégico rediseñado: resumen para decidir, embudo con pérdidas por etapa, llegada al mercado por franja, matriz de decisión por cuadrantes, avance de expedientes e impacto presupuestal (`84d4ee4`).
- Vigilancia: respaldo por RSS de Google News para sitios que bloquean robots; NHS AAC y Cochrane por su RSS oficial (`033dde6`).

### Cambiado
- La sonda de fuentes marca en ámbar las URL que ya no existen y deja de suspender la ingesta por deriva de campos opcionales (`033dde6`).
- Un sitio sin respuesta se omite 12 h y pasa directo al respaldo (antes 3,5 min por corrida) (`033dde6`).
- Ajustes de escaneo y de interfaz sin descripción en el commit (`cc7f53b`, `b23b3e8`, `f765e60`, `bc98e4c`, `bda167c`, `1a074f9`, `a7276f0`, `fbaeff2`).

### Documentación
- README actualizado al 20 de octubre (`6bdf70d`).
- Consolidado de observaciones de la validación de la beta, plan de trabajo a diciembre y cronograma del componente de desarrollo versionados en el repositorio.
- Flujo de ramas, convención de commits, plantilla de pull request y estas notas de versión.

### Integración continua
- El CI corre también en `develop` y valida el formato de los commits de cada pull request.

## [7.0.0] — Entrega 4 · Versión beta / producto mínimo viable (16-oct-2026)

Etiqueta `v7.0.0` sobre `2405374` (15-oct-2026), último commit antes de la liberación de la beta. Commits `f9c1eab` … `2405374`.

### Agregado
- Despliegue en Render con `render.yaml` sobre la imagen Docker (`590f515`, `ca9346b`).
- Sincronización de la base con Firestore, `backend/app/firebase_db.py` (`f2946b3`).
- Copia completa de la base en el navegador del administrador (IndexedDB), con exportación y restauración, para no perder trabajo cuando Render reinicia el disco (`dd57370`, `6e28f1c`).
- Flujo `keepalive` que mantiene despierto el plan gratuito de Render (`548d54f`).

### Corregido
- Bloqueo del ingreso por escrituras concurrentes en SQLite (`d587c93`).
- Ingreso más rápido: sin consulta a Firestore ni ruido de auditoría en campos de sesión (`d6c18fb`).
- Ingreso sin credenciales en modo solo lectura y worker de ingesta apagado bajo SQLite (`9eab05e`).

### Conocido
- `iets_horizonte.db` y su `-wal` llegaron a versionarse en la raíz (`3667ac6`, `fa5719b`).

## Base — Entregas 1 a 3 (28-ago a 23-sep-2026)

Entregas documentales (plan, requerimientos, arquitectura); sin etiqueta de código. En el repositorio quedó la base del sistema `v7.0.0` (fases 0 a 7 de `BACKLOG.md`), commits `12322b3` … `f343a06` (10-jul a 10-sep-2026). La etiqueta `unidadanalitica` apunta a `f343a06`.
