from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from familyhub.config import Settings


def write_manifest(settings: Settings, payload: dict[str, object]) -> None:
    path = Path(settings.update_manifest_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")


def test_public_update_manifest_is_available_before_login(client: TestClient, settings: Settings) -> None:
    write_manifest(
        settings,
        {
            "app_id": "cn.lumi.familyhub",
            "channel": "stable",
            "version": "0.2.0",
            "min_supported_version": "0.1.0",
            "published_at": "2026-10-01T02:00:00Z",
            "notes": "稳定性更新",
            "platforms": {
                "android-arm64-apk": {
                    "url": "http://192.168.1.20:8080/lumi-0.2.0.apk",
                    "sha256": "a" * 64,
                    "install_mode": "manual",
                }
            },
            "tauri_platforms": {
                "windows-x86_64": {
                    "url": "https://updates.example.test/lumi-0.2.0-setup.exe",
                    "signature": "signed-payload",
                    "install_mode": "tauri",
                }
            },
        },
    )

    response = client.get("/api/v1/updates/manifest")

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store, max-age=0"
    assert response.headers["pragma"] == "no-cache"
    body = response.json()
    assert body["version"] == "0.2.0"
    assert body["platforms"]["android-arm64-apk"]["sha256"] == "a" * 64
    assert body["tauri_platforms"]["windows-x86_64"]["signature"] == "signed-payload"


def test_tauri_update_returns_signed_payload_or_no_content(client: TestClient, settings: Settings) -> None:
    write_manifest(
        settings,
        {
            "version": "0.2.0",
            "notes": "桌面更新",
            "published_at": "2026-10-01T02:00:00Z",
            "tauri_platforms": {
                "windows-x86_64": {
                    "url": "https://updates.example.test/lumi-0.2.0-setup.exe",
                    "signature": "signed-payload",
                    "sha256": "b" * 64,
                    "install_mode": "tauri",
                }
            },
        },
    )

    update = client.get("/api/v1/updates/tauri", params={"target": "windows-x86_64", "arch": "x86_64", "current_version": "0.1.0"})
    current = client.get("/api/v1/updates/tauri", params={"target": "windows-x86_64", "arch": "x86_64", "current_version": "0.2.0"})

    assert update.status_code == 200
    assert update.headers["cache-control"] == "no-store, max-age=0"
    assert update.json()["version"] == "0.2.0"
    assert update.json()["platforms"] == {
        "windows-x86_64": {
            "url": "https://updates.example.test/lumi-0.2.0-setup.exe",
            "signature": "signed-payload",
        }
    }
    assert current.status_code == 204
    assert current.headers["cache-control"] == "no-store, max-age=0"
    assert current.headers["pragma"] == "no-cache"


def test_update_manifest_rejects_untrusted_http_artifact(client: TestClient, settings: Settings) -> None:
    write_manifest(
        settings,
        {
            "version": "0.2.0",
            "platforms": {
                "android-arm64-apk": {"url": "http://example.test/malicious.apk"},
            },
        },
    )

    response = client.get("/api/v1/updates/manifest")

    assert response.status_code == 200
    assert response.json()["platforms"] == {}
