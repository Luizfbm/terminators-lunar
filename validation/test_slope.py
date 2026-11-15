"""Slope from GET /terrain on synthetic DEMs whose answer is known by hand (the requirement).

The tolerances are defined in the specification: on a plane rising 1 m
every 20 m the median, 95th percentile and maximum are atan(0.05) = 2.8624° within 0.01°;
on a level plane they are 0 and the share under the limit is 1; the cell count for 100 m
on a 20 m grid is within 12 % of π·100²/20². No reference value comes from a competitor.

The route's defaults are NASA's Artemis III landing requirement, slope under 10° over
100 m (NASA, "Artemis Human Landing System Overview", NASA Space Apps Challenge 2025,
NTRS 20250009323). These checks are about the arithmetic, not about any real Site.
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

SCRIPT = "validation/test_slope.py"
R = 1_737_400.0
SITE = (-89.9, 45.0)
PLANE_DEG = math.degrees(math.atan(0.05))
TOLERANCE_DEG = 0.01
NASA = "NASA Artemis III landing requirement, slope under 10° over 100 m (Artemis HLS Overview, Space Apps 2025, NTRS 20250009323)"
NOT_COVERED = proof.text(
    "Arithmetic on synthetic DEMs only. A 20 m DEM cannot see rocks or craters a few metres across, such as the one IM-2 tipped over in; no verdict word is given.",
    "Só a aritmética, em DEMs sintéticos. Um DEM de 20 m não vê pedras nem crateras de poucos metros, como a em que o IM-2 tombou; não damos veredito.",
)

proof.declare(
    "slope-synthetic-plane",
    title=proof.text("Slope of a known plane", "Inclinação de um plano conhecido"),
    reference=f"atan(0.05) = 2.8624° worked by hand for a plane rising 1 m every 20 m, and 0 for a level one. Defaults: {NASA}",
    tolerance=proof.text(
        "≤ 0.01°; level plane exactly 0, all of it under 10°",
        "≤ 0,01°; plano nivelado exatamente 0, todo abaixo de 10°",
    ),
    not_covered=NOT_COVERED,
    script_path=SCRIPT,
)
proof.declare(
    "slope-cell-count",
    title=proof.text("Cells within 100 m on a 20 m grid", "Células a até 100 m numa grade de 20 m"),
    reference="π·100²/20² = 78.5 cells",
    tolerance=proof.text("within 12 %", "dentro de 12 %"),
    not_covered=NOT_COVERED,
    script_path=SCRIPT,
)


def polar_xy(latitude_deg: float, longitude_deg: float) -> tuple[float, float]:
    rho = 2.0 * R * math.tan(math.pi / 4.0 + math.radians(latitude_deg) / 2.0)
    lon = math.radians(longitude_deg)
    return rho * math.sin(lon), rho * math.cos(lon)


def write_plane(folder: Path, rise_per_m: float) -> None:
    """A 41 × 41 grid of the 20 m polar DEM around SITE, rising along x."""
    cell, size = 20.0, 41
    x, y = polar_xy(*SITE)
    west, north = x - size * cell / 2, y + size * cell / 2
    xs = west + (np.arange(size) + 0.5) * cell
    grid = np.tile(rise_per_m * xs, (size, 1))
    with rasterio.open(
        folder / "LDEM_80S_20MPP_ADJ.TIF",
        "w",
        driver="GTiff",
        width=size,
        height=size,
        count=1,
        dtype="float64",
        transform=from_origin(west, north, cell, cell),
    ) as dataset:
        dataset.write(grid, 1)


def slope(client: Any, folder: Path, rise_per_m: float) -> dict[str, Any]:
    write_plane(folder, rise_per_m)
    response = client.get("/terrain", params={"latitude_deg": SITE[0], "longitude_deg": SITE[1]})
    assert response.status_code == 200, response.text
    stats: dict[str, Any] = response.json()["slope"]
    return stats


@proof.check("slope-synthetic-plane")
def test_slope_of_a_known_plane(
    test_client: Any, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("LUNAR_DEM_DIR", str(tmp_path))
    tilted = slope(test_client, tmp_path, 0.05)
    level = slope(test_client, tmp_path, 0.0)
    worst = max(abs(tilted[k] - PLANE_DEG) for k in ("median_deg", "p95_deg", "max_deg"))
    level_ok = (
        level["median_deg"] == level["p95_deg"] == level["max_deg"] == 0.0
        and level["share_below_limit"] == 1.0
    )
    passed = worst <= TOLERANCE_DEG and level_ok
    en, pt = proof.deg(worst, 6)
    proof.record(
        "slope-synthetic-plane",
        "passed" if passed else "failed",
        proof.text(
            f"largest gap {en} on the tilted plane; level plane {'0 and all under 10°' if level_ok else 'not 0'}",
            f"maior diferença de {pt} no plano inclinado; plano nivelado {'0 e todo abaixo de 10°' if level_ok else 'não deu 0'}",
        ),
    )
    assert passed, (tilted, level)


@proof.check("slope-cell-count")
def test_cells_within_100_m_on_a_20_m_grid(
    test_client: Any, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("LUNAR_DEM_DIR", str(tmp_path))
    cells = slope(test_client, tmp_path, 0.0)["cells"]
    expected = math.pi * 100.0**2 / 20.0**2
    gap = abs(cells - expected) / expected
    passed = gap <= 0.12
    proof.record(
        "slope-cell-count",
        "passed" if passed else "failed",
        proof.text(
            f"{cells} cells, {gap * 100:.1f} % from 78.5",
            f"{cells} células, {gap * 100:.1f} % de 78,5".replace(".", ","),
        ),
    )
    assert passed, cells
