"""Shared test setup."""

import threading
from collections.abc import Iterator

import pytest

from app import cache, horizon


@pytest.fixture
def without_global_dem(monkeypatch: pytest.MonkeyPatch) -> None:
    """The condition of every test that says a typed point must be at or south of 80°S.

    That limit holds only while the server has no LOLA global map (LDEM_128): with it, a
    typed point is answered anywhere on the Moon (horizon.custom_max_latitude_deg). These
    tests keep their meaning on the DEM fixtures, and on a machine whose DEM folder does
    have the global map they state the condition instead of depending on the folder.
    """
    monkeypatch.setattr(horizon, "has_global", lambda folder=None: False)


@pytest.fixture(autouse=True)
def empty_answer_cache() -> Iterator[None]:
    """Every test starts with an empty answer cache, and no month of periods kept.

    Tests that check Cache-Status depend on it: mutmut runs only the tests that reach
    each mutant, in its own order, so an answer stored by another test would turn the
    expected miss into a hit.
    """
    with cache._lock:
        cache._entries.clear()
        cache._months.clear()
    yield


@pytest.fixture(autouse=True)
def no_warming_left_behind() -> Iterator[None]:
    """A warming thread from one test must not hold an engine slot in the next."""
    yield
    for thread in threading.enumerate():
        if thread.name == "warm-cache":
            thread.join(timeout=120)
