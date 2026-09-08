from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from familyhub.bilibili import normalize_bilibili_url

from .conftest import login


def test_normalize_bilibili_url_removes_tracking_and_rejects_non_video() -> None:
    reference = normalize_bilibili_url(
        "https://www.bilibili.com/video/BV18T3G6jEVM/?spm_id_from=333.1387.favlist.content.click&vd_source=tracking"
    )
    assert reference.external_id == "BV18T3G6jEVM"
    assert reference.url == "https://www.bilibili.com/video/BV18T3G6jEVM"

    try:
        normalize_bilibili_url("https://www.bilibili.com/video/BV18T3G6jEVM?p=2")
    except ValueError:
        raise AssertionError("a public video URL should be accepted")

    for invalid in (
        "http://www.bilibili.com/video/BV18T3G6jEVM",
        "https://www.bilibili.com/",
        "https://example.org/video/BV18T3G6jEVM",
    ):
        try:
            normalize_bilibili_url(invalid)
        except ValueError:
            continue
        raise AssertionError(f"URL should be rejected: {invalid}")


def test_operator_can_queue_bilibili_job_without_leaking_url(client: TestClient) -> None:
    operator = login(client, "operator")
    response = client.post(
        "/api/v1/ops/downloads/bilibili",
        headers=operator,
        json={
            "url": "https://www.bilibili.com/video/BV18T3G6jEVM/?vd_source=tracking",
            "max_height": 720,
            "start_now": True,
            "rights_confirmed": True,
            "rights_note": "本人拥有该视频的家庭离线观看许可",
        },
    )
    assert response.status_code == 201, response.text
    job = response.json()
    assert job["source_id"] == "bilibili-public"
    assert job["stage"] == "queued"
    assert "url" not in job
    audit = client.get("/api/v1/ops/audit", headers=operator).json()
    event = next(item for item in audit if item["action"] == "bilibili_download.queued")
    assert "url" not in event["metadata"]

    rejected = client.post(
        "/api/v1/ops/downloads/bilibili",
        headers=operator,
        json={
            "url": "https://www.bilibili.com/video/BV18T3G6jEVM",
            "max_height": 720,
            "start_now": True,
            "rights_confirmed": False,
            "rights_note": "没有确认",
        },
    )
    assert rejected.status_code == 422
