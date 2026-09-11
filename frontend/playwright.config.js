// Pruebas E2E de navegador (backlog P5-1).
//
// Dos modos de uso:
//  - Contra una instancia ya levantada:  E2E_BASE_URL=http://127.0.0.1:8000 npx playwright test
//  - Autocontenido (CI): sin E2E_BASE_URL, levanta el backend sobre una base SQLite
//    temporal y sirve el frontend compilado (requiere `npm run build` previo).
//
// Se usa el Chrome instalado en el equipo (channel "chrome") para no descargar
// navegadores; en CI se puede cambiar con E2E_CHANNEL=chromium.
import { defineConfig } from "@playwright/test";
import os from "node:os";
import path from "node:path";

const external = process.env.E2E_BASE_URL;
const port = Number(process.env.E2E_PORT) || 8799;
const baseURL = external || `http://127.0.0.1:${port}`;
const python = process.env.E2E_PYTHON || (process.platform === "win32" ? ".venv\\Scripts\\python.exe" : ".venv/bin/python");
const dbFile = path.join(os.tmpdir(), `iets_e2e_${port}.db`).replace(/\\/g, "/");

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e-report" }]],
  use: {
    baseURL,
    channel: process.env.E2E_CHANNEL === "chromium" ? undefined : "chrome",
    headless: true,
    viewport: { width: 1440, height: 900 },
    locale: "es-CO",
    timezoneId: "America/Bogota",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: external
    ? undefined
    : {
        command: `${python} -m uvicorn app.main:app --host 127.0.0.1 --port ${port}`,
        cwd: "../backend",
        url: `${baseURL}/api/health`,
        timeout: 180_000,
        reuseExistingServer: !process.env.CI,
        env: {
          DATABASE_URL: `sqlite:///${dbFile}`,
          ENVIRONMENT: "development",
          ALLOW_DEV_LOGIN: "true",
          INGEST_WORKER_ENABLED: "false",
          // Las pruebas envian varias postulaciones seguidas desde la misma IP.
          PUBLIC_SUBMISSIONS_PER_WINDOW: "50",
          SECRET_KEY: "e2e-secret-key-not-for-production-0123456789",
          // Aislado del backend/.env del equipo: las pruebas asumen IA apagada, sin
          // reCAPTCHA, sin correo saliente y sin directorio institucional (como en CI).
          MINIMAX_API_KEY: "",
          GEMINI_API_KEY: "",
          RECAPTCHA_SECRET: "",
          RECAPTCHA_SITE_KEY: "",
          SMTP_HOST: "",
          FIREBASE_SERVICE_ACCOUNT_KEY: "",
          FIREBASE_SERVICE_ACCOUNT_FILE: "",
          FIREBASE_RRHH_ENV_FILE: "",
        },
      },
});
