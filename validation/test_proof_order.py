"""The order of the Proof entries after a validation run."""

from __future__ import annotations

import json
from pathlib import Path

import proof
import pytest


def test_the_horizons_sky_checks_lead_the_proof_page() -> None:
    # The flat horizon checks live in test_flat_horizon.py, which pytest imports before
    # test_horizons.py, so they are declared first and written first.
    import test_flat_horizon  # noqa: F401  declared first, as in a full run
    import test_horizons  # noqa: F401

    ids = [entry["id"] for entry in proof.entries()]
    assert ids[:2] == ["horizons-sun-azel", "horizons-earth-azel"], ids[:4]
    assert "horizons-flat-sunset" in ids[2:]


def test_the_offline_athena_entry_wins_over_an_older_live_one(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # The offline Athena check owns landing-im2-athena, while older live data may still
    # contain a pending entry. The merge must keep the offline check visible.
    live = tmp_path / "live_results.json"
    stale = {
        "id": "landing-im2-athena",
        "status": "pending",
        "script_path": "validation/live_checks.py",
    }
    other = {
        "id": "wueller2026-sunlit-days",
        "status": "failed",
        "script_path": "validation/live_checks.py",
    }
    live.write_text(json.dumps({"entries": [stale, other]}), "utf-8")
    monkeypatch.setattr(proof, "LIVE_RESULTS", live)
    monkeypatch.setattr(proof, "LIVE_LANDINGS", tmp_path / "none.json")
    monkeypatch.setattr(proof, "LIVE_PSR", tmp_path / "none.json")
    offline = {
        "id": "landing-im2-athena",
        "status": "passed",
        "script_path": "validation/test_athena.py",
    }
    merged = proof.merged([offline])
    assert merged == [offline, other]
