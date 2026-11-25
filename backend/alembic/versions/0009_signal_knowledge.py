"""Base de conocimiento de senales: memoria para sugerir clasificaciones.

Revision ID: 0009
Revises: 0008
Create Date: 2026-11-25 18:00:00

`signal_knowledge` guarda un documento por tecnologia capturada (texto, origen,
ano y la decision del equipo). Se reconstruye entera desde `technologies`.
Reversible e idempotente: solo crea la tabla; `downgrade` la quita sin tocar
ninguna otra.
"""
from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '0009'
down_revision: Union[str, Sequence[str], None] = '0008'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLE = 'signal_knowledge'
# El mismo tipo que el modelo (JSONType): JSONB en PostgreSQL, JSON en SQLite.
_JSON = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql')


def _exists() -> bool:
    if context.is_offline_mode():
        return False
    return TABLE in sa.inspect(op.get_bind()).get_table_names()


def upgrade() -> None:
    if _exists():
        return
    op.create_table(
        TABLE,
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('technology_id', sa.Integer(), nullable=False),
        sa.Column('finding_id', sa.Integer(), nullable=True),
        sa.Column('source_id', sa.Integer(), nullable=True),
        sa.Column('origin', sa.String(length=20), nullable=False),
        sa.Column('name', sa.String(length=400), nullable=False),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column('terms', _JSON, nullable=True),
        sa.Column('year', sa.Integer(), nullable=True),
        sa.Column('cluster_id', sa.Integer(), nullable=True),
        sa.Column('tech_type_id', sa.Integer(), nullable=True),
        sa.Column('condition', sa.String(length=20), nullable=False),
        sa.Column('decision', sa.String(length=20), nullable=False),
        sa.Column('reason', sa.Text(), nullable=False),
        sa.Column('url', sa.String(length=1024), nullable=False),
        sa.Column('captured_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('source_updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('indexed_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table(TABLE, schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_signal_knowledge_technology_id'), ['technology_id'], unique=True)
        batch_op.create_index(batch_op.f('ix_signal_knowledge_source_id'), ['source_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_signal_knowledge_origin'), ['origin'], unique=False)
        batch_op.create_index(batch_op.f('ix_signal_knowledge_year'), ['year'], unique=False)
        batch_op.create_index(batch_op.f('ix_signal_knowledge_decision'), ['decision'], unique=False)


def downgrade() -> None:
    if context.is_offline_mode() or _exists():
        op.drop_table(TABLE)
