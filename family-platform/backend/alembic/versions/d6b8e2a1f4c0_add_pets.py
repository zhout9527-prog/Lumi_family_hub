"""增加家庭伙伴及互动流水

Revision ID: d6b8e2a1f4c0
Revises: c4e18f5a920d
Create Date: 2026-09-12 18:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d6b8e2a1f4c0"
down_revision: Union[str, None] = "c4e18f5a920d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "pets",
        sa.Column("id", sa.String(length=40), nullable=False),
        sa.Column("household_id", sa.String(length=40), nullable=False),
        sa.Column("owner_user_id", sa.String(length=40), nullable=False),
        sa.Column("name", sa.String(length=40), nullable=False),
        sa.Column("species", sa.String(length=40), nullable=False),
        sa.Column("personality", sa.String(length=40), nullable=False),
        sa.Column("growth_stage", sa.String(length=24), nullable=False),
        sa.Column("growth_points", sa.Integer(), nullable=False),
        sa.Column("mood", sa.Integer(), nullable=False),
        sa.Column("energy", sa.Integer(), nullable=False),
        sa.Column("curiosity", sa.Integer(), nullable=False),
        sa.Column("cleanliness", sa.Integer(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("last_interaction_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["owner_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("owner_user_id", name="uq_pet_owner_user"),
    )
    op.create_index("ix_pets_household_id", "pets", ["household_id"])
    op.create_index("ix_pets_owner_user_id", "pets", ["owner_user_id"])
    op.create_index("ix_pets_species", "pets", ["species"])
    op.create_index("ix_pet_household_owner", "pets", ["household_id", "owner_user_id"])

    op.create_table(
        "pet_events",
        sa.Column("id", sa.String(length=40), nullable=False),
        sa.Column("pet_id", sa.String(length=40), nullable=False),
        sa.Column("household_id", sa.String(length=40), nullable=False),
        sa.Column("actor_user_id", sa.String(length=40), nullable=False),
        sa.Column("action", sa.String(length=32), nullable=False),
        sa.Column("idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("points", sa.Integer(), nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["pet_id"], ["pets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("idempotency_key"),
    )
    op.create_index("ix_pet_events_pet_id", "pet_events", ["pet_id"])
    op.create_index("ix_pet_events_household_id", "pet_events", ["household_id"])
    op.create_index("ix_pet_events_actor_user_id", "pet_events", ["actor_user_id"])
    op.create_index("ix_pet_events_action", "pet_events", ["action"])
    op.create_index("ix_pet_events_idempotency_key", "pet_events", ["idempotency_key"])
    op.create_index("ix_pet_events_created_at", "pet_events", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_pet_events_created_at", table_name="pet_events")
    op.drop_index("ix_pet_events_idempotency_key", table_name="pet_events")
    op.drop_index("ix_pet_events_action", table_name="pet_events")
    op.drop_index("ix_pet_events_actor_user_id", table_name="pet_events")
    op.drop_index("ix_pet_events_household_id", table_name="pet_events")
    op.drop_index("ix_pet_events_pet_id", table_name="pet_events")
    op.drop_table("pet_events")
    op.drop_index("ix_pet_household_owner", table_name="pets")
    op.drop_index("ix_pets_species", table_name="pets")
    op.drop_index("ix_pets_owner_user_id", table_name="pets")
    op.drop_index("ix_pets_household_id", table_name="pets")
    op.drop_table("pets")
