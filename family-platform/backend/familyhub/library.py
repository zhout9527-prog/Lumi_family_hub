from __future__ import annotations

import hashlib
import re
import shutil
from pathlib import Path
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import Settings
from .file_safety import is_within, safe_filename, sha256_file
from .models import (
    ContentAsset,
    ContentCollection,
    ContentCollectionEpisode,
    ContentItem,
    SystemSetting,
    User,
    new_id,
    utcnow,
)


STORAGE_SETTING_KEY = "storage_paths"
STORAGE_KEYS = ("video", "book", "audio", "image", "cache", "inbox", "quarantine")
CONTENT_STORAGE_KEYS = {"video": "video", "book": "book", "audio": "audio"}
SUPPORTED_SUFFIXES = {
    "video": {".mp4", ".m4v", ".mov", ".mkv", ".webm", ".avi"},
    "book": {".pdf", ".epub", ".cbz", ".cbr"},
    "audio": {".mp3", ".m4a", ".aac", ".wav", ".ogg", ".flac", ".opus"},
}


def default_storage_paths(settings: Settings) -> dict[str, Path]:
    return {
        "video": settings.library_dir / "video",
        "book": settings.library_dir / "books",
        "audio": settings.library_dir / "audio",
        "image": settings.library_dir / "images",
        "cache": settings.root / "cache",
        "inbox": settings.inbox_dir,
        # 下载完成后先落到正式视频库下的隐藏待审核目录。它仍不属于
        # Client 可见的正式馆藏，审核通过时才会复制到 video 根目录。
        "quarantine": settings.library_dir / "video" / ".pending",
    }


def _migrate_legacy_quarantine(legacy: Path, pending: Path) -> None:
    """把旧版本 runtime/quarantine 中的已下载文件迁移到待审核目录。"""

    if not legacy.is_dir() or legacy.resolve() == pending.resolve():
        return
    try:
        entries = list(legacy.iterdir())
    except OSError:
        return
    for entry in entries:
        if not entry.is_file() or entry.is_symlink():
            continue
        destination = pending / entry.name
        if destination.exists():
            continue
        try:
            shutil.move(str(entry), str(destination))
        except OSError:
            # 迁移失败时保留旧文件，避免启动过程删除用户资源。
            continue
    try:
        legacy.rmdir()
    except OSError:
        # 目录中仍有文件或被其他程序占用时继续保留。
        pass


def load_storage_paths(db: Session, settings: Settings, *, ensure: bool = False) -> dict[str, Path]:
    paths = default_storage_paths(settings)
    stored = db.get(SystemSetting, STORAGE_SETTING_KEY)
    values = stored.value_json if stored and isinstance(stored.value_json, dict) else {}
    configured_quarantine = values.get("quarantine")
    for key in STORAGE_KEYS:
        value = values.get(key)
        if isinstance(value, str) and value.strip():
            paths[key] = Path(value).expanduser().resolve()
        else:
            paths[key] = paths[key].expanduser().resolve()

    legacy_quarantine = settings.quarantine_dir.expanduser().resolve()
    pending_quarantine = default_storage_paths(settings)["quarantine"].expanduser().resolve()
    configured_legacy_path = (
        isinstance(configured_quarantine, str)
        and bool(configured_quarantine.strip())
        and paths["quarantine"] == legacy_quarantine
    )
    if configured_legacy_path:
        # 旧版把默认隔离目录也写入过设置。它不是用户主动选择的自定义目录，
        # 因此随版本升级到媒体库内的 .pending，并同步修正数据库中的路径。
        paths["quarantine"] = pending_quarantine
        if stored is not None:
            updated_values = dict(values)
            updated_values["quarantine"] = str(pending_quarantine)
            stored.value_json = updated_values
    if ensure:
        for path in paths.values():
            path.mkdir(parents=True, exist_ok=True)
        if configured_legacy_path or not isinstance(configured_quarantine, str) or not configured_quarantine.strip():
            _migrate_legacy_quarantine(legacy_quarantine, paths["quarantine"])
    return paths


def storage_paths_payload(paths: dict[str, Path]) -> dict[str, str]:
    return {key: str(paths[key]) for key in STORAGE_KEYS}


def save_storage_paths(
    db: Session,
    settings: Settings,
    values: dict[str, str],
    *,
    updated_by: str,
) -> dict[str, Path]:
    resolved: dict[str, Path] = {}
    for key in STORAGE_KEYS:
        raw = str(values.get(key, "")).strip()
        if not raw:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=f"{key} 目录不能为空")
        candidate = Path(raw).expanduser()
        if not candidate.is_absolute():
            candidate = settings.root / candidate
        candidate = candidate.resolve()
        anchor = Path(candidate.anchor).resolve() if candidate.anchor else None
        if anchor is not None and candidate == anchor:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="不能把磁盘根目录直接设为资源目录")
        if candidate.exists() and not candidate.is_dir():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"路径不是文件夹：{candidate}")
        resolved[key] = candidate

    folded = [str(path).casefold() for path in resolved.values()]
    if len(folded) != len(set(folded)):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="各资源目录不能设置为同一个文件夹")
    try:
        for path in resolved.values():
            path.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"无法创建资源目录：{exc}") from exc

    setting = db.get(SystemSetting, STORAGE_SETTING_KEY)
    payload = storage_paths_payload(resolved)
    if setting is None:
        setting = SystemSetting(key=STORAGE_SETTING_KEY, value_json=payload, updated_by=updated_by)
        db.add(setting)
    else:
        setting.value_json = payload
        setting.updated_by = updated_by
        setting.updated_at = utcnow()
    return resolved


def resolve_asset_path(db: Session, settings: Settings, asset: ContentAsset) -> Path | None:
    paths = load_storage_paths(db, settings)
    reference = Path(asset.storage_ref).expanduser()
    if reference.is_absolute():
        candidate = reference.resolve()
        root_key = CONTENT_STORAGE_KEYS.get(asset.asset_kind)
        root = paths.get(root_key) if root_key else None
        if root is None or not is_within(candidate, root):
            return None
        return candidate

    # 兼容早期版本保存的 library/video/... 相对路径。
    candidate = (settings.library_dir / reference).resolve()
    if not is_within(candidate, settings.library_dir):
        return None
    return candidate


def _clean_title(path: Path) -> str:
    title = re.sub(r"^[0-9a-f]{32}--", "", path.stem, flags=re.IGNORECASE)
    title = re.sub(r"[_\.]+", " ", title).strip()
    return title[:240] or "未命名资源"


def _existing_asset_for_path(db: Session, path: Path) -> ContentAsset | None:
    normalized = str(path.resolve()).casefold()
    for asset in db.scalars(select(ContentAsset)).all():
        reference = Path(asset.storage_ref).expanduser()
        if reference.is_absolute() and str(reference.resolve()).casefold() == normalized:
            return asset
    return None


def register_local_file(
    db: Session,
    settings: Settings,
    *,
    user: User,
    source_path: Path,
    kind: str,
    title: str | None = None,
    audience: str = "family",
    age_from: int = 0,
    age_to: int = 99,
    language: str = "中文",
    description: str = "",
    tags: list[str] | None = None,
    copy_to_library: bool = True,
    publish: bool = False,
) -> ContentItem:
    if kind not in SUPPORTED_SUFFIXES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="不支持的馆藏类型")
    source = source_path.expanduser().resolve()
    if not source.is_file() or source.is_symlink():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="本机文件不存在或不可导入")
    if source.suffix.lower() not in SUPPORTED_SUFFIXES[kind]:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="文件扩展名与馆藏类型不匹配")
    if source.stat().st_size <= 0 or source.stat().st_size > settings.max_asset_bytes:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="文件为空或超过单文件大小上限")
    if age_to < age_from:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="适龄范围无效")

    paths = load_storage_paths(db, settings, ensure=True)
    target_root = paths[CONTENT_STORAGE_KEYS[kind]]
    content_id = new_id()
    if is_within(source, target_root):
        destination = source
    elif copy_to_library:
        destination = (target_root / f"{content_id}--{safe_filename(source.name)}").resolve()
        if not is_within(destination, target_root):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="目标文件路径无效")
        try:
            shutil.copy2(source, destination)
        except OSError as exc:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"复制文件失败：{exc}") from exc
    else:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="不复制文件时，源文件必须位于已配置的资源目录")

    if _existing_asset_for_path(db, destination):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="这个文件已经登记在资源库中")
    checksum = sha256_file(destination)
    if db.scalar(select(ContentAsset.id).where(ContentAsset.checksum == checksum)):
        if destination != source:
            destination.unlink(missing_ok=True)
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="相同内容已经登记在资源库中")

    publication_status = "published" if publish else "draft"
    item = ContentItem(
        id=content_id,
        household_id=user.household_id,
        kind=kind,
        title=(title or _clean_title(source)).strip()[:240],
        subtitle={"video": "本地视频", "book": "本地图书", "audio": "本地音频"}[kind],
        language=language.strip()[:120] or "中文",
        age_from=age_from,
        age_to=age_to,
        duration_minutes=10,
        description=description.strip(),
        tags=list(dict.fromkeys(["本地馆藏", *(tags or []), *(["待审核"] if not publish else [])])),
        acquisition_mode="local_library",
        publication_status=publication_status,
        audience=audience,
        stimulation_level="reviewed" if publish else "pending",
        offline_activity="和家人分享一个印象最深的片段",
        source_id="local-library",
    )
    db.add(item)
    db.flush()
    db.add(
        ContentAsset(
            content_id=item.id,
            asset_kind=kind,
            storage_ref=str(destination),
            license_ref="family-managed-file",
            checksum=checksum,
            audience=audience,
            publication_status=publication_status,
        )
    )
    return item


def scan_managed_library(db: Session, settings: Settings, *, user: User) -> dict[str, int]:
    paths = load_storage_paths(db, settings, ensure=True)
    result = {"discovered": 0, "skipped": 0, "failed": 0}
    for kind, suffixes in SUPPORTED_SUFFIXES.items():
        root = paths[CONTENT_STORAGE_KEYS[kind]]
        for path in sorted(root.rglob("*")):
            if not path.is_file() or path.is_symlink() or path.name.startswith(".") or path.suffix.lower() not in suffixes:
                continue
            # 隐藏的待审核目录只用于 CloudInboxAsset，不能被本地资源扫描提前
            # 登记成草稿，更不能绕过隔离审核直接进入 Client 目录。
            relative_parts = path.relative_to(root).parts
            if any(part.startswith(".") for part in relative_parts[:-1]):
                continue
            if _existing_asset_for_path(db, path):
                result["skipped"] += 1
                continue
            try:
                with db.begin_nested():
                    register_local_file(
                        db,
                        settings,
                        user=user,
                        source_path=path,
                        kind=kind,
                        copy_to_library=False,
                    )
                    db.flush()
                result["discovered"] += 1
            except (HTTPException, OSError, ValueError):
                result["failed"] += 1
    return result


def managed_item_payload(db: Session, settings: Settings, item: ContentItem) -> dict[str, Any]:
    asset = db.scalar(select(ContentAsset).where(ContentAsset.content_id == item.id))
    path = resolve_asset_path(db, settings, asset) if asset else None
    size = 0
    if path and path.is_file():
        try:
            size = path.stat().st_size
        except OSError:
            size = 0
    episode = db.scalar(
        select(ContentCollectionEpisode).where(ContentCollectionEpisode.content_id == item.id).limit(1)
    )
    collection = db.get(ContentCollection, episode.collection_id) if episode else None
    return {
        "id": item.id,
        "title": item.title,
        "subtitle": item.subtitle,
        "kind": item.kind,
        "language": item.language,
        "age_from": item.age_from,
        "age_to": item.age_to,
        "description": item.description,
        "tags": list(item.tags or []),
        "cover_ref": item.cover_ref,
        "acquisition_mode": item.acquisition_mode,
        "publication_status": item.publication_status,
        "audience": item.audience,
        "featured": item.featured,
        "source_id": item.source_id,
        "file_path": str(path) if path else None,
        "file_size": size,
        "file_available": bool(path and path.is_file()),
        "external_url": item.launch_url,
        "collection_id": collection.id if collection else None,
        "collection_title": collection.title if collection else None,
        "collection_kind": collection.collection_kind if collection else None,
        "episode_index": episode.episode_index if episode else None,
        "episode_count": collection.episode_count if collection else None,
        "section_title": episode.section_title if episode else None,
        "collection_card": False,
        "updated_at": item.updated_at,
    }


def external_item_id(url: str) -> str:
    return "external-" + hashlib.sha256(url.encode("utf-8")).hexdigest()[:24]
