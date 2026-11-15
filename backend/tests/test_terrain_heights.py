"""`GET /terrain/heights`: the DEM's own heights around a Site (Phase C, 15/11/2026).

Before: the 3D view from the ground had real ground only where the frontend's published south
polar maps reached; anywhere else on the Moon it drew the horizon line alone. The route gives the
pixels of the finest DEM the engine reads near the Site, untouched, on the DEM's own projection,
so the view can build the ground of any point. These drive the API over small synthetic DEMs with
the products' file names and check every pixel against heights written here, not by the app.
"""

import math
from pathlib import Path
from typing import Any

import numpy as np
import numpy.typing as npt
import pytest
from fastapi.testclient import TestClient

from app.main import app
from tests.synthetic_dem import POLAR, R, polar_xy, write_dem

client = TestClient(app)
W20, W80, W240 = "LDEM_80S_20MPP_ADJ", "LDEM_80S_80MPP_ADJ", "LDEM_60S_240MPP_ADJ"
POLE_SITE = (-89.9, 30.0)


def _heights(payload: dict[str, Any]) -> npt.NDArray[np.float64]:
    """The grid's heights in metres, decoded as the contract says."""
    grid = payload["heights"]
    size = payload["size_px"]
    values = np.asarray(grid["values"], dtype=np.float64).reshape(size, size)
    decoded: npt.NDArray[np.float64] = grid["at_0_m"] + values / 65535.0 * (
        grid["at_65535_m"] - grid["at_0_m"]
    )
    return decoded


def _centres(payload: dict[str, Any]) -> tuple[np.ndarray, np.ndarray]:
    """Map x of every column's centre and y of every row's, as the contract says."""
    size, cell = payload["size_px"], payload["metres_per_pixel"]
    xs = payload["x_min_m"] + (np.arange(size) + 0.5) * cell
    ys = payload["y_max_m"] - (np.arange(size) + 0.5) * cell
    return xs, ys


def _ask(**params: Any) -> Any:
    return client.get("/terrain/heights", params=params)


def _bowl(x: Any, y: Any) -> Any:
    """Uneven polar ground: a bowl around the pole, so every pixel has its own height."""
    return 1e-6 * (x * x + y * y) + 0.01 * x - 0.02 * y


def _polar_dems(folder: Path, *, with_20: bool = True) -> None:
    centre = polar_xy(*POLE_SITE)
    if with_20:
        write_dem(folder / f"{W20}.TIF", centre, 20.0, 400, _bowl, POLAR)  # ±4 km
    write_dem(folder / f"{W80}.TIF", centre, 80.0, 400, _bowl, POLAR)  # ±16 km
    write_dem(folder / f"{W240}.TIF", centre, 240.0, 400, _bowl, POLAR)  # ±48 km


def test_at_the_pole_the_finest_dem_that_holds_the_grid_is_read(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _polar_dems(tmp_path)
    monkeypatch.setenv("LUNAR_DEM_DIR", str(tmp_path))
    lat, lon = POLE_SITE
    payload = _ask(latitude_deg=lat, longitude_deg=lon, half_extent_m=1_000).json()
    assert payload["dem"] == {"product": W20, "resolution_m": 20.0}
    assert payload["projection"] == "south_polar_stereographic"
    xs, ys = _centres(payload)
    expected = _bowl(xs[np.newaxis, :], ys[:, np.newaxis])
    got = _heights(payload)
    assert np.max(np.abs(got - expected)) <= payload["heights"]["quantum_m"] / 2 + 1e-9
    # Too far for the ±4 km of the 20 m DEM: the 80 m one holds 10 km on every side.
    wider = _ask(latitude_deg=lat, longitude_deg=lon, half_extent_m=10_000).json()
    assert wider["dem"]["product"] == W80


def test_a_grid_is_never_more_than_511_pixels_on_a_side(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    centre = polar_xy(*POLE_SITE)
    write_dem(tmp_path / f"{W20}.TIF", centre, 20.0, 1_200, _bowl, POLAR)  # ±12 km
    monkeypatch.setenv("LUNAR_DEM_DIR", str(tmp_path))
    payload = _ask(latitude_deg=POLE_SITE[0], longitude_deg=POLE_SITE[1], half_extent_m=30_000)
    assert payload.status_code == 200
    body = payload.json()
    assert body["size_px"] == 511
    assert len(body["heights"]["values"]) == 511 * 511
    assert body["half_extent_m"] == 30_000


def test_a_pixel_without_data_is_never_filled_in(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The 20 m DEM has a hole next to the Site: the 80 m one answers, not a guess."""
    centre = polar_xy(*POLE_SITE)

    def holed(x: Any, y: Any) -> Any:
        ground = _bowl(x, y)
        return np.where(np.hypot(x - centre[0], y - centre[1]) < 100.0, np.nan, ground)

    write_dem(tmp_path / f"{W20}.TIF", centre, 20.0, 400, holed, POLAR)
    write_dem(tmp_path / f"{W80}.TIF", centre, 80.0, 400, _bowl, POLAR)
    monkeypatch.setenv("LUNAR_DEM_DIR", str(tmp_path))
    payload = _ask(latitude_deg=POLE_SITE[0], longitude_deg=POLE_SITE[1], half_extent_m=1_000)
    assert payload.status_code == 200
    assert payload.json()["dem"]["product"] == W80


def test_with_no_dem_under_the_grid_the_answer_is_a_422_and_never_flat_ground(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _polar_dems(tmp_path)
    monkeypatch.setenv("LUNAR_DEM_DIR", str(tmp_path))
    # 30 km does not fit even in the ±48 km 240 m square from a point 40 km off its centre.
    far = (-89.9 + math.degrees(40_000 / R), 30.0)
    answer = _ask(latitude_deg=far[0], longitude_deg=far[1], half_extent_m=30_000)
    assert answer.status_code == 422
    problem = answer.json()
    assert problem["code"] == "outside_coverage"
    assert "runs past the edge" in problem["detail"]
    empty = tmp_path / "empty"
    empty.mkdir()
    monkeypatch.setenv("LUNAR_DEM_DIR", str(empty))
    nothing = _ask(latitude_deg=POLE_SITE[0], longitude_deg=POLE_SITE[1])
    assert nothing.status_code == 422
    assert nothing.json()["code"] == "outside_coverage"


def test_the_site_is_asked_for_as_in_visibility() -> None:
    assert _ask().json()["code"] == "missing_site"
    assert (
        _ask(site_id="001", latitude_deg=-89.9, longitude_deg=0).json()["code"] == "ambiguous_site"
    )
    assert _ask(latitude_deg=-89.9).json()["code"] == "ambiguous_site"
    assert _ask(site_id="NOPE").status_code == 404
    assert _ask(site_id="001", half_extent_m=500).status_code == 422
    assert _ask(site_id="001", half_extent_m=30_001).status_code == 422


def test_a_typed_point_north_of_80s_is_outside_coverage(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _polar_dems(tmp_path)
    monkeypatch.setenv("LUNAR_DEM_DIR", str(tmp_path))
    answer = _ask(latitude_deg=0.0, longitude_deg=0.0)
    assert answer.status_code == 422
    assert answer.json()["code"] == "outside_coverage"
