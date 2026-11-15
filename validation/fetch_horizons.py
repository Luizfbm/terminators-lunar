#!/usr/bin/env python3
"""
Fetch reference ephemeris data from JPL Horizons API for lunar surface observers.

Observer specifications:
- Center: coord@301 (Moon center)
- Coordinate type: GEODETIC
- Observer height: 2 m (0.002 km) above the 1737.4 km sphere
- Apparent coordinates: AIRLESS (no atmospheric refraction)
- Bodies: Sun (NAIF ID 10) and Earth (NAIF ID 399)
- Quantities: Code 4 (Apparent Azimuth and Elevation)

Sites:
- 6 surface sites south of 80°S, including Curated Site 001, spread in longitude.
- 50 instants per site (300 distinct instants total) spread over 2025-01-01 to 2032-12-31.
- Batched in groups of 25 instants per request with 1.0 s pause between requests.
- Echoes are strictly validated to confirm Horizons parsed site parameters accurately.
"""

from __future__ import annotations

import json
import re
import subprocess
import time
import urllib.parse
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

HORIZONS_API_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"

SITES = [
    {
        "id": "001",
        "name": "Connecting Ridge (NASA site 001)",
        "latitude_deg": -89.4661,
        "longitude_deg": -136.949,
        "height_m": 2.0,
    },
    {
        "id": "shackleton-rim",
        "name": "Shackleton Rim",
        "latitude_deg": -89.9000,
        "longitude_deg": 0.0000,
        "height_m": 2.0,
    },
    {
        "id": "MMO01",
        "name": "Mons Mouton (MMO01)",
        "latitude_deg": -85.4160,
        "longitude_deg": 31.8506,
        "height_m": 2.0,
    },
    {
        "id": "amundsen-rim",
        "name": "Amundsen Rim",
        "latitude_deg": -84.5000,
        "longitude_deg": 90.0000,
        "height_m": 2.0,
    },
    {
        "id": "malapert-plateau",
        "name": "Malapert Plateau",
        "latitude_deg": -86.0000,
        "longitude_deg": 165.0000,
        "height_m": 2.0,
    },
    {
        "id": "nobile-rim",
        "name": "Nobile Rim",
        "latitude_deg": -85.2000,
        "longitude_deg": -75.0000,
        "height_m": 2.0,
    },
]


def generate_site_instants(site_idx: int, count: int = 50) -> list[datetime]:
    start_base = datetime(2025, 1, 1, 0, 0, 0)
    end_base = datetime(2032, 12, 31, 0, 0, 0)
    site_offset = timedelta(
        days=site_idx * 9, hours=site_idx * 3, minutes=site_idx * 15
    )
    site_start = start_base + site_offset
    site_end = end_base - timedelta(days=(5 - site_idx) * 9)
    site_span = (site_end - site_start).total_seconds()

    instants = []
    for i in range(count):
        dt = site_start + timedelta(seconds=i * site_span / (count - 1))
        # Round to 15-minute boundary
        minute = round(dt.minute / 15.0) * 15
        if minute == 60:
            dt = dt.replace(minute=0, second=0) + timedelta(hours=1)
        else:
            dt = dt.replace(minute=minute, second=0)
        instants.append(dt)
    return instants


def query_horizons(
    command: str,
    lon: float,
    lat: float,
    height_m: float,
    times: list[datetime],
) -> tuple[str, dict[str, Any], str]:
    """Execute a single query to JPL Horizons API via curl."""
    tlist_str = " ".join(f"'{t.strftime('%Y-%m-%d %H:%M')}'" for t in times)
    alt_km = height_m / 1000.0
    params = {
        "format": "text",
        "COMMAND": command,
        "OBJ_DATA": "NO",
        "MAKE_EPHEM": "YES",
        "EPHEM_TYPE": "OBSERVER",
        "CENTER": "coord@301",
        "COORD_TYPE": "GEODETIC",
        "SITE_COORD": f"{lon},{lat},{alt_km:.4f}",
        "TLIST": tlist_str,
        "QUANTITIES": "4",
        "APPARENT": "AIRLESS",
        "TIME_TYPE": "UT",
    }
    url = f"{HORIZONS_API_URL}?{urllib.parse.urlencode(params)}"
    res = subprocess.run(
        ["curl", "-s", url], capture_output=True, text=True, check=True
    )
    return url, params, res.stdout


def validate_echo(
    text: str,
    expected_lon: float,
    expected_lat: float,
    expected_alt_km: float,
) -> dict[str, str]:
    """Verify that Horizons parsed and echoed the lunar surface observer site correctly."""
    geodetic_match = re.search(r"Center geodetic\s*:\s*([^\n]+)", text)
    pole_match = re.search(r"Center pole/equ\s*:\s*([^\n]+)", text)
    radii_match = re.search(r"Center radii\s*:\s*([^\n]+)", text)
    refract_match = re.search(r"Atmos refraction\s*:\s*([^\n]+)", text)

    if not geodetic_match or not pole_match or not radii_match:
        raise ValueError(
            "Horizons response header missing center site echo information"
        )

    geodetic_echo = geodetic_match.group(1).strip()
    pole_echo = pole_match.group(1).strip()
    radii_echo = radii_match.group(1).strip()
    refract_echo = refract_match.group(1).strip() if refract_match else ""

    # Parse numerical geodetic echo: E-lon, Lat, Alt(km)
    geo_parts = geodetic_echo.split("{")[0].split(",")
    e_lon = float(geo_parts[0].strip())
    lat = float(geo_parts[1].strip())
    alt = float(geo_parts[2].strip())

    expected_e_lon = (expected_lon % 360 + 360) % 360
    if abs(e_lon - expected_e_lon) > 0.001:
        raise ValueError(
            f"Longitude echo mismatch: got {e_lon}, expected {expected_e_lon}"
        )
    if abs(lat - expected_lat) > 0.001:
        raise ValueError(f"Latitude echo mismatch: got {lat}, expected {expected_lat}")
    if abs(alt - expected_alt_km) > 0.0005:
        raise ValueError(
            f"Altitude echo mismatch: got {alt}, expected {expected_alt_km}"
        )

    if "MEAN_ME" not in pole_echo:
        raise ValueError(f"Unexpected frame echo: {pole_echo}, expected MEAN_ME")
    if "1737.4" not in radii_echo:
        raise ValueError(f"Unexpected radii echo: {radii_echo}, expected 1737.4 km")

    return {
        "geodetic": geodetic_echo,
        "pole_equ": pole_echo,
        "radii": radii_echo,
        "refraction": refract_echo,
    }


def parse_horizons_table(text: str) -> dict[str, tuple[float, float]]:
    """Parse Azimuth and Elevation records from between $$SOE and $$EOE."""
    idx_soe = text.find("$$SOE")
    idx_eoe = text.find("$$EOE")
    if idx_soe == -1 or idx_eoe == -1:
        raise ValueError(
            "Horizons output does not contain $$SOE / $$EOE ephemeris table"
        )

    table_text = text[idx_soe + 5 : idx_eoe].strip()
    results: dict[str, tuple[float, float]] = {}
    for line in table_text.splitlines():
        line = line.strip()
        if not line:
            continue
        parts = line.split()
        # Date and time format: 2025-Jan-01 00:00:00.000
        date_str = f"{parts[0]} {parts[1]}"
        dt = datetime.strptime(date_str, "%Y-%b-%d %H:%M:%S.%f")
        iso_str = dt.strftime("%Y-%m-%dT%H:%M:%SZ")
        azimuth_deg = float(parts[-2])
        elevation_deg = float(parts[-1])
        results[iso_str] = (azimuth_deg, elevation_deg)

    return results


def main() -> None:
    output_dir = Path(__file__).resolve().parent / "data"
    output_dir.mkdir(parents=True, exist_ok=True)

    ref_data_path = output_dir / "horizons_reference.json"
    queries_log_path = output_dir / "horizons_queries.json"

    queries_log: list[dict[str, Any]] = []
    sites_output: list[dict[str, Any]] = []

    print(
        f"Starting fetch for {len(SITES)} sites, 50 instants each (total 300 evaluations per body)..."
    )

    for site_idx, site in enumerate(SITES):
        print(
            f"\n--- Site {site_idx + 1}/{len(SITES)}: {site['name']} ({site['id']}) ---"
        )
        instants = generate_site_instants(site_idx, count=50)

        # Batch into groups of 25 to respect Horizons URL limits
        batch_size = 25
        batches = [
            instants[i : i + batch_size] for i in range(0, len(instants), batch_size)
        ]

        site_observations: dict[str, dict[str, Any]] = {
            t.strftime("%Y-%m-%dT%H:%M:%SZ"): {
                "time_utc": t.strftime("%Y-%m-%dT%H:%M:%SZ")
            }
            for t in instants
        }

        echo_summary: dict[str, str] = {}

        for body_name, body_command in [("sun", "10"), ("earth", "399")]:
            for b_idx, batch in enumerate(batches):
                print(
                    f"Fetching {body_name.upper()} (cmd={body_command}), batch {b_idx + 1}/{len(batches)} ({len(batch)} instants)..."
                )
                url, params, raw_text = query_horizons(
                    command=body_command,
                    lon=site["longitude_deg"],
                    lat=site["latitude_deg"],
                    height_m=site["height_m"],
                    times=batch,
                )

                # Validate echo
                echo = validate_echo(
                    raw_text,
                    expected_lon=site["longitude_deg"],
                    expected_lat=site["latitude_deg"],
                    expected_alt_km=site["height_m"] / 1000.0,
                )
                echo_summary = echo

                # Log exact query
                queries_log.append(
                    {
                        "site_id": site["id"],
                        "site_name": site["name"],
                        "body": body_name,
                        "body_command": body_command,
                        "batch_index": b_idx,
                        "instants_count": len(batch),
                        "url": url,
                        "params": params,
                        "echo": echo,
                    }
                )

                # Parse table
                table = parse_horizons_table(raw_text)
                for iso_t, (az, el) in table.items():
                    if iso_t in site_observations:
                        site_observations[iso_t][body_name] = {
                            "azimuth_deg": az,
                            "elevation_deg": el,
                        }

                # Rate limiting: wait 1.0 second between requests
                time.sleep(1.0)

        # Confirm all 50 instants have both sun and earth
        obs_list = list(site_observations.values())
        obs_list.sort(key=lambda o: o["time_utc"])
        for obs in obs_list:
            if "sun" not in obs or "earth" not in obs:
                raise ValueError(
                    f"Incomplete observation at {obs.get('time_utc')}: {obs}"
                )

        sites_output.append(
            {
                "id": site["id"],
                "name": site["name"],
                "latitude_deg": site["latitude_deg"],
                "longitude_deg": site["longitude_deg"],
                "height_m": site["height_m"],
                "echo": echo_summary,
                "observations": obs_list,
            }
        )
        print(
            f"Site {site['id']} complete with {len(obs_list)} validated observations."
        )

    ref_payload = {
        "metadata": {
            "source": "JPL Horizons On-Line Ephemeris System API",
            "api_url": HORIZONS_API_URL,
            "fetched_at": datetime.now().astimezone().isoformat(),
            "center": "coord@301",
            "coord_type": "GEODETIC",
            "observer_height_m": 2.0,
            "lunar_reference_radius_km": 1737.4,
            "center_pole_equ": "MEAN_ME (high precision)",
            "apparent": "AIRLESS",
            "total_sites": len(sites_output),
            "observations_per_site": 50,
            "total_observations": len(sites_output) * 50,
        },
        "sites": sites_output,
    }

    with open(ref_data_path, "w", encoding="utf-8") as f:
        json.dump(ref_payload, f, indent=2)
    print(f"\nWrote reference data to {ref_data_path}")

    with open(queries_log_path, "w", encoding="utf-8") as f:
        json.dump(queries_log, f, indent=2)
    print(f"Wrote queries log to {queries_log_path}")
    print("Done!")


if __name__ == "__main__":
    main()
