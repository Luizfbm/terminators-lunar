"""Only the new Level 3 boundary and native co-registration contract."""

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app import heights, horizon
from app.main import app

client = TestClient(app)


@pytest.mark.parametrize("lat,lon", [(-87.49, 0), (-91, 0), (-89, 181), (-89, -181)])
def test_api_rejects_outside_selection_before_reading(
    monkeypatch: pytest.MonkeyPatch, lat: float, lon: float
) -> None:
    monkeypatch.setattr(heights, "_grid", lambda *a: pytest.fail("must not read a DEM"))
    assert (
        client.get(
            "/terrain/landing-area", params={"latitude_deg": lat, "longitude_deg": lon}
        ).status_code
        == 422
    )


@pytest.mark.parametrize("lat,lon", [(-89.5, 0), (-90, 180)])
def test_complete_native_windows_and_shared_bounds(lat: float, lon: float) -> None:
    # Repository fixture DEMs are actual measured cutouts centred on the pole.
    response = client.get(
        "/terrain/landing-area", params={"latitude_deg": lat, "longitude_deg": lon}
    )
    assert response.status_code == 200, response.text
    body = response.json()
    bounds = body["bounds"]
    assert bounds["x_max_m"] - bounds["x_min_m"] == pytest.approx(10000)
    assert bounds["y_max_m"] - bounds["y_min_m"] == pytest.approx(10000)
    for key, resolution in [("before", 80), ("after", 20)]:
        grid = body[key]
        assert grid["dem"]["resolution_m"] == resolution
        assert grid["metres_per_pixel"] == resolution
        assert grid["size_px"] <= 511
        folder, _ = horizon.slope_bands(None, lat)
        band = horizon.Band(grid["dem"]["product"], resolution, 0, 5000)
        native = heights._grid(str(folder), (band,), lat, lon, 5000 + resolution)
        encoded = grid["heights"]
        decoded = (
            encoded["at_0_m"]
            + np.array(encoded["values"]).reshape(native.heights.shape) * encoded["quantum_m"]
        )
        assert np.max(np.abs(decoded - native.heights)) <= encoded["quantum_m"] / 2 + 1e-9
        assert grid["x_min_m"] + resolution / 2 <= bounds["x_min_m"]
        assert grid["x_min_m"] + (grid["size_px"] - 0.5) * resolution >= bounds["x_max_m"]


def test_no_synthetic_or_coarser_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    def unavailable(*args: object) -> None:
        raise horizon.DemUnavailable("native", "missing pixels")

    monkeypatch.setattr(heights, "_grid", unavailable)
    result = client.get("/terrain/landing-area?latitude_deg=-89.5&longitude_deg=0")
    assert result.status_code == 422
    assert result.json()["code"] == "outside_coverage"


def test_truncated_grid_is_not_stretched_to_ten_km(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        heights,
        "_grid",
        lambda *args: heights.Grid("small", 20, "polar", 20, -100, 100, np.zeros((10, 10))),
    )
    assert client.get("/terrain/landing-area?latitude_deg=-90&longitude_deg=0").status_code == 422
