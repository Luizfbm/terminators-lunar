"""The nearest permanently shadowed region in `GET /terrain` (the requirement), HTTP API only.

Every map here is synthetic, written by the test in the layout of PGDA product 69
(`LPSR_85S_060M_201608`: 60 m cells, south polar stereographic centred on the pole, DN
+20000 for shadow and −20000 for not). The patch goes at a distance and bearing worked out
here with the test's own spherical formulas; the slope part reads the repo's DEM fixtures.
"""

from __future__ import annotations

import math
import os
from pathlib import Path
from typing import Any

import numpy as np
import pytest
import rasterio  # type: ignore[import-untyped]
from fastapi.testclient import TestClient
from rasterio.transform import from_origin  # type: ignore[import-untyped]

from app.main import app
from tests.synthetic_dem import POLAR, R, great_circle_m, polar_xy

client = TestClient(app)
PRODUCT = "LPSR_85S_060M_201608"
CELL = 60.0
SHADOW, LIT = 20000, -20000
SITE = (-89.5, 60.0)


def destination(
    site: tuple[float, float], bearing_deg: float, distance_m: float
) -> tuple[float, float]:
    lat1, lon1 = math.radians(site[0]), math.radians(site[1])
    b, d = math.radians(bearing_deg), distance_m / R
    lat2 = math.asin(math.sin(lat1) * math.cos(d) + math.cos(lat1) * math.sin(d) * math.cos(b))
    lon2 = lon1 + math.atan2(
        math.sin(b) * math.sin(d) * math.cos(lat1), math.cos(d) - math.sin(lat1) * math.sin(lat2)
    )
    return math.degrees(lat2), (math.degrees(lon2) + 180.0) % 360.0 - 180.0


class PsrMap:
    """A blank map centred on the pole that patches are painted into, then written."""

    def __init__(self, half_cells: int, cell_m: float = CELL) -> None:
        self.size = 2 * half_cells + 1
        self.cell = cell_m
        self.west = -self.size * cell_m / 2.0
        self.north = self.size * cell_m / 2.0
        self.dn = np.full((self.size, self.size), LIT, dtype=np.int16)

    def cell_of(self, point: tuple[float, float]) -> tuple[int, int]:
        x, y = polar_xy(*point)
        return int((self.north - y) // self.cell), int((x - self.west) // self.cell)

    def shade(self, point: tuple[float, float]) -> None:
        row, col = self.cell_of(point)
        self.dn[row, col] = SHADOW

    def write(self, path: Path, encoding: str = "dn") -> Path:
        data: Any = self.dn
        dtype = "int16"
        if encoding == "flag":
            data, dtype = (self.dn > 0).astype(np.uint8), "uint8"
        with rasterio.open(
            path,
            "w",
            driver="GTiff",
            width=self.size,
            height=self.size,
            count=1,
            dtype=dtype,
            crs=rasterio.crs.CRS.from_proj4(POLAR),
            transform=from_origin(self.west, self.north, self.cell, self.cell),
        ) as dataset:
            dataset.write(data, 1)
            if encoding == "scaled":
                dataset.scales = (0.000025,)
                dataset.offsets = (0.5,)
        return path


@pytest.fixture
def psr_path(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / f"{PRODUCT}.TIF"
    monkeypatch.setenv("LUNAR_PSR_MAP", str(path))
    return path


def terrain(site: tuple[float, float]) -> dict[str, Any]:
    response = client.get("/terrain", params={"latitude_deg": site[0], "longitude_deg": site[1]})
    assert response.status_code == 200, response.text
    payload: dict[str, Any] = response.json()
    return payload


def angle_gap(a: float, b: float) -> float:
    return abs((a - b + 180.0) % 360.0 - 180.0)


@pytest.mark.parametrize(
    ("bearing", "distance"),
    [(137.0, 7_300.0), (0.0, 1_250.0), (271.5, 333.0), (45.0, 18_000.0), (200.0, 31_000.0)],
)
def test_one_patch_at_a_known_offset_is_found_within_one_cell(
    psr_path: Path, bearing: float, distance: float
) -> None:
    psr = PsrMap(950)
    patch = destination(SITE, bearing, distance)
    psr.shade(patch)
    psr.write(psr_path)
    shadow = terrain(SITE)["permanent_shadow"]
    assert shadow["product"] == PRODUCT
    assert abs(shadow["distance_m"] - distance) <= CELL
    assert angle_gap(shadow["azimuth_deg"], bearing) <= math.degrees(CELL / distance)
    # The coordinate is the shadowed cell's, so it is the patch's within one cell too.
    where = (shadow["latitude_deg"], shadow["longitude_deg"])
    assert great_circle_m(where, patch) <= CELL
    assert abs(great_circle_m(SITE, where) - shadow["distance_m"]) < 0.01
    # And it is that cell's centre.
    row, col = psr.cell_of(patch)
    x, y = polar_xy(*where)
    assert abs(x - (psr.west + (col + 0.5) * CELL)) < 1e-3
    assert abs(y - (psr.north - (row + 0.5) * CELL)) < 1e-3


@pytest.mark.parametrize("encoding", ["dn", "scaled", "flag"])
def test_the_dn_the_scaled_flag_and_a_plain_flag_read_the_same(
    psr_path: Path, encoding: str
) -> None:
    psr = PsrMap(400)
    psr.shade(destination(SITE, 80.0, 4_000.0))
    psr.write(psr_path, encoding)
    shadow = terrain(SITE)["permanent_shadow"]
    assert abs(shadow["distance_m"] - 4_000.0) <= CELL


def test_with_no_shadowed_cell_in_range_the_field_is_null(psr_path: Path) -> None:
    # ±57 km of map around the pole and a Site 1.5 km from it: the whole 50 km is on it.
    PsrMap(950).write(psr_path)
    payload = terrain((-89.95, 0.0))
    assert "permanent_shadow" in payload
    assert payload["permanent_shadow"] is None


def test_a_patch_past_the_search_radius_is_null_too(psr_path: Path) -> None:
    site = (-89.95, 0.0)
    psr = PsrMap(950)
    psr.shade(destination(site, 180.0, 52_000.0))
    psr.write(psr_path)
    assert terrain(site)["permanent_shadow"] is None


def test_without_a_map_the_field_is_left_out(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("LUNAR_PSR_MAP", raising=False)
    assert "permanent_shadow" not in terrain(SITE)
    monkeypatch.setenv("LUNAR_PSR_MAP", "/nonexistent/LPSR_85S_060M_201608.TIF")
    assert "permanent_shadow" not in terrain(SITE)


def test_a_site_off_the_map_gets_no_field(psr_path: Path) -> None:
    psr = PsrMap(150)  # ±9 km; SITE is 15 km from the pole.
    psr.shade((-89.99, 0.0))
    psr.write(psr_path)
    assert "permanent_shadow" not in terrain(SITE)


def test_an_edge_nearer_than_the_answer_means_the_map_does_not_cover_it(
    psr_path: Path,
) -> None:
    psr = PsrMap(300)  # ±18 km
    x, y = polar_xy(*SITE)
    half = psr.size * psr.cell / 2.0
    edge_m = min(half - abs(x), half - abs(y))
    assert 4_000 < edge_m < 6_000  # the east edge, about 4.9 km away
    # 9 km towards the pole: on the map, but farther than the edge, past which a nearer
    # patch could sit off the map.
    psr.shade(destination(SITE, 180.0, 9_000.0))
    psr.write(psr_path)
    assert "permanent_shadow" not in terrain(SITE)
    # A patch nearer than the edge is an answer.
    psr.shade(destination(SITE, 180.0, 1_500.0))
    psr.write(psr_path)
    assert abs(terrain(SITE)["permanent_shadow"]["distance_m"] - 1_500.0) <= CELL


def test_the_nearest_wins_over_one_seen_first_in_the_square(psr_path: Path) -> None:
    # At 0°E the map's axes are north and east, so the first 2 km search square is too.
    site = (-89.5, 0.0)
    psr = PsrMap(400)
    # Inside the first search square but 2.7 km away, in its corner...
    psr.shade(destination(site, 45.0, 2_700.0))
    # ...and 2.2 km away straight towards the pole, outside it: this one is nearest.
    psr.shade(destination(site, 180.0, 2_200.0))
    psr.write(psr_path)
    shadow = terrain(site)["permanent_shadow"]
    assert abs(shadow["distance_m"] - 2_200.0) <= CELL
    assert angle_gap(shadow["azimuth_deg"], 180.0) <= 2.0


def test_no_patch_on_a_map_that_ends_inside_the_search_radius_is_no_answer(
    psr_path: Path,
) -> None:
    # ±18 km of map: "none within 50 km" cannot be said from it.
    PsrMap(300).write(psr_path)
    assert "permanent_shadow" not in terrain(SITE)


def test_a_site_inside_a_shadowed_cell_is_under_half_a_diagonal_from_it(psr_path: Path) -> None:
    psr = PsrMap(400)
    psr.shade(SITE)
    psr.shade(destination(SITE, 0.0, 500.0))
    psr.write(psr_path)
    shadow = terrain(SITE)["permanent_shadow"]
    assert shadow["distance_m"] <= CELL * math.sqrt(2) / 2
    assert 0.0 <= shadow["azimuth_deg"] < 360.0


def test_the_map_is_read_again_when_the_file_changes(psr_path: Path) -> None:
    psr = PsrMap(400)
    psr.shade(destination(SITE, 90.0, 3_000.0))
    psr.write(psr_path)
    assert abs(terrain(SITE)["permanent_shadow"]["distance_m"] - 3_000.0) <= CELL
    psr = PsrMap(400)
    psr.shade(destination(SITE, 90.0, 1_000.0))
    psr.write(psr_path)
    # Make sure the modification time moves even on a coarse clock.
    stat = psr_path.stat()
    os.utime(psr_path, ns=(stat.st_atime_ns, stat.st_mtime_ns + 1_000_000_000))
    assert abs(terrain(SITE)["permanent_shadow"]["distance_m"] - 1_000.0) <= CELL
