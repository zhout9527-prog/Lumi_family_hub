from __future__ import annotations

import mimetypes
import re
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Callable
from urllib.parse import urlparse, urlunparse

from .download import DownloadRejected
from .file_safety import safe_filename, sha256_file


BILIBILI_SOURCE_ID = "bilibili-public"
_BVID_PATTERN = re.compile(r"(?<![0-9A-Za-z])(BV[0-9A-Za-z]{10})(?![0-9A-Za-z])")
_ALLOWED_HOSTS = {"www.bilibili.com", "m.bilibili.com", "bilibili.com", "b23.tv"}
_MEDIA_SUFFIXES = {".m4a", ".mkv", ".mp4", ".mov", ".webm"}


@dataclass(frozen=True)
class BilibiliReference:
    url: str
    external_id: str


@dataclass(frozen=True)
class BilibiliDownloadResult:
    path: Path
    checksum: str
    size_bytes: int
    mime_type: str
    title: str
    external_id: str
    duration_seconds: int | None


def normalize_bilibili_url(value: str) -> BilibiliReference:
    """Accept only public Bilibili video pages and discard tracking parameters."""

    parsed = urlparse(value.strip())
    hostname = (parsed.hostname or "").rstrip(".").lower()
    if parsed.scheme != "https" or hostname not in _ALLOWED_HOSTS:
        raise ValueError("只支持 https://www.bilibili.com/video/... 或 b23.tv 的公开链接")
    if parsed.username or parsed.password or parsed.port:
        raise ValueError("B站链接不能包含账号信息或自定义端口")

    if hostname == "b23.tv":
        path = parsed.path.rstrip("/")
        if not path or path == "/" or len(path) > 120:
            raise ValueError("b23.tv 短链接格式不正确")
        canonical = urlunparse(("https", "b23.tv", path, "", "", ""))
        return BilibiliReference(canonical, "short-" + safe_filename(path.lstrip("/"))[:80])

    match = _BVID_PATTERN.search(parsed.path)
    if not match or not parsed.path.lower().startswith("/video/"):
        raise ValueError("链接中没有有效的 BV 视频编号")
    bvid = match.group(1)
    canonical = f"https://www.bilibili.com/video/{bvid}"
    return BilibiliReference(canonical, bvid)


class _QuietLogger:
    def __init__(self) -> None:
        self.last_error = ""

    def debug(self, _message: str) -> None:
        pass

    def warning(self, _message: str) -> None:
        pass

    def error(self, message: str) -> None:
        self.last_error = message


def _download_error_code(message: str) -> str:
    normalized = message.casefold()
    if any(value in normalized for value in ("403", "412", "429", "risk", "captcha", "风控", "验证")):
        return "bilibili_access_limited"
    if any(value in normalized for value in ("login", "sign in", "registered user", "cookie", "会员", "登录")):
        return "bilibili_login_required"
    if any(value in normalized for value in ("geo", "region", "地区", "区域")):
        return "bilibili_region_restricted"
    if any(value in normalized for value in ("copyright", "private", "unavailable", "已失效", "不可用", "版权")):
        return "bilibili_video_unavailable"
    if any(value in normalized for value in ("timed out", "timeout", "connection", "network", "winerror", "网络", "连接")):
        return "bilibili_network_error"
    if "requested format" in normalized or "format is not available" in normalized:
        return "bilibili_format_unavailable"
    return "bilibili_download_failed"


def _ffmpeg_executable() -> str:
    try:
        import imageio_ffmpeg

        executable = Path(imageio_ffmpeg.get_ffmpeg_exe()).resolve()
    except (ImportError, OSError, RuntimeError) as exc:
        raise DownloadRejected("bilibili_ffmpeg_unavailable") from exc
    if not executable.is_file():
        raise DownloadRejected("bilibili_ffmpeg_unavailable")
    return str(executable)


def download_bilibili_to_quarantine(
    *,
    url: str,
    destination_dir: Path,
    job_id: str,
    max_bytes: int,
    max_height: int,
    progress: Callable[[int, int | None], None] | None = None,
) -> BilibiliDownloadResult:
    """Download one public video without cookies, account data, or DRM bypasses."""

    reference = normalize_bilibili_url(url)
    if max_height not in {480, 720, 1080}:
        raise DownloadRejected("bilibili_quality_invalid")
    if not re.fullmatch(r"[0-9a-f]{32}", job_id):
        raise DownloadRejected("bilibili_job_id_invalid")

    try:
        from yt_dlp import YoutubeDL
        from yt_dlp.utils import DownloadError
    except ImportError as exc:
        raise DownloadRejected("bilibili_engine_unavailable") from exc

    destination_dir.mkdir(parents=True, exist_ok=True)
    work_dir = (destination_dir / f".{job_id}-bilibili").resolve()
    try:
        work_dir.relative_to(destination_dir.resolve())
    except ValueError as exc:
        raise DownloadRejected("bilibili_work_path_invalid") from exc
    if work_dir.exists():
        shutil.rmtree(work_dir)
    work_dir.mkdir(parents=True)

    def progress_hook(data: dict) -> None:
        if data.get("status") != "downloading" or progress is None:
            return
        downloaded = int(data.get("downloaded_bytes") or 0)
        total_value = data.get("total_bytes") or data.get("total_bytes_estimate")
        total = int(total_value) if total_value else None
        progress(downloaded, total)

    logger = _QuietLogger()
    options = {
        "format": (
            f"bestvideo[height<={max_height}][ext=mp4]+bestaudio[ext=m4a]/"
            f"best[height<={max_height}][ext=mp4]/best[height<={max_height}]"
        ),
        "merge_output_format": "mp4",
        "outtmpl": str(work_dir / "%(id)s.%(ext)s"),
        "ffmpeg_location": _ffmpeg_executable(),
        "noplaylist": True,
        "playlistend": 1,
        "cachedir": False,
        "overwrites": True,
        "continuedl": True,
        "retries": 3,
        "fragment_retries": 3,
        "concurrent_fragment_downloads": 4,
        "socket_timeout": 30,
        "max_filesize": max_bytes,
        "quiet": True,
        "no_warnings": True,
        "logger": logger,
        "http_headers": {
            "Referer": "https://www.bilibili.com/",
            "Origin": "https://www.bilibili.com",
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
            ),
        },
        "progress_hooks": [progress_hook],
    }

    try:
        with YoutubeDL(options) as downloader:
            info = downloader.extract_info(reference.url, download=True)
    except DownloadError as exc:
        shutil.rmtree(work_dir, ignore_errors=True)
        raise DownloadRejected(_download_error_code(logger.last_error or str(exc))) from exc
    except (OSError, RuntimeError, ValueError) as exc:
        shutil.rmtree(work_dir, ignore_errors=True)
        raise DownloadRejected("bilibili_download_failed") from exc

    if not isinstance(info, dict):
        shutil.rmtree(work_dir, ignore_errors=True)
        raise DownloadRejected("bilibili_metadata_missing")
    if info.get("_type") == "playlist":
        entries = [entry for entry in (info.get("entries") or []) if isinstance(entry, dict)]
        if len(entries) != 1:
            shutil.rmtree(work_dir, ignore_errors=True)
            raise DownloadRejected("bilibili_single_video_required")
        info = entries[0]

    webpage = str(info.get("webpage_url") or reference.url)
    try:
        normalized_page = normalize_bilibili_url(webpage)
    except ValueError as exc:
        shutil.rmtree(work_dir, ignore_errors=True)
        raise DownloadRejected("bilibili_extractor_redirect_rejected") from exc

    candidates = [
        path
        for path in work_dir.iterdir()
        if path.is_file() and path.suffix.lower() in _MEDIA_SUFFIXES and not path.name.endswith(".part")
    ]
    if not candidates:
        shutil.rmtree(work_dir, ignore_errors=True)
        raise DownloadRejected("bilibili_output_missing")
    downloaded_path = max(candidates, key=lambda path: path.stat().st_size)
    size = downloaded_path.stat().st_size
    if size <= 0 or size > max_bytes:
        shutil.rmtree(work_dir, ignore_errors=True)
        raise DownloadRejected("bilibili_output_size_rejected")

    title = str(info.get("title") or normalized_page.external_id).strip()[:240]
    external_id = str(info.get("id") or normalized_page.external_id).strip()[:200]
    suffix = downloaded_path.suffix.lower()
    display_name = safe_filename(f"{title} [{external_id}]{suffix}")
    final_path = destination_dir / f"{job_id}--{display_name}"
    downloaded_path.replace(final_path)
    checksum = sha256_file(final_path)
    mime_type = mimetypes.guess_type(final_path.name)[0] or "video/mp4"
    duration_value = info.get("duration")
    duration_seconds = int(duration_value) if isinstance(duration_value, (int, float)) else None
    shutil.rmtree(work_dir, ignore_errors=True)
    if progress:
        progress(size, size)
    return BilibiliDownloadResult(
        path=final_path,
        checksum=checksum,
        size_bytes=size,
        mime_type=mime_type,
        title=title,
        external_id=external_id,
        duration_seconds=duration_seconds,
    )
