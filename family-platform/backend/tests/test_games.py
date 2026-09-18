from __future__ import annotations

from fastapi.testclient import TestClient

from .conftest import login


def test_game_progress_is_account_scoped_and_uses_newest_client_copy(client: TestClient) -> None:
    child = login(client, "child")
    guardian = login(client, "guardian")
    saved = client.put(
        "/api/v1/games/block-defense/profile",
        headers=child,
        json={
            "progress": {"unlockedLevel": 8, "completedLevels": [1, 2, 3, 4, 5, 6, 7]},
            "score": 1460,
            "client_updated_at": "2026-09-18T08:00:00Z",
        },
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["progress"]["unlockedLevel"] == 8
    assert saved.json()["best_score"] == 1460

    stale = client.put(
        "/api/v1/games/block-defense/profile",
        headers=child,
        json={
            "progress": {"unlockedLevel": 2},
            "score": 1200,
            "client_updated_at": "2026-09-18T07:00:00Z",
        },
    )
    assert stale.status_code == 200, stale.text
    assert stale.json()["progress"]["unlockedLevel"] == 8
    assert client.get("/api/v1/games/block-defense/profile", headers=guardian).json()["progress"] == {}


def test_game_leaderboard_keeps_high_score_and_record_date(client: TestClient) -> None:
    child = login(client, "child")
    guardian = login(client, "guardian")
    first = client.post("/api/v1/games/tetris/scores", headers=child, json={"score": 900})
    assert first.status_code == 200, first.text
    first_date = first.json()["best_score_at"]
    lower = client.post("/api/v1/games/tetris/scores", headers=child, json={"score": 500})
    assert lower.json()["best_score"] == 900
    assert lower.json()["best_score_at"] == first_date
    assert client.post("/api/v1/games/tetris/scores", headers=guardian, json={"score": 1200}).status_code == 200

    board = client.get("/api/v1/games/tetris/leaderboard", headers=child)
    assert board.status_code == 200, board.text
    assert [(item["display_name"], item["score"]) for item in board.json()] == [
        ("林妈妈", 1200),
        ("小满", 900),
    ]
    assert all(item["achieved_at"] for item in board.json())


def test_game_endpoints_reject_unknown_games_and_require_login(client: TestClient) -> None:
    child = login(client, "child")
    assert client.get("/api/v1/games/unknown/profile", headers=child).status_code == 404
    assert client.get("/api/v1/games/tetris/leaderboard").status_code == 401
