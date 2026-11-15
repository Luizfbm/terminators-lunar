"""Rebuild app/data/sites.csv and app/data/regions.csv from the cited source dataset.

Usage: uv run python -m scripts.build_catalog <path to artemis_sitios_wueller2026.csv>

The input is the table extracted from LandingSites.shp of Wueller et al. 2026
(Zenodo 17084058, CC-BY 4.0). Region names and NASA's October 2024 list of nine come
from Table 1 of the paper, as transcribed in the cited source dataset.
"""

import csv
import math
import sys
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "app" / "data"
MOON_RADIUS_KM = 1737.4

WUELLER = (
    "Wueller et al. 2026, JGR Planets 131(3), e2025JE009434, "
    "doi:10.1029/2025JE009434; data Zenodo 17084058 (CC-BY 4.0)"
)
TABLE_1 = "Wueller et al. 2026, Table 1"

# code: (name, in NASA's October 2024 list of nine)
REGIONS = {
    "PCB": ("Peak near Cabeus B", True),
    "HW": ("Haworth", True),
    "MMA": ("Mons Malapert", True),
    "MMP": ("Mons Mouton Plateau", True),
    "MMO": ("Mons Mouton", True),
    "NR1": ("Nobile Rim 1", True),
    "NR2": ("Nobile Rim 2", True),
    "dGR2": ("de Gerlache Rim 2", True),
    "SP": ("Slater Plain", True),
    "CR": ("Connecting Ridge", False),
    "CRE": ("Connecting Ridge Extension", False),
    "PNS": ("Peak near Shackleton", False),
    "FRA": ("Faustini Rim A", False),
    "AR": ("Amundsen Rim", False),
    "dGR1": ("de Gerlache Rim 1", False),
    "dGKM": ("de Gerlache-Kocher Massif", False),
}

# PGDA 78 (Barker et al. 2021) ships 16 x 16 km 5 m DEMs for NASA sites 1, 4, 7 and 11.
# Site 4 (Shackleton rim) is not among the 130. A Site has a 5 m DEM when it falls in
# the 16 x 16 km polar stereographic square centred on one of the others.
DEM_5M_CENTRES = ("001", "007", "011")
DEM_5M_HALF_SIDE_KM = 8.0

# CLPS landers near the pole with a coordinate we can cite.
CLPS = [
    {
        "id": "IM2",
        "name": "IM-2 Athena landing point",
        "latitude_deg": "-84.7906",
        "longitude_deg": "29.1957",
        "source": "clps",
        "source_reference": "LROC, Athena's final resting place, lroc.im-ldi.com/images/1408",
        "region_id": "",
    }
]

# Curated Sites outside the polar DEMs (the requirement): no Region, so the polar map leaves
# them out and the list shows them apart. Their DEM windows come from
# deploy/crop_offpole.py, which must use these same coordinates.
OFFPOLE = [
    {
        "id": "APOLLO11",
        "name": "Apollo 11 (Tranquility Base)",
        "latitude_deg": "0.67416",
        "longitude_deg": "23.47314",
        "source": "apollo",
        "source_reference": (
            "NSSDC Lunar Landing Sites, Apollo 11 Lunar Module, ME/DE421; "
            "Wagner et al. 2017, Icarus 283, 92-103"
        ),
        "region_id": "",
    },
    {
        "id": "BG1",
        "name": "Blue Ghost 1 landing point (Mare Crisium)",
        "latitude_deg": "18.5621232969557",
        "longitude_deg": "61.8099892551118",
        "source": "clps",
        "source_reference": (
            "NAIF CLPS SPICE archive, clps_to19d_bgm1_v01.tf, BGM1_LANDING_SITE, MOON_ME"
        ),
        "region_id": "",
    },
    {
        "id": "CH3",
        "name": "Chandrayaan-3 (Statio Shiv Shakti)",
        "latitude_deg": "-69.373",
        "longitude_deg": "32.319",
        "source": "isro",
        "source_reference": (
            "Statio Shiv Shakti (IAU-approved name); coordinate from Wiki"
            "pedia, Chandrayaan-3, another source gives -69.3676, 32.3481 (~0.4 km)"
        ),
        "region_id": "",
    },
]


def stereo_km(lat: float, lon: float) -> tuple[float, float]:
    rho = 2 * MOON_RADIUS_KM * math.tan(math.radians(90 + lat) / 2)
    return rho * math.sin(math.radians(lon)), rho * math.cos(math.radians(lon))


def has_5m_dem(lat: float, lon: float, centres: list[tuple[float, float]]) -> bool:
    x, y = stereo_km(lat, lon)
    return any(
        abs(x - cx) <= DEM_5M_HALF_SIDE_KM and abs(y - cy) <= DEM_5M_HALF_SIDE_KM
        for cx, cy in centres
    )


def site_name(region: str, site: str) -> str:
    label = REGIONS[region][0]
    if site.isdigit():
        return f"{label} (NASA site {site})"
    if site.endswith("_K2023"):
        return f"{label} {site} (Kring et al. 2023)"
    return f"{label} {site}"


def main(source: Path) -> None:
    with source.open(newline="") as handle:
        rows = list(csv.DictReader(handle))
    by_id = {row["sitio"]: row for row in rows}
    centres = [stereo_km(float(by_id[c]["lat"]), float(by_id[c]["lon"])) for c in DEM_5M_CENTRES]

    sites = []
    for row in rows:
        lat, lon = float(row["lat"]), float(row["lon"])
        sites.append(
            {
                "id": row["sitio"],
                "name": site_name(row["regiao"], row["sitio"]),
                "latitude_deg": row["lat"],
                "longitude_deg": row["lon"],
                "source": "wueller2026",
                "source_reference": WUELLER,
                "region_id": row["regiao"],
                "has_5m_dem": has_5m_dem(lat, lon, centres),
            }
        )
    for clps in CLPS:
        lat, lon = float(clps["latitude_deg"]), float(clps["longitude_deg"])
        sites.append({**clps, "has_5m_dem": has_5m_dem(lat, lon, centres)})
    for offpole in OFFPOLE:
        sites.append({**offpole, "has_5m_dem": False})

    DATA.mkdir(exist_ok=True)
    with (DATA / "sites.csv").open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(sites[0]))
        writer.writeheader()
        writer.writerows(sites)

    counts = {code: sum(row["regiao"] == code for row in rows) for code in REGIONS}
    with (DATA / "regions.csv").open("w", newline="") as handle:
        table = csv.writer(handle)
        table.writerow(["id", "name", "site_count", "artemis_iii_current", "source_reference"])
        for code, (name, current) in REGIONS.items():
            table.writerow([code, name, counts[code], current, TABLE_1])


if __name__ == "__main__":
    main(Path(sys.argv[1]))
