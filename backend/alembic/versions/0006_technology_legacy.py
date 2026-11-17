"""Bandeja Legacy: senales de fuentes del inventario anterior.

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-17 18:00:00

`technologies.legacy` marca las senales pendientes de fuentes retiradas al cargar
la matriz de escaneo por enlace. No borra nada; `downgrade` quita la columna.
"""
from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa

revision: str = '0006'
down_revision: Union[str, Sequence[str], None] = '0005'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_INDEX = 'ix_technologies_legacy'


def _cols() -> set[str]:
    if context.is_offline_mode():
        return set()
    return {c['name'] for c in sa.inspect(op.get_bind()).get_columns('technologies')}


def _indexes() -> set[str]:
    if context.is_offline_mode():
        return set()
    return {i['name'] for i in sa.inspect(op.get_bind()).get_indexes('technologies')}


def upgrade() -> None:
    if 'legacy' not in _cols():
        # ADD COLUMN simple (sin CHECK): SQLite no necesita reconstruir la tabla.
        op.add_column(
            'technologies',
            sa.Column('legacy', sa.Boolean(create_constraint=False), nullable=False, server_default=sa.false()),
        )
    if _INDEX not in _indexes():
        op.create_index(_INDEX, 'technologies', ['legacy'], unique=False)


def downgrade() -> None:
    if context.is_offline_mode() or _INDEX in _indexes():
        op.drop_index(_INDEX, table_name='technologies')
    if context.is_offline_mode() or 'legacy' in _cols():
        with op.batch_alter_table('technologies', schema=None) as batch_op:
            batch_op.drop_column('legacy')
