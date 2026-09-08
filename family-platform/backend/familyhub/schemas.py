from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator


Role = Literal["child", "guardian", "operator"]
ContentKind = Literal["video", "book", "audio", "game", "create", "discover"]


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


class RegistrationIn(BaseModel):
    username: str = Field(min_length=2, max_length=80)
    password: str = Field(min_length=8, max_length=256)
    display_name: str = Field(min_length=1, max_length=100)
    requested_role: Literal["child", "guardian"]
    child_age: int | None = Field(default=None, ge=3, le=17)

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
    original_name: str
    mime_type: str
    size_bytes: int
    sha256: str
    scan_status: str
    quarantine_status: str
    review_note: str | None
    created_at: datetime


class PlaybackOut(BaseModel):
    mode: Literal["local_asset"]
    url: str
    expires_at: datetime


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
    license_ref: HttpUrl | None = None


class CompleteIn(BaseModel):
    seconds: int = Field(default=0, ge=0, le=4 * 60 * 60)
    note: str | None = Field(default=None, max_length=300)


class HealthOut(ApiModel):
    status: Literal["ok", "degraded"]
    version: str
    database: str
    setup_required: bool = False


class ReleaseArtifactOut(ApiModel):
    """发布清单中声明的可安装产物。

    URL 保持字符串类型而不使用 ``HttpUrl``：家庭主机可以使用相对路径或
    私有局域网 HTTP 地址，正式发布则应使用 HTTPS。
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
