"""The engine side of the checks at the IM-2 Athena point (the requirement).

The DEM fixtures in CI reach about 20 km from the pole and Athena is 580 km from it, so this
runs where the full DEMs are: inside the backend container on the server, from the deploy
folder (about a minute):

    docker compose cp ../validation/athena.py backend:/tmp/athena.py
    docker compose cp ../validation/eclipse.py backend:/tmp/eclipse.py
    docker compose cp ../validation/run_athena_engine.py backend:/tmp/run_athena_engine.py
    docker compose exec -T -w /app backend python /tmp/run_athena_engine.py /tmp/athena_engine.json
    docker compose cp backend:/tmp/athena_engine.json ../validation/data/athena_engine.json

It goes through the code the API uses (horizon.mask, ephemeris.make_observer,
engine.look_at), set up as engine.calculate sets up a Query, and writes:
- the Horizon mask at the Athena point, 2 m, its 720 azimuths with each Occluder's distance;
- the Sun fraction and the Sun's elevation at the Athena point at both LROC image times;
- the Earth over the transmission, every minute: its elevation and its margin over the mask;
- the eclipse contacts at the Athena point, ours and gfoclt's, shown for information.
test_athena.py and test_eclipse.py read the file; until it is in the repo those parts show
as pending.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, "/app")  # in the backend container
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))  # in a checkout
import athena
import eclipse

LAT, LON, HEIGHT = athena.ATHENA_LATITUDE_DEG, athena.ATHENA_LONGITUDE_DEG, athena.OBSERVER_HEIGHT_M


def iso(instant: datetime) -> str:
    return instant.isoformat().replace("+00:00", "Z")


def compute(latitude_deg: float = LAT, longitude_deg: float = LON) -> dict[str, Any]:
    """Everything the checks need, at the Athena point unless told otherwise (CI smoke runs
    it at a fixture point, the server at Athena)."""
    from app import engine, ephemeris, horizon
    from app.constants import ENGINE_VERSION

    began = time.monotonic()
    mask = horizon.mask(latitude_deg, longitude_deg, HEIGHT)
    if not mask.products:
        raise SystemExit("no DEM covers this point here: run this on the server")
    observer = ephemeris.make_observer(latitude_deg, longitude_deg, mask.site_height_m + HEIGHT)

    images: dict[str, Any] = {}
    for product, instant in athena.LROC_MID_EXPOSURE.items():
        look = engine.look_at(instant, observer, mask)
        images[product] = {
            "t": iso(instant),
            "sun_fraction": look.sun_fraction(),
            "sun_elevation_deg": look.sun.elevation_deg,
            "sun_azimuth_deg": look.sun.azimuth_deg,
            "mask_under_sun_deg": float(mask.elevation_at(look.sun.azimuth_deg)),
        }

    lowest: dict[str, Any] | None = None
    instant, steps = athena.TRANSMISSION_START, 0
    while instant <= athena.TRANSMISSION_END:
        look = engine.look_at(instant, observer, mask)
        margin = look.earth.elevation_deg - float(mask.elevation_at(look.earth.azimuth_deg))
        if lowest is None or margin < lowest["margin_deg"]:
            lowest = {
                "t": iso(instant),
                "margin_deg": margin,
                "earth_elevation_deg": look.earth.elevation_deg,
                "earth_azimuth_deg": look.earth.azimuth_deg,
            }
        steps += 1
        instant += timedelta(seconds=athena.TRANSMISSION_STEP_S)

    span = (athena.ECLIPSE_START, athena.ECLIPSE_END)
    ours = eclipse.engine_contacts(latitude_deg, longitude_deg, HEIGHT, *span)
    theirs = eclipse.spice_contacts(latitude_deg, longitude_deg, HEIGHT, *span)

    output = {
        "engine_version": ENGINE_VERSION,
        "kernels": ephemeris.kernel_names(),
        "dems": mask.products,
        "latitude_deg": latitude_deg,
        "longitude_deg": longitude_deg,
        "observer_height_m": HEIGHT,
        "site_height_m": mask.site_height_m,
        "horizon": [
            {
                "azimuth_deg": s["azimuth_deg"],
                "elevation_deg": s["elevation_deg"],
                "occluder_distance_m": s["occluder"]["distance_m"],
            }
            for s in mask.samples
        ],
        "images": images,
        "transmission": {
            "start": iso(athena.TRANSMISSION_START),
            "end": iso(athena.TRANSMISSION_END),
            "step_s": athena.TRANSMISSION_STEP_S,
            "steps": steps,
            "lowest": lowest,
        },
        "eclipse": {
            "engine": {name: iso(t) for name, t in ours.items()},
            "gfoclt": {name: iso(t) for name, t in theirs.items()},
        },
        "seconds": time.monotonic() - began,
    }
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("output")
    args = parser.parse_args()
    output = compute()
    Path(args.output).write_text(json.dumps(output, indent=1) + "\n", "utf-8")
    print(f"wrote {args.output} in {output['seconds']:.0f} s", file=sys.stderr)


if __name__ == "__main__":
    main()
