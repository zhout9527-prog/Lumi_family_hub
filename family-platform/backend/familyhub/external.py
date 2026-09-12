from __future__ import annotations

import json
import hashlib
import re
import zlib
from dataclasses import dataclass
from datetime import datetime, timedelta
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse
from urllib.request import Request, urlopen
from xml.etree import ElementTree

from sqlalchemy import select
from sqlalchemy.orm import Session

from .bilibili_account import active_bilibili_cookie_file
from .bilibili import BilibiliReference, normalize_bilibili_url
from .config import Settings
from .file_safety import is_within, scan_file
from .library import external_item_id, load_storage_paths
from .models import (
    ContentCollection,
    ContentCollectionEpisode,
    ContentItem,
    ContentSource,
    SystemSetting,
    User,
    new_id,
    utcnow,
)


EXTERNAL_FEEDS_SETTING_KEY = "external_feeds"
_BILIBILI_HOSTS = {"bilibili.com", "www.bilibili.com", "m.bilibili.com", "space.bilibili.com", "b23.tv"}
_BVID = re.compile(r"^BV[0-9A-Za-z]{10}$", re.IGNORECASE)
_DIRECT_MEDIA_SUFFIXES = {".mp4", ".m4v", ".webm", ".mov", ".m3u8", ".mp3", ".m4a", ".aac", ".ogg", ".wav", ".pdf", ".epub"}
_BILIBILI_IMAGE_HOST_SUFFIXES = (".hdslb.com", ".biliimg.com")
_QUARK_SHARE_HOSTS = {"pan.quark.cn"}
_MAX_COVER_BYTES = 12 * 1024 * 1024
_MAX_EXTERNAL_PAGE_BYTES = 2 * 1024 * 1024
_BILIBILI_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)


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
    # 以下字段用于还原 B 站 UGC 合集和多 P 视频；旧调用方可不填写。
    collection_id: str | None = None
    collection_external_id: str | None = None
    collection_title: str | None = None
    collection_description: str | None = None
    collection_cover_url: str | None = None
    collection_kind: str | None = None
    episode_index: int | None = None
    episode_count: int | None = None
    section_title: str | None = None
    page_number: int = 1


@dataclass(frozen=True)
class ExternalCollection:
    collection_id: str
    external_id: str
    title: str
    description: str
    cover_url: str | None
    source_url: str
    collection_kind: str
    episodes: tuple[ExternalEntry, ...]


@dataclass(frozen=True)
class BilibiliPlayback:
    video_url: str
    video_headers: dict[str, str]
    audio_url: str | None
    audio_headers: dict[str, str]
    quality_label: str


@dataclass(frozen=True)
class ExternalPageMetadata:
    title: str
    description: str
    cover_url: str | None


class _MetadataParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.metadata: dict[str, str] = {}
        self.title_parts: list[str] = []
        self._inside_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = {key.casefold(): value or "" for key, value in attrs}
        if tag.casefold() == "title":
            self._inside_title = True
        if tag.casefold() != "meta":
            return
        key = (attributes.get("property") or attributes.get("name") or "").casefold()
        content = attributes.get("content", "").strip()
        if key and content and key not in self.metadata:
            self.metadata[key] = content

    def handle_endtag(self, tag: str) -> None:
        if tag.casefold() == "title":
            self._inside_title = False

    def handle_data(self, data: str) -> None:
        if self._inside_title and data.strip():
            self.title_parts.append(data.strip())


def provider_for_url(value: str) -> str:
    hostname = (urlparse(value).hostname or "").rstrip(".").lower()
    if hostname in _BILIBILI_HOSTS:
        return "bilibili"
    if hostname == "douyin.com" or hostname.endswith(".douyin.com"):
        return "douyin"
    if hostname == "quark.cn" or hostname.endswith(".quark.cn"):
        return "quark"
    return "direct" if Path(urlparse(value).path).suffix.lower() in _DIRECT_MEDIA_SUFFIXES else "other"


def normalize_quark_share_url(value: str) -> str:
    parsed = urlparse(value.strip())
    hostname = (parsed.hostname or "").rstrip(".").casefold()
    if parsed.scheme != "https" or hostname not in _QUARK_SHARE_HOSTS:
        raise ValueError("只支持 pan.quark.cn 的 HTTPS 分享链接")
    if parsed.username or parsed.password or parsed.port or parsed.fragment:
        raise ValueError("夸克分享链接不能包含账号信息、自定义端口或片段")
    path = parsed.path.rstrip("/")
    if not re.fullmatch(r"/s/[0-9A-Za-z_-]{4,160}", path):
        raise ValueError("夸克分享链接格式无效")
    query = urlencode([(key, item) for key, item in parse_qsl(parsed.query) if key in {"pwd"}])
    return urlunparse(("https", hostname, path, "", query, ""))


def fetch_quark_share_metadata(value: str) -> ExternalPageMetadata:
    url = normalize_quark_share_url(value)
    request = Request(
        url,
        headers={
            "User-Agent": _BILIBILI_USER_AGENT,
            "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
        },
    )
    try:
        with urlopen(request, timeout=15) as response:
            final_url = str(response.geturl())
            final_host = (urlparse(final_url).hostname or "").rstrip(".").casefold()
            if final_host not in _QUARK_SHARE_HOSTS:
                raise ExternalCatalogError("quark_share_redirect_invalid")
            content_type = str(response.headers.get("Content-Type") or "").casefold()
            if "text/html" not in content_type:
                raise ExternalCatalogError("quark_share_page_invalid")
            body = response.read(_MAX_EXTERNAL_PAGE_BYTES + 1)
    except ExternalCatalogError:
        raise
    except OSError as exc:
        raise ExternalCatalogError("quark_share_metadata_failed") from exc
    if not body or len(body) > _MAX_EXTERNAL_PAGE_BYTES:
        raise ExternalCatalogError("quark_share_page_invalid")
    parser = _MetadataParser()
    try:
        parser.feed(body.decode("utf-8", errors="replace"))
    except (UnicodeError, ValueError) as exc:
        raise ExternalCatalogError("quark_share_page_invalid") from exc
    title = (parser.metadata.get("og:title") or " ".join(parser.title_parts)).strip()
    for suffix in (" - 夸克网盘", "_夸克网盘", " | 夸克网盘"):
        if title.endswith(suffix):
            title = title[: -len(suffix)].strip()
    description = (parser.metadata.get("og:description") or parser.metadata.get("description") or "").strip()
    cover = (parser.metadata.get("og:image") or "").strip()
    if cover:
        parsed_cover = urlparse(cover)
        if (
            parsed_cover.scheme != "https"
            or not parsed_cover.hostname
            or parsed_cover.username
            or parsed_cover.password
            or parsed_cover.port
            or parsed_cover.fragment
        ):
            cover = ""
    return ExternalPageMetadata(
        title=title[:240],
        description=description[:4000],
        cover_url=cover[:1000] or None,
    )


def normalize_bilibili_catalog_url(value: str) -> str:
    parsed = urlparse(value.strip())
    hostname = (parsed.hostname or "").rstrip(".").lower()
    if parsed.scheme != "https" or hostname not in _BILIBILI_HOSTS:
        raise ValueError("只支持 B 站 HTTPS 视频、UP 主空间、合集或收藏夹链接")
    if parsed.username or parsed.password or parsed.port or parsed.fragment:
        raise ValueError("B站链接不能包含账号信息、自定义端口或片段")
    if hostname in {"bilibili.com", "www.bilibili.com", "m.bilibili.com", "b23.tv"}:
        try:
            return normalize_bilibili_url(value, preserve_page=True).url
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


def _https_bilibili_image_url(value: str | None) -> str | None:
    if not value:
        return None
    parsed = urlparse(value.strip())
    hostname = (parsed.hostname or "").casefold().rstrip(".")
    if not hostname or not any(hostname.endswith(suffix) for suffix in _BILIBILI_IMAGE_HOST_SUFFIXES):
        return None
    if parsed.username or parsed.password or parsed.port or parsed.fragment:
        return None
    return urlunparse(("https", hostname, parsed.path, "", parsed.query, ""))


def _cover_image_suffix(content_type: str, body: bytes) -> str | None:
    normalized = content_type.split(";", 1)[0].strip().casefold()
    declared = {
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
    }.get(normalized)
    if declared:
        return declared
    if body.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if body.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if len(body) >= 12 and body.startswith(b"RIFF") and body[8:12] == b"WEBP":
        return ".webp"
    return None


def _bilibili_cookie_header(cookie_file: Path | None) -> str:
    if cookie_file is None:
        return ""
    from http.cookiejar import MozillaCookieJar

    try:
        jar = MozillaCookieJar(str(cookie_file))
        jar.load(ignore_discard=True, ignore_expires=True)
    except (OSError, ValueError):
        return ""
    return "; ".join(
        f"{cookie.name}={cookie.value}"
        for cookie in jar
        if (cookie.domain or "").casefold().lstrip(".").endswith("bilibili.com")
    )


def _bilibili_request(url: str, *, cookie_file: Path | None = None, accept: str = "application/json") -> Request:
    headers = {
        "Accept": accept,
        "Accept-Encoding": "identity",
        "Referer": "https://www.bilibili.com/",
        "User-Agent": _BILIBILI_USER_AGENT,
    }
    cookie = _bilibili_cookie_header(cookie_file)
    if cookie:
        headers["Cookie"] = cookie
    return Request(url, headers=headers)


def _fetch_bilibili_view_data(
    url: str,
    *,
    cookie_file: Path | None = None,
) -> tuple[BilibiliReference, dict[str, Any]]:
    """读取一次 B 站 view 接口，同时返回规范引用和原始数据。"""

    reference = normalize_bilibili_url(url, preserve_page=True)
    if not reference.external_id.upper().startswith("BV"):
        raise ExternalCatalogError("bilibili_metadata_failed")
    endpoint = f"https://api.bilibili.com/x/web-interface/view?bvid={reference.external_id}"
    try:
        with urlopen(_bilibili_request(endpoint, cookie_file=cookie_file), timeout=20) as response:
            payload = json.loads(response.read(4 * 1024 * 1024).decode("utf-8"))
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        raise ExternalCatalogError("bilibili_metadata_failed") from exc
    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, dict) or payload.get("code") != 0:
        raise ExternalCatalogError("bilibili_metadata_failed")
    return reference, data


def _collection_key(kind: str, external_id: str) -> str:
    digest = hashlib.sha256(f"bilibili:{kind}:{external_id}".encode("utf-8")).hexdigest()[:32]
    return f"bilibili-collection-{digest}"


def _seconds_to_minutes(value: Any, default: int = 10) -> int:
    return max(1, round(float(value) / 60)) if isinstance(value, (int, float)) else default


def _episode_entry(
    *,
    reference: BilibiliReference,
    title: str,
    cover_url: str | None,
    duration: Any,
    description: str,
    uploader: str,
    collection_id: str,
    collection_external_id: str,
    collection_title: str,
    collection_description: str,
    collection_cover_url: str | None,
    collection_kind: str,
    episode_index: int,
    episode_count: int,
    section_title: str = "",
    page_number: int = 1,
) -> ExternalEntry:
    page_url = normalize_bilibili_url(reference.url, preserve_page=True).url
    return ExternalEntry(
        external_id=reference.external_id,
        title=title.strip()[:240] or reference.external_id,
        url=page_url,
        cover_url=cover_url,
        duration_minutes=_seconds_to_minutes(duration),
        description=description.strip()[:4000],
        uploader=uploader.strip()[:120] or "B站",
        collection_id=collection_id,
        collection_external_id=collection_external_id,
        collection_title=collection_title[:240],
        collection_description=collection_description[:4000],
        collection_cover_url=collection_cover_url,
        collection_kind=collection_kind,
        episode_index=episode_index,
        episode_count=episode_count,
        section_title=section_title[:240],
        page_number=page_number,
    )


def fetch_bilibili_public_metadata(url: str, *, cookie_file: Path | None = None) -> ExternalEntry:
    reference, data = _fetch_bilibili_view_data(url, cookie_file=cookie_file)
    duration = data.get("duration")
    return ExternalEntry(
        external_id=reference.external_id,
        title=str(data.get("title") or reference.external_id).strip()[:240],
        url=reference.url,
        cover_url=_https_bilibili_image_url(str(data.get("pic") or "")),
        duration_minutes=_seconds_to_minutes(duration),
        description=str(data.get("desc") or "").strip()[:4000],
        uploader=str((data.get("owner") or {}).get("name") or "B站").strip()[:120]
        if isinstance(data.get("owner"), dict)
        else "B站",
    )


def fetch_bilibili_collection(url: str, *, cookie_file: Path | None = None) -> ExternalCollection | None:
    """从任意合集分集还原完整 UGC 合集；没有合集时识别多 P 页面。"""

    reference, data = _fetch_bilibili_view_data(url, cookie_file=cookie_file)
    owner = (data.get("owner") or {}).get("name") if isinstance(data.get("owner"), dict) else "B站"
    owner = str(owner or "B站")
    main_cover = _https_bilibili_image_url(str(data.get("pic") or ""))
    ugc = data.get("ugc_season")
    if isinstance(ugc, dict) and isinstance(ugc.get("sections"), list):
        season_id = str(ugc.get("id") or "").strip()
        sections = ugc.get("sections") or []
        raw_episodes: list[tuple[dict[str, Any], str]] = []
        for section in sections:
            if not isinstance(section, dict):
                continue
            section_title = str(section.get("title") or "").strip()
            for episode in section.get("episodes") or []:
                if isinstance(episode, dict):
                    raw_episodes.append((episode, section_title))
        if season_id and raw_episodes:
            collection_id = _collection_key("ugc_season", season_id)
            season_title = str(ugc.get("title") or data.get("title") or season_id).strip()
            season_description = str(ugc.get("intro") or data.get("desc") or "").strip()
            season_cover = _https_bilibili_image_url(str(ugc.get("cover") or "")) or main_cover
            episodes: list[ExternalEntry] = []
            for index, (episode, section_title) in enumerate(raw_episodes, start=1):
                arc = episode.get("arc") if isinstance(episode.get("arc"), dict) else episode
                bvid = str(arc.get("bvid") or episode.get("bvid") or "").strip()
                if not _BVID.fullmatch(bvid):
                    continue
                page = episode.get("page") if isinstance(episode.get("page"), dict) else {}
                episode_reference = BilibiliReference(
                    url=f"https://www.bilibili.com/video/{bvid}",
                    external_id=bvid,
                )
                episode_cover = _https_bilibili_image_url(str(arc.get("pic") or "")) or season_cover
                episode_title = str(arc.get("title") or arc.get("name") or episode.get("title") or bvid)
                episodes.append(
                    _episode_entry(
                        reference=episode_reference,
                        title=episode_title,
                        cover_url=episode_cover,
                        duration=arc.get("duration") or page.get("duration"),
                        description=str(arc.get("desc") or season_description),
                        uploader=str((arc.get("author") or {}).get("name") or owner)
                        if isinstance(arc.get("author"), dict)
                        else owner,
                        collection_id=collection_id,
                        collection_external_id=season_id,
                        collection_title=season_title,
                        collection_description=season_description,
                        collection_cover_url=season_cover,
                        collection_kind="ugc_season",
                        episode_index=index,
                        episode_count=len(raw_episodes),
                        section_title=section_title,
                    )
                )
            if episodes:
                return ExternalCollection(
                    collection_id=collection_id,
                    external_id=season_id,
                    title=season_title[:240],
                    description=season_description[:4000],
                    cover_url=season_cover,
                    source_url=reference.url,
                    collection_kind="ugc_season",
                    episodes=tuple(episodes),
                )

    pages = data.get("pages") if isinstance(data.get("pages"), list) else []
    if len(pages) > 1:
        collection_id = _collection_key("multi_page", reference.external_id)
        title = str(data.get("title") or reference.external_id).strip()
        description = str(data.get("desc") or "").strip()
        episodes: list[ExternalEntry] = []
        for index, page in enumerate(pages, start=1):
            if not isinstance(page, dict):
                continue
            page_number = int(page.get("page") or index)
            page_url = f"https://www.bilibili.com/video/{reference.external_id}?p={page_number}"
            page_reference = BilibiliReference(url=page_url, external_id=reference.external_id)
            episodes.append(
                _episode_entry(
                    reference=page_reference,
                    title=str(page.get("part") or f"第 {page_number} P"),
                    cover_url=main_cover,
                    duration=page.get("duration") or data.get("duration"),
                    description=description,
                    uploader=owner,
                    collection_id=collection_id,
                    collection_external_id=reference.external_id,
                    collection_title=title,
                    collection_description=description,
                    collection_cover_url=main_cover,
                    collection_kind="multi_page",
                    episode_index=index,
                    episode_count=len(pages),
                    page_number=page_number,
                )
            )
        if episodes:
            return ExternalCollection(
                collection_id=collection_id,
                external_id=reference.external_id,
                title=title[:240],
                description=description[:4000],
                cover_url=main_cover,
                source_url=reference.url,
                collection_kind="multi_page",
                episodes=tuple(episodes),
            )
    return None


def cache_external_cover(
    db: Session,
    settings: Settings,
    *,
    item: ContentItem,
    cover_url: str | None,
    provider: str,
) -> str | None:
    if not cover_url:
        return None
    if provider != "bilibili":
        item.cover_ref = cover_url[:500]
        return item.cover_ref
    source_url = _https_bilibili_image_url(cover_url)
    if source_url is None:
        return None
    image_root = load_storage_paths(db, settings, ensure=True)["image"]
    temporary = (image_root / f".{item.id}--cover.tmp").resolve()
    if not is_within(temporary, image_root):
        raise ExternalCatalogError("bilibili_cover_path_invalid")
    candidate: Path | None = None
    try:
        with urlopen(_bilibili_request(source_url, accept="image/jpeg,image/png,image/webp,*/*;q=0.1"), timeout=20) as response:
            content_type = str(response.headers.get("Content-Type") or "").split(";", 1)[0].strip().casefold()
            body = response.read(_MAX_COVER_BYTES + 1)
        if not body or len(body) > _MAX_COVER_BYTES:
            raise ExternalCatalogError("bilibili_cover_size_invalid")
        suffix = _cover_image_suffix(content_type, body)
        if suffix is None:
            raise ExternalCatalogError("bilibili_cover_format_invalid")
        temporary.write_bytes(body)
        candidate = temporary.with_suffix(suffix)
        temporary.replace(candidate)
        if scan_file(candidate, max_bytes=_MAX_COVER_BYTES, use_defender=False).status == "blocked":
            candidate.unlink(missing_ok=True)
            raise ExternalCatalogError("bilibili_cover_format_invalid")
        destination = image_root / f"{item.id}--cover{suffix}"
        for old_cover in image_root.glob(f"{item.id}--cover.*"):
            if old_cover != candidate and old_cover != destination and old_cover.is_file():
                old_cover.unlink(missing_ok=True)
        candidate.replace(destination)
    except ExternalCatalogError:
        temporary.unlink(missing_ok=True)
        if candidate is not None:
            candidate.unlink(missing_ok=True)
        raise
    except OSError as exc:
        temporary.unlink(missing_ok=True)
        if candidate is not None:
            candidate.unlink(missing_ok=True)
        raise ExternalCatalogError("bilibili_cover_download_failed") from exc
    item.cover_ref = f"/api/v1/artwork/{item.id}"
    return item.cover_ref


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
        description = str(raw.get("description") or "").strip()[:4000]
        uploader = str(raw.get("uploader") or raw.get("channel") or "B站").strip()[:120]
        normalized_cover = _https_bilibili_image_url(cover_url)
        if normalized_cover is None or title.casefold() == external_id.casefold():
            try:
                enriched = fetch_bilibili_public_metadata(webpage_url, cookie_file=cookie_file)
            except ExternalCatalogError:
                enriched = None
            if enriched is not None:
                normalized_cover = normalized_cover or enriched.cover_url
                if title.casefold() == external_id.casefold():
                    title = enriched.title
                if not isinstance(duration, (int, float)):
                    duration_minutes = enriched.duration_minutes
                description = description or enriched.description
                uploader = uploader if uploader != "B站" else enriched.uploader
        entries.append(
            ExternalEntry(
                external_id=external_id,
                title=title,
                url=webpage_url,
                cover_url=normalized_cover,
                duration_minutes=duration_minutes,
                description=description,
                uploader=uploader,
            )
        )
        if len(entries) >= max_items:
            break
    if not entries:
        raise ExternalCatalogError("bilibili_no_entries")
    return entries


def _single_bilibili_info(url: str, *, cookie_file: Path | None, get_comments: bool = False) -> dict[str, Any]:
    try:
        from yt_dlp import YoutubeDL
        from yt_dlp.utils import DownloadError
    except ImportError as exc:
        raise ExternalCatalogError("bilibili_engine_unavailable") from exc
    options: dict[str, Any] = {
        "skip_download": True,
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "socket_timeout": 25,
        "retries": 2,
        "getcomments": get_comments,
        "http_headers": {
            "Referer": "https://www.bilibili.com/",
            "User-Agent": _BILIBILI_USER_AGENT,
        },
    }
    if cookie_file:
        options["cookiefile"] = str(cookie_file)
    try:
        with YoutubeDL(options) as downloader:
            # 保留用户选择的多 P 页；没有页码时让 yt-dlp 读取默认页。
            info = downloader.extract_info(normalize_bilibili_url(url, preserve_page=True).url, download=False)
    except DownloadError as exc:
        message = str(exc).casefold()
        code = "bilibili_login_required" if "cookie" in message or "login" in message else "bilibili_metadata_failed"
        raise ExternalCatalogError(code) from exc
    except (OSError, RuntimeError, ValueError) as exc:
        raise ExternalCatalogError("bilibili_metadata_failed") from exc
    if isinstance(info, dict) and info.get("_type") == "playlist":
        info = next((entry for entry in info.get("entries") or [] if isinstance(entry, dict)), None)
    if not isinstance(info, dict):
        raise ExternalCatalogError("bilibili_metadata_missing")
    return info


def _safe_stream_headers(value: Any, *, cookie_file: Path | None) -> dict[str, str]:
    raw = value if isinstance(value, dict) else {}
    headers = {
        "Accept": "*/*",
        "Referer": str(raw.get("Referer") or "https://www.bilibili.com/"),
        "User-Agent": str(raw.get("User-Agent") or _BILIBILI_USER_AGENT),
    }
    # CDN 地址由 Server 使用登录状态解析后得到；Cookie 不写入 ffmpeg
    # 命令行，也不会经播放票据下发到 Client。
    return headers


def resolve_bilibili_playback(url: str, *, cookie_file: Path | None = None) -> BilibiliPlayback:
    info = _single_bilibili_info(url, cookie_file=cookie_file)
    formats = [item for item in (info.get("formats") or []) if isinstance(item, dict) and item.get("url")]
    compatible_video = [
        item
        for item in formats
        if item.get("vcodec") not in {None, "none"}
        and item.get("acodec") in {None, "none"}
        and str(item.get("ext") or "").casefold() in {"mp4", "m4v"}
        and str(item.get("vcodec") or "").casefold().startswith(("avc1", "h264"))
        and int(item.get("height") or 0) <= 1080
    ]
    audio_formats = [
        item
        for item in formats
        if item.get("vcodec") in {None, "none"}
        and item.get("acodec") not in {None, "none"}
        and str(item.get("ext") or "").casefold() in {"m4a", "mp4"}
    ]
    combined = [
        item
        for item in formats
        if item.get("vcodec") not in {None, "none"}
        and item.get("acodec") not in {None, "none"}
        and str(item.get("ext") or "").casefold() in {"mp4", "m4v"}
    ]
    score = lambda item: (int(item.get("height") or 0), float(item.get("tbr") or 0))
    if compatible_video and audio_formats:
        video = max(compatible_video, key=score)
        audio = max(audio_formats, key=lambda item: float(item.get("abr") or item.get("tbr") or 0))
        height = int(video.get("height") or 0)
        return BilibiliPlayback(
            video_url=str(video["url"]),
            video_headers=_safe_stream_headers(video.get("http_headers"), cookie_file=cookie_file),
            audio_url=str(audio["url"]),
            audio_headers=_safe_stream_headers(audio.get("http_headers"), cookie_file=cookie_file),
            quality_label=f"{height}P" if height else "高清",
        )
    if combined:
        media = max(combined, key=score)
        height = int(media.get("height") or 0)
        return BilibiliPlayback(
            video_url=str(media["url"]),
            video_headers=_safe_stream_headers(media.get("http_headers"), cookie_file=cookie_file),
            audio_url=None,
            audio_headers={},
            quality_label=f"{height}P" if height else "标准",
        )
    raise ExternalCatalogError("bilibili_format_unavailable")


def fetch_bilibili_interactions(url: str, *, cookie_file: Path | None = None) -> dict[str, Any]:
    reference = normalize_bilibili_url(url, preserve_page=True)
    page_number = 1
    try:
        page_number = max(1, int(dict(parse_qsl(urlparse(reference.url).query)).get("p", "1")))
    except ValueError:
        page_number = 1
    endpoint = f"https://api.bilibili.com/x/web-interface/view?bvid={reference.external_id}"
    try:
        with urlopen(_bilibili_request(endpoint, cookie_file=cookie_file), timeout=20) as response:
            payload = json.loads(response.read(4 * 1024 * 1024).decode("utf-8"))
        data = payload.get("data") if isinstance(payload, dict) else None
        pages = data.get("pages") if isinstance(data, dict) else None
        selected_page = (
            next(
                (
                    page
                    for page in pages
                    if isinstance(page, dict) and int(page.get("page") or 0) == page_number
                ),
                pages[0] if pages else {},
            )
            if isinstance(pages, list)
            else {}
        )
        cid = str(selected_page.get("cid") or data.get("cid") or "") if isinstance(data, dict) else ""
    except (OSError, ValueError, json.JSONDecodeError):
        cid = ""

    comments: list[dict[str, Any]] = []
    try:
        info = _single_bilibili_info(url, cookie_file=cookie_file, get_comments=True)
        for raw in info.get("comments") or []:
            if not isinstance(raw, dict):
                continue
            text = " ".join(str(raw.get("text") or "").split())[:600]
            if not text:
                continue
            comments.append(
                {
                    "id": str(raw.get("id") or len(comments)),
                    "author": str(raw.get("author") or "B站用户").strip()[:80],
                    "text": text,
                    "likes": max(0, int(raw.get("like_count") or 0)),
                    "timestamp": int(raw.get("timestamp") or 0) or None,
                }
            )
            if len(comments) >= 50:
                break
    except (ExternalCatalogError, TypeError, ValueError):
        comments = []

    danmaku: list[dict[str, Any]] = []
    if cid.isdigit():
        try:
            with urlopen(
                _bilibili_request(
                    f"https://api.bilibili.com/x/v1/dm/list.so?oid={cid}",
                    cookie_file=cookie_file,
                    accept="application/xml,text/xml",
                ),
                timeout=20,
            ) as response:
                raw_xml = response.read(8 * 1024 * 1024)
                encoding = str(response.headers.get("Content-Encoding") or "").casefold()
            if encoding == "deflate":
                try:
                    raw_xml = zlib.decompress(raw_xml)
                except zlib.error:
                    raw_xml = zlib.decompress(raw_xml, -zlib.MAX_WBITS)
            root = ElementTree.fromstring(raw_xml)
            for index, node in enumerate(root.findall("d")):
                values = str(node.attrib.get("p") or "").split(",")
                text = " ".join((node.text or "").split())[:120]
                if not text or not values:
                    continue
                danmaku.append(
                    {
                        "id": f"{cid}-{index}",
                        "time": max(0.0, float(values[0])),
                        "text": text,
                        "color": int(values[3]) if len(values) > 3 and values[3].isdigit() else 0xFFFFFF,
                    }
                )
                if len(danmaku) >= 500:
                    break
        except (OSError, ValueError, ElementTree.ParseError, zlib.error):
            danmaku = []
    return {"comments": comments, "danmaku": sorted(danmaku, key=lambda item: item["time"])}


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
    tags: list[str] | None = None,
    duration_minutes: int = 10,
    external_id: str | None = None,
    force_publish: bool = False,
) -> ContentItem:
    source = _ensure_external_source(db, provider)
    existing = db.scalar(
        select(ContentItem).where(ContentItem.household_id == user.household_id, ContentItem.launch_url == url)
    )
    update_editorial_policy = existing is None or force_publish
    mode = (
        "external_bilibili"
        if provider == "bilibili"
        else "external_quark"
        if provider == "quark"
        else "direct_stream"
        if provider == "direct"
        else "external_link"
    )
    item = existing or ContentItem(id=external_item_id(url), household_id=user.household_id, kind=kind, title=title)
    if update_editorial_policy:
        item.kind = kind
    item.title = title.strip()[:240]
    item.subtitle = (
        "B站在线收藏"
        if provider == "bilibili"
        else "夸克网盘分享"
        if provider == "quark"
        else f"{provider.upper()} 在线播放"
    )[:300]
    if update_editorial_policy:
        item.language = language.strip()[:120] or "中文"
        item.age_from = age_from
        item.age_to = age_to
    item.duration_minutes = max(1, duration_minutes)
    item.description = description.strip() or "由家庭管理员添加的在线内容。"
    if update_editorial_policy:
        item.tags = list(dict.fromkeys([
            "在线内容",
            "B站" if provider == "bilibili" else provider,
            *(tags or []),
        ]))
    if provider == "bilibili":
        # B站图片有防盗链，统一经 Server 缓存和鉴权输出，避免各端直接加载失败。
        item.cover_ref = f"/api/v1/artwork/{item.id}"
    elif cover_url:
        item.cover_ref = cover_url[:500]
    item.launch_url = url
    item.acquisition_mode = mode
    if existing is None or force_publish:
        item.publication_status = "published"
    if update_editorial_policy:
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
    settings: Settings,
    *,
    user: User,
    entries: list[ExternalEntry],
    audience: str,
    age_from: int,
    age_to: int,
    language: str,
    tags: list[str] | None = None,
) -> int:
    count = 0
    cover_budget = 12
    collections: dict[str, ContentCollection] = {}
    incoming_collection_urls: dict[str, set[str]] = {}
    for entry in entries:
        collection: ContentCollection | None = None
        if entry.collection_id:
            collection = collections.get(entry.collection_id) or db.get(ContentCollection, entry.collection_id)
            if collection is None:
                collection = ContentCollection(
                    id=entry.collection_id,
                    household_id=user.household_id,
                    provider="bilibili",
                    external_id=entry.collection_external_id or entry.collection_id,
                    title=entry.collection_title or entry.title,
                    description=entry.collection_description or "",
                    cover_url=entry.collection_cover_url,
                    source_url=entry.url,
                    collection_kind=entry.collection_kind or "ugc_season",
                    episode_count=entry.episode_count or 0,
                )
                db.add(collection)
                db.flush()
            elif collection.household_id != user.household_id:
                continue
            if collection.publication_status == "deleted":
                # 用户删除过的整个合集不因后台定时同步而复活。
                continue
            collection.title = (entry.collection_title or collection.title)[:240]
            collection.description = (entry.collection_description or collection.description)[:4000]
            collection.cover_url = entry.collection_cover_url or collection.cover_url
            collection.collection_kind = entry.collection_kind or collection.collection_kind
            collection.episode_count = entry.episode_count or collection.episode_count
            collection.updated_at = utcnow()
            collections[entry.collection_id] = collection
            incoming_collection_urls.setdefault(entry.collection_id, set()).add(entry.url)
        item = upsert_external_item(
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
            tags=tags,
            duration_minutes=entry.duration_minutes,
            external_id=entry.external_id,
        )
        db.flush()
        if item.publication_status == "deleted":
            if collection is not None:
                episode = db.get(ContentCollectionEpisode, _episode_key(collection.id, entry.url))
                if episode is not None:
                    episode.publication_status = "deleted"
            continue
        if collection is not None:
            item.subtitle = f"{collection.title} · 第 {entry.episode_index or 1} 集"[:300]
            item.tags = list(dict.fromkeys([*(item.tags or []), "合集", collection.title]))
            episode_id = _episode_key(collection.id, entry.url)
            episode = db.get(ContentCollectionEpisode, episode_id)
            if episode is None:
                episode = ContentCollectionEpisode(
                    id=episode_id,
                    collection_id=collection.id,
                    content_id=item.id,
                    external_id=entry.external_id,
                    title=entry.title,
                    source_url=entry.url,
                )
                db.add(episode)
            episode.content_id = item.id
            episode.external_id = entry.external_id
            episode.page_number = max(1, entry.page_number)
            episode.episode_index = max(1, entry.episode_index or 1)
            episode.section_title = entry.section_title or ""
            episode.title = entry.title[:240]
            episode.source_url = entry.url
            episode.cover_url = entry.cover_url
            episode.duration_minutes = max(1, entry.duration_minutes)
            episode.publication_status = item.publication_status
            episode.updated_at = utcnow()
        if entry.cover_url and cover_budget > 0:
            try:
                cache_external_cover(db, settings, item=item, cover_url=entry.cover_url, provider="bilibili")
                cover_budget -= 1
            except ExternalCatalogError:
                # 元数据同步不能因为单张封面临时不可用而整体失败。
                pass
        count += 1
    for collection_id, incoming_urls in incoming_collection_urls.items():
        for episode in db.scalars(
            select(ContentCollectionEpisode).where(
                ContentCollectionEpisode.collection_id == collection_id,
                ContentCollectionEpisode.publication_status != "deleted",
            )
        ).all():
            if episode.source_url not in incoming_urls:
                episode.publication_status = "unavailable"
                episode.updated_at = utcnow()
    return count


def _episode_key(collection_id: str, url: str) -> str:
    digest = hashlib.sha256(f"{collection_id}:{url}".encode("utf-8")).hexdigest()[:32]
    return f"bilibili-episode-{digest}"


def expand_bilibili_collections(
    entries: list[ExternalEntry],
    *,
    cookie_file: Path | None = None,
) -> list[ExternalEntry]:
    """将收藏夹中的任意一集扩展为原合集，并按平台顺序去重。"""

    expanded: list[ExternalEntry] = []
    seen_urls: set[str] = set()
    seen_collections: set[str] = set()
    for seed in entries:
        if seed.url in seen_urls:
            continue
        collection: ExternalCollection | None = None
        try:
            collection = fetch_bilibili_collection(seed.url, cookie_file=cookie_file)
        except (ExternalCatalogError, OSError, ValueError):
            # 单条元数据仍然可用时，合集接口失败不能阻断整个收藏夹同步。
            collection = None
        if collection is not None and collection.collection_id not in seen_collections:
            seen_collections.add(collection.collection_id)
            candidates = collection.episodes
        elif collection is not None:
            candidates = ()
        else:
            candidates = (seed,)
        for entry in candidates:
            if entry.url in seen_urls:
                continue
            seen_urls.add(entry.url)
            expanded.append(entry)
    return expanded


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
    cookie = _cookie_path(db, settings, str(feed.get("cookie_file") or "")) or active_bilibili_cookie_file(settings)
    entries = extract_bilibili_entries(
        str(feed.get("url") or ""),
        cookie_file=cookie,
        max_items=int(feed.get("max_items") or 50),
    )
    entries = expand_bilibili_collections(entries, cookie_file=cookie)
    count = upsert_bilibili_entries(
        db,
        settings,
        user=user,
        entries=entries,
        audience=str(feed.get("audience") or "family"),
        age_from=int(feed.get("age_from") or 0),
        age_to=int(feed.get("age_to") or 99),
        language=str(feed.get("language") or "中文"),
        tags=list(feed.get("tags") or []),
    )
    completed_at = utcnow().isoformat()
    feed["last_attempt_at"] = completed_at
    feed["last_synced_at"] = completed_at
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
        "tags": list(payload.get("tags") or []),
        "max_items": max(1, min(int(payload.get("max_items") or 50), 200)),
        "sync_interval_hours": max(1, min(int(payload.get("sync_interval_hours") or 24), 168)),
        "enabled": True,
        "item_count": 0,
        "last_synced_at": None,
        "last_attempt_at": None,
        "last_error": None,
    }
