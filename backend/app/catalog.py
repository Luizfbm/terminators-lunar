"""Curated Sites and Regions, read from the versioned files in app/data.

Rebuild those files with scripts/build_catalog.py; every row carries its citation.
"""

import csv
from pathlib import Path
from typing import Any, TypedDict

from . import horizon
from .constants import (
    DEFAULT_DURATION_HOURS,
    DEFAULT_OBSERVER_HEIGHT_M,
    ENGINE_VERSION,
    MAX_DURATION_HOURS,
    SHORT_SHADOW_MAX_HOURS,
    WINDOW_MAX,
    WINDOW_MIN,
)
from .ephemeris import kernel_names
from .timeutil import iso_z


class Site(TypedDict):
    id: str
    name: str
    latitude_deg: float
    longitude_deg: float
    source: str
    source_reference: str
    region_id: str | None
    curated: bool
    has_5m_dem: bool


DATA = Path(__file__).parent / "data"


def _load_regions() -> list[dict[str, Any]]:
    with (DATA / "regions.csv").open(newline="") as handle:
        return [
            {
                "id": row["id"],
                "name": row["name"],
                "site_count": int(row["site_count"]),
                "artemis_iii_current": row["artemis_iii_current"] == "True",
                "source_reference": row["source_reference"],
            }
            for row in csv.DictReader(handle)
        ]


def _load_sites() -> list[Site]:
    with (DATA / "sites.csv").open(newline="") as handle:
        return [
            {
                "id": row["id"],
                "name": row["name"],
                "latitude_deg": float(row["latitude_deg"]),
                "longitude_deg": float(row["longitude_deg"]),
                "source": row["source"],
                "source_reference": row["source_reference"],
                "region_id": row["region_id"] or None,
                "curated": True,
                "has_5m_dem": row["has_5m_dem"] == "True",
            }
            for row in csv.DictReader(handle)
        ]


REGIONS = _load_regions()
SITES = _load_sites()
_BY_ID = {site["id"]: site for site in SITES}


def meta() -> dict[str, Any]:
    return {
        "engine_version": ENGINE_VERSION,
        "kernels": kernel_names(),
        "dems": [],
        "coverage": {
            # -80 on the polar DEMs alone, 90 once the server has LOLA's global map.
            "custom_max_latitude_deg": horizon.custom_max_latitude_deg(),
            "window_min": iso_z(WINDOW_MIN),
            "window_max": iso_z(WINDOW_MAX),
            "max_duration_hours": MAX_DURATION_HOURS,
        },
        "defaults": {
            "site_id": "001",
            "duration_hours": DEFAULT_DURATION_HOURS,
            "observer_height_m": DEFAULT_OBSERVER_HEIGHT_M,
        },
        "short_shadow_max_hours": SHORT_SHADOW_MAX_HOURS,
    }


def regions() -> list[dict[str, Any]]:
    return [dict(region) for region in REGIONS]


def list_sites(region_id: str | None, q: str | None) -> list[Site]:
    rows = list(SITES)
    if region_id:
        rows = [site for site in rows if site["region_id"] == region_id]
    if q:
        needle = q.casefold()
        rows = [
            site
            for site in rows
            if needle in site["id"].casefold() or needle in site["name"].casefold()
        ]
    return sorted(
        rows, key=lambda site: (site["region_id"] is None, site["region_id"] or "", site["id"])
    )


def find_site(site_id: str) -> Site | None:
    return _BY_ID.get(site_id)


def custom_site(latitude_deg: float, longitude_deg: float) -> Site:
    return {
        "id": "custom",
        "name": "Custom Site",
        "latitude_deg": latitude_deg,
        "longitude_deg": longitude_deg,
        "source": "custom",
        "source_reference": "User-provided coordinate",
        "region_id": None,
        "curated": False,
        "has_5m_dem": False,
    }
