"""Cruce de postulaciones con la vigilancia y la web (RF-02-F, Modulo 0).

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-24 12:00:00

`submissions.cross_check` guarda el ultimo cruce de la postulacion: senales de
la vigilancia proactiva que coinciden (con su enlace a la fuente) y resultados
de la busqueda web. Reversible e idempotente: solo agrega la columna;
`downgrade` la quita sin tocar los demas datos de la postulacion.
"""
from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '0007'
down_revision: Union[str, Sequence[str], None] = '0006'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_JSON = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql')


def _cols() -> set[str]:
    if context.is_offline_mode():
        return set()
    return {c['name'] for c in sa.inspect(op.get_bind()).get_columns('submissions')}


def upgrade() -> None:
    if 'cross_check' not in _cols():
        with op.batch_alter_table('submissions', schema=None) as batch_op:
            batch_op.add_column(sa.Column('cross_check', _JSON, nullable=True))


def downgrade() -> None:
    if context.is_offline_mode() or 'cross_check' in _cols():
        with op.batch_alter_table('submissions', schema=None) as batch_op:
            batch_op.drop_column('cross_check')
