from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from familyhub import external
from familyhub.external import ExternalCatalogError, ExternalEntry
from familyhub import main as familyhub_main

from .conftest import login


def _custom_paths(tmp_path: Path) -> dict[str, str]:
    root = tmp_path / "managed"
    return {
        "video": str(root / "video"),
        "book": str(root / "book"),
        "audio": str(root / "audio"),
        "image": str(root / "image"),
        "cache": str(root / "cache"),
        "inbox": str(root / "inbox"),
        "quarantine": str(root / "quarantine"),
    }


def test_storage_paths_scan_publish_and_stream(client: TestClient, tmp_path: Path) -> None:
    operator = login(client, "operator")
    paths = _custom_paths(tmp_path)
    updated = client.put("/api/v1/ops/storage-paths", headers=operator, json=paths)
    assert updated.status_code == 200, updated.text
    assert updated.json() == paths
    assert all(Path(value).is_dir() for value in paths.values())

    video_path = Path(paths["video"]) / "家庭自然课.mp4"
    video_path.write_bytes(b"mock-mp4-content")
    scan = client.post("/api/v1/ops/library/scan", headers=operator)
    assert scan.status_code == 200, scan.text
    assert scan.json() == {"discovered": 1, "skipped": 0, "failed": 0}

    library = client.get("/api/v1/ops/library", headers=operator).json()
    local = next(item for item in library if item["file_path"] == str(video_path.resolve()))
    assert local["publication_status"] == "draft"
    assert local["file_available"] is True

    published = client.patch(
        f"/api/v1/ops/library/{local['id']}",
        headers=operator,
        json={"publication_status": "published", "audience": "family", "age_from": 3, "age_to": 12},
    )
    assert published.status_code == 200, published.text
    guardian = login(client, "guardian")
    catalog = client.get("/api/v1/catalog/curated", headers=guardian).json()
    card = next(item for item in catalog if item["id"] == local["id"])
    assert card["local_available"] is True
    assert card["playback_mode"] == "local_asset"
    assert card["launch_allowed"] is True

    launch = client.post(f"/api/v1/catalog/{local['id']}/launch", headers=guardian)
    assert launch.status_code == 200, launch.text
    assert launch.json()["mode"] == "local_asset"
    media = client.get(launch.json()["url"])
    assert media.status_code == 200
    assert media.content == b"mock-mp4-content"

    archived = client.delete(f"/api/v1/ops/library/{local['id']}", headers=operator)
    assert archived.status_code == 200
    assert archived.json()["publication_status"] == "archived"
    assert all(item["id"] != local["id"] for item in client.get("/api/v1/catalog/curated", headers=guardian).json())


def test_external_direct_item_is_published_and_launchable(client: TestClient) -> None:
    operator = login(client, "operator")
    created = client.post(
        "/api/v1/ops/library/external",
        headers=operator,
        json={
            "url": "https://media.example.com/english-story.mp4",
            "provider": "direct",
            "title": "English Story",
            "kind": "video",
            "audience": "child",
            "age_from": 4,
            "age_to": 8,
            "language": "English",
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["acquisition_mode"] == "direct_stream"

    guardian = login(client, "guardian")
    launch = client.post(f"/api/v1/catalog/{created.json()['id']}/launch", headers=guardian)
    assert launch.status_code == 200
    assert launch.json()["mode"] == "direct_stream"
    assert launch.json()["url"] == "https://media.example.com/english-story.mp4"


def test_bilibili_item_can_be_saved_when_metadata_is_temporarily_unavailable(
    client: TestClient,
    monkeypatch,
) -> None:
    def unavailable(*_args, **_kwargs):
        raise ExternalCatalogError("bilibili_metadata_failed")

    monkeypatch.setattr(familyhub_main, "extract_bilibili_entries", unavailable)
    monkeypatch.setattr(familyhub_main, "fetch_bilibili_public_metadata", unavailable)
    operator = login(client, "operator")
    created = client.post(
        "/api/v1/ops/library/external",
        headers=operator,
        json={
            "url": "https://www.bilibili.com/video/BV18T3G6jEVM/?vd_source=test",
            "provider": "auto",
            "kind": "video",
            "audience": "family",
            "age_from": 4,
            "age_to": 12,
            "language": "中文",
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["title"] == "B站视频 BV18T3G6jEVM"
    assert created.json()["acquisition_mode"] == "external_bilibili"
    assert created.json()["external_url"] == "https://www.bilibili.com/video/BV18T3G6jEVM"


def test_bilibili_favorite_feed_syncs_metadata_without_downloading(
    client: TestClient,
    monkeypatch,
    tmp_path: Path,
) -> None:
    operator = login(client, "operator")
    paths = _custom_paths(tmp_path)
    assert client.put("/api/v1/ops/storage-paths", headers=operator, json=paths).status_code == 200
    cookie_path = Path(paths["cache"]) / "bilibili.cookies.txt"
    cookie_path.write_text("# Netscape HTTP Cookie File\n", encoding="utf-8")

    def fake_extract(_url: str, *, cookie_file=None, max_items=50):
        assert cookie_file == cookie_path.resolve()
        assert max_items == 20
        return [
            ExternalEntry(
                external_id="BV18T3G6jEVM",
                title="适合儿童的自然观察",
                url="https://www.bilibili.com/video/BV18T3G6jEVM",
                cover_url="https://i0.hdslb.com/example.jpg",
                duration_minutes=8,
                description="公开收藏夹中的测试条目",
                uploader="家庭关注的 UP 主",
            )
        ]

    monkeypatch.setattr(external, "extract_bilibili_entries", fake_extract)
    feed = client.post(
        "/api/v1/ops/external-feeds",
        headers=operator,
        json={
            "name": "小豆的 B 站收藏夹",
            "url": "https://space.bilibili.com/123/favlist?fid=456",
            "cookie_file": "bilibili.cookies.txt",
            "audience": "child",
            "age_from": 4,
            "age_to": 8,
            "language": "中文",
            "max_items": 20,
            "sync_interval_hours": 12,
        },
    )
    assert feed.status_code == 201, feed.text
    assert feed.json()["item_count"] == 1
    assert feed.json()["last_error"] is None

    guardian = login(client, "guardian")
    catalog = client.get("/api/v1/catalog/curated", headers=guardian).json()
    item = next(entry for entry in catalog if entry["title"] == "适合儿童的自然观察")
    assert item["provider"] == "bilibili"
    assert item["playback_mode"] == "direct_stream"
    assert item["cover_ref"] == "https://i0.hdslb.com/example.jpg"
    monkeypatch.setattr(
        familyhub_main,
        "resolve_bilibili_playback",
        lambda *_args, **_kwargs: external.BilibiliPlayback(
            video_url="https://media.example/video.m4s",
            video_headers={},
            audio_url="https://media.example/audio.m4s",
            audio_headers={},
            quality_label="1080P",
        ),
    )

    class FakeHlsManager:
        def prepare(self, _content_id, playback):
            return type("PreparedStream", (), {"quality": playback.quality_label})()

        def close(self):
            return None

    client.app.state.bilibili_hls = FakeHlsManager()
    launch = client.post(f"/api/v1/catalog/{item['id']}/launch", headers=guardian)
    assert launch.status_code == 200
    assert launch.json()["mode"] == "direct_stream"
    assert launch.json()["url"].startswith(f"/api/v1/online/{item['id']}/index.m3u8?ticket=")

    removed = client.delete(f"/api/v1/ops/external-feeds/{feed.json()['id']}", headers=operator)
    assert removed.status_code == 204
