"""add account registration approvals

Revision ID: 6f2c9d8a41b0
Revises: 1d7ad2716ef4
Create Date: 2026-09-07 13:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "6f2c9d8a41b0"
down_revision: Union[str, Sequence[str], None] = "1d7ad2716ef4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "account_registrations",
        sa.Column("id", sa.String(length=40), nullable=False),
        sa.Column("household_id", sa.String(length=40), nullable=False),
        sa.Column("username", sa.String(length=80), nullable=False),
        sa.Column("requested_role", sa.String(length=24), nullable=False),
        sa.Column("display_name", sa.String(length=100), nullable=False),
        sa.Column("child_age", sa.Integer(), nullable=True),
        sa.Column("password_salt", sa.String(length=128), nullable=False),
        sa.Column("password_hash", sa.String(length=128), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("review_note", sa.String(length=300), nullable=False),
        sa.Column("reviewed_by", sa.String(length=40), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["reviewed_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_account_registrations_household_id",
        "account_registrations",
        ["household_id"],
        unique=False,
    )
    op.create_index(
        "ix_account_registrations_requested_role",
        "account_registrations",
        ["requested_role"],
        unique=False,
    )
    op.create_index(
        "ix_account_registrations_status",
        "account_registrations",
        ["status"],
        unique=False,
    )
    op.create_index(
        "ix_account_registrations_username",
        "account_registrations",
        ["username"],
        unique=False,
    )
    op.create_index(
        "ix_registration_household_status",
        "account_registrations",
        ["household_id", "status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_registration_household_status", table_name="account_registrations")
    op.drop_index("ix_account_registrations_username", table_name="account_registrations")
    op.drop_index("ix_account_registrations_status", table_name="account_registrations")
    op.drop_index("ix_account_registrations_requested_role", table_name="account_registrations")
    op.drop_index("ix_account_registrations_household_id", table_name="account_registrations")
    op.drop_table("account_registrations")
