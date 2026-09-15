from __future__ import annotations

from collections.abc import Generator
from typing import Any

from fastapi import Request
from sqlalchemy import Engine, event, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy import create_engine

from .config import Settings


class Base(DeclarativeBase):
    pass


def build_engine(settings: Settings) -> Engine:
    connect_args: dict[str, Any] = {}
    if settings.database_dsn.startswith("sqlite"):
        connect_args["check_same_thread"] = False
    engine = create_engine(
        settings.database_dsn,
        connect_args=connect_args,
        pool_pre_ping=True,
    )
    if settings.database_dsn.startswith("sqlite"):
        _configure_sqlite(engine)
    return engine


def _configure_sqlite(engine: Engine) -> None:
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection: Any, _connection_record: Any) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()


def build_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def ensure_runtime_schema(engine: Engine) -> None:
    """为未经过 Alembic 的旧安装补齐新增列。

    Windows 单机版和测试环境会直接使用 ``create_all``，不能假设用户已经
    手工执行迁移。该检查是幂等的，正式部署仍由 Alembic 记录版本。
    """
    inspector = inspect(engine)
    additions = (
        ("content_items", "duration_seconds", "INTEGER NOT NULL DEFAULT 0"),
        (
            "content_collection_episodes",
            "duration_seconds",
            "INTEGER NOT NULL DEFAULT 0",
        ),
    )
    with engine.begin() as connection:
        for table, column, definition in additions:
            if table not in inspector.get_table_names():
                continue
            columns = {item["name"] for item in inspect(connection).get_columns(table)}
            if column not in columns:
                connection.execute(text(f'ALTER TABLE "{table}" ADD COLUMN "{column}" {definition}'))


def get_db(request: Request) -> Generator[Session, None, None]:
    session_factory = request.app.state.session_factory
    with session_factory() as session:
        yield session
