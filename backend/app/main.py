"""HTTP routes for the lunar visibility API."""

from __future__ import annotations

import json
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Annotated, Any, Literal

from fastapi import FastAPI, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import (
    assistant,
    cache,
    catalog,
    dsn,
    energy,
    ground,
    hazard,
    heights,
    horizon,
    landing_area,
    neighbours,
    route,
    route_plan,
    rovers,
    scatter,
    slope,
    uncertainty,
    windows,
)
from . import flat as flat_horizon
from .constants import DEFAULT_DURATION_HOURS, DEFAULT_OBSERVER_HEIGHT_M, WINDOW_MAX, WINDOW_MIN
from .problems import ApiProblem, missing_site, on_busy, on_problem, on_validation
from .ratelimit import PerIpLimit
from .timeutil import as_utc


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    # Warming runs in its own thread, so the service is up (and /health answers)
    # while the Curated Sites are still being computed.
    stop = cache.start_warming()
    yield
    if stop is not None:
        stop.set()


app = FastAPI(title="Lunar Landing Site Navigator API", version="0.1.0", lifespan=lifespan)
# Added before CORS so CORS wraps it: a browser over the cap must still read the 503.
app.add_middleware(PerIpLimit)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://lunar.luizfbm.win"],
    allow_origin_regex=r"http://localhost(:\d+)?",
    allow_methods=["*"],
    allow_headers=["*"],
    # The page is on another origin: without this the browser hides the wait of a 503 busy.
    expose_headers=["Retry-After"],
)
app.add_exception_handler(ApiProblem, on_problem)
app.add_exception_handler(cache.Busy, on_busy)
app.add_exception_handler(RequestValidationError, on_validation)


# The light routes are async so they run on the event loop. Sync routes share the
# thread pool with /visibility, whose engine runs queue there behind the cache's
# semaphore, so a burst of uncached Queries used to stall /meta and /health with them.
@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/meta")
async def meta() -> dict[str, Any]:
    meta = catalog.meta()
    # The DSN link's kernels are listed after the main ones (the requirement).
    return {
        **meta,
        "kernels": [*meta["kernels"], *dsn.listed_kernels()],
        "dems": horizon.products(),
    }


@app.get("/regions")
async def regions() -> list[dict[str, Any]]:
    return catalog.regions()


@app.get("/sites")
async def sites(
    region_id: str | None = None, q: str | None = Query(None, max_length=100)
) -> list[catalog.Site]:
    return catalog.list_sites(region_id, q)


@app.get("/sites/{site_id}")
async def site(site_id: str) -> catalog.Site:
    found = catalog.find_site(site_id)
    if found is None:
        raise missing_site(site_id)
    return found


_VALIDATIONS_FILE = Path(__file__).resolve().parent / "data" / "validations.json"


@app.get("/sites/{site_id}/year")
def site_year(
    site_id: str,
    year_number: int = Query(alias="year"),
    observer_height_m: float = Query(DEFAULT_OBSERVER_HEIGHT_M, ge=0, le=50),
) -> Response:
    found = catalog.find_site(site_id)
    if found is None:
        raise missing_site(site_id)
    # Only whole years: the Window starts on 1 August 2023, so the first one is 2024.
    first_year = WINDOW_MIN.year + (WINDOW_MIN != datetime(WINDOW_MIN.year, 1, 1, tzinfo=UTC))
    if not first_year <= year_number <= WINDOW_MAX.year:
        raise ApiProblem(
            "window_out_of_range", "Window out of range", "Year is outside engine coverage."
        )
    try:
        answer, hit = cache.year(found, year_number, observer_height_m)
    except horizon.DemUnavailable as missing:
        # Same rule as /visibility: without terrain there is no honest answer.
        raise ApiProblem(
            "outside_coverage",
            "Outside coverage",
            f"No DEM covers the Horizon mask of this Site ({missing}).",
        ) from missing
    status = "lunar-api; hit" if hit else "lunar-api; fwd=miss"
    return Response(answer, media_type="application/json", headers={"Cache-Status": status})


@app.get("/validations")
async def validations() -> list[Any]:
    """The latest run of the validation suite, which writes this file (validation/proof.py)."""
    raw = os.environ.get("LUNAR_VALIDATIONS_FILE")
    path = Path(raw) if raw else _VALIDATIONS_FILE
    if not path.is_file():
        return []
    entries: list[Any] = json.loads(path.read_text("utf-8"))
    return entries


def _query(
    site_id: str | None,
    latitude_deg: float | None,
    longitude_deg: float | None,
    start: datetime | None,
    duration_hours: float,
) -> tuple[catalog.Site, datetime]:
    """The Site and the Window start of a Query, or the problem that rejects it."""
    custom = latitude_deg is not None or longitude_deg is not None
    if site_id is None and not custom:
        raise ApiProblem("missing_site", "Missing Site", "Pass site_id or both custom coordinates.")
    if site_id is not None and custom:
        raise ApiProblem(
            "ambiguous_site", "Ambiguous Site", "Pass site_id or custom coordinates, not both."
        )
    if start is None:
        raise ApiProblem("invalid_parameter", "Invalid parameter", "start is required.")
    if custom and (latitude_deg is None or longitude_deg is None):
        raise ApiProblem("ambiguous_site", "Ambiguous Site", "Pass both custom coordinates.")
    out_of_range = ApiProblem(
        "window_out_of_range", "Window out of range", "Window is outside engine coverage."
    )
    try:
        instant = as_utc(start)
        end = instant + timedelta(hours=duration_hours)
    except OverflowError:
        # Year 1 or 9999 with an offset, or a Window that ends past year 9999: the date
        # does not fit the calendar, so it is as far out of range as a date can be.
        raise out_of_range from None
    if instant < WINDOW_MIN or end > WINDOW_MAX:
        raise out_of_range
    if site_id is not None:
        selected = catalog.find_site(site_id)
        if selected is None:
            raise missing_site(site_id)
    else:
        assert latitude_deg is not None and longitude_deg is not None
        ground.check_custom_latitude(latitude_deg)
        selected = catalog.custom_site(latitude_deg, longitude_deg)
    return selected, instant


def _answer(
    site: catalog.Site,
    start: datetime,
    duration_hours: float,
    height_m: float,
    finest_m: float = 20.0,
) -> tuple[bytes, bool]:
    try:
        return cache.calculate(site, start, duration_hours, height_m, finest_m)
    except horizon.DemUnavailable as missing:
        # Never fall back to a flat horizon: without terrain there is no honest answer.
        raise ApiProblem(
            "outside_coverage",
            "Outside coverage",
            f"No DEM covers the Horizon mask of this Site ({missing}).",
        ) from missing


def _cache_status(hit: bool) -> str:
    # RFC 9211 Cache-Status, so the cache is visible from outside.
    return "lunar-api; hit" if hit else "lunar-api; fwd=miss"


@app.get("/visibility")
def get_visibility(
    site_id: str | None = None,
    latitude_deg: float | None = Query(None, ge=-90, le=90),
    longitude_deg: float | None = Query(None, ge=-180, le=180),
    start: datetime | None = None,
    duration_hours: float = Query(DEFAULT_DURATION_HOURS, gt=0, le=1440),
    observer_height_m: float = Query(DEFAULT_OBSERVER_HEIGHT_M, ge=0, le=50),
) -> Response:
    selected, instant = _query(site_id, latitude_deg, longitude_deg, start, duration_hours)
    answer, hit = _answer(selected, instant, duration_hours, observer_height_m)
    return Response(
        answer, media_type="application/json", headers={"Cache-Status": _cache_status(hit)}
    )


LADDER_METRICS = (
    "sun_and_earth_hours",
    "sunlit_hours",
    "earth_visible_hours",
    "lcip_hours",
    "lcsp_hours",
    "mean_sun_fraction",
)


@app.get("/visibility/ladder")
def get_visibility_ladder(
    site_id: str | None = None,
    latitude_deg: float | None = Query(None, ge=-90, le=90),
    longitude_deg: float | None = Query(None, ge=-180, le=180),
    start: datetime | None = None,
    duration_hours: float = Query(DEFAULT_DURATION_HOURS, gt=0, le=1440),
    observer_height_m: float = Query(DEFAULT_OBSERVER_HEIGHT_M, ge=0, le=50),
) -> Response:
    """The same Query with the Horizon mask built from coarser DEMs only (ADR 0003)."""
    selected, instant = _query(site_id, latitude_deg, longitude_deg, start, duration_hours)
    rungs: list[dict[str, Any]] = []
    query: dict[str, Any] = {}
    all_hit = True
    for finest in horizon.RUNGS_M:
        raw, hit = _answer(selected, instant, duration_hours, observer_height_m, finest)
        all_hit = all_hit and hit
        answer = json.loads(raw)
        query = answer["query"]
        rungs.append(
            {
                "resolution_m": finest,
                "dems": answer["provenance"]["dems"],
                "metrics": answer["metrics"],
                "next_sunset": _first(answer["events"], "sunset"),
                "next_earthset": _first(answer["events"], "earthset"),
            }
        )
    band = {
        name: {
            "min": min(r["metrics"][name] for r in rungs),
            "max": max(r["metrics"][name] for r in rungs),
        }
        for name in LADDER_METRICS
    }
    body = json.dumps(
        {"query": query, "rungs": rungs, "band": band}, separators=(",", ":"), allow_nan=False
    )
    return Response(
        body, media_type="application/json", headers={"Cache-Status": _cache_status(all_hit)}
    )


def _first(events: list[dict[str, Any]], kind: str) -> dict[str, Any] | None:
    return next((event for event in events if event["type"] == kind), None)


@app.get("/sites/{site_id}/windows")
def site_windows(
    site_id: str,
    start: datetime,
    duration_hours: float = Query(DEFAULT_DURATION_HOURS, gt=0, le=1440),
    observer_height_m: float = Query(DEFAULT_OBSERVER_HEIGHT_M, ge=0, le=50),
    first_shift_days: int = Query(-30, ge=-30, le=0),
    last_shift_days: int = Query(150, ge=0, le=366),
) -> Response:
    """The same Window started on other days (windows.compute)."""
    found = catalog.find_site(site_id)
    if found is None:
        raise missing_site(site_id)
    try:
        instant = as_utc(start)
    except OverflowError:
        instant = None
    if instant is None or not windows.shifted(
        instant, duration_hours, first_shift_days, last_shift_days
    ):
        raise ApiProblem(
            "window_out_of_range",
            "Window out of range",
            "Every one of these Windows is outside engine coverage.",
        )
    try:
        answer, hit = cache.windows(
            found, instant, duration_hours, observer_height_m, first_shift_days, last_shift_days
        )
    except horizon.DemUnavailable as missing:
        raise ApiProblem(
            "outside_coverage",
            "Outside coverage",
            f"No DEM covers the Horizon mask of this Site ({missing}).",
        ) from missing
    return Response(
        answer, media_type="application/json", headers={"Cache-Status": _cache_status(hit)}
    )


@app.get("/sites/{site_id}/neighbours")
def site_neighbours(
    site_id: str,
    start: datetime | None = None,
    duration_hours: float = Query(DEFAULT_DURATION_HOURS, gt=0, le=1440),
    observer_height_m: float = Query(DEFAULT_OBSERVER_HEIGHT_M, ge=0, le=50),
) -> Response:
    """The nearby Sites over the same Window, ranked by Sun-and-Earth time (neighbours.compute)."""
    selected, instant = _query(site_id, None, None, start, duration_hours)
    try:
        body, hit = neighbours.compute(selected, instant, duration_hours, observer_height_m)
    except horizon.DemUnavailable as missing:
        raise ApiProblem(
            "outside_coverage",
            "Outside coverage",
            f"No DEM covers the Horizon mask of this Site or a nearby one ({missing}).",
        ) from missing
    answer = json.dumps(body, separators=(",", ":"), allow_nan=False)
    return Response(
        answer, media_type="application/json", headers={"Cache-Status": _cache_status(hit)}
    )


@app.get("/visibility/energy")
def get_visibility_energy(
    site_id: str | None = None,
    latitude_deg: float | None = Query(None, ge=-90, le=90),
    longitude_deg: float | None = Query(None, ge=-180, le=180),
    start: datetime | None = None,
    duration_hours: float = Query(DEFAULT_DURATION_HOURS, gt=0, le=1440),
    observer_height_m: float = Query(DEFAULT_OBSERVER_HEIGHT_M, ge=0, le=50),
    panel_power_w: float = Query(ge=0, le=1_000_000),
    load_w: float = Query(ge=0.1, le=1_000_000),
    battery_wh: float = Query(ge=1, le=100_000_000),
    panel_pointing: energy.PanelPointing | None = None,
    # Annotated, so a direct call (the assistant's tool) gets None and not the Query object.
    panel_azimuth_deg: Annotated[float | None, Query(ge=0, lt=360)] = None,
) -> Response:
    """The Charge of a lander's battery over the Window, on the /visibility timeline."""
    if (panel_pointing == "fixed") != (panel_azimuth_deg is not None):
        raise ApiProblem(
            "invalid_parameter",
            "Invalid parameter",
            "panel_azimuth_deg goes with panel_pointing=fixed, and only with it.",
        )
    selected, instant = _query(site_id, latitude_deg, longitude_deg, start, duration_hours)
    raw, hit = _answer(selected, instant, duration_hours, observer_height_m)
    body = json.dumps(
        energy.result(
            json.loads(raw),
            panel_power_w,
            load_w,
            battery_wh,
            panel_pointing,
            panel_azimuth_deg,
        ),
        separators=(",", ":"),
        allow_nan=False,
    )
    return Response(
        body, media_type="application/json", headers={"Cache-Status": _cache_status(hit)}
    )


@app.get("/visibility/flat")
def get_visibility_flat(
    site_id: str | None = None,
    latitude_deg: float | None = Query(None, ge=-90, le=90),
    longitude_deg: float | None = Query(None, ge=-180, le=180),
    start: datetime | None = None,
    duration_hours: float = Query(DEFAULT_DURATION_HOURS, gt=0, le=1440),
    observer_height_m: float = Query(DEFAULT_OBSERVER_HEIGHT_M, ge=0, le=50),
) -> Response:
    """The same Query on the Flat horizon: the bare sphere, no DEM (the requirement)."""
    selected, instant = _query(site_id, latitude_deg, longitude_deg, start, duration_hours)
    answer, hit = flat_horizon.answer(selected, instant, duration_hours, observer_height_m)
    return Response(
        answer, media_type="application/json", headers={"Cache-Status": _cache_status(hit)}
    )


@app.get("/visibility/scatter")
def get_visibility_scatter(
    site_id: str | None = None,
    latitude_deg: float | None = Query(None, ge=-90, le=90),
    longitude_deg: float | None = Query(None, ge=-180, le=180),
    start: datetime | None = None,
    duration_hours: float = Query(DEFAULT_DURATION_HOURS, gt=0, le=1440),
    observer_height_m: float = Query(DEFAULT_OBSERVER_HEIGHT_M, ge=0, le=50),
    radius_m: float = Query(scatter.DEFAULT_RADIUS_M, ge=40, le=1000),
) -> Response:
    """The Landing scatter: the Query at 19 points around the Site (the requirement)."""
    selected, instant = _query(site_id, latitude_deg, longitude_deg, start, duration_hours)
    try:
        answer, hit = cache.scatter(selected, instant, duration_hours, observer_height_m, radius_m)
    except horizon.DemUnavailable as missing:
        # One point without terrain and the range would be a guess: the whole answer goes.
        raise ApiProblem(
            "outside_coverage",
            "Outside coverage",
            f"No DEM covers the Horizon mask of every point of the Landing scatter ({missing}).",
        ) from missing
    return Response(
        answer, media_type="application/json", headers={"Cache-Status": _cache_status(hit)}
    )


@app.get("/visibility/uncertainty")
def get_visibility_uncertainty(
    site_id: str | None = None,
    latitude_deg: float | None = Query(None, ge=-90, le=90),
    longitude_deg: float | None = Query(None, ge=-180, le=180),
    start: datetime | None = None,
    duration_hours: float = Query(DEFAULT_DURATION_HOURS, gt=0, le=1440),
    observer_height_m: float = Query(DEFAULT_OBSERVER_HEIGHT_M, ge=0, le=50),
) -> Response:
    """The Uncertainty band: the Query over clones of the DEM, 202 until the job is done."""
    selected, instant = _query(site_id, latitude_deg, longitude_deg, start, duration_hours)
    try:
        outcome = uncertainty.request(selected, instant, duration_hours, observer_height_m)
    except horizon.DemUnavailable as missing:
        raise ApiProblem(
            "outside_coverage",
            "Outside coverage",
            f"No DEM covers the Horizon mask of this Site ({missing}).",
        ) from missing
    if isinstance(outcome, uncertainty.Pending):
        return JSONResponse(
            {
                "status": "computing",
                "clones_done": outcome.clones_done,
                "clones": outcome.clones,
            },
            status_code=202,
            headers={"Retry-After": str(uncertainty.POLL_SECONDS)},
        )
    return Response(
        outcome.body,
        media_type="application/json",
        headers={"Cache-Status": _cache_status(outcome.hit)},
    )


@app.get("/terrain")
def get_terrain(
    site_id: str | None = None,
    latitude_deg: float | None = Query(None, ge=-90, le=90),
    longitude_deg: float | None = Query(None, ge=-180, le=180),
    radius_m: float = Query(slope.NASA_SLOPE_RADIUS_M, ge=40, le=2000),
    slope_limit_deg: float = Query(slope.NASA_SLOPE_LIMIT_DEG, gt=0, le=45),
) -> dict[str, Any]:
    """The Slope around a Site; defaults are NASA's Artemis III requirement (see slope.py)."""
    selected = ground.site_for(site_id, latitude_deg, longitude_deg)
    return ground.terrain(selected, radius_m, slope_limit_deg)


@app.get("/terrain/heights")
def get_terrain_heights(
    site_id: str | None = None,
    latitude_deg: float | None = Query(None, ge=-90, le=90),
    longitude_deg: float | None = Query(None, ge=-180, le=180),
    half_extent_m: float = Query(
        heights.HALF_EXTENT_DEFAULT_M, ge=heights.HALF_EXTENT_MIN_M, le=heights.HALF_EXTENT_MAX_M
    ),
) -> Response:
    """The DEM's own heights around a Site, for the 3D view from the ground (see heights.py)."""
    selected = ground.site_for(site_id, latitude_deg, longitude_deg)
    return Response(ground.terrain_heights(selected, half_extent_m), media_type="application/json")


@app.get("/terrain/landing-area")
def get_landing_area(
    latitude_deg: float = Query(..., ge=-90, le=-87.5),
    longitude_deg: float = Query(..., ge=-180, le=180),
) -> Response:
    body = landing_area.area(latitude_deg, longitude_deg)
    # A pure function of the two coordinates and the DEM files, so a client or the proxy may keep it.
    return Response(
        json.dumps(body, separators=(",", ":"), allow_nan=False),
        media_type="application/json",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@app.post("/routes/plan", response_model=route_plan.RouteResponse)
def post_route_plan(request: route_plan.RouteRequest) -> route_plan.RouteResponse:
    """Bounded native-DEM route and optional moving power scenario."""
    return route_plan.plan(request)


@app.post("/assistant")
async def ask_assistant(request: Request) -> Response:
    """Questions in plain words, answered with this API's own numbers (the requirement)."""
    return await assistant.handle(request)


@app.get("/visibility/dsn")
def get_visibility_dsn(
    site_id: str | None = None,
    latitude_deg: float | None = Query(None, ge=-90, le=90),
    longitude_deg: float | None = Query(None, ge=-180, le=180),
    start: datetime | None = None,
    duration_hours: float = Query(DEFAULT_DURATION_HOURS, gt=0, le=1440),
    observer_height_m: float = Query(DEFAULT_OBSERVER_HEIGHT_M, ge=0, le=50),
) -> Response:
    """DSN link: the Earth visible from the Site and a 70 m antenna with the Moon in view."""
    selected, instant = _query(site_id, latitude_deg, longitude_deg, start, duration_hours)
    try:
        answer, hit = dsn.answer(selected, instant, duration_hours, observer_height_m)
    except horizon.DemUnavailable as missing:
        # Same rule as /visibility: the Earth's periods need the terrain.
        raise ApiProblem(
            "outside_coverage",
            "Outside coverage",
            f"No DEM covers the Horizon mask of this Site ({missing}).",
        ) from missing
    return Response(
        answer, media_type="application/json", headers={"Cache-Status": _cache_status(hit)}
    )


@app.get("/sites/{site_id}/hazard")
async def get_site_hazard(site_id: str) -> dict[str, Any]:
    """Eduardo's Monte Carlo on the 10 x 10 km grid nearest the Site (the requirement)."""
    return hazard.site_hazard(site_id)


@app.get("/sites/{site_id}/hazard/grid")
async def get_site_hazard_grid(site_id: str) -> dict[str, Any]:
    """The grid itself, as the bundle stores it (the requirement)."""
    return hazard.site_hazard_grid(site_id)


@app.get("/sites/{site_id}/hazard/around")
async def get_site_hazard_around(
    site_id: str,
    x_m: float | None = Query(None, ge=-5000, le=5000),
    y_m: float | None = Query(None, ge=-5000, le=5000),
    radius_m: float = Query(250, ge=50, le=2000),
    slope_limit_deg: float = Query(hazard.SLOPE_LIMIT_DEG, gt=0, le=45),
) -> dict[str, Any]:
    """The steep cells within a radius of a point of the grid (the requirement)."""
    return hazard.site_hazard_around(site_id, x_m, y_m, radius_m, slope_limit_deg)


@app.get("/rovers")
async def get_rovers() -> dict[str, Any]:
    """The eight Rovers of Eduardo's catalogue, each number with its source (the requirement)."""
    return rovers.listing()


@app.get("/sites/{site_id}/route")
def get_site_route(
    site_id: str,
    rover_id: str = "viper",
    slope_limit_deg: float | None = Query(None, gt=0, le=45),
    battery_wh: float | None = Query(None, gt=0, le=100000),
    power_shadow_w: float | None = Query(None, ge=0, le=10000),
    solar_w: float | None = Query(None, ge=0, le=10000),
    rtg_w: float | None = Query(None, ge=0, le=10000),
    start_x_m: float | None = Query(None, ge=-5000, le=5000),
    start_y_m: float | None = Query(None, ge=-5000, le=5000),
    goal_x_m: float | None = Query(None, ge=-5000, le=5000),
    goal_y_m: float | None = Query(None, ge=-5000, le=5000),
    coarse_m: route.CoarseM = route.CoarseM.M60,
    confidence_level: Literal["P50", "P90", "P99"] = "P90",
    sun_fraction: float = Query(0.5, ge=0, le=1),
    sun_azimuth_deg: float | None = Query(None, ge=0, lt=360),
    swarm: bool = False,
) -> dict[str, Any]:
    """The same drive planned by Normal navigation and by Multiresolution (the requirement)."""
    return route.compare(
        site_id,
        rover_id=rover_id,
        slope_limit_deg=slope_limit_deg,
        battery_wh=battery_wh,
        power_shadow_w=power_shadow_w,
        solar_w=solar_w,
        rtg_w=rtg_w,
        start_x_m=start_x_m,
        start_y_m=start_y_m,
        goal_x_m=goal_x_m,
        goal_y_m=goal_y_m,
        coarse_m=int(coarse_m),
        confidence_level=confidence_level,
        sun_fraction=sun_fraction,
        sun_azimuth_deg=sun_azimuth_deg,
        swarm=swarm,
    )
