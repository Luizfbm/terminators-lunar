"""The engine side of the Gläser check (the requirement): 20 years, hourly, offline.

The span (2017-01-01 to 2037-01-01) runs past the app's coverage, so this does not go
through the API. It runs the engine's own code (horizon.mask, ephemeris.apparent) where the
full DEMs and the full DE440 are, inside the backend image, from the repo root on the server:

    mkdir -p /tmp/glaser
    docker compose -f deploy/compose.yaml --env-file .env run --rm --no-deps -T \\
        -v "$PWD/validation:/validation:ro" -v /tmp/glaser:/out \\
        --entrypoint python backend /validation/run_glaser_engine.py \\
        /out/glaser_engine.json --processes 3 --nice 10 </dev/null
    cp /tmp/glaser/glaser_engine.json validation/data/glaser_engine.json

The compose service already mounts the data volume read-only at /data and sets
LUNAR_META_KERNEL and LUNAR_DEM_DIR, as deploy/fetch-data.sh relies on for crop_offpole.py.

What it computes: the 317 points of the neighbourhood of C1 (judged), the same grid at
longitude + 180° (the negative control), and the 49 points of Site 001's Landing ellipse
(information). The Sun vectors are computed once per grid, by the engine's own
`ephemeris.apparent` from the grid's centre, and shared by its points; each point has its own
Horizon mask. At most 3 worker processes, one thread of arithmetic each, and `--nice` lowers
their priority below the engine's.

It is resumable. Every finished point is appended to `<output>.partial.jsonl` and the Sun
vectors are kept in `<output>.work/`; run the same command again after a stop and it carries
on, and refuses to if the rule, the period or the kernels changed (`--fresh` starts over).
`--days` and `--start` shorten the period, `--limit` takes the first N points of each set:
smoke runs only, and test_glaser.py refuses an output that is not the full one.
"""

from __future__ import annotations

import os

# One thread of arithmetic per worker: the limit is in worker processes, not in BLAS threads.
for _name in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
    os.environ.setdefault(_name, "1")

import argparse
import json
import multiprocessing
import shutil
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, "/app")  # in the backend container
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))  # in a checkout
import glaser
import numpy as np

MAX_PROCESSES = 3

# The sets of points: where each one is centred, and what its Sun series holds.
# "judged": the neighbourhood of C1; hourly Sun vectors every step of the engine's 15 min
# grid, for the sensitivity points. "control": the same at longitude + 180°.
# "site001": Site 001's Landing ellipse, for information.
ROLES = ("judged", "control", "site001")


def centres() -> dict[str, tuple[float, float]]:
    return {
        "judged": (glaser.CENTRE_LATITUDE_DEG, glaser.CENTRE_LONGITUDE_DEG),
        "control": (
            glaser.CENTRE_LATITUDE_DEG,
            glaser.control_longitude(glaser.CENTRE_LONGITUDE_DEG),
        ),
        "site001": (glaser.SITE_001_LATITUDE_DEG, glaser.SITE_001_LONGITUDE_DEG % 360.0),
    }


def radii() -> dict[str, float]:
    return {
        "judged": glaser.RADIUS_M,
        "control": glaser.RADIUS_M,
        "site001": glaser.ELLIPSE_RADIUS_M,
    }


def key(role: str, node_id: str) -> str:
    return f"{role}/{node_id}"


def header(args: argparse.Namespace, start: datetime) -> dict[str, Any]:
    """What a resumed run must share with the run that began the partial file."""
    from app import ephemeris
    from app.constants import ENGINE_VERSION

    return {
        "engine_version": ENGINE_VERSION,
        "kernels": ephemeris.kernel_names(),
        "rule": glaser.rule(),
        "period_start": start.isoformat(),
        "period_days": args.days,
        "limit": args.limit,
    }


# --- Sun vectors, once per set ------------------------------------------------------------


def make_series(role: str, work: Path, start: datetime, days: int, sun_radius_km: float) -> None:
    """The shared Sun vectors of one set, kept in `work` for the workers and for a resume."""
    from app import ephemeris, horizon

    sun_file = work / f"{role}_sun.npy"
    if sun_file.exists():
        return
    lat, lon = centres()[role]
    mask = horizon.mask(lat, lon, glaser.OBSERVER_HEIGHT_M, 20.0)
    height = mask.site_height_m + glaser.OBSERVER_HEIGHT_M
    began = time.monotonic()
    judged = role == "judged"
    # The judged set also needs the engine's 15 min step, for the sensitivity points.
    substeps = glaser.SUBSTEPS if judged else 1
    series = glaser.build_series(
        lat,
        lon,
        height,
        start,
        glaser.STEP.total_seconds() / substeps,
        days * 24 * substeps,
    )
    if judged:
        # The Earth, for the Sun fraction with its eclipse, which is shown and not judged.
        hourly = glaser.build_series(
            lat, lon, height, start, glaser.STEP.total_seconds(), days * 24, earth=True
        )
        cover = glaser.eclipse_cover(hourly, sun_radius_km, ephemeris.earth_radius_km())
        np.save(work / f"{role}_cover.npy", cover)
    np.save(work / f"{role}_sun.tmp.npy", series.sun)
    (work / f"{role}_sun.tmp.npy").rename(sun_file)
    (work / f"{role}.json").write_text(
        json.dumps({"height_m": height, "site_height_m": mask.site_height_m, "dems": mask.products})
        + "\n",
        "utf-8",
    )
    print(
        f"{role}: Sun vectors for {len(series.sun)} steps in {time.monotonic() - began:.1f} s",
        file=sys.stderr,
        flush=True,
    )


# --- One point ----------------------------------------------------------------------------

_CACHE: dict[str, tuple[Any, Any]] = {}


def loaded(work: str, role: str) -> tuple[Any, Any]:
    """The Sun vectors (and the eclipse cover) of a set, memory-mapped once per process."""
    if role not in _CACHE:
        folder = Path(work)
        sun = np.load(folder / f"{role}_sun.npy", mmap_mode="r")
        cover_file = folder / f"{role}_cover.npy"
        cover = np.load(cover_file) if cover_file.exists() else None
        _CACHE[role] = (sun, cover)
    return _CACHE[role]


def run_point(task: dict[str, Any]) -> dict[str, Any]:
    from app import ephemeris, horizon

    began = time.monotonic()
    role, node = task["role"], task["node"]
    sun, cover = loaded(task["work"], role)
    start = datetime.fromisoformat(task["start"])
    sensitivity = bool(node["sensitivity"]) and role == "judged"
    mask = horizon.mask(node["latitude_deg"], node["longitude_deg"], glaser.OBSERVER_HEIGHT_M, 20.0)
    frame = ephemeris.make_observer(node["latitude_deg"], node["longitude_deg"], 0.0)
    if role == "judged" and not sensitivity:
        sun = sun[:: glaser.SUBSTEPS]
    series = glaser.Series(start, glaser.STEP.total_seconds(), sun)
    result = glaser.scan_point(
        mask,
        frame,
        task["sun_radius_km"],
        series,
        cover,
        sensitivity,
    )
    # Only the judged set is read by span; the others are judged over the whole period.
    if role != "judged":
        result = {"judged": result["judged"]}
    done = {
        "role": role,
        "id": node["id"],
        "site_height_m": mask.site_height_m,
        **result,
        "seconds": time.monotonic() - began,
    }
    print(f"{key(role, node['id'])} {done['seconds']:.1f} s", file=sys.stderr, flush=True)
    return done


# --- The partial file and the output -------------------------------------------------------


def load_partial(path: Path, expected: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """The finished points of an earlier run of the same rule, by their key."""
    done: dict[str, dict[str, Any]] = {}
    if not path.exists():
        return done
    lines = [line for line in path.read_text("utf-8").splitlines() if line.strip()]
    if not lines:
        return done
    first = json.loads(lines[0])
    if first.get("header") != expected:
        raise SystemExit(
            f"{path} was begun with another rule, period or kernels: remove it or pass --fresh"
        )
    for line in lines[1:]:
        point = json.loads(line)
        done[key(point["role"], point["id"])] = point
    return done


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("output", help="the JSON file to write, e.g. /out/glaser_engine.json")
    parser.add_argument(
        "--processes",
        type=int,
        default=MAX_PROCESSES,
        help=f"worker processes, 1 to {MAX_PROCESSES} (default {MAX_PROCESSES})",
    )
    parser.add_argument(
        "--nice", type=int, default=10, help="added to the niceness of every process (default 10)"
    )
    parser.add_argument("--fresh", action="store_true", help="forget an earlier partial run")
    parser.add_argument("--days", type=int, default=glaser.PERIOD_DAYS, help="smoke runs only")
    parser.add_argument(
        "--start", default=glaser.PERIOD_START.isoformat(), help="smoke runs only (ISO instant)"
    )
    parser.add_argument("--limit", type=int, default=0, help="first N points of a set, smoke only")
    args = parser.parse_args()
    if not 1 <= args.processes <= MAX_PROCESSES:
        parser.error(f"--processes must be from 1 to {MAX_PROCESSES}: the engine needs the rest")
    if args.nice < 0:
        parser.error("--nice cannot be negative")
    if args.nice:
        os.nice(args.nice)  # the workers are spawned from here and inherit it

    from app import ephemeris

    _CACHE.clear()  # a run in this process may follow another one (the smoke tests)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    partial = output.with_name(output.name + ".partial.jsonl")
    work = output.with_name(output.name + ".work")
    if args.fresh:
        partial.unlink(missing_ok=True)
        shutil.rmtree(work, ignore_errors=True)
    work.mkdir(exist_ok=True)

    start = datetime.fromisoformat(args.start)
    if start.tzinfo is None:
        start = start.replace(tzinfo=UTC)
    began = time.monotonic()
    expected = header(args, start)
    done = load_partial(partial, expected)
    if not partial.exists() or not partial.stat().st_size:
        partial.write_text(json.dumps({"header": expected}) + "\n", "utf-8")
    sun_radius_km = ephemeris.sun_radius_km()
    for role in ROLES:
        make_series(role, work, start, args.days, sun_radius_km)

    sets = {
        role: glaser.grid(*centres()[role], radii()[role])[: args.limit or None] for role in ROLES
    }
    tasks = [
        {
            "role": role,
            "node": node,
            "work": str(work),
            "start": start.isoformat(),
            "sun_radius_km": sun_radius_km,
        }
        for role in ROLES
        for node in sets[role]
        if key(role, node["id"]) not in done
    ]
    total = sum(len(nodes) for nodes in sets.values())
    print(f"{len(done)} of {total} points done, {len(tasks)} to run", file=sys.stderr, flush=True)

    def finish(point: dict[str, Any]) -> None:
        done[key(point["role"], point["id"])] = point
        with partial.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(point) + "\n")
        print(f"{len(done)}/{total}", file=sys.stderr, flush=True)

    if args.processes > 1 and tasks:
        with multiprocessing.get_context("spawn").Pool(args.processes) as pool:
            for point in pool.imap_unordered(run_point, tasks, chunksize=1):
                finish(point)
    else:
        for task in tasks:
            finish(run_point(task))

    def assemble(role: str) -> list[dict[str, Any]]:
        return [{**node, **done[key(role, node["id"])]} for node in sets[role]]

    series = {role: json.loads((work / f"{role}.json").read_text("utf-8")) for role in ROLES}
    result = {
        **expected,
        "smoke": bool(args.limit)
        or args.days != glaser.PERIOD_DAYS
        or start != glaser.PERIOD_START,
        "processes": args.processes,
        "nice": args.nice,
        "step_hours": glaser.STEP.total_seconds() / 3600.0,
        "observer_height_m": glaser.OBSERVER_HEIGHT_M,
        "sun_radius_km": sun_radius_km,
        "sets": series,
        "seconds_this_run": time.monotonic() - began,
        "points": assemble("judged"),
        "control_points": assemble("control"),
        "site_001_points": assemble("site001"),
    }
    output.write_text(json.dumps(result, indent=1) + "\n", "utf-8")
    output.chmod(0o644)
    print(f"wrote {output}: {total} points in {result['seconds_this_run']:.0f} s", file=sys.stderr)


if __name__ == "__main__":
    main()
