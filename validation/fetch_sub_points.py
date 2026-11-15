"""Fetch sub-Earth and sub-solar points on the Moon from JPL Horizons, once, into data/.

Target the Moon (301) seen from the Earth's centre (500@399): Horizons' observer sub-point
is then the sub-Earth point, and its Sun sub-point is the sub-solar point. Quantities 14
and 15, UT, degrees. Run by hand (`uv run --project backend python validation/fetch_sub_points.py`);
the check itself reads the saved file and needs no network.
"""

from __future__ import annotations

import json
import subprocess
import urllib.parse
from datetime import UTC, datetime, timedelta
from pathlib import Path

URL = "https://ssd.jpl.nasa.gov/api/horizons.api"
OUT = Path(__file__).resolve().parent / "data" / "horizons_sub_points.json"


def instants() -> list[datetime]:
    """Twelve instants spread over 2025-2032, at odd hours so they don't sit on a grid."""
    first = datetime(2025, 2, 3, 5, 17, tzinfo=UTC)
    return [first + timedelta(days=241 * i, hours=7 * i) for i in range(12)]


def main() -> None:
    times = instants()
    params = {
        "format": "text",
        "COMMAND": "'301'",
        "OBJ_DATA": "'NO'",
        "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'",
        "CENTER": "'500@399'",
        "TLIST": " ".join(f"'{t.strftime('%Y-%m-%d %H:%M')}'" for t in times),
        "QUANTITIES": "'14,15'",
        "TIME_TYPE": "'UT'",
        "ANG_FORMAT": "'DEG'",
    }
    url = f"{URL}?{urllib.parse.urlencode(params)}"
    text = subprocess.run(["curl", "-s", url], capture_output=True, text=True, check=True).stdout
    rows = text.split("$$SOE")[1].split("$$EOE")[0].strip().splitlines()
    assert len(rows) == len(times), text
    points = []
    for when, row in zip(times, rows, strict=True):
        parts = row.split()
        earth_lon, earth_lat, sun_lon, sun_lat = (float(x) for x in parts[-4:])
        points.append(
            {
                "t": when.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "earth": {"longitude_deg": earth_lon, "latitude_deg": earth_lat},
                "sun": {"longitude_deg": sun_lon, "latitude_deg": sun_lat},
            }
        )
    header = text.split("$$SOE")[0]
    OUT.write_text(
        json.dumps(
            {
                "source": "JPL Horizons API, target 301 (Moon), center 500@399, quantities 14,15",
                "fetched_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "query_url": url,
                "longitude_note": [line for line in header.splitlines() if "LON" in line][:6],
                "points": points,
            },
            indent=2,
        )
        + "\n"
    )


if __name__ == "__main__":
    main()
