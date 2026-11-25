"""Base de conocimiento de busqueda: paginas utiles de cada fuente.

Revision ID: 0008
Revises: 0007
Create Date: 2026-11-25 12:00:00

`search_knowledge` guarda las paginas que la busqueda web encontro dentro del
dominio de cada fuente, con la cuenta de visitas y de senales que aportaron.
La vigilancia las visita sin depender de un buscador (que desde la nube
responde con bloqueo). Reversible e idempotente: solo crea la tabla;
`downgrade` la quita sin tocar ninguna otra.
"""
from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa

revision: str = '0008'
down_revision: Union[str, Sequence[str], None] = '0007'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLE = 'search_knowledge'


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
        sa.Column('source_id', sa.Integer(), nullable=True),
        sa.Column('domain', sa.String(length=200), nullable=False),
        sa.Column('url', sa.String(length=1020), nullable=False),
        sa.Column('url_hash', sa.String(length=40), nullable=False),
        sa.Column('title', sa.String(length=300), nullable=False),
        sa.Column('snippet', sa.Text(), nullable=False),
        sa.Column('query', sa.String(length=300), nullable=False),
        sa.Column('engine', sa.String(length=40), nullable=False),
        sa.Column('origin', sa.String(length=20), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('visits', sa.Integer(), nullable=False),
        sa.Column('signals', sa.Integer(), nullable=False),
        sa.Column('found_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('last_visit_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_signal_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table(TABLE, schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_search_knowledge_source_id'), ['source_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_search_knowledge_domain'), ['domain'], unique=False)
        batch_op.create_index(batch_op.f('ix_search_knowledge_status'), ['status'], unique=False)
        batch_op.create_index(batch_op.f('ix_search_knowledge_url_hash'), ['url_hash'], unique=True)


def downgrade() -> None:
    if context.is_offline_mode() or _exists():
        op.drop_table(TABLE)
