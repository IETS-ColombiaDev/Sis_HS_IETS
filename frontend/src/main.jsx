// El idioma se resuelve antes de cargar la aplicación: así los textos de las
// constantes de módulo (menú, glosario, columnas) ya salen traducidos.
import { initI18n } from "./i18n";

initI18n().finally(() => import("./bootstrap.jsx"));
