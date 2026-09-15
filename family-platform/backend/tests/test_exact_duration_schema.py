from __future__ import annotations

from sqlalchemy import create_engine, inspect, text

from familyhub.database import ensure_runtime_schema


def test_runtime_schema_adds_exact_duration_without_inventing_seconds(tmp_path) -> None:
    engine = create_engine(f"sqlite:///{(tmp_path / 'legacy.db').as_posix()}")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE content_items (id TEXT PRIMARY KEY, duration_minutes INTEGER NOT NULL)"))
        connection.execute(
            text(
                "CREATE TABLE content_collection_episodes "
                "(id TEXT PRIMARY KEY, duration_minutes INTEGER NOT NULL)"
            )
        )
        connection.execute(text("INSERT INTO content_items VALUES ('video', 7)"))
        connection.execute(text("INSERT INTO content_collection_episodes VALUES ('episode', 3)"))

    ensure_runtime_schema(engine)
    ensure_runtime_schema(engine)

    assert "duration_seconds" in {column["name"] for column in inspect(engine).get_columns("content_items")}
    assert "duration_seconds" in {
        column["name"] for column in inspect(engine).get_columns("content_collection_episodes")
    }
    with engine.connect() as connection:
        # 旧整数分钟不能冒充原始秒数，0 会触发平台元数据或媒体本身回退。
        assert connection.scalar(text("SELECT duration_seconds FROM content_items WHERE id='video'")) == 0
        assert connection.scalar(
            text("SELECT duration_seconds FROM content_collection_episodes WHERE id='episode'")
        ) == 0
