from __future__ import annotations

from typing import Any

from fastapi import Request
from sqlalchemy.orm import Session

from .models import AuditEvent, User


SENSITIVE_FRAGMENTS = ("password", "token", "cookie", "secret", "extract", "url")


def _clean(value: Any, key: str = "") -> Any:
    lowered = key.lower()
    if any(fragment in lowered for fragment in SENSITIVE_FRAGMENTS):
        return "[redacted]"
    if isinstance(value, dict):
        return {str(child_key): _clean(child_value, str(child_key)) for child_key, child_value in value.items()}
    if isinstance(value, list):
        return [_clean(item) for item in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def add_audit(
    db: Session,
    *,
    request: Request | None,
    actor: User | None,
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    metadata: dict[str, Any] | None = None,
    household_id: str | None = None,
) -> AuditEvent:
    event = AuditEvent(
        household_id=household_id or (actor.household_id if actor else "home"),
        actor_id=actor.id if actor else None,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        metadata_json=_clean(metadata or {}),
        request_id=getattr(request.state, "request_id", None) if request else None,
    )
    db.add(event)
    return event

