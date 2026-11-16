"""Bounded route scenarios on native DEMs; no rover safety or success model."""
from __future__ import annotations

import math
import threading
from datetime import datetime, timedelta
from typing import Any, Literal

import numpy as np
from pydantic import BaseModel, ConfigDict, Field, model_validator

from . import catalog, energy, engine, ephemeris, heights, horizon, routes
from .constants import MOON_RADIUS_M as R
from .problems import ApiProblem
from .timeutil import iso_z

MAX_SIDE = 129
MAX_SAMPLES = 64
_SLOT = threading.BoundedSemaphore(1)


class Coordinates(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    latitude_deg: float = Field(ge=-90, le=90)
    longitude_deg: float = Field(ge=-180, le=180)


class MotionScenario(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    speed_m_s: float = Field(ge=0.0001, le=10)
    load_w: float = Field(gt=0, le=1_000_000, description="Total constant electrical load while moving")
    battery_wh: float = Field(gt=0, le=100_000_000)
    initial_charge_fraction: float = Field(ge=0, le=1)
    panel_power_w: float = Field(ge=0, le=1_000_000)


class RouteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    origin: Coordinates
    destination: Coordinates
    start: datetime
    end: datetime
    observer_height_m: float = Field(default=2, ge=0, le=50)
    max_slope_deg: float = Field(gt=0, le=45)
    half_extent_m: float = Field(default=1000, ge=1000, le=3000)
    minimum_resolution_m: Literal[20, 80, 240] = 20
    motion: MotionScenario | None = None

    @model_validator(mode="after")
    def window(self) -> RouteRequest:
        if self.start.tzinfo is None or self.end.tzinfo is None:
            raise ValueError("Window must contain timezone offsets")
        if not 0 < (self.end-self.start).total_seconds() <= 60*86400:
            raise ValueError("Window must be positive and at most 60 days")
        from .constants import WINDOW_MIN, WINDOW_MAX
        if self.start < WINDOW_MIN or self.end > WINDOW_MAX:
            raise ValueError("Window outside ephemeris coverage")
        return self


class RoutePoint(BaseModel):
    row: int
    column: int
    latitude_deg: float
    longitude_deg: float
    elevation_m: float
    distance_m: float


class MotionSample(BaseModel):
    t: str
    latitude_deg: float
    longitude_deg: float
    distance_m: float
    sun_fraction: float
    earth_visible: bool
    charge_fraction: float


class RouteResponse(BaseModel):
    status: Literal["found", "no_path_in_window"]
    points: list[RoutePoint]
    length_m: float | None
    max_segment_slope_deg: float | None
    terrain: dict[str, Any]
    origin_snap_m: float
    destination_snap_m: float
    motion_status: Literal["not_requested", "evaluated", "outside_window", "sample_limit", "outside_coverage"]
    duration_seconds: float | None
    samples: list[MotionSample]
    unmet_wh: float | None
    horizon_products: list[str]
    kernels: list[str]
    limitations: list[str]


def coordinates(grid: heights.Grid, row: float, column: float) -> tuple[float, float]:
    x = grid.x_min_m + (column+.5)*grid.metres_per_pixel
    y = grid.y_max_m - (row+.5)*grid.metres_per_pixel
    if grid.projection == "eqc":
        lat, lon = math.degrees(y/R), math.degrees(x/R)+180
    else:
        angle = 2*math.atan(math.hypot(x,y)/(2*R))
        north = grid.projection == "polar_north"
        lat = math.degrees(math.pi/2-angle if north else angle-math.pi/2)
        lon = math.degrees(math.atan2(x, -y if north else y))
    return lat, (lon+180)%360-180


def separation(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lat2 = math.radians(a[0]), math.radians(b[0])
    hav = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(math.radians(b[1]-a[1])/2)**2
    return 2*R*math.asin(min(1, math.sqrt(max(0,hav))))


def pixel(grid: heights.Grid, point: Coordinates) -> tuple[int, int]:
    lat, lon = math.radians(point.latitude_deg), math.radians(point.longitude_deg)
    if grid.projection == "eqc":
        x, y = R*math.radians((point.longitude_deg-180+180)%360-180), R*lat
        centre = grid.x_min_m + grid.heights.shape[1]*grid.metres_per_pixel/2
        x += round((centre-x)/(2*math.pi*R))*2*math.pi*R
    else:
        north = grid.projection == "polar_north"
        if (north and lat <= 0) or (not north and lat >= 0):
            raise ApiProblem("outside_coverage", "Destination outside window", "Choose a destination in the same polar region.")
        rho = 2*R*math.tan(math.pi/4-lat/2 if north else math.pi/4+lat/2)
        x, y = rho*math.sin(lon), rho*math.cos(lon)*(-1 if north else 1)
    col = math.floor((x-grid.x_min_m)/grid.metres_per_pixel)
    row = math.floor((grid.y_max_m-y)/grid.metres_per_pixel)
    if not (0 <= row < grid.heights.shape[0] and 0 <= col < grid.heights.shape[1]):
        raise ApiProblem("outside_coverage", "Destination outside window", "Choose a closer destination or a coarser available DEM. The native grid is limited to 129 pixels per side.")
    return row, col


def read_grid(request: RouteRequest) -> heights.Grid:
    origin = request.origin
    folder, bands = horizon.slope_bands(None, origin.latitude_deg)
    bands = tuple(b for b in bands if b.resolution_m >= request.minimum_resolution_m)
    if not bands:
        raise ApiProblem("outside_coverage", "DEM unavailable", "No native DEM at the requested resolution.")
    grid = heights._grid(str(folder), bands, origin.latitude_deg, origin.longitude_deg, request.half_extent_m)
    size = min(MAX_SIDE, grid.heights.shape[0])
    offset = (grid.heights.shape[0]-size)//2
    return heights.Grid(grid.product, grid.resolution_m, grid.projection, grid.metres_per_pixel,
                        grid.x_min_m+offset*grid.metres_per_pixel,
                        grid.y_max_m-offset*grid.metres_per_pixel,
                        grid.heights[offset:offset+size, offset:offset+size])


def observe(lat: float, lon: float, instant: datetime, height: float) -> tuple[float, bool, float, list[str]]:
    mask = horizon.mask(lat, lon, height)
    # Never allow the optional flat-horizon fallback for a moving scenario.
    if not mask.products:
        raise ApiProblem("outside_coverage", "Measured horizon unavailable", "Route energy requires measured terrain at every sample.")
    observer = ephemeris.make_observer(lat, lon, mask.site_height_m+height)
    look = engine.look_at(instant, observer, mask)
    return look.sun_fraction(), look.above("earth"), (energy.AU_KM/look.sun.distance_km)**2, [str(product["product"]) for product in mask.products]


def integrate(stored: float, capacity: float, net_w: float, seconds: float) -> tuple[float, float]:
    """Stored Wh and unserved Wh for one constant-power interval."""
    available = stored + net_w*seconds/3600
    return min(capacity, max(0, available)), max(0, -available)


def moving(request: RouteRequest, response: RouteResponse, grid: heights.Grid) -> None:
    scenario = request.motion
    if scenario is None or not response.points:
        return
    duration = response.points[-1].distance_m/scenario.speed_m_s
    response.duration_seconds = duration
    if duration > (request.end-request.start).total_seconds():
        response.motion_status = "outside_window"
        return
    # Each segment is split at <=15 min, retaining every route vertex. No corner shortcut.
    locations = [response.points[0]]
    for a,b in zip(response.points, response.points[1:]):
        count = max(1, math.ceil((b.distance_m-a.distance_m)/scenario.speed_m_s/900))
        if len(locations)+count > MAX_SAMPLES:
            response.motion_status = "sample_limit"
            return
        for step in range(1,count+1):
            f = step/count
            lat, lon = coordinates(grid, a.row+f*(b.row-a.row), a.column+f*(b.column-a.column))
            locations.append(RoutePoint(row=b.row, column=b.column,
                latitude_deg=lat, longitude_deg=lon,
                elevation_m=a.elevation_m+f*(b.elevation_m-a.elevation_m),
                distance_m=a.distance_m+f*(b.distance_m-a.distance_m)))
    samples: list[MotionSample] = []
    stored = scenario.battery_wh*scenario.initial_charge_fraction
    unmet = 0.0
    previous_seconds = 0.0
    previous_net = 0.0
    products: set[str] = set()
    try:
        for point in locations:
            seconds = point.distance_m/scenario.speed_m_s
            instant = request.start+timedelta(seconds=seconds)
            sun, earth, distance_factor, used = observe(point.latitude_deg, point.longitude_deg, instant, request.observer_height_m)
            stored, missing = integrate(stored, scenario.battery_wh, previous_net, seconds-previous_seconds)
            unmet += missing
            samples.append(MotionSample(t=iso_z(instant), latitude_deg=point.latitude_deg,
                longitude_deg=point.longitude_deg, distance_m=point.distance_m,
                sun_fraction=sun, earth_visible=earth, charge_fraction=stored/scenario.battery_wh))
            previous_seconds = seconds
            previous_net = scenario.panel_power_w*sun*distance_factor-scenario.load_w
            products.update(used)
    except (horizon.DemUnavailable, ApiProblem):
        response.motion_status = "outside_coverage"
        return
    response.motion_status = "evaluated"
    response.samples = samples
    response.unmet_wh = unmet
    response.horizon_products = sorted(products)
    response.kernels = ephemeris.kernel_names()


def plan(request: RouteRequest) -> RouteResponse:
    if not _SLOT.acquire(blocking=False):
        raise ApiProblem("busy", "Route planner busy", "Try again after the current route completes.", 503)
    try:
        grid = read_grid(request)
        start, goal = pixel(grid, request.origin), pixel(grid, request.destination)
        path = routes.shortest_path(grid, start, goal, request.max_slope_deg)
        points: list[RoutePoint] = []
        distance = 0.0
        for row,col in path.cells:
            lat,lon = coordinates(grid,row,col)
            elevation = float(grid.heights[row,col])
            if points:
                prev = points[-1]
                run = separation((prev.latitude_deg,prev.longitude_deg),(lat,lon))*(1+(prev.elevation_m+elevation)/(2*R))
                distance += math.hypot(run,elevation-prev.elevation_m)
            points.append(RoutePoint(row=row,column=col,latitude_deg=lat,longitude_deg=lon,elevation_m=elevation,distance_m=distance))
        response = RouteResponse(status=path.status,points=points,length_m=path.length_m,
            max_segment_slope_deg=path.max_segment_slope_deg,terrain={**heights.as_json(grid,request.half_extent_m), "site": catalog.custom_site(request.origin.latitude_deg,request.origin.longitude_deg)},
            origin_snap_m=separation((request.origin.latitude_deg,request.origin.longitude_deg),coordinates(grid,*start)),
            destination_snap_m=separation((request.destination.latitude_deg,request.destination.longitude_deg),coordinates(grid,*goal)),
            motion_status="not_requested", duration_seconds=None,samples=[],unmet_wh=None,horizon_products=[],kernels=[],
            limitations=["Shortest path on native pixel centres; no lateral slope, footprint or subpixel hazards.",
                "Endpoints snap to pixel centres; distances exclude the unresolved access to those centres.",
                "Constant user-specified speed/load; Sun-tracking panels, no thermal or ageing model.",
                "Energy uses left-endpoint samples at each vertex and at most 15 minutes apart, not continuous visibility.",
                "This is a scenario, not a safe trajectory or a probability of mission success."])
        moving(request,response,grid)
        return response
    except horizon.DemUnavailable as exc:
        raise ApiProblem("outside_coverage", "DEM unavailable", str(exc)) from exc
    finally:
        _SLOT.release()
