from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def new_id() -> str:
    return uuid4().hex


def utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=new_id)
    household_id: Mapped[str] = mapped_column(String(40), index=True, default="home")
    username: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    role: Mapped[str] = mapped_column(String(24), index=True)
    display_name: Mapped[str] = mapped_column(String(100))
    child_age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    password_salt: Mapped[str] = mapped_column(String(128))
    password_hash: Mapped[str] = mapped_column(String(128))
    status: Mapped[str] = mapped_column(String(24), default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class OperatorRecovery(Base):
    __tablename__ = "operator_recoveries"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    question: Mapped[str] = mapped_column(String(200))
    answer_salt: Mapped[str] = mapped_column(String(128))
    answer_hash: Mapped[str] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class AccountRegistration(Base):
    __tablename__ = "account_registrations"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=new_id)
    household_id: Mapped[str] = mapped_column(String(40), index=True, default="home")
    username: Mapped[str] = mapped_column(String(80), index=True)
    requested_role: Mapped[str] = mapped_column(String(24), index=True)
    display_name: Mapped[str] = mapped_column(String(100))
    child_age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    password_salt: Mapped[str] = mapped_column(String(128))
    password_hash: Mapped[str] = mapped_column(String(128))
    status: Mapped[str] = mapped_column(String(24), index=True, default="pending")
    review_note: Mapped[str] = mapped_column(String(300), default="")
    reviewed_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    __table_args__ = (
        Index("ix_registration_household_status", "household_id", "status"),
    )


class SessionToken(Base):
    __tablename__ = "session_tokens"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    device_name: Mapped[str] = mapped_column(String(120), default="browser")
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    user: Mapped[User] = relationship()


class SessionScope(Base):
    __tablename__ = "session_scopes"

    session_id: Mapped[str] = mapped_column(
        ForeignKey("session_tokens.id", ondelete="CASCADE"),
        primary_key=True,
    )
    effective_role: Mapped[str] = mapped_column(String(24))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class ContentSource(Base):
    __tablename__ = "content_sources"

    id: Mapped[str] = mapped_column(String(80), primary_key=True, default=new_id)
    household_id: Mapped[str] = mapped_column(String(40), index=True, default="home")
    name: Mapped[str] = mapped_column(String(160))
    kind: Mapped[str] = mapped_column(String(40))
    owner: Mapped[str] = mapped_column(String(120))
    base_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    terms_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    license_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    region: Mapped[str] = mapped_column(String(80), default="CN")
    allow_download: Mapped[bool] = mapped_column(Boolean, default=False)
    rate_limit: Mapped[str] = mapped_column(String(80), default="manual")
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    review_expire_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    disabled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class ContentItem(Base):
    __tablename__ = "content_items"

    id: Mapped[str] = mapped_column(String(80), primary_key=True, default=new_id)
    household_id: Mapped[str] = mapped_column(String(40), index=True, default="home")
    kind: Mapped[str] = mapped_column(String(24), index=True)
    title: Mapped[str] = mapped_column(String(240), index=True)
    subtitle: Mapped[str] = mapped_column(String(300), default="")
    language: Mapped[str] = mapped_column(String(120), default="中文")
    age_from: Mapped[int] = mapped_column(Integer, default=0)
    age_to: Mapped[int] = mapped_column(Integer, default=99)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=10)
    description: Mapped[str] = mapped_column(Text, default="")
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    accent: Mapped[str] = mapped_column(String(20), default="#6b94ba")
    cover_ref: Mapped[str | None] = mapped_column(String(500), nullable=True)
    launch_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    acquisition_mode: Mapped[str] = mapped_column(String(40), default="official_stream")
    publication_status: Mapped[str] = mapped_column(String(32), index=True, default="discovered")
    audience: Mapped[str] = mapped_column(String(24), index=True, default="family")
    stimulation_level: Mapped[str] = mapped_column(String(24), default="low")
    offline_activity: Mapped[str] = mapped_column(String(300), default="和家人聊一聊")
    featured: Mapped[bool] = mapped_column(Boolean, default=False)
    source_id: Mapped[str | None] = mapped_column(ForeignKey("content_sources.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    source: Mapped[ContentSource | None] = relationship()


class ContentRequest(Base):
    __tablename__ = "content_requests"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=new_id)
    household_id: Mapped[str] = mapped_column(String(40), index=True)
    requester_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    item_id: Mapped[str] = mapped_column(ForeignKey("content_items.id"), index=True)
    purpose: Mapped[str] = mapped_column(String(80), default="watch")
    reason: Mapped[str] = mapped_column(String(300), default="")
    status: Mapped[str] = mapped_column(String(24), index=True, default="pending")
    guardian_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    decision_scope: Mapped[str | None] = mapped_column(String(40), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    language_preference: Mapped[str | None] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    item: Mapped[ContentItem] = relationship()
    requester: Mapped[User] = relationship(foreign_keys=[requester_id])

    __table_args__ = (
        Index("ix_request_household_status", "household_id", "status"),
    )


class CommunitySubmission(Base):
    __tablename__ = "community_submissions"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=new_id)
    household_id: Mapped[str] = mapped_column(String(40), index=True)
    title: Mapped[str] = mapped_column(String(240))
    provider: Mapped[str] = mapped_column(String(60), default="other")
    original_url: Mapped[str] = mapped_column(String(1500))
    publisher_note: Mapped[str] = mapped_column(Text, default="")
    rights_note: Mapped[str] = mapped_column(Text, default="")
    rights_status: Mapped[str] = mapped_column(String(32), default="unknown")
    transfer_status: Mapped[str] = mapped_column(String(32), default="candidate")
    review_status: Mapped[str] = mapped_column(String(32), default="pending")
    submitted_by: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    transferred_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    transferred_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class DownloadJob(Base):
    __tablename__ = "download_jobs"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=new_id)
    household_id: Mapped[str] = mapped_column(String(40), index=True)
    request_id: Mapped[str | None] = mapped_column(ForeignKey("content_requests.id"), nullable=True)
    source_id: Mapped[str] = mapped_column(ForeignKey("content_sources.id"), index=True)
    content_id: Mapped[str | None] = mapped_column(ForeignKey("content_items.id"), nullable=True)
    external_id: Mapped[str] = mapped_column(String(200))
    title: Mapped[str] = mapped_column(String(240))
    content_kind: Mapped[str] = mapped_column(String(24), default="video")
    stage: Mapped[str] = mapped_column(String(32), index=True, default="queued")
    progress: Mapped[int] = mapped_column(Integer, default=0)
    bytes_done: Mapped[int] = mapped_column(BigInteger, default=0)
    expected_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    checksum: Mapped[str | None] = mapped_column(String(64), nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(80), nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime, index=True, default=utcnow)
    idempotency_key: Mapped[str] = mapped_column(String(128), unique=True)
    manifest_ref: Mapped[str | None] = mapped_column(String(300), nullable=True)
    rights_note: Mapped[str] = mapped_column(Text, default="")
    proof_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    source: Mapped[ContentSource] = relationship()
    content: Mapped[ContentItem | None] = relationship()


class CloudInboxAsset(Base):
    __tablename__ = "cloud_inbox_assets"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=new_id)
    household_id: Mapped[str] = mapped_column(String(40), index=True, default="home")
    submission_id: Mapped[str | None] = mapped_column(ForeignKey("community_submissions.id"), nullable=True)
    provider: Mapped[str] = mapped_column(String(60), default="manual")
    inbound_ref: Mapped[str] = mapped_column(String(1000))
    quarantine_ref: Mapped[str] = mapped_column(String(1000))
    original_name: Mapped[str] = mapped_column(String(300))
    mime_type: Mapped[str] = mapped_column(String(160), default="application/octet-stream")
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    sha256: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    scan_status: Mapped[str] = mapped_column(String(32), default="pending")
    quarantine_status: Mapped[str] = mapped_column(String(32), default="review")
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class ContentAsset(Base):
    __tablename__ = "content_assets"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=new_id)
    content_id: Mapped[str] = mapped_column(ForeignKey("content_items.id", ondelete="CASCADE"), index=True)
    asset_kind: Mapped[str] = mapped_column(String(24))
    storage_ref: Mapped[str] = mapped_column(String(1000))
    license_ref: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    checksum: Mapped[str] = mapped_column(String(64), unique=True)
    audience: Mapped[str] = mapped_column(String(24), default="family")
    publication_status: Mapped[str] = mapped_column(String(32), default="published")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class ContentEvent(Base):
    __tablename__ = "content_events"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=new_id)
    household_id: Mapped[str] = mapped_column(String(40), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    content_id: Mapped[str] = mapped_column(ForeignKey("content_items.id"), index=True)
    event_type: Mapped[str] = mapped_column(String(32), default="completed")
    seconds: Mapped[int] = mapped_column(Integer, default=0)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Favorite(Base):
    __tablename__ = "favorites"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    content_id: Mapped[str] = mapped_column(ForeignKey("content_items.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    __table_args__ = (UniqueConstraint("user_id", "content_id", name="uq_favorite_user_content"),)


class SystemSetting(Base):
    __tablename__ = "system_settings"

    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    updated_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=new_id)
    household_id: Mapped[str] = mapped_column(String(40), index=True, default="home")
    actor_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(120), index=True)
    resource_type: Mapped[str] = mapped_column(String(80), index=True)
    resource_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    request_id: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
