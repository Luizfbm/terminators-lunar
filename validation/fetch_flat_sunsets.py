"""Fetch the Sun from JPL Horizons at the engine's flat Sunsets, once, into data/ (the requirement).

For each Query below, the backend's `/visibility/flat` (no DEM needed) gives its Sunsets
from the Window start to `search_end`. Horizons is then asked, for that Site on its
1737.4 km sphere at the Observer height, for the Sun's apparent azimuth and elevation
(quantity 4, airless) and its angular diameter (quantity 13) at exactly those instants.
The check reads the saved file and needs no network.

Run by hand from the repo root:
    uv run --project backend python validation/fetch_flat_sunsets.py
"""

from __future__ import annotations

import json
import subprocess
import sys
import time
import urllib.parse
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from fastapi.testclient import TestClient  # noqa: E402

from app import catalog  # noqa: E402
from app.main import app  # noqa: E402

URL = "https://ssd.jpl.nasa.gov/api/horizons.api"
OUT = Path(__file__).resolve().parent / "data" / "horizons_flat_sunsets.json"

# Latitudes from the pole to 84.5°S and Observer heights of 0, 2 and 10 m, so the dip
# takes three values (0, 0.0869° and 0.1944°). Default Window: one synodic month.
QUERIES: list[dict[str, Any]] = [
    {"site_id": "001", "start": "2025-03-01T00:00:00Z", "observer_height_m": 2},
    # 11 km from the pole the Sun sets once in this search, 165 days past the Window.
    {"latitude_deg": -89.9, "longitude_deg": 0.0, "start": "2028-08-01T00:00:00Z"},
    {
        "latitude_deg": -85.416,
        "longitude_deg": 31.8506,
        "start": "2027-01-01T00:00:00Z",
        "observer_height_m": 2,
    },
    {
        "latitude_deg": -85.2,
        "longitude_deg": -75.0,
        "start": "2030-06-01T00:00:00Z",
        "observer_height_m": 10,
    },
    {
        "latitude_deg": -84.5,
        "longitude_deg": 90.0,
        "start": "2031-09-01T00:00:00Z",
        "observer_height_m": 0,
    },
]


def site_of(params: dict[str, Any]) -> tuple[float, float]:
    if "site_id" in params:
        site = catalog.find_site(params["site_id"])
        assert site is not None
        return site["latitude_deg"], site["longitude_deg"]
    return params["latitude_deg"], params["longitude_deg"]


def horizons(lat: float, lon: float, height_m: float, instants: list[str]) -> tuple[str, str]:
    stamps = [datetime.fromisoformat(t).strftime("%Y-%m-%d %H:%M:%S") for t in instants]
    params = {
        "format": "text",
        "COMMAND": "'10'",
        "OBJ_DATA": "'NO'",
        "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'",
        "CENTER": "'coord@301'",
        "COORD_TYPE": "'GEODETIC'",
        "SITE_COORD": f"'{lon},{lat},{height_m / 1000.0:.4f}'",
        "TLIST": " ".join(f"'{s}'" for s in stamps),
        "QUANTITIES": "'4,13'",
        "APPARENT": "'AIRLESS'",
        "TIME_TYPE": "'UT'",
        "CSV_FORMAT": "'YES'",
    }
    url = f"{URL}?{urllib.parse.urlencode(params)}"
    text = subprocess.run(["curl", "-s", url], capture_output=True, text=True, check=True).stdout
    return url, text


def main() -> None:
    client = TestClient(app)
    out: list[dict[str, Any]] = []
    for params in QUERIES:
        response = client.get("/visibility/flat", params=params)
        assert response.status_code == 200, response.text
        answer = response.json()
        sunsets = [e["t"] for e in answer["events"] if e["type"] == "sunset"]
        lat, lon = site_of(params)
        height = float(params.get("observer_height_m", 2))
        entry: dict[str, Any] = {
            "params": params,
            "latitude_deg": lat,
            "longitude_deg": lon,
            "observer_height_m": height,
            "search_end": answer["search_end"],
            "sunsets": [],
        }
        if sunsets:
            url, text = horizons(lat, lon, height, sunsets)
            header = text.split("$$SOE")[0]
            # Horizons must have read the Site on the 1737.4 km sphere, airless.
            assert "1737.4, 1737.4, 1737.4" in header, header
            assert "AIRLESS" in header, header
            rows = text.split("$$SOE")[1].split("$$EOE")[0].strip().splitlines()
            assert len(rows) == len(sunsets), text
            for stamp, row in zip(sunsets, rows, strict=True):
                cells = [c.strip() for c in row.split(",")]
                azimuth, elevation, diameter = (float(c) for c in cells[3:6])
                entry["sunsets"].append(
                    {
                        "t": stamp,
                        "horizons_time": cells[0],
                        "azimuth_deg": azimuth,
                        "elevation_deg": elevation,
                        "angular_diameter_arcsec": diameter,
                    }
                )
            entry["query_url"] = url
            time.sleep(1.0)
        out.append(entry)
        print(params, len(sunsets), "Sunsets")
    OUT.write_text(
        json.dumps(
            {
                "source": (
                    "JPL Horizons API, Sun (10) from coord@301 (geodetic, 1737.4 km sphere), "
                    "quantities 4 (apparent az/el, airless) and 13 (angular diameter), UT"
                ),
                "instants_from": "the engine's /visibility/flat Sunsets for each Query",
                "fetched_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "queries": out,
            },
            indent=2,
        )
        + "\n"
    )
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
