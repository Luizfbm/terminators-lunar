"""A per-IP cap on the engine routes, so one client cannot keep the queue to itself.

Only /visibility and its kin, /sites/{id}/year and /terrain/heights count: they are the
routes that take an engine slot (heights.py reads up to 511 x 511 pixels and builds a JSON
of about 900 MB at peak), and a client over the cap gets the 503 `busy` answer they share. The cap is off unless LUNAR_IP_LIMIT_PER_MINUTE
is set. Behind the Cloudflare tunnel every request reaches us from Caddy, so the client
is the CF-Connecting-IP header that Cloudflare sets.
"""

import os
import threading
import time

from starlette.types import ASGIApp, Receive, Scope, Send

from .problems import problem

LIMIT = "LUNAR_IP_LIMIT_PER_MINUTE"
WINDOW_SECONDS = 60.0


def _limited(path: str) -> bool:
    return (
        path.startswith("/visibility")
        or path == "/terrain/heights"
        or (path.startswith("/sites/") and path.endswith("/year"))
    )


class PerIpLimit:
    """At most `per_minute` engine-route requests per client IP in each 60 s window."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self._lock = threading.Lock()
        self._window_start = time.monotonic()
        self._counts: dict[str, int] = {}

    def _client(self, scope: Scope) -> str:
        headers: dict[bytes, bytes] = dict(scope.get("headers") or [])
        forwarded = headers.get(b"cf-connecting-ip")
        if forwarded:
            return forwarded.decode("latin-1").strip()
        client = scope.get("client")
        return str(client[0]) if client else "unknown"

    def _over(self, ip: str, per_minute: int) -> float | None:
        """Seconds until the window resets when `ip` is over the cap, else None."""
        now = time.monotonic()
        with self._lock:
            if now - self._window_start >= WINDOW_SECONDS:
                self._window_start = now
                self._counts.clear()
            count = self._counts.get(ip, 0) + 1
            self._counts[ip] = count
            if count > per_minute:
                return WINDOW_SECONDS - (now - self._window_start)
        return None

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        per_minute = int(os.environ.get(LIMIT, "0") or 0)
        if scope["type"] == "http" and per_minute > 0 and _limited(scope["path"]):
            wait = self._over(self._client(scope), per_minute)
            if wait is not None:
                retry = max(1, int(wait) + 1)
                response = problem(
                    "busy",
                    "Busy",
                    f"Too many requests from one address; ask again in {retry} s.",
                    status=503,
                )
                response.headers["Retry-After"] = str(retry)
                await response(scope, receive, send)
                return
        await self.app(scope, receive, send)
