"""Fetch the Sun's distance from Curated Site 001 from JPL Horizons, once, into data/.

Target the Sun (10) from a surface observer at Site 001 (coord@301, geodetic, 2 m above
the 1737.4 km sphere), quantity 20 (observer range, light-time corrected), UT. Run by hand
(`uv run --project backend python validation/fetch_sun_distance.py`); the check itself,
`test_sun_distance.py`, reads the saved file and needs no network.

The instants are spread over 2025-2032, at odd minutes so they don't sit on the hour, and
each is one where the engine sees the whole Sun over the terrain at Site 001: the check
reads the distance factor off the battery's Charge, and the panels give nothing while the
Sun is down. (Horizons' own daylight flag uses the bare sphere, so it disagrees at some of
them; the distance does not depend on the horizon.)
"""

from __future__ import annotations

import json
import subprocess
import urllib.parse
from datetime import UTC, datetime
from pathlib import Path

URL = "https://ssd.jpl.nasa.gov/api/horizons.api"
OUT = Path(__file__).resolve().parent / "data" / "horizons_sun_distance.json"
SITE = {"id": "001", "latitude_deg": -89.4661, "longitude_deg": -136.949, "height_m": 2.0}
INSTANTS = [
    "2025-02-03T05:17:00Z",
    "2025-10-02T12:17:00Z",
    "2026-06-02T19:17:00Z",
    "2027-01-28T02:17:00Z",
    "2027-09-26T09:17:00Z",
    "2028-05-28T16:17:00Z",
    "2029-01-20T23:17:00Z",
    "2029-09-19T06:17:00Z",
    "2030-05-18T13:17:00Z",
    "2031-01-14T20:17:00Z",
    "2031-09-13T03:17:00Z",
    "2032-05-11T10:17:00Z",
]


def main() -> None:
    times = [datetime.fromisoformat(t) for t in INSTANTS]
    east_longitude = SITE["longitude_deg"] % 360.0
    params = {
        "format": "text",
        "COMMAND": "'10'",
        "OBJ_DATA": "'NO'",
        "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'",
        "CENTER": "'coord@301'",
        "COORD_TYPE": "'GEODETIC'",
        "SITE_COORD": f"'{east_longitude},{SITE['latitude_deg']},{SITE['height_m'] / 1000:.4f}'",
        "TLIST": " ".join(f"'{t.strftime('%Y-%m-%d %H:%M')}'" for t in times),
        "QUANTITIES": "'20'",
        "TIME_TYPE": "'UT'",
        "CSV_FORMAT": "'YES'",
    }
    url = f"{URL}?{urllib.parse.urlencode(params)}"
    text = subprocess.run(["curl", "-s", url], capture_output=True, text=True, check=True).stdout
    header = text.split("$$SOE")[0]
    rows = text.split("$$SOE")[1].split("$$EOE")[0].strip().splitlines()
    assert len(rows) == len(times), text
    km_per_au = float(header.split("au=")[1].split()[0]) if "au=" in header else None
    points = []
    for when, row in zip(times, rows, strict=True):
        cells = [cell.strip() for cell in row.split(",")]
        # Date, two blank flags, delta (au), deldot (km/s).
        delta_au = float(cells[3])
        points.append(
            {"t": when.strftime("%Y-%m-%dT%H:%M:%SZ"), "delta_au": delta_au, "row": row.strip()}
        )
    geodetic = [line.strip() for line in header.splitlines() if "Center geodetic" in line]
    OUT.write_text(
        json.dumps(
            {
                "source": "JPL Horizons API, target 10 (Sun), center coord@301 (Site 001, 2 m), "
                "quantity 20 (observer range), UT",
                "fetched_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "query_url": url,
                "site": SITE,
                "center_echo": geodetic,
                "km_per_au_in_header": km_per_au,
                "points": points,
            },
            indent=2,
        )
        + "\n"
    )


if __name__ == "__main__":
    main()
