"""The suite drives the backend only through its HTTP API.

The backend loads its own kernels (fixtures/kernels/meta.tm unless LUNAR_META_KERNEL says
otherwise), so nothing here touches SPICE. At the end of the session the results go to the
file `/validations` serves (see proof.py).
"""

from __future__ import annotations

import os
import sys
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

# The Horizons check is about where the Sun and the Earth are in the sky, which does not
# depend on terrain, and four of its six Sites are past the DEM fixtures. The backend
# answers those over the bare sphere only when this is set, and says so in provenance.
os.environ["LUNAR_FLAT_HORIZON_WITHOUT_DEM"] = "1"

import proof
from app.main import app


@pytest.fixture(scope="session")
def test_client() -> Iterator[Any]:
    with TestClient(app) as client:
        yield client


@pytest.hookimpl(wrapper=True)
def pytest_runtest_makereport(item: pytest.Item, call: pytest.CallInfo[None]) -> Any:
    report = yield
    validation_id = getattr(getattr(item, "function", None), "validation_id", None)
    if validation_id and report.failed:
        reason = call.excinfo.typename if call.excinfo else "error"
        proof.mark_failed(validation_id, reason)
    return report


def pytest_sessionfinish(session: pytest.Session) -> None:
    if proof.entries():
        path = proof.write()
        print(f"\nvalidation results written to {path}")
