"""Fuentes: campos de la matriz EH y flujo de escaneo por fuente.

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-06 09:00:00

Agrega a `sources` el nivel de fuente (primaria/secundaria/terciaria), la
prioridad EH, los tipos de tecnologia, la referencia a la fila de la matriz
"FUENTES DE INFORMACION PROACTIVA EH", las URLs de entrada y de documentos,
la ruta de acceso, que consultar, observaciones, restricciones y el perfil de
escaneo (`scan_profile`).

Es idempotente: una base anterior a Alembic se completa con `create_all` antes
de marcarse en 0001 (ver app.migrations), y en ese caso las columnas ya existen.
"""
from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '0002'
down_revision: Union[str, Sequence[str], None] = '0001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_JSON = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql')

COLUMNS = (
    sa.Column('source_level', sa.String(length=20), nullable=False, server_default=''),
    sa.Column('priority_level', sa.String(length=20), nullable=False, server_default=''),
    sa.Column('tech_types', _JSON, nullable=True),
    sa.Column('matrix_ref', sa.String(length=60), nullable=False, server_default=''),
    sa.Column('matrix_origin', sa.String(length=40), nullable=False, server_default=''),
    sa.Column('entry_urls', _JSON, nullable=True),
    sa.Column('reference_urls', _JSON, nullable=True),
    sa.Column('material_type', sa.Text(), nullable=False, server_default=''),
    sa.Column('access_path', sa.Text(), nullable=False, server_default=''),
    sa.Column('consult_info', sa.Text(), nullable=False, server_default=''),
    sa.Column('observations', sa.Text(), nullable=False, server_default=''),
    sa.Column('usage_restrictions', sa.Text(), nullable=False, server_default=''),
    sa.Column('scan_profile', _JSON, nullable=True),
)
INDEXES = (
    ('ix_sources_source_level', 'source_level'),
    ('ix_sources_priority_level', 'priority_level'),
)


def _existing() -> tuple[set[str], set[str]]:
    if context.is_offline_mode():
        # Generacion de SQL (--sql): no hay base que inspeccionar.
        return set(), set()
    insp = sa.inspect(op.get_bind())
    cols = {c['name'] for c in insp.get_columns('sources')}
    idx = {i['name'] for i in insp.get_indexes('sources')}
    return cols, idx


def upgrade() -> None:
    cols, idx = _existing()
    missing = [c for c in COLUMNS if c.name not in cols]
    if missing:
        with op.batch_alter_table('sources', schema=None) as batch_op:
            for column in missing:
                batch_op.add_column(column.copy())
    cols, idx = _existing()
    with op.batch_alter_table('sources', schema=None) as batch_op:
        for name, column in INDEXES:
            if name not in idx:
                batch_op.create_index(name, [column], unique=False)


def downgrade() -> None:
    if context.is_offline_mode():
        cols, idx = {c.name for c in COLUMNS}, {name for name, _ in INDEXES}
    else:
        cols, idx = _existing()
    with op.batch_alter_table('sources', schema=None) as batch_op:
        for name, _column in INDEXES:
            if name in idx:
                batch_op.drop_index(name)
        for column in reversed(COLUMNS):
            if column.name in cols:
                batch_op.drop_column(column.name)
