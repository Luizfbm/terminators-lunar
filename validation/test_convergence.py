"""Convergence of the Horizon mask: does the sampling step change the answer?

The mask is computed twice for every Curated Site the DEM fixtures cover, at 2 m: with the
engine's steps (720 rays, half a pixel along each ray) and with half the step in both (1440
rays, a quarter of a pixel). The two are compared at the 720 azimuths they share, and the
metric is the largest absolute difference in the mask's elevation, in degrees. Tolerance
fixed by Luiz on 15/11/2026, before the first run: 0.01°. If it fails, it stays failed with
its number; neither the tolerance nor the steps are touched for it to pass.

The negative control runs the same comparison with a step four times coarser than the
engine's, in both. It has to go past 0.01°, or the check could not have failed.

The finer step is only this check's: it calls horizon._compute with `step_scale`, whose
default of 1.0 is the engine's answer to the bit (test_regressions.py).
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import cache

import numpy as np
import numpy.typing as npt
import proof
import pytest

SCRIPT = "validation/test_convergence.py"
TOLERANCE_DEG = 0.01
OBSERVER_HEIGHT_M = 2.0
FINER = 0.5
COARSER = 4.0

REFERENCE = (
    "The engine itself, at two sampling steps. Horizon mask at {height:g} m over the nested "
    "PGDA DEMs, for every Curated Site the DEM fixtures cover, with the engine's steps "
    "(0.5° between rays, half a pixel along each ray) and with {factor}, compared at the "
    "azimuths both masks have; the largest absolute difference in elevation"
)
TOLERANCE = proof.text(
    f"largest difference ≤ {TOLERANCE_DEG:g}° at the shared azimuths, at half the step",
    f"maior diferença ≤ {TOLERANCE_DEG:g}° nos azimutes em comum, com metade do passo".replace(
        ".", ","
    ),
)
NOT_COVERED = proof.text(
    "Says nothing about the DEM's own error: that is the Uncertainty band (ADR 0003). Each "
    "ray is computed on its own, so at the azimuths two masks share, the step between rays "
    "cannot move the number; what it checks is the step along the ray and the peak zoom. "
    "What the step between rays does between two rays, where the engine reads the mask "
    "linearly, is shown in the result for information and is not judged. Only Sites inside "
    "the DEM fixtures, at an Observer height of 2 m.",
    "Não diz nada sobre o erro do próprio DEM: isso é a faixa de incerteza (ADR 0003). Cada "
    "raio é calculado sozinho, então nos azimutes que as duas máscaras têm em comum o passo "
    "entre raios não consegue mexer no número; o que se checa é o passo ao longo do raio e o "
    "zoom nos picos. O que o passo entre raios faz entre dois raios, onde o motor lê a "
    "máscara de forma linear, aparece no resultado só como informação e não é julgado. Só "
    "Sites dentro das janelas de DEM das fixtures, com Observer a 2 m.",
)

proof.declare(
    "horizon-convergence",
    title=proof.text(
        "Horizon mask at half the sampling step: the largest change in elevation",
        "Máscara do horizonte com metade do passo de amostragem: a maior mudança na elevação",
    ),
    reference=REFERENCE.format(
        height=OBSERVER_HEIGHT_M, factor="half the step in both (0.25°, a quarter of a pixel)"
    ),
    tolerance=TOLERANCE,
    not_covered=NOT_COVERED,
    script_path=SCRIPT,
)
proof.declare(
    "negative-control-horizon-convergence",
    title=proof.text(
        "Negative control: the same comparison with a step four times coarser",
        "Controle negativo: a mesma comparação com um passo quatro vezes mais grosso",
    ),
    reference=REFERENCE.format(
        height=OBSERVER_HEIGHT_M, factor="four times the step in both (2°, two pixels)"
    ),
    tolerance=proof.text(
        f"must exceed {TOLERANCE_DEG:g}°", f"tem que passar de {TOLERANCE_DEG:g}°".replace(".", ",")
    ),
    not_covered=proof.text(
        "Only shows that the check can fail when the sampling is too coarse.",
        "Só mostra que a checagem consegue falhar quando a amostragem é grossa demais.",
    ),
    script_path=SCRIPT,
)


def comma(value: float) -> str:
    return f"{value:g}".replace(".", ",")


@dataclass(frozen=True)
class Masks:
    site_id: str
    elevations: dict[float, npt.NDArray[np.float64]]


def covered_sites() -> list[tuple[str, float, float]]:
    """The Curated Sites whose rays the DEM fixtures hold, the polar ladder's way."""
    from app import catalog, horizon

    found = []
    for site in catalog.SITES:
        folder, bands = horizon.bands_for(site["latitude_deg"], site["longitude_deg"], None)
        lat, lon = horizon._placed(site["latitude_deg"], site["longitude_deg"])
        if horizon._covers(folder, bands, lat, lon):
            found.append((site["id"], lat, lon))
    return found


@cache
def masks() -> list[Masks]:
    """Every covered Site's mask at the engine's step, at half of it and at four times it."""
    from app import horizon

    sites = covered_sites()
    if not sites:
        pytest.skip("no DEM fixtures here: fetch them (fixtures/dem/fetch.sh)")
    out = []
    for site_id, lat, lon in sites:
        folder, bands = horizon.bands_for(lat, lon, None)
        out.append(
            Masks(
                site_id,
                {
                    scale: horizon._compute(
                        str(folder), bands, lat, lon, OBSERVER_HEIGHT_M, {}, step_scale=scale
                    ).elevations_deg
                    for scale in (1.0, FINER, COARSER)
                },
            )
        )
    return out


def largest_difference(scale: float) -> tuple[float, str, float, int]:
    """The largest |mask at `scale` − mask at the engine's step| over the shared azimuths.

    Returns the difference in degrees, the Site and azimuth it is at, and how many
    comparisons were made. Rays leave the same azimuths whatever the step, so the shared
    ones are every n-th ray of the finer mask.
    """
    worst = (-1.0, "", 0.0)
    compared = 0
    for found in masks():
        base = found.elevations[1.0]
        other = found.elevations[scale]
        fine, coarse = (other, base) if len(other) > len(base) else (base, other)
        shared = fine[:: len(fine) // len(coarse)]
        assert len(shared) == len(coarse)
        gap = np.abs(shared - coarse)
        compared += len(gap)
        at = int(gap.argmax())
        if gap[at] > worst[0]:
            azimuth = at * 360.0 / len(coarse)
            worst = (float(gap[at]), found.site_id, azimuth)
    return worst[0], worst[1], worst[2], compared


def between_rays() -> tuple[float, str, float]:
    """For information: the engine's mask read linearly halfway between two rays, against
    the finer step's own ray there. The engine reads the mask that way (`Mask.elevation_at`)."""
    worst = (-1.0, "", 0.0)
    for found in masks():
        base = found.elevations[1.0]
        fine = found.elevations[FINER]
        halfway = fine[1::2]
        linear = (base + np.roll(base, -1)) / 2.0
        gap = np.abs(halfway - linear)
        at = int(gap.argmax())
        if gap[at] > worst[0]:
            worst = (float(gap[at]), found.site_id, at * 0.5 + 0.25)
    return worst


def test_the_connecting_ridge_is_among_the_sites_checked() -> None:
    assert "001" in {found.site_id for found in masks()}
    assert len(masks()) >= 2


@proof.check("horizon-convergence")
def test_half_the_sampling_step_does_not_move_the_horizon_mask() -> None:
    worst, site_id, azimuth, compared = largest_difference(FINER)
    between, between_site, between_azimuth = between_rays()
    passed = worst <= TOLERANCE_DEG
    en, pt = proof.deg(worst, 5)
    info_en, info_pt = proof.deg(between, 3)
    sites = len(masks())
    proof.record(
        "horizon-convergence",
        "passed" if passed else "failed",
        proof.text(
            f"largest difference {en} (Site {site_id}, azimuth {azimuth:g}°) over {sites} Sites "
            f"({compared} comparisons); for information, halfway between two rays the engine's "
            f"linear reading differs by up to {info_en} (Site {between_site}, "
            f"azimuth {between_azimuth:g}°)",
            f"maior diferença de {pt} (Site {site_id}, azimute {comma(azimuth)}°) em {sites} "
            f"Sites ({compared} comparações); só como informação, no meio de dois raios a leitura "
            f"linear do motor difere em até {info_pt} (Site {between_site}, azimute "
            f"{comma(between_azimuth)}°)",
        ),
    )
    print(
        f"\nhorizon convergence: largest difference {worst:.5f}° (Site {site_id}, azimuth "
        f"{azimuth:g}°) over {sites} Sites, tolerance {TOLERANCE_DEG:g}°: "
        f"{'PASS' if passed else 'FAIL'}"
    )
    assert passed, (
        f"the mask moved {worst:.5f}° at half the step (Site {site_id}, azimuth {azimuth:g}°), "
        f"over {TOLERANCE_DEG}°"
    )


@proof.check("negative-control-horizon-convergence")
def test_negative_control_a_step_four_times_coarser_moves_the_mask() -> None:
    worst, site_id, azimuth, _ = largest_difference(COARSER)
    failed_as_expected = worst > TOLERANCE_DEG
    en, pt = proof.deg(worst, 4)
    proof.record(
        "negative-control-horizon-convergence",
        "passed" if failed_as_expected else "failed",
        proof.text(
            f"failed as expected ({en} at Site {site_id}, azimuth {azimuth:g}°)",
            f"falhou como esperado ({pt} no Site {site_id}, azimute {comma(azimuth)}°)",
        )
        if failed_as_expected
        else proof.text(f"did not fail ({en})", f"não falhou ({pt})"),
    )
    print(
        f"\nnegative control (4x the step): {worst:.5f}° (Site {site_id}, azimuth {azimuth:g}°), "
        f"must exceed {TOLERANCE_DEG:g}°: {'failed as expected' if failed_as_expected else 'DID NOT FAIL'}"
    )
    assert failed_as_expected, (
        f"four times the step moved the mask only {worst:.5f}° (Site {site_id}, "
        f"azimuth {azimuth:g}°), not over {TOLERANCE_DEG}°"
    )
