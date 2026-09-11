from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator


Role = Literal["child", "guardian", "operator"]
ContentKind = Literal["video", "book", "audio", "game", "create", "discover"]


def require_ascii_password(value: str) -> str:
    if not value.isascii() or not value.isalnum():
        raise ValueError("密码只能包含英文字母和数字")
    return value


class ApiModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class UserOut(ApiModel):
    id: str
    username: str
    role: Role
    display_name: str
    child_age: int | None = None


class LoginIn(BaseModel):
    username: str = Field(min_length=2, max_length=80)
    password: str = Field(min_length=6, max_length=256)
    device_name: str = Field(default="browser", max_length=120)
    app_edition: Literal["client", "server"] = "client"

class LoginOut(ApiModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_at: datetime
    user: UserOut


class OperatorSetupIn(BaseModel):
    username: str = Field(min_length=2, max_length=80)
    password: str = Field(min_length=10, max_length=256)
    display_name: str = Field(min_length=1, max_length=100)
    recovery_question: str = Field(min_length=4, max_length=200)
    recovery_answer: str = Field(min_length=2, max_length=256)

    _password_characters = field_validator("password")(require_ascii_password)

    @field_validator("username")
    @classmethod
    def clean_username(cls, value: str) -> str:
        cleaned = value.strip()
        if any(character.isspace() or ord(character) < 32 for character in cleaned):
            raise ValueError("登录账号不能包含空格或控制字符")
        return cleaned

    @field_validator("display_name")
    @classmethod
    def clean_display_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("显示名称不能为空")
        return cleaned

    @field_validator("recovery_question")
    @classmethod
    def clean_recovery_question(cls, value: str) -> str:
        cleaned = value.strip()
        if len(cleaned) < 4 or any(ord(character) < 32 for character in cleaned):
            raise ValueError("密保问题至少需要 4 个字符，且不能包含控制字符")
        return cleaned

    @field_validator("recovery_answer")
    @classmethod
    def clean_recovery_answer(cls, value: str) -> str:
        cleaned = value.strip()
        if len(cleaned) < 2 or any(ord(character) < 32 for character in cleaned):
            raise ValueError("密保答案至少需要 2 个字符，且不能包含控制字符")
        return cleaned


class OperatorRecoveryQuestionIn(BaseModel):
    username: str = Field(min_length=2, max_length=80)

    @field_validator("username")
    @classmethod
    def clean_username(cls, value: str) -> str:
        cleaned = value.strip()
        if any(character.isspace() or ord(character) < 32 for character in cleaned):
            raise ValueError("登录账号不能包含空格或控制字符")
        return cleaned


class OperatorRecoveryQuestionOut(ApiModel):
    username: str
    question: str | None = None
    legacy_setup_required: bool = False


class OperatorPasswordResetIn(BaseModel):
    username: str = Field(min_length=2, max_length=80)
    recovery_answer: str = Field(min_length=2, max_length=256)
    new_password: str = Field(min_length=10, max_length=256)
    recovery_question: str | None = Field(default=None, min_length=4, max_length=200)

    _password_characters = field_validator("new_password")(require_ascii_password)

    @field_validator("username")
    @classmethod
    def clean_username(cls, value: str) -> str:
        cleaned = value.strip()
        if any(character.isspace() or ord(character) < 32 for character in cleaned):
            raise ValueError("登录账号不能包含空格或控制字符")
        return cleaned

    @field_validator("recovery_question")
    @classmethod
    def clean_optional_question(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if len(cleaned) < 4 or any(ord(character) < 32 for character in cleaned):
            raise ValueError("密保问题至少需要 4 个字符，且不能包含控制字符")
        return cleaned


class OperationMessageOut(ApiModel):
    message: str


class RegistrationIn(BaseModel):
    username: str = Field(min_length=2, max_length=80)
    password: str = Field(min_length=8, max_length=256)
    display_name: str = Field(min_length=1, max_length=100)
    requested_role: Literal["child", "guardian"]
    child_age: int | None = Field(default=None, ge=3, le=17)

    _password_characters = field_validator("password")(require_ascii_password)

    @field_validator("username")
    @classmethod
    def clean_username(cls, value: str) -> str:
        cleaned = value.strip()
        if any(character.isspace() or ord(character) < 32 for character in cleaned):
            raise ValueError("登录账号不能包含空格或控制字符")
        return cleaned

    @field_validator("display_name")
    @classmethod
    def clean_display_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("显示名称不能为空")
        return cleaned


class RegistrationOut(ApiModel):
    id: str
    username: str
    requested_role: Literal["child", "guardian"]
    display_name: str
    child_age: int | None
    status: Literal["pending", "approved", "rejected"]
    review_note: str
    reviewed_at: datetime | None
    created_at: datetime


class RegistrationDecisionIn(BaseModel):
    decision: Literal["approved", "rejected"]
    review_note: str = Field(default="", max_length=300)


class ManagedUserOut(UserOut):
    status: Literal["active", "suspended"]
    created_at: datetime


class UserStatusIn(BaseModel):
    status: Literal["active", "suspended"]


class ContentOut(ApiModel):
    id: str
    kind: ContentKind
    title: str
    subtitle: str
    language: str
    age_from: int
    age_to: int
    duration_minutes: int
    description: str
    tags: list[str]
    accent: str
    cover_ref: str | None
    acquisition_mode: str
    publication_status: str
    audience: str
    stimulation_level: str
    offline_activity: str
    featured: bool
    favorite: bool = False
    completed: bool = False
    local_available: bool = False
    playable: bool = False
    playback_mode: str = "none"
    launch_allowed: bool = False
    provider: str = "local"
    collection_id: str | None = None
    collection_title: str | None = None
    collection_kind: str | None = None
    episode_index: int | None = None
    episode_count: int | None = None
    section_title: str | None = None


class ContentCollectionOut(ApiModel):
    id: str
    title: str
    description: str
    collection_kind: str
    episode_count: int
    current_episode_index: int
    episodes: list[ContentOut]


class ContentRequestIn(BaseModel):
    item_id: str = Field(min_length=1, max_length=80)
    purpose: Literal["watch", "read", "listen", "play", "create"] = "watch"
    reason: str = Field(default="", max_length=300)
    language_preference: str | None = Field(default=None, max_length=80)


class ContentRequestOut(ApiModel):
    id: str
    item_id: str
    item_title: str
    requester_id: str
    requester_name: str
    purpose: str
    reason: str
    status: str
    decision_scope: str | None
    expires_at: datetime | None
    created_at: datetime
    decided_at: datetime | None


class DecisionIn(BaseModel):
    decision: Literal["approved", "rejected"]
    scope: Literal["once", "today", "week"] = "once"
    expires_at: datetime | None = None


class SubmissionIn(BaseModel):
    title: str = Field(min_length=2, max_length=240)
    provider: Literal["baidu", "quark", "creator", "other"] = "other"
    original_url: HttpUrl
    publisher_note: str = Field(default="", max_length=2000)
    rights_note: str = Field(default="", max_length=1000)


class SubmissionOut(ApiModel):
    id: str
    title: str
    provider: str
    original_url: str | None
    publisher_note: str
    rights_note: str
    rights_status: str
    transfer_status: str
    review_status: str
    submitted_by: str
    created_at: datetime


class TransferConfirmIn(BaseModel):
    confirmed: bool
    provider: Literal["baidu", "quark", "creator", "other"]


class SourceIn(BaseModel):
    id: str | None = Field(default=None, pattern=r"^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$")
    name: str = Field(min_length=2, max_length=160)
    kind: Literal["official_stream", "direct_http", "rss", "cloud_inbox", "owned_file", "bilibili"]
    owner: str = Field(min_length=2, max_length=120)
    base_url: HttpUrl | None = None
    terms_url: HttpUrl | None = None
    license_note: str = Field(default="", max_length=4000)
    region: str = Field(default="CN", max_length=80)
    allow_download: bool = False
    rate_limit: str = Field(default="manual", max_length=80)
    review_expire_at: datetime | None = None

    @field_validator("allow_download")
    @classmethod
    def download_requires_direct_kind(cls, value: bool, info: Any) -> bool:
        kind = info.data.get("kind")
        if value and kind == "official_stream":
            raise ValueError("official_stream 不能启用下载")
        return value


class SourceOut(ApiModel):
    id: str
    name: str
    kind: str
    owner: str
    base_url: str | None
    terms_url: str | None
    license_note: str | None
    region: str
    allow_download: bool
    rate_limit: str
    reviewed_at: datetime | None
    review_expire_at: datetime | None
    disabled_at: datetime | None


class SourceValidateIn(BaseModel):
    terms_confirmed: bool
    rights_confirmed: bool
    review_expire_at: datetime


class DirectDownloadIn(BaseModel):
    source_id: str = Field(min_length=1, max_length=80)
    external_id: str = Field(min_length=1, max_length=200)
    title: str = Field(min_length=1, max_length=240)
    content_kind: Literal["video", "book", "audio"]
    url: HttpUrl
    rights_note: str = Field(min_length=8, max_length=4000)
    proof_url: HttpUrl
    expected_sha256: str | None = Field(default=None, pattern=r"^[a-fA-F0-9]{64}$")
    scheduled_at: datetime | None = None


class BilibiliDownloadIn(BaseModel):
    url: HttpUrl
    title: str | None = Field(default=None, max_length=240)
    max_height: Literal[480, 720, 1080] = 1080
    start_now: bool = True
    rights_confirmed: bool
    rights_note: str = Field(min_length=8, max_length=2000)
    scheduled_at: datetime | None = None


class JobOut(ApiModel):
    id: str
    external_id: str
    title: str
    content_kind: str
    source_id: str
    stage: str
    progress: int
    bytes_done: int
    expected_bytes: int | None
    checksum: str | None
    error_code: str | None
    retry_count: int
    scheduled_at: datetime
    created_at: datetime
    updated_at: datetime


class AssetOut(ApiModel):
    id: str
    submission_id: str | None
    provider: str
    inbound_ref: str
    quarantine_ref: str
    original_name: str
    mime_type: str
    size_bytes: int
    sha256: str
    scan_status: str
    quarantine_status: str
    review_note: str | None
    created_at: datetime


class PlaybackOut(BaseModel):
    mode: Literal["local_asset", "embed", "direct_stream", "external_link", "local_service"]
    url: str | None = None
    service: str | None = None
    expires_at: datetime | None = None


class AdultVerificationIn(BaseModel):
    username: str = Field(min_length=2, max_length=80)
    password: str = Field(min_length=6, max_length=256)

    _password_characters = field_validator("password")(require_ascii_password)


class BilibiliAccountImportIn(AdultVerificationIn):
    browser: Literal["edge", "chrome", "firefox"]


class BilibiliAccountStatusOut(BaseModel):
    connected: bool
    account_name: str | None = None
    account_id: str | None = None
    vip: bool = False
    browser: str | None = None
    updated_at: datetime | None = None


class BilibiliCommentOut(BaseModel):
    id: str
    author: str
    text: str
    likes: int = 0
    timestamp: int | None = None


class BilibiliDanmakuOut(BaseModel):
    id: str
    time: float
    text: str
    color: int = 0xFFFFFF


class BilibiliInteractionsOut(BaseModel):
    comments: list[BilibiliCommentOut]
    danmaku: list[BilibiliDanmakuOut]


class StoragePathsIn(BaseModel):
    video: str = Field(min_length=2, max_length=1000)
    book: str = Field(min_length=2, max_length=1000)
    audio: str = Field(min_length=2, max_length=1000)
    image: str = Field(min_length=2, max_length=1000)
    cache: str = Field(min_length=2, max_length=1000)
    inbox: str = Field(min_length=2, max_length=1000)
    quarantine: str = Field(min_length=2, max_length=1000)


class StoragePathsOut(StoragePathsIn):
    pass


class LocalLibraryImportIn(BaseModel):
    source_path: str = Field(min_length=2, max_length=2000)
    kind: Literal["video", "book", "audio"]
    title: str | None = Field(default=None, max_length=240)
    audience: Literal["child", "family", "adult"] = "family"
    age_from: int = Field(default=0, ge=0, le=99)
    age_to: int = Field(default=99, ge=0, le=99)
    language: str = Field(default="中文", max_length=120)
    description: str = Field(default="", max_length=4000)
    copy_to_library: bool = True
    publish: bool = False


class LibraryItemUpdateIn(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=240)
    subtitle: str | None = Field(default=None, max_length=300)
    language: str | None = Field(default=None, max_length=120)
    age_from: int | None = Field(default=None, ge=0, le=99)
    age_to: int | None = Field(default=None, ge=0, le=99)
    description: str | None = Field(default=None, max_length=4000)
    audience: Literal["child", "family", "adult"] | None = None
    featured: bool | None = None
    publication_status: Literal["draft", "published", "archived"] | None = None


class LibraryItemOut(ApiModel):
    id: str
    title: str
    subtitle: str
    kind: str
    language: str
    age_from: int
    age_to: int
    description: str
    tags: list[str]
    cover_ref: str | None
    acquisition_mode: str
    publication_status: str
    audience: str
    featured: bool
    source_id: str | None
    file_path: str | None
    file_size: int
    file_available: bool
    external_url: str | None
    collection_id: str | None = None
    collection_title: str | None = None
    collection_kind: str | None = None
    episode_index: int | None = None
    episode_count: int | None = None
    section_title: str | None = None
    updated_at: datetime


class LibraryScanOut(BaseModel):
    discovered: int
    skipped: int
    failed: int


class ExternalItemIn(BaseModel):
    url: HttpUrl
    provider: Literal["auto", "bilibili", "douyin", "quark", "direct", "other"] = "auto"
    title: str | None = Field(default=None, max_length=240)
    kind: Literal["video", "book", "audio"] = "video"
    cover_url: HttpUrl | None = None
    audience: Literal["child", "family", "adult"] = "family"
    age_from: int = Field(default=0, ge=0, le=99)
    age_to: int = Field(default=99, ge=0, le=99)
    language: str = Field(default="中文", max_length=120)
    description: str = Field(default="", max_length=4000)

    @field_validator("url")
    @classmethod
    def require_safe_https_url(cls, value: HttpUrl) -> HttpUrl:
        parsed = urlparse(str(value))
        if parsed.scheme != "https" or not parsed.hostname:
            raise ValueError("在线资源必须使用 HTTPS 地址")
        if parsed.username or parsed.password or parsed.fragment:
            raise ValueError("在线资源链接不能包含账号信息或片段")
        return value

    @field_validator("cover_url")
    @classmethod
    def require_safe_cover_url(cls, value: HttpUrl | None) -> HttpUrl | None:
        if value is None:
            return None
        parsed = urlparse(str(value))
        if parsed.scheme != "https" or parsed.username or parsed.password or parsed.fragment:
            raise ValueError("封面地址必须是无账号信息的 HTTPS 链接")
        return value


class ExternalFeedIn(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    url: HttpUrl
    cookie_file: str | None = Field(default=None, max_length=1000)
    audience: Literal["child", "family", "adult"] = "child"
    age_from: int = Field(default=3, ge=0, le=99)
    age_to: int = Field(default=12, ge=0, le=99)
    language: str = Field(default="中文", max_length=120)
    max_items: int = Field(default=50, ge=1, le=200)
    sync_interval_hours: int = Field(default=24, ge=1, le=168)


class ExternalFeedOut(ApiModel):
    id: str
    name: str
    provider: str
    url: str
    cookie_file: str | None = None
    audience: str
    age_from: int
    age_to: int
    language: str
    max_items: int
    sync_interval_hours: int
    enabled: bool
    item_count: int
    last_synced_at: datetime | None = None
    last_attempt_at: datetime | None = None
    last_error: str | None = None


class AssetReviewIn(BaseModel):
    decision: Literal["approved", "rejected", "frozen"]
    rights_confirmed: bool
    security_confirmed: bool
    review_note: str = Field(min_length=3, max_length=2000)
    title: str | None = Field(default=None, max_length=240)
    content_kind: Literal["video", "book", "audio"] | None = None
    audience: Literal["child", "family", "adult"] = "family"
    age_from: int = Field(default=0, ge=0, le=18)
    age_to: int = Field(default=99, ge=0, le=99)
    language: str = Field(default="中文", max_length=120)
    # 仅作为可选的来源/授权备注保存。家庭自有文件、已获授权的下载文件
    # 不应被强制要求提供一个公开 URL；真正的发布门槛是上面的两项人工确认。
    license_ref: str | None = Field(default=None, max_length=1000)


class CompleteIn(BaseModel):
    seconds: int = Field(default=0, ge=0, le=4 * 60 * 60)
    note: str | None = Field(default=None, max_length=300)


class HealthOut(ApiModel):
    status: Literal["ok", "degraded"]
    version: str
    database: str
    setup_required: bool = False


class ReleaseArtifactOut(ApiModel):
    """An installable artifact advertised by the release manifest.

    URLs intentionally remain strings instead of ``HttpUrl``: a home server
    may use a relative path or a private-LAN HTTP URL, while production
    releases should use HTTPS.
    """

    url: str
    signature: str | None = None
    sha256: str | None = Field(default=None, pattern=r"^[a-fA-F0-9]{64}$")
    size_bytes: int | None = Field(default=None, ge=0)
    content_type: str | None = None
    install_mode: Literal["tauri", "manual", "store"] = "manual"


class ReleaseManifestOut(ApiModel):
    app_id: str
    channel: str
    version: str
    min_supported_version: str
    host_api_min_version: str | None = None
    published_at: datetime | None = None
    notes: str
    platforms: dict[str, ReleaseArtifactOut]
    tauri_platforms: dict[str, ReleaseArtifactOut] = Field(default_factory=dict)
    android_store_url: str | None = None
