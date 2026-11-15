"""The globe's south polar cap sits on the engine's DEM grid, pixel for pixel.

the off-pole DEM windows came out on a grid shifted by a fraction of a pixel
(the implementation). The cap must not repeat that: a point placed with only what south_cap.json says
must land on the pixel whose height is the average of the DEM pixels under it.

No network: both levels are built from the DEM fixtures (the cap from the 80 m one, the
fine level around the pole from the 20 m one), at sizes where each output pixel is a
whole block of source pixels.
"""

import importlib.util
import json
from pathlib import Path
from typing import Any

import numpy as np
import pytest
import rasterio  # type: ignore[import-untyped]

REPO = next(p for p in Path(__file__).resolve().parents if (p / "contract").is_dir())
SPEC = importlib.util.spec_from_file_location("globe_assets", REPO / "deploy" / "globe_assets.py")
assert SPEC and SPEC.loader
globe: Any = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(globe)

DEM = REPO / "fixtures" / "dem"
POINTS = {
    "Site 001": (-89.4661, -136.949),
    "Shackleton centre": (-89.67, 129.78),  # USGS Gazetteer of Planetary Nomenclature
}


# (source fixture, size, half_m, source pixels per output pixel): each output pixel is a
# whole block of source pixels, so the expected height is computed independently.
LEVELS = {
    "cap": ("LDEM_80S_80MPP_ADJ.TIF", 625, None, 5),  # 250 km / 625 = 400 m = 5 x 80 m
    "fine": ("LDEM_80S_20MPP_ADJ.TIF", 500, 20_000.0, 4),  # 40 km / 500 = 80 m = 4 x 20 m
}


def build(name: str, out: Path) -> tuple[dict[str, Any], np.ndarray]:
    product, size, half_m, _ = LEVELS[name]
    meta = globe.build_level(DEM / product, out, name, size, half_m=half_m)
    with rasterio.open(out / meta["height_png"]["file"]) as png:
        raw = png.read(1).astype(np.float64)
    scale = meta["height_png"]["metres_above_1737400_m"]
    heights = scale["at_0"] + raw / 65535.0 * (scale["at_65535"] - scale["at_0"])
    return json.loads(json.dumps(meta)), heights


@pytest.mark.parametrize("level", LEVELS)
@pytest.mark.parametrize("name", POINTS)
def test_a_known_point_lands_on_its_own_pixel(tmp_path: Path, level: str, name: str) -> None:
    meta, heights = build(level, tmp_path)
    product, _, _, block = LEVELS[level]
    col, row = globe.stereographic_pixel(*POINTS[name], meta)
    c, r = int(col), int(row)
    with rasterio.open(DEM / product) as dem:
        x, y = globe_xy(*POINTS[name])
        sc, sr = ~dem.transform * (x, y)
        ox, oy = ~dem.transform * (meta["x_min_m"], meta["y_max_m"])
        source = dem.read(1).astype(np.float64)
    # Independent: the source pixel under the point, counted from the level's corner.
    assert int(sc - ox) // block == c and int(sr - oy) // block == r, (name, col, row)
    r0, c0 = round(oy) + r * block, round(ox) + c * block
    want = source[r0 : r0 + block, c0 : c0 + block].mean()
    scale = meta["height_png"]["metres_above_1737400_m"]
    quantum = (scale["at_65535"] - scale["at_0"]) / 65535
    assert abs(heights[r, c] - want) <= quantum, (name, heights[r, c], want)
    # The check can tell a shifted pixel: a neighbour is off by more than that.
    neighbours = [heights[r + dr, c + dc] for dr, dc in ((0, 1), (1, 0), (0, -1), (-1, 0))]
    assert max(abs(h - want) for h in neighbours) > 10 * quantum


def test_a_level_off_the_source_pixel_edges_is_refused(tmp_path: Path) -> None:
    # ±20 010 m starts half a 20 m pixel off the fixture's edges: that is the the implementation defect.
    with pytest.raises(AssertionError, match="not on source pixels"):
        globe.build_level(DEM / "LDEM_80S_20MPP_ADJ.TIF", tmp_path, "x", 500, half_m=20_010.0)


def test_the_production_fine_level_sits_on_the_20_m_grid() -> None:
    # ±92 160 m from a ±304 000 m product of 20 m pixels: 10 608 pixels in, exactly.
    assert (304_000 - globe.FINE_HALF_M) % 20 == 0
    assert globe.FINE_SIZE % globe.FINE_SMALL == 0 and globe.FINE_SIZE % globe.FINE_HEIGHT == 0


def globe_xy(latitude_deg: float, longitude_deg: float) -> tuple[float, float]:
    import math

    rho = 2.0 * 1_737_400.0 * math.tan(math.pi / 4.0 + math.radians(latitude_deg) / 2.0)
    return rho * math.sin(math.radians(longitude_deg)), rho * math.cos(math.radians(longitude_deg))


def test_the_normals_light_a_slope_from_the_right_side() -> None:
    # Terrain rising to the image right: the normal leans left (red < 128), green neutral.
    rgb = globe.encode_normals(np.full((1, 1), 0.5), np.zeros((1, 1)))
    assert rgb[0, 0, 0] < 128 and rgb[1, 0, 0] in (127, 128) and rgb[2, 0, 0] > 200


def test_a_big_image_falls_back_to_jpeg_when_memory_is_short(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    rgb = np.zeros((3, 64, 64), dtype=np.uint8)
    monkeypatch.setattr(globe, "WEBP_BIG_PX", 32 * 32)
    monkeypatch.setattr(globe, "_mem_available_kb", lambda: 1_000_000)
    assert globe._write_big_rgb(tmp_path, "n", rgb) == "n.jpg"
    monkeypatch.setattr(globe, "_mem_available_kb", lambda: 8_000_000)
    assert globe._write_big_rgb(tmp_path, "n", rgb) == "n.webp"
    assert not (tmp_path / "n.jpg").exists()


def test_equirectangular_normals_in_strips_match_the_whole_grid(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # The 8k whole-Moon normals are computed a strip of rows at a time to fit the VPS;
    # the strips must not leave seams.
    rng = np.random.default_rng(3)
    metres = rng.normal(0, 500, (64, 128))
    monkeypatch.setattr(globe, "STRIP", 64)
    whole = globe._equirect_normals(metres)
    monkeypatch.setattr(globe, "STRIP", 7)
    assert np.array_equal(globe._equirect_normals(metres), whole)


# The ground at 20 m around each Site (the requirement): a height of the square is a height of the
# DEM, not a resampled one. The check reads the fixture's pixels itself, with the window
# worked out here from the Site's coordinates, not from what the build wrote.
SITES = [("001", -89.4661, -136.949), ("FAR", -84.0, 30.0), ("NORTH", 10.0, 0.0)]


def test_the_ground_around_a_site_is_the_dems_own_pixels(tmp_path: Path) -> None:
    source = DEM / "LDEM_80S_20MPP_ADJ.TIF"
    index = globe.build_site_ground(source, tmp_path, SITES)
    # Only Site 001 is inside the ±25 km fixture: the others are left out, not padded.
    assert set(index["tiles"]) == {"001"}
    tile = index["tiles"]["001"]
    png = tile["height_png"]
    assert png["size_px"] == globe.SITE_PX and png["metres_per_pixel"] == 20.0
    with rasterio.open(tmp_path / png["file"]) as image:
        raw = image.read(1).astype(np.float64)
    scale = png["metres_above_1737400_m"]
    quantum = (scale["at_65535"] - scale["at_0"]) / 65535
    heights = scale["at_0"] + raw / 65535.0 * (scale["at_65535"] - scale["at_0"])

    with rasterio.open(source) as dem:
        x, y = globe_xy(-89.4661, -136.949)
        column, row = ~dem.transform * (x, y)
        half = globe.SITE_PX // 2
        window = rasterio.windows.Window(int(column) - half, int(row) - half, 2 * half, 2 * half)
        want = dem.read(1, window=window).astype(np.float64)
        # The square's corner, as the JSON says it, is the corner of that window.
        corner_x, corner_y = dem.transform * (window.col_off, window.row_off)
    assert (tile["x_min_m"], tile["y_max_m"]) == pytest.approx((corner_x, corner_y), abs=1e-6)
    # Half a quantum from 16 bits, and the JSON keeps the scale's ends to the millimetre.
    assert np.abs(heights - want).max() <= quantum / 2 + 0.001
    # The Site's own pixel is at the centre, as the index says.
    assert abs(heights[half, half] - want[half, half]) <= quantum
    # The square has relief: a flat or blurred copy would not pass.
    assert want.max() - want.min() > 50
    assert np.abs(np.diff(want, axis=1)).max() > 5


def test_a_flat_square_still_writes_a_height_png(tmp_path: Path) -> None:
    # regression: a square with one height divided by zero when it was scaled to 16 bits.
    meta = globe._write_height(tmp_path / "flat.png", np.full((4, 4), 120.0))
    scale = meta["metres_above_1737400_m"]
    assert scale["at_0"] == 120.0 and scale["at_65535"] > scale["at_0"]
    with rasterio.open(tmp_path / "flat.png") as image:
        assert (image.read(1) == 0).all()


def test_every_site_id_makes_a_plain_file_name() -> None:
    for site_id, _, _ in globe.read_sites(globe._sites_csv()):
        assert site_id.replace("_", "").isalnum(), site_id
