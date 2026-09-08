from __future__ import annotations

from fastapi.testclient import TestClient

from .conftest import login


def test_health_login_logout_and_request_id(client: TestClient) -> None:
    health = client.get("/api/v1/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"
    assert health.headers["X-Request-ID"]
    assert health.headers["cache-control"] == "no-store, max-age=0"

    bad_login = client.post(
        "/api/v1/auth/login",
        json={"username": "child-demo", "password": "not-the-password", "device_name": "pytest"},
    )
    assert bad_login.status_code == 401
    headers = login(client, "child")
    assert client.get("/api/v1/me", headers=headers).json()["role"] == "child"
    assert client.post("/api/v1/auth/logout", headers=headers).status_code == 204
    assert client.get("/api/v1/me", headers=headers).status_code == 401


def test_role_switch_bootstrap_is_session_scoped_and_not_cacheable(client: TestClient) -> None:
    child = login(client, "child")
    child_bootstrap = client.get("/api/v1/bootstrap", headers=child)
    assert child_bootstrap.status_code == 200
    assert child_bootstrap.json()["user"]["role"] == "child"
    assert child_bootstrap.headers["cache-control"] == "no-store, max-age=0"

    assert client.post("/api/v1/auth/logout", headers=child).status_code == 204
    guardian = login(client, "guardian")
    guardian_bootstrap = client.get("/api/v1/bootstrap", headers=guardian)
    assert guardian_bootstrap.status_code == 200
    assert guardian_bootstrap.json()["user"]["role"] == "guardian"
    assert guardian_bootstrap.headers["cache-control"] == "no-store, max-age=0"


def test_child_catalog_hides_adult_content_and_ops(client: TestClient) -> None:
    child = login(client, "child")
    catalog = client.get("/api/v1/catalog/curated", headers=child)
    assert catalog.status_code == 200
    assert "成人内容隔离测试条目" not in {item["title"] for item in catalog.json()}
    search = client.get("/api/v1/catalog/curated", params={"q": "成人内容隔离"}, headers=child)
    assert search.json() == []
    assert client.get("/api/v1/catalog/adult-demo", headers=child).status_code == 404
    assert client.get("/api/v1/ops/jobs", headers=child).status_code == 403


def test_child_request_guardian_decision_and_launch(client: TestClient) -> None:
    child = login(client, "child")
    created = client.post(
        "/api/v1/content-requests",
        headers=child,
        json={"item_id": "bluey", "purpose": "watch", "reason": "想玩气球游戏"},
    )
    assert created.status_code == 201, created.text
    request_id = created.json()["id"]
    duplicate = client.post(
        "/api/v1/content-requests",
        headers=child,
        json={"item_id": "bluey", "purpose": "watch", "reason": "再申请一次"},
    )
    assert duplicate.status_code == 409
    assert client.post("/api/v1/catalog/bluey/launch", headers=child).status_code == 403

    guardian = login(client, "guardian")
    requests = client.get("/api/v1/guardian/content-requests", headers=guardian)
    assert requests.status_code == 200
    assert any(item["id"] == request_id for item in requests.json())
    decision = client.post(
        f"/api/v1/guardian/content-requests/{request_id}/decision",
        headers=guardian,
        json={"decision": "approved", "scope": "once"},
    )
    assert decision.status_code == 200
    launch = client.post("/api/v1/catalog/bluey/launch", headers=child, follow_redirects=False)
    assert launch.status_code == 307
    assert launch.headers["location"] == "https://www.bluey.tv/"


def test_registration_requires_operator_approval_and_respects_app_edition(client: TestClient) -> None:
    submitted = client.post(
        "/api/v1/auth/registrations",
        json={
            "username": "xiaodou",
            "password": "XiaoDou-2026",
            "display_name": "小豆",
            "requested_role": "child",
            "child_age": 6,
        },
    )
    assert submitted.status_code == 201, submitted.text
    registration = submitted.json()
    assert registration["status"] == "pending"
    assert registration["display_name"] == "小豆"

    pending_login = client.post(
        "/api/v1/auth/login",
        json={
            "username": "xiaodou",
            "password": "XiaoDou-2026",
            "device_name": "pytest-client",
            "app_edition": "client",
        },
    )
    assert pending_login.status_code == 401
    assert "等待" in pending_login.json()["detail"]

    child = login(client, "child")
    assert client.get("/api/v1/ops/account-registrations", headers=child).status_code == 403

    operator = login(client, "operator")
    operator_bootstrap = client.get("/api/v1/bootstrap", headers=operator)
    assert operator_bootstrap.status_code == 200
    assert any(item["id"] == registration["id"] for item in operator_bootstrap.json()["registrations"])

    approved = client.post(
        f"/api/v1/ops/account-registrations/{registration['id']}/decision",
        headers=operator,
        json={"decision": "approved", "review_note": "家庭账户已确认"},
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"

    client_login = client.post(
        "/api/v1/auth/login",
        json={
            "username": "xiaodou",
            "password": "XiaoDou-2026",
            "device_name": "pytest-client",
            "app_edition": "client",
        },
    )
    assert client_login.status_code == 200, client_login.text
    assert client_login.json()["user"]["display_name"] == "小豆"
    assert client_login.json()["user"]["role"] == "child"
    xiaodou_headers = {"Authorization": f"Bearer {client_login.json()['access_token']}"}

    wrong_server = client.post(
        "/api/v1/auth/login",
        json={
            "username": "xiaodou",
            "password": "XiaoDou-2026",
            "device_name": "pytest-server",
            "app_edition": "server",
        },
    )
    assert wrong_server.status_code == 403
    wrong_client = client.post(
        "/api/v1/auth/login",
        json={
            "username": "operator-demo",
            "password": "operator-demo",
            "device_name": "pytest-client",
            "app_edition": "client",
        },
    )
    assert wrong_client.status_code == 403

    managed_users = client.get("/api/v1/ops/users", headers=operator)
    xiaodou = next(item for item in managed_users.json() if item["username"] == "xiaodou")
    suspended = client.post(
        f"/api/v1/ops/users/{xiaodou['id']}/status",
        headers=operator,
        json={"status": "suspended"},
    )
    assert suspended.status_code == 200
    assert suspended.json()["status"] == "suspended"
    assert client.get("/api/v1/me", headers=xiaodou_headers).status_code == 401

    activated = client.post(
        f"/api/v1/ops/users/{xiaodou['id']}/status",
        headers=operator,
        json={"status": "active"},
    )
    assert activated.status_code == 200
    assert activated.json()["status"] == "active"
    relogin = client.post(
        "/api/v1/auth/login",
        json={
            "username": "xiaodou",
            "password": "XiaoDou-2026",
            "device_name": "pytest-client",
            "app_edition": "client",
        },
    )
    assert relogin.status_code == 200


def test_fresh_server_operator_setup_is_local_and_one_time(settings) -> None:
    settings.seed_demo = False
    from familyhub.main import create_app

    with TestClient(create_app(settings)) as fresh_client:
        health = fresh_client.get("/api/v1/health")
        assert health.status_code == 200
        assert health.json()["setup_required"] is True
        setup = fresh_client.post(
            "/api/v1/auth/operator-setup",
            json={
                "username": "home-admin",
                "password": "Strong-Home-Password",
                "display_name": "家庭管理员",
            },
        )
        assert setup.status_code == 201, setup.text
        assert setup.json()["role"] == "operator"
        assert fresh_client.get("/api/v1/health").json()["setup_required"] is False
        repeated = fresh_client.post(
            "/api/v1/auth/operator-setup",
            json={
                "username": "another-admin",
                "password": "Another-Strong-Password",
                "display_name": "另一个管理员",
            },
        )
        assert repeated.status_code == 409
        login_response = fresh_client.post(
            "/api/v1/auth/login",
            json={
                "username": "home-admin",
                "password": "Strong-Home-Password",
                "device_name": "pytest-server",
                "app_edition": "server",
            },
        )
        assert login_response.status_code == 200
