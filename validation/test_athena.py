"""The IM-2 Athena checks from Larissa's independent work (the requirement).

The points, instants and tolerances are in athena.py and were written The
reference data comes from fetch_athena_refs.py. The LROC check runs here, through the HTTP
API: the Sun's place in the sky needs no DEM. The Horizon mask and the Earth over the
transmission need the full DEMs at the Athena point, so they come from
`data/athena_engine.json` (run_athena_engine.py, on the server); until that file is in the
repo those parts show as pending. A check that fails stays failed.
"""

from __future__ import annotations

import csv
import hashlib
import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import athena
import proof
import pytest

SCRIPT = "validation/test_athena.py"
DATA = Path(__file__).resolve().parent / "data"
LARISSA = DATA / "independent_athena_horizon.csv"
LARISSA_META = DATA / "independent_athena_horizon.json"
LROC = DATA / "lroc_athena.json"
ENGINE = DATA / "athena_engine.json"
PENDING_ENGINE = proof.text(
    "pending: needs validation/data/athena_engine.json from run_athena_engine.py on the "
    "server (the DEM fixtures stop 20 km from the pole)",
    "pendente: precisa de validation/data/athena_engine.json, do run_athena_engine.py no "
    "servidor (os DEMs de teste param a 20 km do polo)",
)

HORIZON_TOLERANCE = proof.text(
    f"per azimuth |ours − theirs| ≤ atan({athena.HEIGHT_ERROR_M:g} m / d) + "
    f"{athena.WALK_FLOOR_DEG:g}°, d their blocking distance; at least "
    f"{athena.MIN_SHARE_WITHIN:.0%} of our 720 azimuths within it and RMS ≤ "
    f"{athena.RMS_MAX_DEG:g}°. 1 m: the adjusted LOLA maps' 0.3–0.5 m RMS (Barker et al. 2021) "
    "and the unadjusted map's ~0.5 m radial orbit error (Mazarico et al. 2018), in "
    "quadrature. Fixed before evaluating the comparison",
    f"por azimute |nosso − deles| ≤ atan({athena.HEIGHT_ERROR_M:g} m / d) + "
    f"{athena.WALK_FLOOR_DEG:g}°".replace(".", ",")
    + ", d a distância de bloqueio deles; pelo menos 99% dos nossos 720 azimutes dentro disso "
    "e RMS ≤ 0,03°. 1 m: o RMS de 0,3–0,5 m dos mapas LOLA ajustados (Barker et al. 2021) e o "
    "erro radial de órbita de ~0,5 m do mapa não ajustado (Mazarico et al. 2018), em "
    "quadratura. Fixada antes de avaliar a comparação",
)
HORIZON_REFERENCE = (
    "An independent study by our group (the independent work, not merged): their terrain-only silhouette at "
    "the IM-2 Athena point (-84.7906°, 29.1957°, 2 m), their own code over LOLA "
    "LDEM_80S_20M + LDEM_75S_30M (GDR, 2017), data/independent_athena_horizon.csv "
    "(commit 5766403, SHA-256 d9cd6761…); ours over LDEM_80S_*_ADJ (Barker et al. 2023)"
)

proof.declare(
    "independent-athena-horizon",
    title=proof.text(
        "Horizon mask at IM-2 Athena, against our group's independent silhouette",
        "Máscara de horizonte no IM-2 Athena, contra a silhueta independente do nosso grupo",
    ),
    reference=HORIZON_REFERENCE,
    tolerance=HORIZON_TOLERANCE,
    not_covered=proof.text(
        "Both sides are LOLA altimetry, so errors common to LOLA don't show. Athena tipped "
        "over in a crater about 20 m across, smaller than either DEM. Their rays start 40 m out, "
        "so an Occluder closer than that would show on our side only.",
        "Os dois lados são altimetria do LOLA, então erros comuns ao LOLA não aparecem. O "
        "Athena tombou numa cratera de uns 20 m, menor que os dois DEMs. Os raios deles começam "
        "a 40 m, então um Occluder mais perto que isso só apareceria do nosso lado.",
    ),
    script_path=SCRIPT,
)
proof.declare(
    "negative-control-independent-horizon-rotated",
    title=proof.text(
        "Negative control: our group's silhouette turned by 1°",
        "Controle negativo: a silhueta do nosso grupo girada 1°",
    ),
    reference="The Athena horizon check with their silhouette rotated by 1° in azimuth",
    tolerance=proof.text(
        "must break both conditions: under 99% of azimuths within and RMS above 0.03°",
        "precisa quebrar as duas condições: menos de 99% dos azimutes dentro e RMS acima de 0,03°",
    ),
    not_covered=proof.text(
        "Shows the check can fail; says nothing about the engine.",
        "Mostra que a checagem pode falhar; não diz nada sobre o motor.",
    ),
    script_path=SCRIPT,
)
proof.declare(
    "landing-im2-athena",
    title=proof.text("IM-2 Athena landing point", "Ponto de pouso do IM-2 Athena"),
    reference=(
        "LROC NAC M1495922531LE and M1496181900LE: incidence angle and image centre from the "
        "PDS index of volume LROLRC_0062C, mid-exposure from the image labels "
        "(NASA/GSFC/Arizona State University); LROC 1408 resting point (-84.7906°, 29.1957°); "
        "NASA 25-025: landed ~17:30 UTC 06/03/2025, transmission ended ~06:15 UTC 07/03/2025"
    ),
    tolerance=proof.text(
        f"incidence = 90° − our Sun elevation at the published image centre, within "
        f"{athena.INCIDENCE_TOLERANCE_DEG:g}° at both images (both published to 0.01°). The "
        "Earth over the transmission is reported as a fact, not judged",
        "incidência = 90° − nossa elevação do Sol no centro publicado da imagem, dentro de "
        "0,015° nas duas imagens (as duas publicadas com 0,01°). A Terra durante a transmissão "
        "é relatada como fato, não julgada",
    ),
    not_covered=proof.text(
        "The LROC part checks the ephemeris, not the terrain. Athena tipped over inside a "
        "crater about 20 m across, smaller than our 20 m DEM resolves, with its panels facing "
        "away from the Sun; the end of the mission was not a terrain Sunset, so there is no "
        "published time to compare.",
        "A parte da LROC confere a efeméride, não o relevo. O Athena tombou dentro de uma "
        "cratera de uns 20 m, menor do que o DEM de 20 m resolve, com os painéis de costas "
        "para o Sol; o fim da missão não foi um Sunset do relevo, então não há horário "
        "publicado para comparar.",
    ),
    script_path=SCRIPT,
)
proof.declare(
    "negative-control-lroc-article-times",
    title=proof.text(
        "Negative control: the LROC images at the times their articles give",
        "Controle negativo: as imagens da LROC nos horários dos artigos",
    ),
    reference=(
        "The LROC incidence check at the times written in LROC articles 1408 (16:54:21 "
        "07/03/2025) and 1409 (14:52 UTC 10/03/2025), which the image labels do not match"
    ),
    tolerance=proof.text(
        f"must exceed {athena.INCIDENCE_TOLERANCE_DEG:g}° at both images",
        "precisa passar de 0,015° nas duas imagens",
    ),
    not_covered=proof.text(
        "Shows the check is sensitive to the time; says nothing about the engine.",
        "Mostra que a checagem é sensível ao horário; não diz nada sobre o motor.",
    ),
    script_path=SCRIPT,
)


def pt(value: float, spec: str = "+.3f") -> str:
    return format(value, spec).replace(".", ",")


def lroc() -> dict[str, Any]:
    loaded: dict[str, Any] = json.loads(LROC.read_text("utf-8"))
    return loaded


def larissa() -> dict[float, tuple[float, float]]:
    """Her terrain-only silhouette: azimuth -> (elevation, blocking distance in km)."""
    lines = [line for line in LARISSA.read_text("utf-8").splitlines() if not line.startswith("#")]
    return {
        round(float(row["azimute_graus"]), 1): (
            float(row["elevacao_terreno_graus"]),
            float(row["distancia_bloqueio_km"]),
        )
        for row in csv.DictReader(lines)
    }


def label_time(stamp: str) -> datetime:
    return datetime.fromisoformat(stamp.replace(" ", "T") + "+00:00")


def engine_output(path: Path = ENGINE) -> dict[str, Any]:
    loaded: dict[str, Any] = json.loads(path.read_text("utf-8"))
    assert loaded["latitude_deg"] == athena.ATHENA_LATITUDE_DEG
    assert loaded["longitude_deg"] == athena.ATHENA_LONGITUDE_DEG
    assert loaded["observer_height_m"] == athena.OBSERVER_HEIGHT_M
    assert len(loaded["horizon"]) == 720 and loaded["dems"]
    assert loaded["transmission"]["start"] == "2025-03-06T17:30:00Z"
    assert loaded["transmission"]["end"] == "2025-03-07T06:15:00Z"
    return loaded


def engine_or_skip(validation_id: str) -> dict[str, Any]:
    if not ENGINE.exists():
        proof.record(validation_id, "pending", PENDING_ENGINE)
        pytest.skip("no engine output yet: run run_athena_engine.py on the server")
    return engine_output()


def our_horizon(output: dict[str, Any]) -> dict[float, float]:
    return {s["azimuth_deg"]: s["elevation_deg"] for s in output["horizon"]}


def sun_elevation(client: Any, latitude: float, longitude: float, instant: datetime) -> float:
    """Our Sun elevation at a point, through /visibility, at an instant to the second."""
    start = instant.replace(microsecond=0) + timedelta(seconds=round(instant.microsecond / 1e6))
    stamp = start.strftime("%Y-%m-%dT%H:%M:%SZ")
    params = {"latitude_deg": latitude, "longitude_deg": longitude, "start": stamp}
    response = client.get("/visibility", params={**params, "duration_hours": 0.25})
    assert response.status_code == 200, response.text
    first = response.json()["timeline"]["samples"][0]
    assert first["t"] == stamp
    return float(first["sun"]["elevation_deg"])


def incidence_differences(client: Any, times: dict[str, datetime]) -> dict[str, float]:
    """Ours − LROC's incidence at each image centre, at the given times."""
    out = {}
    for product, image in lroc()["images"].items():
        lat, lon = image["center_latitude_deg"], image["center_longitude_deg"]
        ours = 90.0 - sun_elevation(client, lat, lon, times[product])
        out[product] = ours - image["incidence_deg"]
    return out


# --- The reference data is what its provenance says ------------------------------------------


def test_larissa_file_is_her_file_from_the_branch() -> None:
    meta = json.loads(LARISSA_META.read_text("utf-8"))
    assert hashlib.sha256(LARISSA.read_bytes()).hexdigest() == meta["sha256"]
    lines = LARISSA.read_text("utf-8").splitlines()
    assert [line.startswith("#") for line in lines[:5]] == [True] * 4 + [False]
    assert len(lines) == 3605
    silhouette = larissa()
    assert len(silhouette) == 3600
    assert all(round(i * 0.5, 1) in silhouette for i in range(720))


def test_lroc_values_are_the_index_rows() -> None:
    data = lroc()
    columns = data["index_columns"]
    for product in athena.LROC_IMAGES:
        image = data["images"][product]
        row = image["index_row"]
        assert hashlib.sha256(row.encode("ascii")).hexdigest() == image["index_row_sha256"]

        def column(name: str, r: str = row) -> str:
            start, size = columns[name]
            return r[start - 1 : start - 1 + size].strip().strip('"')

        assert column("PRODUCT_ID") == product
        assert float(column("INCIDENCE_ANGLE")) == image["incidence_deg"]
        assert float(column("CENTER_LATITUDE")) == image["center_latitude_deg"]
        assert float(column("CENTER_LONGITUDE")) == image["center_longitude_deg"]
        # The index and the image label agree on the exposure, and athena.py's
        # mid-exposure is halfway through it.
        start, stop = label_time(image["label_start_time"]), label_time(image["label_stop_time"])
        assert (start, stop) == (label_time(image["start_time"]), label_time(image["stop_time"]))
        assert athena.LROC_MID_EXPOSURE[product] == start + (stop - start) / 2


def test_horizon_comparison_arithmetic() -> None:
    ours = {0.0: 1.0, 0.5: 2.0, 1.0: 3.0}
    theirs = {0.0: (1.0, 1.0), 0.5: (2.1, 1.0), 1.0: (3.0, 1.0), 1.5: (9.0, 1.0)}
    summary = athena.compare_horizon(ours, theirs)
    assert summary["largest_deg"] == pytest.approx(-0.1) and summary["largest_at_deg"] == 0.5
    assert summary["rms_deg"] == pytest.approx((0.01 / 3) ** 0.5)
    # 1 m at 1 km is 0.0573°, plus 0.01°: 0.1° off is outside, the other two inside.
    assert athena.horizon_tolerance_deg(1.0) == pytest.approx(0.0673, abs=1e-4)
    assert summary["share_within"] == pytest.approx(2 / 3)
    rotated = athena.compare_horizon(ours, theirs, rotation_deg=0.5)
    assert rotated["largest_deg"] == pytest.approx(-6.0)


def test_the_server_runner_writes_what_the_checks_read(tmp_path: Path) -> None:
    """The runner, at a fixture point instead of Athena, gives an output the checks accept."""
    import run_athena_engine

    point = athena.ECLIPSE_FIXTURE
    output = run_athena_engine.compute(point["latitude_deg"], point["longitude_deg"])
    output.update(
        latitude_deg=athena.ATHENA_LATITUDE_DEG, longitude_deg=athena.ATHENA_LONGITUDE_DEG
    )
    path = tmp_path / "athena_engine.json"
    path.write_text(json.dumps(output), "utf-8")
    loaded = engine_output(path)
    assert set(our_horizon(loaded)) == {i * 0.5 for i in range(720)}
    assert set(loaded["images"]) == set(athena.LROC_IMAGES)
    assert loaded["transmission"]["steps"] == 766
    assert set(loaded["eclipse"]["engine"]) == set(athena.CONTACTS)


# --- The Proof entries -------------------------------------------------------------------------


@proof.check("independent-athena-horizon")
def test_our_horizon_against_larissa() -> None:
    output = engine_or_skip("independent-athena-horizon")
    s = athena.compare_horizon(our_horizon(output), larissa())
    proof.record(
        "independent-athena-horizon",
        "passed" if s["passed"] else "failed",
        proof.text(
            f"{s['share_within']:.1%} of {s['azimuths']} azimuths within; ours − theirs: mean "
            f"{s['mean_deg']:+.4f}°, RMS {s['rms_deg']:.4f}°, P95 {s['p95_deg']:.3f}°, largest "
            f"{s['largest_deg']:+.3f}° at {s['largest_at_deg']:g}° (their Occluder "
            f"{s['largest_distance_km']:.2f} km away)",
            f"{pt(100 * s['share_within'], '.1f')}% de {s['azimuths']} azimutes dentro; nosso − "
            f"deles: média {pt(s['mean_deg'], '+.4f')}°, RMS {pt(s['rms_deg'], '.4f')}°, P95 "
            f"{pt(s['p95_deg'], '.3f')}°, maior {pt(s['largest_deg'])}° em "
            f"{pt(s['largest_at_deg'], 'g')}° (Occluder deles a "
            f"{pt(s['largest_distance_km'], '.2f')} km)",
        ),
    )
    assert s["passed"], s


@proof.check("negative-control-independent-horizon-rotated")
def test_her_silhouette_turned_by_one_degree_breaks_the_check() -> None:
    output = engine_or_skip("negative-control-independent-horizon-rotated")
    s = athena.compare_horizon(our_horizon(output), larissa(), athena.CONTROL_ROTATION_DEG)
    en = f"{s['share_within']:.1%} within, RMS {s['rms_deg']:.3f}°"
    pt_text = f"{pt(100 * s['share_within'], '.1f')}% dentro, RMS {pt(s['rms_deg'], '.3f')}°"
    proof.record(
        "negative-control-independent-horizon-rotated",
        "passed" if s["broke_both"] else "failed",
        proof.text(f"broke both conditions ({en})", f"quebrou as duas condições ({pt_text})")
        if s["broke_both"]
        else proof.text(f"did not break both ({en})", f"não quebrou as duas ({pt_text})"),
    )
    assert s["broke_both"], s


@proof.check("landing-im2-athena")
def test_the_sun_at_the_lroc_images(test_client: Any) -> None:
    differences = incidence_differences(test_client, athena.LROC_MID_EXPOSURE)
    passed = all(abs(d) <= athena.INCIDENCE_TOLERANCE_DEG for d in differences.values())
    en = ", ".join(f"{p} {d:+.4f}°" for p, d in differences.items())
    pt_text = ", ".join(f"{p} {pt(d, '+.4f')}°" for p, d in differences.items())
    en = f"incidence, ours − LROC: {en}."
    pt_text = f"incidência, nossa − LROC: {pt_text}."
    if ENGINE.exists():
        output = engine_output()
        low = output["transmission"]["lowest"]
        fractions = [output["images"][p]["sun_fraction"] for p in athena.LROC_IMAGES]
        en += (
            f" Fact, not judged: over the transmission our mask keeps the Earth's centre at "
            f"least {low['margin_deg']:.1f}° above the horizon ({low['t']}). Shown for "
            f"information: Sun fraction at the resting point "
            f"{fractions[0]:.2f} and {fractions[1]:.2f} at the two images; the photos show the "
            f"site lit."
        )
        pt_text += (
            f" Fato, não julgado: durante a transmissão nossa máscara mantém o centro da Terra "
            f"pelo menos {pt(low['margin_deg'], '.1f')}° acima do horizonte ({low['t']}). Só "
            f"como informação: fração do Sol no ponto final {pt(fractions[0], '.2f')} e "
            f"{pt(fractions[1], '.2f')} nas duas imagens; as fotos mostram o local iluminado."
        )
    else:
        en += f" The Earth over the transmission is {PENDING_ENGINE['en']}."
        pt_text += f" A Terra durante a transmissão está {PENDING_ENGINE['pt']}."
    proof.record("landing-im2-athena", "passed" if passed else "failed", proof.text(en, pt_text))
    assert passed, differences


@proof.check("negative-control-lroc-article-times")
def test_the_article_times_break_the_lroc_check(test_client: Any) -> None:
    times = {
        p: datetime.fromisoformat(image["article"]["time_utc"])
        for p, image in lroc()["images"].items()
    }
    differences = incidence_differences(test_client, times)
    broke = all(abs(d) > athena.INCIDENCE_TOLERANCE_DEG for d in differences.values())
    en = ", ".join(f"{p} {d:+.3f}°" for p, d in differences.items())
    pt_text = ", ".join(f"{p} {pt(d)}°" for p, d in differences.items())
    proof.record(
        "negative-control-lroc-article-times",
        "passed" if broke else "failed",
        proof.text(
            f"broke the check at both images ({en})", f"quebrou nas duas imagens ({pt_text})"
        )
        if broke
        else proof.text(f"did not break it at both ({en})", f"não quebrou nas duas ({pt_text})"),
    )
    assert broke, differences
