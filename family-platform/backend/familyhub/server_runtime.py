from __future__ import annotations

import threading

import uvicorn

from .config import Settings
from .database import Base, build_engine, build_session_factory
from .main import create_app
from .seed import seed_database
from .worker import build_worker


def run_worker(settings: Settings, stop: threading.Event) -> None:
    worker = build_worker(settings)
    while not stop.is_set():
        try:
            worker.run_once()
        except Exception:
            # 单次后台扫描失败时保持 API 可用，下次轮询会重试，具体任务错误由 Worker 记录。
            pass
        stop.wait(max(5, settings.worker_poll_seconds))


def main() -> None:
    settings = Settings()
    settings.ensure_directories()
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
        )
    finally:
        stop.set()
        worker_thread.join(timeout=2)


if __name__ == "__main__":
    main()
