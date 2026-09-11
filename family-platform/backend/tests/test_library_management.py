from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from familyhub import external
from familyhub.external import ExternalCatalogError, ExternalCollection, ExternalEntry
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

    assert client.post("/api/v1/auth/logout", headers=guardian).status_code == 204
    assert client.get(launch.json()["url"]).status_code == 401
    guardian = login(client, "guardian")
    fresh_launch = client.post(f"/api/v1/catalog/{local['id']}/launch", headers=guardian)
    assert fresh_launch.status_code == 200

    archived = client.delete(f"/api/v1/ops/library/{local['id']}", headers=operator)
    assert archived.status_code == 200
    assert archived.json()["publication_status"] == "archived"
    assert client.get(fresh_launch.json()["url"]).status_code == 404
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
    monkeypatch.setattr(familyhub_main, "fetch_bilibili_collection", unavailable)
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


def test_flat_bilibili_feed_entries_are_enriched_with_public_metadata(monkeypatch) -> None:
    import yt_dlp

    class FakeYoutubeDL:
        def __init__(self, options):
            assert options["extract_flat"] == "in_playlist"

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def extract_info(self, _url: str, *, download: bool):
            assert download is False
            return {
                "_type": "playlist",
                "entries": [{"id": "BV18T3G6jEVM", "title": "BV18T3G6jEVM"}],
            }

    def fake_metadata(url: str, *, cookie_file=None):
        assert url == "https://www.bilibili.com/video/BV18T3G6jEVM"
        assert cookie_file is None
        return ExternalEntry(
            external_id="BV18T3G6jEVM",
            title="被补全的标题",
            url=url,
            cover_url="https://i0.hdslb.com/enriched-cover.jpg",
            duration_minutes=12,
            description="被补全的简介",
            uploader="测试 UP 主",
        )

    monkeypatch.setattr(yt_dlp, "YoutubeDL", FakeYoutubeDL)
    monkeypatch.setattr(external, "fetch_bilibili_public_metadata", fake_metadata)

    entries = external.extract_bilibili_entries(
        "https://space.bilibili.com/123/favlist?fid=456",
        max_items=20,
    )

    assert len(entries) == 1
    assert entries[0].title == "被补全的标题"
    assert entries[0].cover_url == "https://i0.hdslb.com/enriched-cover.jpg"
    assert entries[0].duration_minutes == 12


def test_cover_format_accepts_supported_image_magic_bytes() -> None:
    assert external._cover_image_suffix("application/octet-stream", b"\xff\xd8\xffmock") == ".jpg"
    assert external._cover_image_suffix("image/webp", b"mock") == ".webp"
    assert external._cover_image_suffix("text/html", b"<html>") is None


def test_bilibili_collection_is_restored_from_a_middle_episode(monkeypatch) -> None:
    reference = type(
        "Reference",
        (),
        {"external_id": "BV2222222222", "url": "https://www.bilibili.com/video/BV2222222222"},
    )()
    payload = {
        "title": "收藏到的第二集",
        "desc": "单集简介",
        "pic": "https://i0.hdslb.com/main.jpg",
        "owner": {"name": "测试作者"},
        "ugc_season": {
            "id": 9527,
            "title": "完整自然课",
            "intro": "合集简介",
            "cover": "https://i0.hdslb.com/season.jpg",
            "sections": [
                {
                    "title": "第一章",
                    "episodes": [
                        {"bvid": "BV1111111111", "title": "第一集", "arc": {"bvid": "BV1111111111", "title": "第一集", "duration": 120, "pic": "https://i0.hdslb.com/1.jpg"}},
                        {"bvid": "BV2222222222", "title": "第二集", "arc": {"bvid": "BV2222222222", "title": "第二集", "duration": 180, "pic": "https://i0.hdslb.com/2.jpg"}},
                    ],
                },
                {
                    "title": "第二章",
                    "episodes": [
                        {"bvid": "BV3333333333", "title": "第三集", "arc": {"bvid": "BV3333333333", "title": "第三集", "duration": 240, "pic": "https://i0.hdslb.com/3.jpg"}},
                    ],
                },
            ],
        },
    }
    monkeypatch.setattr(external, "_fetch_bilibili_view_data", lambda *_args, **_kwargs: (reference, payload))

    collection = external.fetch_bilibili_collection(reference.url)

    assert collection is not None
    assert collection.external_id == "9527"
    assert collection.title == "完整自然课"
    assert [episode.title for episode in collection.episodes] == ["第一集", "第二集", "第三集"]
    assert [episode.episode_index for episode in collection.episodes] == [1, 2, 3]
    assert collection.episodes[2].section_title == "第二章"


def test_multi_page_video_keeps_each_page_url(monkeypatch) -> None:
    reference = type(
        "Reference",
        (),
        {"external_id": "BV18T3G6jEVM", "url": "https://www.bilibili.com/video/BV18T3G6jEVM?p=2"},
    )()
    payload = {
        "title": "多 P 课程",
        "desc": "课程简介",
        "pic": "https://i0.hdslb.com/main.jpg",
        "owner": {"name": "测试作者"},
        "pages": [
            {"page": 1, "part": "认识天空", "duration": 60},
            {"page": 2, "part": "认识海洋", "duration": 90},
        ],
    }
    monkeypatch.setattr(external, "_fetch_bilibili_view_data", lambda *_args, **_kwargs: (reference, payload))

    collection = external.fetch_bilibili_collection(reference.url)

    assert collection is not None
    assert collection.collection_kind == "multi_page"
    assert [episode.url for episode in collection.episodes] == [
        "https://www.bilibili.com/video/BV18T3G6jEVM?p=1",
        "https://www.bilibili.com/video/BV18T3G6jEVM?p=2",
    ]


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

    def fake_cache(_db, _settings, *, item, cover_url, provider):
        assert cover_url == "https://i0.hdslb.com/example.jpg"
        assert provider == "bilibili"
        destination = Path(paths["image"]) / f"{item.id}--cover.jpg"
        destination.write_bytes(b"\xff\xd8\xff\xd9")
        item.cover_ref = f"/api/v1/artwork/{item.id}"
        return item.cover_ref

    monkeypatch.setattr(external, "extract_bilibili_entries", fake_extract)
    monkeypatch.setattr(external, "fetch_bilibili_collection", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(external, "cache_external_cover", fake_cache)
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
    assert item["cover_ref"] == f"/api/v1/artwork/{item['id']}"
    artwork = client.get(item["cover_ref"], headers=guardian)
    assert artwork.status_code == 200
    assert artwork.content == b"\xff\xd8\xff\xd9"
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

    withdrawn = client.patch(
        f"/api/v1/ops/library/{item['id']}",
        headers=operator,
        json={"publication_status": "draft"},
    )
    assert withdrawn.status_code == 200
    assert withdrawn.json()["publication_status"] == "draft"
    assert all(entry["id"] != item["id"] for entry in client.get("/api/v1/catalog/curated", headers=guardian).json())

    resynced = client.post(f"/api/v1/ops/external-feeds/{feed.json()['id']}/sync", headers=operator)
    assert resynced.status_code == 200, resynced.text
    managed = next(entry for entry in client.get("/api/v1/ops/library", headers=operator).json() if entry["id"] == item["id"])
    assert managed["publication_status"] == "draft"

    hidden = client.delete(f"/api/v1/ops/library/{item['id']}", headers=operator)
    assert hidden.status_code == 200
    assert hidden.json()["publication_status"] == "archived"
    assert client.post(f"/api/v1/ops/external-feeds/{feed.json()['id']}/sync", headers=operator).status_code == 200
    managed = next(entry for entry in client.get("/api/v1/ops/library", headers=operator).json() if entry["id"] == item["id"])
    assert managed["publication_status"] == "archived"

    restored = client.patch(
        f"/api/v1/ops/library/{item['id']}",
        headers=operator,
        json={"publication_status": "published"},
    )
    assert restored.status_code == 200
    assert restored.json()["publication_status"] == "published"

    deleted = client.delete(f"/api/v1/ops/library/{item['id']}/permanent", headers=operator)
    assert deleted.status_code == 204
    assert all(entry["id"] != item["id"] for entry in client.get("/api/v1/ops/library", headers=operator).json())
    assert all(entry["id"] != item["id"] for entry in client.get("/api/v1/bootstrap", headers=operator).json()["library_items"])
    assert client.post(f"/api/v1/ops/external-feeds/{feed.json()['id']}/sync", headers=operator).status_code == 200
    assert all(entry["id"] != item["id"] for entry in client.get("/api/v1/ops/library", headers=operator).json())
    assert all(entry["id"] != item["id"] for entry in client.get("/api/v1/catalog/curated", headers=guardian).json())

    removed = client.delete(f"/api/v1/ops/external-feeds/{feed.json()['id']}", headers=operator)
    assert removed.status_code == 204


def test_favorite_sync_expands_collection_updates_incrementally_and_honors_deletion(
    client: TestClient,
    monkeypatch,
) -> None:
    operator = login(client, "operator")
    seeds = [
        ExternalEntry(
            external_id="BV2222222222",
            title="第二集",
            url="https://www.bilibili.com/video/BV2222222222",
            cover_url=None,
            duration_minutes=3,
            description="收藏的是合集中的第二集",
            uploader="测试作者",
        )
    ]
    collection_id = "bilibili-collection-test"
    collection_entries = tuple(
        ExternalEntry(
            external_id=f"BV{index:010d}",
            title=f"自然课第 {index} 集",
            url=f"https://www.bilibili.com/video/BV{index:010d}",
            cover_url=None,
            duration_minutes=index + 1,
            description="合集分集",
            uploader="测试作者",
            collection_id=collection_id,
            collection_external_id="9527",
            collection_title="完整自然课",
            collection_description="按原顺序同步的合集",
            collection_cover_url=None,
            collection_kind="ugc_season",
            episode_index=index,
            episode_count=3,
            section_title="第一章" if index < 3 else "第二章",
        )
        for index in range(1, 4)
    )
    collection = ExternalCollection(
        collection_id=collection_id,
        external_id="9527",
        title="完整自然课",
        description="按原顺序同步的合集",
        cover_url=None,
        source_url=seeds[0].url,
        collection_kind="ugc_season",
        episodes=collection_entries,
    )

    monkeypatch.setattr(external, "extract_bilibili_entries", lambda *_args, **_kwargs: list(seeds))
    monkeypatch.setattr(
        external,
        "fetch_bilibili_collection",
        lambda url, **_kwargs: collection if "BV2222222222" in url else None,
    )
    feed = client.post(
        "/api/v1/ops/external-feeds",
        headers=operator,
        json={
            "name": "自动更新收藏夹",
            "url": "https://space.bilibili.com/123/favlist?fid=456",
            "audience": "family",
            "age_from": 4,
            "age_to": 12,
            "language": "中文",
            "max_items": 20,
            "sync_interval_hours": 1,
        },
    )
    assert feed.status_code == 201, feed.text
    assert feed.json()["item_count"] == 3

    guardian = login(client, "guardian")
    catalog = client.get("/api/v1/catalog/curated", headers=guardian).json()
    episodes = [item for item in catalog if item.get("collection_id") == collection_id]
    assert sorted(item["episode_index"] for item in episodes) == [1, 2, 3]
    selected = next(item for item in episodes if item["episode_index"] == 2)
    detail = client.get(f"/api/v1/catalog/{selected['id']}/collection", headers=guardian)
    assert detail.status_code == 200, detail.text
    assert detail.json()["title"] == "完整自然课"
    assert [item["episode_index"] for item in detail.json()["episodes"]] == [1, 2, 3]
    child = login(client, "child")
    request = client.post(
        "/api/v1/content-requests",
        headers=child,
        json={"item_id": selected["id"], "purpose": "watch", "reason": "想连续观看这个合集"},
    )
    assert request.status_code == 201, request.text
    assert client.post(
        f"/api/v1/guardian/content-requests/{request.json()['id']}/decision",
        headers=guardian,
        json={"decision": "approved", "scope": "once"},
    ).status_code == 200
    child_collection = client.get(f"/api/v1/catalog/{selected['id']}/collection", headers=child).json()
    assert all(item["launch_allowed"] for item in child_collection["episodes"])

    # 定时任务再次读取收藏夹后，只增量加入新收藏，不重复创建旧分集。
    seeds.append(
        ExternalEntry(
            external_id="BV4444444444",
            title="新收藏的视频",
            url="https://www.bilibili.com/video/BV4444444444",
            cover_url=None,
            duration_minutes=5,
            description="后续加入收藏夹",
            uploader="测试作者",
        )
    )
    with client.app.state.session_factory() as db:
        saved_feeds = external.load_external_feeds(db)
        saved_feeds[0]["last_attempt_at"] = None
        external.save_external_feeds(db, saved_feeds, updated_by=None)
        db.commit()
        synced, failed = external.sync_due_external_feeds(db, client.app.state.settings)
    assert (synced, failed) == (1, 0)
    catalog = client.get("/api/v1/catalog/curated", headers=guardian).json()
    assert len([item for item in catalog if item.get("collection_id") == collection_id]) == 3
    assert any(item["title"] == "新收藏的视频" for item in catalog)

    # 单集删除只移除这一集；整合集删除后，后台同步也不会把它复活。
    first = next(item for item in episodes if item["episode_index"] == 1)
    assert client.delete(f"/api/v1/ops/library/{first['id']}/permanent", headers=operator).status_code == 204
    detail = client.get(f"/api/v1/catalog/{selected['id']}/collection", headers=guardian).json()
    assert [item["episode_index"] for item in detail["episodes"]] == [2, 3]
    assert client.delete(f"/api/v1/ops/library/collections/{collection_id}", headers=operator).status_code == 204
    assert client.post(f"/api/v1/ops/external-feeds/{feed.json()['id']}/sync", headers=operator).status_code == 200
    catalog = client.get("/api/v1/catalog/curated", headers=guardian).json()
    assert all(item.get("collection_id") != collection_id for item in catalog)


def test_collection_expansion_keeps_every_episode(monkeypatch) -> None:
    seed = ExternalEntry(
        external_id="BV0000000001",
        title="超长合集中的一集",
        url="https://www.bilibili.com/video/BV0000000001",
        cover_url=None,
        duration_minutes=3,
        description="",
        uploader="测试作者",
    )
    episodes = tuple(
        ExternalEntry(
            external_id=f"BV{index:010d}",
            title=f"第 {index} 集",
            url=f"https://www.bilibili.com/video/BV{index:010d}",
            cover_url=None,
            duration_minutes=3,
            description="",
            uploader="测试作者",
            collection_id="bilibili-collection-long",
            collection_external_id="long-collection",
            collection_title="超长合集",
            collection_description="",
            collection_cover_url=None,
            collection_kind="ugc_season",
            episode_index=index,
            episode_count=205,
        )
        for index in range(1, 206)
    )
    collection = ExternalCollection(
        collection_id="bilibili-collection-long",
        external_id="long-collection",
        title="超长合集",
        description="",
        cover_url=None,
        source_url=seed.url,
        collection_kind="ugc_season",
        episodes=episodes,
    )
    monkeypatch.setattr(external, "fetch_bilibili_collection", lambda *_args, **_kwargs: collection)

    expanded = external.expand_bilibili_collections([seed])

    assert len(expanded) == 205
    assert expanded[-1].episode_index == 205
