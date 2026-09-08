from __future__ import annotations

import hashlib
import mimetypes
import os
import re
import subprocess
import zipfile
from dataclasses import dataclass
from pathlib import Path, PurePosixPath


BLOCKED_EXTENSIONS = {
    ".apk",
    ".appx",
    ".bat",
    ".cmd",
    ".com",
    ".dll",
    ".dmg",
    ".docm",
    ".exe",
    ".hta",
    ".img",
    ".iso",
    ".jar",
    ".js",
    ".lnk",
    ".msi",
    ".pif",
    ".ps1",
    ".reg",
    ".scr",
    ".vbs",
    ".vhd",
    ".vhdx",
    ".xlsm",
}

ALLOWED_EXTENSIONS = {
    ".cbz",
    ".epub",
    ".flac",
    ".jpeg",
    ".jpg",
    ".m4a",
    ".m4b",
    ".mkv",
    ".mov",
    ".mp3",
    ".mp4",
    ".ogg",
    ".opus",
    ".pdf",
    ".png",
    ".webm",
    ".webp",
}

NESTED_ARCHIVE_EXTENSIONS = {".7z", ".gz", ".rar", ".tar", ".zip"}


@dataclass(frozen=True)
class ScanResult:
    status: str
    mime_type: str
    reason: str


def sha256_file(path: Path, chunk_size: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(chunk_size):
            digest.update(chunk)
    return digest.hexdigest()


def safe_filename(name: str) -> str:
    base = Path(name).name.strip().replace("\x00", "")
    cleaned = re.sub(r"[^0-9A-Za-z._()\-\u4e00-\u9fff]+", "_", base)
    cleaned = cleaned.lstrip(".")[:220]
    return cleaned or "asset.bin"


def is_within(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def _matches_signature(path: Path, suffix: str) -> bool:
    with path.open("rb") as stream:
        head = stream.read(16)
    signatures: dict[str, tuple[bytes, ...]] = {
        ".jpg": (b"\xff\xd8\xff",),
        ".jpeg": (b"\xff\xd8\xff",),
        ".png": (b"\x89PNG\r\n\x1a\n",),
        ".pdf": (b"%PDF-",),
        ".flac": (b"fLaC",),
        ".ogg": (b"OggS",),
        ".opus": (b"OggS",),
        ".mkv": (b"\x1aE\xdf\xa3",),
        ".webm": (b"\x1aE\xdf\xa3",),
        ".mp3": (b"ID3", b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"),
        ".webp": (b"RIFF",),
    }
    if suffix in signatures:
        return any(head.startswith(signature) for signature in signatures[suffix])
    if suffix in {".mp4", ".m4a", ".m4b", ".mov"}:
        return len(head) >= 12 and head[4:8] == b"ftyp"
    return True


def _inspect_zip_book(path: Path, suffix: str) -> tuple[bool, str]:
    try:
        with zipfile.ZipFile(path) as archive:
            entries = archive.infolist()
            if not entries or len(entries) > 10_000:
                return False, "压缩条目数量异常"
            total_uncompressed = 0
            for entry in entries:
                normalized = PurePosixPath(entry.filename.replace("\\", "/"))
                if normalized.is_absolute() or ".." in normalized.parts:
                    return False, "发现路径穿越条目"
                entry_suffix = Path(entry.filename).suffix.lower()
                if entry_suffix in BLOCKED_EXTENSIONS or entry_suffix in NESTED_ARCHIVE_EXTENSIONS:
                    return False, "包含脚本、可执行文件或嵌套压缩包"
                total_uncompressed += entry.file_size
                if entry.compress_size and entry.file_size / entry.compress_size > 250:
                    return False, "压缩比异常"
            if total_uncompressed > 4 * 1024 * 1024 * 1024:
                return False, "解压后体积超过限制"
            if suffix == ".epub":
                try:
                    mime = archive.read("mimetype")
                except KeyError:
                    return False, "EPUB 缺少 mimetype"
                if mime.strip() != b"application/epub+zip":
                    return False, "EPUB mimetype 不正确"
            return True, "容器结构通过"
    except (OSError, zipfile.BadZipFile, RuntimeError):
        return False, "压缩容器无法解析"


def _defender_executable() -> Path | None:
    candidates: list[Path] = []
    program_data = Path(os.environ.get("ProgramData", r"C:\ProgramData"))
    platform_root = program_data / "Microsoft" / "Windows Defender" / "Platform"
    if platform_root.exists():
        candidates.extend(sorted(platform_root.glob("*/MpCmdRun.exe"), reverse=True))
    candidates.extend(
        [
            Path(os.environ.get("ProgramFiles", r"C:\Program Files"))
            / "Windows Defender"
            / "MpCmdRun.exe",
            Path(r"C:\Program Files\Windows Defender\MpCmdRun.exe"),
        ]
    )
    return next((candidate for candidate in candidates if candidate.is_file()), None)


def _scan_with_defender(path: Path) -> tuple[str, str]:
    executable = _defender_executable()
    if executable is None:
        return "unavailable", "Windows Defender 命令行扫描器不可用"
    try:
        result = subprocess.run(
            [str(executable), "-Scan", "-ScanType", "3", "-File", str(path), "-DisableRemediation"],
            capture_output=True,
            check=False,
            timeout=180,
            shell=False,
        )
    except (OSError, subprocess.SubprocessError):
        return "unavailable", "Windows Defender 扫描未完成"
    if result.returncode == 0:
        return "clean", "Windows Defender 扫描通过"
    return "review", "Windows Defender 返回非零结果，需要人工检查"


def scan_file(path: Path, *, max_bytes: int, use_defender: bool) -> ScanResult:
    if not path.is_file() or path.is_symlink():
        return ScanResult("blocked", "application/octet-stream", "不是可接受的普通文件")
    size = path.stat().st_size
    if size <= 0 or size > max_bytes:
        return ScanResult("blocked", "application/octet-stream", "文件为空或超过容量限制")
    suffix = path.suffix.lower()
    mime_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    if suffix in BLOCKED_EXTENSIONS:
        return ScanResult("blocked", mime_type, "可执行、脚本、宏或磁盘镜像默认冻结")
    if suffix not in ALLOWED_EXTENSIONS:
        return ScanResult("blocked", mime_type, "文件扩展名不在家庭白名单")
    if suffix in {".epub", ".cbz"}:
        valid, reason = _inspect_zip_book(path, suffix)
        if not valid:
            return ScanResult("blocked", mime_type, reason)
    elif not _matches_signature(path, suffix):
        return ScanResult("blocked", mime_type, "文件签名与扩展名不一致")
    if not use_defender:
        return ScanResult("review", mime_type, "格式通过，防病毒扫描未启用")
    defender_status, defender_reason = _scan_with_defender(path)
    if defender_status == "clean":
        return ScanResult("safe", mime_type, defender_reason)
    return ScanResult("review", mime_type, defender_reason)

