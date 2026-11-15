"""Results of a validation run, written in the contract's `Validation` shape.

Each check calls `record` with its numbers before it asserts, so a check that fails still
lands in the file as failed. `conftest.py` writes the file at the end of the session; the
backend serves it at `/validations`.
"""

from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = REPO_ROOT / "backend" / "app" / "data" / "validations.json"

Status = Literal["passed", "failed", "pending"]

_RUN_AT = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
_entries: dict[str, dict[str, Any]] = {}
_order: list[str] = []


def deg(value: float, decimals: int = 6) -> tuple[str, str]:
    """A degree value as (en, pt) text; Portuguese uses the decimal comma."""
    en = f"{value:.{decimals}f}°"
    return en, en.replace(".", ",")


def text(en: str, pt: str) -> dict[str, str]:
    return {"en": en, "pt": pt}


def declare(
    validation_id: str,
    *,
    title: dict[str, str],
    reference: str,
    tolerance: dict[str, str],
    not_covered: dict[str, str],
    script_path: str,
) -> None:
    """Register a check up front, as pending, so it shows even if it never reports."""
    if validation_id not in _entries:
        _order.append(validation_id)
    _entries[validation_id] = {
        "id": validation_id,
        "title": title,
        "reference": reference,
        "tolerance": tolerance,
        "result": text("did not run", "não rodou"),
        "status": "pending",
        "not_covered": not_covered,
        "script_path": script_path,
        "run_at": _RUN_AT,
    }


def record(validation_id: str, status: Status, result: dict[str, str]) -> None:
    entry = _entries[validation_id]
    entry["status"] = status
    entry["result"] = result


def mark_failed(validation_id: str, reason: str) -> None:
    """A check that crashed or asserted before recording its own result."""
    entry = _entries[validation_id]
    if entry["status"] == "failed":
        return
    entry["status"] = "failed"
    entry["result"] = text(f"failed: {reason}", f"falhou: {reason}")


# The sky position against JPL Horizons is the check every other one stands on, so it leads
# the Proof page. The rest follow in the order they were declared, which is the order
# pytest imports the test files: alphabetical, so a new file would otherwise jump the queue.
LEAD = ("horizons-sun-azel", "horizons-earth-azel")


def entries() -> list[dict[str, Any]]:
    lead = [i for i in LEAD if i in _entries]
    return [_entries[i] for i in lead + [i for i in _order if i not in lead]]


def output_path() -> Path:
    raw = os.environ.get("LUNAR_VALIDATIONS_FILE")
    return Path(raw) if raw else DEFAULT_OUTPUT


LIVE_RESULTS = Path(__file__).resolve().parent / "data" / "live_results.json"


LIVE_LANDINGS = Path(__file__).resolve().parent / "data" / "live_landings.json"


LIVE_PSR = Path(__file__).resolve().parent / "data" / "live_psr.json"


# Entries the offline suite now writes, though an older live file may still hold one. Since
# the requirement, test_athena.py owns the IM-2 Athena landing entry; live_results.json, from
# before that, still has the pending one live_checks.py used to write.
OFFLINE_OWNED = frozenset({"landing-im2-athena"})


def live_entries() -> list[dict[str, Any]]:
    """Entries from the last live runs, which need the network.

    live_checks.py first, then live_landings.py, whose entries win on the same id, then
    live_psr.py. Ids in OFFLINE_OWNED are left to the offline suite.
    """
    by_id: dict[str, dict[str, Any]] = {}
    for path in (LIVE_RESULTS, LIVE_LANDINGS, LIVE_PSR):
        if path.exists():
            for e in json.loads(path.read_text("utf-8"))["entries"]:
                if e["id"] not in OFFLINE_OWNED:
                    by_id[e["id"]] = e
    return list(by_id.values())


def merged(base: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """`base` with the live entries appended, replacing any with the same id."""
    live = live_entries()
    ids = {e["id"] for e in live}
    return [e for e in base if e["id"] not in ids] + live


def write(path: Path | None = None) -> Path:
    target = path or output_path()
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(merged(entries()), ensure_ascii=False, indent=2) + "\n", "utf-8")
    return target


def write_live_only(path: Path | None = None) -> Path:
    """Refresh the live entries in the served file, keeping the offline ones as they are."""
    target = path or output_path()
    base = json.loads(target.read_text("utf-8")) if target.exists() else []
    target.write_text(json.dumps(merged(base), ensure_ascii=False, indent=2) + "\n", "utf-8")
    return target


def check(validation_id: str) -> Any:
    """Tie a test to its validation, so a crash in it is recorded as a failure."""

    def wrap(func: Any) -> Any:
        func.validation_id = validation_id
        return func

    return wrap
