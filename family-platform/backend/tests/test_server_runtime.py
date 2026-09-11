from __future__ import annotations

import pytest

from familyhub.server_runtime import configured_parent_pid


@pytest.mark.parametrize(
    ("raw_value", "expected"),
    [
        (None, None),
        ("", None),
        ("not-a-number", None),
        ("0", None),
        ("-2", None),
        (" 4321 ", 4321),
    ],
)
def test_configured_parent_pid(monkeypatch: pytest.MonkeyPatch, raw_value: str | None, expected: int | None) -> None:
    if raw_value is None:
        monkeypatch.delenv("FAMILYHUB_PARENT_PID", raising=False)
    else:
        monkeypatch.setenv("FAMILYHUB_PARENT_PID", raw_value)
    assert configured_parent_pid() == expected
