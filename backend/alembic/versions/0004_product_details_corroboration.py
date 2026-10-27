"""Datos de producto, corroboracion entre fuentes y campos editados de la fuente.

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-27 16:00:00

Validacion del modulo 0 (consolidado de observaciones SI EAA):

- RF-003: `technologies.dosage_form`, `strength`, `route`, `brand`,
  `device_model` y `findings.details` (datos extraidos en la captura).
- RF-002: `technologies.corroboration_count`, `corroboration_bonus` y
  `corroborating` (la misma tecnologia vista en otras fuentes).
- OBS-002: `sources.edited_fields`, para que la sincronizacion del catalogo
  actualice las URL de la matriz sin pisar lo que el equipo edito.

Es idempotente: solo agrega las columnas que falten.
"""
from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '0004'
down_revision: Union[str, Sequence[str], None] = '0003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_JSON = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql')

_COLUMNS = {
    'technologies': [
        sa.Column('dosage_form', sa.String(length=200), nullable=False, server_default=''),
        sa.Column('strength', sa.String(length=200), nullable=False, server_default=''),
        sa.Column('route', sa.String(length=120), nullable=False, server_default=''),
        sa.Column('brand', sa.String(length=200), nullable=False, server_default=''),
        sa.Column('device_model', sa.String(length=200), nullable=False, server_default=''),
        sa.Column('corroboration_count', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('corroboration_bonus', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('corroborating', _JSON, nullable=True),
    ],
    'findings': [sa.Column('details', _JSON, nullable=True)],
    'sources': [sa.Column('edited_fields', _JSON, nullable=True)],
}


def _existing(table: str) -> set[str]:
    if context.is_offline_mode():
        return set()
    return {c['name'] for c in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    for table, columns in _COLUMNS.items():
        present = _existing(table)
        missing = [c for c in columns if c.name not in present]
        if not missing:
            continue
        with op.batch_alter_table(table, schema=None) as batch_op:
            for column in missing:
                batch_op.add_column(column.copy())


def downgrade() -> None:
    for table, columns in _COLUMNS.items():
        present = _existing(table)
        drop = [c.name for c in columns if context.is_offline_mode() or c.name in present]
        if not drop:
            continue
        with op.batch_alter_table(table, schema=None) as batch_op:
            for name in drop:
                batch_op.drop_column(name)
