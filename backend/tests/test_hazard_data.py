"""The hazard data decodes as Eduardo's own engine decodes it (the requirement).

The expected values were printed by his `decodePGDA` + `sampleGrid` (src/js/rover_tese_engine.js,
commit 2195fcb) run under Node on his DM1 bundle file, not by this code.
"""

from __future__ import annotations

import pytest

from app import hazard_data

# x_m, y_m, row, col, surf, slp5, slp20, slp60, slperr, ldec_density, ldec_any (his output)
EDUARDO_DM1 = [
    (0, 0, 100, 100, 401.13, 8.5, 5.5, 4.0, 3.0, 0.015748, True),
    (609.9, 1159.0, 76, 112, 387.93, 2.5, 1.5, 1.0, 2.75, 0.007874, True),
    (-4975, 4975, 0, 0, 59.43, 15.5, 12.5, 7.0, 2.75, 0.007874, True),
    (3210, -2875, 157, 164, 81.43, 20.0, 19.5, 19.5, 2.5, 0.015748, False),
]


@pytest.mark.parametrize("case", EDUARDO_DM1)
def test_dm1_cells_match_eduardos_decoder(case: tuple[float, ...]) -> None:
    x, y, row, col, surf, s5, s20, s60, serr, den, anyshot = case
    g = hazard_data.grid("DM1")
    assert g.index(x, y) == (row, col)
    assert g.elevation_m[row, col] == pytest.approx(surf, abs=1e-3)
    assert g.slope_5m_deg[row, col] == pytest.approx(s5)
    assert g.slope_20m_deg[row, col] == pytest.approx(s20)
    assert g.slope_60m_deg[row, col] == pytest.approx(s60)
    assert g.slope_error_deg[row, col] == pytest.approx(serr)
    assert g.ldec_density[row, col] == pytest.approx(den, abs=1e-6)
    assert bool(g.ldec_any[row, col]) is anyshot


def test_every_tile_has_two_runs_and_a_square_grid() -> None:
    tiles = hazard_data.tiles()
    assert len(tiles) == 26
    for tile_id, t in tiles.items():
        assert [r["coarse_m"] for r in t["runs"]] == [60, 20]
        g = hazard_data.grid(tile_id)
        assert g.slope_5m_deg.shape == (t["n"], t["n"]) == (200, 200)


def test_ar06_sits_1_3_km_from_dm1() -> None:
    # sites_master.json gives 1.31 km between AR06 and DM1's centre (great-circle distance).
    entry = hazard_data.site_entry("AR06")
    assert entry is not None and entry["nearest_tile"] == "DM1"
    x, y = hazard_data.offset_in_tile("DM1", -84.1965, 69.1606)
    assert (x * x + y * y) ** 0.5 == pytest.approx(1310, abs=15)
