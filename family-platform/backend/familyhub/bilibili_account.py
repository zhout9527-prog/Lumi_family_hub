from __future__ import annotations

import json
import os
from http.cookiejar import Cookie, MozillaCookieJar
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen

from sqlalchemy.orm import Session

from .config import Settings
from .models import SystemSetting, utcnow


BILIBILI_ACCOUNT_SETTING_KEY = "bilibili_account"
SUPPORTED_BROWSERS = {"edge", "chrome", "firefox"}
_BILIBILI_COOKIE_DOMAINS = (".bilibili.com", ".biliapi.net")
_LOGIN_COOKIE_NAMES = {"SESSDATA", "DedeUserID", "bili_jct"}
_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)


class BilibiliAccountError(RuntimeError):
    pass


def bilibili_cookie_path(settings: Settings) -> Path:
    return (settings.root / "data" / "credentials" / "bilibili.cookies.txt").resolve()


def active_bilibili_cookie_file(settings: Settings) -> Path | None:
    path = bilibili_cookie_path(settings)
    return path if path.is_file() and path.stat().st_size > 0 else None


def _is_bilibili_cookie(cookie: Cookie) -> bool:
    domain = (cookie.domain or "").casefold().lstrip(".")
    return any(domain == suffix.lstrip(".") or domain.endswith(suffix) for suffix in _BILIBILI_COOKIE_DOMAINS)


def _cookie_header(path: Path) -> str:
    jar = MozillaCookieJar(str(path))
    jar.load(ignore_discard=True, ignore_expires=True)
    return "; ".join(f"{cookie.name}={cookie.value}" for cookie in jar if _is_bilibili_cookie(cookie))


def _query_account(path: Path) -> dict[str, Any]:
    request = Request(
        "https://api.bilibili.com/x/web-interface/nav",
        headers={
            "Accept": "application/json",
            "Cookie": _cookie_header(path),
            "Referer": "https://www.bilibili.com/",
            "User-Agent": _USER_AGENT,
        },
    )
    try:
        with urlopen(request, timeout=20) as response:
            payload = json.loads(response.read(1024 * 1024).decode("utf-8"))
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        raise BilibiliAccountError("无法验证 B 站登录状态，请检查网络后重试") from exc
    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, dict) or not data.get("isLogin"):
        raise BilibiliAccountError("所选浏览器尚未登录 B 站，请先完成官方网页登录")
    return {
        "account_name": str(data.get("uname") or "已登录账号")[:120],
        "account_id": str(data.get("mid") or "")[:80],
        "vip": bool(data.get("vipStatus")),
    }


def import_bilibili_cookies_from_browser(
    db: Session,
    settings: Settings,
    *,
    browser: str,
    updated_by: str,
) -> dict[str, Any]:
    normalized_browser = browser.strip().casefold()
    if normalized_browser not in SUPPORTED_BROWSERS:
        raise BilibiliAccountError("只支持从 Edge、Chrome 或 Firefox 导入登录状态")
    try:
        from yt_dlp import YoutubeDL
    except ImportError as exc:
        raise BilibiliAccountError("Server 缺少 B 站解析组件，请重新安装完整版本") from exc

    try:
        with YoutubeDL(
            {
                "cookiesfrombrowser": (normalized_browser, None, None, None),
                "quiet": True,
                "no_warnings": True,
            }
        ) as downloader:
            browser_cookies = list(downloader.cookiejar)
    except (OSError, RuntimeError, ValueError) as exc:
        raise BilibiliAccountError(
            f"无法读取 {normalized_browser.title()} 登录状态，请关闭浏览器后重试"
        ) from exc

    selected = [cookie for cookie in browser_cookies if _is_bilibili_cookie(cookie)]
    if not selected or not _LOGIN_COOKIE_NAMES.intersection(cookie.name for cookie in selected):
        raise BilibiliAccountError("所选浏览器没有可用的 B 站登录状态")

    destination = bilibili_cookie_path(settings)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(".tmp")
    jar = MozillaCookieJar(str(temporary))
    for cookie in selected:
        jar.set_cookie(cookie)
    jar.save(ignore_discard=True, ignore_expires=True)
    os.chmod(temporary, 0o600)
    temporary.replace(destination)
    os.chmod(destination, 0o600)

    try:
        account = _query_account(destination)
    except BilibiliAccountError:
        destination.unlink(missing_ok=True)
        raise
    connected_at = utcnow()
    payload = {
        "connected": True,
        "account_name": account["account_name"],
        "account_id": account["account_id"],
        "vip": account["vip"],
        "browser": normalized_browser,
        "updated_at": connected_at.isoformat(),
    }
    setting = db.get(SystemSetting, BILIBILI_ACCOUNT_SETTING_KEY)
    if setting is None:
        db.add(SystemSetting(key=BILIBILI_ACCOUNT_SETTING_KEY, value_json=payload, updated_by=updated_by))
    else:
        setting.value_json = payload
        setting.updated_by = updated_by
        setting.updated_at = connected_at
    return payload


def disconnect_bilibili_account(db: Session, settings: Settings, *, updated_by: str) -> dict[str, Any]:
    bilibili_cookie_path(settings).unlink(missing_ok=True)
    payload = {
        "connected": False,
        "account_name": None,
        "account_id": None,
        "vip": False,
        "browser": None,
        "updated_at": utcnow().isoformat(),
    }
    setting = db.get(SystemSetting, BILIBILI_ACCOUNT_SETTING_KEY)
    if setting is None:
        db.add(SystemSetting(key=BILIBILI_ACCOUNT_SETTING_KEY, value_json=payload, updated_by=updated_by))
    else:
        setting.value_json = payload
        setting.updated_by = updated_by
        setting.updated_at = utcnow()
    return payload


def bilibili_account_status(db: Session, settings: Settings) -> dict[str, Any]:
    setting = db.get(SystemSetting, BILIBILI_ACCOUNT_SETTING_KEY)
    stored = dict(setting.value_json) if setting and isinstance(setting.value_json, dict) else {}
    connected = bool(stored.get("connected")) and active_bilibili_cookie_file(settings) is not None
    return {
        "connected": connected,
        "account_name": str(stored.get("account_name"))[:120] if connected and stored.get("account_name") else None,
        "vip": bool(stored.get("vip")) if connected else False,
        "browser": str(stored.get("browser"))[:20] if connected and stored.get("browser") else None,
        "updated_at": stored.get("updated_at") if connected else None,
    }
