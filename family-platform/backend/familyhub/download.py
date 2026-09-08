from __future__ import annotations

import hashlib
import ipaddress
import json
import os
import socket
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from .file_safety import safe_filename
from .models import ContentSource
from .policy import url_matches_source


class DownloadRejected(RuntimeError):
    pass


def manifest_path(root: Path, reference: str) -> Path:
    candidate = (root / reference).resolve()
    try:
        candidate.relative_to(root.resolve())
    except ValueError as exc:
        raise DownloadRejected("manifest 引用越界") from exc
    return candidate


def write_manifest(root: Path, job_id: str, payload: dict[str, Any]) -> str:
    root.mkdir(parents=True, exist_ok=True)
    target = root / f"{job_id}.json"
    temporary = root / f".{job_id}.tmp"
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    try:
        os.chmod(temporary, 0o600)
    except OSError:
        pass
    temporary.replace(target)
    return target.name


def read_manifest(root: Path, reference: str) -> dict[str, Any]:
    target = manifest_path(root, reference)
    try:
        data = json.loads(target.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise DownloadRejected("manifest 无法读取") from exc
    if not isinstance(data, dict):
        raise DownloadRejected("manifest 格式错误")
    return data


def redact_manifest(root: Path, reference: str, *, checksum: str, size_bytes: int) -> None:
    target = manifest_path(root, reference)
    data = read_manifest(root, reference)
    data.pop("url", None)
    data["completed"] = {"sha256": checksum, "size_bytes": size_bytes}
    temporary = target.with_suffix(".redacted.tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(target)


def _resolve_public_addresses(hostname: str, port: int) -> None:
    try:
        addresses = socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise DownloadRejected("来源域名无法解析") from exc
    if not addresses:
        raise DownloadRejected("来源域名没有可用地址")
    for address in addresses:
        ip = ipaddress.ip_address(address[4][0])
        if not ip.is_global:
            raise DownloadRejected("拒绝访问私网、回环或保留地址")


def validate_runtime_url(url: str, source: ContentSource) -> urllib.parse.ParseResult:
    if not url_matches_source(url, source):
        raise DownloadRejected("下载 URL 不属于已审核来源")
    parsed = urllib.parse.urlparse(url)
    hostname = parsed.hostname
    if not hostname:
        raise DownloadRejected("下载 URL 缺少主机名")
    _resolve_public_addresses(hostname, parsed.port or 443)
    return parsed


class GuardedRedirectHandler(urllib.request.HTTPRedirectHandler):
    def __init__(self, source: ContentSource) -> None:
        super().__init__()
        self.source = source

    def redirect_request(self, req: Any, fp: Any, code: int, msg: str, headers: Any, newurl: str) -> Any:
        validate_runtime_url(newurl, self.source)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def download_to_quarantine(
    *,
    url: str,
    source: ContentSource,
    destination_dir: Path,
    job_id: str,
    max_bytes: int,
) -> tuple[Path, str, int, str]:
    parsed = validate_runtime_url(url, source)
    filename = safe_filename(Path(parsed.path).name or f"{job_id}.bin")
    destination_dir.mkdir(parents=True, exist_ok=True)
    final_path = destination_dir / f"{job_id}--{filename}"
    partial_path = final_path.with_suffix(final_path.suffix + ".part")
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "Lumi-FamilyHub/0.1 controlled-family-fetch"},
        method="GET",
    )
    opener = urllib.request.build_opener(GuardedRedirectHandler(source))
    digest = hashlib.sha256()
    size = 0
    mime_type = "application/octet-stream"
    try:
        with opener.open(request, timeout=45) as response, partial_path.open("wb") as output:
            content_length = response.headers.get("Content-Length")
            if content_length and int(content_length) > max_bytes:
                raise DownloadRejected("远端文件超过容量限制")
            mime_type = response.headers.get_content_type()
            while chunk := response.read(1024 * 1024):
                size += len(chunk)
                if size > max_bytes:
                    raise DownloadRejected("下载超过容量限制")
                digest.update(chunk)
                output.write(chunk)
        partial_path.replace(final_path)
    except DownloadRejected:
        partial_path.unlink(missing_ok=True)
        raise
    except (OSError, ValueError, urllib.error.URLError, urllib.error.HTTPError) as exc:
        partial_path.unlink(missing_ok=True)
        raise DownloadRejected("HTTPS 下载失败") from exc
    return final_path, digest.hexdigest(), size, mime_type
