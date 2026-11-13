# Sistema de Escaneo de Horizonte del IETS

Plataforma integral para el **escaneo de horizonte (horizon scanning)** del **Instituto de Evaluación Tecnológica en Salud (IETS)** de Colombia: identificación temprana de tecnologías sanitarias emergentes, vigilancia automatizada de referentes internacionales, postulación ciudadana con control de conflicto de intereses, depuración y desduplicación difusa, cruce regulatorio con INVIMA, priorización mediante la matriz oficial del Manual Metodológico (%P), caracterización técnica, evaluación temprana con revisión por pares, diseminación asistida por IA y bitácora inmutable de auditoría bajo un esquema de control de acceso basado en roles (RBAC).

Inspirado en el modelo operativo del [NIHR Innovation Observatory](https://io.nihr.ac.uk/) y construido respetando la línea gráfica institucional formalizada en [`linea-grafica-y-ux-ui.md`](linea-grafica-y-ux-ui.md).

---

## Índice

1. [Nombre y descripción del proyecto](#nombre-y-descripción-del-proyecto)
2. [Tecnologías utilizadas](#tecnologías-utilizadas)
3. [Requisitos previos](#requisitos-previos)
4. [Instalación](#instalación)
5. [Configuración (variables de entorno)](#configuración-variables-de-entorno)
6. [Cómo ejecutar el proyecto y las pruebas](#cómo-ejecutar-el-proyecto-y-las-pruebas)
7. [Estructura del proyecto](#estructura-del-proyecto)
8. [Flujo de la aplicación](#flujo-de-la-aplicación)
9. [Conceptos clave y metodología operativa](#conceptos-clave-y-metodología-operativa)
10. [Perfiles y matriz de permisos (RBAC)](#perfiles-y-matriz-de-permisos-rbac)
11. [Documentación relacionada](#documentación-relacionada)

---

## Nombre y descripción del proyecto

**Sistema de Escaneo de Horizonte del IETS (Sis_HS_IETS)**  
**Versión actual:** `7.0.0`

El sistema automatiza el ciclo de vida del monitoreo proactivo y reactivo de tecnologías sanitarias (medicamentos, dispositivos médicos, procedimientos, biológicos, salud digital) antes o durante su llegada al mercado y al Sistema General de Seguridad Social en Salud (SGSSS) de Colombia.

### Capacidades principales
- **Vigilancia proactiva multicanal:** Escaneo de 97 fuentes internacionales estructuradas en 6 bloques (agencias regulatorias, agencias de evaluación de tecnologías sanitarias - ETS, registros de ensayos clínicos, revistas científicas, organismos internacionales y portales de noticias). Incluye conectores nativos por API (ClinicalTrials.gov v2, openFDA, EMA, CTIS, PubMed, PCORI, Health Canada) y scraping web con respaldo de RSS oficial y Google News ante bloqueos antibot.
- **Canal reactivo externo:** Portal público de postulaciones (`/postular`) protegido por Google reCAPTCHA v3 y límite de tasa por IP, exigiendo declaración obligatoria de conflicto de interés (COI).
- **Procesamiento inteligente y corroboración:** Extracción automática de detalles de producto (forma farmacéutica, concentración, vía de administración, marca, modelo de dispositivo) y detección de tecnologías corroboradas en múltiples fuentes (bono ponderado para la bandeja de entrada).
- **Depuración y verificación regulatoria:** Motor de desduplicación difusa (Levenshtein, Jaro-Winkler, Token Sort) con soporte de emparejamiento decisivo por identificador NCT, normalización de vocabularios (ATC, CIE-10, MeSH, GMDN/EMDN) y cruce con copia local y consulta en vivo a bases de datos de INVIMA en `datos.gov.co`.
- **Priorización metodológica oficial %P:** Evaluación sobre 6 criterios binarios ponderados (P1 a P6) según el Manual Metodológico del IETS, calculando el indicador porcentual oficial `%P = (suma / 6) * 100` y asignando la clasificación en tres franjas (Priorizada ≥ 60 %, Bajo vigilancia 33–59 %, No priorizada < 33 %).
- **Evaluación temprana y revisión colegiada:** Elaboración de fichas técnicas, informes rápidos o Mini-HTA con control de versiones, revisión por pares internos y externos mediante token temporal sin cuenta requerida, y firma de COI previa.
- **Diseminación institucional:** Generación de expedientes, fichas públicas y boletines consolidados en **PDF nativo** mediante ReportLab, tablero estratégico con grafo interactivo de gobernanza, y exportación masiva de paquetes ZIP de diseminación.
- **Gobernanza y auditoría:** Registro inmutable append-only con triggers/permisos a nivel de motor de BD y middleware HTTP que audita cada mutación asociando usuario, IP, ruta, payload anterior y nuevo.

---

## Tecnologías utilizadas

| Tecnología | Versión | Uso en el proyecto |
|---|---|---|
| **Python** | `3.12` / `3.13` | Lenguaje de programación del backend |
| **FastAPI** | `0.115.6` | Framework web asíncrono para la construcción de la API REST |
| **Uvicorn** | `0.34.0` | Servidor ASGI para ejecución de la API |
| **SQLAlchemy** | `2.0.36` | ORM para modelado de datos y abstracción relacional |
| **Alembic** | `1.19.2` | Control de versiones y migraciones de la base de datos |
| **PostgreSQL** | `15` | Base de datos relacional para entornos de producción |
| **psycopg (psycopg 3)** | `3.3.5` | Driver de conexión nativa a PostgreSQL |
| **SQLite** | `3` | Motor de base de datos embebido por defecto para desarrollo local |
| **Pydantic** | `2.10.4` | Validación de datos, esquemas de entrada/salida y serialización |
| **Pydantic-Settings** | `2.7.1` | Gestión y validación de variables de entorno |
| **RapidFuzz** | `3.14.6` | Algoritmos de similitud de cadenas (Levenshtein, Jaro-Winkler, Token Sort) |
| **ReportLab** | `4.2.5` | Generación nativa de documentos PDF (expedientes, boletines, fichas) |
| **HTTPX** | `0.28.1` | Cliente HTTP asíncrono y síncrono para conectores y scraping web |
| **Requests** | `2.32.3` | Cliente HTTP para descargas y sincronización con Socrata / INVIMA |
| **BeautifulSoup4** | `4.12.3` | Parsing de páginas HTML durante la vigilancia proactiva |
| **Lxml** | `6.1.1` | Procesador XML/HTML de alto rendimiento para BeautifulSoup |
| **Trafilatura** | `2.1.0` | Extracción de texto estructurado y metadatos de páginas web |
| **PyPDF / PyPDFium2** | `6.14.2` / `4.30.0` | Lectura, extracción y renderizado de documentos PDF |
| **Pillow** | `11.3.0` | Procesamiento de imágenes para el módulo OCR |
| **OpenPyXL** | `3.1.5` | Lectura y escritura de hojas de cálculo Excel (.xlsx) |
| **Python-Jose** | `3.3.0` | Criptografía, generación y validación de JSON Web Tokens (JWT) |
| **Google Generative AI** | `0.8.3` | SDK oficial de Gemini (IA de respaldo) |
| **MiniMax HTTP API** | API REST v1 | Proveedor principal de Inteligencia Artificial (MiniMax-M3 / M3.1) |
| **Google Firestore** | API v1 | Directorio institucional de RRHH y respaldo de snapshots de la BD |
| **React** | `18.3.1` | Biblioteca de UI para la interfaz de usuario en el frontend |
| **Vite** | `5.4.11` | Herramienta de compilación y servidor de desarrollo para la SPA |
| **React Router DOM** | `6.28.0` | Enrutamiento del lado del cliente y control de vistas |
| **Recharts** | `2.13.3` | Biblioteca de gráficos analíticos para tableros estratégicos |
| **Axios** | `1.7.9` | Cliente HTTP en el frontend para comunicación con la API |
| **Playwright** | `1.49.1` | Framework de pruebas de navegador E2E |
| **Docker / Docker Compose** | — | Empaquetado en contenedor y orquestación con PostgreSQL y Caddy |

---

## Requisitos previos

Para desplegar y ejecutar el proyecto localmente o en un servidor, se requiere:

1. **Python:** Versión `3.12` recomendada (o `3.13` con entorno virtual). En sistemas Windows, se puede invocar como `python` o mediante el lanzador `py`.
2. **Node.js y npm:** Node.js versión `18.x`, `20.x` o `24.x` (en Dockerfile se utiliza Node `24`) y `npm` versión `9.x` o superior.
3. **Git:** Para clonar el repositorio y gestionar ramas.
4. **PostgreSQL 15:** (Opcional para desarrollo, recomendado para producción). Si no se configura `DATABASE_URL`, el backend utilizará SQLite automáticamente.
5. **Docker y Docker Compose:** (Opcional) Si se prefiere desplegar la solución completa en contenedores.

---

## Instalación

### Opción A: Instalación manual (Desarrollo)

#### 1. Clonar el repositorio
```bash
git clone https://github.com/FerneyBarbosa/Sis_HS_IETS.git
cd Sis_HS_IETS
```

#### 2. Configurar el Backend (Python)
```bash
cd backend

# Crear entorno virtual
python -m venv .venv

# Activar entorno virtual
# En Windows (PowerShell):
.\.venv\Scripts\Activate.ps1
# En Linux / macOS:
source .venv/bin/activate

# Actualizar pip e instalar dependencias
python -m pip install --upgrade pip
pip install -r requirements.txt

# Configurar variables de entorno
cp .env.example .env
```

#### 3. Configurar el Frontend (React + Vite)
```bash
cd ../frontend

# Instalar dependencias de Node
npm install
```

---

### Opción B: Arranque automático en Windows

El proyecto incluye un script de automatización en PowerShell que valida dependencias, crea el `.venv`, instala librerías, compila el frontend e inicia el servidor unificado:

```powershell
.\start.ps1
```

---

## Configuración (variables de entorno)

El archivo de configuración principal se ubica en `backend/.env`. Copie `backend/.env.example` y ajuste las variables según el entorno:

### Variables de entorno reconocidas

| Variable | Tipo / Defecto | Descripción |
|---|---|---|
| `ENVIRONMENT` | `development` | `development`, `testing` o `production`. En producción se exige `SECRET_KEY` segura y se bloquea el acceso de desarrollo. |
| `SECRET_KEY` | *Cadena* | Clave para firma de JWT. En producción debe tener mínimo 32 caracteres generados aleatoriamente. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `720` | Duración del token de sesión en minutos (12 horas). |
| `PASSWORD_MIN_LENGTH` | `10` | Longitud mínima para contraseñas de usuarios locales. |
| `LOGIN_MAX_ATTEMPTS` | `5` | Intentos fallidos permitidos antes de bloquear temporalmente una cuenta. |
| `LOGIN_LOCKOUT_MINUTES` | `15` | Tiempo de bloqueo en minutos tras exceder los intentos fallidos. |
| `GOOGLE_CLIENT_ID` | *Vacío* | OAuth 2.0 Client ID de Google Cloud Console (opcional para login con cuentas `@iets.org.co`). |
| `ALLOWED_EMAIL_DOMAIN` | `iets.org.co` | Dominio corporativo obligatorio para inicio de sesión con Google o desarrollo. |
| `ADMIN_EMAILS` | `admin@iets.org.co` | Lista de correos separados por coma que adquieren el rol `superadmin` al registrarse. |
| `ALLOW_DEV_LOGIN` | `true` | Habilita botón de acceso rápido sin contraseña en login. **Se ignora automáticamente si `ENVIRONMENT=production`**. |
| `DATABASE_URL` | `sqlite:///./iets_horizonte.db` | Cadena de conexión SQLAlchemy. Para PostgreSQL: `postgresql+psycopg://usuario:clave@host:5432/base`. |
| `CORS_ORIGINS` | *URLs locales* | Orígenes HTTP autorizados para peticiones cruzadas, separados por comas. |
| `FRONTEND_DIST` | `../frontend/dist` | Ruta absoluta o relativa al directorio con los estáticos compilados de la SPA. |
| `SEED_OFFICIAL_CYCLES` | *Dinámico* | `true` en desarrollo para precargar ciclos 2026; `false` en producción. |
| `AI_PROVIDER` | `auto` | Proveedor activo de IA: `auto` (detecta según llaves), `minimax`, `gemini` u `off`. |
| `MINIMAX_API_KEY` | *Embebida por defecto* | Llave de API internacional de MiniMax (api.minimax.io). |
| `MINIMAX_MODEL` | *Vacío* | Modelo MiniMax; vacío realiza detección automática (prioriza `MiniMax-M3`). |
| `GEMINI_API_KEY` | *Vacío* | Llave de Google AI Studio para IA de contingencia/respaldo. |
| `GEMINI_MODEL` | *Vacío* | Modelo de Gemini; vacío realiza detección automática. |
| `AI_WEB_ENABLED` | `true` | Permite que la IA navegue y extraiga información de páginas web enriquecidas. |
| `AI_OCR_ENABLED` | `false` | Activa reconocimiento óptico de caracteres para PDFs e imágenes escaneadas. |
| `INVIMA_LIVE_LOOKUP` | `true` | Si el registro local de INVIMA no coincide, consulta en vivo los conjuntos Socrata de `datos.gov.co`. |
| `OPENFDA_API_KEY` | *Vacío* | Llave de `api.data.gov` para aumentar límites de peticiones a openFDA. |
| `NCBI_API_KEY` | *Vacío* | Llave para consultas a PubMed E-utilities. |
| `NCBI_EMAIL` | `escaneo.horizonte@iets.org.co` | Correo institucional requerido para el pool de consultas de PubMed. |
| `INGEST_WORKER_ENABLED` | `true` | Activa el hilo del trabajador en segundo plano para colas de ingesta y vigilancia programada. |
| `INGEST_WORKER_INTERVAL_SECONDS` | `20` | Intervalo de sondeo del trabajador de ingesta en segundos. |
| `INGEST_WORKER_FORCE` | `false` | Fuerza la activación del worker de ingesta incluso con motor SQLite. |
| `RECAPTCHA_SECRET` | *Vacío* | Llave secreta de Google reCAPTCHA v3 para validación en backend del formulario `/postular`. |
| `RECAPTCHA_SITE_KEY` | *Vacío* | Llave de sitio de Google reCAPTCHA v3 entregada al frontend. |
| `RECAPTCHA_MIN_SCORE` | `0.5` | Puntaje mínimo de confianza (0.0 a 1.0) para admitir una postulación ciudadana. |
| `PUBLIC_SUBMISSIONS_PER_WINDOW`| `5` | Máximo número de postulaciones públicas permitidas por IP en una ventana de tiempo. |
| `PUBLIC_SUBMISSIONS_WINDOW_SECONDS`| `600` | Ventana de control de tasa para postulaciones públicas (en segundos). |
| `FIREBASE_PROJECT_ID` | `sistema-permisos-iets` | Proyecto GCP/Firebase para directorio RRHH y persistencia Firestore. |
| `FIREBASE_SERVICE_ACCOUNT_KEY`| *Vacío* | JSON con las credenciales de la cuenta de servicio de Google Cloud. |
| `FIREBASE_SERVICE_ACCOUNT_FILE`| *Vacío* | Ruta en disco al archivo JSON de la cuenta de servicio. |
| `FIREBASE_DB_ENABLED` | `true` | Habilita la replicación de instantáneas comprimidas de la base de datos en Firestore. |
| `FIREBASE_DB_DATABASE` | `hs-iets` | Base de datos específica de Firestore para Escaneo de Horizonte (no usar la base `(default)`). |
| `FIREBASE_DB_COLLECTION` | `hs_iets_db` | Colección donde se almacenan los snapshots. En desarrollo se añade el sufijo `_dev`. |
| `FIREBASE_DB_SHARE_WITH_PRODUCTION` | `false` | Permite que entornos no productivos accedan a la colección de producción (solo soporte). |
| `SMTP_HOST` | *Vacío* | Servidor de correo saliente para envío de invitaciones a revisores y alertas. |
| `SMTP_PORT` | `587` | Puerto del servidor SMTP (587 para STARTTLS, 465 para SSL). |
| `SMTP_USER` / `SMTP_PASSWORD` | *Vacío* | Credenciales de autenticación SMTP. |
| `SMTP_FROM` | `escaneo.horizonte@iets.org.co` | Remitente de los correos automáticos. |
| `SMTP_TLS` | `true` | Habilita cifrado STARTTLS en la conexión SMTP. |
| `PUBLIC_BASE_URL` | *Vacío* | URL base pública institucional para enlaces absolutos en correos (ej. `https://horizonte.iets.org.co`). |

---

## Cómo ejecutar el proyecto y las pruebas

### 1. Ejecución en modo desarrollo (recarga en caliente)

Se recomienda utilizar dos terminales:

**Terminal 1 — Backend:**
```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
La API estará accesible en `http://127.0.0.1:8000` y su documentación OpenAPI interactiva en `http://127.0.0.1:8000/docs`.

**Terminal 2 — Frontend:**
```powershell
cd frontend
npm run dev
```
La aplicación web Vite abrirá en `http://localhost:5173`.

---

### 2. Ejecución unificada (Producción local sin contenedores)

Si compila el frontend, el backend de FastAPI servirá tanto los endpoints de la API como la aplicación de página única (SPA):

```powershell
# Compilar el frontend
cd frontend
npm run build

# Iniciar servidor de producción en Windows
cd ..
.\start-prod.ps1
```

---

### 3. Ejecución mediante Docker y Docker Compose

El repositorio provee una configuración lista para entornos productivos con PostgreSQL 15, FastAPI y proxy inverso Caddy con HTTPS automático:

```bash
# Preparar variables de entorno de producción
cp deploy/.env.production.example deploy/.env.production
# Editar deploy/.env.production con las credenciales reales

# Construir imágenes e iniciar servicios
docker compose --env-file deploy/.env.production build
docker compose --env-file deploy/.env.production up -d

# Para incluir el proxy Caddy con certificados SSL automáticos:
docker compose --env-file deploy/.env.production --profile https up -d
```

---

### 4. Herramientas CLI administrativas

El backend incluye comandos de consola para aprovisionamiento y rescate (`backend/app/cli.py`):

```powershell
cd backend
.\.venv\Scripts\Activate.ps1

# Crear o actualizar un superadministrador inicial
python -m app.cli create-admin --email admin@iets.org.co --name "Administrador Sistema"

# Restablecer contraseña y generar token temporal
python -m app.cli reset-password --email evaluador@iets.org.co

# Listar usuarios, estados y perfiles en la base de datos
python -m app.cli list-users

# Validar integridad y seguridad de la configuración antes de desplegar
python -m app.cli check-config

# Verificar conectividad y realizar sonda sobre Firestore
python -m app.cli ensure-firebase-db --probe --push
```

---

### 5. Migraciones de Base de Datos (Alembic)

Las migraciones gestionan el esquema de forma versionada e idempotente:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1

# Ejecutar las migraciones pendientes hacia la última versión
python -m alembic upgrade head

# O utilizar el ejecutor integrado del sistema
python -m app.migrations
```

**Revisiones implementadas:**
1. `0001_baseline`: Estructura inicial completa (modelos v2 y v3).
2. `0002_source_matrix_profile`: Parámetros de la matriz EH de 97 fuentes en la entidad `sources`.
3. `0003_technology_reliability`: Trazabilidad y dictamen de confiabilidad (`technologies.reliability`).
4. `0004_product_details_corroboration`: Datos de producto (dosis, forma, vía, marca, modelo), corroboración cruzada entre fuentes (`corroboration_count`, `corroboration_bonus`) y bloqueo de sobreescritura de campos editados.

---

### 6. Ejecución de pruebas

#### Pruebas unitarias y de integración (Pytest)
```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m pytest -q
```
*Cubre motores de priorización, máquinas de estados de ciclos, desduplicación difusa, cruce INVIMA, conectores de ingesta, auditoría, RBAC y persistencia.*

#### Pruebas de navegador de extremo a extremo (Playwright)
```powershell
cd frontend
npm run build
npx playwright test
```
*Ejecuta escenarios en navegadores reales cubriendo navegación, autenticación, flujos por perfil de usuario, evaluación y validación responsive.*

#### Suite de regresión API (Smoke Test)
```powershell
cd backend
.\.venv\Scripts\Activate.ps1
# Con el servidor backend corriendo en http://127.0.0.1:8000:
python smoke_test.py --base http://127.0.0.1:8000 --skip-network
```

---

## Estructura del proyecto

```
Sis_HS_IETS/
├── backend/
│   ├── alembic/                    # Control de versiones de esquema con Alembic
│   │   ├── env.py                  # Configuración del entorno de migración
│   │   └── versions/               # Revisiones versionadas (0001 a 0004)
│   ├── app/
│   │   ├── main.py                 # Punto de entrada FastAPI, middlewares y montaje de SPA
│   │   ├── config.py               # Settings validados mediante Pydantic
│   │   ├── models.py               # Modelos relacionales ORM (SQLAlchemy)
│   │   ├── database.py             # Conexión relacional (SQLite / PostgreSQL)
│   │   ├── audit.py                # Middleware y listeners de auditoría append-only
│   │   ├── rbac.py                 # Definición de roles, permisos y autorización
│   │   ├── deps.py                 # Dependencias inyectables (seguridad, permisos)
│   │   ├── methodology.py          # Catálogos maestros, estados y parámetros metodológicos
│   │   ├── cycle_service.py        # Máquina de estados y reglas de negocio de ciclos
│   │   ├── priority_engine.py      # Motor de cálculo de la matriz oficial %P (P1-P6)
│   │   ├── priority.py             # Cálculo del screening_score de señales
│   │   ├── technology_service.py   # Gestión del ciclo de vida de la entidad Technology
│   │   ├── corroboration.py        # Detección de corroboración multifuente (RF-002)
│   │   ├── product_details.py      # Extracción estructurada de datos de producto (RF-003)
│   │   ├── reprocess_service.py    # Reprocesamiento histórico de datos crudos
│   │   ├── classification.py       # Heurísticas de sugerencia de clúster y tipología
│   │   ├── screening_service.py    # Fusión de duplicados, novedad y Listado Único
│   │   ├── dedup.py                # Motor de similitud difusa (RapidFuzz)
│   │   ├── invima.py               # Sincronización y consulta del registro INVIMA
│   │   ├── normalization.py        # Normalización de códigos ATC, CIE-10, MeSH, GMDN
│   │   ├── scraper.py              # Motor de scraping y extracción web con fuentes de respaldo
│   │   ├── source_matrix.py        # Lector del catálogo Excel de la Matriz EH
│   │   ├── source_profile.py       # Perfiles de escaneo y configuración por fuente
│   │   ├── web_search.py           # Consultas web automatizadas de apoyo
│   │   ├── probe_service.py        # Sonda de salud y disponibilidad de fuentes
│   │   ├── pdf_export.py           # Generación de reportes PDF institucionales (ReportLab)
│   │   ├── firebase_auth.py        # Autenticación y credenciales de Google Service Account
│   │   ├── firebase_db.py          # Sincronización de snapshots con Firestore
│   │   ├── firestore_directory.py  # Resolución de identidades institucionales vía Firestore
│   │   ├── browser_backup.py       # Copias de seguridad locales en navegador
│   │   ├── strategy_service.py     # Métricas consolidadas, datamart y tableros
│   │   ├── minimax_service.py      # Conexión con IA MiniMax (análisis y enriquecimiento)
│   │   ├── gemini_service.py       # Conexión con IA Gemini (contingencia)
│   │   ├── mailer.py               # Envío de notificaciones y enlaces vía SMTP
│   │   ├── scheduler_service.py    # Programador de tareas periódicas de fondo
│   │   ├── cli.py                  # Interfaz de línea de comandos de administración
│   │   ├── migrations.py           # Envoltorio de ejecución programática de Alembic
│   │   ├── data/                   # Archivos maestros (ej. matriz_fuentes_eh.json)
│   │   ├── ingest/                 # Conectores especializados de fuentes de datos
│   │   │   ├── base.py             # Clase base abstracta de conectores
│   │   │   ├── clinicaltrials.py   # Conector ClinicalTrials.gov API v2
│   │   │   ├── fda.py              # Conector openFDA
│   │   │   ├── ema.py              # Conector Agencia Europea de Medicamentos
│   │   │   ├── ctis.py             # Conector ensayos clínicos europeos (CTIS)
│   │   │   ├── pubmed.py           # Conector NCBI PubMed E-Utilities
│   │   │   ├── pcori_hs.py         # Conector PCORI
│   │   │   ├── health_canada.py    # Conector Health Canada (DPD / MDALL)
│   │   │   ├── who_ictrp.py        # Conector ensayos clínicos de la OMS
│   │   │   └── file_feed.py        # Ingesta por archivos planos y lotes
│   │   └── routers/                # 24 módulos de rutas FastAPI (API REST)
│   ├── tests/                      # 47 suites de pruebas unitarias y de integración
│   ├── requirements.txt            # Dependencias fijadas de Python
│   ├── alembic.ini                 # Configuración del motor Alembic
│   ├── smoke_test.py               # Suite de regresión integral sobre la API
│   └── .env.example                # Plantilla documentada de variables de entorno
├── frontend/
│   ├── src/
│   │   ├── App.jsx                 # Configuración de rutas React Router y guards RBAC
│   │   ├── main.jsx                # Punto de entrada ReactDOM
│   │   ├── auth/                   # Contexto de autenticación, JWT y permisos
│   │   ├── cycle/                  # Contexto global del ciclo activo de trabajo
│   │   ├── realtime/               # Sincronización en tiempo real vía versionado de estado
│   │   ├── components/             # Componentes reutilizables (Tablas, Guía, Modales, Tooltips, Grafo)
│   │   ├── pages/                  # Vistas de cada módulo del sistema
│   │   ├── styles/                 # Hojas de estilo globales, UI y variables de diseño
│   │   └── utils/                  # Utilidades auxiliares (descargas, formatos)
│   ├── e2e/                        # Pruebas automatizadas de interfaz (Playwright)
│   ├── package.json                # Manifiesto de paquetes de Node.js
│   └── vite.config.js              # Configuración de empaquetado de Vite
├── deploy/                         # Scripts de aprovisionamiento, Caddyfile y configs de despliegue
├── .github/workflows/ci.yml        # Flujo de Integración Continua en GitHub Actions
├── Dockerfile                      # Construcción multi-etapa (Node + Python + Runtime)
├── docker-compose.yml              # Orquestación de contenedores (API, Worker, Postgres, Caddy)
├── start.ps1                       # Script de arranque rápido de desarrollo en Windows
├── start-prod.ps1                  # Script de arranque en modo producción en Windows
└── README.md                       # Documentación técnica principal del proyecto
```

---

## Flujo de la aplicación

El sistema orquesta el ciclo de vida metodológico en seis fases interconectadas. Cada fase involucra módulos específicos, validaciones de seguridad y persistencia en base de datos.

### Diagrama del flujo de datos y procesos

```mermaid
flowchart TD
    %% 1. Fuentes de Entrada
    subgraph S1 ["1. Entrada y Captura de Senales"]
        F1["Fuentes Proactivas: 97 referentes (FDA, EMA, ClinicalTrials, Web)"]
        F2["Postulacion Ciudadana Reactiva: formulario /postular"]
        SC["Captura: scraper.py y conectores en app/ingest/"]
        SUB["Recepcion: submissions.py (con reCAPTCHA y COI)"]
        F1 --> SC
        F2 --> SUB
    end

    %% 2. Ingesta y Staging
    subgraph S2 ["2. Ingesta, Extraccion y Bandeja de Entrada"]
        STG["Bandeja de Entrada: Staging (technologies.py)"]
        DET["Extraccion de Dosis y Forma: product_details.py"]
        CORR["Corroboracion Multifuente: corroboration.py"]
        CLAS["Sugerencia de Cluster y Tipo: classification.py"]
        TEC["Creacion de Tecnologia: technology_service.py"]
        
        SC -->|"Crea registro Finding"| STG
        SUB -->|"Aprobacion por moderador"| STG
        STG --> DET
        STG --> CORR
        STG --> CLAS
        STG -->|"Asignar a Ciclo Activo"| TEC
    end

    %% 3. Filtrado y Novedad
    subgraph S3 ["3. Filtrado, Desduplicacion e INVIMA"]
        SCR["Modulo de Filtrado: screening.py"]
        DEDUP["Desduplicacion Difusa: dedup.py (RapidFuzz)"]
        INV["Cruce Regulatorio: invima.py (Socrata y Local)"]
        NORM["Normalizacion de Codigos: normalization.py"]
        NOV["Compuerta de Novedad: NoveltyAssessment"]
        LST["Listado Unico por Cluster"]

        TEC -->|"Enviar a filtrado"| SCR
        SCR --> DEDUP
        SCR --> INV
        SCR --> NORM
        SCR -->|"Validar novedad"| NOV
        NOV -->|"Aprobadas"| LST
    end

    %% 4. Priorizacion Oficial
    subgraph S4 ["4. Priorizacion Metodologica Oficial %P"]
        PRI["Bandeja de Calificacion: priority.py"]
        PE["Motor de Priorizacion: priority_engine.py"]
        DEC{"Clasificacion segun %P"}
        P_ALTA["Priorizada (%P >= 60%)"]
        P_MED["Bajo Vigilancia (33% <= %P < 60%)"]
        P_BAJ["No Priorizada (%P < 33%)"]

        LST -->|"Pasan compuerta"| PRI
        PRI -->|"Evaluador Tecnico (P1, P5, P6)"| PE
        PRI -->|"Evaluador Clinico (P2, P3, P4)"| PE
        PE -->|"Formula: (Suma / 6) * 100"| DEC
        DEC --> P_ALTA
        DEC --> P_MED
        DEC --> P_BAJ
    end

    %% 5. Evaluacion y Revision
    subgraph S5 ["5. Evaluacion Temprana y Revision por Pares"]
        EVA["Expediente de Evaluacion: evaluation.py"]
        REV["Portal de Revision: review_portal.py"]
        COI["Declaracion Obligatoria COI (audit.py)"]

        P_ALTA -->|"Crear expediente"| EVA
        EVA -->|"Invitacion con token JWT temporal"| REV
        REV -->|"Firma obligatoria"| COI
        COI -->|"Emision de observaciones y dictamen"| EVA
    end

    %% 6. Diseminacion y Gobernanza
    subgraph S6 ["6. Diseminacion, Salida y Cierre"]
        PUB["Expediente Aprobado por Comite"]
        PDF["Generacion PDF Nativo: pdf_export.py"]
        BOL["Boletines y Paquetes ZIP del Ciclo"]
        EXT["Catalogo Ciudadano: public_catalog.py"]
        STRAT["Tablero y Grafo: strategy.py"]

        EVA -->|"Aprobacion final"| PUB
        PUB --> PDF
        PUB --> BOL
        PUB --> EXT
        PUB --> STRAT
    end
```

---

### Explicación detallada paso a paso

#### Paso 1: Entrada y captura de señales
- **Canal proactivo:** Tareas programadas periódicas (`backend/app/scheduler_service.py`) o ejecuciones manuales invocan los conectores de APIs (`backend/app/ingest/clinicaltrials.py`, `fda.py`, `ema.py`, etc.) o el scraper web con resolución de RSS y Google News (`backend/app/scraper.py`). Cada registro extraído se valida y se inserta como un `Finding` (señal) persistente.
- **Canal reactivo:** Ciudadanos u organizaciones ingresan al formulario público `/postular`. El backend valida el captcha (`RECAPTCHA_SECRET`), aplica límites por IP y persiste una postulación (`Submission`) con su declaración de conflicto de intereses. Un evaluador revisa la postulación en `/postulaciones` y, de ser aceptada, la transforma en una señal apta para el flujo de trabajo.

#### Paso 2: Ingesta, extracción y bandeja de entrada (Staging)
- En `/bandeja-entrada` (`backend/app/routers/technologies.py`), los evaluadores visualizan las señales capturadas.
- El módulo `backend/app/product_details.py` analiza el título y resumen para inferir automáticamente concentración, forma farmacéutica, vía de administración o modelo de dispositivo.
- El módulo `backend/app/corroboration.py` contrasta la tecnología contra las demás fuentes registradas. Si la misma innovación aparece en múltiples referentes (p. ej., FDA y EMA), se incrementa su `corroboration_count` y se le otorga un bono de visualización en la bandeja (hasta 15 puntos).
- El evaluador confirma o ajusta el Clúster de Salud y la Tipología recomendados por `backend/app/classification.py`, y asigna la tecnología al ciclo operativo vigente (`backend/app/technology_service.py`).

#### Paso 3: Filtrado, desduplicación e indexación regulatoria (Screening)
- En `/filtrado` (`backend/app/routers/screening.py`), el sistema activa tres compuertas de calidad:
  1. **Detección de duplicados:** `backend/app/dedup.py` utiliza algoritmos de RapidFuzz (Levenshtein, Jaro-Winkler, Token Sort) y coincidencia exacta de códigos NCT para agrupar registros repetidos y someterlos a confirmación humana.
  2. **Verificación regulatoria INVIMA:** `backend/app/invima.py` contrasta la tecnología contra la copia local indexada de registros sanitarios y, si no hay coincidencia, realiza una consulta en vivo a `datos.gov.co`.
  3. **Declaración de Novedad:** Se registra una `NoveltyAssessment` donde se certifica si la tecnología no está disponible en Colombia, si es una nueva indicación, forma o combinación. Los genéricos o cambios cosméticos quedan expresamente excluidos.
- Solo las tecnologías que superan la compuerta de novedad se consolidan en el **Listado Único por Clúster**.

#### Paso 4: Calificación mediante la Matriz Oficial %P
- En `/priorizacion` (`backend/app/routers/priority.py`), las tecnologías del Listado Único son calificadas bajo estricta segregación de funciones:
  - **Evaluador Técnico:** Califica P1 (disponibilidad nacional), P5 (aprobación EMA/FDA ≤ 12 meses) y P6 (proceso regulatorio formal ≤ 6 meses).
  - **Evaluador Clínico:** Califica P2 (gravedad/mortalidad de la condición), P3 (carga de enfermedad / impacto financiero) y P4 (impacto organizacional en el SGSSS).
- El motor `backend/app/priority_engine.py` computa el porcentaje `%P = (criterios afirmativos / 6) * 100` y clasifica el registro:
  - **Priorizada:** `%P ≥ 60 %` (pasa automáticamente a evaluación temprana).
  - **Bajo Vigilancia:** `33 % ≤ %P < 60 %` (se mantiene en observación para futuros ciclos).
  - **No Priorizada:** `%P < 33 %` (se archiva con trazabilidad).

#### Paso 5: Evaluación temprana y revisión por pares
- En `/evaluacion` (`backend/app/routers/evaluation.py`), los evaluadores elaboran el informe técnico (Ficha, Informe Breve o Mini-HTA) estructurado en seis estados editoriales (`borrador`, `revision_interna`, `revision_externa`, `consolidacion`, `comite` y `aprobado`).
- Para revisión externa, el sistema genera una invitación con token JWT seguro (`backend/app/routers/review_portal.py`) que permite al revisor acceder a un portal web aislado sin necesidad de credenciales institucionales, requiriendo obligatoriamente la firma electrónica previa de declaración de conflicto de intereses (COI).

#### Paso 6: Diseminación, reportes y cierre
- Al aprobarse la tecnología, el sistema genera de forma nativa fichas técnicas, expedientes y boletines en formato PDF de alta calidad mediante `backend/app/pdf_export.py`.
- La información de acceso abierto se publica automáticamente en el portal ciudadano `/expedientes` (`backend/app/routers/public_catalog.py`), omitiendo datos confidenciales y presupuestales.
- El Tablero Estratégico y de Gobernanza (`backend/app/routers/strategy.py`) actualiza en tiempo real los indicadores de avance, matrices de decisión TTM (Time-To-Market) y el grafo interactivo de relaciones.
- Toda acción queda inmutablemente asentada en la tabla `audit_logs` (`backend/app/audit.py`), vinculando usuario, hora, IP, recurso y deltas de cambio.

---

## Conceptos clave y metodología operativa

1. **Señal (`Finding`):** Unidad atómica de captura obtenida durante la vigilancia. Posee título, extracto de texto, enlace de origen y hash de contenido para prevenir duplicaciones exactas.
2. **Tecnología (`Technology`):** La unidad metodológica persistente a lo largo del tiempo. Agrupa nombre comercial, DCI, clúster clínico, fabricante, códigos regulatorios y detalle de formulación.
3. **Ciclo Operativo (`Cycle`):** Ventana de trabajo formal reglamentada (entre 10 y 16 semanas, máximo 3 ciclos formales por año calendario). Su cierre congela de forma inmutable todas las calificaciones emitidas.
4. **Instancia de Ciclo (`CycleTechnology`):** Representa el estado y evaluación de una tecnología dentro de un ciclo concreto. Permite que una tecnología evaluada en un ciclo anterior pueda reevaluarse en un ciclo futuro sin sobreescribir la evidencia histórica.

---

## Perfiles y matriz de permisos (RBAC)

El sistema implementa 5 perfiles definidos en `backend/app/rbac.py`:

| Rol / Perfil | Nombre en sistema | Responsabilidad principal |
|---|---|---|
| **Superadministrador** | `superadmin` | Gestión de usuarios, configuración global, parámetros metodológicos y cierre formal de ciclos. |
| **Evaluador Técnico** | `evaluador_tecnico` | Ejecución de vigilancia, ingesta, desduplicación, verificación INVIMA, calificación de P1, P5 y P6. |
| **Evaluador Clínico** | `evaluador_clinico` | Calificación de criterios clínicos de priorización (P2, P3 y P4) y redacción de expedientes de evaluación. |
| **Tomador de Decisiones**| `tomador_decisiones` | Acceso analítico a tableros ejecutivos, gráficos de gobernanza, capas de impacto presupuestal y reportes. |
| **Revisor Externo** | `revisor_externo` | Perfil transitorio activado exclusivamente mediante token firmado para revisión técnica de un expediente con COI previo. |

---

## Documentación relacionada

- [`DEPLOY.md`](DEPLOY.md): Guía de despliegue en producción con Docker Compose, HTTPS con Caddy, respaldo y políticas de restauración.
- [`GUIA_USUARIO.md`](GUIA_USUARIO.md): Manual paso a paso de operación de pantallas para cada perfil de usuario.
- [`BACKLOG.md`](BACKLOG.md): Trazabilidad de Requerimientos Funcionales (RF01 a RF20), diagramas de arquitectura detallados y decisiones de diseño.
- [`Plan_Fases_Actualizacion_Plataforma_EH_IETS.md`](Plan_Fases_Actualizacion_Plataforma_EH_IETS.md): Cronograma y arquitectura de fases de evolución del sistema.
- [`Catalogo_Fuentes_Proactivas_Verificadas_EH_IETS.md`](Catalogo_Fuentes_Proactivas_Verificadas_EH_IETS.md): Detalle técnico de los 97 referentes internacionales monitoreados.
- [`linea-grafica-y-ux-ui.md`](linea-grafica-y-ux-ui.md): Manual de identidad visual, paleta cromática y estándares de componentes.
