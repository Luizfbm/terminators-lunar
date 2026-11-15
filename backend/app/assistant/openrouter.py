"""The language model, reached through OpenRouter's chat completions with tool calling.

Request and response shapes follow OpenRouter's API reference (openrouter.ai/docs):
POST /api/v1/chat/completions with `tools` in every request; the model asks for tools with
`tool_calls` on an assistant message, and each result goes back as a `role: "tool"`
message with the matching `tool_call_id`. Errors come either as a non-200 status with an
`error` object (400, 401, 402 out of credits, 403 moderation, 408, 429, 502, 503) or as a
200 whose body or choice carries an `error` or `finish_reason: "error"`.

Anything but a clean answer in words raises ModelUnavailable, and the route answers
offline: an error status, a body that is not what the reference describes, a refusal, a
moderation stop, an answer cut by the token limit, an empty answer, more than
MAX_TOOL_ROUNDS rounds of tools, or the DEADLINE_SECONDS budget spent. There is no retry:
the budget is for the visitor, who gets the offline answer instead.
"""

from __future__ import annotations

import json
import time
from typing import Any

import httpx

from . import config, prompt, tools

# Tests put an httpx.MockTransport here; in service it stays None (the network).
transport: httpx.BaseTransport | None = None


class ModelUnavailable(Exception):
    """The model gave no usable answer; the reason is for the log, never for the visitor."""


def _post(client: httpx.Client, key: str, body: dict[str, Any], deadline: float) -> Any:
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise ModelUnavailable("time budget spent")
    try:
        response = client.post(
            config.ENDPOINT,
            json=body,
            headers={"Authorization": f"Bearer {key}"},
            timeout=remaining,
        )
    except httpx.TimeoutException:
        raise ModelUnavailable("timed out") from None
    except httpx.HTTPError as failure:
        raise ModelUnavailable(f"transport error {type(failure).__name__}") from None
    if response.status_code != 200:
        raise ModelUnavailable(f"status {response.status_code}")
    try:
        return response.json()
    except ValueError:
        raise ModelUnavailable("body is not JSON") from None


def _message(data: Any) -> dict[str, Any]:
    """The assistant message of a completion, or ModelUnavailable for anything else."""
    if not isinstance(data, dict) or "error" in data:
        raise ModelUnavailable("error in body")
    choices = data.get("choices")
    if not isinstance(choices, list) or not choices or not isinstance(choices[0], dict):
        raise ModelUnavailable("no choices")
    choice = choices[0]
    if "error" in choice or choice.get("finish_reason") in ("error", "content_filter", "length"):
        raise ModelUnavailable(f"finish_reason {choice.get('finish_reason')}")
    message = choice.get("message")
    if not isinstance(message, dict):
        raise ModelUnavailable("no message")
    if message.get("refusal"):
        raise ModelUnavailable("refusal")
    return message


def _arguments(call: dict[str, Any]) -> dict[str, Any]:
    try:
        parsed = json.loads(call["function"].get("arguments") or "{}")
    except ValueError:
        return {"__invalid__": True}
    return parsed if isinstance(parsed, dict) else {"__invalid__": True}


def _tool_message(ctx: tools.Context, call: Any) -> dict[str, Any]:
    if not isinstance(call, dict) or not isinstance(call.get("function"), dict):
        raise ModelUnavailable("malformed tool call")
    call_id, name = call.get("id"), call["function"].get("name")
    if not isinstance(call_id, str) or not isinstance(name, str):
        raise ModelUnavailable("malformed tool call")
    args = _arguments(call)
    if args.get("__invalid__"):
        result: dict[str, Any] = {"error": "invalid_arguments", "detail": "Arguments are not JSON."}
    else:
        result = tools.call(ctx, name, args)
    return {"role": "tool", "tool_call_id": call_id, "content": json.dumps(result)}


def answer(ctx: tools.Context, messages: list[dict[str, str]], key: str, model: str) -> str:
    """The model's answer in words, after at most MAX_TOOL_ROUNDS rounds of tools."""
    deadline = time.monotonic() + config.DEADLINE_SECONDS
    conversation: list[dict[str, Any]] = [
        {"role": "system", "content": prompt.system(ctx)},
        *messages,
    ]
    specs = [found.spec() for found in tools.TOOLS.values()]
    with httpx.Client(transport=transport) as client:
        for round_number in range(config.MAX_TOOL_ROUNDS + 1):
            body: dict[str, Any] = {
                "model": model,
                "messages": conversation,
                "tools": specs,
                "max_tokens": config.MAX_ANSWER_TOKENS,
            }
            last = round_number == config.MAX_TOOL_ROUNDS
            if last:
                # The last call must answer in words; the tools stay listed, as the reference asks.
                body["tool_choice"] = "none"
            ctx.calls += 1
            data = _post(client, key, body, deadline)
            usage = data.get("usage") if isinstance(data, dict) else None
            if isinstance(usage, dict) and isinstance(usage.get("cost"), int | float):
                ctx.cost_usd += float(usage["cost"])
            message = _message(data)
            calls = message.get("tool_calls")
            if calls:
                if last or not isinstance(calls, list):
                    raise ModelUnavailable("tools past the last round")
                conversation.append(
                    {"role": "assistant", "content": message.get("content"), "tool_calls": calls}
                )
                conversation.extend(_tool_message(ctx, call) for call in calls)
                ctx.tool_rounds += 1
                continue
            text = message.get("content")
            if not isinstance(text, str) or not text.strip():
                raise ModelUnavailable("empty answer")
            return text.strip()
    raise ModelUnavailable("no answer")  # pragma: no cover  the loop always returns or raises
