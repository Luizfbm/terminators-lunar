"""RFC 9457 problem responses used by every error path."""

from typing import cast

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .constants import PROBLEM_TYPE_BASE


class ApiProblem(Exception):
    def __init__(self, code: str, title: str, detail: str, status: int = 422) -> None:
        super().__init__(detail)
        self.code = code
        self.title = title
        self.detail = detail
        self.status = status


def problem(code: str, title: str, detail: str, status: int = 422) -> JSONResponse:
    slug = "site-not-found" if code == "missing_site" and status == 404 else code.replace("_", "-")
    return JSONResponse(
        {
            "type": f"{PROBLEM_TYPE_BASE}/{slug}",
            "title": title,
            "status": status,
            "detail": detail,
            "code": code,
        },
        status_code=status,
        media_type="application/problem+json",
    )


def missing_site(site_id: str) -> ApiProblem:
    return ApiProblem(
        "missing_site",
        "Site not found",
        f"No Curated Site with id '{site_id}'.",
        status=404,
    )


def on_problem(_request: Request, exc: Exception) -> JSONResponse:
    error = cast(ApiProblem, exc)
    return problem(error.code, error.title, error.detail, error.status)


def on_validation(_request: Request, exc: Exception) -> JSONResponse:
    validation = cast(RequestValidationError, exc)
    detail = "A query parameter is invalid."
    errors = validation.errors()
    if errors:
        loc = [str(part) for part in errors[0].get("loc", ()) if part != "query"]
        if loc:
            detail = f"Invalid parameter: {'.'.join(loc)}."
    return problem("invalid_parameter", "Invalid parameter", detail)


def on_busy(_request: Request, _exc: Exception) -> JSONResponse:
    # Imported here: cache imports the engine, and problems must stay importable alone.
    from .cache import RETRY_AFTER_SECONDS

    response = problem(
        "busy",
        "Busy",
        f"Every engine slot is taken; ask again in {RETRY_AFTER_SECONDS} s.",
        status=503,
    )
    response.headers["Retry-After"] = str(RETRY_AFTER_SECONDS)
    return response
