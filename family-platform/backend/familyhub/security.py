from __future__ import annotations

import base64
import hashlib
import hmac
import re
import secrets
import unicodedata
from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import timedelta
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import get_db
from .models import SessionScope, SessionToken, User, utcnow


bearer = HTTPBearer(auto_error=False)
_HASH_SCHEME = "pbkdf2_sha256"
_LEGACY_ITERATIONS = (310_000, 260_000, 210_000, 200_000, 150_000, 120_000, 100_000)


@dataclass(frozen=True)
class SessionPrincipal:
    id: str
    household_id: str
    username: str
    role: str
    account_role: str
    display_name: str
    child_age: int | None
    status: str

    @classmethod
    def from_user(cls, user: User, effective_role: str | None = None) -> "SessionPrincipal":
        return cls(
            id=user.id,
            household_id=user.household_id,
            username=user.username,
            role=effective_role or user.role,
            account_role=user.role,
            display_name=user.display_name,
            child_age=user.child_age,
            status=user.status,
        )


def hash_password(password: str, iterations: int) -> tuple[str, str]:
    salt = secrets.token_bytes(18)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    encoded_salt = base64.urlsafe_b64encode(salt).decode("ascii")
    encoded_digest = base64.urlsafe_b64encode(digest).decode("ascii")
    return encoded_salt, f"{_HASH_SCHEME}${iterations}${encoded_digest}"


def _hash_candidates(digest_text: str, fallback_iterations: int) -> tuple[str, list[int]]:
    parts = digest_text.split("$", 2)
    if len(parts) == 3 and parts[0] == _HASH_SCHEME:
        try:
            iterations = int(parts[1])
        except ValueError:
            return "", []
        if not 1_000 <= iterations <= 2_000_000:
            return "", []
        return parts[2], [iterations]
    candidates = [fallback_iterations, *_LEGACY_ITERATIONS]
    return digest_text, list(dict.fromkeys(value for value in candidates if value > 0))


def verify_password(password: str, salt_text: str, digest_text: str, iterations: int) -> bool:
    encoded_digest, candidates = _hash_candidates(digest_text, iterations)
    try:
        salt = base64.urlsafe_b64decode(salt_text.encode("ascii"))
        expected = base64.urlsafe_b64decode(encoded_digest.encode("ascii"))
    except (ValueError, UnicodeError):
        return False
    for candidate in candidates:
        actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, candidate)
        if hmac.compare_digest(actual, expected):
            return True
    return False


def password_hash_needs_upgrade(digest_text: str, iterations: int) -> bool:
    prefix = f"{_HASH_SCHEME}${iterations}$"
    return not digest_text.startswith(prefix)


def normalize_recovery_answer(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).casefold()
    # 日期中的空格、横线、斜线和“年月日”写法都按相同答案处理。
    normalized = re.sub(r"[\s./_年月日-]+", "", normalized)
    return normalized.strip()


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_session_token(
    db: Session,
    user: User,
    *,
    device_name: str,
    session_hours: int,
    effective_role: str | None = None,
) -> tuple[str, SessionToken]:
    raw_token = secrets.token_urlsafe(36)
    session = SessionToken(
        user_id=user.id,
        token_hash=token_digest(raw_token),
        device_name=device_name[:120] or "browser",
        expires_at=utcnow() + timedelta(hours=session_hours),
    )
    db.add(session)
    db.flush()
    db.add(SessionScope(session_id=session.id, effective_role=effective_role or user.role))
    return raw_token, session


def get_current_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    db: Annotated[Session, Depends(get_db)],
) -> SessionPrincipal:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="需要登录")
    row = db.execute(
        select(SessionToken, User, SessionScope)
        .join(User, User.id == SessionToken.user_id)
        .outerjoin(SessionScope, SessionScope.session_id == SessionToken.id)
        .where(SessionToken.token_hash == token_digest(credentials.credentials))
    ).one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="会话无效")
    session_token, user, scope = row
    if session_token.revoked_at is not None or session_token.expires_at <= utcnow():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="会话已过期")
    if user.status != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="账号不可用")
    effective_role = scope.effective_role if scope and scope.effective_role in {"child", "guardian", "operator"} else user.role
    principal = SessionPrincipal.from_user(user, effective_role)
    request.state.user = principal
    request.state.account_user = user
    request.state.session_token = session_token
    return principal


CurrentUser = Annotated[SessionPrincipal, Depends(get_current_user)]


def require_roles(*allowed: str):
    def dependency(user: CurrentUser) -> SessionPrincipal:
        if user.role not in allowed:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="没有该操作权限")
        return user

    return dependency


class LoginLimiter:
    def __init__(self, max_attempts: int = 8, window_seconds: int = 300) -> None:
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self._attempts: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str, now: float) -> bool:
        attempts = self._attempts[key]
        while attempts and now - attempts[0] > self.window_seconds:
            attempts.popleft()
        if len(attempts) >= self.max_attempts:
            return False
        attempts.append(now)
        return True

    def clear(self, key: str) -> None:
        self._attempts.pop(key, None)
