from __future__ import annotations

from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .config import Settings
from .models import (
    CommunitySubmission,
    ContentItem,
    ContentRequest,
    ContentSource,
    Favorite,
    SystemSetting,
    User,
    utcnow,
)
from .security import hash_password


DEMO_USERS = (
    ("child-demo", "child", "小满", 6, "demo_child_password"),
    ("guardian-demo", "guardian", "林妈妈", None, "demo_guardian_password"),
    ("operator-demo", "operator", "Alex", None, "demo_operator_password"),
)


CONTENT = (
    ("bluey", "video", "Bluey", "Keepy Uppy · 英语故事", "English", 4, 7, 8, "家庭关系、想象游戏和自然日常英语。", ["家庭关系", "日常英语", "想象力"], "#e8b84b", "photo-1502082553048-f009c37129b9.jpg", "把一个家庭小游戏搬到客厅", True),
    ("numberblocks", "video", "Numberblocks", "The Terrible Twos · 英语数学", "English", 4, 7, 5, "用节奏和重复帮助孩子建立数感。", ["数感", "重复句式", "低刺激"], "#77b5a5", "photo-1516627145497-ae6968895b74.jpg", "用积木表示一个数字关系", False),
    ("puffin-rock", "video", "Puffin Rock", "The New Neighbour · 英语自然", "English", 4, 7, 7, "清楚旁白和舒缓节奏的自然故事。", ["自然观察", "睡前", "听力"], "#75a8cf", "photo-1500534623283-312aade485b7.jpg", "找出家附近三种鸟或树", False),
    ("great-movie", "video", "《大闹天宫》", "中国动画美术片 · 亲子共看", "中文 / 少对白", 5, 8, 18, "色彩、音乐和动作设计极具辨识度。", ["中国美术", "音乐", "神话"], "#e6735e", "photo-1531058020387-3be344556be6.jpg", "画一张自己设计的云纹", False),
    ("gruffalo", "book", "The Gruffalo", "绘本 · 英语共读", "English", 4, 7, 12, "押韵、重复和充满想象的森林旅程。", ["押韵", "绘本", "复述"], "#9a7bb4", "photo-1513159446162-54eb8bdaa79b.jpg", "为森林角色画一张角色卡", False),
    ("tuanyuan", "book", "《团圆》", "中文绘本 · 亲子阅读", "中文", 4, 7, 15, "从孩子视角观察春节和家人团聚。", ["家庭", "节日文化", "审美"], "#d88a63", "photo-1511895426328-dc8714191300.jpg", "讲一讲家里最喜欢的节日", False),
    ("audio-story", "audio", "晚安电台 · 森林来信", "有声故事 · 轻柔聆听", "中文", 4, 8, 22, "没有画面也能练习在脑中构建场景。", ["有声书", "想象力", "睡前"], "#6a91b9", "photo-1519681393784-d120267933ba.jpg", "听完画出你想象的森林", False),
    ("gcompris", "game", "GCompris", "数学与逻辑 · 离线互动", "中文 / English", 4, 8, 15, "覆盖数感、逻辑、时钟、键盘和科学的离线活动。", ["数学", "逻辑", "离线"], "#5e9b8d", "photo-1499750310107-5fef28a66643.jpg", "把今天学到的规则讲给家长听", False),
    ("scratchjr", "create", "ScratchJr", "做一段自己的小动画", "中文 / English", 5, 8, 20, "用角色、动作和声音讲一个自己编的故事。", ["编程", "表达", "创作"], "#ef8b58", "photo-1516321318423-f06f85e504b3.jpg", "给作品录一句旁白", False),
    ("wild-discovery", "discover", "周末观察任务", "去发现 · 户外小挑战", "中文", 4, 9, 30, "离开屏幕，观察叶子、鸟叫和影子。", ["户外", "观察", "亲子"], "#87a75b", "photo-1473445361085-b9a07f55608b.jpg", "拍一张照片或带回一片叶子", False),
    ("shaun", "video", "Shaun the Sheep", "视觉喜剧 · 少对白", "少对白", 5, 8, 7, "用动作、节奏和音乐讲故事。", ["视觉叙事", "音乐", "幽默"], "#c6a15b", "photo-1534528741775-53994a69daeb.jpg", "用三张图讲清楚一个笑点", False),
)


def seed_database(db: Session, settings: Settings) -> None:
    if settings.seed_demo and (db.scalar(select(func.count()).select_from(User)) or 0) == 0:
        for username, role, name, age, password_field in DEMO_USERS:
            salt, digest = hash_password(getattr(settings, password_field), settings.password_iterations)
            db.add(
                User(
                    id=username,
                    username=username,
                    role=role,
                    display_name=name,
                    child_age=age,
                    password_salt=salt,
                    password_hash=digest,
                )
            )
        db.flush()

    if db.get(ContentSource, "official-links") is None:
        db.add(
            ContentSource(
                id="official-links",
                name="官方观看入口",
                kind="official_stream",
                owner="家庭管理员",
                terms_url="https://example.invalid/official-links-policy",
                license_note="只保存正版平台入口，不缓存受保护的视频。",
                allow_download=False,
                rate_limit="manual",
                reviewed_at=utcnow(),
                review_expire_at=utcnow() + timedelta(days=90),
            )
        )
    if db.get(ContentSource, "blender-open") is None:
        db.add(
            ContentSource(
                id="blender-open",
                name="Blender Open Movies",
                kind="direct_http",
                owner="Blender Foundation",
                base_url="https://download.blender.org/",
                terms_url="https://studio.blender.org/films/",
                license_note="仅处理具体页面明确标注开放许可的文件，逐条保存证明。",
                region="global",
                allow_download=True,
                rate_limit="1 concurrent",
                reviewed_at=utcnow(),
                review_expire_at=utcnow() + timedelta(days=30),
            )
        )
    if db.get(ContentSource, "cloud-inbox") is None:
        db.add(
            ContentSource(
                id="cloud-inbox",
                name="家庭专用网盘投递目录",
                kind="cloud_inbox",
                owner="家庭管理员",
                terms_url="https://example.invalid/family-cloud-inbox-policy",
                license_note="仅同步家长已在官方客户端预览和转存的家庭专用目录。",
                allow_download=True,
                rate_limit="local scan",
                reviewed_at=utcnow(),
                review_expire_at=utcnow() + timedelta(days=90),
            )
        )
    if db.get(ContentSource, "bilibili-public") is None:
        db.add(
            ContentSource(
                id="bilibili-public",
                name="B站公开单视频（逐条确认）",
                kind="bilibili",
                owner="家庭管理员",
                base_url="https://www.bilibili.com/video/",
                terms_url="https://www.bilibili.com/blackboard/protocal/international_hans.html",
                license_note="连接器只处理公开单视频；每个任务仍须由运维人员确认下载与家庭使用权利。",
                region="CN",
                allow_download=True,
                rate_limit="1 concurrent",
                reviewed_at=utcnow(),
                review_expire_at=utcnow() + timedelta(days=3650),
            )
        )
    db.flush()

    if (db.scalar(select(func.count()).select_from(ContentItem)) or 0) == 0:
        launches = {
            "bluey": "https://www.bluey.tv/",
            "numberblocks": "https://www.bbc.co.uk/cbeebies/shows/numberblocks",
            "gcompris": "https://gcompris.net/",
            "scratchjr": "https://www.scratchjr.org/",
        }
        for row in CONTENT:
            item_id, kind, title, subtitle, language, age_from, age_to, minutes, description, tags, accent, cover, activity, featured = row
            db.add(
                ContentItem(
                    id=item_id,
                    kind=kind,
                    title=title,
                    subtitle=subtitle,
                    language=language,
                    age_from=age_from,
                    age_to=age_to,
                    duration_minutes=minutes,
                    description=description,
                    tags=tags,
                    accent=accent,
                    cover_ref="/covers/" + cover,
                    launch_url=launches.get(item_id),
                    acquisition_mode="official_stream" if kind in ("video", "game", "create") else "owned_or_official",
                    publication_status="published",
                    audience="child",
                    stimulation_level="low",
                    offline_activity=activity,
                    featured=featured,
                    source_id="official-links",
                )
            )
        db.add(
            ContentItem(
                id="adult-demo",
                kind="video",
                title="成人内容隔离测试条目",
                subtitle="只用于权限自动测试",
                language="中文",
                age_from=18,
                age_to=99,
                duration_minutes=90,
                description="该条目用于验证儿童目录和搜索不会泄露成人标题。",
                tags=["权限测试"],
                publication_status="published",
                audience="adult",
                source_id="official-links",
            )
        )
        db.flush()

    if settings.seed_demo and (db.scalar(select(func.count()).select_from(ContentRequest)) or 0) == 0:
        for item_id, reason in (
            ("great-movie", "想看孙悟空的云"),
            ("scratchjr", "我想做一个会飞的故事"),
            ("audio-story", "睡前想听森林故事"),
        ):
            db.add(
                ContentRequest(
                    household_id="home",
                    requester_id="child-demo",
                    item_id=item_id,
                    reason=reason,
                )
            )

    if settings.seed_demo and (db.scalar(select(func.count()).select_from(CommunitySubmission)) or 0) == 0:
        db.add_all(
            [
                CommunitySubmission(
                    household_id="home",
                    title="老师整理：自然拼读卡片",
                    provider="baidu",
                    original_url="https://pan.baidu.com/",
                    publisher_note="等待家长核对原始授权说明后人工转存。",
                    submitted_by="guardian-demo",
                ),
                CommunitySubmission(
                    household_id="home",
                    title="开源小游戏：小小星球",
                    provider="creator",
                    original_url="https://example.invalid/open-game",
                    publisher_note="候选记录不代表已获发布许可。",
                    transfer_status="confirmed",
                    review_status="pending",
                    submitted_by="guardian-demo",
                    transferred_by="guardian-demo",
                    transferred_at=utcnow(),
                ),
            ]
        )

    if settings.seed_demo and (db.scalar(select(func.count()).select_from(Favorite)) or 0) == 0:
        for content_id in ("bluey", "gruffalo", "gcompris"):
            db.add(Favorite(user_id="child-demo", content_id=content_id))

    if db.get(SystemSetting, "downloads") is None:
        db.add(SystemSetting(key="downloads", value_json={"paused": False, "reason": None}))
    db.commit()
