"""GET /visibility/energy: the Charge of a lander's battery over the Window (the requirement).

Every test asks the HTTP API and checks the answer against something the route did not
compute the same way: a straight line worked by hand, the `/visibility` answer for the
same Query, or the same request with every input scaled.
"""

import json
import math
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

# Site 001 from 22 March 2025, 10 days: the Sun sets for about 85 hours and comes back.
SHADOW = {"site_id": "001", "start": "2025-03-22T00:00:00Z", "duration_hours": 240}
# Site 001 from the validation window: the Sun never sets.
ALWAYS_SUN = {"site_id": "001", "start": "2026-11-14T00:00:00Z", "duration_hours": 48}
LANDER = {"panel_power_w": 400, "load_w": 100, "battery_wh": 2000}


def energy(query: dict[str, Any], lander: dict[str, Any]) -> dict[str, Any]:
    response = client.get("/visibility/energy", params={**query, **lander})
    assert response.status_code == 200, response.text
    payload: dict[str, Any] = response.json()
    return payload


def visibility(query: dict[str, Any]) -> dict[str, Any]:
    response = client.get("/visibility", params=query)
    assert response.status_code == 200, response.text
    payload: dict[str, Any] = response.json()
    return payload


def instant(stamp: str) -> datetime:
    return datetime.fromisoformat(stamp)


def test_the_charge_sits_on_the_visibility_timeline() -> None:
    sky = visibility(SHADOW)
    answer = energy(SHADOW, LANDER)
    assert len(answer["charge_fraction"]) == len(sky["timeline"]["samples"])
    assert answer["charge_fraction"][0] == 1.0
    assert all(0.0 <= value <= 1.0 for value in answer["charge_fraction"])
    assert answer["query"] == sky["query"]
    assert answer["step_minutes"] == sky["timeline"]["step_minutes"] == 15
    assert answer["lcsp_hours"] == sky["metrics"]["lcsp_hours"]
    assert answer["final_charge_fraction"] == answer["charge_fraction"][-1]
    assert answer["min_charge_fraction"] == min(answer["charge_fraction"])
    assert answer["lander"] == {"panel_power_w": 400.0, "load_w": 100.0, "battery_wh": 2000.0}


def test_darkness_tolerance_is_capacity_over_load_exactly() -> None:
    answer = energy(SHADOW, {"panel_power_w": 10, "load_w": 7, "battery_wh": 1000})
    assert answer["darkness_tolerance_hours"] == 1000 / 7


def test_with_no_panels_the_charge_falls_in_a_straight_line_to_empty() -> None:
    # 20.1 h of battery: it runs empty 6 minutes into a step, not on a sample.
    capacity, load = 2010.0, 100.0
    answer = energy(SHADOW, {"panel_power_w": 0, "load_w": load, "battery_wh": capacity})
    samples = visibility(SHADOW)["timeline"]["samples"]
    start = instant(samples[0]["t"])
    hours = [(instant(s["t"]) - start).total_seconds() / 3600 for s in samples]
    line = [max(0.0, 1.0 - load * h / capacity) for h in hours]
    assert answer["charge_fraction"] == pytest.approx(line, abs=1e-12)

    tolerance_h = capacity / load
    first_empty = next(h for h, c in zip(hours, answer["charge_fraction"], strict=True) if c == 0)
    assert 0 <= first_empty - tolerance_h < 0.25
    assert instant(answer["min_charge_t"]) == start + timedelta(hours=tolerance_h)
    assert answer["min_charge_fraction"] == 0.0
    assert answer["unmet_hours"] == pytest.approx(240 - tolerance_h, abs=1e-9)
    assert answer["load_always_met"] is False
    assert answer["final_charge_fraction"] == 0.0


def test_the_last_step_is_as_short_as_the_window_leaves_it() -> None:
    # 1.1 h: samples at 0, 15, 30, 45 and 60 minutes, then the Window end at 66 minutes.
    query = {**ALWAYS_SUN, "duration_hours": 1.1}
    answer = energy(query, {"panel_power_w": 0, "load_w": 100, "battery_wh": 1000})
    assert answer["charge_fraction"] == pytest.approx(
        [1.0, 0.975, 0.95, 0.925, 0.9, 0.89], abs=1e-12
    )


def test_each_sample_stands_for_the_interval_it_opens() -> None:
    # At Sunrise the step that starts in shadow and ends in Sun is paid at the shadow's
    # rate: the load comes out and the panels give nothing yet.
    load, capacity = 100.0, 100_000_000.0
    answer = energy(SHADOW, {"panel_power_w": 100_000, "load_w": load, "battery_wh": capacity})
    samples = visibility(SHADOW)["timeline"]["samples"]
    rises = [
        i
        for i in range(len(samples) - 1)
        if samples[i]["sun"]["fraction"] == 0 and samples[i + 1]["sun"]["fraction"] > 0
    ]
    assert rises, "the fixture Window must hold a Sunrise"
    for i in rises:
        drop = answer["charge_fraction"][i] - answer["charge_fraction"][i + 1]
        assert drop == pytest.approx(load * 0.25 / capacity, rel=1e-6)


def test_scaling_the_three_inputs_leaves_the_charge_unchanged() -> None:
    base = energy(SHADOW, LANDER)
    for factor in (0.37, 13.0):
        scaled = energy(SHADOW, {name: value * factor for name, value in LANDER.items()})
        assert scaled["charge_fraction"] == pytest.approx(base["charge_fraction"], abs=1e-9)
        assert scaled["unmet_hours"] == pytest.approx(base["unmet_hours"], abs=1e-9)
        assert scaled["min_charge_t"] == base["min_charge_t"]
        assert scaled["darkness_tolerance_hours"] == pytest.approx(
            base["darkness_tolerance_hours"], rel=1e-12
        )


def test_shadow_is_not_unmet_while_the_battery_lasts() -> None:
    # The panels give nothing for days, but the battery never runs empty.
    answer = energy(SHADOW, {"panel_power_w": 400, "load_w": 1, "battery_wh": 1_000_000})
    assert answer["lcsp_hours"] > 80
    assert answer["unmet_hours"] == 0.0
    assert answer["load_always_met"] is True
    assert 0.99 < answer["min_charge_fraction"] < 1.0


def test_the_load_is_unmet_from_empty_until_the_sun_is_back() -> None:
    answer = energy(SHADOW, LANDER)
    assert answer["min_charge_fraction"] == 0.0
    # The battery lasts 20 h of an 85 h shadow, so at least the other 65 h are unmet.
    assert answer["unmet_hours"] >= answer["lcsp_hours"] - answer["darkness_tolerance_hours"]
    assert answer["load_always_met"] is False
    assert answer["final_charge_fraction"] == 1.0


def test_a_battery_that_never_drops_is_lowest_at_the_window_start() -> None:
    answer = energy(ALWAYS_SUN, {"panel_power_w": 1000, "load_w": 0.1, "battery_wh": 10})
    sky = visibility(ALWAYS_SUN)
    assert min(s["sun"]["fraction"] for s in sky["timeline"]["samples"]) > 0.5
    assert answer["charge_fraction"] == [1.0] * len(sky["timeline"]["samples"])
    assert answer["min_charge_fraction"] == 1.0
    assert answer["min_charge_t"] == sky["query"]["start"]
    assert answer["unmet_hours"] == 0.0
    assert answer["load_always_met"] is True


def test_the_charge_follows_the_sun_fraction_and_distance_of_each_step() -> None:
    # Every step that neither fills nor empties the battery gives back the panel power
    # times the Sun fraction times a distance factor, which stays within (1 au / d)² for
    # d between perihelion and aphelion (0.983 to 1.017 au).
    panel, load, capacity = 1000.0, 2000.0, 1e8
    answer = energy(SHADOW, {"panel_power_w": panel, "load_w": load, "battery_wh": capacity})
    samples = visibility(SHADOW)["timeline"]["samples"]
    series = answer["charge_fraction"]
    lit = 0
    for i in range(len(samples) - 1):
        fraction = samples[i]["sun"]["fraction"]
        hours = (instant(samples[i + 1]["t"]) - instant(samples[i]["t"])).total_seconds() / 3600
        given_w = (series[i + 1] - series[i]) * capacity / hours + load
        if fraction > 0.001:
            lit += 1
            assert 1 / 1.0168**2 < given_w / (panel * fraction) < 1 / 0.9832**2
        elif fraction == 0:
            assert given_w == pytest.approx(0.0, abs=1e-5)
    assert lit > 100


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("panel_power_w", -1),
        ("panel_power_w", 1_000_001),
        ("load_w", 0),
        ("load_w", 0.05),
        ("load_w", 1_000_001),
        ("battery_wh", 0.5),
        ("battery_wh", 100_000_001),
    ],
)
def test_out_of_range_lander_numbers_are_rejected(name: str, value: float) -> None:
    response = client.get("/visibility/energy", params={**ALWAYS_SUN, **LANDER, name: value})
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_parameter"
    assert name in response.json()["detail"]


@pytest.mark.parametrize("missing", ["panel_power_w", "load_w", "battery_wh"])
def test_the_api_does_not_invent_a_lander(missing: str) -> None:
    lander = {name: value for name, value in LANDER.items() if name != missing}
    response = client.get("/visibility/energy", params={**ALWAYS_SUN, **lander})
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_parameter"
    assert missing in response.json()["detail"]


@pytest.mark.usefixtures("without_global_dem")
def test_the_site_rules_are_the_ones_of_visibility() -> None:
    both = {**ALWAYS_SUN, "latitude_deg": -89.5, "longitude_deg": 0, **LANDER}
    assert client.get("/visibility/energy", params=both).json()["code"] == "ambiguous_site"
    unknown = {**ALWAYS_SUN, "site_id": "XYZ", **LANDER}
    assert client.get("/visibility/energy", params=unknown).status_code == 404
    north = {"latitude_deg": -70, "longitude_deg": 0, "start": ALWAYS_SUN["start"], **LANDER}
    assert client.get("/visibility/energy", params=north).json()["code"] == "outside_coverage"


def test_energy_reuses_the_cached_answer_and_leaves_visibility_byte_identical() -> None:
    before = client.get("/visibility", params=ALWAYS_SUN)
    assert before.headers["Cache-Status"] == "lunar-api; fwd=miss"
    answer = client.get("/visibility/energy", params={**ALWAYS_SUN, **LANDER})
    assert answer.headers["Cache-Status"] == "lunar-api; hit"
    after = client.get("/visibility", params=ALWAYS_SUN)
    assert after.content == before.content


def test_the_panels_give_more_near_perihelion_than_near_aphelion() -> None:
    # Same Site, whole Sun up in both, one step each. JPL Horizons puts the Sun at
    # 0.98546 au on 2027-01-28 and 1.01658 au on 2026-06-02, so (1 au / d)² is about
    # 6.4 % higher in January. A factor of 1 everywhere would give the same power.
    panel, load, capacity = 1000.0, 2000.0, 1_000_000.0

    def given_per_sun(start: str) -> float:
        query = {"site_id": "001", "start": start, "duration_hours": 0.25}
        fraction = float(visibility(query)["timeline"]["samples"][0]["sun"]["fraction"])
        assert fraction > 0.99
        series = energy(query, {"panel_power_w": panel, "load_w": load, "battery_wh": capacity})
        after = float(series["charge_fraction"][1])
        return ((after - 1) * capacity / 0.25 + load) / fraction

    ratio = given_per_sun("2027-01-28T02:17:00Z") / given_per_sun("2026-06-02T19:17:00Z")
    assert ratio == pytest.approx((1.01658 / 0.98546) ** 2, rel=1e-4)


# Panel pointing (the requirement), after Eduardo's panel-geometry model. Each check reads the
# power the panels gave over one 15-minute step off the Charge, as the step from a full
# battery with a load larger than the panels can give:
#
#     power = (Charge after the step − 1) × capacity / 0.25 h + load
#
# and divides it by the power with the panels facing the Sun over the same step, so the
# Sun fraction and the distance cancel and what is left is the incidence factor alone.
EXAMPLE = (
    Path(__file__).resolve().parents[2] / "contract/examples/visibility-energy-001.example.json"
)
STEP = {"panel_power_w": 1000.0, "load_w": 2000.0, "battery_wh": 1000.0}


def step_power(start: str, pointing: dict[str, Any]) -> float:
    query = {"site_id": "001", "start": start, "duration_hours": 0.25}
    answer = energy(query, {**STEP, **pointing})
    series = answer["charge_fraction"]
    assert len(series) == 2 and series[0] == 1.0 and series[1] > 0.0
    return float((series[1] - 1.0) * STEP["battery_wh"] / 0.25 + STEP["load_w"])


def sun_at(start: str) -> dict[str, float]:
    query = {"site_id": "001", "start": start, "duration_hours": 0.25}
    sun: dict[str, float] = visibility(query)["timeline"]["samples"][0]["sun"]
    return sun


def same_answer(answer: object, example: object) -> bool:
    """Equal, with floats compared to one part in 10^9.

    The examples were written by the engine on an ARM Mac and CI runs on x86 Linux, where the
    same arithmetic rounds differently around the 11th significant digit (unmet_hours
    89.04525550802708 against 89.04525550799754). Anything a real change would move, even a
    second over a Window, is thousands of times larger.
    """
    if isinstance(answer, dict) and isinstance(example, dict):
        return answer.keys() == example.keys() and all(
            same_answer(answer[k], example[k]) for k in answer
        )
    if isinstance(answer, list) and isinstance(example, list):
        return len(answer) == len(example) and all(
            same_answer(a, e) for a, e in zip(answer, example, strict=True)
        )
    if isinstance(answer, float) or isinstance(example, float):
        if isinstance(answer, bool) or isinstance(example, bool):
            return answer == example
        if not isinstance(answer, int | float) or not isinstance(example, int | float):
            return False
        return math.isclose(answer, example, rel_tol=1e-9, abs_tol=1e-12)
    return answer == example


def toward(azimuth_deg: float, elevation_deg: float) -> tuple[float, float, float]:
    """The unit vector (east, north, zenith) toward a direction, as Eduardo builds it."""
    a, e = math.radians(azimuth_deg), math.radians(elevation_deg)
    return (math.cos(e) * math.sin(a), math.cos(e) * math.cos(a), math.sin(e))


# Two instants on the validation window at Site 001, with the whole Sun up.
WEEKEND = ["2026-11-14T03:00:00Z", "2026-11-15T17:45:00Z"]


def test_without_the_new_parameters_the_answer_is_the_contract_example() -> None:
    # the requirement: panel pointing must not change a single field of the answer that
    # existed before it. The example was written by the engine before the implementation.
    example = json.loads(EXAMPLE.read_text("utf-8"))["value"]
    answer = energy(SHADOW, LANDER)
    assert same_answer(answer, example)
    assert "panel_lit_hours" not in answer
    assert set(answer["lander"]) == {"panel_power_w", "load_w", "battery_wh"}


def test_pointing_at_the_sun_by_name_gives_the_same_charge() -> None:
    plain = energy(SHADOW, LANDER)
    named = energy(SHADOW, {**LANDER, "panel_pointing": "sun"})
    assert named["charge_fraction"] == plain["charge_fraction"]
    assert named["lander"] == {**plain["lander"], "panel_pointing": "sun"}
    # Facing the Sun, the panels are lit whenever the Sun is up: the sunlit hours.
    assert named["panel_lit_hours"] == pytest.approx(
        visibility(SHADOW)["metrics"]["sunlit_hours"], abs=1e-9
    )


@pytest.mark.parametrize("start", WEEKEND)
def test_upright_panels_facing_the_suns_azimuth_give_cos_e(start: str) -> None:
    sun = sun_at(start)
    facing = step_power(start, {"panel_pointing": "fixed", "panel_azimuth_deg": sun["azimuth_deg"]})
    full = step_power(start, {"panel_pointing": "sun"})
    # The panel's normal lies flat toward the Sun's azimuth; its dot product with the
    # direction of the Sun is the length of that direction's horizontal part.
    east, north, _ = toward(sun["azimuth_deg"], sun["elevation_deg"])
    assert facing / full == pytest.approx(math.hypot(east, north), rel=1e-9)
    assert facing < full


@pytest.mark.parametrize("start", WEEKEND)
def test_flat_panels_give_sin_e(start: str) -> None:
    sun = sun_at(start)
    assert 0.5 < sun["elevation_deg"] < 2.0
    flat = step_power(start, {"panel_pointing": "flat"})
    full = step_power(start, {"panel_pointing": "sun"})
    zenith = toward(sun["azimuth_deg"], sun["elevation_deg"])[2]
    assert flat / full == pytest.approx(zenith, rel=1e-9)
    # A Sun a degree or so up hardly reaches a panel lying flat: under 4 % of full Sun.
    assert flat / full < 0.04


@pytest.mark.parametrize("start", WEEKEND)
def test_upright_panels_facing_away_from_the_sun_get_nothing(start: str) -> None:
    sun = sun_at(start)
    away = (sun["azimuth_deg"] + 180.0) % 360.0
    query = {"site_id": "001", "start": start, "duration_hours": 0.25}
    answer = energy(query, {**STEP, "panel_pointing": "fixed", "panel_azimuth_deg": away})
    # No Charge comes in: the step is the load alone, 2000 W for 0.25 h out of 1000 Wh.
    assert answer["charge_fraction"] == [1.0, 0.5]
    assert answer["panel_lit_hours"] == 0.0


def test_a_sun_below_zero_degrees_still_lights_an_upright_panel() -> None:
    # the requirement: Eduardo's function returns 0 whenever the Sun's centre is at or below
    # 0°, a horizon on the bare sphere. Ours leaves the horizon to the Sun fraction from
    # the DEM: Site 001 sits on a ridge, its horizon dips below 0°, and from 22 March 2025
    # the Sun is up there with its centre below 0° for most of the month. An upright panel
    # facing it gets cos E there, not 0. This test is here so nobody "fixes" that.
    start = "2025-04-09T10:45:00Z"
    sun = sun_at(start)
    assert sun["elevation_deg"] < -1.0
    assert sun["fraction"] > 0.99
    facing = step_power(start, {"panel_pointing": "fixed", "panel_azimuth_deg": sun["azimuth_deg"]})
    full = step_power(start, {"panel_pointing": "sun"})
    east, north, _ = toward(sun["azimuth_deg"], sun["elevation_deg"])
    assert facing / full == pytest.approx(math.hypot(east, north), rel=1e-9)
    assert facing > 0.99 * full
    # A panel lying flat faces the zenith, and that Sun is under its plane.
    assert step_power(start, {"panel_pointing": "flat"}) == pytest.approx(0.0, abs=1e-9)


# Site 001 over a whole synodic month from the validation window: the Sun never sets.
MONTH = {"site_id": "001", "start": "2026-11-14T00:00:00Z", "duration_hours": 708}


@pytest.mark.parametrize("azimuth", [0.0, 90.0, 213.5])
def test_an_upright_fixed_panel_sees_the_sun_about_half_the_month(azimuth: float) -> None:
    # At the pole the Sun circles the horizon once a month. A panel standing upright and
    # facing one way only has the Sun on its face while the Sun is within 90° of that
    # way, which is half the circle, so about half the month, even here, where the Sun
    # is up the whole month.
    sunlit = visibility(MONTH)["metrics"]["sunlit_hours"]
    assert sunlit == pytest.approx(708.0)
    lit = energy(MONTH, {**LANDER, "panel_pointing": "fixed", "panel_azimuth_deg": azimuth})
    back = (azimuth + 180.0) % 360.0
    behind = energy(MONTH, {**LANDER, "panel_pointing": "fixed", "panel_azimuth_deg": back})
    assert 0.4 * sunlit < lit["panel_lit_hours"] < 0.6 * sunlit
    # The face and the back of the same panel share the month between them, give or take
    # the two 15-minute steps where the Sun crosses the panel's plane.
    assert lit["panel_lit_hours"] + behind["panel_lit_hours"] == pytest.approx(sunlit, abs=0.5)


def test_flat_panels_are_lit_whenever_the_sun_is_up_with_its_centre_above_zero() -> None:
    lit = energy(MONTH, {**LANDER, "panel_pointing": "flat"})["panel_lit_hours"]
    assert lit == pytest.approx(708.0)


@pytest.mark.parametrize(
    "pointing",
    [
        {"panel_pointing": "fixed"},
        {"panel_azimuth_deg": 90},
        {"panel_pointing": "sun", "panel_azimuth_deg": 90},
        {"panel_pointing": "flat", "panel_azimuth_deg": 90},
        {"panel_pointing": "fixed", "panel_azimuth_deg": 360},
        {"panel_pointing": "fixed", "panel_azimuth_deg": -0.5},
        {"panel_pointing": "tracking"},
    ],
)
def test_the_panel_azimuth_goes_with_fixed_and_only_with_it(pointing: dict[str, Any]) -> None:
    response = client.get("/visibility/energy", params={**ALWAYS_SUN, **LANDER, **pointing})
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_parameter"
    assert "panel_" in response.json()["detail"]


def test_the_lander_echoes_the_pointing_and_the_azimuth() -> None:
    answer = energy(ALWAYS_SUN, {**LANDER, "panel_pointing": "fixed", "panel_azimuth_deg": 0})
    assert answer["lander"] == {
        "panel_power_w": 400.0,
        "load_w": 100.0,
        "battery_wh": 2000.0,
        "panel_pointing": "fixed",
        "panel_azimuth_deg": 0.0,
    }
    flat = energy(ALWAYS_SUN, {**LANDER, "panel_pointing": "flat"})["lander"]
    assert flat["panel_pointing"] == "flat" and "panel_azimuth_deg" not in flat


def test_the_fixed_panel_example_is_the_engine_answer() -> None:
    path = EXAMPLE.with_name("visibility-energy-001-fixed-east.example.json")
    example = json.loads(path.read_text("utf-8"))["value"]
    pointing = {"panel_pointing": "fixed", "panel_azimuth_deg": 90}
    assert same_answer(energy(SHADOW, {**LANDER, **pointing}), example)
    assert example["panel_lit_hours"] < visibility(SHADOW)["metrics"]["sunlit_hours"]


# The longest stretch with no light on the panels (the requirement, approved by Luiz): what the
# Darkness tolerance is read against once the panels do not face the Sun.
DAY = {"site_id": "001", "start": "2026-11-14T00:00:00Z", "duration_hours": 24}


def off_by(azimuth_deg: float, panel_deg: float) -> float:
    """How far the Sun's azimuth is from where the panel faces, 0° to 180°."""
    return abs((azimuth_deg - panel_deg + 180.0) % 360.0 - 180.0)


def test_panels_facing_away_from_the_sun_are_dark_the_whole_window() -> None:
    # Over one day at the pole the Sun's azimuth moves about 12°. A panel facing the
    # opposite way from where the Sun starts keeps it behind its plane all day, while the
    # Sun stays up: no light on the panels for the whole 24 h, and the LCSP is 0.
    samples = visibility(DAY)["timeline"]["samples"]
    away = (samples[0]["sun"]["azimuth_deg"] + 180.0) % 360.0
    assert all(s["sun"]["fraction"] > 0.5 for s in samples)
    assert all(off_by(s["sun"]["azimuth_deg"], away) > 150.0 for s in samples)
    answer = energy(DAY, {**LANDER, "panel_pointing": "fixed", "panel_azimuth_deg": away})
    assert answer["lcsp_hours"] == 0.0
    assert answer["panel_longest_dark_hours"] == pytest.approx(24.0, abs=1e-9)
    assert answer["panel_lit_hours"] == 0.0


def test_panels_facing_the_sun_all_day_have_no_dark_stretch() -> None:
    samples = visibility(DAY)["timeline"]["samples"]
    toward_sun = samples[0]["sun"]["azimuth_deg"]
    assert all(off_by(s["sun"]["azimuth_deg"], toward_sun) < 30.0 for s in samples)
    fixed = {"panel_pointing": "fixed", "panel_azimuth_deg": toward_sun}
    assert energy(DAY, {**LANDER, **fixed})["panel_longest_dark_hours"] == 0.0
    # Lying flat they get a little light all day too: the Sun's centre stays above 0°.
    assert all(s["sun"]["elevation_deg"] > 0.0 for s in samples)
    assert energy(DAY, {**LANDER, "panel_pointing": "flat"})["panel_longest_dark_hours"] == 0.0


def test_facing_the_sun_the_longest_dark_stretch_is_the_lcsp_on_the_timeline() -> None:
    # Facing the Sun, no light on the panels means no Sun: the LCSP, which /visibility
    # refines to about a second, while this is counted in whole 15-minute steps. The two
    # agree within one step at each end of the night.
    answer = energy(SHADOW, {**LANDER, "panel_pointing": "sun"})
    assert answer["lcsp_hours"] > 80
    assert answer["panel_longest_dark_hours"] == pytest.approx(answer["lcsp_hours"], abs=0.5)
    assert answer["panel_longest_dark_hours"] % 0.25 == pytest.approx(0.0, abs=1e-9)


def test_upright_panels_stay_dark_longer_than_the_night() -> None:
    # In the 10-day Window from 22 March 2025 the Sun is down for about 85 h. Panels facing
    # east stay dark for that night and for the hours the Sun is up but in the west, on
    # either side of it, so their longest dark stretch is longer than the LCSP.
    pointing = {"panel_pointing": "fixed", "panel_azimuth_deg": 90}
    answer = energy(SHADOW, {**LANDER, **pointing})
    assert answer["panel_longest_dark_hours"] > answer["lcsp_hours"] + 1.0
