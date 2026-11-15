"""The Charge of a lander's battery over the Window (the requirement).

Built on the `/visibility` answer for the same Query: one Charge value per timeline
sample, in the same order. The model is a plain energy balance with no fitted
coefficient, and it leaves out on purpose everything a real power budget adds: no
thermal model, no ageing, no tracking error, and a constant load.

Each timeline sample stands for the interval from itself to the next sample. Over that
interval the panels give

    panel_power_w × Sun fraction × (1 au / Sun distance)² × incidence factor

with everything read at the sample that opens it, the load is taken out, and the charge
stays between empty and full. The incidence factor is the cosine of the angle between the
panels and the Sun's centre, after Eduardo's panel-geometry model (the requirement):

- `sun`, the panels always face the Sun: 1;
- `flat`, lying on top and facing the zenith: max(0, sin E);
- `fixed`, upright and facing azimuth P: max(0, cos E · cos(A − P)),

with A and E the Sun's azimuth and elevation at the sample. There is no cut at E = 0:
whether the Sun is above the terrain is the Sun fraction's job, and from a high ridge the
Sun can be up with its centre below 0°. The grid steps 15 minutes but
ends at the Window end, so the last interval can be shorter; the last sample is the
Window end itself and opens no interval. The battery starts full.
"""

from __future__ import annotations

import itertools
import math
from datetime import datetime, timedelta
from typing import Any, Literal

from . import ephemeris
from .timeutil import iso_z, round_second

# The astronomical unit, IAU 2012 Resolution B2 (exact by definition).
AU_KM = 149_597_870.7

PanelPointing = Literal["sun", "fixed", "flat"]


def incidence_factor(
    pointing: PanelPointing,
    panel_azimuth_deg: float | None,
    sun_azimuth_deg: float,
    sun_elevation_deg: float,
) -> float:
    """How much of the panels' full-Sun power the Sun's direction gives, from 0 to 1."""
    if pointing == "sun":
        return 1.0
    elevation = math.radians(sun_elevation_deg)
    if pointing == "flat":
        return max(0.0, math.sin(elevation))
    if panel_azimuth_deg is None:
        raise ValueError("an upright fixed panel needs its azimuth")
    turn = math.radians(sun_azimuth_deg - panel_azimuth_deg)
    return max(0.0, math.cos(elevation) * math.cos(turn))


def sun_distance_factors(
    instants: list[datetime], latitude_deg: float, longitude_deg: float, height_m: float
) -> list[float]:
    """(1 au / Sun distance)² at each instant, the distance seen from the Site.

    The observer sits on the 1737.4 km sphere plus the Observer height, not on the DEM
    surface: near the pole the terrain is within about 8 km of the sphere, which moves the
    factor by under 1e-4 of itself, ten times below the 0.1 % the check against JPL
    Horizons allows.
    """
    observer = ephemeris.make_observer(latitude_deg, longitude_deg, height_m)
    factors = []
    for instant in instants:
        distance_km = ephemeris.apparent("SUN", ephemeris.et(instant), observer).distance_km
        factors.append((AU_KM / distance_km) ** 2)
    return factors


def charge(
    instants: list[datetime],
    sun_fractions: list[float],
    distance_factors: list[float],
    panel_power_w: float,
    load_w: float,
    battery_wh: float,
    incidence: list[float] | None = None,
) -> dict[str, Any]:
    """The Charge series and what is read off it.

    `instants` are the timeline samples; sample i opens the interval [instants[i],
    instants[i + 1]) and its Sun fraction, distance factor and incidence factor hold over
    it. Without `incidence` the panels face the Sun.
    """
    stored_wh = battery_wh
    series = [1.0]
    unmet_hours = 0.0
    lowest = 1.0
    # When the battery first reached its lowest charge: the Window start while it is full,
    # the sample that ends a falling interval, or the instant it ran empty inside one.
    lowest_at = instants[0]
    for i, (left, right) in enumerate(itertools.pairwise(instants)):
        hours = (right - left).total_seconds() / 3600.0
        power_w = panel_power_w * sun_fractions[i] * distance_factors[i]
        if incidence is not None:
            power_w *= incidence[i]
        net_w = power_w - load_w
        empty_at: datetime | None = None
        if net_w >= 0.0:
            stored_wh = min(battery_wh, stored_wh + net_w * hours)
        else:
            hours_to_empty = stored_wh / -net_w
            if hours_to_empty >= hours:
                stored_wh = max(0.0, stored_wh + net_w * hours)
            else:
                # Empty inside the interval: from then on the load is not met.
                unmet_hours += hours - hours_to_empty
                if stored_wh > 0.0:
                    empty_at = left + timedelta(hours=hours_to_empty)
                stored_wh = 0.0
        fraction = min(1.0, max(0.0, stored_wh / battery_wh))
        series.append(fraction)
        if fraction < lowest:
            lowest = fraction
            lowest_at = empty_at if empty_at is not None else right
    return {
        "darkness_tolerance_hours": battery_wh / load_w,
        "charge_fraction": series,
        "min_charge_fraction": lowest,
        "min_charge_t": iso_z(round_second(lowest_at)),
        "unmet_hours": unmet_hours,
        "final_charge_fraction": series[-1],
        "load_always_met": unmet_hours == 0.0,
    }


def panel_lit_hours(
    answer: dict[str, Any], instants: list[datetime], incidence: list[float]
) -> float:
    """Hours with the Sun up and on the panels' face.

    "Up" is the Sun's visible periods of the `/visibility` answer, the ones its sunlit
    hours add up, so the two compare directly and this is never the larger. Within each
    timeline interval the incidence factor is the one at the sample that opens it, as in
    the Charge.
    """
    sunlit = [
        (datetime.fromisoformat(p["start"]), datetime.fromisoformat(p["end"]))
        for p in answer["periods"]
        if p["body"] == "sun" and p["state"] == "visible"
    ]
    hours = 0.0
    for i, (left, right) in enumerate(itertools.pairwise(instants)):
        if incidence[i] <= 0.0:
            continue
        for begin, end in sunlit:
            overlap = (min(right, end) - max(left, begin)).total_seconds()
            if overlap > 0.0:
                hours += overlap / 3600.0
    return hours


def panel_longest_dark_hours(
    instants: list[datetime], sun_fractions: list[float], incidence: list[float]
) -> float:
    """The longest run of timeline intervals with no light on the panels.

    An interval is dark when the Sun fraction times the incidence factor at the sample that
    opens it is 0, the same rule the Charge follows: then the panels give nothing over it.
    """
    longest = 0.0
    run = 0.0
    for i, (left, right) in enumerate(itertools.pairwise(instants)):
        if sun_fractions[i] * incidence[i] == 0.0:
            run += (right - left).total_seconds() / 3600.0
            longest = max(longest, run)
        else:
            run = 0.0
    return longest


def result(
    answer: dict[str, Any],
    panel_power_w: float,
    load_w: float,
    battery_wh: float,
    panel_pointing: PanelPointing | None = None,
    panel_azimuth_deg: float | None = None,
) -> dict[str, Any]:
    """The EnergyResult for a `/visibility` answer and the numbers of a lander.

    Without `panel_pointing` the answer is the one from before panel pointing existed,
    field for field; with it, the Lander echoes the pointing, and `panel_lit_hours` and
    `panel_longest_dark_hours` are added.
    """
    query = answer["query"]
    site = query["site"]
    samples = answer["timeline"]["samples"]
    instants = [datetime.fromisoformat(sample["t"]) for sample in samples]
    factors = sun_distance_factors(
        instants, site["latitude_deg"], site["longitude_deg"], query["observer_height_m"]
    )
    incidence = (
        None
        if panel_pointing is None
        else [
            incidence_factor(
                panel_pointing,
                panel_azimuth_deg,
                sample["sun"]["azimuth_deg"],
                sample["sun"]["elevation_deg"],
            )
            for sample in samples
        ]
    )
    fractions = [sample["sun"]["fraction"] for sample in samples]
    battery = charge(
        instants,
        fractions,
        factors,
        panel_power_w,
        load_w,
        battery_wh,
        incidence,
    )
    lander: dict[str, Any] = {
        "panel_power_w": panel_power_w,
        "load_w": load_w,
        "battery_wh": battery_wh,
    }
    if panel_pointing is not None:
        lander["panel_pointing"] = panel_pointing
        if panel_azimuth_deg is not None:
            lander["panel_azimuth_deg"] = panel_azimuth_deg
    out = {
        "query": query,
        "lander": lander,
        "darkness_tolerance_hours": battery["darkness_tolerance_hours"],
        "lcsp_hours": answer["metrics"]["lcsp_hours"],
        "step_minutes": answer["timeline"]["step_minutes"],
        "charge_fraction": battery["charge_fraction"],
        "min_charge_fraction": battery["min_charge_fraction"],
        "min_charge_t": battery["min_charge_t"],
        "unmet_hours": battery["unmet_hours"],
        "final_charge_fraction": battery["final_charge_fraction"],
        "load_always_met": battery["load_always_met"],
    }
    if incidence is not None:
        out["panel_lit_hours"] = panel_lit_hours(answer, instants, incidence)
        out["panel_longest_dark_hours"] = panel_longest_dark_hours(instants, fractions, incidence)
    return out
