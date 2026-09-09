"""增加运维密保和会话角色范围

Revision ID: a31f6cb84e20
Revises: 6f2c9d8a41b0
Create Date: 2026-09-08 11:30:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a31f6cb84e20"
down_revision: Union[str, None] = "6f2c9d8a41b0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "operator_recoveries",
        sa.Column("user_id", sa.String(length=40), nullable=False),
        sa.Column("question", sa.String(length=200), nullable=False),
        sa.Column("answer_salt", sa.String(length=128), nullable=False),
        sa.Column("answer_hash", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id"),
    )
    op.create_table(
        "session_scopes",
        sa.Column("session_id", sa.String(length=40), nullable=False),
        sa.Column("effective_role", sa.String(length=24), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["session_tokens.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("session_id"),
    )


def downgrade() -> None:
    op.drop_table("session_scopes")
    op.drop_table("operator_recoveries")
