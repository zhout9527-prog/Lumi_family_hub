from __future__ import annotations

import zipfile
from datetime import timedelta
from pathlib import Path

from fastapi.testclient import TestClient

from familyhub.config import Settings
from familyhub.file_safety import scan_file
from familyhub.models import DownloadJob, utcnow
from familyhub.worker import FamilyWorker

from .conftest import login


def _confirmed_submission(client: TestClient) -> tuple[dict[str, str], str]:
    guardian = login(client, "guardian")
    created = client.post(
        "/api/v1/community-submissions",
        headers=guardian,
        json={
            "title": "家庭合法文件投递",
            "provider": "baidu",
            "original_url": "https://pan.baidu.com/s/example",
            "publisher_note": "家长已核对文件名",
            "rights_note": "家庭自行制作的学习材料",
        },
    )
    submission_id = created.json()["id"]
    client.post(
        f"/api/v1/guardian/community-submissions/{submission_id}/confirm-transfer",
        headers=guardian,
        json={"confirmed": True, "provider": "baidu"},
    )
    return guardian, submission_id


def test_worker_quarantines_media_and_blocks_executable(client: TestClient, settings: Settings) -> None:
    _guardian, submission_id = _confirmed_submission(client)
    pdf = settings.inbox_dir / f"{submission_id}--family-notes.pdf"
    executable = settings.inbox_dir / f"{submission_id}--untrusted.exe"
    pdf.write_bytes(b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF")
    executable.write_bytes(b"MZ" + b"\x00" * 64)

    worker = FamilyWorker(settings, client.app.state.session_factory)
    summary = worker.run_once(ignore_window=True)
    assert summary.inbox_added == 2
    assert summary.inbox_blocked == 1

    operator = login(client, "operator")
    assets = client.get("/api/v1/ops/cloud-inbox", headers=operator).json()
    pdf_asset = next(asset for asset in assets if asset["original_name"] == "family-notes.pdf")
    exe_asset = next(asset for asset in assets if asset["original_name"] == "untrusted.exe")
    assert pdf_asset["scan_status"] == "review"
    assert exe_asset["scan_status"] == "blocked"
    assert exe_asset["quarantine_status"] == "frozen"

    incomplete_review = client.post(
        f"/api/v1/ops/cloud-inbox/{pdf_asset['id']}/review",
        headers=operator,
        json={
            "decision": "approved",
            "rights_confirmed": True,
            "security_confirmed": False,
            "review_note": "只完成权利复核",
            "title": "家庭自然观察笔记",
            "content_kind": "book",
            "audience": "child",
            "age_from": 5,
            "age_to": 8,
            "language": "中文",
            "license_ref": "https://example.org/family-owned-proof",
        },
    )
    assert incomplete_review.status_code == 422
    approved = client.post(
        f"/api/v1/ops/cloud-inbox/{pdf_asset['id']}/review",
        headers=operator,
        json={
            "decision": "approved",
            "rights_confirmed": True,
            "security_confirmed": True,
            "review_note": "权利与安全复核均已完成",
            "title": "家庭自然观察笔记",
            "content_kind": "book",
            "audience": "child",
            "age_from": 5,
            "age_to": 8,
            "language": "中文",
            "license_ref": "https://example.org/family-owned-proof",
        },
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["quarantine_status"] == "published"
    assert any((settings.library_dir / "books").iterdir())

    child = login(client, "child")
    catalog = client.get("/api/v1/catalog/curated", headers=child).json()
    assert "家庭自然观察笔记" in {item["title"] for item in catalog}


def test_malicious_epub_path_is_blocked(tmp_path: Path) -> None:
    epub = tmp_path / "bad.epub"
    with zipfile.ZipFile(epub, "w") as archive:
        archive.writestr("mimetype", "application/epub+zip")
        archive.writestr("../escape.txt", "no")
    result = scan_file(epub, max_bytes=1024 * 1024, use_defender=False)
    assert result.status == "blocked"
    assert "路径穿越" in result.reason


def test_worker_recovers_job_interrupted_by_server_restart(client: TestClient, settings: Settings) -> None:
    with client.app.state.session_factory() as db:
        job = DownloadJob(
            household_id="home",
            source_id="bilibili-public",
            external_id="BV18T3G6jEVM",
            title="重启恢复测试",
            content_kind="video",
            stage="downloading",
            progress=64,
            bytes_done=4096,
            expected_bytes=8192,
            scheduled_at=utcnow() + timedelta(days=1),
            idempotency_key="worker-restart-test",
            manifest_ref="missing-manifest.json",
            rights_note="家庭运维管理员确认拥有离线观看权利",
        )
        db.add(job)
        db.commit()
        job_id = job.id

    worker = FamilyWorker(settings, client.app.state.session_factory)
    with client.app.state.session_factory() as db:
        worker._recover_interrupted_jobs(db)

    with client.app.state.session_factory() as db:
        recovered = db.get(DownloadJob, job_id)
        assert recovered is not None
        assert recovered.stage == "queued"
        assert recovered.progress == 0
        assert recovered.bytes_done == 0
        assert recovered.expected_bytes is None
        assert recovered.error_code == "worker_restarted"
