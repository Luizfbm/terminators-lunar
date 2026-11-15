#!/usr/bin/env python3
"""Fetch JPL Horizons' Moon elevation around each DSN pass edge the backend reports (the requirement).

For ten 30 h Windows spread over the coverage, the backend (through its HTTP API, on the
fixtures) gives each 70 m antenna's passes. For every pass edge inside a Window, Horizons
is asked for the Moon's apparent airless azimuth and elevation from that antenna, every
minute from 12 minutes before the edge to 12 minutes after. The test then reads, from
Horizons alone, the elevation at our edge and the instant the Moon crosses 6°.

The antennas are placed at the geodetic coordinates printed in the stations' frames
kernel (from DSN 810-005 module 301), on Horizons' WGS-84 Earth.

    uv run --project backend python validation/fetch_dsn_horizons.py

It writes validation/data/horizons_dsn.json. Needs the network; CI never runs it.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
import time
import urllib.parse
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.main import app
from fastapi.testclient import TestClient

HORIZONS_API_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"
OUT = Path(__file__).resolve().parent / "data" / "horizons_dsn.json"

# Geodetic longitude, latitude (degrees) and altitude (km) of each antenna, as printed in
# earth_topo_260814.tf (WGS-84 spheroid, ITRF93, epoch 2026-07-17).
STATIONS = {
    "DSS-14": (-116.8895431330483, 35.4258999225138, 1.001384087429),
    "DSS-43": (148.9812726938012, -35.4024141881635, 0.6888431941637),
    "DSS-63": (-4.2480020535013, 40.4312138842194, 0.8648448375319),
}
WINDOWS = [
    "2023-08-15T00:00:00Z",
    "2024-09-10T00:00:00Z",
    "2025-06-20T00:00:00Z",
    "2026-03-03T00:00:00Z",
    "2026-11-14T00:00:00Z",
    "2027-08-01T00:00:00Z",
    "2028-05-12T00:00:00Z",
    "2029-12-05T00:00:00Z",
    "2031-02-17T00:00:00Z",
    "2032-10-01T00:00:00Z",
]
WINDOW_HOURS = 30
HALF_SPAN_MINUTES = 12


def stamp(when: datetime) -> str:
    return when.strftime("%Y-%m-%d %H:%M:%S")


def query(station: str, edge: datetime) -> tuple[str, str]:
    lon, lat, alt = STATIONS[station]
    params = {
        "format": "text",
        "COMMAND": "'301'",
        "OBJ_DATA": "'NO'",
        "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'",
        "CENTER": "'coord@399'",
        "COORD_TYPE": "'GEODETIC'",
        "SITE_COORD": f"'{lon},{lat},{alt}'",
        "START_TIME": f"'{stamp(edge - timedelta(minutes=HALF_SPAN_MINUTES))}'",
        "STOP_TIME": f"'{stamp(edge + timedelta(minutes=HALF_SPAN_MINUTES))}'",
        "STEP_SIZE": "'1m'",
        "QUANTITIES": "'4'",
        "APPARENT": "'AIRLESS'",
        "TIME_TYPE": "'UT'",
        "ANG_FORMAT": "'DEG'",
        "EXTRA_PREC": "'YES'",
    }
    url = f"{HORIZONS_API_URL}?{urllib.parse.urlencode(params)}"
    out = subprocess.run(
        ["curl", "-s", url], capture_output=True, text=True, check=True
    )
    return url, out.stdout


def check_echo(text: str, station: str) -> str:
    match = re.search(r"Center geodetic\s*:\s*([^\n]+)", text)
    pole = re.search(r"Center pole/equ\s*:\s*([^\n]+)", text)
    if match is None or pole is None:
        raise ValueError(f"no site echo in Horizons' answer:\n{text[:2000]}")
    e_lon, lat, alt = (float(part) for part in match.group(1).split("{")[0].split(","))
    lon, want_lat, want_alt = STATIONS[station]
    if (
        abs(e_lon - lon % 360) > 1e-5
        or abs(lat - want_lat) > 1e-5
        or abs(alt - want_alt) > 1e-4
    ):
        raise ValueError(f"site echo {match.group(1)} does not match {station}")
    if "ITRF93" not in pole.group(1):
        raise ValueError(f"unexpected frame echo: {pole.group(1)}")
    return match.group(1).strip()


def rows(text: str) -> list[dict[str, Any]]:
    body = text[text.index("$$SOE") + 5 : text.index("$$EOE")]
    out = []
    for line in body.strip().splitlines():
        parts = line.split()
        clock = parts[1] if "." in parts[1] else f"{parts[1]}.000"
        when = datetime.strptime(f"{parts[0]} {clock}", "%Y-%b-%d %H:%M:%S.%f")
        out.append(
            {
                "t": when.replace(tzinfo=UTC).isoformat().replace("+00:00", "Z"),
                "azimuth_deg": float(parts[-2]),
                "elevation_deg": float(parts[-1]),
            }
        )
    return out


def main() -> None:
    client = TestClient(app)
    edges: list[dict[str, Any]] = []
    for start in WINDOWS:
        params = {"site_id": "001", "start": start, "duration_hours": WINDOW_HOURS}
        answer = client.get("/visibility/dsn", params=params).json()
        first, last = answer["query"]["start"], answer["query"]["end"]
        for station in answer["stations"]:
            for item in station["passes"]:
                for kind in ("start", "end"):
                    if item[kind] in (first, last):
                        continue  # cut by the Window, not a crossing
                    edge = datetime.fromisoformat(item[kind])
                    url, text = query(station["id"], edge)
                    echo = check_echo(text, station["id"])
                    edges.append(
                        {
                            "window_start": start,
                            "station": station["id"],
                            "kind": "rise" if kind == "start" else "set",
                            "edge": item[kind],
                            "site_echo": echo,
                            "query_url": url,
                            "rows": rows(text),
                        }
                    )
                    print(station["id"], kind, item[kind], flush=True)
                    time.sleep(1.0)
    OUT.write_text(
        json.dumps(
            {
                "source": "JPL Horizons API, target 301 (Moon), center coord@399 (geodetic), "
                "quantity 4, airless, 1 minute steps",
                "fetched_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "stations": STATIONS,
                "window_hours": WINDOW_HOURS,
                "edges": edges,
            },
            indent=1,
        )
        + "\n",
        "utf-8",
    )
    print(f"{len(edges)} edges written to {OUT}")


if __name__ == "__main__":
    main()
