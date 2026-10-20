"""Tecnologias: ultimo dictamen de confiabilidad de la senal.

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-20 09:00:00

Agrega `technologies.reliability` (JSON): chequeos de origen y trazabilidad y
el dictamen de la IA que se muestran en la bandeja de entrada al clasificar.

Es idempotente: si la columna ya existe (base completada con `create_all`) no
hace nada.
"""
from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '0003'
down_revision: Union[str, Sequence[str], None] = '0002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_JSON = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql')


def _columns() -> set[str]:
    if context.is_offline_mode():
        return set()
    return {c['name'] for c in sa.inspect(op.get_bind()).get_columns('technologies')}


def upgrade() -> None:
    if 'reliability' not in _columns():
        with op.batch_alter_table('technologies', schema=None) as batch_op:
            batch_op.add_column(sa.Column('reliability', _JSON, nullable=True))


def downgrade() -> None:
    if context.is_offline_mode() or 'reliability' in _columns():
        with op.batch_alter_table('technologies', schema=None) as batch_op:
            batch_op.drop_column('reliability')
