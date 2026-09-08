from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import ContentEvent, ContentItem, ContentRequest, Favorite, User
from .schemas import ContentOut, ContentRequestOut, SubmissionOut


def content_flags(db: Session, user: User) -> tuple[set[str], set[str]]:
    favorites = set(db.scalars(select(Favorite.content_id).where(Favorite.user_id == user.id)).all())
    completed = set(
        db.scalars(
            select(ContentEvent.content_id).where(
                ContentEvent.user_id == user.id,
                ContentEvent.event_type == "completed",
            )
        ).all()
    )
    return favorites, completed


def present_content(
    item: ContentItem,
    *,
    favorites: set[str] | None = None,
    completed: set[str] | None = None,
    local_ids: set[str] | None = None,
) -> ContentOut:
    return ContentOut(
        id=item.id,
        kind=item.kind,
        title=item.title,
        subtitle=item.subtitle,
        language=item.language,
        age_from=item.age_from,
        age_to=item.age_to,
        duration_minutes=item.duration_minutes,
        description=item.description,
        tags=list(item.tags or []),
        accent=item.accent,
        cover_ref=item.cover_ref,
        acquisition_mode=item.acquisition_mode,
        publication_status=item.publication_status,
        audience=item.audience,
        stimulation_level=item.stimulation_level,
        offline_activity=item.offline_activity,
        featured=item.featured,
        favorite=item.id in (favorites or set()),
        completed=item.id in (completed or set()),
        local_available=item.id in (local_ids or set()),
    )


def present_request(request: ContentRequest) -> ContentRequestOut:
    return ContentRequestOut(
        id=request.id,
        item_id=request.item_id,
        item_title=request.item.title,
        requester_id=request.requester_id,
        requester_name=request.requester.display_name,
        purpose=request.purpose,
        reason=request.reason,
        status=request.status,
        decision_scope=request.decision_scope,
        expires_at=request.expires_at,
        created_at=request.created_at,
        decided_at=request.decided_at,
    )


def present_submission(submission, *, include_url: bool) -> SubmissionOut:
    return SubmissionOut(
        id=submission.id,
        title=submission.title,
        provider=submission.provider,
        original_url=submission.original_url if include_url else None,
        publisher_note=submission.publisher_note,
        rights_note=submission.rights_note,
        rights_status=submission.rights_status,
        transfer_status=submission.transfer_status,
        review_status=submission.review_status,
        submitted_by=submission.submitted_by,
        created_at=submission.created_at,
    )
