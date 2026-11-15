"""The Uncertainty band of a Query: how far the answer moves with the DEM's own error (ADR 0006).

`GET /visibility/uncertainty` runs the Query over clones of the terrain (clones.py) and
reports, for each Event of the `/visibility` answer and for each metric, the 5th and the
95th percentile across the clones. It is heavy, so the first request starts a background
job and answers 202 with its progress, later ones answer 202 until it ends and then 200
from the cache, under the Query's own key.

Only the Horizon mask changes between clones, so the Sun and the Earth are computed once
(`engine.Sky`) and each clone is a mask and a scan. Each clone takes one engine slot,
politely, so a band never holds more than one and a visitor already queued goes first; at
most `LUNAR_UNCERTAINTY_JOBS` bands run at once (1), and a few more may wait.
"""

from __future__ import annotations

import bisect
import itertools
import json
import logging
import os
import threading
from collections import OrderedDict
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import numpy as np

from . import cache, clones, engine
from .catalog import Site
from .constants import ENGINE_VERSION
from .timeutil import iso_z

METHOD = "dem_error_clones"
# Bumped when the way a band is made changes, so old bands are not served as new ones.
METHOD_VERSION = "1"
LOWER_PERCENTILE = 5.0
UPPER_PERCENTILE = 95.0
POLL_SECONDS = 5
JOBS_ENV = "LUNAR_UNCERTAINTY_JOBS"
# Bands queued behind the ones running; past that a request is told the server is busy.
WAITING = 4
# A band is about 3 kB of JSON.
RESULTS_KEPT = 400
FAILED_KEPT = 50
METRICS = (
    "sunlit_hours",
    "earth_visible_hours",
    "sun_and_earth_hours",
    "lcsp_hours",
    "mean_sun_fraction",
)

Key = tuple[str, str, tuple[tuple[str, int, int], ...], datetime, float, float]
Events = list[tuple[str, datetime]]
Run = tuple[Events, dict[str, float]]

_log = logging.getLogger(__name__)


@dataclass(frozen=True)
class Pending:
    """The band is being computed: `clones_done` of `clones` are in."""

    clones_done: int
    clones: int


@dataclass(frozen=True)
class Done:
    """The band as JSON, and whether it was already computed."""

    body: bytes
    hit: bool


class Stopped(Exception):
    """The warming thread was asked to stop between two clones."""


class _Job:
    def __init__(self, total: int) -> None:
        self.total = total
        self.done = 0
        self.error: BaseException | None = None
        self.finished = threading.Event()


_lock = threading.Lock()
_results: OrderedDict[Key, bytes] = OrderedDict()
_jobs: dict[Key, _Job] = {}
_running = threading.BoundedSemaphore(max(1, int(os.environ.get(JOBS_ENV, "1"))))
_capacity = max(1, int(os.environ.get(JOBS_ENV, "1"))) + WAITING


def match(nominal: Events, clone: Events) -> list[datetime | None]:
    """For each nominal Event, the instant of the clone's Event it matches, or None.

    Same type, nearest in time. The nominal Events of one type cut the Window into cells at
    the midpoints between consecutive ones, and a clone Event only competes for the nominal
    Event of the cell it falls in, so two nominal Events never claim the same clone Event
    (ADR 0006). `nominal` is in time order, as the `/visibility` answer gives it.
    """
    matched: list[datetime | None] = [None] * len(nominal)
    for kind in {kind for kind, _ in nominal}:
        indices = [i for i, (k, _) in enumerate(nominal) if k == kind]
        times = [nominal[i][1] for i in indices]
        edges = [a + (b - a) / 2 for a, b in itertools.pairwise(times)]
        for k, instant in clone:
            if k != kind:
                continue
            cell = bisect.bisect_right(edges, instant)
            slot = indices[cell]
            held = matched[slot]
            if held is None or abs(instant - times[cell]) < abs(held - times[cell]):
                matched[slot] = instant
    return matched


def percentile(values: list[float], q: float) -> float:
    """The q-th percentile by linear interpolation between order statistics (numpy's default)."""
    return float(np.percentile(np.asarray(values, dtype=np.float64), q))


def _instant(seconds: float) -> datetime:
    return datetime.fromtimestamp(round(seconds), UTC)


def _events_of(answer: dict[str, Any]) -> Events:
    return [(e["type"], datetime.fromisoformat(e["t"])) for e in answer["events"]]


def assemble(
    nominal: dict[str, Any],
    runs: list[Run],
    covered: list[str],
    uncovered: list[str],
) -> dict[str, Any]:
    """The `UncertaintyResult` of a Query: the nominal answer's Events and the clones' runs."""
    nominal_events = _events_of(nominal)
    matches = [match(nominal_events, events) for events, _ in runs]
    bands: list[dict[str, Any]] = []
    for i, (kind, _) in enumerate(nominal_events):
        found = (instants[i] for instants in matches)
        times = [instant.timestamp() for instant in found if instant is not None]
        band: dict[str, Any] = {
            "type": kind,
            "t": nominal["events"][i]["t"],
            "clones_with_event": len(times),
        }
        # Left out when fewer than half of the clones have the Event: a percentile of the
        # few that do would read as the answer of the many that do not.
        if times and 2 * len(times) >= len(runs):
            band["earliest"] = iso_z(_instant(percentile(times, LOWER_PERCENTILE)))
            band["latest"] = iso_z(_instant(percentile(times, UPPER_PERCENTILE)))
        bands.append(band)
    return {
        "query": nominal["query"],
        "clones": len(runs),
        "method": METHOD,
        "error_products": [{"dem": product, "error": product + "_ERR"} for product in covered],
        "uncovered": uncovered,
        "events": bands,
        "metrics": {
            name: {
                "low": percentile([metrics[name] for _, metrics in runs], LOWER_PERCENTILE),
                "high": percentile([metrics[name] for _, metrics in runs], UPPER_PERCENTILE),
            }
            for name in METRICS
        },
    }


def _json(answer: dict[str, Any]) -> bytes:
    return json.dumps(answer, separators=(",", ":"), allow_nan=False).encode()


def _key(site: Site, start: datetime, hours: float, height_m: float, found: clones.Coverage) -> Key:
    name = site["id"] if site["curated"] else f"{site['latitude_deg']!r},{site['longitude_deg']!r}"
    settings = (
        f"{ENGINE_VERSION}/{METHOD}-{METHOD_VERSION}/{clones.clone_count()}"
        f"/{clones.SEED}/{clones.correlation_m()!r}"
    )
    return (name, settings, clones.fingerprint(found), start, hours, height_m)


def _store(key: Key, body: bytes) -> None:
    with _lock:
        _results[key] = body
        _results.move_to_end(key)
        while len(_results) > RESULTS_KEPT:
            _results.popitem(last=False)
        _jobs.pop(key, None)


def _unfinished() -> int:
    return sum(1 for job in _jobs.values() if not job.finished.is_set())


def _forget_old_failures() -> None:
    failed = [key for key, job in _jobs.items() if job.error is not None]
    for key in failed[: max(0, len(failed) - FAILED_KEPT)]:
        del _jobs[key]


def request(
    site: Site,
    start: datetime,
    duration_hours: float,
    height_m: float,
    *,
    inline: bool = False,
    should_stop: Callable[[], bool] | None = None,
) -> Pending | Done:
    """The band of a Query: its JSON if it is computed, else the progress of its job.

    The first call starts the job in its own thread, or runs it here when `inline` (the
    warming thread). The `/visibility` answer the band is read against is computed here,
    in the caller, so a Query without terrain or a queue that is full answers as
    `/visibility` does (DemUnavailable, Busy) instead of failing in the background. A job
    that failed reports its error to the next caller, once, and the one after starts again.
    """
    found = clones.coverage(site["id"])
    key = _key(site, start, duration_hours, height_m, found)
    with _lock:
        body = _results.get(key)
        if body is not None:
            _results.move_to_end(key)
            return Done(body, True)
        job = _jobs.get(key)
        if job is not None and job.error is not None:
            del _jobs[key]
            raise job.error
    if job is not None:
        if not inline:
            return Pending(job.done, job.total)
        # The warming thread waits for a band a visitor started instead of running it twice.
        job.finished.wait()
        return request(
            site, start, duration_hours, height_m, inline=inline, should_stop=should_stop
        )

    raw, _ = cache.calculate(site, start, duration_hours, height_m)
    nominal: dict[str, Any] = json.loads(raw)
    if not found.covered:
        # No error raster beside any DEM of this Site: nothing to vary, so the band is
        # the nominal answer itself and says which DEMs it could not vary.
        run: Run = (_events_of(nominal), nominal["metrics"])
        body = _json(assemble(nominal, [run], [], [band.product for band in found.bands]))
        _store(key, body)
        return Done(body, False)

    started: _Job | None = None
    with _lock:
        # Someone else may have computed or started it while the `/visibility` answer ran.
        if key not in _results and key not in _jobs:
            if _unfinished() >= _capacity:
                raise cache.Busy
            _forget_old_failures()
            started = _jobs[key] = _Job(clones.clone_count())
    if started is None:
        return request(
            site, start, duration_hours, height_m, inline=inline, should_stop=should_stop
        )
    arguments = (started, key, site, start, duration_hours, height_m, nominal, found, should_stop)
    if inline:
        try:
            return Done(_run(*arguments), False)
        except BaseException:
            with _lock:
                _jobs.pop(key, None)
            raise
        finally:
            started.finished.set()
    threading.Thread(
        target=_in_background, args=arguments, name="uncertainty-band", daemon=True
    ).start()
    return Pending(0, started.total)


def compute_now(
    site: Site,
    start: datetime,
    duration_hours: float,
    height_m: float,
    should_stop: Callable[[], bool] | None = None,
) -> None:
    """Compute a band in the calling thread (the warming thread) and keep it."""
    try:
        request(site, start, duration_hours, height_m, inline=True, should_stop=should_stop)
    except Stopped:
        pass


def _in_background(
    job: _Job,
    key: Key,
    site: Site,
    start: datetime,
    duration_hours: float,
    height_m: float,
    nominal: dict[str, Any],
    found: clones.Coverage,
    should_stop: Callable[[], bool] | None,
) -> None:
    try:
        _run(job, key, site, start, duration_hours, height_m, nominal, found, should_stop)
    except BaseException as error:  # noqa: BLE001  kept for the next request to report
        _log.exception("uncertainty band for %s failed", site["id"])
        job.error = error
    finally:
        job.finished.set()


def _run(
    job: _Job,
    key: Key,
    site: Site,
    start: datetime,
    duration_hours: float,
    height_m: float,
    nominal: dict[str, Any],
    found: clones.Coverage,
    should_stop: Callable[[], bool] | None,
) -> bytes:
    end = start + timedelta(hours=duration_hours)
    with _running:
        with cache.engine_slot(polite=True):
            source = clones.CloneSource(site, height_m, found)
            sky = engine.make_sky(site, height_m)
        runs: list[Run] = []
        for index in range(job.total):
            if should_stop is not None and should_stop():
                raise Stopped
            # One engine slot per clone, given back before the next: a band never holds two.
            with cache.engine_slot(polite=True):
                runs.append(engine.band_run(sky, start, end, source.mask(index)))
            job.done = index + 1
    body = _json(assemble(nominal, runs, source.covered_products, source.uncovered_products))
    _store(key, body)
    return body
