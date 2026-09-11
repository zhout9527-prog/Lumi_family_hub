from __future__ import annotations

import os
import re
import shutil
import subprocess
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote

from .bilibili import _ffmpeg_executable
from .external import BilibiliPlayback


_SEGMENT_NAME = re.compile(r"^segment-\d{5}\.ts$")


class OnlineStreamError(RuntimeError):
    pass


@dataclass
class StreamSession:
    content_id: str
    directory: Path
    process: subprocess.Popen[bytes]
    quality: str
    created_at: float


class BilibiliHlsManager:
    """把 B 站分离的视频和音轨封装为浏览器可播放的临时 HLS 流。"""

    def __init__(self, root: Path, *, lifetime_seconds: int = 2 * 60 * 60) -> None:
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.lifetime_seconds = lifetime_seconds
        self._sessions: dict[str, StreamSession] = {}
        self._lock = threading.RLock()

    @staticmethod
    def _header_blob(headers: dict[str, str]) -> str:
        allowed = {"Accept", "Referer", "User-Agent"}
        return "".join(f"{key}: {value}\r\n" for key, value in headers.items() if key in allowed and "\n" not in value)

    def _stop_session(self, session: StreamSession) -> None:
        if session.process.poll() is None:
            session.process.terminate()
            try:
                session.process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                session.process.kill()
                session.process.wait(timeout=3)
        shutil.rmtree(session.directory, ignore_errors=True)

    def _discard_expired(self) -> None:
        cutoff = time.time() - self.lifetime_seconds
        expired = [key for key, session in self._sessions.items() if session.created_at < cutoff]
        for key in expired:
            session = self._sessions.pop(key)
            self._stop_session(session)

    def prepare(self, content_id: str, playback: BilibiliPlayback) -> StreamSession:
        with self._lock:
            self._discard_expired()
            existing = self._sessions.get(content_id)
            if existing is not None and (existing.directory / "index.m3u8").is_file():
                return existing
            if existing is not None:
                self._stop_session(existing)

            safe_id = __import__("hashlib").sha256(content_id.encode("utf-8")).hexdigest()[:32]
            directory = (self.root / safe_id).resolve()
            if directory.parent != self.root:
                raise OnlineStreamError("在线播放缓存路径无效")
            shutil.rmtree(directory, ignore_errors=True)
            directory.mkdir(parents=True, exist_ok=True)

            command = [_ffmpeg_executable(), "-hide_banner", "-loglevel", "error", "-y"]
            video_headers = self._header_blob(playback.video_headers)
            if video_headers:
                command.extend(["-headers", video_headers])
            command.extend(["-i", playback.video_url])
            if playback.audio_url:
                audio_headers = self._header_blob(playback.audio_headers)
                if audio_headers:
                    command.extend(["-headers", audio_headers])
                command.extend(["-i", playback.audio_url, "-map", "0:v:0", "-map", "1:a:0"])
            else:
                command.extend(["-map", "0:v:0", "-map", "0:a:0?"])
            command.extend(
                [
                    "-c",
                    "copy",
                    "-f",
                    "hls",
                    "-hls_time",
                    "4",
                    "-hls_list_size",
                    "0",
                    "-hls_playlist_type",
                    "event",
                    "-hls_flags",
                    "independent_segments+temp_file",
                    "-hls_segment_filename",
                    str(directory / "segment-%05d.ts"),
                    str(directory / "index.m3u8"),
                ]
            )
            creation_flags = 0x0800_0000 if os.name == "nt" else 0
            try:
                process = subprocess.Popen(
                    command,
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.PIPE,
                    creationflags=creation_flags,
                )
            except OSError as exc:
                shutil.rmtree(directory, ignore_errors=True)
                raise OnlineStreamError("无法启动在线播放转码组件") from exc

            session = StreamSession(content_id, directory, process, playback.quality_label, time.time())
            self._sessions[content_id] = session

        playlist = directory / "index.m3u8"
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            if playlist.is_file() and playlist.stat().st_size > 0:
                return session
            if process.poll() is not None:
                detail = (process.stderr.read(4096) if process.stderr else b"").decode("utf-8", "replace").strip()
                with self._lock:
                    self._sessions.pop(content_id, None)
                shutil.rmtree(directory, ignore_errors=True)
                raise OnlineStreamError(detail[:400] or "在线播放源暂时不可用")
            time.sleep(0.1)
        self.remove(content_id)
        raise OnlineStreamError("在线播放准备超时，请稍后重试")

    def playlist(self, content_id: str, ticket: str) -> str | None:
        with self._lock:
            session = self._sessions.get(content_id)
            if session is None:
                return None
            path = session.directory / "index.m3u8"
            try:
                lines = path.read_text(encoding="utf-8").splitlines()
            except OSError:
                return None
        suffix = f"?ticket={quote(ticket, safe='')}"
        return "\n".join(line if not line or line.startswith("#") else line + suffix for line in lines) + "\n"

    def segment(self, content_id: str, name: str) -> Path | None:
        if not _SEGMENT_NAME.fullmatch(name):
            return None
        with self._lock:
            session = self._sessions.get(content_id)
            if session is None:
                return None
            path = (session.directory / name).resolve()
            return path if path.parent == session.directory and path.is_file() else None

    def remove(self, content_id: str) -> None:
        with self._lock:
            session = self._sessions.pop(content_id, None)
        if session is not None:
            self._stop_session(session)

    def close(self) -> None:
        with self._lock:
            sessions = list(self._sessions.values())
            self._sessions.clear()
        for session in sessions:
            self._stop_session(session)
