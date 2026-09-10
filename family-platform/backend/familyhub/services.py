from __future__ import annotations

import shutil
import urllib.error
import urllib.request
from pathlib import Path

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from .config import Settings
from .file_safety import is_within, safe_filename
from .library import CONTENT_STORAGE_KEYS, load_storage_paths
from .models import CloudInboxAsset, ContentAsset, ContentItem, DownloadJob, User, new_id, utcnow
from .schemas import AssetReviewIn


def apply_asset_review(
    db: Session,
    *,
    settings: Settings,
    asset: CloudInboxAsset,
    reviewer: User,
    payload: AssetReviewIn,
) -> ContentItem | None:
    if asset.quarantine_status == "published":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="资产已经发布")
    asset.reviewed_by = reviewer.id
    asset.reviewed_at = utcnow()
    asset.review_note = payload.review_note
    if payload.decision != "approved":
        asset.quarantine_status = payload.decision
        return None
    if asset.scan_status == "blocked":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="被格式策略冻结的文件不能发布")
    if not payload.rights_confirmed or not payload.security_confirmed:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="发布必须确认权利与安全检查")
    if not payload.title or not payload.content_kind:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="发布信息不完整")
    if payload.age_to < payload.age_from:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="适龄范围无效")
    storage_paths = load_storage_paths(db, settings, ensure=True)
    source_path = (storage_paths["quarantine"] / asset.quarantine_ref).resolve()
    if not source_path.is_file():
        # 如果旧版本文件因权限或占用暂时无法在启动时迁移，审核时仍从旧目录读取，
        # 避免已经成功下载的资源因为升级而变成“文件不存在”。
        legacy_path = (settings.quarantine_dir / asset.quarantine_ref).resolve()
        if legacy_path.is_file() and is_within(legacy_path, settings.quarantine_dir):
            source_path = legacy_path
    allowed_pending_path = is_within(source_path, storage_paths["quarantine"])
    allowed_legacy_path = is_within(source_path, settings.quarantine_dir)
    if not source_path.is_file() or not (allowed_pending_path or allowed_legacy_path):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="待审核文件不可用")
    content_id = new_id()
    destination_name = f"{content_id}--{safe_filename(asset.original_name)}"
    destination_root = storage_paths[CONTENT_STORAGE_KEYS[payload.content_kind]]
    destination = (destination_root / destination_name).resolve()
    if not is_within(destination, destination_root):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="正式库目标路径无效")
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source_path, destination)
    item = ContentItem(
        id=content_id,
        household_id=asset.household_id,
        kind=payload.content_kind,
        title=payload.title,
        subtitle="家庭隔离区审核发布",
        language=payload.language,
        age_from=payload.age_from,
        age_to=payload.age_to,
        duration_minutes=10,
        description=payload.review_note,
        tags=["家庭审核", "本地内容"],
        acquisition_mode="licensed_ingest",
        publication_status="published",
        audience=payload.audience,
        stimulation_level="reviewed",
        offline_activity="和家人分享一个印象最深的片段",
        source_id="cloud-inbox",
    )
    db.add(item)
    db.flush()
    # URL 只是可选的审计线索，不是家庭内容入库的前置条件。没有填写时
    # 仍保留明确的内部说明，方便日后查看这项资源是按家庭授权发布的。
    license_ref = (payload.license_ref or "").strip() or "家庭自有或已获授权资源"
    db.add(
        ContentAsset(
            content_id=item.id,
            asset_kind=payload.content_kind,
            storage_ref=str(destination),
            license_ref=license_ref,
            checksum=asset.sha256,
            audience=payload.audience,
            publication_status="published",
        )
    )
    asset.quarantine_status = "published"
    if asset.inbound_ref.startswith("download-job:"):
        job = db.get(DownloadJob, asset.inbound_ref.removeprefix("download-job:"))
        if job is not None:
            job.stage = "published"
            job.progress = 100
    return item


def _service_reachable(url: str) -> bool:
    request = urllib.request.Request(url, method="GET", headers={"User-Agent": "Lumi-FamilyHub/0.1 health-check"})
    try:
        with urllib.request.urlopen(request, timeout=1.25) as response:
            return response.status < 500
    except urllib.error.HTTPError as exc:
        return exc.code < 500
    except (OSError, urllib.error.URLError, ValueError):
        return False


def system_status(db: Session, settings: Settings) -> dict:
    paths = load_storage_paths(db, settings, ensure=True)
    usage = shutil.disk_usage(paths["video"])
    return {
        "node": "online",
        "storage": {
            "total_bytes": usage.total,
            "used_bytes": usage.used,
            "free_bytes": usage.free,
            "free_ratio": round(usage.free / usage.total, 4),
            "threshold": settings.min_free_ratio,
        },
        "services": {
            "jellyfin": _service_reachable(settings.jellyfin_url),
            "kavita": _service_reachable(settings.kavita_url),
            "audiobookshelf": _service_reachable(settings.audiobookshelf_url),
        },
        "paths": {
            "runtime": str(settings.root),
            "database": str(settings.database_path) if settings.database_path else "外部数据库",
            "inbox": str(paths["inbox"]),
            "quarantine": str(paths["quarantine"]),
            "library": str(settings.library_dir),
            "video": str(paths["video"]),
            "book": str(paths["book"]),
            "audio": str(paths["audio"]),
            "image": str(paths["image"]),
            "cache": str(paths["cache"]),
        },
    }
