"""为媒体和合集分集保存原始秒级时长

Revision ID: f0e4c7a91b22
Revises: d6b8e2a1f4c0
Create Date: 2026-09-14 10:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f0e4c7a91b22"
down_revision: Union[str, None] = "d6b8e2a1f4c0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    connection = op.get_bind()
    if "duration_seconds" not in {column["name"] for column in sa.inspect(connection).get_columns("content_items")}:
        op.add_column(
            "content_items",
            sa.Column("duration_seconds", sa.Integer(), nullable=False, server_default="0"),
        )
    if "duration_seconds" not in {
        column["name"] for column in sa.inspect(connection).get_columns("content_collection_episodes")
    }:
        op.add_column(
            "content_collection_episodes",
            sa.Column("duration_seconds", sa.Integer(), nullable=False, server_default="0"),
        )
    # 老数据保持 0，避免把“整数分钟 × 60”伪装成真实时长；合集详情会按需
    # 从原平台补齐，媒体自身元数据仍是离线内容的最终回退。


def downgrade() -> None:
    connection = op.get_bind()
    if "duration_seconds" in {
        column["name"] for column in sa.inspect(connection).get_columns("content_collection_episodes")
    }:
        op.drop_column("content_collection_episodes", "duration_seconds")
    if "duration_seconds" in {column["name"] for column in sa.inspect(connection).get_columns("content_items")}:
        op.drop_column("content_items", "duration_seconds")
