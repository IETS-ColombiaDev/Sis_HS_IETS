# Sistema de Escaneo de Horizonte del IETS

Aplicación web del **Instituto de Evaluación Tecnológica en Salud (IETS)** de Colombia para el escaneo de horizonte (*horizon scanning*) de tecnologías sanitarias: vigila fuentes públicas, captura señales, las depura y cruza con el registro sanitario, las prioriza con la matriz %P, soporta la evaluación temprana con revisión por pares y publica los resultados. Todo cambio queda en una bitácora de auditoría y el acceso se gobierna por perfiles.

**Versión de esta entrega:** `7.15.0` (`backend/app/__init__.py`, `frontend/package.json`).

---

## Índice

1. [Qué hace el sistema](#qué-hace-el-sistema)
2. [Arquitectura y tecnologías](#arquitectura-y-tecnologías)
3. [Requisitos](#requisitos)
4. [Instalación y ejecución](#instalación-y-ejecución)
5. [Variables de entorno](#variables-de-entorno)
6. [Seguridad de los datos: copia en Firestore](#seguridad-de-los-datos-copia-en-firestore)
7. [Vigilancia de fuentes](#vigilancia-de-fuentes)
8. [Inteligencia del sistema](#inteligencia-del-sistema)
9. [Perfiles y permisos](#perfiles-y-permisos)
10. [API](#api)
11. [Pruebas](#pruebas)
12. [Migraciones de base de datos](#migraciones-de-base-de-datos)
13. [Comandos de administración (CLI)](#comandos-de-administración-cli)
14. [Estructura del repositorio](#estructura-del-repositorio)
15. [Flujo de ramas](#flujo-de-ramas)
16. [Documentación relacionada](#documentación-relacionada)

---

## Qué hace el sistema

El menú lateral sigue las fases de la metodología (`frontend/src/constants/navigation.js`). Las pantallas de cada fase aparecen como submódulos, en el orden en que se usan.

| Sección del menú | Pantallas (ruta) |
|---|---|
| Inicio | Bandeja de trabajo (`/`), Ciclos de escaneo (`/ciclos`), Notas del equipo (`/notas`) |
| Metodología IETS · 1. Vigilancia | Vigilancia (`/vigilancia`), Catálogo de fuentes (`/fuentes`), Señales capturadas (`/senales`), Bandeja de entrada (`/bandeja-entrada`), Postulaciones (`/postulaciones`), Filtrado y depuración (`/filtrado`) |
| Metodología IETS · 2. Priorización | Priorización (`/priorizacion`) |
| Metodología IETS · 3. Evaluación | Evaluación temprana (`/evaluacion`) |
| Metodología IETS · 4. Diseminación | Diseminación (`/diseminacion`), Boletines del ciclo (`/boletines`) |
| Análisis y seguimiento | Tablero estratégico (`/dashboards`), Alertas tempranas (`/alertas`), Asistente IA (`/chat`) |
| Administración | Configuración (`/configuracion`), Usuarios y perfiles (`/usuarios`), Bitácora de auditoría (`/auditoria`) |

Páginas públicas, sin sesión: formulario de postulación (`/postular`), portal del revisor externo (`/revisar/:token`), catálogo de expedientes publicados (`/expedientes`, `/expedientes/:id`) y cifras de transparencia (`/transparencia`).

### 1. Vigilancia e identificación

- **Catálogo de fuentes.** El inventario vigente es la matriz por enlace `backend/app/data/matriz_enlaces_eh.json` (142 filas, una por enlace; códigos `EH-<ID>`), que se sincroniza al arrancar (`catalog_service.sync_catalog`). Desde la pantalla se puede cargar una matriz nueva en Excel, compararla con la vigente y aplicarla, dar de alta una fuente solo con su URL, descubrir fuentes, registrar la consulta manual de las que no admiten rastreo y exportar el catálogo.
- **Vigilancia.** Corridas manuales (todas las fuentes activas, una selección o una sola) y programadas. Cada fuente se consulta por su conector de API o con el rastreador web, que tiene varias rutas de acceso. Ver [Vigilancia de fuentes](#vigilancia-de-fuentes).
- **Señales capturadas.** Cada señal guarda la URL consultada, la URL exacta cuando existe, el tipo de enlace y la evidencia de captura. Hay reporte de enlaces por fuente, verificación de enlaces caídos y ubicación de la señal dentro de su página (`signal_links.py`, `link_resolver.py`).
- **Bandeja de entrada.** Clasificación por clúster y tipología con sugerencia explicada, dictamen de confiabilidad de la señal, datos de producto extraídos del texto (`product_details.py`), corroboración entre fuentes (`corroboration.py`), descarte y restauración, recuperación de señales de fuentes del inventario anterior (Legacy) y asignación por lotes al ciclo.
- **Postulaciones.** Formulario público con declaración de conflicto de interés, reCAPTCHA v3 cuando están las dos llaves y tope de envíos por IP. La moderación cruza cada postulación con lo ya vigilado antes de aceptarla o rechazarla.
- **Filtrado y depuración.** Propuestas de duplicados por similitud difusa (`dedup.py`, RapidFuzz) que una persona confirma o descarta; verificación de novedad con cruce al índice local del INVIMA y, si `INVIMA_LIVE_LOOKUP` lo permite, consulta en vivo a `datos.gov.co`; normalización de códigos; Listado Único por clúster exportable.

### 2. Priorización

Matriz oficial de seis criterios binarios, P1 a P6 (`priority_engine.py`). `%P = (suma de P1..P6 / 6) × 100`. La clasificación se hace por puntos: 4 o más, priorizada; 3, bajo vigilancia; 2 o menos, no priorizada. Los umbrales están en los parámetros metodológicos (`priority.points_prioritized`, `priority.points_watch`), no en el código. El %P no se calcula mientras falte un criterio y una entrada de ciclo congelada rechaza escrituras. Cada criterio solo lo califica el perfil que tiene su permiso.

### 3. Evaluación

Expediente por tecnología priorizada, con versiones, comentarios y declaración de conflicto de interés. Estados (`evaluation.py`): `borrador` → `revision_interna` → `revision_externa` → `con_observaciones` o `aprobado_comite` → `publicado`. El revisor externo entra por un enlace con token, sin cuenta, y firma su declaración antes de comentar. El expediente se exporta en HTML institucional o PDF (ReportLab).

### 4. Diseminación

Informes de diseminación (redacción manual o generada con IA desde una señal), paquete ZIP del ciclo, boletines que se compilan desde el ciclo, se aprueban y se distribuyen, y ficha pública de los expedientes publicados.

### Análisis y seguimiento

- **Bandeja de trabajo.** Pendientes del perfil, buscador de tecnologías y resumen de la **última vigilancia** del historial: cuándo corrió, cuánto duró, fuentes, cuántas entraron, cuántas quedaron sin acceso y señales nuevas.
- **Tablero estratégico.** Indicadores del ciclo, grafo de relaciones y **marco analítico** (`analytics_insights.py`) con cuatro lentes: descriptivo, diagnóstico, predictivo y prescriptivo. El diagnóstico incluye el indicador **«Fuentes sin acceso»**: fuentes que no se pudieron leer en su última corrida, con enlace al informe de acceso. Todo se calcula con reglas; si la IA está encendida, redacta además una lectura ejecutiva usando solo esas cifras.
- **Alertas tempranas** con suscripciones, y **Asistente IA** sobre lo registrado en el sistema. El asistente de navegación responde «cómo hago X» sin IA, a partir de `HOWTO` en `navigation.js`.

### Administración

Configuración agrupada por tema (`frontend/src/pages/Settings.jsx`):

| Grupo | Pestañas |
|---|---|
| Metodología | Gobierno metodológico, Reglas de horizonte |
| Fuentes y vigilancia | Parámetros de fuentes, Llaves de fuentes, Tareas programadas, Prompts de vigilancia |
| Inteligencia artificial | Integración con IA, Inteligencia |
| Datos y respaldo | Persistencia (Firebase) |

Además: usuarios y perfiles, «Ver como» para que el superadministrador opere con los permisos de otro perfil, y bitácora de auditoría. La tabla `audit_log` rechaza `UPDATE` y `DELETE` a nivel de motor: disparadores en SQLite y revocación de privilegios en PostgreSQL (`database.harden_audit_log`).

### Flujo general

```mermaid
flowchart TD
    F["Fuentes de la matriz EH"] --> Q["Cola ingest_jobs"]
    Q --> W["Worker: conectores de API o rastreador web"]
    W --> S["Señales (findings) y tecnologías"]
    P["Formulario público /postular"] --> M["Moderación de postulaciones"]
    M --> B["Bandeja de entrada"]
    S --> B
    B -->|"Clasificar y asignar al ciclo"| D["Filtrado: duplicados, novedad, INVIMA"]
    D -->|"Listado Único"| R["Priorización %P (P1 a P6)"]
    R -->|"Priorizada"| E["Evaluación y revisión por pares"]
    E -->|"Publicado"| O["Diseminación: informes, boletines, ficha pública"]
    B -.-> K["Base de conocimiento de señales"]
    K -.->|"Sugerencia de clasificación"| B
```

---

## Arquitectura y tecnologías

Un solo servicio web: FastAPI expone la API bajo `/api` y, si existe `frontend/dist`, sirve también la aplicación React compilada. La cola de vigilancia vive en la tabla `ingest_jobs` y la atiende un hilo del mismo proceso (o un servicio `worker` aparte con la misma imagen). La base es SQLite por defecto o PostgreSQL 15 con `DATABASE_URL`. Con SQLite, la base se copia a Firestore.

| Capa | Tecnología | Versión | Uso |
|---|---|---|---|
| Backend | Python | 3.12 (imagen Docker y CI) | Lenguaje del backend |
| | FastAPI | 0.115.6 | API REST |
| | Uvicorn | 0.34.0 | Servidor ASGI |
| | SQLAlchemy | 2.0.36 | ORM |
| | Alembic | 1.19.2 | Migraciones versionadas |
| | psycopg | 3.3.5 | Driver de PostgreSQL |
| | Pydantic / pydantic-settings | 2.10.4 / 2.7.1 | Esquemas y configuración |
| | python-jose | 3.3.0 | Tokens de sesión (JWT) |
| | google-auth | 2.37.0 | Inicio de sesión con Google y cuenta de servicio |
| | httpx / requests | 0.28.1 / 2.32.3 | Clientes HTTP de conectores y rastreador |
| | curl_cffi | 0.17.0 | Cliente compatible con navegador (opcional) |
| | BeautifulSoup4 / lxml / trafilatura | 4.12.3 / 6.1.1 / 2.1.0 | Lectura de páginas |
| | pypdf / pypdfium2 / Pillow | 6.14.2 / 4.30.0 / 11.3.0 | Lectura de PDF e imágenes |
| | RapidFuzz | 3.14.6 | Similitud de cadenas para duplicados |
| | openpyxl | 3.1.5 | Lectura y escritura de Excel |
| | ReportLab | 4.2.5 | PDF de expedientes, informes y boletines |
| | google-generativeai | 0.8.3 | Gemini (IA de respaldo) |
| Frontend | React / React DOM | ^18.3.1 | Interfaz |
| | React Router DOM | ^6.28.0 | Rutas |
| | Vite | ^5.4.11 | Servidor de desarrollo y compilación |
| | Axios | ^1.7.9 | Cliente de la API |
| | Recharts | ^2.13.3 | Gráficos |
| | react-markdown / remark-gfm | ^9.0.1 / ^4.0.0 | Texto con formato |
| | Playwright | ^1.49.1 | Pruebas de navegador |
| Despliegue | Docker | `node:24-bookworm-slim`, `python:3.12-slim-bookworm` | Imagen de tres etapas |
| | Docker Compose | `postgres:15`, `caddy:2` | Pila con API, worker, base y proxy HTTPS |

Servicios externos que el sistema puede usar: MiniMax (IA principal) o Gemini por API, Firestore (copia de la base y directorio institucional), `datos.gov.co` (INVIMA), E-utilities de NCBI, openFDA y las demás fuentes del catálogo. Ninguno es obligatorio para arrancar: sin llave de IA el sistema opera con reglas.

La hoja `frontend/src/styles/horizon.css` se carga al final (`main.jsx`) y define el rediseño visual de esta entrega: menú lateral azul, cabecera de pantalla en una sola franja e indicadores en fichas compactas. Afina `globals.css`, `shell.css` y `ui.css`; no oculta contenido.

---

## Requisitos

- **Python 3.12**, la versión de la imagen Docker y de la integración continua.
- **Node.js y npm.** La imagen y la CI compilan con Node 24; el job de Playwright de la CI usa Node 22.
- **Git.**
- **Google Chrome** instalado, para las pruebas de navegador en el equipo (o Chromium de Playwright con `E2E_CHANNEL=chromium`).
- Opcional: **Docker y Docker Compose** para la pila con PostgreSQL 15.

---

## Instalación y ejecución

> Antes de levantar cualquier servidor local, lea [Seguridad de los datos](#seguridad-de-los-datos-copia-en-firestore): un servidor local o de pruebas debe correr con `FIREBASE_DB_ENABLED=false`.

### Preparación

```powershell
git clone <URL-del-repositorio>
cd Sis_HS_IETS

# Backend
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env      # edite los valores; ponga FIREBASE_DB_ENABLED=false

# Frontend
cd ..\frontend
npm install
```

En Linux o macOS el entorno se activa con `source .venv/bin/activate` y el archivo se copia con `cp .env.example .env`.

### Desarrollo (dos terminales, recarga en caliente)

```powershell
# Terminal 1: API en http://127.0.0.1:8000 (documentación en /docs)
cd backend
.\.venv\Scripts\Activate.ps1
$env:FIREBASE_DB_ENABLED = "false"
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# Terminal 2: interfaz en http://127.0.0.1:5173
cd frontend
npm run dev
```

Vite redirige `/api` a `http://127.0.0.1:8000`. `API_TARGET`, `VITE_PORT` y `VITE_HOST` cambian el destino, el puerto y la interfaz (`frontend/vite.config.js`).

### Arranque rápido en Windows

```powershell
.\start.ps1
```

Crea el entorno virtual e instala dependencias si faltan, copia `backend\.env.example` a `backend\.env` si no existe, compila el frontend si no hay `frontend\dist` y levanta uvicorn en `http://127.0.0.1:8000`, que sirve la API y la interfaz compilada.

### Producción local sin contenedores (Windows)

```powershell
.\start-prod.ps1                              # 127.0.0.1:8000, detrás de un proxy HTTPS
.\start-prod.ps1 -BindHost 0.0.0.0 -Port 8080
.\start-prod.ps1 -SkipBuild                   # no compila el frontend aunque falte
```

Fija `ENVIRONMENT=production` y `ALLOW_DEV_LOGIN=false` para el proceso, exige un `backend\.env` propio, valida la configuración con `python -m app.cli check-config`, aplica las migraciones con `python -m app.migrations` y lanza uvicorn con un solo proceso.

### Docker Compose (PostgreSQL 15)

```bash
cp deploy/.env.production.example deploy/.env.production   # complete los valores
docker compose --env-file deploy/.env.production build
docker compose --env-file deploy/.env.production up -d
docker compose --env-file deploy/.env.production --profile https up -d   # añade Caddy con HTTPS
```

| Servicio | Qué es |
|---|---|
| `db` | PostgreSQL 15 con volumen persistente, sin puertos publicados |
| `api` | FastAPI + interfaz, `WEB_CONCURRENCY` procesos, sin worker de ingesta |
| `worker` | La misma imagen, un proceso, `INGEST_WORKER_ENABLED=true`; el único que recorre la cola |
| `caddy` | Proxy con certificados automáticos (perfil `https`) |

El punto de entrada del contenedor (`deploy/docker-entrypoint.sh`) valida la configuración, migra y siembra una vez (`python -m app.migrations --bootstrap`) si `RUN_MIGRATIONS=true`, crea el superadministrador si están `BOOTSTRAP_ADMIN_EMAIL` y `BOOTSTRAP_ADMIN_PASSWORD`, y lanza uvicorn. Con un motor que no sea PostgreSQL fuerza un solo proceso, y se niega a arrancar con `INGEST_WORKER_ENABLED=true` y más de un proceso. Los comandos de administración se ejecutan así:

```bash
docker compose --env-file deploy/.env.production run --rm api python -m app.cli check-config
```

### Render

`render.yaml` define un servicio web con `runtime: docker`, plan gratuito, `healthCheckPath: /api/health` y `autoDeploy: true`. Corre un solo proceso con SQLite (`WEB_CONCURRENCY=1`), con el worker en el mismo proceso (`INGEST_WORKER_ENABLED=true`, `INGEST_WORKER_FORCE=true`) y una fuente a la vez (`INGEST_MAX_PARALLEL=1`). Como el disco es efímero, la base se copia a Firestore y se restaura al arrancar. `SECRET_KEY` la genera Render; la cuenta de servicio de Firebase y la llave de IA se escriben a mano en el panel (`sync: false`). La imagen fija `ENVIRONMENT=production` y `ALLOW_DEV_LOGIN=false`.

El detalle de operación (primer superadministrador, HTTPS, respaldo, rotación de `SECRET_KEY`, reversión) está en [`DEPLOY.md`](DEPLOY.md).

---

## Variables de entorno

Se leen de `backend/.env` y del entorno del proceso. La plantilla es `backend/.env.example`; la de producción con contenedores, `deploy/.env.production.example`. Las llaves de IA y de fuentes guardadas desde Configuración se almacenan en la base y tienen prioridad sobre el `.env`.

### Configuración de la aplicación (`backend/app/config.py`)

| Variable | Valor por defecto | Para qué |
|---|---|---|
| `ENVIRONMENT` | `development` | `development`, `testing` o `production`. En producción se apaga el acceso de desarrollo y se exige una `SECRET_KEY` propia |
| `SECRET_KEY` | valor de ejemplo | Firma de los tokens de sesión. En producción, al menos 32 caracteres o el servidor no arranca |
| `ALGORITHM` | `HS256` | Algoritmo de firma del token |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `720` | Duración de la sesión |
| `GOOGLE_CLIENT_ID` | vacío | Client ID de OAuth para el inicio de sesión con Google; vacío oculta el botón |
| `ALLOWED_EMAIL_DOMAIN` | `iets.org.co` | Dominio institucional admitido |
| `ADMIN_EMAILS` | vacío | Correos, separados por coma, que reciben el perfil de superadministrador al iniciar sesión |
| `ALLOW_DEV_LOGIN` | `true` | Acceso sin contraseña para desarrollo. Se ignora en producción |
| `PASSWORD_MIN_LENGTH` | `10` | Longitud mínima de contraseña |
| `LOGIN_MAX_ATTEMPTS` | `5` | Intentos fallidos antes de bloquear la cuenta |
| `LOGIN_LOCKOUT_MINUTES` | `15` | Minutos de bloqueo |
| `AI_PROVIDER` | `auto` | `auto`, `minimax`, `gemini` u `off` |
| `MINIMAX_API_KEY` / `MINIMAX_MODEL` | vacío | Llave y modelo de MiniMax. Sin llave, la IA queda en modo degradado |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | vacío | Llave y modelo de Gemini (respaldo) |
| `AI_WEB_ENABLED` | `true` | La IA lee las páginas de las fuentes durante la vigilancia |
| `AI_OCR_ENABLED` | `false` | Lectura de imágenes y PDF escaneados |
| `BROWSER_FETCH_ENABLED` | `true` | Permiso del servidor para la ruta de cliente compatible con navegador. `false` la prohíbe aunque el interruptor de Configuración esté encendido |
| `INVIMA_LIVE_LOOKUP` | `true` | Consulta en vivo a `datos.gov.co` si el índice local no tiene la tecnología |
| `CORS_ORIGINS` | orígenes locales (puertos 5173 y 8000) | Orígenes admitidos, separados por coma |
| `DATABASE_URL` | `sqlite:///./iets_horizonte.db` | Conexión. PostgreSQL: `postgresql+psycopg://usuario:clave@host:5432/base` |
| `INGEST_WORKER_ENABLED` | `true` | Activa el worker de la cola y de las tareas programadas |
| `INGEST_WORKER_INTERVAL_SECONDS` | `20` | Pausa entre vueltas del worker (mínimo 5) |
| `LINK_AUTO_RESOLVE` | `true` | Ubica en segundo plano las señales que aún no tienen su punto exacto en la página |
| `LINK_AUTO_CHECK` | `true` | Verifica en segundo plano los enlaces de las señales |
| `RECAPTCHA_SECRET` / `RECAPTCHA_SITE_KEY` | vacío | reCAPTCHA v3 de `/postular`; opera solo con ambas |
| `RECAPTCHA_MIN_SCORE` | `0.5` | Puntaje mínimo admitido |
| `PUBLIC_SUBMISSIONS_PER_WINDOW` | `5` | Postulaciones por IP en la ventana |
| `PUBLIC_SUBMISSIONS_WINDOW_SECONDS` | `600` | Duración de la ventana |
| `OPENFDA_API_KEY` | vacío | Llave de openFDA |
| `NCBI_API_KEY` / `NCBI_EMAIL` | vacío / correo institucional de contacto | Identificación ante las E-utilities de NCBI |
| `FIREBASE_PROJECT_ID` | definido en `config.py` | Proyecto de Firebase del directorio institucional y de la copia |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | vacío | JSON de la cuenta de servicio |
| `FIREBASE_SERVICE_ACCOUNT_FILE` | vacío | Ruta al JSON de la cuenta de servicio |
| `FIREBASE_RRHH_ENV_FILE` | vacío | Archivo alterno del que tomar la cuenta de servicio. Definida y vacía, apaga la búsqueda automática |
| `FIREBASE_DB_ENABLED` | `true` | Copia de la base SQLite en Firestore. **`false` en servidores locales y de prueba** |
| `FIREBASE_DB_DATABASE` | `hs-iets` | Base de Firestore |
| `FIREBASE_DB_COLLECTION` | `hs_iets_db` | Colección de la copia. Fuera de producción recibe el sufijo `_dev` |
| `FIREBASE_DB_LOCATION` | `nam5` | Ubicación de la base de Firestore |
| `FIREBASE_DB_SHARE_WITH_PRODUCTION` | `false` | Solo soporte: un entorno no productivo usa la colección de producción |
| `SMTP_HOST` | vacío | Servidor de correo. Vacío: no se envía y la interfaz ofrece copiar el enlace |
| `SMTP_PORT` / `SMTP_TLS` | `587` / `true` | Puerto y STARTTLS |
| `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` | vacío | Credenciales y remitente |
| `PUBLIC_BASE_URL` | vacío | URL pública para los enlaces absolutos de los correos |

### Variables de proceso y de despliegue

| Variable | Valor por defecto | Para qué |
|---|---|---|
| `FRONTEND_DIST` | `frontend/dist` | Carpeta de la interfaz compilada que sirve el backend |
| `SEED_OFFICIAL_CYCLES` | `true` en desarrollo; `false` en producción y en Render | Siembra de los ciclos oficiales al arrancar |
| `INGEST_WORKER_FORCE` | apagado | Con SQLite el worker regular solo arranca si esta variable está encendida |
| `INGEST_GUARDIAN` | automático | Vigilante de la cola. Sin definir, corre con SQLite y un solo proceso; `true` o `false` lo fuerza o lo apaga |
| `INGEST_MAX_PARALLEL` | `3` (`1` en Render) | Tope de fuentes rastreadas a la vez (máximo 8) |
| `WEB_CONCURRENCY` | `1` | Procesos de uvicorn. Más de uno solo con PostgreSQL |
| `KEEPALIVE_URL` | vacío | URL pública que el servicio visita mientras haya cola (en Render se usa `RENDER_EXTERNAL_URL`) |
| `KEEPALIVE_ALWAYS` | apagado | Visita la URL aunque no haya cola |
| `RUN_MIGRATIONS` | `true` | El contenedor migra y siembra antes de lanzar uvicorn |
| `PORT` | `8000` | Puerto del contenedor |
| `FORWARDED_ALLOW_IPS` | `*` | Proxies de los que uvicorn acepta cabeceras `X-Forwarded-*` |
| `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` / `BOOTSTRAP_ADMIN_NAME` | vacío | Crean o actualizan el superadministrador al arrancar el contenedor |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | `iets_horizonte` / `iets` / obligatoria | Base de datos de Docker Compose |
| `API_BIND` / `API_PORT` | `127.0.0.1` / `8000` | Dónde publica Compose el puerto de la API |
| `IMAGE_TAG` | `latest` | Etiqueta de la imagen |
| `SITE_DOMAIN` / `ACME_EMAIL` | `localhost` / vacío | Dominio y contacto de certificados de Caddy |

---

## Seguridad de los datos: copia en Firestore

Con SQLite, la base de trabajo se copia completa a Firestore (`backend/app/firebase_db.py`): es una instantánea comprimida y partida en fragmentos, que se sube tras los cambios y se restaura al arrancar. Así sobrevive al disco efímero de Render. La copia está activa cuando se cumplen las cuatro condiciones: `FIREBASE_DB_ENABLED=true`, el motor es SQLite, hay cuenta de servicio y el proceso no es una prueba de pytest.

**Regla para servidores locales y de prueba: `FIREBASE_DB_ENABLED=false`.** Con ese valor el proceso no toca Firestore en absoluto, ni siquiera para verificar que la base exista. Las razones:

- Fuera de producción, el código añade el sufijo `_dev` a la colección, de modo que un servidor de desarrollo no escribe en `hs_iets_db`. Pero esa protección desaparece si el proceso corre con `ENVIRONMENT=production` (lo que hace `start-prod.ps1`), con `RENDER=true` o con `FIREBASE_DB_SHARE_WITH_PRODUCTION=true`: en esos casos usa la colección real.
- Si no hay `FIREBASE_SERVICE_ACCOUNT_KEY` ni `FIREBASE_SERVICE_ACCOUNT_FILE`, el backend busca la cuenta de servicio en un archivo `.env.local` del proyecto vecino de RRHH (`firebase_auth.sibling_rrhh_env`). Un equipo que tenga ese proyecto obtiene credenciales sin haberlas configurado. Definir `FIREBASE_RRHH_ENV_FILE` vacía apaga esa búsqueda.
- Un servidor con credenciales y la colección real restaura la base de producción al arrancar y sube la suya después.

Lo que ya viene protegido: las pruebas de pytest nunca activan la copia y `frontend/playwright.config.js` levanta su backend con `FIREBASE_DB_ENABLED=false`, sin credenciales y con la IA apagada. `python -m app.cli check-config` muestra la base y la colección configuradas.

Protecciones de la copia en producción:

| Protección | Qué evita |
|---|---|
| No se sube nada hasta haber leído Firestore al arrancar | Que una base recién sembrada pise la copia buena tras un fallo de lectura |
| Guarda de tamaño (menos de la mitad) y de conteos por tabla | Que una base con menos datos reemplace a la guardada. Si la bitácora local tiene menos filas, la subida se bloquea |
| Cada copia en su propia generación | Que una subida interrumpida deje fragmentos mezclados |
| Puntos de recuperación fijados | Que un despliegue defectuoso borre la última copia buena: se conservan copias previas a un despliegue, cierres diarios, copias escritas por otra instancia, estados previos a una restauración y fijadas a mano |
| Colección exclusiva | Que la copia use la colección del directorio de RRHH: el código lo rechaza |

Entre una copia y la siguiente pasan al menos 2 minutos (3 durante una vigilancia); al terminar una corrida se programa una copia sin esperar ese mínimo. Los puntos de recuperación se consultan y restauran en **Configuración › Persistencia (Firebase)**, y `GET /api/health` informa en `backup` si la copia está al día, bloqueada o con error. El procedimiento completo está en [`DEPLOY.md`](DEPLOY.md).

Los respaldos contienen la bitácora y las llaves guardadas desde Configuración: deben tratarse como secretos.

---

## Vigilancia de fuentes

### Cola y worker

Lanzar una vigilancia encola un trabajo por fuente en `ingest_jobs` y responde de inmediato; el rastreo ocurre fuera del hilo de la petición (`worker.py`, `ingest_service.py`).

- **Worker regular.** Hilo que, en cada vuelta, corre las tareas programadas vencidas, drena la cola y cierra las corridas terminadas. Requiere `INGEST_WORKER_ENABLED=true`; con SQLite, además `INGEST_WORKER_FORCE`.
- **Drenaje por disparo.** Una corrida manual lanza el drenaje en segundo plano aunque el worker regular esté apagado.
- **Vigilante de la cola.** Revisa cada minuto: si hay trabajo vencido y nadie lo atiende (por ejemplo, tras un reinicio), devuelve a la cola lo que quedó a medias y reanuda. Con el sistema libre, ubica señales en su página, verifica enlaces y pone al día la base de conocimiento.
- **Paralelismo.** Parámetro `ingest.parallel_jobs` (3 de fábrica), con el tope de `INGEST_MAX_PARALLEL`.
- **Tiempo máximo por fuente.** Parámetro `ingest.job_timeout_minutes` (20 de fábrica, mínimo 2). Una fuente colgada se cierra y la corrida sigue.
- **Reintentos.** Hasta 3 intentos por trabajo, con espera creciente.
- **Circuito.** Tras `ingest.circuit_failures` fallos seguidos (3), la fuente descansa `ingest.circuit_cooldown_hours` horas (6) en las corridas programadas. Una corrida manual la intenta igual.
- **Tareas programadas.** Vigilancia (cada 6 horas de fábrica) y barrido de duplicados (cada 24), con interruptor e intervalo en Configuración › Tareas programadas. La vigilancia programada encola solo las fuentes cuya frecuencia propia venció.

Conectores registrados (`backend/app/ingest/`): `clinicaltrials` (ClinicalTrials.gov API v2), `ctis`, `ema`, `fda` (openFDA), `health_canada`, `pcori_hs`, `pubmed`, `who_ictrp`, `file_feed` (CSV o XLSX), `manual` (curaduría humana) y `fixture` (pruebas). Las fuentes sin conector usan el rastreador genérico `html` o `pdf` (`scraper.py`).

### Rutas de acceso a una fuente web

El rastreador prueba las rutas en este orden y registra cuál funcionó (`scraper._fetch_url`, `scraper.fallback_urls`, `scraper.access_route`, `access_routes.py`):

| Orden | Ruta | Cuándo se usa |
|---|---|---|
| 1 | Cliente HTTP normal (`httpx`) | Siempre primero |
| 2 | Cliente compatible con navegador (`curl_cffi`) | Si la respuesta es 401, 403, 406, 429, 503, no hay respuesta, o el HTML es un cascarón o un aviso de bloqueo, y la ruta está disponible |
| 3 | URL de entrada de la matriz EH | Si la URL principal falló (hasta tres rutas de la fila) |
| 4 | RSS oficial del sitio | Para los dominios con canal conocido (`FEED_FALLBACKS`) |
| 5 | Índice oficial de la revista en PubMed | Para NEJM, The Lancet, BMJ, BMJ Innovations, JAMA y Cochrane, mediante las E-utilities de NCBI: lo publicado en los últimos 120 días, con título, resumen y enlace |
| 6 | RSS de Google News | Último respaldo: lo publicado en el dominio en los últimos 90 días |

Sobre el **cliente compatible con navegador**:

- Repite la descarga con el saludo TLS y HTTP/2 de un navegador corriente. No resuelve captchas ni inicia sesión, y solo se usa en páginas públicas.
- Viene **apagado de fábrica**. Se enciende en **Configuración › Parámetros de fuentes**, con el interruptor **«Acceso con cliente compatible con navegador»**. Encenderlo es decisión del IETS según las condiciones de uso de las fuentes.
- El servidor puede prohibirlo del todo con `BROWSER_FETCH_ENABLED=false`. También queda inactivo si `curl_cffi` no está instalado.
- Respeta `robots.txt`: si el sitio no permite la URL, la ruta no se usa.
- Un sitio que solo respondió por esta ruta se recuerda durante 6 horas y sus páginas siguientes van directo por ella.

**La sonda ya no suspende una fuente web.** Para las fuentes de nivel A o B, el trabajo verifica primero la salud de la fuente. Si la sonda sale en ámbar o rojo y la fuente se lee con el rastreador web, se deja la nota en el avance y el rastreo se intenta igual por las rutas de acceso (`ingest_service._run_job`). Antes, un 403 en la sonda dejaba la fuente sin leer. En las fuentes con conector de API, una sonda en ámbar o rojo sí detiene la ingesta.

### Avance e informe de acceso

Durante la corrida, la pantalla Vigilancia consulta `GET /api/ingest/progress`: etapa de cada fuente, ruta por la que entró, código HTTP, páginas visitadas, intentos de acceso, porcentaje de la corrida y tiempo estimado (`scan_progress.py`, `scan_eta.py`). El detalle en vivo está en memoria del proceso; el resultado final de cada fuente se guarda para el informe.

El **«Informe de acceso por fuente»** (`GET /api/ingest/access-report`) es una tarjeta plegable. Durante la corrida su encabezado dice **«Ver informe en tiempo real»**. Clasifica el último resultado de cada fuente:

| Desenlace | Significado |
|---|---|
| Entró a la fuente | Leyó el sitio (con el cliente normal, el compatible con navegador o una ruta de la matriz) y encontró señales |
| Entró por una ruta de respaldo | Entró por RSS oficial, índice de PubMed o Google News |
| Entró, pero no encontró señales | Hubo acceso y la extracción no dio resultados |
| Entró, pero la extracción falló | Hubo acceso y el trabajo terminó con error |
| No pudo entrar | Ninguna ruta respondió; el mensaje lista cada ruta probada y su resultado |
| En curso / Sin ejecutar | Trabajo pendiente o fuente que aún no se ha corrido |

### Historial de vigilancias

Cada corrida, manual o programada, deja una fila en `scheduled_runs` (`scheduler_service.record_manual_scan`, `finalize_scan_runs`, `scan_history`). `GET /api/ingest/runs` devuelve, por corrida: fecha y hora de inicio y de fin, duración, estado, alcance (todas las fuentes activas, fuentes seleccionadas o fuentes con frecuencia vencida), origen (manual o programada), quién la lanzó, fuentes totales y pendientes, fuentes por desenlace de acceso, las que fallaron con su mensaje, y señales detectadas y nuevas.

- La corrida termina a la hora en que terminó su última fuente.
- Si ya hay una corrida manual abierta, las fuentes que se lancen después se suman a ella.
- Las corridas manuales no mueven el reloj de la vigilancia programada.

En la pantalla Vigilancia, bajo el botón «Ejecutar vigilancia», aparece **«Última realizada»** con fecha, hora y duración, y más abajo la tarjeta **«Historial de vigilancias»**; al pulsar una fila se abre su resumen (`frontend/src/pages/Scan.jsx`, `frontend/src/components/ScanProgress.jsx`).

---

## Inteligencia del sistema

Se parametriza en **Configuración › Inteligencia** y cada cambio queda en la bitácora. Nada decide por el evaluador: el sistema sugiere, explica y aprende de lo que la persona confirma (`backend/app/intelligence.py`).

### Modelos

La pantalla muestra la **ficha de modelos** (`intelligence.model_card`, `frontend/src/components/ModelCard.jsx`), armada con el estado real del sistema y descargable en JSON:

| Pieza | Tipo | Cómo aprende | Cifras que muestra |
|---|---|---|---|
| Reglas del catálogo | Sistema experto de reglas, determinista | No aprende: aplica las palabras clave, códigos CIE-10 y términos MeSH que el equipo mantiene en Gobierno metodológico | Acierto medido en clúster y en tipología |
| Clasificador que aprende | Vecinos más cercanos (k-NN) sobre texto: TF-IDF y similitud coseno | Aprendizaje incremental por ejemplos: cada clasificación o descarte entra a la base de conocimiento y cuenta desde la siguiente sugerencia. Sin entrenamiento por lotes ni pesos ocultos | Señales en la base, ejemplos clasificados y descartados, vocabulario, vecinos (k), umbrales, acierto medido |
| Calibración | Validación cruzada dejando una fuera (*leave-one-out*) | Mide el acierto de cada método con las clasificaciones del equipo y ajusta k y la confianza mínima | Última calibración, señales evaluadas, precisión objetivo y si se cumplió |
| IA generativa | Modelo de lenguaje (LLM) preentrenado, consultado por API: MiniMax o Gemini | **No se entrena ni se reajusta con datos del IETS.** En cada consulta recibe como contexto los ejemplos del equipo y el prompt configurado | Proveedor, modelos, cuándo clasifica, consultas y tokens consumidos |

**Regla de decisión** de una sugerencia:

1. Si reglas y aprendizaje coinciden, se propone ese valor y la confianza sube.
2. Si no coinciden, gana el aprendizaje solo cuando su confianza llega al mínimo configurado; si no, quedan las reglas.
3. La IA interviene según el modo: `nunca`, `desacuerdo` (solo cuando hay duda) o `siempre`. Su respuesta se muestra con su razón.
4. La decisión final es del evaluador.

### Trazabilidad

Cada sugerencia se registra en la bitácora con la acción `intelligence:suggest`. La ficha lista las últimas (`intelligence.suggestion_trace`): fecha y hora, señal, clúster y tipología sugeridos, método, confianza y qué decidió el equipo. Los cambios de parámetros quedan como `intelligence:config`.

### Otras piezas

- **Base de conocimiento de señales** (tabla `signal_knowledge`): un documento por tecnología capturada, con su origen y la decisión del equipo. Se sincroniza sola y se puede reconstruir.
- **Marco analítico** (`analytics_insights.py`), descrito en [Análisis y seguimiento](#análisis-y-seguimiento).
- **Vigencia por año** (`signal_window.py`): rango de años de publicación, general o por fuente, con vista previa antes de aplicarlo.
- **Base de conocimiento de búsqueda** (tabla `search_knowledge`, `search_knowledge.py`): páginas útiles de cada fuente, sembradas desde `backend/app/data/base_busqueda_eh.json`.

Parámetros de fábrica (`intelligence.DEFAULTS`): aprendizaje encendido, IA en modo `desacuerdo`, 7 vecinos, parecido mínimo 0,12, confianza mínima 0,55, precisión objetivo 0,80, parecido para avisar de un descarte 0,60, 6 ejemplos en el prompt, calibración automática cada 25 clasificaciones, lectura analítica con IA conservada 12 horas.

Límites: el clasificador empieza a votar con 5 señales clasificadas y la calibración exige 20. El parecido es léxico, no semántico: dos textos en idiomas distintos se parecen poco. Sin IA, el sistema sigue completo con reglas y aprendizaje.

---

## Perfiles y permisos

Cinco perfiles definidos en `backend/app/rbac.py`. Los roles heredados se resuelven por alias: `admin` → `superadmin`, `editor` → `evaluador_tecnico`, `viewer` → `tomador_decisiones`.

| Perfil | Código | Qué hace |
|---|---|---|
| Superadministrador | `superadmin` | Control total: usuarios, configuración, catálogos, bitácora y cierre de ciclos. Puede calificar los seis criterios |
| Evaluador técnico | `evaluador_tecnico` | Opera vigilancia, bandeja de entrada, filtrado y ciclos; sincroniza el índice INVIMA; califica P1, P5 y P6 |
| Evaluador clínico | `evaluador_clinico` | Opera vigilancia, bandeja de entrada y filtrado; redacta informes; califica P2, P3 y P4 |
| Tomador de decisiones | `tomador_decisiones` | Consulta el sistema y los tableros restringidos; escribe notas |
| Revisor por pares | `revisor_pares` | Consulta y registra revisiones. El experto externo no necesita cuenta: entra con el enlace de la invitación |

| Permiso | Superadmin | Ev. técnico | Ev. clínico | Tomador | Revisor |
|---|:-:|:-:|:-:|:-:|:-:|
| `read` (consultar) | Sí | Sí | Sí | Sí | Sí |
| `source:write` (editar fuentes) | Sí | Sí | Sí | | |
| `scan:run` (ejecutar vigilancia) | Sí | Sí | Sí | | |
| `staging:assign` (asignar al ciclo) | Sí | Sí | Sí | | |
| `technology:write` (editar tecnologías) | Sí | Sí | Sí | | |
| `screening:write` (filtrar) | Sí | Sí | Sí | | |
| `report:write` (redactar informes) | Sí | Sí | Sí | | |
| `note:write` (escribir notas) | Sí | Sí | Sí | Sí | |
| `cycle:write` (gestionar ciclos) | Sí | Sí | | | |
| `invima:sync` (sincronizar INVIMA) | Sí | Sí | | | |
| `priority:rate:tecnico` (P1, P5, P6) | Sí | Sí | | | |
| `priority:rate:clinico` (P2, P3) | Sí | | Sí | | |
| `priority:rate:p4` (P4) | Sí | | Sí | | |
| `review:submit` (revisar por pares) | Sí | | | | Sí |
| `analytics:restricted` (tableros restringidos) | Sí | | | Sí | |
| `cycle:close`, `catalog:write`, `audit:read`, `user:manage`, `config:manage` | Sí | | | | |

El superadministrador puede usar **«Ver como»** para operar con los permisos de otro perfil. El perfil simulado viaja en la cabecera `X-Acting-Role`, no se guarda en la base y solo reduce permisos.

Inicio de sesión: correo y contraseña (cuentas creadas por el superadministrador, con bloqueo tras intentos fallidos y cambio obligatorio de la contraseña temporal), Google para el dominio institucional si hay `GOOGLE_CLIENT_ID`, y acceso de desarrollo sin contraseña, que nunca opera en producción.

---

## API

La documentación interactiva está en `/docs` (OpenAPI) con el servidor en marcha. Hay 27 módulos de rutas en `backend/app/routers/`.

| Prefijo | Módulo | Qué cubre |
|---|---|---|
| `/api/health` | `main.py` | Estado del servicio, versión y estado de la copia |
| `/api/status`, `/api/realtime/version` | `system.py` | Estado del sistema y versión del estado para refrescar pantallas |
| `/api/auth` | `auth.py` | Inicio de sesión (contraseña, Google, desarrollo), cambio de contraseña, perfil actual y «Ver como» |
| `/api/users` | `users.py` | Cuentas, perfiles, permisos, restablecer y desbloquear |
| `/api/audit` | `audit.py` | Consulta de la bitácora y vida de un registro |
| `/api/config` | `config.py` | IA, prompts, parámetros de fuentes, búsqueda web, trazas de escaneo, consumo, tareas programadas y reglas de horizonte |
| `/api/backup` | `backup.py` | Copia en Firestore, puntos de recuperación, exportar y restaurar |
| `/api/clusters`, `/api/tech-types`, `/api/methodology` | `catalogs.py` | Catálogos y parámetros metodológicos |
| `/api/cycles` | `cycles.py` | Ciclos, cambio de estado, verificación de cierre y arrastre |
| `/api/sources` | `sources.py` | Catálogo de fuentes, matriz (importar, comparar, aplicar), alta rápida, descubrimiento, consulta manual y exportación |
| `/api/scan` | `scan.py` | Lanzar la vigilancia (todas o una fuente), vista previa de un enlace y registros de rastreo |
| `/api/ingest` | `ingest.py` | Cola, avance, historial (`/runs`), informe de acceso, cancelación, sondas de salud, cobertura, dato crudo y reprocesamiento |
| `/api/findings` | `findings.py` | Señales y sus enlaces: reporte, verificación, ubicación y diagnóstico |
| `/api/technologies` | `technologies.py` | Buscador, bandeja de entrada, asignación al ciclo, sugerencia de clasificación, confiabilidad y cambios de estado en el ciclo |
| `/api/submissions`, `/api/public/submissions` | `submissions.py` | Formulario público y moderación de postulaciones |
| `/api/screening` | `screening.py` | Duplicados, novedad, cruce INVIMA, normalización y Listado Único |
| `/api/invima` | `invima.py` | Estado, búsqueda y sincronización del índice INVIMA |
| `/api/priority` | `priority.py` | Criterios, cola de calificación y calificación P1 a P6 |
| `/api/reports` | `evaluation.py` | Expedientes de evaluación: versiones, transiciones, invitaciones, comentarios y exportación |
| `/api/public/reviews` | `review_portal.py` | Portal del revisor externo por token |
| `/api/recommendations` | `recommendations.py` | Informes de diseminación y paquete ZIP del ciclo |
| `/api/strategy`, `/api/bulletins`, `/api/alerts` | `strategy.py` | Tablero estratégico, grafos, boletines y alertas |
| `/api/public` | `public_catalog.py` | Catálogo y ficha pública, cifras de transparencia |
| `/api/dashboard` | `dashboard.py` | Indicadores de la bandeja de trabajo y pendientes del perfil |
| `/api/notes` | `notes.py` | Notas del equipo |
| `/api/chat` | `chat.py` | Asistente IA y asistente de navegación |
| `/api/intelligence` | `intelligence.py` | Estado (incluye ficha de modelos y traza), parámetros, base de conocimiento, calibración, marco analítico y vigencia por año |
| `/api/search-knowledge` | `search_knowledge.py` | Base de conocimiento de búsqueda: consulta, cobertura, exportar e importar |

Las respuestas de `/api/` llevan `Cache-Control: no-store`. El servidor añade cabeceras de seguridad (política de contenido, `X-Frame-Options`, HSTS en producción) y un identificador `X-Request-ID` por petición.

---

## Idiomas de la interfaz

La interfaz está en español, inglés británico (`en-GB`) e inglés americano (`en-US`); el selector está en la cabecera, en el ingreso y en las pantallas públicas. El español es el idioma de origen y la llave de cada texto (`t("Guardar cambios")`); los diccionarios de inglés están en `frontend/src/i18n/locales/en/` y la ortografía británica se deriva del americano. El contenido capturado y los documentos exportados no se traducen.

Reglas para agregar textos, glosario y formato de los diccionarios: [`frontend/src/i18n/README.md`](frontend/src/i18n/README.md). Verificación: `node scripts/i18n-check.mjs` desde `frontend/`.

## Pruebas

Ninguna suite necesita ni debe usar los datos de producción. Las pruebas automáticas no llaman al proveedor de IA real.

### Backend (pytest)

`pytest` no está en `requirements.txt`; la CI instala `pytest==9.1.1`.

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
pip install "pytest==9.1.1"
python -m pytest -q
python -m pytest tests/test_entrega_final.py -q     # lo nuevo de esta entrega
```

Hay 61 archivos `test_*.py` en `backend/tests/`. `test_entrega_final.py` cubre las rutas de acceso, que la sonda en rojo no detiene una fuente web, el historial de vigilancias y la ficha de modelos.

### Navegador (Playwright)

```powershell
cd frontend
npm run build
npx playwright test
```

Sin `E2E_BASE_URL`, la configuración levanta su propio backend en el puerto 8799 con una base SQLite temporal, acceso de desarrollo, worker apagado, IA apagada y `FIREBASE_DB_ENABLED=false`. Usa el Python de `backend\.venv` (o el de `E2E_PYTHON`) y el Chrome instalado. Para usar Chromium de Playwright:

```powershell
npx playwright install chromium
$env:E2E_CHANNEL = "chromium"; npx playwright test
```

`E2E_BASE_URL=http://127.0.0.1:8000` ejecuta las pruebas contra una instancia ya levantada; esa instancia debe ser de pruebas. El reporte queda en `frontend/e2e-report`.

### Regresión de la API (smoke)

Con un servidor de pruebas en marcha (base propia y `FIREBASE_DB_ENABLED=false`; la suite crea datos):

```powershell
cd backend
.\.venv\Scripts\python.exe smoke_test.py --base http://127.0.0.1:8000 --skip-network
```

`--skip-network` omite las pruebas que salen a internet.

### Integración continua

`.github/workflows/ci.yml` corre en cada *pull request* y en cada *push* a `main`: pytest y Alembic sobre SQLite, migraciones reales en PostgreSQL 15, compilación del frontend, Playwright, `smoke_test.py` y construcción de la imagen Docker.

---

## Migraciones de base de datos

El esquema se versiona con Alembic (`backend/alembic/versions/`). Al arrancar, `migrations.upgrade_database()` resuelve los tres casos: base vacía (la crea), base anterior a Alembic (la completa y la marca en la revisión base) y base ya versionada (aplica lo pendiente). En PostgreSQL la migración se serializa con un candado consultivo.

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m app.migrations              # migra y muestra la revisión
python -m app.migrations --bootstrap  # además ejecuta una vez el arranque completo (siembras), sin worker
python -m alembic upgrade head        # Alembic directo
```

| Revisión | Contenido |
|---|---|
| `0001_baseline` | Esquema completo de partida |
| `0002_source_matrix_profile` | Campos de la matriz EH y flujo de escaneo por fuente |
| `0003_technology_reliability` | Dictamen de confiabilidad de la señal |
| `0004_product_details_corroboration` | Datos de producto, corroboración entre fuentes y campos editados |
| `0005_signal_links` | Enlace de la señal a su fuente original |
| `0006_technology_legacy` | Marca de señales de fuentes del inventario anterior |
| `0007_submission_cross_check` | Cruce de postulaciones con la vigilancia y la web |
| `0008_search_knowledge` | Base de conocimiento de búsqueda |
| `0009_signal_knowledge` | Base de conocimiento de señales |

Esta entrega no añade revisiones: el historial de vigilancias usa la tabla `scheduled_runs` existente, y el informe de acceso y el interruptor del cliente compatible con navegador se guardan como parámetros en la base.

---

## Comandos de administración (CLI)

Desde `backend/`, con el entorno activo (`backend/app/cli.py`). Cada acción queda en la bitácora como ejecutada por `cli`.

```powershell
# Crea o promueve un superadministrador. Sin --password genera una temporal que se muestra una vez
python -m app.cli create-admin --email <correo> --name "<Nombre Apellido>"
python -m app.cli create-admin --email <correo> --password -      # la pide sin eco
python -m app.cli create-admin --email <correo> --password <clave> --force-change

# Asigna una contraseña temporal a una cuenta existente
python -m app.cli reset-password --email <correo>

# Lista las cuentas con su perfil y estado
python -m app.cli list-users

# Valida la configuración del entorno; sale con código 1 si es insegura para producción
python -m app.cli check-config

# Crea o verifica la base de Firestore. --probe escribe y borra un documento; --push publica la base local
python -m app.cli ensure-firebase-db --probe
```

`ensure-firebase-db --push` sube la base SQLite local a la colección configurada, forzando la subida. No debe ejecutarse desde un equipo que resuelva a la colección de producción.

---

## Estructura del repositorio

```
Sis_HS_IETS/
├── backend/
│   ├── alembic/                  # env.py y versions/ (0001 a 0009)
│   ├── app/
│   │   ├── main.py               # FastAPI: arranque, middlewares, routers y servicio de la SPA
│   │   ├── config.py             # Variables de entorno (pydantic-settings)
│   │   ├── database.py           # Motor, sesión, blindaje de audit_log
│   │   ├── models.py             # Modelos ORM
│   │   ├── schemas.py            # Esquemas de entrada y salida
│   │   ├── rbac.py, deps.py, security.py, audit.py   # Perfiles, dependencias, contraseñas y bitácora
│   │   ├── migrations.py         # Adopción y ejecución de Alembic
│   │   ├── cli.py                # Comandos de administración
│   │   ├── worker.py             # Worker de la cola, vigilante y keep-alive
│   │   ├── ingest_service.py     # Cola de ingesta, tiempo máximo, circuito y sonda
│   │   ├── scheduler_service.py  # Tareas programadas e historial de vigilancias
│   │   ├── scraper.py            # Rastreador web y rutas de respaldo
│   │   ├── access_routes.py      # Cliente compatible con navegador e índice de PubMed
│   │   ├── scan_progress.py, scan_eta.py, scan_trace.py   # Avance, estimación y traza
│   │   ├── probe_service.py      # Sonda de salud de las fuentes
│   │   ├── link_matrix.py, source_matrix.py, catalog_service.py   # Inventario de fuentes
│   │   ├── source_profile.py     # Parámetros de fuentes y flujo de escaneo
│   │   ├── signal_links.py, link_resolver.py, evidence_locator.py # Enlaces y evidencia de las señales
│   │   ├── intelligence.py       # Base de conocimiento, clasificador, calibración, ficha y traza
│   │   ├── analytics_insights.py # Marco analítico
│   │   ├── signal_window.py, search_knowledge.py
│   │   ├── dedup.py, screening_service.py, invima.py, normalization.py
│   │   ├── priority_engine.py, priority.py
│   │   ├── evaluation.py, evaluation_service.py
│   │   ├── dissemination_service.py, pdf_export.py, report_html.py, xlsx_report.py
│   │   ├── strategy_service.py, graph_service.py, ttm.py
│   │   ├── ai_service.py, minimax_service.py, gemini_service.py, prompt_store.py, usage_meter.py
│   │   ├── firebase_db.py, firebase_auth.py, firestore_directory.py, browser_backup.py
│   │   ├── data/                 # matriz_enlaces_eh.json, matriz_fuentes_eh.json, base_busqueda_eh.json
│   │   ├── ingest/               # Conectores de fuentes con API
│   │   └── routers/              # 27 módulos de rutas
│   ├── scripts/build_search_knowledge.py
│   ├── tests/                    # pytest (incluye fixtures/)
│   ├── smoke_test.py             # Regresión contra la API en ejecución
│   ├── requirements.txt
│   ├── alembic.ini
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── App.jsx, main.jsx     # Rutas y proveedores
│   │   ├── api/, auth/, cycle/, realtime/, backup/, scan/, ai/, graph/, utils/
│   │   ├── components/           # ScanProgress, ModelCard, IntelligencePanel, SourceParamsPanel, Layout…
│   │   ├── constants/            # navigation.js (menú), glossary.js, methodology.js, paramInfo.js
│   │   ├── pages/                # Una pantalla por módulo
│   │   └── styles/               # globals.css, shell.css, ui.css, horizon.css, theme.js
│   ├── e2e/                      # Pruebas de Playwright
│   ├── playwright.config.js
│   ├── vite.config.js
│   └── package.json
├── deploy/                       # docker-entrypoint.sh, Caddyfile, backup.sh, backup.ps1, .env.production.example
├── .github/workflows/            # ci.yml, keepalive.yml
├── Dockerfile
├── docker-compose.yml
├── render.yaml
├── start.ps1
├── start-prod.ps1
└── README.md
```

---

## Flujo de ramas

- El trabajo se hace en una rama propia, `feat/…` o `fix/…`, y se integra con *pull request* a **`develop`**.
- **`main` despliega en Render** (`autoDeploy: true` en `render.yaml`). No se hace *push* directo a `main`: solo recibe cambios ya integrados, por *pull request*.
- Cada *pull request* pasa por la integración continua descrita en [Pruebas](#pruebas).

---

## Documentación relacionada

- [`GUIA_USUARIO.md`](GUIA_USUARIO.md): guía de uso por pantalla. También en PDF: [`Guia_Usuario_Escaneo_Horizonte_IETS.pdf`](Guia_Usuario_Escaneo_Horizonte_IETS.pdf).
- [`DEPLOY.md`](DEPLOY.md): despliegue en producción, HTTPS, worker, migraciones, respaldo y restauración, copia en Firestore, monitoreo y reversión.
- [`NOTAS_DESARROLLADOR.md`](NOTAS_DESARROLLADOR.md): notas técnicas por requerimiento.
- [`BACKLOG.md`](BACKLOG.md): requerimientos y decisiones de diseño.
- [`linea-grafica-y-ux-ui.md`](linea-grafica-y-ux-ui.md): línea gráfica y reglas de interfaz.
- [`Plan_Fases_Actualizacion_Plataforma_EH_IETS.md`](Plan_Fases_Actualizacion_Plataforma_EH_IETS.md): plan de fases de la plataforma.
- [`Catalogo_Fuentes_Proactivas_Verificadas_EH_IETS.md`](Catalogo_Fuentes_Proactivas_Verificadas_EH_IETS.md): catálogo verificado de fuentes proactivas.
- [`Comparacion_Requerimientos_Validacion_SI_Escaneo_Horizonte.md`](Comparacion_Requerimientos_Validacion_SI_Escaneo_Horizonte.md): comparación de requerimientos y validación.
