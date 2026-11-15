"""The two guards on /assistant: a per-IP cap and a daily cap on questions sent to the model.

The per-IP cap works like app/ratelimit.py (a fixed 60 s window, 503 `busy` with
Retry-After), with its own setting, because /assistant is not an engine route and a
question costs money. The daily cap counts questions that reach the model in each UTC day;
past it, the route still answers, offline.
"""

import threading
import time
from collections.abc import Callable
from datetime import UTC, date, datetime

from . import config

WINDOW_SECONDS = 60.0


class IpCap:
    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._clock = clock
        self._lock = threading.Lock()
        self._window_start = clock()
        self._counts: dict[str, int] = {}

    def over(self, ip: str) -> int | None:
        """Seconds to wait when `ip` is over the cap, else None. Counts this request."""
        per_minute = config.ip_per_minute()
        if per_minute <= 0:
            return None
        now = self._clock()
        with self._lock:
            if now - self._window_start >= WINDOW_SECONDS:
                self._window_start = now
                self._counts.clear()
            count = self._counts.get(ip, 0) + 1
            self._counts[ip] = count
            if count > per_minute:
                return max(1, int(WINDOW_SECONDS - (now - self._window_start)) + 1)
        return None

    def reset(self) -> None:
        with self._lock:
            self._window_start = self._clock()
            self._counts.clear()


class DailyCap:
    def __init__(self, today: Callable[[], date] = lambda: datetime.now(UTC).date()) -> None:
        self._today = today
        self._lock = threading.Lock()
        self._day = today()
        self._count = 0

    def take(self) -> bool:
        """True and counted when one more question may go to the model today."""
        today = self._today()
        with self._lock:
            if today != self._day:
                self._day = today
                self._count = 0
            if self._count >= config.daily_limit():
                return False
            self._count += 1
            return True

    def reset(self) -> None:
        with self._lock:
            self._day = self._today()
            self._count = 0


ip_cap = IpCap()
daily_cap = DailyCap()
