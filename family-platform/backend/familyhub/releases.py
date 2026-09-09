"""Release metadata and Tauri updater adapter.

The control plane never downloads or executes an update.  It only serves a
small, administrator-controlled manifest.  Desktop Tauri clients consume the
signed ``tauri_platforms`` portion; Android/TV clients use the ordinary
``platforms`` entries and ask the user to install the APK (or open a store).
"""

from __future__ import annotations

import json
import re
from datetime import UTC, datetime
from ipaddress import ip_address
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from . import __version__
from .config import Settings


_VERSION_RE = re.compile(r"^[vV]?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[-+].*)?$")
_SHA256_RE = re.compile(r"^[a-fA-F0-9]{64}$")
_MAX_MANIFEST_BYTES = 1 * 1024 * 1024


def version_key(value: str) -> tuple[int, int, int]:
    """Return a forgiving numeric key for semver-like app versions."""

    match = _VERSION_RE.match(str(value).strip())
    if not match:
        return (0, 0, 0)
    return tuple(int(part or 0) for part in match.groups())  # type: ignore[return-value]


def is_newer(candidate: str, current: str) -> bool:
    candidate_key = version_key(candidate)
    current_key = version_key(current)
    return candidate_key > current_key and candidate_key != (0, 0, 0)


def _manifest_path(settings: Settings) -> Path:
    path = settings.update_manifest_path.expanduser()
    if path.is_absolute():
        return path
    return (Path.cwd() / path).resolve()


def _safe_url(value: Any) -> bool:
    if not isinstance(value, str) or not value or len(value) > 4096:
        return False
    if value.startswith("/") and not value.startswith("//"):
        return True
    parsed = urlparse(value)
    if parsed.scheme == "https" and parsed.hostname:
        return True
    if parsed.scheme != "http" or not parsed.hostname:
        return False
    host = parsed.hostname.casefold()
    if host == "localhost":
        return True
    try:
        address = ip_address(host)
    except ValueError:
        return False
    return bool(address.is_private or address.is_loopback or address.is_link_local)


def _clean_artifact(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict) or not _safe_url(raw.get("url")):
        return None
    result: dict[str, Any] = {"url": str(raw["url"])}
    for key in ("signature", "content_type", "install_mode"):
        value = raw.get(key)
        if isinstance(value, str) and value:
            result[key] = value[:4096]
    checksum = raw.get("sha256")
    if isinstance(checksum, str) and _SHA256_RE.fullmatch(checksum):
        result["sha256"] = checksum.lower()
    size = raw.get("size_bytes")
    if isinstance(size, int) and 0 <= size <= 100 * 1024 * 1024 * 1024:
        result["size_bytes"] = size
    if result.get("install_mode") not in {"tauri", "manual", "store"}:
        result["install_mode"] = "manual"
    return result


def _default_manifest(settings: Settings) -> dict[str, Any]:
    now = datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    return {
        "app_id": "cn.lumi.familyhub",
        "channel": settings.update_channel,
        "version": __version__,
        "min_supported_version": __version__,
        "host_api_min_version": __version__,
        "published_at": now,
        "notes": "当前已是最新版本。",
        "platforms": {},
        "tauri_platforms": {},
        "android_store_url": None,
    }


def load_manifest(settings: Settings) -> dict[str, Any]:
    """Load and defensively normalize the administrator-provided manifest."""

    result = _default_manifest(settings)
    path = _manifest_path(settings)
    try:
        if not path.is_file() or path.stat().st_size > _MAX_MANIFEST_BYTES:
            return result
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError, UnicodeError):
        return result
    if not isinstance(raw, dict):
        return result

    for key in ("app_id", "channel", "version", "min_supported_version", "host_api_min_version", "notes", "android_store_url"):
        value = raw.get(key)
        if value is None and key in {"host_api_min_version", "android_store_url"}:
            continue
        if isinstance(value, str) and len(value) <= 4096:
            if key == "android_store_url" and value and not _safe_url(value):
                continue
            result[key] = value

    published = raw.get("published_at")
    if isinstance(published, str):
        try:
            # Validate, but retain the original ISO representation for clients.
            datetime.fromisoformat(published.replace("Z", "+00:00"))
            result["published_at"] = published
        except ValueError:
            pass

    def clean_map(value: Any) -> dict[str, dict[str, Any]]:
        if not isinstance(value, dict):
            return {}
        cleaned: dict[str, dict[str, Any]] = {}
        for key, artifact in value.items():
            if not isinstance(key, str) or not re.fullmatch(r"[A-Za-z0-9._-]{1,120}", key):
                continue
            normalized = _clean_artifact(artifact)
            if normalized:
                cleaned[key] = normalized
        return cleaned

    result["platforms"] = clean_map(raw.get("platforms"))
    explicit_tauri = clean_map(raw.get("tauri_platforms"))
    if explicit_tauri:
        result["tauri_platforms"] = explicit_tauri
    else:
        # Desktop artifacts are conventionally named by Tauri target.  Keep
        # Android entries out of the signed updater response.
        result["tauri_platforms"] = {
            key: value
            for key, value in result["platforms"].items()
            if any(prefix in key.casefold() for prefix in ("windows-", "darwin-", "linux-", "macos-"))
        }
    return result


def tauri_update_payload(
    settings: Settings,
    target: str,
    arch: str,
    current_version: str,
    channel: str | None = None,
) -> dict[str, Any] | None:
    manifest = load_manifest(settings)
    if channel and channel != manifest.get("channel"):
        return None
    version = str(manifest.get("version", __version__))
    if not is_newer(version, current_version):
        return None
    artifacts: dict[str, dict[str, Any]] = manifest.get("tauri_platforms", {})
    if not artifacts:
        return None

    target_l = target.casefold()
    arch_l = arch.casefold()
    matching = {
        key: value
        for key, value in artifacts.items()
        if key.casefold() == target_l
        or key.casefold() == f"{target_l}-{arch_l}"
        or target_l in key.casefold()
    }
    # A manifest may intentionally publish one universal signed artifact. In
    # that case returning the complete map lets Tauri select its exact key.
    # The Tauri updater response is deliberately minimal.  The generic
    # manifest may carry a checksum and file size for the Android UI, but the
    # signed desktop plugin only needs a URL and its Tauri signature.
    platforms = {
        key: {"url": value["url"], "signature": value["signature"]}
        for key, value in (matching or artifacts).items()
        if isinstance(value.get("signature"), str) and value["signature"]
    }
    if not platforms:
        return None
    return {
        "version": version,
        "notes": str(manifest.get("notes", "")),
        "pub_date": manifest.get("published_at"),
        "platforms": platforms,
    }
