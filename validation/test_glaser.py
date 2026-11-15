"""The Sun against Gläser et al. 2018 at the Connecting Ridge, the requirement.

The rule, the reference, the neighbourhood and the tolerance are in glaser.py and were
committed before any result. The engine's numbers are `data/glaser_engine.json`
(run_glaser_engine.py, in the backend image on the server, because the 20 years run past the
app's coverage). Until that file is in the repo the three entries stay pending. If the check
fails, it stays failed.
"""

from __future__ import annotations

import json
import math
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import glaser
import numpy as np
import proof
import pytest

SCRIPT = "validation/test_glaser.py"
DATA = Path(__file__).resolve().parent / "data"
ENGINE = DATA / "glaser_engine.json"

REFERENCE = (
    "Gläser et al. 2018, Planetary and Space Science 162, 170-178, Table 2, point C1 at "
    "-89.4398°, 222.83°E, 2 m: {quantity}, hourly over 2017-01-01 to 2037-01-01, on the "
    "authors' own 20 m DTM. Ours: the maximum over the 317 points within 250 m of C1 "
    "(25 m spacing), {ours}, the same 20 years, hourly, at 2 m on LDEM_80S_20MPP_ADJ"
)
TOLERANCE = proof.text(
    f"|difference| ≤ {glaser.TOLERANCE_PP:g} percentage points, in either direction",
    f"|diferença| ≤ {glaser.TOLERANCE_PP:g} pontos percentuais, nos dois sentidos",
)
NOT_COVERED = proof.text(
    "Terrain only: the Earth's eclipse of the Sun is not in the judged value (it is shown "
    "in the result). Not the value at Site 001: the paper's point C1 is about 800 m from it, "
    "and Site 001's values are shown for information only. The paper's number is the maximum "
    "of a region, at a point given to about 3 m, on its own DTM; ours is the maximum over 317 "
    "nodes on another elevation product. Observer at 2 m; the surface (0 m) is not checked. "
    "The Sun is the only body checked. The 9-year span the app can answer, each calendar "
    "year, the 15 min step and a half-hour shift are shown and never judged.",
    "Só o terreno: o eclipse do Sol pela Terra não entra no valor julgado (aparece no "
    "resultado). Não é o valor no Site 001: o ponto C1 do artigo fica a uns 800 m dele, e os "
    "valores do Site 001 aparecem só como informação. O número do artigo é o máximo de uma "
    "região, num ponto dado a uns 3 m, no DTM deles; o nosso é o máximo de 317 nós em outro "
    "produto de elevação. Observer a 2 m; a superfície (0 m) não é checada. O Sol é o único "
    "corpo checado. O trecho de 9 anos que o app consegue responder, cada ano civil, o passo "
    "de 15 min e um deslocamento de meia hora aparecem só como informação e nunca são julgados.",
)

proof.declare(
    "glaser-sun-visibility",
    title=proof.text(
        "Share of time with the Sun up at Connecting Ridge C1, against Gläser et al.",
        "Parte do tempo com Sol no ponto C1 da Connecting Ridge, contra Gläser et al.",
    ),
    reference=REFERENCE.format(
        quantity="solar visibility 92.1 % (any part of the Sun's disc)",
        ours="the share of hourly steps with any part of the Sun's disc above the Horizon mask",
    ),
    tolerance=TOLERANCE,
    not_covered=NOT_COVERED,
    script_path=SCRIPT,
)
proof.declare(
    "glaser-mean-sun-fraction",
    title=proof.text(
        "Mean Sun fraction at Connecting Ridge C1, against Gläser et al.",
        "Fração média do Sol no ponto C1 da Connecting Ridge, contra Gläser et al.",
    ),
    reference=REFERENCE.format(
        quantity="maximum average illumination 88.0 % (mean visible fraction of the Sun's disc)",
        ours="the mean Sun fraction, terrain only",
    ),
    tolerance=TOLERANCE,
    not_covered=NOT_COVERED,
    script_path=SCRIPT,
)
proof.declare(
    "negative-control-glaser-longitude",
    title=proof.text(
        "Negative control: the same neighbourhood at longitude + 180°",
        "Controle negativo: a mesma vizinhança na longitude + 180°",
    ),
    reference="The two Gläser checks with the engine run at each point's longitude + 180°",
    tolerance=proof.text(
        f"must break both checks (|difference| above {glaser.TOLERANCE_PP:g} points)",
        f"precisa quebrar as duas checagens (|diferença| acima de {glaser.TOLERANCE_PP:g} pontos)",
    ),
    not_covered=proof.text(
        "Shows the check can fail; says nothing about the engine.",
        "Mostra que a checagem pode falhar; não diz nada sobre o motor.",
    ),
    script_path=SCRIPT,
)


def comma(value: float, spec: str = "+.2f") -> str:
    """A number as the Portuguese text writes it, with the decimal comma."""
    return format(value, spec).replace(".", ",")


def sphere_distance_and_bearing(
    lat1: float, lon1: float, lat2: float, lon2: float
) -> tuple[float, float]:
    """Haversine distance (m, 1737.4 km sphere) and initial bearing, written out here."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    distance = 2 * 1_737_400.0 * math.asin(math.sqrt(h))
    y = math.sin(dl) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return distance, math.degrees(math.atan2(y, x)) % 360.0


# --- What runs now: the rule, the grid and the arithmetic --------------------------------


def test_the_decided_values_are_the_ones_in_the_rule() -> None:
    # Every number here was decided before any run. Changing one to make a check pass is
    # tuning: the repo rule is to report, not to tune.
    assert (glaser.CENTRE_LATITUDE_DEG, glaser.CENTRE_LONGITUDE_DEG) == (-89.4398, 222.83)
    assert glaser.OBSERVER_HEIGHT_M == 2.0
    assert glaser.SUN_VISIBILITY_PCT == 92.1 and glaser.MEAN_SUN_FRACTION_PCT == 88.0
    assert glaser.TOLERANCE_PP == 5.0
    assert glaser.RADIUS_M == 250.0 and glaser.SPACING_M == 25.0 and glaser.NODES == 317
    assert glaser.CONTROL_LONGITUDE_SHIFT_DEG == 180.0
    assert glaser.PERIOD_START == datetime(2017, 1, 1, tzinfo=UTC)
    assert glaser.PERIOD_END == datetime(2037, 1, 1, tzinfo=UTC)
    assert glaser.STEP == timedelta(hours=1) and glaser.STEPS == 175_320
    # The 2014 abstract's number is context and must not become a judged reference.
    assert glaser.CONTEXT_2014_SUN_VISIBILITY_PCT not in (
        glaser.SUN_VISIBILITY_PCT,
        glaser.MEAN_SUN_FRACTION_PCT,
    )


def test_the_site_001_constants_are_the_catalog_s() -> None:
    from app import catalog

    site = catalog.find_site(glaser.SITE_001_ID)
    assert site is not None
    assert (site["latitude_deg"], site["longitude_deg"]) == (
        glaser.SITE_001_LATITUDE_DEG,
        glaser.SITE_001_LONGITUDE_DEG,
    )


def test_the_neighbourhood_is_317_points_inside_250_m() -> None:
    nodes = glaser.grid(glaser.CENTRE_LATITUDE_DEG, glaser.CENTRE_LONGITUDE_DEG)
    assert len(nodes) == glaser.NODES == 317
    assert len({n["id"] for n in nodes}) == 317
    assert {(n["i"], n["j"]) for n in nodes} == set(glaser.lattice(250.0))
    centre = [n for n in nodes if n["distance_m"] == 0.0]
    assert [n["id"] for n in centre] == ["g+00+00"]
    assert (centre[0]["latitude_deg"], centre[0]["longitude_deg"]) == (-89.4398, 222.83)
    # The outermost nodes sit on the radius, none past it; the 25 m lattice is regular.
    assert max(n["distance_m"] for n in nodes) == pytest.approx(250.0)
    inside = set(glaser.lattice(250.0))
    rim = {
        (i, j)
        for i, j in inside
        if any(n not in inside for n in ((i + 1, j), (i - 1, j), (i, j + 1), (i, j - 1)))
    }
    assert {(n["i"], n["j"]) for n in nodes if n["edge"]} == rim
    assert (10, 0) in rim and (0, 0) not in rim


def test_every_node_is_where_its_steps_say_on_the_sphere() -> None:
    # Checked with a haversine and an initial-bearing formula written here, not with the
    # great-circle step the grid is built from.
    nodes = glaser.grid(glaser.CENTRE_LATITUDE_DEG, glaser.CENTRE_LONGITUDE_DEG)
    for n in nodes:
        if n["distance_m"] == 0.0:
            continue
        distance, bearing = sphere_distance_and_bearing(
            glaser.CENTRE_LATITUDE_DEG,
            glaser.CENTRE_LONGITUDE_DEG,
            n["latitude_deg"],
            n["longitude_deg"],
        )
        assert distance == pytest.approx(math.hypot(n["i"], n["j"]) * 25.0, abs=1e-3), n["id"]
        wrapped = (bearing - n["bearing_deg"] + 180.0) % 360.0 - 180.0
        assert abs(wrapped) < 1e-6, n["id"]
        assert n["bearing_deg"] == pytest.approx(
            math.degrees(math.atan2(n["i"], n["j"])) % 360.0
        ), n["id"]


def test_the_sensitivity_points_come_first_and_are_the_centre_and_100_m_out() -> None:
    nodes = glaser.grid(glaser.CENTRE_LATITUDE_DEG, glaser.CENTRE_LONGITUDE_DEG)
    assert [n["id"] for n in nodes[:5]] == [
        "g+00+00",
        "g+04+00",
        "g-04+00",
        "g+00+04",
        "g+00-04",
    ]
    assert sum(1 for n in nodes if n["sensitivity"]) == 5
    assert [n["distance_m"] for n in nodes[:5]] == pytest.approx([0.0, 100.0, 100.0, 100.0, 100.0])


def test_the_control_is_the_same_grid_on_the_other_side_of_the_pole() -> None:
    shifted = glaser.control_longitude(glaser.CENTRE_LONGITUDE_DEG)
    assert shifted == pytest.approx(42.83)
    control = glaser.grid(glaser.CENTRE_LATITUDE_DEG, shifted)
    judged = glaser.grid(glaser.CENTRE_LATITUDE_DEG, glaser.CENTRE_LONGITUDE_DEG)
    assert [n["id"] for n in control] == [n["id"] for n in judged]
    for a, b in zip(judged, control):
        assert b["latitude_deg"] == pytest.approx(a["latitude_deg"], abs=1e-9)
        assert (b["longitude_deg"] - a["longitude_deg"]) % 360.0 == pytest.approx(180.0, abs=1e-6)


def test_site_001_has_a_landing_ellipse_of_49_points() -> None:
    ellipse = glaser.grid(
        glaser.SITE_001_LATITUDE_DEG,
        glaser.SITE_001_LONGITUDE_DEG % 360.0,
        glaser.ELLIPSE_RADIUS_M,
    )
    assert len(ellipse) == 49
    assert max(n["distance_m"] for n in ellipse) == pytest.approx(100.0)


def test_every_point_fits_inside_the_dem_windows() -> None:
    # The rays of every point run 5, 100 and 300 km out in the three bands, and a ray that
    # leaves a window is a DemUnavailable. This reads the real windows, for the three sets.
    import rasterio  # type: ignore[import-untyped]

    from app import horizon

    sets = {
        "judged": (glaser.CENTRE_LATITUDE_DEG, glaser.CENTRE_LONGITUDE_DEG, glaser.RADIUS_M),
        "control": (
            glaser.CENTRE_LATITUDE_DEG,
            glaser.control_longitude(glaser.CENTRE_LONGITUDE_DEG),
            glaser.RADIUS_M,
        ),
        "site001": (
            glaser.SITE_001_LATITUDE_DEG,
            glaser.SITE_001_LONGITUDE_DEG % 360.0,
            glaser.ELLIPSE_RADIUS_M,
        ),
    }
    for band in horizon.LADDER:
        path = horizon.dem_dir() / f"{band.product}.TIF"
        if not path.is_file():
            pytest.skip(f"{path} is not here: fetch the DEM fixtures (fixtures/dem/fetch.sh)")
        with rasterio.open(path) as dataset:
            left, bottom, right, top = dataset.bounds
        for role, (lat, lon, radius) in sets.items():
            nodes = glaser.grid(lat, lon, radius)
            x, y = horizon._stereographic(
                np.array([n["latitude_deg"] for n in nodes]),
                np.array([n["longitude_deg"] for n in nodes]),
            )
            margin = min(
                x.min() - band.outer_m - left,
                right - (x.max() + band.outer_m),
                y.min() - band.outer_m - bottom,
                top - (y.max() + band.outer_m),
            )
            assert margin > 0.0, f"{role} runs {-margin:.0f} m past the {band.product} window"
            # C1 is 17 km from the pole; the window should leave at least 5 km of slack.
            assert margin > 5_000.0, (role, band.product, margin)


def test_the_comparison_arithmetic() -> None:
    inside = glaser.compare(0.95, 92.1)
    assert inside["difference_pp"] == pytest.approx(2.9)
    assert inside["passed"] is True
    assert glaser.compare(0.90, 92.1)["passed"] is True  # -2.1, below is fine too
    # Both ways, and the line itself passes: 75 against 70 is exactly +5.
    assert glaser.compare(0.75, 70.0)["passed"] is True
    assert glaser.compare(0.65, 70.0)["passed"] is True
    assert glaser.compare(0.7501, 70.0)["passed"] is False
    assert glaser.compare(0.6499, 70.0)["passed"] is False
    below = glaser.compare(0.80, 88.0)
    assert below["difference_pp"] == pytest.approx(-8.0)
    assert below["passed"] is False
    assert glaser.compare(0.88, 88.0)["difference_pp"] == pytest.approx(0.0)


def test_the_maximum_names_the_first_of_a_tie() -> None:
    points = [{"id": "a", "v": 0.5}, {"id": "b", "v": 0.9}, {"id": "c", "v": 0.9}]
    assert glaser.maximum(points, lambda p: p["v"])["id"] == "b"


def test_the_spans_of_an_hourly_series() -> None:
    parts = glaser.spans(glaser.PERIOD_START, glaser.STEPS)
    years = {name: part for name, part in parts.items() if name != "fixture_span"}
    assert sorted(years) == [str(y) for y in range(2017, 2037)]
    assert sum(part.stop - part.start for part in years.values()) == glaser.STEPS
    assert years["2020"].stop - years["2020"].start == 366 * 24
    assert years["2021"].stop - years["2021"].start == 365 * 24
    fixture = parts["fixture_span"]
    assert fixture.stop - fixture.start == 82_584  # 2023-08-01 to 2033-01-01
    # A shorter series keeps only the spans it holds whole.
    short = glaser.spans(datetime(2024, 1, 1, tzinfo=UTC), 24 * 366 + 5)
    assert sorted(short) == ["2024"]


def test_span_statistics_follow_the_rule() -> None:
    fraction = np.array([0.0, 0.0, 0.25, 1.0, 0.5, 0.0, 0.0, 1.0])
    cover = np.array([0.0, 0.0, 0.0, 0.5, 0.0, 0.0, 0.0, 0.0])
    stats = glaser.span_stats(fraction, cover)
    assert stats["steps"] == 8
    assert stats["sun_any"] == pytest.approx(4 / 8)  # any part of the disc
    assert stats["sun_mean_fraction"] == pytest.approx(2.75 / 8)
    assert stats["sun_mean_fraction_with_earth_eclipse"] == pytest.approx(2.25 / 8)


# --- The vectorised scan against the engine -----------------------------------------------

_MASKS: dict[tuple[float, float], Any] = {}


def mask_of(node: dict[str, Any]) -> Any:
    from app import horizon

    where = (node["latitude_deg"], node["longitude_deg"])
    if where not in _MASKS:
        _MASKS[where] = horizon.mask(*where, glaser.OBSERVER_HEIGHT_M, 20.0)
    return _MASKS[where]


def centre_node() -> dict[str, Any]:
    nodes = glaser.grid(glaser.CENTRE_LATITUDE_DEG, glaser.CENTRE_LONGITUDE_DEG)
    return next(n for n in nodes if n["id"] == "g+00+00")


def test_the_fast_path_gives_the_engines_sun_fraction() -> None:
    from app import engine, ephemeris

    nodes = {
        n["id"]: n for n in glaser.grid(glaser.CENTRE_LATITUDE_DEG, glaser.CENTRE_LONGITUDE_DEG)
    }
    centre = nodes["g+00+00"]
    start = datetime(2024, 3, 1, tzinfo=UTC)
    steps = 300
    series = glaser.build_series(
        centre["latitude_deg"],
        centre["longitude_deg"],
        mask_of(centre).site_height_m + glaser.OBSERVER_HEIGHT_M,
        start,
        3600.0,
        steps,
    )
    partial = 0
    for node_id in ("g+00+00", "g+04+00", "g+00-04"):
        node = nodes[node_id]
        mask = mask_of(node)
        frame = ephemeris.make_observer(node["latitude_deg"], node["longitude_deg"], 0.0)
        fast = glaser.sun_fraction(mask, frame, series.sun, ephemeris.sun_radius_km())
        # The engine, one Look at a time, with this point's own observer.
        observer = ephemeris.make_observer(
            node["latitude_deg"],
            node["longitude_deg"],
            mask.site_height_m + glaser.OBSERVER_HEIGHT_M,
        )
        worst = 0.0
        for k in range(steps):
            look = engine.look_at(start + timedelta(hours=k), observer, mask)
            worst = max(worst, abs(look._sun_over_terrain - fast[k]))
            assert (fast[k] > 0.0) == look.above("sun"), (node_id, k)
        assert worst <= 1e-5, (node_id, worst)
        partial += int(np.count_nonzero((fast > 0.0) & (fast < 1.0)))
    # The comparison must have crossed Sunrises and Sunsets, or it proves little.
    assert partial >= 30


def test_the_vectorised_blocks_do_not_change_the_numbers() -> None:
    from app import ephemeris

    centre = centre_node()
    mask = mask_of(centre)
    series = glaser.build_series(
        centre["latitude_deg"],
        centre["longitude_deg"],
        mask.site_height_m + glaser.OBSERVER_HEIGHT_M,
        datetime(2024, 3, 1, tzinfo=UTC),
        3600.0,
        500,
    )
    frame = ephemeris.make_observer(centre["latitude_deg"], centre["longitude_deg"], 0.0)
    whole = glaser.sun_fraction(mask, frame, series.sun, ephemeris.sun_radius_km(), block=500)
    blocks = glaser.sun_fraction(mask, frame, series.sun, ephemeris.sun_radius_km(), block=77)
    strided = glaser.sun_fraction(mask, frame, series.sun[::4], ephemeris.sun_radius_km())
    assert np.array_equal(whole, blocks)
    assert np.array_equal(whole[::4], strided)


def test_the_eclipse_cover_is_the_engines_overlap() -> None:
    # The Earth crossing the Sun's disc seen from the Moon: the total lunar eclipse of
    # 2025-03-14 (the Earth is over the Sun's disc for hours seen from the pole). The cover
    # is time-only, so it needs no terrain; each step is compared with the engine's own
    # overlap from the same Look.
    from app import engine, ephemeris, geometry

    centre = centre_node()
    height = mask_of(centre).site_height_m + glaser.OBSERVER_HEIGHT_M
    start = datetime(2025, 3, 14, 0, 0, tzinfo=UTC)
    steps = 216  # five-minute steps to 18:00
    series = glaser.build_series(
        centre["latitude_deg"], centre["longitude_deg"], height, start, 300.0, steps, earth=True
    )
    cover = glaser.eclipse_cover(series, ephemeris.sun_radius_km(), ephemeris.earth_radius_km())
    observer = ephemeris.make_observer(centre["latitude_deg"], centre["longitude_deg"], height)
    for k in range(steps):
        look = engine.look_at(start + timedelta(minutes=5 * k), observer, mask_of(centre))
        expected = geometry.circle_overlap_fraction(
            look.sun_radius_rad,
            look.earth_radius_rad,
            geometry.angle_between(look.sun.vector_km, look.earth.vector_km),
        )
        assert cover[k] == pytest.approx(expected, abs=1e-5), k
    assert cover.max() > 0.9  # the Earth really covers the Sun in this window
    assert cover[0] == 0.0 and cover[-1] == 0.0


# --- What needs the engine's output -------------------------------------------------------


def engine_output() -> dict[str, Any]:
    if not ENGINE.exists():
        pytest.skip(
            "no engine output yet: run run_glaser_engine.py on the server "
            "(the command is in validation/README.md)"
        )
    loaded: dict[str, Any] = json.loads(ENGINE.read_text("utf-8"))
    assert loaded["smoke"] is False, "the output is a smoke run, not the full period"
    assert loaded["rule"] == json.loads(json.dumps(glaser.rule())), "the output used another rule"
    assert loaded["period_days"] == glaser.PERIOD_DAYS
    assert loaded["period_start"] == glaser.PERIOD_START.isoformat()
    assert loaded["step_hours"] == 1.0 and loaded["observer_height_m"] == glaser.OBSERVER_HEIGHT_M
    for key, size in (("points", 317), ("control_points", 317), ("site_001_points", 49)):
        assert len(loaded[key]) == size, key
        for point in loaded[key]:
            assert point["judged"]["steps"] == glaser.STEPS
    nodes = glaser.grid(glaser.CENTRE_LATITUDE_DEG, glaser.CENTRE_LONGITUDE_DEG)
    assert sorted(p["id"] for p in loaded["points"]) == sorted(n["id"] for n in nodes)
    return loaded


def test_the_committed_output_is_what_the_code_produces() -> None:
    # Five points over the span the committed SPICE fixture covers, 2023-08-01 to
    # 2033-01-01, recomputed from the fixture kernels and DEM windows and compared with the
    # committed output: it shows the JSON is still what this code gives (the fixture is the
    # same DE440 cut bit for bit, and the DEM windows are the same pixels).
    from app import ephemeris

    output = engine_output()
    by_id = {p["id"]: p for p in output["points"]}
    nodes = {
        n["id"]: n
        for n in glaser.grid(glaser.CENTRE_LATITUDE_DEG, glaser.CENTRE_LONGITUDE_DEG)
        if n["sensitivity"]
    }
    centre = nodes["g+00+00"]
    steps = glaser.hour_index(glaser.FIXTURE_START, glaser.FIXTURE_END)
    assert steps == 82_584
    hourly = glaser.build_series(
        centre["latitude_deg"],
        centre["longitude_deg"],
        mask_of(centre).site_height_m + glaser.OBSERVER_HEIGHT_M,
        glaser.FIXTURE_START,
        3600.0,
        steps,
        earth=True,
    )
    cover = glaser.eclipse_cover(hourly, ephemeris.sun_radius_km(), ephemeris.earth_radius_km())
    for node_id, node in nodes.items():
        frame = ephemeris.make_observer(node["latitude_deg"], node["longitude_deg"], 0.0)
        fraction = glaser.sun_fraction(mask_of(node), frame, hourly.sun, ephemeris.sun_radius_km())
        again = glaser.span_stats(fraction, cover)
        committed = by_id[node_id]["fixture_span"]
        assert again["steps"] == committed["steps"] == steps
        for field in ("sun_any", "sun_mean_fraction", "sun_mean_fraction_with_earth_eclipse"):
            assert again[field] == pytest.approx(committed[field], abs=1e-6), (node_id, field)


@proof.check("glaser-sun-visibility")
def test_the_sun_visibility_against_the_paper() -> None:
    output = engine_output()
    points = output["points"]
    best = glaser.maximum(points, lambda p: p["judged"]["sun_any"])
    summary = glaser.compare(best["judged"]["sun_any"], glaser.SUN_VISIBILITY_PCT)
    info = Info(output, best, "sun_any")
    proof.record(
        "glaser-sun-visibility",
        "passed" if summary["passed"] else "failed",
        info.describe(summary),
    )
    assert summary["passed"], summary


@proof.check("glaser-mean-sun-fraction")
def test_the_mean_sun_fraction_against_the_paper() -> None:
    output = engine_output()
    points = output["points"]
    best = glaser.maximum(points, lambda p: p["judged"]["sun_mean_fraction"])
    summary = glaser.compare(best["judged"]["sun_mean_fraction"], glaser.MEAN_SUN_FRACTION_PCT)
    info = Info(output, best, "sun_mean_fraction")
    eclipse = (
        best["judged"]["sun_mean_fraction_with_earth_eclipse"] - best["judged"]["sun_mean_fraction"]
    ) * 100.0
    proof.record(
        "glaser-mean-sun-fraction",
        "passed" if summary["passed"] else "failed",
        info.describe(
            summary,
            en=f"with the Earth's eclipse of the Sun, as the app shows it, {eclipse:+.2f} points",
            pt=f"com o eclipse do Sol pela Terra, como o app mostra, {comma(eclipse)} pontos",
        ),
    )
    assert summary["passed"], summary


@proof.check("negative-control-glaser-longitude")
def test_the_negative_control_breaks_both_checks() -> None:
    output = engine_output()
    control = output["control_points"]
    sun = glaser.compare(max(p["judged"]["sun_any"] for p in control), glaser.SUN_VISIBILITY_PCT)
    mean = glaser.compare(
        max(p["judged"]["sun_mean_fraction"] for p in control), glaser.MEAN_SUN_FRACTION_PCT
    )
    broke = not sun["passed"] and not mean["passed"]
    en = (
        f"Sun visibility {sun['ours_pct']:.2f} % ({sun['difference_pp']:+.2f} points), "
        f"mean Sun fraction {mean['ours_pct']:.2f} % ({mean['difference_pp']:+.2f} points)"
    )
    pt_text = (
        f"visibilidade do Sol {comma(sun['ours_pct'], '.2f')} % ({comma(sun['difference_pp'])} "
        f"pontos), fração média do Sol {comma(mean['ours_pct'], '.2f')} % "
        f"({comma(mean['difference_pp'])} pontos)"
    )
    proof.record(
        "negative-control-glaser-longitude",
        "passed" if broke else "failed",
        proof.text(f"broke both checks ({en})", f"quebrou as duas checagens ({pt_text})")
        if broke
        else proof.text(f"did not break both checks ({en})", f"não quebrou as duas ({pt_text})"),
    )
    assert broke, (sun, mean)


class Info:
    """What the result text says next to the judged number, never part of the verdict."""

    def __init__(self, output: dict[str, Any], best: dict[str, Any], field: str) -> None:
        self.output, self.best, self.field = output, best, field

    def value(self, point: dict[str, Any], section: str = "judged") -> float:
        return float(point[section][self.field]) * 100.0

    def describe(
        self, summary: dict[str, Any], en: str | None = None, pt: str | None = None
    ) -> dict[str, str]:
        best, field = self.best, self.field
        c1 = next(p for p in self.output["points"] if p["id"] == "g+00+00")
        site = next(p for p in self.output["site_001_points"] if p["id"] == "g+00+00")
        ellipse = glaser.maximum(self.output["site_001_points"], lambda p: p["judged"][field])
        years = [y[field] * 100.0 for y in best["years"].values()]
        fixture = self.value(best, "fixture_span")
        # Every point carries `sensitivity`: the series for the 5 sensitivity points, False for the rest.
        sensitive = [p for p in self.output["points"] if isinstance(p.get("sensitivity"), dict)]
        step15 = max(
            abs(self.value(p, "judged") - p["sensitivity"]["step_15min"][field] * 100.0)
            for p in sensitive
        )
        shifted = max(
            abs(self.value(p, "judged") - p["sensitivity"]["offset_30min"][field] * 100.0)
            for p in sensitive
        )
        rim = best["edge"]
        count = len(self.output["points"])
        ours, diff = summary["ours_pct"], summary["difference_pp"]
        # The 2014 abstract's number is the Sun's visibility; it is context for that quantity.
        context = field == "sun_any"
        extra_en = (
            "; the paper's 92.27 % of 2014 (its earlier DTM) is context, not judged"
            if context
            else ""
        ) + (f"; {en}" if en else "")
        extra_pt = (
            "; os 92,27 % de 2014 (no DTM anterior deles) são só contexto, não julgados"
            if context
            else ""
        ) + (f"; {pt}" if pt else "")
        return proof.text(
            f"Maximum over {count} points {ours:.2f} %, {best['distance_m']:.0f} m from C1"
            f"{' (on the rim of the neighbourhood)' if rim else ''}, against "
            f"{summary['reference_pct']:.1f} %: difference {diff:+.2f} points. For information: "
            f"at C1 itself {self.value(c1):.2f} %; at Site 001 {self.value(site):.2f} %, best "
            f"point of its 100 m Landing ellipse {self.value(ellipse):.2f} %; the best point's "
            f"calendar years run from {min(years):.2f} to {max(years):.2f} %, and over "
            f"2023-08-01 to 2033-01-01 it is {fixture:.2f} % ({fixture - ours:+.2f} points); on "
            f"5 points a 15 min step moves the value by at most {step15:.2f} points and a "
            f"series shifted by 30 min by at most {shifted:.2f}{extra_en}",
            f"Máximo em {count} pontos de {comma(ours, '.2f')} %, a {best['distance_m']:.0f} m "
            f"de C1{' (na borda da vizinhança)' if rim else ''}, contra "
            f"{comma(summary['reference_pct'], '.1f')} %: diferença de {comma(diff)} pontos. Só "
            f"como informação: em C1 mesmo {comma(self.value(c1), '.2f')} %; no Site 001 "
            f"{comma(self.value(site), '.2f')} %, melhor ponto da Landing ellipse de 100 m "
            f"{comma(self.value(ellipse), '.2f')} %; os anos civis do melhor ponto vão de "
            f"{comma(min(years), '.2f')} a {comma(max(years), '.2f')} %, e de 01/08/2023 a "
            f"01/01/2033 fica em {comma(fixture, '.2f')} % ({comma(fixture - ours)} pontos); em "
            f"5 pontos, o passo de 15 min muda o valor em até {comma(step15, '.2f')} pontos e "
            f"uma série deslocada de 30 min em até {comma(shifted, '.2f')}{extra_pt}",
        )


# --- The runner ---------------------------------------------------------------------------


def run_runner(tmp: Path, *args: str) -> dict[str, Any]:
    import run_glaser_engine

    argv = [
        "run_glaser_engine.py",
        str(tmp / "glaser_engine.json"),
        "--processes",
        "1",
        "--nice",
        "0",
        "--start",
        "2024-03-01",
        "--days",
        "3",
        "--limit",
        "1",
        *args,
    ]
    old = sys.argv
    sys.argv = argv
    try:
        run_glaser_engine.main()
    finally:
        sys.argv = old
    loaded: dict[str, Any] = json.loads((tmp / "glaser_engine.json").read_text("utf-8"))
    return loaded


def test_the_runner_refuses_more_than_three_processes(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    import run_glaser_engine

    for count in ("4", "0"):
        monkeypatch.setattr(sys, "argv", ["run", str(tmp_path / "out.json"), "--processes", count])
        with pytest.raises(SystemExit) as stopped:
            run_glaser_engine.main()
        assert stopped.value.code == 2


def test_a_smoke_run_writes_a_marked_output_and_resumes(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    first = run_runner(tmp_path)
    assert first["smoke"] is True and first["period_days"] == 3
    for key in ("points", "control_points", "site_001_points"):
        assert [p["id"] for p in first[key]] == ["g+00+00"]
        assert first[key][0]["judged"]["steps"] == 72
    centre = first["points"][0]
    assert centre["sensitivity"]["step_15min"]["steps"] == 288
    assert "years" not in centre and "fixture_span" not in centre  # 3 days hold neither
    assert 0.0 <= centre["judged"]["sun_any"] <= 1.0
    capsys.readouterr()
    again = run_runner(tmp_path)  # the same command carries on: nothing left to run
    assert "3 of 3 points done, 0 to run" in capsys.readouterr().err
    assert again["points"] == first["points"]
    # A different rule or period must not be resumed into the same partial file.
    with pytest.raises(SystemExit):
        run_runner(tmp_path, "--limit", "1", "--days", "2")
    fresh = run_runner(tmp_path, "--days", "2", "--fresh")
    assert fresh["points"][0]["judged"]["steps"] == 48


def test_the_smoke_output_is_refused_by_the_check(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setitem(globals(), "ENGINE", tmp_path / "glaser_engine.json")
    run_runner(tmp_path)
    with pytest.raises(AssertionError, match="smoke"):
        engine_output()
