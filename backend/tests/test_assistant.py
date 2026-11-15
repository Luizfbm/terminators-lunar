"""POST /assistant, driven through HTTP with OpenRouter stubbed on httpx.MockTransport.

Numbers are checked against the API asked directly (GET /visibility and friends), never
against the assistant's own tools.
"""

from __future__ import annotations

import json
import logging
import re
import time
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from app.assistant import config
from app.assistant.offline import QUESTIONS
from app.main import app
from tests.assistant_stub import (
    KEY,
    MODEL,
    call,
    completion,
    fresh_assistant,  # noqa: F401  used by pytestmark
    install,
    tool_results,
)

client = TestClient(app)
pytestmark = pytest.mark.usefixtures("fresh_assistant")

# Site 001 over ten days from the validation window: the Sun stays up, the Earth rises.
SITE_001 = {"site_id": "001", "start": "2026-11-14T00:00:00Z", "duration_hours": 240}
SITE_001_REQUEST = (
    "/visibility?site_id=001&start=2026-11-14T00:00:00Z&duration_hours=240&observer_height_m=2"
)
# A custom Site where the Sun sets for days inside the default Window.
SETS = {"latitude_deg": -89.6, "longitude_deg": 0, "start": "2026-11-14T00:00:00Z"}


def ask(
    question: str,
    lang: str = "en",
    query: dict[str, Any] | None = SITE_001,
    headers: dict[str, str] | None = None,
) -> httpx.Response:
    body: dict[str, Any] = {"messages": [{"role": "user", "content": question}], "lang": lang}
    if query is not None:
        body["query"] = query
    response: httpx.Response = client.post("/assistant", json=body, headers=headers or {})
    return response


def answer(question: str, lang: str = "en", query: dict[str, Any] | None = SITE_001) -> Any:
    response = ask(question, lang, query)
    assert response.status_code == 200, response.text
    return response.json()


def visibility(params: dict[str, Any]) -> Any:
    response = client.get("/visibility", params=params)
    assert response.status_code == 200, response.text
    return response.json()


def numbers_in(text: str) -> list[float]:
    return [float(n.replace(",", ".")) for n in re.findall(r"\d+(?:[.,]\d+)?", text)]


# --- Offline router ---------------------------------------------------------------------


@pytest.mark.parametrize("lang", ["en", "pt"])
def test_the_offline_router_answers_every_fixed_question_in_full_trace(lang: str) -> None:
    # The slow answers come from the cache only (the implementation); open their panels as the screen does.
    for path, params in (
        ("/visibility/scatter", SITE_001),
        ("/visibility/ladder", SITE_001),
        ("/sites/001/year", {"year": 2026}),
    ):
        assert client.get(path, params=params).status_code == 200
    answers = set()
    for name, texts in QUESTIONS.items():
        reply = answer(texts[lang], lang)
        assert reply["mode"] == "offline", name
        assert reply["answer"], name
        assert reply["numbers"]["untraced"] == [], (name, reply)
        assert reply["numbers"]["traced"] == reply["numbers"]["total"], name
        assert reply["sources"], name
        answers.add(reply["answer"])
    # One answer per question: the keywords route each one somewhere else.
    assert len(answers) == len(QUESTIONS)


def test_offline_answers_are_in_the_language_asked() -> None:
    en = answer(QUESTIONS["both"]["en"], "en", SETS)["answer"]
    pt = answer(QUESTIONS["both"]["pt"], "pt", SETS)["answer"]
    assert en.startswith("Across this Window") and pt.startswith("Nesta Janela")
    # The same numbers; durations read as the panel writes them in both languages (the implementation).
    assert numbers_in(en) == numbers_in(pt)
    assert " d " in en.split("for ")[1] and " d " in pt.split("por ")[1]


def test_offline_numbers_are_the_engine_numbers() -> None:
    truth = visibility({**SETS, "duration_hours": 708.73})["metrics"]
    reply = answer("Quanto tempo tenho Sol e Terra ao mesmo tempo?", "pt", SETS)
    # Each duration as the panel writes it: whole days and hours, rounded down (the implementation).
    for key in ("sun_and_earth_hours", "lcip_hours", "lcsp_hours"):
        days, hours = divmod(int(truth[key] * 60 + 1e-6) // 60, 24)
        assert f"{days} d {hours} h" in reply["answer"], (key, reply["answer"])
    assert len(numbers_in(reply["answer"])) == 6


def test_the_offline_sunset_names_the_occluder_the_engine_names() -> None:
    truth = visibility(SETS)
    sunset = next(e for e in truth["events"] if e["type"] == "sunset")
    reply = answer("When does the Sun set?", "en", SETS)
    km = sunset["occluder"]["distance_m"] / 1000
    assert f"{km:.1f} km" in reply["answer"]
    hh, mm = sunset["t"][11:13], sunset["t"][14:16]
    assert f"{hh}:{mm} UTC" in reply["answer"]
    assert reply["sources"] == [
        {
            "operation": "getVisibility",
            "request": "/visibility?latitude_deg=-89.6&longitude_deg=0"
            "&start=2026-11-14T00:00:00Z&duration_hours=708.73&observer_height_m=2",
        }
    ]


def test_the_year_question_on_a_custom_site_says_so_instead_of_failing() -> None:
    reply = answer("What is the best Window this year?", "en", SETS)
    assert reply["mode"] == "offline"
    assert "list" in reply["answer"] and reply["sources"] == []


def test_without_a_query_the_router_uses_the_default_query() -> None:
    reply = answer("Can I see the Earth?", "en", None)
    today = time.strftime("%Y-%m-%dT00:00:00Z", time.gmtime())
    assert reply["sources"][0]["request"] == (
        f"/visibility?site_id=001&start={today}&duration_hours=708.73&observer_height_m=2"
    )


# --- The model, stubbed -----------------------------------------------------------------


def test_a_model_answer_with_tool_numbers_is_fully_traced_even_rounded(monkeypatch: Any) -> None:
    def write(body: dict[str, Any]) -> dict[str, Any]:
        metrics = tool_results(body)[0]["metrics"]
        both = metrics["sun_and_earth_time"]
        return completion(
            f"Here the Sun and the Earth are up together for {both['hours']:.0f} hours, "
            f"{both['text']}, and the Sun is up {metrics['mean_sun_percent']:.0f}% "
            "of the time."
        )

    scripted = install(monkeypatch, completion(tool_calls=[call("get_visibility", {})]), write)
    reply = answer("How long do I have the Sun and the Earth together?")
    assert reply["mode"] == "model"
    # "9 d 23 h" is two numbers, both traced to the tool's own words (the implementation).
    assert reply["numbers"] == {"total": 4, "traced": 4, "untraced": []}
    assert reply["sources"] == [{"operation": "getVisibility", "request": SITE_001_REQUEST}]
    # The source is a real request: asking it gives the numbers the answer quotes.
    truth = client.get(reply["sources"][0]["request"]).json()["metrics"]
    assert f"{truth['sun_and_earth_hours']:.0f} hours" in reply["answer"]
    assert len(scripted.requests) == 2


def test_a_number_no_tool_returned_is_untraced(monkeypatch: Any) -> None:
    install(monkeypatch, completion("The Sun sets in 37.25 hours, behind a peak 9.87 km away."))
    reply = answer("When does the Sun set?")
    assert reply["mode"] == "model"
    assert reply["numbers"] == {"total": 2, "traced": 0, "untraced": ["37.25", "9.87"]}
    assert reply["sources"] == []


def test_a_unit_the_model_converts_itself_is_untraced(monkeypatch: Any) -> None:
    def write(body: dict[str, Any]) -> dict[str, Any]:
        hours = tool_results(body)[0]["metrics"]["sun_and_earth_time"]["hours"]
        return completion(f"That is {hours:.2f} hours, or {hours * 60:.0f} minutes.")

    install(monkeypatch, completion(tool_calls=[call("get_visibility", {})]), write)
    reply = answer("How long do I have the Sun and the Earth together?")
    assert reply["numbers"]["total"] == 2 and reply["numbers"]["traced"] == 1
    assert len(reply["numbers"]["untraced"]) == 1


def test_portuguese_numbers_dates_and_times_trace(monkeypatch: Any) -> None:
    truth = visibility(SETS)
    sunset = next(e for e in truth["events"] if e["type"] == "sunset")
    day, hh, mm = int(sunset["t"][8:10]), sunset["t"][11:13], sunset["t"][14:16]
    km = f"{sunset['occluder']['distance_m'] / 1000:.1f}".replace(".", ",")
    text = (
        f"O Sol se põe em {day} de novembro de 2026, às {hh}h{mm} UTC, atrás de um relevo a "
        f"{km} km. Em 3 de março de 2031 eu não sei."
    )
    install(monkeypatch, completion(tool_calls=[call("get_visibility", {})]), completion(text))
    reply = answer("Quando o Sol se põe?", "pt", SETS)
    assert reply["numbers"] == {"total": 4, "traced": 3, "untraced": ["3 de março de 2031"]}


def test_numbers_from_the_question_trace(monkeypatch: Any) -> None:
    install(monkeypatch, completion("I can't work out a 250 m miss from here."))
    reply = answer("What if I land 250 m away?")
    assert reply["numbers"] == {"total": 1, "traced": 1, "untraced": []}


def test_the_request_to_openrouter_has_the_documented_shape(monkeypatch: Any) -> None:
    scripted = install(
        monkeypatch,
        completion(tool_calls=[call("get_visibility", {}, "call_a")]),
        completion("Done."),
    )
    answer("Quando a Terra se põe?", "pt")
    first, _ = scripted.requests
    assert str(first.url) == "https://openrouter.ai/api/v1/chat/completions"
    assert first.headers["authorization"] == f"Bearer {KEY}"
    body = scripted.bodies[0]
    assert body["model"] == MODEL
    names = {t["function"]["name"] for t in body["tools"]}
    assert {"get_visibility", "get_visibility_ladder", "get_site_year"} <= names
    assert {"search_sites", "list_validations"} <= names
    assert body["messages"][0]["role"] == "system"
    assert "Brazilian Portuguese" in body["messages"][0]["content"]
    assert body["messages"][-1] == {"role": "user", "content": "Quando a Terra se põe?"}
    assert "tool_choice" not in body
    # The tool result goes back paired with its call, and it is compact.
    later = scripted.bodies[1]["messages"]
    assert later[-2]["tool_calls"][0]["id"] == "call_a"
    assert later[-1]["role"] == "tool" and later[-1]["tool_call_id"] == "call_a"
    result = json.loads(later[-1]["content"])
    assert "timeline" not in result and "horizon" not in result
    assert len(later[-1]["content"]) < 8000
    # Hours and the app's own words side by side, so the model never converts (the implementation).
    assert set(result["metrics"]["lcip"]) == {"hours", "text"}


def test_tool_arguments_replace_the_query_on_screen(monkeypatch: Any) -> None:
    args = {"site_id": "CR01", "duration_hours": 24}
    install(monkeypatch, completion(tool_calls=[call("get_visibility", args)]), completion("Done."))
    reply = answer("And at CR01 for one day?")
    assert reply["sources"] == [
        {
            "operation": "getVisibility",
            "request": "/visibility?site_id=CR01&start=2026-11-14T00:00:00Z"
            "&duration_hours=24&observer_height_m=2",
        }
    ]


def test_tool_errors_reach_the_model_as_data(monkeypatch: Any) -> None:
    calls = [
        call("get_site_year", {}, "a"),
        call("get_visibility", {"duration_hours": -3}, "b"),
        call("no_such_tool", {}, "c"),
        {"id": "d", "type": "function", "function": {"name": "get_visibility", "arguments": "{"}},
    ]
    scripted = install(monkeypatch, completion(tool_calls=calls), completion("I can't say."))
    reply = answer("What about the year?", "en", SETS)
    assert reply["mode"] == "model" and reply["sources"] == []
    errors = [r["error"] for r in tool_results(scripted.bodies[1])]
    assert errors == ["not_curated", "invalid_parameter", "unknown_tool", "invalid_arguments"]


def test_search_and_validation_tools_read_the_same_routes(monkeypatch: Any) -> None:
    calls = [call("search_sites", {"q": "CR0"}, "a"), call("list_validations", {}, "b")]
    scripted = install(monkeypatch, completion(tool_calls=calls), completion("Done."))
    reply = answer("Which Sites are on Connecting Ridge, and is this checked?")
    found, checks = tool_results(scripted.bodies[1])
    assert found["count"] == len(client.get("/sites", params={"q": "CR0"}).json())
    assert checks["total"] == len(client.get("/validations").json())
    assert reply["sources"] == [
        {"operation": "listSites", "request": "/sites?q=CR0"},
        {"operation": "listValidations", "request": "/validations"},
    ]


def test_four_rounds_of_tools_then_an_answer_is_a_model_answer(monkeypatch: Any) -> None:
    rounds = [completion(tool_calls=[call("get_visibility", {}, f"c{i}")]) for i in range(4)]
    scripted = install(monkeypatch, *rounds, completion("Done."))
    assert answer("When does the Sun set?")["mode"] == "model"
    assert scripted.bodies[-1]["tool_choice"] == "none"


def test_more_than_four_rounds_of_tools_answers_offline(monkeypatch: Any) -> None:
    rounds = [completion(tool_calls=[call("get_visibility", {}, f"c{i}")]) for i in range(5)]
    scripted = install(monkeypatch, *rounds)
    reply = answer("When does the Sun set?")
    assert reply["mode"] == "offline"
    assert len(scripted.requests) == 5
    assert scripted.bodies[-1]["tool_choice"] == "none"
    # The offline answer lists only what it read itself.
    assert reply["sources"] == [{"operation": "getVisibility", "request": SITE_001_REQUEST}]


def _refusal() -> dict[str, Any]:
    refused = completion("I can't help with that.")
    refused["choices"][0]["message"]["refusal"] = "I can't help with that."
    return refused


def _choice_error() -> dict[str, Any]:
    failed = completion("partial output...", finish="error")
    failed["choices"][0]["error"] = {"code": 502, "message": "Provider disconnected"}
    return failed


FAILURES = {
    "500": httpx.Response(500, json={"error": {"code": 500, "message": "boom"}}),
    "401 bad key": httpx.Response(401, json={"error": {"code": 401, "message": "No auth"}}),
    "402 no credits": httpx.Response(402, json={"error": {"code": 402, "message": "Credits"}}),
    "429": httpx.Response(429, json={"error": {"code": 429, "message": "Rate limit exceeded"}}),
    "503 no provider": httpx.Response(503, json={"error": {"code": 503, "message": "None"}}),
    "error in a 200": {"error": {"code": 502, "message": "Provider returned error"}},
    "error in the choice": _choice_error(),
    "moderation": completion("", finish="content_filter"),
    "cut by the token limit": completion("The Sun sets on", finish="length"),
    "refusal": _refusal(),
    "empty answer": completion("   "),
    "no choices": {"id": "gen", "choices": []},
    "not json": httpx.Response(200, content=b"<html>gateway</html>"),
    "timeout": httpx.ReadTimeout("slow"),
    "network down": httpx.ConnectError("refused"),
}


@pytest.mark.parametrize("failure", FAILURES.values(), ids=FAILURES.keys())
def test_any_model_failure_becomes_the_offline_answer(monkeypatch: Any, failure: Any) -> None:
    offline = answer("How long do I have the Sun and the Earth together?")
    scripted = install(monkeypatch, failure)
    reply = answer("How long do I have the Sun and the Earth together?")
    assert reply == offline
    assert len(scripted.requests) == 1


def test_the_time_budget_ends_the_conversation(monkeypatch: Any) -> None:
    monkeypatch.setattr(config, "DEADLINE_SECONDS", 0.3)

    def slow(_: dict[str, Any]) -> dict[str, Any]:
        time.sleep(0.4)
        return completion(tool_calls=[call("get_visibility", {})])

    scripted = install(monkeypatch, slow, completion("Never read."))
    reply = answer("When does the Sun set?")
    assert reply["mode"] == "offline"
    assert len(scripted.requests) == 1


@pytest.mark.parametrize("env", [config.KEY, config.MODEL])
def test_without_a_key_or_a_model_the_route_answers_offline(monkeypatch: Any, env: str) -> None:
    scripted = install(monkeypatch, completion("Never sent."))
    monkeypatch.delenv(env)
    assert answer("Can I see the Earth?")["mode"] == "offline"
    assert scripted.requests == []


def test_a_day_over_the_cap_answers_offline(monkeypatch: Any) -> None:
    monkeypatch.setenv(config.DAILY_LIMIT, "1")
    scripted = install(monkeypatch, completion("The Earth is up."))
    assert answer("Can I see the Earth?")["mode"] == "model"
    assert answer("Can I see the Earth?")["mode"] == "offline"
    assert len(scripted.requests) == 1


def test_one_address_over_the_cap_gets_busy_and_others_do_not(monkeypatch: Any) -> None:
    monkeypatch.setenv(config.IP_LIMIT, "2")
    busy = {"cf-connecting-ip": "203.0.113.7"}
    for _ in range(2):
        assert ask("Can I see the Earth?", headers=busy).status_code == 200
    over = ask("Can I see the Earth?", headers=busy)
    assert over.status_code == 503
    assert over.headers["content-type"] == "application/problem+json"
    assert over.json()["code"] == "busy"
    assert 1 <= int(over.headers["retry-after"]) <= 60
    other = ask("Can I see the Earth?", headers={"cf-connecting-ip": "198.51.100.1"})
    assert other.status_code == 200


def test_the_key_is_never_logged_nor_answered(monkeypatch: Any, caplog: Any) -> None:
    caplog.set_level(logging.DEBUG)
    install(monkeypatch, httpx.Response(401, json={"error": {"code": 401, "message": "bad"}}))
    failed = ask("Can I see the Earth?")
    install(monkeypatch, completion("The Earth is up."))
    worked = ask("Can I see the Earth?")
    for text in (failed.text, worked.text, caplog.text):
        assert KEY not in text


# --- The request ------------------------------------------------------------------------


def _post(body: dict[str, Any]) -> httpx.Response:
    response: httpx.Response = client.post("/assistant", json=body)
    return response


USER = {"role": "user", "content": "Hi"}
INVALID = {
    "no messages": {"messages": [], "lang": "en"},
    "21 messages": {"messages": [USER] * 21, "lang": "en"},
    "2001 characters": {"messages": [{"role": "user", "content": "a" * 2001}], "lang": "en"},
    "empty message": {"messages": [{"role": "user", "content": ""}], "lang": "en"},
    "a number as content": {"messages": [{"role": "user", "content": 5}], "lang": "en"},
    "another role": {"messages": [{"role": "system", "content": "Hi"}], "lang": "en"},
    "last word is the assistant's": {
        "messages": [USER, {"role": "assistant", "content": "Hello"}],
        "lang": "en",
    },
    "unknown language": {"messages": [USER], "lang": "fr"},
    "unknown Site": {"messages": [USER], "lang": "en", "query": {**SITE_001, "site_id": "XYZ"}},
    "Site and coordinates": {"messages": [USER], "lang": "en", "query": {**SITE_001, **SETS}},
    "start as a number": {"messages": [USER], "lang": "en", "query": {"start": 1763078400}},
    "no start": {"messages": [USER], "lang": "en", "query": {"site_id": "001"}},
    "Window too long": {
        "messages": [USER],
        "lang": "en",
        "query": {**SITE_001, "duration_hours": 1441},
    },
    "custom Site off the pole": {
        "messages": [USER],
        "lang": "en",
        "query": {"latitude_deg": -70, "longitude_deg": 0, "start": SITE_001["start"]},
    },
}


@pytest.mark.parametrize("body", INVALID.values(), ids=INVALID.keys())
def test_requests_outside_the_contract_get_422_invalid_parameter(body: dict[str, Any]) -> None:
    response = _post(body)
    assert response.status_code == 422, response.text
    assert response.json()["code"] == "invalid_parameter"


def test_twenty_messages_of_two_thousand_characters_are_accepted() -> None:
    long = "a" * 1990 + " sunset?"
    turns = [{"role": "user", "content": long}, {"role": "assistant", "content": long}] * 10
    turns[-1] = {"role": "user", "content": long}
    response = _post({"messages": turns, "lang": "en", "query": SITE_001})
    assert response.status_code == 200, response.text


def test_empty_settings_count_as_missing(monkeypatch: Any) -> None:
    # The compose file passes unset variables through as empty strings.
    scripted = install(monkeypatch, completion("Never sent."))
    monkeypatch.setenv(config.KEY, "")
    assert answer("Can I see the Earth?")["mode"] == "offline"
    assert scripted.requests == []
    for name in (config.DAILY_LIMIT, config.IP_LIMIT):
        monkeypatch.setenv(name, "")
    assert (config.daily_limit(), config.ip_per_minute()) == (300, 10)
    assert config.DAILY_LIMIT == "LUNAR_ASSISTANT_DAILY_REQUESTS"
