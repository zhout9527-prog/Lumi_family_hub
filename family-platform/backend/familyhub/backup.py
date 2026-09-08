from __future__ import annotations

import argparse
import json
import shutil
import sqlite3
from datetime import UTC, datetime
from pathlib import Path

from .config import Settings


def sqlite_path(database_dsn: str) -> Path:
    prefix = "sqlite:///"
    if not database_dsn.startswith(prefix):
        raise RuntimeError("在线备份脚本仅支持 PC 原生 SQLite；PostgreSQL 请使用 pg_dump。")
    return Path(database_dsn.removeprefix(prefix)).resolve()


def copy_directory(source: Path, destination: Path) -> None:
    if source.is_dir():
        shutil.copytree(source, destination, dirs_exist_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Create a consistent Lumi Family Hub backup")
    parser.add_argument("destination", type=Path)
    parser.add_argument("--include-library", action="store_true")
    args = parser.parse_args()

    settings = Settings()
    source_database = sqlite_path(settings.database_dsn)
    if not source_database.is_file():
        raise FileNotFoundError(f"数据库不存在: {source_database}")

    stamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
    backup_root = args.destination.expanduser().resolve() / f"familyhub-{stamp}"
    backup_root.mkdir(parents=True, exist_ok=False)
    target_database = backup_root / "data" / "familyhub.db"
    target_database.parent.mkdir(parents=True)

    with sqlite3.connect(source_database) as source, sqlite3.connect(target_database) as target:
        source.backup(target)

    copy_directory(settings.manifest_dir, backup_root / "manifests")
    if args.include_library:
        copy_directory(settings.library_dir, backup_root / "library")
    (backup_root / "backup-info.json").write_text(
        json.dumps(
            {
                "created_at": datetime.now(UTC).isoformat(),
                "database": "sqlite",
                "library_included": args.include_library,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(backup_root)


if __name__ == "__main__":
    main()
