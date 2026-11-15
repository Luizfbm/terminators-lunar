from __future__ import annotations

import json
import math
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import proof

# Fixed scientific tolerance defined before examining results (per LUI-23 specification)
TOLERANCE_DEG: float = 0.02

SCRIPT = "validation/test_horizons.py"
REFERENCE = "JPL Horizons, surface observer (coord@301, 2 m, airless) at 6 Sites south of 80°S, 300 instants 2025-2032"
TOL_TEXT = proof.text("≤ 0.02°", "≤ 0,02°")
TERRAIN = proof.text(
    "Sky position only, run without terrain: relief, DEM error and the Sun's disc are not part of this check.",
    "Só posição no céu, rodada sem terreno: relevo, erro do DEM e o disco do Sol não entram nesta checagem.",
)
proof.declare(
    "horizons-sun-azel",
    title=proof.text(
        "Sun azimuth and elevation vs JPL Horizons",
        "Azimute e elevação do Sol contra o JPL Horizons",
    ),
    reference=REFERENCE,
    tolerance=TOL_TEXT,
    not_covered=TERRAIN,
    script_path=SCRIPT,
)
proof.declare(
    "horizons-earth-azel",
    title=proof.text(
        "Earth azimuth and elevation vs JPL Horizons",
        "Azimute e elevação da Terra contra o JPL Horizons",
    ),
    reference=REFERENCE,
    tolerance=TOL_TEXT,
    not_covered=TERRAIN,
    script_path=SCRIPT,
)
proof.declare(
    "negative-control-time-shift",
    title=proof.text(
        "Negative control: 10 min shift", "Controle negativo: deslocamento de 10 min"
    ),
    reference="The Horizons Sun check with the backend asked 10 minutes later",
    tolerance=proof.text("must exceed 0.02°", "tem que passar de 0,02°"),
    not_covered=proof.text(
        "Only shows the check is sensitive to time.",
        "Só mostra que a checagem é sensível ao tempo.",
    ),
    script_path=SCRIPT,
)
proof.declare(
    "negative-control-longitude-shift",
    title=proof.text(
        "Negative control: longitude shift",
        "Controle negativo: deslocamento de longitude",
    ),
    reference="The Horizons Sun check with the Site moved 0.01° and 0.03° in longitude",
    tolerance=proof.text(
        "0.01° detected (≥ 0.009°), 0.03° exceeds 0.02°",
        "0,01° detectado (≥ 0,009°), 0,03° passa de 0,02°",
    ),
    not_covered=proof.text(
        "Only shows the check is sensitive to position.",
        "Só mostra que a checagem é sensível à posição.",
    ),
    script_path=SCRIPT,
)

REFERENCE_FILE = Path(__file__).resolve().parent / "data" / "horizons_reference.json"


def load_reference_data() -> dict[str, Any]:
    with open(REFERENCE_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def calculate_angular_separation_deg(
    az1_deg: float, el1_deg: float, az2_deg: float, el2_deg: float
) -> float:
    """Great-circle angular separation between two horizontal coordinates (az, el)."""
    az1, el1 = math.radians(az1_deg), math.radians(el1_deg)
    az2, el2 = math.radians(az2_deg), math.radians(el2_deg)
    cos_sep = math.sin(el1) * math.sin(el2) + math.cos(el1) * math.cos(el2) * math.cos(
        az1 - az2
    )
    return math.degrees(math.acos(min(1.0, max(-1.0, cos_sep))))


def get_backend_sample(
    client: Any, site: dict[str, Any], instant_iso: str
) -> dict[str, Any]:
    """
    Query the backend HTTP API /visibility for a 15-minute window starting at instant_iso.
    Returns the timeline sample matching instant_iso.
    """
    if site["id"] == "001":
        params: dict[str, Any] = {
            "site_id": "001",
            "start": instant_iso,
            "duration_hours": 0.25,
        }
    else:
        params = {
            "latitude_deg": site["latitude_deg"],
            "longitude_deg": site["longitude_deg"],
            "start": instant_iso,
            "duration_hours": 0.25,
        }

    response = client.get("/visibility", params=params)
    assert response.status_code == 200, (
        f"Backend returned {response.status_code}: {response.text}"
    )
    data = response.json()
    samples = data["timeline"]["samples"]
    assert len(samples) > 0, "No timeline samples returned"

    # The first sample must be the requested instant; a silent fallback to another
    # sample would compare positions at the wrong time.
    first = samples[0]
    assert first["t"] == instant_iso, (
        f"first sample is {first['t']}, asked for {instant_iso}"
    )
    return dict(first)


def _check_body(client: Any, body: str, validation_id: str) -> None:
    """Compare one body over every Site and instant, record the worst error, then assert.

    Near the pole the Sun stays within about ±1.8° of the horizon and the Earth within
    about ±8°, so the sky azimuth error (raw × cos el) and the raw one are almost equal;
    both are reported.
    """
    ref_data = load_reference_data()
    worst: dict[str, tuple[float, str, str]] = {}
    sums: dict[str, float] = {}
    count = 0

    for site in ref_data["sites"]:
        for obs in site["observations"]:
            t_iso = obs["time_utc"]
            sample = get_backend_sample(client, site, t_iso)
            pred_az = sample[body]["azimuth_deg"]
            pred_el = sample[body]["elevation_deg"]
            ref_az = obs[body]["azimuth_deg"]
            ref_el = obs[body]["elevation_deg"]

            raw_daz = abs((pred_az - ref_az + 180.0) % 360.0 - 180.0)
            errors = {
                "raw_az": raw_daz,
                "sky_az": raw_daz * math.cos(math.radians(ref_el)),
                "el": abs(pred_el - ref_el),
                "total": calculate_angular_separation_deg(
                    pred_az, pred_el, ref_az, ref_el
                ),
            }
            count += 1
            for name, value in errors.items():
                sums[name] = sums.get(name, 0.0) + value * value
                if name not in worst or value > worst[name][0]:
                    worst[name] = (value, site["id"], t_iso)

    rms = {name: math.sqrt(total / count) for name, total in sums.items()}
    print(f"\n{body.upper()} vs JPL Horizons ({count} evaluations):")
    for name in ("sky_az", "raw_az", "el", "total"):
        value, site_id, t_iso = worst[name]
        print(
            f"  {name:7s} max {value:.6f}° (Site {site_id}, {t_iso}), RMS {rms[name]:.6f}°"
        )

    # The check fails on the worst of azimuth (raw) and elevation, as in the spec.
    gate = max(("raw_az", "el"), key=lambda name: worst[name][0])
    max_err, site_id, t_iso = worst[gate]
    passed = max_err <= TOLERANCE_DEG
    en, pt = proof.deg(worst["total"][0])
    gate_en, gate_pt = proof.deg(max_err)
    proof.record(
        validation_id,
        "passed" if passed else "failed",
        proof.text(
            f"max error {gate_en} over {count} instants (angular separation {en})"
            + ("" if passed else f", worst at Site {site_id} {t_iso}"),
            f"erro máximo de {gate_pt} em {count} instantes (separação angular {pt})"
            + ("" if passed else f", pior no Site {site_id} em {t_iso}"),
        ),
    )
    assert passed, (
        f"{body} {gate} error {max_err:.6f}° exceeds {TOLERANCE_DEG}° at Site {site_id} {t_iso}"
    )


@proof.check("horizons-sun-azel")
def test_sun_position_against_jpl_horizons(test_client: Any) -> None:
    _check_body(test_client, "sun", "horizons-sun-azel")


@proof.check("horizons-earth-azel")
def test_earth_position_against_jpl_horizons(test_client: Any) -> None:
    _check_body(test_client, "earth", "horizons-earth-azel")


@proof.check("negative-control-time-shift")
def test_negative_control_time_shift(test_client: Any) -> None:
    """
    Negative control 1:
    Shifting evaluation time by 10 minutes must break the 0.02° tolerance.
    The Moon's rotation moves the Sun by ~0.085° in 10 minutes, so this shift
    must cause errors exceeding 0.02°.
    """
    ref_data = load_reference_data()
    errors: list[float] = []

    # Test on a representative subset of observations
    for site in ref_data["sites"]:
        for obs in site["observations"][::5]:
            t_dt = datetime.strptime(obs["time_utc"], "%Y-%m-%dT%H:%M:%SZ")
            t_shifted_iso = (t_dt + timedelta(minutes=10)).strftime(
                "%Y-%m-%dT%H:%M:%SZ"
            )

            sample = get_backend_sample(test_client, site, t_shifted_iso)
            pred_az = sample["sun"]["azimuth_deg"]
            pred_el = sample["sun"]["elevation_deg"]
            ref_az = obs["sun"]["azimuth_deg"]
            ref_el = obs["sun"]["elevation_deg"]

            total_sep = calculate_angular_separation_deg(
                pred_az, pred_el, ref_az, ref_el
            )
            errors.append(total_sep)

    max_error = max(errors)
    en, pt = proof.deg(max_error, 3)
    broke = max_error > TOLERANCE_DEG
    proof.record(
        "negative-control-time-shift",
        "passed" if broke else "failed",
        proof.text(f"failed as expected ({en})", f"falhou como esperado ({pt})")
        if broke
        else proof.text(
            f"did not break the check ({en})", f"não quebrou a checagem ({pt})"
        ),
    )
    assert max_error > TOLERANCE_DEG, (
        f"Negative control failed: 10-minute time shift max error ({max_error:.6f}°) did not exceed {TOLERANCE_DEG}°"
    )


@proof.check("negative-control-longitude-shift")
def test_negative_control_longitude_shift(test_client: Any) -> None:
    """
    Negative control 2:
    Shifting site longitude by 0.01° shifts the local topocentric azimuth frame by 0.010°.
    When compared against the reference position with a sensitivity threshold corresponding
    to the injected perturbation, the difference must be clearly detectable.
    If assessed against 0.02°, a perturbation of 0.03° is also asserted to confirm that
    any coordinate shift exceeding tolerance reliably breaks the test.
    """
    ref_data = load_reference_data()
    errors_001: list[float] = []
    errors_003: list[float] = []

    for site in ref_data["sites"]:
        for obs in site["observations"][::5]:
            t_iso = obs["time_utc"]

            # Query with +0.01° longitude perturbation
            params_001 = {
                "latitude_deg": site["latitude_deg"],
                "longitude_deg": site["longitude_deg"] + 0.01,
                "start": t_iso,
                "duration_hours": 0.25,
            }
            res_001 = test_client.get("/visibility", params=params_001)
            assert res_001.status_code == 200
            s_001 = res_001.json()["timeline"]["samples"][0]
            sep_001 = calculate_angular_separation_deg(
                s_001["sun"]["azimuth_deg"],
                s_001["sun"]["elevation_deg"],
                obs["sun"]["azimuth_deg"],
                obs["sun"]["elevation_deg"],
            )
            errors_001.append(sep_001)

            # Query with +0.03° longitude perturbation (> TOLERANCE_DEG)
            params_003 = {
                "latitude_deg": site["latitude_deg"],
                "longitude_deg": site["longitude_deg"] + 0.03,
                "start": t_iso,
                "duration_hours": 0.25,
            }
            res_003 = test_client.get("/visibility", params=params_003)
            assert res_003.status_code == 200
            s_003 = res_003.json()["timeline"]["samples"][0]
            sep_003 = calculate_angular_separation_deg(
                s_003["sun"]["azimuth_deg"],
                s_003["sun"]["elevation_deg"],
                obs["sun"]["azimuth_deg"],
                obs["sun"]["elevation_deg"],
            )
            errors_003.append(sep_003)

    e1_en, e1_pt = proof.deg(max(errors_001), 4)
    e3_en, e3_pt = proof.deg(max(errors_003), 4)
    ok = max(errors_001) >= 0.009 and max(errors_003) > TOLERANCE_DEG
    proof.record(
        "negative-control-longitude-shift",
        "passed" if ok else "failed",
        proof.text(
            f"0.01° shift moved the Sun {e1_en}, 0.03° shift {e3_en}"
            + (" (as expected)" if ok else " (not sensitive enough)"),
            f"deslocamento de 0,01° moveu o Sol {e1_pt}, de 0,03° moveu {e3_pt}"
            + (" (como esperado)" if ok else " (pouco sensível)"),
        ),
    )

    # 0.01° perturbation produces ~0.010° error; detectable above machine precision
    assert max(errors_001) >= 0.009, (
        f"0.01° longitude perturbation was not detected: max error was {max(errors_001):.6f}°"
    )

    # 0.03° perturbation strictly exceeds the 0.02° tolerance
    assert max(errors_003) > TOLERANCE_DEG, (
        f"0.03° longitude perturbation ({max(errors_003):.6f}°) did not exceed {TOLERANCE_DEG}°"
    )
