from __future__ import annotations

import logging
import threading
from logging.handlers import RotatingFileHandler

import uvicorn

from .config import Settings
from .database import Base, build_engine, build_session_factory
from .main import create_app
from .seed import seed_database
from .worker import build_worker


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
    try:
        uvicorn.run(
            create_app(settings),
            host=settings.api_host,
            port=settings.api_port,
            log_level="info",
            access_log=False,
            log_config=None,
        )
    finally:
        stop.set()
        worker_thread.join(timeout=2)


if __name__ == "__main__":
    main()
