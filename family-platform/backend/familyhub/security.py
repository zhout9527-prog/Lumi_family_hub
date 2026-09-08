from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
from collections import defaultdict, deque
from datetime import timedelta
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import get_db
from .models import SessionToken, User, utcnow


bearer = HTTPBearer(auto_error=False)


def hash_password(password: str, iterations: int) -> tuple[str, str]:
    salt = secrets.token_bytes(18)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return base64.urlsafe_b64encode(salt).decode("ascii"), base64.urlsafe_b64encode(digest).decode("ascii")


def verify_password(password: str, salt_text: str, digest_text: str, iterations: int) -> bool:
    try:
        salt = base64.urlsafe_b64decode(salt_text.encode("ascii"))
        expected = base64.urlsafe_b64decode(digest_text.encode("ascii"))
    except (ValueError, UnicodeError):
        return False
    actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return hmac.compare_digest(actual, expected)


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_session_token(
    db: Session,
    user: User,
    *,
    device_name: str,
    session_hours: int,
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
    return raw_token, session


def get_current_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="需要登录")
    row = db.execute(
        select(SessionToken, User)
        .join(User, User.id == SessionToken.user_id)
        .where(SessionToken.token_hash == token_digest(credentials.credentials))
    ).one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="会话无效")
    session_token, user = row
    if session_token.revoked_at is not None or session_token.expires_at <= utcnow():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="会话已过期")
    if user.status != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="账号不可用")
    request.state.user = user
    request.state.session_token = session_token
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_roles(*allowed: str):
    def dependency(user: CurrentUser) -> User:
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

