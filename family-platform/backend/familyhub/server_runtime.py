from __future__ import annotations

import logging
import os
import threading
from collections.abc import Callable
from logging.handlers import RotatingFileHandler

import uvicorn

from .config import Settings
from .database import Base, build_engine, build_session_factory
from .main import create_app
from .seed import seed_database
from .worker import build_worker


def configured_parent_pid() -> int | None:
    raw_value = os.environ.get("FAMILYHUB_PARENT_PID", "").strip()
    if not raw_value:
        return None
    try:
        parent_pid = int(raw_value)
    except ValueError:
        logging.getLogger("familyhub.runtime").warning("忽略无效的 Server 父进程编号")
        return None
    return parent_pid if parent_pid > 0 else None


def watch_windows_parent(parent_pid: int, on_parent_stopped: Callable[[], None]) -> None:
    """等待 Windows GUI 退出，并通知 Core 连同后台子进程一起收尾。"""

    if os.name != "nt":
        return

    import ctypes
    from ctypes import wintypes

    synchronize = 0x00100000
    infinite = 0xFFFFFFFF
    wait_object_0 = 0
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    open_process = kernel32.OpenProcess
    open_process.argtypes = (wintypes.DWORD, wintypes.BOOL, wintypes.DWORD)
    open_process.restype = wintypes.HANDLE
    wait_for_single_object = kernel32.WaitForSingleObject
    wait_for_single_object.argtypes = (wintypes.HANDLE, wintypes.DWORD)
    wait_for_single_object.restype = wintypes.DWORD
    close_handle = kernel32.CloseHandle
    close_handle.argtypes = (wintypes.HANDLE,)
    close_handle.restype = wintypes.BOOL

    parent_handle = open_process(synchronize, False, parent_pid)
    if not parent_handle:
        on_parent_stopped()
        return
    try:
        result = wait_for_single_object(parent_handle, infinite)
    finally:
        close_handle(parent_handle)
    if result == wait_object_0:
        on_parent_stopped()
        return
    logging.getLogger("familyhub.runtime").error("父进程监视异常，Core 将继续由 GUI 退出流程管理")


def start_parent_watchdog(on_parent_stopped: Callable[[], None]) -> threading.Thread | None:
    parent_pid = configured_parent_pid()
    if parent_pid is None or os.name != "nt":
        return None
    watchdog = threading.Thread(
        target=watch_windows_parent,
        args=(parent_pid, on_parent_stopped),
        name="lumi-parent-watchdog",
        daemon=True,
    )
    watchdog.start()
    return watchdog


def configure_runtime_logging(settings: Settings) -> None:
    log_root = settings.root / "logs"
    log_root.mkdir(parents=True, exist_ok=True)
    handler = RotatingFileHandler(
        log_root / "lumi-server.log",
        maxBytes=4 * 1024 * 1024,
        backupCount=3,
        encoding="utf-8",
    )
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
        handlers=[handler],
        force=True,
    )


def run_worker(settings: Settings, stop: threading.Event) -> None:
    worker = build_worker(settings)
    while not stop.is_set():
        try:
            worker.run_once()
        except Exception:
            # 单次后台扫描失败不影响 API，下一轮会重试，任务自身的失败原因仍写入数据库。
            logging.getLogger("familyhub.worker").exception("后台任务轮询失败")
        stop.wait(max(5, settings.worker_poll_seconds))


def main() -> None:
    settings = Settings()
    settings.ensure_directories()
    configure_runtime_logging(settings)
    engine = build_engine(settings)
    Base.metadata.create_all(engine)
    with build_session_factory(engine)() as database:
        seed_database(database, settings)
    engine.dispose()

    stop = threading.Event()
    worker_thread = threading.Thread(
        target=run_worker,
        args=(settings, stop),
        name="lumi-worker",
        daemon=True,
    )
    worker_thread.start()
    server = uvicorn.Server(
        uvicorn.Config(
            create_app(settings),
            host=settings.api_host,
            port=settings.api_port,
            log_level="info",
            access_log=False,
            log_config=None,
        )
    )
    start_parent_watchdog(lambda: setattr(server, "should_exit", True))
    try:
        server.run()
    finally:
        stop.set()
        worker_thread.join(timeout=2)


if __name__ == "__main__":
    main()
