# Sistema de Escaneo de Horizonte del IETS

Plataforma web para el **escaneo de horizonte (horizon scanning)** del **Instituto de
Evaluación Tecnológica en Salud (IETS)** de Colombia: identificación temprana de
tecnologías sanitarias emergentes, vigilancia automatizada de fuentes internacionales,
análisis con IA (Gemini) y recomendaciones de adopción para el país.

Inspirado en el modelo operativo y la diseminación del
[NIHR Innovation Observatory](https://io.nihr.ac.uk/) y construido sobre la línea gráfica
corporativa definida en `linea-grafica-y-ux-ui.md` (paleta morado/azul, layout tipo panel).

---

## Capacidades principales

- **Inventario de fuentes (CRUD).** Precargado con las 24 fuentes del inventario
  institucional (`IETS_Escaneo_Horizonte_Inventario.xlsx`) + 5 repositorios adicionales
  de horizon scanning (NIHRIO, CADTH/CDA, CONITEC, OMS, etc.).
- **Web scraping con un clic.** Vigilancia de fuentes HTML/PDF: extrae tecnologías/señales
  emergentes, las clasifica por horizonte (emergente/transicional/inminente) y tipo
  (medicamento/dispositivo/digital) y evita duplicados. Escaneo individual o masivo.
- **Hallazgos (CRUD).** Clasificación, priorización y cambio de estado de cada señal.
- **Recomendaciones de adopción con Gemini.** Detección automática del mejor modelo
  disponible; genera análisis estructurado para Colombia (relevancia, regulación INVIMA/IETS,
  impacto, acciones). Funciona en modo degradado sin API key.
- **Asistente IA (chat RAG).** Conversa sobre la información del sistema recuperando
  fuentes y hallazgos relevantes de la base de datos.
- **Dashboards.** KPIs y gráficos por categoría, horizonte, tipo, estado, idioma y fuentes.
- **Autenticación Google institucional** restringida al dominio `@iets.org.co` + roles
  (viewer / editor / admin) y gestión de usuarios.
- **Tiempo real.** Los cambios (fuentes, hallazgos, escaneos, recomendaciones) se propagan
  a todos los usuarios mediante versión de estado con sondeo automático.

---

## Arquitectura

| Capa | Tecnología |
|------|------------|
| Backend | FastAPI + SQLAlchemy + SQLite |
| Scraping | httpx + BeautifulSoup (lxml) |
| IA | google-generativeai (Gemini, autodetección de modelo) |
| Auth | Google Identity Services + JWT (python-jose) |
| Frontend | React 18 + Vite + React Router + Recharts |

```
backend/     API FastAPI, modelos, scraping, Gemini, seed
frontend/    SPA React (Vite), componentes y páginas
```

---

## Puesta en marcha

### 1. Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env      # y edite los valores
python -m uvicorn app.main:app --reload --port 8000
```

La base de datos SQLite y las 29 fuentes semilla se crean automáticamente al iniciar.
API disponible en `http://127.0.0.1:8000` · documentación en `/docs`.

### 2. Frontend

```powershell
cd frontend
npm install
npm run dev        # desarrollo en http://localhost:5173 (proxy a la API)
# o para producción:
npm run build      # genera frontend/dist, servido por el backend en "/"
```

En **producción** basta con ejecutar el backend: si existe `frontend/dist`, la API lo
sirve como SPA en la raíz.

---

## Configuración (`backend/.env`)

| Variable | Descripción |
|----------|-------------|
| `SECRET_KEY` | Clave para firmar los JWT (cámbiela en producción). |
| `GOOGLE_CLIENT_ID` | Client ID OAuth 2.0 (Google Cloud Console) para login institucional. |
| `ALLOWED_EMAIL_DOMAIN` | Dominio permitido (por defecto `iets.org.co`). |
| `ADMIN_EMAILS` | Correos (separados por coma) que serán admin al primer inicio de sesión. |
| `ALLOW_DEV_LOGIN` | Login de desarrollo sin Google (`false` en producción). |
| `GEMINI_API_KEY` | API key de Google AI Studio para habilitar la IA. |
| `GEMINI_MODEL` | Opcional; vacío = autodetección del mejor modelo. |
| `CORS_ORIGINS` | Orígenes permitidos del frontend. |

> **Login con Google:** cree credenciales OAuth 2.0 "Aplicación web", agregue el origen
> del frontend a "Orígenes autorizados de JavaScript" y coloque el Client ID en
> `GOOGLE_CLIENT_ID`. El backend verifica el `id_token` y exige el dominio institucional.

> **Sin `GOOGLE_CLIENT_ID`:** use el acceso de desarrollo (correo `@iets.org.co`). El primer
> usuario registrado obtiene rol **admin**.

---

## Roles

| Rol | Permisos |
|-----|----------|
| `viewer` | Consulta toda la información y usa el chat. |
| `editor` | Además: CRUD de fuentes/hallazgos, ejecutar escaneos, generar recomendaciones. |
| `admin` | Además: gestión de usuarios y roles. |

---

## Flujo de uso sugerido

1. Iniciar sesión (Google institucional o acceso de desarrollo).
2. Revisar **Fuentes** y habilitar la vigilancia de las que interesen.
3. Ir a **Escaneo web** y ejecutar "Escanear todas" para poblar **Hallazgos**.
4. En **Hallazgos**, clasificar/priorizar y generar **Recomendaciones** con IA.
5. Consultar **Dashboards** y conversar con el **Asistente IA**.
