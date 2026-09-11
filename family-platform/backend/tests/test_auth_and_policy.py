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


def test_operator_sessions_stay_independent_across_devices(client: TestClient) -> None:
    def server_login(device_name: str) -> dict[str, str]:
        response = client.post(
            "/api/v1/auth/login",
            json={
                "username": "operator-demo",
                "password": "OperatorDemo2026",
                "device_name": device_name,
                "app_edition": "server",
            },
        )
        assert response.status_code == 200, response.text
        return {"Authorization": f"Bearer {response.json()['access_token']}"}

    living_room = server_login("客厅管理端")
    study = server_login("书房管理端")
    assert client.get("/api/v1/me", headers=living_room).status_code == 200
    assert client.get("/api/v1/me", headers=study).status_code == 200

    assert client.post("/api/v1/auth/logout", headers=living_room).status_code == 204
    assert client.get("/api/v1/me", headers=living_room).status_code == 401
    assert client.get("/api/v1/me", headers=study).status_code == 200


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
    launch = client.post("/api/v1/catalog/bluey/launch", headers=child)
    assert launch.status_code == 200
    assert launch.json() == {
        "mode": "external_link",
        "url": "https://www.bluey.tv/",
        "service": None,
        "expires_at": None,
    }


def test_registration_requires_operator_approval_and_respects_app_edition(client: TestClient) -> None:
    submitted = client.post(
        "/api/v1/auth/registrations",
        json={
            "username": "xiaodou",
            "password": "XiaoDou2026",
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
            "password": "XiaoDou2026",
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
            "password": "XiaoDou2026",
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
            "password": "XiaoDou2026",
            "device_name": "pytest-server",
            "app_edition": "server",
        },
    )
    assert wrong_server.status_code == 403
    operator_client = client.post(
        "/api/v1/auth/login",
        json={
            "username": "operator-demo",
            "password": "OperatorDemo2026",
            "device_name": "pytest-client",
            "app_edition": "client",
        },
    )
    assert operator_client.status_code == 200
    assert operator_client.json()["user"]["role"] == "guardian"
    operator_guardian_headers = {"Authorization": f"Bearer {operator_client.json()['access_token']}"}
    assert client.get("/api/v1/guardian/content-requests", headers=operator_guardian_headers).status_code == 200
    assert client.get("/api/v1/ops/users", headers=operator_guardian_headers).status_code == 403

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
            "password": "XiaoDou2026",
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
                "password": "StrongHomePassword2026",
                "display_name": "家庭管理员",
                "recovery_question": "我的结婚纪念日是什么时候？",
                "recovery_answer": "2020-05-20",
            },
        )
        assert setup.status_code == 201, setup.text
        assert setup.json()["role"] == "operator"
        assert fresh_client.get("/api/v1/health").json()["setup_required"] is False
        repeated = fresh_client.post(
            "/api/v1/auth/operator-setup",
            json={
                "username": "another-admin",
                "password": "AnotherStrongPassword2026",
                "display_name": "另一个管理员",
                "recovery_question": "我最喜欢的城市是哪里？",
                "recovery_answer": "杭州",
            },
        )
        assert repeated.status_code == 409
        login_response = fresh_client.post(
            "/api/v1/auth/login",
            json={
                "username": "home-admin",
                "password": "StrongHomePassword2026",
                "device_name": "pytest-server",
                "app_edition": "server",
            },
        )
        assert login_response.status_code == 200


def test_local_operator_registration_and_password_recovery(client: TestClient) -> None:
    created = client.post(
        "/api/v1/auth/operators",
        json={
            "username": "second-admin",
            "password": "SecondAdminPassword2026",
            "display_name": "备用管理员",
            "recovery_question": "我的结婚纪念日是什么时候？",
            "recovery_answer": "2020年05月20日",
        },
    )
    assert created.status_code == 201, created.text

    question = client.post(
        "/api/v1/auth/operator-recovery/question",
        json={"username": "second-admin"},
    )
    assert question.status_code == 200
    assert question.json() == {
        "username": "second-admin",
        "question": "我的结婚纪念日是什么时候？",
        "legacy_setup_required": False,
    }
    assert "2020" not in question.text

    wrong = client.post(
        "/api/v1/auth/operator-recovery/reset",
        json={
            "username": "second-admin",
            "recovery_answer": "错误答案",
            "new_password": "ChangedAdminPassword2026",
        },
    )
    assert wrong.status_code == 401

    recovered = client.post(
        "/api/v1/auth/operator-recovery/reset",
        json={
            "username": "second-admin",
            "recovery_answer": "2020/05/20",
            "new_password": "ChangedAdminPassword2026",
        },
    )
    assert recovered.status_code == 200, recovered.text
    assert "已重置" in recovered.json()["message"]

    old_login = client.post(
        "/api/v1/auth/login",
        json={
            "username": "second-admin",
            "password": "SecondAdminPassword2026",
            "device_name": "pytest-server",
            "app_edition": "server",
        },
    )
    assert old_login.status_code == 401
    new_login = client.post(
        "/api/v1/auth/login",
        json={
            "username": "second-admin",
            "password": "ChangedAdminPassword2026",
            "device_name": "pytest-server",
            "app_edition": "server",
        },
    )
    assert new_login.status_code == 200


def test_legacy_operator_can_initialize_recovery_and_legacy_hash_upgrades(client: TestClient) -> None:
    from sqlalchemy import select

    from familyhub.models import OperatorRecovery, User
    from familyhub.security import hash_password

    with client.app.state.session_factory() as db:
        operator = db.scalar(select(User).where(User.username == "operator-demo"))
        assert operator is not None
        legacy_salt, versioned_hash = hash_password("OperatorDemo2026", 200_000)
        operator.password_salt = legacy_salt
        operator.password_hash = versioned_hash.rsplit("$", 1)[-1]
        db.commit()

    legacy_login = client.post(
        "/api/v1/auth/login",
        json={
            "username": "operator-demo",
            "password": "OperatorDemo2026",
            "device_name": "pytest-server",
            "app_edition": "server",
        },
    )
    assert legacy_login.status_code == 200, legacy_login.text
    with client.app.state.session_factory() as db:
        operator = db.scalar(select(User).where(User.username == "operator-demo"))
        assert operator is not None
        assert operator.password_hash.startswith("pbkdf2_sha256$1000$")
        assert db.get(OperatorRecovery, operator.id) is None

    question = client.post(
        "/api/v1/auth/operator-recovery/question",
        json={"username": "operator-demo"},
    )
    assert question.status_code == 200
    assert question.json()["legacy_setup_required"] is True
    assert question.json()["question"] is None

    reset = client.post(
        "/api/v1/auth/operator-recovery/reset",
        json={
            "username": "operator-demo",
            "recovery_question": "我小时候居住的城市是哪里？",
            "recovery_answer": "南京",
            "new_password": "RecoveredOperatorPassword2026",
        },
    )
    assert reset.status_code == 200, reset.text
    relogin = client.post(
        "/api/v1/auth/login",
        json={
            "username": "operator-demo",
            "password": "RecoveredOperatorPassword2026",
            "device_name": "pytest-server",
            "app_edition": "server",
        },
    )
    assert relogin.status_code == 200


def test_bilibili_account_management_requires_adult_reverification(client: TestClient) -> None:
    operator = login(client, "operator")
    guardian = login(client, "guardian")
    child = login(client, "child")

    status_response = client.get("/api/v1/ops/bilibili-account", headers=operator)
    assert status_response.status_code == 200
    assert status_response.json()["connected"] is False

    verified = client.post(
        "/api/v1/ops/bilibili-account/verify",
        headers=operator,
        json={"username": "guardian-demo", "password": "GuardianDemo2026"},
    )
    assert verified.status_code == 200, verified.text

    child_account = client.post(
        "/api/v1/ops/bilibili-account/verify",
        headers=operator,
        json={"username": "child-demo", "password": "ChildDemo2026"},
    )
    assert child_account.status_code == 401

    wrong_password = client.post(
        "/api/v1/ops/bilibili-account/verify",
        headers=operator,
        json={"username": "guardian-demo", "password": "WrongPassword2026"},
    )
    assert wrong_password.status_code == 401

    invalid_characters = client.post(
        "/api/v1/ops/bilibili-account/verify",
        headers=operator,
        json={"username": "guardian-demo", "password": "Guardian!2026"},
    )
    assert invalid_characters.status_code == 422

    assert client.get("/api/v1/ops/bilibili-account", headers=guardian).status_code == 403
    assert client.get("/api/v1/ops/bilibili-account", headers=child).status_code == 403


def test_bilibili_account_has_explicit_switch_endpoint(client: TestClient, monkeypatch) -> None:
    from familyhub import main as familyhub_main

    accounts = iter(
        [
            {"account_name": "家庭账号甲", "account_id": "1001", "vip": False},
            {"account_name": "家庭账号乙", "account_id": "2002", "vip": True},
        ]
    )
    calls: list[str] = []

    def fake_import(_db, _settings, *, browser: str, updated_by: str):
        account = next(accounts)
        calls.append(browser)
        return {
            "connected": True,
            **account,
            "browser": browser,
            "updated_at": "2026-09-11T12:00:00Z",
        }

    monkeypatch.setattr(familyhub_main, "import_bilibili_cookies_from_browser", fake_import)
    operator = login(client, "operator")
    credentials = {"username": "guardian-demo", "password": "GuardianDemo2026", "browser": "edge"}

    connected = client.post("/api/v1/ops/bilibili-account/import", headers=operator, json=credentials)
    assert connected.status_code == 200, connected.text
    assert connected.json()["account_id"] == "1001"

    switched = client.post(
        "/api/v1/ops/bilibili-account/switch",
        headers=operator,
        json={**credentials, "browser": "chrome"},
    )
    assert switched.status_code == 200, switched.text
    assert switched.json()["account_name"] == "家庭账号乙"
    assert switched.json()["account_id"] == "2002"
    assert switched.json()["vip"] is True
    assert calls == ["edge", "chrome"]

    rejected = client.post(
        "/api/v1/ops/bilibili-account/switch",
        headers=operator,
        json={"username": "child-demo", "password": "ChildDemo2026", "browser": "edge"},
    )
    assert rejected.status_code == 401


def test_failed_bilibili_switch_keeps_previous_cookie_file(client: TestClient, monkeypatch) -> None:
    import sys
    from http.cookiejar import Cookie
    from types import ModuleType

    import pytest
    from sqlalchemy import select

    from familyhub import bilibili_account
    from familyhub.models import User

    cookie = Cookie(
        version=0,
        name="SESSDATA",
        value="new-browser-session",
        port=None,
        port_specified=False,
        domain=".bilibili.com",
        domain_specified=True,
        domain_initial_dot=True,
        path="/",
        path_specified=True,
        secure=True,
        expires=None,
        discard=False,
        comment=None,
        comment_url=None,
        rest={},
        rfc2109=False,
    )

    class FakeYoutubeDL:
        def __init__(self, _options):
            self.cookiejar = [cookie]

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

    package = ModuleType("yt_dlp")
    package.YoutubeDL = FakeYoutubeDL
    monkeypatch.setitem(sys.modules, "yt_dlp", package)
    destination = bilibili_account.bilibili_cookie_path(client.app.state.settings)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(b"previous-account-cookie")

    def invalid_account(_path):
        raise bilibili_account.BilibiliAccountError("新账号验证失败")

    monkeypatch.setattr(bilibili_account, "_query_account", invalid_account)
    with client.app.state.session_factory() as db:
        operator = db.scalar(select(User).where(User.username == "operator-demo"))
        assert operator is not None
        with pytest.raises(bilibili_account.BilibiliAccountError, match="新账号验证失败"):
            bilibili_account.import_bilibili_cookies_from_browser(
                db,
                client.app.state.settings,
                browser="edge",
                updated_by=operator.id,
            )

    assert destination.read_bytes() == b"previous-account-cookie"
    assert list(destination.parent.glob(f".{destination.name}.*.tmp")) == []
