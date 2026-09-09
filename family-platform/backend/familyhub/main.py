from __future__ import annotations

import hashlib
import ipaddress
import secrets
import time
from collections import Counter
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Annotated, Any
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Query, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from . import __version__
from .audit import add_audit
from .bilibili import BILIBILI_SOURCE_ID, normalize_bilibili_url
from .config import Settings
from .database import Base, build_engine, build_session_factory, get_db
from .download import write_manifest
from .external import (
    ExternalCatalogError,
    extract_bilibili_entries,
    load_external_feeds,
    new_external_feed,
    normalize_bilibili_catalog_url,
    provider_for_url,
    save_external_feeds,
    sync_external_feed,
    upsert_bilibili_entries,
    upsert_external_item,
)
from .library import (
    load_storage_paths,
    managed_item_payload,
    register_local_file,
    resolve_asset_path,
    save_storage_paths,
    scan_managed_library,
    storage_paths_payload,
)
from .models import (
    AccountRegistration,
    AuditEvent,
    CloudInboxAsset,
    CommunitySubmission,
    ContentEvent,
    ContentAsset,
    ContentItem,
    ContentRequest,
    ContentSource,
    DownloadJob,
    Favorite,
    OperatorRecovery,
    SessionToken,
    SystemSetting,
    User,
    new_id,
    utcnow,
)
from .policy import require_downloadable_source, require_visible_content, url_matches_source, visible_content_query
from .presenters import content_flags, present_content, present_request, present_submission
from .playback import PlaybackTickets
from .releases import load_manifest, tauri_update_payload
from .schemas import (
    AssetOut,
    AssetReviewIn,
    BilibiliDownloadIn,
    CompleteIn,
    ContentOut,
    ContentRequestIn,
    ContentRequestOut,
    DecisionIn,
    DirectDownloadIn,
    ExternalFeedIn,
    ExternalFeedOut,
    ExternalItemIn,
    HealthOut,
    JobOut,
    LoginIn,
    LoginOut,
    LibraryItemOut,
    LibraryItemUpdateIn,
    LibraryScanOut,
    LocalLibraryImportIn,
    ManagedUserOut,
    OperationMessageOut,
    OperatorPasswordResetIn,
    OperatorRecoveryQuestionIn,
    OperatorRecoveryQuestionOut,
    OperatorSetupIn,
    PlaybackOut,
    RegistrationDecisionIn,
    RegistrationIn,
    RegistrationOut,
    SourceIn,
    SourceOut,
    SourceValidateIn,
    StoragePathsIn,
    StoragePathsOut,
    SubmissionIn,
    SubmissionOut,
    TransferConfirmIn,
    UserStatusIn,
    UserOut,
    ReleaseManifestOut,
)
from .security import (
    LoginLimiter,
    SessionPrincipal,
    bearer,
    create_session_token,
    get_current_user,
    hash_password,
    normalize_recovery_answer,
    password_hash_needs_upgrade,
    require_roles,
    token_digest,
    verify_password,
)
from .seed import seed_database
from .services import apply_asset_review, system_status
from .worker import FamilyWorker


Db = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[SessionPrincipal, Depends(get_current_user)]
Guardian = Annotated[SessionPrincipal, Depends(require_roles("guardian"))]
Operator = Annotated[SessionPrincipal, Depends(require_roles("operator"))]
GuardianOrOperator = Annotated[SessionPrincipal, Depends(require_roles("guardian", "operator"))]


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


SettingsDep = Annotated[Settings, Depends(get_settings)]


def _require_server_loopback(request: Request, settings: Settings) -> None:
    client_host = request.client.host if request.client else ""
    try:
        is_loopback = ipaddress.ip_address(client_host).is_loopback
    except ValueError:
        is_loopback = settings.environment == "test" and client_host == "testclient"
    if not is_loopback:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="运维账户只能在 Lumi Server 本机管理")


def _normalized_recovery_answer(answer: str, password: str | None = None) -> str:
    normalized = normalize_recovery_answer(answer)
    if len(normalized) < 2:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="密保答案至少需要 2 个有效字符")
    if password is not None and normalize_recovery_answer(password) == normalized:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="密保答案不能与登录密码相同")
    return normalized


def _create_operator(db: Session, payload: OperatorSetupIn, settings: Settings) -> User:
    if db.scalar(select(User.id).where(User.username == payload.username)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="这个登录账号已存在")
    normalized_answer = _normalized_recovery_answer(payload.recovery_answer, payload.password)
    password_salt, password_hash = hash_password(payload.password, settings.password_iterations)
    answer_salt, answer_hash = hash_password(normalized_answer, settings.password_iterations)
    user = User(
        username=payload.username,
        role="operator",
        display_name=payload.display_name,
        password_salt=password_salt,
        password_hash=password_hash,
        status="active",
    )
    db.add(user)
    db.flush()
    db.add(
        OperatorRecovery(
            user_id=user.id,
            question=payload.recovery_question,
            answer_salt=answer_salt,
            answer_hash=answer_hash,
        )
    )
    return user


def _naive_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(UTC).replace(tzinfo=None)


def _content_list(db: Session, user: User, query: str | None = None) -> list[ContentOut]:
    items = list(db.scalars(visible_content_query(user)).all())
    if query:
        needle = query.strip().casefold()
        items = [
            item
            for item in items
            if needle in item.title.casefold()
            or needle in item.subtitle.casefold()
            or any(needle in str(tag).casefold() for tag in (item.tags or []))
        ]
    if user.role == "child":
        items = items[:12]
    favorites, completed = content_flags(db, user)
    item_ids = [item.id for item in items]
    local_ids = set(
        db.scalars(
            select(ContentAsset.content_id).where(
                ContentAsset.content_id.in_(item_ids),
                ContentAsset.publication_status == "published",
            )
        ).all()
    ) if item_ids else set()
    if user.role == "child" and item_ids:
        launch_allowed_ids = set(
            db.scalars(
                select(ContentRequest.item_id).where(
                    ContentRequest.requester_id == user.id,
                    ContentRequest.item_id.in_(item_ids),
                    ContentRequest.status == "approved",
                    ContentRequest.expires_at.is_(None) | (ContentRequest.expires_at > utcnow()),
                )
            ).all()
        )
    else:
        launch_allowed_ids = set(item_ids)
    return [
        present_content(
            item,
            favorites=favorites,
            completed=completed,
            local_ids=local_ids,
            launch_allowed_ids=launch_allowed_ids,
        )
        for item in items
    ]


def _requests_for_household(db: Session, household_id: str) -> list[ContentRequest]:
    return list(
        db.scalars(
            select(ContentRequest)
            .where(ContentRequest.household_id == household_id)
            .order_by(ContentRequest.created_at.desc())
        ).all()
    )


def _submissions_for_household(db: Session, household_id: str) -> list[CommunitySubmission]:
    return list(
        db.scalars(
            select(CommunitySubmission)
            .where(CommunitySubmission.household_id == household_id)
            .order_by(CommunitySubmission.created_at.desc())
        ).all()
    )


def _jobs_for_household(db: Session, household_id: str) -> list[DownloadJob]:
    return list(
        db.scalars(
            select(DownloadJob)
            .where(DownloadJob.household_id == household_id)
            .order_by(DownloadJob.created_at.desc())
        ).all()
    )


def _assets_for_household(db: Session, household_id: str) -> list[CloudInboxAsset]:
    return list(
        db.scalars(
            select(CloudInboxAsset)
            .where(CloudInboxAsset.household_id == household_id)
            .order_by(CloudInboxAsset.created_at.desc())
        ).all()
    )


def create_app(settings: Settings | None = None) -> FastAPI:
    active_settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        active_settings.ensure_directories()
        engine = build_engine(active_settings)
        session_factory = build_session_factory(engine)
        Base.metadata.create_all(engine)
        with session_factory() as db:
            seed_database(db, active_settings)
            load_storage_paths(db, active_settings, ensure=True)
        app.state.settings = active_settings
        app.state.engine = engine
        app.state.session_factory = session_factory
        app.state.login_limiter = LoginLimiter()
        app.state.registration_limiter = LoginLimiter(max_attempts=5, window_seconds=600)
        app.state.recovery_limiter = LoginLimiter(max_attempts=8, window_seconds=600)
        app.state.playback_tickets = PlaybackTickets()
        yield
        engine.dispose()

    app = FastAPI(
        title=active_settings.app_name,
        version=__version__,
        docs_url="/api/docs" if active_settings.environment != "production" else None,
        redoc_url=None,
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=active_settings.allowed_origins,
        allow_origin_regex=active_settings.cors_lan_regex,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "Idempotency-Key", "X-Request-ID"],
        expose_headers=["X-Request-ID"],
    )

    @app.middleware("http")
    async def request_id_middleware(request: Request, call_next):
        supplied = request.headers.get("X-Request-ID", "")
        request.state.request_id = supplied[:80] if supplied and supplied.replace("-", "").isalnum() else secrets.token_hex(12)
        response = await call_next(request)
        response.headers["X-Request-ID"] = request.state.request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        # API 响应可能包含会话或家庭范围的数据，明确禁止缓存，避免浏览器、
        # 反向代理或未使用内置 Service Worker 防护的客户端复用响应。
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store, max-age=0"
            response.headers["Pragma"] = "no-cache"
        return response

    app.include_router(router)
    frontend_dist = Path(__file__).resolve().parents[2] / "dist"
    if frontend_dist.is_dir():
        app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="family-web")
    return app


router = APIRouter(prefix="/api/v1")


@router.get("/health", response_model=HealthOut, tags=["system"])
def health(db: Db) -> HealthOut:
    database_ok = db.scalar(select(func.count()).select_from(User)) is not None
    operator_count = db.scalar(select(func.count()).select_from(User).where(User.role == "operator")) or 0
    return HealthOut(
        status="ok" if database_ok else "degraded",
        version=__version__,
        database="ok" if database_ok else "error",
        setup_required=operator_count == 0,
    )


@router.get("/updates/manifest", response_model=ReleaseManifestOut, tags=["updates"])
@router.get("/releases/latest", response_model=ReleaseManifestOut, tags=["updates"])
def update_manifest(settings: SettingsDep, response: Response) -> dict[str, Any]:
    """Return the public release manifest for phone, TV and desktop clients.

    This endpoint is intentionally unauthenticated so an installed client can
    check for updates before a user signs in.  It exposes metadata only; the
    actual artifact URL remains subject to the release server's own access
    controls.
    """

    response.headers["Cache-Control"] = "no-store, max-age=0"
    response.headers["Pragma"] = "no-cache"
    return load_manifest(settings)


@router.get("/updates/tauri", response_model=None, tags=["updates"])
@router.get("/releases/tauri", response_model=None, tags=["updates"])
def tauri_update(
    settings: SettingsDep,
    response: Response,
    target: str = Query(default="", min_length=1, max_length=120),
    arch: str = Query(default="", max_length=40),
    current_version: str = Query(default=__version__, max_length=80),
    channel: str | None = Query(default=None, max_length=40),
) -> dict[str, Any] | Response:
    """Expose the JSON shape expected by the Tauri v2 updater plugin.

    ``204`` means there is no applicable update.  A target and architecture
    are required to prevent accidentally returning a signed artifact to an
    unrelated client.
    """

    no_cache_headers = {
        "Cache-Control": "no-store, max-age=0",
        "Pragma": "no-cache",
    }
    response.headers.update(no_cache_headers)
    if not target.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="缺少 target")
    payload = tauri_update_payload(settings, target.strip(), arch.strip(), current_version.strip(), channel)
    if payload is None:
        return Response(status_code=status.HTTP_204_NO_CONTENT, headers=no_cache_headers)
    return payload


@router.post("/auth/login", response_model=LoginOut, tags=["auth"])
def login(payload: LoginIn, request: Request, db: Db, settings: SettingsDep) -> LoginOut:
    client = request.client.host if request.client else "unknown"
    limiter_key = f"{client}:{payload.username.casefold()}"
    limiter: LoginLimiter = request.app.state.login_limiter
    if not limiter.allow(limiter_key, time.monotonic()):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="登录尝试过多，请稍后再试")
    user = db.scalar(select(User).where(User.username == payload.username.strip()))
    if user is None or user.status != "active" or not verify_password(
        payload.password,
        user.password_salt if user else "",
        user.password_hash if user else "",
        settings.password_iterations,
    ):
        add_audit(
            db,
            request=request,
            actor=None,
            action="auth.login_failed",
            resource_type="session",
            metadata={"username": payload.username[:80]},
        )
        db.commit()
        pending = db.scalar(
            select(AccountRegistration.id).where(
                AccountRegistration.username == payload.username.strip(),
                AccountRegistration.status == "pending",
            )
        )
        detail = "账号正在等待运维管理员审批" if pending else "用户名或密码错误"
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)
    if payload.app_edition == "client" and user.role == "operator":
        effective_role = "guardian"
    else:
        effective_role = user.role
    if payload.app_edition == "server" and user.role != "operator":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="儿童和家长账号请使用 Lumi Client")
    if password_hash_needs_upgrade(user.password_hash, settings.password_iterations):
        user.password_salt, user.password_hash = hash_password(payload.password, settings.password_iterations)
    limiter.clear(limiter_key)
    raw_token, session = create_session_token(
        db,
        user,
        device_name=payload.device_name,
        session_hours=settings.session_hours,
        effective_role=effective_role,
    )
    add_audit(
        db,
        request=request,
        actor=user,
        action="auth.login",
        resource_type="session",
        resource_id=session.id,
        metadata={"app_edition": payload.app_edition, "effective_role": effective_role},
    )
    db.commit()
    principal = SessionPrincipal.from_user(user, effective_role)
    return LoginOut(access_token=raw_token, expires_at=session.expires_at, user=UserOut.model_validate(principal))


@router.post("/auth/operator-setup", response_model=UserOut, status_code=status.HTTP_201_CREATED, tags=["auth"])
def setup_operator(payload: OperatorSetupIn, request: Request, db: Db, settings: SettingsDep) -> UserOut:
    _require_server_loopback(request, settings)
    if db.scalar(select(User.id).where(User.role == "operator")):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="运维账户已经初始化")
    user = _create_operator(db, payload, settings)
    add_audit(
        db,
        request=request,
        actor=user,
        action="account.operator_initialized",
        resource_type="user",
        resource_id=user.id,
    )
    db.commit()
    return UserOut.model_validate(user)


@router.post("/auth/operators", response_model=UserOut, status_code=status.HTTP_201_CREATED, tags=["auth"])
def register_operator(payload: OperatorSetupIn, request: Request, db: Db, settings: SettingsDep) -> UserOut:
    _require_server_loopback(request, settings)
    if not db.scalar(select(User.id).where(User.role == "operator")):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="请先完成首次运维账户设置")
    user = _create_operator(db, payload, settings)
    add_audit(
        db,
        request=request,
        actor=user,
        action="account.operator_registered_local",
        resource_type="user",
        resource_id=user.id,
    )
    db.commit()
    return UserOut.model_validate(user)


@router.post(
    "/auth/operator-recovery/question",
    response_model=OperatorRecoveryQuestionOut,
    tags=["auth"],
)
def operator_recovery_question(
    payload: OperatorRecoveryQuestionIn,
    request: Request,
    db: Db,
    settings: SettingsDep,
) -> OperatorRecoveryQuestionOut:
    _require_server_loopback(request, settings)
    limiter: LoginLimiter = request.app.state.recovery_limiter
    client = request.client.host if request.client else "unknown"
    if not limiter.allow(f"question:{client}", time.monotonic()):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="密保查询过于频繁，请稍后再试")
    user = db.scalar(select(User).where(User.username == payload.username, User.role == "operator"))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="未找到这个运维账号")
    recovery = db.get(OperatorRecovery, user.id)
    return OperatorRecoveryQuestionOut(
        username=user.username,
        question=recovery.question if recovery else None,
        legacy_setup_required=recovery is None,
    )


@router.post(
    "/auth/operator-recovery/reset",
    response_model=OperationMessageOut,
    tags=["auth"],
)
def reset_operator_password(
    payload: OperatorPasswordResetIn,
    request: Request,
    db: Db,
    settings: SettingsDep,
) -> OperationMessageOut:
    _require_server_loopback(request, settings)
    client = request.client.host if request.client else "unknown"
    limiter_key = f"reset:{client}:{payload.username.casefold()}"
    limiter: LoginLimiter = request.app.state.recovery_limiter
    if not limiter.allow(limiter_key, time.monotonic()):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="密码恢复尝试过多，请稍后再试")
    user = db.scalar(select(User).where(User.username == payload.username, User.role == "operator"))
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="运维账号或密保答案不正确")

    normalized_answer = _normalized_recovery_answer(payload.recovery_answer, payload.new_password)
    recovery = db.get(OperatorRecovery, user.id)
    if recovery is None:
        if payload.recovery_question is None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="旧版账户需要先补设密保问题")
        answer_salt, answer_hash = hash_password(normalized_answer, settings.password_iterations)
        recovery = OperatorRecovery(
            user_id=user.id,
            question=payload.recovery_question,
            answer_salt=answer_salt,
            answer_hash=answer_hash,
        )
        db.add(recovery)
        action = "account.operator_recovery_initialized"
    else:
        if not verify_password(
            normalized_answer,
            recovery.answer_salt,
            recovery.answer_hash,
            settings.password_iterations,
        ):
            add_audit(
                db,
                request=request,
                actor=None,
                action="account.operator_recovery_failed",
                resource_type="user",
                resource_id=user.id,
            )
            db.commit()
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="运维账号或密保答案不正确")
        if password_hash_needs_upgrade(recovery.answer_hash, settings.password_iterations):
            recovery.answer_salt, recovery.answer_hash = hash_password(normalized_answer, settings.password_iterations)
        action = "account.operator_password_reset"

    user.password_salt, user.password_hash = hash_password(payload.new_password, settings.password_iterations)
    db.execute(
        update(SessionToken)
        .where(SessionToken.user_id == user.id, SessionToken.revoked_at.is_(None))
        .values(revoked_at=utcnow())
    )
    add_audit(db, request=request, actor=user, action=action, resource_type="user", resource_id=user.id)
    db.commit()
    limiter.clear(limiter_key)
    return OperationMessageOut(message="密码已重置，请使用新密码登录")


@router.post("/auth/registrations", response_model=RegistrationOut, status_code=status.HTTP_201_CREATED, tags=["auth"])
def register_account(payload: RegistrationIn, request: Request, db: Db, settings: SettingsDep) -> RegistrationOut:
    client = request.client.host if request.client else "unknown"
    limiter: LoginLimiter = request.app.state.registration_limiter
    if not limiter.allow(client, time.monotonic()):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="注册申请过于频繁，请稍后再试")
    if payload.requested_role == "child" and payload.child_age is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="儿童账号需要填写年龄")
    if db.scalar(select(User.id).where(User.username == payload.username)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="这个登录账号已存在")
    existing = db.scalar(
        select(AccountRegistration.id).where(
            AccountRegistration.username == payload.username,
            AccountRegistration.status == "pending",
        )
    )
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="这个账号已有待审批申请")
    password_salt, password_hash = hash_password(payload.password, settings.password_iterations)
    registration = AccountRegistration(
        username=payload.username,
        requested_role=payload.requested_role,
        display_name=payload.display_name,
        child_age=payload.child_age if payload.requested_role == "child" else None,
        password_salt=password_salt,
        password_hash=password_hash,
    )
    db.add(registration)
    db.flush()
    add_audit(
        db,
        request=request,
        actor=None,
        action="account.registration_submitted",
        resource_type="account_registration",
        resource_id=registration.id,
        metadata={"username": registration.username, "requested_role": registration.requested_role},
    )
    db.commit()
    return RegistrationOut.model_validate(registration)


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT, tags=["auth"])
def logout(request: Request, user: CurrentUser, db: Db) -> None:
    session: SessionToken = request.state.session_token
    session.revoked_at = utcnow()
    add_audit(db, request=request, actor=user, action="auth.logout", resource_type="session", resource_id=session.id)
    db.commit()


@router.get("/me", response_model=UserOut, tags=["auth"])
def me(user: CurrentUser) -> UserOut:
    return UserOut.model_validate(user)


@router.get("/bootstrap", tags=["home"])
def bootstrap(request: Request, user: CurrentUser, db: Db, settings: SettingsDep) -> dict[str, Any]:
    completed_seconds = db.scalar(
        select(func.coalesce(func.sum(ContentEvent.seconds), 0)).where(
            ContentEvent.user_id == user.id,
            ContentEvent.event_type == "completed",
        )
    ) or 0
    setting = db.get(SystemSetting, "downloads")
    result: dict[str, Any] = {
        "user": UserOut.model_validate(user).model_dump(),
        "catalog": [item.model_dump() for item in _content_list(db, user)],
        "active_minutes": int(completed_seconds // 60),
        "downloads_paused": bool(setting and setting.value_json.get("paused")),
    }
    if user.role == "child":
        result["requests"] = [
            present_request(item).model_dump()
            for item in _requests_for_household(db, user.household_id)
            if item.requester_id == user.id
        ]
    elif user.role == "guardian":
        result["requests"] = [present_request(item).model_dump() for item in _requests_for_household(db, user.household_id)]
        result["submissions"] = [present_submission(item, include_url=True).model_dump() for item in _submissions_for_household(db, user.household_id)]
    elif user.role == "operator":
        result["jobs"] = [JobOut.model_validate(item).model_dump() for item in _jobs_for_household(db, user.household_id)]
        result["assets"] = [AssetOut.model_validate(item).model_dump() for item in _assets_for_household(db, user.household_id)]
        result["submissions"] = [present_submission(item, include_url=True).model_dump() for item in _submissions_for_household(db, user.household_id)]
        result["sources"] = [
            SourceOut.model_validate(item).model_dump()
            for item in db.scalars(
                select(ContentSource)
                .where(ContentSource.household_id == user.household_id)
                .order_by(ContentSource.name)
            ).all()
        ]
        result["registrations"] = [
            RegistrationOut.model_validate(item).model_dump()
            for item in db.scalars(
                select(AccountRegistration)
                .where(AccountRegistration.household_id == user.household_id)
                .order_by(AccountRegistration.created_at.desc())
            ).all()
        ]
        result["managed_users"] = [
            ManagedUserOut.model_validate(item).model_dump()
            for item in db.scalars(
                select(User)
                .where(User.household_id == user.household_id)
                .order_by(User.created_at.desc())
            ).all()
        ]
        result["library_items"] = [
            managed_item_payload(db, settings, item)
            for item in db.scalars(
                select(ContentItem)
                .where(ContentItem.household_id == user.household_id)
                .order_by(ContentItem.updated_at.desc())
            ).all()
        ]
        result["storage_paths"] = storage_paths_payload(load_storage_paths(db, settings, ensure=True))
        result["external_feeds"] = load_external_feeds(db)
    return result


@router.get("/catalog/curated", response_model=list[ContentOut], tags=["catalog"])
@router.get("/explore/today", response_model=list[ContentOut], tags=["catalog"])
def curated_catalog(user: CurrentUser, db: Db, q: str | None = Query(default=None, max_length=120)) -> list[ContentOut]:
    return _content_list(db, user, q)


@router.get("/catalog/{item_id}", response_model=ContentOut, tags=["catalog"])
def content_detail(item_id: str, user: CurrentUser, db: Db) -> ContentOut:
    item = require_visible_content(db, user, item_id)
    favorites, completed = content_flags(db, user)
    local_ids = set(
        db.scalars(
            select(ContentAsset.content_id).where(
                ContentAsset.content_id == item.id,
                ContentAsset.publication_status == "published",
            )
        ).all()
    )
    launch_allowed = user.role != "child" or bool(
        db.scalar(
            select(ContentRequest.id).where(
                ContentRequest.requester_id == user.id,
                ContentRequest.item_id == item.id,
                ContentRequest.status == "approved",
                ContentRequest.expires_at.is_(None) | (ContentRequest.expires_at > utcnow()),
            )
        )
    )
    return present_content(
        item,
        favorites=favorites,
        completed=completed,
        local_ids=local_ids,
        launch_allowed_ids={item.id} if launch_allowed else set(),
    )


@router.post("/catalog/{item_id}/launch", tags=["catalog"])
def launch_content(item_id: str, request: Request, user: CurrentUser, db: Db):
    item = require_visible_content(db, user, item_id)
    if user.role == "child":
        approved = db.scalar(
            select(ContentRequest.id).where(
                ContentRequest.requester_id == user.id,
                ContentRequest.item_id == item.id,
                ContentRequest.status == "approved",
                (ContentRequest.expires_at.is_(None) | (ContentRequest.expires_at > utcnow())),
            )
        )
        if approved is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="需要家长批准")
    add_audit(db, request=request, actor=user, action="content.launch", resource_type="content", resource_id=item.id)
    db.commit()
    asset = db.scalar(
        select(ContentAsset).where(
            ContentAsset.content_id == item.id,
            ContentAsset.publication_status == "published",
        )
    )
    if asset is not None:
        settings: Settings = request.app.state.settings
        asset_path = resolve_asset_path(db, settings, asset)
        if asset_path is None or not asset_path.is_file():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="本地资源文件不可用")
        raw_ticket, grant = request.app.state.playback_tickets.issue(user_id=user.id, content_id=item.id)
        return PlaybackOut(
            mode="local_asset",
            url=f"/api/v1/media/{item.id}?ticket={raw_ticket}",
            expires_at=grant.expires_at,
        )
    if item.launch_url:
        parsed = urlparse(item.launch_url)
        if parsed.scheme != "https" or not parsed.hostname:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="官方入口配置无效")
        if item.acquisition_mode == "external_bilibili":
            try:
                reference = normalize_bilibili_url(item.launch_url)
            except ValueError as exc:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="B站播放入口已失效") from exc
            if not reference.external_id.upper().startswith("BV"):
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="B站播放入口缺少视频编号")
            return PlaybackOut(
                mode="embed",
                url=f"https://player.bilibili.com/player.html?bvid={reference.external_id}&autoplay=1&high_quality=1",
            )
        if item.acquisition_mode == "direct_stream":
            return PlaybackOut(mode="direct_stream", url=item.launch_url)
        return PlaybackOut(mode="external_link", url=item.launch_url)
    service = "jellyfin" if item.kind == "video" else "kavita" if item.kind == "book" else "audiobookshelf" if item.kind == "audio" else "device"
    return PlaybackOut(mode="local_service", service=service)


@router.get("/media/{item_id}", tags=["catalog"])
def stream_local_asset(
    item_id: str,
    request: Request,
    db: Db,
    settings: SettingsDep,
    ticket: str = Query(min_length=32, max_length=200),
):
    grant = request.app.state.playback_tickets.resolve(ticket, content_id=item_id)
    if grant is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="播放凭证无效或已过期")
    user = db.get(User, grant.user_id)
    item = db.get(ContentItem, item_id)
    if user is None or user.status != "active" or item is None or item.household_id != user.household_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="播放权限已失效")
    asset = db.scalar(
        select(ContentAsset).where(
            ContentAsset.content_id == item_id,
            ContentAsset.publication_status == "published",
        )
    )
    if asset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="本地资源不存在")
    asset_path = resolve_asset_path(db, settings, asset)
    if asset_path is None or not asset_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="本地资源文件不存在")
    return FileResponse(
        asset_path,
        filename=asset_path.name,
        content_disposition_type="inline",
        headers={"Cache-Control": "private, no-store", "Accept-Ranges": "bytes"},
    )


@router.post("/content-requests", response_model=ContentRequestOut, status_code=status.HTTP_201_CREATED, tags=["requests"])
def create_content_request(payload: ContentRequestIn, request: Request, user: CurrentUser, db: Db) -> ContentRequestOut:
    if user.role != "child":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只有儿童账号可以发起内容申请")
    item = require_visible_content(db, user, payload.item_id)
    pending = db.scalar(
        select(ContentRequest).where(
            ContentRequest.requester_id == user.id,
            ContentRequest.item_id == item.id,
            ContentRequest.status == "pending",
        )
    )
    if pending:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="已经有一个待处理申请")
    content_request = ContentRequest(
        household_id=user.household_id,
        requester_id=user.id,
        item_id=item.id,
        purpose=payload.purpose,
        reason=payload.reason,
        language_preference=payload.language_preference,
    )
    db.add(content_request)
    db.flush()
    add_audit(db, request=request, actor=user, action="content_request.created", resource_type="content_request", resource_id=content_request.id, metadata={"item_id": item.id})
    db.commit()
    db.refresh(content_request)
    return present_request(content_request)


@router.post("/catalog/{item_id}/favorite", tags=["progress"])
def toggle_favorite(item_id: str, request: Request, user: CurrentUser, db: Db) -> dict[str, Any]:
    require_visible_content(db, user, item_id)
    favorite = db.scalar(select(Favorite).where(Favorite.user_id == user.id, Favorite.content_id == item_id))
    enabled = favorite is None
    if favorite:
        db.delete(favorite)
    else:
        db.add(Favorite(user_id=user.id, content_id=item_id))
    add_audit(db, request=request, actor=user, action="favorite.updated", resource_type="content", resource_id=item_id, metadata={"enabled": enabled})
    db.commit()
    return {"item_id": item_id, "favorite": enabled}


@router.post("/catalog/{item_id}/complete", status_code=status.HTTP_201_CREATED, tags=["progress"])
def complete_content(item_id: str, payload: CompleteIn, request: Request, user: CurrentUser, db: Db) -> dict[str, Any]:
    if user.role != "child":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只有儿童账号可以记录自己的完成卡")
    require_visible_content(db, user, item_id)
    event = ContentEvent(
        household_id=user.household_id,
        user_id=user.id,
        content_id=item_id,
        event_type="completed",
        seconds=payload.seconds,
        metadata_json={"has_note": bool(payload.note)},
    )
    db.add(event)
    add_audit(db, request=request, actor=user, action="content.completed", resource_type="content", resource_id=item_id, metadata={"seconds": payload.seconds})
    db.commit()
    return {"event_id": event.id, "completed": True}


@router.get("/guardian/content-requests", response_model=list[ContentRequestOut], tags=["guardian"])
def guardian_requests(user: Guardian, db: Db) -> list[ContentRequestOut]:
    return [present_request(item) for item in _requests_for_household(db, user.household_id)]


@router.post("/guardian/content-requests/{request_id}/decision", response_model=ContentRequestOut, tags=["guardian"])
def decide_request(request_id: str, payload: DecisionIn, request: Request, user: Guardian, db: Db) -> ContentRequestOut:
    content_request = db.scalar(
        select(ContentRequest).where(
            ContentRequest.id == request_id,
            ContentRequest.household_id == user.household_id,
        )
    )
    if content_request is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="申请不存在")
    if content_request.status != "pending":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="申请已经处理")
    now = utcnow()
    default_expiry = {"once": timedelta(hours=2), "today": timedelta(days=1), "week": timedelta(days=7)}
    content_request.status = payload.decision
    content_request.guardian_id = user.id
    content_request.decision_scope = payload.scope
    content_request.decided_at = now
    content_request.expires_at = (
        _naive_utc(payload.expires_at)
        if payload.expires_at
        else now + default_expiry[payload.scope]
        if payload.decision == "approved"
        else None
    )
    add_audit(db, request=request, actor=user, action="content_request.decided", resource_type="content_request", resource_id=content_request.id, metadata={"decision": payload.decision, "scope": payload.scope})
    db.commit()
    return present_request(content_request)


@router.post("/guardian/watchlist/{item_id}/queue", response_model=JobOut, status_code=status.HTTP_201_CREATED, tags=["guardian"])
def queue_watchlist_item(item_id: str, request: Request, user: Guardian, db: Db) -> JobOut:
    item = require_visible_content(db, user, item_id)
    if not item.source_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="内容没有可审核来源")
    source = require_downloadable_source(db, user, item.source_id)
    idempotency_key = hashlib.sha256(f"watchlist:{user.household_id}:{item.id}".encode()).hexdigest()
    existing = db.scalar(select(DownloadJob).where(DownloadJob.idempotency_key == idempotency_key))
    if existing:
        return JobOut.model_validate(existing)
    job = DownloadJob(
        household_id=user.household_id,
        source_id=source.id,
        content_id=item.id,
        external_id=item.id,
        title=item.title,
        content_kind=item.kind,
        stage="review",
        error_code="awaiting_operator_manifest",
        idempotency_key=idempotency_key,
        scheduled_at=utcnow(),
        rights_note=source.license_note or "",
        proof_url=source.terms_url,
    )
    db.add(job)
    db.flush()
    add_audit(db, request=request, actor=user, action="watchlist.queued_for_review", resource_type="download_job", resource_id=job.id, metadata={"item_id": item.id, "source_id": source.id})
    db.commit()
    return JobOut.model_validate(job)


@router.post("/community-submissions", response_model=SubmissionOut, status_code=status.HTTP_201_CREATED, tags=["submissions"])
def create_submission(payload: SubmissionIn, request: Request, user: GuardianOrOperator, db: Db) -> SubmissionOut:
    submission = CommunitySubmission(
        household_id=user.household_id,
        title=payload.title,
        provider=payload.provider,
        original_url=str(payload.original_url),
        publisher_note=payload.publisher_note,
        rights_note=payload.rights_note,
        rights_status="claimed" if payload.rights_note.strip() else "unknown",
        submitted_by=user.id,
    )
    db.add(submission)
    db.flush()
    add_audit(db, request=request, actor=user, action="community_submission.created", resource_type="community_submission", resource_id=submission.id, metadata={"provider": payload.provider, "rights_status": submission.rights_status})
    db.commit()
    return present_submission(submission, include_url=True)


@router.get("/guardian/community-submissions", response_model=list[SubmissionOut], tags=["guardian"])
def list_submissions(user: Guardian, db: Db) -> list[SubmissionOut]:
    return [present_submission(item, include_url=True) for item in _submissions_for_household(db, user.household_id)]


@router.post("/guardian/community-submissions/{submission_id}/confirm-transfer", tags=["guardian"])
def confirm_transfer(submission_id: str, payload: TransferConfirmIn, request: Request, user: Guardian, db: Db) -> dict[str, Any]:
    submission = db.scalar(
        select(CommunitySubmission).where(
            CommunitySubmission.id == submission_id,
            CommunitySubmission.household_id == user.household_id,
        )
    )
    if submission is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="候选记录不存在")
    if not payload.confirmed:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="必须由家长明确确认已在官方客户端预览并转存")
    submission.transfer_status = "confirmed"
    submission.provider = payload.provider
    submission.transferred_by = user.id
    submission.transferred_at = utcnow()
    add_audit(db, request=request, actor=user, action="community_submission.transfer_confirmed", resource_type="community_submission", resource_id=submission.id, metadata={"provider": payload.provider})
    db.commit()
    return {"id": submission.id, "transfer_status": "confirmed", "filename_prefix": submission.id + "--"}


@router.get("/ops/sources", response_model=list[SourceOut], tags=["ops"])
def list_sources(user: Operator, db: Db) -> list[SourceOut]:
    sources = db.scalars(select(ContentSource).where(ContentSource.household_id == user.household_id).order_by(ContentSource.name)).all()
    return [SourceOut.model_validate(source) for source in sources]


@router.get("/ops/account-registrations", response_model=list[RegistrationOut], tags=["ops"])
def list_account_registrations(user: Operator, db: Db) -> list[RegistrationOut]:
    registrations = db.scalars(
        select(AccountRegistration)
        .where(AccountRegistration.household_id == user.household_id)
        .order_by(AccountRegistration.created_at.desc())
    ).all()
    return [RegistrationOut.model_validate(item) for item in registrations]


@router.post("/ops/account-registrations/{registration_id}/decision", response_model=RegistrationOut, tags=["ops"])
def decide_account_registration(
    registration_id: str,
    payload: RegistrationDecisionIn,
    request: Request,
    user: Operator,
    db: Db,
) -> RegistrationOut:
    registration = db.scalar(
        select(AccountRegistration).where(
            AccountRegistration.id == registration_id,
            AccountRegistration.household_id == user.household_id,
        )
    )
    if registration is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="注册申请不存在")
    if registration.status != "pending":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="这个注册申请已经处理")
    if payload.decision == "approved":
        if db.scalar(select(User.id).where(User.username == registration.username)):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="同名登录账号已经存在")
        db.add(
            User(
                household_id=registration.household_id,
                username=registration.username,
                role=registration.requested_role,
                display_name=registration.display_name,
                child_age=registration.child_age,
                password_salt=registration.password_salt,
                password_hash=registration.password_hash,
                status="active",
            )
        )
    registration.status = payload.decision
    registration.review_note = payload.review_note.strip()
    registration.reviewed_by = user.id
    registration.reviewed_at = utcnow()
    add_audit(
        db,
        request=request,
        actor=user,
        action=f"account.registration_{payload.decision}",
        resource_type="account_registration",
        resource_id=registration.id,
        metadata={"username": registration.username, "requested_role": registration.requested_role},
    )
    db.commit()
    return RegistrationOut.model_validate(registration)


@router.get("/ops/users", response_model=list[ManagedUserOut], tags=["ops"])
def list_managed_users(user: Operator, db: Db) -> list[ManagedUserOut]:
    users = db.scalars(
        select(User).where(User.household_id == user.household_id).order_by(User.created_at.desc())
    ).all()
    return [ManagedUserOut.model_validate(item) for item in users]


@router.post("/ops/users/{user_id}/status", response_model=ManagedUserOut, tags=["ops"])
def update_user_status(
    user_id: str,
    payload: UserStatusIn,
    request: Request,
    user: Operator,
    db: Db,
) -> ManagedUserOut:
    managed = db.scalar(
        select(User).where(User.id == user_id, User.household_id == user.household_id)
    )
    if managed is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="账号不存在")
    if managed.role == "operator":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="运维账号不能在这里停用")
    managed.status = payload.status
    if payload.status == "suspended":
        for session in db.scalars(
            select(SessionToken).where(
                SessionToken.user_id == managed.id,
                SessionToken.revoked_at.is_(None),
            )
        ).all():
            session.revoked_at = utcnow()
    add_audit(
        db,
        request=request,
        actor=user,
        action=f"account.{payload.status}",
        resource_type="user",
        resource_id=managed.id,
        metadata={"username": managed.username, "role": managed.role},
    )
    db.commit()
    return ManagedUserOut.model_validate(managed)


@router.get("/ops/storage-paths", response_model=StoragePathsOut, tags=["ops"])
def get_storage_paths(user: Operator, db: Db, settings: SettingsDep) -> StoragePathsOut:
    return StoragePathsOut.model_validate(storage_paths_payload(load_storage_paths(db, settings, ensure=True)))


@router.put("/ops/storage-paths", response_model=StoragePathsOut, tags=["ops"])
def update_storage_paths(
    payload: StoragePathsIn,
    request: Request,
    user: Operator,
    db: Db,
    settings: SettingsDep,
) -> StoragePathsOut:
    _require_server_loopback(request, settings)
    paths = save_storage_paths(db, settings, payload.model_dump(), updated_by=user.id)
    add_audit(
        db,
        request=request,
        actor=user,
        action="storage.paths_updated",
        resource_type="system_setting",
        resource_id="storage_paths",
        metadata={"paths": storage_paths_payload(paths)},
    )
    db.commit()
    return StoragePathsOut.model_validate(storage_paths_payload(paths))


@router.get("/ops/library", response_model=list[LibraryItemOut], tags=["ops"])
def list_managed_library(user: Operator, db: Db, settings: SettingsDep) -> list[LibraryItemOut]:
    items = db.scalars(
        select(ContentItem)
        .where(ContentItem.household_id == user.household_id)
        .order_by(ContentItem.updated_at.desc())
    ).all()
    return [LibraryItemOut.model_validate(managed_item_payload(db, settings, item)) for item in items]


@router.post("/ops/library/scan", response_model=LibraryScanOut, tags=["ops"])
def scan_local_library(request: Request, user: Operator, db: Db, settings: SettingsDep) -> LibraryScanOut:
    _require_server_loopback(request, settings)
    result = scan_managed_library(db, settings, user=user)
    add_audit(db, request=request, actor=user, action="library.scanned", resource_type="library", metadata=result)
    db.commit()
    return LibraryScanOut.model_validate(result)


@router.post("/ops/library/import", response_model=LibraryItemOut, status_code=status.HTTP_201_CREATED, tags=["ops"])
def import_local_library_item(
    payload: LocalLibraryImportIn,
    request: Request,
    user: Operator,
    db: Db,
    settings: SettingsDep,
) -> LibraryItemOut:
    _require_server_loopback(request, settings)
    item = register_local_file(
        db,
        settings,
        user=user,
        source_path=Path(payload.source_path),
        kind=payload.kind,
        title=payload.title,
        audience=payload.audience,
        age_from=payload.age_from,
        age_to=payload.age_to,
        language=payload.language,
        description=payload.description,
        copy_to_library=payload.copy_to_library,
        publish=payload.publish,
    )
    add_audit(
        db,
        request=request,
        actor=user,
        action="library.local_imported",
        resource_type="content",
        resource_id=item.id,
        metadata={"kind": item.kind, "published": item.publication_status == "published"},
    )
    db.commit()
    db.refresh(item)
    return LibraryItemOut.model_validate(managed_item_payload(db, settings, item))


@router.patch("/ops/library/{item_id}", response_model=LibraryItemOut, tags=["ops"])
def update_library_item(
    item_id: str,
    payload: LibraryItemUpdateIn,
    request: Request,
    user: Operator,
    db: Db,
    settings: SettingsDep,
) -> LibraryItemOut:
    item = db.scalar(select(ContentItem).where(ContentItem.id == item_id, ContentItem.household_id == user.household_id))
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="资源不存在")
    changes = payload.model_dump(exclude_unset=True)
    age_from = changes.get("age_from", item.age_from)
    age_to = changes.get("age_to", item.age_to)
    if age_to < age_from:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="适龄范围无效")
    asset = db.scalar(select(ContentAsset).where(ContentAsset.content_id == item.id))
    next_status = changes.get("publication_status", item.publication_status)
    if next_status == "published" and asset is not None:
        path = resolve_asset_path(db, settings, asset)
        if path is None or not path.is_file():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="本地文件不可用，不能发布")
    if next_status == "published" and asset is None and not item.launch_url:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="资源没有可用的播放入口")
    for field in ("title", "subtitle", "language", "age_from", "age_to", "description", "audience", "featured", "publication_status"):
        if field in changes and changes[field] is not None:
            setattr(item, field, changes[field].strip() if isinstance(changes[field], str) else changes[field])
    item.updated_at = utcnow()
    if asset is not None:
        asset.audience = item.audience
        asset.publication_status = item.publication_status
    add_audit(
        db,
        request=request,
        actor=user,
        action="library.item_updated",
        resource_type="content",
        resource_id=item.id,
        metadata={"fields": sorted(changes)},
    )
    db.commit()
    return LibraryItemOut.model_validate(managed_item_payload(db, settings, item))


@router.delete("/ops/library/{item_id}", response_model=LibraryItemOut, tags=["ops"])
def archive_library_item(
    item_id: str,
    request: Request,
    user: Operator,
    db: Db,
    settings: SettingsDep,
) -> LibraryItemOut:
    item = db.scalar(select(ContentItem).where(ContentItem.id == item_id, ContentItem.household_id == user.household_id))
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="资源不存在")
    item.publication_status = "archived"
    item.updated_at = utcnow()
    asset = db.scalar(select(ContentAsset).where(ContentAsset.content_id == item.id))
    if asset is not None:
        asset.publication_status = "archived"
    add_audit(db, request=request, actor=user, action="library.item_archived", resource_type="content", resource_id=item.id)
    db.commit()
    return LibraryItemOut.model_validate(managed_item_payload(db, settings, item))


@router.post("/ops/library/external", response_model=LibraryItemOut, status_code=status.HTTP_201_CREATED, tags=["ops"])
def add_external_library_item(
    payload: ExternalItemIn,
    request: Request,
    user: Operator,
    db: Db,
    settings: SettingsDep,
) -> LibraryItemOut:
    if payload.age_to < payload.age_from:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="适龄范围无效")
    raw_url = str(payload.url)
    provider = provider_for_url(raw_url) if payload.provider == "auto" else payload.provider
    title = payload.title.strip() if payload.title else ""
    cover_url = str(payload.cover_url) if payload.cover_url else None
    description = payload.description
    duration_minutes = 10
    external_id = None
    if provider == "bilibili":
        try:
            reference = normalize_bilibili_url(raw_url)
            canonical = reference.url
            entry = extract_bilibili_entries(canonical, max_items=1)[0]
            raw_url = entry.url
            title = title or entry.title
            cover_url = cover_url or entry.cover_url
            description = description or entry.description
            duration_minutes = entry.duration_minutes
            external_id = entry.external_id
        except (ExternalCatalogError, ValueError):
            try:
                reference = normalize_bilibili_url(raw_url)
            except ValueError as invalid:
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(invalid)) from invalid
            raw_url = reference.url
            external_id = reference.external_id
            title = title or f"B站视频 {reference.external_id}"
            description = description or "已保存在线播放入口；Server 暂时未能读取标题和封面，可稍后编辑或重新同步。"
    elif not title:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="非 B 站在线资源需要填写标题")
    item = upsert_external_item(
        db,
        user=user,
        url=raw_url,
        provider=provider,
        title=title,
        kind=payload.kind,
        cover_url=cover_url,
        audience=payload.audience,
        age_from=payload.age_from,
        age_to=payload.age_to,
        language=payload.language,
        description=description,
        duration_minutes=duration_minutes,
        external_id=external_id,
    )
    add_audit(
        db,
        request=request,
        actor=user,
        action="library.external_added",
        resource_type="content",
        resource_id=item.id,
        metadata={"provider": provider},
    )
    db.commit()
    db.refresh(item)
    return LibraryItemOut.model_validate(managed_item_payload(db, settings, item))


@router.get("/ops/external-feeds", response_model=list[ExternalFeedOut], tags=["ops"])
def list_external_feeds(user: Operator, db: Db) -> list[ExternalFeedOut]:
    return [ExternalFeedOut.model_validate(feed) for feed in load_external_feeds(db)]


@router.post("/ops/external-feeds", response_model=ExternalFeedOut, status_code=status.HTTP_201_CREATED, tags=["ops"])
def create_external_feed(
    payload: ExternalFeedIn,
    request: Request,
    user: Operator,
    db: Db,
    settings: SettingsDep,
) -> ExternalFeedOut:
    _require_server_loopback(request, settings)
    if payload.age_to < payload.age_from:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="适龄范围无效")
    try:
        feed = new_external_feed(payload.model_dump(mode="json"))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc
    feeds = load_external_feeds(db)
    feeds.append(feed)
    try:
        sync_external_feed(db, settings, user=user, feed=feed)
    except (ExternalCatalogError, OSError, ValueError) as exc:
        feed["last_attempt_at"] = utcnow().isoformat()
        feed["last_error"] = str(exc)[:200]
    save_external_feeds(db, feeds, updated_by=user.id)
    add_audit(db, request=request, actor=user, action="external_feed.created", resource_type="external_feed", resource_id=feed["id"])
    db.commit()
    return ExternalFeedOut.model_validate(feed)


@router.post("/ops/external-feeds/{feed_id}/sync", response_model=ExternalFeedOut, tags=["ops"])
def sync_one_external_feed(
    feed_id: str,
    request: Request,
    user: Operator,
    db: Db,
    settings: SettingsDep,
) -> ExternalFeedOut:
    _require_server_loopback(request, settings)
    feeds = load_external_feeds(db)
    feed = next((candidate for candidate in feeds if candidate.get("id") == feed_id), None)
    if feed is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="同步源不存在")
    feed["last_attempt_at"] = utcnow().isoformat()
    try:
        sync_external_feed(db, settings, user=user, feed=feed)
    except (ExternalCatalogError, OSError, ValueError) as exc:
        feed["last_error"] = str(exc)[:200]
    save_external_feeds(db, feeds, updated_by=user.id)
    add_audit(
        db,
        request=request,
        actor=user,
        action="external_feed.synced",
        resource_type="external_feed",
        resource_id=feed_id,
        metadata={"item_count": feed.get("item_count", 0), "error": feed.get("last_error")},
    )
    db.commit()
    return ExternalFeedOut.model_validate(feed)


@router.delete("/ops/external-feeds/{feed_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["ops"])
def delete_external_feed(feed_id: str, request: Request, user: Operator, db: Db, settings: SettingsDep) -> None:
    _require_server_loopback(request, settings)
    feeds = load_external_feeds(db)
    remaining = [feed for feed in feeds if feed.get("id") != feed_id]
    if len(remaining) == len(feeds):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="同步源不存在")
    save_external_feeds(db, remaining, updated_by=user.id)
    add_audit(db, request=request, actor=user, action="external_feed.deleted", resource_type="external_feed", resource_id=feed_id)
    db.commit()


@router.post("/ops/sources", response_model=SourceOut, status_code=status.HTTP_201_CREATED, tags=["ops"])
def create_source(payload: SourceIn, request: Request, user: Operator, db: Db) -> SourceOut:
    source_id = payload.id or new_id()
    if db.get(ContentSource, source_id):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="来源 ID 已存在")
    source = ContentSource(
        id=source_id,
        household_id=user.household_id,
        name=payload.name,
        kind=payload.kind,
        owner=payload.owner,
        base_url=str(payload.base_url) if payload.base_url else None,
        terms_url=str(payload.terms_url) if payload.terms_url else None,
        license_note=payload.license_note,
        region=payload.region,
        allow_download=False,
        rate_limit=payload.rate_limit,
        review_expire_at=_naive_utc(payload.review_expire_at) if payload.review_expire_at else None,
    )
    db.add(source)
    add_audit(db, request=request, actor=user, action="source.created", resource_type="source", resource_id=source.id, metadata={"kind": source.kind, "requested_download": payload.allow_download})
    db.commit()
    return SourceOut.model_validate(source)


@router.post("/ops/sources/{source_id}/validate", response_model=SourceOut, tags=["ops"])
def validate_source(source_id: str, payload: SourceValidateIn, request: Request, user: Operator, db: Db) -> SourceOut:
    source = db.scalar(select(ContentSource).where(ContentSource.id == source_id, ContentSource.household_id == user.household_id))
    if source is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="来源不存在")
    expiry = _naive_utc(payload.review_expire_at)
    if expiry <= utcnow():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="复核到期时间必须在未来")
    if not payload.terms_confirmed or not payload.rights_confirmed or not source.terms_url or not source.license_note:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="条款和权利依据未完成")
    source.reviewed_at = utcnow()
    source.review_expire_at = expiry
    source.allow_download = source.kind in {"direct_http", "cloud_inbox", "owned_file"}
    source.disabled_at = None
    add_audit(db, request=request, actor=user, action="source.validated", resource_type="source", resource_id=source.id, metadata={"allow_download": source.allow_download, "expires_at": expiry.isoformat()})
    db.commit()
    return SourceOut.model_validate(source)


@router.delete("/ops/sources/{source_id}", response_model=SourceOut, tags=["ops"])
def disable_source(source_id: str, request: Request, user: Operator, db: Db) -> SourceOut:
    source = db.scalar(select(ContentSource).where(ContentSource.id == source_id, ContentSource.household_id == user.household_id))
    if source is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="来源不存在")
    source.disabled_at = utcnow()
    source.allow_download = False
    add_audit(db, request=request, actor=user, action="source.disabled", resource_type="source", resource_id=source.id)
    db.commit()
    return SourceOut.model_validate(source)


@router.post("/ops/downloads/direct", response_model=JobOut, status_code=status.HTTP_201_CREATED, tags=["ops"])
def queue_direct_download(
    payload: DirectDownloadIn,
    request: Request,
    user: Operator,
    db: Db,
    settings: SettingsDep,
    idempotency_header: str | None = Header(default=None, alias="Idempotency-Key", max_length=128),
) -> JobOut:
    if not settings.direct_download_enabled:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="直接下载连接器未启用")
    source = require_downloadable_source(db, user, payload.source_id)
    download_url = str(payload.url)
    if not url_matches_source(download_url, source):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="URL 必须是来源白名单下的同域 HTTPS 地址")
    raw_key = idempotency_header or f"{user.household_id}:{source.id}:{payload.external_id}:{payload.content_kind}"
    idempotency_key = hashlib.sha256(raw_key.encode("utf-8")).hexdigest()
    existing = db.scalar(select(DownloadJob).where(DownloadJob.idempotency_key == idempotency_key))
    if existing:
        return JobOut.model_validate(existing)
    scheduled = _naive_utc(payload.scheduled_at) if payload.scheduled_at else utcnow()
    job = DownloadJob(
        household_id=user.household_id,
        source_id=source.id,
        external_id=payload.external_id,
        title=payload.title,
        content_kind=payload.content_kind,
        stage="queued",
        scheduled_at=scheduled,
        idempotency_key=idempotency_key,
        rights_note=payload.rights_note,
        proof_url=str(payload.proof_url),
    )
    db.add(job)
    db.flush()
    job.manifest_ref = write_manifest(
        settings.manifest_dir,
        job.id,
        {
            "version": 1,
            "job_id": job.id,
            "source_id": source.id,
            "url": download_url,
            "expected_sha256": payload.expected_sha256,
            "created_at": utcnow().isoformat(),
        },
    )
    add_audit(db, request=request, actor=user, action="download.queued", resource_type="download_job", resource_id=job.id, metadata={"source_id": source.id, "external_id": payload.external_id, "has_expected_hash": bool(payload.expected_sha256)})
    db.commit()
    return JobOut.model_validate(job)


@router.post("/ops/downloads/bilibili", response_model=JobOut, status_code=status.HTTP_201_CREATED, tags=["ops"])
def queue_bilibili_download(
    payload: BilibiliDownloadIn,
    request: Request,
    user: Operator,
    db: Db,
    settings: SettingsDep,
    idempotency_header: str | None = Header(default=None, alias="Idempotency-Key", max_length=128),
) -> JobOut:
    if not settings.bilibili_download_enabled:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="B站下载连接器未启用")
    if not payload.rights_confirmed:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="请先确认对该视频拥有下载和家庭使用权限")
    try:
        reference = normalize_bilibili_url(str(payload.url))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    source = require_downloadable_source(db, user, BILIBILI_SOURCE_ID)
    raw_key = idempotency_header or f"{user.household_id}:{reference.external_id}:{payload.max_height}"
    idempotency_key = hashlib.sha256(raw_key.encode("utf-8")).hexdigest()
    existing = db.scalar(select(DownloadJob).where(DownloadJob.idempotency_key == idempotency_key))
    if existing:
        if existing.stage in {"failed", "paused"}:
            existing.stage = "queued"
            existing.progress = 0
            existing.bytes_done = 0
            existing.expected_bytes = None
            existing.error_code = None
            existing.scheduled_at = utcnow()
            existing.rights_note = payload.rights_note.strip()
            existing.proof_url = reference.url
            if payload.title and payload.title.strip():
                existing.title = payload.title.strip()
            existing.manifest_ref = write_manifest(
                settings.manifest_dir,
                existing.id,
                {
                    "version": 1,
                    "job_id": existing.id,
                    "source_id": source.id,
                    "connector": "bilibili",
                    "url": reference.url,
                    "max_height": payload.max_height,
                    "run_outside_window": payload.start_now,
                    "created_at": utcnow().isoformat(),
                },
            )
            add_audit(
                db,
                request=request,
                actor=user,
                action="bilibili_download.requeued",
                resource_type="download_job",
                resource_id=existing.id,
                metadata={"max_height": payload.max_height, "start_now": payload.start_now},
            )
            db.commit()
        return JobOut.model_validate(existing)
    scheduled = _naive_utc(payload.scheduled_at) if payload.scheduled_at else utcnow()
    job = DownloadJob(
        household_id=user.household_id,
        source_id=source.id,
        external_id=reference.external_id,
        title=payload.title.strip() if payload.title and payload.title.strip() else f"B站视频 {reference.external_id}",
        content_kind="video",
        stage="queued",
        scheduled_at=scheduled,
        idempotency_key=idempotency_key,
        rights_note=payload.rights_note.strip(),
        proof_url=reference.url,
    )
    db.add(job)
    db.flush()
    job.manifest_ref = write_manifest(
        settings.manifest_dir,
        job.id,
        {
            "version": 1,
            "job_id": job.id,
            "source_id": source.id,
            "connector": "bilibili",
            "url": reference.url,
            "max_height": payload.max_height,
            "run_outside_window": payload.start_now,
            "created_at": utcnow().isoformat(),
        },
    )
    add_audit(
        db,
        request=request,
        actor=user,
        action="bilibili_download.queued",
        resource_type="download_job",
        resource_id=job.id,
        metadata={
            "external_id": reference.external_id,
            "max_height": payload.max_height,
            "start_now": payload.start_now,
        },
    )
    db.commit()
    return JobOut.model_validate(job)


@router.get("/ops/jobs", response_model=list[JobOut], tags=["ops"])
def list_jobs(user: Operator, db: Db) -> list[JobOut]:
    return [JobOut.model_validate(job) for job in _jobs_for_household(db, user.household_id)]


@router.post("/ops/jobs/{job_id}/pause", response_model=JobOut, tags=["ops"])
def pause_job(job_id: str, request: Request, user: Operator, db: Db) -> JobOut:
    job = db.scalar(select(DownloadJob).where(DownloadJob.id == job_id, DownloadJob.household_id == user.household_id))
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")
    if job.stage not in {"queued", "downloading"}:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="当前状态不能暂停")
    job.stage = "paused"
    add_audit(db, request=request, actor=user, action="download.paused", resource_type="download_job", resource_id=job.id)
    db.commit()
    return JobOut.model_validate(job)


@router.post("/ops/jobs/{job_id}/retry", response_model=JobOut, tags=["ops"])
def retry_job(job_id: str, request: Request, user: Operator, db: Db) -> JobOut:
    job = db.scalar(select(DownloadJob).where(DownloadJob.id == job_id, DownloadJob.household_id == user.household_id))
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")
    if job.stage not in {"failed", "paused"} or not job.manifest_ref:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="任务不能重试或缺少受控 manifest")
    job.stage = "queued"
    job.error_code = None
    job.scheduled_at = utcnow()
    add_audit(db, request=request, actor=user, action="download.retried", resource_type="download_job", resource_id=job.id)
    db.commit()
    return JobOut.model_validate(job)


@router.post("/ops/downloads/pause-all", tags=["ops"])
def pause_all_downloads(request: Request, user: GuardianOrOperator, db: Db) -> dict[str, Any]:
    setting = db.get(SystemSetting, "downloads") or SystemSetting(key="downloads")
    setting.value_json = {"paused": True, "reason": "manual", "at": utcnow().isoformat()}
    setting.updated_by = user.id
    db.add(setting)
    for job in _jobs_for_household(db, user.household_id):
        if job.stage in {"queued", "downloading"}:
            job.stage = "paused"
    add_audit(db, request=request, actor=user, action="download.pause_all", resource_type="system_setting", resource_id="downloads")
    db.commit()
    return {"paused": True}


@router.post("/ops/downloads/resume-all", tags=["ops"])
def resume_all_downloads(request: Request, user: Operator, db: Db) -> dict[str, Any]:
    setting = db.get(SystemSetting, "downloads") or SystemSetting(key="downloads")
    setting.value_json = {"paused": False, "reason": None, "at": utcnow().isoformat()}
    setting.updated_by = user.id
    db.add(setting)
    resumed = 0
    for job in _jobs_for_household(db, user.household_id):
        if job.stage == "paused" and job.manifest_ref:
            job.stage = "queued"
            job.error_code = None
            job.scheduled_at = utcnow()
            resumed += 1
    add_audit(
        db,
        request=request,
        actor=user,
        action="download.resume_all",
        resource_type="system_setting",
        resource_id="downloads",
        metadata={"resumed_jobs": resumed},
    )
    db.commit()
    return {"paused": False, "resumed_jobs": resumed}


@router.get("/ops/nightly-summary", tags=["ops"])
def nightly_summary(user: Operator, db: Db) -> dict[str, Any]:
    jobs = _jobs_for_household(db, user.household_id)
    assets = _assets_for_household(db, user.household_id)
    return {
        "jobs": dict(Counter(job.stage for job in jobs)),
        "assets": dict(Counter(asset.quarantine_status for asset in assets)),
        "failed_jobs": [job.id for job in jobs if job.stage == "failed"][:20],
    }


@router.post("/ops/cloud-inbox/sync", tags=["ops"])
def sync_cloud_inbox(request: Request, user: Operator, db: Db, settings: SettingsDep) -> dict[str, Any]:
    worker = FamilyWorker(settings, request.app.state.session_factory)
    added, duplicates, blocked = worker.scan_inbox(db)
    add_audit(db, request=request, actor=user, action="cloud_inbox.sync", resource_type="cloud_inbox", metadata={"added": added, "duplicates": duplicates, "blocked": blocked})
    db.commit()
    return {"added": added, "duplicates": duplicates, "blocked": blocked}


@router.get("/ops/cloud-inbox", response_model=list[AssetOut], tags=["ops"])
def list_cloud_assets(user: Operator, db: Db) -> list[AssetOut]:
    return [AssetOut.model_validate(asset) for asset in _assets_for_household(db, user.household_id)]


@router.post("/ops/cloud-inbox/{asset_id}/review", response_model=AssetOut, tags=["ops"])
def review_cloud_asset(asset_id: str, payload: AssetReviewIn, request: Request, user: Operator, db: Db, settings: SettingsDep) -> AssetOut:
    asset = db.scalar(select(CloudInboxAsset).where(CloudInboxAsset.id == asset_id, CloudInboxAsset.household_id == user.household_id))
    if asset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="隔离资产不存在")
    item = apply_asset_review(db, settings=settings, asset=asset, reviewer=user, payload=payload)
    add_audit(db, request=request, actor=user, action="cloud_asset.reviewed", resource_type="cloud_inbox_asset", resource_id=asset.id, metadata={"decision": payload.decision, "published_content_id": item.id if item else None})
    db.commit()
    return AssetOut.model_validate(asset)


@router.get("/ops/system-status", tags=["ops"])
def get_system_status(user: GuardianOrOperator, db: Db, settings: SettingsDep) -> dict[str, Any]:
    return system_status(db, settings)


@router.get("/ops/audit", tags=["ops"])
def list_audit_events(user: Operator, db: Db, limit: int = Query(default=100, ge=1, le=500)) -> list[dict[str, Any]]:
    events = db.scalars(
        select(AuditEvent)
        .where(AuditEvent.household_id == user.household_id)
        .order_by(AuditEvent.created_at.desc())
        .limit(limit)
    ).all()
    return [
        {
            "id": event.id,
            "actor_id": event.actor_id,
            "action": event.action,
            "resource_type": event.resource_type,
            "resource_id": event.resource_id,
            "metadata": event.metadata_json,
            "request_id": event.request_id,
            "created_at": event.created_at,
        }
        for event in events
    ]


app = create_app()
