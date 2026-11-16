"""Evaluate Eduardo's panel-geometry model, once, into data/ (the requirement).

The reference for the battery's panel pointing is Eduardo's `calcular_potencia_painel`, from
`src/solar_panel_math.py` in an independent implementation, at the commit below. It builds the Sun's direction and the panel's
normal as vectors (east, north, zenith) and takes their dot product, where our engine
writes the closed forms sin E and cos E · cos(A − P). This script reads the file from a
local clone of that repository at that commit, without changing a line of it, and saves
its incidence factor for:

- a grid of Sun directions: elevations −2° to 10° every 0.5°, azimuths all round every
  15°, for the three geometries of his model (`horizontal`, `vertical_fixed` facing 0°,
  90° and 213.5°, `vertical_tracking`);
- the Sun's own direction at Site 001 at eight instants of the month from the validation run
  weekend, as `GET /visibility` gives it, for the check through the API.

Run by hand, from the repository root:

    uv run --project backend python validation/fetch_panel_incidence.py [path to the clone]

`test_panel_incidence.py` reads the saved file and needs neither the clone nor numpy's
copy of his code.
"""

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

REFERENCE_NAME = "independent-panel-reference"
COMMIT = "170350d6cad9adeee02f91fea358c742526d3760"
SOURCE = "src/solar_panel_math.py"
FUNCTION = "calcular_potencia_painel"
DEFAULT_CLONE = Path.home() / "panel-reference"
OUT = Path(__file__).resolve().parent / "data" / "group_panel_incidence.json"

ELEVATIONS = [-2.0 + 0.5 * i for i in range(25)]
AZIMUTHS = [15.0 * i for i in range(24)]
PANEL_AZIMUTHS = [0.0, 90.0, 213.5]
INSTANTS = [
    "2026-11-14T03:00:00Z",
    "2026-11-17T21:15:00Z",
    "2026-11-21T14:30:00Z",
    "2026-11-25T07:45:00Z",
    "2026-11-29T01:00:00Z",
    "2026-12-02T18:15:00Z",
    "2026-12-06T11:30:00Z",
    "2026-12-10T04:45:00Z",
]


def load_model(clone: Path) -> Any:
    source = subprocess.run(
        ["git", "-C", str(clone), "show", f"{COMMIT}:{SOURCE}"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    blob = subprocess.run(
        ["git", "-C", str(clone), "rev-parse", f"{COMMIT}:{SOURCE}"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / "solar_panel_math.py"
        path.write_text(source, "utf-8")
        spec = importlib.util.spec_from_file_location("solar_panel_math", path)
        assert spec is not None and spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
    module.BLOB = blob
    return module


def factor(model: Any, elevation: float, azimuth: float, geometry: str, panel: float) -> float:
    _, incidence = getattr(model, FUNCTION)(
        elevation, azimuth, geometria=geometry, azimute_painel_deg=panel
    )
    return float(incidence)


def grid(model: Any) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for elevation in ELEVATIONS:
        for azimuth in AZIMUTHS:
            cases = [("horizontal", 0.0)]
            cases += [("vertical_fixed", panel) for panel in PANEL_AZIMUTHS]
            cases += [("vertical_tracking", 0.0)]
            for geometry, panel in cases:
                row: dict[str, Any] = {
                    "sun_elevation_deg": elevation,
                    "sun_azimuth_deg": azimuth,
                    "geometry": geometry,
                }
                if geometry == "vertical_fixed":
                    row["panel_azimuth_deg"] = panel
                row["incidence_factor"] = factor(model, elevation, azimuth, geometry, panel)
                rows.append(row)
    return rows


def site_001(model: Any) -> list[dict[str, Any]]:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
    from fastapi.testclient import TestClient

    from app.main import app

    client = TestClient(app)
    points = []
    for instant in INSTANTS:
        query = {"site_id": "001", "start": instant, "duration_hours": 0.25}
        sun = client.get("/visibility", params=query).json()["timeline"]["samples"][0]["sun"]
        azimuth, elevation = sun["azimuth_deg"], sun["elevation_deg"]
        points.append(
            {
                "t": instant,
                "sun_azimuth_deg": azimuth,
                "sun_elevation_deg": elevation,
                "sun_fraction": sun["fraction"],
                "horizontal": factor(model, elevation, azimuth, "horizontal", 0.0),
                "vertical_fixed_90": factor(model, elevation, azimuth, "vertical_fixed", 90.0),
                "vertical_tracking": factor(model, elevation, azimuth, "vertical_tracking", 0.0),
            }
        )
    return points


def main() -> None:
    clone = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_CLONE
    model = load_model(clone)
    out = {
        "source": {
            "repository": REFERENCE_NAME,
            "commit": COMMIT,
            "path": SOURCE,
            "blob": model.BLOB,
            "function": FUNCTION,
            "author": "Eduardo",
            "note": (
                "His function returns 0 whenever the Sun's centre is at or below 0°, a "
                "horizon on the bare sphere; ours leaves the horizon to the Sun fraction."
            ),
        },
        "grid": grid(model),
        "site_001": site_001(model),
    }
    OUT.write_text(json.dumps(out, indent=1) + "\n", "utf-8")
    print(f"{len(out['grid'])} grid rows and {len(out['site_001'])} Site 001 points -> {OUT}")


if __name__ == "__main__":
    main()
