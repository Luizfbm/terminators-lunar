"""The total lunar eclipse of 14/03/2025, local contacts (the requirement).

Runs offline at the `ECLIPSE_2025` fixture point (-89.4°, 90°, 2 m): our engine's four
contacts, bisected with engine.look_at, against SPICE `gfoclt` on the same kernels, and
inside NASA's whole-Moon contacts (Espenak) taken as intervals. The tolerance is argued in
athena.py and was written At the Athena point the same comparison runs on
the server (run_athena_engine.py) and is shown for information.
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

import athena
import eclipse
import proof
import pytest

SCRIPT = "validation/test_eclipse.py"
DATA = Path(__file__).resolve().parent / "data"
ESPENAK = DATA / "espenak_2025mar14.json"
ENGINE = DATA / "athena_engine.json"
POINT = athena.ECLIPSE_FIXTURE
HEIGHT = athena.OBSERVER_HEIGHT_M
SPAN = (athena.ECLIPSE_START, athena.ECLIPSE_END)

proof.declare(
    "eclipse-2025-local-contacts",
    title=proof.text(
        "The total lunar eclipse of 14/03/2025, seen from the Moon: when the Earth covers the Sun",
        "O eclipse lunar total de 14/03/2025, visto da Lua: quando a Terra cobre o Sol",
    ),
    reference=(
        "SPICE gfoclt (Earth and Sun as pck00011 ellipsoids, LT) from the same point, -89.4°, "
        "90°, 2 m, on our own kernels; NASA's whole-Moon contacts, 'Eclipse Predictions by Fred "
        "Espenak, NASA's GSFC' (LE2025Mar14T.pdf, Danjon's rule), as intervals; the gfoclt call "
        "follows our group's independent prototype (the independent work)"
    ),
    tolerance=proof.text(
        f"each of the four contacts (Sun fraction leaves 1, reaches 0, leaves 0, returns to 1) "
        f"within {athena.CONTACT_TOLERANCE_S:g} s of gfoclt: our Earth is a sphere of the "
        "equatorial radius, gfoclt's an ellipsoid 21.4 km shorter at the poles, ~20 s at "
        "~0.55°/h, plus the bisection. And inside NASA's contacts: into the umbra in [U1, U2], "
        "out in [U3, U4], all in [P1, P4]",
        f"cada um dos quatro contatos (a fração do Sol sai de 1, chega a 0, sai de 0, volta a 1) "
        f"a até {athena.CONTACT_TOLERANCE_S:g} s do gfoclt: nossa Terra é uma esfera do raio "
        "equatorial, a do gfoclt um elipsoide 21,4 km mais curto nos polos, ~20 s a ~0,55°/h, "
        "mais a bisseção. E dentro dos contatos da NASA: entra na umbra em [U1, U2], sai em "
        "[U3, U4], tudo em [P1, P4]",
    ),
    not_covered=proof.text(
        "No refraction by the Earth's atmosphere: the Sun is gone when the solid Earth covers "
        "it, while the real umbra is enlarged by the atmosphere (NASA's Danjon rule). NASA's "
        "contacts are for the whole Moon, so they only bound ours. Judged at one fixture point; "
        "Athena's contacts are shown for information.",
        "Sem refração pela atmosfera da Terra: o Sol some quando a Terra sólida o cobre, "
        "enquanto a umbra real é aumentada pela atmosfera (regra de Danjon da NASA). Os "
        "contatos da NASA são da Lua inteira, então só limitam os nossos. Julgado num ponto "
        "de teste; os contatos do Athena aparecem só como informação.",
    ),
    script_path=SCRIPT,
)
proof.declare(
    "negative-control-eclipse-earth-radius",
    title=proof.text(
        "Negative control: the eclipse with the Earth 1% larger",
        "Controle negativo: o eclipse com a Terra 1% maior",
    ),
    reference="The eclipse contact check with our engine's Earth radius made 1% larger",
    tolerance=proof.text(
        f"must exceed {athena.CONTACT_TOLERANCE_S:g} s on some contact",
        f"precisa passar de {athena.CONTACT_TOLERANCE_S:g} s em algum contato",
    ),
    not_covered=proof.text(
        "Shows the check sees a 64 km error in the Earth's size; says nothing about the engine.",
        "Mostra que a checagem vê um erro de 64 km no tamanho da Terra; não diz nada sobre o motor.",
    ),
    script_path=SCRIPT,
)


def nasa() -> dict[str, datetime]:
    contacts = json.loads(ESPENAK.read_text("utf-8"))["contacts_ut"]
    return {k: datetime.fromisoformat(v) for k, v in contacts.items()}


def seconds(differences: dict[str, float], decimal: str = ".") -> str:
    return ", ".join(f"{d:+.1f}".replace(".", decimal) + " s" for d in differences.values())


@pytest.fixture(scope="module")
def reference() -> dict[str, datetime]:
    return eclipse.spice_contacts(POINT["latitude_deg"], POINT["longitude_deg"], HEIGHT, *SPAN)


def test_the_contacts_come_from_the_engine_the_api_serves(test_client: Any) -> None:
    """engine.look_at, as eclipse.py sets it up, gives the /visibility samples exactly."""
    from app import engine, ephemeris, horizon

    mask = horizon.mask(POINT["latitude_deg"], POINT["longitude_deg"], HEIGHT)
    assert mask.products, "the fixture point must have a real Horizon mask"
    observer = ephemeris.make_observer(
        POINT["latitude_deg"], POINT["longitude_deg"], mask.site_height_m + HEIGHT
    )
    params = {**POINT, "start": "2025-03-14T03:00:00Z", "duration_hours": 8}
    response = test_client.get("/visibility", params=params)
    assert response.status_code == 200, response.text
    for sample in response.json()["timeline"]["samples"]:
        look = engine.look_at(datetime.fromisoformat(sample["t"]), observer, mask)
        assert look.sun_fraction() == sample["sun"]["fraction"]


def test_contacts_are_found_in_order_to_a_tenth_of_a_second() -> None:
    """The bisection on a made-up fraction, with known contacts."""
    start = athena.ECLIPSE_START
    edges = [
        start.replace(hour=h, minute=m, second=s)
        for h, m, s in ((4, 0, 7), (5, 0, 0), (6, 30, 30), (7, 0, 59))
    ]

    def fraction(t: datetime) -> float:
        if t < edges[0] or t >= edges[3]:
            return 1.0
        if edges[1] <= t < edges[2]:
            return 0.0
        return 0.5

    found = eclipse.contacts(fraction, start, athena.ECLIPSE_END)
    assert list(found) == list(athena.CONTACTS)
    for got, want in zip(found.values(), edges, strict=True):
        assert abs((got - want).total_seconds()) <= eclipse.RESOLUTION_S


def test_a_whole_disc_summed_to_just_under_one_is_still_whole() -> None:
    # during a regression, the requirement: engine.Look.sun_fraction gives 1 - 2e-16 at some instants with
    # the whole Sun clear (03:55, 04:09, 10:34 at the fixture point), and taking fraction < 1
    # as a contact found 16 contacts instead of 4.
    start = athena.ECLIPSE_START
    bumps = {start.replace(hour=3, minute=55), start.replace(hour=10, minute=34)}

    def fraction(t: datetime) -> float:
        if t in bumps:
            return 0.9999999999999998
        if start.replace(hour=5) <= t < start.replace(hour=6):
            return 0.0
        return 0.5 if start.replace(hour=4) <= t < start.replace(hour=7) else 1.0

    found = eclipse.contacts(fraction, start, athena.ECLIPSE_END)
    edges = [start.replace(hour=h) for h in (4, 5, 6, 7)]
    for got, want in zip(found.values(), edges, strict=True):
        assert abs((got - want).total_seconds()) <= eclipse.RESOLUTION_S


def test_nasa_intervals_rule() -> None:
    contacts = dict(
        zip(athena.CONTACTS, (nasa()["P1"], nasa()["U2"], nasa()["U3"], nasa()["P4"]), strict=True)
    )
    assert athena.nasa_intervals_hold(contacts, nasa())
    contacts["reaches 0"] = nasa()["U3"]  # into the umbra after U2
    assert not athena.nasa_intervals_hold(contacts, nasa())


@proof.check("eclipse-2025-local-contacts")
def test_local_contacts_against_gfoclt_and_nasa(reference: dict[str, datetime]) -> None:
    ours = eclipse.engine_contacts(POINT["latitude_deg"], POINT["longitude_deg"], HEIGHT, *SPAN)
    differences = eclipse.differences_s(ours, reference)
    within = eclipse.largest_s(differences) <= athena.CONTACT_TOLERANCE_S
    inside_nasa = athena.nasa_intervals_hold(ours, nasa())
    times = ", ".join(eclipse.stamp(t)[11:] for t in ours.values())
    en = (
        f"at -89.4°, 90°: ours − gfoclt {seconds(differences)} (contacts {times} UTC); "
        f"{'inside' if inside_nasa else 'outside'} NASA's intervals."
    )
    pt_text = (
        f"em -89,4°, 90°: nosso − gfoclt {seconds(differences, ',')} (contatos "
        f"{times.replace('.', ',')} UTC); {'dentro' if inside_nasa else 'fora'} dos intervalos "
        "da NASA."
    )
    if ENGINE.exists():
        athena_side = json.loads(ENGINE.read_text("utf-8"))["eclipse"]
        parse = {
            side: {k: datetime.fromisoformat(v) for k, v in d.items()}
            for side, d in athena_side.items()
        }
        at_athena = eclipse.differences_s(parse["engine"], parse["gfoclt"])
        en += f" At Athena, for information: ours − gfoclt {seconds(at_athena)}."
        pt_text += f" No Athena, só como informação: nosso − gfoclt {seconds(at_athena, ',')}."
    proof.record(
        "eclipse-2025-local-contacts",
        "passed" if within and inside_nasa else "failed",
        proof.text(en, pt_text),
    )
    assert within, differences
    assert inside_nasa, ours


@proof.check("negative-control-eclipse-earth-radius")
def test_a_larger_earth_breaks_the_check(reference: dict[str, datetime]) -> None:
    ours = eclipse.engine_contacts(
        POINT["latitude_deg"], POINT["longitude_deg"], HEIGHT, *SPAN,
        earth_radius_scale=athena.CONTROL_EARTH_RADIUS_SCALE,
    )  # fmt: skip
    differences = eclipse.differences_s(ours, reference)
    broke = eclipse.largest_s(differences) > athena.CONTACT_TOLERANCE_S
    proof.record(
        "negative-control-eclipse-earth-radius",
        "passed" if broke else "failed",
        proof.text(
            f"{'broke' if broke else 'did not break'} the check: ours − gfoclt "
            f"{seconds(differences)}",
            f"{'quebrou' if broke else 'não quebrou'} a checagem: nosso − gfoclt "
            f"{seconds(differences, ',')}",
        ),
    )
    assert broke, differences
