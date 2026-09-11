from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from familyhub.config import Settings
from familyhub.main import create_app


@pytest.fixture()
def settings(tmp_path: Path) -> Settings:
    return Settings(
        environment="test",
        runtime_root=tmp_path / "runtime",
        database_url=f"sqlite:///{(tmp_path / 'test.db').as_posix()}",
        seed_demo=True,
        password_iterations=1_000,
        defender_scan=False,
        inbox_stable_seconds=0,
        direct_download_enabled=True,
        max_asset_bytes=10 * 1024 * 1024,
        jellyfin_url="http://127.0.0.1:1",
        kavita_url="http://127.0.0.1:1",
        audiobookshelf_url="http://127.0.0.1:1",
        update_manifest_path=tmp_path / "updates" / "manifest.json",
    )


@pytest.fixture()
def client(settings: Settings) -> Iterator[TestClient]:
    with TestClient(create_app(settings)) as test_client:
        yield test_client


def login(client: TestClient, role: str) -> dict[str, str]:
    credentials = {
        "child": ("child-demo", "ChildDemo2026"),
        "guardian": ("guardian-demo", "GuardianDemo2026"),
        "operator": ("operator-demo", "OperatorDemo2026"),
    }
    username, password = credentials[role]
    response = client.post(
        "/api/v1/auth/login",
        json={
            "username": username,
            "password": password,
            "device_name": "pytest",
            "app_edition": "server" if role == "operator" else "client",
        },
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}
