"""The Uncertainty band contains the nominal answer at Site 001 (ADR 0006).

The nominal `/visibility` answer is one of the terrains the DEM's error allows, so it
should sit inside the 5th-95th percentile band of the clones around it, give or take the
engine's own resolution: one timeline step (15 min) for a time, and the 15 min of a
step for the hours of a metric. The tolerance and the expected result are written here
and in the Proof entry before the check is run, and are not changed to make it pass.

The fixtures have no per-pixel error rasters, so the clones are made from a uniform 0.5 m
error raster written on the fixture DEMs' grids: the upper end of the 0.3-0.5 m RMS height
uncertainty Barker et al. (2021) give for the adjusted LOLA maps. This checks the method
(clones, matching, percentiles, the route), not NASA's error maps, which production reads.
"""

from __future__ import annotations

import time
from collections.abc import Iterator
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import numpy as np
import proof
import pytest
import rasterio  # type: ignore[import-untyped]

from app import horizon

SCRIPT = "validation/test_uncertainty.py"
CONTAINS = "uncertainty-band-contains-nominal"
CONTROL = "negative-control-uncertainty-band-shifted"
SIGMA_M = 0.5
SITE = {"site_id": "001", "start": "2026-11-14T00:00:00Z"}
STEP = timedelta(minutes=15)
STEP_HOURS = 0.25
DURATION_HOURS = 708.73
HOUR_METRICS = ("sunlit_hours", "earth_visible_hours", "sun_and_earth_hours", "lcsp_hours")
METRICS = (*HOUR_METRICS, "mean_sun_fraction")
SHIFT = timedelta(hours=24)

proof.declare(
    CONTAINS,
    title=proof.text(
        "Uncertainty band contains the nominal answer at Site 001",
        "A faixa de incerteza contém a resposta nominal no Site 001",
    ),
    reference="The engine against itself: Site 001, default Window from 2026-11-14 (708.73 h), "
    "Observer 2 m, 32 clones of the fixture DEMs raised and lowered by a uniform 0.5 m error "
    "(the upper end of the 0.3-0.5 m RMS height uncertainty, Barker et al. 2021); the nominal "
    "/visibility answer is the reference",
    tolerance=proof.text(
        "every Event: nominal time within [earliest − 15 min, latest + 15 min], with the band "
        "present (at least half the clones have the Event); every metric (Sun-and-Earth time, "
        "sunlit hours, Earth-visible hours, LCSP): nominal within [low − 0.25 h, high + 0.25 h], "
        "mean Sun fraction within 0.25 h / 708.73 h. 15 min is the timeline step. Expected "
        "before running: passes. Fixed before evaluating",
        "cada Event: horário nominal dentro de [earliest − 15 min, latest + 15 min], com a faixa "
        "presente (pelo menos metade dos clones tem o Event); cada métrica (tempo com Sol e "
        "Terra, horas de Sol, horas de Terra visível, LCSP): nominal dentro de "
        "[low − 0,25 h, high + 0,25 h], fração média do Sol dentro de 0,25 h / 708,73 h. 15 min "
        "é o passo da linha do tempo. Esperado antes de rodar: passa. Fixada antes de avaliar",
    ),
    not_covered=proof.text(
        "The method, not NASA's error maps: CI has no per-pixel error rasters, so the clones use "
        "a uniform 0.5 m. Only pixel-scale height error is varied: no landing error, no "
        "resolution drop, nothing under a pixel (the IM-2 crater is below the finest DEM). A "
        "nominal answer inside its own band says the band agrees with it, not that the band is "
        "the true error.",
        "O método, não os mapas de erro da NASA: o CI não tem os rasters de erro por pixel, "
        "então os clones usam 0,5 m uniforme. Só o erro de altura na escala do pixel varia: sem "
        "erro de pouso, sem queda de resolução, nada abaixo de um pixel (a cratera do IM-2 é "
        "menor que o DEM mais fino). Uma resposta nominal dentro da própria faixa diz que a "
        "faixa concorda com ela, não que a faixa é o erro verdadeiro.",
    ),
    script_path=SCRIPT,
)
proof.declare(
    CONTROL,
    title=proof.text(
        "Negative control: the nominal Events moved 24 h",
        "Controle negativo: os Events nominais deslocados 24 h",
    ),
    reference="The same band against the nominal Event times moved 24 h later",
    tolerance=proof.text(
        "at least one Event must fall outside [earliest − 15 min, latest + 15 min]. Expected "
        "before running: outside",
        "pelo menos um Event tem que cair fora de [earliest − 15 min, latest + 15 min]. "
        "Esperado antes de rodar: fora",
    ),
    not_covered=proof.text(
        "Only shows the band is narrow enough for the check to tell a day's shift apart.",
        "Só mostra que a faixa é estreita o bastante para a checagem distinguir um deslocamento "
        "de um dia.",
    ),
    script_path=SCRIPT,
)


def write_errors(folder: Path) -> None:
    """The fixture DEMs, linked, each with an error raster of SIGMA_M on its own grid."""
    for band in horizon.LADDER:
        source = horizon.dem_dir() / f"{band.product}.TIF"
        (folder / source.name).symlink_to(source)
        with rasterio.open(source) as dem:
            profile = {
                **dem.profile,
                "dtype": "float32",
                "nodata": float("nan"),
                "compress": "deflate",
                "predictor": 3,
            }
            with rasterio.open(horizon.error_path(folder, band), "w", **profile) as err:
                err.write(np.full((dem.height, dem.width), SIGMA_M, dtype=np.float32), 1)


@pytest.fixture(scope="module")
def answers(
    test_client: Any, tmp_path_factory: pytest.TempPathFactory
) -> Iterator[tuple[dict[str, Any], dict[str, Any]]]:
    """The nominal answer and the band for Site 001, asked as the page asks."""
    folder = tmp_path_factory.mktemp("dem-with-errors")
    write_errors(folder)
    with pytest.MonkeyPatch.context() as patch:
        patch.setenv("LUNAR_DEM_DIR", str(folder))
        nominal = test_client.get("/visibility", params=SITE)
        assert nominal.status_code == 200, nominal.text
        deadline = time.monotonic() + 600
        while True:
            band = test_client.get("/visibility/uncertainty", params=SITE)
            if band.status_code == 200 or time.monotonic() > deadline:
                break
            assert band.status_code == 202, band.text
            time.sleep(0.5)
        assert band.status_code == 200, band.text
        yield nominal.json(), band.json()


def instant(text: str) -> datetime:
    return datetime.fromisoformat(text)


def seconds_outside(event: dict[str, Any], nominal_time: datetime) -> float | None:
    """How far a time is outside the band widened by one step; 0 inside, None if no band."""
    if "earliest" not in event:
        return None
    low = instant(event["earliest"]) - STEP
    high = instant(event["latest"]) + STEP
    return max(0.0, (low - nominal_time).total_seconds(), (nominal_time - high).total_seconds())


@proof.check(CONTAINS)
def test_the_band_contains_the_nominal_answer(
    answers: tuple[dict[str, Any], dict[str, Any]],
) -> None:
    nominal, band = answers
    assert band["clones"] == 32
    assert [e["type"] for e in band["events"]] == [e["type"] for e in nominal["events"]]
    gaps = [
        seconds_outside(event, instant(plain["t"]))
        for event, plain in zip(band["events"], nominal["events"], strict=True)
    ]
    widest = max(
        (instant(e["latest"]) - instant(e["earliest"])).total_seconds()
        for e in band["events"]
        if "earliest" in e
    )
    events_in = all(gap == 0.0 for gap in gaps)
    metric_gaps = {}
    for name in METRICS:
        tolerance = STEP_HOURS / DURATION_HOURS if name == "mean_sun_fraction" else STEP_HOURS
        low, high = band["metrics"][name]["low"], band["metrics"][name]["high"]
        value = nominal["metrics"][name]
        metric_gaps[name] = max(0.0, low - tolerance - value, value - high - tolerance)
    metrics_in = all(gap == 0.0 for gap in metric_gaps.values())
    passed = events_in and metrics_in
    count = len(gaps)
    worst = max([g for g in gaps if g is not None] + [0.0])
    proof.record(
        CONTAINS,
        "passed" if passed else "failed",
        proof.text(
            f"{sum(g == 0.0 for g in gaps)} of {count} Events and "
            f"{sum(g == 0.0 for g in metric_gaps.values())} of {len(METRICS)} metrics inside the "
            f"band; widest Event band {widest:.0f} s; nominal at most {worst:.0f} s outside",
            f"{sum(g == 0.0 for g in gaps)} de {count} Events e "
            f"{sum(g == 0.0 for g in metric_gaps.values())} de {len(METRICS)} métricas dentro da "
            f"faixa; maior faixa de Event {widest:.0f} s; nominal no máximo {worst:.0f} s fora",
        ),
    )
    assert passed, (gaps, metric_gaps)


@proof.check(CONTROL)
def test_the_band_does_not_contain_the_nominal_moved_a_day(
    answers: tuple[dict[str, Any], dict[str, Any]],
) -> None:
    nominal, band = answers
    outside = [
        gap
        for event, plain in zip(band["events"], nominal["events"], strict=True)
        if (gap := seconds_outside(event, instant(plain["t"]) + SHIFT)) is None or gap > 0.0
    ]
    passed = len(outside) >= 1
    proof.record(
        CONTROL,
        "passed" if passed else "failed",
        proof.text(
            f"outside as expected ({len(outside)} of {len(band['events'])} Events moved 24 h "
            "fall outside the band)",
            f"fora, como esperado ({len(outside)} de {len(band['events'])} Events deslocados "
            "24 h caem fora da faixa)",
        ),
    )
    assert passed
