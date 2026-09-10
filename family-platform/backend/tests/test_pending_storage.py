from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from familyhub.config import Settings
from familyhub.main import create_app
from familyhub.models import CloudInboxAsset, new_id

from .conftest import login


def _settings(tmp_path: Path) -> Settings:
    return Settings(
        environment="test",
        runtime_root=tmp_path / "runtime",
        database_url=f"sqlite:///{(tmp_path / 'pending.db').as_posix()}",
        seed_demo=True,
        password_iterations=1_000,
        defender_scan=False,
        inbox_stable_seconds=0,
        direct_download_enabled=True,
        jellyfin_url="http://127.0.0.1:1",
        kavita_url="http://127.0.0.1:1",
        audiobookshelf_url="http://127.0.0.1:1",
        update_manifest_path=tmp_path / "updates" / "manifest.json",
    )


def test_legacy_default_quarantine_is_migrated_and_setting_is_updated(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    with TestClient(create_app(settings)) as client:
        operator = login(client, "operator")
        paths = client.get("/api/v1/ops/storage-paths", headers=operator).json()
        settings.quarantine_dir.mkdir(parents=True, exist_ok=True)
        paths["quarantine"] = str(settings.quarantine_dir)
        saved = client.put("/api/v1/ops/storage-paths", headers=operator, json=paths)
        assert saved.status_code == 200, saved.text

    legacy_file = settings.quarantine_dir / "downloaded-before-upgrade.mp4"
    legacy_file.write_bytes(b"pending-video")
    with TestClient(create_app(settings)) as client:
        operator = login(client, "operator")
        paths = client.get("/api/v1/ops/storage-paths", headers=operator).json()

    pending_root = settings.library_dir / "video" / ".pending"
    assert paths["quarantine"] == str(pending_root.resolve())
    assert (pending_root / legacy_file.name).read_bytes() == b"pending-video"
    assert not legacy_file.exists()


def test_review_can_publish_a_legacy_file_when_startup_migration_cannot_move_it(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    with TestClient(create_app(settings)) as client:
        operator = login(client, "operator")
        legacy_file = settings.quarantine_dir / "legacy-download.mp4"
        legacy_file.parent.mkdir(parents=True, exist_ok=True)
        legacy_file.write_bytes(b"legacy-video")
        with client.app.state.session_factory() as db:
            asset = CloudInboxAsset(
                id=new_id(), household_id="home", provider="bilibili",
                inbound_ref="download-job:legacy", quarantine_ref=legacy_file.name,
                original_name=legacy_file.name, mime_type="video/mp4",
                size_bytes=legacy_file.stat().st_size, sha256="a" * 64,
                scan_status="review", quarantine_status="review",
            )
            db.add(asset)
            db.commit()
            asset_id = asset.id

        response = client.post(
            f"/api/v1/ops/cloud-inbox/{asset_id}/review", headers=operator,
            json={
                "decision": "approved", "rights_confirmed": True,
                "security_confirmed": True, "review_note": "已核对旧版下载文件",
                "title": "旧版下载资源", "content_kind": "video",
                "audience": "child", "age_from": 6, "age_to": 9, "language": "中文",
            },
        )

    assert response.status_code == 200, response.text
    assert response.json()["quarantine_status"] == "published"
    assert any(path.name.endswith("legacy-download.mp4") for path in (settings.library_dir / "video").iterdir())
