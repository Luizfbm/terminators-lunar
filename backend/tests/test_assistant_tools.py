"""The assistant's phase 4 tools (the requirement), driven through POST /assistant.

Every number a tool gives is checked against its route asked directly over HTTP. The slow
tools answer only from what is already computed: cold, they say which panel computes the
number and start no engine run.
"""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from app import engine, flat
from app.assistant import offline, prompt, tools
from app.main import app
from tests.assistant_stub import (
    call,
    completion,
    fresh_assistant,  # noqa: F401  used by pytestmark
    install,
    tool_results,
)

client = TestClient(app)
pytestmark = pytest.mark.usefixtures("fresh_assistant")

QUERY = {"site_id": "001", "start": "2026-11-14T00:00:00Z", "duration_hours": 240}
QUERY_STRING = "site_id=001&start=2026-11-14T00:00:00Z&duration_hours=240&observer_height_m=2"
COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"]
LANDER = {"panel_power_w": 400, "load_w": 100, "battery_wh": 2000}


def get(path: str, **params: Any) -> Any:
    response = client.get(path, params={**QUERY, **params} if path != "/terrain" else params)
    assert response.status_code == 200, response.text
    return response.json()


def ask_with_tool(
    monkeypatch: Any, name: str, args: dict[str, Any], lang: str = "en"
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Ask once with a model that calls one tool; the reply and what the tool returned."""
    scripted = install(monkeypatch, completion(tool_calls=[call(name, args)]), completion("Ok."))
    body = {"messages": [{"role": "user", "content": "?"}], "lang": lang, "query": QUERY}
    response = client.post("/assistant", json=body)
    assert response.status_code == 200, response.text
    return response.json(), tool_results(scripted.bodies[1])[0]


def hours(value: float) -> float:
    # What the model is handed: durations to two decimals since the implementation (four before).
    return round(value, 2)


@pytest.fixture
def engine_runs(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Every engine run, the ones behind /visibility and the Flat horizon's own."""
    runs: list[str] = []
    real_calculate, real_flat = engine.calculate, flat.compute

    def calculate(*args: Any, **kwargs: Any) -> Any:
        runs.append("engine")
        return real_calculate(*args, **kwargs)

    def flat_compute(*args: Any, **kwargs: Any) -> Any:
        runs.append("flat")
        return real_flat(*args, **kwargs)

    monkeypatch.setattr(engine, "calculate", calculate)
    monkeypatch.setattr(flat, "compute", flat_compute)
    return runs


# --- Fast tools: they compute as usual ----------------------------------------------------


def test_terrain_gives_the_slope_of_the_route(monkeypatch: Any) -> None:
    reply, result = ask_with_tool(monkeypatch, "get_terrain", {})
    truth = get("/terrain", site_id="001")
    slope = result["slope"]
    assert slope["median_deg"] == round(truth["slope"]["median_deg"], 2)
    assert slope["p95_deg"] == round(truth["slope"]["p95_deg"], 2)
    assert slope["steepest_cell_deg"] == round(truth["slope"]["max_deg"], 2)
    assert slope["limit_deg"] == truth["slope"]["limit_deg"] == 10
    assert slope["share_under_limit_percent"] == round(truth["slope"]["share_below_limit"] * 100, 1)
    assert result["radius_m"] == truth["radius_m"] == 100
    assert reply["sources"] == [
        {
            "operation": "getTerrain",
            "request": "/terrain?site_id=001&radius_m=100&slope_limit_deg=10",
        }
    ]


def test_dsn_gives_the_link_hours_of_the_route(monkeypatch: Any) -> None:
    _, result = ask_with_tool(monkeypatch, "get_visibility_dsn", {})
    truth = get("/visibility/dsn")
    assert result["dsn_link"]["hours"] == hours(truth["link_hours"])
    assert result["earth_visible"]["hours"] == hours(truth["earth_visible_hours"])
    without = truth["earth_without_station_hours"]
    assert result["earth_visible_without_a_dish"]["hours"] == hours(without)
    share = truth["link_hours"] / truth["earth_visible_hours"] * 100
    assert result["link_share_of_earth_visible_percent"] == round(share, 1)
    assert [s["id"] for s in result["stations"]] == [s["id"] for s in truth["stations"]]
    for mine, theirs in zip(result["stations"], truth["stations"], strict=True):
        assert mine["passes"] == len(theirs["passes"])


def test_energy_asks_for_the_lander_and_never_invents_one(monkeypatch: Any) -> None:
    reply, result = ask_with_tool(monkeypatch, "get_visibility_energy", {})
    assert result["error"] == "missing_lander"
    assert reply["sources"] == []
    _, result = ask_with_tool(monkeypatch, "get_visibility_energy", LANDER)
    truth = get("/visibility/energy", **LANDER)
    assert result["darkness_tolerance"]["hours"] == hours(truth["darkness_tolerance_hours"])
    assert result["darkness_tolerance"]["hours"] == 2000 / 100
    assert result["lowest_charge_percent"] == round(truth["min_charge_fraction"] * 100, 1)
    assert result["load_not_met"]["hours"] == hours(truth["unmet_hours"])
    outlasts = truth["darkness_tolerance_hours"] >= truth["lcsp_hours"]
    assert result["battery_outlasts_the_longest_night"] is outlasts


# --- Slow tools: only from what is already computed ---------------------------------------

SLOW = [
    ("get_visibility_scatter", {}, "If the lander misses", "Se o módulo errar o alvo"),
    (
        "get_visibility_flat",
        {},
        "How much of this answer is the terrain?",
        "Quanto desta resposta vem do relevo?",
    ),
    ("get_site_windows", {}, "If the launch slips", "Se o lançamento atrasar"),
    ("get_site_windows", {"year": 2027}, "When to land in 2027", "Quando pousar em 2027"),
    (
        "get_visibility_ladder",
        {},
        "How much does the map’s detail change this answer?",
        "Quanto o detalhe do mapa muda esta resposta?",
    ),
    ("get_site_year", {}, "The year 2026 at this Site", "O ano de 2026 neste Local"),
]


@pytest.mark.parametrize(("name", "args", "en", "pt"), SLOW, ids=[f"{s[0]}{s[1]}" for s in SLOW])
def test_a_cold_slow_tool_names_its_panel_and_starts_no_engine_run(
    monkeypatch: Any, engine_runs: list[str], name: str, args: dict[str, Any], en: str, pt: str
) -> None:
    get("/visibility")  # the main answer is on screen, as it always is first
    engine_runs.clear()
    began = time.monotonic()
    for lang, title in (("en", en), ("pt", pt)):
        reply, result = ask_with_tool(monkeypatch, name, args, lang)
        assert result["error"] == "not_ready"
        assert result["panel"] == title
        assert reply["sources"] == []
    assert engine_runs == []
    assert time.monotonic() - began < 2


def test_the_scatter_reads_the_cache_once_its_panel_computed_it(monkeypatch: Any) -> None:
    truth = get("/visibility/scatter")
    reply, result = ask_with_tool(monkeypatch, "get_visibility_scatter", {})
    both = result["metrics"]["sun_and_earth_time"]
    band = truth["band"]["sun_and_earth_hours"]
    assert both["lowest"]["hours"] == hours(band["min"])
    assert both["highest"]["hours"] == hours(band["max"])
    assert both["at_the_site"]["hours"] == hours(
        truth["points"][0]["metrics"]["sun_and_earth_hours"]
    )
    worst = truth["points"][band["min_point"]]
    if worst["distance_m"] == 0:
        assert both["lowest_at"] == {"at_the_site": True}
    else:
        assert both["lowest_at"]["distance_m"] == round(worst["distance_m"])
        assert both["lowest_at"]["direction"] == COMPASS[round(worst["azimuth_deg"] / 45) % 8]
    assert result["points"] == len(truth["points"]) == 19
    assert reply["sources"] == [
        {
            "operation": "getVisibilityScatter",
            "request": f"/visibility/scatter?{QUERY_STRING}&radius_m=250",
        }
    ]


def test_the_flat_horizon_gives_what_the_terrain_changes(monkeypatch: Any) -> None:
    without, with_ = get("/visibility/flat"), get("/visibility")
    _, result = ask_with_tool(monkeypatch, "get_visibility_flat", {})
    flat_both = without["metrics"]["sun_and_earth_hours"]
    real_both = with_["metrics"]["sun_and_earth_hours"]
    assert result["without_terrain"]["metrics"]["sun_and_earth_time"]["hours"] == hours(flat_both)
    assert result["with_terrain"]["metrics"]["sun_and_earth_time"]["hours"] == hours(real_both)
    change = result["terrain_changes"]["sun_and_earth_time"]
    assert change["by"]["hours"] == hours(abs(flat_both - real_both))
    assert change["without_terrain_there_is"] == ("more" if flat_both > real_both else "less")
    assert result["flat_horizon_elevation_deg"] == round(without["horizon_elevation_deg"], 5)


def test_the_launch_slip_reads_the_windows_route(monkeypatch: Any) -> None:
    truth = client.get(
        "/sites/001/windows",
        params={"start": QUERY["start"], "duration_hours": 240, "observer_height_m": 2},
    ).json()
    reply, result = ask_with_tool(monkeypatch, "get_site_windows", {})
    for rank in ("best", "typical", "worst"):
        assert result[rank]["start"] == truth[rank]["start"]
        assert result[rank]["shift_days"] == truth[rank]["shift_days"]
        assert result[rank]["sun_and_earth_time"]["hours"] == hours(
            truth[rank]["sun_and_earth_hours"]
        )
    planned = next(w for w in truth["windows"] if w["shift_days"] == 0)
    assert result["as_planned"]["sun_and_earth_time"]["hours"] == hours(
        planned["sun_and_earth_hours"]
    )
    # Renamed in the implementation from start_days_ranked, which the model read as a rank.
    assert result["start_days_in_all"] == len(truth["windows"])
    assert reply["sources"][0]["request"] == (
        "/sites/001/windows?start=2026-11-14T00:00:00Z&duration_hours=240"
        "&observer_height_m=2&first_shift_days=-30&last_shift_days=150"
    )


def test_a_slow_tool_on_a_custom_site_is_never_ready(monkeypatch: Any) -> None:
    # Custom Sites are never cached, so their slow answers always wait for the panel.
    scripted = install(
        monkeypatch,
        completion(
            tool_calls=[call("get_visibility_flat", {"latitude_deg": -89.6, "longitude_deg": 0})]
        ),
        completion("Ok."),
    )
    body = {"messages": [{"role": "user", "content": "?"}], "lang": "en", "query": QUERY}
    client.post("/assistant", json=body)
    assert tool_results(scripted.bodies[1])[0]["error"] == "not_ready"


def test_the_model_says_a_number_is_not_ready_in_words(monkeypatch: Any) -> None:
    def write(body: dict[str, Any]) -> dict[str, Any]:
        panel = tool_results(body)[0]["panel"]
        return completion(f'That number isn\'t ready yet; open "{panel}" and ask again.')

    install(monkeypatch, completion(tool_calls=[call("get_visibility_scatter", {})]), write)
    body = {"messages": [{"role": "user", "content": "250 m off?"}], "lang": "en", "query": QUERY}
    reply = client.post("/assistant", json=body).json()
    assert reply["mode"] == "model"
    assert '"If the lander misses"' in reply["answer"]
    assert reply["numbers"]["untraced"] == []


# --- Offline router: the two new questions ------------------------------------------------


@pytest.mark.parametrize("lang", ["en", "pt"])
def test_offline_slope_quotes_the_terrain_route(lang: str) -> None:
    truth = get("/terrain", site_id="001")["slope"]
    reply = client.post(
        "/assistant",
        json={
            "messages": [{"role": "user", "content": offline.QUESTIONS["slope"][lang]}],
            "lang": lang,
            "query": QUERY,
        },
    ).json()
    median = f"{truth['median_deg']:.1f}°"
    assert (median if lang == "en" else median.replace(".", ",")) in reply["answer"]
    assert reply["numbers"]["untraced"] == [] and reply["numbers"]["total"] >= 6


@pytest.mark.parametrize("lang", ["en", "pt"])
def test_offline_miss_is_not_ready_cold_and_quotes_the_scatter_warm(lang: str) -> None:
    question = {
        "messages": [{"role": "user", "content": offline.QUESTIONS["miss"][lang]}],
        "lang": lang,
        "query": QUERY,
    }
    cold = client.post("/assistant", json=question).json()
    assert ("If the lander misses" if lang == "en" else "Se o módulo errar o alvo") in cold[
        "answer"
    ]
    truth = get("/visibility/scatter")
    warm = client.post("/assistant", json=question).json()
    band = truth["band"]["sun_and_earth_hours"]
    worst = truth["points"][band["min_point"]]
    assert f"{round(worst['distance_m'])} m" in warm["answer"]
    assert warm["numbers"]["untraced"] == []
    assert warm["sources"][0]["operation"] == "getVisibilityScatter"


def test_offline_miss_takes_the_distance_the_question_names() -> None:
    body = {
        "messages": [{"role": "user", "content": "What if it lands 100 m away?"}],
        "lang": "en",
        "query": QUERY,
    }
    reply = client.post("/assistant", json=body).json()
    assert "If the lander misses" in reply["answer"]
    get("/visibility/scatter", radius_m=100)
    reply = client.post("/assistant", json=body).json()
    assert reply["sources"][0]["request"].endswith("&radius_m=100")


# --- Portuguese terms and the server log --------------------------------------------------


def test_a_portuguese_prompt_carries_the_apps_portuguese_terms() -> None:
    from datetime import UTC, datetime

    query = tools.screen_query(
        {**QUERY, "start": datetime(2026, 11, 14, tzinfo=UTC), "observer_height_m": 2}
    )
    pt = prompt.system(tools.Context(query=query, lang="pt"))
    for term in ("pôr do Sol", "a Terra some", "Sol e Terra juntos", "mapas de três resoluções"):
        assert term in pt
    for term in ('"Local"', '"Janela"', '"Consulta"', "o módulo", "maior noite (LCSP)"):
        assert term in pt
    en = prompt.system(tools.Context(query=query, lang="en"))
    assert "pôr do Sol" not in en and "Sun-and-Earth time" in en


def test_every_question_logs_its_cost_and_rounds(monkeypatch: Any, caplog: Any) -> None:
    caplog.set_level(logging.INFO, logger="app.assistant")
    install(monkeypatch, completion(tool_calls=[call("get_terrain", {})]), completion("Ok."))
    body = {"messages": [{"role": "user", "content": "?"}], "lang": "pt", "query": QUERY}
    client.post("/assistant", json=body)
    install(monkeypatch, httpx.Response(500, json={"error": {"code": 500, "message": "x"}}))
    client.post("/assistant", json=body)
    lines = [r.getMessage() for r in caplog.records if "assistant question" in r.getMessage()]
    assert len(lines) == 2
    assert "mode=model" in lines[0] and "calls=2" in lines[0] and "tool_rounds=1" in lines[0]
    assert "cost_usd=0.000200" in lines[0] and "lang=pt" in lines[0]
    assert "mode=offline" in lines[1] and "offline_because='status 500'" in lines[1]
    assert "calls=1" in lines[1]
