"""Comandos de administracion para operar sin interfaz (primer despliegue, rescate).

Uso, desde backend/:
    python -m app.cli create-admin --email persona@iets.org.co --name "Nombre Apellido"
    python -m app.cli reset-password --email persona@iets.org.co
    python -m app.cli list-users
    python -m app.cli check-config

Sin --password, se genera una contrasena temporal que se imprime una sola vez y
debe cambiarse en el primer ingreso. Cada accion queda en la bitacora como
ejecutada por "cli".
"""
from __future__ import annotations

import argparse
import getpass
import sys

from . import audit, rbac
from .config import settings
from .database import Base, SessionLocal, engine, harden_audit_log, run_schema_migrations
from .models import User
from .security import generate_temporary_password, hash_password, password_problems


class _CliActor:
    id = None
    email = "cli"
    role = rbac.SUPERADMIN


def _prepare() -> None:
    from .migrations import upgrade_database

    upgrade_database()
    Base.metadata.create_all(bind=engine)
    run_schema_migrations()
    harden_audit_log()
    audit.install_listeners()
    audit.set_user_context(_CliActor())


def _read_password(args, email: str) -> tuple[str, bool]:
    if args.password == "-":
        first = getpass.getpass("Contraseña: ")
        second = getpass.getpass("Repita la contraseña: ")
        if first != second:
            sys.exit("Las contraseñas no coinciden.")
        password = first
    elif args.password:
        password = args.password
    else:
        return generate_temporary_password(), True
    problems = password_problems(password, email=email)
    if problems:
        sys.exit("Contraseña rechazada: " + " ".join(problems))
    return password, False


def cmd_create_admin(args) -> int:
    _prepare()
    email = args.email.strip().lower()
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        password, generated = _read_password(args, email)
        if user is None:
            user = User(email=email, name=args.name or email.split("@")[0], role=rbac.SUPERADMIN, is_active=True)
            db.add(user)
            action = "creado"
        else:
            user.role = rbac.SUPERADMIN
            user.is_active = True
            if args.name:
                user.name = args.name
            action = "actualizado"
        user.password_hash = hash_password(password)
        user.must_change_password = generated or args.force_change
        user.failed_logins = 0
        user.locked_until = None
        user.token_version = int(user.token_version or 0) + 1
        db.commit()
        print(f"Superadministrador {action}: {email}")
        if generated:
            print(f"Contraseña temporal (se muestra una sola vez): {password}")
            print("Deberá cambiarla en el primer ingreso.")
        return 0
    finally:
        db.close()


def cmd_reset_password(args) -> int:
    _prepare()
    email = args.email.strip().lower()
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if user is None:
            print(f"No existe la cuenta {email}.", file=sys.stderr)
            return 1
        password, generated = _read_password(args, email)
        user.password_hash = hash_password(password)
        user.must_change_password = True
        user.failed_logins = 0
        user.locked_until = None
        user.token_version = int(user.token_version or 0) + 1
        audit.record_action(
            db, entity_type="users", entity_id=str(user.id), action="auth:password_reset",
            new_value={"email": user.email, "by": "cli"},
        )
        db.commit()
        print(f"Contraseña restablecida para {email}.")
        if generated:
            print(f"Contraseña temporal (se muestra una sola vez): {password}")
        return 0
    finally:
        db.close()


def cmd_list_users(args) -> int:
    _prepare()
    db = SessionLocal()
    try:
        for u in db.query(User).order_by(User.email).all():
            state = "activo" if u.is_active else "inactivo"
            pwd = "con contraseña" if u.password_hash else "sin contraseña"
            print(f"{u.email:40} {rbac.role_label(u.role):24} {state:9} {pwd}")
        return 0
    finally:
        db.close()


def cmd_check_config(args) -> int:
    env = "production" if settings.is_production else settings.environment
    print(f"Entorno: {env}")
    print(f"Base de datos: {settings.database_url.split('@')[-1]}")
    print(f"Acceso de desarrollo: {'habilitado' if settings.dev_login_enabled else 'deshabilitado'}")
    print(f"Google: {'configurado' if settings.google_client_id else 'no configurado'}")
    problems = settings.production_problems()
    for p in problems:
        print(f"PROBLEMA: {p}")
    if settings.is_production and not problems:
        print("Configuración de producción válida.")
    return 1 if problems else 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli", description="Administración del Sistema de Escaneo de Horizonte")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("create-admin", help="Crea o promueve un superadministrador con contraseña")
    p.add_argument("--email", required=True)
    p.add_argument("--name", default="")
    p.add_argument("--password", default="", help="Omitir para generar una temporal; '-' para escribirla sin eco")
    p.add_argument("--force-change", action="store_true", help="Exigir cambio en el primer ingreso aunque se indique la contraseña")
    p.set_defaults(func=cmd_create_admin)

    p = sub.add_parser("reset-password", help="Asigna una contraseña temporal a una cuenta")
    p.add_argument("--email", required=True)
    p.add_argument("--password", default="", help="Omitir para generar una temporal; '-' para escribirla sin eco")
    p.set_defaults(func=cmd_reset_password)

    p = sub.add_parser("list-users", help="Lista las cuentas")
    p.set_defaults(func=cmd_list_users)

    p = sub.add_parser("check-config", help="Valida la configuración del entorno")
    p.set_defaults(func=cmd_check_config)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
