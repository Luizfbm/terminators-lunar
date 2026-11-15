"""Shared test setup."""

import threading
from collections.abc import Iterator

import pytest

from app import cache


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
