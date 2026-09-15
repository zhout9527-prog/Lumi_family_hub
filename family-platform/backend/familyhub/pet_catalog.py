from __future__ import annotations

from typing import Any


# 模型由官方 CC0 资源组成，文件随客户端离线打包，不依赖外网才能显示。
QUATERNIUS_SOURCE_URL = "https://quaternius.com/packs/ultimateanimatedanimals.html"
QUATERNIUS_LICENSE_URL = "https://creativecommons.org/publicdomain/zero/1.0/"
POLY_PIZZA_CAT_URL = "https://poly.pizza/m/DJ9rpAhrh3"
CC_BY_3_LICENSE_URL = "https://creativecommons.org/licenses/by/3.0/"


def _quaternius(
    species_id: str,
    name: str,
    english_name: str,
    emoji: str,
    accent: str,
    temperament: str,
    file_name: str,
) -> dict[str, Any]:
    return {
        "id": species_id,
        "name": name,
        "english_name": english_name,
        "source": "Quaternius Ultimate Animated Animals Pack",
        "source_url": QUATERNIUS_SOURCE_URL,
        "license_url": QUATERNIUS_LICENSE_URL,
        "accent": accent,
        "emoji": emoji,
        "temperament": temperament,
        "asset_path": f"/pets/quaternius/{file_name}.gltf",
        "animation_hint": "Idle · Eating · Walk · Gallop · Jump",
    }


PET_SPECIES: tuple[dict[str, Any], ...] = (
    _quaternius("alpaca", "羊驼", "Alpaca", "🦙", "#d3a77d", "从容，喜欢听你说话", "alpaca"),
    _quaternius("bull", "小公牛", "Bull", "🐂", "#88705f", "可靠，愿意陪你探索", "bull"),
    _quaternius("cow", "小奶牛", "Cow", "🐄", "#8f9e9b", "温和，喜欢慢慢成长", "cow"),
    _quaternius("deer", "小鹿", "Deer", "🦌", "#c98d5e", "温柔，喜欢在林间散步", "deer"),
    _quaternius("donkey", "小驴", "Donkey", "🫏", "#8d8b83", "踏实，最爱完成小任务", "donkey"),
    _quaternius("fox", "小狐狸", "Fox", "🦊", "#e07848", "机灵，喜欢发现新东西", "fox"),
    _quaternius("horse", "小马", "Horse", "🐴", "#b47b5b", "开朗，喜欢一起完成挑战", "horse"),
    _quaternius("horse-white", "白马", "Horse White", "🐎", "#b7c8d5", "优雅，喜欢听睡前故事", "horse-white"),
    _quaternius("husky", "哈士奇", "Husky", "🐕", "#7894ad", "热情，随时准备出发", "husky"),
    _quaternius("shibainu", "柴犬", "Shiba Inu", "🐕‍🦺", "#d29458", "聪明，喜欢获得小奖励", "shibainu"),
    _quaternius("stag", "大角鹿", "Stag", "🦌", "#a8744d", "稳重，喜欢听完整故事", "stag"),
    _quaternius("wolf", "小狼", "Wolf", "🐺", "#8294a6", "勇敢，愿意陪你探索", "wolf"),
    {
        "id": "cat",
        "name": "小猫",
        "english_name": "Cat",
        "source": "Cat by J-Toastie · Poly Pizza",
        "source_url": POLY_PIZZA_CAT_URL,
        "license_url": CC_BY_3_LICENSE_URL,
        "accent": "#849cab",
        "emoji": "🐱",
        "temperament": "温柔好奇，喜欢倾听和学你说话",
        "asset_path": "/pets/poly-pizza/cat.glb",
        "animation_hint": "IdleCat · Lumi Nod · Spin · Hop · Stretch · Listen · Talk · Sway · Bow",
    },
)


PET_ACTIONS: dict[str, dict[str, Any]] = {
    "feed": {"label": "喂食", "points": 4, "message": "吃饱啦，今天也有精神！"},
    "play": {"label": "玩耍", "points": 6, "message": "一起玩真开心，发现力提升了！"},
    "groom": {"label": "整理", "points": 4, "message": "变得干干净净，心情也更好了。"},
    "story": {"label": "讲故事", "points": 8, "message": "故事听完啦，伙伴又学会了一点新东西。"},
    "talk": {"label": "聊天", "points": 5, "message": "我听见你的声音了，谢谢你来陪我。"},
}


# 早期原型曾暴露过没有配套 3D 文件的品种。已有领养记录继续可用，并落到
# 风格接近的真实模型；新领养只会看到上面的正式目录。
LEGACY_SPECIES_ALIASES: dict[str, str] = {
    "boar": "bull",
    "buffalo": "bull",
    "goat": "alpaca",
    "llama": "alpaca",
    "rabbit": "shibainu",
    "bear": "husky",
    "chicken": "cat",
}


def get_species(species_id: str) -> dict[str, Any] | None:
    resolved_id = LEGACY_SPECIES_ALIASES.get(species_id, species_id)
    return next((item for item in PET_SPECIES if item["id"] == resolved_id), None)


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
