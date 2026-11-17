"""Enlace de la senal a su fuente original (RF-001, III seguimiento).

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-17 12:00:00

`findings.query_url` (pagina consultada), `link_type` (exacto | consulta |
sin_enlace), `link_status`, `link_http`, `link_checked_at` (verificacion del
enlace) y `evidence` (titulo, fragmento, fecha y hora, URL consultada).

Reversible e idempotente: solo agrega columnas; `downgrade` las quita sin tocar
`findings.url`, que conserva la URL capturada.
"""
from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '0005'
down_revision: Union[str, Sequence[str], None] = '0004'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_JSON = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql')

_COLUMNS = [
    sa.Column('query_url', sa.String(length=1024), nullable=False, server_default=''),
    sa.Column('link_type', sa.String(length=20), nullable=False, server_default=''),
    sa.Column('link_status', sa.String(length=20), nullable=False, server_default=''),
    sa.Column('link_http', sa.Integer(), nullable=False, server_default='0'),
    sa.Column('link_checked_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('evidence', _JSON, nullable=True),
]
_INDEX = 'ix_findings_link_type'


def _existing() -> set[str]:
    if context.is_offline_mode():
        return set()
    return {c['name'] for c in sa.inspect(op.get_bind()).get_columns('findings')}


def _indexes() -> set[str]:
    if context.is_offline_mode():
        return set()
    return {i['name'] for i in sa.inspect(op.get_bind()).get_indexes('findings')}


def upgrade() -> None:
    present = _existing()
    missing = [c for c in _COLUMNS if c.name not in present]
    if missing:
        with op.batch_alter_table('findings', schema=None) as batch_op:
            for column in missing:
                batch_op.add_column(column.copy())
    if _INDEX not in _indexes():
        op.create_index(_INDEX, 'findings', ['link_type'], unique=False)


def downgrade() -> None:
    if context.is_offline_mode() or _INDEX in _indexes():
        op.drop_index(_INDEX, table_name='findings')
    present = _existing()
    drop = [c.name for c in _COLUMNS if context.is_offline_mode() or c.name in present]
    if drop:
        with op.batch_alter_table('findings', schema=None) as batch_op:
            for name in drop:
                batch_op.drop_column(name)
