# Flujo de trabajo en el repositorio

Aplica la actividad 16 del cronograma (repositorio, estrategia de ramas y versionamiento semántico) y la actividad 21 (integración y despliegue continuos). Rige desde el 3 de noviembre de 2026; la historia anterior se resume por entrega en [CHANGELOG.md](CHANGELOG.md).

## Ramas

| Rama | Para qué | Quién escribe | Despliega |
|---|---|---|---|
| `main` | Producción. Solo recibe versiones cerradas | Solo por pull request desde `release/*` o `hotfix/*` | Render (`autoDeploy`) a https://sis-hs-iets.onrender.com |
| `develop` | Integración. Todo lo terminado de un sprint | Solo por pull request desde ramas de historia | Nada; solo CI |
| `feature/RFxx-descripcion-corta` | Una historia de usuario o requerimiento | Quien la desarrolla | Nada |
| `fix/descripcion-corta` | Defecto encontrado en `develop` | Quien lo corrige | Nada |
| `release/vX.Y.0` | Congelar una entrega: solo correcciones, notas de versión | Responsable de la entrega | Nada |
| `hotfix/vX.Y.Z-descripcion` | Falla en producción que no espera a la siguiente entrega | Quien la corrige | Al fusionar en `main` |

Ninguna persona hace `push` directo a `main` ni a `develop`. Un `hotfix` se fusiona en `main` y también de vuelta en `develop`.

```
feature/RF09-dedup ─┐
feature/RF17-ttm ───┼─► develop ─► release/v7.1.0 ─► main ─► tag v7.1.0 ─► Render
fix/login-lento ────┘                                  ▲
                                         hotfix/v7.1.1 ┘ (y de vuelta a develop)
```

## Mensajes de commit

Formato [Conventional Commits](https://www.conventionalcommits.org/es/v1.0.0/), en español, con la trazabilidad al requerimiento y a la entrega en el pie:

```
<tipo>(<módulo>): <qué cambia, en presente, máx. 72 caracteres>

<por qué cambia y qué efecto tiene; opcional>

Refs: RF09, RF10
Entrega: E5
```

- **Tipos:** `feat` (funcionalidad), `fix` (defecto), `docs`, `test`, `refactor`, `perf`, `ci`, `build`, `chore`, `revert`.
- **Módulos sugeridos:** `vigilancia`, `bandeja`, `ciclos`, `filtrado`, `priorizacion`, `evaluacion`, `tablero`, `boletines`, `asistente`, `auth`, `rbac`, `ia`, `fuentes`, `api`, `db`, `deploy`, `repo`.
- **`Refs:`** los RF o RNF de la [matriz de trazabilidad](BACKLOG.md#matriz-de-trazabilidad-de-requerimientos) que toca. Si no aplica (por ejemplo, `ci` o `chore`), se omite.
- **`Entrega:`** obligatorio: la entrega del cronograma (E1–E9) a la que aporta el commit.
- No se aceptan mensajes como `UT`, `UT_Changes` o `Update`. El CI los rechaza en los pull requests.

Para tener la plantilla en el editor: `git config commit.template .gitmessage`.

Ejemplo:

```
feat(priorizacion): pesos de P1–P6 parametrizables desde configuración

Antes los pesos estaban fijos en priority_engine.py; ahora se leen de la
tabla de parámetros metodológicos y quedan en la bitácora al cambiar.

Refs: RF12
Entrega: E5
```

## Pull requests y revisión por pares

1. Abra el pull request contra `develop` (o contra `main` si es `release/*` o `hotfix/*`) con la [plantilla](.github/pull_request_template.md) diligenciada.
2. El CI debe pasar completo: backend, PostgreSQL, frontend, E2E, smoke, Docker y formato de commits.
3. Al menos **una aprobación** de una persona distinta a quien hizo los cambios.
4. Se fusiona con *squash* si la rama tiene commits de trabajo, o con *merge* si cada commit ya cumple el formato. El título del pull request sigue el mismo formato del commit.

## Versiones y etiquetas por entrega

Versionamiento semántico sobre la versión del sistema (hoy `7.x`):

| Entrega | Fecha | Etiqueta |
|---|---|---|
| E4 · Versión beta / MVP | 16-oct-2026 | `v7.0.0` |
| E5 · Inteligencia analítica y priorización | 05-nov-2026 | `v7.1.0` |
| E6 · Funcionalidad completa | 20-nov-2026 | `v7.2.0` |
| E7 · Versión candidata aceptada | 01-dic-2026 | `v7.3.0-rc.N` |
| E8 · Sistema en producción | 04-dic-2026 | `v7.3.0` |
| E9 · Cierre del primer ciclo | 17-dic-2026 | `v7.3.x` (si hay correcciones) |

E1 a E3 son documentales y no llevan etiqueta de código.

Para cerrar una entrega:

```bash
git checkout -b release/v7.1.0 develop
# subir la versión en frontend/package.json y BACKLOG.md, completar CHANGELOG.md
# PR release/v7.1.0 -> main, revisión y CI en verde, merge
git checkout main && git pull
git tag -a v7.1.0 -m "Entrega 5: inteligencia analítica y priorización"
git push origin v7.1.0
git checkout develop && git merge main && git push
```

Al publicar la etiqueta se crea la *release* en GitHub con las notas de la sección correspondiente de `CHANGELOG.md`.
