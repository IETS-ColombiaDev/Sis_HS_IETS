"""${message}

Revision ID: ${up_revision}
Revises: ${down_revision | comma,n}
Create Date: ${create_date}

Antes de confirmar la revision: revisela a mano (el autogenerate no detecta
renombres, disparadores ni indices GIN), pruebela con
`python -m pytest tests/test_frente_d_migrations.py` y, si toca datos,
ensayela sobre una copia de la base real. Ver DEPLOY.md, "Crear una migracion".
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
${imports if imports else ""}

# Identificadores de la revision, usados por Alembic.
revision: str = ${repr(up_revision)}
down_revision: Union[str, Sequence[str], None] = ${repr(down_revision)}
branch_labels: Union[str, Sequence[str], None] = ${repr(branch_labels)}
depends_on: Union[str, Sequence[str], None] = ${repr(depends_on)}


def upgrade() -> None:
    ${upgrades if upgrades else "pass"}


def downgrade() -> None:
    ${downgrades if downgrades else "pass"}
