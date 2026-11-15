"""Settings of the assistant, all read from the environment on every request.

The OpenRouter key and the model id have no default: without either, the route answers in
offline mode. An empty variable counts as missing, for all four settings (the compose file
passes unset ones through as empty). The key is read here and sent in the Authorization
header, nothing else; it is never logged and never part of an answer.
"""

import os

KEY = "OPENROUTER_API_KEY"
MODEL = "LUNAR_ASSISTANT_MODEL"
DAILY_LIMIT = "LUNAR_ASSISTANT_DAILY_REQUESTS"
IP_LIMIT = "LUNAR_ASSISTANT_IP_LIMIT_PER_MINUTE"

ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"
# The whole conversation with the model, every round included.
DEADLINE_SECONDS = 20.0
# Rounds in which the model may ask for tools; one more call must then answer in words.
MAX_TOOL_ROUNDS = 4
MAX_ANSWER_TOKENS = 600

# Questions a day that may reach the model; past it the route answers offline. The credit
# limit on the OpenRouter key is the money ceiling; this is the second guard behind it.
DEFAULT_DAILY_LIMIT = 300
# /assistant requests per client IP per minute; 0 turns the cap off.
DEFAULT_IP_PER_MINUTE = 10


def key() -> str | None:
    return os.environ.get(KEY, "").strip() or None


def model() -> str | None:
    return os.environ.get(MODEL, "").strip() or None


def _int(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    return int(raw) if raw else default


def daily_limit() -> int:
    return _int(DAILY_LIMIT, DEFAULT_DAILY_LIMIT)


def ip_per_minute() -> int:
    return _int(IP_LIMIT, DEFAULT_IP_PER_MINUTE)
