from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from .conftest import login


def test_candidate_submission_never_creates_download(client: TestClient) -> None:
    operator = login(client, "operator")
    before = client.get("/api/v1/ops/jobs", headers=operator).json()
    guardian = login(client, "guardian")
    created = client.post(
        "/api/v1/community-submissions",
        headers=guardian,
        json={
            "title": "老师整理的自然拼读卡",
            "provider": "quark",
            "original_url": "https://pan.quark.cn/s/example",
            "publisher_note": "先用官方客户端预览文件清单",
            "rights_note": "发布者说明仅供本班家庭学习使用",
        },
    )
    assert created.status_code == 201, created.text
    submission_id = created.json()["id"]
    after = client.get("/api/v1/ops/jobs", headers=operator).json()
    assert len(after) == len(before)
    confirmed = client.post(
        f"/api/v1/guardian/community-submissions/{submission_id}/confirm-transfer",
        headers=guardian,
        json={"confirmed": True, "provider": "quark"},
    )
    assert confirmed.status_code == 200
    assert confirmed.json()["filename_prefix"] == submission_id + "--"


def test_direct_source_gate_and_idempotent_job(client: TestClient) -> None:
    operator = login(client, "operator")
    source = client.post(
        "/api/v1/ops/sources",
        headers=operator,
        json={
            "id": "example-downloads",
            "name": "Example Licensed Downloads",
            "kind": "direct_http",
            "owner": "Example Publisher",
            "base_url": "https://downloads.example.org/family/",
            "terms_url": "https://downloads.example.org/terms",
            "license_note": "Files marked for personal family download by the publisher.",
            "allow_download": True,
            "rate_limit": "1 concurrent",
        },
    )
    assert source.status_code == 201, source.text
    assert source.json()["allow_download"] is False
    payload = {
        "source_id": "example-downloads",
        "external_id": "lesson-001",
        "title": "Licensed lesson",
        "content_kind": "video",
        "url": "https://downloads.example.org/family/lesson-001.mp4",
        "rights_note": "Publisher explicitly permits personal family downloads.",
        "proof_url": "https://downloads.example.org/terms",
    }
    assert client.post("/api/v1/ops/downloads/direct", headers=operator, json=payload).status_code == 409
    validated = client.post(
        "/api/v1/ops/sources/example-downloads/validate",
        headers=operator,
        json={
            "terms_confirmed": True,
            "rights_confirmed": True,
            "review_expire_at": (datetime.now(UTC) + timedelta(days=14)).isoformat(),
        },
    )
    assert validated.status_code == 200, validated.text
    headers = {**operator, "Idempotency-Key": "lesson-001-en-720p"}
    first = client.post("/api/v1/ops/downloads/direct", headers=headers, json=payload)
    second = client.post("/api/v1/ops/downloads/direct", headers=headers, json=payload)
    assert first.status_code == 201, first.text
    assert second.status_code == 201
    assert first.json()["id"] == second.json()["id"]
    assert "url" not in first.json()

    audit = client.get("/api/v1/ops/audit", headers=operator).json()
    queued = next(event for event in audit if event["action"] == "download.queued")
    assert "url" not in queued["metadata"]


def test_official_stream_cannot_be_queued(client: TestClient) -> None:
    guardian = login(client, "guardian")
    response = client.post("/api/v1/guardian/watchlist/bluey/queue", headers=guardian)
    assert response.status_code == 409

