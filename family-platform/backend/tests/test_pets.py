from __future__ import annotations

from fastapi.testclient import TestClient

from familyhub.pet_catalog import get_species

from .conftest import login


def test_child_can_adopt_one_pet_and_repeat_actions_are_idempotent(client: TestClient) -> None:
    child = login(client, "child")
    bootstrap = client.get("/api/v1/bootstrap", headers=child)
    assert bootstrap.status_code == 200, bootstrap.text
    payload = bootstrap.json()
    assert payload["pet"] is None
    assert payload["pet_can_adopt"] is True
    assert len(payload["pet_species"]) == 12
    assert all(species["asset_path"].endswith((".gltf", ".glb")) for species in payload["pet_species"])
    assert all(species["animation_hint"] for species in payload["pet_species"])
    assert all(species["id"] != "cat" for species in payload["pet_species"])

    adopted = client.post(
        "/api/v1/pets/adopt",
        headers=child,
        json={"species": "fox", "name": "小橘"},
    )
    assert adopted.status_code == 201, adopted.text
    pet = adopted.json()
    assert pet["species"] == "fox"
    assert pet["name"] == "小橘"
    assert pet["growth_stage"] == "初遇"

    duplicate = client.post(
        "/api/v1/pets/adopt",
        headers=child,
        json={"species": "wolf", "name": "第二只"},
    )
    assert duplicate.status_code == 409, duplicate.text

    action = client.post(
        f"/api/v1/pets/{pet['id']}/actions",
        headers={**child, "Idempotency-Key": "pet-test-1"},
        json={"action": "story"},
    )
    assert action.status_code == 200, action.text
    assert action.json()["pet"]["growth_points"] == 8
    repeated = client.post(
        f"/api/v1/pets/{pet['id']}/actions",
        headers={**child, "Idempotency-Key": "pet-test-1"},
        json={"action": "story"},
    )
    assert repeated.status_code == 200, repeated.text
    assert repeated.json()["idempotent"] is True
    assert repeated.json()["pet"]["growth_points"] == 8


def test_guardian_can_read_family_pet_but_operator_is_not_exposed_in_client_catalog(client: TestClient) -> None:
    child = login(client, "child")
    adopted = client.post(
        "/api/v1/pets/adopt",
        headers=child,
        json={"species": "deer", "name": "林林"},
    )
    assert adopted.status_code == 201, adopted.text
    guardian = login(client, "guardian")
    pets = client.get("/api/v1/guardian/pets", headers=guardian)
    assert pets.status_code == 200, pets.text
    assert pets.json()[0]["owner_name"] == "小满"
    assert client.get("/api/v1/pets/mine", headers=guardian).json()["pet"]["name"] == "林林"


def test_each_child_account_has_an_independent_single_pet(client: TestClient) -> None:
    first_child = login(client, "child")
    first_pet = client.post(
        "/api/v1/pets/adopt",
        headers=first_child,
        json={"species": "fox", "name": "小橘"},
    )
    assert first_pet.status_code == 201, first_pet.text

    registration = client.post(
        "/api/v1/auth/registrations",
        json={
            "username": "second-child",
            "password": "SecondChild2026",
            "display_name": "小芽",
            "requested_role": "child",
            "child_age": 6,
        },
    )
    assert registration.status_code == 201, registration.text
    operator = login(client, "operator")
    approved = client.post(
        f"/api/v1/ops/account-registrations/{registration.json()['id']}/decision",
        headers=operator,
        json={"decision": "approved", "review_note": "伙伴账户隔离测试"},
    )
    assert approved.status_code == 200, approved.text
    second_login = client.post(
        "/api/v1/auth/login",
        json={
            "username": "second-child",
            "password": "SecondChild2026",
            "device_name": "pytest-second-child",
            "app_edition": "client",
        },
    )
    assert second_login.status_code == 200, second_login.text
    second_child = {"Authorization": f"Bearer {second_login.json()['access_token']}"}
    second_bootstrap = client.get("/api/v1/pets/mine", headers=second_child)
    assert second_bootstrap.status_code == 200, second_bootstrap.text
    assert second_bootstrap.json()["pet"] is None
    assert second_bootstrap.json()["can_adopt"] is True
    assert len(second_bootstrap.json()["species"]) == 12

    second_pet = client.post(
        "/api/v1/pets/adopt",
        headers=second_child,
        json={"species": "shibainu", "name": "团团"},
    )
    assert second_pet.status_code == 201, second_pet.text
    assert client.get("/api/v1/pets/mine", headers=first_child).json()["pet"]["species"] == "fox"
    assert client.get("/api/v1/pets/mine", headers=second_child).json()["pet"]["species"] == "shibainu"
    assert client.post(
        "/api/v1/pets/adopt",
        headers=second_child,
        json={"species": "wolf", "name": "第三只"},
    ).status_code == 409


def test_legacy_species_resolve_to_real_3d_models() -> None:
    for legacy in ("boar", "buffalo", "goat", "llama", "rabbit", "bear", "chicken", "cat"):
        species = get_species(legacy)
        assert species is not None
        assert species["asset_path"].endswith((".gltf", ".glb"))


def test_removed_cat_is_not_adoptable_but_old_records_map_to_shibainu(client: TestClient) -> None:
    legacy = get_species("cat")
    assert legacy is not None
    assert legacy["id"] == "shibainu"

    child = login(client, "child")
    adopted = client.post(
        "/api/v1/pets/adopt",
        headers=child,
        json={"species": "cat", "name": "旧伙伴"},
    )
    assert adopted.status_code == 422, adopted.text
