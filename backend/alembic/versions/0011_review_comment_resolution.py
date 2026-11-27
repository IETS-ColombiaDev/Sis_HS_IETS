"""Resolucion de las observaciones de revision (RF15).

Revision ID: 0011
Revises: 0010
Create Date: 2026-11-27 15:00:00

`review_comments` gana `resolved_at`, `resolved_by` y `resolution_note`: una
observacion deja de ser texto suelto y pasa a tener estado (abierta o resuelta)
y respuesta de quien redacta. Reversible e idempotente: solo agrega columnas;
`downgrade` las quita sin tocar las observaciones.
"""
from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa

revision: str = '0011'
down_revision: Union[str, Sequence[str], None] = '0010'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

COLUMNS = (
    ('resolved_at', lambda: sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True)),
    ('resolved_by', lambda: sa.Column('resolved_by', sa.String(length=255), nullable=False, server_default='')),
    ('resolution_note', lambda: sa.Column('resolution_note', sa.Text(), nullable=False, server_default='')),
)


def _cols() -> set[str]:
    if context.is_offline_mode():
        return set()
    return {c['name'] for c in sa.inspect(op.get_bind()).get_columns('review_comments')}


def upgrade() -> None:
    existing = _cols()
    missing = [make for name, make in COLUMNS if name not in existing]
    if missing:
        with op.batch_alter_table('review_comments', schema=None) as batch_op:
            for make in missing:
                batch_op.add_column(make())


def downgrade() -> None:
    existing = _cols()
    offline = context.is_offline_mode()
    present = [name for name, _ in COLUMNS if offline or name in existing]
    if present:
        with op.batch_alter_table('review_comments', schema=None) as batch_op:
            for name in reversed(present):
                batch_op.drop_column(name)
