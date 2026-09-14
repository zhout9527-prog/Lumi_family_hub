from __future__ import annotations

from typing import Any


# Quaternius 官方包明确提供 12 种低多边形动物和 CC0 授权。
# 这里先把目录和资源槽位固定下来，后续可在 public/pets 下逐只替换为 glTF/GLB。
QUATERNIUS_SOURCE_URL = "https://quaternius.com/packs/ultimateanimatedanimals.html"
QUATERNIUS_LICENSE_URL = "https://creativecommons.org/publicdomain/zero/1.0/"


PET_SPECIES: tuple[dict[str, Any], ...] = (
    {
        "id": "deer",
        "name": "小鹿",
        "english_name": "Deer",
        "source": "Quaternius Ultimate Animated Animal Pack",
        "source_url": QUATERNIUS_SOURCE_URL,
        "license_url": QUATERNIUS_LICENSE_URL,
        "accent": "#c98d5e",
        "emoji": "🦌",
        "temperament": "温柔，喜欢在林间散步",
        "asset_path": "/pets/quaternius/deer.glb",
    },
    {
        "id": "stag",
        "name": "大角鹿",
        "english_name": "Stag",
        "source": "Quaternius Ultimate Animated Animal Pack",
        "source_url": QUATERNIUS_SOURCE_URL,
        "license_url": QUATERNIUS_LICENSE_URL,
        "accent": "#a8744d",
        "emoji": "🦌",
        "temperament": "稳重，喜欢听故事",
        "asset_path": "/pets/quaternius/stag.glb",
    },
    {
        "id": "fox",
        "name": "小狐狸",
        "english_name": "Fox",
        "source": "Quaternius Ultimate Animated Animal Pack",
        "source_url": QUATERNIUS_SOURCE_URL,
        "license_url": QUATERNIUS_LICENSE_URL,
        "accent": "#e07848",
        "emoji": "🦊",
        "temperament": "机灵，喜欢发现新东西",
        "asset_path": "/pets/quaternius/fox.glb",
    },
    {
        "id": "wolf",
        "name": "小狼",
        "english_name": "Wolf",
        "source": "Quaternius Ultimate Animated Animal Pack",
        "source_url": QUATERNIUS_SOURCE_URL,
        "license_url": QUATERNIUS_LICENSE_URL,
        "accent": "#8294a6",
        "emoji": "🐺",
        "temperament": "勇敢，愿意陪你探索",
        "asset_path": "/pets/quaternius/wolf.glb",
    },
    {
        "id": "boar",
        "name": "小野猪",
        "english_name": "Boar",
        "source": "Quaternius Ultimate Animated Animal Pack",
        "source_url": QUATERNIUS_SOURCE_URL,
        "license_url": QUATERNIUS_LICENSE_URL,
        "accent": "#967467",
        "emoji": "🐗",
        "temperament": "踏实，最爱户外任务",
        "asset_path": "/pets/quaternius/boar.glb",
    },
    {
        "id": "buffalo",
        "name": "小野牛",
        "english_name": "Buffalo",
        "source": "Quaternius Ultimate Animated Animal Pack",
        "source_url": QUATERNIUS_SOURCE_URL,
        "license_url": QUATERNIUS_LICENSE_URL,
        "accent": "#6f756f",
        "emoji": "🐃",
        "temperament": "可靠，喜欢慢慢成长",
        "asset_path": "/pets/quaternius/buffalo.glb",
    },
    {
        "id": "horse",
        "name": "小马",
        "english_name": "Horse",
        "source": "Quaternius Ultimate Animated Animal Pack",
        "source_url": QUATERNIUS_SOURCE_URL,
        "license_url": QUATERNIUS_LICENSE_URL,
        "accent": "#b47b5b",
        "emoji": "🐴",
        "temperament": "开朗，喜欢一起完成挑战",
        "asset_path": "/pets/quaternius/horse.glb",
    },
    {
        "id": "goat",
        "name": "小山羊",
        "english_name": "Goat",
        "source": "Quaternius Ultimate Animated Animal Pack",
        "source_url": QUATERNIUS_SOURCE_URL,
        "license_url": QUATERNIUS_LICENSE_URL,
        "accent": "#d2b78f",
        "emoji": "🐐",
        "temperament": "活泼，喜欢动脑筋",
        "asset_path": "/pets/quaternius/goat.glb",
    },
    {
        "id": "llama",
        "name": "羊驼",
        "english_name": "Llama",
        "source": "Quaternius Ultimate Animated Animal Pack",
        "source_url": QUATERNIUS_SOURCE_URL,
        "license_url": QUATERNIUS_LICENSE_URL,
        "accent": "#d3a77d",
        "emoji": "🦙",
        "temperament": "从容，喜欢听你说话",
        "asset_path": "/pets/quaternius/llama.glb",
    },
    {
        "id": "rabbit",
        "name": "小兔",
        "english_name": "Rabbit",
        "source": "Quaternius Ultimate Animated Animal Pack",
        "source_url": QUATERNIUS_SOURCE_URL,
        "license_url": QUATERNIUS_LICENSE_URL,
        "accent": "#d59ba5",
        "emoji": "🐇",
        "temperament": "敏捷，喜欢收集小成就",
        "asset_path": "/pets/quaternius/rabbit.glb",
    },
    {
        "id": "bear",
        "name": "小熊",
        "english_name": "Bear",
        "source": "Quaternius Ultimate Animated Animal Pack",
        "source_url": QUATERNIUS_SOURCE_URL,
        "license_url": QUATERNIUS_LICENSE_URL,
        "accent": "#936f58",
        "emoji": "🐻",
        "temperament": "温暖，喜欢睡前故事",
        "asset_path": "/pets/quaternius/bear.glb",
    },
    {
        "id": "chicken",
        "name": "小鸡",
        "english_name": "Chicken",
        "source": "Quaternius Ultimate Animated Animal Pack",
        "source_url": QUATERNIUS_SOURCE_URL,
        "license_url": QUATERNIUS_LICENSE_URL,
        "accent": "#e3b84f",
        "emoji": "🐥",
        "temperament": "好奇，喜欢每天打招呼",
        "asset_path": "/pets/quaternius/chicken.glb",
    },
    {
        "id": "cat",
        "name": "小猫",
        "english_name": "Cat",
        "source": "Lumi extra companion",
        "source_url": QUATERNIUS_SOURCE_URL,
        "license_url": QUATERNIUS_LICENSE_URL,
        "accent": "#8b82bd",
        "emoji": "🐱",
        "temperament": "安静，喜欢陪伴和聊天",
        "asset_path": "/pets/lumi/cat.glb",
    },
)


PET_ACTIONS: dict[str, dict[str, Any]] = {
    "feed": {"label": "喂食", "points": 4, "message": "吃饱啦，今天也有精神！"},
    "play": {"label": "玩耍", "points": 6, "message": "一起玩真开心，发现力提升了！"},
    "groom": {"label": "整理", "points": 4, "message": "变得干干净净，心情也更好了。"},
    "story": {"label": "讲故事", "points": 8, "message": "故事听完啦，伙伴又学会了一点新东西。"},
    "talk": {"label": "聊天", "points": 5, "message": "我听见你的声音了，谢谢你来陪我。"},
}


def get_species(species_id: str) -> dict[str, Any] | None:
    return next((item for item in PET_SPECIES if item["id"] == species_id), None)


def species_payload() -> list[dict[str, Any]]:
    return [dict(item) for item in PET_SPECIES]


def growth_stage(points: int) -> str:
    if points >= 280:
        return "故事家"
    if points >= 160:
        return "探索者"
    if points >= 80:
        return "可靠伙伴"
    if points >= 30:
        return "小小成长"
    return "初遇"
