"""Validacion humana de los informes de diseminacion.

Revision ID: 0012
Revises: 0011
Create Date: 2026-11-27 18:00:00

`recommendations` gana `status` (borrador o validado), quien valido y cuando, y
quien edito por ultima vez. Los informes que ya existian quedan en `borrador`:
nadie los valido de forma explicita y el sistema no lo afirma por ellos.
Reversible e idempotente: solo agrega columnas; `downgrade` las quita sin tocar
el contenido de los informes.
"""
from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa

revision: str = '0012'
down_revision: Union[str, Sequence[str], None] = '0011'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

COLUMNS = (
    ('status', lambda: sa.Column('status', sa.String(length=20), nullable=False, server_default='borrador')),
    ('validated_by', lambda: sa.Column('validated_by', sa.String(length=255), nullable=False, server_default='')),
    ('validated_at', lambda: sa.Column('validated_at', sa.DateTime(timezone=True), nullable=True)),
    ('updated_by', lambda: sa.Column('updated_by', sa.String(length=255), nullable=False, server_default='')),
    ('updated_at', lambda: sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True)),
)


def _cols() -> set[str]:
    if context.is_offline_mode():
        return set()
    return {c['name'] for c in sa.inspect(op.get_bind()).get_columns('recommendations')}


def upgrade() -> None:
    existing = _cols()
    missing = [make for name, make in COLUMNS if name not in existing]
    if missing:
        with op.batch_alter_table('recommendations', schema=None) as batch_op:
            for make in missing:
                batch_op.add_column(make())


def downgrade() -> None:
    existing = _cols()
    offline = context.is_offline_mode()
    present = [name for name, _ in COLUMNS if offline or name in existing]
    if present:
        with op.batch_alter_table('recommendations', schema=None) as batch_op:
            for name in reversed(present):
                batch_op.drop_column(name)
