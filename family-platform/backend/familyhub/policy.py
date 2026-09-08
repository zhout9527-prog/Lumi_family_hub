from __future__ import annotations

from datetime import datetime
from urllib.parse import urlparse

from fastapi import HTTPException, status
from sqlalchemy import Select, and_, or_, select
from sqlalchemy.orm import Session

from .models import ContentItem, ContentRequest, ContentSource, User, utcnow


def visible_content_query(user: User) -> Select[tuple[ContentItem]]:
    query = select(ContentItem).where(
        ContentItem.household_id == user.household_id,
        ContentItem.publication_status == "published",
    )
    if user.role == "child":
        age = user.child_age or 0
        query = query.where(
            ContentItem.audience.in_(("child", "family")),
            ContentItem.age_from <= age,
            ContentItem.age_to >= age,
        )
    elif user.role == "guardian":
        query = query.where(ContentItem.audience.in_(("child", "family", "adult")))
    return query.order_by(ContentItem.featured.desc(), ContentItem.created_at.desc())


def require_visible_content(db: Session, user: User, item_id: str) -> ContentItem:
    item = db.scalar(visible_content_query(user).where(ContentItem.id == item_id))
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="内容不存在")
    return item


def has_active_approval(db: Session, user: User, item_id: str) -> bool:
    now = utcnow()
    request = db.scalar(
        select(ContentRequest).where(
            ContentRequest.household_id == user.household_id,
            ContentRequest.requester_id == user.id,
            ContentRequest.item_id == item_id,
            ContentRequest.status == "approved",
            or_(ContentRequest.expires_at.is_(None), ContentRequest.expires_at > now),
        )
    )
    return request is not None


def source_download_reason(source: ContentSource, now: datetime | None = None) -> str | None:
    check_time = now or utcnow()
    if source.disabled_at is not None:
        return "来源已停用"
    if source.kind == "official_stream":
        return "官方在线播放来源不能创建下载任务"
    if not source.allow_download:
        return "来源未允许下载"
    if not source.terms_url or not source.license_note:
        return "来源条款或许可记录不完整"
    if source.reviewed_at is None:
        return "来源尚未完成审核"
    if source.review_expire_at is None or source.review_expire_at <= check_time:
        return "来源审核已过期"
    return None


def url_matches_source(url: str, source: ContentSource) -> bool:
    if source.kind != "direct_http" or not source.base_url:
        return False
    candidate = urlparse(url)
    allowed = urlparse(source.base_url)
    if candidate.scheme != "https" or allowed.scheme != "https":
        return False
    if candidate.username or candidate.password or candidate.fragment:
        return False
    candidate_host = (candidate.hostname or "").rstrip(".").lower()
    allowed_host = (allowed.hostname or "").rstrip(".").lower()
    if candidate_host != allowed_host:
        return False
    allowed_path = allowed.path.rstrip("/") + "/"
    candidate_path = candidate.path or "/"
    if allowed.path not in ("", "/") and not candidate_path.startswith(allowed_path):
        return False
    return True


def require_downloadable_source(db: Session, user: User, source_id: str) -> ContentSource:
    source = db.scalar(
        select(ContentSource).where(
            ContentSource.id == source_id,
            ContentSource.household_id == user.household_id,
        )
    )
    if source is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="来源不存在")
    reason = source_download_reason(source)
    if reason:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=reason)
    return source

