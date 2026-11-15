"""A scripted stand-in for OpenRouter, on httpx.MockTransport, for the /assistant tests.

Shapes follow OpenRouter's chat completions reference: `choices[0].message` with
`content` or `tool_calls`, a normalised `finish_reason`, and `usage` with `cost`.
"""

from __future__ import annotations

import json
from collections.abc import Callable, Iterator
from typing import Any

import httpx
import pytest

from app.assistant import config, limits, openrouter

KEY = "sk-or-test-not-a-real-key"
MODEL = "provider/test-model"

Step = dict[str, Any] | httpx.Response | Callable[[dict[str, Any]], Any] | Exception


def completion(
    content: str | None = None,
    tool_calls: list[dict[str, Any]] | None = None,
    finish: str = "stop",
) -> dict[str, Any]:
    message: dict[str, Any] = {"role": "assistant", "content": content}
    if tool_calls:
        message["tool_calls"] = tool_calls
        finish = "tool_calls"
    return {
        "id": "gen-test",
        "object": "chat.completion",
        "model": MODEL,
        "choices": [{"finish_reason": finish, "native_finish_reason": finish, "message": message}],
        "usage": {"prompt_tokens": 100, "completion_tokens": 20, "cost": 0.0001},
    }


def call(name: str, args: dict[str, Any], call_id: str = "call_1") -> dict[str, Any]:
    return {
        "id": call_id,
        "type": "function",
        "function": {"name": name, "arguments": json.dumps(args)},
    }


def tool_results(body: dict[str, Any]) -> list[dict[str, Any]]:
    """What the tools returned, as the model received it in its last request."""
    return [json.loads(m["content"]) for m in body["messages"] if m["role"] == "tool"]


class Model:
    """Answers each request with the next step; records every request it received."""

    def __init__(self, *steps: Step) -> None:
        self.steps = list(steps)
        self.requests: list[httpx.Request] = []
        self.bodies: list[dict[str, Any]] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        self.requests.append(request)
        self.bodies.append(body)
        step = self.steps.pop(0)
        if callable(step) and not isinstance(step, httpx.Response):
            step = step(body)
        if isinstance(step, Exception):
            raise step
        if isinstance(step, httpx.Response):
            return step
        return httpx.Response(200, json=step)


def install(monkeypatch: pytest.MonkeyPatch, *steps: Step) -> Model:
    """A scripted model on the transport, with a key and a model id in the environment."""
    scripted = Model(*steps)
    monkeypatch.setattr(openrouter, "transport", httpx.MockTransport(scripted))
    monkeypatch.setenv(config.KEY, KEY)
    monkeypatch.setenv(config.MODEL, MODEL)
    return scripted


@pytest.fixture
def fresh_assistant(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """No key, no model, no per-IP cap and empty counters, unless a test sets them."""
    monkeypatch.delenv(config.KEY, raising=False)
    monkeypatch.delenv(config.MODEL, raising=False)
    monkeypatch.setenv(config.IP_LIMIT, "0")
    monkeypatch.delenv(config.DAILY_LIMIT, raising=False)
    monkeypatch.setattr(openrouter, "transport", httpx.MockTransport(_no_network))
    limits.ip_cap.reset()
    limits.daily_cap.reset()
    yield
    limits.ip_cap.reset()
    limits.daily_cap.reset()


def _no_network(request: httpx.Request) -> httpx.Response:
    raise AssertionError(f"unexpected request to {request.url}")
