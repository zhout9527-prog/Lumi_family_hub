from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from familyhub.bilibili import _download_error_code, normalize_bilibili_url

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


def test_bilibili_download_errors_are_presented_as_actionable_codes() -> None:
    assert _download_error_code("HTTP Error 412: Precondition Failed") == "bilibili_access_limited"
    assert _download_error_code("Unable to download webpage: WinError 10061 connection refused") == "bilibili_network_error"
    assert _download_error_code("This video is only available for registered users") == "bilibili_login_required"


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


def test_failed_bilibili_job_is_requeued_by_pasting_the_same_url(client: TestClient) -> None:
    from sqlalchemy import select

    from familyhub.models import DownloadJob

    operator = login(client, "operator")
    payload = {
        "url": "https://www.bilibili.com/video/BV18T3G6jEVM",
        "max_height": 1080,
        "start_now": True,
        "rights_confirmed": True,
        "rights_note": "家庭运维管理员确认拥有离线观看权利",
    }
    created = client.post("/api/v1/ops/downloads/bilibili", headers=operator, json=payload)
    assert created.status_code == 201, created.text
    job_id = created.json()["id"]

    with client.app.state.session_factory() as db:
        job = db.scalar(select(DownloadJob).where(DownloadJob.id == job_id))
        assert job is not None
        job.stage = "failed"
        job.progress = 37
        job.bytes_done = 1234
        job.expected_bytes = 9999
        job.error_code = "bilibili_network_error"
        db.commit()

    requeued = client.post("/api/v1/ops/downloads/bilibili", headers=operator, json=payload)
    assert requeued.status_code == 201, requeued.text
    assert requeued.json()["id"] == job_id
    assert requeued.json()["stage"] == "queued"
    assert requeued.json()["progress"] == 0
    assert requeued.json()["bytes_done"] == 0
    assert requeued.json()["expected_bytes"] is None
    assert requeued.json()["error_code"] is None


def test_resume_all_requeues_paused_download_jobs(client: TestClient) -> None:
    operator = login(client, "operator")
    created = client.post(
        "/api/v1/ops/downloads/bilibili",
        headers=operator,
        json={
            "url": "https://www.bilibili.com/video/BV18T3G6jEVM",
            "max_height": 720,
            "start_now": True,
            "rights_confirmed": True,
            "rights_note": "家庭运维管理员确认拥有离线观看权利",
        },
    )
    assert created.status_code == 201, created.text
    paused = client.post("/api/v1/ops/downloads/pause-all", headers=operator)
    assert paused.status_code == 200
    resumed = client.post("/api/v1/ops/downloads/resume-all", headers=operator)
    assert resumed.status_code == 200
    assert resumed.json()["paused"] is False
    assert resumed.json()["resumed_jobs"] >= 1
    jobs = client.get("/api/v1/ops/jobs", headers=operator).json()
    target = next(item for item in jobs if item["id"] == created.json()["id"])
    assert target["stage"] == "queued"
