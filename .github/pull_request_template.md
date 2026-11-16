<!--
Título del PR con el mismo formato del commit: <tipo>(<tarea>): descripción
Rama personal -> develop.  develop o hotfix/* -> main.
Ver README.md, sección "Desarrollo y contribución".
-->

## Tipo

- [ ] `feat`: funcionalidad nueva
- [ ] `fix`: corrección de un defecto
- [ ] `docs`: documentación
- [ ] `test`: pruebas
- [ ] `refactor`: cambio interno sin cambio de comportamiento
- [ ] `ci` / `build` / `chore`: integración, empaquetado u organización
- [ ] Hotfix a producción (`hotfix/*` -> `main`)
- [ ] Paso a producción (`develop` -> `main`)

## Qué cambia

<!-- Dos o tres líneas. -->

## Por qué

<!-- El problema o la necesidad que resuelve. -->

## Referencia

<!-- Una o varias: observación del consolidado, RF o RNF. -->

- Consolidado de observaciones: <!-- p. ej. fila 12 / ID de la observación -->
- RF / RNF: <!-- p. ej. RF-02, RNF-seguridad -->

## Cómo probar

<!-- Pasos para que quien revisa lo reproduzca en local. -->

1.
2.

## Checklist

- [ ] La rama sigue el formato `<nombre>_<tipo>_<tarea>` y los commits `<tipo>(<tarea>): descripción`
- [ ] El CI está en verde
- [ ] Pruebas nuevas o ajustadas en `backend/tests` (o justifico por qué no aplica)
- [ ] Migración de Alembic incluida si cambia el modelo de datos
- [ ] `README.md` / `GUIA_USUARIO.md` actualizados si cambia el uso
- [ ] Sin secretos, `.env` ni bases de datos en el diff

---

<!-- ============ Solo para PR de develop -> main (o hotfix/* -> main) ============
     Borre esta sección en los PR a develop. -->

## Paso a producción

### Pruebas en local con docker-compose y PostgreSQL

Rama probada: `develop` en el commit `<!-- SHA corto -->`

- [ ] `docker compose --env-file deploy/.env.production build` sin errores
- [ ] `docker compose --env-file deploy/.env.production up -d`: `db`, `api` y `worker` en estado `healthy`
- [ ] `docker compose logs api` muestra las migraciones aplicadas (`status=created`, `current` o `stamped`), sin errores
- [ ] `curl http://127.0.0.1:8000/api/health` responde
- [ ] Ingreso a la aplicación y recorrido de los flujos afectados por este PR
- [ ] `cd backend && .venv/bin/python smoke_test.py --base http://127.0.0.1:8000 --skip-network` en verde
- [ ] La E2E nocturna (o una corrida manual) sobre `develop` está en verde
- [ ] `docker compose down` (sin `-v` si se quiere conservar la base)

### Visto bueno del equipo de pruebas

- [ ] El equipo de pruebas dio el visto bueno: <!-- enlace al comentario en este PR o al acta -->
- [ ] 1 aprobación en GitHub
