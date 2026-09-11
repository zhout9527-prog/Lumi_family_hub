from __future__ import annotations

from functools import cached_property
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="FAMILYHUB_",
        extra="ignore",
    )

    app_name: str = "Lumi Family Hub"
    environment: str = "development"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    runtime_root: Path = Path("runtime")
    database_url: str | None = None
    cors_origins: str = (
        "http://localhost:4173,http://127.0.0.1:4173,"
        "http://tauri.localhost,https://tauri.localhost"
    )
    cors_lan_regex: str = (
        r"^https?://(localhost|127\.0\.0\.1|tauri\.localhost|10(?:\.\d{1,3}){3}|"
        r"192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})(:\d+)?$"
    )
    seed_demo: bool = True
    demo_child_password: str = "ChildDemo2026"
    demo_guardian_password: str = "GuardianDemo2026"
    demo_operator_password: str = "OperatorDemo2026"
    session_hours: int = 12
    password_iterations: int = 310_000
    worker_poll_seconds: int = 30
    inbox_stable_seconds: int = 30
    max_asset_bytes: int = 8 * 1024 * 1024 * 1024
    direct_download_enabled: bool = False
    bilibili_download_enabled: bool = True
    nightly_start_hour: int = 1
    nightly_end_hour: int = 6
    min_free_ratio: float = Field(default=0.20, ge=0.05, le=0.80)
    defender_scan: bool = True
    jellyfin_url: str = "http://127.0.0.1:8096"
    kavita_url: str = "http://127.0.0.1:5000"
    audiobookshelf_url: str = "http://127.0.0.1:13378"
    # Public, read-only release metadata consumed by native clients.  Keep the
    # manifest outside the database so a release pipeline can replace it
    # atomically without touching household data.
    update_manifest_path: Path = Path("updates/manifest.json")
    update_channel: str = "stable"

    @cached_property
    def root(self) -> Path:
        return self.runtime_root.expanduser().resolve()

    @property
    def database_dsn(self) -> str:
        if self.database_url:
            return self.database_url
        database = (self.root / "data" / "familyhub.db").as_posix()
        return f"sqlite:///{database}"

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def inbox_dir(self) -> Path:
        return self.root / "inbox" / "cloud"

    @property
    def quarantine_dir(self) -> Path:
        return self.root / "quarantine"

    @property
    def manifest_dir(self) -> Path:
        return self.root / "manifests"

    @property
    def works_dir(self) -> Path:
        return self.root / "works"

    @property
    def library_dir(self) -> Path:
        return self.root / "library"

    @property
    def database_path(self) -> Path | None:
        if self.database_url:
            return None
        return self.root / "data" / "familyhub.db"

    def ensure_directories(self) -> None:
        paths = [
            self.root / "data",
            self.inbox_dir,
            self.manifest_dir,
            self.works_dir,
            self.root / "cache",
            self.library_dir / "video",
            self.library_dir / "books",
            self.library_dir / "audio",
            self.library_dir / "images",
        ]
        for path in paths:
            path.mkdir(parents=True, exist_ok=True)
