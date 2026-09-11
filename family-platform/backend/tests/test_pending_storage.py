from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from familyhub.config import Settings
from familyhub import main as familyhub_main
from familyhub.main import create_app
from familyhub.models import CloudInboxAsset, ContentAsset, ContentItem, DownloadJob, new_id

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

    # 模拟旧版曾把 runtime/quarantine 作为默认目录保存进数据库。
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
        legacy_cover = legacy_file.parent / "legacy--cover.webp"
        legacy_cover.write_bytes(b"RIFF" + b"original-cover")
        with client.app.state.session_factory() as db:
            asset = CloudInboxAsset(
                id=new_id(),
                household_id="home",
                provider="bilibili",
                inbound_ref="download-job:legacy",
                quarantine_ref=legacy_file.name,
                original_name=legacy_file.name,
                mime_type="video/mp4",
                size_bytes=legacy_file.stat().st_size,
                sha256="a" * 64,
                scan_status="review",
                quarantine_status="review",
            )
            db.add(asset)
            db.commit()
            asset_id = asset.id

        response = client.post(
            f"/api/v1/ops/cloud-inbox/{asset_id}/review",
            headers=operator,
            json={
                "decision": "approved",
                "rights_confirmed": True,
                "security_confirmed": True,
                "review_note": "已核对旧版下载文件",
                "title": "旧版下载资源",
                "content_kind": "video",
                "audience": "child",
                "age_from": 6,
                "age_to": 9,
                "language": "中文",
            },
        )

        guardian = login(client, "guardian")
        catalog = client.get("/api/v1/catalog/curated", headers=guardian).json()
        published = next(item for item in catalog if item["title"] == "旧版下载资源")
        assert published["cover_ref"] == f"/api/v1/artwork/{published['id']}"
        assert client.get(published["cover_ref"]).status_code == 401
        artwork = client.get(published["cover_ref"], headers=guardian)
        assert artwork.status_code == 200
        assert artwork.content == b"RIFF" + b"original-cover"

    assert response.status_code == 200, response.text
    assert response.json()["quarantine_status"] == "published"
    assert any(path.name.endswith("legacy-download.mp4") for path in (settings.library_dir / "video").iterdir())


def test_catalog_lazily_backfills_cover_for_video_published_by_an_old_version(
    tmp_path: Path,
    monkeypatch,
) -> None:
    settings = _settings(tmp_path)
    video_path = tmp_path / "old-bilibili-video.mp4"
    video_path.write_bytes(b"old-video")
    with TestClient(create_app(settings)) as client:
        operator = login(client, "operator")
        imported = client.post(
            "/api/v1/ops/library/import",
            headers=operator,
            json={
                "source_path": str(video_path),
                "kind": "video",
                "title": "旧版B站视频",
                "audience": "family",
                "age_from": 3,
                "age_to": 99,
                "language": "中文",
                "copy_to_library": True,
                "publish": True,
            },
        )
        assert imported.status_code == 201, imported.text
        content_id = imported.json()["id"]
        with client.app.state.session_factory() as db:
            asset = db.query(ContentAsset).filter(ContentAsset.content_id == content_id).one()
            db.add(
                DownloadJob(
                    household_id="home",
                    source_id="bilibili-public",
                    external_id="BV18T3G6jEVM",
                    title="旧版B站视频",
                    content_kind="video",
                    stage="published",
                    progress=100,
                    checksum=asset.checksum,
                    idempotency_key="old-version-cover-backfill",
                    rights_note="家庭使用",
                    proof_url="https://www.bilibili.com/video/BV18T3G6jEVM",
                )
            )
            db.commit()

        def fake_cover(*, url: str, destination_dir: Path, content_id: str) -> Path:
            assert url.endswith("BV18T3G6jEVM")
            target = destination_dir / f"{content_id}--cover.webp"
            target.write_bytes(b"backfilled-original-cover")
            return target

        monkeypatch.setattr(familyhub_main, "download_bilibili_cover", fake_cover)
        guardian = login(client, "guardian")
        catalog = client.get("/api/v1/catalog/curated", headers=guardian).json()
        item = next(entry for entry in catalog if entry["id"] == content_id)
        assert item["cover_ref"] == f"/api/v1/artwork/{content_id}"
        artwork = client.get(item["cover_ref"], headers=guardian)
        assert artwork.status_code == 200
        assert artwork.content == b"backfilled-original-cover"
        with client.app.state.session_factory() as db:
            saved_item = db.get(ContentItem, content_id)
            saved_job = db.query(DownloadJob).filter(DownloadJob.idempotency_key == "old-version-cover-backfill").one()
            assert saved_item is not None and saved_item.cover_ref == item["cover_ref"]
            assert saved_job.content_id == content_id
