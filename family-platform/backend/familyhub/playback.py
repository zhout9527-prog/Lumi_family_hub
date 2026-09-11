from __future__ import annotations

import hashlib
import secrets
import threading
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from .models import utcnow


@dataclass(frozen=True)
class PlaybackGrant:
    user_id: str
    session_id: str
    content_id: str
    expires_at: datetime
    metadata: dict[str, Any]


class PlaybackTickets:
    """In-memory, short-lived grants for media elements that cannot set auth headers."""

    def __init__(self, lifetime: timedelta = timedelta(hours=2)) -> None:
        self.lifetime = lifetime
        self._grants: dict[str, PlaybackGrant] = {}
        self._lock = threading.Lock()

    def issue(
        self,
        *,
        user_id: str,
        session_id: str,
        content_id: str,
        metadata: dict[str, Any] | None = None,
    ) -> tuple[str, PlaybackGrant]:
        raw = secrets.token_urlsafe(32)
        grant = PlaybackGrant(
            user_id=user_id,
            session_id=session_id,
            content_id=content_id,
            expires_at=utcnow() + self.lifetime,
            metadata=dict(metadata or {}),
        )
        with self._lock:
            self._remove_expired()
            self._grants[self._digest(raw)] = grant
        return raw, grant

    def resolve(self, raw: str, *, content_id: str) -> PlaybackGrant | None:
        with self._lock:
            self._remove_expired()
            grant = self._grants.get(self._digest(raw))
            if grant is None or grant.content_id != content_id:
                return None
            return grant

    def _remove_expired(self) -> None:
        now = utcnow()
        expired = [digest for digest, grant in self._grants.items() if grant.expires_at <= now]
        for digest in expired:
            self._grants.pop(digest, None)

    @staticmethod
    def _digest(raw: str) -> str:
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()
