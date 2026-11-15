"""Answers for Curated Sites, kept so switching between them is instant.

The engine is a pure function of (Site, start, duration, height) given its code and its
data, so a Curated Site's answer is stored under its id, those three numbers, the engine
version and a fingerprint of the DEM files. Custom Sites are never stored: any coordinate
is possible and they would push the curated answers out.

A year and the same Window started on other days are asked of the engine one calendar
month at a time. Each month's periods are kept apart from the answers, under the same
versioned key, so a month that `/sites/{site_id}/year` computed is not computed again by
`/sites/{site_id}/windows`, and the other way round; they have their own caps so they
never push a visitor's answer out.

Two requests for the same uncomputed answer share one engine run. Every engine run,
including the twelve behind a year, goes through one gate with a fixed number of slots,
so a burst of requests queues instead of piling up CPU work. Visitors go ahead of the
warming thread: it takes a slot only when no visitor is waiting, and never more than one.
A Landing scatter takes the gate once per point and lets a queued visitor go first
between points, so it never holds more than one slot and never starves /visibility.

`start_warming` fills the cache in a background thread, again after each UTC midnight:
the default Site first, then every other Curated Site over the default Window (ADR 0004:
it starts at 00:00 UTC of the current day), then the default Site's Landing scatter over
that Window with the default radius, then the default Site's current and next year,
then every Curated Site over tomorrow's default Window, so a visitor just after midnight
finds the new day's answers ready instead of waiting for this thread to start over, and
last the Uncertainty band of every Curated Site over today's default Window
(`uncertainty.py`, ADR 0006), which keeps its own cache.
"""

import json
import logging
import os
import threading
from collections import OrderedDict
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from typing import Any

from . import catalog, engine, features, horizon
from .catalog import Site
from .constants import (
    DEFAULT_DURATION_HOURS,
    DEFAULT_OBSERVER_HEIGHT_M,
    ENGINE_VERSION,
    WINDOW_MAX,
)

# Answers are kept as JSON bytes (about 0.8 MB each over the default Window), so two
# days of the whole catalog fit in a few hundred MB. The 151 Curated Sites warm to 302
# answers over two days, so the count has to clear that or the warm-up evicts its own work.
MAX_ENTRIES = 360
# The count alone let 300 answers of 1440 h (1.7 MB each) hold about 510 MB, and the
# compose stack sets no memory limit. The bytes are capped too.
MAX_BYTES = int(os.environ.get("LUNAR_CACHE_MAX_MB", "320")) * 1_000_000
# A month of periods is a few kB, so a year of every Curated Site (131 x 12) fits in each.
MONTH_MAX_ENTRIES = 1600
MONTH_MAX_BYTES = 48_000_000
ENGINE_RUNS = int(os.environ.get("LUNAR_ENGINE_CONCURRENCY", "2"))
WARM = "LUNAR_WARM_CACHE"

Key = tuple[str, str, tuple[tuple[str, int, int], ...], datetime, float, float]

_entries: OrderedDict[Key, bytes] = OrderedDict()
_months: OrderedDict[Key, bytes] = OrderedDict()
_pending: dict[Key, threading.Event] = {}
_lock = threading.Lock()
_bytes = 0
_month_bytes = 0


QUEUE_WAIT = "LUNAR_QUEUE_WAIT_SECONDS"
RETRY_AFTER_SECONDS = 10


def queue_wait_seconds() -> float:
    """How long a visitor waits for an engine slot before getting 503 busy.

    A cold custom Site takes up to about 7 s on the VPS, so 25 s lets a visitor sit
    behind two of them and still answers well before Cloudflare's 100 s cut-off.
    """
    return float(os.environ.get(QUEUE_WAIT, "25"))


class Busy(Exception):
    """A visitor waited longer than queue_wait_seconds() for an engine slot."""


class NotReady(Exception):
    """Under ready_only(), the answer would need an engine run, or wait on one in progress."""


_ready = threading.local()


@contextmanager
def ready_only() -> Iterator[None]:
    """Answers this thread may read only from what is already computed.

    For the assistant (the requirement): a question must not wait on a long cold computation.
    Every engine run takes a slot of the gate, so the gate refuses one here, and so does
    the wait for an answer another request is computing; both raise NotReady before any
    work starts. Answers in the cache, and the cheap work around them, still run.
    """
    before = getattr(_ready, "on", False)
    _ready.on = True
    try:
        yield
    finally:
        _ready.on = before


def _check_ready() -> None:
    if getattr(_ready, "on", False):
        raise NotReady


class _Gate:
    """Engine slots where visitors go first and warming gets at most one slot."""

    def __init__(self, slots: int) -> None:
        self._free = slots
        self._visitors_waiting = 0
        self._warming = 0
        self._cond = threading.Condition()

    def acquire(self, warming: bool, polite: bool = False) -> None:
        _check_ready()
        with self._cond:
            if warming:
                self._cond.wait_for(
                    lambda: self._free > 0 and self._visitors_waiting == 0 and self._warming == 0
                )
                self._warming += 1
            elif polite:
                # One step of a long job, such as a point of a Landing scatter: a visitor
                # already queued for a slot goes first. It does not count as waiting
                # itself, so two polite jobs never hold each other back.
                if not self._cond.wait_for(
                    lambda: self._free > 0 and self._visitors_waiting == 0, queue_wait_seconds()
                ):
                    raise Busy
            else:
                self._visitors_waiting += 1
                try:
                    got = self._cond.wait_for(lambda: self._free > 0, queue_wait_seconds())
                finally:
                    self._visitors_waiting -= 1
                if not got:
                    # Warming may have been holding back for this visitor.
                    self._cond.notify_all()
                    raise Busy
            self._free -= 1

    def release(self, warming: bool) -> None:
        with self._cond:
            self._free += 1
            if warming:
                self._warming -= 1
            self._cond.notify_all()


_gate = _Gate(ENGINE_RUNS)
_warming_thread = threading.local()


def _is_warming() -> bool:
    return bool(getattr(_warming_thread, "on", False))


@contextmanager
def engine_slot(polite: bool = False) -> Iterator[None]:
    """Hold one engine slot of the gate for the block: any piece of engine work takes one.

    `polite` lets a visitor already queued go first; the steps of a long job, such as the
    points of a Landing scatter or the clones of an Uncertainty band, ask for it that way.
    """
    warming = _is_warming()
    _gate.acquire(warming, polite)
    try:
        yield
    finally:
        _gate.release(warming)


def engine_run(
    site: Site,
    start: datetime,
    duration_hours: float,
    height_m: float,
    finest_m: float = 20.0,
    polite: bool = False,
) -> dict[str, Any]:
    """One engine run through the gate; the year endpoint uses it for each month.

    `polite` lets a visitor already queued go first; the Landing scatter asks each of
    its points that way.
    """
    with engine_slot(polite):
        answer: dict[str, Any] = engine.calculate(site, start, duration_hours, height_m, finest_m)
    return answer


_log = logging.getLogger(__name__)


def _dem_fingerprint() -> tuple[tuple[str, int, int], ...]:
    folder = horizon.dem_dir()
    marks = []
    for band in horizon.LADDER:
        path = folder / f"{band.product}.TIF"
        if path.is_file():
            stat = path.stat()
            marks.append((band.product, stat.st_size, stat.st_mtime_ns))
    # The 60 m DEM the polar ladder falls back on past the 80 m square.
    wide = folder / f"{horizon.WIDE_PRODUCT}.TIF"
    if wide.is_file():
        stat = wide.stat()
        marks.append((horizon.WIDE_PRODUCT, stat.st_size, stat.st_mtime_ns))
    for path in sorted((folder / horizon.OFFPOLE_DIR).glob("*/*.TIF")):
        stat = path.stat()
        marks.append((f"{path.parent.name}/{path.stem}", stat.st_size, stat.st_mtime_ns))
    return tuple(marks)


def _json(answer: dict[str, Any]) -> bytes:
    return json.dumps(answer, separators=(",", ":"), allow_nan=False).encode()


def _run(
    site: Site, start: datetime, duration_hours: float, height_m: float, finest_m: float
) -> bytes:
    answer = engine_run(site, start, duration_hours, height_m, finest_m)
    # Named here, before the answer becomes bytes: the route only ever sees the bytes.
    features.name_occluders(answer)
    return _json(answer)


def calculate(
    site: Site,
    start: datetime,
    duration_hours: float,
    height_m: float,
    finest_m: float = 20.0,
) -> tuple[bytes, bool]:
    """The answer as JSON and whether it came from the cache.

    `finest_m` is the finest DEM in the Horizon mask (a Resolution ladder rung); 20 m is
    the normal answer, and it keeps the plain Site id as its key.
    """
    if not site["curated"]:
        return _run(site, start, duration_hours, height_m, finest_m), False
    name = site["id"] if finest_m == 20.0 else f"{site['id']}/rung{finest_m:g}"
    key: Key = (name, ENGINE_VERSION, _dem_fingerprint(), start, duration_hours, height_m)
    return _memo(key, lambda: _run(site, start, duration_hours, height_m, finest_m))


def month_periods(
    site: Site, start: datetime, end: datetime, height_m: float
) -> list[dict[str, Any]]:
    """The engine's periods over one calendar month (or its part inside coverage)."""
    hours = (end - start).total_seconds() / 3600.0
    key: Key = (f"{site['id']}/month", ENGINE_VERSION, _dem_fingerprint(), start, hours, height_m)
    raw, _ = _memo(
        key,
        lambda: _json({"periods": engine_run(site, start, hours, height_m)["periods"]}),
        months=True,
    )
    periods: list[dict[str, Any]] = json.loads(raw)["periods"]
    return periods


def windows(
    site: Site,
    start: datetime,
    duration_hours: float,
    height_m: float,
    first_shift_days: int,
    last_shift_days: int,
) -> tuple[bytes, bool]:
    """A Curated Site's Window started on other days as JSON, and whether it was cached."""
    from . import windows as windows_module  # windows imports this module for its months

    key: Key = (
        f"{site['id']}/windows/{first_shift_days}/{last_shift_days}",
        ENGINE_VERSION,
        _dem_fingerprint(),
        start,
        duration_hours,
        height_m,
    )
    return _memo(
        key,
        lambda: _json(
            windows_module.compute(
                site, start, duration_hours, height_m, first_shift_days, last_shift_days
            )
        ),
    )


def year(site: Site, year_number: int, height_m: float) -> tuple[bytes, bool]:
    """A Curated Site's year as JSON, under the same versioned key, and whether it was cached."""
    from . import year as year_module  # year imports this module for engine_run

    key: Key = (
        f"{site['id']}/year",
        ENGINE_VERSION,
        _dem_fingerprint(),
        datetime(year_number, 1, 1, tzinfo=UTC),
        0.0,
        height_m,
    )
    return _memo(key, lambda: _json(year_module.compute(site, year_number, height_m)))


def scatter(
    site: Site, start: datetime, duration_hours: float, height_m: float, radius_m: float
) -> tuple[bytes, bool]:
    """A Landing scatter as JSON and whether it was cached; only Curated Sites are kept."""
    from . import scatter as scatter_module  # scatter imports this module for engine_run

    def compute() -> bytes:
        return _json(scatter_module.compute(site, start, duration_hours, height_m, radius_m))

    if not site["curated"]:
        return compute(), False
    # The radius is in the name with all its digits, so 250 and 250.0001 never share an entry.
    name = f"{site['id']}/scatter/{radius_m!r}"
    key: Key = (name, ENGINE_VERSION, _dem_fingerprint(), start, duration_hours, height_m)
    return _memo(key, compute)


def _memo(key: Key, compute: Callable[[], bytes], months: bool = False) -> tuple[bytes, bool]:
    global _bytes, _month_bytes
    entries = _months if months else _entries
    while True:
        with _lock:
            if key in entries:
                entries.move_to_end(key)
                return entries[key], True
            waiting = _pending.get(key)
            if waiting is None:
                done = _pending[key] = threading.Event()
                break
        # Someone (a visitor or the warming thread) is computing this answer already.
        _check_ready()
        waiting.wait()
    try:
        answer = compute()
        with _lock:
            entries[key] = answer
            if months:
                _month_bytes += len(answer)
                while len(_months) > MONTH_MAX_ENTRIES or (
                    _month_bytes > MONTH_MAX_BYTES and len(_months) > 1
                ):
                    _month_bytes -= len(_months.popitem(last=False)[1])
            else:
                _bytes += len(answer)
                while len(_entries) > MAX_ENTRIES or (_bytes > MAX_BYTES and len(_entries) > 1):
                    _bytes -= len(_entries.popitem(last=False)[1])
    finally:
        with _lock:
            del _pending[key]
        done.set()
    return answer, False


def default_start(now: datetime | None = None) -> datetime:
    """Start of the default Window: 00:00 UTC of the current day (ADR 0004)."""
    moment = (now or datetime.now(UTC)).astimezone(UTC)
    return moment.replace(hour=0, minute=0, second=0, microsecond=0)


def _warm_ids() -> list[str]:
    wanted = os.environ.get(WARM, "").strip()
    if wanted in ("", "0", "off"):
        return []
    ids = (
        [site["id"] for site in catalog.SITES]
        if wanted == "all"
        else [part.strip() for part in wanted.split(",") if part.strip()]
    )
    default = catalog.meta()["defaults"]["site_id"]
    # The default Site first: it is what the first visitor after a deploy asks for.
    return sorted(ids, key=lambda site_id: site_id != default)


_SCATTER = -2
_BAND = -3


def _warm_once(site_ids: list[str], stop: threading.Event | None = None) -> None:
    start = default_start()
    # (Site id, year, None for today's default Window, -1 for tomorrow's, _SCATTER for
    # the Landing scatter over today's or _BAND for the Uncertainty band over today's),
    # most wanted first.
    jobs: list[tuple[str, int | None]] = [(site_id, None) for site_id in site_ids]
    default = catalog.meta()["defaults"]["site_id"]
    if default in site_ids:
        # After every Curated Site, never before: the scatter is 19 engine runs, and the
        # page asks for it only once the main answer is on screen.
        jobs.append((default, _SCATTER))
        jobs += [(default, y) for y in (start.year, start.year + 1) if y <= WINDOW_MAX.year]
    # Tomorrow's default Window last: today's visitors come first, and two days of the
    # catalog (about 300 answers of 0.8 MB) still fit under MAX_ENTRIES and MAX_BYTES.
    tomorrow = start + timedelta(days=1)
    jobs += [(site_id, -1) for site_id in site_ids]
    # The Uncertainty band of every Curated Site over today's default Window, after all of
    # that: a band is 32 engine runs per Site, and the page asks for it only after the
    # main answer. Each clone takes the warming slot, so visitors still go first.
    jobs += [(site_id, _BAND) for site_id in site_ids]
    for site_id, year_number in jobs:
        # Shutdown stops between jobs; a job already running finishes.
        if stop is not None and stop.is_set():
            return
        site = catalog.find_site(site_id)
        if site is None:
            continue
        try:
            if year_number == -1:
                calculate(site, tomorrow, DEFAULT_DURATION_HOURS, DEFAULT_OBSERVER_HEIGHT_M)
            elif year_number == _BAND:
                from . import uncertainty

                uncertainty.compute_now(
                    site,
                    start,
                    DEFAULT_DURATION_HOURS,
                    DEFAULT_OBSERVER_HEIGHT_M,
                    should_stop=stop.is_set if stop is not None else None,
                )
            elif year_number == _SCATTER:
                from .scatter import DEFAULT_RADIUS_M

                scatter(
                    site, start, DEFAULT_DURATION_HOURS, DEFAULT_OBSERVER_HEIGHT_M, DEFAULT_RADIUS_M
                )
            elif year_number is None:
                calculate(site, start, DEFAULT_DURATION_HOURS, DEFAULT_OBSERVER_HEIGHT_M)
            else:
                year(site, year_number, DEFAULT_OBSERVER_HEIGHT_M)
        except Exception:  # noqa: BLE001  one bad Site must not stop the others
            _log.exception("warming %s failed", site_id)


def _warm_forever(site_ids: list[str], stop: threading.Event) -> None:
    _warming_thread.on = True
    while not stop.is_set():
        _warm_once(site_ids, stop)
        tomorrow = default_start() + timedelta(days=1)
        wait = (tomorrow - datetime.now(UTC)).total_seconds() + 5
        stop.wait(max(wait, 5))


def start_warming() -> threading.Event | None:
    """Start the warming thread if LUNAR_WARM_CACHE asks for it; returns its stop flag."""
    site_ids = _warm_ids()
    if not site_ids:
        return None
    stop = threading.Event()
    threading.Thread(
        target=_warm_forever, args=(site_ids, stop), name="warm-cache", daemon=True
    ).start()
    return stop
