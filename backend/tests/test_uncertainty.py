"""The Uncertainty band (ADR 0006, `GET /visibility/uncertainty`), mostly through the HTTP API.

The fixtures have no per-pixel error rasters (they would add tens of MB), so the tests
that need clones write their own on the fixture DEMs' grids: a constant 1 sigma, set large
enough that the clones visibly differ. What the numbers must be is worked out here, apart
from the code: the percentiles, the matching, and the random field's variance and
correlation.
"""

import threading
import time
from collections.abc import Callable, Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import numpy as np
import pytest
import rasterio  # type: ignore[import-untyped]
from fastapi.testclient import TestClient

from app import cache, catalog, clones, engine, horizon, uncertainty
from app.main import app
from tests.test_polar_wide import W20, W60, W240, _dems

client = TestClient(app)
# CR05 in late November 2026: the Sun sets and the Earth sets inside the Window.
CR05 = {"site_id": "CR05", "start": "2026-11-14T00:00:00Z", "duration_hours": 400}
SIGMA_M = 2.0
CLONES = 3
START = datetime(2026, 11, 14, tzinfo=UTC)


@pytest.fixture(autouse=True)
def fresh_bands(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """No band, job or clone mask kept from another test, and three clones a band."""
    monkeypatch.setenv(clones.CLONES_ENV, str(CLONES))
    with uncertainty._lock:
        uncertainty._results.clear()
        uncertainty._jobs.clear()
    with clones._masks_lock:
        clones._masks.clear()
    yield
    for thread in threading.enumerate():
        if thread.name == "uncertainty-band":
            thread.join(timeout=120)


@pytest.fixture(scope="module")
def error_dir(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """The fixture DEMs, linked, with an error raster of SIGMA_M on each one's grid."""
    folder = tmp_path_factory.mktemp("dem-with-errors")
    for band in horizon.LADDER:
        source = horizon.dem_dir() / f"{band.product}.TIF"
        (folder / source.name).symlink_to(source)
        with rasterio.open(source) as dem:
            profile = {
                **dem.profile,
                "dtype": "float32",
                "nodata": float("nan"),
                "compress": "deflate",
                "predictor": 3,
            }
            with rasterio.open(horizon.error_path(folder, band), "w", **profile) as err:
                err.write(np.full((dem.height, dem.width), SIGMA_M, dtype=np.float32), 1)
    return folder


@pytest.fixture
def with_errors(error_dir: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setenv("LUNAR_DEM_DIR", str(error_dir))
    return error_dir


def wait_for_band(params: dict[str, Any], seconds: float = 120) -> dict[str, Any]:
    """Ask until the job is done, as the page does; returns the 200 body."""
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        response = client.get("/visibility/uncertainty", params=params)
        if response.status_code == 200:
            payload: dict[str, Any] = response.json()
            return payload
        assert response.status_code == 202, response.text
        time.sleep(0.05)
    raise AssertionError("the band never finished")


# --- the random field: unit variance, Gaussian correlation ----------------------------------


def test_the_error_field_has_unit_variance_and_the_stated_correlation() -> None:
    rng = np.random.default_rng(7)
    sigma_px = 2.0  # correlation length 2 * 2 = 4 px: exp(-(r / 4)^2)
    field = clones.correlated_field((500, 500), sigma_px, rng)
    assert abs(float(field.mean())) < 0.05
    assert abs(float(field.var()) - 1.0) < 0.05
    for lag in (1, 2, 4, 8):
        along = float(np.mean(field[:, :-lag] * field[:, lag:]))
        down = float(np.mean(field[:-lag, :] * field[lag:, :]))
        expected = float(np.exp(-((lag / 4.0) ** 2)))
        assert abs(along - expected) < 0.05, (lag, along, expected)
        assert abs(down - expected) < 0.05, (lag, down, expected)


def test_an_unsmoothed_field_is_white_noise_of_the_asked_shape() -> None:
    field = clones.correlated_field((37, 51), 0.0, np.random.default_rng(1))
    assert field.shape == (37, 51)
    assert abs(float(np.mean(field[:, :-1] * field[:, 1:]))) < 0.1


# --- matching ------------------------------------------------------------------------------


def at(hours: float) -> datetime:
    return START + timedelta(hours=hours)


def test_an_event_matches_the_nearest_of_its_own_type_inside_its_cell() -> None:
    nominal = [("sunset", at(0)), ("sunrise", at(1)), ("sunset", at(10))]
    clone = [
        ("sunset", at(0.05)),  # nearest to the first sunset
        ("sunset", at(4)),  # same cell, farther: ignored
        ("sunset", at(8)),  # past the midpoint (5 h): belongs to the second sunset
        ("earthset", at(1)),  # another type: nothing to match
    ]
    assert uncertainty.match(nominal, clone) == [at(0.05), None, at(8)]


def test_two_nominal_events_never_claim_the_same_clone_event() -> None:
    nominal = [("earthset", at(0)), ("earthset", at(100))]
    clone = [("earthset", at(49))]  # 49 h from the first, 51 h from the second
    assert uncertainty.match(nominal, clone) == [at(49), None]


def test_an_event_with_no_clone_event_of_its_type_has_no_match() -> None:
    assert uncertainty.match([("sunset", at(0))], []) == [None]
    assert uncertainty.match([("sunset", at(0))], [("sunrise", at(0))]) == [None]


# --- percentiles ---------------------------------------------------------------------------


def linear_percentile(values: list[float], q: float) -> float:
    """Percentile by linear interpolation between order statistics, written out by hand."""
    ordered = sorted(values)
    rank = q / 100.0 * (len(ordered) - 1)
    below = int(rank)
    above = min(below + 1, len(ordered) - 1)
    return ordered[below] + (ordered[above] - ordered[below]) * (rank - below)


def run(shift_s: float, metrics: dict[str, float]) -> uncertainty.Run:
    return [("earthset", START + timedelta(hours=100, seconds=shift_s))], metrics


def test_the_band_is_the_5th_and_95th_percentile_of_the_clones() -> None:
    shifts = [-310.0, -45.0, -3.0, 0.0, 12.0, 40.0, 95.0, 400.0, 1_000.0, 2_500.0]
    names = uncertainty.METRICS
    values = [[float(i * 7 + j * j) / 3.0 for i in range(len(shifts))] for j in range(len(names))]
    runs = [
        run(shift, {name: values[j][i] for j, name in enumerate(names)})
        for i, shift in enumerate(shifts)
    ]
    nominal = {
        "query": {"site": {"id": "x"}},
        "events": [{"type": "earthset", "t": "2026-11-18T04:00:00Z"}],
    }
    band = uncertainty.assemble(nominal, runs, ["LDEM_A"], ["LDEM_B"])
    base = (START + timedelta(hours=100)).timestamp()
    low = datetime.fromtimestamp(round(base + linear_percentile(shifts, 5)), UTC)
    high = datetime.fromtimestamp(round(base + linear_percentile(shifts, 95)), UTC)
    event = band["events"][0]
    assert event["earliest"] == low.strftime("%Y-%m-%dT%H:%M:%SZ")
    assert event["latest"] == high.strftime("%Y-%m-%dT%H:%M:%SZ")
    assert event["clones_with_event"] == len(shifts)
    assert event["t"] == "2026-11-18T04:00:00Z"
    for j, name in enumerate(names):
        assert band["metrics"][name]["low"] == pytest.approx(linear_percentile(values[j], 5))
        assert band["metrics"][name]["high"] == pytest.approx(linear_percentile(values[j], 95))
    assert band["clones"] == len(shifts)
    assert band["method"] == "dem_error_clones"
    assert band["error_products"] == [{"dem": "LDEM_A", "error": "LDEM_A_ERR"}]
    assert band["uncovered"] == ["LDEM_B"]


def test_an_event_most_clones_lack_gets_no_times_but_its_count() -> None:
    nominal = {
        "query": {},
        "events": [{"type": "sunset", "t": "2026-11-14T00:00:00Z"}],
    }
    metrics = dict.fromkeys(uncertainty.METRICS, 1.0)
    has: uncertainty.Run = ([("sunset", at(0.1))], metrics)
    lacks: uncertainty.Run = ([], metrics)
    fewer = uncertainty.assemble(nominal, [has, lacks, lacks], [], [])["events"][0]
    assert fewer["clones_with_event"] == 1
    assert "earliest" not in fewer and "latest" not in fewer
    # Exactly half is enough to give the times.
    half = uncertainty.assemble(nominal, [has, lacks], [], [])["events"][0]
    assert half["clones_with_event"] == 1
    assert half["earliest"] == half["latest"] == "2026-11-14T00:06:00Z"


# --- the engine: a clone is the same run on another mask ------------------------------------


def test_a_clone_without_error_gives_the_visibility_answer_to_the_second() -> None:
    site = catalog.find_site("CR05")
    assert site is not None
    answer = engine.calculate(site, START, 400.0, 2.0)
    mask = horizon.mask(site["latitude_deg"], site["longitude_deg"], 2.0, site_id=site["id"])
    events, metrics = engine.band_run(
        engine.make_sky(site, 2.0), START, START + timedelta(hours=400), mask
    )
    assert [(kind, t.strftime("%Y-%m-%dT%H:%M:%SZ")) for kind, t in events] == [
        (e["type"], e["t"]) for e in answer["events"]
    ]
    assert len(events) >= 2
    for name in uncertainty.METRICS:
        assert metrics[name] == answer["metrics"][name]


# --- the route: 202, then 200 ----------------------------------------------------------------


def test_the_first_request_answers_202_with_progress_then_200_from_the_cache(
    with_errors: Path,
) -> None:
    first = client.get("/visibility/uncertainty", params=CR05)
    assert first.status_code == 202, first.text
    assert first.json() == {"status": "computing", "clones_done": 0, "clones": CLONES}
    assert int(first.headers["Retry-After"]) >= 1
    band = wait_for_band(CR05)
    again = client.get("/visibility/uncertainty", params=CR05)
    assert again.status_code == 200
    assert again.headers["cache-status"] == "lunar-api; hit"
    assert again.json() == band

    plain = client.get("/visibility", params=CR05).json()
    assert band["query"] == plain["query"]
    assert band["clones"] == CLONES
    assert band["method"] == "dem_error_clones"
    assert [p["dem"] for p in band["error_products"]] == [
        "LDEM_80S_20MPP_ADJ",
        "LDEM_80S_80MPP_ADJ",
        "LDEM_60S_240MPP_ADJ",
    ]
    assert [p["error"] for p in band["error_products"]] == [
        p["dem"] + "_ERR" for p in band["error_products"]
    ]
    assert band["uncovered"] == []
    # One band per Event of /visibility, same order, with its nominal time untouched.
    assert [(e["type"], e["t"]) for e in band["events"]] == [
        (e["type"], e["t"]) for e in plain["events"]
    ]
    assert all(0 <= e["clones_with_event"] <= CLONES for e in band["events"])
    for name in uncertainty.METRICS:
        assert band["metrics"][name]["low"] <= band["metrics"][name]["high"]
    # SIGMA_M is large on purpose: the clones are not the nominal terrain.
    assert any(m["low"] != m["high"] for m in band["metrics"].values()) or any(
        e.get("earliest") != e.get("latest") for e in band["events"]
    )


def test_progress_is_reported_while_the_clones_run(
    with_errors: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    gate = threading.Event()
    reached = threading.Event()
    real = engine.band_run
    calls: list[int] = []

    def slow(*args: Any, **kwargs: Any) -> Any:
        calls.append(1)
        if len(calls) == 2:
            reached.set()
            assert gate.wait(60)
        return real(*args, **kwargs)

    monkeypatch.setattr(engine, "band_run", slow)
    assert client.get("/visibility/uncertainty", params=CR05).status_code == 202
    assert reached.wait(60)
    middle = client.get("/visibility/uncertainty", params=CR05)
    assert middle.status_code == 202
    assert middle.json() == {"status": "computing", "clones_done": 1, "clones": CLONES}
    gate.set()
    wait_for_band(CR05)


def test_the_same_query_on_the_same_data_gives_the_same_band(with_errors: Path) -> None:
    client.get("/visibility/uncertainty", params=CR05)
    first = wait_for_band(CR05)
    with uncertainty._lock:
        uncertainty._results.clear()
    with clones._masks_lock:
        clones._masks.clear()
    client.get("/visibility/uncertainty", params=CR05)
    assert wait_for_band(CR05) == first


def test_another_seed_gives_other_clones(with_errors: Path) -> None:
    site = catalog.find_site("CR05")
    assert site is not None
    one = clones.CloneSource(site, 2.0, seed=1).mask(0).elevations_deg
    again = clones.CloneSource(site, 2.0, seed=1).mask(0).elevations_deg
    other = clones.CloneSource(site, 2.0, seed=2).mask(0).elevations_deg
    nominal = horizon.mask(site["latitude_deg"], site["longitude_deg"], 2.0, site_id="CR05")
    assert np.array_equal(one, again)
    assert not np.array_equal(one, other)
    assert not np.array_equal(one, nominal.elevations_deg)


def test_a_second_window_on_the_same_site_reuses_the_clone_masks(
    with_errors: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    computed: list[int] = []
    real = horizon._compute

    def counted(*args: Any, **kwargs: Any) -> Any:
        computed.append(1)
        return real(*args, **kwargs)

    monkeypatch.setattr(horizon, "_compute", counted)
    client.get("/visibility/uncertainty", params=CR05)
    wait_for_band(CR05)
    # The clones' masks (and the nominal one, unless an earlier test kept it).
    after_first = len(computed)
    assert after_first >= CLONES
    later = {**CR05, "start": "2026-11-15T00:00:00Z"}
    client.get("/visibility/uncertainty", params=later)
    wait_for_band(later)
    assert len(computed) == after_first


# --- the engine gate -------------------------------------------------------------------------


class RecordingGate(cache._Gate):
    def __init__(self, slots: int) -> None:
        super().__init__(slots)
        self.log: list[tuple[str, int]] = []
        self.most_held = 0
        self._held = 0

    def acquire(self, warming: bool, polite: bool = False) -> None:
        super().acquire(warming, polite)
        self._held += 1
        self.most_held = max(self.most_held, self._held)
        self.log.append(("acquire", threading.get_ident()))

    def release(self, warming: bool) -> None:
        self._held -= 1
        self.log.append(("release", threading.get_ident()))
        super().release(warming)


def test_a_band_takes_one_engine_slot_and_lets_go_between_clones(
    with_errors: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    gate = RecordingGate(2)
    monkeypatch.setattr(cache, "_gate", gate)
    client.get("/visibility/uncertainty", params=CR05)
    wait_for_band(CR05)
    # The /visibility answer, the DEM windows and the Sky, then one slot per clone; each
    # taken and given back in turn, never two at once, none kept.
    assert [kind for kind, _ in gate.log] == ["acquire", "release"] * (2 + CLONES)
    assert gate.most_held == 1
    assert gate._free == 2


def test_a_visitor_queued_during_a_band_goes_before_its_next_clone(
    with_errors: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """One engine slot: a /visibility asked while a clone runs gets it before the next clone."""
    gate = cache._Gate(1)
    monkeypatch.setattr(cache, "_gate", gate)
    band_run = engine.band_run
    calculate = engine.calculate
    order: list[str] = []
    visitor: list[int] = []
    other = {"latitude_deg": -89.4661, "longitude_deg": -136.949, "start": CR05["start"]}

    def ask() -> None:
        visitor.append(
            client.get("/visibility", params={**other, "duration_hours": 24}).status_code
        )

    def clone(*args: Any, **kwargs: Any) -> Any:
        order.append("clone")
        if order.count("clone") == 1:
            threading.Thread(target=ask).start()
            deadline = time.monotonic() + 20
            while gate._visitors_waiting == 0 and time.monotonic() < deadline:
                time.sleep(0.01)
            assert gate._visitors_waiting == 1, "the visitor never queued"
        return band_run(*args, **kwargs)

    def answer(site: Any, *args: Any, **kwargs: Any) -> Any:
        # Called inside the slot, so the order is the order the slots were given.
        if not site["curated"]:
            order.append("visitor")
        return calculate(site, *args, **kwargs)

    monkeypatch.setattr(engine, "band_run", clone)
    monkeypatch.setattr(engine, "calculate", answer)
    client.get("/visibility/uncertainty", params=CR05)
    wait_for_band(CR05)
    deadline = time.monotonic() + 20
    while not visitor and time.monotonic() < deadline:
        time.sleep(0.01)
    assert visitor == [200]
    assert order[:3] == ["clone", "visitor", "clone"]


# --- bounded jobs ----------------------------------------------------------------------------


def test_a_band_that_finds_the_queue_full_gets_busy_and_the_running_one_finishes(
    with_errors: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(uncertainty, "_capacity", 1)
    release = threading.Event()
    reached = threading.Event()
    real = engine.band_run

    def held(*args: Any, **kwargs: Any) -> Any:
        reached.set()
        assert release.wait(60)
        return real(*args, **kwargs)

    monkeypatch.setattr(engine, "band_run", held)
    assert client.get("/visibility/uncertainty", params=CR05).status_code == 202
    assert reached.wait(60)
    other = {**CR05, "site_id": "CR06"}
    busy = client.get("/visibility/uncertainty", params=other)
    assert busy.status_code == 503
    assert busy.json()["code"] == "busy"
    assert int(busy.headers["Retry-After"]) >= 1
    # Asking again for the running band is not a new job.
    assert client.get("/visibility/uncertainty", params=CR05).status_code == 202
    release.set()
    assert wait_for_band(CR05)["clones"] == CLONES


def test_a_job_that_failed_tells_the_next_request_once_and_the_one_after_starts_again(
    with_errors: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    real = engine.band_run
    attempts: list[int] = []

    def broken(*args: Any, **kwargs: Any) -> Any:
        attempts.append(1)
        if len(attempts) == 1:
            raise horizon.DemUnavailable("LDEM_X", "gone")
        return real(*args, **kwargs)

    monkeypatch.setattr(engine, "band_run", broken)
    assert client.get("/visibility/uncertainty", params=CR05).status_code == 202
    for thread in threading.enumerate():
        if thread.name == "uncertainty-band":
            thread.join(timeout=60)
    told = client.get("/visibility/uncertainty", params=CR05)
    assert told.status_code == 422
    assert told.json()["code"] == "outside_coverage"
    assert client.get("/visibility/uncertainty", params=CR05).status_code == 202
    assert wait_for_band(CR05)["clones"] == CLONES


# --- without error rasters ---------------------------------------------------------------------


def test_a_site_with_no_error_raster_gets_its_nominal_answer_as_a_band_of_one() -> None:
    response = client.get("/visibility/uncertainty", params=CR05)
    assert response.status_code == 200, response.text
    band = response.json()
    plain = client.get("/visibility", params=CR05).json()
    assert band["clones"] == 1
    assert band["error_products"] == []
    assert band["uncovered"] == ["LDEM_80S_20MPP_ADJ", "LDEM_80S_80MPP_ADJ", "LDEM_60S_240MPP_ADJ"]
    for event, nominal in zip(band["events"], plain["events"], strict=True):
        assert event["t"] == event["earliest"] == event["latest"] == nominal["t"]
        assert event["clones_with_event"] == 1
    for name in uncertainty.METRICS:
        assert band["metrics"][name] == {
            "low": plain["metrics"][name],
            "high": plain["metrics"][name],
        }


def test_a_query_without_terrain_is_refused_as_visibility_refuses_it() -> None:
    # MMO01 is outside the fixture DEM windows.
    params = {"site_id": "MMO01", "start": "2026-11-14T00:00:00Z"}
    assert client.get("/visibility", params=params).status_code == 422
    refused = client.get("/visibility/uncertainty", params=params)
    assert refused.status_code == 422
    assert refused.json()["code"] == "outside_coverage"


def test_a_custom_site_gets_a_band_too_and_the_bad_queries_are_refused(with_errors: Path) -> None:
    custom = {
        "latitude_deg": -89.4661,
        "longitude_deg": -136.949,
        "start": "2026-11-14T00:00:00Z",
        "duration_hours": 48,
    }
    client.get("/visibility/uncertainty", params=custom)
    band = wait_for_band(custom)
    assert band["query"]["site"]["curated"] is False
    both = client.get("/visibility/uncertainty", params={**custom, "site_id": "001"})
    assert both.status_code == 422
    missing = client.get("/visibility/uncertainty", params={"start": "2026-11-14T00:00:00Z"})
    assert missing.status_code == 422


# --- warming ---------------------------------------------------------------------------------


def test_the_curated_sites_bands_are_warmed_after_everything_else(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("LUNAR_WARM_CACHE", "CR06")
    monkeypatch.setattr(cache, "DEFAULT_DURATION_HOURS", 24.0)
    monkeypatch.setattr(cache, "year", lambda *_: (b"{}", False))
    tomorrow = cache.default_start() + timedelta(days=1)
    seen: list[bool] = []
    real: Callable[..., None] = uncertainty.compute_now

    def recorded(site: Any, *args: Any, **kwargs: Any) -> None:
        with cache._lock:
            tomorrow_done = any(key[0] == "CR06" and key[3] == tomorrow for key in cache._entries)
        seen.append(tomorrow_done)
        real(site, *args, **kwargs)

    monkeypatch.setattr(uncertainty, "compute_now", recorded)
    with TestClient(app):
        deadline = time.monotonic() + 120
        while time.monotonic() < deadline:
            with uncertainty._lock:
                if any(key[0] == "CR06" for key in uncertainty._results):
                    break
            time.sleep(0.2)
    assert seen == [True]
    answer = client.get(
        "/visibility/uncertainty",
        params={
            "site_id": "CR06",
            "start": cache.default_start().strftime("%Y-%m-%dT%H:%M:%SZ"),
            "duration_hours": 24,
        },
    )
    assert answer.status_code == 200
    assert answer.headers["cache-status"] == "lunar-api; hit"


# --- a typed point past the 80 m square (60 m DEM, no published error) -----------------------


def test_the_band_of_a_point_the_60_m_dem_answers_lists_it_as_uncovered(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """15/11/2026: the band asked the polar ladder for its bands, so a point past the 80 m
    square, which `/visibility` answers with the 60 m DEM, got a failure instead of a band."""
    _dems(tmp_path, with_60=True, eighty_covers_site=False)
    for product in (W20, W240):
        source = tmp_path / f"{product}.TIF"
        with rasterio.open(source) as dem:
            profile = {**dem.profile, "dtype": "float32", "nodata": float("nan")}
            error = np.full((dem.height, dem.width), SIGMA_M, dtype=np.float32)
        error_path = tmp_path / f"{product}{horizon.ERROR_SUFFIX}.TIF"
        with rasterio.open(error_path, "w", **profile) as out:
            out.write(error, 1)
    monkeypatch.setenv("LUNAR_DEM_DIR", str(tmp_path))
    params = {
        "latitude_deg": -84.0,
        "longitude_deg": 0.0,
        "start": "2026-11-14T00:00:00Z",
        "duration_hours": 100,
    }

    plain = client.get("/visibility", params=params)
    assert plain.status_code == 200, plain.text
    assert [d["product"] for d in plain.json()["provenance"]["dems"]] == [W20, W60, W240]

    band = wait_for_band(params)
    assert band["clones"] == CLONES
    assert band["uncovered"] == [W60]
    assert [p["dem"] for p in band["error_products"]] == [W20, W240]
    assert all(metric["low"] <= metric["high"] for metric in band["metrics"].values()), band[
        "metrics"
    ]
