# Despliegue en producción — Sistema de Escaneo de Horizonte del IETS

Guía de operación de la fase 0 (P0-1 Alembic, P0-2 contenedores y CI) y de los puntos de la fase 7 que dependen de la infraestructura (HTTPS, respaldo, monitoreo). Para el uso funcional del sistema, vea [README.md](README.md); para el estado del plan, [BACKLOG.md](BACKLOG.md).

## Índice

1. [Arquitectura de despliegue](#arquitectura-de-despliegue)
2. [Requisitos](#requisitos)
3. [Primer despliegue con Docker Compose](#primer-despliegue-con-docker-compose)
4. [Primer superadministrador](#primer-superadministrador)
5. [Variables de entorno](#variables-de-entorno)
6. [HTTPS](#https)
7. [Worker de ingesta: un solo proceso](#worker-de-ingesta-un-solo-proceso)
8. [Migraciones de base de datos (Alembic)](#migraciones-de-base-de-datos-alembic)
9. [Respaldo y restauración](#respaldo-y-restauración)
10. [Rotación de `SECRET_KEY`](#rotación-de-secret_key)
11. [Actualización de versión](#actualización-de-versión)
12. [Monitoreo](#monitoreo)
13. [Reversión](#reversión)
14. [Servidor Windows sin contenedores](#servidor-windows-sin-contenedores)
15. [Integración continua](#integración-continua)
16. [Limitaciones conocidas](#limitaciones-conocidas)

---

## Arquitectura de despliegue

```mermaid
flowchart LR
  U["Usuarios IETS<br/>y portal público"] -->|HTTPS 443| P["Proxy HTTPS<br/>Caddy (perfil https)<br/>o proxy institucional"]
  P -->|HTTP interno| API["api<br/>uvicorn × WEB_CONCURRENCY<br/>API + SPA (frontend/dist)"]
  W["worker<br/>uvicorn × 1<br/>INGEST_WORKER_ENABLED=true"] --> DB
  API --> DB[("db<br/>PostgreSQL 15<br/>pg_trgm · unaccent · JSONB")]
  B["deploy/backup.sh<br/>(cron)"] -.->|pg_dump -Fc| DB
```

| Servicio | Imagen | Puertos | Función |
|---|---|---|---|
| `db` | `postgres:15` | ninguno (red interna) | Base de datos, volumen `pgdata` |
| `api` | `iets-horizonte` (Dockerfile) | `127.0.0.1:8000` | API REST, SPA, migraciones al arrancar |
| `worker` | la misma | ninguno | Único proceso que recorre la cola `ingest_jobs` |
| `caddy` | `caddy:2` (perfil `https`) | 80, 443 | TLS automático y proxy inverso |

La imagen es multi-etapa: Node compila `frontend/dist`, Python 3.12 instala `backend/requirements.txt` en un entorno virtual y la etapa final corre como el usuario sin privilegios `iets` (UID 10001), con `HEALTHCHECK` sobre `/api/health`.

## Requisitos

| Recurso | Mínimo recomendado |
|---|---|
| Servidor | Linux x86-64 (Ubuntu 22.04/24.04 o equivalente), 2 vCPU, 4 GB de RAM, 40 GB de disco |
| Software | Docker Engine 24+ con el plugin `docker compose` v2.20+ |
| Red | Salida a internet (fuentes, IA, Google); entrada 80/443 si usa Caddy |
| DNS | Un nombre, p. ej. `horizonte.iets.org.co`, apuntando al servidor |
| Cuentas | Client ID OAuth de Google; claves opcionales de MiniMax/Gemini, openFDA, NCBI, reCAPTCHA, SMTP |

## Primer despliegue con Docker Compose

Todos los comandos se ejecutan desde la raíz del repositorio y **siempre** con `--env-file deploy/.env.production`: ese archivo alimenta a la vez la interpolación de `docker-compose.yml` y las variables de los contenedores.

1. **Obtenga el código** en el servidor (p. ej. en `/opt/iets-horizonte`) en la etiqueta o commit a desplegar.

2. **Cree el archivo de variables** y restrinja sus permisos:

   ```bash
   cp deploy/.env.production.example deploy/.env.production
   chmod 600 deploy/.env.production
   python3 -c "import secrets; print(secrets.token_urlsafe(48))"   # -> SECRET_KEY
   python3 -c "import secrets; print(secrets.token_urlsafe(32))"   # -> POSTGRES_PASSWORD
   ```

   Complete como mínimo `SECRET_KEY`, `POSTGRES_PASSWORD`, `CORS_ORIGINS`, `PUBLIC_BASE_URL`, `GOOGLE_CLIENT_ID` y, si usará Caddy, `SITE_DOMAIN`. `deploy/.env.production` está en `deploy/.gitignore`: no lo suba al repositorio.

3. **Construya la imagen** (etiquete con la versión para poder revertir):

   ```bash
   export IMAGE_TAG=7.0.0        # o fije IMAGE_TAG en deploy/.env.production
   docker compose --env-file deploy/.env.production build
   ```

4. **Arranque la pila:**

   ```bash
   # Con proxy institucional existente:
   docker compose --env-file deploy/.env.production up -d
   # Con Caddy y certificados automáticos:
   docker compose --env-file deploy/.env.production --profile https up -d
   ```

   Orden de arranque: `db` sano → `api` (verifica la configuración con `python -m app.cli check-config`, migra con Alembic, ejecuta una vez las siembras y lanza uvicorn) → cuando `api` está sana, `worker`.

5. **Verifique:**

   ```bash
   docker compose --env-file deploy/.env.production ps           # todos "healthy"
   curl -fsS http://127.0.0.1:8000/api/health
   docker compose --env-file deploy/.env.production logs -f api
   docker compose --env-file deploy/.env.production exec api python -m app.cli check-config
   ```

6. **Cree el primer superadministrador** (siguiente sección) **antes** de abrir el acceso a los usuarios.

7. **Configure el respaldo diario** (sección [Respaldo](#respaldo-y-restauración)) y ejecute una restauración de prueba.

8. **Primer uso:** en `/filtrado`, pestaña *Novedad*, sincronice el índice de INVIMA; en `/configuracion`, cargue las claves de IA si no las puso en variables.

## Primer superadministrador

El comando de administración crea la cuenta (o promueve una existente) con perfil de superadministrador y contraseña:

```bash
python -m app.cli create-admin --email X --name Y
```

En el contenedor:

```bash
docker compose --env-file deploy/.env.production exec api \
  python -m app.cli create-admin --email coordinacion@iets.org.co --name "Nombre Apellido"
```

- Sin `--password` genera una contraseña temporal que **se imprime una sola vez** y debe cambiarse en el primer ingreso.
- Con `--password -` la pide por teclado sin eco (use `exec` sin `-T` para tener terminal).
- Cada acción queda en la bitácora como ejecutada por `cli`.

Otros comandos útiles:

| Comando | Uso |
|---|---|
| `python -m app.cli reset-password --email X` | Asigna una contraseña temporal y cierra las sesiones de la cuenta |
| `python -m app.cli list-users` | Lista cuentas, perfil, estado y si tienen contraseña |
| `python -m app.cli check-config` | Valida la configuración; sale con código 1 si la de producción es insegura |

> **Importante.** Mientras la tabla `users` esté vacía, la primera persona que inicie sesión con Google recibe el perfil de superadministrador. Por eso el paso de `create-admin` va antes de publicar la URL. Deje `ADMIN_EMAILS` vacío en producción salvo que quiera promover cuentas de forma automática al iniciar sesión.

En Windows sin contenedores: `cd backend` y `.\.venv\Scripts\python.exe -m app.cli create-admin --email X --name "Y"`.

## Variables de entorno

La referencia completa, con valores seguros por defecto, es [`deploy/.env.production.example`](deploy/.env.production.example) (contiene todas las de `backend/.env.example` y las propias del despliegue).

| Variable | Producción | Nota |
|---|---|---|
| `ENVIRONMENT` | `production` | Apaga el acceso de desarrollo sin importar `ALLOW_DEV_LOGIN` y hace **fallar el arranque** si `SECRET_KEY` es la de ejemplo o tiene menos de 32 caracteres |
| `SECRET_KEY` | obligatoria, ≥ 32 caracteres aleatorios | Firma los JWT de sesión. Ver [rotación](#rotación-de-secret_key) |
| `ALLOW_DEV_LOGIN` | `false` | El intento de usarlo queda en bitácora (`auth:dev_login_denied`) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `720` | Duración de la sesión |
| `PASSWORD_MIN_LENGTH`, `LOGIN_MAX_ATTEMPTS`, `LOGIN_LOCKOUT_MINUTES` | `10`, `5`, `15` | Política de contraseñas y bloqueo por intentos |
| `GOOGLE_CLIENT_ID`, `ALLOWED_EMAIL_DOMAIN` | Client ID, `iets.org.co` | Agregue `https://SITE_DOMAIN` a los orígenes autorizados en Google Cloud |
| `ADMIN_EMAILS` | vacío | Correos promovidos a superadministrador al iniciar sesión |
| `CORS_ORIGINS` | `https://SITE_DOMAIN` | Solo el origen público real |
| `PUBLIC_BASE_URL` | `https://SITE_DOMAIN` | Enlaces absolutos en correos |
| `DATABASE_URL` | vacío con compose | Compose la arma con `POSTGRES_*`; defínala solo para un PostgreSQL externo: `postgresql+psycopg://usuario:clave@host:5432/base` |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | — | Solo compose. Clave con caracteres seguros en URL |
| `WEB_CONCURRENCY` | `2` | Procesos de uvicorn del servicio `api` |
| `INGEST_WORKER_ENABLED`, `INGEST_WORKER_INTERVAL_SECONDS` | forzado por servicio, `20` | Ver [worker](#worker-de-ingesta-un-solo-proceso) |
| `RECAPTCHA_SECRET`, `RECAPTCHA_SITE_KEY`, `RECAPTCHA_MIN_SCORE` | configurar (P2-3) | Sin claves, `/postular` omite la verificación anti-robot |
| `PUBLIC_SUBMISSIONS_PER_WINDOW`, `PUBLIC_SUBMISSIONS_WINDOW_SECONDS` | `5`, `600` | Tope de postulaciones por IP |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_TLS` | según el canal institucional | Sin `SMTP_HOST` el envío es un no-op |
| `MINIMAX_*`, `GEMINI_*`, `AI_*` | opcionales | También configurables en `/configuracion` (la base pisa al entorno) |
| `OPENFDA_API_KEY`, `NCBI_API_KEY`, `NCBI_EMAIL` | recomendadas | Cupos de las fuentes de nivel A |
| `FIREBASE_*` | según RRHH | La cuenta de servicio puede montarse como archivo (volumen comentado en `docker-compose.yml`) |
| `API_BIND`, `API_PORT`, `IMAGE_TAG`, `SITE_DOMAIN`, `ACME_EMAIL` | — | Solo compose |
| `RUN_MIGRATIONS`, `FORWARDED_ALLOW_IPS`, `FRONTEND_DIST`, `PORT` | fijadas en la imagen/compose | No suele hacer falta tocarlas |

## HTTPS

**Opción A — Caddy incluido (perfil `https`).** Requiere que el DNS de `SITE_DOMAIN` apunte al servidor y que los puertos 80 y 443 estén abiertos desde internet (el reto ACME usa el 80). Caddy obtiene y renueva el certificado solo; la configuración está en [`deploy/Caddyfile`](deploy/Caddyfile).

```bash
docker compose --env-file deploy/.env.production --profile https up -d
docker compose --env-file deploy/.env.production logs caddy     # emisión del certificado
```

**Opción B — proxy o balanceador institucional.** Apunte el proxy a `http://127.0.0.1:8000` (o cambie `API_BIND` si el proxy está en otra máquina de una red privada), reenvíe `X-Forwarded-For` y `X-Forwarded-Proto`, y termine TLS 1.2+ (la fase 7 del plan pide TLS 1.3).

En ambos casos:

- Los encabezados de seguridad (CSP, HSTS en producción, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`) los emite la aplicación. **El proxy no debe duplicar la CSP** ni los demás: dos políticas se combinan de forma restrictiva y pueden romper la SPA.
- `CORS_ORIGINS` y `PUBLIC_BASE_URL` deben ser el origen `https://` público, y ese origen debe estar en los orígenes autorizados del Client ID de Google.
- El puerto 8000 nunca debe quedar expuesto a internet: la aplicación registra en bitácora la IP de `X-Forwarded-For`, que un cliente directo podría falsificar.

## Worker de ingesta: un solo proceso

El worker de ingesta es un **hilo dentro de cada proceso** de uvicorn (`backend/app/worker.py`), y la cola `ingest_jobs` no reclama trabajos de forma atómica. Si dos procesos lo ejecutan, el mismo job corre dos veces. Por eso:

- `api` corre con `INGEST_WORKER_ENABLED=false` y `WEB_CONCURRENCY` procesos.
- `worker` corre la misma imagen con `INGEST_WORKER_ENABLED=true` y `WEB_CONCURRENCY=1`, sin puertos publicados.
- El punto de entrada del contenedor (`deploy/docker-entrypoint.sh`) **se niega a arrancar** con `INGEST_WORKER_ENABLED=true` y `WEB_CONCURRENCY` distinto de 1.
- No escale `worker` (`--scale worker=2` duplicaría trabajos).
- Si prefiere no tener el servicio `worker`, elimínelo y ponga en `api` `WEB_CONCURRENCY: "1"` e `INGEST_WORKER_ENABLED: "true"`.

Cuando exista Redis institucional, P2-1 del backlog extrae `run_job` a un worker Celery y esta restricción desaparece.

## Migraciones de base de datos (Alembic)

Desde esta versión el esquema se versiona con Alembic (`backend/alembic/`, revisión base `0001`). La función `app.migrations.upgrade_database()` resuelve los tres casos al arrancar:

| Estado de la base | Acción |
|---|---|
| Vacía | `alembic upgrade head`: el baseline crea todo el esquema (y, en PostgreSQL, los índices GIN `pg_trgm` de INVIMA) |
| Anterior a Alembic (tablas sin `alembic_version`) | Se completa con `create_all` + las migraciones ligeras de `database.py`, se crean los índices que falten, se **marca** (`stamp`) en `0001` sin ejecutarlo y se aplica `upgrade head` |
| Ya versionada | `alembic upgrade head` (no hace nada si está al día) |

Es idempotente y en PostgreSQL se serializa con un candado consultivo, de modo que varios procesos arrancando a la vez no migran en paralelo. En el contenedor, `python -m app.migrations --bootstrap` migra y ejecuta una vez las siembras antes de lanzar los procesos de uvicorn.

Comandos (desde `backend/`; en el contenedor, anteponga `docker compose --env-file deploy/.env.production exec api`):

```bash
python -m app.migrations                  # migrar y mostrar la revisión
python -m alembic current                 # revisión actual de la base
python -m alembic history                 # historial de revisiones
python -m alembic upgrade head --sql      # SQL que se ejecutaría, sin conectarse
python -m alembic -x url=sqlite:///./copia.db upgrade head   # ensayo sobre una copia
```

### Crear una migración

1. Modifique los modelos en `backend/app/models.py`. **No** agregue más pasos a `run_schema_migrations()` de `database.py`: queda congelada para bases anteriores a Alembic.
2. Genere la revisión contra una base al día (una SQLite vacía migrada sirve):

   ```powershell
   cd backend
   .\.venv\Scripts\python.exe -m alembic -x url=sqlite:///./rev.db upgrade head
   .\.venv\Scripts\python.exe -m alembic -x url=sqlite:///./rev.db revision --autogenerate --rev-id 0002 -m "descripcion corta"
   Remove-Item .\rev.db
   ```

   Use identificadores correlativos (`0002`, `0003`…) para que los archivos queden ordenados.
3. **Revise el archivo a mano**: el autogenerate no detecta renombres (los propone como borrar y crear, lo que pierde datos), disparadores, índices GIN ni cambios de datos. En SQLite los `ALTER` van en `op.batch_alter_table` (ya activado en `env.py`). Escriba también el `downgrade()`.
4. Si la revisión mueve datos o crea índices sobre tablas grandes, ensáyela sobre una copia de la base real y mida el tiempo.
5. Ejecute las pruebas: `python -m pytest tests/test_frente_d_migrations.py` (incluye la guardia de deriva, que falla si los modelos y las migraciones no coinciden) y `python -m alembic -x url=sqlite:///./rev.db check`.
6. Suba la revisión junto con el cambio de modelos en el mismo commit.

Mientras `main.py` siga llamando `Base.metadata.create_all` después de `upgrade_database()`, una tabla nueva que se olvide en las revisiones igual se crearía, pero la guardia de deriva del CI lo detecta.

> **Solo antes del primer despliegue con Alembic:** si otros cambios de modelos llegaron después del baseline, puede rehacerlo con `python alembic/regenerate_baseline.py` (conserva lo escrito a mano). Una vez que alguna base de producción tenga `alembic_version`, el baseline queda congelado.

## Respaldo y restauración

Las bases contienen la bitácora de auditoría y, en `app_meta`, las claves de IA y de fuentes guardadas desde `/configuracion`: **trate los respaldos como secretos** (cifrado en reposo, acceso restringido, copia fuera del servidor).

### PostgreSQL (contenedores)

Respaldo con [`deploy/backup.sh`](deploy/backup.sh): `pg_dump` en formato *custom* comprimido, verificación con `pg_restore --list`, un `.meta` con la revisión de Alembic y conteos de control, y retención de 14 días (`RETENTION_DAYS`).

```bash
chmod +x deploy/backup.sh
deploy/backup.sh                         # -> deploy/backups/iets_<base>_<fecha>.dump + .meta
deploy/backup.sh /srv/respaldos          # otra carpeta
# cron diario a las 02:30:
# 30 2 * * *  /opt/iets-horizonte/deploy/backup.sh >> /var/log/iets-backup.log 2>&1
```

Restauración (reemplaza el contenido de la base):

```bash
ENV=deploy/.env.production
docker compose --env-file $ENV stop api worker                     # nadie escribe durante la restauración
docker compose --env-file $ENV exec -T db \
  pg_restore -U iets -d iets_horizonte --clean --if-exists --no-owner --exit-on-error \
  < deploy/backups/iets_iets_horizonte_20260910T023000Z.dump
docker compose --env-file $ENV start api worker                    # migra a head si el respaldo era de una versión anterior
```

Compare los conteos del `.meta` con `SELECT count(*)` de las mismas tablas. El `REVOKE` de la bitácora lo vuelve a aplicar el arranque (`harden_audit_log`).

Para restaurar en una base nueva (prueba de restauración, criterio de aceptación de la fase 7):

```bash
docker compose --env-file $ENV exec db createdb -U iets iets_restore
docker compose --env-file $ENV exec -T db pg_restore -U iets -d iets_restore --no-owner < respaldo.dump
docker compose --env-file $ENV exec db psql -U iets -d iets_restore -c "SELECT version_num FROM alembic_version"
docker compose --env-file $ENV exec db dropdb -U iets iets_restore
```

### SQLite (Windows sin contenedores)

Respaldo con [`deploy/backup.ps1`](deploy/backup.ps1): usa la API de respaldo en línea de SQLite (copia consistente con el servidor en marcha), verifica con `PRAGMA integrity_check` y deja el `.meta`. Sin parámetros toma la base de `DATABASE_URL` de `backend\.env`.

```powershell
.\deploy\backup.ps1                                   # -> deploy\backups\iets_horizonte_<fecha>.db
.\deploy\backup.ps1 -BackupDir D:\Respaldos\IETS -RetentionDays 60
schtasks /Create /SC DAILY /ST 02:30 /TN "IETS Respaldo" /TR "powershell -NoProfile -ExecutionPolicy Bypass -File C:\ruta\Sis_HS_IETS\deploy\backup.ps1"
```

Restauración:

1. Detenga el servidor (Ctrl+C en la consola de `start-prod.ps1` o el servicio).
2. Renombre la base actual (`backend\iets_horizonte.db` → `iets_horizonte.db.antes`) y borre `iets_horizonte.db-wal` e `iets_horizonte.db-shm` si existen.
3. Copie el respaldo como `backend\iets_horizonte.db`.
4. Arranque de nuevo: la migración lleva la base a la revisión actual.

### Migrar de SQLite a PostgreSQL

El código es agnóstico del motor, pero no hay todavía un script de copia de datos entre motores (P0-1 pide ensayo con conteos de control y ventana de retorno a SQLite). Procedimiento recomendado: base PostgreSQL vacía migrada con `python -m app.migrations`, copia tabla por tabla en orden de dependencias con una herramienta como `pgloader` o un script SQLAlchemy, ajuste de las secuencias (`setval`) y comparación de conteos por tabla contra el `.meta` del último respaldo SQLite. Conserve la base SQLite intacta durante la ventana de retorno.

## Rotación de `SECRET_KEY`

`SECRET_KEY` solo firma los JWT de sesión (los enlaces de revisor externo se guardan como hash SHA-256, sin la clave). Rotarla **cierra todas las sesiones**: cada persona debe volver a entrar.

1. Genere la nueva: `python3 -c "import secrets; print(secrets.token_urlsafe(48))"`.
2. Reemplácela en `deploy/.env.production` (o `backend\.env`).
3. Recree los servicios para que lean el valor nuevo: `docker compose --env-file deploy/.env.production up -d --force-recreate api worker` (en Windows, reinicie `start-prod.ps1`).
4. Registre la fecha de rotación. Hágalo ante cualquier sospecha de filtración y, como rutina, al menos una vez al año o cuando salga del equipo alguien que la conocía.

Para cerrar las sesiones de una sola cuenta no hace falta rotar: `python -m app.cli reset-password --email X` o desactivar la cuenta en `/usuarios`.

## Actualización de versión

1. Lea las notas de la versión (README, sección *Migración desde versiones anteriores*).
2. **Respalde**: `deploy/backup.sh` (o `backup.ps1`) y anote la etiqueta de imagen en uso (`docker compose ... images`).
3. Obtenga el código nuevo (`git fetch && git checkout <etiqueta>`).
4. Construya con una etiqueta nueva, sin tocar la anterior:

   ```bash
   IMAGE_TAG=6.7.0 docker compose --env-file deploy/.env.production build
   IMAGE_TAG=6.7.0 docker compose --env-file deploy/.env.production up -d
   ```

   Al arrancar, `api` aplica las revisiones pendientes de Alembic antes de atender. Actualice `IMAGE_TAG` en `deploy/.env.production` para que quede fijada.
5. Verifique `ps` (healthy), `/api/health` (la versión nueva), los logs de `api` (`Migracion: upgraded` o `current`) y, con una cuenta con contraseña, la suite de regresión:

   ```bash
   cd backend && SMOKE_PASSWORD='...' python smoke_test.py --base https://horizonte.iets.org.co --email cuenta@iets.org.co --skip-network
   ```

   Ojo: la suite **escribe** datos de prueba (ciclo, tecnologías, notas). Úsela contra producción solo si la institución lo acepta; si no, córrala contra una copia restaurada.

## Monitoreo

- **Salud:** `GET /api/health` responde `{"status":"ok","service":"iets-horizon-scanning","version":"…"}`. El `HEALTHCHECK` de la imagen lo consulta cada 30 s (inicio tolerado de 180 s); `docker compose ps` muestra `healthy`/`unhealthy`. Configure además un monitor externo (UptimeRobot, Zabbix, Nagios…) contra `https://SITE_DOMAIN/api/health` con alerta tras dos fallos seguidos.
- **Logs:** `docker compose --env-file deploy/.env.production logs -f --tail=200 api worker` (rotación: 5 archivos de 20 MB por servicio). Cada respuesta lleva `X-Request-ID`, que también queda en la bitácora.
- **Estado funcional:** `/api/status` y la pantalla de fuentes (salud de conectores, circuitos abiertos), la antigüedad del índice INVIMA (alerta a los 30 días) y el worker (`ingest_jobs` pendientes que no bajan indican que `worker` no está corriendo).
- **Base de datos:** espacio del volumen `pgdata`, tamaño de `audit_log` (crece sin límite por diseño) y edad del último respaldo (`ls -lt deploy/backups | head`).

## Reversión

| Situación | Acción |
|---|---|
| La versión nueva falla y **no** tenía revisiones de Alembic nuevas | `IMAGE_TAG=<anterior> docker compose --env-file deploy/.env.production up -d` |
| Tenía revisiones reversibles | Con la imagen **nueva**: `docker compose ... run --rm api python -m alembic downgrade <revision_anterior>`; luego arranque la imagen anterior |
| La revisión no es reversible o hubo pérdida de datos | Detenga `api` y `worker`, restaure el respaldo previo (sección anterior) y arranque la imagen anterior |

La revisión que esperaba la versión anterior está en el `.meta` del respaldo tomado antes de actualizar. Nunca arranque una imagen anterior sobre una base en una revisión más nueva sin hacer antes el `downgrade`: Alembic no la conoce y el arranque fallará.

## Servidor Windows sin contenedores

Para una instalación de un solo servidor con SQLite (sin Docker ni PostgreSQL):

```powershell
.\start-prod.ps1                          # 127.0.0.1:8000, detrás de IIS/ARR u otro proxy HTTPS
.\start-prod.ps1 -BindHost 0.0.0.0 -Port 8080
```

`start-prod.ps1` (distinto de `start.ps1`, que sigue siendo el de desarrollo) fija `ENVIRONMENT=production` y `ALLOW_DEV_LOGIN=false`, exige un `backend\.env` propio, valida con `check-config`, compila el frontend si falta `frontend\dist`, migra con Alembic y arranca uvicorn **sin `--reload` y con un solo proceso** (SQLite y el worker en hilo no admiten más). Para dejarlo como servicio de Windows use NSSM o el Programador de tareas con "Ejecutar tanto si el usuario inició sesión como si no".

## Integración continua

`.github/workflows/ci.yml` corre en cada push a `main` y en cada pull request:

| Job | Qué verifica |
|---|---|
| `backend` | `pytest` completo; `alembic upgrade head`, `alembic check` (deriva), `downgrade base` y `upgrade` de nuevo sobre SQLite vacía |
| `postgres` | Con un servicio `postgres:15`: base vacía (`created` → `current`), base heredada creada con `create_all` (`stamped`), `alembic check` e índices GIN `pg_trgm` presentes |
| `frontend` | `npm ci` + `npm run build`; publica `dist` como artefacto |
| `e2e` | `npx playwright install --with-deps chromium` y `npx playwright test` con `E2E_CHANNEL=chromium` (modo autocontenido de `playwright.config.js`: uvicorn con SQLite temporal sirviendo `dist`) |
| `smoke` | Migra, levanta uvicorn con SQLite temporal y ejecuta `smoke_test.py --skip-network` |
| `docker` | Valida `docker-compose.yml` (`config`), construye la imagen sin publicarla y comprueba que rechaza una `SECRET_KEY` insegura, que corre como UID 10001 y que incluye `dist` |

Proteja la rama `main` exigiendo que estos jobs pasen antes de fusionar (criterio de aceptación de la fase 0).

## Limitaciones conocidas

- **Worker en proceso:** ver la sección correspondiente; sin Redis/Celery la ingesta no escala horizontalmente (P2-1).
- **SQLite es de un solo proceso:** no hay candado de migración entre procesos en SQLite; `start-prod.ps1` usa un proceso y el contenedor migra antes de lanzar uvicorn.
- **Rol de base de datos único:** con compose, la aplicación usa el mismo rol dueño de las tablas. El `REVOKE UPDATE, DELETE` sobre `audit_log` se aplica a ese rol, pero un dueño puede volver a concederse el privilegio. La fase 7 debería separar un rol de migraciones (dueño) de un rol de aplicación (solo DML).
- **Siembras en cada arranque:** el arranque sincroniza catálogos, parámetros y ciclos oficiales. Con varios procesos se ejecuta primero una vez (`--bootstrap`) para no hacerlo en paralelo sobre una base vacía.
