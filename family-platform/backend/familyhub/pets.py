from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .models import Pet, PetEvent, User, utcnow
from .pet_catalog import PET_ACTIONS, get_species, growth_stage, species_payload
from .security import SessionPrincipal


class PetServiceError(Exception):
    """可直接转换为 API 错误的伙伴业务异常。"""

    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def _clamp(value: int) -> int:
    return max(0, min(100, int(value)))


def _owner(db: Session, pet: Pet) -> User | None:
    return db.get(User, pet.owner_user_id)


def pet_to_dict(db: Session, pet: Pet) -> dict[str, Any]:
    owner = _owner(db, pet)
    species = get_species(pet.species) or {
        "id": pet.species,
        "name": "伙伴",
        "english_name": "Companion",
        "source": "Lumi",
        "source_url": None,
        "license_url": None,
        "accent": "#6a91b9",
        "emoji": "🐾",
        "temperament": "喜欢陪伴你",
        "asset_path": None,
    }
    return {
        "id": pet.id,
        "owner_user_id": pet.owner_user_id,
        "owner_name": owner.display_name if owner else "家庭成员",
        "name": pet.name,
        "species": pet.species,
        "species_name": species["name"],
        "species_english_name": species["english_name"],
        "personality": pet.personality,
        "growth_stage": pet.growth_stage,
        "growth_points": pet.growth_points,
        "mood": pet.mood,
        "energy": pet.energy,
        "curiosity": pet.curiosity,
        "cleanliness": pet.cleanliness,
        "revision": pet.revision,
        "last_interaction_at": pet.last_interaction_at,
        "created_at": pet.created_at,
        "updated_at": pet.updated_at,
    }


def _pets_for_principal(db: Session, principal: SessionPrincipal) -> list[Pet]:
    query = select(Pet).where(Pet.household_id == principal.household_id)
    if principal.role == "child":
        query = query.where(Pet.owner_user_id == principal.id)
    return list(db.scalars(query.order_by(Pet.created_at, Pet.id)).all())


def bootstrap_payload(db: Session, principal: SessionPrincipal) -> dict[str, Any]:
    pets = _pets_for_principal(db, principal)
    # 家长可以看到家庭内所有儿童伙伴；孩子只会拿到自己的那一只。
    return {
        "pet": pet_to_dict(db, pets[0]) if pets else None,
        "pets": [pet_to_dict(db, pet) for pet in pets],
        "species": species_payload(),
        "can_adopt": principal.role == "child" and not pets,
    }


def adopt(db: Session, principal: SessionPrincipal, *, species_id: str, name: str) -> Pet:
    if principal.role != "child":
        raise PetServiceError(403, "只有儿童账号可以领养自己的伙伴")
    species = get_species(species_id)
    if species is None:
        raise PetServiceError(422, "请选择有效的伙伴形象")
    cleaned_name = " ".join(name.strip().split())
    if not 1 <= len(cleaned_name) <= 24:
        raise PetServiceError(422, "伙伴名字需要 1 到 24 个字符")
    if any(ord(character) < 32 for character in cleaned_name):
        raise PetServiceError(422, "伙伴名字不能包含控制字符")
    existing = db.scalar(select(Pet).where(Pet.owner_user_id == principal.id))
    if existing is not None:
        raise PetServiceError(409, "每个儿童账号只能养一只伙伴")
    now = utcnow()
    pet = Pet(
        household_id=principal.household_id,
        owner_user_id=principal.id,
        name=cleaned_name,
        species=species_id,
        personality="curious",
        growth_stage="初遇",
        growth_points=0,
        mood=72,
        energy=78,
        curiosity=50,
        cleanliness=82,
        revision=1,
        created_at=now,
        updated_at=now,
    )
    db.add(pet)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise PetServiceError(409, "每个儿童账号只能养一只伙伴") from exc
    return pet


def _get_action_event(db: Session, pet_id: str, actor_id: str, key: str) -> PetEvent | None:
    return db.scalar(
        select(PetEvent).where(
            PetEvent.pet_id == pet_id,
            PetEvent.actor_user_id == actor_id,
            PetEvent.idempotency_key == key,
        )
    )


def _can_interact(principal: SessionPrincipal, pet: Pet) -> bool:
    if principal.household_id != pet.household_id:
        return False
    if principal.role == "child":
        return principal.id == pet.owner_user_id
    return principal.role in {"guardian", "operator"}


def interact(
    db: Session,
    principal: SessionPrincipal,
    pet: Pet,
    *,
    action: str,
    idempotency_key: str | None = None,
    note: str = "",
) -> tuple[Pet, PetEvent, bool]:
    if not _can_interact(principal, pet):
        raise PetServiceError(403, "没有权限照顾这个伙伴")
    config = PET_ACTIONS.get(action)
    if config is None:
        raise PetServiceError(422, "暂不支持这个互动动作")
    key = (idempotency_key or "").strip()[:128] or uuid4().hex
    existing = _get_action_event(db, pet.id, principal.id, key)
    if existing is not None:
        return pet, existing, True

    # 每只伙伴每天最多记录 30 次互动，避免误触或脚本刷成长值。
    day_start = datetime.combine(utcnow().date(), datetime.min.time())
    daily_count = db.scalar(
        select(func.count(PetEvent.id)).where(
            PetEvent.pet_id == pet.id,
            PetEvent.created_at >= day_start,
        )
    ) or 0
    if daily_count >= 30:
        raise PetServiceError(429, "今天的互动次数已用完，明天再来陪伴吧")

    points = int(config["points"])
    changes = {
        "feed": (0, 5, 0, -2),
        "play": (7, -8, 6, 0),
        "groom": (3, 0, 0, 12),
        "story": (4, 0, 8, 0),
        "talk": (6, 0, 3, 0),
    }
    mood, energy, curiosity, cleanliness = changes[action]
    pet.mood = _clamp(pet.mood + mood)
    pet.energy = _clamp(pet.energy + energy)
    pet.curiosity = _clamp(pet.curiosity + curiosity)
    pet.cleanliness = _clamp(pet.cleanliness + cleanliness)
    pet.growth_points += points
    pet.growth_stage = growth_stage(pet.growth_points)
    pet.revision += 1
    now = utcnow()
    pet.last_interaction_at = now
    pet.updated_at = now
    event = PetEvent(
        pet_id=pet.id,
        household_id=pet.household_id,
        actor_user_id=principal.id,
        action=action,
        idempotency_key=key,
        points=points,
        metadata_json={"has_note": bool(note.strip())},
        created_at=now,
    )
    db.add(event)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        # 并发重复请求时返回已提交的幂等结果，而不是重复增加成长值。
        duplicate = _get_action_event(db, pet.id, principal.id, key)
        if duplicate is not None:
            refreshed = db.get(Pet, pet.id)
            if refreshed is not None:
                return refreshed, duplicate, True
        raise PetServiceError(409, "互动请求发生冲突，请重试") from exc
    return pet, event, False


def action_message(action: str) -> str:
    return str(PET_ACTIONS[action]["message"])
