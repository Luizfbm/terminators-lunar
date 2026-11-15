"""Local contacts of a solar eclipse seen from the Moon: our engine against SPICE `gfoclt`.

Both run on the kernels the backend has loaded. The engine side steps `engine.look_at`,
the function behind every /visibility sample, and bisects where the Sun fraction leaves 1,
reaches 0, leaves 0 and returns to 1. The reference side is our own `gfoclt` call (the
idea is Larissa's, `building/visao_pouso/gerar_visao.py` in the independent work): the Earth and the
Sun as pck00011 ellipsoids, seen from an SPK written for the Observer's point at run time.
"""

from __future__ import annotations

import dataclasses
import os
import tempfile
from collections.abc import Callable
from datetime import datetime, timedelta
from pathlib import Path

import athena

SCAN_STEP = timedelta(seconds=60)
RESOLUTION_S = 0.1
# A body id no kernel uses, for the Observer's point in the temporary SPK.
OBSERVER_ID = -2290001


# engine.Look.sun_fraction can come back as 1 - 2e-16 with the whole disc clear: the strips
# of geometry.disc_over_profile are summed in floating point. A billionth of the disc is
# far below anything a contact means, so the ends are taken within this of 0 and 1.
FRACTION_EPS = 1e-9


def _state(fraction: float) -> int:
    """2: the whole Sun, 1: part of it, 0: none."""
    if fraction >= 1.0 - FRACTION_EPS:
        return 2
    if fraction <= FRACTION_EPS:
        return 0
    return 1


def engine_contacts(
    latitude_deg: float,
    longitude_deg: float,
    height_m: float,
    start: datetime,
    end: datetime,
    earth_radius_scale: float = 1.0,
) -> dict[str, datetime]:
    """The four contacts by our engine, set up as engine.calculate sets up a Query.

    `earth_radius_scale` enlarges the Earth's disc, for the negative control only.
    """
    from app import engine, ephemeris, horizon

    mask = horizon.mask(latitude_deg, longitude_deg, height_m)
    observer = ephemeris.make_observer(latitude_deg, longitude_deg, mask.site_height_m + height_m)

    def fraction(instant: datetime) -> float:
        look = engine.look_at(instant, observer, mask)
        if earth_radius_scale != 1.0:
            radius = ephemeris.earth_radius_km() * earth_radius_scale
            look = dataclasses.replace(
                look,
                earth_radius_rad=ephemeris.angular_radius_rad(look.earth.distance_km, radius),
            )
        return look.sun_fraction()

    return contacts(fraction, start, end)


def contacts(
    fraction: Callable[[datetime], float], start: datetime, end: datetime
) -> dict[str, datetime]:
    found: list[datetime] = []
    left, left_state = start, _state(fraction(start))
    if left_state != 2:
        raise ValueError(f"the Sun is not whole at {start}")
    cursor = start
    while cursor < end:
        right = min(cursor + SCAN_STEP, end)
        right_state = _state(fraction(right))
        if right_state != left_state:
            low, high = left, right
            while (high - low).total_seconds() > RESOLUTION_S:
                middle = low + (high - low) / 2
                if _state(fraction(middle)) == left_state:
                    low = middle
                else:
                    high = middle
            found.append(low + (high - low) / 2)
        left, left_state, cursor = right, right_state, right
    if len(found) != len(athena.CONTACTS):
        raise ValueError(f"expected four contacts, found {len(found)}: {found}")
    return dict(zip(athena.CONTACTS, found, strict=True))


def spice_contacts(
    latitude_deg: float, longitude_deg: float, height_m: float, start: datetime, end: datetime
) -> dict[str, datetime]:
    """The four contacts by `gfoclt`, from the same point the engine looks from."""
    import spiceypy as spice

    from app import ephemeris, horizon

    mask = horizon.mask(latitude_deg, longitude_deg, height_m)
    observer = ephemeris.make_observer(latitude_deg, longitude_deg, mask.site_height_m + height_m)
    begin, finish = ephemeris.et(start), ephemeris.et(end)
    first, last = begin - 3600.0, finish + 3600.0
    still = [*observer.position_km, 0.0, 0.0, 0.0]
    windows: dict[str, list[tuple[float, float]]] = {}
    # The meta-kernel names its kernels relative to its own folder, and loading or unloading
    # a kernel may make SPICE reopen them, so this runs from there, as ephemeris._load does.
    previous = Path.cwd()
    with ephemeris._LOCK, tempfile.TemporaryDirectory() as folder:
        path = str(Path(folder) / "observer.bsp")
        os.chdir(ephemeris.meta_path().resolve().parent)
        try:
            handle = spice.spkopn(path, "observer", 0)
            spice.spkw08(
                handle, OBSERVER_ID, 301, "MOON_ME", first, last, "point", 1, 2,
                [still, still], first, last - first,
            )  # fmt: skip
            spice.spkcls(handle)
            spice.furnsh(path)
            try:
                for kind in ("ANY", "FULL"):
                    window = spice.cell_double(2)
                    spice.wninsd(begin, finish, window)
                    result = spice.cell_double(200)
                    spice.gfoclt(
                        kind, "EARTH", "ELLIPSOID", "IAU_EARTH", "SUN", "ELLIPSOID", "IAU_SUN",
                        "LT", str(OBSERVER_ID), SCAN_STEP.total_seconds(), window, result,
                    )  # fmt: skip
                    count = spice.wncard(result)
                    windows[kind] = [spice.wnfetd(result, i) for i in range(count)]
            finally:
                spice.unload(path)
        finally:
            os.chdir(previous)
    if len(windows["ANY"]) != 1 or len(windows["FULL"]) != 1:
        raise ValueError(f"gfoclt found {windows}")
    (c1, c4), (c2, c3) = windows["ANY"][0], windows["FULL"][0]
    return {name: utc(et) for name, et in zip(athena.CONTACTS, (c1, c2, c3, c4), strict=True)}


def utc(et: float) -> datetime:
    import spiceypy as spice

    from app import ephemeris

    with ephemeris._LOCK:
        text = spice.et2utc(et, "ISOC", 3)
    return datetime.fromisoformat(text + "+00:00")


def differences_s(ours: dict[str, datetime], theirs: dict[str, datetime]) -> dict[str, float]:
    return {name: (ours[name] - theirs[name]).total_seconds() for name in athena.CONTACTS}


def largest_s(differences: dict[str, float]) -> float:
    return max(abs(value) for value in differences.values())


def stamp(instant: datetime) -> str:
    """An instant to the tenth of a second, in UTC."""
    return f"{instant:%Y-%m-%d %H:%M:%S}.{instant.microsecond // 100_000}"
