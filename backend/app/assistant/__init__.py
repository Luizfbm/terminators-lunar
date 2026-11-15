"""The assistant: questions in plain words, answered with the engine's numbers (the requirement).

A language model on OpenRouter picks which of this API's operations to read (tools.py)
and writes the sentences (openrouter.py); without it, a keyword router fills fixed
sentences from the same operations (offline.py). Either way, every number in the answer
is checked against what those operations returned (tracer.py).
"""

from .service import handle

__all__ = ["handle"]
