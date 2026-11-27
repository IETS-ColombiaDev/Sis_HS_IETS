"""Motivo tipificado del rechazo de una postulacion (RF02).

Revision ID: 0010
Revises: 0009
Create Date: 2026-11-27 09:00:00

`submissions.reject_reason` guarda el codigo del motivo (fuera de alcance,
duplicada, evidencia insuficiente...). La nota libre sigue en `review_note`.
Reversible e idempotente: solo agrega la columna; `downgrade` la quita sin
tocar los demas datos de la postulacion.
"""
from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa

revision: str = '0010'
down_revision: Union[str, Sequence[str], None] = '0009'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _cols() -> set[str]:
    if context.is_offline_mode():
        return set()
    return {c['name'] for c in sa.inspect(op.get_bind()).get_columns('submissions')}


def upgrade() -> None:
    if 'reject_reason' not in _cols():
        with op.batch_alter_table('submissions', schema=None) as batch_op:
            batch_op.add_column(sa.Column('reject_reason', sa.String(length=40), nullable=False, server_default=''))


def downgrade() -> None:
    if context.is_offline_mode() or 'reject_reason' in _cols():
        with op.batch_alter_table('submissions', schema=None) as batch_op:
            batch_op.drop_column('reject_reason')
