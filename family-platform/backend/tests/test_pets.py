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
    assert len(payload["pet_species"]) == 13
    assert all(species["asset_path"].endswith((".gltf", ".glb")) for species in payload["pet_species"])
    assert all(species["animation_hint"] for species in payload["pet_species"])
    assert next(species for species in payload["pet_species"] if species["id"] == "cat")["source"] == "Kenney Cube Pets"

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
        json={"species": "cat", "name": "第二只"},
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
        json={"species": "cat", "name": "小猫"},
    )
    assert adopted.status_code == 201, adopted.text
    guardian = login(client, "guardian")
    pets = client.get("/api/v1/guardian/pets", headers=guardian)
    assert pets.status_code == 200, pets.text
    assert pets.json()[0]["owner_name"] == "小满"
    assert client.get("/api/v1/pets/mine", headers=guardian).json()["pet"]["name"] == "小猫"


def test_legacy_species_resolve_to_real_3d_models() -> None:
    for legacy in ("boar", "buffalo", "goat", "llama", "rabbit", "bear", "chicken"):
        species = get_species(legacy)
        assert species is not None
        assert species["asset_path"].endswith((".gltf", ".glb"))
