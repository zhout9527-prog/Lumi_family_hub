"""增加外部平台合集和分集模型

Revision ID: c4e18f5a920d
Revises: a31f6cb84e20
Create Date: 2026-09-11 15:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c4e18f5a920d"
down_revision: Union[str, None] = "a31f6cb84e20"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "content_collections",
        sa.Column("id", sa.String(length=100), nullable=False),
        sa.Column("household_id", sa.String(length=40), nullable=False),
        sa.Column("provider", sa.String(length=40), nullable=False),
        sa.Column("external_id", sa.String(length=200), nullable=False),
        sa.Column("title", sa.String(length=240), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("cover_url", sa.String(length=1000), nullable=True),
        sa.Column("source_url", sa.String(length=1000), nullable=False),
        sa.Column("collection_kind", sa.String(length=40), nullable=False),
        sa.Column("episode_count", sa.Integer(), nullable=False),
        sa.Column("publication_status", sa.String(length=24), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_content_collections_household_id", "content_collections", ["household_id"])
    op.create_index("ix_content_collections_provider", "content_collections", ["provider"])
    op.create_index("ix_content_collections_external_id", "content_collections", ["external_id"])
    op.create_index("ix_content_collections_publication_status", "content_collections", ["publication_status"])
    op.create_table(
        "content_collection_episodes",
        sa.Column("id", sa.String(length=100), nullable=False),
        sa.Column("collection_id", sa.String(length=100), nullable=False),
        sa.Column("content_id", sa.String(length=80), nullable=True),
        sa.Column("external_id", sa.String(length=200), nullable=False),
        sa.Column("page_number", sa.Integer(), nullable=False),
        sa.Column("episode_index", sa.Integer(), nullable=False),
        sa.Column("section_title", sa.String(length=240), nullable=False),
        sa.Column("title", sa.String(length=240), nullable=False),
        sa.Column("source_url", sa.String(length=1000), nullable=False),
        sa.Column("cover_url", sa.String(length=1000), nullable=True),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("publication_status", sa.String(length=24), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["collection_id"], ["content_collections.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["content_id"], ["content_items.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_content_collection_episodes_collection_id", "content_collection_episodes", ["collection_id"])
    op.create_index("ix_content_collection_episodes_content_id", "content_collection_episodes", ["content_id"])
    op.create_index("ix_content_collection_episodes_external_id", "content_collection_episodes", ["external_id"])
    op.create_index("ix_content_collection_episodes_publication_status", "content_collection_episodes", ["publication_status"])
    op.create_index(
        "ix_collection_episode_order",
        "content_collection_episodes",
        ["collection_id", "episode_index"],
    )


def downgrade() -> None:
    op.drop_index("ix_collection_episode_order", table_name="content_collection_episodes")
    op.drop_table("content_collection_episodes")
    op.drop_table("content_collections")
