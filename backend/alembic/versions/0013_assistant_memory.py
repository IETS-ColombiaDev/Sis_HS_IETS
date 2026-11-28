"""Asistente: memoria del equipo, contexto elegido y valoracion de las respuestas.

Revision ID: 0013
Revises: 0012
Create Date: 2026-11-27 22:00:00

- `assistant_knowledge`: lo que el equipo marco como util o le enseno a mano al
  asistente. Se consulta en cada pregunta.
- `chat_sessions.context_refs`: los elementos que la persona fijo como contexto.
- `chat_messages.refs` y `chat_messages.feedback`: con que registros se armo
  cada respuesta y como la valoro quien pregunto.

Reversible e idempotente: crea una tabla y agrega columnas; `downgrade` las
quita sin tocar las conversaciones.
"""
from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '0013'
down_revision: Union[str, Sequence[str], None] = '0012'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLE = 'assistant_knowledge'
# El mismo tipo que el modelo (JSONType): JSONB en PostgreSQL, JSON en SQLite.
_JSON = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql')

COLUMNS = (
    ('chat_sessions', 'context_refs', lambda: sa.Column('context_refs', _JSON, nullable=True)),
    ('chat_messages', 'refs', lambda: sa.Column('refs', _JSON, nullable=True)),
    ('chat_messages', 'feedback', lambda: sa.Column('feedback', sa.String(length=12), nullable=False, server_default='')),
)


def _tables() -> set[str]:
    if context.is_offline_mode():
        return set()
    return set(sa.inspect(op.get_bind()).get_table_names())


def _cols(table: str) -> set[str]:
    if context.is_offline_mode():
        return set()
    return {c['name'] for c in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    if TABLE not in _tables():
        op.create_table(
            TABLE,
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('title', sa.String(length=300), nullable=False),
            sa.Column('content', sa.Text(), nullable=False),
            sa.Column('kind', sa.String(length=20), nullable=False),
            sa.Column('question', sa.Text(), nullable=False),
            sa.Column('refs', _JSON, nullable=True),
            sa.Column('restricted', sa.Boolean(), nullable=False),
            sa.Column('status', sa.String(length=20), nullable=False, server_default='activa'),
            sa.Column('session_id', sa.Integer(), nullable=True),
            sa.Column('message_id', sa.Integer(), nullable=True),
            sa.Column('created_by', sa.String(length=255), nullable=False),
            sa.Column('created_by_name', sa.String(length=255), nullable=False),
            sa.Column('uses', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('last_used_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint('id'),
        )
        with op.batch_alter_table(TABLE, schema=None) as batch_op:
            batch_op.create_index(batch_op.f('ix_assistant_knowledge_kind'), ['kind'], unique=False)
            batch_op.create_index(batch_op.f('ix_assistant_knowledge_status'), ['status'], unique=False)
            batch_op.create_index(batch_op.f('ix_assistant_knowledge_message_id'), ['message_id'], unique=False)
            batch_op.create_index(batch_op.f('ix_assistant_knowledge_created_by'), ['created_by'], unique=False)

    for table in ('chat_sessions', 'chat_messages'):
        existing = _cols(table)
        missing = [make for owner, name, make in COLUMNS if owner == table and name not in existing]
        if missing:
            with op.batch_alter_table(table, schema=None) as batch_op:
                for make in missing:
                    batch_op.add_column(make())


def downgrade() -> None:
    offline = context.is_offline_mode()
    for table in ('chat_messages', 'chat_sessions'):
        existing = _cols(table)
        present = [name for owner, name, _ in COLUMNS if owner == table and (offline or name in existing)]
        if present:
            with op.batch_alter_table(table, schema=None) as batch_op:
                for name in reversed(present):
                    batch_op.drop_column(name)
    if offline or TABLE in _tables():
        op.drop_table(TABLE)
