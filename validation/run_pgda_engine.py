"""The engine side of the PGDA check (the requirement): every point over 18.6 years, hourly.

The span runs past the app's coverage (2023 to 2032), so this does not go through the API.
It runs the engine's own code (horizon.mask, engine.look_at) where the full DEMs and the
full DE440 are, inside the backend container, from the deploy folder on the server:

    docker compose cp ../validation/pgda.py backend:/tmp/pgda.py
    docker compose cp ../validation/run_pgda_engine.py backend:/tmp/run_pgda_engine.py
    docker compose cp ../validation/data/pgda_points.json backend:/tmp/pgda_points.json
    docker compose exec -T -w /app backend python /tmp/run_pgda_engine.py \\
        /tmp/pgda_points.json /tmp/pgda_engine.json --processes 3
    docker compose cp backend:/tmp/pgda_engine.json ../validation/data/pgda_engine.json

For each point it counts, over each span, the hourly steps with any part of the Sun's disc
above the Horizon mask (the engine's own Sunrise and Sunset rule), the mean Sun fraction,
the steps with any part of the Earth's disc above it, and the steps with the Earth's centre
above it. Three runs per point: the judged cycle, a second cycle half a cycle later, and
the negative control (the judged cycle at longitude + 180°). The bright ridges, shown for
information and never judged, get the judged cycle only. `--days` shortens every span,
for a smoke run only: test_pgda.py refuses an output that is not the full cycle.
"""

from __future__ import annotations

import argparse
import json
import math
import multiprocessing
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, "/app")  # in the backend container
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))  # in a checkout
import pgda


def count(latitude: float, longitude: float, start: datetime, days: int) -> dict[str, Any]:
    import numpy as np

    from app import engine, ephemeris, geometry, horizon

    mask = horizon.mask(latitude, longitude, pgda.OBSERVER_HEIGHT_M, 20.0)
    observer = ephemeris.make_observer(
        latitude, longitude, mask.site_height_m + pgda.OBSERVER_HEIGHT_M
    )
    steps = int(timedelta(days=days) / pgda.STEP)
    sun_any = earth_any = earth_centre = 0
    sun_fraction = 0.0
    first = ephemeris.et(start)
    step_s = pgda.STEP.total_seconds()
    for i in range(steps):
        # engine.look_at, stepping in ephemeris seconds instead of parsing each instant.
        epoch = first + i * step_s
        sun = ephemeris.apparent("SUN", epoch, observer)
        earth = ephemeris.apparent("EARTH", epoch, observer)
        look = engine.Look(
            instant=start,
            sun=sun,
            earth=earth,
            sun_radius_rad=ephemeris.angular_radius_rad(sun.distance_km, ephemeris.sun_radius_km()),
            earth_radius_rad=ephemeris.angular_radius_rad(
                earth.distance_km, ephemeris.earth_radius_km()
            ),
            mask=mask,
        )
        sun_any += look.above("sun")
        sun_fraction += look.sun_fraction()
        earth_centre += look.above("earth")
        elevation = look.earth.elevation_deg
        stretch = 1.0 / max(math.cos(math.radians(elevation)), 1e-6)
        azimuth = look.earth.azimuth_deg

        def profile(offsets: Any, a: float = azimuth, s: float = stretch) -> Any:
            # The mask under the Earth's disc, as Look._sun_over_terrain does for the Sun.
            return np.radians(mask.elevation_at(a + np.degrees(offsets) * s))

        over = geometry.disc_over_profile(math.radians(elevation), look.earth_radius_rad, profile)
        earth_any += over > 0.0
    return {
        "steps": steps,
        "sun_any": sun_any / steps,
        "sun_mean_fraction": sun_fraction / steps,
        "earth_any": earth_any / steps,
        "earth_centre": earth_centre / steps,
        "dems": mask.products,
    }


def run_point(task: tuple[dict[str, Any], int, bool]) -> dict[str, Any]:
    point, days, bright = task
    began = time.monotonic()
    lat, lon = point["latitude_deg"], point["longitude_deg"]
    out: dict[str, Any] = {"id": point["id"], "judged": count(lat, lon, pgda.JUDGED_START, days)}
    if not bright:
        out["second_cycle"] = count(lat, lon, pgda.SECOND_START, days)
        shifted = (lon + pgda.CONTROL_LONGITUDE_SHIFT_DEG) % 360.0
        out["control"] = count(lat, shifted, pgda.JUDGED_START, days)
    out["seconds"] = time.monotonic() - began
    print(f"{point['id']} {out['seconds']:.1f} s", file=sys.stderr, flush=True)
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("points")
    parser.add_argument("output")
    parser.add_argument("--processes", type=int, default=1)
    parser.add_argument("--days", type=int, default=pgda.CYCLE_DAYS, help="smoke runs only")
    parser.add_argument("--limit", type=int, default=0, help="first N points, smoke runs only")
    args = parser.parse_args()

    from app import ephemeris
    from app.constants import ENGINE_VERSION

    drawn = json.loads(Path(args.points).read_text("utf-8"))
    points, bright = drawn["points"], drawn.get("bright_points", [])
    if args.limit:
        points, bright = points[: args.limit], bright[: args.limit]
    began = time.monotonic()
    tasks = [(p, args.days, False) for p in points] + [(p, args.days, True) for p in bright]
    if args.processes > 1:
        with multiprocessing.get_context("spawn").Pool(args.processes) as pool:
            done = pool.map(run_point, tasks, chunksize=1)
    else:
        done = [run_point(task) for task in tasks]
    results, bright_results = done[: len(points)], done[len(points) :]
    output = {
        "engine_version": ENGINE_VERSION,
        "kernels": ephemeris.kernel_names(),
        "observer_height_m": pgda.OBSERVER_HEIGHT_M,
        "step_hours": pgda.STEP.total_seconds() / 3600.0,
        "days": args.days,
        "judged_start": pgda.JUDGED_START.isoformat(),
        "second_start": pgda.SECOND_START.isoformat(),
        "control_longitude_shift_deg": pgda.CONTROL_LONGITUDE_SHIFT_DEG,
        "seconds": time.monotonic() - began,
        "points": results,
        "bright_points": bright_results,
    }
    Path(args.output).write_text(json.dumps(output, indent=1) + "\n", "utf-8")
    print(
        f"wrote {args.output}: {len(results) + len(bright_results)} points in {output['seconds']:.0f} s",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
