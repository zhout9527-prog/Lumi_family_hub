from __future__ import annotations

import argparse
import shutil
import time
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from .audit import add_audit
from .bilibili import BILIBILI_SOURCE_ID, download_bilibili_to_quarantine
from .bilibili_account import active_bilibili_cookie_file
from .config import Settings
from .database import Base, build_engine, build_session_factory
from .download import DownloadRejected, download_to_quarantine, read_manifest, redact_manifest
from .external import sync_due_external_feeds
from .file_safety import safe_filename, scan_file, sha256_file
from .library import load_storage_paths
from .models import (
    CloudInboxAsset,
    CommunitySubmission,
    ContentSource,
    DownloadJob,
    SystemSetting,
    new_id,
    utcnow,
)
from .policy import source_download_reason


@dataclass
class WorkerSummary:
    inbox_added: int = 0
    inbox_duplicates: int = 0
    inbox_blocked: int = 0
    jobs_completed: int = 0
    jobs_failed: int = 0
    feeds_synced: int = 0
    feed_errors: int = 0
    paused_reason: str | None = None


class FamilyWorker:
    def __init__(self, settings: Settings, session_factory: sessionmaker[Session]) -> None:
        self.settings = settings
        self.session_factory = session_factory

    def run_once(self, *, ignore_window: bool = False) -> WorkerSummary:
        summary = WorkerSummary()
        with self.session_factory() as db:
            storage_paths = load_storage_paths(db, self.settings, ensure=True)
            self._recover_interrupted_jobs(db)
            summary.inbox_added, summary.inbox_duplicates, summary.inbox_blocked = self.scan_inbox(db, storage_paths)
            summary.feeds_synced, summary.feed_errors = sync_due_external_feeds(db, self.settings)
            paused_reason = self._hard_pause_reason(db, storage_paths)
            if paused_reason:
                summary.paused_reason = paused_reason
                return summary
            outside_window = not ignore_window and not self._in_nightly_window(datetime.now().hour)
            completed, failed = self.process_jobs(db, storage_paths, outside_window_only=outside_window)
            summary.jobs_completed = completed
            summary.jobs_failed = failed
            if outside_window and completed == 0 and failed == 0:
                summary.paused_reason = "outside_nightly_window"
        return summary

    def scan_inbox(self, db: Session, storage_paths: dict[str, Path] | None = None) -> tuple[int, int, int]:
        paths = storage_paths or load_storage_paths(db, self.settings, ensure=True)
        inbox_dir = paths["inbox"]
        quarantine_dir = paths["quarantine"]
        added = duplicates = blocked = 0
        now_timestamp = time.time()
        for inbound in sorted(inbox_dir.rglob("*")):
            if not inbound.is_file() or inbound.is_symlink() or inbound.name.startswith("."):
                continue
            if inbound.suffix.lower() in {".part", ".partial", ".tmp", ".crdownload"}:
                continue
            try:
                stat = inbound.stat()
            except OSError:
                continue
            if stat.st_size <= 0 or stat.st_size > self.settings.max_asset_bytes:
                blocked += 1
                continue
            if now_timestamp - stat.st_mtime < self.settings.inbox_stable_seconds:
                continue
            checksum = sha256_file(inbound)
            if db.scalar(select(CloudInboxAsset.id).where(CloudInboxAsset.sha256 == checksum)):
                duplicates += 1
                continue
            submission_id, display_name = self._submission_reference(db, inbound.name)
            asset_id = new_id()
            quarantine_name = f"{asset_id}--{safe_filename(display_name)}"
            quarantine_path = quarantine_dir / quarantine_name
            shutil.copy2(inbound, quarantine_path)
            result = scan_file(
                quarantine_path,
                max_bytes=self.settings.max_asset_bytes,
                use_defender=self.settings.defender_scan,
            )
            if result.status == "blocked":
                blocked += 1
            relative_inbound = inbound.resolve().relative_to(inbox_dir.resolve()).as_posix()
            asset = CloudInboxAsset(
                id=asset_id,
                household_id="home",
                submission_id=submission_id,
                provider="cloud_inbox",
                inbound_ref=relative_inbound,
                quarantine_ref=quarantine_name,
                original_name=display_name,
                mime_type=result.mime_type,
                size_bytes=stat.st_size,
                sha256=checksum,
                scan_status=result.status,
                quarantine_status="frozen" if result.status == "blocked" else "review",
                review_note=result.reason,
            )
            db.add(asset)
            add_audit(
                db,
                request=None,
                actor=None,
                action="cloud_asset.quarantined",
                resource_type="cloud_inbox_asset",
                resource_id=asset.id,
                metadata={"sha256": checksum, "scan_status": result.status, "size_bytes": stat.st_size},
            )
            try:
                db.commit()
            except IntegrityError:
                db.rollback()
                quarantine_path.unlink(missing_ok=True)
                duplicates += 1
                continue
            added += 1
        return added, duplicates, blocked

    def process_jobs(
        self,
        db: Session,
        storage_paths: dict[str, Path] | None = None,
        *,
        outside_window_only: bool = False,
    ) -> tuple[int, int]:
        paths = storage_paths or load_storage_paths(db, self.settings, ensure=True)
        completed = failed = 0
        candidates = db.scalars(
            select(DownloadJob)
            .where(DownloadJob.stage == "queued", DownloadJob.scheduled_at <= utcnow())
            .order_by(DownloadJob.scheduled_at)
            .limit(20 if outside_window_only else 2)
        ).all()
        jobs: list[DownloadJob] = []
        for job in candidates:
            if outside_window_only:
                if not job.manifest_ref:
                    continue
                try:
                    manifest = read_manifest(self.settings.manifest_dir, job.manifest_ref)
                except DownloadRejected:
                    continue
                if not manifest.get("run_outside_window"):
                    continue
            jobs.append(job)
            if len(jobs) == 2:
                break
        for job in jobs:
            try:
                self._process_job(db, job, paths)
                completed += 1
            except DownloadRejected as exc:
                self._mark_failed(db, job, self._safe_error_code(str(exc)))
                failed += 1
            except Exception:
                # 未分类异常也必须结束任务，避免界面永久停在“下载中”。
                self._mark_failed(db, job, "worker_unexpected_error")
                failed += 1
        return completed, failed

    def _recover_interrupted_jobs(self, db: Session) -> None:
        """服务重启后重新排队上次未完成的任务。"""

        interrupted = db.scalars(select(DownloadJob).where(DownloadJob.stage == "downloading")).all()
        if not interrupted:
            return
        for job in interrupted:
            job.stage = "queued"
            job.progress = 0
            job.bytes_done = 0
            job.expected_bytes = None
            job.error_code = "worker_restarted"
            job.scheduled_at = utcnow()
        db.commit()

    def _mark_failed(self, db: Session, job: DownloadJob, error_code: str) -> None:
        job.stage = "failed"
        job.error_code = error_code
        job.retry_count += 1
        job.scheduled_at = utcnow() + timedelta(minutes=min(60, 2 ** min(job.retry_count, 5)))
        add_audit(
            db,
            request=None,
            actor=None,
            action="download.failed",
            resource_type="download_job",
            resource_id=job.id,
            metadata={"error_code": job.error_code, "retry_count": job.retry_count},
        )
        db.commit()

    def _process_job(self, db: Session, job: DownloadJob, storage_paths: dict[str, Path]) -> None:
        source = db.get(ContentSource, job.source_id)
        if source is None or not job.manifest_ref:
            raise DownloadRejected("job_manifest_missing")
        source_reason = source_download_reason(source)
        if source_reason:
            raise DownloadRejected("source_not_downloadable")
        manifest = read_manifest(self.settings.manifest_dir, job.manifest_ref)
        url = manifest.get("url")
        if not isinstance(url, str):
            raise DownloadRejected("job_url_missing")
        connector = manifest.get("connector", "direct_http")
        job.stage = "downloading"
        job.progress = 1
        db.commit()
        provider = "direct_http"
        cover_path: Path | None = None
        if connector == "bilibili":
            if source.id != BILIBILI_SOURCE_ID:
                raise DownloadRejected("bilibili_source_invalid")
            last_update = {"bytes": 0, "progress": 1, "time": 0.0}

            def report_progress(bytes_done: int, expected_bytes: int | None) -> None:
                if expected_bytes and expected_bytes > self.settings.max_asset_bytes:
                    raise DownloadRejected("bilibili_output_size_rejected")
                next_progress = min(99, max(1, int(bytes_done * 100 / expected_bytes))) if expected_bytes else 1
                now = time.monotonic()
                if (
                    next_progress < last_update["progress"] + 2
                    and bytes_done < last_update["bytes"] + 8 * 1024 * 1024
                    and now < last_update["time"] + 2
                ):
                    return
                job.bytes_done = bytes_done
                job.expected_bytes = expected_bytes
                job.progress = next_progress
                db.commit()
                last_update.update(bytes=bytes_done, progress=next_progress, time=now)

            result = download_bilibili_to_quarantine(
                url=url,
                destination_dir=storage_paths["quarantine"],
                job_id=job.id,
                max_bytes=self.settings.max_asset_bytes,
                max_height=int(manifest.get("max_height", 1080)),
                cookie_file=active_bilibili_cookie_file(self.settings),
                progress=report_progress,
            )
            path = result.path
            cover_path = result.cover_path
            checksum = result.checksum
            size = result.size_bytes
            job.title = result.title
            job.external_id = result.external_id
            provider = "bilibili"
        elif connector == "direct_http":
            path, checksum, size, _remote_mime = download_to_quarantine(
                url=url,
                source=source,
                destination_dir=storage_paths["quarantine"],
                job_id=job.id,
                max_bytes=self.settings.max_asset_bytes,
            )
        else:
            raise DownloadRejected("job_connector_unknown")
        expected = manifest.get("expected_sha256")
        if expected and checksum.lower() != str(expected).lower():
            path.unlink(missing_ok=True)
            if cover_path is not None:
                cover_path.unlink(missing_ok=True)
            raise DownloadRejected("checksum_mismatch")
        result = scan_file(
            path,
            max_bytes=self.settings.max_asset_bytes,
            use_defender=self.settings.defender_scan,
        )
        asset = CloudInboxAsset(
            household_id=job.household_id,
            provider=provider,
            inbound_ref=f"download-job:{job.id}",
            quarantine_ref=path.name,
            original_name=path.name.split("--", 1)[-1],
            mime_type=result.mime_type,
            size_bytes=size,
            sha256=checksum,
            scan_status=result.status,
            quarantine_status="frozen" if result.status == "blocked" else "review",
            review_note=result.reason,
        )
        db.add(asset)
        job.stage = "blocked" if result.status == "blocked" else "review"
        job.progress = 100
        job.bytes_done = size
        job.expected_bytes = size
        job.checksum = checksum
        job.error_code = None
        redact_manifest(self.settings.manifest_dir, job.manifest_ref, checksum=checksum, size_bytes=size)
        add_audit(
            db,
            request=None,
            actor=None,
            action="download.quarantined",
            resource_type="download_job",
            resource_id=job.id,
            metadata={"sha256": checksum, "size_bytes": size, "scan_status": result.status},
        )
        db.commit()

    def _submission_reference(self, db: Session, filename: str) -> tuple[str | None, str]:
        if "--" not in filename:
            return None, filename
        candidate, display_name = filename.split("--", 1)
        submission = db.get(CommunitySubmission, candidate)
        if submission is None or submission.transfer_status != "confirmed":
            return None, filename
        return submission.id, display_name

    def _hard_pause_reason(self, db: Session, storage_paths: dict[str, Path] | None = None) -> str | None:
        setting = db.get(SystemSetting, "downloads")
        if setting and setting.value_json.get("paused"):
            return "downloads_paused"
        paths = storage_paths or load_storage_paths(db, self.settings, ensure=True)
        usage = shutil.disk_usage(paths["video"])
        if usage.free / usage.total < self.settings.min_free_ratio:
            return "disk_free_below_threshold"
        return None

    def _in_nightly_window(self, hour: int) -> bool:
        start = self.settings.nightly_start_hour
        end = self.settings.nightly_end_hour
        if start <= end:
            return start <= hour < end
        return hour >= start or hour < end

    @staticmethod
    def _safe_error_code(message: str) -> str:
        normalized = "".join(character if character.isalnum() or character in "_-" else "_" for character in message)
        return normalized[:80] or "download_failed"


def build_worker(settings: Settings | None = None) -> FamilyWorker:
    active_settings = settings or Settings()
    active_settings.ensure_directories()
    engine = build_engine(active_settings)
    Base.metadata.create_all(engine)
    return FamilyWorker(active_settings, build_session_factory(engine))


def main() -> None:
    parser = argparse.ArgumentParser(description="Lumi Family Hub controlled worker")
    parser.add_argument("--once", action="store_true", help="run one scan and exit")
    parser.add_argument("--ignore-window", action="store_true", help="process approved jobs outside the nightly window")
    args = parser.parse_args()
    worker = build_worker()
    if args.once:
        summary = worker.run_once(ignore_window=args.ignore_window)
        print(summary)
        return
    while True:
        worker.run_once()
        time.sleep(worker.settings.worker_poll_seconds)


if __name__ == "__main__":
    main()
