from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from sqlalchemy import select
from sqlalchemy.orm import Session

from .bilibili import normalize_bilibili_url
from .config import Settings
from .file_safety import is_within
from .library import external_item_id, load_storage_paths
from .models import ContentItem, ContentSource, SystemSetting, User, new_id, utcnow


EXTERNAL_FEEDS_SETTING_KEY = "external_feeds"
_BILIBILI_HOSTS = {"bilibili.com", "www.bilibili.com", "m.bilibili.com", "space.bilibili.com", "b23.tv"}
_BVID = re.compile(r"^BV[0-9A-Za-z]{10}$", re.IGNORECASE)
_DIRECT_MEDIA_SUFFIXES = {".mp4", ".m4v", ".webm", ".mov", ".m3u8", ".mp3", ".m4a", ".aac", ".ogg", ".wav", ".pdf", ".epub"}


class ExternalCatalogError(RuntimeError):
    pass


@dataclass(frozen=True)
class ExternalEntry:
    external_id: str
    title: str
    url: str
    cover_url: str | None
    duration_minutes: int
    description: str
    uploader: str


def provider_for_url(value: str) -> str:
    hostname = (urlparse(value).hostname or "").rstrip(".").lower()
    if hostname in _BILIBILI_HOSTS:
        return "bilibili"
    if hostname == "douyin.com" or hostname.endswith(".douyin.com"):
        return "douyin"
    if hostname == "quark.cn" or hostname.endswith(".quark.cn"):
        return "quark"
    return "direct" if Path(urlparse(value).path).suffix.lower() in _DIRECT_MEDIA_SUFFIXES else "other"


def normalize_bilibili_catalog_url(value: str) -> str:
    parsed = urlparse(value.strip())
    hostname = (parsed.hostname or "").rstrip(".").lower()
    if parsed.scheme != "https" or hostname not in _BILIBILI_HOSTS:
        raise ValueError("只支持 B 站 HTTPS 视频、UP 主空间、合集或收藏夹链接")
    if parsed.username or parsed.password or parsed.port or parsed.fragment:
        raise ValueError("B站链接不能包含账号信息、自定义端口或片段")
    if hostname in {"bilibili.com", "www.bilibili.com", "m.bilibili.com", "b23.tv"}:
        try:
            return normalize_bilibili_url(value).url
        except ValueError:
            pass

    path = parsed.path.rstrip("/") or "/"
    allowed = False
    if hostname == "space.bilibili.com":
        allowed = bool(
            re.fullmatch(r"/\d+(?:/(?:video|upload/video|favlist|lists/\d+|channel/(?:collectiondetail|seriesdetail)))?", path)
        )
    elif hostname in {"bilibili.com", "www.bilibili.com", "m.bilibili.com"}:
        allowed = bool(re.fullmatch(r"/(?:medialist/(?:detail|play)/[A-Za-z0-9]+|list/[A-Za-z0-9]+)", path))
    if not allowed:
        raise ValueError("B站链接不是受支持的视频、UP 主空间、合集或收藏夹")

    allowed_query = {"fid", "ftype", "type", "sid", "business", "business_id"}
    query = urlencode([(key, value) for key, value in parse_qsl(parsed.query) if key in allowed_query])
    return urlunparse(("https", hostname, path, "", query, ""))


def _cookie_path(db: Session, settings: Settings, value: str | None) -> Path | None:
    if not value or not value.strip():
        return None
    cache_root = load_storage_paths(db, settings, ensure=True)["cache"]
    raw_path = Path(value.strip()).expanduser()
    candidate = (raw_path if raw_path.is_absolute() else cache_root / raw_path).resolve()
    if not is_within(candidate, cache_root) or not candidate.is_file() or candidate.suffix.lower() != ".txt":
        raise ValueError(f"Cookie 文件必须是缓存目录中的 .txt 文件：{cache_root}")
    return candidate


def extract_bilibili_entries(
    url: str,
    *,
    cookie_file: Path | None = None,
    max_items: int = 50,
) -> list[ExternalEntry]:
    canonical = normalize_bilibili_catalog_url(url)
    try:
        from yt_dlp import YoutubeDL
        from yt_dlp.utils import DownloadError
    except ImportError as exc:
        raise ExternalCatalogError("bilibili_engine_unavailable") from exc

    options: dict[str, Any] = {
        "skip_download": True,
        "extract_flat": "in_playlist",
        "playlistend": max(1, min(max_items, 200)),
        "quiet": True,
        "no_warnings": True,
        "socket_timeout": 25,
        "retries": 2,
        "http_headers": {
            "Referer": "https://www.bilibili.com/",
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
            ),
        },
    }
    if cookie_file:
        options["cookiefile"] = str(cookie_file)
    try:
        with YoutubeDL(options) as downloader:
            info = downloader.extract_info(canonical, download=False)
    except DownloadError as exc:
        message = str(exc).casefold()
        code = "bilibili_login_required" if "cookie" in message or "login" in message else "bilibili_metadata_failed"
        raise ExternalCatalogError(code) from exc
    except (OSError, RuntimeError, ValueError) as exc:
        raise ExternalCatalogError("bilibili_metadata_failed") from exc
    if not isinstance(info, dict):
        raise ExternalCatalogError("bilibili_metadata_missing")

    raw_entries = info.get("entries") if info.get("_type") in {"playlist", "multi_video"} else [info]
    entries: list[ExternalEntry] = []
    for raw in raw_entries or []:
        if not isinstance(raw, dict):
            continue
        external_id = str(raw.get("id") or "").strip()
        webpage_url = str(raw.get("webpage_url") or raw.get("url") or "").strip()
        if not _BVID.fullmatch(external_id):
            match = re.search(r"BV[0-9A-Za-z]{10}", webpage_url, flags=re.IGNORECASE)
            external_id = match.group(0) if match else ""
        if not _BVID.fullmatch(external_id):
            continue
        webpage_url = f"https://www.bilibili.com/video/{external_id}"
        thumbnails = raw.get("thumbnails") if isinstance(raw.get("thumbnails"), list) else []
        cover_url = str(raw.get("thumbnail") or "").strip() or next(
            (str(item.get("url")) for item in reversed(thumbnails) if isinstance(item, dict) and item.get("url")),
            "",
        )
        duration = raw.get("duration")
        duration_minutes = max(1, round(float(duration) / 60)) if isinstance(duration, (int, float)) else 10
        title = str(raw.get("title") or external_id).strip()[:240]
        entries.append(
            ExternalEntry(
                external_id=external_id,
                title=title,
                url=webpage_url,
                cover_url=cover_url[:1000] or None,
                duration_minutes=duration_minutes,
                description=str(raw.get("description") or "").strip()[:4000],
                uploader=str(raw.get("uploader") or raw.get("channel") or "B站").strip()[:120],
            )
        )
        if len(entries) >= max_items:
            break
    if not entries:
        raise ExternalCatalogError("bilibili_no_entries")
    return entries


def _ensure_external_source(db: Session, provider: str) -> ContentSource:
    source_id = "bilibili-stream" if provider == "bilibili" else "external-links"
    source = db.get(ContentSource, source_id)
    if source is not None:
        return source
    source = ContentSource(
        id=source_id,
        name="B站在线内容" if provider == "bilibili" else "家庭在线链接",
        kind="official_stream",
        owner="家庭管理员",
        allow_download=False,
        rate_limit="metadata only",
        reviewed_at=utcnow(),
        review_expire_at=utcnow() + timedelta(days=3650),
        license_note="只保存在线播放入口与公开元数据，不在 Client 保存第三方账号凭据。",
    )
    db.add(source)
    db.flush()
    return source


def upsert_external_item(
    db: Session,
    *,
    user: User,
    url: str,
    provider: str,
    title: str,
    kind: str = "video",
    cover_url: str | None = None,
    audience: str = "family",
    age_from: int = 0,
    age_to: int = 99,
    language: str = "中文",
    description: str = "",
    duration_minutes: int = 10,
    external_id: str | None = None,
) -> ContentItem:
    source = _ensure_external_source(db, provider)
    existing = db.scalar(
        select(ContentItem).where(ContentItem.household_id == user.household_id, ContentItem.launch_url == url)
    )
    mode = "external_bilibili" if provider == "bilibili" else "direct_stream" if provider == "direct" else "external_link"
    item = existing or ContentItem(id=external_item_id(url), household_id=user.household_id, kind=kind, title=title)
    item.kind = kind
    item.title = title.strip()[:240]
    item.subtitle = (f"{provider.upper()} 在线播放" if provider != "bilibili" else "B站在线收藏")[:300]
    item.language = language.strip()[:120] or "中文"
    item.age_from = age_from
    item.age_to = age_to
    item.duration_minutes = max(1, duration_minutes)
    item.description = description.strip() or "由家庭管理员添加的在线内容。"
    item.tags = ["在线内容", "B站" if provider == "bilibili" else provider]
    item.cover_ref = cover_url
    item.launch_url = url
    item.acquisition_mode = mode
    item.publication_status = "published"
    item.audience = audience
    item.stimulation_level = "reviewed"
    item.offline_activity = "看完后和家人聊一聊最喜欢的部分"
    item.source_id = source.id
    item.updated_at = utcnow()
    if existing is None:
        db.add(item)
    return item


def upsert_bilibili_entries(
    db: Session,
    *,
    user: User,
    entries: list[ExternalEntry],
    audience: str,
    age_from: int,
    age_to: int,
    language: str,
) -> int:
    count = 0
    for entry in entries:
        upsert_external_item(
            db,
            user=user,
            url=entry.url,
            provider="bilibili",
            title=entry.title,
            cover_url=entry.cover_url,
            audience=audience,
            age_from=age_from,
            age_to=age_to,
            language=language,
            description=entry.description or f"来自 {entry.uploader} 的 B站视频。",
            duration_minutes=entry.duration_minutes,
            external_id=entry.external_id,
        )
        count += 1
    return count


def load_external_feeds(db: Session) -> list[dict[str, Any]]:
    setting = db.get(SystemSetting, EXTERNAL_FEEDS_SETTING_KEY)
    if not setting or not isinstance(setting.value_json, dict):
        return []
    items = setting.value_json.get("items")
    return [dict(item) for item in items if isinstance(item, dict)] if isinstance(items, list) else []


def save_external_feeds(db: Session, feeds: list[dict[str, Any]], *, updated_by: str | None) -> None:
    setting = db.get(SystemSetting, EXTERNAL_FEEDS_SETTING_KEY)
    payload = {"items": feeds}
    if setting is None:
        db.add(SystemSetting(key=EXTERNAL_FEEDS_SETTING_KEY, value_json=payload, updated_by=updated_by))
    else:
        setting.value_json = payload
        setting.updated_by = updated_by
        setting.updated_at = utcnow()


def sync_external_feed(db: Session, settings: Settings, *, user: User, feed: dict[str, Any]) -> int:
    if feed.get("provider") != "bilibili":
        raise ExternalCatalogError("external_provider_not_supported")
    cookie = _cookie_path(db, settings, str(feed.get("cookie_file") or ""))
    entries = extract_bilibili_entries(
        str(feed.get("url") or ""),
        cookie_file=cookie,
        max_items=int(feed.get("max_items") or 50),
    )
    count = upsert_bilibili_entries(
        db,
        user=user,
        entries=entries,
        audience=str(feed.get("audience") or "family"),
        age_from=int(feed.get("age_from") or 0),
        age_to=int(feed.get("age_to") or 99),
        language=str(feed.get("language") or "中文"),
    )
    feed["last_synced_at"] = utcnow().isoformat()
    feed["last_error"] = None
    feed["item_count"] = count
    return count


def sync_due_external_feeds(db: Session, settings: Settings) -> tuple[int, int]:
    feeds = load_external_feeds(db)
    if not feeds:
        return 0, 0
    user = db.scalar(select(User).where(User.role == "operator", User.status == "active").order_by(User.created_at))
    if user is None:
        return 0, 0
    synced = failed = 0
    changed = False
    now = utcnow()
    for feed in feeds:
        if not feed.get("enabled", True):
            continue
        last_attempt = feed.get("last_attempt_at")
        try:
            previous = datetime.fromisoformat(str(last_attempt)) if last_attempt else None
        except ValueError:
            previous = None
        interval = max(1, min(int(feed.get("sync_interval_hours") or 24), 168))
        if previous and previous + timedelta(hours=interval) > now:
            continue
        feed["last_attempt_at"] = now.isoformat()
        changed = True
        try:
            sync_external_feed(db, settings, user=user, feed=feed)
            synced += 1
        except (ExternalCatalogError, OSError, ValueError) as exc:
            feed["last_error"] = str(exc)[:200]
            failed += 1
    if changed:
        save_external_feeds(db, feeds, updated_by=user.id)
        db.commit()
    return synced, failed


def new_external_feed(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": new_id(),
        "name": str(payload["name"]).strip()[:160],
        "provider": "bilibili",
        "url": normalize_bilibili_catalog_url(str(payload["url"])),
        "cookie_file": str(payload.get("cookie_file") or "").strip() or None,
        "audience": str(payload.get("audience") or "family"),
        "age_from": int(payload.get("age_from") or 0),
        "age_to": int(payload.get("age_to") or 99),
        "language": str(payload.get("language") or "中文")[:120],
        "max_items": max(1, min(int(payload.get("max_items") or 50), 200)),
        "sync_interval_hours": max(1, min(int(payload.get("sync_interval_hours") or 24), 168)),
        "enabled": True,
        "item_count": 0,
        "last_synced_at": None,
        "last_attempt_at": None,
        "last_error": None,
    }
