"""Nearest permanently shadowed region from GET /terrain on a synthetic map (the requirement).

The tolerance is defined in the requirement: with one shadowed patch at a
known offset, the distance is right within one cell and the azimuth within the angle one
cell subtends at that distance. The map is synthetic, in the layout of PGDA product 69
(60 m cells, south polar stereographic, DN +20000 shadow and −20000 not); the offsets are
worked out here with spherical trigonometry, not with the backend's code.
"""

from __future__ import annotations

import math
from pathlib import Path
from typing import Any

import numpy as np
import proof
import pytest
import rasterio  # type: ignore[import-untyped]
from rasterio.transform import from_origin  # type: ignore[import-untyped]

SCRIPT = "validation/test_psr.py"
R = 1_737_400.0
CELL = 60.0
SITE = (-89.5, 60.0)
OFFSETS = [(137.0, 7_300.0), (0.0, 1_250.0), (271.5, 333.0), (45.0, 18_000.0), (200.0, 31_000.0)]

proof.declare(
    "psr-synthetic-patch",
    title=proof.text(
        "Nearest permanent shadow on a known map",
        "Sombra permanente mais próxima num mapa conhecido",
    ),
    reference="One 60 m shadowed cell at 5 distances (333 m to 31 km) and bearings, placed by spherical trigonometry",
    tolerance=proof.text(
        "distance within one cell (60 m); azimuth within the angle one cell subtends there",
        "distância dentro de uma célula (60 m); azimute dentro do ângulo que uma célula ocupa ali",
    ),
    not_covered=proof.text(
        "Arithmetic only. The real map (PGDA product 69, LPSR_85S_060M_201608) is checked against the 130 Sites of Wueller et al. 2026 live, after it is on the server.",
        "Só a aritmética. O mapa real (produto 69 do PGDA, LPSR_85S_060M_201608) é conferido contra os 130 Sites de Wueller et al. 2026 ao vivo, depois que estiver no servidor.",
    ),
    script_path=SCRIPT,
)


def polar_xy(latitude_deg: float, longitude_deg: float) -> tuple[float, float]:
    rho = 2.0 * R * math.tan(math.pi / 4.0 + math.radians(latitude_deg) / 2.0)
    lon = math.radians(longitude_deg)
    return rho * math.sin(lon), rho * math.cos(lon)


def destination(bearing_deg: float, distance_m: float) -> tuple[float, float]:
    lat1, lon1 = math.radians(SITE[0]), math.radians(SITE[1])
    b, d = math.radians(bearing_deg), distance_m / R
    lat2 = math.asin(math.sin(lat1) * math.cos(d) + math.cos(lat1) * math.sin(d) * math.cos(b))
    lon2 = lon1 + math.atan2(
        math.sin(b) * math.sin(d) * math.cos(lat1), math.cos(d) - math.sin(lat1) * math.sin(lat2)
    )
    return math.degrees(lat2), math.degrees(lon2)


def write_map(path: Path, patch: tuple[float, float]) -> None:
    size = 1901
    west = north = size * CELL / 2.0
    west = -west
    dn = np.full((size, size), -20000, dtype=np.int16)
    x, y = polar_xy(*patch)
    dn[int((north - y) // CELL), int((x - west) // CELL)] = 20000
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        width=size,
        height=size,
        count=1,
        dtype="int16",
        transform=from_origin(west, north, CELL, CELL),
    ) as dataset:
        dataset.write(dn, 1)


@proof.check("psr-synthetic-patch")
def test_nearest_permanent_shadow_on_a_known_map(
    test_client: Any, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    path = tmp_path / "LPSR_85S_060M_201608.TIF"
    monkeypatch.setenv("LUNAR_PSR_MAP", str(path))
    worst_distance, worst_ratio = 0.0, 0.0
    for bearing, distance in OFFSETS:
        write_map(path, destination(bearing, distance))
        response = test_client.get(
            "/terrain", params={"latitude_deg": SITE[0], "longitude_deg": SITE[1]}
        )
        assert response.status_code == 200, response.text
        shadow = response.json()["permanent_shadow"]
        worst_distance = max(worst_distance, abs(shadow["distance_m"] - distance))
        gap = abs((shadow["azimuth_deg"] - bearing + 180.0) % 360.0 - 180.0)
        worst_ratio = max(worst_ratio, gap / math.degrees(CELL / distance))
    passed = worst_distance <= CELL and worst_ratio <= 1.0
    proof.record(
        "psr-synthetic-patch",
        "passed" if passed else "failed",
        proof.text(
            f"largest distance error {worst_distance:.1f} m; largest azimuth error {worst_ratio:.2f} of a cell's angle",
            f"maior erro de distância {worst_distance:.1f} m; maior erro de azimute {worst_ratio:.2f} do ângulo de uma célula".replace(
                ".", ","
            ),
        ),
    )
    assert passed, (worst_distance, worst_ratio)
