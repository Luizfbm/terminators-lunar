"""The assistant's tools: this API's own operations, called in process through the cache.

Each tool calls a route function of app.main (so the same validation, cache and engine
gate apply) and returns a compact reading of its answer: metrics, events and summaries,
never the timeline or the Horizon mask samples. Durations come in hours and as the app
writes them ("5 d 23 h"), so the model never converts a unit itself.

Adding a tool is one decorated function:

    @tool("get_thing", "What it answers.", {"param": {...}})
    def get_thing(ctx: Context, args: Args) -> Reading:
        ...
        return Reading("getThing", request("/thing", params), compact)

Leave out a Query parameter and the tool uses the Query on screen.

A question never waits on a long cold computation (the requirement). A tool whose answer can
take more than a few seconds cold is registered with the panel that computes it, and runs
under cache.ready_only(): it answers from what is already computed, and when that is not
enough it answers `not_ready` with the panel's name instead of starting the engine.
Measured cold on the server: Landing scatter 68 s, a year of Windows 21 s, flat 16 s, a
year about 30 s; the ladder is three runs of the Query. Visibility, DSN (3 s), energy
(2 s on a cached Query), terrain (under 1 s), Site search and validations run as usual.
"""

from __future__ import annotations

import asyncio
import json
import math
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from urllib.parse import urlencode

from .. import cache
from ..cache import default_start
from ..catalog import meta
from ..problems import ApiProblem
from ..timeutil import as_utc, iso_z
from .tracer import MONTHS

Args = dict[str, Any]
Json = dict[str, Any]
SITE_KEYS = ("site_id", "latitude_deg", "longitude_deg")
EVENTS_LISTED = 10
DIRECTIONS = {
    "en": [
        "north",
        "north-east",
        "east",
        "south-east",
        "south",
        "south-west",
        "west",
        "north-west",
    ],
    "pt": ["norte", "nordeste", "leste", "sudeste", "sul", "sudoeste", "oeste", "noroeste"],
}


class ToolError(Exception):
    def __init__(self, code: str, detail: str) -> None:
        super().__init__(detail)
        self.code = code
        self.detail = detail


@dataclass(frozen=True)
class Reading:
    """What one operation answered: its operationId, the equivalent request and the numbers."""

    operation: str
    request: str
    result: Json


# The panel that computes a slow tool's answer, by its title on screen, in both languages
# (copied from frontend/src/i18n and the approved phase 4 prototypes).
PANELS: dict[str, dict[str, str]] = {
    "ladder": {
        "en": "How much does the map’s detail change this answer?",
        "pt": "Quanto o detalhe do mapa muda esta resposta?",
    },
    "year": {"en": "The year {year} at this Site", "pt": "O ano de {year} neste Local"},
    "slip": {"en": "If the launch slips", "pt": "Se o lançamento atrasar"},
    "landing_day": {"en": "When to land in {year}", "pt": "Quando pousar em {year}"},
    "scatter": {"en": "If the lander misses", "pt": "Se o módulo errar o alvo"},
    "flat": {
        "en": "How much of this answer is the terrain?",
        "pt": "Quanto desta resposta vem do relevo?",
    },
}


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    parameters: Json
    run: Runner
    # For a slow tool: the key in PANELS of the panel that computes its answer.
    panel: Callable[[Context, Args], str] | None = None

    def spec(self) -> Json:
        """The tool as OpenRouter's chat completions take it."""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": {
                    "type": "object",
                    "properties": self.parameters,
                    "additionalProperties": False,
                },
            },
        }


@dataclass
class Context:
    """One question: the Query on screen, the language, and what the tools read for it."""

    query: Args
    lang: str
    readings: list[Reading] = field(default_factory=list)
    errors: list[Json] = field(default_factory=list)
    _memo: dict[str, Reading | Json] = field(default_factory=dict)
    # What the model cost for this question: requests sent, rounds of tools, US dollars.
    calls: int = 0
    tool_rounds: int = 0
    cost_usd: float = 0.0

    def restart(self) -> None:
        """Forget what the last answer read, keeping the results for reuse."""
        self.readings = []
        self.errors = []

    def sources(self) -> list[dict[str, str]]:
        seen: list[dict[str, str]] = []
        for reading in self.readings:
            source = {"operation": reading.operation, "request": reading.request}
            if source not in seen:
                seen.append(source)
        return seen


Runner = Callable[[Context, Args], Reading]
TOOLS: dict[str, Tool] = {}


def tool(
    name: str,
    description: str,
    parameters: Json,
    panel: Callable[[Context, Args], str] | None = None,
) -> Callable[[Runner], Runner]:
    """Register a tool; `panel` marks it slow and names the panel that computes it."""

    def register(run: Runner) -> Runner:
        TOOLS[name] = Tool(name, description, parameters, run, panel)
        return run

    return register


def panel_title(ctx: Context, key: str, year: int | None = None) -> str:
    return PANELS[key][ctx.lang].format(year=year)


def not_ready(title: str) -> Json:
    return {
        "error": "not_ready",
        "panel": title,
        "detail": "This number is not computed yet, and computing it takes too long for a "
        "question. Opening that panel on the screen computes it; then ask again.",
    }


def _run(found: Tool, ctx: Context, args: Args) -> Reading:
    if found.panel is None:
        return found.run(ctx, args)
    with cache.ready_only():
        return found.run(ctx, args)


# What the model reads has durations to two decimals, like a person writes them; the
# Reading keeps four, so the offline router's sentences round once from the engine's value.
MODEL_DECIMALS = 2


def for_model(value: Any) -> Any:
    """A tool's result as the model gets it: every `hours` to MODEL_DECIMALS."""
    if isinstance(value, dict):
        return {
            key: round(item, MODEL_DECIMALS)
            if key == "hours" and isinstance(item, float)
            else for_model(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [for_model(item) for item in value]
    return value


def call(ctx: Context, name: str, args: Args) -> Json:
    """Run a tool; the answer for the model, or an error it can read."""
    key = json.dumps([name, args], sort_keys=True, default=str)
    known = ctx._memo.get(key)
    if known is None:
        found = TOOLS.get(name)
        if found is None:
            known = {"error": "unknown_tool", "detail": f"There is no tool named {name}."}
        else:
            try:
                known = _run(found, ctx, args)
            except cache.NotReady:
                assert found.panel is not None
                known = not_ready(found.panel(ctx, args))
            except ToolError as failure:
                known = {"error": failure.code, "detail": failure.detail}
            except ApiProblem as problem:
                known = {"error": problem.code, "detail": problem.detail}
        ctx._memo[key] = known
    if isinstance(known, Reading):
        ctx.readings.append(known)
        model_view: Json = for_model(known.result)
        return model_view
    ctx.errors.append(known)
    return known


def run_tool(ctx: Context, name: str, args: Args) -> Reading | None:
    """Run a tool for the offline router: its Reading, or None when it answered an error."""
    call(ctx, name, args)
    reading = ctx._memo[json.dumps([name, args], sort_keys=True, default=str)]
    return reading if isinstance(reading, Reading) else None


# --- Arguments --------------------------------------------------------------------------

QUERY_PARAMETERS: Json = {
    "site_id": {
        "type": "string",
        "description": "A Curated Site id, such as 001 or CR01. Leave it and the coordinates "
        "out to use the Site on screen.",
    },
    "latitude_deg": {"type": "number", "description": "Latitude of a custom Site."},
    "longitude_deg": {"type": "number", "description": "Longitude of a custom Site."},
    "start": {
        "type": "string",
        "description": "Window start, ISO 8601 in UTC. Default: the Query on screen.",
    },
    "duration_hours": {
        "type": "number",
        "description": "Window length in hours. Default: the Query on screen.",
    },
    "observer_height_m": {
        "type": "number",
        "description": "Observer height in metres. Default: the Query on screen.",
    },
}


def screen_query(raw: Args | None) -> Args:
    """The Query on screen with every field filled; the app's default Query when there is none."""
    defaults = meta()["defaults"]
    if raw is None:
        return {
            "site_id": defaults["site_id"],
            "latitude_deg": None,
            "longitude_deg": None,
            "start": default_start(),
            "duration_hours": float(defaults["duration_hours"]),
            "observer_height_m": float(defaults["observer_height_m"]),
        }
    return {
        "site_id": raw.get("site_id"),
        "latitude_deg": raw.get("latitude_deg"),
        "longitude_deg": raw.get("longitude_deg"),
        "start": as_utc(raw["start"]),
        "duration_hours": float(raw["duration_hours"]),
        "observer_height_m": float(raw["observer_height_m"]),
    }


def _number(args: Args, name: str, low: float, high: float, low_open: bool = False) -> float:
    value = args[name]
    if isinstance(value, bool) or not isinstance(value, int | float) or not math.isfinite(value):
        raise ToolError("invalid_parameter", f"{name} must be a number.")
    if value > high or value < low or (low_open and value == low):
        raise ToolError("invalid_parameter", f"{name} is out of range.")
    return float(value)


def query_args(ctx: Context, args: Args) -> Args:
    """The Query a tool runs: its own arguments over the Query on screen."""
    out = dict(ctx.query)
    if any(args.get(key) is not None for key in SITE_KEYS):
        out.update({key: args.get(key) for key in SITE_KEYS})
        if out["site_id"] is not None and not isinstance(out["site_id"], str):
            raise ToolError("invalid_parameter", "site_id must be text.")
        for key, limit in (("latitude_deg", 90.0), ("longitude_deg", 180.0)):
            if out[key] is not None:
                out[key] = _number(out, key, -limit, limit)
    if args.get("start") is not None:
        try:
            out["start"] = as_utc(datetime.fromisoformat(str(args["start"])))
        except ValueError:
            raise ToolError("invalid_parameter", "start must be an ISO 8601 instant.") from None
    if args.get("duration_hours") is not None:
        out["duration_hours"] = _number(args, "duration_hours", 0.0, 1440.0, low_open=True)
    if args.get("observer_height_m") is not None:
        out["observer_height_m"] = _number(args, "observer_height_m", 0.0, 50.0)
    return out


def _text(value: Any) -> str:
    if isinstance(value, datetime):
        return iso_z(value)
    if isinstance(value, float):
        return format(value, ".15g")
    return str(value)


def request(path: str, params: Args) -> str:
    """Path and query string of the equivalent request to this API."""
    items = [(key, _text(value)) for key, value in params.items() if value is not None]
    return f"{path}?{urlencode(items, safe=':')}" if items else path


def _route_body(response: Any) -> Json:
    body: Json = json.loads(bytes(response.body))
    return body


def _await(coroutine: Any) -> Any:
    # The light routes are async; tools run in the thread pool, where no loop is running.
    return asyncio.run(coroutine)


# --- Compact readings -------------------------------------------------------------------


# Four decimals, so a sentence that shows one or two rounds the engine's value once.
# Two decimals here gave 4.35 for 4.3511 h, which a sentence then wrote as 4.3.
DECIMALS = 4


def span_text(hours: float) -> str:
    """A duration as the panel writes it (frontend formatSpan): "5 d 23 h" from a day up,
    "4 h 21 min" below, "21 min" under an hour; whole minutes, rounded down."""
    # The nudge keeps an exact minute such as 4.35 h (260.99999... min) from losing one.
    days, rest = divmod(max(0, math.floor(hours * 60.0 + 1e-6)), 24 * 60)
    whole, minutes = divmod(rest, 60)
    if days:
        return f"{days} d {whole} h"
    return f"{whole} h {minutes} min" if whole else f"{minutes} min"


def span(hours: float) -> Json:
    """A duration in hours and in the app's own words. No decimal days (the requirement): the
    model wrote "5.98 days" where the panel next to it said "5 d 23 h"."""
    return {"hours": round(hours, DECIMALS), "text": span_text(hours)}


def compass(azimuth_deg: float, lang: str) -> str:
    return DIRECTIONS[lang][round((azimuth_deg % 360.0) / 45.0) % 8]


def _site(site: Json) -> Json:
    return {
        "id": site["id"],
        "name": site["name"],
        "latitude_deg": round(site["latitude_deg"], 4),
        "longitude_deg": round(site["longitude_deg"], 4),
        "curated": site["curated"],
    }


def _query(query: Json) -> Json:
    return {
        "site": _site(query["site"]),
        "start": query["start"],
        "end": query["end"],
        "duration": span(query["duration_hours"]),
        "observer_height_m": query["observer_height_m"],
    }


def _metrics(metrics: Json) -> Json:
    return {
        "sun_and_earth_time": span(metrics["sun_and_earth_hours"]),
        "sunlit": span(metrics["sunlit_hours"]),
        "earth_visible": span(metrics["earth_visible_hours"]),
        "lcip": span(metrics["lcip_hours"]),
        "lcsp": span(metrics["lcsp_hours"]),
        "mean_sun_fraction": round(metrics["mean_sun_fraction"], 4),
        "mean_sun_percent": round(metrics["mean_sun_fraction"] * 100.0, 2),
    }


def _event(event: Json, start: datetime, lang: str) -> Json:
    after = (datetime.fromisoformat(event["t"]) - start).total_seconds() / 3600.0
    out: Json = {"type": event["type"], "time_utc": event["t"], "after_window_start": span(after)}
    occluder = event.get("occluder")
    if occluder:
        out["occluder"] = {
            "distance_km": round(occluder["distance_m"] / 1000.0, 1),
            "distance_m": round(occluder["distance_m"]),
            "direction": compass(occluder["azimuth_deg"], lang),
            "azimuth_deg": round(occluder["azimuth_deg"], 1),
            "terrain_height_m": round(occluder["terrain_height_m"]),
        }
        feature = occluder.get("feature")
        if feature:
            out["occluder"]["feature"] = feature
    return out


def compact_visibility(answer: Json, lang: str) -> Json:
    start = datetime.fromisoformat(answer["query"]["start"])
    events = answer["events"]
    periods = answer["periods"]

    def count(body: str, state: str) -> int:
        return sum(1 for p in periods if p["body"] == body and p["state"] == state)

    def first(kind: str) -> Json | None:
        found = next((e for e in events if e["type"] == kind), None)
        return _event(found, start, lang) if found else None

    return {
        "query": _query(answer["query"]),
        "metrics": _metrics(answer["metrics"]),
        "first_sunset": first("sunset"),
        "first_earthset": first("earthset"),
        "events_in_window": len(events),
        "events": [_event(e, start, lang) for e in events[:EVENTS_LISTED]],
        "periods": {
            "sunlit_periods": count("sun", "visible"),
            "shadow_periods": count("sun", "hidden"),
            "short_shadows": sum(1 for p in periods if p.get("short_shadow")),
            "earth_visible_periods": count("earth", "visible"),
            "earth_hidden_periods": count("earth", "hidden"),
        },
        "dems": [dem["product"] for dem in answer["provenance"]["dems"]],
    }


# --- The tools --------------------------------------------------------------------------


@tool(
    "get_visibility",
    "The answer to a Query: Sun-and-Earth time, sunlit hours, Earth-visible hours, LCIP, "
    "LCSP and mean Sun fraction over the Window; the first Sunset and Earthset with the "
    "Occluder that causes each; the first events of the Window; how many sunlit, shadow "
    "and Earth periods there are.",
    QUERY_PARAMETERS,
)
def get_visibility(ctx: Context, args: Args) -> Reading:
    from .. import main  # main imports this package for its route

    q = query_args(ctx, args)
    response = main.get_visibility(**q)
    path = request("/visibility", q)
    return Reading("getVisibility", path, compact_visibility(_route_body(response), ctx.lang))


@tool(
    "get_visibility_ladder",
    "The Resolution ladder: the same Query with the Horizon mask built from coarser DEMs "
    "only (finest DEM of each rung in metres), and the band of each metric across the "
    "rungs. It shows how much the answer depends on small terrain.",
    QUERY_PARAMETERS,
    panel=lambda ctx, args: panel_title(ctx, "ladder"),
)
def get_visibility_ladder(ctx: Context, args: Args) -> Reading:
    from .. import main

    q = query_args(ctx, args)
    answer = _route_body(main.get_visibility_ladder(**q))
    rungs = [
        {"finest_dem_m": rung["resolution_m"], "metrics": _metrics(rung["metrics"])}
        for rung in answer["rungs"]
    ]
    band: Json = {
        name: {"min": span(answer["band"][key]["min"]), "max": span(answer["band"][key]["max"])}
        for name, key in (
            ("sun_and_earth_time", "sun_and_earth_hours"),
            ("sunlit", "sunlit_hours"),
            ("earth_visible", "earth_visible_hours"),
            ("lcip", "lcip_hours"),
            ("lcsp", "lcsp_hours"),
        )
    }
    band["mean_sun_percent"] = {
        "min": round(answer["band"]["mean_sun_fraction"]["min"] * 100.0, 2),
        "max": round(answer["band"]["mean_sun_fraction"]["max"] * 100.0, 2),
    }
    result = {"query": _query(answer["query"]), "rungs": rungs, "band": band}
    return Reading("getVisibilityLadder", request("/visibility/ladder", q), result)


@tool(
    "get_site_year",
    "A Curated Site over a whole calendar year: totals, each month, and the three best "
    "Windows of a synodic month by Sun-and-Earth time. Curated Sites only.",
    {
        "site_id": QUERY_PARAMETERS["site_id"],
        "year": {"type": "integer", "description": "Default: the year the Window starts in."},
        "observer_height_m": QUERY_PARAMETERS["observer_height_m"],
    },
    panel=lambda ctx, args: panel_title(ctx, "year", _year_of(ctx, args)),
)
def get_site_year(ctx: Context, args: Args) -> Reading:
    from .. import main

    q = query_args(ctx, {k: v for k, v in args.items() if k != "year"})
    site_id = q["site_id"]
    if site_id is None:
        raise ToolError("not_curated", "The year is computed for Curated Sites only.")
    year = args.get("year", q["start"].year)
    if isinstance(year, bool) or not isinstance(year, int):
        raise ToolError("invalid_parameter", "year must be a whole number.")
    height = q["observer_height_m"]
    answer = _route_body(main.site_year(site_id, year_number=year, observer_height_m=height))
    names = MONTHS[ctx.lang]
    totals = answer["totals"]
    result = {
        "site": _site(answer["site"]),
        "year": answer["year"],
        "observer_height_m": answer["observer_height_m"],
        "totals": {
            "sunlit": span(totals["sunlit_hours"]),
            "earth_visible": span(totals["earth_visible_hours"]),
            "sun_and_earth_time": span(totals["sun_and_earth_hours"]),
            "lcip": span(totals["lcip_hours"]),
            "lcsp": span(totals["lcsp_hours"]),
        },
        "best_windows": [
            {
                "start": window["start"],
                "end": window["end"],
                "sun_and_earth_time": span(window["sun_and_earth_hours"]),
            }
            for window in answer["best_windows"]
        ],
        "months": [
            {
                "month": names[month["month"] - 1],
                "sunlit": span(month["sunlit_hours"]),
                "earth_visible": span(month["earth_visible_hours"]),
                "sun_and_earth_time": span(month["sun_and_earth_hours"]),
                "longest_shadow_starting_this_month": span(month["longest_shadow_hours"]),
            }
            for month in answer["months"]
        ],
    }
    params = {"year": year, "observer_height_m": height}
    return Reading("getSiteYear", request(f"/sites/{site_id}/year", params), result)


@tool(
    "search_sites",
    "Find Curated Sites by part of their id or name, or by Region id. Up to ten, with "
    "their coordinates.",
    {
        "q": {"type": "string", "description": "Part of a Site id or name."},
        "region_id": {"type": "string", "description": "A Region id, such as CR."},
    },
)
def search_sites(ctx: Context, args: Args) -> Reading:
    from .. import main

    q, region = args.get("q"), args.get("region_id")
    if not isinstance(q, str | None) or not isinstance(region, str | None):
        raise ToolError("invalid_parameter", "q and region_id must be text.")
    if q is not None and len(q) > 100:
        raise ToolError("invalid_parameter", "q must be at most 100 characters.")
    found = _await(main.sites(region_id=region, q=q))
    result = {
        "count": len(found),
        "sites": [{**_site(site), "region_id": site["region_id"]} for site in found[:10]],
    }
    return Reading("listSites", request("/sites", {"region_id": region, "q": q}), result)


@tool(
    "list_validations",
    "The checks on the Proof page: what each one compares, its tolerance, its result and "
    "whether it passed.",
    {},
)
def list_validations(ctx: Context, args: Args) -> Reading:
    from .. import main

    entries: list[Json] = _await(main.validations())
    lang = ctx.lang
    checks = [
        {
            "title": entry["title"][lang],
            "tolerance": entry["tolerance"][lang],
            "result": entry["result"][lang],
            "status": entry["status"],
        }
        for entry in entries
    ]
    passed = sum(1 for check in checks if check["status"] == "passed")
    result = {"total": len(checks), "passed": passed, "checks": checks}
    return Reading("listValidations", "/validations", result)


def _year_of(ctx: Context, args: Args) -> int:
    """The year a tool asks about: its own `year`, else the year the Window starts in."""
    year = args.get("year")
    if isinstance(year, int) and not isinstance(year, bool):
        return year
    start: datetime = ctx.query["start"]
    return start.year


def _first(events: list[Json], kind: str) -> Json | None:
    return next((event for event in events if event["type"] == kind), None)


def _place(point: Json, lang: str) -> Json:
    """Where a point of the Landing scatter is, from the Site."""
    if point["distance_m"] == 0:
        return {"at_the_site": True}
    return {
        "distance_m": round(point["distance_m"]),
        "direction": compass(point["azimuth_deg"], lang),
        "azimuth_deg": round(point["azimuth_deg"], 1),
    }


def _optional(args: Args, name: str, default: float, low: float, high: float) -> float:
    if args.get(name) is None:
        return default
    return _number(args, name, low, high)


@tool(
    "get_visibility_flat",
    "The same Query on the Flat horizon: the bare sphere with no terrain, seen from the "
    "same Observer height. Gives the metrics and the first Sunset and Earthset with and "
    "without terrain, and how much the terrain changes them. Events without terrain are "
    "searched past the Window end, up to `search_end`.",
    QUERY_PARAMETERS,
    panel=lambda ctx, args: panel_title(ctx, "flat"),
)
def get_visibility_flat(ctx: Context, args: Args) -> Reading:
    from .. import main

    q = query_args(ctx, args)
    flat = _route_body(main.get_visibility_flat(**q))
    real = _route_body(main.get_visibility(**q))
    start = datetime.fromisoformat(flat["query"]["start"])
    sides: Json = {}
    for name, answer in (("without_terrain", flat), ("with_terrain", real)):
        sides[name] = {
            "metrics": _metrics(answer["metrics"]),
            "first_sunset": None,
            "first_earthset": None,
        }
        for kind in ("sunset", "earthset"):
            found = _first(answer["events"], kind)
            if found is not None:
                event = _event(found, start, ctx.lang)
                event.pop("occluder", None)
                sides[name][f"first_{kind}"] = event
    changes: Json = {}
    for kind in ("sunset", "earthset"):
        without, with_ = _first(flat["events"], kind), _first(real["events"], kind)
        if without is None or with_ is None:
            changes[f"first_{kind}"] = None
            continue
        hours = (
            datetime.fromisoformat(without["t"]) - datetime.fromisoformat(with_["t"])
        ).total_seconds() / 3600.0
        word = "later" if hours > 0 else "earlier" if hours < 0 else "at the same time"
        changes[f"first_{kind}"] = {"without_terrain_it_happens": word, "by": span(abs(hours))}
    gained = flat["metrics"]["sun_and_earth_hours"] - real["metrics"]["sun_and_earth_hours"]
    changes["sun_and_earth_time"] = {
        "without_terrain_there_is": "more" if gained > 0 else "less" if gained < 0 else "the same",
        "by": span(abs(gained)),
    }
    result = {
        "query": _query(flat["query"]),
        "flat_horizon_elevation_deg": round(flat["horizon_elevation_deg"], 5),
        "events_searched_until": flat["search_end"],
        **sides,
        "terrain_changes": changes,
    }
    return Reading("getVisibilityFlat", request("/visibility/flat", q), result)


def _windows_panel(ctx: Context, args: Args) -> str:
    if args.get("year") is None:
        return panel_title(ctx, "slip")
    return panel_title(ctx, "landing_day", _year_of(ctx, args))


@tool(
    "get_site_windows",
    "The same Window started on other days, one Window per day, ranked by Sun-and-Earth "
    "time: the best, a typical and the worst start day, and the Window as planned. Without "
    "`year` it is the launch slip, from a month early to five months late around the "
    "Query's start; with `year` it is every start day of that year. It also gives the "
    "Window every 30 days of shift, and `at_shift` reads the one start day the user names "
    "with `shift_days` (days after the planned start, negative for earlier; days after "
    "1 January with `year`). Every Window carries its rank by Sun-and-Earth time "
    "(`rank`, 1 is the most) and `out_of`; `start_days_in_all` is only how many start days "
    "there are, never a rank. Curated Sites only.",
    {
        "site_id": QUERY_PARAMETERS["site_id"],
        "year": {"type": "integer", "description": "Rank every start day of this year."},
        "shift_days": {
            "type": "integer",
            "description": "One start day to read: days after the planned start, or after "
            "1 January with `year`. Negative is earlier.",
        },
        "duration_hours": QUERY_PARAMETERS["duration_hours"],
        "observer_height_m": QUERY_PARAMETERS["observer_height_m"],
    },
    panel=_windows_panel,
)
def get_site_windows(ctx: Context, args: Args) -> Reading:
    from .. import main

    q = query_args(ctx, {k: v for k, v in args.items() if k not in ("year", "shift_days")})
    site_id = q["site_id"]
    if site_id is None:
        raise ToolError("not_curated", "Windows by start day are computed for Curated Sites only.")
    named = args.get("shift_days")
    if named is not None and (isinstance(named, bool) or not isinstance(named, int)):
        raise ToolError("invalid_parameter", "shift_days must be a whole number.")
    if args.get("year") is None:
        start, first, last = q["start"], -30, 150
    else:
        if isinstance(args["year"], bool) or not isinstance(args["year"], int):
            raise ToolError("invalid_parameter", "year must be a whole number.")
        year = args["year"]
        if not 1 <= year < 9999:
            raise ToolError("invalid_parameter", "year is out of range.")
        start = datetime(year, 1, 1, tzinfo=q["start"].tzinfo)
        first, last = 0, (datetime(year + 1, 1, 1) - datetime(year, 1, 1)).days - 1
    answer = _route_body(
        main.site_windows(
            site_id,
            start=start,
            duration_hours=q["duration_hours"],
            observer_height_m=q["observer_height_m"],
            first_shift_days=first,
            last_shift_days=last,
        )
    )

    everything = [w["sun_and_earth_hours"] for w in answer["windows"]]

    def rank(window: Json) -> int:
        # 1 + the start days with strictly more Sun-and-Earth time: ties share a rank. The
        # route's best is the earliest of the most and its worst the earliest of the least,
        # so the best is always rank 1 and the worst the last rank its hours can have.
        return 1 + sum(1 for hours in everything if hours > window["sun_and_earth_hours"])

    def row(window: Json | None) -> Json | None:
        if window is None:
            return None
        return {
            "start": window["start"],
            "shift_days": window["shift_days"],
            "rank": rank(window),
            "out_of": len(everything),
            "sun_and_earth_time": span(window["sun_and_earth_hours"]),
            "sunlit": span(window["sunlit_hours"]),
            "lcsp": span(window["lcsp_hours"]),
        }

    by_shift = {w["shift_days"]: w for w in answer["windows"]}
    planned = by_shift.get(0)
    result = {
        "site": _site(answer["site"]),
        "first_start": answer["windows"][0]["start"] if answer["windows"] else None,
        "window_length": span(answer["duration_hours"]),
        "start_days_in_all": len(answer["windows"]),
        "as_planned": row(planned) if args.get("year") is None else None,
        "best": row(answer["best"]),
        "typical": row(answer["typical"]),
        "worst": row(answer["worst"]),
        # A slip the user names ("a month late") is read here, never worked out by the model.
        "every_30_days": [row(by_shift[d]) for d in range(first, last + 1, 30) if d in by_shift],
    }
    if named is not None:
        if named in by_shift:
            result["at_shift"] = row(by_shift[named])
        else:
            result["at_shift"] = None
            result["at_shift_missing"] = (
                "That start day is outside the days ranked here, or its Window leaves coverage."
            )
    params = {
        "start": start,
        "duration_hours": q["duration_hours"],
        "observer_height_m": q["observer_height_m"],
        "first_shift_days": first,
        "last_shift_days": last,
    }
    return Reading("getSiteWindows", request(f"/sites/{site_id}/windows", params), result)


SCATTER_METRICS = (
    ("sun_and_earth_time", "sun_and_earth_hours"),
    ("sunlit", "sunlit_hours"),
    ("earth_visible", "earth_visible_hours"),
    ("lcip", "lcip_hours"),
    ("lcsp", "lcsp_hours"),
)


@tool(
    "get_visibility_scatter",
    "The Landing scatter: the Query answered at 19 points around the Site (the Site, six "
    "at half the radius and twelve at the radius), for a lander that misses its target. "
    "For each metric: its value at the Site, its lowest and highest across the points, "
    "and where those points are. It is landing error, not map error.",
    {
        **QUERY_PARAMETERS,
        "radius_m": {
            "type": "number",
            "description": "How far the lander may miss, in metres. Default: the panel's.",
        },
    },
    panel=lambda ctx, args: panel_title(ctx, "scatter"),
)
def get_visibility_scatter(ctx: Context, args: Args) -> Reading:
    from .. import main, scatter

    q = query_args(ctx, {k: v for k, v in args.items() if k != "radius_m"})
    radius = _optional(args, "radius_m", scatter.DEFAULT_RADIUS_M, 40.0, 1000.0)
    answer = _route_body(main.get_visibility_scatter(**q, radius_m=radius))
    points = answer["points"]
    metrics: Json = {}
    for name, key in SCATTER_METRICS:
        band = answer["band"][key]
        metrics[name] = {
            "at_the_site": span(points[0]["metrics"][key]),
            "lowest": span(band["min"]),
            "lowest_at": _place(points[band["min_point"]], ctx.lang),
            "highest": span(band["max"]),
            "highest_at": _place(points[band["max_point"]], ctx.lang),
        }
    result = {
        "query": _query(answer["query"]),
        "radius_m": answer["radius_m"],
        "half_radius_m": answer["radius_m"] / 2,
        "points": len(points),
        "metrics": metrics,
    }
    return Reading(
        "getVisibilityScatter", request("/visibility/scatter", {**q, "radius_m": radius}), result
    )


@tool(
    "get_terrain",
    "The Slope of the ground around the Site, measured on the finest DEM that covers it: "
    "median, 95th percentile and steepest cell, against a limit (by default NASA's "
    "Artemis III requirement), and the share of cells under it. Also the nearest "
    "permanently shadowed region, when the server has its map. The two come from different "
    "sources, and each part says its own: the Slope from a DEM within a radius, the "
    "shadow from the map of permanently shadowed regions. Never explain one with the "
    "other's source. It cannot see rocks or craters smaller than one DEM cell. A property "
    "of the Site: no Window.",
    {
        "site_id": QUERY_PARAMETERS["site_id"],
        "latitude_deg": QUERY_PARAMETERS["latitude_deg"],
        "longitude_deg": QUERY_PARAMETERS["longitude_deg"],
        "radius_m": {"type": "number", "description": "Radius in metres. Default: NASA's."},
        "slope_limit_deg": {
            "type": "number",
            "description": "Slope limit in degrees. Default: NASA's for Artemis III.",
        },
    },
)
def get_terrain(ctx: Context, args: Args) -> Reading:
    from .. import main, slope

    q = query_args(ctx, {k: args.get(k) for k in SITE_KEYS if k in args})
    radius = _optional(args, "radius_m", slope.NASA_SLOPE_RADIUS_M, 40.0, 2000.0)
    limit = _optional(args, "slope_limit_deg", slope.NASA_SLOPE_LIMIT_DEG, 0.0, 45.0)
    if limit == 0:
        raise ToolError("invalid_parameter", "slope_limit_deg must be above zero.")
    site = {k: q[k] for k in SITE_KEYS}
    answer = main.get_terrain(**site, radius_m=radius, slope_limit_deg=limit)
    ground = answer["slope"]
    result: Json = {
        "site": _site(answer["site"]),
        "radius_m": answer["radius_m"],
        "slope": {
            "source": "the DEM below, over the cells within radius_m of the Site",
            "radius_m": answer["radius_m"],
            "dem": answer["dem"],
            "median_deg": round(ground["median_deg"], 2),
            "percentile": 95,
            "p95_deg": round(ground["p95_deg"], 2),
            "steepest_cell_deg": round(ground["max_deg"], 2),
            "limit_deg": ground["limit_deg"],
            "share_under_limit_percent": round(ground["share_below_limit"] * 100.0, 1),
            "cells": ground["cells"],
        },
        "permanent_shadow": None,
    }
    shadow = answer.get("permanent_shadow")
    if shadow:
        result["permanent_shadow"] = {
            "source": "the map of permanently shadowed regions named below, searched "
            "outward from the Site; not the Slope's DEM and not its radius",
            "map": shadow["product"],
            "map_cell_m": _psr_cell_m(),
            "distance_km": round(shadow["distance_m"] / 1000.0, 1),
            "distance_m": round(shadow["distance_m"]),
            "direction": compass(shadow["azimuth_deg"], ctx.lang),
            "azimuth_deg": round(shadow["azimuth_deg"], 1),
        }
    params = {**site, "radius_m": radius, "slope_limit_deg": limit}
    return Reading("getTerrain", request("/terrain", params), result)


def _psr_cell_m() -> float | None:
    """The cell size of the map the shadow was read from (60 m for LPSR_85S_060M_201608)."""
    from .. import psr

    path = psr.map_path()
    if path is None:
        return None
    return float(psr._load(str(path), path.stat().st_mtime_ns).cell_m)


DSN_DISH_DIAMETER_M = 70

LANDER = {
    "panel_power_w": {
        "type": "number",
        "description": "Solar panel power in full Sun, in watts. Only from the user.",
    },
    "load_w": {"type": "number", "description": "Power the lander draws, in watts."},
    "battery_wh": {"type": "number", "description": "Battery capacity in watt-hours."},
}


@tool(
    "get_visibility_energy",
    "The battery of a lander over the Window: its Darkness tolerance against the LCSP, the "
    "lowest Charge and when, and the hours the load was not met. Needs the lander's panel "
    "power, load and battery capacity from the user; never make them up. Without them, "
    "the Darkness tolerance alone can be compared with the LCSP of get_visibility.",
    {**QUERY_PARAMETERS, **LANDER},
)
def get_visibility_energy(ctx: Context, args: Args) -> Reading:
    from .. import main

    if any(args.get(name) is None for name in LANDER):
        raise ToolError(
            "missing_lander",
            "Ask the user for the panel power, the load and the battery capacity: the app "
            "never invents a lander.",
        )
    q = query_args(ctx, {k: v for k, v in args.items() if k not in LANDER})
    lander = {
        "panel_power_w": _number(args, "panel_power_w", 0.0, 1_000_000.0),
        "load_w": _number(args, "load_w", 0.1, 1_000_000.0),
        "battery_wh": _number(args, "battery_wh", 1.0, 100_000_000.0),
    }
    answer = _route_body(
        main.get_visibility_energy(
            **q,
            panel_power_w=lander["panel_power_w"],
            load_w=lander["load_w"],
            battery_wh=lander["battery_wh"],
        )
    )
    tolerance, night = answer["darkness_tolerance_hours"], answer["lcsp_hours"]
    result = {
        "query": _query(answer["query"]),
        "lander": answer["lander"],
        "darkness_tolerance": span(tolerance),
        "lcsp": span(night),
        "battery_outlasts_the_longest_night": tolerance >= night,
        "lowest_charge_percent": round(answer["min_charge_fraction"] * 100.0, 1),
        "lowest_charge_time_utc": answer["min_charge_t"],
        "load_not_met": span(answer["unmet_hours"]),
        "load_always_met": answer["load_always_met"],
        "final_charge_percent": round(answer["final_charge_fraction"] * 100.0, 1),
    }
    return Reading("getVisibilityEnergy", request("/visibility/energy", {**q, **lander}), result)


@tool(
    "get_visibility_dsn",
    "The DSN link: when the Earth is visible from the Site and at least one 70 m Deep "
    "Space Network dish has the Moon above its minimum elevation. Hours of Earth visible, "
    "of link, and of Earth visible with no dish; each dish's passes. Geometry only: no "
    "schedule and no link budget.",
    QUERY_PARAMETERS,
)
def get_visibility_dsn(ctx: Context, args: Args) -> Reading:
    from .. import main

    q = query_args(ctx, args)
    answer = _route_body(main.get_visibility_dsn(**q))
    earth, link = answer["earth_visible_hours"], answer["link_hours"]
    periods = answer["link_periods"]
    result = {
        "query": _query(answer["query"]),
        "min_elevation_deg": answer["min_elevation_deg"],
        # The route reads the three 70 m dishes (app/dsn.py): a constant, given here so a
        # sentence that names the dish size is traced to the tool.
        "dish_diameter_m": DSN_DISH_DIAMETER_M,
        "dishes": len(answer["stations"]),
        "earth_visible": span(earth),
        "dsn_link": span(link),
        "earth_visible_without_a_dish": span(answer["earth_without_station_hours"]),
        "link_share_of_earth_visible_percent": round(link / earth * 100.0, 1) if earth else None,
        "link_periods": len(periods),
        "first_link": (
            {
                "start": periods[0]["start"],
                "end": periods[0]["end"],
                "duration": span(periods[0]["duration_hours"]),
            }
            if periods
            else None
        ),
        "stations": [
            {
                "id": station["id"],
                "complex": station["complex"],
                "passes": len(station["passes"]),
                "moon_in_view": span(sum(p["duration_hours"] for p in station["passes"])),
            }
            for station in answer["stations"]
        ],
    }
    return Reading("getVisibilityDsn", request("/visibility/dsn", q), result)
