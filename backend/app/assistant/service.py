"""POST /assistant: the guards, the model or the offline router, then the tracer."""

from __future__ import annotations

import json
import logging
import time
from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse, Response
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool

from ..problems import ApiProblem, problem
from . import config, limits, offline, openrouter, tools
from .models import AssistantRequest
from .tracer import Pool, trace

_log = logging.getLogger(__name__)


def _show_in_server_log() -> None:
    """Give the assistant's loggers a handler of their own, at INFO.

    Uvicorn configures only its own loggers. A line from app.* then falls to Python's
    last-resort handler, which prints warnings and above, so the cost of each question
    never reached the server's log (the requirement). This handler writes to stderr, as
    uvicorn does, and the records still propagate to anything above (pytest's caplog).
    """
    parent = logging.getLogger("app.assistant")
    parent.setLevel(logging.INFO)
    if not any(getattr(h, "_assistant", False) for h in parent.handlers):
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(levelname)s:     %(name)s %(message)s"))
        handler._assistant = True  # type: ignore[attr-defined]
        parent.addHandler(handler)


_show_in_server_log()


def client_ip(request: Request) -> str:
    """The visitor: Cloudflare's CF-Connecting-IP behind the tunnel, else the socket peer."""
    forwarded = request.headers.get("cf-connecting-ip")
    if forwarded:
        return forwarded.strip()
    return request.client.host if request.client else "unknown"


def _busy(retry: int) -> JSONResponse:
    response = problem(
        "busy", "Busy", f"Too many questions from one address; ask again in {retry} s.", 503
    )
    response.headers["Retry-After"] = str(retry)
    return response


def _screen_query(body: AssistantRequest) -> dict[str, Any]:
    """The Query on screen, checked by the same rules as /visibility before anything runs."""
    from .. import main  # main imports this package for its route

    if body.query is None:
        return tools.screen_query(None)
    raw = body.query.model_dump()
    try:
        _site, start = main._query(
            raw["site_id"],
            raw["latitude_deg"],
            raw["longitude_deg"],
            raw["start"],
            raw["duration_hours"],
        )
    except ApiProblem as rejected:
        # The contract gives /assistant one 422: the Query is a parameter of the request.
        raise ApiProblem("invalid_parameter", "Invalid parameter", rejected.detail) from None
    return tools.screen_query({**raw, "start": start})


def _pool(ctx: tools.Context, body: AssistantRequest) -> Pool:
    pool = Pool()
    for reading in ctx.readings:
        pool.add_value(reading.result)
        # What the model was handed, rounded: a number copied from it is traced too.
        pool.add_value(tools.for_model(reading.result))
    for error in ctx.errors:
        pool.add_value(error)
    query = ctx.query
    pool.add_value([query[k] for k in ("latitude_deg", "longitude_deg", "site_id")])
    pool.add_value([query["duration_hours"], query["duration_hours"] / 24.0])
    pool.add_value(query["observer_height_m"])
    pool.add_instant(query["start"])
    for message in body.messages:
        if message.role == "user":
            pool.add_text(message.content)
    return pool


def respond(body: AssistantRequest, request: Request) -> JSONResponse:
    retry = limits.ip_cap.over(client_ip(request))
    if retry is not None:
        return _busy(retry)
    if body.messages[-1].role != "user":
        raise ApiProblem(
            "invalid_parameter", "Invalid parameter", "The last message must be the user's."
        )
    began = time.monotonic()
    ctx = tools.Context(query=_screen_query(body), lang=body.lang)
    question = body.messages[-1].content
    key, model = config.key(), config.model()
    text: str | None = None
    why = "no model configured" if not (key and model) else ""
    if key and model:
        if limits.daily_cap.take():
            messages = [{"role": m.role, "content": m.content} for m in body.messages]
            try:
                text = openrouter.answer(ctx, messages, key, model)
            except openrouter.ModelUnavailable as reason:
                why = str(reason)
        else:
            why = "daily cap reached"
    mode = "model" if text is not None else "offline"
    if text is None:
        ctx.restart()
        text = offline.answer(ctx, question)
    numbers = trace(text, _pool(ctx, body))
    # One line per question, model or not, so the server's log has the cost of each.
    _log.info(
        "assistant question lang=%s mode=%s%s model=%s calls=%d tool_rounds=%d cost_usd=%.6f "
        "seconds=%.2f numbers=%d/%d",
        body.lang,
        mode,
        f" offline_because={why!r}" if why else "",
        model or "-",
        ctx.calls,
        ctx.tool_rounds,
        ctx.cost_usd,
        time.monotonic() - began,
        numbers.traced,
        numbers.total,
    )
    return JSONResponse(
        {
            "answer": text,
            "mode": mode,
            "numbers": numbers.as_dict(),
            "sources": ctx.sources(),
        }
    )


def _invalid(detail: str) -> ApiProblem:
    return ApiProblem("invalid_parameter", "Invalid parameter", detail)


async def handle(request: Request) -> Response:
    """Read and check the body here, so every malformed one gets the contract's one 422.

    FastAPI's own body parsing answers 400 to bytes that are not JSON, which the contract
    does not document. The work itself runs engine answers, so it goes to the thread pool.
    """
    raw = await request.body()
    try:
        data = json.loads(raw)
    except ValueError:  # UnicodeDecodeError included
        raise _invalid("The body must be JSON.") from None
    try:
        body = AssistantRequest.model_validate(data)
    except ValidationError as invalid:
        where = ".".join(str(part) for part in invalid.errors()[0]["loc"])
        raise _invalid(f"Invalid parameter: {where}." if where else "Invalid body.") from None
    response: Response = await run_in_threadpool(respond, body, request)
    return response
