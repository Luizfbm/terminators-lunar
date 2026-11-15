"""The Earth visible by any part of its disc, beside the Earth visible by its centre.

The app's main rule is the Earth's centre above the Horizon mask. `earth_visible_hours_any_part`
counts the Earth the way the Sun is counted, any part of the disc above it, so a reader
comparing with a tool that counts differently sees where the hours come from. No other metric
uses it.

The unit tests build a `Look` by hand. The HTTP tests read the answer against something the
engine did not compute the same way: a brute-force test of the disc on the timeline samples and
the mask the answer carries, the Window and the plain centre count.
"""

import itertools
import math
from datetime import datetime, timedelta
from typing import Any

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app import engine, ephemeris, horizon
from app.constants import HORIZON_SAMPLES
from app.main import app

client = TestClient(app)

# Site 001 from 1 December 2026 over the default Window (708.73 h): the Earth is up about half of it.
SITE_001 = {"site_id": "001", "start": "2026-12-01T00:00:00Z"}
QUERIES = [
    SITE_001,
    {"site_id": "001", "start": "2025-03-01T00:00:00Z"},
    {"site_id": "CR01", "start": "2026-11-20T12:00:00Z", "duration_hours": 240},
    {"latitude_deg": -89.6, "longitude_deg": 0, "start": "2026-11-14T00:00:00Z"},
]

# The Earth's angular radius from the Moon runs from 0.90° (apogee) to 1.03° (perigee).
RADIUS_LOW_DEG = 0.89
RADIUS_HIGH_DEG = 1.03


def visibility(params: dict[str, Any]) -> dict[str, Any]:
    response = client.get("/visibility", params=params)
    assert response.status_code == 200, response.text
    payload: dict[str, Any] = response.json()
    return payload


def look(elevation_deg: float, radius_deg: float = 0.95, mask_deg: float = 0.0) -> engine.Look:
    """An Earth at `elevation_deg` over a Horizon mask that is `mask_deg` all round."""
    earth = ephemeris.Apparent(120.0, elevation_deg, 384_400.0, (384_400.0, 0.0, 0.0))
    sun = ephemeris.Apparent(10.0, 1.0, 1.496e8, (1.496e8, 0.0, 0.0))
    mask = horizon.Mask(
        0.0,
        np.full(HORIZON_SAMPLES, mask_deg),
        [],
        [],
    )
    return engine.Look(
        instant=datetime(2026, 12, 1),
        sun=sun,
        earth=earth,
        sun_radius_rad=math.radians(0.27),
        earth_radius_rad=math.radians(radius_deg),
        mask=mask,
    )


@pytest.mark.parametrize(
    ("elevation_deg", "by_centre", "any_part"),
    [
        (3.0, True, True),  # wholly up
        (0.5, True, True),  # centre up, the lower limb under the mask
        (-0.5, False, True),  # centre down, the upper limb still over the mask
        (-0.949, False, True),  # the upper limb a hair over
        (-1.2, False, False),  # wholly down
    ],
)
def test_any_part_counts_the_disc_and_the_centre_counts_the_centre(
    elevation_deg: float, by_centre: bool, any_part: bool
) -> None:
    seen = look(elevation_deg)
    assert seen.above("earth") is by_centre
    assert seen.above("earth_any_part") is any_part


def test_any_part_follows_the_mask_under_the_disc_not_only_under_the_centre() -> None:
    # The centre is 0.3° over a 0.2° mask, but a ridge in the mask would sit under the
    # disc: here the mask is flat, so the answer is the flat one. Raise it past the top.
    assert look(0.3, mask_deg=0.2).above("earth_any_part")
    assert not look(-1.0, mask_deg=0.2).above("earth_any_part")
    # Centre 0.3° below a 0.2° mask: the upper limb (0.95° up) clears it.
    assert not look(0.0, mask_deg=0.2).above("earth") and look(0.0, mask_deg=0.2).above(
        "earth_any_part"
    )


def test_the_disc_rule_is_the_one_the_sun_uses() -> None:
    """Giving the Earth the Sun's radius gives the Sun's answer at the same place."""
    seen = look(-0.2, radius_deg=0.27)
    sun_alike = engine.Look(
        instant=seen.instant,
        sun=ephemeris.Apparent(120.0, -0.2, 1.496e8, (1.496e8, 0.0, 0.0)),
        earth=seen.earth,
        sun_radius_rad=math.radians(0.27),
        earth_radius_rad=seen.earth_radius_rad,
        mask=seen.mask,
    )
    assert sun_alike.above("sun") is sun_alike.above("earth_any_part") is True


def hours_by_samples(
    payload: dict[str, Any], radius_deg: float, any_part: bool
) -> tuple[float, float]:
    """Hours the Earth is up on the timeline samples, and how far that can be from the truth.

    Each sample stands for the 15 minutes around it; an interval whose two ends differ may be
    off by half of it. The disc is tested with a grid of points across it, not strips.
    """
    samples = payload["timeline"]["samples"]
    mask_az = np.array([s["azimuth_deg"] for s in payload["horizon"]["samples"]])
    mask_el = np.array([s["elevation_deg"] for s in payload["horizon"]["samples"]])

    def mask_at(azimuth: Any) -> Any:
        return np.interp(np.asarray(azimuth) % 360.0, mask_az, mask_el, period=360.0)

    reach = np.linspace(-1.0, 1.0, 41)
    dx, dy = np.meshgrid(reach * radius_deg, reach * radius_deg)
    inside = dx * dx + dy * dy <= radius_deg**2
    dx, dy = dx[inside], dy[inside]

    def up(sample: dict[str, Any]) -> bool:
        earth = sample["earth"]
        if not any_part:
            return bool(earth["elevation_deg"] > mask_at(earth["azimuth_deg"]))
        elevation = earth["elevation_deg"] + dy
        azimuth = earth["azimuth_deg"] + dx / np.cos(np.radians(elevation))
        return bool(np.any(elevation > mask_at(azimuth)))

    states = [up(s) for s in samples]
    stamps = [datetime.fromisoformat(s["t"]) for s in samples]
    hours = error = 0.0
    for (a, b), (left, right) in zip(
        itertools.pairwise(stamps), itertools.pairwise(states), strict=True
    ):
        span = (b - a).total_seconds() / 3600.0
        hours += span * (left + right) / 2.0
        if left != right:
            error += span / 2.0
    return hours, error


def test_site_001_in_december_2026_against_the_timeline_samples() -> None:
    payload = visibility(SITE_001)
    metrics = payload["metrics"]
    centre, any_part = metrics["earth_visible_hours"], metrics["earth_visible_hours_any_part"]
    window = payload["query"]["duration_hours"]
    assert window == pytest.approx(708.73)
    # About half the Window by the centre, a day or so more by the disc.
    assert 0.40 < centre / window < 0.55
    assert centre < any_part < centre + 72

    # The centre rule, rebuilt from the samples, is the metric the app already had.
    rebuilt, slack = hours_by_samples(payload, 0.0, any_part=False)
    assert abs(centre - rebuilt) <= slack + 1e-9
    # The disc rule: the value must sit between what the largest and the smallest Earth give.
    low, low_slack = hours_by_samples(payload, RADIUS_LOW_DEG, any_part=True)
    high, high_slack = hours_by_samples(payload, RADIUS_HIGH_DEG, any_part=True)
    assert low - low_slack <= any_part <= high + high_slack
    # And it is far from the centre's count, so the check cannot pass by accident.
    assert any_part - centre > 4 * (slack + 0.25)


@pytest.mark.parametrize("params", QUERIES)
def test_any_part_is_never_less_than_the_centre(params: dict[str, Any]) -> None:
    metrics = visibility(params)["metrics"]
    assert metrics["earth_visible_hours_any_part"] >= metrics["earth_visible_hours"] - 1e-9
    assert metrics["earth_visible_hours_any_part"] <= visibility(params)["query"]["duration_hours"]


def stretches(payload: dict[str, Any], up: bool, margin_deg: float) -> list[tuple[int, int]]:
    """Runs of timeline samples with the Earth clear of the mask by `margin_deg`, up or down."""
    mask = {s["azimuth_deg"]: s["elevation_deg"] for s in payload["horizon"]["samples"]}
    keys = np.array(sorted(mask))
    values = np.array([mask[k] for k in keys])
    runs: list[tuple[int, int]] = []
    begin: int | None = None
    for index, sample in enumerate(payload["timeline"]["samples"]):
        earth = sample["earth"]
        gap = earth["elevation_deg"] - float(
            np.interp(earth["azimuth_deg"] % 360.0, keys, values, period=360.0)
        )
        clear = gap > margin_deg if up else gap < -margin_deg
        if clear and begin is None:
            begin = index
        if not clear and begin is not None:
            runs.append((begin, index - 1))
            begin = None
    if begin is not None:
        runs.append((begin, len(payload["timeline"]["samples"]) - 1))
    return runs


@pytest.mark.parametrize("up", [True, False])
def test_both_rules_agree_when_the_earth_is_wholly_up_or_wholly_down(up: bool) -> None:
    whole = visibility(SITE_001)
    # 1.1° clears the largest Earth's radius, so the whole disc is on one side of the mask.
    runs = [r for r in stretches(whole, up, 1.1) if r[1] - r[0] >= 4 * 24]
    assert runs, "no day-long stretch with the Earth clear of the mask"
    first, last = max(runs, key=lambda r: r[1] - r[0])
    samples = whole["timeline"]["samples"]
    start = datetime.fromisoformat(samples[first]["t"])
    hours = (datetime.fromisoformat(samples[last]["t"]) - start).total_seconds() / 3600.0
    payload = visibility(
        {
            "site_id": "001",
            "start": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "duration_hours": hours,
        }
    )
    metrics = payload["metrics"]
    expected = hours if up else 0.0
    assert metrics["earth_visible_hours"] == pytest.approx(expected, abs=1e-6)
    assert metrics["earth_visible_hours_any_part"] == metrics["earth_visible_hours"]


def test_around_an_earthset_the_disc_rule_keeps_the_earth_longer() -> None:
    """The last edge of the disc goes down after the centre does, so the hours are more."""
    payload = visibility(SITE_001)
    samples = payload["timeline"]["samples"]
    flips = [
        i
        for i in range(1, len(samples))
        if samples[i]["earth"]["visible"] != samples[i - 1]["earth"]["visible"]
    ]
    assert flips, "no Earthrise or Earthset in the Window"
    index = next(i for i in flips if not samples[i]["earth"]["visible"])  # an Earthset
    set_at = datetime.fromisoformat(samples[index]["t"])
    # A Window that ends 10 hours after the centre set: the disc was still partly up for a while.
    start = set_at - timedelta(hours=10)
    short = visibility(
        {"site_id": "001", "start": start.strftime("%Y-%m-%dT%H:%M:%SZ"), "duration_hours": 20}
    )["metrics"]
    # The Earth skims the mask here: the centre is down for part of it, the disc never is.
    assert 0.0 < short["earth_visible_hours"] < short["earth_visible_hours_any_part"] <= 20.0


def test_the_flat_answer_carries_it_too() -> None:
    response = client.get("/visibility/flat", params={**SITE_001, "duration_hours": 100})
    assert response.status_code == 200, response.text
    metrics = response.json()["metrics"]
    assert metrics["earth_visible_hours_any_part"] >= metrics["earth_visible_hours"]
